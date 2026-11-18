#!/usr/bin/env node
// "Ligar pro Salomão" — servidor local (127.0.0.1) da página de chamada por voz ao vivo (CQ-LIGAR-SALOMAO, 18/11/2026).
// Rotas (todas sob /ligar/):
//   GET  /ligar/                 página (PWA)
//   POST /ligar/api/token        token efêmero do Gemini Live (config travada no servidor)
//   POST /ligar/api/estado       ferramenta estado_empresa (só leitura)
//   POST /ligar/api/mandar       ferramenta mandar_ao_salomao (recado ao terminal do Salomão)
//   POST /ligar/api/resposta     consulta a resposta pendente de um recado
//   POST /ligar/api/fim          a página informa duração e tokens da ligação (medição de custo)
//   GET  /ligar/api/saude        estado do serviço (sem dados)
// Acesso: local livre; remoto (túnel) só com JWT do Cloudflare Access do Igor (lib/acesso.mjs). Desligar: criar ~/.olli-ligar/desligado
import { createServer } from "node:http";
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize } from "node:path";
import { guarda, postSeguro, log, DIR_DADOS, mascarar } from "./lib/acesso.mjs";
import { estadoEmpresa, mandarAoSalomao, consultarPedido, limparTexto, confirmou } from "./lib/ferramentas.mjs";
import { criarToken, MODELO, VOZ } from "./lib/voz.mjs";
import { custoDaLigacao } from "./lib/custo.mjs";

const PORTA = Number(process.env.LIGAR_PORTA || 8796);
const PUB = fileURLToPath(new URL("./public/", import.meta.url));
const BASE = "/ligar";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

// limites simples por janela (o único usuário é o Igor; isto segura laço/abuso)
const janelas = new Map();
function dentroDoLimite(chave, max, ms) {
  const agora = Date.now(), l = (janelas.get(chave) || []).filter((t) => agora - t < ms);
  if (l.length >= max) { janelas.set(chave, l); return false; }
  l.push(agora); janelas.set(chave, l); return true;
}

const json = (res, cod, obj) => { res.writeHead(cod, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };

function corpo(req, max = 8192) {
  return new Promise((ok, no) => {
    let s = "";
    req.on("data", (d) => { s += d; if (s.length > max) { no(new Error("grande")); req.destroy(); } });
    req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new Error("json")); } });
    req.on("error", no);
  });
}

function arquivo(res, rel) {
  const caminho = normalize(join(PUB, rel || "index.html"));
  if (!caminho.startsWith(PUB) || !existsSync(caminho)) return json(res, 404, { erro: "não achei" });
  const ext = caminho.slice(caminho.lastIndexOf("."));
  const cache = rel === "sw.js" || rel === "" || rel === "index.html" ? "no-cache" : "public, max-age=300";
  const extra = rel === "sw.js" ? { "service-worker-allowed": `${BASE}/` } : {};
  res.writeHead(200, { "content-type": TIPOS[ext] || "application/octet-stream", "cache-control": cache, ...extra });
  res.end(readFileSync(caminho));
}

const desligado = () => existsSync(join(DIR_DADOS, "desligado"));

export const servidor = createServer(async (req, res) => {
  try {
    if (!(await guarda(req, res, { porta: PORTA }))) return;
    const url = new URL(req.url, "http://127.0.0.1");
    const p = url.pathname;
    if (p === BASE) { res.writeHead(308, { location: `${BASE}/` }); return res.end(); }
    if (!p.startsWith(`${BASE}/`)) return json(res, 404, { erro: "não achei" });
    const rota = p.slice(BASE.length + 1);

    if (!rota.startsWith("api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { erro: "método" });
      return arquivo(res, rota);
    }
    if (rota === "api/saude" && req.method === "GET") return json(res, 200, { ok: true, desligado: desligado(), modelo: MODELO, voz: VOZ });

    if (!postSeguro(req)) return json(res, 403, { erro: "requisição recusada" });
    if (desligado()) return json(res, 503, { erro: "ligação desligada pelo dono (arquivo ~/.olli-ligar/desligado)" });
    const b = await corpo(req).catch(() => null);
    if (!b || typeof b !== "object") return json(res, 400, { erro: "corpo inválido" });

    if (rota === "api/token") {
      if (!dentroDoLimite("token", 8, 10 * 60e3)) return json(res, 429, { erro: "muitas ligações seguidas; espere uns minutos" });
      try {
        const t = await criarToken({ minutos: 30 });
        log("token", { modelo: t.modelo, retomada: !!b.retomada });
        return json(res, 200, { token: t.token, modelo: t.modelo, expira: t.expira });
      } catch (e) { log("token_falhou", { erro: mascarar(e.message).slice(0, 200) }); return json(res, 502, { erro: "não consegui abrir a linha com o Google agora" }); }
    }
    if (rota === "api/estado") {
      if (!dentroDoLimite("estado", 20, 60e3)) return json(res, 429, { erro: "devagar" });
      log("estado");
      return json(res, 200, { resultado: estadoEmpresa() });
    }
    if (rota === "api/mandar") {
      if (!dentroDoLimite("mandar", 6, 10 * 60e3)) return json(res, 429, { resultado: "Muitos recados seguidos; nada foi enviado. Espere uns minutos." });
      if (!confirmou(limparTexto(b.confirmacao, 300), limparTexto(b.pergunta, 600), b.estadoDepois === true)) {
        log("recado_sem_confirmacao", { texto: mascarar(limparTexto(b.texto, 200)) });
        return json(res, 200, { id: null, estado: "erro", resultado: "Não enviado: o Igor ainda não confirmou em voz. Repita a ordem e pergunte 'confirma?'." });
      }
      const r = await mandarAoSalomao(limparTexto(b.texto, 800), limparTexto(b.falaIgor, 600), { pergunta: limparTexto(b.pergunta, 400) });
      const resultado = r.estado === "pronto" ? `Resposta do Salomão: ${r.resposta}`
        : r.estado === "esperando" ? "Recado enviado ao Salomão. Ele responde no grupo; aviso quando a resposta chegar."
        : r.resposta;
      return json(res, 200, { id: r.id || null, estado: r.estado, resultado });
    }
    if (rota === "api/resposta") {
      if (!dentroDoLimite("resposta", 60, 60e3)) return json(res, 429, { erro: "devagar" });
      return json(res, 200, consultarPedido(b.id));
    }
    if (rota === "api/fim") {
      if (!dentroDoLimite("fim", 10, 60e3)) return json(res, 429, { erro: "devagar" });
      const c = custoDaLigacao(b);
      try {
        mkdirSync(DIR_DADOS, { recursive: true, mode: 0o700 });
        appendFileSync(join(DIR_DADOS, "ligacoes.jsonl"), `${JSON.stringify({ em: new Date().toISOString(), modelo: MODELO, ...c })}\n`, { mode: 0o600 });
      } catch {}
      return json(res, 200, c);
    }
    return json(res, 404, { erro: "não achei" });
  } catch (e) {
    log("erro", { erro: mascarar(String(e?.message || e)).slice(0, 200) });
    if (!res.headersSent) json(res, 500, { erro: "erro interno" });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  servidor.listen(PORTA, "127.0.0.1", () => console.log(`Ligar pro Salomão: http://127.0.0.1:${PORTA}${BASE}/  (modelo ${MODELO}, voz ${VOZ})`));
}
