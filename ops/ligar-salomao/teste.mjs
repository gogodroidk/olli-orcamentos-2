// node --test ops/ligar-salomao/teste.mjs  — sem rede, sem Maestri, sem chave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";

const tmp = mkdtempSync(join(tmpdir(), "ligar-teste-"));
process.env.LIGAR_DIR = tmp;
writeFileSync(join(tmp, "acesso.json"), JSON.stringify({ team: "time", aud: "AUD1", email: "igor@exemplo.com" }));
process.env.LIGAR_ACESSO_JSON = join(tmp, "acesso.json");
process.env.LIGAR_HOST_REMOTO = "comando.exemplo.com";

const A = await import("./lib/acesso.mjs");
const F = await import("./lib/ferramentas.mjs");
const C = await import("./lib/custo.mjs");
const V = await import("./lib/voz.mjs");

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(p, h = { alg: "RS256", kid: "k1" }) {
  const corpo = `${b64u(h)}.${b64u(p)}`;
  return `${corpo}.${sign("RSA-SHA256", Buffer.from(corpo), privateKey).toString("base64url")}`;
}
const cfg = { team: "time", aud: "AUD1", email: "igor@exemplo.com" };
const bom = { aud: ["AUD1"], iss: "https://time.cloudflareaccess.com", exp: Math.floor(Date.now() / 1000) + 600, email: "Igor@exemplo.com" };

test("JWT válido do Igor passa", () => assert.equal(A.validarJwt(jwt(bom), cfg, [jwk]).ok, true));
test("JWT de outro e-mail, outro aud, expirado, alg none, sem assinatura: recusados", () => {
  assert.equal(A.validarJwt(jwt({ ...bom, email: "x@y.com" }), cfg, [jwk]).motivo, "email");
  assert.equal(A.validarJwt(jwt({ ...bom, aud: ["OUTRO"] }), cfg, [jwk]).motivo, "aud");
  assert.equal(A.validarJwt(jwt({ ...bom, exp: 1 }), cfg, [jwk]).motivo, "expirado");
  assert.equal(A.validarJwt(jwt({ ...bom, iss: "https://mau.cloudflareaccess.com" }), cfg, [jwk]).motivo, "iss");
  assert.equal(A.validarJwt(`${b64u({ alg: "none" })}.${b64u(bom)}.`, cfg, [jwk]).ok, false);
  const t = jwt(bom).split("."); t[1] = b64u({ ...bom, email: "igor@exemplo.com", x: 1 });
  assert.equal(A.validarJwt(t.join("."), cfg, [jwk]).motivo, "assinatura");
});

function req(headers, method = "GET") { return { headers, method, socket: { remoteAddress: "127.0.0.1" } }; }
function res() { const r = { cod: 0, h: {}, corpo: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; }, writeHead(c, h) { this.cod = c; Object.assign(this.h, h || {}); }, end(b) { this.corpo = String(b || ""); } }; return r; }
const buscar = async () => ({ json: async () => ({ keys: [jwk] }) });

test("guarda: local liberado; host estranho recusado (DNS rebinding)", async () => {
  assert.equal(await A.guarda(req({ host: "127.0.0.1:8796" }), res(), { porta: 8796, buscar }), true);
  const r = res();
  assert.equal(await A.guarda(req({ host: "malicioso.com:8796" }), r, { porta: 8796, buscar }), false);
  assert.equal(r.cod, 421);
});
test("guarda: remoto sem JWT recusado; com JWT do Igor passa; host remoto errado recusado", async () => {
  A._zerarCache();
  const r1 = res();
  assert.equal(await A.guarda(req({ host: "comando.exemplo.com", "cf-ray": "x", "cf-connecting-ip": "1.1.1.1" }), r1, { porta: 8796, buscar }), false);
  assert.equal(r1.cod, 401);
  assert.equal(await A.guarda(req({ host: "comando.exemplo.com", "cf-ray": "x", "cf-connecting-ip": "1.1.1.2", "cf-access-jwt-assertion": jwt(bom) }), res(), { porta: 8796, buscar }), true);
  const r3 = res();
  assert.equal(await A.guarda(req({ host: "outro.exemplo.com", "cf-ray": "x", "cf-access-jwt-assertion": jwt(bom) }), r3, { porta: 8796, buscar }), false);
  assert.equal(r3.cod, 421);
});
test("guarda: 5 falhas bloqueiam o IP", async () => {
  A._zerarCache();
  const h = { host: "comando.exemplo.com", "cf-ray": "x", "cf-connecting-ip": "9.9.9.9", "cf-access-jwt-assertion": "lixo" };
  for (let i = 0; i < 5; i++) await A.guarda(req(h), res(), { porta: 8796, buscar });
  const r = res();
  await A.guarda(req({ ...h, "cf-access-jwt-assertion": jwt(bom) }), r, { porta: 8796, buscar });
  assert.equal(r.cod, 429);
});
test("anti-CSRF: exige JSON, X-Ligar e mesma origem", () => {
  const ok = { host: "127.0.0.1:8796", "content-type": "application/json", "x-ligar": "1", origin: "http://127.0.0.1:8796" };
  assert.equal(A.postSeguro(req(ok, "POST")), true);
  assert.equal(A.postSeguro(req({ ...ok, "x-ligar": undefined }, "POST")), false);
  assert.equal(A.postSeguro(req({ ...ok, "content-type": "text/plain" }, "POST")), false);
  assert.equal(A.postSeguro(req({ ...ok, origin: "https://mau.com" }, "POST")), false);
  assert.equal(A.postSeguro(req(ok, "GET")), false);
});
test("máscara tira chave, telefone, e-mail, CPF", () => {
  const t = A.mascarar(`chave ${"AI" + "za"}${"x".repeat(35)} tel (11) 98765-4321 mail joao@x.com cpf 123.456.789-09`);
  assert.ok(!/AIza|98765|joao@|123\.456/.test(t), t);
});
test("limparTexto tira controle e bidi, corta tamanho", () => {
  assert.equal(F.limparTexto("a\u0000b\nc‮d", 100), "a b c d");
  assert.equal(F.limparTexto("x".repeat(2000), 800).length, 800);
});
test("resumos de estado", () => {
  const dec = "lixo\n## D-1 · 2026-11-18 10:00 · ORDEM · por Igor · andar todos\n> Faça X\n- Motivo: y\n\n## D-2 · 2026-11-18 11:00 · ATUALIZA · por TECH — CTO · andar\n> Feito X\n";
  const r = F.resumoDecisoes(dec);
  assert.equal(r.length, 2); assert.match(r[1], /^D-2 .*TECH — CTO.*Feito X/);
  const conv = `${[{ t: 1, quem: "A", texto: "oi" }, { t: 2, quem: "B", texto: "ola" }].map((x) => JSON.stringify(x)).join("\n")}\n{quebrado`;
  assert.equal(F.resumoConversa(conv).total, 2);
  const f = F.resumoFila({ X: { status: "FEITO", fim: "2026-11-18T10:00Z", nota: "ESTADO: FEITO" }, Y: { status: "rodando" } });
  assert.deepEqual(f.rodando, ["Y"]); assert.equal(f.contagem.FEITO, 1);
});
test("recado ao Salomão: só hibernar ask (sem shell, sem segredo), código no recado, resposta lida do grupo", async () => {
  F._zerar();
  writeFileSync(join(tmp, "cfg.json"), JSON.stringify({ maestri: { terminal: "t", workspace: "w", socket: join(tmp, "cfg.json") } }));
  F.CAMINHOS.maestriCfg = join(tmp, "cfg.json");
  F.CAMINHOS.conversa = join(tmp, "conversa.jsonl");
  writeFileSync(F.CAMINHOS.conversa, "");
  const chamadas = [];
  const spawnFn = (cmd, args, opt) => {
    chamadas.push({ cmd, args, opt });
    const p = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setTimeout(() => p.emit("close", 0), 30);
    return p;
  };
  const r = await F.mandarAoSalomao("Prioriza a campanha da GR Tech", "salomão prioriza a campanha", { esperaMs: 1500, spawnFn });
  assert.equal(r.estado, "esperando"); assert.equal(r.entregue, true);
  assert.deepEqual(chamadas[0].args.slice(1, 3), ["ask", "SALOMÃO — Maestro"]);
  const cod = chamadas[0].args[3].match(/\[LIGAÇÃO DO IGOR (L\d{4})/)[1];
  assert.equal(chamadas[0].opt.shell, undefined);
  assert.equal(chamadas[0].opt.env.MAESTRI_TERMINAL_ID, "t");
  assert.equal(chamadas[0].opt.env.GEMINI_API_KEY_TTS, undefined, "filho não herda segredo");
  // fala de outro agente com o código não vale; fala do Salomão com o código vale
  const agora = Date.now();
  writeFileSync(F.CAMINHOS.conversa, `${[
    { t: agora, quem: "TECH — CTO", texto: `[LIGAÇÃO ${cod}] eu respondo` },
    { t: agora, quem: "MAESTRO", texto: "outra coisa" },
    { t: agora, quem: "MAESTRO", texto: `[LIGAÇÃO ${cod}] Feito, Igor: campanha priorizada para amanhã.` },
  ].map((x) => JSON.stringify(x)).join("\n")}\n`);
  const c = F.consultarPedido(r.id);
  assert.equal(c.estado, "pronto"); assert.equal(c.resposta, "Feito, Igor: campanha priorizada para amanhã.");
});
test("recado: um entregando por vez; falha de entrega vira erro", async () => {
  F._zerar();
  const lento = () => { const p = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; return p; };
  const a = await F.mandarAoSalomao("primeiro recado", "", { esperaMs: 100, spawnFn: lento });
  assert.equal(a.estado, "esperando"); assert.equal(a.entregue, false);
  const b = await F.mandarAoSalomao("segundo recado", "", { esperaMs: 100, spawnFn: lento });
  assert.equal(b.estado, "erro");
  F._zerar();
  const falha = () => { const p = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; setTimeout(() => p.emit("close", 1), 20); return p; };
  const c = await F.mandarAoSalomao("terceiro recado", "", { esperaMs: 1500, spawnFn: falha });
  assert.equal(c.estado, "erro");
});
test("custo: soma turnos com preço oficial", () => {
  const c = C.custoDaLigacao({ segundos: 60, uso: [
    { promptTokenCount: 1000, promptTokensDetails: [{ modality: "TEXT", tokenCount: 1000 }], responseTokenCount: 400, responseTokensDetails: [{ modality: "AUDIO", tokenCount: 400 }], thoughtsTokenCount: 100 },
  ] });
  // 1000*0.75 + 100*4.5 + 400*12 = 750 + 450 + 4800 = 6000 / 1e6
  assert.equal(c.usd, 0.006); assert.equal(c.usdPorMinuto, 0.006);
  assert.equal(C.custoDaLigacao({ segundos: -5, uso: "x" }).usd, 0);
});
test("setup travado: persona, voz Enceladus, 2 ferramentas, máscara cobre prompt e ferramentas", () => {
  const s = V.setupTravado();
  assert.equal(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Enceladus");
  assert.deepEqual(s.tools[0].functionDeclarations.map((f) => f.name), ["estado_empresa", "mandar_ao_salomao"]);
  for (const c of ["systemInstruction", "tools", "generationConfig", "model"]) assert.ok(V.CAMPOS_TRAVADOS.split(",").includes(c));
  assert.equal(s.sessionResumption, undefined);
  assert.match(V.PERSONA, /Nunca negue/);
});
