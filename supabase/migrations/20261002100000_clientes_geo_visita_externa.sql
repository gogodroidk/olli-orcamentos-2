-- ============================================================================
-- OLLI — Onda I1 (OLLI Inteligente): COORDENADA E IBGE DO CLIENTE + VISITA EXTERNA
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   clientes
--     lat, lon        double precision — ponto do cliente (graus decimais). Os dois
--                     ou nenhum; 0,0 é recusado (é o Atlântico, não "sem ponto").
--     ibge            text — código do município, 7 dígitos. Chave dos alertas
--                     oficiais (INMET / Defesa Civil). Pode existir SEM ponto.
--     geo_precisao    text — de onde veio o ponto: numero | rua | cep | bairro | cidade.
--                     Anda junto com lat/lon (CHECK abaixo).
--     geo_tentado_em  timestamptz — FILA do backfill (worker/src/geoClientes.js):
--                     quando o worker já procurou este endereço e terminou (achou ou
--                     não achou). Nulo = ainda na fila. Só o worker escreve; o app não
--                     envia nem lê esta coluna.
--   agendamentos
--     externa         boolean — serviço ao ar livre ou em altura (condensadora,
--                     telhado, fachada, jardim, piscina, dedetização externa). É o
--                     que liga a sugestão "remarcar por chuva". NULO = não informado
--                     (≠ false): sem resposta o app NÃO afirma que a visita é interna.
--                     O app sugere o valor pelo ofício (src/services/verticais.ts →
--                     sugerirVisitaExterna); o prestador confirma.
--
-- DE ONDE VEM A COORDENADA (só serviço GRATUITO com uso comercial permitido):
--   1) BrasilAPI CEP v2 (location.coordinates — quase sempre vazio, mas quando vem
--      é o ponto do CEP);
--   2) ViaCEP para o IBGE (campo `ibge`), com a API de localidades do IBGE como
--      segunda porta (pelo nome da cidade);
--   3) Nominatim/OpenStreetMap, respeitando a política de uso: User-Agent próprio,
--      no máximo 1 requisição por segundo, cache, nada de autocompletar.
--   NADA de Google Geocoding (seria pago fora da cota).
--
-- ENDEREÇO MUDOU → PONTO VELHO MORRE (trigger abaixo)
--   App, painel web e importação editam `clientes`. Nenhum deles tem obrigação de
--   lembrar de limpar a coordenada quando o CEP muda — e um que esquecesse deixaria
--   o clima e o mapa apontando para a casa antiga, calados. O trigger faz isso num
--   lugar só: se cep/cidade/estado/endereco mudaram e o UPDATE não trouxe ponto
--   novo, ponto e fila são zerados (o backfill procura de novo). IBGE só cai quando
--   muda CEP, cidade ou UF. O trigger NÃO mexe em `atualizado_em` (relógio de sync
--   do app): a geo é derivada do endereço, não é edição do usuário.
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES de ligar GEO_BACKFILL_MODE=production no worker.
--   Sem ela o app continua funcionando: o push detecta coluna inexistente (42703 /
--   PGRST204), reenvia sem as colunas novas e o pull PRESERVA a geo e a `externa`
--   locais (cloudSync: COLUNAS_CLIENTE_GEO / COLUNA_AGENDA_EXTERNA).
--
-- IDEMPOTENTE: add column if not exists; constraints, índice, função e trigger
--   recriados por nome. SEGREDOS: zero. RLS: as políticas existentes de `clientes`
--   e `agendamentos` cobrem as colunas novas (são por linha).
-- ============================================================================

begin;

alter table public.clientes
  add column if not exists lat            double precision,
  add column if not exists lon            double precision,
  add column if not exists ibge           text,
  add column if not exists geo_precisao   text,
  add column if not exists geo_tentado_em timestamptz;

comment on column public.clientes.lat is 'Latitude do cliente (graus decimais). Junto com lon e geo_precisao, ou nulo.';
comment on column public.clientes.lon is 'Longitude do cliente (graus decimais). Junto com lat e geo_precisao, ou nulo.';
comment on column public.clientes.ibge is 'Código IBGE do município (7 dígitos). Chave dos alertas oficiais. Independe de lat/lon.';
comment on column public.clientes.geo_precisao is 'Origem do ponto: numero | rua | cep | bairro | cidade.';
comment on column public.clientes.geo_tentado_em is 'Fila do backfill de geo (worker). Nulo = ainda não procurado para este endereço.';

alter table public.clientes drop constraint if exists clientes_geo_coordenada_ck;
alter table public.clientes add constraint clientes_geo_coordenada_ck check (
  (lat is null and lon is null and geo_precisao is null)
  or (
    lat is not null and lon is not null and geo_precisao is not null
    and lat between -90 and 90
    and lon between -180 and 180
    and not (lat = 0 and lon = 0)
  )
);

alter table public.clientes drop constraint if exists clientes_geo_precisao_ck;
alter table public.clientes add constraint clientes_geo_precisao_ck check (
  geo_precisao is null or geo_precisao in ('numero', 'rua', 'cep', 'bairro', 'cidade')
);

alter table public.clientes drop constraint if exists clientes_ibge_ck;
alter table public.clientes add constraint clientes_ibge_ck check (
  ibge is null or ibge ~ '^[0-9]{7}$'
);

-- Fila do backfill: o worker lê "sem ponto OU sem IBGE, nunca procurado, ativo",
-- do mais antigo.
create index if not exists clientes_geo_fila_idx
  on public.clientes (criado_em)
  where (lat is null or ibge is null) and geo_tentado_em is null and excluido_em is null;

-- Alertas por município (rota /alertas?ibge= da Onda I1) cruzam por aqui.
create index if not exists clientes_ibge_idx
  on public.clientes (ibge) where ibge is not null;

alter table public.agendamentos
  add column if not exists externa boolean;

comment on column public.agendamentos.externa is
  'Serviço ao ar livre/em altura (sujeito a chuva). NULO = não informado — nunca tratar como false.';

-- ────────────────────────────────────────────────────────────────────────────
-- Endereço mudou → ponto (e talvez IBGE) velhos saem, e o cliente volta à fila
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.clientes_geo_invalida_ao_mudar_endereco()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mudou_municipio boolean;
  mudou_endereco  boolean;
begin
  mudou_municipio :=
    regexp_replace(coalesce(new.cep, ''), '\D', '', 'g') is distinct from regexp_replace(coalesce(old.cep, ''), '\D', '', 'g')
    or lower(btrim(coalesce(new.cidade, ''))) is distinct from lower(btrim(coalesce(old.cidade, '')))
    or upper(btrim(coalesce(new.estado, ''))) is distinct from upper(btrim(coalesce(old.estado, '')));
  mudou_endereco := mudou_municipio
    or lower(btrim(coalesce(new.endereco, ''))) is distinct from lower(btrim(coalesce(old.endereco, '')));

  if not mudou_endereco then
    return new;
  end if;

  -- Quem mandou ponto NOVO junto com o endereço novo (o app geocodificou) manda.
  if new.lat is not distinct from old.lat
     and new.lon is not distinct from old.lon
     and new.geo_precisao is not distinct from old.geo_precisao then
    new.lat := null;
    new.lon := null;
    new.geo_precisao := null;
  end if;

  if mudou_municipio and new.ibge is not distinct from old.ibge then
    new.ibge := null;
  end if;

  -- Endereço novo = procurar de novo, sempre (a tentativa anterior era de outro endereço).
  new.geo_tentado_em := null;
  return new;
end;
$$;

revoke all on function public.clientes_geo_invalida_ao_mudar_endereco() from public, anon, authenticated;

drop trigger if exists clientes_geo_invalida_ao_mudar_endereco on public.clientes;
create trigger clientes_geo_invalida_ao_mudar_endereco
  before update of cep, cidade, estado, endereco on public.clientes
  for each row execute function public.clientes_geo_invalida_ao_mudar_endereco();

commit;

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar, como service_role):
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='clientes'
--      and column_name in ('lat','lon','ibge','geo_precisao','geo_tentado_em');   -- 5 linhas
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='agendamentos' and column_name='externa'; -- 1
--   select tgname from pg_trigger where tgname='clientes_geo_invalida_ao_mudar_endereco'; -- 1
--
-- DEPOIS: ligar GEO_BACKFILL_MODE=production no worker (wrangler.jsonc) e publicar.
--
-- A execução (CHECKs, trigger zerando ponto/IBGE/fila, ponto novo vencendo, externa
-- nula por padrão) roda em Postgres embutido (PGlite) em
-- scripts/teste-geo-clientes.ts, a cada `npm test`.
-- ============================================================================
