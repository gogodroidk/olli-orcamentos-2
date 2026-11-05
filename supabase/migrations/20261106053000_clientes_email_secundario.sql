-- ============================================================================
-- OLLI — E-MAIL DO CLIENTE (principal + secundário)
-- Carimbo 20261106053000: depois de 20261104235900, a última migration já na
-- main em 05/11/2026 (e depois de 20261102210000). Este arquivo NÃO é aplicado
-- por este PR. Espera o OK que a spec do D-0129 deixou.
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   clientes: + email, + email2 (text, NULL = "não informado").
-- RLS: as políticas existentes já são por linha (dono/equipe) e valem para colunas
--   novas; nenhum grant novo.
-- Regras no banco (defesa em profundidade; a tela valida antes):
--   * tamanho <= 254, formato mínimo x@y.z, sem espaço;
--   * email2 só com email preenchido e diferente dele.
-- Idempotente. O app antigo continua funcionando (colunas opcionais) e o app novo
-- cai para "sem e-mail" se esta migration ainda não foi aplicada (cloudSync).
-- ============================================================================
begin;

alter table public.clientes
  add column if not exists email  text,
  add column if not exists email2 text;

alter table public.clientes drop constraint if exists clientes_email_formato;
alter table public.clientes
  add constraint clientes_email_formato check (
    (email  is null or (length(email)  <= 254 and email  ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    and (email2 is null or (length(email2) <= 254 and email2 ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    and (email2 is null or (email is not null and lower(email2) <> lower(email)))
  ) not valid;

comment on column public.clientes.email  is 'E-mail principal do cliente (NULL = não informado).';
comment on column public.clientes.email2 is 'E-mail secundário do cliente; só com email preenchido e diferente dele.';

commit;
