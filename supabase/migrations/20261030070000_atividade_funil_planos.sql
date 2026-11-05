-- OLLI — FUNIL DE RECEITA: "viu Planos" e "clicou para pagar" (TECH — CTO, 28/10).
-- 14 dias sem as internas: 18 contas abriram orçamento, 7 enviaram e 4 tiveram aprovação, mas nenhum evento
-- dizia quem chegou a ver o preço. Com 0 pagantes, não dava para saber se o problema é preço, tela ou
-- se ninguém chega lá. Só acrescenta 2 nomes à allowlist; o resto da função fica IGUAL ao de produção
-- (pg_get_functiondef lido em 28/10). Sem dado pessoal: só user_id, evento e plataforma.
begin;

create or replace function public.registrar_atividade_usuario(p_evento text, p_plataforma text default 'unknown'::text)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  evento_normalizado text := lower(trim(coalesce(p_evento, '')));
  plataforma_normalizada text := lower(trim(coalesce(p_plataforma, 'unknown')));
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  if evento_normalizado not in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create',
    'ativacao_card_visto', 'ativacao_card_clicado', 'oficio_escolhido',
    'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado',
    'planos_visto', 'plano_pagar_clicado'
  ) then
    raise exception 'evento_invalido';
  end if;

  if plataforma_normalizada not in ('web', 'ios', 'android', 'desktop', 'unknown') then
    plataforma_normalizada := 'unknown';
  end if;

  if private.atividade_recente(evento_normalizado) then
    return;
  end if;

  insert into public.user_activity_log (user_id, evento, plataforma)
  values ((select auth.uid()), evento_normalizado, plataforma_normalizada);
end;
$function$;

commit;
