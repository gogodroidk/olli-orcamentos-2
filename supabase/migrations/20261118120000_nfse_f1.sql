-- NFS-e Fase 1 (CQ-NFSE-F1, 18/11/2026). ARQUIVO PARA REVISÃO — NÃO APLICADO em nenhum banco.
-- Aplicar só com decisão do Igor (decisão 2/3 do plano fiscal) e ANTES de ligar NFSE_ENABLED=1 no worker.
-- Sem esta migration, com a flag ligada, /nfse/emitir responde 503 'banco_indisponivel' (não inventa nota).
--
-- perfil_fiscal : dados do PRESTADOR (1 por conta). O certificado A1 (.pfx + senha) NÃO fica aqui: vai direto ao
--                 parceiro; guardamos só a validade para avisar 30 dias antes.
-- nota_fiscal   : uma nota por orçamento (unique user_id+orcamento_id = idempotência). Sem documento do tomador:
--                 CPF/CNPJ do cliente final vive só no orçamento e no provedor (LGPD: dado mínimo).
-- O worker grava com a service role; o app só LÊ as próprias linhas (RLS).

create table if not exists public.perfil_fiscal (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  cnpj                  text not null check (cnpj ~ '^[0-9]{14}$'),
  inscricao_municipal   text not null check (char_length(inscricao_municipal) between 1 and 30),
  codigo_municipio_ibge text not null check (codigo_municipio_ibge ~ '^[0-9]{7}$'),
  regime                text not null check (regime in ('mei', 'simples', 'outro')),
  codigo_servico        text not null check (char_length(codigo_servico) between 1 and 20), -- item LC 116 / código nacional
  aliquota_iss          numeric(4, 2) not null check (aliquota_iss >= 0 and aliquota_iss <= 5),
  parceiro_empresa_id   text,                -- id da empresa cadastrada no parceiro (Focus), quando existir
  cert_validade         date,                -- só a validade do certificado; nunca o arquivo
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create table if not exists public.nota_fiscal (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  orcamento_id  text not null check (orcamento_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  ref           text not null check (char_length(ref) <= 80),   -- referência idempotente enviada ao provedor
  status        text not null default 'processando' check (status in ('processando', 'autorizada', 'erro')),
  numero        text,
  chave         text,
  pdf_url       text,
  xml_url       text,
  erro          text check (erro is null or char_length(erro) <= 300),
  provedor      text not null check (provedor in ('mock', 'focus')),
  ambiente      text not null check (ambiente in ('simulado', 'homologacao', 'producao')),
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique (user_id, orcamento_id),
  unique (ref)
);

create index if not exists nota_fiscal_user_idx on public.nota_fiscal (user_id, criada_em desc);

alter table public.perfil_fiscal enable row level security;
alter table public.nota_fiscal enable row level security;

drop policy if exists perfil_fiscal_dono_le on public.perfil_fiscal;
create policy perfil_fiscal_dono_le on public.perfil_fiscal for select to authenticated using (user_id = auth.uid());
drop policy if exists nota_fiscal_dono_le on public.nota_fiscal;
create policy nota_fiscal_dono_le on public.nota_fiscal for select to authenticated using (user_id = auth.uid());

-- Escrita só pelo worker (service role ignora RLS). O assistente fiscal (F1-d) vai escrever o perfil pelo worker também.
revoke insert, update, delete on public.perfil_fiscal, public.nota_fiscal from anon, authenticated;
revoke all on public.perfil_fiscal, public.nota_fiscal from anon;
