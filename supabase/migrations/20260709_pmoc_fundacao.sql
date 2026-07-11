-- ============================================================================
-- STATUS: APLICADA em 2026-07-08 (abertura do track PMOC — Fase 1 inventário + QR).
-- Idempotente; RLS testada com 2 contas reais (isolamento, membro, autoria carimbada,
-- user_id imutável, QR opaco/único). Fundação PMOC. CONFIRMADO em produção: a migration
-- seguinte (20260715_pmoc_fase2.sql, também APLICADA) faz ALTER TABLE em `pmoc_plans`
-- e CREATE TABLE referenciando `pmoc_plan_versions` — só roda porque estas tabelas já
-- existem no banco. Código do app (`database.ts`, `cloudSync.ts`, `equipamentos.ts`)
-- já lê/escreve `assets`/`pmoc_plans` em produção. Ver docs/EXECUTION_LOG.md
-- ("Track PMOC — Fase 1: CONCLUÍDA") — fonte de verdade sobre o que está no ar.
-- ----------------------------------------------------------------------------
-- OLLI Orçamentos — FUNDAÇÃO do módulo PMOC. Este arquivo é o núcleo mínimo do
-- vertical HVAC/PMOC: ativos (equipamentos) + identidade física (QR), contratos de
-- serviço versionados e planos PMOC versionados. NÃO é o módulo inteiro — ver
-- docs/PMOC_MODULE.md para o mapa completo e o sequenciamento nas ondas.
--
-- CONTEXTO HISTÓRICO (por que a escrita original deste arquivo dizia "NÃO aplicar
-- agora" — decisão já revertida, mantido só como registro):
--   1) Na época, a Onda 3 (ciclo comercial) estava em curso em paralelo e mexia em
--      orcamentos/portal/versões/recibos; o receio era criar tabelas órfãs sem
--      UI/serviço antes do ciclo comercial fechar.
--   2) Assets e contratos dependiam de decisões de UI/sync que a Onda 3 ainda ia
--      firmar (ex.: como o app carimba `criado_por`, como o worker público lê o QR).
--   Essas decisões foram tomadas e a migration FOI aplicada via
--   mcp__supabase__apply_migration em 2026-07-08, com os testes SQL do rodapé
--   rodados nas 2 contas reais (2 JWTs) — não é mais um esqueleto revisável fora de
--   pipeline, é schema vigente. Alterações a partir daqui exigem uma NOVA migration
--   (ex.: 20260715_pmoc_fase2.sql), nunca editar este arquivo.
--
-- PADRÕES HERDADOS (idênticos a 20260707_multitenant / 20260708_versoes — NÃO divergir):
--   - PK `text` gerada no app (id estável entre aparelhos, igual orcamento_versoes).
--   - `user_id uuid not null default auth.uid()` + FK auth.users → o app faz upsert SEM
--     enviar user_id; o default + RLS preenchem/protegem (padrão de cloudSync).
--   - `criado_por uuid default auth.uid()` → autoria do técnico que criou em nome do dono.
--   - Multi-tenant por CAMADA DE ACESSO: os dados são do OWNER (user_id = dono); a equipe
--     ativa enxerga/escreve via public.donos_visiveis() (SECURITY DEFINER, search_path='').
--     NÃO usamos organization_id nas linhas de dados — a org é a lente, não a coluna.
--   - RLS de PERF: SEMPRE `(select auth.uid())` (InitPlan, avaliado 1x por query).
--   - `user_id` IMUTÁVEL via trigger public.bloquear_troca_user_id (reusada da Onda 2):
--     impede que um membro dê UPDATE trocando o dono e exfiltre dados do tenant.
--   - Blocos defensivos `do $$ ... if exists(donos_visiveis) ...$$`: se a fundação
--     multi-tenant não estiver aplicada, cai para a policy "só o dono" — NUNCA vaza.
--   - Idempotência: create table if not exists / add column if not exists /
--     drop policy if exists antes de create / create or replace. Roda N vezes sem erro.
--
-- CAVEAT LEGAL (inegociável — ver docs/PMOC_MODULE.md §"Caveat legal"): NENHUMA coluna
-- deste schema declara conformidade legal automática. `pmoc_plans` guarda situação
-- OPERACIONAL (rascunho/vigente/…), nunca "conforme com a lei X". Referências normativas,
-- periodicidades e limites são DADOS versionados e configuráveis (pmoc_plan_versions.dados),
-- não constantes de código, e sempre precisam de validação do responsável habilitado.
--
-- SEGREDOS: zero. Nenhum token/segredo neste arquivo. `qr_token` é opaco e aleatório,
-- gerado no servidor (worker) com gen_random_bytes — ver docs para o fluxo de emissão.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 0) PRÉ-REQUISITO: a extensão pgcrypto (gen_random_bytes/gen_random_uuid) precisa
--    existir para o DEFAULT do qr_token. No Supabase já vem habilitada; garantimos.
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;


-- ────────────────────────────────────────────────────────────────────────────
-- 1) ASSETS — equipamentos HVAC (núcleo físico do PMOC).
--    Campos HVAC ESSENCIAIS apenas (o resto — meters, warranties, components,
--    relationships — entra em tabelas próprias nas fases seguintes; ver docs).
--    `qr_token` é a identidade pública opaca: único, aleatório, revogável (ver §2).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.assets (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por     uuid default auth.uid(),

  -- vínculo comercial (referências SOFT por id-texto, sem FK dura: clientes é do
  -- app/SQLite e a Onda 3 pode estar mexendo — NÃO criamos FK para não acoplar).
  cliente_id     text,                 -- cliente dono do equipamento (id do app)
  local_id       text,                 -- unidade/local de atendimento (fase locais)

  -- identificação
  codigo_interno text,                 -- código do prestador (ex.: "AC-014")
  patrimonio     text,                 -- código/patrimônio do cliente
  fabricante     text,
  modelo         text,
  numero_serie   text,

  -- características HVAC essenciais
  categoria      text,                 -- split, multisplit, cassete, vrf, chiller, fancoil, camara_fria, ...
  capacidade_btu integer,              -- capacidade em BTU/h (nullable — nem todo ativo tem)
  tensao         text,                 -- '220V', '380V trifásico', ... (texto: domínio informal do técnico)
  refrigerante   text,                 -- 'R410A', 'R32', ...

  -- localização textual curta (a árvore local/edifício/andar/sala é da fase locais)
  localizacao    text,                 -- "Sala 302 - 3º andar" (curto, cabe no adesivo)

  -- ciclo de vida operacional (NÃO é conformidade legal — só estado do ativo)
  situacao       text not null default 'ativo'
                 check (situacao in ('ativo','reserva','parado','em_manutencao',
                                     'interditado','desativado','retirado','substituido','descartado')),
  criticidade    text check (criticidade in ('baixa','media','alta','critica')),

  -- QR OPACO: token aleatório url-safe. UNIQUE global. É o que vai no adesivo (/q/<token>).
  -- DEFAULT gera 24 bytes aleatórios em base64url (~32 chars) → inenumerável.
  -- NUNCA sequencial, NUNCA derivado do id. Rotação/revogação: ver §2 (asset_qr_tokens).
  qr_token       text not null unique
                 default translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_'),
  qr_revogado_em timestamptz,          -- se preenchido, o token vigente está revogado (página pública nega)

  atualizado_em  timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);

create index if not exists assets_user_idx        on public.assets (user_id);
create index if not exists assets_cliente_idx      on public.assets (cliente_id);
create index if not exists assets_local_idx        on public.assets (local_id);
-- Busca por QR na página pública é por token exato; o UNIQUE já cria o índice.
-- Detecção de duplicidade (importação em massa): série/patrimônio por dono.
create index if not exists assets_serie_idx        on public.assets (user_id, numero_serie)
  where numero_serie is not null;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) QR — histórico de tokens + eventos de scan (com revogação).
--    Modelo: `assets.qr_token` é o token VIGENTE (rápido de resolver na página
--    pública). `asset_qr_tokens` é o HISTÓRICO append-only (rotação/revogação com
--    trilha). Ao rotacionar: revoga a linha antiga aqui + gera novo em assets.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.asset_qr_tokens (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por   uuid default auth.uid(),
  asset_id     text not null,          -- soft ref a assets.id (mesmo dono; sem FK dura p/ sync)
  token        text not null unique,   -- cópia do token emitido (histórico); UNIQUE anti-colisão
  emitido_em   timestamptz not null default now(),
  revogado_em  timestamptz,            -- null = ativo; preenchido = revogado (não resolve mais)
  motivo       text                    -- 'rotacao','adesivo_danificado','equipamento_substituido',...
);
create index if not exists asset_qr_tokens_asset_idx on public.asset_qr_tokens (asset_id);
create index if not exists asset_qr_tokens_user_idx  on public.asset_qr_tokens (user_id);

-- Eventos de scan: log append-only para auditoria e rate-limit/anti-enumeração.
-- ATENÇÃO: escrito pelo WORKER público (service_role, RLS off) a cada GET /q/<token>.
-- NÃO guardamos IP cru (LGPD) — só um hash truncado p/ rate-limit (ver docs).
create table if not exists public.qr_scan_events (
  id           bigint generated always as identity primary key,
  asset_id     text,                   -- resolvido pelo worker (null se token inválido/enumeração)
  user_id      uuid,                   -- dono do asset (para o gestor filtrar seus scans)
  token_tentado text,                  -- token bruto tentado (para investigar enumeração)
  resolvido    boolean not null default false,   -- true se bateu num asset com token vigente não-revogado
  ip_hash      text,                   -- hash+salt truncado do IP (rate-limit), NUNCA o IP cru
  user_agent   text,
  criado_em    timestamptz not null default now()
);
create index if not exists qr_scan_events_user_idx  on public.qr_scan_events (user_id, criado_em desc);
create index if not exists qr_scan_events_asset_idx  on public.qr_scan_events (asset_id, criado_em desc);
-- Apoio ao rate-limit por origem numa janela curta.
create index if not exists qr_scan_events_ip_idx     on public.qr_scan_events (ip_hash, criado_em desc);


-- ────────────────────────────────────────────────────────────────────────────
-- 3) CONTRATOS DE SERVIÇO — cabeçalho + versões (nunca sobrescrever assinado).
--    `service_contracts` é o cabeçalho MUTÁVEL (situação, datas correntes).
--    `service_contract_versions` é o histórico IMUTÁVEL: cada mudança relevante
--    congela um snapshot jsonb. Uma vez assinada, a versão não é reescrita (regra
--    de ouro do research §6). O detalhe fino (sites/assets/SLA/billing) mora no
--    jsonb `dados` da versão nesta fundação; vira tabelas próprias na fase contrato.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.service_contracts (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por     uuid default auth.uid(),
  cliente_id     text,                 -- soft ref (cliente do app)
  numero         text,                 -- número do contrato (humano; sequência controlada pelo app)
  titulo         text,
  situacao       text not null default 'rascunho'
                 check (situacao in ('rascunho','em_revisao','aguardando_assinatura','vigente',
                                     'suspenso','encerrado','cancelado')),
  data_inicio    date,
  data_fim       date,                 -- vigência
  renovacao      text check (renovacao in ('manual','automatica')),
  versao_vigente integer,              -- aponta para service_contract_versions.numero_versao vigente
  atualizado_em  timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
create index if not exists service_contracts_user_idx    on public.service_contracts (user_id);
create index if not exists service_contracts_cliente_idx  on public.service_contracts (cliente_id);

create table if not exists public.service_contract_versions (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por     uuid default auth.uid(),
  contract_id    text not null,        -- soft ref a service_contracts.id (mesmo dono)
  numero_versao  integer not null,     -- sequencial POR contrato (app controla)
  dados          jsonb not null default '{}'::jsonb,   -- snapshot íntegro (escopo, SLA, comercial, anexos)
  motivo         text,                 -- por que gerou nova versão (inclusão de ativo, reajuste, ...)
  assinado_em    timestamptz,          -- carimbo de assinatura; DEPOIS disso a versão é intocável (ver trigger §6)
  assinatura_meta jsonb,               -- trilha da assinatura (signatário, hash, ip seguro) — sem segredo
  criado_em      timestamptz not null default now()
);
create index if not exists service_contract_versions_ctr_idx  on public.service_contract_versions (contract_id, numero_versao);
create index if not exists service_contract_versions_user_idx on public.service_contract_versions (user_id);
-- Numeração única por contrato (evita duplicar a mesma versão vinda de 2 aparelhos).
create unique index if not exists service_contract_versions_num_uidx
  on public.service_contract_versions (contract_id, numero_versao);


-- ────────────────────────────────────────────────────────────────────────────
-- 4) PLANOS PMOC — cabeçalho + versões (mesmo modelo de imutabilidade do contrato).
--    `pmoc_plans.situacao` é OPERACIONAL, não legal (ver caveat no topo).
--    O conteúdo do plano (inventário, procedimentos, periodicidades, referências
--    normativas versionadas, responsável técnico) mora no jsonb `dados` da versão.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.pmoc_plans (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por     uuid default auth.uid(),
  cliente_id     text,                 -- soft ref
  contract_id    text,                 -- soft ref: plano pode (não deve obrigatoriamente) nascer de um contrato
  numero         text,
  titulo         text,
  situacao       text not null default 'rascunho'
                 check (situacao in ('rascunho','em_revisao','aguardando_aprovacao_tecnica',
                                     'aprovado','vigente','substituido','suspenso','encerrado')),
  versao_vigente integer,              -- aponta para pmoc_plan_versions.numero_versao vigente
  atualizado_em  timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
create index if not exists pmoc_plans_user_idx     on public.pmoc_plans (user_id);
create index if not exists pmoc_plans_cliente_idx   on public.pmoc_plans (cliente_id);
create index if not exists pmoc_plans_contract_idx  on public.pmoc_plans (contract_id);

create table if not exists public.pmoc_plan_versions (
  id                   text primary key,
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por           uuid default auth.uid(),
  plan_id              text not null,        -- soft ref a pmoc_plans.id
  numero_versao        integer not null,     -- sequencial POR plano
  dados                jsonb not null default '{}'::jsonb,  -- inventário, procedimentos, periodicidades, referências
  -- Responsável técnico e documento de responsabilidade: guardados como DADOS
  -- (configuráveis/versionados), nunca hardcoded. Categoria livre (ART/TRT/RRT/…).
  responsavel_tecnico  text,
  doc_responsabilidade text,                 -- referência/número do documento (ART/TRT/… conforme o conselho)
  aprovado_em          timestamptz,          -- aprovação TÉCNICA (operacional), não declaração de conformidade legal
  aprovacao_meta       jsonb,                -- quem aprovou/assinou + trilha (sem segredo)
  criado_em            timestamptz not null default now()
);
create index if not exists pmoc_plan_versions_plan_idx on public.pmoc_plan_versions (plan_id, numero_versao);
create index if not exists pmoc_plan_versions_user_idx on public.pmoc_plan_versions (user_id);
create unique index if not exists pmoc_plan_versions_num_uidx
  on public.pmoc_plan_versions (plan_id, numero_versao);


-- ────────────────────────────────────────────────────────────────────────────
-- 5) HABILITAR RLS EM TODAS AS TABELAS DE DADOS DO DONO.
--    (qr_scan_events fica FORA da leitura compartilhada padrão — ver §7: é escrita
--     pelo worker/service_role e lida só pelo gestor filtrando por user_id.)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.assets                    enable row level security;
alter table public.asset_qr_tokens           enable row level security;
alter table public.qr_scan_events            enable row level security;
alter table public.service_contracts         enable row level security;
alter table public.service_contract_versions enable row level security;
alter table public.pmoc_plans                enable row level security;
alter table public.pmoc_plan_versions        enable row level security;


-- ────────────────────────────────────────────────────────────────────────────
-- 6) TRIGGERS: user_id imutável (reusa a helper da Onda 2) + assinado imutável.
--    A helper public.bloquear_troca_user_id também congela `criado_por` (autoria).
--    Guarda defensiva: só cria o trigger se a função existir (a fundação a criou).
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tabelas text[] := array[
    'assets','asset_qr_tokens','service_contracts','service_contract_versions',
    'pmoc_plans','pmoc_plan_versions'
  ];
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bloquear_troca_user_id'
  ) then
    foreach t in array tabelas loop
      execute format('drop trigger if exists %I on public.%I', t || '_user_id_imutavel', t);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.bloquear_troca_user_id()',
        t || '_user_id_imutavel', t
      );
    end loop;
  end if;
end $$;

-- Versão de contrato/plano ASSINADA/APROVADA é intocável (regra de ouro §6 do research:
-- nunca sobrescrever assinado). Depois de `assinado_em`/`aprovado_em`, bloqueia UPDATE
-- do snapshot. O upsert idempotente do sync só reescreve versões AINDA não assinadas.
create or replace function public.pmoc_bloquear_versao_congelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- contrato: se a versão OLD já estava assinada, nada do snapshot muda.
  if tg_table_name = 'service_contract_versions' and old.assinado_em is not null then
    if new.dados is distinct from old.dados
       or new.numero_versao is distinct from old.numero_versao
       or new.assinado_em is distinct from old.assinado_em then
      raise exception 'versão de contrato assinada é imutável (gere nova versão)';
    end if;
  end if;
  -- plano: se a versão OLD já estava aprovada, o snapshot é congelado.
  if tg_table_name = 'pmoc_plan_versions' and old.aprovado_em is not null then
    if new.dados is distinct from old.dados
       or new.numero_versao is distinct from old.numero_versao
       or new.aprovado_em is distinct from old.aprovado_em then
      raise exception 'versão de plano PMOC aprovada é imutável (gere nova versão)';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.pmoc_bloquear_versao_congelada() from anon, public;

drop trigger if exists service_contract_versions_congelada on public.service_contract_versions;
create trigger service_contract_versions_congelada
  before update on public.service_contract_versions
  for each row execute function public.pmoc_bloquear_versao_congelada();

drop trigger if exists pmoc_plan_versions_congelada on public.pmoc_plan_versions;
create trigger pmoc_plan_versions_congelada
  before update on public.pmoc_plan_versions
  for each row execute function public.pmoc_bloquear_versao_congelada();


-- ────────────────────────────────────────────────────────────────────────────
-- 7) RLS — dados do dono com LEITURA/ESCRITA COMPARTILHADA pela equipe ativa.
--    Padrão idêntico a orcamentos/orcamento_versoes:
--      SELECT: user_id in (select donos_visiveis())  [fallback: só o dono]
--      INSERT: dono (self) OU membro ativo gravando em nome do owner da org
--      UPDATE/DELETE: quem está no conjunto donos_visiveis()
--    Blocos `do $$` verificam a existência de donos_visiveis p/ o fallback seguro.
--    Fábrica de policies para não repetir 6x o mesmo bloco (equivalente à mão).
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tabelas text[] := array[
    'assets','asset_qr_tokens','service_contracts','service_contract_versions',
    'pmoc_plans','pmoc_plan_versions'
  ];
  tem_dv boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  );
  expr_visivel text;
  expr_self    text := 'user_id = (select auth.uid())';
begin
  -- expressão do "conjunto visível" (compartilhado) ou, sem a fundação, só o dono.
  expr_visivel := case when tem_dv
                       then 'user_id in (select public.donos_visiveis())'
                       else expr_self end;

  foreach t in array tabelas loop
    -- SELECT: conjunto visível
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (%s)',
      t || '_select', t, expr_visivel
    );

    -- INSERT: dono self OU (com fundação) membro ativo gravando em nome do owner,
    -- carimbando a própria autoria em criado_por.
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    if tem_dv then
      execute format(
        'create policy %I on public.%I as permissive for insert to authenticated with check (%s or (%s and criado_por = (select auth.uid())))',
        t || '_insert', t, expr_self, expr_visivel
      );
    else
      execute format(
        'create policy %I on public.%I as permissive for insert to authenticated with check (%s)',
        t || '_insert', t, expr_self
      );
    end if;

    -- UPDATE: conjunto visível (using + with check)
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I as permissive for update to authenticated using (%s) with check (%s)',
      t || '_update', t, expr_visivel, expr_visivel
    );

    -- DELETE: conjunto visível
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I as permissive for delete to authenticated using (%s)',
      t || '_delete', t, expr_visivel
    );
  end loop;
end $$;

-- qr_scan_events — caso especial (NÃO segue a fábrica acima):
--   - INSERT é do WORKER público (service_role/RLS off) a cada scan; nenhum
--     authenticated grava scan direto pelo app → sem policy de INSERT p/ authenticated.
--   - SELECT: o gestor da org (ou o dono) vê os scans dos SEUS ativos, filtrando por
--     user_id no conjunto visível. Linhas com user_id null (enumeração/token inválido)
--     ficam invisíveis a todos exceto service_role (investigação de segurança server-side).
do $$
declare
  tem_dv boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  );
begin
  drop policy if exists qr_scan_events_select on public.qr_scan_events;
  if tem_dv then
    create policy qr_scan_events_select
      on public.qr_scan_events
      as permissive for select to authenticated
      using (user_id is not null and user_id in (select public.donos_visiveis()));
  else
    create policy qr_scan_events_select
      on public.qr_scan_events
      as permissive for select to authenticated
      using (user_id is not null and user_id = (select auth.uid()));
  end if;
  -- Sem INSERT/UPDATE/DELETE para authenticated: append-only pelo worker/service_role.
end $$;


-- ============================================================================
-- 8) TESTES SQL (rodar MANUALMENTE quando o track PMOC abrir — o integrador executa
--    com 2 JWTs, como nas migrations da Onda 2). Substitua <A> (dono) e <B> (técnico
--    ativo da org de A). Preparação de A/org/convite: ver 20260707_multitenant §8 T3.
-- ----------------------------------------------------------------------------
-- -- TESTE T1: dono cria asset e o QR nasce opaco/único (single-tenant intacto)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.assets (id, codigo_interno, categoria) values ('ast-1', 'AC-014', 'split'); -- PASSA
--   select qr_token, length(qr_token) from public.assets where id = 'ast-1';
--     -- qr_token deve ser ~32 chars url-safe (sem +, /, =), NÃO sequencial, NÃO derivado do id.
--   reset role;
--
-- -- TESTE T2: outro user SEM org NÃO vê o asset de A (zero vazamento entre tenants)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.assets where id = 'ast-1';   -- 0 (se B não é membro de A)
--   reset role;
--
-- -- TESTE T3: técnico ATIVO da org de A vê e cria asset EM NOME de A (autoria carimbada)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.assets where id = 'ast-1';   -- >= 1 (vê os de A)
--   insert into public.assets (id, user_id, criado_por, codigo_interno)
--     values ('ast-2', '<A>', '<B>', 'AC-020');              -- PASSA (grava no tenant de A, autor B)
--   -- proibido: gravar em nome de A sem ser o autor → viola o WITH CHECK do INSERT
--   -- insert into public.assets (id, user_id, criado_por) values ('ast-x','<A>','<C-qualquer>'); -- FALHA
--   reset role;
--
-- -- TESTE T4: user_id imutável (não transfere o ativo do tenant de A para B)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   update public.assets set user_id = '<B>' where id = 'ast-1';   -- FALHA: 'user_id é imutável'
--   reset role;
--
-- -- TESTE T5: QR único (a UNIQUE global barra colisão de token)
--   -- (como service_role/RLS off:)
--   insert into public.assets (id, user_id, qr_token)
--     values ('ast-dup', '<A>', (select qr_token from public.assets where id='ast-1')); -- FALHA: unique
--
-- -- TESTE T6: revogação do QR (a página pública passa a negar — lógica no worker)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   update public.assets set qr_revogado_em = now() where id = 'ast-1';   -- PASSA
--   insert into public.asset_qr_tokens (id, asset_id, token, revogado_em, motivo)
--     values ('qrt-1', 'ast-1', 'tok-antigo', now(), 'rotacao');          -- PASSA (histórico da revogação)
--   reset role;
--
-- -- TESTE T7: versão de contrato ASSINADA é imutável (nunca sobrescrever assinado)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.service_contracts (id, numero, situacao) values ('ctr-1','0001','vigente'); -- PASSA
--   insert into public.service_contract_versions (id, contract_id, numero_versao, dados, assinado_em)
--     values ('cv-1','ctr-1',1,'{"mensal":300}', now());                  -- PASSA (versão assinada)
--   update public.service_contract_versions set dados = '{"mensal":999}' where id='cv-1';
--     -- FALHA: 'versão de contrato assinada é imutável (gere nova versão)'
--   -- versão NÃO assinada pode ser reescrita (idempotência do sync):
--   insert into public.service_contract_versions (id, contract_id, numero_versao, dados)
--     values ('cv-2','ctr-1',2,'{"mensal":320}');                         -- PASSA (rascunho)
--   update public.service_contract_versions set dados = '{"mensal":330}' where id='cv-2'; -- PASSA
--   reset role;
--
-- -- TESTE T8: numeração de versão única por contrato/plano
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.service_contract_versions (id, contract_id, numero_versao, dados)
--     values ('cv-dup','ctr-1',1,'{}');   -- FALHA: (contract_id, numero_versao) já existe
--   reset role;
--
-- -- TESTE T9: versão de plano PMOC APROVADA é imutável (mesma regra)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.pmoc_plans (id, numero, situacao) values ('plan-1','P-0001','vigente'); -- PASSA
--   insert into public.pmoc_plan_versions (id, plan_id, numero_versao, dados, aprovado_em, responsavel_tecnico)
--     values ('pv-1','plan-1',1,'{"periodicidade":"mensal"}', now(), 'Eng. Fulano'); -- PASSA
--   update public.pmoc_plan_versions set dados = '{"periodicidade":"anual"}' where id='pv-1';
--     -- FALHA: 'versão de plano PMOC aprovada é imutável (gere nova versão)'
--   reset role;
--
-- -- TESTE T10: gestor vê scans dos SEUS ativos; scans órfãos (enumeração) ficam ocultos
--   -- (worker grava, como service_role/RLS off:)
--   insert into public.qr_scan_events (asset_id, user_id, resolvido) values ('ast-1','<A>',true);
--   insert into public.qr_scan_events (asset_id, user_id, token_tentado, resolvido)
--     values (null, null, 'tentativa-enumeracao', false);
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   select count(*) from public.qr_scan_events;   -- 1 (só o scan resolvido do próprio ativo; o órfão fica oculto)
--   reset role;
-- ============================================================================
