#!/usr/bin/env node
// ficha-cliente.mjs — memória por cliente da Central do Cliente (RP-1119-1027-CEREBRO2 item 4; regras da Marina, 19/11/2026).
// Chave = telefone normalizado (só dígitos, 55+DDD+número). Contato do Chatwoot e user_id do app entram como VÍNCULOS, nunca como chave.
// Sem telefone, a ficha NÃO nasce. Ficha = até 5 linhas, cada fato com data e origem (conversa ou uso da conta), nunca palpite.
// Apagar (LGPD art. 18): remove a ficha, registra só o HASH do telefone na lista de supressão e bloqueia nova ficha.
//   node ficha-cliente.mjs add <telefone> "<fato>" --origem "conversa Chatwoot #164" [--chatwoot 164] [--user 63616103] [--data AAAA-MM-DD]
//   node ficha-cliente.mjs ver <telefone>        (≤5 linhas, para nota interna [ficha] ou para o gancho do agente)
//   node ficha-cliente.mjs apagar <telefone>     (apaga e suprime)
//   node ficha-cliente.mjs suprimido <telefone>  (sai 0 se suprimido)
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
const DIR = new URL("clientes/", import.meta.url).pathname, SUP = DIR + "_suprimidos.txt";
mkdirSync(DIR, { recursive: true });
export const chave = (tel) => { let d = String(tel || "").replace(/\D/g, ""); if (d.length === 10 || d.length === 11) d = "55" + d; return /^55\d{10,11}$/.test(d) ? d : null; };
const hash = (k) => createHash("sha256").update("ficha:" + k).digest("hex").slice(0, 24);
const suprimidos = () => new Set(existsSync(SUP) ? readFileSync(SUP, "utf8").split("\n").filter(Boolean) : []);
export const eSuprimido = (tel) => { const k = chave(tel); return !!k && suprimidos().has(hash(k)); };
const arq = (k) => DIR + k + ".json";
const carrega = (k) => (existsSync(arq(k)) ? JSON.parse(readFileSync(arq(k), "utf8")) : { telefone: k, vinculos: { chatwoot: [], user_id: [] }, fatos: [] });
const SENS = /\b(cpf|rg|senha|cart[aã]o|doen[cç]a|sa[uú]de|religi|orienta[cç][aã]o|filiado|\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/i;
export function adicionar(tel, fato, { origem, chatwoot, user, data } = {}) {
  const k = chave(tel); if (!k) return { ok: false, motivo: "sem telefone válido: a ficha não nasce" };
  if (suprimidos().has(hash(k))) return { ok: false, motivo: "pessoa pediu para parar/apagar: ficha bloqueada" };
  if (!origem) return { ok: false, motivo: "sem origem (conversa ou uso da conta): não entra" };
  if (SENS.test(fato)) return { ok: false, motivo: "dado sensível que a pessoa não precisa ter dito: não entra" };
  const f = carrega(k), d = data || new Date().toISOString().slice(0, 10), t = String(fato).trim().replace(/\s+/g, " ").slice(0, 200);
  if (f.fatos.some((x) => x.texto.toLowerCase() === t.toLowerCase())) return { ok: true, repetido: true };
  f.fatos.push({ data: d, texto: t, origem }); if (chatwoot && !f.vinculos.chatwoot.includes(String(chatwoot))) f.vinculos.chatwoot.push(String(chatwoot)); if (user && !f.vinculos.user_id.includes(String(user))) f.vinculos.user_id.push(String(user));
  writeFileSync(arq(k), JSON.stringify(f, null, 1)); return { ok: true };
}
export function ver(tel) {
  const k = chave(tel); if (!k || suprimidos().has(hash(k)) || !existsSync(arq(k))) return [];
  return carrega(k).fatos.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5).map((x) => `${x.data.split("-").reverse().join("/")} · ${x.texto} (${x.origem})`);
}
export function apagar(tel) {
  const k = chave(tel); if (!k) return { ok: false, motivo: "telefone inválido" };
  let apagou = false; if (existsSync(arq(k))) { unlinkSync(arq(k)); apagou = true; }
  const h = hash(k); if (!suprimidos().has(h)) appendFileSync(SUP, h + "\n");
  return { ok: true, apagou, suprimido: true, etiqueta: "parar-contato" };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [c, tel, ...r] = process.argv.slice(2); const fl = (n) => { const i = r.indexOf("--" + n); return i >= 0 ? r[i + 1] : undefined; };
  if (c === "add") console.log(JSON.stringify(adicionar(tel, r[0], { origem: fl("origem"), chatwoot: fl("chatwoot"), user: fl("user"), data: fl("data") })));
  else if (c === "ver") console.log(ver(tel).join("\n") || "(sem ficha)");
  else if (c === "apagar") console.log(JSON.stringify(apagar(tel)));
  else if (c === "suprimido") process.exit(eSuprimido(tel) ? 0 : 1);
  else console.log("uso: add|ver|apagar|suprimido <telefone> ...");
}
