import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const aqui = dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [join(aqui, "build.mjs")], { stdio: "inherit" });

const pub = join(aqui, "publico");
const rotas = [
  "index.html",
  "vrf/index.html",
  "manutencao/index.html",
  "contrato/index.html",
  "escritorios/index.html",
  "clinicas/index.html",
  "restaurantes/index.html",
  "condominios/index.html",
  "creditos/index.html",
  "privacidade/index.html",
  "404.html",
  ...Object.keys(JSON.parse(readFileSync(join(aqui, "fonte", "conteudo-v7.json"), "utf8"))).map((s) => `${s}/index.html`),
];

const proibidas = [
  /tel:(?!\+5511958758030)/i,
  /24\s*h/i,
  /24 horas/i,
  /pmoc/i,
  /\blaudos?\b/i,
  /\bart\b/i,
  /assistência autorizada/i,
  /depoimento/i,
  /R\$\s*550/,
  /R\$\s*39/,
  /R\$\s*99/,
  /\[CONFIRMAR\]/,
  /<script[^>]+src=["'][^"']*cena-vrf\.js/,
];

for (const rota of rotas) {
  const html = readFileSync(join(pub, rota), "utf8");
  assert.match(html, /<h1>/, rota);
  assert.match(html, /noindex/, rota);
  assert.match(html, /44\.301\.204\/0001-38/, rota);
  assert.match(html, /wa\.me\/5511958758030/, rota);
  assert.match(html, /data-tema/, rota);
  assert.match(html, /tel:\+5511958758030/, rota);
  assert.match(html, /data-barra/, rota);
  if (rota !== "404.html") assert.match(html, /<link rel="canonical" href="https:\/\/grtechrefrigeracao\.com\.br\//, rota);
  assert.doesNotMatch(html, /olliorcamentos\.online\/(?!privacidade)/, rota);
  for (const regra of proibidas) assert.doesNotMatch(html, regra, `${rota} ${regra}`);
}

const home = readFileSync(join(pub, "index.html"), "utf8");
assert.match(home, /Foto real de um atendimento nosso/);
assert.match(home, /data-cena/);
assert.match(home, /Visita técnica <b>R\$ 150<\/b>/);
assert.match(home, /id="areas"/);

for (const area of ["escritorios", "clinicas", "restaurantes", "condominios"]) {
  const html = readFileSync(join(pub, area, "index.html"), "utf8");
  assert.match(html, /Imagem ilustrativa/, area);
}

const vrf = readFileSync(join(pub, "vrf/index.html"), "utf8");
assert.match(vrf, /data-cena/);
assert.match(vrf, /Imagem ilustrativa/);
assert.match(vrf, /Não é foto de cliente/);

const css = readFileSync(join(pub, "estilo.css"), "utf8");
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /transform/);
assert.doesNotMatch(css, /animation:\s*[^;]*infinite/);

const js = readFileSync(join(pub, "cena-vrf.js"), "utf8");
assert.ok(statSync(join(pub, "cena-vrf.js")).size < 8000);
assert.match(js, /prefers-reduced-motion/);
assert.match(js, /saveData/);
assert.doesNotMatch(js, /requestAnimationFrame/);

assert.match(readFileSync(join(pub, "manutencao/index.html"), "utf8"), /R\$ 450/);
assert.match(readFileSync(join(pub, "contrato/index.html"), "utf8"), /mensalidade/);
assert.match(readFileSync(join(pub, "creditos/index.html"), "utf8"), /Pexels License/);
assert.match(readFileSync(join(pub, "privacidade/index.html"), "utf8"), /grtechrefrigeracao\.com\.br\/privacidade/);

const mapa = readFileSync(join(pub, "sitemap.xml"), "utf8");
for (const rota of rotas.filter((r) => r !== "404.html")) {
  const url = "https://grtechrefrigeracao.com.br/" + rota.replace(/index\.html$/, "");
  assert.ok(mapa.includes(`<loc>${url}</loc>`), `sitemap ${url}`);
}
assert.match(readFileSync(join(pub, "robots.txt"), "utf8"), /Sitemap: https:\/\/grtechrefrigeracao\.com\.br\/sitemap\.xml/);
console.log("ok", rotas.length);
