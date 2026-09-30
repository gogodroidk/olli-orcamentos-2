import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const fonte = await readFile(new URL("../worker/src/index.js", import.meta.url), "utf8");
const inicio = fonte.indexOf("async function handleChat");
const fim = fonte.indexOf("// ───", inicio + 10);
const trecho = fonte.slice(inicio, fim > inicio ? fim : inicio + 4_000);

assert.ok(inicio >= 0, "handleChat não encontrado");
assert.match(trecho, /\.filter\(\(m\) => m && \(m\.role === 'user' \|\| m\.role === 'assistant'\)/);
assert.match(trecho, /role: 'user'/);
assert.match(trecho, /HISTORICO_ASSISTENTE_NAO_CONFIAVEL/);
assert.doesNotMatch(trecho, /role: m\.role === 'assistant' \? 'model' : 'user'/);

console.log("PASSOU: histórico de chat não concede papel model a conteúdo forjado pelo cliente.");
