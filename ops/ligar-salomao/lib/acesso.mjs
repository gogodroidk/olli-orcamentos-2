// Portão de acesso do "Ligar pro Salomão" (CQ-LIGAR-SALOMAO, 18/11/2026).
// Regras (fail-closed):
//  - Local (Host 127.0.0.1/localhost, sem cabeçalho do Cloudflare): liberado, como as outras páginas do PC.
//  - Remoto (veio pelo túnel): exige JWT do Cloudflare Access válido (RS256 pela JWKS do time, aud, iss, exp, e-mail do Igor).
//    Sem config de Access => remoto recusado (503). Mesma lógica auditada de Sistema/cerebro/central/acesso-remoto.mjs.
//  - Host fora da lista => 421 (defesa contra DNS rebinding).
import { createPublicKey, verify as cverify, createHash } from "node:crypto";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DIR_DADOS = process.env.LIGAR_DIR || join(homedir(), ".olli-ligar");
const LOG_F = join(DIR_DADOS, "acessos.jsonl");

/** Config do Access: { team, aud, email, host }. Padrão: a da Central de Comando (mesmo hostname/app do Access). */
export function lerConfigAcesso() {
  const f = process.env.LIGAR_ACESSO_JSON || join(homedir(), ".olli-central", "acesso.json");
  try {
    const c = JSON.parse(readFileSync(f, "utf8"));
    const team = String(process.env.LIGAR_ACCESS_TEAM || c.team || "");
    const aud = String(process.env.LIGAR_ACCESS_AUD || c.aud || "");
    const email = String(process.env.LIGAR_ACCESS_EMAIL || c.email || "").toLowerCase();
    if (!team || !aud || !email) return null;
    return { team, aud, email, host: String(process.env.LIGAR_HOST_REMOTO || "comando.ollizap.online").toLowerCase() };
  } catch { return null; }
}

export function log(evento, extra = {}) {
  try {
    mkdirSync(DIR_DADOS, { recursive: true, mode: 0o700 });
    appendFileSync(LOG_F, `${JSON.stringify({ em: new Date().toISOString(), evento, ...extra })}\n`, { mode: 0o600 });
  } catch {}
}

/** Veio pelo Cloudflare/túnel (cabeçalhos que só o edge põe) ou Host não-loopback. */
export function ehRemoto(req) {
  const h = req.headers || {};
  return !!(h["cf-connecting-ip"] || h["cf-ray"] || h["x-forwarded-for"] || h["cf-access-jwt-assertion"] ||
    !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(h.host || ""));
}

const b64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Valida o JWT do Cloudflare Access. `chaves` = keys da JWKS. Devolve { ok, motivo, email }. */
export function validarJwt(token, cfg, chaves, agora = Date.now()) {
  try {
    const [h64, p64, s64] = String(token || "").split(".");
    if (!h64 || !p64 || !s64) return { ok: false, motivo: "formato" };
    const h = JSON.parse(b64u(h64).toString()), p = JSON.parse(b64u(p64).toString());
    if (h.alg !== "RS256") return { ok: false, motivo: "alg" };
    const jwk = (chaves || []).find((k) => k.kid === h.kid && k.kty === "RSA");
    if (!jwk) return { ok: false, motivo: "kid" };
    const pub = createPublicKey({ key: jwk, format: "jwk" });
    if (!cverify("RSA-SHA256", Buffer.from(`${h64}.${p64}`), pub, b64u(s64))) return { ok: false, motivo: "assinatura" };
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!aud.includes(cfg.aud)) return { ok: false, motivo: "aud" };
    if (p.iss !== `https://${cfg.team}.cloudflareaccess.com`) return { ok: false, motivo: "iss" };
    if (!(Number(p.exp) * 1000 > agora)) return { ok: false, motivo: "expirado" };
    if (p.nbf && Number(p.nbf) * 1000 > agora + 60e3) return { ok: false, motivo: "nbf" };
    const email = String(p.email || "").toLowerCase();
    if (!email || email !== cfg.email) return { ok: false, motivo: "email" };
    return { ok: true, email };
  } catch { return { ok: false, motivo: "erro" }; }
}

let cacheJwks = { em: 0, chaves: null, team: "" };
async function jwks(cfg, buscar) {
  if (cacheJwks.chaves && cacheJwks.team === cfg.team && Date.now() - cacheJwks.em < 3600e3) return cacheJwks.chaves;
  const r = await buscar(`https://${cfg.team}.cloudflareaccess.com/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  cacheJwks = { em: Date.now(), chaves: d.keys || [], team: cfg.team };
  return cacheJwks.chaves;
}
export const _zerarCache = () => { cacheJwks = { em: 0, chaves: null, team: "" }; falhas.clear(); };

const falhas = new Map(); // ip -> { n, desde, ate }
const ipDe = (req) => String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
export const hashIp = (ip) => createHash("sha256").update(`olli-ligar|${ip}`).digest("hex").slice(0, 10);

export function cabecalhos(res, remoto) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // microfone só nesta origem; câmera/geolocalização nunca
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; " +
    "connect-src 'self' wss://generativelanguage.googleapis.com; worker-src 'self'; manifest-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if (remoto) res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

const negar = (res, cod, msg) => {
  res.writeHead(cod, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify({ erro: msg }));
  return false;
};

/**
 * Chame no topo do handler. true = pode seguir; false = resposta de recusa já enviada.
 * opcoes: { porta, buscar }
 */
export async function guarda(req, res, opcoes = {}) {
  const remoto = ehRemoto(req);
  cabecalhos(res, remoto);
  const host = String(req.headers.host || "").toLowerCase();
  const cfg = lerConfigAcesso();
  const hostsLocais = [`127.0.0.1:${opcoes.porta}`, `localhost:${opcoes.porta}`];
  if (!remoto) {
    if (!hostsLocais.includes(host)) return negar(res, 421, "host inválido");
    return true;
  }
  if (!cfg) { log("remoto_sem_config"); return negar(res, 503, "acesso remoto não configurado"); }
  if (host !== cfg.host) { log("host_recusado", { host: host.slice(0, 60) }); return negar(res, 421, "host inválido"); }
  const ip = ipDe(req), agora = Date.now(), f = falhas.get(ip);
  if (f && f.ate > agora) return negar(res, 429, "muitas tentativas; tente mais tarde");
  let chaves;
  try { chaves = await jwks(cfg, opcoes.buscar || fetch); } catch { log("jwks_falhou"); return negar(res, 503, "não consegui validar o login"); }
  const v = validarJwt(req.headers["cf-access-jwt-assertion"], cfg, chaves, agora);
  if (!v.ok) {
    const recente = f && agora - f.desde < 10 * 60e3;
    const n = (recente ? f.n : 0) + 1;
    falhas.set(ip, { n, desde: recente ? f.desde : agora, ate: n >= 5 ? agora + 30 * 60e3 : 0 });
    log("jwt_recusado", { motivo: v.motivo, ip: hashIp(ip), n });
    return negar(res, v.motivo === "email" || v.motivo === "aud" ? 403 : 401, "login recusado");
  }
  falhas.delete(ip);
  return true;
}

/** Anti-CSRF para POST: JSON + cabeçalho próprio + Origin (se vier) igual ao Host. */
export function postSeguro(req) {
  if (req.method !== "POST") return false;
  if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) return false;
  if (req.headers["x-ligar"] !== "1") return false;
  const origem = req.headers.origin;
  if (origem) {
    try { if (new URL(origem).host.toLowerCase() !== String(req.headers.host || "").toLowerCase()) return false; } catch { return false; }
  }
  return true;
}

/** Máscara de segredos/dados pessoais antes de mandar texto para a voz (que vai ao Google) ou para o log. */
const REGRAS = [
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}\b/g, "[chave]"], [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[chave]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[token]"], [/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[chave]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[jwt]"],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [oculto]"], [/\b(\d{8,12}):[A-Za-z0-9_-]{30,}\b/g, "[token]"],
  [/((?:senha|password|secret|token|api[_-]?key|chave)\s*[=:]\s*)["']?[^\s"',;]{4,}/gi, "$1[oculto]"],
  [/(?<![\w.])(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}(?![\w.])/g, "[telefone]"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]"], [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]"],
  [/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, (_m, d) => `***@${d}`],
  [/\b[A-Za-z0-9+=_-]{40,}\b/g, "[oculto]"],
];
export function mascarar(texto) { let t = String(texto ?? ""); for (const [re, rep] of REGRAS) t = t.replace(re, rep); return t; }
