-- Rastreio de telas com tempo de permanência (pedido do dono, 22/10/2026).
--
-- Por quê: o painel só mostra login/app_open e as etapas de ativação. Não dá para
-- ver POR QUE a 1ª sessão morre: em que tela a pessoa ficou, por quanto tempo,
-- o que tocou. Esta tabela guarda uma linha por visita a uma tela.
--
-- Sem PII: só user_id (de auth.uid() no servidor), nome da ROTA (lista de formato
-- fechado, sem parâmetros/ids/texto digitado), duração e plataforma. Nunca grava
-- conteúdo de tela, nome de cliente, valor ou URL com parâmetros.
-- Leitura só service_role (o usuário não lê o próprio log; mesmo modelo do
-- user_activity_log). Retenção: pendente (definir job de limpeza antes de ligar em produção).

create table if not exists public.user_tela_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tela text not null check (tela ~ '^[A-Za-z0-9_]{1,40}$'),
  acao text check (acao is null or acao ~ '^[a-z0-9_]{1,40}$'),
  duracao_ms integer not null default 0 check (duracao_ms between 0 and 14400000),
  plataforma text not null default 'unknown'
    check (plataforma in ('web', 'ios', 'android', 'desktop', 'unknown')),
  criado_em timestamptz not null default now()
);

create index if not exists user_tela_log_user_criado_idx
  on public.user_tela_log (user_id, criado_em desc);
create index if not exists user_tela_log_tela_criado_idx
  on public.user_tela_log (tela, criado_em desc);

alter table public.user_tela_log enable row level security;
alter table public.user_tela_log force row level security;
revoke all on public.user_tela_log from public, anon, authenticated;

-- Lote de até 20 visitas/toques por chamada (o app acumula e descarrega).
create or replace function public.registrar_telas_usuario(p_itens jsonb, p_plataforma text default 'unknown')
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plat text := lower(trim(coalesce(p_plataforma, 'unknown')));
  it jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 20 then
    raise exception 'lote_invalido';
  end if;
  if plat not in ('web', 'ios', 'android', 'desktop', 'unknown') then
    plat := 'unknown';
  end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    if coalesce(it ->> 'tela', '') !~ '^[A-Za-z0-9_]{1,40}$' then
      continue;
    end if;
    insert into public.user_tela_log (user_id, tela, acao, duracao_ms, plataforma)
    values (
      (select auth.uid()),
      it ->> 'tela',
      case when (it ->> 'acao') ~ '^[a-z0-9_]{1,40}$' then it ->> 'acao' end,
      least(greatest(coalesce((it ->> 'duracao_ms')::int, 0), 0), 14400000),
      plat
    );
  end loop;
end;
$$;

revoke all on function public.registrar_telas_usuario(jsonb, text) from public, anon;
grant execute on function public.registrar_telas_usuario(jsonb, text) to authenticated;
-- INSERT dentro da função precisa de privilégio: security invoker + sem grant direto
-- falharia. Política de insert restrita ao próprio usuário resolve sem abrir leitura.
grant insert on public.user_tela_log to authenticated;
grant usage on sequence public.user_tela_log_id_seq to authenticated;
create policy user_tela_log_insert_proprio on public.user_tela_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Onde a pessoa passa o tempo (service_role): select * from public.telas_resumo;
create or replace view public.telas_resumo
with (security_invoker = true) as
select tela,
       count(*) as visitas,
       count(distinct user_id) as pessoas,
       round(avg(duracao_ms) / 1000.0, 1) as media_seg,
       round((percentile_cont(0.5) within group (order by duracao_ms)) / 1000.0, 1) as mediana_seg
  from public.user_tela_log
 where acao is null
 group by tela;
revoke all on public.telas_resumo from public, anon, authenticated;
