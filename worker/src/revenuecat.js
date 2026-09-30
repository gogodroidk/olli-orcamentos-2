/**
 * ASSINATURA PELA GOOGLE PLAY via RevenueCat — OLLI (worker Cloudflare, SEM SDK).
 *
 *   POST /revenuecat/webhook → evento do RevenueCat → public.assinaturas
 *
 * O Android da Play não pode vender por Stripe nem Pix (regra da loja para bem
 * digital). Quem vende lá é o Google Play Billing; o RevenueCat valida o recibo com
 * o Google e avisa este worker. O app NUNCA libera o plano sozinho: a verdade é
 * esta tabela, gravada aqui com SERVICE_ROLE (o usuário só tem SELECT da própria
 * linha). Passo a passo humano em docs/GOOGLE_PLAY_BILLING.md.
 *
 * SEGURANÇA (inegociável, fail-closed):
 *  - Autenticação = cabeçalho `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`
 *    (o valor que o dono cadastra no painel do RevenueCat), comparado em tempo
 *    constante. Sem o secret — ou com um secret curto demais para ser segredo — a
 *    rota fica DESLIGADA e diz que está desligada (503). Nunca aceita "qualquer um".
 *  - `app_user_id` tem de ser um UUID (o id do usuário no Supabase, que o app passa
 *    ao SDK). Id anônimo do RevenueCat (`$RCAnonymousID:…`) não é de ninguém: vira
 *    ALARME, não concessão.
 *  - Só a loja `PLAY_STORE`. Compra de ambiente `SANDBOX` (licença de teste) só
 *    libera plano com `REVENUECAT_ACEITAR_SANDBOX=true` — ligado de propósito, para
 *    testar, e desligado depois.
 *  - Produto desconhecido não libera nada. O catálogo é UM só, compartilhado com o
 *    app: `src/services/playBillingRegras.ts`.
 *
 * IDEMPOTÊNCIA: `webhook_events` (origem 'revenuecat', event_id = `event.id`, que o
 * RevenueCat reaproveita nos reenvios). Reenvio de evento já processado → 200 sem
 * reprocessar; banco fora → 5xx para o RevenueCat reenviar (até 5x, em 5-80 min).
 *
 * CONVIVÊNCIA COM STRIPE E PIX (a parte delicada): a linha de `assinaturas` é UMA
 * por usuário e pode estar sustentada por outra origem (assinatura Stripe, Pix de
 * 1 ano). Regras, no mesmo espírito de `concederPlanoPeriodo` (mercadopago.js) e
 * `sincronizarSubscription` (stripe.js) — o cliente nunca recebe menos do que pagou:
 *  1. CONCEDER sobre um plano vigente de OUTRA origem preserva o maior nível e a
 *     maior vigência. As colunas `stripe_*` e `mp_*` nunca são tocadas aqui: são
 *     elas que permitem cancelar a cobrança do cartão na exclusão da conta.
 *  2. ENCERRAR (EXPIRATION, reembolso) só age com PROVA DE VÍNCULO: o
 *     `original_transaction_id` do evento tem de ser o gravado em
 *     `revenuecat_transacao_id`. E mesmo com vínculo, se a vigência gravada é MAIOR
 *     do que a que a própria Play deu (`revenuecat_vigencia_ate`), quem sustenta o
 *     plano é outra origem — a Play sai de cena sem derrubar o plano pago por fora.
 *  3. EVENTO FORA DE ORDEM: o `event_timestamp_ms` mais recente aplicado fica em
 *     `revenuecat_evento_em`; evento mais velho que ele não muda nada (um reenvio
 *     atrasado de EXPIRATION não desfaz a RENOVAÇÃO que veio depois).
 */
import { capturarExcecao } from '../../src/services/sentryCaptura.ts';
import { produtoPlay } from '../../src/services/playBillingRegras.ts';
import { cabeNoTeto, checarLimite, deixaPassar, TETO, textoCabeNoTeto } from './rateLimit.js';
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

/** Origem em `webhook_events` (texto livre; não exige migration). */
const ORIGEM = 'revenuecat';

export const REVENUECAT_ROUTES = new Set(['/revenuecat/webhook']);

/** Abaixo disto o "segredo" é adivinhável: a rota fica desligada. */
const SEGREDO_MINIMO = 32;

/** Mesma escala de stripe.js/mercadopago.js: compara NÍVEL de acesso, não preço. */
const NIVEL_PLANO = { gratis: 0, pro: 1, empresa: 2 };

/** Status que já não sustentam acesso (mesma lista de concederPlanoPeriodo). */
const STATUS_ENCERRADOS = ['canceled', 'unpaid', 'incomplete_expired'];

/** Folga para comparar vigências gravadas em momentos diferentes (relógios, arredondamento). */
const FOLGA_MS = 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Eventos que CONCEDEM (compra validada pela loja, com vigência). */
const CONCEDEM = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED']);

/**
 * Eventos só informativos: 200 e trilha, sem mexer no plano.
 *  - PRODUCT_CHANGE: na Play, upgrade vem acompanhado de um INITIAL_PURCHASE do
 *    produto novo e downgrade vira RENEWAL no ciclo seguinte (doc "event flows").
 *    Conceder aqui seria adiantar o que o evento seguinte faz com a vigência certa.
 *  - SUBSCRIPTION_PAUSED: a pausa só vale no fim do período — chega EXPIRATION.
 *  - TEMPORARY_ENTITLEMENT_GRANT: acesso provisório do RevenueCat durante pane
 *    dele, SEM recibo validado. Não libera plano pago; a compra real chega depois.
 *  - NON_RENEWING_PURCHASE: o OLLI não vende produto avulso na Play.
 */
const INFORMATIVOS = new Set([
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_PAUSED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'NON_RENEWING_PURCHASE',
  'INVOICE_ISSUANCE',
  'VIRTUAL_CURRENCY_TRANSACTION',
  'EXPERIMENT_ENROLLMENT',
  'PURCHASE_REDEEMED',
  'SUBSCRIBER_ALIAS',
  'PRICE_INCREASE_CONSENT_REQUIRED',
  'PRICE_INCREASE_CONSENT_APPROVED',
]);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Comparação de strings em tempo constante (evita timing attack no secret). */
function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** O secret configurado, ou '' quando ausente/fraco (= rota desligada). */
function segredoWebhook(env) {
  const s = typeof env.REVENUECAT_WEBHOOK_SECRET === 'string' ? env.REVENUECAT_WEBHOOK_SECRET.trim() : '';
  return s.length >= SEGREDO_MINIMO ? s : '';
}

/** epoch em ms (número) → ISO, ou null se ausente/inválido. */
function msParaIso(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ms(iso) {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? null : t;
}

/**
 * Traduz UM evento do RevenueCat numa DECISÃO, sem tocar em banco nem rede — é a
 * parte que o teste exercita evento a evento. `agora` é injetável para o teste.
 *
 * Decisões:
 *  - { acao:'invalido' }                           → 400 (não é evento do RevenueCat)
 *  - { acao:'ignorar',  motivo }                   → 200, nada a fazer (TEST, sandbox…)
 *  - { acao:'registrar', motivo }                  → 200, informativo, trilha só
 *  - { acao:'alarme',   motivo }                   → 200 + ALARME no log: reenviar não
 *                                                    resolve, mas alguém precisa olhar
 *  - { acao:'conceder', userId, plano, status, vigenciaAte, transacaoId, produtoId, eventoEm }
 *  - { acao:'encerrar', userId, transacaoId, vigenciaAte, eventoEm }
 *  - { acao:'carencia', userId, transacaoId, vigenciaAte, eventoEm }
 */
export function traduzirEventoRevenueCat(evento, { aceitarSandbox = false, agora = Date.now() } = {}) {
  if (!evento || typeof evento !== 'object' || typeof evento.type !== 'string' || !evento.type) {
    return { acao: 'invalido' };
  }
  const tipo = evento.type;
  if (tipo === 'TEST') return { acao: 'ignorar', motivo: 'teste' };

  // TRANSFER move a compra de uma conta para outra. O RevenueCat do OLLI é
  // configurado para NÃO transferir ("Keep with original App User ID" — docs §2):
  // uma assinatura da Play não pode virar plano de duas contas OLLI. Se mesmo
  // assim chegar, alguém mudou essa configuração — alarme, sem mexer em plano.
  if (tipo === 'TRANSFER') return { acao: 'alarme', motivo: 'transfer_nao_suportado' };

  if (INFORMATIVOS.has(tipo)) return { acao: 'registrar', motivo: tipo.toLowerCase() };

  const encerra = tipo === 'EXPIRATION' || tipo === 'CANCELLATION';
  if (!CONCEDEM.has(tipo) && !encerra && tipo !== 'BILLING_ISSUE') {
    return { acao: 'registrar', motivo: 'tipo_desconhecido' };
  }

  if (evento.store !== 'PLAY_STORE') return { acao: 'alarme', motivo: 'loja_nao_suportada' };
  if (evento.environment === 'SANDBOX' && !aceitarSandbox) return { acao: 'ignorar', motivo: 'sandbox' };
  if (evento.environment !== 'SANDBOX' && evento.environment !== 'PRODUCTION') {
    return { acao: 'alarme', motivo: 'ambiente_desconhecido' };
  }

  const userId = typeof evento.app_user_id === 'string' ? evento.app_user_id.trim() : '';
  if (!UUID.test(userId)) return { acao: 'alarme', motivo: 'app_user_id_invalido' };

  const transacaoId = typeof evento.original_transaction_id === 'string' ? evento.original_transaction_id.trim() : '';
  if (!transacaoId) return { acao: 'alarme', motivo: 'sem_transacao' };

  const eventoEm = msParaIso(evento.event_timestamp_ms);
  if (!eventoEm) return { acao: 'alarme', motivo: 'sem_data_do_evento' };

  const expira = msParaIso(evento.expiration_at_ms);

  if (CONCEDEM.has(tipo)) {
    const produto = produtoPlay(evento.product_id);
    if (!produto) return { acao: 'alarme', motivo: 'produto_desconhecido' };
    // Sem vigência a loja não disse até quando vale: não inventamos.
    if (!expira) return { acao: 'alarme', motivo: 'sem_expiracao' };
    // Já vencido (ex.: RENEWAL antigo chegando muito atrasado): nada a liberar.
    if (Date.parse(expira) <= agora) return { acao: 'registrar', motivo: 'ja_expirado' };
    return {
      acao: 'conceder',
      userId,
      plano: produto.plano,
      // Teste grátis da loja conta como 'trialing' (plano_comercial_efetivo libera).
      status: evento.period_type === 'TRIAL' ? 'trialing' : 'active',
      vigenciaAte: expira,
      transacaoId,
      produtoId: String(evento.product_id),
      eventoEm,
    };
  }

  const agoraIso = new Date(agora).toISOString();

  if (tipo === 'CANCELLATION') {
    // Dois casos com o MESMO nome de evento:
    //  - o usuário desligou a renovação: o acesso continua até `expiration_at_ms`
    //    e o EXPIRATION chega no fim do ciclo (doc "event flows"). Nada a fazer.
    //  - reembolso (`cancel_reason` CUSTOMER_SUPPORT) ou vigência já no passado:
    //    o acesso termina AGORA.
    const reembolso = evento.cancel_reason === 'CUSTOMER_SUPPORT';
    const jaVenceu = !!expira && Date.parse(expira) <= agora;
    if (!reembolso && !jaVenceu) return { acao: 'registrar', motivo: 'renovacao_desligada' };
    return { acao: 'encerrar', userId, transacaoId, vigenciaAte: jaVenceu ? expira : agoraIso, eventoEm };
  }

  if (tipo === 'EXPIRATION') {
    // "The associated user's access should be removed." Vigência = o fim informado,
    // nunca no futuro (um EXPIRATION não pode ESTENDER nada).
    const fim = expira && Date.parse(expira) <= agora ? expira : agoraIso;
    return { acao: 'encerrar', userId, transacaoId, vigenciaAte: fim, eventoEm };
  }

  // BILLING_ISSUE: a cobrança falhou, mas na Play há PERÍODO DE CARÊNCIA em que o
  // usuário mantém o acesso enquanto o Google tenta de novo. Estende a vigência até
  // o fim da carência (status segue 'active': 'past_due' derrubaria o acesso que o
  // Google manda manter). Falhando de vez, chega EXPIRATION; pagando, RENEWAL.
  const carencia = msParaIso(evento.grace_period_expiration_at_ms);
  if (!carencia || Date.parse(carencia) <= agora) return { acao: 'registrar', motivo: 'cobranca_falhou_sem_carencia' };
  return { acao: 'carencia', userId, transacaoId, vigenciaAte: carencia, eventoEm };
}

// ─── Supabase (service role) ─────────────────────────────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

const COLUNAS =
  'user_id,plano,status,current_period_end,revenuecat_transacao_id,revenuecat_vigencia_ate,revenuecat_evento_em';

/**
 * Lê a linha do usuário. 3 estados: `null` (não tem linha), a linha, ou
 * `{ erro: true }`. Coluna ausente (migration 20260930120000 não aplicada) cai em
 * erro de propósito: sem as colunas de vínculo não há como decidir com segurança,
 * então o webhook responde 5xx e o RevenueCat reenvia depois da migration.
 */
async function lerAssinatura(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}&select=${COLUNAS}&limit=1`,
      { headers: sbHeaders(env, { Accept: 'application/json' }) },
    );
    if (!r.ok) {
      if (r.status === 400) console.error('[olli-revenuecat] leitura recusada (400) — migration das colunas revenuecat_* aplicada?');
      return { erro: true };
    }
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { erro: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { erro: true };
  }
}

/** Upsert (linha nova ou existente) — só usado para CONCEDER, que tem plano e status. */
async function gravarConcessao(env, userId, patch) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/assinaturas?on_conflict=user_id`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ user_id: userId, ...patch, atualizado_em: new Date().toISOString() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * UPDATE condicionado ao vínculo: só altera a linha deste usuário SE ela ainda
 * aponta para a mesma transação da Play. Se outra concessão trocou o vínculo entre
 * a leitura e esta escrita, nada é alterado (e nada de errado é encerrado).
 */
async function atualizarVinculada(env, userId, transacaoId, patch) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}` +
        `&revenuecat_transacao_id=eq.${encodeURIComponent(transacaoId)}`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ ...patch, atualizado_em: new Date().toISOString() }),
      },
    );
    return r.ok;
  } catch {
    return false;
  }
}

function ativa(linha, agora) {
  const fim = ms(linha?.current_period_end);
  return !!linha && !!linha.status && !STATUS_ENCERRADOS.includes(linha.status) && fim != null && fim > agora;
}

/**
 * A vigência da linha é a que a PRÓPRIA Play deu? (e não uma maior, de Stripe/Pix)
 * Sem `revenuecat_vigencia_ate` a linha nunca foi da Play.
 */
function sustentadaPelaPlay(linha) {
  const daPlay = ms(linha?.revenuecat_vigencia_ate);
  if (daPlay == null || !linha.revenuecat_transacao_id) return false;
  const gravada = ms(linha.current_period_end);
  return gravada == null || gravada <= daPlay + FOLGA_MS;
}

/** Evento mais velho que o último aplicado nesta linha? */
function foraDeOrdem(linha, eventoEm) {
  const ultimo = ms(linha?.revenuecat_evento_em);
  return ultimo != null && Date.parse(eventoEm) < ultimo;
}

/**
 * Aplica a decisão no banco. Devolve `{ http, corpo, marca }` — `marca` é o status
 * a registrar em `webhook_events` ('processado' | 'falhou').
 */
export async function aplicarDecisao(env, d, { agora = Date.now() } = {}) {
  if (d.acao === 'ignorar' || d.acao === 'registrar') {
    return { http: 200, corpo: { ok: true, acao: d.acao, motivo: d.motivo }, marca: 'processado' };
  }
  if (d.acao === 'alarme') {
    // 200 de propósito: reenviar não conserta configuração errada. O sinal é o log
    // (e o 'falhou' em webhook_events, para reconciliar) — nunca um 200 mudo.
    console.error('[olli-revenuecat] ALARME: evento não aplicado —', d.motivo);
    return { http: 200, corpo: { ok: true, acao: 'alarme', motivo: d.motivo }, marca: 'falhou', erro: d.motivo };
  }

  const atual = await lerAssinatura(env, d.userId);
  if (atual?.erro) return { http: 503, corpo: { erro: 'indisponivel' }, marca: 'falhou', erro: 'leitura' };
  if (atual && foraDeOrdem(atual, d.eventoEm)) {
    return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'fora_de_ordem' }, marca: 'processado' };
  }

  if (d.acao === 'conceder') {
    let plano = d.plano;
    let status = d.status;
    let vigencia = d.vigenciaAte;
    // Regra 1: plano vigente sustentado por OUTRA origem → o cliente fica com o
    // maior nível e a maior vigência. Se a linha é da própria Play (renovação,
    // troca de produto), vale o que a loja diz agora — inclusive um downgrade.
    if (atual && ativa(atual, agora) && !sustentadaPelaPlay(atual)) {
      if ((NIVEL_PLANO[atual.plano] || 0) > (NIVEL_PLANO[plano] || 0)) plano = atual.plano;
      if ((ms(atual.current_period_end) || 0) > Date.parse(vigencia)) vigencia = atual.current_period_end;
      if (atual.status === 'active') status = 'active';
    }
    const ok = await gravarConcessao(env, d.userId, {
      plano,
      status,
      current_period_end: vigencia,
      revenuecat_transacao_id: d.transacaoId,
      revenuecat_produto_id: d.produtoId,
      revenuecat_vigencia_ate: d.vigenciaAte,
      revenuecat_evento_em: d.eventoEm,
    });
    if (!ok) return { http: 500, corpo: { erro: 'falha_persistencia' }, marca: 'falhou', erro: 'gravacao' };
    return { http: 200, corpo: { ok: true, acao: 'conceder' }, marca: 'processado' };
  }

  // encerrar / carencia: exigem PROVA DE VÍNCULO (regra 2).
  if (!atual) return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'sem_assinatura' }, marca: 'processado' };
  if (atual.revenuecat_transacao_id !== d.transacaoId) {
    return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'sem_vinculo' }, marca: 'processado' };
  }

  let patch;
  if (!sustentadaPelaPlay(atual)) {
    // Outra origem paga sustenta uma vigência MAIOR: a Play sai de cena (o registro
    // dela é atualizado) sem encurtar nem derrubar o que foi pago por fora.
    patch = { revenuecat_vigencia_ate: d.vigenciaAte, revenuecat_evento_em: d.eventoEm };
  } else if (d.acao === 'carencia') {
    // Só ESTENDE: carência nunca encurta uma vigência já maior.
    if ((ms(atual.current_period_end) || 0) >= Date.parse(d.vigenciaAte)) {
      patch = { revenuecat_evento_em: d.eventoEm };
    } else {
      patch = { current_period_end: d.vigenciaAte, revenuecat_vigencia_ate: d.vigenciaAte, revenuecat_evento_em: d.eventoEm };
    }
  } else {
    patch = {
      status: 'canceled',
      current_period_end: d.vigenciaAte,
      revenuecat_vigencia_ate: d.vigenciaAte,
      revenuecat_evento_em: d.eventoEm,
    };
  }
  const ok = await atualizarVinculada(env, d.userId, d.transacaoId, patch);
  if (!ok) return { http: 500, corpo: { erro: 'falha_persistencia' }, marca: 'falhou', erro: 'gravacao' };
  return { http: 200, corpo: { ok: true, acao: d.acao }, marca: 'processado' };
}

/**
 * O que fica guardado do evento em `webhook_events.payload`: só o necessário para
 * reconciliar. O evento do RevenueCat pode trazer `subscriber_attributes` (e-mail,
 * telefone) e preço/país — dado pessoal que esta trilha não precisa (LGPD).
 */
function payloadMinimo(ev) {
  const pick = (k) => (ev && ev[k] !== undefined ? ev[k] : null);
  return {
    type: pick('type'),
    store: pick('store'),
    environment: pick('environment'),
    app_user_id: pick('app_user_id'),
    product_id: pick('product_id'),
    period_type: pick('period_type'),
    original_transaction_id: pick('original_transaction_id'),
    expiration_at_ms: pick('expiration_at_ms'),
    grace_period_expiration_at_ms: pick('grace_period_expiration_at_ms'),
    cancel_reason: pick('cancel_reason'),
    expiration_reason: pick('expiration_reason'),
    event_timestamp_ms: pick('event_timestamp_ms'),
  };
}

// ─── POST /revenuecat/webhook ────────────────────────────────
async function webhook(request, env) {
  // Teto por IP ANTES do segredo (mesmo desenho do /abacate/webhook): barra quem
  // tenta adivinhar o Authorization. Não é fail-closed: limitador fora não pode
  // derrubar webhook de dinheiro, e 429 só faz o RevenueCat reenviar.
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  if (!deixaPassar(await checarLimite(env.RCHOOK_RL, `rchook:${ip}`), { sensivel: false })) {
    return json({ erro: 'muitas_requisicoes' }, 429);
  }

  const segredo = segredoWebhook(env);
  if (!segredo) return json({ erro: 'revenuecat_desligado' }, 503);
  if (!compararConstante(request.headers.get('Authorization') || '', `Bearer ${segredo}`)) {
    return json({ erro: 'nao_autorizado' }, 401);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ erro: 'indisponivel' }, 503);

  // Teto de payload ANTES de bufferizar (evento real: poucos KB).
  if (!cabeNoTeto(request, TETO.WEBHOOK).ok) return json({ erro: 'payload_grande' }, 413);
  const bruto = await request.text();
  if (!textoCabeNoTeto(bruto, TETO.WEBHOOK)) return json({ erro: 'payload_grande' }, 413);

  let corpo;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return json({ erro: 'payload_invalido' }, 400);
  }
  const evento = corpo && typeof corpo === 'object' ? corpo.event : null;
  const decisao = traduzirEventoRevenueCat(evento, { aceitarSandbox: env.REVENUECAT_ACEITAR_SANDBOX === 'true' });
  if (decisao.acao === 'invalido') return json({ erro: 'payload_invalido' }, 400);

  const eventId = typeof evento.id === 'string' && evento.id ? evento.id : '';
  if (!eventId) return json({ erro: 'payload_invalido' }, 400);

  const reiv = await reivindicarEvento(env, { origem: ORIGEM, eventId, tipo: evento.type, payload: payloadMinimo(evento) });
  if (!reiv.ok) return json({ erro: 'indisponivel' }, 503); // não sei se é novo → reenvie
  if (reiv.duplicado) return json({ ok: true, duplicado: true });

  let r;
  try {
    r = await aplicarDecisao(env, decisao);
  } catch (e) {
    capturarExcecao(e, { origem: 'webhook', rota: '/revenuecat/webhook' });
    await marcarEvento(env, { origem: ORIGEM, eventId, status: 'falhou', erro: 'excecao' });
    return json({ erro: 'falha_interna' }, 500);
  }
  await marcarEvento(env, { origem: ORIGEM, eventId, status: r.marca, erro: r.erro });
  return json(r.corpo, r.http);
}

// ─── roteador /revenuecat/* ──────────────────────────────────
export async function handleRevenueCat(request, env, url) {
  const p = url.pathname;
  if (p === '/revenuecat/webhook' && request.method === 'POST') return webhook(request, env);
  if (REVENUECAT_ROUTES.has(p)) return json({ erro: 'metodo_nao_suportado' }, 405);
  return json({ erro: 'nao_encontrado' }, 404);
}
