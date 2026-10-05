-- Funil do PRE-CADASTRO por e-mail (painel web), SEM PII. NAO aplicada.
--
-- Por que (T-010, P0): 159 cliques de anuncio Meta desde 03/10 e 0 POST /auth/v1/signup.
-- Nao sabemos se a pessoa chega ao formulario e desiste ou nem chega. Esta migration
-- estende auth_funil_eventos (mesma tabela do OAuth) com:
--   cadastro_visto     tela de cadastro renderizou
--   cadastro_iniciado  1o foco em qualquer campo do formulario
--   cadastro_enviado   submit passou na validacao do cliente
--   cadastro_erro      validacao local falhou OU signUp devolveu erro (motivo fechado)
--   cadastro_ok        signUp ok (conta nova)
-- `provedor` aceita 'email'. Motivos novos: validacao, email_existente, senha_fraca,
-- rate_limit. Preserva os atuais e inclui navegador_falhou/sem_retorno (migration
-- 20261004130000 da branch claude/oauth-cancelado-android) para nao conflitar.
--
-- Aditiva: so relaxa CHECKs. Clientes sao fire-and-forget; antes desta migration o
-- INSERT novo falha no CHECK e so perde o evento (a UX nunca e afetada).

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

-- So os dois eventos de erro carregam motivo; os demais nunca.
alter table public.auth_funil_eventos drop constraint if exists auth_funil_eventos_motivo_so_em_erro;
alter table public.auth_funil_eventos add constraint auth_funil_eventos_motivo_so_em_erro
  check ((evento in ('oauth_erro', 'cadastro_erro')) = (motivo is not null));

-- Funil por dia (service_role):
--   select (criado_em at time zone 'America/Sao_Paulo')::date as dia,
--          count(distinct tentativa) filter (where evento = 'cadastro_visto')    as viram,
--          count(distinct tentativa) filter (where evento = 'cadastro_iniciado') as comecaram,
--          count(distinct tentativa) filter (where evento = 'cadastro_enviado')  as enviaram,
--          count(distinct tentativa) filter (where evento = 'cadastro_ok')       as cadastraram,
--          count(distinct tentativa) filter (where evento = 'cadastro_erro')     as com_erro,
--          count(distinct tentativa) filter (where evento = 'oauth_iniciado')    as clicaram_oauth
--     from public.auth_funil_eventos
--    where criado_em > now() - interval '14 days'
--    group by 1 order by 1 desc;
-- Motivos de erro: group by evento, motivo onde evento = 'cadastro_erro'.
