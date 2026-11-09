/**
 * Decisão PURA de "que lembrete por e-mail esta conta recebe agora".
 *
 * Não inventa regra nova: compõe as duas que já existem e são testadas.
 *   - Ativação → `onboardingReminderPolicy.js` (janelas D+1/D+3/D+7, no máximo 2
 *     e-mails, 48 h entre eles; a janela D+1 é só no app — o e-mail do dia 1 já
 *     é o de boas-vindas).
 *   - Assinatura → `src/services/lembreteAssinatura.ts`, a MESMA regra da faixa
 *     do app e do painel, alimentada com o mesmo plano efetivo
 *     (`src/services/planoEfetivo.ts`) e o mesmo preço (`precosPlanos.ts`).
 *
 * Por cima da regra, só o RITMO do e-mail (que é mais invasivo que a faixa):
 *   - só estes gatilhos viram e-mail: renovar_pix em D-3 e D0, plano_vencido em
 *     D+1. (Até 01/10/2026 também havia cota_quase e cota_esgotada; o Grátis
 *     ficou ILIMITADO e esses avisos deixaram de existir na regra.)
 *   - no máximo 1 e-mail de cobrança por semana por conta — a sequência de
 *     renovação de UM vencimento (D-3, D0, D+1) conta como uma só;
 *   - nunca cobrança para conta sem orçamento, nem para membro de equipe alheia.
 *
 * O banco reconfere tudo isso sob trava em `enqueue_lembrete_email`; aqui é a
 * decisão testável, sem rede, sem e-mail e sem nome da pessoa.
 */

import { avaliarLembreteAtivacao } from './onboardingReminderPolicy.js';
import { lembreteAssinatura } from '../../src/services/lembreteAssinatura.ts';
import { derivarPlanoEfetivo } from '../../src/services/planoEfetivo.ts';

export const EMAIL_LEMBRETES_POLICY_VERSION = '2026-10-05.v3';
/** Consentimento educativo = opt-out: todo lembrete leva o link de descadastro. */
export const LEMBRETES_CONSENTIMENTO_VERSAO = 'opt_out_link.2026-09-29';

export const LEMBRETE_ATIVACAO = Object.freeze({
  template: 'lembrete_ativacao',
  templateVersion: 'lembrete_ativacao.v1',
  purpose: 'activation_reminder',
});
export const LEMBRETE_ASSINATURA = Object.freeze({
  template: 'lembrete_assinatura',
  templateVersion: 'lembrete_assinatura.v1',
  purpose: 'billing_reminder',
});
/**
 * Régua de reengajamento (03/10/2026), para quem as duas regras acima não cobrem:
 *   - ativacao_ultima: zero orçamento e conta mais velha que a janela de ativação
 *     (até 120 dias) — UM e-mail na vida;
 *   - parou: já orçou e não faz orçamento novo há 7 (d7) e 14 dias (d14) — no
 *     máximo 2 por "episódio" (a data do último orçamento); depois de 30 dias para;
 *   - trial_acabando: teste do Pro ativo terminando em 24–72 h — 1 por teste.
 */
export const LEMBRETE_REENGAJAMENTO = Object.freeze({
  template: 'lembrete_reengajamento',
  templateVersion: 'lembrete_reengajamento.v1',
  purpose: 'reengagement_reminder',
});
/** Oferta do plano Pro (08/11/2026): texto escrito por conta, enfileirado só por lista explícita (ofertaPro.js). */
export const LEMBRETE_OFERTA_PRO = Object.freeze({
  template: 'oferta_pro',
  templateVersion: 'oferta_pro.v1',
  purpose: 'oferta_pro',
});
export const REENGAJAMENTO_TIPOS = Object.freeze(['ativacao_ultima', 'parou', 'trial_acabando', 'trial_encerrado']);
/**
 * Tipos de lembrete que a rodada pode enfileirar (sufixo de EMAIL_LEMBRETES_MODE, 07/10/2026):
 * ativacao (conta nova sem 1º orçamento), assinatura (renovação/vencimento) e reengajamento
 * (última chamada, parou, trial acabando). Antes a régua era uma chave só (tudo ou nada).
 */
export const TIPOS_LEMBRETE = Object.freeze(new Set(['ativacao', 'assinatura', 'reengajamento', 'pix_vence']));

/**
 * Lê a lista de tipos que vem DEPOIS dos dois pontos em EMAIL_LEMBRETES_MODE
 * ("production:ativacao,assinatura"). A lista mora no sufixo do MODE porque o worker está no
 * teto de 64 variáveis do plano grátis — uma chave nova não cabe. Sem sufixo ("production"):
 * todos, como sempre. Com sufixo: vale SÓ o que for tipo conhecido; se nada for reconhecido
 * (ou vier vazio), nada passa (fail-closed — erro de digitação não liga o que estava desligado).
 */
export function lerTiposPermitidos(sufixo) {
  if (typeof sufixo !== 'string') return TIPOS_LEMBRETE;
  const lidos = sufixo.toLowerCase().split(',').map((t) => t.trim()).filter((t) => TIPOS_LEMBRETE.has(t));
  return Object.freeze(new Set(lidos));
}

/**
 * Checagem do sufixo `nao_aberto` (Z-52). `production` sozinho devolve false:
 * a régua do orçamento não aberto não mora no conjunto padrão. Só devolve true
 * quando o MODE é production e o sufixo lista a palavra exata `nao_aberto`.
 * Quem for chamar `listar_nao_abertos_email` tem de passar por aqui.
 */
export function sufixoLigaNaoAberto(modo) {
  if (typeof modo !== 'string') return false;
  const [base, ...resto] = modo.trim().toLowerCase().split(':');
  if (base !== 'production' || resto.length === 0) return false;
  const tipos = resto.join(':').split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  return tipos.includes('nao_aberto');
}

const PRIORIDADE = Object.freeze({
  assinatura: 0,
  trial_acabando: 1,
  ativacao: 2,
  trial_encerrado: 3,
  parou: 4,
  ativacao_ultima: 5,
});
function prioridadeDoPedido(p) {
  const chave = p.template === LEMBRETE_REENGAJAMENTO.template ? p.dados?.tipo : tipoDoPedido(p);
  return Object.hasOwn(PRIORIDADE, chave) ? PRIORIDADE[chave] : 9;
}

function tipoDoPedido(p) {
  if (p.template === LEMBRETE_ATIVACAO.template) return 'ativacao';
  if (p.template === LEMBRETE_ASSINATURA.template) return 'assinatura';
  return 'reengajamento';
}
const DIA_MS = 24 * 60 * 60 * 1000;
const ATIVACAO_ULTIMA_MAX_DIAS = 120;
const TRIAL_ENCERRADO_MAX_DIAS = 7;

/** Brasília não tem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;
const SEMANA_MS = 7 * 24 * HORA_MS;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLANOS_PAGOS = new Set(['pro', 'empresa']);
const TRIAL_ESTADOS = new Set(['unstarted', 'eligible', 'active', 'ended', 'converted', 'revoked']);

function objeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function data(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inteiroNaoNegativo(v) {
  return Number.isInteger(v) && v >= 0;
}

/** Hora (0–23) no relógio de Brasília. */
export function horaBrasilia(agora) {
  return new Date(agora.getTime() + OFFSET_BRASILIA_MS).getUTCHours();
}

/** 8h–20h de Brasília (20h exclusivo). */
export function dentroHorarioComercial(agora) {
  const h = horaBrasilia(agora);
  return h >= 8 && h < 20;
}

/**
 * A seleção roda UMA vez por hora cheia, dentro do horário comercial — o cron é
 * de minuto a minuto por causa da outbox, não por causa dos lembretes.
 */
export function rodadaDeSelecao(agora) {
  return agora instanceof Date
    && !Number.isNaN(agora.getTime())
    && dentroHorarioComercial(agora)
    && agora.getUTCMinutes() === 0;
}

function decisao(motivo, pedido = null) {
  return Object.freeze({
    version: EMAIL_LEMBRETES_POLICY_VERSION,
    enfileirar: pedido !== null,
    motivo,
    pedido,
  });
}

function pedido(base, { userId, idempotencyKey, dados }) {
  return Object.freeze({
    userId,
    template: base.template,
    templateVersion: base.templateVersion,
    purpose: base.purpose,
    idempotencyKey,
    dados: Object.freeze({ ...dados }),
  });
}

function candidatoValido(c) {
  return objeto(c)
    && typeof c.userId === 'string' && UUID_RE.test(c.userId)
    && data(c.confirmadoEm) !== null
    && inteiroNaoNegativo(c.orcamentos)
    && typeof c.membroDeEquipe === 'boolean'
    && typeof c.donoDoTenant === 'boolean'
    && (c.assinatura === null || objeto(c.assinatura))
    && (c.oferta === null || objeto(c.oferta))
    && objeto(c.historico)
    && Array.isArray(c.historico.ativacao)
    && Array.isArray(c.historico.cobranca);
}

// ─── Ativação ────────────────────────────────────────────────────────────────

function historicoAtivacao(entradas) {
  const lista = [];
  for (const e of entradas) {
    const em = objeto(e) ? data(e.em) : null;
    if (!em || typeof e.chave !== 'string' || typeof e.janela !== 'string') return null;
    lista.push({
      reminderKey: e.chave,
      window: e.janela,
      channels: ['in_app', 'email'],
      decidedAt: em,
      emailConsentVersion: LEMBRETES_CONSENTIMENTO_VERSAO,
    });
  }
  return lista.sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime());
}

function decidirAtivacao(c, agora, ativacaoMaxDias) {
  if (c.membroDeEquipe) return decisao('membro_de_equipe');
  const confirmadoEm = data(c.confirmadoEm);
  if (agora.getTime() - confirmadoEm.getTime() > ativacaoMaxDias * 24 * HORA_MS) {
    return decisao('ativacao_fora_da_janela');
  }
  const history = historicoAtivacao(c.historico.ativacao);
  if (!history) return decisao('historico_invalido');

  const avaliacao = avaliarLembreteAtivacao({
    tenantId: c.userId,
    actorKey: c.userId,
    accountState: 'active',
    progressStage: 'profile_complete_no_quote',
    verifiedAt: confirmadoEm,
    now: agora,
    educationConsent: {
      optedIn: true,
      version: LEMBRETES_CONSENTIMENTO_VERSAO,
      recordedAt: confirmadoEm,
    },
    history,
  });
  if (!avaliacao.schedule) return decisao(`ativacao_${avaliacao.reason}`);
  const candidato = avaliacao.candidate;
  if (!candidato.requestedChannels.includes('email')) return decisao('ativacao_sem_email_nesta_janela');

  return decisao('ativacao', pedido(LEMBRETE_ATIVACAO, {
    userId: c.userId,
    idempotencyKey: candidato.idempotencyKey,
    dados: { janela: candidato.window },
  }));
}

// ─── Assinatura ──────────────────────────────────────────────────────────────

function assinaturaParaRegra(linha, agoraMs) {
  if (linha === null) return { planoEfetivo: 'gratis', planoContratado: 'gratis', origem: 'gratis' };
  const efetivo = derivarPlanoEfetivo({
    plano: linha.plano ?? null,
    status: linha.status ?? null,
    current_period_end: linha.current_period_end ?? null,
    admin_plano_override: linha.admin_plano_override ?? null,
    admin_override_ativo: linha.admin_override_ativo ?? null,
    admin_override_ate: linha.admin_override_ate ?? null,
  }, agoraMs);
  const fim = data(linha.current_period_end);
  return {
    planoEfetivo: efetivo.planoEfetivo,
    planoContratado: efetivo.planoContratado,
    origem: efetivo.origem,
    // Mais conservador que o app: além do cartão da Stripe, a assinatura
    // recorrente legada do Mercado Pago também "renova sozinha" — e-mail dizendo
    // "o Pix não renova" para quem é cobrado no automático seria mentira.
    renovaSozinho: linha.recorrente === true,
    proximaCobranca: fim ? fim.toISOString() : undefined,
  };
}

/**
 * `limite_envios`/`envios_restantes` são IGNORADOS de propósito: o banco antigo
 * (antes de 20261002150000) ainda manda o 5, o novo manda null, e o Grátis não tem
 * mais teto — nenhum dos dois pode reinventar uma cota no e-mail.
 */
function ofertaParaRegra(o) {
  if (o === null) return null;
  const plano = o.plano_efetivo;
  if (plano !== 'gratis' && !PLANOS_PAGOS.has(plano)) return null;
  if (!inteiroNaoNegativo(o.envios_usados) || !TRIAL_ESTADOS.has(o.trial_estado)) return null;
  return {
    planoEfetivo: plano,
    enviosUsados: o.envios_usados,
    trialEstado: o.trial_estado,
    trialTerminaEm: typeof o.trial_termina_em === 'string' ? o.trial_termina_em : null,
    trialDias: Number.isInteger(o.trial_dias) ? o.trial_dias : 14,
  };
}

/** Qual e-mail da sequência de renovação cabe AGORA (ou null). */
function slotRenovacao(tipo, vencimento, agora) {
  const horas = (vencimento.getTime() - agora.getTime()) / HORA_MS;
  if (tipo === 'renovar_pix') {
    if (horas > 48 && horas <= 72) return 'D-3';
    if (horas > 0 && horas <= 24) return 'D0';
    return null;
  }
  if (tipo === 'plano_vencido') {
    if (-horas >= 24 && -horas < 72) return 'D1';
    return null;
  }
  return null;
}

function limiteSemanal(historicoCobranca, agora, sequencia) {
  return historicoCobranca.some((e) => {
    const em = objeto(e) ? data(e.em) : null;
    if (!em) return true; // histórico ilegível = conta como recente (falha fechada)
    if (agora.getTime() - em.getTime() >= SEMANA_MS) return false;
    return sequencia === null || e.sequencia !== sequencia;
  });
}

function decidirAssinatura(c, agora, precoProMensal) {
  if (!c.donoDoTenant) return decisao('assinatura_nao_e_dono');

  let assinatura;
  try {
    assinatura = assinaturaParaRegra(c.assinatura, agora.getTime());
  } catch {
    return decisao('assinatura_invalida');
  }
  const oferta = ofertaParaRegra(c.oferta);
  const lembrete = lembreteAssinatura({ agora, oferta, assinatura, precoProMensal });
  if (!lembrete) return decisao('assinatura_nada_a_lembrar');

  const base = `lembrete:assinatura:${c.userId}`;
  let chave;
  let sequencia = null;
  let dados;

  if (lembrete.tipo === 'renovar_pix' || lembrete.tipo === 'plano_vencido') {
    const vencimento = data(assinatura.proximaCobranca);
    if (!vencimento) return decisao('assinatura_sem_vencimento');
    const slot = slotRenovacao(lembrete.tipo, vencimento, agora);
    if (!slot) return decisao('assinatura_fora_do_dia');
    const venceEm = vencimento.toISOString();
    const plano = lembrete.tipo === 'renovar_pix' ? assinatura.planoEfetivo : assinatura.planoContratado;
    if (!PLANOS_PAGOS.has(plano)) return decisao('assinatura_plano_invalido');
    sequencia = `renovacao:${venceEm}`;
    chave = `${base}:renovacao:${venceEm}:${slot}`;
    dados = { tipo: lembrete.tipo, plano, venceEm, momento: slot, sequencia };
  } else {
    // trial_acabando, trial_disponivel e assinar ficam só na faixa do app.
    return decisao('assinatura_tipo_sem_email');
  }

  if (c.historico.cobranca.some((e) => objeto(e) && e.chave === chave)) return decisao('assinatura_ja_enfileirado');
  if (limiteSemanal(c.historico.cobranca, agora, sequencia)) return decisao('assinatura_limite_semanal');

  return decisao(lembrete.tipo, pedido(LEMBRETE_ASSINATURA, { userId: c.userId, idempotencyKey: chave, dados }));
}

// ─── Reengajamento ───────────────────────────────────────────────────────────

/**
 * Histórico de reengajamento. Campo AUSENTE (banco antigo, antes da migration
 * 20261005090000) devolve null e a régua nova não decide nada — nunca "não tem
 * histórico, então manda".
 */
function historicoReengajamento(c) {
  const lista = c.historico.reengajamento;
  if (!Array.isArray(lista)) return null;
  for (const e of lista) {
    if (!objeto(e) || typeof e.chave !== 'string' || typeof e.tipo !== 'string' || !data(e.em)) return null;
  }
  return lista;
}

function pedidoReengajamento(c, historico, chave, dados) {
  if (historico.some((e) => e.chave === chave)) return decisao('reengajamento_ja_enfileirado');
  return decisao(`reengajamento_${dados.tipo}`, pedido(LEMBRETE_REENGAJAMENTO, {
    userId: c.userId,
    idempotencyKey: chave,
    dados,
  }));
}

function decidirAtivacaoUltima(c, agora, ativacaoMaxDias, historico) {
  if (c.membroDeEquipe) return decisao('membro_de_equipe');
  const idadeDias = (agora.getTime() - data(c.confirmadoEm).getTime()) / DIA_MS;
  if (idadeDias <= ativacaoMaxDias) return decisao('ativacao_ultima_cedo');
  if (idadeDias > ATIVACAO_ULTIMA_MAX_DIAS) return decisao('ativacao_ultima_tarde');
  if (historico.some((e) => e.tipo === 'ativacao_ultima')) return decisao('ativacao_ultima_ja_enviada');
  return pedidoReengajamento(c, historico, `reengajamento:${c.userId}:ativacao_ultima`, { tipo: 'ativacao_ultima' });
}

function decidirTrialAcabando(c, agora, historico) {
  if (!c.donoDoTenant || !objeto(c.oferta) || c.oferta.trial_estado !== 'active') return null;
  const termina = data(c.oferta.trial_termina_em);
  if (!termina) return null;
  const horas = (termina.getTime() - agora.getTime()) / HORA_MS;
  if (!(horas > 24 && horas <= 72)) return null;
  const terminaEm = termina.toISOString();
  return pedidoReengajamento(c, historico, `reengajamento:${c.userId}:trial:${terminaEm}`, {
    tipo: 'trial_acabando',
    terminaEm,
  });
}

/** Teste do Pro já terminou (0–7 dias): 1 aviso por teste, sem dado do cliente. */
function decidirTrialEncerrado(c, agora, historico) {
  // Quem JÁ PAGA depois do teste (Pix/Play/cartão) segue com a linha do teste 'active' e vencida:
  // o plano efetivo é a verdade. Só 'gratis' recebe "voltou ao plano Grátis".
  if (!c.donoDoTenant || !objeto(c.oferta) || c.oferta.trial_estado !== 'ended' || c.oferta.plano_efetivo !== 'gratis') return null;
  const termina = data(c.oferta.trial_termina_em);
  if (!termina) return null;
  const horas = (agora.getTime() - termina.getTime()) / HORA_MS;
  if (!(horas >= 0 && horas <= TRIAL_ENCERRADO_MAX_DIAS * 24)) return null;
  const terminaEm = termina.toISOString();
  return pedidoReengajamento(c, historico, `reengajamento:${c.userId}:trial_encerrado:${terminaEm}`, {
    tipo: 'trial_encerrado',
    terminaEm,
  });
}

function decidirParou(c, agora, historico) {
  if (c.membroDeEquipe || !c.donoDoTenant) return decisao('parou_nao_e_dono');
  const ultimo = data(c.ultimoOrcamentoEm);
  if (!ultimo) return decisao('parou_sem_data');
  const dias = (agora.getTime() - ultimo.getTime()) / DIA_MS;
  let etapa = null;
  if (dias >= 7 && dias < 14) etapa = 'd7';
  else if (dias >= 14 && dias < 30) etapa = 'd14';
  if (!etapa) return decisao('parou_fora_da_janela');
  const episodio = ultimo.toISOString();
  // d14 sem d7 (o d7 caiu no teto do dia, por exemplo) ainda sai: são no máximo 2.
  return pedidoReengajamento(c, historico, `reengajamento:${c.userId}:parou:${episodio}:${etapa}`, {
    tipo: 'parou',
    etapa,
    ultimoOrcamentoEm: episodio,
  });
}

/**
 * Teto de frequência: no máximo 1 e-mail por pessoa a cada 24 h, somando TODOS
 * os tipos (boas-vindas, lembretes, cobrança, resumo). Campo ausente = banco
 * antigo: não bloqueia aqui, o banco reconfere sob trava.
 */
function recebeuNasUltimas24h(c, agora) {
  const ultimo = data(c.ultimoEmailEm);
  return ultimo !== null && agora.getTime() - ultimo.getTime() < DIA_MS;
}

/**
 * No máximo UM pedido por conta por rodada, nesta ordem: cobrança de renovação,
 * ativação (D+3/D+7), teste do Pro acabando, teste encerrado (até 7 dias), última chamada de ativação e
 * "orçou e parou". O primeiro que se aplica vence.
 */
export function decidirLembreteEmail(candidato, { agora, precoProMensal, ativacaoMaxDias = 30 } = {}) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return decisao('agora_invalido');
  if (typeof precoProMensal !== 'string' || !/^R\$ \d/.test(precoProMensal)) return decisao('preco_invalido');
  if (!candidatoValido(candidato)) return decisao('candidato_invalido');
  if (recebeuNasUltimas24h(candidato, agora)) return decisao('teto_pessoa_dia');

  const historico = historicoReengajamento(candidato);
  if (candidato.orcamentos === 0) {
    const ativacao = decidirAtivacao(candidato, agora, ativacaoMaxDias);
    if (ativacao.enfileirar || ativacao.motivo !== 'ativacao_fora_da_janela' || !historico) return ativacao;
    return decidirAtivacaoUltima(candidato, agora, ativacaoMaxDias, historico);
  }

  const cobranca = decidirAssinatura(candidato, agora, precoProMensal);
  if (cobranca.enfileirar || !historico) return cobranca;
  const trial = decidirTrialAcabando(candidato, agora, historico);
  if (trial) return trial;
  const encerrado = decidirTrialEncerrado(candidato, agora, historico);
  if (encerrado) return encerrado;
  return decidirParou(candidato, agora, historico);
}

/**
 * Aplica a decisão a um lote: deduplica por conta e para no teto da rodada.
 * Devolve os pedidos na ordem recebida e a contagem por motivo (sem PII).
 */
export function selecionarPedidos(candidatos, { agora, precoProMensal, ativacaoMaxDias, tetoRodada, tiposPermitidos = TIPOS_LEMBRETE }) {
  const vistos = new Set();
  const aplicaveis = [];
  const motivos = {};
  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    const id = objeto(c) ? c.userId : null;
    if (typeof id === 'string' && vistos.has(id)) continue;
    if (typeof id === 'string') vistos.add(id);
    const d = decidirLembreteEmail(c, { agora, precoProMensal, ativacaoMaxDias });
    // Tipo desligado não ocupa vaga do teto da rodada: o próximo candidato do tipo ligado ainda cabe.
    if (d.enfileirar && !tiposPermitidos.has(tipoDoPedido(d.pedido))) {
      motivos.tipo_desligado = (motivos.tipo_desligado || 0) + 1;
    } else if (d.enfileirar) {
      aplicaveis.push({ pedido: d.pedido, motivo: d.motivo });
    } else {
      motivos[d.motivo] = (motivos[d.motivo] || 0) + 1;
    }
  }
  // O teto vale por PRIORIDADE (dinheiro primeiro), não por ordem de chegada: teste do Pro
  // acabando não pode esperar atrás de "última chamada" (a janela de 24–72 h fecha).
  // sort é estável: dentro da mesma prioridade, vale a ordem recebida.
  const ordenados = aplicaveis
    .map(({ pedido, motivo }, ordem) => ({ pedido, motivo, ordem, rank: prioridadeDoPedido(pedido) }))
    .sort((a, b) => a.rank - b.rank || a.ordem - b.ordem);
  const pedidos = [];
  for (const { pedido, motivo } of ordenados) {
    const m = pedidos.length >= tetoRodada ? 'teto_da_rodada' : motivo;
    if (m === motivo) pedidos.push(pedido);
    motivos[m] = (motivos[m] || 0) + 1;
  }
  return Object.freeze({ pedidos: Object.freeze(pedidos), motivos: Object.freeze(motivos) });
}
