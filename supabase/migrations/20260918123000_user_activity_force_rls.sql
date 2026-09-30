-- A telemetria não deve depender do papel do owner da tabela para ficar fechada.
alter table public.user_activity_log force row level security;
