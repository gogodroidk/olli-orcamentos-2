-- Carimbo da empresa é SEMPRE o relógio do servidor — também no INSERT.
--
-- Por quê: o sync (src/services/cloudSync.ts, src/services/carimboEmpresa.ts) usa
-- `empresa.atualizado_em` da nuvem como carimbo para decidir quem é mais novo. Em
-- produção o trigger `empresa_set_atualizado_em` existia só como BEFORE UPDATE e
-- não estava versionado. No primeiro INSERT, o valor vinha do aparelho
-- (`empresaToRow` mandava `new Date()`): um aparelho com relógio +21 dias (o revisor
-- da Google Play) gravava um "carimbo do servidor" 21 dias no futuro, e outro
-- aparelho do mesmo dono podia perder uma edição.
--
-- Estado de produção conferido (só leitura) em 02/10/2026:
--   - coluna `atualizado_em timestamptz not null default now()`;
--   - `public.set_atualizado_em()` = `new.atualizado_em = now(); return new;`,
--     plpgsql, search_path '' (o corpo abaixo é IDÊNTICO — recriar não muda nada
--     para as outras tabelas que porventura a usem);
--   - trigger `empresa_set_atualizado_em BEFORE UPDATE`.
--
-- A partir desta versão o app também deixa de mandar `atualizado_em` no
-- `empresaToRow` (o default `now()` já cobre o INSERT mesmo antes desta migration).
-- Idempotente.

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists empresa_set_atualizado_em on public.empresa;
create trigger empresa_set_atualizado_em
  before insert or update on public.empresa
  for each row execute function public.set_atualizado_em();
