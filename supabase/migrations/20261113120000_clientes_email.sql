-- ============================================================================
-- OLLI — I-0053: E-MAIL OPCIONAL do cliente (CQ-CONTATO-1TOQUE, D-2030)
-- ----------------------------------------------------------------------------
-- clientes.email  text NULL — e-mail do cliente do prestador. Só nome e telefone
-- continuam obrigatórios; vazio/ausente = não informado.
--
-- ORDEM DE APLICAÇÃO: aplicar ANTES de publicar o app que envia `email`. Mesmo
-- assim o app é seguro sem ela: ao receber "coluna desconhecida" ele reenvia o
-- cliente sem `email` (cloudSync.ts, clientesSemColunaEmail) e mantém o e-mail
-- só no aparelho até a coluna existir.
--
-- NÃO MEXE em RLS, grants, trigger de geo nem `atualizado_em`: coluna nova,
-- aditiva, sem default e sem backfill. As policies atuais de `clientes` (por
-- dono) já cobrem a coluna. IDEMPOTENTE. Arquivo escrito, NÃO aplicado.
-- ============================================================================
begin;

alter table public.clientes
  add column if not exists email text;

-- Teto de tamanho (RFC 5321: 254). NOT VALID não varre linhas antigas; como a
-- coluna nasce vazia, validar em seguida é instantâneo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clientes_email_tamanho' and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint clientes_email_tamanho
      check (email is null or char_length(email) <= 254) not valid;
    alter table public.clientes validate constraint clientes_email_tamanho;
  end if;
end $$;

comment on column public.clientes.email is
  'E-mail do cliente (opcional, I-0053). Dado pessoal (LGPD): só o que o prestador salvou; nunca lido de contatos em massa.';

commit;
