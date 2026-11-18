-- ROLLBACK MANUAL. Desmarca as 2 contas QA z99 do placar interno (voltam a contar como cliente no funil).
begin;
delete from public.funil_exclusoes
 where motivo = 'qa z99 (conta de teste)'
   and (lower(email) in ('gogodroidk+z99chromium@gmail.com','gogodroidk+z99webkit@gmail.com')
        or user_id in (select id from auth.users where lower(email) in ('gogodroidk+z99chromium@gmail.com','gogodroidk+z99webkit@gmail.com')));
commit;
