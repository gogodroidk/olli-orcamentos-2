-- Z-99. As contas criadas no teste de assinatura (24/10) usam o e-mail do dono com
-- um sufixo. A semente de 07/10 só marca o e-mail exato, então o +z99 entra no
-- placar como se fosse cliente. Marca as duas. Não apaga orçamento nem cobrança.
-- O CTO aplica na janela. Idempotente.

insert into public.funil_exclusoes (user_id, motivo)
select u.id, 'qa z99 (conta de teste)'
  from auth.users u
 where lower(u.email) in (
        'gogodroidk+z99chromium@gmail.com',
        'gogodroidk+z99webkit@gmail.com'
      )
   and not exists (
        select 1 from public.funil_exclusoes f where f.user_id = u.id
      )
on conflict do nothing;

insert into public.funil_exclusoes (email, motivo)
select e, 'qa z99 (conta de teste)'
  from (
        values
          ('gogodroidk+z99chromium@gmail.com'),
          ('gogodroidk+z99webkit@gmail.com')
      ) as v(e)
 where not exists (
        select 1 from public.funil_exclusoes f where lower(f.email) = v.e
      )
on conflict do nothing;
