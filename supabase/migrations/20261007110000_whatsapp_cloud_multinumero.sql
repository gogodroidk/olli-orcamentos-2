-- WhatsApp Cloud API MULTI-NÚMERO (07/10/2026): números, fila de entrada, envios e guardas.
--
-- Hoje 1 número (holding OLLI, (11) 94172-7487); amanhã N — cada linha de `wa_numeros` é um número
-- (phone_number_id) com marca, segredo de acesso e ritmo próprios. Nada aqui fala com a Meta: quem fala é
-- o worker (worker/src/whatsappCloud.js). Este arquivo é a FONTE ÚNICA das regras de envio:
--   1. SAIR/pare/cancelar recebido → entra na lista `whatsapp_nao_contatar` (já existente) na hora;
--   2. antes de CADA envio `wa_autorizar_envio` confere, de forma ATÔMICA (trava por número):
--      número ativo · opt-out · primeiro contato só com OK HUMANO registrado · fora da janela de 24 h
--      só TEMPLATE · intervalo mínimo entre templates (ritmo humano) · teto diário de templates;
--   3. erro/dúvida = NÃO envia. Sem "modo sombra": número `ativo = false` recusa tudo e diz por quê.
--
-- Segredos NÃO moram aqui nem no worker (o Workers Free está em 64/64 variáveis): ficam no Supabase Vault,
-- criptografados, lidos pelas funções abaixo (service_role). Nomes no Vault:
--   wa_verify_token  token de verificação do webhook (GET hub.verify_token)
--   wa_app_secret    app secret do app Meta (valida X-Hub-Signature-256)
--   wa_envio_token   token Bearer das rotas internas /whatsapp/enviar e /whatsapp/fila (quem atende/envia)
--   wa_aprovacao_token  token SÓ DE HUMANO para /whatsapp/aprovar (OK do primeiro contato) — diferente do
--                    de envio, para quem envia não conseguir aprovar a si mesmo
--   wa_access_token  token de sistema da Cloud API (por número: coluna segredo_token)
-- Gravar (SQL Editor/MCP, nunca no repo):  select vault.create_secret('<valor>', 'wa_app_secret', 'WhatsApp');
--
-- Dado pessoal: telefone e texto de quem escreveu ficam SÓ nestas tabelas (RLS ligada, sem policy,
-- revogado de anon/authenticated); logs do worker levam só contagens. Retenção: ver docs/WHATSAPP_CLOUD_API.md.
-- Aditiva e idempotente.

create schema if not exists private;

-- ─── Números (1 hoje, N amanhã) ───────────────────────────────────────────────
create table if not exists public.wa_numeros (
  phone_number_id       text primary key check (phone_number_id ~ '^[0-9]{5,20}$'),
  waba_id               text not null check (waba_id ~ '^[0-9]{5,20}$'),
  marca                 text not null check (char_length(marca) between 2 and 60),
  empresa_user_id       uuid references auth.users (id) on delete set null,
  segredo_token         text not null default 'wa_access_token' check (segredo_token ~ '^[a-z0-9_]{3,60}$'),
  intervalo_envio_s     integer not null default 180 check (intervalo_envio_s between 30 and 900),
  teto_diario_templates integer not null default 40 check (teto_diario_templates between 1 and 1000),
  ativo                 boolean not null default false,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Número da holding OLLI (registro na Meta feito pelo MAESTRO). Nasce DESLIGADO: só liga quando o número
-- estiver conectado — `update public.wa_numeros set ativo = true where phone_number_id = '...'`.
insert into public.wa_numeros (phone_number_id, waba_id, marca, ativo)
values ('1162487800287754', '2107349913458786', 'OLLI', false)
on conflict (phone_number_id) do nothing;

-- ─── Contato por número: janela de 24 h e OK humano do primeiro contato ───────
create table if not exists public.wa_contatos (
  phone_number_id         text not null references public.wa_numeros (phone_number_id) on delete cascade,
  telefone                text not null check (telefone ~ '^55[0-9]{10,11}$'),
  ultima_entrada_em       timestamptz,
  primeiro_contato_ok_por text,
  primeiro_contato_ok_em  timestamptz,
  criado_em               timestamptz not null default now(),
  primary key (phone_number_id, telefone)
);

-- ─── Fila de entrada (o Bruno atende daqui) ───────────────────────────────────
create table if not exists public.wa_entrada (
  id              bigint generated always as identity primary key,
  phone_number_id text not null references public.wa_numeros (phone_number_id) on delete cascade,
  wa_message_id   text not null unique check (char_length(wa_message_id) between 5 and 200),
  telefone        text not null check (telefone ~ '^55[0-9]{10,11}$'),
  perfil_nome     text check (char_length(perfil_nome) <= 80),
  tipo            text not null check (tipo ~ '^[a-z_]{2,30}$'),
  texto           text check (char_length(texto) <= 4096),
  recebido_em     timestamptz not null,
  criado_em       timestamptz not null default now(),
  estado          text not null default 'novo' check (estado in ('novo', 'em_atendimento', 'resolvido', 'saiu')),
  atribuido_a     text check (char_length(atribuido_a) <= 60)
);
create index if not exists wa_entrada_fila_idx on public.wa_entrada (phone_number_id, estado, recebido_em);

-- ─── Envios (reserva de ritmo + status da Meta) ───────────────────────────────
create table if not exists public.wa_envios (
  id              bigint generated always as identity primary key,
  phone_number_id text not null references public.wa_numeros (phone_number_id) on delete cascade,
  telefone        text not null check (telefone ~ '^55[0-9]{10,11}$'),
  tipo            text not null check (tipo in ('texto', 'template')),
  template        text check (template ~ '^[a-z0-9_]{1,100}$'),
  wa_message_id   text unique,
  estado          text not null default 'reservado' check (estado in ('reservado', 'enviado', 'entregue', 'lido', 'falhou')),
  codigo_falha    text check (char_length(codigo_falha) <= 40),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists wa_envios_ritmo_idx on public.wa_envios (phone_number_id, tipo, criado_em desc);

alter table public.wa_numeros  enable row level security;
alter table public.wa_contatos enable row level security;
alter table public.wa_entrada  enable row level security;
alter table public.wa_envios   enable row level security;
revoke all on public.wa_numeros, public.wa_contatos, public.wa_entrada, public.wa_envios from anon, authenticated;

-- ─── "Pede para sair?" — texto da pessoa → opt-out (casa no começo; na dúvida, sai) ──────────
create or replace function private.wa_texto_pede_sair(p_texto text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select pg_catalog.regexp_replace(
           pg_catalog.translate(pg_catalog.lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
           '[^a-z0-9 ]', '', 'g'
         ) ~ '^ *(sair|sai|parar|pare|stop|cancelar|descadastrar|remover|nao quero)( [a-z0-9 ]{0,40})?$';
$$;
revoke all on function private.wa_texto_pede_sair(text) from public, anon, authenticated;

-- ─── Segredos do Vault (service_role) ─────────────────────────────────────────
create or replace function public.wa_segredos()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select pg_catalog.jsonb_build_object(
    'verify_token', (select decrypted_secret from vault.decrypted_secrets where name = 'wa_verify_token' limit 1),
    'app_secret',   (select decrypted_secret from vault.decrypted_secrets where name = 'wa_app_secret' limit 1),
    'envio_token',  (select decrypted_secret from vault.decrypted_secrets where name = 'wa_envio_token' limit 1),
    'aprovacao_token', (select decrypted_secret from vault.decrypted_secrets where name = 'wa_aprovacao_token' limit 1)
  );
$$;
revoke all on function public.wa_segredos() from public, anon, authenticated;
grant execute on function public.wa_segredos() to service_role;

create or replace function public.wa_token_numero(p_phone_number_id text)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select s.decrypted_secret
  from public.wa_numeros n
  join vault.decrypted_secrets s on s.name = n.segredo_token
  where n.phone_number_id = p_phone_number_id and n.ativo
  limit 1;
$$;
revoke all on function public.wa_token_numero(text) from public, anon, authenticated;
grant execute on function public.wa_token_numero(text) to service_role;

-- ─── Resolve número por phone_number_id OU marca (só ativo) ──────────────────
create or replace function public.wa_numero_ativo(p_phone_number_id text default null, p_marca text default null)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select pg_catalog.jsonb_build_object('phone_number_id', n.phone_number_id, 'marca', n.marca)
  from public.wa_numeros n
  where n.ativo
    and ((p_phone_number_id is not null and n.phone_number_id = p_phone_number_id)
      or (p_phone_number_id is null and p_marca is not null and pg_catalog.lower(n.marca) = pg_catalog.lower(p_marca)))
  order by n.criado_em
  limit 1;
$$;
revoke all on function public.wa_numero_ativo(text, text) from public, anon, authenticated;
grant execute on function public.wa_numero_ativo(text, text) to service_role;

-- ─── Entrada em LOTE: idempotente por wa_message_id; SAIR vira opt-out ───────
-- p_itens = [{ id, telefone, perfil, tipo, texto, ts }]
create or replace function public.wa_registrar_entradas(p_phone_number_id text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item    jsonb;
  v_tel     text;
  v_tipo    text;
  v_ts      timestamptz;
  v_texto   text;
  v_registr integer := 0;
  v_dup     integer := 0;
  v_saiu    integer := 0;
  v_ign     integer := 0;
  v_id      bigint;
  v_sair    boolean;
begin
  if p_itens is null or pg_catalog.jsonb_typeof(p_itens) <> 'array' or pg_catalog.jsonb_array_length(p_itens) > 100 then
    raise exception 'wa_itens_invalidos';
  end if;
  if not exists (select 1 from public.wa_numeros where phone_number_id = p_phone_number_id and ativo) then
    return pg_catalog.jsonb_build_object('registradas', 0, 'duplicadas', 0, 'saiu', 0,
                                         'ignoradas', pg_catalog.jsonb_array_length(p_itens), 'motivo', 'numero_inativo');
  end if;

  for v_item in select * from pg_catalog.jsonb_array_elements(p_itens) loop
    v_tel := private.telefone_whatsapp_br(v_item ->> 'telefone');
    v_tipo := pg_catalog.lower(coalesce(v_item ->> 'tipo', 'desconhecido'));
    if v_tel is null or (v_item ->> 'id') is null or v_tipo !~ '^[a-z_]{2,30}$' then
      v_ign := v_ign + 1;
      continue;
    end if;
    v_ts := coalesce(pg_catalog.to_timestamp(nullif(v_item ->> 'ts', '')::double precision), pg_catalog.now());
    if v_ts > pg_catalog.now() + interval '5 minutes' then v_ts := pg_catalog.now(); end if;
    v_texto := pg_catalog.left(v_item ->> 'texto', 4096);
    v_sair := private.wa_texto_pede_sair(v_texto);

    v_id := null;
    insert into public.wa_entrada (phone_number_id, wa_message_id, telefone, perfil_nome, tipo, texto, recebido_em, estado)
    values (p_phone_number_id, v_item ->> 'id', v_tel, pg_catalog.left(v_item ->> 'perfil', 80), v_tipo, v_texto, v_ts,
            case when v_sair then 'saiu' else 'novo' end)
    on conflict (wa_message_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_dup := v_dup + 1;
      continue;
    end if;
    v_registr := v_registr + 1;

    insert into public.wa_contatos (phone_number_id, telefone, ultima_entrada_em)
    values (p_phone_number_id, v_tel, v_ts)
    on conflict (phone_number_id, telefone)
    do update set ultima_entrada_em = greatest(coalesce(public.wa_contatos.ultima_entrada_em, excluded.ultima_entrada_em),
                                               excluded.ultima_entrada_em);

    if v_sair then
      perform public.registrar_nao_contatar_whatsapp(null, v_tel, 'pediu_sair', 'whatsapp');
      v_saiu := v_saiu + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('registradas', v_registr, 'duplicadas', v_dup, 'saiu', v_saiu, 'ignoradas', v_ign);
end;
$$;
revoke all on function public.wa_registrar_entradas(text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_registrar_entradas(text, jsonb) to service_role;

-- ─── Status da Meta (sent/delivered/read/failed) → wa_envios. Nunca "rebaixa" o estado. ────
-- p_itens = [{ id, estado, codigo }]
create or replace function public.wa_registrar_statuses(p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item jsonb;
  v_novo text;
  v_n    integer := 0;
begin
  if p_itens is null or pg_catalog.jsonb_typeof(p_itens) <> 'array' or pg_catalog.jsonb_array_length(p_itens) > 200 then
    raise exception 'wa_itens_invalidos';
  end if;
  for v_item in select * from pg_catalog.jsonb_array_elements(p_itens) loop
    v_novo := case v_item ->> 'estado'
                when 'sent' then 'enviado' when 'delivered' then 'entregue'
                when 'read' then 'lido' when 'failed' then 'falhou'
                else null end;
    continue when v_novo is null;
    update public.wa_envios e
       set estado = v_novo,
           codigo_falha = case when v_novo = 'falhou' then pg_catalog.left(coalesce(v_item ->> 'codigo', 'desconhecido'), 40)
                               else e.codigo_falha end,
           atualizado_em = pg_catalog.now()
     where e.wa_message_id = v_item ->> 'id'
       and (case e.estado when 'reservado' then 0 when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 else 4 end)
         < (case v_novo when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 else 4 end);
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.wa_registrar_statuses(jsonb) from public, anon, authenticated;
grant execute on function public.wa_registrar_statuses(jsonb) to service_role;

-- ─── OK HUMANO do primeiro contato (Igor/Bruno, via admin/SQL — nunca automático) ─────
create or replace function public.wa_aprovar_primeiro_contato(p_phone_number_id text, p_telefone text, p_por text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tel text := private.telefone_whatsapp_br(p_telefone);
begin
  if v_tel is null then return pg_catalog.jsonb_build_object('ok', false, 'motivo', 'telefone_invalido'); end if;
  if p_por is null or pg_catalog.char_length(pg_catalog.btrim(p_por)) < 2 then
    return pg_catalog.jsonb_build_object('ok', false, 'motivo', 'quem_aprovou_obrigatorio');
  end if;
  if not exists (select 1 from public.wa_numeros where phone_number_id = p_phone_number_id) then
    return pg_catalog.jsonb_build_object('ok', false, 'motivo', 'numero_inexistente');
  end if;
  insert into public.wa_contatos (phone_number_id, telefone, primeiro_contato_ok_por, primeiro_contato_ok_em)
  values (p_phone_number_id, v_tel, pg_catalog.left(pg_catalog.btrim(p_por), 60), pg_catalog.now())
  on conflict (phone_number_id, telefone)
  do update set primeiro_contato_ok_por = excluded.primeiro_contato_ok_por,
                primeiro_contato_ok_em  = excluded.primeiro_contato_ok_em;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.wa_aprovar_primeiro_contato(text, text, text) from public, anon, authenticated;
grant execute on function public.wa_aprovar_primeiro_contato(text, text, text) to service_role;

-- ─── GUARDA DE ENVIO (atômica, por número). pode=false → NÃO envie. ────────────
create or replace function public.wa_autorizar_envio(
  p_phone_number_id text,
  p_telefone        text,
  p_tipo            text,
  p_template        text default null,
  p_user_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_num            public.wa_numeros;
  v_tel            text := private.telefone_whatsapp_br(p_telefone);
  v_contato        public.wa_contatos;
  v_pode           jsonb;
  v_ultimo         timestamptz;
  v_espera         integer;
  v_templates_24h  integer;
  v_janela         boolean;
  v_id             bigint;
begin
  if p_tipo is null or p_tipo not in ('texto', 'template') then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'tipo_invalido');
  end if;
  if p_tipo = 'template' and (p_template is null or p_template !~ '^[a-z0-9_]{1,100}$') then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'template_invalido');
  end if;
  if v_tel is null then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'telefone_invalido');
  end if;

  -- Uma decisão por vez em cada número: dois envios simultâneos não furam o intervalo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.wa_envio:' || coalesce(p_phone_number_id, ''), 0));

  select * into v_num from public.wa_numeros where phone_number_id = p_phone_number_id;
  if not found then return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'numero_inexistente'); end if;
  if not v_num.ativo then return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'numero_inativo'); end if;

  -- 1) SAIR / reclamou / número inválido: a lista é soberana (qualquer erro = não pode).
  v_pode := public.pode_contatar_whatsapp(p_user_id, v_tel);
  if coalesce((v_pode ->> 'pode')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'nao_contatar', 'detalhe', v_pode ->> 'motivo');
  end if;

  select * into v_contato from public.wa_contatos c where c.phone_number_id = p_phone_number_id and c.telefone = v_tel;
  v_janela := v_contato.ultima_entrada_em is not null
              and v_contato.ultima_entrada_em > pg_catalog.now() - interval '24 hours';

  -- 2) Primeiro contato (a pessoa nunca escreveu para este número) só com OK HUMANO registrado.
  if v_contato.ultima_entrada_em is null and v_contato.primeiro_contato_ok_em is null then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'primeiro_contato_sem_ok_humano');
  end if;

  -- 3) Fora da janela de 24 h só template aprovado (texto livre a Meta recusa e queima a qualidade do número).
  if p_tipo = 'texto' and not v_janela then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'fora_da_janela_use_template');
  end if;

  -- 4) Ritmo humano e teto diário valem para a abordagem ativa (template).
  if p_tipo = 'template' then
    select pg_catalog.max(e.criado_em),
           pg_catalog.count(*) filter (where e.criado_em > pg_catalog.now() - interval '24 hours')
      into v_ultimo, v_templates_24h
    from public.wa_envios e
    where e.phone_number_id = p_phone_number_id and e.tipo = 'template' and e.estado <> 'falhou';
    if v_templates_24h >= v_num.teto_diario_templates then
      return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'teto_diario');
    end if;
    if v_ultimo is not null then
      v_espera := pg_catalog.ceil(v_num.intervalo_envio_s - extract(epoch from (pg_catalog.now() - v_ultimo)))::integer;
      if v_espera > 0 then
        return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'aguarde', 'aguarde_s', v_espera);
      end if;
    end if;
  end if;

  insert into public.wa_envios (phone_number_id, telefone, tipo, template)
  values (p_phone_number_id, v_tel, p_tipo, case when p_tipo = 'template' then p_template else null end)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('pode', true, 'motivo', 'liberado', 'envio_id', v_id, 'telefone', v_tel);
end;
$$;
revoke all on function public.wa_autorizar_envio(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.wa_autorizar_envio(text, text, text, text, uuid) to service_role;

-- Resultado do envio (depois da chamada à Meta).
create or replace function public.wa_concluir_envio(p_envio_id bigint, p_wa_message_id text, p_codigo_falha text default null)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.wa_envios
     set estado = case when p_codigo_falha is null then 'enviado' else 'falhou' end,
         wa_message_id = coalesce(p_wa_message_id, wa_message_id),
         codigo_falha = pg_catalog.left(p_codigo_falha, 40),
         atualizado_em = pg_catalog.now()
   where id = p_envio_id and estado = 'reservado';
$$;
revoke all on function public.wa_concluir_envio(bigint, text, text) from public, anon, authenticated;
grant execute on function public.wa_concluir_envio(bigint, text, text) to service_role;

-- ─── Fila do Bruno ────────────────────────────────────────────────────────────
create or replace function public.wa_fila_entrada(p_limit integer default 50)
returns table (id bigint, phone_number_id text, marca text, telefone text, perfil_nome text, tipo text,
               texto text, recebido_em timestamptz, estado text, janela_aberta_ate timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select e.id, e.phone_number_id, n.marca, e.telefone, e.perfil_nome, e.tipo, e.texto, e.recebido_em, e.estado,
         c.ultima_entrada_em + interval '24 hours'
  from public.wa_entrada e
  join public.wa_numeros n on n.phone_number_id = e.phone_number_id
  left join public.wa_contatos c on c.phone_number_id = e.phone_number_id and c.telefone = e.telefone
  where e.estado in ('novo', 'em_atendimento')
  order by e.recebido_em
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke all on function public.wa_fila_entrada(integer) from public, anon, authenticated;
grant execute on function public.wa_fila_entrada(integer) to service_role;

create or replace function public.wa_fila_atualizar(p_id bigint, p_estado text, p_atribuido_a text default null)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_estado is null or p_estado not in ('em_atendimento', 'resolvido') then return false; end if;
  update public.wa_entrada
     set estado = p_estado, atribuido_a = coalesce(pg_catalog.left(p_atribuido_a, 60), atribuido_a)
   where id = p_id and estado in ('novo', 'em_atendimento');
  return found;
end;
$$;
revoke all on function public.wa_fila_atualizar(bigint, text, text) from public, anon, authenticated;
grant execute on function public.wa_fila_atualizar(bigint, text, text) to service_role;
