-- Supressão CRUZADA e-mail <-> WhatsApp (D-2151, 18/11/2026; LGPD art. 18: quem pediu para parar, para).
--
-- Antes: o e-mail só olhava `email_supressoes` e o WhatsApp só olhava `whatsapp_nao_contatar`. Quem mandou
-- SAIR no WhatsApp ainda podia receber a régua por e-mail, e quem clicou em "Parar de receber lembretes"
-- ainda podia receber mensagem no WhatsApp.
--
-- Como: dois gatilhos que ESPELHAM o pedido de saída na outra lista. Todo caminho que já existe (lista de
-- candidatos, enqueue, resumo, oferta do Pro, pode_contatar_whatsapp) continua lendo só a sua tabela e passa
-- a enxergar o pedido, sem remendar nenhuma dessas funções.
--
--   whatsapp_nao_contatar (pediu_sair | reclamou)
--        -> email_supressoes (descadastro, origem 'whatsapp') + cancela o que está na fila de e-mail
--           CONTAS = a conta da linha (user_id) E as contas que têm esse telefone em QUALQUER fonte do cadastro:
--           auth.users.phone, raw_user_meta_data->>'phone', empresa.dados->>'telefone' e empresa.dados->>'whatsapp'
--           (D-2278). Comparação pelo número nacional (DDD + número, sem 55/zero à esquerda, com ou sem o 9 do celular).
--           Os 3 caminhos reais de SAIR no WhatsApp gravam SÓ o telefone, então sem isso nada cruzava. Além de
--           suprimir o e-mail, grava a linha da CONTA (user_id) no opt-out do WhatsApp, origem 'espelho_whatsapp'.
--   email_supressoes (descadastro | complaint, origem diferente de 'whatsapp')
--        -> whatsapp_nao_contatar (pediu_sair | reclamou, origem 'espelho_email'): a linha da CONTA e a
--           linha do TELEFONE da conta (quem consulta só pelo número, ex. lista do SALES, também enxerga).
--
-- NÃO cruza (ninguém pediu para parar):
--   · `numero_invalido` (o número está errado) e `hard_bounce` (o endereço não existe);
--   · `decisao_interna` (decisão da casa, não pedido da pessoa; cruzar a gravaria como descadastro dela).
-- Origens próprias `espelho_email` e `espelho_whatsapp` (novas na check de whatsapp_nao_contatar) marcam a linha
-- espelhada. Assim o gatilho ignora só o que ele mesmo escreveu e NÃO confunde com `origem = 'email'`, que é legítima
-- (registrar_nao_contatar_whatsapp(..., 'email'): a pessoa pediu por e-mail) e deve suprimir o e-mail.
-- Sem laço: cada gatilho ignora a linha que o outro acabou de espelhar e usa ON CONFLICT DO NOTHING.
-- Se a conta/telefone já tem linha `numero_invalido`, o pedido de parar a SUBSTITUI (parar vale mais que número errado).
-- Voltar: `definir_contato_whatsapp(true)` remove só o pedido do WhatsApp (`pediu_sair`); a supressão de e-mail
-- espelhada fica (a pessoa volta ao e-mail pelo mesmo caminho de antes, não por efeito colateral).
-- Conhecido e aceito: `complaint` (marcou spam) vira `reclamou` no WhatsApp e `definir_contato_whatsapp(true)` só
-- apaga `pediu_sair`, então quem marcou spam fica bloqueado no WhatsApp SEM autoatendimento para voltar.
-- É conservador de propósito; reverter só pelo painel/admin.
-- NÃO APLICAR sem PR + revisão + ordem expressa do Igor (mexe em dado de produção: backfill no fim).
begin;

-- ─── 1. Origens novas ─────────────────────────────────────────────────────────────────────────
alter table public.email_supressoes drop constraint if exists email_supressoes_origem_check;
alter table public.email_supressoes
  add constraint email_supressoes_origem_check
  check (origem in ('link_email', 'one_click', 'resend_webhook', 'whatsapp'));

alter table public.whatsapp_nao_contatar drop constraint if exists whatsapp_nao_contatar_origem_check;
alter table public.whatsapp_nao_contatar
  add constraint whatsapp_nao_contatar_origem_check
  check (origem in ('whatsapp', 'email', 'app', 'painel', 'admin', 'espelho_email', 'espelho_whatsapp'));

-- ─── 2. Telefones de uma conta e contas de um pedido do WhatsApp ────────────────────────────────
-- Chave de comparação do telefone: número NACIONAL (DDD + número), sem 55 nem zero à esquerda, e sem o 9 inicial do
-- celular (11 dígitos viram 10), para "11 98888-1111" e "11 8888-1111" casarem. Menos de 10 dígitos = sem chave.
-- (Comparar só os "últimos 10 dígitos" cruzaria DDDs que diferem no 1º dígito, ex. 11 e 21.)
create or replace function private.telefone_chave(p_telefone text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  d text := pg_catalog.ltrim(pg_catalog.regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '0');
begin
  if pg_catalog.length(d) in (12, 13) and pg_catalog.left(d, 2) = '55' then
    d := pg_catalog.substr(d, 3);
  end if;
  if pg_catalog.length(d) = 11 and pg_catalog.substr(d, 3, 1) = '9' then
    d := pg_catalog.left(d, 2) || pg_catalog.substr(d, 4);
  end if;
  if pg_catalog.length(d) = 10 then
    return d;
  end if;
  return null;
end;
$$;
revoke all on function private.telefone_chave(text) from public, anon, authenticated;

-- Todos os telefones do cadastro de uma conta, normalizados (55 + DDD + número): conta do Auth, metadata e empresa.
create or replace function private.telefones_da_conta(p_user_id uuid)
returns setof text
language sql
stable
security definer
set search_path to ''
as $$
  select distinct t
    from (
      select private.telefone_whatsapp_br(u.phone) as t from auth.users u where u.id = p_user_id
      union all
      select private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone') from auth.users u where u.id = p_user_id
      union all
      select private.telefone_whatsapp_br(e.dados ->> 'telefone') from public.empresa e where e.user_id = p_user_id
      union all
      select private.telefone_whatsapp_br(e.dados ->> 'whatsapp') from public.empresa e where e.user_id = p_user_id
    ) x
   where t is not null;
$$;
revoke all on function private.telefones_da_conta(uuid) from public, anon, authenticated;

create or replace function private.contas_do_nao_contatar(p_user_id uuid, p_telefone text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id
    from auth.users u
   where (p_user_id is not null and u.id = p_user_id)
      or (private.telefone_chave(p_telefone) is not null
          and u.deleted_at is null
          and exists (
            select 1 from private.telefones_da_conta(u.id) t
             where private.telefone_chave(t) = private.telefone_chave(p_telefone)
          ));
$$;
revoke all on function private.contas_do_nao_contatar(uuid, text) from public, anon, authenticated;

-- ─── 3. WhatsApp pediu para sair -> e-mail suprimido ───────────────────────────────────────────
create or replace function private.espelhar_nao_contatar_no_email()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.origem in ('espelho_email', 'espelho_whatsapp')
     or new.motivo not in ('pediu_sair', 'reclamou')
     or (new.user_id is null and new.telefone is null)
  then
    return new;
  end if;

  insert into public.email_supressoes (user_id, motivo, origem)
  select c.user_id, 'descadastro', 'whatsapp'
    from private.contas_do_nao_contatar(new.user_id, new.telefone) c
  on conflict (user_id, motivo) do nothing;

  -- Pedido só de telefone: grava também a linha da CONTA (user_id) no opt-out do WhatsApp. Quem consulta por conta
  -- passa a enxergar o pedido. Um `numero_invalido` anterior da conta é substituído pelo pedido de parar.
  if new.user_id is null then
    insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
    select c.user_id, new.motivo, 'espelho_whatsapp'
      from private.contas_do_nao_contatar(null, new.telefone) c
    on conflict (user_id) where user_id is not null
    do update set motivo = excluded.motivo, origem = excluded.origem
       where public.whatsapp_nao_contatar.motivo = 'numero_invalido';
  end if;

  -- Igual a registrar_supressao_email: descadastro cancela os lembretes que ainda não saíram.
  update public.email_outbox o
     set status = 'dead_letter',
         error_code = 'suprimido_antes_do_envio',
         next_attempt_at = null,
         updated_at = pg_catalog.now()
   where o.user_id in (select c.user_id from private.contas_do_nao_contatar(new.user_id, new.telefone) c)
     and o.status in ('pending', 'failed')
     and o.template <> 'boas_vindas';
  return new;
end;
$$;
revoke all on function private.espelhar_nao_contatar_no_email() from public, anon, authenticated;

drop trigger if exists whatsapp_nao_contatar_espelha_email on public.whatsapp_nao_contatar;
create trigger whatsapp_nao_contatar_espelha_email
  after insert on public.whatsapp_nao_contatar
  for each row execute function private.espelhar_nao_contatar_no_email();

-- ─── 4. E-mail descadastrou / reclamou -> WhatsApp suprimido (conta E telefone da conta) ─────────
create or replace function private.espelhar_supressao_email_no_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_motivo text;
  v_tel    text;
begin
  if new.origem = 'whatsapp' or new.motivo not in ('descadastro', 'complaint') then
    return new;
  end if;
  v_motivo := case new.motivo when 'complaint' then 'reclamou' else 'pediu_sair' end;

  -- Linha da conta. `numero_invalido` anterior não pode esconder o pedido de parar: é substituído.
  insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
  values (new.user_id, v_motivo, 'espelho_email')
  on conflict (user_id) where user_id is not null
  do update set motivo = excluded.motivo, origem = excluded.origem
     where public.whatsapp_nao_contatar.motivo = 'numero_invalido';

  -- Linha de CADA telefone do cadastro da conta (quem consulta só pelo número também enxerga o pedido).
  for v_tel in select t from private.telefones_da_conta(new.user_id) t loop
    insert into public.whatsapp_nao_contatar (telefone, motivo, origem)
    values (v_tel, v_motivo, 'espelho_email')
    on conflict (telefone) where telefone is not null
    do update set motivo = excluded.motivo, origem = excluded.origem
       where public.whatsapp_nao_contatar.motivo = 'numero_invalido';
  end loop;
  return new;
end;
$$;
revoke all on function private.espelhar_supressao_email_no_whatsapp() from public, anon, authenticated;

drop trigger if exists email_supressoes_espelha_whatsapp on public.email_supressoes;
create trigger email_supressoes_espelha_whatsapp
  after insert on public.email_supressoes
  for each row execute function private.espelhar_supressao_email_no_whatsapp();

-- ─── 5. Backfill: o que já foi pedido até hoje vale nos dois canais ────────────────────────────
-- (o gatilho só pega daqui para frente). Idempotente.
-- 5a. WhatsApp -> e-mail, por conta E por telefone (as linhas antigas dos 3 caminhos reais são só telefone).
insert into public.email_supressoes (user_id, motivo, origem)
select distinct c.user_id, 'descadastro', 'whatsapp'
  from public.whatsapp_nao_contatar n
  cross join lateral private.contas_do_nao_contatar(n.user_id, n.telefone) c
 where n.origem not in ('espelho_email', 'espelho_whatsapp')
   and n.motivo in ('pediu_sair', 'reclamou')
on conflict (user_id, motivo) do nothing;

-- 5a'. Pedido só de telefone: grava também a linha da conta no opt-out do WhatsApp.
insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
select distinct on (c.user_id) c.user_id, n.motivo, 'espelho_whatsapp'
  from public.whatsapp_nao_contatar n
  cross join lateral private.contas_do_nao_contatar(null, n.telefone) c
 where n.user_id is null
   and n.origem not in ('espelho_email', 'espelho_whatsapp')
   and n.motivo in ('pediu_sair', 'reclamou')
 order by c.user_id, n.motivo desc
on conflict (user_id) where user_id is not null
do update set motivo = excluded.motivo, origem = excluded.origem
   where public.whatsapp_nao_contatar.motivo = 'numero_invalido';

-- 5b. E-mail -> WhatsApp: linha da conta e linha do telefone da conta.
insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
select s.user_id, case s.motivo when 'complaint' then 'reclamou' else 'pediu_sair' end, 'espelho_email'
  from public.email_supressoes s
 where s.origem <> 'whatsapp'
   and s.motivo in ('descadastro', 'complaint')
on conflict (user_id) where user_id is not null
do update set motivo = excluded.motivo, origem = excluded.origem
   where public.whatsapp_nao_contatar.motivo = 'numero_invalido';

insert into public.whatsapp_nao_contatar (telefone, motivo, origem)
select t.tel, t.motivo, 'espelho_email'
  from (
    select distinct on (p.tel) p.tel, p.motivo
      from (
        select tt as tel, case s.motivo when 'complaint' then 'reclamou' else 'pediu_sair' end as motivo, s.motivo as m
          from public.email_supressoes s
          cross join lateral private.telefones_da_conta(s.user_id) tt
         where s.origem <> 'whatsapp'
           and s.motivo in ('descadastro', 'complaint')
      ) p
     order by p.tel, p.m asc -- 'complaint' (reclamou) ganha de 'descadastro'
  ) t
on conflict (telefone) where telefone is not null
do update set motivo = excluded.motivo, origem = excluded.origem
   where public.whatsapp_nao_contatar.motivo = 'numero_invalido';

-- 5c. O que já estava na fila de e-mail dessas contas e ainda não saiu também é cancelado (o gatilho acima
-- cancela só os pedidos novos). Boas-vindas não conta como lembrete, igual a registrar_supressao_email.
update public.email_outbox o
   set status = 'dead_letter',
       error_code = 'suprimido_antes_do_envio',
       next_attempt_at = null,
       updated_at = pg_catalog.now()
 where o.status in ('pending', 'failed')
   and o.template <> 'boas_vindas'
   and exists (
     select 1 from public.email_supressoes s
      where s.user_id = o.user_id and s.origem = 'whatsapp'
   );

commit;
