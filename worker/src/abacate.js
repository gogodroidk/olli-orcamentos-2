/**
 * PLANO POR PIX via AbacatePay — OLLI (worker Cloudflare, SEM SDK).
 *
 * Decisão do dono (29/09/2026): "vamos utilizar o AbacatePay para fazer os
 * pagamentos através do Pix". Motivo medido em produção: um cliente real abriu o
 * checkout da Stripe 3x (16 e 18/09) e desistiu — o checkout só aceita cartão, e o
 * prestador pequeno paga no Pix. Este módulo vende PERÍODO de plano por Pix.
 *
 *   GET  /abacate/config       → { pix:boolean, modo } — o app só mostra o botão
 *                                 quando `pix` é true (público, sem JWT)
 *   POST /abacate/plano/pix    → cria a cobrança; devolve { id, brCode, brCodeBase64 }
 *   GET  /abacate/status?id=   → consulta a AbacatePay e, se PAGO, libera o plano
 *   POST /abacate/webhook      → evento → re-consulta a cobrança → libera o plano
 *
 * Pix não recorre (nem na AbacatePay: assinatura lá é só cartão). "Plano por Pix"
 * = pagamento avulso que libera N meses — o MESMO catálogo e a MESMA concessão do
 * Pix do Mercado Pago (`PLANO_PIX` / `concederPlanoPeriodo`), para que preço e
 * regra de vigência tenham UMA fonte só.
 *
 * API v2 (`/v2/transparents/*`): a chave do OLLI é v2-only (a v1 responde 401
 * "API key version mismatch" — verificado ao vivo em jul e de novo em 29/09).
 *
 * SEGURANÇA DO PLANO (inegociável):
 *  - Nunca otimista no cliente. Quem libera é o SERVIDOR, e só depois de LER a
 *    cobrança na própria AbacatePay (`GET /v2/transparents/get`): status PAID,
 *    valor igual ao do catálogo, vínculo (metadata.externalId) com o usuário.
 *    Nem o corpo do webhook nem o id vindo do app são confiados sozinhos.
 *  - O webhook exige o `?webhookSecret=` (nosso, secreto). O HMAC da AbacatePay
 *    usa uma chave PÚBLICA compartilhada entre lojistas (docs/ABACATEPAY.md §5),
 *    então não autentica nada — e é dispensável aqui, porque a re-consulta à API
 *    é a verdade.
 *  - Liberar duas vezes a mesma cobrança dá o mesmo resultado: a vigência sai da
 *    DATA DO PAGAMENTO (`updatedAt` da cobrança paga), não de "agora" — ver
 *    `concederPlanoPeriodo`. Por isso o polling do app e o webhook podem ambos
 *    liberar sem somar meses.
 *
 * NUNCA MODO DEMO (ordem permanente do dono): chave de desenvolvimento
 * (`abc_dev_…`) gera QR falso. Em produção ela deixa a rota DESLIGADA, dizendo que
 * está desligada — só `ABACATE_PERMITIR_DEV=true` (staging/teste) a aceita.
 */
import { concederPlanoPeriodo, PLANO_PIX } from './mercadopago.js';
import { rateOkSensivel } from './rateLimit.js';
import { getAssinatura } from './stripe.js';

const ABACATE_API = 'https://api.abacatepay.com/v2';

export const ABACATE_ROUTES = new Set([
  '/abacate/config',
  '/abacate/plano/pix',
  '/abacate/status',
  '/abacate/webhook',
]);

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

/** Valida o JWT do Supabase em /auth/v1/user. Retorna o user ({id,email}) ou null. */
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
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

/** Comparação de strings em tempo constante (evita timing attack no secret). */
function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Em que modo a chave configurada coloca o Pix.
 *   'producao'  → chave real: vende.
 *   'teste'     → chave de dev E o ambiente permite (ABACATE_PERMITIR_DEV=true).
 *   'desligado' → sem chave, ou chave de dev num ambiente que não permite.
 */
export function modoAbacate(env) {
  const chave = typeof env.ABACATEPAY_API_KEY === 'string' ? env.ABACATEPAY_API_KEY.trim() : '';
  if (!chave) return 'desligado';
  if (chave.startsWith('abc_dev_')) return env.ABACATE_PERMITIR_DEV === 'true' ? 'teste' : 'desligado';
  return 'producao';
}

/** Valor do plano em CENTAVOS (a AbacatePay trabalha em centavos; o catálogo em reais). */
function centavos(plano) {
  return Math.round(plano.valor * 100);
}

/**
 * Descrição que a AbacatePay aceita. Ela recusa a cobrança inteira (400
 * "Disallowed character in description") por caractere fora do básico — o "·" do
 * nome do plano derrubou a primeira cobrança real de teste. Tira acento e troca o
 * resto por hífen: "OLLI Pro · 1 mês" → "OLLI Pro - 1 mes".
 */
export function descricaoAbacate(texto) {
  return String(texto || 'OLLI')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 37);
}

async function abacateFetch(env, caminho, init = {}) {
  try {
    const r = await fetch(`${ABACATE_API}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const payload = await r.json().catch(() => null);
    const data = payload && payload.data;
    if (!r.ok || !payload || payload.error || !data) {
      console.error('[olli-abacate] resposta ruim:', caminho.split('?')[0], r.status, payload && payload.error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[olli-abacate] fetch falhou:', caminho.split('?')[0], e && (e.message || e));
    return null;
  }
}

/** Maior folga aceita entre a criação da cobrança e o `inicio` gravado nela. */
const INICIO_MAX_MS = 400 * 864e5;

/**
 * De quando conta o período que esta cobrança compra. RENOVAR NÃO PODE COMER DIAS:
 * se o MESMO plano ainda está ativo, o novo período começa no fim do atual; senão
 * (grátis, vencido, ou troca de plano), começa agora. Vai gravado NA cobrança
 * (metadata.inicio) no momento em que ela é criada — por isso liberar de novo a
 * mesma cobrança dá a mesma vigência, e o replay não soma meses.
 * Falha ao ler a assinatura → começa agora (o cliente perde no máximo os dias que
 * faltavam; nunca ganha meses de graça).
 */
async function inicioDoPeriodo(env, userId, planoAlvo) {
  const agora = Date.now();
  const atual = await getAssinatura(env, userId);
  if (!atual || atual.error) return new Date(agora).toISOString();
  const fim = atual.current_period_end ? Date.parse(atual.current_period_end) : NaN;
  const ativo = atual.status && !['canceled', 'unpaid', 'incomplete_expired'].includes(atual.status);
  if (ativo && atual.plano === planoAlvo && Number.isFinite(fim) && fim > agora) {
    return new Date(fim).toISOString();
  }
  return new Date(agora).toISOString();
}

/**
 * Data-base da vigência, lida da cobrança: `metadata.inicio` quando é coerente com
 * a criação (não antes dela, nem mais de ~13 meses depois); senão `createdAt`.
 */
function baseDaVigencia(cobranca) {
  const criado = Date.parse(cobranca.createdAt);
  const inicio = Date.parse(cobranca.metadata && cobranca.metadata.inicio);
  if (Number.isFinite(criado) && Number.isFinite(inicio) && inicio >= criado - 60_000 && inicio - criado <= INICIO_MAX_MS) {
    return new Date(inicio).toISOString();
  }
  return cobranca.createdAt;
}

/**
 * externalId = `olli:pl:<userId>:<pedidoId>:<planoKey>` — mesmo formato do Pix de
 * plano do Mercado Pago. Devolve { userId, planoKey } ou null.
 */
function lerVinculo(cobranca) {
  const ext = cobranca && cobranca.metadata && cobranca.metadata.externalId;
  const partes = typeof ext === 'string' ? ext.split(':') : [];
  if (partes.length !== 5 || partes[0] !== 'olli' || partes[1] !== 'pl') return null;
  if (!partes[2] || !PLANO_PIX[partes[4]]) return null;
  return { userId: partes[2], planoKey: partes[4] };
}

/**
 * Lê a cobrança NA AbacatePay e, se estiver paga e bater com o catálogo, libera o
 * plano. É o único caminho que concede — usado pelo webhook e pelo polling.
 *
 * `userIdEsperado` (polling): quando a cobrança é de outra conta, NÃO concede —
 * nem para o dono real. Quem pergunta pelo id alheio não dispara nada.
 *
 * DUAS leituras, cada uma para o que ela sabe (medido na API real em 29/09):
 *  - `get` traz valor, metadata, devMode e createdAt — mas o STATUS dele fica em
 *    cache: seguiu PENDING minutos depois de a cobrança estar paga.
 *  - `check` traz o status fresco (PAID na hora), e nada mais.
 * Confiar só no `get` deixaria o cliente pagando e o app dizendo "aguardando".
 *
 * Retorno: { estado: 'liberado' | 'pendente' | 'invalida' | 'alheia' | 'indisponivel' }
 */
async function liberarSePaga(env, idCobranca, userIdEsperado = null) {
  const idEnc = encodeURIComponent(idCobranca);
  const cobranca = await abacateFetch(env, `/transparents/get?id=${idEnc}`);
  if (!cobranca) return { estado: 'indisponivel' };

  const vinculo = lerVinculo(cobranca);
  if (!vinculo) return { estado: 'invalida' };
  if (userIdEsperado && vinculo.userId !== userIdEsperado) return { estado: 'alheia' };

  // Cobrança devMode só libera onde o modo teste foi permitido: um QR de mentira
  // não pode virar plano pago em produção.
  if (cobranca.devMode === true && modoAbacate(env) !== 'teste') return { estado: 'invalida' };

  const plano = PLANO_PIX[vinculo.planoKey];
  if (Number(cobranca.amount) !== centavos(plano)) {
    console.error('[olli-abacate] valor da cobrança difere do catálogo — não libera', vinculo.planoKey);
    return { estado: 'invalida' };
  }

  const situacao = await abacateFetch(env, `/transparents/check?id=${idEnc}`);
  if (!situacao) return { estado: 'indisponivel' };
  if (situacao.status !== 'PAID') return { estado: 'pendente' };

  // Vigência a partir de uma data GRAVADA na cobrança (o início do período, ou a
  // criação) — nunca de "agora" nem do `updatedAt` (que vem em cache). Data fixa =
  // liberar de novo dá a mesma vigência (ver concederPlanoPeriodo). A criação fica
  // a no máximo 1h do pagamento, porque o Pix expira em 1h.
  const res = await concederPlanoPeriodo(env, {
    userId: vinculo.userId,
    planoKey: vinculo.planoKey,
    dataAprovacao: baseDaVigencia(cobranca),
  });
  return { estado: res.ok ? 'liberado' : 'indisponivel' };
}

// ─── GET /abacate/config ─────────────────────────────────────
function config(env) {
  const modo = modoAbacate(env);
  return json({ ok: true, pix: modo !== 'desligado', modo });
}

// ─── POST /abacate/plano/pix ─────────────────────────────────
async function criarPixPlano(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (modoAbacate(env) === 'desligado') return json({ ok: false, erro: 'pix_desligado' }, 503);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, user.id))) {
    return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const plano = PLANO_PIX[body && body.plano];
  if (!plano) return json({ ok: false, erro: 'plano_invalido' }, 400);

  const externalId = `olli:pl:${user.id}:${crypto.randomUUID()}:${plano.id}`;
  const inicio = await inicioDoPeriodo(env, user.id, plano.plano);
  const data = await abacateFetch(env, '/transparents/create', {
    method: 'POST',
    body: JSON.stringify({
      method: 'PIX',
      data: {
        amount: centavos(plano),
        expiresIn: 3600,
        description: descricaoAbacate(plano.nome),
        externalId,
        metadata: { externalId, inicio },
      },
    }),
  });
  if (!data || !data.brCode) return json({ ok: false, erro: 'falha_criar_pix' }, 502);

  return json({
    ok: true,
    id: data.id,
    brCode: data.brCode,
    brCodeBase64: data.brCodeBase64 || '', // já vem como data:image/png;base64,…
    status: data.status || 'PENDING',
    expiresAt: data.expiresAt || null,
    plano: { id: plano.id, nome: plano.nome, meses: plano.meses, valor: plano.valor },
    inicio,
  });
}

// ─── GET /abacate/status?id= ─────────────────────────────────
async function checarStatus(request, env, url) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (modoAbacate(env) === 'desligado') return json({ ok: false, erro: 'pix_desligado' }, 503);

  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ ok: false, erro: 'id_invalido' }, 400);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `status:${user.id}`))) {
    return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  }

  const r = await liberarSePaga(env, id, user.id);
  // Cobrança alheia ou forjada responde igual a inexistente: o polling não vira
  // oráculo de cobrança de outra conta.
  if (r.estado === 'invalida' || r.estado === 'alheia') return json({ ok: false, erro: 'nao_encontrado' }, 404);
  if (r.estado === 'indisponivel') return json({ ok: false, erro: 'falha_status' }, 502);
  return json({ ok: true, pago: r.estado === 'liberado', liberado: r.estado === 'liberado' });
}

// ─── POST /abacate/webhook?webhookSecret= ────────────────────
async function webhook(request, env, url) {
  const secret = env.ABACATE_WEBHOOK_SECRET;
  if (!secret || !compararConstante(url.searchParams.get('webhookSecret') || '', secret)) {
    return json({ erro: 'nao_autorizado' }, 401);
  }
  if (modoAbacate(env) === 'desligado') return json({ erro: 'pix_desligado' }, 503);

  const evt = await request.json().catch(() => null);
  if (!evt || typeof evt !== 'object') return json({ erro: 'payload_invalido' }, 400);

  // Só o Pix direto pago interessa. Qualquer outro evento: 200 sem ação.
  if (evt.event !== 'transparent.completed') return json({ ok: true });

  const cobranca = (evt.data && (evt.data.transparent || evt.data)) || {};
  const id = typeof cobranca.id === 'string' ? cobranca.id : '';
  if (!id) return json({ ok: true, sem_vinculo: true });

  const r = await liberarSePaga(env, id);
  // indisponível → 5xx para a AbacatePay reenviar; o resto não melhora com reenvio.
  if (r.estado === 'indisponivel') return json({ erro: 'indisponivel' }, 503);
  return json({ ok: true, estado: r.estado });
}

// ─── roteador /abacate/* ─────────────────────────────────────
export async function handleAbacate(request, env, url) {
  const p = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (p === '/abacate/config' && request.method === 'GET') return config(env);
  if (p === '/abacate/plano/pix' && request.method === 'POST') return criarPixPlano(request, env);
  if (p === '/abacate/status' && request.method === 'GET') return checarStatus(request, env, url);
  if (p === '/abacate/webhook' && request.method === 'POST') return webhook(request, env, url);

  if (ABACATE_ROUTES.has(p)) return json({ erro: 'metodo_nao_suportado' }, 405);
  return json({ erro: 'nao_encontrado' }, 404);
}
