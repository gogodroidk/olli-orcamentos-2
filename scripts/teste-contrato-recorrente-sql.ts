/**
 * Contrato recorrente por ativo — a migration `20260930130500_contrato_recorrente_ativo.sql`
 * rodando de verdade num Postgres (PGlite, em memória), com RLS ligada e usuários
 * SINTÉTICOS trocando de papel (`set role authenticated` + `auth.uid()` do JWT).
 *
 *     node scripts/teste-contrato-recorrente-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - ISOLAMENTO DE TENANT: o dono B não lê, não cria e não altera nada do dono A
 *    (contratos, visitas); anon não lê nada;
 *  - papéis: gestor grava no tenant do DONO (com autoria), técnico LÊ mas não cria nem
 *    altera contrato/visita, ex-membro (inativo) não vê mais nada;
 *  - a CHAVE (tenant, contrato, mês) barra visita dupla mesmo com id diferente, e
 *    `on conflict do nothing` com o id determinístico vira no-op;
 *  - CHECKs: periodicidade, horário, valor, vigência, mês da visita, recorrência;
 *  - user_id imutável;
 *  - PONTA A PONTA: o motor real (`gerarVisitasDosContratos`) gravando como o GESTOR,
 *    sob RLS, duas vezes e com dois "aparelhos" em paralelo → uma OS por visita.
 *
 * O banco de produção não é tocado. O esquema-base abaixo é o MÍNIMO das tabelas reais
 * (colunas e policies conferidas por SELECT em produção em 30/09); os helpers de RLS
 * vêm do arquivo real `20260906120000_rls_helpers_private_schema.sql`.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { linhaParaContrato } from '../src/utils/contratoRecorrente.ts';
import { gerarVisitasDosContratos, type PortaGeracaoContratos } from '../src/utils/contratoRecorrenteGeracao.ts';

const MIGRATION = readFileSync('supabase/migrations/20260930130500_contrato_recorrente_ativo.sql', 'utf8');
const HELPERS_RLS = readFileSync('supabase/migrations/20260906120000_rls_helpers_private_schema.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_A = id(1), GESTOR_A = id(2), TEC_A = id(3), EX_A = id(4), DONO_B = id(11);
const ORG_A = id(101), ORG_B = id(102);

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.organizacoes (id uuid primary key, owner_user_id uuid not null);
create table public.organizacao_membros (
  org_id uuid not null, user_id uuid not null, papel text not null, ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create function public.bloquear_troca_user_id() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id é imutável';
  end if;
  if old.criado_por is not null and new.criado_por is distinct from old.criado_por then
    new.criado_por := old.criado_por;
  end if;
  return new;
end;
$$;

-- Tabelas de dados como em produção (colunas conferidas por SELECT em 30/09).
create table public.service_contracts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por uuid default auth.uid(),
  cliente_id text, numero text, titulo text,
  situacao text not null default 'rascunho'
    check (situacao in ('rascunho','em_revisao','aguardando_assinatura','vigente','suspenso','encerrado','cancelado')),
  data_inicio date, data_fim date,
  renovacao text check (renovacao in ('manual','automatica')),
  versao_vigente integer,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create table public.agendamentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id text, cliente_nome text not null, titulo text not null, tipo text not null,
  inicio timestamptz not null, fim timestamptz, endereco text,
  status text not null default 'agendado', orcamento_id text, observacao text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(), excluido_em timestamptz
);
create table public.ordens_servico (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por uuid default auth.uid(),
  numero text, orcamento_id text, cliente_id text, cliente_nome text, titulo text, descricao text,
  status text not null default 'aberta', tecnico_id uuid, tecnico_nome text, data_agendada timestamptz,
  checklist jsonb not null default '[]'::jsonb, fotos jsonb not null default '[]'::jsonb,
  observacoes text, valor numeric,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  excluido_em timestamptz, concluido_em timestamptz
);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
`;

// Policies de produção (pg_policies em 30/09), aplicadas DEPOIS dos helpers de RLS.
const POLICIES_BASE = `
alter table public.organizacoes enable row level security;
alter table public.organizacao_membros enable row level security;
create policy organizacoes_membro_select on public.organizacoes for select to authenticated using (public.eh_membro_ativo(id));
create policy membros_self_ou_gestao_select on public.organizacao_membros for select to authenticated
  using (user_id = (select auth.uid()) or public.eh_gestao(org_id));

do $$
declare t text;
begin
  foreach t in array array['service_contracts','agendamentos','ordens_servico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id in (select public.donos_visiveis()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((user_id = (select auth.uid())) or ((user_id in (select public.donos_visiveis())) and (criado_por = (select auth.uid()))))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id in (select public.donos_visiveis())) with check (user_id in (select public.donos_visiveis()))', t || '_update', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.bloquear_troca_user_id()', t || '_user_id_imutavel', t);
  end loop;
end $$;
`;

const db = new PGlite();
await db.exec(ESQUEMA);
await db.exec(HELPERS_RLS);
await db.exec(POLICIES_BASE);
await db.exec(`
insert into auth.users values ('${DONO_A}'), ('${GESTOR_A}'), ('${TEC_A}'), ('${EX_A}'), ('${DONO_B}');
insert into public.organizacoes values ('${ORG_A}', '${DONO_A}'), ('${ORG_B}', '${DONO_B}');
insert into public.organizacao_membros (org_id, user_id, papel, ativo) values
  ('${ORG_A}', '${DONO_A}', 'owner', true),
  ('${ORG_A}', '${GESTOR_A}', 'gestor', true),
  ('${ORG_A}', '${TEC_A}', 'tecnico', true),
  ('${ORG_A}', '${EX_A}', 'tecnico', false),
  ('${ORG_B}', '${DONO_B}', 'owner', true);
`);

await db.exec(MIGRATION);
// Roda de novo: a migration é idempotente.
await db.exec(MIGRATION);
console.log('\nContrato recorrente — migration aplicada (2x) no PGlite');

async function como<T>(usuario: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? '']);
  await db.exec(`set role ${usuario ? 'authenticated' : 'anon'}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

async function tenta(sql: string, params: unknown[] = []): Promise<{ ok: boolean; linhas: number; erro: string }> {
  try {
    const r = await db.query(sql, params);
    return { ok: true, linhas: r.affectedRows ?? r.rows.length, erro: '' };
  } catch (e) {
    return { ok: false, linhas: 0, erro: (e as Error).message };
  }
}

const contagem = async (sql: string, params: unknown[] = []) => Number(((await db.query<{ n: number }>(sql, params)).rows[0] as { n: number }).n);

const CONTRATO_COLS = `id, user_id, titulo, cliente_nome, situacao, periodicidade, data_inicio, horario_visita, ativos, atividades, modo_cobranca, valor, criado_em`;
const contratoSql = (cid: string, dono: string) =>
  `insert into public.service_contracts (${CONTRATO_COLS})
   values ('${cid}', '${dono}', 'Piscina mensal', 'Condomínio', 'vigente', 'mensal', '2026-09-10', '08:00',
           '[{"id":"a1","nome":"Piscina"},{"id":"a2","nome":"Caixa d''água"}]', '["Medir pH"]', 'mensal', 450, '2026-09-01T12:00Z')`;

console.log('\nEscrita de contrato por papel');
checar('dono A cria contrato no próprio tenant', (await como(DONO_A, () => tenta(contratoSql('ctA1', DONO_A)))).ok);
const gestor = await como(GESTOR_A, () => tenta(contratoSql('ctA2', DONO_A)));
checar('gestor de A cria contrato no tenant do DONO (autoria = gestor)', gestor.ok, gestor.erro);
checar('autoria gravada é a do gestor', (await contagem(`select count(*)::int n from public.service_contracts where id='ctA2' and criado_por='${GESTOR_A}'`)) === 1);
const tec = await como(TEC_A, () => tenta(contratoSql('ctA3', DONO_A)));
checar('técnico de A NÃO cria contrato (contrato é dinheiro: só gestão)', !tec.ok && /row-level security/i.test(tec.erro), tec.erro);
const tecUpd = await como(TEC_A, () => tenta(`update public.service_contracts set valor = 1 where id = 'ctA1'`));
checar('técnico de A NÃO altera o valor do contrato', tecUpd.ok && tecUpd.linhas === 0, tecUpd.erro);
const gUpd = await como(GESTOR_A, () => tenta(`update public.service_contracts set valor = 500 where id = 'ctA1'`));
checar('gestor de A altera contrato do dono', gUpd.ok && gUpd.linhas === 1, gUpd.erro);
checar('técnico de A LÊ os contratos da empresa (vê de onde veio a visita)', (await como(TEC_A, () => contagem('select count(*)::int n from public.service_contracts'))) === 2);
checar('ex-membro (inativo) não vê mais nada de A', (await como(EX_A, () => contagem('select count(*)::int n from public.service_contracts'))) === 0);

console.log('\nIsolamento entre tenants');
checar('dono B não vê contratos de A', (await como(DONO_B, () => contagem('select count(*)::int n from public.service_contracts'))) === 0);
const bIns = await como(DONO_B, () => tenta(contratoSql('ctB-invasor', DONO_A)));
checar('dono B não cria contrato no tenant de A', !bIns.ok, bIns.erro);
const bUpd = await como(DONO_B, () => tenta(`update public.service_contracts set valor = 0 where id = 'ctA1'`));
checar('dono B não altera contrato de A (0 linhas)', bUpd.ok && bUpd.linhas === 0);
const bDel = await como(DONO_B, () => tenta(`delete from public.service_contracts where id = 'ctA1'`));
checar('dono B não apaga contrato de A (0 linhas)', bDel.ok && bDel.linhas === 0);
checar('dono B cria o próprio contrato', (await como(DONO_B, () => tenta(contratoSql('ctB1', DONO_B)))).ok);
checar('dono A não vê o contrato de B', (await como(DONO_A, () => contagem(`select count(*)::int n from public.service_contracts where id='ctB1'`))) === 0);
const anon = await como(null, () => tenta('select * from public.contrato_visitas'));
checar('anon não lê o livro de visitas (sem GRANT)', !anon.ok && /permission denied/i.test(anon.erro), anon.erro);

console.log('\nLivro de visitas (contrato_visitas)');
const visita = (vid: string, dono: string, contrato: string, periodo: string) =>
  `insert into public.contrato_visitas (id, user_id, contrato_id, periodo, data_prevista, ordem_id)
   values ('${vid}', '${dono}', '${contrato}', '${periodo}', '${periodo}-10', 'os_${vid}') on conflict (id) do nothing`;
checar('dono A reserva a visita de outubro', (await como(DONO_A, () => tenta(visita('cv_ctA1_2026-10', DONO_A, 'ctA1', '2026-10')))).linhas === 1);
checar('repetir com o mesmo id é no-op (idempotente)', (await como(DONO_A, () => tenta(visita('cv_ctA1_2026-10', DONO_A, 'ctA1', '2026-10')))).linhas === 0);
const dup = await como(GESTOR_A, () => tenta(visita('outro-id', DONO_A, 'ctA1', '2026-10')));
checar('mesmo contrato + mês com OUTRO id é barrado pela chave única', !dup.ok && /contrato_visitas_tenant_unica/.test(dup.erro), dup.erro);
const tecV = await como(TEC_A, () => tenta(visita('cv_tec', DONO_A, 'ctA1', '2026-11')));
checar('técnico não gera visita', !tecV.ok, tecV.erro);
// Posseiro: grava a reserva determinística do mês no PRÓPRIO tenant apontando para o
// contrato do dono. Se passasse, o gerador do dono veria o id ocupado e pularia o mês.
const tecPosse = await como(TEC_A, () => tenta(visita('cv_ctA1_2026-11', TEC_A, 'ctA1', '2026-11')));
checar('técnico não ocupa a reserva do mês no próprio tenant (FK contrato+tenant)', !tecPosse.ok && /foreign key/i.test(tecPosse.erro), tecPosse.erro || 'passou sem erro');
const bPosse = await como(DONO_B, () => tenta(visita('cv_ctA1_2026-12', DONO_B, 'ctA1', '2026-12')));
checar('dono B não ocupa a reserva de um contrato de A no tenant dele', !bPosse.ok && /foreign key/i.test(bPosse.erro), bPosse.erro || 'passou sem erro');
checar('técnico LÊ a visita da empresa', (await como(TEC_A, () => contagem('select count(*)::int n from public.contrato_visitas'))) === 1);
checar('dono B não vê a visita de A', (await como(DONO_B, () => contagem('select count(*)::int n from public.contrato_visitas'))) === 0);
const bV = await como(DONO_B, () => tenta(visita('cv_b', DONO_A, 'ctA1', '2026-12')));
checar('dono B não grava visita no tenant de A', !bV.ok, bV.erro);
const bConf = await como(DONO_B, () => tenta(`update public.contrato_visitas set ordem_criada_em = now()`));
checar('dono B não confirma visita de A (0 linhas)', bConf.ok && bConf.linhas === 0);
const troca = await como(DONO_A, () => tenta(`update public.contrato_visitas set user_id = '${DONO_B}' where id = 'cv_ctA1_2026-10'`));
checar('user_id da visita é imutável', !troca.ok, troca.erro);
const orf = await como(DONO_A, () => tenta(visita('cv_x', DONO_A, 'nao-existe', '2026-10')));
checar('visita de contrato inexistente é recusada (FK)', !orf.ok && /foreign key/i.test(orf.erro), orf.erro);

console.log('\nCHECKs');
const chk = async (nome: string, sql: string) => {
  const r = await como(DONO_A, () => tenta(sql));
  checar(nome, !r.ok && /check constraint|violates/i.test(r.erro), r.erro || 'passou sem erro');
};
await chk('periodicidade fora do vocabulário', `update public.service_contracts set periodicidade = 'semanal' where id = 'ctA1'`);
await chk('horário inválido', `update public.service_contracts set horario_visita = '25:00' where id = 'ctA1'`);
await chk('valor negativo', `update public.service_contracts set valor = -1 where id = 'ctA1'`);
await chk('fim antes do início', `update public.service_contracts set data_fim = '2026-01-01' where id = 'ctA1'`);
await chk('modo de cobrança desconhecido', `update public.service_contracts set modo_cobranca = 'anual' where id = 'ctA1'`);
await chk('ativos que não são lista', `update public.service_contracts set ativos = '{}'::jsonb where id = 'ctA1'`);
await chk('contrato recorrente sem data de início', `update public.service_contracts set data_inicio = null where id = 'ctA1'`);
await chk('mês da visita malformado',
  `insert into public.contrato_visitas (id, user_id, contrato_id, periodo, data_prevista, ordem_id)
   values ('cv_mal', '${DONO_A}', 'ctA1', '2026-13', '2026-12-10', 'os_mal')`);
await chk('recorrência de agenda desconhecida',
  `insert into public.agendamentos (id, user_id, cliente_nome, titulo, tipo, inicio, recorrencia) values ('agx', '${DONO_A}', 'C', 'T', 'visita', now(), 'diaria')`);
const agOk = await como(GESTOR_A, () => tenta(
  `insert into public.agendamentos (id, user_id, cliente_nome, titulo, tipo, inicio, recorrencia, recorrencia_ate, responsavel_id, responsavel_nome)
   values ('agq', '${DONO_A}', 'C', 'T', 'limpeza', now(), 'quinzenal', '2026-12-31', '${TEC_A}', 'Técnico A')`));
checar('agenda aceita recorrência + técnico responsável (gestor no tenant do dono)', agOk.ok, agOk.erro);

console.log('\nPonta a ponta: o motor real gravando como o GESTOR, sob RLS');

function portaPg(usuario: string): PortaGeracaoContratos {
  const inserir = async (tabela: string, linha: Record<string, unknown>) => {
    const cols = Object.keys(linha);
    const vals = cols.map((c) => {
      const v = linha[c];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    return como(usuario, () =>
      db.query(
        `insert into public.${tabela} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) on conflict (id) do nothing returning id`,
        vals,
      ),
    );
  };
  return {
    reservas: (ids) =>
      como(usuario, async () =>
        (await db.query<{ id: string; contrato_id: string; periodo: string; ordem_criada_em: string | null }>(
          'select id, contrato_id, periodo, ordem_criada_em from public.contrato_visitas where contrato_id = any($1)', [ids],
        )).rows.map((r) => ({ id: r.id, contratoId: r.contrato_id, periodo: r.periodo, ordemCriadaEm: r.ordem_criada_em })),
      ),
    reservar: async (l) => (await inserir('contrato_visitas', l)).rows.length > 0,
    inserirOrdem: async (l) => { await inserir('ordens_servico', l); },
    inserirAgendamento: async (l) => { await inserir('agendamentos', l); },
    confirmar: async (rid, quando) => {
      await como(usuario, () => db.query('update public.contrato_visitas set ordem_criada_em = $2, atualizado_em = $2 where id = $1', [rid, quando]));
    },
    proximoSequencialOs: async () => {
      const r = await como(usuario, () => db.query<{ numero: string | null }>('select numero from public.ordens_servico'));
      return r.rows.reduce((m, x) => Math.max(m, Number(/(\d+)\s*$/.exec(x.numero ?? '')?.[1] ?? 0)), 0) + 1;
    },
  };
}

const lerContratos = async (usuario: string) =>
  como(usuario, async () => (await db.query<Record<string, unknown>>(`select * from public.service_contracts where excluido_em is null and periodicidade is not null`)).rows.map(linhaParaContrato));

const agora = new Date('2026-09-12T15:00:00Z'); // 12/09 meio-dia em Brasília
const contratosA = (await lerContratos(GESTOR_A)).filter((c) => c.userId === DONO_A);
checar('gestor lê 2 contratos do dono A (e nenhum de B)', contratosA.length === 2 && (await lerContratos(GESTOR_A)).length === 2);
const r1 = await gerarVisitasDosContratos(portaPg(GESTOR_A), contratosA, { agora });
// ctA1 já tinha outubro reservado sem confirmação (órfã) → recuperada; setembro nova. ctA2: setembro + outubro novas.
checar('1ª execução: 3 visitas novas + 1 reserva órfã reconstruída', r1.criadas === 3 && r1.recuperadas === 1 && r1.falhas === 0, JSON.stringify(r1));
const r2 = await gerarVisitasDosContratos(portaPg(GESTOR_A), contratosA, { agora });
checar('2ª execução: nada novo (idempotente)', r2.criadas === 0 && r2.recuperadas === 0 && r2.jaExistiam === 4, JSON.stringify(r2));
const paralelo = await Promise.all([portaPg(GESTOR_A), portaPg(DONO_A)].map((p) =>
  gerarVisitasDosContratos(p, contratosA, { agora: new Date('2026-10-12T15:00:00Z') })));
checar('dois aparelhos em paralelo no mês seguinte: 2 visitas novas no total', paralelo.reduce((s, r) => s + r.criadas, 0) === 2, JSON.stringify(paralelo));
checar('uma OS por visita no banco (6 visitas = 6 OS)', (await contagem('select count(*)::int n from public.ordens_servico')) === 6);
checar('um agendamento por visita, ligado ao contrato', (await contagem(`select count(*)::int n from public.agendamentos where contrato_id is not null`)) === 6);
checar('todas as OS nasceram no tenant do DONO A', (await contagem(`select count(*)::int n from public.ordens_servico where user_id <> '${DONO_A}'`)) === 0);
checar('números de OS sem repetição', (await contagem('select count(distinct numero)::int n from public.ordens_servico')) === 6);
checar('dono B não vê nenhuma OS gerada para A', (await como(DONO_B, () => contagem('select count(*)::int n from public.ordens_servico'))) === 0);
const rTec = await gerarVisitasDosContratos(portaPg(TEC_A), contratosA, { agora: new Date('2026-11-12T15:00:00Z') });
checar('técnico rodando o motor não cria nada (RLS barra a reserva)', rTec.criadas === 0 && rTec.falhas > 0, JSON.stringify(rTec));
checar('…e não deixa OS órfã para trás', (await contagem('select count(*)::int n from public.ordens_servico')) === 6);

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
