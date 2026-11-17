-- Aceite de marketing (opt-in LGPD) com data, origem e texto exato aceito (CQ-ACEITE-MARKETING, 17/11/2026).
-- Reusa public.consentimentos (20261022100000_eventos_uso.sql): finalidade = 'marketing'.
-- Idempotente. Não marca aceite de ninguém: só cria o lugar e a função que grava o aceite do PRÓPRIO usuário.
-- Aplicar em produção é decisão do Igor.
begin;

alter table public.consentimentos add column if not exists origem text;
alter table public.consentimentos add column if not exists texto_aceito text;

-- Aceite de marketing sem origem e sem o texto que a pessoa viu não vale como prova (LGPD art. 8º §2º).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.consentimentos'::regclass and conname = 'consentimentos_marketing_prova'
  ) then
    alter table public.consentimentos
      add constraint consentimentos_marketing_prova
      check (finalidade <> 'marketing' or (origem is not null and texto_aceito is not null));
  end if;
end $$;

-- 'marketing' só entra pela função abaixo (data do servidor, texto e origem obrigatórios);
-- o insert direto de usuário continua valendo para as outras finalidades.
drop policy if exists consentimentos_marketing_so_funcao on public.consentimentos;
create policy consentimentos_marketing_so_funcao on public.consentimentos
  as restrictive for insert to authenticated
  with check (finalidade <> 'marketing');

-- Registra (ou reativa) o aceite de marketing do usuário logado. Revogar = update de revogado_em (já permitido ao dono).
-- p_aceito_em: momento em que a caixa foi marcada no cadastro (a conta só tem sessão depois de confirmar o e-mail);
-- aceita no máximo 30 dias para trás e nunca no futuro; fora disso vale o relógio do servidor.
create or replace function public.registrar_aceite_marketing(
  p_origem text,
  p_texto text,
  p_versao text,
  p_aceito_em timestamptz default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_quando timestamptz := pg_catalog.now();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_origem is null or p_origem not in ('cadastro_painel', 'cadastro_app', 'configuracoes') then
    raise exception 'origem_invalida';
  end if;
  if p_texto is null or pg_catalog.length(p_texto) not between 20 and 1000 then
    raise exception 'texto_invalido';
  end if;
  if p_versao is null or pg_catalog.length(p_versao) not between 1 and 32 then
    raise exception 'versao_invalida';
  end if;
  if p_aceito_em is not null
     and p_aceito_em <= v_quando
     and p_aceito_em >= v_quando - interval '30 days' then
    v_quando := p_aceito_em;
  end if;

  insert into public.consentimentos (usuario_id, finalidade, versao_texto, concedido_em, origem, texto_aceito)
  values (v_uid, 'marketing', p_versao, v_quando, p_origem, p_texto)
  on conflict (usuario_id, finalidade, versao_texto) do update
    set concedido_em = excluded.concedido_em,
        revogado_em = null,
        origem = excluded.origem,
        texto_aceito = excluded.texto_aceito
    -- reenvio do mesmo aceite ainda válido não mexe na data original
    where public.consentimentos.revogado_em is not null
  returning id into v_id;

  if v_id is null then
    select c.id into v_id from public.consentimentos c
     where c.usuario_id = v_uid and c.finalidade = 'marketing' and c.versao_texto = p_versao;
  end if;
  return v_id;
end;
$$;
revoke all on function public.registrar_aceite_marketing(text, text, text, timestamptz) from public, anon;
grant execute on function public.registrar_aceite_marketing(text, text, text, timestamptz) to authenticated;

commit;
