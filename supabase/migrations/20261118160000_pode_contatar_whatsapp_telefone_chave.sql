-- pode_contatar_whatsapp compara o telefone pela CHAVE (número nacional, com ou sem o 9 do celular), 18/11/2026.
-- D-2278 / LIVRE #378 P2: a Meta costuma mandar o `wa_id` brasileiro SEM o 9; quem consulta só pelo telefone nesse
-- formato escapava do opt-out gravado COM o 9 (e vice-versa).
--
-- Só alarga o bloqueio (nunca libera quem estava bloqueado). Passa a barrar quando:
--   · a linha de opt-out tem telefone com a mesma chave do telefone consultado (`private.telefone_chave`);
--   · a linha de opt-out tem telefone com a mesma chave de QUALQUER telefone da conta consultada
--     (Auth, metadata, empresa: `private.telefones_da_conta`);
--   · a consulta é só por telefone e esse telefone é de uma conta que tem linha de opt-out por user_id.
-- Mexe só no SELECT do opt-out. A definição VIGENTE é lida do banco e remendada (sem regravar a função inteira), então
-- a trava de conta interna e qualquer outra mudança posterior continuam. Permissões não mudam (create or replace).
-- Depende de 20261118130000 (private.telefone_chave / telefones_da_conta / contas_do_nao_contatar).
-- Idempotente. NÃO APLICAR sem PR + revisão (roteiro D-2278).
begin;

do $$
declare
  v_def text;
  v_velho constant text := E'     or (v_tel is not null and n.telefone = v_tel)\n     or (v_tel_conta is not null and n.telefone = v_tel_conta)';
  v_novo constant text := E'     or (n.telefone is not null and private.telefone_chave(p_telefone) is not null\n'
    || E'         and private.telefone_chave(n.telefone) = private.telefone_chave(p_telefone))\n'
    || E'     or (n.telefone is not null and p_user_id is not null\n'
    || E'         and exists (select 1 from private.telefones_da_conta(p_user_id) t\n'
    || E'                      where private.telefone_chave(t) = private.telefone_chave(n.telefone)))\n'
    || E'     or (n.user_id is not null and private.telefone_chave(p_telefone) is not null\n'
    || E'         and n.user_id in (select c.user_id from private.contas_do_nao_contatar(null, p_telefone) c))';
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pode_contatar_whatsapp';
  if v_def is null then
    raise exception 'pode_contatar_whatsapp_ausente';
  end if;
  if v_def like '%telefone_chave%' then
    return; -- já remendada
  end if;
  if pg_catalog.strpos(v_def, v_velho) = 0 then
    raise exception 'pode_contatar_whatsapp_formato_inesperado: a definição vigente mudou; revise o remendo';
  end if;
  execute pg_catalog.replace(v_def, v_velho, v_novo);
end
$$;

commit;
