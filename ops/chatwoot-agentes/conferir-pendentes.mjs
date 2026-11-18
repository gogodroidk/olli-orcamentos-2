#!/usr/bin/env node
// Prova do P0: cada JID da lista de pendentes (Evolution) tem conversa no Chatwoot (caixa OLLI ou Serviços).
//   node conferir-pendentes.mjs [arquivo.json]
import { readFileSync } from 'node:fs';
import { CFG, api, carregarCredenciais, evoSql, digitos } from './lib.mjs';

carregarCredenciais();
const TOK = process.env.CHATWOOT_TOKEN_ADMIN;
const arq = process.argv[2] || '/home/igor/Desktop/Entregas Claude/OLLI/ZAP-ATENDIMENTO/pendentes-18-11-21h.json';
const lista = JSON.parse(readFileSync(arq, 'utf8'));
const jids = lista.map((x) => x.jid);
const alts = new Map(evoSql(`select "key"->>'remoteJid' j, max("key"->>'remoteJidAlt') a from "Message"
  where "key"->>'remoteJid' in (${jids.map((j) => `'${j.replace(/'/g, '')}'`).join(',')}) group by 1`).map((r) => [r.j, r.a]));
const caixas = new Set(Object.values(CFG.caixas));
let ok = 0;
for (const p of lista) {
  const tel = digitos(alts.get(p.jid));
  const achados = [];
  for (const q of [tel, digitos(p.jid)].filter(Boolean)) {
    const r = await api(TOK, `/contacts/search?q=${q}`);
    for (const c of r.payload || []) {
      if (digitos(c.phone_number) !== q && c.identifier !== p.jid && digitos(c.identifier) !== q) continue;
      const cs = (await api(TOK, `/contacts/${c.id}/conversations`)).payload || [];
      for (const cv of cs) if (caixas.has(cv.inbox_id)) achados.push(`#${cv.id} ${cv.inbox_id === CFG.caixas.olli ? 'OLLI' : 'Serviços'} ${cv.status} dono=${cv.meta?.assignee?.name || '-'}${/^\(duplicado/.test(c.name) ? ' (duplicada)' : ''}`);
    }
  }
  const tem = achados.some((a) => !a.includes('(duplicada)'));
  if (tem) ok++;
  console.log(`${tem ? 'OK ' : 'FALTA'} ${p.jid.padEnd(22)} ${tel ? `+${tel}` : 'sem telefone'.padEnd(14)} ${String(p.nome || '').padEnd(12)} ${[...new Set(achados)].join(' | ')}`);
}
console.log(`${ok}/${lista.length} no Chatwoot`);
