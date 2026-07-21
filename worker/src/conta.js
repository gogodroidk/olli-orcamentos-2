/**
 * Conta do usuário — OLLI (worker Cloudflare, SEM SDK).
 *
 *   POST /conta/excluir → exclui a conta do usuário logado (JWT). Cancela as
 *                         assinaturas ativas (Stripe E Mercado Pago) e SÓ ENTÃO
 *                         apaga o usuário em auth.users com SERVICE_ROLE (o cascade
 *                         das FKs limpa os dados). Se algum cancelamento falhar,
 *                         NADA é apagado (502 retryável): conta apagada com
 *                         assinatura viva = cartão cobrado sem ninguém para
 *                         cancelar. Apple + LGPD.
 *
 * Segurança (mesmo modelo de stripe.js / equipe.js):
 *  - Exige JWT do Supabase (Authorization: Bearer <token>), validado em
 *    /auth/v1/user. O id a apagar é SEMPRE o do JWT validado — NUNCA vem do
 *    corpo do request. Assim, ninguém consegue excluir a conta de outra pessoa.
 *  - A exclusão em auth.users usa a Admin API do GoTrue com SERVICE_ROLE
 *    (DELETE /auth/v1/admin/users/<id>). O client nunca vê a service role.
 *  - O secret da Stripe (para cancelar a assinatura) vive só no worker.
 *
 * ESTADO DA REVOGAÇÃO DO SIGN IN WITH APPLE (leia antes de assumir que está
 * pronto — ver a seção "SIGN IN WITH APPLE" mais abaixo): o servidor sabe
 * revogar, mas HOJE nada chega para ele revogar. Faltam duas peças, uma humana
 * e uma de app, ambas listadas lá. Enquanto isso, quem entrou com a Apple é
 * avisado no app (ContaScreen) de que a autorização só sai pelo Apple ID.
 */
import { rateOkSensivel, cabeNoTeto, textoCabeNoTeto, TETO } from './rateLimit.js';
import { cancelarPreapprovalMp, lerPreapprovalGravado } from './mercadopago.js';
import { getAssinatura } from './stripe.js';
import { parseJsonBody } from './util.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

const STRIPE_API = 'https://api.stripe.com/v1';

// ─── helpers de resposta ─────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

// ─── auth do usuário (mesmo padrão de getUser no index.js/stripe.js) ──
/** Valida o JWT do Supabase em /auth/v1/user. Retorna o user ({id,...}) ou null. */
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

// ─── acesso ao Supabase (service role; bypassa RLS) ──────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/**
 * Assinatura do usuário. Distingue TRÊS estados, porque quem chama decide se pode
 * destruir a conta:
 *   { ...linha }   → existe assinatura
 *   null           → consultou e NÃO existe assinatura
 *   { error: true }→ NÃO SABE (rede/PostgREST fora)
 * Colapsar o erro em `null` faria handleContaExcluir pular o cancelamento e apagar
 * a conta com a subscription viva — a cobrança órfã que ele existe para impedir.
 *
 * UMA IMPLEMENTAÇÃO SÓ, a de stripe.js. Este arquivo mantinha uma CÓPIA própria —
 * e essa cópia é literalmente o bug do Gate 2 (docs/EXECUTION_LOG.md): ela
 * devolvia `null` em erro enquanto o guard aqui esperava `{error:true}`, então o
 * guard fail-closed era código morto e a cobrança órfã seguia possível, agora com
 * um comentário jurando que não. As duas cópias voltaram a concordar depois, mas
 * duas implementações do MESMO contrato de dinheiro só concordam até alguém mexer
 * em uma — é a mesma razão pela qual `cancelarAssinaturaStripe` logo abaixo é
 * exportada em vez de recopiada. Reexportamos (em vez de mandar quem chama trocar
 * o import) porque `worker/src/admin.js:18` importa daqui, e trocar o import dele
 * não pertence a esta onda.
 *
 * O select de lá é um SUPERSET do que era feito aqui (traz também plano/status/
 * current_period_end); os dois consumidores — handleContaExcluir abaixo e
 * admin.js:205 — usam só `.error` e `.stripe_subscription_id`, então nada muda de
 * comportamento.
 */
export { getAssinatura };

// ─── rate limit (reusa o namespace do Stripe) ────────────────
/** true se PODE seguir, false se estourou. Sem binding → não bloqueia. */
// FAIL-CLOSED (O2-18): exclusão de conta é destrutiva e irreversível — se não dá
// para limitar, não deixa passar. Ver worker/src/rateLimit.js.
async function rateOk(env, key) {
  return rateOkSensivel(env, env.CONTA_RL || env.STRIPE_RL, key);
}

/**
 * Cancela imediatamente a assinatura na Stripe (DELETE /subscriptions/<id>).
 * Devolve 'ok' | 'erro'. NÃO é best-effort: quem chama BLOQUEIA a exclusão da
 * conta quando dá 'erro' — apagar o usuário com a subscription viva deixaria o
 * cartão sendo cobrado sem nenhuma conta pela qual cancelar.
 * 'ok' cobre também "já estava cancelada" (404 e o 400 subscription_already_canceled),
 * senão quem cancelou pelo portal nunca mais conseguiria apagar a conta.
 * O Pro 12x avulso tem stripe_subscription_id null e sai por 'ok' logo na entrada.
 *
 * EXPORTADA de propósito: o painel admin usa ESTA função. Uma segunda cópia da
 * regra foi exatamente o que fez o guard do getAssinatura virar código morto.
 */
export async function cancelarAssinaturaStripe(env, subscriptionId) {
  if (!subscriptionId) return 'ok'; // nada a cancelar
  if (!env.STRIPE_SECRET_KEY) return 'erro'; // há o que cancelar e não podemos: falha
  try {
    const authBasic = 'Basic ' + btoa(`${env.STRIPE_SECRET_KEY}:`);
    const r = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: authBasic },
    });
    // O que importa não é se a chamada teve efeito, e sim se a assinatura está
    // cancelada ao final. 404 = já não existe na Stripe.
    if (r.ok || r.status === 404) return 'ok';

    const data = await r.json().catch(() => ({}));
    const erro = (data && data.error) || {};

    // A Stripe recusa com 400 quando a subscription JÁ está cancelada. Esse é o
    // caso COMUM (o webhook `customer.subscription.deleted` mantém o
    // stripe_subscription_id na linha), não um caso raro: sem tratá-lo, quem
    // cancelou pelo portal ficaria PERMANENTEMENTE impedido de excluir a conta.
    if (erro.code === 'subscription_already_canceled' || /already been canceled/i.test(String(erro.message || ''))) {
      return 'ok';
    }

    // Último recurso: pergunta o estado real antes de bloquear a exclusão.
    const g = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: authBasic },
    });
    if (g.status === 404) return 'ok';
    if (g.ok) {
      const sub = await g.json().catch(() => ({}));
      if (sub && sub.status === 'canceled') return 'ok';
    }

    console.error('[olli-conta] cancelar assinatura falhou:', r.status, erro.code, erro.message);
    return 'erro';
  } catch (e) {
    console.error('[olli-conta] cancelar assinatura erro:', e && (e.message || e));
    return 'erro';
  }
}

/**
 * Apaga o usuário em auth.users via Admin API do GoTrue. O cascade das FKs
 * (definido no schema multi-tenant) limpa os dados vinculados ao user_id.
 * Retorna true em sucesso.
 */
async function excluirUsuarioAuth(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE', headers: sbHeaders(env) },
    );
    // 200/204 = apagado. 404 = já não existe (idempotente: consideramos sucesso).
    if (r.ok || r.status === 404) return true;
    const txt = await r.text().catch(() => '');
    console.error('[olli-conta] excluir usuario falhou:', r.status, txt.slice(0, 200));
    return false;
  } catch (e) {
    console.error('[olli-conta] excluir usuario erro:', e && (e.message || e));
    return false;
  }
}

// ─── SIGN IN WITH APPLE — revogação na exclusão de conta ─────
/**
 * A Apple exige (App Store Review Guideline 5.1.1(v), em vigor desde 30/06/2022)
 * que um app que oferece "Sign in with Apple" E exclusão de conta REVOGUE os
 * tokens do usuário ao excluir — não basta apagar o registro do nosso lado.
 * Sem isso, o app continua listado no Apple ID da pessoa ("Entrar com a Apple →
 * OLLI") depois de ela ter apagado a conta, e o revisor reprova.
 *
 * O QUE ESTÁ PRONTO E O QUE FALTA — sem meias palavras:
 *
 *   [PRONTO, aqui] montar o `client_secret` (JWT ES256 assinado com a chave .p8),
 *     trocar o `authorizationCode` por um `refresh_token` em /auth/token e chamar
 *     /auth/revoke. Tudo abaixo roda de verdade assim que as duas peças chegarem.
 *
 *   [FALTA — humano] os 4 secrets do worker, que só existem com conta Apple
 *     Developer paga (`wrangler secret put`):
 *       APPLE_TEAM_ID     — Team ID (10 chars) do Apple Developer
 *       APPLE_KEY_ID      — Key ID da chave "Sign in with Apple" (.p8)
 *       APPLE_PRIVATE_KEY — conteúdo do .p8 (PEM; `\n` literal também é aceito)
 *       APPLE_CLIENT_ID   — para o fluxo NATIVO do iOS é o BUNDLE ID
 *                           (`online.olliorcamentos.app`, ver app.json), NÃO o
 *                           Services ID — este é o erro clássico e devolve
 *                           `invalid_client` sem explicar nada.
 *
 *   [FALTA — app] mandar `appleAuthorizationCode` no corpo de POST /conta/excluir.
 *     Hoje `src/services/appleAuth.ts` recebe `credencial.authorizationCode` do
 *     `expo-apple-authentication` e o DESCARTA (usa só o `identityToken` no
 *     `signInWithIdToken`). O código da Apple vale ~5 minutos, então guardá-lo
 *     desde o login não serve: quem exclui a conta meses depois teria um código
 *     morto. O caminho certo é pedir um código NOVO na hora da exclusão
 *     (`Apple.signInAsync()` de novo, imediatamente antes de chamar o worker) e
 *     mandá-lo neste corpo — o que, de quebra, é a reautenticação que uma ação
 *     destrutiva merece. Guardar `refresh_token` no banco seria a alternativa, e
 *     é PIOR: exige coluna nova (migration) para hospedar uma credencial de longa
 *     duração que só serve para este momento.
 *
 * POR QUE FALHAR AQUI NÃO BLOQUEIA A EXCLUSÃO (diferente da assinatura): a mesma
 * guideline que pede a revogação EXIGE que a exclusão funcione. Travar o botão
 * "excluir minha conta" porque a Apple não respondeu — ou, hoje, porque os
 * secrets não existem — reprovaria na review pelo item mais grave dos dois, e
 * deixaria o usuário preso numa conta que ele pediu para apagar. Assinatura viva
 * custa dinheiro do usuário TODO MÊS; token não revogado custa uma linha a mais
 * na tela do Apple ID dele, que ele mesmo remove. Por isso: best-effort, com log
 * alto, e a UI do app ensina o caminho manual.
 */
const APPLE_AUTH = 'https://appleid.apple.com/auth';

/** base64url de bytes (sem `=`), o alfabeto que o JWT exige. */
function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url de texto (o JWT da Apple é ASCII, mas TextEncoder evita surpresa). */
function b64urlTexto(txt) {
  return b64url(new TextEncoder().encode(txt));
}

/**
 * Bytes PKCS#8 de uma chave .p8 em PEM. Tolera o `\n` LITERAL (dois caracteres)
 * porque é assim que a chave costuma sobreviver a um copiar-colar para
 * `wrangler secret put` — sem isso o base64 vem sujo e o importKey falha com uma
 * mensagem que não aponta para a causa.
 */
function pkcs8DoPem(pem) {
  const corpo = String(pem || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  if (!corpo) return null;
  try {
    const bin = atob(corpo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * `client_secret` da Apple: JWT ES256 assinado com a chave .p8. `null` quando
 * falta secret ou a chave não importa — quem chama trata como "não configurado",
 * NUNCA como "revogado".
 *
 * O `sign` de ECDSA no runtime do Worker já devolve a assinatura crua r||s (64
 * bytes), que é exatamente o formato que o JOSE pede em ES256 — nada de DER.
 * `exp` curto (5 min) de propósito: o JWT é montado por chamada, não guardado.
 */
async function clientSecretApple(env) {
  const { APPLE_TEAM_ID: team, APPLE_KEY_ID: kid, APPLE_CLIENT_ID: clientId, APPLE_PRIVATE_KEY: pem } = env;
  if (!team || !kid || !clientId || !pem) return null;
  const pkcs8 = pkcs8DoPem(pem);
  if (!pkcs8) {
    console.error('[olli-conta] APPLE_PRIVATE_KEY não parece um .p8 em PEM — revogação Apple desligada');
    return null;
  }
  try {
    const chave = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const agora = Math.floor(Date.now() / 1000);
    const cabecalho = b64urlTexto(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
    const payload = b64urlTexto(JSON.stringify({
      iss: team, iat: agora, exp: agora + 300, aud: 'https://appleid.apple.com', sub: clientId,
    }));
    const assinatura = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      chave,
      new TextEncoder().encode(`${cabecalho}.${payload}`),
    );
    return `${cabecalho}.${payload}.${b64url(new Uint8Array(assinatura))}`;
  } catch (e) {
    console.error('[olli-conta] falha ao assinar client_secret da Apple:', e && (e.message || e));
    return null;
  }
}

/**
 * Troca o `authorizationCode` (válido ~5 min) por um `refresh_token`. É o token
 * que /auth/revoke aceita para derrubar a autorização INTEIRA — revogar só o
 * access_token deixaria o app ainda listado no Apple ID do usuário.
 */
async function trocarCodigoApple(env, code, clientSecret) {
  const corpo = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env.APPLE_CLIENT_ID,
    client_secret: clientSecret,
  });
  const r = await fetch(`${APPLE_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('[olli-conta] Apple /auth/token recusou:', r.status, txt.slice(0, 200));
    return null;
  }
  const d = await r.json().catch(() => null);
  return d && typeof d.refresh_token === 'string' && d.refresh_token ? d.refresh_token : null;
}

/**
 * Revoga o token na Apple. 'ok' só quando ela CONFIRMA (200) — "não sei se
 * revoguei" não vira "revoguei", pela mesma regra que vale para o resto do
 * arquivo. Aqui a consequência de 'erro' é só um log e o caminho manual na UI.
 */
async function revogarTokenApple(env, token, clientSecret) {
  const corpo = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    client_secret: clientSecret,
    token,
    token_type_hint: 'refresh_token',
  });
  const r = await fetch(`${APPLE_AUTH}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  if (r.ok) return 'ok';
  const txt = await r.text().catch(() => '');
  console.error('[olli-conta] Apple /auth/revoke recusou:', r.status, txt.slice(0, 200));
  return 'erro';
}

/**
 * Revoga o Sign in with Apple deste usuário. QUATRO estados, porque cada um pede
 * uma providência diferente de quem lê o log — e nenhum deles bloqueia a exclusão:
 *   'ok'              → a Apple confirmou
 *   'sem_codigo'      → o app não mandou `appleAuthorizationCode` (é o estado de
 *                       HOJE; ver o [FALTA — app] no topo da seção)
 *   'nao_configurado' → faltam os secrets APPLE_* ([FALTA — humano])
 *   'erro'            → tentamos de verdade e a Apple recusou/caiu
 * Nunca lança: exclusão de conta não pode morrer por causa desta etapa.
 */
export async function revogarSignInApple(env, authorizationCode) {
  if (!authorizationCode) return 'sem_codigo';
  try {
    const clientSecret = await clientSecretApple(env);
    if (!clientSecret) return 'nao_configurado';
    const refresh = await trocarCodigoApple(env, authorizationCode, clientSecret);
    if (!refresh) return 'erro';
    return await revogarTokenApple(env, refresh, clientSecret);
  } catch (e) {
    console.error('[olli-conta] revogação Apple erro:', e && (e.message || e));
    return 'erro';
  }
}

/**
 * O usuário entrou com a Apple? TRÊS estados — 'sim' | 'nao' | 'indeterminado'.
 * Lê o `app_metadata` do JWT já validado em /auth/v1/user. Se o GoTrue não trouxe
 * provedor nenhum, é 'indeterminado' e NÃO 'nao': tratar ausência de informação
 * como "não usa Apple" faria a gente calar justamente o log que existe para
 * lembrar que a revogação ficou pela metade.
 */
function usouApple(user) {
  const meta = (user && user.app_metadata) || {};
  const lista = Array.isArray(meta.providers) ? meta.providers.filter((p) => typeof p === 'string') : [];
  if (lista.length) return lista.includes('apple') ? 'sim' : 'nao';
  if (typeof meta.provider === 'string' && meta.provider) return meta.provider === 'apple' ? 'sim' : 'nao';
  return 'indeterminado';
}

// ─── POST /conta/excluir ─────────────────────────────────────
export async function handleContaExcluir(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  // Contador PRÓPRIO: sem o prefixo, /conta/excluir divide chave e balde (STRIPE_RL,
  // 10/60s) com /stripe/checkout e /stripe/portal. Como as falhas retryáveis acima
  // convidam o usuário a tentar de novo, uma rajada de tentativas de exclusão
  // esgotaria o balde e devolveria 429 justamente no Portal — o caminho que a Apple
  // exige para CANCELAR a assinatura.
  if (!(await rateOk(env, `excluir:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, erro: 'backend_nao_configurado' }, 503);
  }

  // Corpo OPCIONAL (o app de hoje manda `{}`): só carrega o
  // `appleAuthorizationCode` da revogação do Sign in with Apple. Duas camadas de
  // teto, como no index.js — `cabeNoTeto` rejeita pelo Content-Length sem ler
  // nada, e a conferência do texto pega quem mentiu no header (chunked não traz
  // header). Sem isso, começar a ler o corpo nesta rota abriria uma porta de
  // memória que ela não tinha. Corpo ilegível NÃO é erro: a exclusão segue sem a
  // revogação, que é best-effort de qualquer jeito.
  if (!cabeNoTeto(request, TETO.JSON).ok) return json({ ok: false, erro: 'payload_grande' }, 413);
  let corpoTexto = '';
  try {
    corpoTexto = await request.text();
  } catch {
    corpoTexto = '';
  }
  if (!textoCabeNoTeto(corpoTexto, TETO.JSON)) return json({ ok: false, erro: 'payload_grande' }, 413);
  const corpo = parseJsonBody(corpoTexto);
  const codigoApple = typeof corpo.appleAuthorizationCode === 'string'
    ? corpo.appleAuthorizationCode.trim().slice(0, 2048)
    : '';

  // Cancela a assinatura Stripe ativa ANTES de apagar o usuário, e BLOQUEIA a
  // exclusão se o cancelamento falhar. Apagar o usuário com a subscription viva
  // deixaria o cartão sendo cobrado sem nenhuma conta pela qual cancelar — e os
  // webhooks seguintes bateriam em FK órfã (user_id inexistente), fazendo a
  // Stripe reenviar em loop. 502 é retryável: o app pode tentar de novo.
  const assinatura = await getAssinatura(env, user.id);

  // Falha ao LER a assinatura não é "não tem assinatura": é não saber. Apagar aqui
  // arriscaria exatamente a cobrança órfã que este bloco existe para evitar.
  if (assinatura && assinatura.error) {
    return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }
  if (assinatura && assinatura.stripe_subscription_id) {
    const r = await cancelarAssinaturaStripe(env, assinatura.stripe_subscription_id);
    if (r !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }

  // MERCADO PAGO — mesma regra, mesmo motivo. O gateway de Pix/assinatura do OLLI
  // hoje é o MP (docs/MERCADOPAGO.md), e a assinatura recorrente dele (preapproval)
  // é cartão: continuava cobrando depois da conta apagada, porque este bloco só
  // conhecia a Stripe. Cobrança indevida contra alguém que nem tem mais conta para
  // reclamar — por isso é fail-closed igual à Stripe.
  const preapproval = await lerPreapprovalGravado(env, user.id);
  if (preapproval.error) return json({ ok: false, erro: 'falha_cancelamento' }, 502); // não sei ≠ não tem
  if (preapproval.ausente) {
    // A coluna mp_preapproval_id ainda não existe (migration 20260728 não aplicada).
    // Aqui NÃO dá para saber se há assinatura no MP — e travar a exclusão de todo
    // mundo seria pior (a Apple exige o caminho de exclusão, e nenhuma assinatura
    // recorrente do MP foi vendida antes desta migration: a rota /mp/plano/assinatura
    // não está exposta na UI). Segue, deixando rastro para o dono reconciliar.
    console.error('[olli-conta] mp_preapproval_id indisponível (migration 20260728?) — excluindo sem checar o MP:', user.id);
  } else if (preapproval.id) {
    const r = await cancelarPreapprovalMp(env, preapproval.id);
    if (r !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }

  // SIGN IN WITH APPLE — revoga a autorização (Guideline 5.1.1(v)). Roda DEPOIS
  // dos bloqueios acima de propósito: só faz sentido revogar quando a exclusão
  // vai mesmo acontecer — revogar e então parar em `falha_cancelamento` deixaria
  // o usuário com a conta viva e o login da Apple derrubado à toa. E é
  // best-effort: NUNCA impede a exclusão (o porquê está na seção lá em cima).
  const apple = usouApple(user);
  if (apple !== 'nao') {
    const revogacao = await revogarSignInApple(env, codigoApple);
    if (revogacao !== 'ok') {
      // Log alto e específico: cada estado tem uma providência diferente, e sem
      // dizer QUAL deles ocorreu o dono só saberia que "algo" não revogou.
      console.error(
        '[olli-conta] Sign in with Apple NÃO revogado —',
        revogacao,
        '(provedor:', apple, ') user:', user.id,
        '— a conta foi apagada mesmo assim (a Guideline exige que a exclusão funcione);',
        'o usuário remove pelo Apple ID, como a ContaScreen instrui.',
      );
    }
  }

  // Exclusão de verdade: apaga o usuário em auth.users (id vem do JWT validado).
  const ok = await excluirUsuarioAuth(env, user.id);
  if (!ok) return json({ ok: false, erro: 'falha_exclusao' }, 502);

  return json({ ok: true });
}

// ─── roteador das rotas /conta/* ─────────────────────────────
export const CONTA_ROUTES_PREFIX = '/conta/';

/**
 * Ponto de entrada único para qualquer path /conta/*. Chamado pelo index.js
 * (ver observações da Frente 2: o index.js precisa delegar /conta/ para cá,
 * exatamente como já faz com /stripe/ e /equipe/).
 */
export async function handleConta(request, env, url) {
  const path = url.pathname;

  if (path === '/conta/excluir') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST') return handleContaExcluir(request, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }

  return json({ erro: 'nao_encontrado' }, 404);
}
