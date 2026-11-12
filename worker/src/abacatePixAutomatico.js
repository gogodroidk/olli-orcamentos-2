/**
 * PIX AUTOMÁTICO (assinatura recorrente no Pix) via AbacatePay — OLLI Pro mensal.
 *
 * O cliente autoriza UMA vez no app do banco, paga o 1º mês na hora e os meses
 * seguintes são debitados sozinhos. Estende o Pix avulso (`abacate.js`) — mesma
 * chave, mesmo segredo de webhook, mesma concessão de plano — sem montar máquina paralela.
 *
 *   POST /abacate/assinatura/pix       → cria o checkout de assinatura; devolve { checkoutId, url }
 *                                         (a página da AbacatePay mostra o QR da autorização, que vale 1 h)
 *   GET  /abacate/assinatura/status    → ?checkout=bill_… consulta e, se a assinatura nasceu, libera o Pro
 *   GET  /abacate/assinatura/estado    → { ativa, pagoAte } da conta (para a tela "renova sozinho / cancelar")
 *   POST /abacate/assinatura/cancelar  → cancela na AbacatePay (revoga a autorização no banco)
 *   webhook subscription.*             → tratado por `processarEventoAssinatura` (chamado de abacate.js)
 *
 * ═══ FLAG, DESLIGADA POR PADRÃO ═══
 * `ABACATE_PIX_AUTOMATICO=true` + `ABACATE_PA_PRODUTO_PRO_MENSAL=prod_…` (produto MONTHLY de R$ 39,00 criado
 * na AbacatePay). Sem os dois (ou sem a chave) `/abacate/config` diz `pixAutomatico:false`, o app não oferece
 * o botão e a criação responde 503. A AbacatePay ainda precisa liberar Pix Automático na loja (suporte).
 * Cancelar e tratar webhook NÃO dependem da flag: assinatura que existe tem de poder terminar. Sem a CHAVE da AbacatePay
 * `/cancelar` encerra só localmente (e avisa); `/status` exige a chave (503).
 *
 * ═══ SEM MIGRATION ═══
 * O cadastro vive em `webhook_events` (mesmo padrão do consumo do Pix avulso):
 *   origem 'abacate_pa'     event_id = bill_… (checkout que NÓS criamos)   payload { user_id, plano, external_id }
 *   origem 'abacate_pa_sub' event_id = subs_… (assinatura, depois do 1º pagamento)
 *       payload { user_id, plano, checkout, estado:'ativa'|'encerrada', pago_ate, concedido_ate, motivo }
 *       status 'recebido' = ativa; 'processado' = encerrada.
 * `webhook_events` não tem FK com usuário: o `user_id` do payload é só nosso vínculo.
 *
 * ═══ SEGURANÇA (mesmo modelo do Pix avulso) ═══
 *  - Webhook autenticado pelo `?webhookSecret=` (abacate.js). O corpo NÃO é confiado: quem concede é a LEITURA
 *    da assinatura na própria AbacatePay (status, método PIX, valor do catálogo, checkout que nós criamos).
 *  - Quem é o dono vem do NOSSO cadastro (checkout que registramos), nunca do corpo do evento.
 *  - Conceder duas vezes = mesma vigência (data vem do ciclo pago, `max` com o que já existe): replay não soma.
 *
 * ═══ QUANDO O PAGAMENTO FALHA ═══
 * No Pix Automático quem debita é o banco; a AbacatePay NÃO cancela sozinha e `retryPolicy` não vale.
 * Então `subscription.payment_failed` → cancelamos pela API e o Pro termina no fim do ciclo JÁ pago (sem a folga).
 * `subscription.cancelled` (inclusive `pix_automatic_authorization_refused`, o cliente cancelou no banco) →
 * mesmo fim. Nunca tiramos o que o cliente já pagou, e nunca mexemos em vigência vinda de outra fonte.
 */
import { PLANO_PIX } from './mercadopago.js';
import { rateOkSensivel } from './rateLimit.js';
import { getAssinatura, upsertAssinatura } from './stripe.js';
import { buscarEventos, lerEvento, marcarEvento, reivindicarEvento } from './webhookEvents.js';

/** Cadastro dos checkouts criados por nós. */
export const ORIGEM_PA = 'abacate_pa';
/** Cadastro das assinaturas (subs_…). */
export const ORIGEM_PA_SUB = 'abacate_pa_sub';

/** Só o Pro mensal. Preço e nome vêm do catálogo único (PLANO_PIX). */
const PLANO_PA = 'pro_mensal';
/** Folga depois do fim do ciclo pago: o débito do Pix Automático chega perto da data e o webhook pode atrasar. */
export const GRACA_MS = 2 * 864e5;
/** Só conta como "quando foi pago" uma data recente (evento velho/forjado não estende nada). */
const ANCORA_MAX_ATRAS_MS = 7 * 864e5;
const ANCORA_MAX_FRENTE_MS = 3600e3;
/** Se o Pro já vale por mais que isto, não vendemos assinatura em cima (o 1º débito é imediato: pagaria em dobro). */
/** Falha mais de 10 dias antes do fim do ciclo pago = de um ciclo já superado por um pagamento posterior. */
const FALHA_ANTIGA_MS = 10 * 864e5;
const PRO_ATIVO_BLOQUEIA_MS = 5 * 864e5;

const RE_ID = /^[A-Za-z0-9_-]{6,80}$/;
const NIVEL = { gratis: 0, pro: 1, empresa: 2 };
const INATIVOS = ['canceled', 'unpaid', 'incomplete_expired'];
const RETORNO_URL_PADRAO = 'https://diagnostico.olliorcamentos.online/stripe/sucesso';

export const ABACATE_PA_ENV = { flag: 'ABACATE_PIX_AUTOMATICO', produto: 'ABACATE_PA_PRODUTO_PRO_MENSAL' };

export const ABACATE_PA_ROTAS = [
  '/abacate/assinatura/pix',
  '/abacate/assinatura/status',
  '/abacate/assinatura/estado',
  '/abacate/assinatura/cancelar',
];

/** Valor do catálogo em centavos. */
export function valorPaCentavos() {
  return Math.round(PLANO_PIX[PLANO_PA].valor * 100);
}

/**
 * A venda do Pix Automático está ligada? Exige TUDO: flag 'true' (padrão: desligada), produto configurado
 * e uma chave que vende (produção, ou teste permitido). Qualquer dúvida = desligada.
 */
export function pixAutomaticoLigado(env, h) {
  if (!env || env[ABACATE_PA_ENV.flag] !== 'true') return false;
  const produto = typeof env[ABACATE_PA_ENV.produto] === 'string' ? env[ABACATE_PA_ENV.produto].trim() : '';
  if (!RE_ID.test(produto)) return false;
  return h.modoAbacate(env) !== 'desligado';
}

// ─── AbacatePay ──────────────────────────────────────────────
/** Chamada que devolve também o status e a mensagem de erro (o cancelamento precisa distinguir "já cancelada"). */
async function chamar(env, h, caminho, init = {}) {
  try {
    const r = await fetch(`${h.api}${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`, 'Content-Type': 'application/json' },
    });
    const corpo = await r.json().catch(() => null);
    const data = corpo && corpo.data ? corpo.data : null;
    const erro = corpo && typeof corpo.error === 'string' ? corpo.error : null;
    return { ok: r.ok && !erro && !!data, status: r.status, data, erro };
  } catch (e) {
    console.error('[olli-abacate-pa] fetch falhou:', caminho.split('?')[0], e && (e.message || e));
    return { ok: false, status: 0, data: null, erro: 'rede' };
  }
}

/** Cancelar uma assinatura que já não existe/está cancelada é sucesso (o objetivo é "não cobrar mais"). */
function jaEncerrada(r) {
  return !r.ok && /not found|not active|doesn't exists/i.test(r.erro || '');
}

/** Cancela a assinatura. 'ok' | 'falha'. */
async function cancelarNaAbacate(env, h, subId) {
  const r = await chamar(env, h, '/subscriptions/cancel', { method: 'POST', body: JSON.stringify({ id: subId }) });
  if (r.ok || jaEncerrada(r)) return 'ok';
  console.error('[olli-abacate-pa] cancelar falhou —', r.status);
  return 'falha';
}

// ─── datas e concessão ───────────────────────────────────────
function somaUmMes(ms) {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** Primeira data recente e plausível entre as candidatas (ISO); `null` se nenhuma serve. */
export function ancoraDoPagamento(candidatas, agora = Date.now()) {
  for (const c of candidatas) {
    const t = Date.parse(c);
    if (Number.isFinite(t) && t >= agora - ANCORA_MAX_ATRAS_MS && t <= agora + ANCORA_MAX_FRENTE_MS) return t;
  }
  return null;
}

/**
 * Até quando vale o ciclo PAGO (ms, sem a folga). Prefere o fim do ciclo que a AbacatePay informa
 * (`currentPeriodEnd`) quando é plausível; senão, 1 mês a partir do pagamento. Sem âncora confiável: `null`
 * — nada novo é concedido (o que já existe fica).
 */
export function fimDoCicloPago(sub, ancoraMs, agora = Date.now()) {
  const api = Date.parse(sub && sub.currentPeriodEnd);
  if (Number.isFinite(api) && api > agora - 864e5 && api <= agora + 45 * 864e5) return api;
  return Number.isFinite(ancoraMs) ? somaUmMes(ancoraMs) : null;
}

/**
 * Pro até `fimMs + folga`. Preserva nível maior e vigência maior já existentes (nunca encurta) e NÃO toca em
 * `stripe_subscription_id` (quem tem cartão na Stripe continua com ele). `{ ok, motivo? }`.
 */
async function concederAte(env, userId, fimMs, graca = GRACA_MS) {
  const atual = await getAssinatura(env, userId);
  if (atual && atual.error) return { ok: false, motivo: 'indisponivel' };
  let plano = PLANO_PIX[PLANO_PA].plano;
  const nossa = fimMs + graca;
  let vigencia = nossa;
  if (atual) {
    const fimAtual = Date.parse(atual.current_period_end);
    const ativa = atual.status && !INATIVOS.includes(atual.status) && Number.isFinite(fimAtual) && fimAtual > Date.now();
    if (ativa) {
      if ((NIVEL[atual.plano] || 0) > (NIVEL[plano] || 0)) plano = atual.plano;
      if (fimAtual > vigencia) vigencia = fimAtual;
    }
  }
  const ok = await upsertAssinatura(env, userId, { plano, status: 'active', current_period_end: new Date(vigencia).toISOString() });
  // `concedidoAte` só quando a vigência gravada É a nossa: se outra fonte (Pix avulso, cortesia) já valia mais,
  // terminar esta assinatura não pode encurtá-la (ver encerrarAcesso).
  return ok ? { ok: true, concedidoAte: vigencia === nossa ? vigencia : null } : { ok: false, motivo: 'falha_persistencia' };
}

/**
 * Termina o acesso vindo desta assinatura: a vigência cai para o fim do ciclo PAGO (sem a folga); se esse
 * fim já passou, a conta volta ao grátis agora. Só mexe se a vigência atual FOI a que esta assinatura
 * concedeu — vigência de outra fonte (Pix avulso, Stripe, cortesia) não é tocada. `{ ok, efeito }`.
 */
async function encerrarAcesso(env, userId, payload) {
  const atual = await getAssinatura(env, userId);
  if (atual && atual.error) return { ok: false };
  if (!atual) return { ok: true, efeito: 'sem_assinatura' };
  const fimAtual = Date.parse(atual.current_period_end);
  const concedido = Number(payload && payload.concedido_ate);
  const pagoAte = Number(payload && payload.pago_ate);
  if (!Number.isFinite(fimAtual) || !Number.isFinite(concedido) || Math.abs(fimAtual - concedido) > 1000) {
    return { ok: true, efeito: 'vigencia_de_outra_fonte' };
  }
  const agora = Date.now();
  const patch = Number.isFinite(pagoAte) && pagoAte > agora
    ? { current_period_end: new Date(Math.min(pagoAte, fimAtual)).toISOString() }
    : { status: 'canceled', current_period_end: new Date(agora).toISOString() };
  const ok = await upsertAssinatura(env, userId, patch);
  return ok ? { ok: true, efeito: patch.status ? 'encerrado_agora' : 'ate_fim_do_ciclo' } : { ok: false };
}

// ─── cadastro ────────────────────────────────────────────────
function payloadSub(p) {
  return {
    user_id: p.user_id,
    plano: p.plano,
    checkout: p.checkout,
    estado: p.estado,
    pago_ate: p.pago_ate ?? null,
    concedido_ate: p.concedido_ate ?? null,
    motivo: p.motivo ?? null,
  };
}

/** Grava o estado da assinatura (status 'recebido' = ativa, 'processado' = encerrada). */
function gravarSub(env, subId, p) {
  return marcarEvento(env, {
    origem: ORIGEM_PA_SUB,
    eventId: subId,
    status: p.estado === 'ativa' ? 'recebido' : 'processado',
    payload: payloadSub(p),
  });
}

/** Assinatura ativa da conta. `{ ok, linha|null }`. */
async function assinaturaAtivaDaConta(env, userId) {
  const r = await buscarEventos(env, ORIGEM_PA_SUB, { user_id: userId, estado: 'ativa' }, 5);
  if (!r.ok) return { ok: false };
  return { ok: true, linha: r.linhas[0] || null };
}

/**
 * Quem é o dono do evento, pelo NOSSO cadastro: primeiro pela assinatura (subs_), depois pelo checkout (bill_).
 * `{ ok:false }` = banco fora (reenvio); `{ ok:true, vinculo:null }` = não é nosso.
 */
async function resolverVinculo(env, subId, checkoutId) {
  if (subId) {
    const s = await lerEvento(env, ORIGEM_PA_SUB, subId);
    if (!s.ok) return { ok: false };
    if (s.linha) return { ok: true, vinculo: { tipo: 'sub', payload: s.linha.payload || {} } };
  }
  if (checkoutId) {
    const c = await lerEvento(env, ORIGEM_PA, checkoutId);
    if (!c.ok) return { ok: false };
    if (c.linha) return { ok: true, vinculo: { tipo: 'checkout', payload: c.linha.payload || {}, checkoutId } };
  }
  return { ok: true, vinculo: null };
}

// ─── sincronizar (libera o Pro a partir da leitura NA AbacatePay) ──
/**
 * Lê a assinatura na AbacatePay e, se for nossa e estiver paga, concede o Pro até o fim do ciclo pago.
 * Único caminho que concede (webhook e polling). Retorno `{ estado, motivo?, ... }`:
 *   'liberado' | 'cancelada' | 'invalida' | 'indisponivel' | 'sem_ancora'
 */
async function sincronizar(env, h, { userId, checkoutId, subId, pagoEmCandidatas = [], pagamentoPago = false }) {
  const leitura = await chamar(env, h, `/subscriptions/get?id=${encodeURIComponent(subId)}`);
  if (!leitura.ok) return leitura.status === 404 || /not found/i.test(leitura.erro || '') ? { estado: 'invalida', motivo: 'assinatura_inexistente' } : { estado: 'indisponivel' };
  const sub = leitura.data;
  if (sub.devMode === true && h.modoAbacate(env) !== 'teste') return { estado: 'invalida', motivo: 'dev_mode' };
  if (sub.method !== 'PIX') return { estado: 'invalida', motivo: 'metodo_nao_pix' };
  if (Number(sub.amount) !== valorPaCentavos()) {
    console.error('[olli-abacate-pa] valor da assinatura difere do catálogo — não libera');
    return { estado: 'invalida', motivo: 'valor_divergente' };
  }
  if (checkoutId && sub.checkoutId !== checkoutId) return { estado: 'invalida', motivo: 'checkout_divergente' };

  const ativa = sub.status === 'ACTIVE';
  // Ordem de chegada não é garantida: um "cancelada" na frente de um "pago" não pode comer um ciclo que o cliente pagou.
  if (!ativa && !(sub.status === 'CANCELLED' && pagamentoPago)) return { estado: 'cancelada' };

  const previo = await lerEvento(env, ORIGEM_PA_SUB, subId);
  if (!previo.ok) return { estado: 'indisponivel' };
  const antes = (previo.linha && previo.linha.payload) || {};
  if (!previo.linha) {
    // Duas assinaturas ativas = duas cobranças mensais. A 2ª (checkout pago em paralelo) é cancelada e NÃO concede.
    const outras = await buscarEventos(env, ORIGEM_PA_SUB, { user_id: userId, estado: 'ativa' }, 5);
    if (!outras.ok) return { estado: 'indisponivel' };
    if (outras.linhas.some((l) => l.event_id !== subId)) {
      if ((await cancelarNaAbacate(env, h, subId)) !== 'ok') return { estado: 'indisponivel', motivo: 'cancelar_falhou' };
      const claimDup = await reivindicarEvento(env, { origem: ORIGEM_PA_SUB, eventId: subId, tipo: 'assinatura_pix_automatico', payload: payloadSub({ user_id: userId, plano: PLANO_PA, checkout: sub.checkoutId || checkoutId, estado: 'encerrada', motivo: 'duplicada_cancelada' }) });
      if (!claimDup.ok) return { estado: 'indisponivel', motivo: 'registro_nao_gravou' };
      if (!(await gravarSub(env, subId, { user_id: userId, plano: PLANO_PA, checkout: sub.checkoutId || checkoutId, estado: 'encerrada', motivo: 'duplicada_cancelada' }))) return { estado: 'indisponivel', motivo: 'registro_nao_gravou' };
      console.error('[olli-abacate-pa] 2ª assinatura ativa da mesma conta — cancelada, sem conceder');
      return { estado: 'duplicada' };
    }
    const claim = await reivindicarEvento(env, { origem: ORIGEM_PA_SUB, eventId: subId, tipo: 'assinatura_pix_automatico', payload: payloadSub({ user_id: userId, plano: PLANO_PA, checkout: sub.checkoutId || checkoutId, estado: 'ativa' }) });
    if (!claim.ok) return { estado: 'indisponivel' };
  }

  const ancora = ancoraDoPagamento([...pagoEmCandidatas, sub.updatedAt, sub.createdAt]);
  const fim = fimDoCicloPago(sub, ancora);
  if (fim === null) return { estado: 'sem_ancora' };
  const pagoAte = Math.max(fim, Number(antes.pago_ate) || 0);

  // Cancelada depois de paga: concede só o ciclo pago, SEM folga (nunca mais será renovada nem aparada).
  const c = await concederAte(env, userId, pagoAte, ativa ? GRACA_MS : 0);
  if (!c.ok) return { estado: 'indisponivel', motivo: c.motivo };
  const gravou = await gravarSub(env, subId, {
    user_id: userId,
    plano: PLANO_PA,
    checkout: sub.checkoutId || checkoutId,
    estado: ativa ? 'ativa' : 'encerrada',
    pago_ate: pagoAte,
    concedido_ate: c.concedidoAte,
    motivo: ativa ? null : 'cancelada_apos_pagar',
  });
  // Sem o registro do que foi concedido não dá para terminar o acesso direito depois: pede reenvio (o grant se repete igual).
  if (!gravou) return { estado: 'indisponivel', motivo: 'registro_nao_gravou' };
  return { estado: 'liberado', pagoAte, ativa };
}

// ─── webhook subscription.* ──────────────────────────────────
const MOTIVOS_CANCELAMENTO = new Set(['pix_automatic_authorization_refused', 'max_payment_retries_exceeded', 'dispute_opened']);

/** Motivo curto e seguro para guardar (nada de texto livre do cliente). */
function motivoDoCancelamento(due) {
  if (typeof due !== 'string' || !due) return 'cancelada_pela_loja';
  if (MOTIVOS_CANCELAMENTO.has(due)) return due;
  if (due.startsWith('Cancelada pelo cliente no portal')) return 'cancelada_pelo_cliente_no_portal';
  if (due.startsWith('Cancelada pelo reembolso')) return 'cancelada_por_reembolso';
  return 'cancelada_outro';
}

const rejeicao = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) : null);
const idValido = (v) => (typeof v === 'string' && RE_ID.test(v) ? v : '');

/**
 * Trata um evento `subscription.*` JÁ autenticado (segredo conferido em abacate.js). Devolve
 * `{ http, corpo, resultado, motivo }` — o mesmo contrato do restante do webhook (trilha em `webhook_events`).
 * 5xx = a AbacatePay reenvia; o que não melhora com reenvio responde 200.
 */
export async function processarEventoAssinatura(env, evt, h) {
  const tipo = evt.event;
  const d = (evt && evt.data) || {};
  const subId = idValido(d.subscription && d.subscription.id);
  const checkoutId = idValido(d.checkout && d.checkout.id);
  const ignorado = (motivo) => ({ http: 200, corpo: { ok: true }, resultado: 'ignorado', motivo });
  const indisponivel = (motivo) => ({ http: 503, corpo: { erro: 'indisponivel' }, resultado: 'erro', motivo });

  const TRATADOS = ['subscription.completed', 'subscription.renewed', 'subscription.payment_failed', 'subscription.cancelled'];
  // trial_started/plan_changed não existem no Pix Automático (sem teste grátis, sem troca de valor).
  if (!TRATADOS.includes(tipo)) return ignorado('evento_nao_tratado');
  if (!subId) return ignorado('sem_assinatura');

  const res = await resolverVinculo(env, subId, checkoutId);
  if (!res.ok) return indisponivel('cadastro_indisponivel');
  if (!res.vinculo) return { http: 200, corpo: { ok: true, sem_vinculo: true }, resultado: 'ignorado', motivo: 'sem_vinculo' };
  const { payload } = res.vinculo;
  const userId = typeof payload.user_id === 'string' ? payload.user_id : '';
  if (!userId) return { http: 200, corpo: { ok: true }, resultado: 'erro', motivo: 'cadastro_sem_usuario' };

  if (tipo === 'subscription.completed' || tipo === 'subscription.renewed') {
    const pago = d.payment && (d.payment.status === 'PAID' || d.payment.status === 'APPROVED');
    const r = await sincronizar(env, h, {
      userId,
      subId,
      checkoutId: res.vinculo.tipo === 'checkout' ? res.vinculo.checkoutId : payload.checkout,
      pagoEmCandidatas: [d.payment && d.payment.updatedAt, d.payment && d.payment.createdAt],
      pagamentoPago: !!pago,
    });
    if (r.estado === 'indisponivel') return indisponivel(r.motivo || 'indisponivel');
    if (r.estado === 'liberado') return { http: 200, corpo: { ok: true, estado: 'liberado' }, resultado: 'ok', motivo: tipo === 'subscription.completed' ? 'assinatura_ativa' : 'renovada' };
    if (r.estado === 'cancelada') return ignorado('assinatura_cancelada');
    if (r.estado === 'duplicada') return { http: 200, corpo: { ok: true, estado: 'duplicada' }, resultado: 'erro', motivo: 'assinatura_duplicada_cancelada' };
    if (r.estado === 'sem_ancora') return { http: 200, corpo: { ok: true }, resultado: 'erro', motivo: 'sem_data_do_pagamento' };
    return { http: 200, corpo: { ok: true }, resultado: 'erro', motivo: `invalida_${r.motivo || 'assinatura'}` };
  }

  // payment_failed / cancelled só valem para assinatura que já registramos (subs_), nunca só pelo checkout.
  if (res.vinculo.tipo !== 'sub') return ignorado('assinatura_sem_pagamento');
  if (payload.estado === 'encerrada') return ignorado('ja_encerrada');

  if (tipo === 'subscription.payment_failed') {
    // O banco recusou o débito. Não há retentativa no Pix: cancelamos aqui (revoga a autorização) e o Pro
    // termina no fim do ciclo já pago.
    // A ordem de entrega não é garantida: um payment_failed ATRASADO, depois de um ciclo já pago, não derruba quem paga.
    const leitura = await chamar(env, h, `/subscriptions/get?id=${encodeURIComponent(subId)}`);
    const naoExiste = !leitura.ok && (leitura.status === 404 || /not found/i.test(leitura.erro || ''));
    if (!leitura.ok && !naoExiste) return indisponivel('leitura_falhou');
    const falhouEm = Date.parse((d.payment && (d.payment.createdAt || d.payment.updatedAt)) || '');
    const apiFim = leitura.ok ? Date.parse(leitura.data.currentPeriodEnd) : NaN;
    const pagoAteMax = Math.max(Number(payload.pago_ate) || 0, Number.isFinite(apiFim) ? apiFim : 0);
    if (Number.isFinite(falhouEm) && pagoAteMax - falhouEm > FALHA_ANTIGA_MS) return ignorado('falha_antiga_ciclo_posterior_pago');
    const jaCancelada = leitura.ok && leitura.data.status === 'CANCELLED';
    if (!jaCancelada && !naoExiste && (await cancelarNaAbacate(env, h, subId)) !== 'ok') return indisponivel('cancelar_falhou');
    return encerrar(env, h, subId, payload, `pagamento_recusado${rejeicao(d.rejectCode) ? `:${rejeicao(d.rejectCode)}` : ''}`);
  }
  // subscription.cancelled: já cancelada na AbacatePay (cliente no banco/portal, ou a loja).
  return encerrar(env, h, subId, payload, motivoDoCancelamento(d.subscription && d.subscription.cancelledDueTo));
}

/** Fecha a assinatura no cadastro e termina o acesso dela. */
async function encerrar(env, h, subId, payload, motivo) {
  const fim = await encerrarAcesso(env, payload.user_id, payload);
  if (!fim.ok) return { http: 503, corpo: { erro: 'indisponivel' }, resultado: 'erro', motivo: 'encerrar_acesso_falhou' };
  const gravou = await gravarSub(env, subId, { ...payload, estado: 'encerrada', motivo });
  if (!gravou) return { http: 503, corpo: { erro: 'indisponivel' }, resultado: 'erro', motivo: 'registro_nao_gravou' };
  return { http: 200, corpo: { ok: true, estado: 'encerrada' }, resultado: 'ok', motivo: `encerrada:${fim.efeito}` };
}

// ─── rotas do usuário ────────────────────────────────────────
/** Pro ativo vindo de outra fonte, com mais tempo que a margem? → bloqueia a venda. */
function proAtivoLongo(atual) {
  if (!atual || atual.error || !atual.status || INATIVOS.includes(atual.status)) return null;
  const fim = Date.parse(atual.current_period_end);
  if (!Number.isFinite(fim) || fim <= Date.now() + PRO_ATIVO_BLOQUEIA_MS) return null;
  return atual.plano === 'pro' || atual.plano === 'empresa' ? fim : null;
}

async function criar(request, env, h) {
  const { json } = h;
  const user = await h.getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!pixAutomaticoLigado(env, h)) return json({ ok: false, erro: 'pix_automatico_desligado' }, 503);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `pa:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  const corpo = await request.json().catch(() => ({}));
  if (!corpo || corpo.plano !== PLANO_PA) return json({ ok: false, erro: 'plano_invalido' }, 400);
  const plano = PLANO_PIX[PLANO_PA];

  const ativa = await assinaturaAtivaDaConta(env, user.id);
  if (!ativa.ok) return json({ ok: false, erro: 'falha_criar' }, 502);
  if (ativa.linha) return json({ ok: false, erro: 'assinatura_ja_ativa' }, 409);

  const atual = await getAssinatura(env, user.id);
  if (atual && atual.error) return json({ ok: false, erro: 'falha_criar' }, 502);
  const fimOutra = proAtivoLongo(atual);
  if (fimOutra) return json({ ok: false, erro: 'plano_ainda_ativo', ate: new Date(fimOutra).toISOString() }, 409);

  // O produto TEM de ser o do catálogo: R$ 39,00, ciclo mensal. Produto errado = cobrança errada todo mês.
  const produtoId = env[ABACATE_PA_ENV.produto].trim();
  const produto = await chamar(env, h, `/products/get?id=${encodeURIComponent(produtoId)}`);
  if (!produto.ok || Number(produto.data.price) !== valorPaCentavos() || produto.data.cycle !== 'MONTHLY' || (produto.data.status && produto.data.status !== 'ACTIVE')) {
    console.error('[olli-abacate-pa] produto da assinatura não confere com o catálogo — não vende');
    return json({ ok: false, erro: 'produto_invalido' }, 503);
  }

  const externalId = `olli:pa:${user.id}:${crypto.randomUUID()}:${plano.id}`;
  const retorno = typeof env.ABACATE_PA_RETORNO_URL === 'string' && env.ABACATE_PA_RETORNO_URL.startsWith('https://') ? env.ABACATE_PA_RETORNO_URL : RETORNO_URL_PADRAO;
  const bill = await chamar(env, h, '/subscriptions/create', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ id: produtoId, quantity: 1 }],
      methods: ['PIX'],
      externalId,
      completionUrl: retorno,
      metadata: { externalId },
    }),
  });
  if (!bill.ok || !RE_ID.test(bill.data.id || '') || typeof bill.data.url !== 'string' || !bill.data.url.startsWith('https://')) {
    console.error('[olli-abacate-pa] criar assinatura falhou —', bill.status, bill.erro);
    return json({ ok: false, erro: 'falha_criar' }, 502);
  }

  // Sem o cadastro o pagamento não teria dono: não entrega a página (um checkout esquecido é inofensivo).
  const claim = await reivindicarEvento(env, {
    origem: ORIGEM_PA,
    eventId: bill.data.id,
    tipo: 'checkout_assinatura_criado',
    payload: { user_id: user.id, plano: plano.id, external_id: externalId },
  });
  if (!claim.ok) return json({ ok: false, erro: 'falha_criar' }, 502);

  return json({
    ok: true,
    checkoutId: bill.data.id,
    url: bill.data.url,
    plano: { id: plano.id, nome: plano.nome, valor: plano.valor },
  });
}

async function status(request, env, url, h) {
  const { json } = h;
  const user = await h.getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (h.modoAbacate(env) === 'desligado') return json({ ok: false, erro: 'pix_desligado' }, 503);
  const checkout = url.searchParams.get('checkout') || '';
  if (!RE_ID.test(checkout)) return json({ ok: false, erro: 'id_invalido' }, 400);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `pastatus:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  const reg = await lerEvento(env, ORIGEM_PA, checkout);
  if (!reg.ok) return json({ ok: false, erro: 'falha_status' }, 502);
  // Checkout alheio responde igual a inexistente (não vira oráculo).
  if (!reg.linha || !reg.linha.payload || reg.linha.payload.user_id !== user.id) return json({ ok: false, erro: 'nao_encontrado' }, 404);

  const leitura = await chamar(env, h, `/subscriptions/get?externalId=${encodeURIComponent(reg.linha.payload.external_id)}`);
  if (!leitura.ok) {
    if (leitura.status === 404 || /not found/i.test(leitura.erro || '')) return json({ ok: true, ativa: false, liberado: false }); // ainda não pagou/autorizou
    return json({ ok: false, erro: 'falha_status' }, 502);
  }
  const r = await sincronizar(env, h, { userId: user.id, checkoutId: checkout, subId: leitura.data.id, pagoEmCandidatas: [], pagamentoPago: false });
  if (r.estado === 'indisponivel') return json({ ok: false, erro: 'falha_status' }, 502);
  if (r.estado === 'invalida') return json({ ok: false, erro: 'nao_encontrado' }, 404);
  return json({ ok: true, ativa: r.estado === 'liberado' && r.ativa === true, liberado: r.estado === 'liberado' });
}

async function estado(request, env, h) {
  const { json } = h;
  const user = await h.getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  const ativa = await assinaturaAtivaDaConta(env, user.id);
  if (!ativa.ok) return json({ ok: false, erro: 'falha_status' }, 502);
  if (!ativa.linha) return json({ ok: true, ativa: false });
  const pago = Number(ativa.linha.payload && ativa.linha.payload.pago_ate);
  return json({ ok: true, ativa: true, pagoAte: Number.isFinite(pago) ? new Date(pago).toISOString() : null });
}

async function cancelar(request, env, h) {
  const { json } = h;
  const user = await h.getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `pacancel:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  const ativas = await buscarEventos(env, ORIGEM_PA_SUB, { user_id: user.id, estado: 'ativa' }, 10);
  if (!ativas.ok) return json({ ok: false, erro: 'falha_cancelar' }, 502);
  if (!ativas.linhas.length) return json({ ok: false, erro: 'sem_assinatura' }, 404);
  // Sem chave da AbacatePay no ambiente não dá para revogar lá: encerra SÓ localmente e DIZ isso (canceladoNaAbacate:false).
  const semChave = h.modoAbacate(env) === 'desligado';
  if (semChave) console.error('[olli-abacate-pa] cancelar sem chave da AbacatePay — encerrado só localmente');
  let ate = 0;
  // TODAS as ativas (um bug de duplicidade não pode deixar uma cobrando).
  for (const linha of ativas.linhas) {
    if (!semChave && (await cancelarNaAbacate(env, h, linha.event_id)) !== 'ok') return json({ ok: false, erro: 'falha_cancelar' }, 502);
    const r = await encerrar(env, h, linha.event_id, { ...linha.payload, user_id: user.id }, 'cancelada_pelo_cliente_no_olli');
    if (r.http !== 200) return json({ ok: false, erro: 'falha_cancelar' }, 502);
    ate = Math.max(ate, Number(linha.payload && linha.payload.pago_ate) || 0);
  }
  return json({ ok: true, canceladoNaAbacate: !semChave, ate: ate > Date.now() ? new Date(ate).toISOString() : null });
}

/**
 * Exclusão de conta: cancela TUDO que ainda poderia debitar. 'ok' | 'falha' (fail-closed, como a Stripe e o MP:
 * não saber ≠ não ter). Sem chave da AbacatePay no ambiente não existe assinatura nossa: 'ok'.
 * Também derruba checkouts abertos (um bill_ pago depois da conta apagada criaria assinatura órfã).
 */
export async function cancelarPixAutomaticoDoUsuario(env, userId, h) {
  if (h.modoAbacate(env) === 'desligado') return 'ok';
  // Com a flag desligada nunca vendemos assinatura: consulta que falha NÃO pode travar a exclusão de ninguém.
  const ligado = pixAutomaticoLigado(env, h);
  const ativas = await buscarEventos(env, ORIGEM_PA_SUB, { user_id: userId, estado: 'ativa' }, 10);
  if (!ativas.ok) return ligado ? 'falha' : 'ok';
  for (const linha of ativas.linhas) {
    if ((await cancelarNaAbacate(env, h, linha.event_id)) !== 'ok') return 'falha';
    if (!(await gravarSub(env, linha.event_id, { ...linha.payload, estado: 'encerrada', motivo: 'conta_excluida' }))) return 'falha';
  }
  const abertos = await buscarEventos(env, ORIGEM_PA, { user_id: userId }, 20);
  if (!abertos.ok) return ligado ? 'falha' : 'ok';
  for (const linha of abertos.linhas) {
    // Melhor esforço: checkout já pago/excluído devolve erro e não impede nada (a assinatura dele, se existe, já foi cancelada acima).
    await chamar(env, h, '/subscriptions/checkouts/delete', { method: 'POST', body: JSON.stringify({ id: linha.event_id }) });
  }
  return 'ok';
}

export async function handlePixAutomatico(request, env, url, h) {
  const p = url.pathname;
  if (p === '/abacate/assinatura/pix' && request.method === 'POST') return criar(request, env, h);
  if (p === '/abacate/assinatura/status' && request.method === 'GET') return status(request, env, url, h);
  if (p === '/abacate/assinatura/estado' && request.method === 'GET') return estado(request, env, h);
  if (p === '/abacate/assinatura/cancelar' && request.method === 'POST') return cancelar(request, env, h);
  return h.json({ erro: 'metodo_nao_suportado' }, 405);
}
