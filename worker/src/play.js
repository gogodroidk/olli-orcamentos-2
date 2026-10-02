/**
 * ASSINATURA PELA GOOGLE PLAY — Play Billing DIRETO, sem RevenueCat (worker, SEM SDK).
 *
 *   GET  /play/config    → { ok, ligado } — o app só oferece "Assinar" com ligado=true
 *   POST /play/verificar → JWT do Supabase + { purchaseToken, produtoId } →
 *                          consulta a Play → public.play_compras + public.assinaturas
 *   processarRtdn(env)   → cron de minuto: PULL da assinatura Pub/Sub do RTDN
 *   reconciliarPlay(env) → cron de minuto, em horários fixos: rede de segurança
 *   cancelarPlayDoUsuario(env, userId) → exclusão de conta (conta.js/admin.js)
 *
 * O app NUNCA libera plano sozinho: a verdade é `assinaturas`, gravada aqui com
 * SERVICE_ROLE. O que o app manda é só um AVISO ("comprei, confira este token");
 * o estado vem SEMPRE da Google Play Developer API (`purchases.subscriptionsv2.get`).
 * O mesmo vale para o RTDN: a notificação diz que ALGO mudou, quem diz o quê é a API
 * — por isso a ordem de chegada das notificações não importa.
 *
 * ═══ KILL SWITCH (servidor) ═══
 * `PLAY_BILLING_MODE` = 'on' | 'off' (var pública do wrangler). Com 'off', ou sem a
 * credencial `PLAY_SA_JSON`, `/play/config` diz `ligado:false` e `/play/verificar`
 * responde 503 `play_desligado` — o app diz que a venda está indisponível. Nunca
 * modo demo. O RTDN e a reconciliação rodam com a credencial presente MESMO com a
 * venda desligada: quem já pagou continua tendo o estado verdadeiro (renovação,
 * cancelamento, estorno) — desligar a vitrine não pode congelar quem está dentro.
 *
 * ═══ QUEM É O DONO DA COMPRA (fail-closed) ═══
 *  - `obfuscatedExternalAccountId` = SHA-256 em hex do `user.id` (decisão C3), que o
 *    app passa ao `requestPurchase`. O worker exige igualdade com o hash do usuário
 *    do JWT. Diferente = 403, e nada é gravado.
 *  - Sem esse campo (reassinatura feita na Play Store, fora do app), só aceita se a
 *    CADEIA já é do usuário: `outOfAppPurchaseContext.expiredPurchaseToken` ou
 *    `linkedPurchaseToken` gravados em `play_compras` para ele.
 *  - Anti-replay: `play_compras.token_sha256` é ÚNICO. Token já ligado a outra conta
 *    = 409 `compra_de_outra_conta` + ALARME. Nunca transfere.
 *  - Compra de teste (`testPurchase`, licença de teste — vale até no app de produção)
 *    só libera para os user_ids de `PLAY_TESTE_PERMITIDOS` (secret).
 *  - Produto fora do catálogo único (`src/services/playBillingRegras.ts`:
 *    olli_pro/olli_empresa × mensal/anual) não libera nada.
 *
 * ═══ ORDEM ═══  estado → decisão → `play_compras` → `assinaturas` → acknowledge.
 * Se a gravação falhar, NÃO reconhece: sem acknowledge em 3 dias a Play estorna
 * sozinha — melhor devolver o dinheiro do que cobrar sem entregar. A reconciliação
 * reconhece depois o que ficou gravado e pendente.
 *
 * ═══ CONVIVÊNCIA COM STRIPE E PIX ═══ (núcleo herdado do antigo revenuecat.js)
 *  1. CONCEDER sobre plano vigente de OUTRA origem preserva o maior nível e a maior
 *     vigência. As colunas `stripe_*` e `mp_*` nunca são tocadas aqui.
 *  2. ENCERRAR só age com PROVA DE VÍNCULO: `revenuecat_transacao_id` tem de ser o
 *     `token_sha256` desta compra. Se a vigência gravada é maior que a da Play, quem
 *     sustenta o plano é outra origem — a Play sai de cena sem derrubar nada.
 *  3. FORA DE ORDEM: `revenuecat_evento_em` guarda a hora da leitura aplicada; uma
 *     leitura mais velha não desfaz uma mais nova.
 * As colunas continuam com o nome `revenuecat_*` (decisão C4): o app e o painel web
 * já as leem. Renomear é migration futura, com compatibilidade.
 *
 * ═══ ERRO NUNCA VIRA VAZIO ═══
 * Google fora, banco fora, KV fora: a rota responde 503 e o cron tenta de novo.
 * Erro da API NUNCA rebaixa plano — a linha fica como estava e o plano vence
 * sozinho na própria vigência (`current_period_end`) se ninguém renovar.
 *
 * LOG: nunca o purchaseToken nem o access token. Só os 12 primeiros caracteres do
 * SHA-256 do token (R16).
 */
import { capturarExcecao } from '../../src/services/sentryCaptura.ts';
import { produtoPlay } from '../../src/services/playBillingRegras.ts';
import { credencialPlay, sha256Hex, tokenGoogle } from './googleAuth.js';
import { cabeNoTeto, rateOkSensivel, textoCabeNoTeto } from './rateLimit.js';
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

export const PLAY_ROUTES = new Set(['/play/config', '/play/verificar']);

/** Origens em `webhook_events` (texto livre; não exige migration). */
const ORIGEM_RTDN = 'play_rtdn';
const ORIGEM_ANULADA = 'play_voided';

const API_PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const API_PUBSUB = 'https://pubsub.googleapis.com/v1';

/** Teto de espera por resposta do Google (Play Developer API e Pub/Sub). */
const TIMEOUT_GOOGLE_MS = 15 * 1000;

/** Corpo do /play/verificar: token (até 4 KB) + produto. 8 KB é folga (R5). */
const TETO_VERIFICAR = 8 * 1024;

/** Formato do purchaseToken aceito (R5). Fora disso nem vai ao Google. */
const TOKEN_RE = /^[A-Za-z0-9._-]{20,4096}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mesma escala de stripe.js/mercadopago.js: compara NÍVEL de acesso, não preço. */
const NIVEL_PLANO = { gratis: 0, pro: 1, empresa: 2 };

/** Status que já não sustentam acesso (mesma lista de concederPlanoPeriodo). */
const STATUS_ENCERRADOS = ['canceled', 'unpaid', 'incomplete_expired'];

/** Folga para comparar vigências gravadas em momentos diferentes. */
const FOLGA_MS = 60 * 1000;
const HORA_MS = 3600 * 1000;
const DIA_MS = 24 * HORA_MS;

export const ESTADO = Object.freeze({
  ATIVA: 'SUBSCRIPTION_STATE_ACTIVE',
  CARENCIA: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  CANCELADA: 'SUBSCRIPTION_STATE_CANCELED',
  SUSPENSA: 'SUBSCRIPTION_STATE_ON_HOLD',
  PAUSADA: 'SUBSCRIPTION_STATE_PAUSED',
  PENDENTE: 'SUBSCRIPTION_STATE_PENDING',
  EXPIRADA: 'SUBSCRIPTION_STATE_EXPIRED',
  PENDENTE_CANCELADA: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
});

/**
 * Estado PRÓPRIO do OLLI (não vem do Google) para token que a Play já não devolve
 * (404/410: dados expurgados ~60 dias depois de expirar). Só é gravado quando a
 * vigência já passou — então não rebaixa nada que valia.
 */
const TOKEN_INDISPONIVEL = 'TOKEN_INDISPONIVEL';

/** Estados em que não há mais nada a acompanhar nem a cancelar. */
const ESTADOS_FINAIS = new Set([ESTADO.EXPIRADA, ESTADO.PENDENTE_CANCELADA, TOKEN_INDISPONIVEL]);

/** Estados que a reconciliação acompanha de perto, vença quando vencer. */
const ESTADOS_SENSIVEIS = [ESTADO.CARENCIA, ESTADO.SUSPENSA, ESTADO.PAUSADA, ESTADO.PENDENTE];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

const curto = (hash) => String(hash || '').slice(0, 12);

function iso(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ms(valor) {
  const t = valor ? Date.parse(valor) : Number.NaN;
  return Number.isNaN(t) ? null : t;
}

// ─── configuração ────────────────────────────────────────────

/** Nome do pacote (var `PLAY_PACKAGE_NAME`) ou '' quando ausente/estranho. */
function pacote(env) {
  const p = typeof env?.PLAY_PACKAGE_NAME === 'string' ? env.PLAY_PACKAGE_NAME.trim() : '';
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(p) ? p : '';
}

/** Assinatura PULL do RTDN (`projects/<p>/subscriptions/<s>`) ou '' (RTDN desligado). */
function assinaturaPubSub(env) {
  const s = typeof env?.PLAY_PUBSUB_SUBSCRIPTION === 'string' ? env.PLAY_PUBSUB_SUBSCRIPTION.trim() : '';
  return /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/subscriptions\/[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/.test(s) ? s : '';
}

/** Credencial + pacote + banco. Sem qualquer um deles nada da Play roda. */
function configurado(env) {
  return !!credencialPlay(env) && !!pacote(env) && !!env?.SUPABASE_URL && !!env?.SUPABASE_SERVICE_ROLE_KEY;
}

/** A VENDA está ligada? (kill switch do servidor + configuração completa) */
export function playLigado(env) {
  return env?.PLAY_BILLING_MODE === 'on' && configurado(env);
}

/** user_ids autorizados a compra de teste (licença de teste da Play). */
function testadoresPermitidos(env) {
  const bruto = typeof env?.PLAY_TESTE_PERMITIDOS === 'string' ? env.PLAY_TESTE_PERMITIDOS : '';
  return new Set(bruto.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => UUID.test(s)));
}

// ─── auth do usuário (mesmo padrão de abacate.js/mercadopago.js) ──
/** Valida o JWT do Supabase em /auth/v1/user, SEM cache (R4). user ou null. */
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && typeof u.id === 'string' && UUID.test(u.id) ? u : null;
  } catch {
    return null;
  }
}

// ─── Google Play Developer API / Pub/Sub ─────────────────────

/**
 * Chamada autenticada ao Google. Estados:
 *   { status:'ok', dados }      → 2xx
 *   { status:'nao_encontrado' } → 404/410 (token que a Play não conhece ou já expurgou)
 *   { status:'recusado' }       → 400 (token malformado para o Google)
 *   { status:'erro', motivo }   → 401/403/429/5xx/rede/credencial — NÃO SEI
 */
async function chamarGoogle(env, url, { metodo = 'GET', corpo } = {}) {
  const t = await tokenGoogle(env);
  if (!t.ok) return { status: 'erro', motivo: t.motivo };
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${t.token}`,
        Accept: 'application/json',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      // Google pendurado não pode prender a rota nem o cron: vira "não sei".
      ...(typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(TIMEOUT_GOOGLE_MS) } : {}),
    });
  } catch {
    return { status: 'erro', motivo: 'rede' };
  }
  if (r.ok) {
    const texto = await r.text().catch(() => '');
    if (!texto) return { status: 'ok', dados: {} };
    try {
      return { status: 'ok', dados: JSON.parse(texto) };
    } catch {
      return { status: 'erro', motivo: 'resposta_invalida' };
    }
  }
  if (r.status === 404 || r.status === 410) return { status: 'nao_encontrado' };
  if (r.status === 400) return { status: 'recusado' };
  return { status: 'erro', motivo: `google_${r.status}` };
}

function urlCompra(env, token) {
  return `${API_PLAY}/${encodeURIComponent(pacote(env))}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
}

/** `purchases.subscriptionsv2.get` — a ÚNICA fonte do estado da assinatura. */
function lerAssinaturaPlay(env, token) {
  return chamarGoogle(env, urlCompra(env, token));
}

/**
 * Reconhece a compra. Não existe acknowledge na v2: o método segue sendo o
 * `purchases.subscriptions.acknowledge` (não depreciado). Corpo `{}`.
 */
async function reconhecerNaPlay(env, productId, token) {
  const url =
    `${API_PLAY}/${encodeURIComponent(pacote(env))}/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
  const r = await chamarGoogle(env, url, { metodo: 'POST', corpo: {} });
  return r.status === 'ok';
}

/**
 * `purchases.subscriptionsv2.cancel` (referência oficial conferida em 02/10/2026:
 * POST …/subscriptionsv2/tokens/{token}:cancel, corpo
 * `{cancellationContext:{cancellationType}}`). `USER_REQUESTED_STOP_RENEWALS` =
 * "para a próxima renovação" — é o que o usuário pediu ao excluir a conta.
 */
function cancelarNaPlay(env, token) {
  return chamarGoogle(env, `${urlCompra(env, token)}:cancel`, {
    metodo: 'POST',
    corpo: { cancellationContext: { cancellationType: 'USER_REQUESTED_STOP_RENEWALS' } },
  });
}

// ─── regras PURAS (o teste exercita sem rede) ────────────────

/**
 * Item da assinatura que manda, conferido contra o catálogo único. Produto
 * desconhecido em QUALQUER item = nada libera (um item estranho é sinal de que o
 * catálogo do app e o da Play divergiram — alarme, não "aproveita o que conhece").
 * Formato do id lógico: `${productId}:${basePlanId}` (mesmo de `idProdutoPlay`).
 */
export function itemDoCatalogo(sub) {
  const itens = Array.isArray(sub?.lineItems) ? sub.lineItems : [];
  if (!itens.length) return { ok: false, motivo: 'sem_itens' };
  let melhor = null;
  for (const item of itens) {
    const productId = typeof item?.productId === 'string' ? item.productId : '';
    const basePlanId = typeof item?.offerDetails?.basePlanId === 'string' ? item.offerDetails.basePlanId : '';
    const produtoId = `${productId}:${basePlanId}`;
    const produto = produtoPlay(produtoId);
    if (!produto || !produto.periodoConhecido) return { ok: false, motivo: 'produto_desconhecido' };
    const expira = ms(item.expiryTime);
    const candidato = { item, productId, produtoId, produto, expiraMs: expira };
    if (
      !melhor ||
      (expira ?? -1) > (melhor.expiraMs ?? -1) ||
      ((expira ?? -1) === (melhor.expiraMs ?? -1) && NIVEL_PLANO[produto.plano] > NIVEL_PLANO[melhor.produto.plano])
    ) {
      melhor = candidato;
    }
  }
  return { ok: true, ...melhor, expiraIso: melhor.expiraMs != null ? iso(melhor.expiraMs) : null };
}

/**
 * Traduz o ESTADO atual da assinatura (resposta de subscriptionsv2.get) numa
 * DECISÃO, sem banco nem rede. `transacaoId` = SHA-256 do purchaseToken (prova de
 * vínculo gravada em `revenuecat_transacao_id`). `agora` (vigências) e `lidoEm`
 * (hora da leitura, para a regra de fora de ordem) injetáveis para o teste.
 *
 * Decisões (as mesmas que `aplicarDecisao` entende):
 *  - { acao:'invalido' }
 *  - { acao:'registrar', motivo }   → nada a fazer no plano
 *  - { acao:'alarme', motivo }      → não aplica; alguém precisa olhar
 *  - { acao:'conceder', userId, plano, status, vigenciaAte, transacaoId, produtoId, eventoEm }
 *  - { acao:'encerrar', userId, transacaoId, vigenciaAte, eventoEm }
 *
 * Tabela (fail-closed; o Google manda manter acesso na carência e tirar na
 * suspensão e na pausa):
 *   ACTIVE / IN_GRACE_PERIOD / CANCELED com expiryTime futuro → conceder até expiryTime
 *   CANCELED com expiryTime passado                          → encerrar
 *   ON_HOLD / PAUSED / EXPIRED / PENDING_PURCHASE_CANCELED   → encerrar (vigência ≤ agora)
 *   PENDING                                                  → registrar (não libera)
 *   qualquer outro (inclusive UNSPECIFIED)                   → alarme
 */
export function traduzirAssinaturaPlay(sub, { userId, transacaoId, agora = Date.now(), lidoEm = agora } = {}) {
  if (!sub || typeof sub !== 'object' || typeof sub.subscriptionState !== 'string') return { acao: 'invalido' };
  const cat = itemDoCatalogo(sub);
  if (!cat.ok) return { acao: 'alarme', motivo: cat.motivo };
  const estado = sub.subscriptionState;
  // Ordem entre leituras = relógio REAL da leitura (não o horário agendado do
  // cron): é ele que diz qual resposta da Play é a mais nova.
  const eventoEm = iso(lidoEm);
  const agoraIso = iso(agora);
  const expira = cat.expiraIso;

  if (estado === ESTADO.ATIVA || estado === ESTADO.CARENCIA || estado === ESTADO.CANCELADA) {
    // Sem vigência a loja não disse até quando vale: não inventamos.
    if (!expira) return { acao: 'alarme', motivo: 'sem_expiracao' };
    if (cat.expiraMs <= agora) {
      // Cancelada e vencida = fim de verdade. Ativa/carência com data no passado é
      // leitura defasada (renovação a caminho): não decide nada — erro de dado
      // nunca rebaixa plano.
      if (estado === ESTADO.CANCELADA) return { acao: 'encerrar', userId, transacaoId, vigenciaAte: expira, eventoEm };
      return { acao: 'registrar', motivo: 'ja_expirado' };
    }
    return {
      acao: 'conceder',
      userId,
      plano: cat.produto.plano,
      status: 'active',
      vigenciaAte: expira,
      transacaoId,
      produtoId: cat.produtoId,
      eventoEm,
    };
  }

  if (
    estado === ESTADO.SUSPENSA ||
    estado === ESTADO.PAUSADA ||
    estado === ESTADO.EXPIRADA ||
    estado === ESTADO.PENDENTE_CANCELADA
  ) {
    // Um encerramento nunca ESTENDE nada: vigência = a da loja se já passou, senão agora.
    const fim = expira && cat.expiraMs <= agora ? expira : agoraIso;
    return { acao: 'encerrar', userId, transacaoId, vigenciaAte: fim, eventoEm };
  }

  if (estado === ESTADO.PENDENTE) return { acao: 'registrar', motivo: 'pagamento_pendente' };
  return { acao: 'alarme', motivo: 'estado_desconhecido' };
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

const COLUNAS_COMPRA =
  'user_id,token_sha256,purchase_token,produto_id,estado,expiry,linked_token_sha256,ack,teste,verificado_em';

/**
 * Linha de `assinaturas` do usuário. 3 estados: `null` (não tem), a linha, ou
 * `{ erro: true }`. Coluna ausente (400) cai em erro de propósito: sem as colunas
 * de vínculo não há como decidir com segurança.
 */
async function lerAssinatura(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}&select=${COLUNAS}&limit=1`,
      { headers: sbHeaders(env, { Accept: 'application/json' }) },
    );
    if (!r.ok) {
      if (r.status === 400) console.error('[olli-play] leitura recusada (400) — migration das colunas revenuecat_* aplicada?');
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
 * UPDATE condicionado ao vínculo: só altera a linha SE ela ainda aponta para a
 * mesma compra da Play. Se outra concessão trocou o vínculo entre a leitura e esta
 * escrita, nada é alterado (e nada de errado é encerrado).
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

/** A vigência da linha é a que a PRÓPRIA Play deu? (e não uma maior, de Stripe/Pix) */
function sustentadaPelaPlay(linha) {
  const daPlay = ms(linha?.revenuecat_vigencia_ate);
  if (daPlay == null || !linha.revenuecat_transacao_id) return false;
  const gravada = ms(linha.current_period_end);
  return gravada == null || gravada <= daPlay + FOLGA_MS;
}

/** Leitura mais velha que a última aplicada nesta linha? */
function foraDeOrdem(linha, eventoEm) {
  const ultimo = ms(linha?.revenuecat_evento_em);
  return ultimo != null && Date.parse(eventoEm) < ultimo;
}

/**
 * Aplica a decisão em `assinaturas`. Devolve `{ http, corpo, marca, erro? }` —
 * `marca` é o status para `webhook_events` ('processado' | 'falhou').
 * Movida de revenuecat.js sem mudar as garantias (convivência, vínculo, ordem).
 */
export async function aplicarDecisao(env, d, { agora = Date.now() } = {}) {
  if (d.acao === 'ignorar' || d.acao === 'registrar') {
    return { http: 200, corpo: { ok: true, acao: d.acao, motivo: d.motivo }, marca: 'processado' };
  }
  if (d.acao === 'alarme') {
    console.error('[olli-play] ALARME: decisão não aplicada —', d.motivo);
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

  // encerrar: exige PROVA DE VÍNCULO (regra 2).
  if (!atual) return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'sem_assinatura' }, marca: 'processado' };
  if (atual.revenuecat_transacao_id !== d.transacaoId) {
    return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'sem_vinculo' }, marca: 'processado' };
  }

  let patch;
  if (!sustentadaPelaPlay(atual)) {
    // Outra origem paga sustenta uma vigência MAIOR: a Play sai de cena (o registro
    // dela é atualizado) sem encurtar nem derrubar o que foi pago por fora.
    patch = { revenuecat_vigencia_ate: d.vigenciaAte, revenuecat_evento_em: d.eventoEm };
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

// ─── play_compras ────────────────────────────────────────────

/** Compra pelo hash do token. `null` (não existe), a linha, ou `{ erro: true }`. */
async function lerCompra(env, tokenHash) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/play_compras?token_sha256=eq.${encodeURIComponent(tokenHash)}&select=${COLUNAS_COMPRA}&limit=1`,
      { headers: sbHeaders(env, { Accept: 'application/json' }) },
    );
    if (!r.ok) return { erro: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { erro: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { erro: true };
  }
}

/** INSERT puro (sem upsert): o índice ÚNICO é quem decide quem chegou primeiro. */
async function inserirCompra(env, registro) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/play_compras`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(registro),
    });
    if (r.ok) return 'ok';
    if (r.status === 409) return 'conflito';
    return 'erro';
  } catch {
    return 'erro';
  }
}

/**
 * UPDATE só da linha deste token E deste dono. `return=representation` para saber
 * se alguma linha casou — 204 com zero linhas não é "gravei".
 */
async function atualizarCompra(env, tokenHash, userId, patch) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/play_compras?token_sha256=eq.${encodeURIComponent(tokenHash)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ ...patch, atualizado_em: new Date().toISOString() }),
      },
    );
    if (!r.ok) return false;
    const arr = await r.json().catch(() => null);
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

/**
 * Dono da CADEIA de uma compra nova: o token anterior (troca de plano =
 * `linkedPurchaseToken`; reassinatura pela Play Store = `outOfAppPurchaseContext.
 * expiredPurchaseToken`) já gravado para alguém. `null` = ninguém; `{erro}` = não sei.
 */
async function donoPorCadeia(env, sub) {
  const candidatos = [sub?.linkedPurchaseToken, sub?.outOfAppPurchaseContext?.expiredPurchaseToken].filter(
    (t) => typeof t === 'string' && TOKEN_RE.test(t),
  );
  for (const anterior of candidatos) {
    const linha = await lerCompra(env, await sha256Hex(anterior));
    if (linha?.erro) return { erro: true };
    if (linha) return { userId: linha.user_id };
  }
  return null;
}

// ─── o coração: sincroniza UM token com a verdade da Play ────

function falha(http, erro, { retentar = false } = {}) {
  return { http, corpo: { ok: false, erro }, retentar };
}

function semEfeito(motivo, { alarme = false } = {}) {
  if (alarme) console.error('[olli-play] ALARME:', motivo);
  return { http: 200, corpo: { ok: true, acao: alarme ? 'alarme' : 'registrar', motivo }, retentar: false, alarme };
}

/** O que o app precisa saber da compra, sem jargão do Google. */
function estadoParaApp(d) {
  if (d.acao === 'conceder') return 'ativo';
  if (d.acao === 'encerrar') return 'encerrado';
  if (d.motivo === 'pagamento_pendente') return 'pendente';
  return 'sem_efeito';
}

/**
 * Lê o estado REAL do token na Play e aplica. Usado pela rota (chamadorId = o
 * usuário do JWT), pelo RTDN e pela reconciliação (chamadorId = null).
 *
 * Retorna `{ http, corpo, retentar }`. `retentar:true` = "não sei agora" (Google ou
 * banco fora): a rota responde 5xx e o RTDN NÃO dá ack (o Pub/Sub reentrega).
 */
export async function sincronizarCompra(env, { token, chamadorId = null, produtoAlegado = null, agora = Date.now() }) {
  const tokenHash = await sha256Hex(token);
  const agoraIso = iso(agora);

  const linha = await lerCompra(env, tokenHash);
  if (linha?.erro) return falha(503, 'indisponivel', { retentar: true });

  // Token já ligado a OUTRA conta: nunca concede, nunca transfere (R7).
  if (linha && chamadorId && linha.user_id !== chamadorId) {
    console.error('[olli-play] ALARME: token já ligado a outra conta —', curto(tokenHash));
    return falha(409, 'compra_de_outra_conta');
  }

  const g = await lerAssinaturaPlay(env, token);
  if (g.status === 'erro') {
    console.error('[olli-play] Google indisponível —', g.motivo, curto(tokenHash));
    return falha(503, 'google_indisponivel', { retentar: true });
  }
  if (g.status !== 'ok') {
    // A Play não conhece o token (ou já expurgou: ~60 dias depois de expirar).
    if (chamadorId) return falha(422, 'compra_nao_encontrada');
    // Só marca como final se a vigência JÁ passou — não rebaixa nada que valia.
    const fim = linha ? ms(linha.expiry) : null;
    const venceu = fim != null && fim <= agora;
    if (linha) {
      await atualizarCompra(env, tokenHash, linha.user_id, {
        verificado_em: agoraIso,
        ...(venceu ? { estado: TOKEN_INDISPONIVEL } : {}),
      });
    }
    // Token que valia e sumiu da Play é estranho: alarme (o plano NÃO é mexido).
    return semEfeito('token_indisponivel', { alarme: !!linha && !venceu });
  }
  const sub = g.dados || {};
  const lidoEm = Date.now();

  // ── dono ──
  let dono = linha ? linha.user_id : chamadorId;
  let cadeia;
  if (!dono) {
    // RTDN/reconciliação de token que ninguém registrou ainda: só tem dono se a
    // cadeia (troca de plano, reassinatura) já é de alguém. Senão o app registra
    // pelo /play/verificar — e sem registro não há acknowledge: a Play estorna.
    cadeia = await donoPorCadeia(env, sub);
    if (cadeia?.erro) return falha(503, 'indisponivel', { retentar: true });
    if (!cadeia) return semEfeito('aguardando_app');
    dono = cadeia.userId;
  }
  const hashDono = await sha256Hex(dono);

  // ── a compra é desta conta? ──
  const contaObf = String(sub.externalAccountIdentifiers?.obfuscatedExternalAccountId || '').toLowerCase();
  if (contaObf) {
    if (contaObf !== hashDono) {
      console.error('[olli-play] ALARME: obfuscatedAccountId não confere —', curto(tokenHash));
      return chamadorId ? falha(403, 'conta_diferente') : semEfeito('conta_diferente', { alarme: true });
    }
  } else if (!linha) {
    // Sem a marca da conta (reassinatura feita na Play Store): só a cadeia prova.
    if (cadeia === undefined) cadeia = await donoPorCadeia(env, sub);
    if (cadeia?.erro) return falha(503, 'indisponivel', { retentar: true });
    const expirada = String(sub.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers?.obfuscatedExternalAccountId || '').toLowerCase();
    if (!cadeia || cadeia.userId !== dono || (expirada && expirada !== hashDono)) {
      console.error('[olli-play] ALARME: compra sem conta vinculada —', curto(tokenHash));
      return chamadorId ? falha(403, 'compra_sem_conta') : semEfeito('compra_sem_conta', { alarme: true });
    }
  }

  // ── compra de teste ──
  const teste = !!sub.testPurchase;
  if (teste && !testadoresPermitidos(env).has(String(dono).toLowerCase())) {
    console.error('[olli-play] ALARME: compra de teste de conta fora de PLAY_TESTE_PERMITIDOS —', curto(tokenHash));
    return chamadorId ? falha(403, 'compra_de_teste_nao_permitida') : semEfeito('teste_nao_permitido', { alarme: true });
  }

  // ── produto ──
  const cat = itemDoCatalogo(sub);
  if (!cat.ok) {
    console.error('[olli-play] ALARME: produto fora do catálogo —', cat.motivo, curto(tokenHash));
    return chamadorId ? falha(422, 'produto_desconhecido') : semEfeito(cat.motivo, { alarme: true });
  }
  if (produtoAlegado) {
    const [sku, plano] = String(produtoAlegado).trim().split(':');
    if (sku !== cat.productId || (plano !== undefined && plano !== cat.produto.periodo)) {
      return falha(400, 'produto_divergente');
    }
  }

  // ── decisão ──
  const d = traduzirAssinaturaPlay(sub, { userId: dono, transacaoId: tokenHash, agora, lidoEm });
  if (d.acao === 'invalido' || d.acao === 'alarme') {
    const motivo = d.motivo || 'resposta_invalida';
    console.error('[olli-play] ALARME: estado não aplicável —', motivo, curto(tokenHash));
    return chamadorId ? falha(422, 'estado_nao_suportado') : semEfeito(motivo, { alarme: true });
  }

  // Troca de plano vinda de token de OUTRA conta: concede o novo (a marca da conta
  // conferiu), mas alguém precisa olhar.
  let linkedHash = null;
  if (typeof sub.linkedPurchaseToken === 'string' && TOKEN_RE.test(sub.linkedPurchaseToken)) {
    linkedHash = await sha256Hex(sub.linkedPurchaseToken);
    const anterior = await lerCompra(env, linkedHash);
    if (anterior && !anterior.erro && anterior.user_id !== dono) {
      console.error('[olli-play] ALARME: linkedPurchaseToken pertence a outra conta —', curto(linkedHash));
    }
  }

  // ── grava a compra ──
  const jaReconhecida = sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  const ordem = String(cat.item.latestSuccessfulOrderId || sub.latestOrderId || '').replace(/\.\.\d+$/, '');
  const registro = {
    produto_id: cat.produtoId,
    estado: sub.subscriptionState,
    expiry: cat.expiraIso,
    linked_token_sha256: linkedHash,
    order_id_base: ordem || null,
    ack: jaReconhecida,
    teste,
    auto_renovacao: cat.item?.autoRenewingPlan ? cat.item.autoRenewingPlan.autoRenewEnabled === true : null,
    verificado_em: agoraIso,
  };
  if (linha) {
    if (!(await atualizarCompra(env, tokenHash, dono, registro))) return falha(503, 'indisponivel', { retentar: true });
  } else {
    const ins = await inserirCompra(env, { user_id: dono, token_sha256: tokenHash, purchase_token: token, ...registro });
    if (ins === 'erro') return falha(503, 'indisponivel', { retentar: true });
    if (ins === 'conflito') {
      // Outro pedido registrou o mesmo token entre a leitura e o insert.
      const dela = await lerCompra(env, tokenHash);
      if (!dela || dela.erro) return falha(503, 'indisponivel', { retentar: true });
      if (dela.user_id !== dono) {
        console.error('[olli-play] ALARME: token registrado por outra conta em paralelo —', curto(tokenHash));
        return chamadorId ? falha(409, 'compra_de_outra_conta') : semEfeito('compra_de_outra_conta', { alarme: true });
      }
      if (!(await atualizarCompra(env, tokenHash, dono, registro))) return falha(503, 'indisponivel', { retentar: true });
    }
  }

  // ── aplica no plano ──
  const r = await aplicarDecisao(env, d, { agora });
  if (r.http >= 500) return falha(503, 'indisponivel', { retentar: true });

  // ── reconhece (só depois de gravar, só o que foi concedido) ──
  let ack = jaReconhecida;
  if (!ack && d.acao === 'conceder' && r.marca === 'processado' && sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    ack = await reconhecerNaPlay(env, cat.productId, token);
    if (ack) await atualizarCompra(env, tokenHash, dono, { ack: true });
    else console.error('[olli-play] acknowledge falhou — a reconciliação tenta de novo:', curto(tokenHash));
  }

  return {
    http: 200,
    corpo: {
      ok: true,
      acao: r.corpo.acao,
      ...(r.corpo.motivo ? { motivo: r.corpo.motivo } : {}),
      estado: estadoParaApp(d),
      plano: d.acao === 'conceder' ? d.plano : null,
      vigenciaAte: d.acao === 'conceder' ? d.vigenciaAte : null,
      ack,
    },
    retentar: false,
  };
}

// ─── GET /play/config ────────────────────────────────────────
function config(env) {
  return json({ ok: true, ligado: playLigado(env) });
}

// ─── POST /play/verificar ────────────────────────────────────
async function verificar(request, env) {
  if (!playLigado(env)) return json({ ok: false, erro: 'play_desligado' }, 503);

  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  // FAIL-CLOSED: rota de dinheiro sem limitador não roda (rateLimit.js).
  if (!(await rateOkSensivel(env, env.PLAY_RL, `play:${user.id}`))) {
    return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  }

  if (!cabeNoTeto(request, TETO_VERIFICAR).ok) return json({ ok: false, erro: 'payload_grande' }, 413);
  let bruto = '';
  try {
    bruto = await request.text();
  } catch {
    return json({ ok: false, erro: 'payload_invalido' }, 400);
  }
  if (!textoCabeNoTeto(bruto, TETO_VERIFICAR)) return json({ ok: false, erro: 'payload_grande' }, 413);

  let corpo;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return json({ ok: false, erro: 'payload_invalido' }, 400);
  }
  const token = corpo && typeof corpo.purchaseToken === 'string' ? corpo.purchaseToken : '';
  if (!TOKEN_RE.test(token)) return json({ ok: false, erro: 'token_invalido' }, 400);
  const produtoId = corpo && typeof corpo.produtoId === 'string' ? corpo.produtoId.trim() : '';
  // Só o catálogo único: `olli_pro`, `olli_pro:mensal`… (o sku sozinho serve à
  // restauração, em que o app nem sempre sabe o plano básico).
  if (!produtoPlay(produtoId)) return json({ ok: false, erro: 'produto_invalido' }, 400);

  try {
    const r = await sincronizarCompra(env, { token, chamadorId: user.id, produtoAlegado: produtoId });
    return json(r.corpo, r.http);
  } catch (e) {
    capturarExcecao(e, { origem: 'play', rota: '/play/verificar' });
    return json({ ok: false, erro: 'falha_interna' }, 500);
  }
}

// ─── RTDN por PULL (cron de minuto) ──────────────────────────

/** Base64 (padrão ou url) → texto UTF-8. `null` se não decodifica. */
function decodificarBase64(dado) {
  try {
    const b64 = String(dado || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

function tipoDaNotificacao(n) {
  if (n.subscriptionNotification) return 'assinatura';
  if (n.voidedPurchaseNotification) return 'anulada';
  if (n.testNotification) return 'teste';
  if (n.oneTimeProductNotification) return 'produto_avulso';
  return 'outro';
}

/**
 * Trata UMA mensagem. Devolve true quando pode dar ack (efeito gravado, ou
 * mensagem que reenviar não conserta) e false quando o Pub/Sub deve reentregar.
 */
async function tratarMensagem(env, recebida, agora) {
  const msg = recebida?.message || {};
  const messageId = typeof msg.messageId === 'string' && msg.messageId ? msg.messageId : '';
  if (!messageId) return true; // lixo: reenviar não conserta

  const texto = decodificarBase64(msg.data);
  let n = null;
  try {
    n = texto ? JSON.parse(texto) : null;
  } catch {
    n = null;
  }
  if (!n || typeof n !== 'object') {
    console.error('[olli-play] ALARME: mensagem do RTDN ilegível —', messageId);
    return true;
  }
  if (n.packageName !== pacote(env)) {
    console.error('[olli-play] RTDN de outro pacote ignorado —', messageId);
    return true;
  }

  const tipo = tipoDaNotificacao(n);
  const token =
    n.subscriptionNotification?.purchaseToken ?? n.voidedPurchaseNotification?.purchaseToken ?? null;
  const tokenValido = typeof token === 'string' && TOKEN_RE.test(token);
  const tokenHash = tokenValido ? await sha256Hex(token) : null;

  // Trilha mínima: nada de token cru nem de dado pessoal (LGPD, R16).
  const payload = {
    tipo,
    notificationType: n.subscriptionNotification?.notificationType ?? null,
    refundType: n.voidedPurchaseNotification?.refundType ?? null,
    eventTimeMillis: n.eventTimeMillis ?? null,
    token: tokenHash ? curto(tokenHash) : null,
  };
  const reiv = await reivindicarEvento(env, { origem: ORIGEM_RTDN, eventId: messageId, tipo, payload });
  if (!reiv.ok) return false; // não sei se é novo → deixa o Pub/Sub reentregar
  if (reiv.duplicado) return true;

  if (tipo === 'teste') {
    console.log('[olli-play] RTDN de teste recebido pelo pull — ok');
    await marcarEvento(env, { origem: ORIGEM_RTDN, eventId: messageId, status: 'processado' });
    return true;
  }
  if ((tipo === 'assinatura' || tipo === 'anulada') && tokenValido) {
    // O tipo da notificação NÃO decide nada: estorno/revogação aparece como estado
    // EXPIRED na própria API; estorno sem revogação mantém o acesso (e o alarme
    // abaixo avisa o dono).
    let r;
    try {
      r = await sincronizarCompra(env, { token, agora });
    } catch (e) {
      capturarExcecao(e, { origem: 'play', rota: 'rtdn' });
      await marcarEvento(env, { origem: ORIGEM_RTDN, eventId: messageId, status: 'falhou', erro: 'excecao' });
      return false;
    }
    if (tipo === 'anulada') console.error('[olli-play] ALARME: compra anulada (estorno/chargeback) —', curto(tokenHash), r.corpo?.acao);
    if (r.retentar) {
      await marcarEvento(env, { origem: ORIGEM_RTDN, eventId: messageId, status: 'falhou', erro: r.corpo?.erro });
      return false;
    }
    await marcarEvento(env, {
      origem: ORIGEM_RTDN,
      eventId: messageId,
      status: r.alarme ? 'falhou' : 'processado',
      erro: r.alarme ? r.corpo?.motivo : undefined,
    });
    return true;
  }
  // Produto avulso (o OLLI não vende), aviso de revisão de estorno e tipos novos:
  // só trilha. Ack, porque reenviar não muda nada.
  if (n.pendingRefundReviewNotification) console.error('[olli-play] ALARME: revisão de estorno pendente — responda no Console em 24 h');
  await marcarEvento(env, { origem: ORIGEM_RTDN, eventId: messageId, status: 'processado' });
  return true;
}

/**
 * Puxa até `max` mensagens da assinatura PULL do RTDN, aplica e dá ack SÓ no que
 * foi gravado. Sem cron novo (conta Free: 5 no total) e sem endpoint público.
 * Teto baixo de mensagens por rodada: a invocação do cron de minuto divide o
 * limite de subrequests com os outros jobs; o que sobrar fica para o minuto seguinte.
 */
export async function processarRtdn(env, { agora = new Date(), max } = {}) {
  const sub = assinaturaPubSub(env);
  if (!configurado(env) || !sub) return { estado: 'desligado' };
  const limite = Math.max(1, Math.min(10, Number.parseInt(String(max ?? env.PLAY_RTDN_MAX ?? '3'), 10) || 3));
  const agoraMs = agora instanceof Date ? agora.getTime() : Number(agora);

  const puxou = await chamarGoogle(env, `${API_PUBSUB}/${sub}:pull`, {
    metodo: 'POST',
    // returnImmediately: sem ele o pull fica esperando mensagem e prende o cron.
    corpo: { maxMessages: limite, returnImmediately: true },
  });
  if (puxou.status !== 'ok') {
    console.error('[olli-play] pull do RTDN falhou —', puxou.motivo || puxou.status);
    return { estado: 'erro' };
  }
  const recebidas = Array.isArray(puxou.dados?.receivedMessages) ? puxou.dados.receivedMessages : [];
  const ackIds = [];
  let mantidas = 0;
  for (const rm of recebidas) {
    let podeAck = false;
    try {
      podeAck = await tratarMensagem(env, rm, agoraMs);
    } catch (e) {
      capturarExcecao(e, { origem: 'play', rota: 'rtdn' });
      podeAck = false;
    }
    if (podeAck && typeof rm?.ackId === 'string' && rm.ackId) ackIds.push(rm.ackId);
    else mantidas++;
  }
  if (ackIds.length) {
    const ack = await chamarGoogle(env, `${API_PUBSUB}/${sub}:acknowledge`, { metodo: 'POST', corpo: { ackIds } });
    if (ack.status !== 'ok') {
      // Sem ack o Pub/Sub reentrega; a idempotência em webhook_events segura o dobro.
      console.error('[olli-play] ack do RTDN falhou —', ack.motivo || ack.status);
    }
  }
  return { estado: 'ok', recebidas: recebidas.length, confirmadas: ackIds.length, mantidas };
}

// ─── reconciliação (cron de minuto, horários fixos) ──────────

/** Minutos UTC de cada hora em que a reconciliação de linhas roda. */
const MINUTOS_RECONCILIAR = new Set([13, 43]);
/** Varredura diária de compras anuladas: 05:37 UTC (02:37 de Brasília). */
const HORA_ANULADAS = { h: 5, m: 37 };

async function linhasParaReconciliar(env, agoraMs, limite) {
  const ate48h = iso(agoraMs + 2 * DIA_MS);
  const umaHora = iso(agoraMs - HORA_MS);
  const finais = [...ESTADOS_FINAIS].join(',');
  // (vence em ≤ 48 h OU estado sensível OU sem ack) E (nunca relida OU relida há > 1 h).
  // Valores de data entre aspas: o ponto dos milissegundos não confunde o parser.
  const filtro =
    `(or(expiry.lt."${ate48h}",estado.in.(${ESTADOS_SENSIVEIS.join(',')}),ack.is.false),` +
    `or(verificado_em.is.null,verificado_em.lt."${umaHora}"))`;
  const url =
    `${env.SUPABASE_URL}/rest/v1/play_compras?select=${COLUNAS_COMPRA}` +
    `&estado=not.in.(${finais})` +
    `&and=${encodeURIComponent(filtro)}` +
    `&order=verificado_em.asc.nullsfirst&limit=${limite}`;
  try {
    const r = await fetch(url, { headers: sbHeaders(env, { Accept: 'application/json' }) });
    if (!r.ok) return null;
    const arr = await r.json().catch(() => null);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

async function varrerAnuladas(env, agoraMs, limite) {
  const url =
    `${API_PLAY}/${encodeURIComponent(pacote(env))}/purchases/voidedpurchases` +
    `?type=1&maxResults=50&startTime=${agoraMs - 3 * DIA_MS}`;
  const r = await chamarGoogle(env, url);
  if (r.status !== 'ok') {
    console.error('[olli-play] voidedpurchases.list falhou —', r.motivo || r.status);
    return { erro: true };
  }
  const lista = Array.isArray(r.dados?.voidedPurchases) ? r.dados.voidedPurchases : [];
  let tratadas = 0;
  for (const v of lista) {
    if (tratadas >= limite) break;
    const token = typeof v?.purchaseToken === 'string' ? v.purchaseToken : '';
    if (!TOKEN_RE.test(token)) continue;
    const hash = await sha256Hex(token);
    const linha = await lerCompra(env, hash);
    if (!linha || linha.erro) continue; // não é nossa assinatura (ou não sei: amanhã de novo)
    const eventId = `${String(v.orderId || '').slice(0, 64)}|${hash.slice(0, 32)}`;
    const reiv = await reivindicarEvento(env, {
      origem: ORIGEM_ANULADA,
      eventId,
      tipo: 'anulada',
      payload: { token: curto(hash), voidedReason: v.voidedReason ?? null, voidedSource: v.voidedSource ?? null },
    });
    if (!reiv.ok || reiv.duplicado) continue;
    tratadas++;
    const s = await sincronizarCompra(env, { token, agora: agoraMs });
    console.error('[olli-play] ALARME: compra anulada encontrada na varredura —', curto(hash), s.corpo?.acao);
    await marcarEvento(env, { origem: ORIGEM_ANULADA, eventId, status: s.retentar ? 'falhou' : 'processado' });
  }
  return { tratadas };
}

/**
 * Rede de segurança do RTDN: relê na Play as compras que vencem em ≤ 48 h, as em
 * carência/suspensão/pausa/pendência e as sem acknowledge; uma vez por dia varre
 * `voidedpurchases`. Fora dos horários fixos não faz nada (mesmo desenho de
 * `limparEventosAntigos`). Erro de API NUNCA rebaixa plano: a linha só muda com
 * uma resposta válida da Play.
 */
export async function reconciliarPlay(env, { agora = new Date(), limite } = {}) {
  if (!configurado(env)) return { estado: 'desligado' };
  const quando = agora instanceof Date ? agora : new Date(agora);
  const agoraMs = quando.getTime();
  const m = quando.getUTCMinutes();
  const h = quando.getUTCHours();
  const max = Math.max(1, Math.min(10, Number.parseInt(String(limite ?? env.PLAY_RECONCILIAR_MAX ?? '3'), 10) || 3));
  const out = { estado: 'fora_do_horario' };

  if (MINUTOS_RECONCILIAR.has(m)) {
    const linhas = await linhasParaReconciliar(env, agoraMs, max);
    if (!linhas) {
      console.error('[olli-play] reconciliação: leitura de play_compras falhou');
      out.estado = 'erro';
    } else {
      out.estado = 'ok';
      out.relidas = 0;
      for (const l of linhas) {
        if (typeof l?.purchase_token !== 'string' || !TOKEN_RE.test(l.purchase_token)) continue;
        try {
          await sincronizarCompra(env, { token: l.purchase_token, agora: agoraMs });
          out.relidas++;
        } catch (e) {
          capturarExcecao(e, { origem: 'play', rota: 'reconciliar' });
        }
      }
    }
  }
  if (h === HORA_ANULADAS.h && m === HORA_ANULADAS.m) {
    out.anuladas = await varrerAnuladas(env, agoraMs, max);
    if (out.estado === 'fora_do_horario') out.estado = 'ok';
  }
  return out;
}

// ─── exclusão de conta ───────────────────────────────────────

/**
 * Cancela a renovação de toda assinatura da Play deste usuário ANTES de a conta ser
 * apagada (C12). 'ok' | 'erro' — e 'erro' BLOQUEIA a exclusão (conta.js responde
 * 502), como Stripe e Mercado Pago: conta apagada com assinatura viva = cobrança
 * sem ninguém para cancelar.
 *
 *  - Tabela `play_compras` ausente (migration não aplicada) = nenhuma compra pode ter
 *    sido registrada (o worker não grava sem ela) → 'ok' com log.
 *  - Compra PENDENTE (pagamento ainda não caiu) não se cancela pela API; ela não é
 *    reconhecida por ninguém depois que a conta some, e a Play ESTORNA sozinha em
 *    3 dias. Não bloqueia.
 *  - Falhou o cancel: relê o estado. Já cancelada/expirada/sem renovação = 'ok'.
 */
export async function cancelarPlayDoUsuario(env, userId) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return 'erro';
  let linhas;
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/play_compras?user_id=eq.${encodeURIComponent(userId)}&select=${COLUNAS_COMPRA}`,
      { headers: sbHeaders(env, { Accept: 'application/json' }) },
    );
    if (r.status === 404) {
      console.error('[olli-play] play_compras indisponível (migration 20261004110000?) — exclusão segue sem checar a Play:', userId);
      return 'ok';
    }
    if (!r.ok) return 'erro';
    linhas = await r.json().catch(() => null);
    if (!Array.isArray(linhas)) return 'erro';
  } catch {
    return 'erro';
  }

  const vivas = linhas.filter(
    (l) => !ESTADOS_FINAIS.has(l.estado) && l.estado !== ESTADO.CANCELADA && l.estado !== ESTADO.PENDENTE,
  );
  if (!vivas.length) return 'ok';
  if (!configurado(env)) {
    console.error('[olli-play] há assinatura da Play a cancelar e a credencial não está configurada:', userId);
    return 'erro';
  }

  for (const l of vivas) {
    if (typeof l.purchase_token !== 'string' || !TOKEN_RE.test(l.purchase_token)) return 'erro';
    const c = await cancelarNaPlay(env, l.purchase_token);
    if (c.status === 'ok' || c.status === 'nao_encontrado') continue;
    // Último recurso: pergunta o estado real antes de bloquear a exclusão.
    const g = await lerAssinaturaPlay(env, l.purchase_token);
    if (g.status === 'nao_encontrado') continue;
    if (g.status === 'ok') {
      const s = g.dados || {};
      const itens = Array.isArray(s.lineItems) ? s.lineItems : [];
      const semRenovar = itens.length > 0 && itens.every((i) => i?.autoRenewingPlan?.autoRenewEnabled !== true);
      if (
        s.subscriptionState === ESTADO.CANCELADA ||
        s.subscriptionState === ESTADO.EXPIRADA ||
        s.subscriptionState === ESTADO.PENDENTE_CANCELADA ||
        s.subscriptionState === ESTADO.PENDENTE ||
        semRenovar
      ) {
        continue;
      }
    }
    console.error('[olli-play] cancelar assinatura da Play falhou —', c.motivo || c.status, curto(await sha256Hex(l.purchase_token)));
    return 'erro';
  }
  return 'ok';
}

// ─── roteador /play/* ────────────────────────────────────────
export async function handlePlay(request, env, url) {
  const p = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (p === '/play/config' && request.method === 'GET') return config(env);
  if (p === '/play/verificar' && request.method === 'POST') return verificar(request, env);
  if (PLAY_ROUTES.has(p)) return json({ erro: 'metodo_nao_suportado' }, 405);
  return json({ erro: 'nao_encontrado' }, 404);
}
