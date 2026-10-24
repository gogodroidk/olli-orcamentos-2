/**
 * VERIFICAÇÃO DE JWS DA APPLE (StoreKit 2 / App Store Server Notifications v2) — SEM SDK, só WebCrypto.
 *
 * Toda coisa que a Apple assina (signedTransactionInfo, signedRenewalInfo, signedPayload) é um JWS
 * ES256 cujo header traz `x5c` = [folha, intermediária, raiz]. Autenticidade = a CADEIA, não um
 * segredo compartilhado. Algoritmo igual ao da biblioteca oficial (apple/app-store-server-library-node,
 * Apache-2.0: ChainVerifier) sem a checagem OCSP (opcional lá; aqui, a trava é a raiz FIXADA):
 *
 *  1. header.alg === 'ES256' e x5c com EXATAMENTE 3 certificados (nada de alg none/HS256/cadeia curta);
 *  2. a RAIZ do x5c tem SHA-256 igual ao da "Apple Root CA - G3" fixada neste arquivo
 *     (ou a uma raiz de teste injetada em `raizes`, só nos testes);
 *  3. folha assinada pela intermediária, intermediária assinada pela raiz, raiz auto-assinada
 *     (assinaturas ECDSA verificadas com a chave pública do emissor);
 *  4. as três vigentes na data de assinatura (`signedDate` do payload; sem ela, agora) — a folha da
 *     Apple dura ~1 ano, então transação antiga é conferida na data em que foi assinada;
 *  5. as extensões-marca da Apple (OIDs 1.2.840.113635.100.6.11.1 na folha e 1.2.840.113635.100.6.2.1
 *     na intermediária): um certificado qualquer encadeado na raiz da Apple (ex.: de outro produto)
 *     não vale;
 *  6. assinatura JWS (r||s, P-256/SHA-256) verificada com a chave da folha.
 *
 * Falhou qualquer passo = lança `AppleJwsErro` com `codigo` estável; nunca devolve payload não verificado.
 * Nada aqui loga o JWS nem o payload.
 */

/** SHA-256 (hex minúsculo) do certificado "Apple Root CA - G3" (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer, expira 30/04/2039). */
export const RAIZ_APPLE_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

const OID_FOLHA_APPLE = '1.2.840.113635.100.6.11.1';
const OID_INTERMEDIARIA_APPLE = '1.2.840.113635.100.6.2.1';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_ECDSA_SHA384 = '1.2.840.10045.4.3.3';
const OID_CURVA = { '1.2.840.10045.3.1.7': { nome: 'P-256', bytes: 32 }, '1.3.132.0.34': { nome: 'P-384', bytes: 48 } };
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

export class AppleJwsErro extends Error {
  constructor(codigo) {
    super(codigo);
    this.name = 'AppleJwsErro';
    this.codigo = codigo;
  }
}
const falha = (codigo) => {
  throw new AppleJwsErro(codigo);
};

// ─── base64 / hex ─────────────────────────────────────────────
function b64Bytes(texto, url = false) {
  try {
    let s = String(texto);
    if (url) s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return falha('base64_invalido');
  }
}
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256Hex(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

// ─── DER mínimo ───────────────────────────────────────────────
/** Lê um TLV em `buf` a partir de `pos`. Devolve { tag, inicio (do valor), fim, prox }. */
function tlv(buf, pos) {
  if (pos + 2 > buf.length) falha('der_invalido');
  const tag = buf[pos];
  let len = buf[pos + 1];
  let inicio = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4 || inicio + n > buf.length) falha('der_invalido');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[inicio + i];
    inicio += n;
  }
  const fim = inicio + len;
  if (fim > buf.length) falha('der_invalido');
  return { tag, inicio, fim, prox: fim, ini0: pos };
}
function filhos(buf, no) {
  const lista = [];
  let p = no.inicio;
  while (p < no.fim) {
    const f = tlv(buf, p);
    lista.push(f);
    p = f.prox;
  }
  return lista;
}
function oid(buf, no) {
  if (no.tag !== 0x06) falha('der_invalido');
  const b = buf.subarray(no.inicio, no.fim);
  const partes = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      partes.push(v);
      v = 0;
    }
  }
  return partes.join('.');
}
/** Data ASN.1 (UTCTime 0x17 ou GeneralizedTime 0x18) → ms. */
function dataAsn1(buf, no) {
  const s = new TextDecoder().decode(buf.subarray(no.inicio, no.fim));
  const m = no.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return falha('data_invalida');
  let ano = Number(m[1]);
  if (no.tag === 0x17) ano += ano >= 50 ? 1900 : 2000;
  return Date.UTC(ano, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}
/** INTEGER positivo → bytes sem zeros à esquerda, preenchido a `tam`. */
function inteiroPara(buf, no, tam) {
  let b = buf.subarray(no.inicio, no.fim);
  while (b.length > 1 && b[0] === 0) b = b.subarray(1);
  if (b.length > tam) falha('assinatura_invalida');
  const out = new Uint8Array(tam);
  out.set(b, tam - b.length);
  return out;
}

/** Decompõe um certificado X.509 DER. */
function lerCertificado(der) {
  const raiz = tlv(der, 0);
  const [tbs, algAssin, assin] = filhos(der, raiz);
  if (!tbs || !algAssin || !assin || tbs.tag !== 0x30) falha('certificado_invalido');
  const campos = filhos(der, tbs);
  let i = 0;
  if (campos[0].tag === 0xa0) i = 1; // [0] version
  const [, , , validade, , spki] = [campos[i], campos[i + 1], campos[i + 2], campos[i + 3], campos[i + 4], campos[i + 5]];
  if (!validade || !spki) falha('certificado_invalido');
  const [nbf, naf] = filhos(der, validade);
  const spkiCampos = filhos(der, spki);
  const algoritmoChave = filhos(der, spkiCampos[0]);
  const curva = OID_CURVA[oid(der, algoritmoChave[1])];
  if (oid(der, algoritmoChave[0]) !== '1.2.840.10045.2.1' || !curva) falha('chave_nao_suportada');
  const algAssinOid = oid(der, filhos(der, algAssin)[0]);
  if (algAssinOid !== OID_ECDSA_SHA256 && algAssinOid !== OID_ECDSA_SHA384) falha('algoritmo_nao_suportado');
  // Extensões: [3] EXPLICIT SEQUENCE OF Extension
  const oids = new Set();
  const ext = campos.find((c) => c.tag === 0xa3);
  if (ext) {
    const lista = filhos(der, filhos(der, ext)[0]);
    for (const e of lista) oids.add(oid(der, filhos(der, e)[0]));
  }
  // BIT STRING da assinatura: 1º byte = bits não usados (0).
  const sigDer = der.subarray(assin.inicio + 1, assin.fim);
  const sigSeq = tlv(sigDer, 0);
  const [r, s] = filhos(sigDer, sigSeq);
  return {
    der,
    tbs: der.subarray(tbs.ini0, tbs.prox),
    spki: der.subarray(spki.ini0, spki.prox),
    curva,
    hash: algAssinOid === OID_ECDSA_SHA384 ? 'SHA-384' : 'SHA-256',
    assinatura: (tam) => {
      const out = new Uint8Array(tam * 2);
      out.set(inteiroPara(sigDer, r, tam), 0);
      out.set(inteiroPara(sigDer, s, tam), tam);
      return out;
    },
    naoAntes: dataAsn1(der, nbf),
    naoDepois: dataAsn1(der, naf),
    oids,
  };
}

async function chavePublica(cert) {
  return crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: cert.curva.nome }, false, ['verify']);
}
/** `cert` foi assinado por `emissor`? */
async function assinadoPor(cert, emissor) {
  const chave = await chavePublica(emissor);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: cert.hash }, chave, cert.assinatura(emissor.curva.bytes), cert.tbs);
  return ok === true;
}

/**
 * Verifica o JWS e devolve o payload (objeto). `opcoes.raizes` (testes): lista de SHA-256 hex aceitos
 * no lugar da raiz da Apple. `opcoes.agora` (ms): relógio injetável. `opcoes.exigirMarcaApple` (padrão true).
 */
export async function verificarJwsApple(jws, opcoes = {}) {
  const { raizes = [RAIZ_APPLE_G3_SHA256], agora = Date.now(), exigirMarcaApple = true } = opcoes;
  if (typeof jws !== 'string' || jws.length > 20000) falha('jws_invalido');
  const partes = jws.split('.');
  if (partes.length !== 3 || partes.some((p) => p === '')) falha('jws_invalido');
  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64Bytes(partes[0], true)));
    payload = JSON.parse(new TextDecoder().decode(b64Bytes(partes[1], true)));
  } catch (e) {
    if (e instanceof AppleJwsErro) throw e;
    return falha('jws_invalido');
  }
  if (!header || header.alg !== 'ES256') falha('algoritmo_invalido');
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3 || header.x5c.some((c) => typeof c !== 'string')) falha('cadeia_invalida');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) falha('payload_invalido');

  const ders = header.x5c.map((c) => b64Bytes(c));
  const [folha, inter, raiz] = ders.map(lerCertificado);

  // 2. raiz fixada
  const hashRaiz = await sha256Hex(raiz.der);
  if (!raizes.includes(hashRaiz)) falha('raiz_nao_confiavel');

  // 4. data de referência = quando a Apple assinou (limitada a "agora" + tolerância)
  const assinadoEm = Number.isFinite(payload.signedDate) ? payload.signedDate : agora;
  if (assinadoEm > agora + TOLERANCIA_FUTURO_MS) falha('assinado_no_futuro');
  for (const c of [folha, inter, raiz]) {
    if (assinadoEm < c.naoAntes || assinadoEm > c.naoDepois) falha('certificado_fora_da_validade');
  }

  // 3. encadeamento
  if (!(await assinadoPor(folha, inter))) falha('cadeia_invalida');
  if (!(await assinadoPor(inter, raiz))) falha('cadeia_invalida');
  if (!(await assinadoPor(raiz, raiz))) falha('raiz_nao_autoassinada');

  // 5. marca Apple
  if (exigirMarcaApple && (!folha.oids.has(OID_FOLHA_APPLE) || !inter.oids.has(OID_INTERMEDIARIA_APPLE))) falha('certificado_sem_marca_apple');

  // 6. assinatura do JWS com a chave da folha (r||s, 64 bytes)
  if (folha.curva.nome !== 'P-256') falha('chave_nao_suportada');
  const sig = b64Bytes(partes[2], true);
  if (sig.length !== 64) falha('assinatura_invalida');
  const dados = new TextEncoder().encode(`${partes[0]}.${partes[1]}`);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await chavePublica(folha), sig, dados);
  if (ok !== true) falha('assinatura_invalida');
  return payload;
}
