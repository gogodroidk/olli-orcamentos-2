/**
 * Número único por tenant — a migration `20261001090000_numero_unico_por_tenant.sql`
 * rodando de verdade num Postgres (PGlite, em memória).
 *
 *     node scripts/teste-numero-unico-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - com dados LIMPOS, a migration cria os dois índices e é idempotente (2ª vez = no-op);
 *  - o mesmo número em dois documentos do MESMO tenant vira 23505 com o nome do índice
 *    — exatamente o erro que `erroEhColisaoNumero` reconhece para renumerar (celular e
 *    painel). Se o nome do índice mudar aqui, o handler deixaria de renumerar;
 *  - o mesmo número em tenants DIFERENTES é permitido (numeração é do prestador);
 *  - rascunho sem número (null ou vazio) não colide com outro rascunho;
 *  - lixeira conta: documento excluído não libera o número;
 *  - com duplicata JÁ existente, a migration ABORTA com a lista e não cria índice nenhum
 *    (não escolhe sozinha qual documento perde o número).
 *
 * O banco de produção não é tocado. O esquema-base é o mínimo de `orcamentos`/`recibos`.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { erroEhColisaoNumero } from '../src/utils/numeroDocumento.ts';

const MIGRATION = readFileSync('supabase/migrations/20261001090000_numero_unico_por_tenant.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) {
    console.log(`  ok   ${nome}`);
    ok++;
  } else {
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
    falhas++;
  }
}

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';

const ESQUEMA = `
create table public.orcamentos (
  id text primary key, user_id uuid not null, numero text, status text,
  excluido_em timestamptz, criado_em timestamptz not null default now()
);
create table public.recibos (
  id text primary key, user_id uuid not null, numero text,
  excluido_em timestamptz, criado_em timestamptz not null default now()
);
`;

async function bancoNovo(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(ESQUEMA);
  return db;
}

async function erroDe(p: Promise<unknown>): Promise<{ code?: string; message?: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e as { code?: string; message?: string };
  }
}

async function indices(db: PGlite): Promise<string[]> {
  const r = await db.query<{ indexname: string }>(
    `select indexname from pg_indexes where indexname like '%numero_por_tenant_uidx' order by indexname`,
  );
  return r.rows.map((x) => x.indexname);
}

console.log('\n1) Dados limpos: cria os índices e é idempotente');
{
  const db = await bancoNovo();
  await db.exec(`
    insert into public.orcamentos (id, user_id, numero) values
      ('o1', '${A}', '00126'), ('o2', '${A}', '00226'), ('o3', '${B}', '00126'),
      ('o4', '${A}', null), ('o5', '${A}', null), ('o6', '${A}', ''), ('o7', '${A}', '  ');
    insert into public.recibos (id, user_id, numero) values
      ('r1', '${A}', 'REC-00126'), ('r2', '${B}', 'REC-00126');
  `);
  const e1 = await erroDe(db.exec(MIGRATION));
  checar('a migration roda sobre dados limpos', e1 === null, e1?.message);
  checar(
    'e cria os DOIS índices',
    JSON.stringify(await indices(db)) === JSON.stringify(['orcamentos_numero_por_tenant_uidx', 'recibos_numero_por_tenant_uidx']),
  );
  const e2 = await erroDe(db.exec(MIGRATION));
  checar('rodar de novo não quebra (idempotente)', e2 === null, e2?.message);

  console.log('\n2) O que o índice barra e o que deixa passar');
  const dupOrc = await erroDe(db.query(`insert into public.orcamentos (id, user_id, numero) values ('o8', '${A}', '00126')`));
  checar('mesmo número no MESMO tenant → 23505', dupOrc?.code === '23505', JSON.stringify(dupOrc));
  checar(
    'e o handler do app reconhece ESTE erro para renumerar o orçamento',
    erroEhColisaoNumero('orcamentos', dupOrc),
    dupOrc?.message,
  );
  const dupRec = await erroDe(db.query(`insert into public.recibos (id, user_id, numero) values ('r3', '${A}', 'REC-00126')`));
  checar('recibo repetido no mesmo tenant → 23505', dupRec?.code === '23505');
  checar('e o handler reconhece a colisão de recibo', erroEhColisaoNumero('recibos', dupRec), dupRec?.message);
  checar(
    'colisão de recibo NÃO é tratada como colisão de orçamento',
    !erroEhColisaoNumero('orcamentos', dupRec),
  );

  const outroTenant = await erroDe(db.query(`insert into public.orcamentos (id, user_id, numero) values ('o9', '${B}', '00226')`));
  checar('mesmo número em OUTRO prestador é permitido', outroTenant === null, outroTenant?.message);
  const rascunho = await erroDe(db.query(`insert into public.orcamentos (id, user_id, numero) values ('o10', '${A}', null)`));
  checar('mais um rascunho sem número não colide', rascunho === null, rascunho?.message);
  const vazio = await erroDe(db.query(`insert into public.orcamentos (id, user_id, numero) values ('o11', '${A}', '')`));
  checar('número vazio também fica de fora', vazio === null, vazio?.message);

  await db.query(`update public.orcamentos set excluido_em = now() where id = 'o2'`);
  const lixeira = await erroDe(db.query(`insert into public.orcamentos (id, user_id, numero) values ('o12', '${A}', '00226')`));
  checar('documento na lixeira NÃO libera o número', lixeira?.code === '23505');
}

console.log('\n3) Duplicata já existente: aborta e não cria nada');
{
  const db = await bancoNovo();
  await db.exec(`
    insert into public.orcamentos (id, user_id, numero) values ('o1', '${A}', '00426'), ('o2', '${A}', '00426');
  `);
  const e = await erroDe(db.exec(MIGRATION));
  await db.exec('rollback'); // o runner de migrations desfaz a transação aberta pelo `begin`
  checar('a migration falha (não escolhe sozinha quem perde o número)', e !== null);
  checar('com mensagem que aponta o tenant e o número', /00426/.test(e?.message ?? '') && (e?.message ?? '').includes(A), e?.message);
  checar('e nenhum índice ficou criado pela metade', (await indices(db)).length === 0);
}

{
  const db = await bancoNovo();
  await db.exec(`
    insert into public.recibos (id, user_id, numero) values ('r1', '${B}', 'REC-00126'), ('r2', '${B}', 'REC-00126');
  `);
  const e = await erroDe(db.exec(MIGRATION));
  await db.exec('rollback');
  checar('duplicata só em RECIBOS também aborta', e !== null && /REC-00126/.test(e.message ?? ''), e?.message);
  checar('e não deixa o índice de orçamentos órfão', (await indices(db)).length === 0);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${ok} ok, ${falhas} falha(s)\n`);
if (falhas > 0) process.exit(1);
