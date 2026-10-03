/**
 * TOKEN OAUTH DO GOOGLE para a conta de serviço da Play — OLLI (worker, SEM SDK).
 *
 * Fluxo "JWT bearer" de conta de serviço (RFC 7523): o worker assina um JWT RS256
 * com a chave privada da conta `olli-play-verify@claude-motor` e troca por um
 * access token em https://oauth2.googleapis.com/token. Um token só serve às duas
 * APIs que o OLLI usa com essa conta:
 *   - androidpublisher (subscriptionsv2.get/cancel, acknowledge, voidedpurchases)
 *   - pubsub           (pull/acknowledge da assinatura do RTDN)
 *
 * A conta não tem papel nenhum no projeto GCP (decisão C8): o escopo pedido aqui
 * não dá poder; quem dá é a permissão na Play ("ver dados financeiros" e
 * "gerenciar pedidos e assinaturas") e o `roles/pubsub.subscriber` só na
 * assinatura `olli-play-rtdn-worker`.
 *
 * SEGREDOS (inegociável):
 *  - A chave vem SÓ do secret `PLAY_SA_JSON` (o JSON baixado do GCP, inteiro).
 *    Nunca em var, nunca no app, nunca em log.
 *  - Nenhuma mensagem de erro daqui carrega chave, JWT ou access token: só o
 *    MOTIVO ('sem_credencial', 'chave_invalida', 'google_<status>', 'rede').
 *  - O access token fica em cache na memória do isolate e no KV `CACHE` até 60 s
 *    antes de vencer — o cron acorda isolates novos o tempo todo, e
 *    assinar RSA + ir ao Google a cada minuto gastaria CPU e cota à toa. A escrita
 *    acontece ~1 vez por hora (cota Free: 1.000/dia).
 *  - No KV o token vai CIFRADO (AES-GCM, chave derivada da `private_key` do
 *    `PLAY_SA_JSON`, que só existe como secret). O KV é legível no painel e por
 *    qualquer token da Cloudflare com leitura de KV; o access token tem escopo
 *    androidpublisher (a conta pode cancelar e estornar) — em claro ele viraria um
 *    segredo legível fora dos secrets. Quem lê o KV sem a chave vê só bytes.
 *  - `esquecerTokenGoogle` apaga memória e KV: quem recebe 401 do Google chama e
 *    tenta UMA vez com token novo (token revogado não fica servindo 401 por 1 h).
 *
 * Erro nunca vira token: sem credencial, com chave que não importa ou com o Google
 * fora, a resposta é `{ ok:false, motivo }` e quem chama decide (rota → 503,
 * cron → tenta no próximo minuto). Nunca um "segue sem verificar".
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const ESCOPOS_PLAY = Object.freeze([
  'https://www.googleapis.com/auth/androidpublisher',
  'https://www.googleapis.com/auth/pubsub',
]);

/** Margem antes do vencimento em que o token deixa de ser reaproveitado. */
const MARGEM_MS = 60 * 1000;

/** Vida pedida ao Google para o JWT de troca (máximo permitido: 1 h). */
const VIDA_JWT_S = 3600;

// v2: valor cifrado (v1 era texto puro e nunca foi publicado).
const KV_PREFIXO = 'play:gtoken:v2:';

/** Cache do isolate: chave = e-mail da conta + escopos. */
const memoria = new Map();

/** Só para os testes: zera o cache de memória do isolate. */
export function limparCacheTokenGoogle() {
  memoria.clear();
}

/**
 * Lê e confere o `PLAY_SA_JSON`. `null` quando ausente ou malformado — e
 * malformado é tratado igual a ausente (desligado), nunca como "tenta assim mesmo".
 * @returns {{ email: string, chavePem: string, kid: string | null } | null}
 */
export function credencialPlay(env) {
  const bruto = typeof env?.PLAY_SA_JSON === 'string' ? env.PLAY_SA_JSON.trim() : '';
  if (!bruto) return null;
  let sa;
  try {
    sa = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!sa || typeof sa !== 'object') return null;
  const email = typeof sa.client_email === 'string' ? sa.client_email.trim() : '';
  const chavePem = typeof sa.private_key === 'string' ? sa.private_key : '';
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)) return null;
  if (!chavePem.includes('PRIVATE KEY')) return null;
  const kid = typeof sa.private_key_id === 'string' && sa.private_key_id ? sa.private_key_id : null;
  return { email, chavePem, kid };
}

/** base64url de bytes (sem `=`), o alfabeto que o JWT exige. */
function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(obj) {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

/**
 * Bytes PKCS#8 de uma chave em PEM. Tolera o `\n` LITERAL (dois caracteres),
 * que é como a chave costuma sobreviver a um copiar-colar — mesmo cuidado do
 * `pkcs8DoPem` de conta.js (lá a chave é ES256 da Apple; aqui RSA do GCP).
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

/** Monta e assina o JWT de troca. `null` se a chave não importar. */
async function assinarJwt(cred, escopos, agoraS) {
  const pkcs8 = pkcs8DoPem(cred.chavePem);
  if (!pkcs8) return null;
  let chave;
  try {
    chave = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    return null;
  }
  const cabecalho = { alg: 'RS256', typ: 'JWT' };
  if (cred.kid) cabecalho.kid = cred.kid;
  const entrada = `${b64urlJson(cabecalho)}.${b64urlJson({
    iss: cred.email,
    scope: escopos.join(' '),
    aud: TOKEN_URL,
    iat: agoraS,
    exp: agoraS + VIDA_JWT_S,
  })}`;
  try {
    const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(entrada));
    return `${entrada}.${b64url(new Uint8Array(assinatura))}`;
  } catch {
    return null;
  }
}

function valido(item, agoraMs) {
  return !!item && typeof item.token === 'string' && item.token && Number.isFinite(item.expMs) && agoraMs < item.expMs - MARGEM_MS;
}

/** bytes → base64 padrão (o valor no KV é JSON, não URL). */
function b64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function deB64(texto) {
  const bin = atob(String(texto || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Chave AES-GCM do cache: SHA-256 da `private_key` + rótulo fixo. Só quem tem o
 * secret `PLAY_SA_JSON` (o próprio worker) consegue derivar.
 */
async function chaveDoCache(cred) {
  const bruto = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${cred.chavePem}|olli-kv-cache-v2`));
  return crypto.subtle.importKey('raw', bruto, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function lerKv(env, cred, chave, agoraMs) {
  if (!env?.CACHE || typeof env.CACHE.get !== 'function') return null;
  try {
    const bruto = await env.CACHE.get(chave);
    if (!bruto) return null;
    const cifrado = JSON.parse(bruto);
    if (!cifrado || typeof cifrado.iv !== 'string' || typeof cifrado.ct !== 'string') return null;
    const claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deB64(cifrado.iv) },
      await chaveDoCache(cred),
      deB64(cifrado.ct),
    );
    const item = JSON.parse(new TextDecoder().decode(claro));
    return valido(item, agoraMs) ? item : null;
  } catch {
    return null; // KV fora, valor adulterado ou de outra chave: só busca um token novo
  }
}

async function gravarKv(env, cred, chave, item, agoraMs) {
  if (!env?.CACHE || typeof env.CACHE.put !== 'function') return;
  const ttlS = Math.floor((item.expMs - MARGEM_MS - agoraMs) / 1000);
  if (ttlS < 60) return; // KV exige TTL >= 60 s; token tão curto não compensa guardar
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await chaveDoCache(cred),
      new TextEncoder().encode(JSON.stringify(item)),
    );
    await env.CACHE.put(chave, JSON.stringify({ iv: b64(iv), ct: b64(new Uint8Array(ct)) }), { expirationTtl: ttlS });
  } catch {
    // cache é otimização: falhar aqui não derruba a verificação
  }
}

/** Chaves do cache (memória e KV) da credencial + escopos. */
async function chavesDoCache(cred, escopos) {
  const chaveCache = `${cred.email}|${[...escopos].sort().join(' ')}`;
  // Chave do KV sem o e-mail em claro: o nome da chave aparece no painel do KV.
  return { chaveCache, kvChave: `${KV_PREFIXO}${await sha256Hex(chaveCache)}` };
}

/**
 * Esquece o token em cache (memória + KV). Chamado quando o Google responde 401:
 * o token foi revogado ou a chave trocou — o próximo `tokenGoogle` busca outro.
 */
export async function esquecerTokenGoogle(env, { escopos = ESCOPOS_PLAY } = {}) {
  const cred = credencialPlay(env);
  if (!cred) return;
  const { chaveCache, kvChave } = await chavesDoCache(cred, escopos);
  memoria.delete(chaveCache);
  if (env?.CACHE && typeof env.CACHE.delete === 'function') {
    try {
      await env.CACHE.delete(kvChave);
    } catch {
      // sem KV o valor vence sozinho; a memória já foi limpa
    }
  }
}

/**
 * Access token para as APIs da Play. Três estados reais, como o resto da casa:
 *   { ok:true, token }            → pode chamar o Google
 *   { ok:false, motivo:'sem_credencial'|'chave_invalida' } → desligado/configuração
 *   { ok:false, motivo:'google_<status>'|'rede'|'resposta_invalida' } → não sei agora
 * @param {object} env
 * @param {{ escopos?: readonly string[], agora?: number }} [opcoes]
 */
export async function tokenGoogle(env, { escopos = ESCOPOS_PLAY, agora = Date.now() } = {}) {
  const cred = credencialPlay(env);
  if (!cred) return { ok: false, motivo: 'sem_credencial' };

  const { chaveCache, kvChave } = await chavesDoCache(cred, escopos);
  const naMemoria = memoria.get(chaveCache);
  if (valido(naMemoria, agora)) return { ok: true, token: naMemoria.token };

  const doKv = await lerKv(env, cred, kvChave, agora);
  if (doKv) {
    memoria.set(chaveCache, doKv);
    return { ok: true, token: doKv.token };
  }

  const jwt = await assinarJwt(cred, escopos, Math.floor(agora / 1000));
  if (!jwt) return { ok: false, motivo: 'chave_invalida' };

  let r;
  try {
    r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
      ...(typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(10 * 1000) } : {}),
    });
  } catch {
    return { ok: false, motivo: 'rede' };
  }
  if (!r.ok) return { ok: false, motivo: `google_${r.status}` };
  const d = await r.json().catch(() => null);
  const token = d && typeof d.access_token === 'string' ? d.access_token : '';
  const expiraEmS = d && Number.isFinite(d.expires_in) ? d.expires_in : 0;
  if (!token || expiraEmS <= 0) return { ok: false, motivo: 'resposta_invalida' };

  const item = { token, expMs: agora + expiraEmS * 1000 };
  memoria.set(chaveCache, item);
  await gravarKv(env, cred, kvChave, item, agora);
  return { ok: true, token };
}

/** SHA-256 em hex minúsculo de um texto UTF-8 (WebCrypto; igual no Node e no Worker). */
export async function sha256Hex(texto) {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)));
  let out = '';
  for (const b of new Uint8Array(dig)) out += b.toString(16).padStart(2, '0');
  return out;
}
