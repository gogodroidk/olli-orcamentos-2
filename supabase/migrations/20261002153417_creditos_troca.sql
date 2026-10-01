-- OLLI — CRÉDITO DE TROCA ("Vim de outro app").
--
-- O prestador que já pagou outro app de orçamento manda um print/foto da
-- assinatura de lá. Um administrador confere À MÃO e, se aprovar, o OLLI libera
-- o Pro por até CREDITO_TROCA_MESES_MAX meses (fonte: src/services/limitesComerciais.ts;
-- o teste scripts/teste-credito-troca-sql.ts garante a paridade com este arquivo).
--
-- NÃO É VENDA. Nada aqui cobra, nem toca nos campos do gateway (plano/status/
-- current_period_end/stripe_*). A concessão usa o mesmo mecanismo auditado que o
-- painel já usa para "Conceder Pro" (admin_plano_override + admin_override_ate,
-- ver 20260820163046_admin_governanca_entitlements.sql), com as MESMAS regras de
-- guarda do `concederPlanoPeriodo` do Pix (worker/src/mercadopago.js):
--   • preserva nível maior (quem já tem Empresa manual continua Empresa);
--   • preserva vigência maior (concessão sem data final continua sem data final).
-- Por que não gravar como pagamento: `status='active'` dispararia o marco "pagou"
-- do funil de receita (20260930120100_funil_receita.sql) e contaria crédito
-- grátis como cliente pagante — o painel mentiria sobre receita.
--
-- Regras:
--   • 1 crédito por conta: índice único parcial — no máximo UM pedido
--     'pendente' OU 'aprovado' por usuário. Recusado (ex.: print ilegível) pode
--     reenviar, até CREDITO_TROCA_PEDIDOS_MAX pedidos no total;
--   • só o DONO da conta pede: membro de equipe de outro dono não consome nada
--     (o plano dele vem do dono);
--   • o comprovante fica no bucket PRIVADO já existente (olli-documentos), na
--     pasta do próprio usuário, e precisa existir em storage.objects;
--   • RLS: o dono lê só o seu; administrador do SaaS (admin_memberships ativo,
--     com MFA/AAL2) lê todos; NINGUÉM escreve direto — só pelas RPCs abaixo;
--   • aprovar/recusar é RPC service_role (o Worker valida papel + MFA antes) e
--     grava a trilha imutável admin_audit_log NA MESMA transação;
--   • ninguém decide o próprio pedido (administrador não se autoaprova).
--
-- Aplicação em produção é gate separado (depois do merge). Aditiva: tabela nova,
-- funções novas; nenhuma tabela existente perde dado.

create table if not exists public.creditos_troca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_anterior text not null
    check (char_length(btrim(app_anterior)) between 2 and 60),
  -- Quando vence a assinatura no outro app (o que o prestador informou). Só
  -- orienta a decisão do administrador; o teto continua sendo de meses.
  vence_em date,
  observacao text
    check (observacao is null or char_length(observacao) <= 500),
  -- Chave do StorageProvider: "<bucket>/<user_id>/anexo/<arquivo>".
  comprovante_chave text not null
    check (
      comprovante_chave ~ '^olli-documentos/[0-9a-f-]{36}/anexo/[A-Za-z0-9._-]{1,120}$'
      and position('..' in comprovante_chave) = 0
    ),
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'recusado')),
  meses_concedidos smallint
    check (meses_concedidos is null or meses_concedidos between 1 and 3),
  concedido_ate timestamptz,
  motivo_recusa text
    check (motivo_recusa is null or char_length(btrim(motivo_recusa)) between 3 and 500),
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  aviso_email_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- O comprovante tem de estar na pasta do PRÓPRIO usuário.
  constraint creditos_troca_comprovante_do_dono
    check (split_part(comprovante_chave, '/', 2) = user_id::text),
  -- Estado coerente: pendente não tem decisão; aprovado tem meses e data;
  -- recusado tem motivo.
  constraint creditos_troca_decisao_coerente check (
    (status = 'pendente' and decidido_em is null and meses_concedidos is null
      and concedido_ate is null and motivo_recusa is null)
    or (status = 'aprovado' and decidido_em is not null and meses_concedidos is not null
      and concedido_ate is not null and motivo_recusa is null)
    or (status = 'recusado' and decidido_em is not null and meses_concedidos is null
      and concedido_ate is null and motivo_recusa is not null)
  )
);

-- 1 VEZ POR CONTA: no máximo um pedido em análise ou aprovado por usuário.
create unique index if not exists creditos_troca_uma_vez_por_conta
  on public.creditos_troca (user_id)
  where status in ('pendente', 'aprovado');

create index if not exists creditos_troca_status_criado_idx
  on public.creditos_troca (status, criado_em desc);
create index if not exists creditos_troca_decidido_por_idx
  on public.creditos_troca (decidido_por);

comment on table public.creditos_troca is
  'Crédito de troca: quem pagou outro app pede, um admin confere o comprovante e libera Pro por até 3 meses (concessão de acesso, não venda). 1 por conta.';

alter table public.creditos_troca enable row level security;
alter table public.creditos_troca force row level security;
revoke all on table public.creditos_troca from public, anon, authenticated;
-- Leitura do cliente sem colunas internas (quem decidiu, quando o e-mail saiu).
grant select (
  id, user_id, app_anterior, vence_em, observacao, comprovante_chave, status,
  meses_concedidos, concedido_ate, motivo_recusa, decidido_em, criado_em
) on table public.creditos_troca to authenticated;
grant select, insert, update on table public.creditos_troca to service_role;

-- Administrador do SaaS com MFA confirmado. Mora no schema `private` (fora do
-- Data API), no mesmo padrão de 20260906120000_rls_helpers_private_schema.sql:
-- SECURITY DEFINER porque admin_memberships é fechada (force RLS, sem grant
-- para authenticated), e a policy chama direto — sem wrapper público.
create schema if not exists private;

create or replace function private.eh_admin_saas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.admin_memberships m
       where m.user_id = (select auth.uid())
         and m.ativo
         and m.papel in ('owner', 'admin', 'financeiro', 'suporte')
     );
$$;

revoke all on function private.eh_admin_saas() from public, anon;
grant execute on function private.eh_admin_saas() to authenticated, service_role;

drop policy if exists creditos_troca_dono_le on public.creditos_troca;
create policy creditos_troca_dono_le
  on public.creditos_troca for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists creditos_troca_admin_le on public.creditos_troca;
create policy creditos_troca_admin_le
  on public.creditos_troca for select to authenticated
  using ((select private.eh_admin_saas()));

-- ─── Pedido do prestador ────────────────────────────────────────────────────
create or replace function public.solicitar_credito_troca(
  p_app_anterior text,
  p_vence_em date,
  p_observacao text,
  p_comprovante_chave text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_app text := btrim(coalesce(p_app_anterior, ''));
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_chave text := btrim(coalesce(p_comprovante_chave, ''));
  v_total integer;
  v_linha public.creditos_troca%rowtype;
begin
  if v_uid is null then raise exception 'sessao_obrigatoria'; end if;
  if char_length(v_app) not between 2 and 60 then raise exception 'app_invalido'; end if;
  if v_obs is not null and char_length(v_obs) > 500 then raise exception 'observacao_invalida'; end if;
  if p_vence_em is not null
     and (p_vence_em < current_date or p_vence_em > current_date + 800) then
    raise exception 'vencimento_invalido';
  end if;
  if v_chave !~ '^olli-documentos/[0-9a-f-]{36}/anexo/[A-Za-z0-9._-]{1,120}$'
     or position('..' in v_chave) > 0
     or split_part(v_chave, '/', 2) <> v_uid::text then
    raise exception 'comprovante_invalido';
  end if;

  -- Membro de equipe de OUTRO dono: o plano dele vem do dono; não consome crédito.
  if exists (
    select 1
    from public.organizacao_membros m
    join public.organizacoes o on o.id = m.org_id
    where m.user_id = v_uid and m.ativo and o.owner_user_id <> v_uid
  ) then
    raise exception 'somente_dono';
  end if;

  -- O arquivo precisa existir de verdade no bucket privado (não basta a string).
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'olli-documentos'
      and so.name = substr(v_chave, char_length('olli-documentos/') + 1)
  ) then
    raise exception 'comprovante_inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text || ':credito_troca', 0));

  if exists (select 1 from public.creditos_troca c where c.user_id = v_uid and c.status = 'aprovado') then
    raise exception 'credito_ja_usado';
  end if;
  if exists (select 1 from public.creditos_troca c where c.user_id = v_uid and c.status = 'pendente') then
    raise exception 'pedido_em_analise';
  end if;
  select count(*) into v_total from public.creditos_troca c where c.user_id = v_uid;
  -- CREDITO_TROCA_PEDIDOS_MAX
  if v_total >= 3 then raise exception 'limite_pedidos'; end if;

  insert into public.creditos_troca (user_id, app_anterior, vence_em, observacao, comprovante_chave)
  values (v_uid, v_app, p_vence_em, v_obs, v_chave)
  returning * into v_linha;

  return jsonb_build_object(
    'id', v_linha.id,
    'status', v_linha.status,
    'app_anterior', v_linha.app_anterior,
    'vence_em', v_linha.vence_em,
    'criado_em', v_linha.criado_em
  );
exception
  when unique_violation then
    raise exception 'pedido_em_analise';
end;
$$;

revoke all on function public.solicitar_credito_troca(text, date, text, text) from public, anon;
grant execute on function public.solicitar_credito_troca(text, date, text, text) to authenticated;

comment on function public.solicitar_credito_troca(text, date, text, text) is
  'Prestador (dono da conta) pede o crédito de troca com o comprovante já enviado ao bucket privado. 1 pendente/aprovado por conta; até 3 pedidos no total.';

-- ─── Decisão do administrador (atômica e auditada) ──────────────────────────
create or replace function public.admin_decidir_credito_troca(
  p_actor uuid,
  p_actor_role text,
  p_pedido uuid,
  p_aprovar boolean,
  p_meses integer,
  p_motivo text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.creditos_troca%rowtype;
  v_assinatura public.assinaturas%rowtype;
  v_tem_assinatura boolean := false;
  v_antes jsonb;
  v_depois jsonb;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_credito_ate timestamptz;
  v_plano text := 'pro';
  v_ate timestamptz;
  v_override_vigente boolean := false;
  v_razao text;
begin
  if p_actor is null or p_pedido is null then raise exception 'ator_pedido_obrigatorios'; end if;
  if p_actor_role not in ('owner', 'admin', 'financeiro') then raise exception 'papel_sem_permissao'; end if;
  if char_length(v_motivo) not between 3 and 500 then raise exception 'motivo_invalido'; end if;
  if p_request_id is null or char_length(p_request_id) not between 16 and 128 then
    raise exception 'request_id_invalido';
  end if;
  -- CREDITO_TROCA_MESES_MAX
  if p_aprovar and (p_meses is null or p_meses < 1 or p_meses > 3) then raise exception 'meses_invalidos'; end if;
  if not exists (select 1 from auth.users where id = p_actor) then raise exception 'ator_inexistente'; end if;

  -- Trava a linha ANTES da idempotência: dois envios do mesmo clique em paralelo
  -- esperam aqui, e o segundo encontra a auditoria do primeiro (mesmo resultado)
  -- em vez de cair em 'pedido_ja_decidido'.
  select * into v_pedido from public.creditos_troca where id = p_pedido for update;
  if not found then raise exception 'pedido_inexistente'; end if;

  -- Idempotência: o mesmo clique reenviado devolve o mesmo resultado.
  select depois into v_depois
  from public.admin_audit_log
  where actor_user_id = p_actor and request_id = p_request_id
  limit 1;
  if found then return v_depois; end if;

  if v_pedido.status <> 'pendente' then raise exception 'pedido_ja_decidido'; end if;
  -- Separação de funções: quem pediu o crédito não decide o próprio pedido
  -- (um admin financeiro não se autoaprova; outro administrador confere).
  if v_pedido.user_id = p_actor then raise exception 'autoaprovacao_proibida'; end if;

  -- Mesma trava por usuário do admin_set_plano_override: nada concorre na assinatura.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pedido.user_id::text, 0));

  select * into v_assinatura from public.assinaturas a where a.user_id = v_pedido.user_id for update;
  v_tem_assinatura := found;
  v_antes := jsonb_build_object(
    'pedido', to_jsonb(v_pedido),
    'assinatura', case when v_tem_assinatura then to_jsonb(v_assinatura) else null end
  );

  if p_aprovar then
    v_credito_ate := now() + make_interval(months => p_meses);
    v_ate := v_credito_ate;

    -- Guarda do concederPlanoPeriodo: nunca rebaixa nível nem encurta vigência.
    if v_tem_assinatura then
      v_override_vigente := v_assinatura.admin_override_ativo is true
        and v_assinatura.admin_plano_override in ('pro', 'empresa')
        and (v_assinatura.admin_override_ate is null or v_assinatura.admin_override_ate > now());
      if v_override_vigente then
        if v_assinatura.admin_plano_override = 'empresa' then v_plano := 'empresa'; end if;
        if v_assinatura.admin_override_ate is null then
          v_ate := null;
        elsif v_assinatura.admin_override_ate > v_ate then
          v_ate := v_assinatura.admin_override_ate;
        end if;
      end if;
    end if;

    v_razao := left('Crédito de troca (' || v_pedido.app_anterior || '): ' || v_motivo, 500);

    insert into public.assinaturas (
      user_id, plano, status, stripe_customer_id, stripe_subscription_id,
      current_period_end, admin_plano_override, admin_override_ativo,
      admin_override_ate, admin_override_reason, admin_override_by,
      admin_override_at, atualizado_em
    ) values (
      v_pedido.user_id, v_plano, 'canceled', null, null,
      null, v_plano, true,
      v_ate, v_razao, p_actor,
      now(), now()
    )
    on conflict (user_id) do update set
      admin_plano_override = excluded.admin_plano_override,
      admin_override_ativo = true,
      admin_override_ate = excluded.admin_override_ate,
      admin_override_reason = excluded.admin_override_reason,
      admin_override_by = excluded.admin_override_by,
      admin_override_at = excluded.admin_override_at,
      atualizado_em = now();

    update public.creditos_troca set
      status = 'aprovado',
      meses_concedidos = p_meses,
      concedido_ate = v_credito_ate,
      decidido_por = p_actor,
      decidido_em = now(),
      atualizado_em = now()
    where id = p_pedido
    returning * into v_pedido;
  else
    update public.creditos_troca set
      status = 'recusado',
      motivo_recusa = v_motivo,
      decidido_por = p_actor,
      decidido_em = now(),
      atualizado_em = now()
    where id = p_pedido
    returning * into v_pedido;
  end if;

  select * into v_assinatura from public.assinaturas a where a.user_id = v_pedido.user_id;
  v_tem_assinatura := found;
  v_depois := jsonb_build_object(
    'pedido', to_jsonb(v_pedido),
    'assinatura', case when v_tem_assinatura then to_jsonb(v_assinatura) else null end,
    -- O que o prestador passou a ter de fato (pode ser mais que o crédito, nunca menos).
    'plano_efetivo_override', case when p_aprovar then v_plano else null end,
    'override_ate', case when p_aprovar then v_ate else null end
  );

  insert into public.admin_audit_log (
    actor_user_id, actor_role, acao, target_user_id, motivo, antes, depois, request_id
  ) values (
    p_actor, p_actor_role,
    case when p_aprovar then 'credito_troca_aprovado' else 'credito_troca_recusado' end,
    v_pedido.user_id, v_motivo, v_antes, v_depois, p_request_id
  );

  return v_depois;
end;
$$;

revoke all on function public.admin_decidir_credito_troca(uuid, text, uuid, boolean, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_decidir_credito_troca(uuid, text, uuid, boolean, integer, text, text)
  to service_role;

comment on function public.admin_decidir_credito_troca(uuid, text, uuid, boolean, integer, text, text) is
  'Aprova (Pro por 1..3 meses via admin_plano_override, preservando nível e vigência maiores) ou recusa com motivo um pedido de crédito de troca. Atômico com admin_audit_log; idempotente por request_id.';

-- Rollback operacional: desligar as rotas /admin/api/creditos-troca* no Worker;
-- manter a tabela (é evidência de concessão). Concessões já feitas expiram sozinhas
-- em admin_override_ate ou são revogadas pelo "Revogar plano manual" do painel.
