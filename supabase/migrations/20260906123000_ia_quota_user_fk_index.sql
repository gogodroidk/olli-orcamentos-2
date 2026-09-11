-- Índice reverso da FK para auth.users.
--
-- A PK de `ia_cota_usuario_diaria` começa por (dia, familia), por isso ela não
-- cobre o caminho que o Postgres usa ao excluir um usuário e validar a FK
-- `user_id`. O índice é aditivo, idempotente e não altera RLS, grants ou dados.
-- A migration fica separada para poder ser aplicada/medida em staging sem
-- reexecutar a definição da cota diária.

create index if not exists ia_cota_usuario_diaria_user_idx
  on public.ia_cota_usuario_diaria (user_id);
