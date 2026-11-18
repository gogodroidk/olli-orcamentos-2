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
--   whatsapp_nao_contatar (user_id; pediu_sair | reclamou | decisao_interna)
--        -> email_supressoes (descadastro, origem 'whatsapp') + cancela o que está na fila de e-mail
--   email_supressoes (descadastro | complaint, origem diferente de 'whatsapp')
--        -> whatsapp_nao_contatar (pediu_sair | reclamou, origem 'email')
--
-- Não espelha `numero_invalido` (o número está errado, a pessoa não pediu nada) nem `hard_bounce`
-- (o endereço não existe, a pessoa não pediu nada). Só espelha quando há conta (user_id): opt-out só por
-- telefone não tem e-mail para suprimir.
-- Sem laço: cada gatilho ignora a linha que o outro acabou de espelhar (origem) e usa ON CONFLICT DO NOTHING.
-- Voltar: `definir_contato_whatsapp(true)` remove só o pedido do WhatsApp; a supressão de e-mail espelhada
-- fica (a pessoa volta ao e-mail pelo mesmo caminho de antes, não por efeito colateral).
-- NÃO APLICAR sem PR + revisão + ordem expressa do Igor (mexe em dado de produção: backfill no fim).
begin;

-- ─── 1. A supressão de e-mail passa a aceitar a origem 'whatsapp' ──────────────────────────────
alter table public.email_supressoes drop constraint if exists email_supressoes_origem_check;
alter table public.email_supressoes
  add constraint email_supressoes_origem_check
  check (origem in ('link_email', 'one_click', 'resend_webhook', 'whatsapp'));

-- ─── 2. WhatsApp pediu para sair -> e-mail suprimido ───────────────────────────────────────────
create or replace function private.espelhar_nao_contatar_no_email()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.user_id is null
     or new.origem = 'email'
     or new.motivo not in ('pediu_sair', 'reclamou', 'decisao_interna')
  then
    return new;
  end if;
  if not exists (select 1 from auth.users u where u.id = new.user_id) then
    return new;
  end if;

  insert into public.email_supressoes (user_id, motivo, origem)
  values (new.user_id, 'descadastro', 'whatsapp')
  on conflict (user_id, motivo) do nothing;

  -- Igual a registrar_supressao_email: descadastro cancela os lembretes que ainda não saíram.
  update public.email_outbox o
     set status = 'dead_letter',
         error_code = 'suprimido_antes_do_envio',
         next_attempt_at = null,
         updated_at = pg_catalog.now()
   where o.user_id = new.user_id
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

-- ─── 3. E-mail descadastrou / reclamou -> WhatsApp suprimido ───────────────────────────────────
create or replace function private.espelhar_supressao_email_no_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.origem = 'whatsapp' or new.motivo not in ('descadastro', 'complaint') then
    return new;
  end if;
  insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
  values (new.user_id, case new.motivo when 'complaint' then 'reclamou' else 'pediu_sair' end, 'email')
  on conflict (user_id) where user_id is not null do nothing;
  return new;
end;
$$;
revoke all on function private.espelhar_supressao_email_no_whatsapp() from public, anon, authenticated;

drop trigger if exists email_supressoes_espelha_whatsapp on public.email_supressoes;
create trigger email_supressoes_espelha_whatsapp
  after insert on public.email_supressoes
  for each row execute function private.espelhar_supressao_email_no_whatsapp();

-- ─── 4. Backfill: o que já foi pedido até hoje vale nos dois canais ────────────────────────────
-- (o gatilho só pega daqui para frente). Idempotente.
insert into public.email_supressoes (user_id, motivo, origem)
select n.user_id, 'descadastro', 'whatsapp'
from public.whatsapp_nao_contatar n
where n.user_id is not null
  and n.origem <> 'email'
  and n.motivo in ('pediu_sair', 'reclamou', 'decisao_interna')
  and exists (select 1 from auth.users u where u.id = n.user_id)
on conflict (user_id, motivo) do nothing;

insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
select s.user_id, case s.motivo when 'complaint' then 'reclamou' else 'pediu_sair' end, 'email'
from public.email_supressoes s
where s.origem <> 'whatsapp'
  and s.motivo in ('descadastro', 'complaint')
on conflict (user_id) where user_id is not null do nothing;

-- O que já estava na fila de e-mail dessas contas e ainda não saiu também é cancelado (o gatilho acima
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
