/**
 * "Um recibo por pagamento registrado" travado NO BANCO (revisão 06/10/2026, P0).
 *
 *     node scripts/teste-pagamentos-recibo-unico.ts
 *
 * Roda o SQL REAL da migration num Postgres de verdade (PGlite) sobre uma tabela mínima com as colunas
 * que o índice usa. Prova a semântica: dois pagamentos REGISTRADOS com o mesmo recibo → 23505; estornado
 * + registrado com o mesmo recibo → pode; vários sem recibo → pode; recibos diferentes → pode; rodar a
 * migration duas vezes → não falha (idempotente).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

const SQL = readFileSync(new URL('../supabase/migrations/20261009090000_pagamentos_recibo_unico.sql', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
ok(/create unique index if not exists pagamentos_recibo_registrado_uidx/.test(SQL), 'a migration cria o índice único (idempotente)');
ok(/where recibo_id is not null and estado = 'registrado'/.test(SQL), 'parcial: só registrado e só com recibo');

const db = new PGlite();
await db.exec(`create table public.pagamentos (id text primary key, recibo_id text, estado text not null default 'registrado');`);
await db.exec(SQL);
await db.exec(SQL); // 2ª vez: idempotente
checks++;

const inserir = (id: string, recibo: string | null, estado = 'registrado') =>
  db.query(`insert into public.pagamentos (id, recibo_id, estado) values ($1, $2, $3)`, [id, recibo, estado]);

await inserir('p1', 'r1');
let codigo = '';
try { await inserir('p2', 'r1'); } catch (e: any) { codigo = e.code; }
ok(codigo === '23505', `2º pagamento REGISTRADO com o mesmo recibo é recusado pelo banco (23505), veio "${codigo}"`);

await inserir('p3', 'r1', 'estornado');
ok(true, 'pagamento ESTORNADO pode ter o mesmo recibo');
await inserir('p4', 'r2');
ok(true, 'recibo diferente passa');
await inserir('p5', null);
await inserir('p6', null);
ok(true, 'vários pagamentos sem recibo passam');
// estornar o p1 libera o recibo para outro pagamento registrado
await db.query(`update public.pagamentos set estado = 'estornado' where id = 'p1'`);
await inserir('p7', 'r1');
ok(true, 'depois que o registrado é estornado, o recibo pode ser ligado a outro registrado');
// UPDATE de vínculo concorrente: ligar o MESMO recibo a outro registrado também é recusado
await inserir('p8', null);
codigo = '';
try { await db.query(`update public.pagamentos set recibo_id = 'r2' where id = 'p8'`); } catch (e: any) { codigo = e.code; }
ok(codigo === '23505', `UPDATE que ligaria o mesmo recibo a um 2º registrado também é recusado, veio "${codigo}"`);

await db.close();
console.log(`PASSOU: ${checks} verificações — o banco recusa o 2º pagamento registrado no mesmo recibo.`);
