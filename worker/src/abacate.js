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
 *  - CADA COBRANÇA LIBERA UMA VEZ SÓ (auditoria 29/09, item 11). A vigência fixa
 *    impedia somar meses, mas não impedia DESFAZER uma revogação: estornado ou
 *    revogado o plano à mão, o polling (ou um replay do webhook) lia a mesma
 *    cobrança PAID e ligava o plano de novo. Agora a cobrança é registrada como
 *    consumida em `webhook_events` (origem 'abacate', event_id = id da cobrança);
 *    depois de consumida ela responde "pago" mas não concede mais nada.
 *  - O webhook tem teto por IP (`ABACATEHOOK_RL`), conferido ANTES do segredo.
 *  - TRILHA (T-012): toda chamada AUTENTICADA do webhook vira uma linha em
 *    `webhook_events` (origem 'abacatepay', event_id = `log_…`), com tipo, cobrança,
 *    desfecho (ok / ignorado / erro + motivo curto) e datas — para auditar Pix
 *    recebido e falho. Mesmo evento 2x = uma linha, e o reenvio de um evento já
 *    concluído responde 200 sem reprocessar. Falha ao gravar a trilha nunca
 *    derruba o pagamento.
 *
 * O `?webhookSecret=` chega na URL. Nada aqui loga URL nem query (os logs cortam
 * no `?`, e o Sentry já tira query — `sentryScrub.ts`).
 *
 * NUNCA MODO DEMO (ordem permanente do dono): chave de desenvolvimento
 * (`abc_dev_…`) gera QR falso. Em produção ela deixa a rota DESLIGADA, dizendo que
 * está desligada — só `ABACATE_PERMITIR_DEV=true` (staging/teste) a aceita.
 */
import { sha256Hex } from './googleAuth.js';
import { concederPlanoPeriodo, PLANO_PIX } from './mercadopago.js';
import { checarLimite, deixaPassar, rateOkSensivel } from './rateLimit.js';
import { getAssinatura } from './stripe.js';
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

/** Origem desta cobrança em `webhook_events` (texto livre; não exige migration). */
const ORIGEM_CONSUMO = 'abacate';
/** P0-08: fila do lembrete "Pix vence em 3 h" (reuso de webhook_events, sem tabela nova): 'recebido' = lembrete pendente. */
export const ORIGEM_PIX_COBRANCA = 'pix_cobranca';
/**
 * Origem da TRILHA do webhook em `webhook_events` (uma linha por evento `log_…`),
 * como o Play RTDN faz com 'play_rtdn'. Separada do consumo ('abacate', uma linha
 * por cobrança): o consumo diz "esta cobrança já liberou plano"; a trilha diz "a
 * AbacatePay chamou, com isto, e deu nisto" — inclusive o que foi ignorado ou falhou.
 */
const ORIGEM_WEBHOOK = 'abacatepay';
/** id de evento da AbacatePay (`log_…`) aceito como chave; fora disso, hash do corpo. */
const EVENTO_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

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

/** Validade do QR Pix do plano: 24 h (testado na AbacatePay em 22/10). */
const PIX_EXPIRA_S = 86400;
/** Folga máxima entre a criação do Pix e o pagamento visto: validade + 1 h de margem
 *  (relógio do gateway e atraso do webhook/polling). Passou disso, a data não é confiável e cai na criação. */
const PAGO_MAX_MS = (PIX_EXPIRA_S + 3600) * 1000;

/**
 * Data-base da vigência, lida da cobrança.
 *  - Renovação do mesmo plano: `metadata.inicio` no futuro (fim do período atual) vale.
 *  - Plano novo/troca: o início gravado é "a criação"; como o Pix vale 24 h, o
 *    cliente pode pagar horas depois — conta a partir do pagamento VISTO
 *    (`pagoEm` = `recebido_em` do evento, fixo em reenvio), limitado a
 *    [criação, criação + validade + 1 h]. Sem `pagoEm` → criação (nunca dá tempo a mais).
 */
function baseDaVigencia(cobranca, pagoEm) {
  const criado = Date.parse(cobranca.createdAt);
  const inicio = Date.parse(cobranca.metadata && cobranca.metadata.inicio);
  const inicioOk = Number.isFinite(criado) && Number.isFinite(inicio) && inicio >= criado - 60_000 && inicio - criado <= INICIO_MAX_MS;
  if (inicioOk && inicio - criado > 60_000) return new Date(inicio).toISOString(); // renovação futura
  if (Number.isFinite(criado) && Number.isFinite(pagoEm) && pagoEm >= criado && pagoEm - criado <= PAGO_MAX_MS) {
    return new Date(pagoEm).toISOString();
  }
  return inicioOk ? new Date(inicio).toISOString() : cobranca.createdAt;
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
 * CONSUMO ÚNICO: paga e válida, a cobrança é REIVINDICADA em `webhook_events`
 * antes de conceder (mesmo padrão do webhook da Stripe). Três estados:
 *  - reivindicou (primeira vez, ou tentativa anterior que não terminou) → concede
 *    e marca 'processado';
 *  - já 'processado' → NÃO concede de novo. Responde 'liberado' (a cobrança foi
 *    paga e aplicada), então o polling segue vendo pago:true e nada muda — nem
 *    quando o plano foi revogado/estornado depois;
 *  - não deu para saber (banco fora) → NÃO concede: 'indisponivel', 5xx, reenvio.
 * Se concedeu mas o 'processado' não gravou, volta `registrado:false`: o webhook
 * responde 503 para a AbacatePay reenviar e a marca ser gravada (o reprocesso dá
 * a mesma vigência, então não soma nada).
 *
 * Retorno: { estado: 'liberado' | 'pendente' | 'invalida' | 'alheia' | 'indisponivel',
 *            registrado?, jaConsumida?, motivo? } — `jaConsumida` e `motivo` só
 * alimentam a trilha do webhook; nenhuma decisão depende deles.
 */
async function liberarSePaga(env, idCobranca, userIdEsperado = null) {
  const idEnc = encodeURIComponent(idCobranca);
  const cobranca = await abacateFetch(env, `/transparents/get?id=${idEnc}`);
  if (!cobranca) return { estado: 'indisponivel' };

  const vinculo = lerVinculo(cobranca);
  if (!vinculo) return { estado: 'invalida', motivo: 'sem_vinculo' };
  if (userIdEsperado && vinculo.userId !== userIdEsperado) return { estado: 'alheia' };

  // Cobrança devMode só libera onde o modo teste foi permitido: um QR de mentira
  // não pode virar plano pago em produção.
  if (cobranca.devMode === true && modoAbacate(env) !== 'teste') return { estado: 'invalida', motivo: 'dev_mode' };

  const plano = PLANO_PIX[vinculo.planoKey];
  if (Number(cobranca.amount) !== centavos(plano)) {
    console.error('[olli-abacate] valor da cobrança difere do catálogo — não libera', vinculo.planoKey);
    return { estado: 'invalida', motivo: 'valor_divergente' };
  }

  const situacao = await abacateFetch(env, `/transparents/check?id=${idEnc}`);
  if (!situacao) return { estado: 'indisponivel' };
  if (situacao.status !== 'PAID') return { estado: 'pendente' };

  // Reivindica SÓ agora: cobrança pendente, forjada ou alheia não deixa rastro.
  const consumo = { origem: ORIGEM_CONSUMO, eventId: idCobranca };
  const claim = await reivindicarEvento(env, {
    ...consumo,
    tipo: 'plano_pix',
    payload: { user_id: vinculo.userId, plano: vinculo.planoKey, valor_centavos: Number(cobranca.amount) },
  });
  if (!claim.ok) return { estado: 'indisponivel' };
  if (claim.duplicado) return { estado: 'liberado', registrado: true, jaConsumida: true };
  // A âncora da vigência é o `recebido_em` que o PRÓPRIO claim devolveu (insert novo ou
  // retentativa). Sem ela não dá para saber quanto tempo o cliente pagou depois da criação:
  // NÃO cai na criação em silêncio (quem pagou 20 h depois perderia até 24 h). Fecha
  // 'falhou' e pede reenvio/nova leitura.
  if (!Number.isFinite(claim.recebidoEm)) {
    console.error('[olli-abacate] claim sem recebido_em — não concede; aguardando reenvio');
    await marcarEvento(env, { ...consumo, status: 'falhou', erro: 'sem_recebido_em' });
    return { estado: 'indisponivel' };
  }

  // Vigência a partir de uma data GRAVADA na cobrança (o início do período, ou a
  // criação) — nunca de "agora" nem do `updatedAt` (que vem em cache). Data fixa =
  // liberar de novo dá a mesma vigência (ver concederPlanoPeriodo). O Pix vale 24 h, então a
  // vigência conta do pagamento visto (recebido_em do consumo), não da criação.
  const res = await concederPlanoPeriodo(env, {
    userId: vinculo.userId,
    planoKey: vinculo.planoKey,
    dataAprovacao: baseDaVigencia(cobranca, claim.recebidoEm),
  });
  if (!res.ok) {
    // 'falhou' deixa a próxima tentativa reprocessar (ver estadoDoEvento).
    await marcarEvento(env, { ...consumo, status: 'falhou', erro: `concessao_http_${res.status}` });
    return { estado: 'indisponivel' };
  }
  const registrado = await marcarEvento(env, { ...consumo, status: 'processado' });
  if (!registrado) console.error('[olli-abacate] plano liberado, mas o consumo não gravou — aguardando reenvio');
  return { estado: 'liberado', registrado };
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
        expiresIn: PIX_EXPIRA_S,
        description: descricaoAbacate(plano.nome),
        externalId,
        metadata: { externalId, inicio },
      },
    }),
  });
  if (!data || !data.brCode) {
    // Sem rastro, toda venda de plano viraria 502 mudo (ex.: gateway recusando expiresIn).
    // Só plano e o que veio (nada de segredo, brCode ou dado do usuário).
    console.error('[olli-abacate] criar Pix falhou —', JSON.stringify({ plano: plano.id, expiresIn: PIX_EXPIRA_S, resposta: data ? 'sem_brCode' : 'nula' }));
    return json({ ok: false, erro: 'falha_criar_pix' }, 502);
  }

  // P0-08: grava a cobrança para o lembrete de 3 h antes do vencimento. Falha aqui NUNCA derruba a venda
  // (o cliente já tem o QR): só perde o lembrete e deixa rastro no log (sem brCode nem dado pessoal).
  try {
    const gravou = await reivindicarEvento(env, {
      origem: ORIGEM_PIX_COBRANCA,
      eventId: data.id,
      tipo: 'plano_pix_criada',
      payload: { user_id: user.id, plano: plano.id, expires_at: data.expiresAt || null },
    });
    if (!gravou.ok) console.error('[olli-abacate] cobrança não gravada para o lembrete — segue a venda');
  } catch (e) {
    console.error('[olli-abacate] gravar cobrança para o lembrete falhou —', e && (e.message || e));
  }

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
  // Teto por IP ANTES de olhar o segredo: barra quem tenta adivinhar o
  // `webhookSecret` e, com ele vazado, a amplificação (cada POST válido faz 2
  // leituras na AbacatePay e escritas no Supabase). NÃO é fail-closed, pelo mesmo
  // motivo do MPHOOK_RL: 429 só faz a AbacatePay reenviar (qualquer não-2xx
  // reenvia com backoff), e limitador fora não pode derrubar webhook de dinheiro.
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  if (!deixaPassar(await checarLimite(env.ABACATEHOOK_RL, `abacatehook:${ip}`), { sensivel: false })) {
    return json({ erro: 'muitas_requisicoes' }, 429);
  }

  const secret = env.ABACATE_WEBHOOK_SECRET;
  if (!secret || !compararConstante(url.searchParams.get('webhookSecret') || '', secret)) {
    return json({ erro: 'nao_autorizado' }, 401);
  }

  // Daqui em diante a chamada é AUTENTICADA, e toda ela vira trilha em
  // `webhook_events` (origem 'abacatepay'). Antes do segredo não grava nada: a URL
  // é pública, e cada 401 virando linha no banco seria um jeito barato de enchê-lo.
  const bruto = await request.text().catch(() => '');
  let evt = null;
  try {
    evt = bruto ? JSON.parse(bruto) : null;
  } catch {
    evt = null;
  }
  const trilha = await abrirTrilha(evt, bruto);
  const reiv = await reivindicarEvento(env, {
    origem: ORIGEM_WEBHOOK,
    eventId: trilha.eventId,
    tipo: trilha.tipo,
    payload: trilha.payload('recebido'),
  });
  // Evento já concluído antes (reenvio da AbacatePay): 200 sem reprocessar.
  // `reiv.ok === false` (banco fora) NÃO segura nada: a trilha nunca derruba
  // pagamento — o processo segue, e o consumo único ('abacate') é quem protege
  // o plano de ser liberado duas vezes.
  if (reiv.ok && reiv.duplicado) return json({ ok: true, duplicado: true });
  // Erro não vira vazio: a trilha falhar não trava o pagamento, mas aparece no log
  // (só o id do evento e o tipo — nada de URL, segredo ou dado do cliente).
  if (!reiv.ok) console.error('[olli-abacate] trilha não gravou (reivindicar):', trilha.eventId, trilha.tipo);

  let fim;
  try {
    fim = await processarWebhook(env, evt);
  } catch (e) {
    await fecharTrilha(env, trilha, { http: 500, resultado: 'erro', motivo: 'excecao' });
    throw e;
  }
  await fecharTrilha(env, trilha, fim);
  return json(fim.corpo, fim.http);
}

/**
 * Decide o webhook já autenticado. Devolve `{ http, corpo, resultado, motivo }`:
 * `http`/`corpo` vão para a AbacatePay (o MESMO contrato de antes da trilha);
 * `resultado` ('ok' | 'ignorado' | 'erro') e `motivo` vão para `webhook_events`.
 */
async function processarWebhook(env, evt) {
  if (modoAbacate(env) === 'desligado') {
    return { http: 503, corpo: { erro: 'pix_desligado' }, resultado: 'erro', motivo: 'pix_desligado' };
  }
  if (!evt || typeof evt !== 'object') {
    return { http: 400, corpo: { erro: 'payload_invalido' }, resultado: 'erro', motivo: 'payload_invalido' };
  }

  // Só o Pix direto pago interessa. Qualquer outro evento: 200 sem ação.
  if (evt.event !== 'transparent.completed') {
    return { http: 200, corpo: { ok: true }, resultado: 'ignorado', motivo: 'evento_nao_tratado' };
  }

  const id = idDaCobranca(evt);
  if (!id) return { http: 200, corpo: { ok: true, sem_vinculo: true }, resultado: 'ignorado', motivo: 'sem_cobranca' };

  const r = await liberarSePaga(env, id);
  // indisponível → 5xx para a AbacatePay reenviar; o resto não melhora com reenvio.
  // Liberado SEM o consumo gravado também reenvia: é o reenvio que grava a marca.
  if (r.estado === 'indisponivel') {
    return { http: 503, corpo: { erro: 'indisponivel' }, resultado: 'erro', motivo: 'indisponivel' };
  }
  if (r.registrado === false) {
    return { http: 503, corpo: { erro: 'indisponivel' }, resultado: 'erro', motivo: 'consumo_nao_gravado' };
  }
  const corpo = { ok: true, estado: r.estado };
  if (r.estado === 'liberado') {
    return { http: 200, corpo, resultado: r.jaConsumida ? 'ignorado' : 'ok', motivo: r.jaConsumida ? 'ja_consumida' : 'liberado' };
  }
  if (r.estado === 'pendente') return { http: 200, corpo, resultado: 'ignorado', motivo: 'pendente' };
  // Paga com valor/vínculo/modo que não fecham: não libera, e na trilha é ERRO —
  // é exatamente o "Pix falho" que alguém precisa enxergar.
  return { http: 200, corpo, resultado: 'erro', motivo: `invalida_${r.motivo || 'cobranca'}` };
}

/** id da cobrança no corpo do evento (`data.transparent.id`, ou `data.id`). */
function idDaCobranca(evt) {
  const c = (evt && evt.data && (evt.data.transparent || evt.data)) || {};
  return typeof c.id === 'string' ? c.id : '';
}

/**
 * Monta a trilha do evento: chave, tipo e payload MÍNIMO. Chave = `id` do evento
 * (`log_…`, a idempotência que a AbacatePay recomenda — docs/ABACATEPAY.md §5); sem
 * id válido, o hash do corpo cru (o mesmo corpo reenviado cai na mesma linha).
 * O payload NÃO leva o corpo: só tipo, cobrança, devMode e o desfecho — nada de
 * cliente (nome, CPF, e-mail), e nunca a URL, onde mora o `webhookSecret`.
 */
async function abrirTrilha(evt, bruto) {
  const obj = evt && typeof evt === 'object' ? evt : null;
  const idEvt = obj && typeof obj.id === 'string' && EVENTO_ID_RE.test(obj.id) ? obj.id : '';
  const eventId = idEvt || `sha256:${(await sha256Hex(bruto || '')).slice(0, 40)}`;
  const tipo = obj && typeof obj.event === 'string' && obj.event ? obj.event.slice(0, 60) : obj ? 'sem_tipo' : 'payload_invalido';
  const cobranca = obj ? idDaCobranca(obj).slice(0, 80) || null : null;
  const devMode = obj ? obj.devMode === true : null;
  return {
    eventId,
    tipo,
    payload: (resultado, extra = {}) => ({ evento: tipo, cobranca, dev_mode: devMode, resultado, ...extra }),
  };
}

/**
 * Fecha a trilha: 'ok' e 'ignorado' viram status 'processado' (o reenvio pula),
 * 'erro' vira 'falhou' com a mensagem curta (o reenvio reprocessa). O resultado
 * fino fica no payload — o CHECK da coluna `status` só conhece
 * recebido/processado/falhou, e isto não pede migration. Best-effort: marcarEvento
 * não lança; se a escrita não for confirmada, só fica o aviso no log.
 */
async function fecharTrilha(env, trilha, { http, resultado, motivo }) {
  const gravou = await marcarEvento(env, {
    origem: ORIGEM_WEBHOOK,
    eventId: trilha.eventId,
    status: resultado === 'erro' ? 'falhou' : 'processado',
    erro: resultado === 'erro' ? motivo : undefined,
    payload: trilha.payload(resultado, { motivo, http }),
  });
  if (!gravou) console.error('[olli-abacate] trilha não gravou (fechar):', trilha.eventId, resultado, motivo);
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
