#!/usr/bin/env node
// "Ligar para a OLLI" — servidor local (127.0.0.1) da página de chamada por voz ao vivo (CQ-LIGAR-SALOMAO, 18/11/2026).
// Rotas (todas sob /ligar/):
//   GET  /ligar/                 página (PWA)
//   POST /ligar/api/token        abre (ou retoma) a LIGAÇÃO no servidor + token efêmero do Gemini Live (config travada)
//   POST /ligar/api/estado       ferramenta estado_empresa (só leitura; o conteúdo vai cercado como dado não confiável)
//   POST /ligar/api/preparar     ferramenta mandar_recado: só PREPARA o pedido (texto guardado + token de uso único)
//   POST /ligar/api/confirmar    botão ou "sim" falado: confere o token e indica se o login veio do Access
//   POST /ligar/api/cancelar     o Igor desistiu do pedido
//   POST /ligar/api/resposta     consulta a resposta pendente de um recado
//   POST /ligar/api/fim          duração e tokens da ligação (medição de custo) e encerra a ligação
// Toda rota api (menos token e saude) exige o id da ligação aberto pela MESMA identidade (lib/confirmacao.mjs).
//   GET  /ligar/api/saude        estado do serviço (sem dados)
// Acesso: local livre; remoto (túnel) só com JWT do Cloudflare Access do Igor (lib/acesso.mjs). Desligar: criar ~/.olli-ligar/desligado
import { createServer } from "node:http";
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize } from "node:path";
import { guarda, postSeguro, log, DIR_DADOS, mascarar } from "./lib/acesso.mjs";
import { estadoEmpresa, mandarRecado, consultarPedido, limparTexto, confirmou } from "./lib/ferramentas.mjs";
import { abrirLigacao, ligacaoValida, encerrarLigacao, registrarDado, prepararPedido, confirmarPedido, cancelarPedido } from "./lib/confirmacao.mjs";
import { criarToken, LimiteGeminiError, MODELO, VOZ } from "./lib/voz.mjs";
import { custoDaLigacao } from "./lib/custo.mjs";

const PORTA = Number(process.env.LIGAR_PORTA || 8796);
export const _deps = { criarToken, buscarJwks: fetch }; // os testes substituem as chamadas de rede
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
    if (!(await guarda(req, res, { porta: PORTA, buscar: _deps.buscarJwks }))) return;
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

    const quem = req.identidade;
    if (rota === "api/token") {
      if (!dentroDoLimite("token", 8, 10 * 60e3)) return json(res, 429, { erro: "muitas ligações seguidas; espere uns minutos" });
      // retomada só da ligação desta mesma identidade; ligação nova = id novo do servidor
      let ligacao = b.retomada ? String(b.ligacao || "") : "";
      if (ligacao && !ligacaoValida(ligacao, quem)) return json(res, 403, { erro: "ligação inválida; toque em Ligar de novo" });
      const nova = !ligacao;
      if (nova) ligacao = abrirLigacao(quem);
      if (!ligacao) return json(res, 403, { erro: "sem identidade" });
      try {
        const t = await _deps.criarToken({ minutos: 30 });
        log("token", { modelo: t.modelo, retomada: !!b.retomada, via: quem?.via });
        return json(res, 200, { token: t.token, modelo: t.modelo, expira: t.expira, ligacao });
      } catch (e) {
        if (nova) encerrarLigacao(ligacao, quem);
        if (e instanceof LimiteGeminiError) {
          log("limite_gemini", { etapa: "token", retomada: !!b.retomada });
          return json(res, 429, { erro: e.message });
        }
        log("token_falhou", { erro: mascarar(e.message).slice(0, 200) });
        return json(res, 502, { erro: "não consegui abrir a linha com o Google agora" });
      }
    }
    const ligacao = String(b.ligacao || "");
    if (!ligacaoValida(ligacao, quem)) { log("ligacao_invalida", { rota }); return json(res, 403, { erro: "ligação inválida" }); }

    if (rota === "api/estado") {
      if (!dentroDoLimite("estado", 20, 60e3)) return json(res, 429, { erro: "devagar" });
      const e = estadoEmpresa();
      registrarDado(ligacao, quem, e.dados);
      log("estado");
      return json(res, 200, { resultado: e.texto });
    }
    if (rota === "api/preparar") {
      if (!dentroDoLimite("preparar", 10, 10 * 60e3)) return json(res, 429, { estado: "recusado", resultado: "Muitos pedidos seguidos; nada foi preparado." });
      const texto = typeof b.texto === "string" ? limparTexto(b.texto, 800) : "";
      const r = prepararPedido(ligacao, quem, b.destino, texto);
      if (!r.ok) {
        log(r.suspeito ? "pedido_suspeito" : "pedido_recusado", { motivo: r.motivo });
        return json(res, 200, { estado: "recusado", resultado: `Não preparado: ${r.motivo}. Nada foi enviado.` });
      }
      log("pedido_preparado", { pedido: r.pedido, destino: r.destino });
      return json(res, 200, { estado: "aguardando", pedido: r.pedido, token: r.token, destino: r.destino, para: r.para, texto: r.texto, leitura: r.leitura });
    }
    if (rota === "api/confirmar") {
      if (!dentroDoLimite("confirmar", 10, 10 * 60e3)) return json(res, 429, { estado: "recusado", resultado: "Muitas confirmações seguidas; nada foi enviado." });
      const c = confirmarPedido({
        ligacao, pedido: b.pedido, token: b.token, destino: b.destino, identidade: quem, via: b.via,
        fala: limparTexto(b.fala, 300), pergunta: limparTexto(b.pergunta, 900), confirmouFn: confirmou,
      });
      if (!c.ok) {
        log("confirmacao_recusada", { motivo: c.motivo, via: String(b.via || "").slice(0, 10) });
        return json(res, 200, { estado: "recusado", resultado: `Não enviado: ${c.motivo}.` });
      }
      return json(res, 200, mandarRecado(c.destino, c.texto, { via: b.via, origem: quem.via, dono: ligacao }));
    }
    if (rota === "api/cancelar") {
      const ok = cancelarPedido(ligacao, b.pedido, quem);
      log("pedido_cancelado", { ok });
      return json(res, 200, { ok });
    }
    if (rota === "api/resposta") {
      if (!dentroDoLimite("resposta", 60, 60e3)) return json(res, 429, { erro: "devagar" });
      return json(res, 200, consultarPedido(b.id, ligacao));
    }
    if (rota === "api/fim") {
      if (!dentroDoLimite("fim", 10, 60e3)) return json(res, 429, { erro: "devagar" });
      const c = custoDaLigacao(b);
      try {
        mkdirSync(DIR_DADOS, { recursive: true, mode: 0o700 });
        appendFileSync(join(DIR_DADOS, "ligacoes.jsonl"), `${JSON.stringify({ em: new Date().toISOString(), modelo: MODELO, ...c })}\n`, { mode: 0o600 });
      } catch {}
      encerrarLigacao(ligacao, quem);
      return json(res, 200, c);
    }
    return json(res, 404, { erro: "não achei" });
  } catch (e) {
    log("erro", { erro: mascarar(String(e?.message || e)).slice(0, 200) });
    if (!res.headersSent) json(res, 500, { erro: "erro interno" });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  servidor.listen(PORTA, "127.0.0.1", () => console.log(`Ligar para a OLLI: http://127.0.0.1:${PORTA}${BASE}/  (modelo ${MODELO}, voz ${VOZ})`));
}
