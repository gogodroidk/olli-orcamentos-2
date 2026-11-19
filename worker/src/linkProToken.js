/**
 * Token do LINK DE PAGAMENTO DO PRO (CQ-LINK-PAGAR-PRO). Módulo PURO, sem import:
 * o worker (linkPagarPro.js) e o gerador da equipe (worker/scripts/link-pagar-pro.mjs)
 * usam exatamente a mesma assinatura e a mesma conferência.
 *
 *   token = base64url(JSON {v, uid, plano, periodo, exp}) + "." + base64url(HMAC-SHA256)
 *   HMAC sobre "linkpro.v1." + parte1, com o segredo LINK_PAGAMENTO_SECRET (≥ 32 caracteres).
 *
 * O token só diz QUAL CONTA paga QUAL PLANO até QUANDO. Não leva nome, e-mail, telefone
 * nem preço: o preço sai sempre do catálogo do servidor (PLANO_PIX), nunca do link.
 * Quem tem o link só consegue PAGAR por aquela conta; não entra nela.
 */

export const LINK_PRO_VERSAO = 1;
/** Validade do link: 14 dias. */
export const LINK_PRO_VALIDADE_S = 14 * 86400;
/** Folga aceita além da validade (relógio de quem gerou). Token com exp mais longe que isto é recusado. */
const FOLGA_EXP_S = 86400;
const SEGREDO_MIN = 32;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_RE = /^([A-Za-z0-9_-]{20,400})\.([A-Za-z0-9_-]{43})$/;

const enc = new TextEncoder();

function base64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Segredo como bytes, ou null se ausente/curto (sem segredo confiável = link desligado). */
export function segredoLinkPro(valor) {
  const s = typeof valor === 'string' ? valor.trim() : '';
  return s.length >= SEGREDO_MIN ? enc.encode(s) : null;
}

async function hmac(segredo, mensagem) {
  const chave = await crypto.subtle.importKey('raw', segredo, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', chave, enc.encode(mensagem)));
}

function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Assina um payload qualquer. Exportada só para os testes forjarem token de outro plano. */
export async function assinarPayloadLinkPro(segredo, payload) {
  if (!(segredo instanceof Uint8Array)) throw new Error('link_pro_sem_segredo');
  const corpo = base64Url(enc.encode(JSON.stringify(payload)));
  return `${corpo}.${base64Url(await hmac(segredo, `linkpro.v1.${corpo}`))}`;
}

/** Períodos do Pro que o link vende (19/11: o 1º cliente do dia escolheu o anual). */
export const PERIODOS_LINK_PRO = Object.freeze(['mensal', 'anual']);

/** Gera o token do Pro (mensal por padrão, ou anual) para a conta `uid`, válido por 14 dias a partir de `agoraS`. */
export async function assinarLinkPro(segredo, { uid, periodo = 'mensal', agoraS = Math.floor(Date.now() / 1000), validadeS = LINK_PRO_VALIDADE_S }) {
  const id = typeof uid === 'string' ? uid.trim().toLowerCase() : '';
  if (!UUID_RE.test(id)) throw new Error('link_pro_uid_invalido');
  if (!(validadeS > 0 && validadeS <= LINK_PRO_VALIDADE_S)) throw new Error('link_pro_validade_invalida');
  if (!PERIODOS_LINK_PRO.includes(periodo)) throw new Error('link_pro_periodo_invalido');
  return assinarPayloadLinkPro(segredo, { v: LINK_PRO_VERSAO, uid: id, plano: 'pro', periodo, exp: agoraS + validadeS });
}

/**
 * Confere o token. `{ ok:true, uid, exp }` ou `{ ok:false, motivo }`, motivo:
 *   'formato' | 'assinatura' (adulterado ou outro segredo) | 'plano' (não é Pro mensal nem anual) | 'vencido'.
 * A assinatura é conferida ANTES de ler o conteúdo: nada do token é confiado sem ela.
 */
export async function verificarLinkPro(segredo, token, agoraS = Math.floor(Date.now() / 1000)) {
  if (!(segredo instanceof Uint8Array)) return { ok: false, motivo: 'formato' };
  const m = typeof token === 'string' ? TOKEN_RE.exec(token) : null;
  if (!m) return { ok: false, motivo: 'formato' };
  const esperada = base64Url(await hmac(segredo, `linkpro.v1.${m[1]}`));
  if (!compararConstante(esperada, m[2])) return { ok: false, motivo: 'assinatura' };
  let p;
  try {
    p = JSON.parse(new TextDecoder().decode(deBase64Url(m[1])));
  } catch {
    return { ok: false, motivo: 'formato' };
  }
  if (!p || typeof p !== 'object' || p.v !== LINK_PRO_VERSAO || typeof p.uid !== 'string' || !UUID_RE.test(p.uid)) {
    return { ok: false, motivo: 'formato' };
  }
  if (p.plano !== 'pro' || !PERIODOS_LINK_PRO.includes(p.periodo)) return { ok: false, motivo: 'plano' };
  if (!Number.isInteger(p.exp) || p.exp > agoraS + LINK_PRO_VALIDADE_S + FOLGA_EXP_S) return { ok: false, motivo: 'formato' };
  if (p.exp <= agoraS) return { ok: false, motivo: 'vencido' };
  return { ok: true, uid: p.uid, periodo: p.periodo, exp: p.exp };
}
