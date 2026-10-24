-- ============================================================================
-- OLLI — REGISTRA NO REPO o trigger que promove o status do orçamento pelo link público
-- ----------------------------------------------------------------------------
-- DRIFT: função e trigger JÁ ESTÃO no banco de produção (aplicados em 23/10/2026 18:37Z
-- por engano durante ensaio, ver D-0117), mas não havia migration no repo nem registro em
-- supabase_migrations.schema_migrations. Este arquivo reproduz EXATAMENTE a definição lida
-- do banco (pg_get_functiondef / pg_get_triggerdef / proacl, só leitura, 24/10/2026):
--   função private.promover_status_orcamento_pelo_link(): SECURITY DEFINER, search_path '',
--     dono postgres, ACL {postgres=X/postgres} (sem execute para public/anon/authenticated)
--   trigger trg_promover_status_pelo_link AFTER INSERT OR UPDATE OF status, visualizado_em,
--     revogado_em ON public.orcamentos_publicos FOR EACH ROW
-- NÃO inclui o backfill (já executado; 16 orçamentos promovidos, divergências = 0). A lógica
-- de negócio e o racional estão no PR #202.
-- Idempotente (create or replace / drop trigger if exists). NÃO APLICAR sem OK do Igor;
-- registrar em schema_migrations só depois do merge.
-- ============================================================================
begin;

create or replace function private.promover_status_orcamento_pelo_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo text;
  carimbo text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if new.revogado_em is not null then
    return new;
  end if;

  alvo := case
    when new.status = 'aprovado' then 'aprovado'
    when new.status = 'recusado' then 'recusado'
    when new.visualizado_em is not null then 'visualizado'
    when new.status = 'enviado' then 'enviado'
  end;
  if alvo is null then
    return new;
  end if;

  update public.orcamentos o
     set status = alvo,
         dados = jsonb_set(
                   jsonb_set(coalesce(o.dados, '{}'::jsonb), '{status}', to_jsonb(alvo)),
                   '{atualizadoEm}', to_jsonb(carimbo))
   where o.id = new.orcamento_id
     and o.user_id = new.user_id
     and o.excluido_em is null
     -- degrau atual pelo BLOB (a verdade); status fora da escada = o prestador moveu, não toca.
     and case coalesce(o.dados ->> 'status', o.status)
           when 'rascunho' then 0 when 'enviado' then 1 when 'visualizado' then 2 else 9 end
       < case alvo when 'enviado' then 1 when 'visualizado' then 2 else 3 end;

  return new;
end
$$;

revoke all on function private.promover_status_orcamento_pelo_link() from public, anon, authenticated;

drop trigger if exists trg_promover_status_pelo_link on public.orcamentos_publicos;
create trigger trg_promover_status_pelo_link
  after insert or update of status, visualizado_em, revogado_em on public.orcamentos_publicos
  for each row execute function private.promover_status_orcamento_pelo_link();

commit;
