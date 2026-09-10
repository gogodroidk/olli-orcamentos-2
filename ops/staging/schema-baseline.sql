-- STAGING_ONLY — generated from metadata of the OLLI production schema.
-- No rows, secrets, policies or provider payloads are included.
-- Do not place this file in supabase/migrations; apply only to OLLI-STAGING.

create extension if not exists pgcrypto;
create schema if not exists private;

-- Compatibility stub required by the first historical hardening migration.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$ begin return; end; $$;

create table if not exists public."acessos_equipe" (
  "id" bigint generated always as identity not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "evento" text not null,
  "plataforma" text,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."acessos_equipe" enable row level security;

create table if not exists public."admin_audit_log" (
  "id" bigint generated always as identity not null,
  "actor_user_id" uuid,
  "actor_role" text not null,
  "acao" text not null,
  "target_user_id" uuid,
  "motivo" text not null,
  "antes" jsonb,
  "depois" jsonb,
  "request_id" text,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."admin_audit_log" enable row level security;

create table if not exists public."admin_memberships" (
  "user_id" uuid not null,
  "papel" text not null,
  "ativo" boolean default true not null,
  "criado_por" uuid,
  "criado_em" timestamptz default now() not null,
  "atualizado_em" timestamptz default now() not null,
  primary key ("user_id")
);
alter table public."admin_memberships" enable row level security;

create table if not exists public."agendamentos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "cliente_id" text,
  "cliente_nome" text not null,
  "titulo" text not null,
  "tipo" text not null,
  "inicio" timestamptz not null,
  "fim" timestamptz,
  "endereco" text,
  "status" text default 'agendado'::text not null,
  "orcamento_id" text,
  "observacao" text,
  "criado_em" timestamptz default now() not null,
  "atualizado_em" timestamptz default now() not null,
  "criado_por" uuid default auth.uid(),
  "excluido_em" timestamptz,
  primary key ("id")
);
alter table public."agendamentos" enable row level security;

create table if not exists public."asset_qr_tokens" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "asset_id" text not null,
  "token" text not null,
  "emitido_em" timestamptz default now() not null,
  "revogado_em" timestamptz,
  "motivo" text,
  primary key ("id")
);
alter table public."asset_qr_tokens" enable row level security;

create table if not exists public."assets" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "cliente_id" text,
  "local_id" text,
  "codigo_interno" text,
  "patrimonio" text,
  "fabricante" text,
  "modelo" text,
  "numero_serie" text,
  "categoria" text,
  "capacidade_btu" integer,
  "tensao" text,
  "refrigerante" text,
  "localizacao" text,
  "situacao" text default 'ativo'::text not null,
  "criticidade" text,
  "qr_token" text default translate(encode(extensions.gen_random_bytes(24), 'base64'::text), '+/='::text, '-_'::text) not null,
  "qr_revogado_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  "criado_em" timestamptz default now() not null,
  "fotos" jsonb default '[]'::jsonb not null,
  "excluido_em" timestamptz,
  primary key ("id")
);
alter table public."assets" enable row level security;

create table if not exists public."assinaturas" (
  "user_id" uuid not null,
  "plano" text not null,
  "status" text not null,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "current_period_end" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  "mp_preapproval_id" text,
  "admin_plano_override" text,
  "admin_override_ativo" boolean default false not null,
  "admin_override_ate" timestamptz,
  "admin_override_reason" text,
  "admin_override_by" uuid,
  "admin_override_at" timestamptz,
  primary key ("user_id")
);
alter table public."assinaturas" enable row level security;

create table if not exists public."backups" (
  "user_id" uuid not null,
  "data" jsonb,
  "updated_at" timestamptz default now(),
  primary key ("user_id")
);
alter table public."backups" enable row level security;

create table if not exists public."backups_versionados" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "tipo" text not null,
  "data" jsonb not null,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."backups_versionados" enable row level security;

create table if not exists public."clientes" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "nome" text not null,
  "telefone" text,
  "cpf" text,
  "cnpj" text,
  "endereco" text,
  "complemento" text,
  "estado" text,
  "cidade" text,
  "cep" text,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  "criado_por" uuid default auth.uid(),
  primary key ("id")
);
alter table public."clientes" enable row level security;

create table if not exists public."cnpj_cache" (
  "cnpj" text not null,
  "dados" jsonb not null,
  "atualizado_em" timestamptz default now() not null,
  primary key ("cnpj")
);
alter table public."cnpj_cache" enable row level security;

create table if not exists public."contadores" (
  "user_id" uuid default auth.uid() not null,
  "chave" text not null,
  "valor" integer default 0 not null,
  primary key ("user_id", "chave")
);
alter table public."contadores" enable row level security;

create table if not exists public."convites" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "email" text,
  "papel" text not null,
  "token" text not null,
  "expira_em" timestamptz not null,
  "aceito_por" uuid,
  "aceito_em" timestamptz,
  "criado_em" timestamptz default now() not null,
  "criado_por" uuid,
  primary key ("id")
);
alter table public."convites" enable row level security;

create table if not exists public."credit_ledger" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "delta" integer not null,
  "origem" text not null,
  "ref" text,
  "descricao" text default ''::text not null,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."credit_ledger" enable row level security;

create table if not exists public."depoimentos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "nome_cliente" text not null,
  "estrelas" integer default 5 not null,
  "texto" text,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."depoimentos" enable row level security;

create table if not exists public."email_outbox" (
  "id" bigint generated always as identity not null,
  "event_id" text not null,
  "user_id" uuid not null,
  "tenant_id" uuid,
  "idempotency_key" text not null,
  "template" text not null,
  "template_version" text not null,
  "purpose" text not null,
  "recipient" text,
  "attempts" integer default 0 not null,
  "status" text default 'pending'::text not null,
  "next_attempt_at" timestamptz,
  "provider_id" text,
  "error_code" text,
  "pii_purged_at" timestamptz,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  "dispatch_scope" text default 'hold'::text not null,
  "claim_token" uuid,
  "claimed_by" text,
  "lease_expires_at" timestamptz,
  primary key ("id")
);
alter table public."email_outbox" enable row level security;

create table if not exists public."email_welcome_events" (
  "id" bigint generated always as identity not null,
  "event_id" text not null,
  "user_id" uuid not null,
  "tenant_id" uuid,
  "event_type" text default 'email.welcome.requested'::text not null,
  "event_version" text default '2026-08-31.v1'::text not null,
  "template" text default 'boas_vindas'::text not null,
  "template_version" text default 'boas_vindas.v1'::text not null,
  "purpose" text default 'account_onboarding'::text not null,
  "recipient" text,
  "confirmed_at" timestamptz not null,
  "source" text default 'supabase.auth'::text not null,
  "idempotency_key" text not null,
  "pii_purged_at" timestamptz,
  "created_at" timestamptz default now() not null,
  primary key ("id")
);
alter table public."email_welcome_events" enable row level security;

create table if not exists public."empresa" (
  "user_id" uuid default auth.uid() not null,
  "dados" jsonb not null,
  "atualizado_em" timestamptz default now() not null,
  primary key ("user_id")
);
alter table public."empresa" enable row level security;

create table if not exists public."eventos_orcamento_publico" (
  "id" bigint generated always as identity not null,
  "token" text not null,
  "evento" text not null,
  "motivo" text,
  "ip_hash" text,
  "user_agent_curto" text,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."eventos_orcamento_publico" enable row level security;

create table if not exists public."exclusoes" (
  "user_id" uuid default auth.uid() not null,
  "tabela" text not null,
  "item_id" text not null,
  "excluido_em" timestamptz default now() not null,
  primary key ("user_id", "tabela", "item_id")
);
alter table public."exclusoes" enable row level security;

create table if not exists public."extras_sync" (
  "user_id" uuid default auth.uid() not null,
  "chave" text not null,
  "dados" jsonb default '{}'::jsonb not null,
  "atualizado_em" timestamptz default now() not null,
  primary key ("user_id", "chave")
);
alter table public."extras_sync" enable row level security;

create table if not exists public."feedback" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid default auth.uid(),
  "tipo" text default 'feedback'::text not null,
  "mensagem" text not null,
  "contexto" jsonb default '{}'::jsonb not null,
  "resolvido" boolean default false not null,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."feedback" enable row level security;

create table if not exists public."hvac_chunks" (
  "chunk_id" text not null,
  "source_path" text not null,
  "page" integer,
  "texto" text not null,
  "busca" tsvector generated always as (to_tsvector('portuguese'::regconfig, texto)) stored,
  primary key ("chunk_id")
);
alter table public."hvac_chunks" enable row level security;

create table if not exists public."hvac_codigos" (
  "id" bigint generated always as identity not null,
  "marca" text not null,
  "familia" text,
  "tipo" text,
  "codigo" text not null,
  "exibicao" text,
  "falha" text,
  "cat_bruta" text,
  "cat_app" text,
  "severidade" text,
  "causa" text,
  "acao" text,
  "confianca" text,
  "fonte_id" text,
  "url" text,
  primary key ("id")
);
alter table public."hvac_codigos" enable row level security;

create table if not exists public."ia_cota_global_diaria" (
  "dia" date not null,
  "familia" text not null,
  "usados" integer default 0 not null,
  "atualizado_em" timestamptz default now() not null,
  primary key ("dia", "familia")
);
alter table public."ia_cota_global_diaria" enable row level security;

create table if not exists public."ia_cota_reservas" (
  "dia" date not null,
  "familia" text not null,
  "user_id" uuid not null,
  "request_id" text not null,
  "unidades" integer not null,
  "limite_global" integer not null,
  "limite_usuario" integer not null,
  "usados_global_apos" integer not null,
  "usados_usuario_apos" integer not null,
  "consumida_em" timestamptz default now() not null,
  primary key ("dia", "familia", "user_id", "request_id")
);
alter table public."ia_cota_reservas" enable row level security;

create table if not exists public."ia_cota_usuario_diaria" (
  "dia" date not null,
  "familia" text not null,
  "user_id" uuid not null,
  "usados" integer default 0 not null,
  "atualizado_em" timestamptz default now() not null,
  primary key ("dia", "familia", "user_id")
);
alter table public."ia_cota_usuario_diaria" enable row level security;

create table if not exists public."ia_uso_gratis" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "periodo" text not null,
  "acao" text default 'voz_ia'::text not null,
  "ref" text,
  "janela" timestamptz default now() not null,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."ia_uso_gratis" enable row level security;

create table if not exists public."localizacoes_equipe" (
  "org_id" uuid not null,
  "user_id" uuid not null,
  "lat" double precision,
  "lng" double precision,
  "precisao" double precision,
  "capturado_em" timestamptz default now() not null,
  primary key ("org_id", "user_id")
);
alter table public."localizacoes_equipe" enable row level security;

create table if not exists public."modelos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "nome" text not null,
  "descricao" text,
  "dados" jsonb not null,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."modelos" enable row level security;

create table if not exists public."orcamento_versoes" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "orcamento_id" text not null,
  "numero_versao" integer not null,
  "dados" jsonb default '{}'::jsonb not null,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."orcamento_versoes" enable row level security;

create table if not exists public."orcamentos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "numero" text not null,
  "cliente_id" text,
  "cliente_nome" text,
  "status" text default 'rascunho'::text not null,
  "subtotal" numeric default 0 not null,
  "desconto" numeric default 0 not null,
  "valor_total" numeric default 0 not null,
  "data_emissao" timestamptz,
  "dados" jsonb not null,
  "criado_em" timestamptz default now() not null,
  "atualizado_em" timestamptz default now() not null,
  "criado_por" uuid default auth.uid(),
  "excluido_em" timestamptz,
  primary key ("id")
);
alter table public."orcamentos" enable row level security;

create table if not exists public."orcamentos_publicos" (
  "token" text not null,
  "user_id" uuid default auth.uid() not null,
  "orcamento_id" text not null,
  "numero" text,
  "cliente_nome" text,
  "valor_total" numeric default 0 not null,
  "prestador_nome" text,
  "prestador_whatsapp" text,
  "dados" jsonb not null,
  "status" text default 'enviado'::text not null,
  "resposta_cliente" text,
  "criado_em" timestamptz default now() not null,
  "respondido_em" timestamptz,
  "visualizado_em" timestamptz,
  "motivo_recusa" text,
  "revogado_em" timestamptz,
  primary key ("token")
);
alter table public."orcamentos_publicos" enable row level security;

create table if not exists public."ordens_servico" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "numero" text,
  "orcamento_id" text,
  "cliente_id" text,
  "cliente_nome" text,
  "titulo" text,
  "descricao" text,
  "status" text default 'aberta'::text not null,
  "concluido_em" timestamptz,
  "tecnico_id" uuid,
  "tecnico_nome" text,
  "data_agendada" timestamptz,
  "checklist" jsonb default '[]'::jsonb not null,
  "fotos" jsonb default '[]'::jsonb not null,
  "observacoes" text,
  "valor" numeric,
  "criado_em" timestamptz default now() not null,
  "atualizado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  primary key ("id")
);
alter table public."ordens_servico" enable row level security;

create table if not exists public."organizacao_membros" (
  "org_id" uuid not null,
  "user_id" uuid not null,
  "papel" text not null,
  "ativo" boolean default true not null,
  "criado_em" timestamptz default now() not null,
  primary key ("org_id", "user_id")
);
alter table public."organizacao_membros" enable row level security;

create table if not exists public."organizacoes" (
  "id" uuid default gen_random_uuid() not null,
  "owner_user_id" uuid not null,
  "nome" text,
  "criado_em" timestamptz default now() not null,
  "equipe_grandfathered" boolean default false not null,
  primary key ("id")
);
alter table public."organizacoes" enable row level security;

create table if not exists public."pmoc_ordens_geradas" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "plano_id" text not null,
  "asset_id" text not null,
  "periodo" text not null,
  "periodicidade_id" text default ''::text not null,
  "ordem_id" text not null,
  "vencimento" date,
  "atualizado_em" timestamptz default now() not null,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  primary key ("id")
);
alter table public."pmoc_ordens_geradas" enable row level security;

create table if not exists public."pmoc_plan_versions" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "plan_id" text not null,
  "numero_versao" integer not null,
  "dados" jsonb default '{}'::jsonb not null,
  "responsavel_tecnico" text,
  "doc_responsabilidade" text,
  "aprovado_em" timestamptz,
  "aprovacao_meta" jsonb,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."pmoc_plan_versions" enable row level security;

create table if not exists public."pmoc_plans" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "cliente_id" text,
  "contract_id" text,
  "numero" text,
  "titulo" text,
  "situacao" text default 'rascunho'::text not null,
  "versao_vigente" integer,
  "atualizado_em" timestamptz default now() not null,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  primary key ("id")
);
alter table public."pmoc_plans" enable row level security;

create table if not exists public."produtos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "nome" text not null,
  "descricao" text,
  "preco" numeric default 0 not null,
  "custo" numeric,
  "marca" text,
  "modelo" text,
  "unidade" text default 'un'::text,
  "foto_uri" text,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."produtos" enable row level security;

create table if not exists public."profiles" (
  "user_id" uuid not null,
  "email" text,
  "nome" text,
  "atualizado_em" timestamptz default now() not null,
  primary key ("user_id")
);
alter table public."profiles" enable row level security;

create table if not exists public."qr_scan_events" (
  "id" bigint generated always as identity not null,
  "asset_id" text,
  "user_id" uuid,
  "token_tentado" text,
  "resolvido" boolean default false not null,
  "ip_hash" text,
  "user_agent" text,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."qr_scan_events" enable row level security;

create table if not exists public."recibos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "numero" text not null,
  "orcamento_id" text,
  "cliente_id" text,
  "cliente_nome" text,
  "valor_recebido" numeric default 0 not null,
  "forma_pagamento" text,
  "data_recebimento" timestamptz,
  "dados" jsonb not null,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."recibos" enable row level security;

create table if not exists public."service_contract_versions" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "contract_id" text not null,
  "numero_versao" integer not null,
  "dados" jsonb default '{}'::jsonb not null,
  "motivo" text,
  "assinado_em" timestamptz,
  "assinatura_meta" jsonb,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."service_contract_versions" enable row level security;

create table if not exists public."service_contracts" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "criado_por" uuid default auth.uid(),
  "cliente_id" text,
  "numero" text,
  "titulo" text,
  "situacao" text default 'rascunho'::text not null,
  "data_inicio" date,
  "data_fim" date,
  "renovacao" text,
  "versao_vigente" integer,
  "atualizado_em" timestamptz default now() not null,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."service_contracts" enable row level security;

create table if not exists public."servicos" (
  "id" text not null,
  "user_id" uuid default auth.uid() not null,
  "nome" text not null,
  "descricao" text,
  "preco" numeric default 0 not null,
  "custo" numeric,
  "unidade" text default 'un'::text,
  "foto_uri" text,
  "criado_em" timestamptz default now() not null,
  "excluido_em" timestamptz,
  "atualizado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public."servicos" enable row level security;

create table if not exists public."webhook_events" (
  "id" bigint generated always as identity not null,
  "origem" text not null,
  "event_id" text not null,
  "tipo" text,
  "status" text default 'recebido'::text not null,
  "tentativas" integer default 1 not null,
  "erro" text,
  "payload" jsonb,
  "recebido_em" timestamptz default now() not null,
  "processado_em" timestamptz,
  primary key ("id")
);
alter table public."webhook_events" enable row level security;

-- Unique indexes needed by foreign-key targets are replayed before foreign keys.
CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_log_actor_request_uidx ON public.admin_audit_log USING btree (actor_user_id, request_id) WHERE (request_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS asset_qr_tokens_token_key ON public.asset_qr_tokens USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS assets_qr_token_key ON public.assets USING btree (qr_token);
CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_stripe_subscription_id_key ON public.assinaturas USING btree (stripe_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS convites_token_key ON public.convites USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_origem_ref_uidx ON public.credit_ledger USING btree (origem, ref) WHERE (ref IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_event_uidx ON public.email_outbox USING btree (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_idempotency_uidx ON public.email_outbox USING btree (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS email_welcome_events_event_id_uidx ON public.email_welcome_events USING btree (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_welcome_events_idempotency_uidx ON public.email_welcome_events USING btree (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS email_welcome_events_user_template_uidx ON public.email_welcome_events USING btree (user_id, template_version);
CREATE UNIQUE INDEX IF NOT EXISTS ia_cota_global_diaria_pk ON public.ia_cota_global_diaria USING btree (dia, familia);
CREATE UNIQUE INDEX IF NOT EXISTS ia_cota_reservas_pk ON public.ia_cota_reservas USING btree (dia, familia, user_id, request_id);
CREATE UNIQUE INDEX IF NOT EXISTS ia_cota_usuario_diaria_pk ON public.ia_cota_usuario_diaria USING btree (dia, familia, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ia_uso_gratis_ref_janela_uidx ON public.ia_uso_gratis USING btree (user_id, acao, ref, janela) WHERE (ref IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_versoes_tenant_orc_num_uidx ON public.orcamento_versoes USING btree (user_id, orcamento_id, numero_versao);
CREATE UNIQUE INDEX IF NOT EXISTS organizacao_membros_um_owner_uidx ON public.organizacao_membros USING btree (org_id) WHERE (papel = 'owner'::text);
CREATE UNIQUE INDEX IF NOT EXISTS organizacoes_owner_user_id_key ON public.organizacoes USING btree (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS pmoc_ordens_geradas_tenant_unica ON public.pmoc_ordens_geradas USING btree (user_id, plano_id, asset_id, periodo, periodicidade_id);
CREATE UNIQUE INDEX IF NOT EXISTS pmoc_plan_versions_tenant_num_uidx ON public.pmoc_plan_versions USING btree (user_id, plan_id, numero_versao);
CREATE UNIQUE INDEX IF NOT EXISTS service_contract_versions_tenant_num_uidx ON public.service_contract_versions USING btree (user_id, contract_id, numero_versao);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_origem_event_id_uidx ON public.webhook_events USING btree (origem, event_id);

-- Foreign keys are added after every table exists.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'acessos_equipe_org_id_fkey' and conrelid = 'public.acessos_equipe'::regclass) then
    alter table public.acessos_equipe add constraint "acessos_equipe_org_id_fkey" foreign key ("org_id") references public.organizacoes ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'acessos_equipe_user_id_fkey' and conrelid = 'public.acessos_equipe'::regclass) then
    alter table public.acessos_equipe add constraint "acessos_equipe_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_audit_log_actor_user_id_fkey' and conrelid = 'public.admin_audit_log'::regclass) then
    alter table public.admin_audit_log add constraint "admin_audit_log_actor_user_id_fkey" foreign key ("actor_user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_memberships_criado_por_fkey' and conrelid = 'public.admin_memberships'::regclass) then
    alter table public.admin_memberships add constraint "admin_memberships_criado_por_fkey" foreign key ("criado_por") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_memberships_user_id_fkey' and conrelid = 'public.admin_memberships'::regclass) then
    alter table public.admin_memberships add constraint "admin_memberships_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agendamentos_user_id_fkey' and conrelid = 'public.agendamentos'::regclass) then
    alter table public.agendamentos add constraint "agendamentos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'asset_qr_tokens_user_id_fkey' and conrelid = 'public.asset_qr_tokens'::regclass) then
    alter table public.asset_qr_tokens add constraint "asset_qr_tokens_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assets_user_id_fkey' and conrelid = 'public.assets'::regclass) then
    alter table public.assets add constraint "assets_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assinaturas_user_id_fkey' and conrelid = 'public.assinaturas'::regclass) then
    alter table public.assinaturas add constraint "assinaturas_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assinaturas_admin_override_by_fkey' and conrelid = 'public.assinaturas'::regclass) then
    alter table public.assinaturas add constraint "assinaturas_admin_override_by_fkey" foreign key ("admin_override_by") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'backups_user_id_fkey' and conrelid = 'public.backups'::regclass) then
    alter table public.backups add constraint "backups_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'backups_versionados_user_id_fkey' and conrelid = 'public.backups_versionados'::regclass) then
    alter table public.backups_versionados add constraint "backups_versionados_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_user_id_fkey' and conrelid = 'public.clientes'::regclass) then
    alter table public.clientes add constraint "clientes_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contadores_user_id_fkey' and conrelid = 'public.contadores'::regclass) then
    alter table public.contadores add constraint "contadores_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'convites_criado_por_fkey' and conrelid = 'public.convites'::regclass) then
    alter table public.convites add constraint "convites_criado_por_fkey" foreign key ("criado_por") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'convites_org_id_fkey' and conrelid = 'public.convites'::regclass) then
    alter table public.convites add constraint "convites_org_id_fkey" foreign key ("org_id") references public.organizacoes ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'convites_aceito_por_fkey' and conrelid = 'public.convites'::regclass) then
    alter table public.convites add constraint "convites_aceito_por_fkey" foreign key ("aceito_por") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'credit_ledger_user_id_fkey' and conrelid = 'public.credit_ledger'::regclass) then
    alter table public.credit_ledger add constraint "credit_ledger_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'depoimentos_user_id_fkey' and conrelid = 'public.depoimentos'::regclass) then
    alter table public.depoimentos add constraint "depoimentos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_outbox_tenant_id_fkey' and conrelid = 'public.email_outbox'::regclass) then
    alter table public.email_outbox add constraint "email_outbox_tenant_id_fkey" foreign key ("tenant_id") references public.organizacoes ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_outbox_event_id_fkey' and conrelid = 'public.email_outbox'::regclass) then
    alter table public.email_outbox add constraint "email_outbox_event_id_fkey" foreign key ("event_id") references public.email_welcome_events ("event_id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_outbox_user_id_fkey' and conrelid = 'public.email_outbox'::regclass) then
    alter table public.email_outbox add constraint "email_outbox_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_welcome_events_user_id_fkey' and conrelid = 'public.email_welcome_events'::regclass) then
    alter table public.email_welcome_events add constraint "email_welcome_events_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_welcome_events_tenant_id_fkey' and conrelid = 'public.email_welcome_events'::regclass) then
    alter table public.email_welcome_events add constraint "email_welcome_events_tenant_id_fkey" foreign key ("tenant_id") references public.organizacoes ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresa_user_id_fkey' and conrelid = 'public.empresa'::regclass) then
    alter table public.empresa add constraint "empresa_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_orcamento_publico_token_fkey' and conrelid = 'public.eventos_orcamento_publico'::regclass) then
    alter table public.eventos_orcamento_publico add constraint "eventos_orcamento_publico_token_fkey" foreign key ("token") references public.orcamentos_publicos ("token");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exclusoes_user_id_fkey' and conrelid = 'public.exclusoes'::regclass) then
    alter table public.exclusoes add constraint "exclusoes_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'extras_sync_user_id_fkey' and conrelid = 'public.extras_sync'::regclass) then
    alter table public.extras_sync add constraint "extras_sync_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_user_id_fkey' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint "feedback_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ia_cota_reservas_usuario_fk' and conrelid = 'public.ia_cota_reservas'::regclass) then
    alter table public.ia_cota_reservas add constraint "ia_cota_reservas_usuario_fk" foreign key ("dia", "familia", "user_id") references public.ia_cota_usuario_diaria ("dia", "familia", "user_id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ia_cota_usuario_diaria_global_fk' and conrelid = 'public.ia_cota_usuario_diaria'::regclass) then
    alter table public.ia_cota_usuario_diaria add constraint "ia_cota_usuario_diaria_global_fk" foreign key ("dia", "familia") references public.ia_cota_global_diaria ("dia", "familia");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ia_cota_usuario_diaria_user_id_fkey' and conrelid = 'public.ia_cota_usuario_diaria'::regclass) then
    alter table public.ia_cota_usuario_diaria add constraint "ia_cota_usuario_diaria_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ia_uso_gratis_user_id_fkey' and conrelid = 'public.ia_uso_gratis'::regclass) then
    alter table public.ia_uso_gratis add constraint "ia_uso_gratis_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'localizacoes_equipe_user_id_fkey' and conrelid = 'public.localizacoes_equipe'::regclass) then
    alter table public.localizacoes_equipe add constraint "localizacoes_equipe_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'localizacoes_equipe_org_id_fkey' and conrelid = 'public.localizacoes_equipe'::regclass) then
    alter table public.localizacoes_equipe add constraint "localizacoes_equipe_org_id_fkey" foreign key ("org_id") references public.organizacoes ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modelos_user_id_fkey' and conrelid = 'public.modelos'::regclass) then
    alter table public.modelos add constraint "modelos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orcamento_versoes_user_id_fkey' and conrelid = 'public.orcamento_versoes'::regclass) then
    alter table public.orcamento_versoes add constraint "orcamento_versoes_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentos_user_id_fkey' and conrelid = 'public.orcamentos'::regclass) then
    alter table public.orcamentos add constraint "orcamentos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentos_publicos_user_id_fkey' and conrelid = 'public.orcamentos_publicos'::regclass) then
    alter table public.orcamentos_publicos add constraint "orcamentos_publicos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ordens_servico_user_id_fkey' and conrelid = 'public.ordens_servico'::regclass) then
    alter table public.ordens_servico add constraint "ordens_servico_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizacao_membros_org_id_fkey' and conrelid = 'public.organizacao_membros'::regclass) then
    alter table public.organizacao_membros add constraint "organizacao_membros_org_id_fkey" foreign key ("org_id") references public.organizacoes ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizacao_membros_user_id_fkey' and conrelid = 'public.organizacao_membros'::regclass) then
    alter table public.organizacao_membros add constraint "organizacao_membros_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_owner_user_id_fkey' and conrelid = 'public.organizacoes'::regclass) then
    alter table public.organizacoes add constraint "organizacoes_owner_user_id_fkey" foreign key ("owner_user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pmoc_ordens_geradas_user_id_fkey' and conrelid = 'public.pmoc_ordens_geradas'::regclass) then
    alter table public.pmoc_ordens_geradas add constraint "pmoc_ordens_geradas_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pmoc_plan_versions_user_id_fkey' and conrelid = 'public.pmoc_plan_versions'::regclass) then
    alter table public.pmoc_plan_versions add constraint "pmoc_plan_versions_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pmoc_plans_user_id_fkey' and conrelid = 'public.pmoc_plans'::regclass) then
    alter table public.pmoc_plans add constraint "pmoc_plans_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_user_id_fkey' and conrelid = 'public.produtos'::regclass) then
    alter table public.produtos add constraint "produtos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_user_id_fkey' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint "profiles_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recibos_user_id_fkey' and conrelid = 'public.recibos'::regclass) then
    alter table public.recibos add constraint "recibos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_contract_versions_user_id_fkey' and conrelid = 'public.service_contract_versions'::regclass) then
    alter table public.service_contract_versions add constraint "service_contract_versions_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_contracts_user_id_fkey' and conrelid = 'public.service_contracts'::regclass) then
    alter table public.service_contracts add constraint "service_contracts_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'servicos_user_id_fkey' and conrelid = 'public.servicos'::regclass) then
    alter table public.servicos add constraint "servicos_user_id_fkey" foreign key ("user_id") references auth.users ("id");
  end if;
end $$;

-- Policies, non-unique indexes, triggers, functions and storage objects are
-- replayed by the ordered repository migrations after this schema-only baseline.
