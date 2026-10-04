-- Amplia a lista fechada de `motivo` do funil de login social (auth_funil_eventos).
--
-- Por quê (03/10/2026): 3 `cancelado` no Android, um a 0,16 s de `oauth_iniciado`.
-- Causa: o expo-web-browser (Android) resolve `dismiss` em qualquer AppState 'active',
-- inclusive um espúrio logo após abrir a Custom Tab; o app classificava isso como
-- "cancelado". Agora a falha de abertura e o dismiss sem retorno têm motivo próprio,
-- e `cancelado` fica só para quem de fato fechou a aba.
--
--   navegador_falhou: o navegador/Custom Tab nem abriu (sem navegador, aba já aberta, erro nativo)
--   sem_retorno:      a aba resolveu cedo e nenhum deep link chegou no tempo de espera
--
-- Aditiva e segura: só relaxa o CHECK. Clientes antigos continuam válidos.
-- Clientes novos ANTES desta migration: o INSERT com motivo novo falha no CHECK e o
-- registrador do funil é fire-and-forget (nunca bloqueia a UX) — só perde o evento.

alter table public.auth_funil_eventos
  drop constraint if exists auth_funil_eventos_motivo_check;

alter table public.auth_funil_eventos
  add constraint auth_funil_eventos_motivo_check
  check (motivo is null or motivo in (
    'cancelado', 'provedor', 'codigo_expirado', 'navegador_trocado',
    'sem_codigo', 'sem_sessao', 'rede', 'navegador_falhou', 'sem_retorno', 'desconhecido'
  ));
