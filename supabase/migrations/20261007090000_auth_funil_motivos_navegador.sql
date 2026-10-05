-- Amplia a lista fechada de `motivo` do funil de auth (auth_funil_eventos).
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
-- Aditiva e segura: só relaxa CHECKs. Clientes antigos continuam válidos.
-- SUPERCONJUNTO de propósito: recria os mesmos CHECKs de evento/provedor/motivo e a
-- motivo_so_em_erro da 20261004140000_funil_pre_cadastro.sql (PR #149: cadastro por
-- e-mail; motivos validacao/email_existente/senha_fraca/rate_limit). As duas migrations
-- podem ser aplicadas em QUALQUER ordem sem apagar nada uma da outra.
-- Clientes novos ANTES desta migration: o INSERT com motivo novo falha no CHECK e o
-- registrador do funil é fire-and-forget (nunca bloqueia a UX) — só perde o evento.

alter table public.auth_funil_eventos drop constraint if exists auth_funil_eventos_evento_check;
alter table public.auth_funil_eventos add constraint auth_funil_eventos_evento_check
  check (evento in (
    'oauth_iniciado', 'oauth_sessao_criada', 'oauth_erro',
    'cadastro_visto', 'cadastro_iniciado', 'cadastro_enviado', 'cadastro_erro', 'cadastro_ok'
  ));

alter table public.auth_funil_eventos drop constraint if exists auth_funil_eventos_provedor_check;
alter table public.auth_funil_eventos add constraint auth_funil_eventos_provedor_check
  check (provedor in ('google', 'apple', 'email'));

alter table public.auth_funil_eventos drop constraint if exists auth_funil_eventos_motivo_check;
alter table public.auth_funil_eventos add constraint auth_funil_eventos_motivo_check
  check (motivo is null or motivo in (
    'cancelado', 'provedor', 'codigo_expirado', 'navegador_trocado',
    'sem_codigo', 'sem_sessao', 'rede', 'navegador_falhou', 'sem_retorno', 'desconhecido',
    'validacao', 'email_existente', 'senha_fraca', 'rate_limit'
  ));

-- Só os dois eventos de erro carregam motivo; os demais nunca.
alter table public.auth_funil_eventos drop constraint if exists auth_funil_eventos_motivo_so_em_erro;
alter table public.auth_funil_eventos add constraint auth_funil_eventos_motivo_so_em_erro
  check ((evento in ('oauth_erro', 'cadastro_erro')) = (motivo is not null));
