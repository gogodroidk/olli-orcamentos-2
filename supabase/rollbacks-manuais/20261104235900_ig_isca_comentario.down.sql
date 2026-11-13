-- ROLLBACK MANUAL. Tabelas só têm hashes; sem uso em main (rota do worker desligada).
begin;
drop table if exists public.ig_isca_evento;
drop table if exists public.ig_isca_optout;
commit;
