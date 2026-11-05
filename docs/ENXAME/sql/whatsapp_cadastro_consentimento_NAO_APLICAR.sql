-- NÃO APLICAR.
-- Proposta D1438-G24. Este arquivo fica fora de supabase/migrations de propósito.
-- Só entra no banco depois do parecer do Dr. Paulo e de ordem do Igor, numa janela de migration.
-- Não guarda conversa, telefone de terceiro, nome de cliente nem preço.
-- Guarda só a prova do consentimento da pessoa titular da conta.

create table if not exists public.whatsapp_cadastro_consentimento (
  user_id uuid primary key references auth.users (id) on delete cascade,
  versao_texto integer not null check (versao_texto >= 1),
  participa boolean not null,
  limites boolean not null,
  aceito_em timestamptz,
  revogado_em timestamptz,
  constraint whatsapp_cadastro_consentimento_prova check (
    (participa and limites and aceito_em is not null)
    or (aceito_em is null and revogado_em is null)
  )
);

alter table public.whatsapp_cadastro_consentimento enable row level security;

revoke all on table public.whatsapp_cadastro_consentimento from anon, authenticated;

-- Quando for aplicar: uma policy para a própria pessoa ler e gravar só a linha dela.
-- Sem policy para anon. Sem coluna de texto. Sem service role neste arquivo.
