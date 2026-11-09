-- Régua: e-mail `trial_encerrado` (22/10/2026). Teste do Pro que terminou há até 7 dias, sem conversão e com o plano
-- efetivo ainda GRÁTIS: UM e-mail por teste. Copy: Entregas Claude/OLLI/2026-10-22-copy-trial-encerrado (Bia v2 + Dr. Paulo).
--
-- Como em 20261007140000 (contas internas), as duas funções são grandes e já estão em produção COM remendos posteriores
-- (conta_interna). Em vez de reescrevê-las e arriscar divergir da versão viva (revisão independente: a cópia antiga
-- apagaria a trava de conta interna), o patch troca/insere TRECHOS sobre o texto real (pg_get_functiondef) e FALHA EM
-- VOZ ALTA se uma âncora não for encontrada. Idempotente: não repete se `trial_encerrado` já estiver na função.
--
-- Timestamp 20261109100000 (v2, 09/11/2026): roda DEPOIS de pix_vence_lembrete (20261026040000), oferta_pro_email e admin_emails,
-- que também remendam essas funções; a âncora dos tipos não presume mais o ')' logo após 'trial_acabando' (o pix_vence acrescenta
-- 'pix_vence' ali). O catálogo da email_outbox NÃO muda: trial_encerrado reaproveita lembrete_reengajamento.v1.
--
-- ORDEM OBRIGATÓRIA: esta migration ANTES do deploy do worker que escolhe `trial_encerrado` (sem ela, o enqueue antigo
-- levanta 'lembrete_dados_invalidos' e a rodada aborta).
do $patch_trial_encerrado$
declare
  v_def  text;
  v_novo text;
  v_ancora_tipos constant text := $a$'ativacao_ultima', 'parou', 'trial_acabando'$a$;
  v_ancora_enq   constant text := $a$else -- trial_acabando$a$;
  v_ancora_lista constant text := $a$-- Reengajamento — teste do Pro terminando em 24–72 h.$a$;
  v_ramo_enq constant text := $r$elsif v_tipo = 'trial_encerrado' then
      -- Teste que terminou há até 7 dias e a conta segue no plano GRÁTIS (quem pagou depois do teste não entra:
      -- a linha do teste fica 'active' e vencida mesmo para quem paga, então o plano efetivo é a verdade).
      if not exists (
        select 1 from public.trials_comerciais t
        where t.owner_user_id = p_user_id
          and t.estado in ('active', 'ended')
          and t.convertido_em is null
          and t.termina_em <= p_now
          and t.termina_em > p_now - interval '7 days'
          and pg_catalog.to_char(t.termina_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              = p_template_dados ->> 'terminaEm'
          and public.plano_comercial_efetivo(p_user_id, t.tenant_id, p_now) = 'gratis'
      ) then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'trial_fora_da_janela');
      end if;

    $r$;
  v_ramo_lista constant text := $l$(
        e.tenant_id is not null
        and e.orcamentos >= 1
        and e.t_estado in ('active', 'ended')
        and e.t_termina_em <= p_now
        and e.t_termina_em > p_now - interval '7 days'
        and public.plano_comercial_efetivo(e.user_id, e.tenant_id, p_now) = 'gratis'
      )
      or
      $l$;
begin
  -- a) o enqueue: aceita o tipo novo e reconfere o segmento sob a trava
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enqueue_lembrete_email';
  if v_def is null then raise exception 'enqueue_lembrete_email_ausente'; end if;
  if position('trial_encerrado' in v_def) = 0 then
    if position(v_ancora_tipos in v_def) = 0 then raise exception 'enqueue_ancora_tipos_nao_encontrada'; end if;
    if position(v_ancora_enq in v_def) = 0 then raise exception 'enqueue_ancora_trial_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora_tipos,
      $t$'ativacao_ultima', 'parou', 'trial_acabando', 'trial_encerrado'$t$);
    v_novo := replace(v_novo, v_ancora_enq, v_ramo_enq || v_ancora_enq);
    execute v_novo;
  end if;

  -- b) a lista de candidatos: trial vencido entra (sem isto o tipo novo nunca aparece)
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listar_candidatos_lembrete_email';
  if v_def is null then raise exception 'listar_candidatos_lembrete_email_ausente'; end if;
  if position('trial_encerrado' in v_def) = 0 and position('Reengajamento — teste do Pro que terminou' in v_def) = 0 then
    if position(v_ancora_lista in v_def) = 0 then raise exception 'listar_candidatos_ancora_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora_lista,
      E'-- Reengajamento — teste do Pro que terminou há até 7 dias e segue no plano grátis.\n      ' || v_ramo_lista || v_ancora_lista);
    execute v_novo;
  end if;
end
$patch_trial_encerrado$;
