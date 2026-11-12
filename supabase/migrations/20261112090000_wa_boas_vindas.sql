-- CQ-WA-ROBO-GRATIS (D-1991). Boas-vindas automática no PRIMEIRO contato do telefone com aquele número.
-- Só redefine wa_registrar_entradas: quando a linha nova é a primeira desse telefone (nenhuma wa_entrada antes)
-- e estado = 'novo' (não pediu SAIR; não é preço/contrato/reclamação/dado/incerteza), o retorno traz
-- {telefone, tipo:'boas_vindas'} em respostas. A frase de "sou IA" continua, agora com {telefone, tipo:'ia'}.
-- O texto fica no worker: diz que é assistente automático (IA) e que SAIR para as mensagens (LGPD).
-- O envio passa por wa_autorizar_envio (janela de 24 h, SAIR, teto) igual à frase de IA.
-- RLS: nenhuma tabela nova; wa_entrada/wa_contatos já têm RLS ligada (20261007110000). Função só service_role.
-- NÃO APLICADA. Quem publicar aplica ANTES do worker (worker antigo ignora o campo tipo e manda FRASE_IA).

create or replace function public.wa_registrar_entradas(p_phone_number_id text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item        jsonb;
  v_tel         text;
  v_tipo        text;
  v_ts          timestamptz;
  v_texto       text;
  v_registr     integer := 0;
  v_dup         integer := 0;
  v_saiu        integer := 0;
  v_humano      integer := 0;
  v_ign         integer := 0;
  v_id          bigint;
  v_sair        boolean;
  v_segunda     boolean;
  v_prev_estado text;
  v_prev_em     timestamptz;
  v_passagem    jsonb;
  v_estado      text;
  v_motivo      text;
  v_respostas   jsonb := '[]'::jsonb;
  v_primeira    boolean;
begin
  if p_itens is null or pg_catalog.jsonb_typeof(p_itens) <> 'array' or pg_catalog.jsonb_array_length(p_itens) > 100 then
    raise exception 'wa_itens_invalidos';
  end if;
  if not exists (select 1 from public.wa_numeros where phone_number_id = p_phone_number_id and ativo) then
    return pg_catalog.jsonb_build_object('registradas', 0, 'duplicadas', 0, 'saiu', 0, 'humano', 0,
                                         'ignoradas', pg_catalog.jsonb_array_length(p_itens), 'motivo', 'numero_inativo',
                                         'respostas', '[]'::jsonb);
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
    v_segunda := false;
    v_prev_estado := null;
    v_prev_em := null;
    if not v_sair then
      select e.estado, e.recebido_em
        into v_prev_estado, v_prev_em
      from public.wa_entrada e
      where e.phone_number_id = p_phone_number_id
        and e.telefone = v_tel
        and e.recebido_em <= v_ts
      order by e.recebido_em desc, e.id desc
      limit 1;
      if v_prev_estado in ('novo', 'humano') and not exists (
        select 1 from public.wa_envios v
        where v.phone_number_id = p_phone_number_id
          and v.telefone = v_tel
          and v.criado_em > v_prev_em
          and v.estado <> 'falhou'
      ) then
        v_segunda := true;
      end if;
    end if;
    if v_sair then
      v_estado := 'saiu';
      v_motivo := null;
    else
      v_passagem := private.wa_passagem_humano(v_texto, v_segunda);
      v_estado := v_passagem ->> 'estado';
      v_motivo := v_passagem ->> 'motivo';
    end if;

    v_primeira := not exists (
      select 1 from public.wa_entrada e0
      where e0.phone_number_id = p_phone_number_id and e0.telefone = v_tel
    );

    v_id := null;
    insert into public.wa_entrada (phone_number_id, wa_message_id, telefone, perfil_nome, tipo, texto, recebido_em, estado, motivo)
    values (p_phone_number_id, v_item ->> 'id', v_tel, pg_catalog.left(v_item ->> 'perfil', 80), v_tipo, v_texto, v_ts,
            v_estado, v_motivo)
    on conflict (wa_message_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_dup := v_dup + 1;
      continue;
    end if;
    v_registr := v_registr + 1;
    if v_estado = 'humano' then v_humano := v_humano + 1; end if;
    if v_motivo = 'ia' then
      v_respostas := v_respostas || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('telefone', v_tel, 'tipo', 'ia'));
    elsif v_primeira and v_estado = 'novo' then
      v_respostas := v_respostas || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('telefone', v_tel, 'tipo', 'boas_vindas'));
    end if;

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

  return pg_catalog.jsonb_build_object('registradas', v_registr, 'duplicadas', v_dup, 'saiu', v_saiu,
                                       'humano', v_humano, 'ignoradas', v_ign, 'respostas', v_respostas);
end;
$$;
revoke all on function public.wa_registrar_entradas(text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_registrar_entradas(text, jsonb) to service_role;
