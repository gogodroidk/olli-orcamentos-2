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

export const EMAIL_LEMBRETES_POLICY_VERSION = '2026-10-01.v2';
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

/**
 * No máximo UM pedido por conta por rodada. Ativação e cobrança são exclusivas
 * por construção: uma exige zero orçamento, a outra pelo menos um.
 */
export function decidirLembreteEmail(candidato, { agora, precoProMensal, ativacaoMaxDias = 30 } = {}) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return decisao('agora_invalido');
  if (typeof precoProMensal !== 'string' || !/^R\$ \d/.test(precoProMensal)) return decisao('preco_invalido');
  if (!candidatoValido(candidato)) return decisao('candidato_invalido');
  if (candidato.orcamentos === 0) return decidirAtivacao(candidato, agora, ativacaoMaxDias);
  return decidirAssinatura(candidato, agora, precoProMensal);
}

/**
 * Aplica a decisão a um lote: deduplica por conta e para no teto da rodada.
 * Devolve os pedidos na ordem recebida e a contagem por motivo (sem PII).
 */
export function selecionarPedidos(candidatos, { agora, precoProMensal, ativacaoMaxDias, tetoRodada }) {
  const vistos = new Set();
  const pedidos = [];
  const motivos = {};
  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    const id = objeto(c) ? c.userId : null;
    if (typeof id === 'string' && vistos.has(id)) continue;
    if (typeof id === 'string') vistos.add(id);
    const d = decidirLembreteEmail(c, { agora, precoProMensal, ativacaoMaxDias });
    let motivo = d.motivo;
    if (d.enfileirar) {
      if (pedidos.length >= tetoRodada) motivo = 'teto_da_rodada';
      else pedidos.push(d.pedido);
    }
    motivos[motivo] = (motivos[motivo] || 0) + 1;
  }
  return Object.freeze({ pedidos: Object.freeze(pedidos), motivos: Object.freeze(motivos) });
}
