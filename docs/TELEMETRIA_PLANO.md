# Telemetria completa + comunidade — PLANO (Rafael, CTO · 22/10/2026)
Só plano. Nada implementado, nada publicado, nenhum gasto. [F] = conferido hoje; [H] = hipótese minha.

## 0. Resumo em 6 linhas
1. Já existe 70% da base: tabela local `eventos` no SQLite do app, 66 chamadas `track()` no app (0 no painel web), filtro de dados sensíveis `analyticsScrub.ts`, adaptador PostHog desligado (sem chave) e `user_activity_log` no servidor (12 eventos fixos). [F, lido no código]
2. Falta: tabela de jornada no servidor, envio em lote offline-first, instrumentação do painel e a camada de transparência/consentimento.
3. Recomendo tabela própria no Supabase (R$ 0 extra). PostHog autoalojado pede 4 vCPU/16 GB, não cabe no PC do Igor. PostHog Cloud grátis (1 milhão de eventos/mês) fica como opção.
4. **Risco real é o disco do Supabase:** o banco está em 47 MB, o plano grátis para o projeto em modo leitura aos 500 MB. Sem teto e sem agregação, 1.000 usuários estouram isso em dias. [F + conta em §5]
5. LGPD: a política de privacidade hoje diz que o uso do app é "analytics local no aparelho". Mandar a jornada ao servidor exige atualizar a política ANTES. A comunidade (WhatsApp, Telegram, redes) exige consentimento próprio, separado. Dr. Paulo revisa.
6. Não gravar: texto digitado, nome/telefone/CPF/endereço de cliente, valores e conteúdo de orçamento, IP, senha, replay de tela.

## 1. O que já existe (reaproveitar)
| Peça | Estado hoje | Uso no plano |
|---|---|---|
| SQLite `eventos` (id, evento, props, criado_em) + `track()` | ativo no app, 66 chamadas | vira a fila offline; ganha colunas de sessão/tela/envio |
| `analyticsScrub.ts` (allowlist por forma: só número, booleano e slug curto; chaves como nome/cpf/email/obs barradas) | ativo | mesma faxina antes de qualquer envio ao servidor |
| `analyticsRemoto.ts` (PostHog por fetch, sem SDK, pseudônimo do usuário) | desligado, sem `EXPO_PUBLIC_POSTHOG_KEY` | destino opcional (§6, opção B) |
| `user_activity_log` + RPC `registrar_atividade_usuario` | 621 linhas, 44 usuários, 224 kB [F, consulta de hoje] | continua como "pulso" barato; não serve para jornada (lista fechada de 12 eventos) |
| `auth_funil_eventos` (anônimo, pré-login, sem dado pessoal) | 187 linhas | manter como está; cobre só o login Google/Apple |
| Sentry (app, painel, worker; `sendDefaultPii:false`) | ativo, plano grátis 5 mil eventos/mês | só erros e desempenho. Não usar para jornada |
| Meta Pixel + tag Google Ads | só no site e nas telas de entrada do painel, só com "Aceitar" no aviso de cookies | não existe GA4 hoje [F]. O app NÃO usa Pixel nem tag Google e a política diz isso; **não colocar no app** |

## 2. Esquema do evento
Campos (um evento = uma linha):
| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid gerado no aparelho | idempotência: reenviar não duplica (`on conflict do nothing`) |
| `nome` | text, slug do catálogo | vem de `eventos_catalogo`; nome fora do catálogo é recusado |
| `tela` | text slug (`orcamento_novo`, `clientes`) | nome da rota, nunca título com dado |
| `componente` | text slug (`botao_enviar_whatsapp`) | id fixo no código, nunca o texto do botão |
| `usuario_id` | uuid | **o servidor força `auth.uid()`**; o cliente não escolhe |
| `organizacao_id` | uuid null | para equipe; vem do servidor |
| `sessao` | uuid | novo a cada abertura do app ou após 30 min parado |
| `seq` | int | ordem dentro da sessão (reconstrói o passo a passo mesmo com relógio errado) |
| `ts_cliente` | timestamptz | relógio do aparelho |
| `ts_servidor` | timestamptz default now() | verdade para ordenação entre aparelhos |
| `plataforma`, `app_versao` | text | web, android, ios, desktop |
| `props` | jsonb | passa por `analyticsScrub`; máx. 10 chaves, 256 bytes |

Tipos de evento: `tela_vista`, `acao` (clique com `componente`), `erro_mostrado`, `gate_visto`, `sessao_iniciada`, `sessao_encerrada`. Autocapture **não**: o autocapture do PostHog captura tela e texto, exatamente o que a regra de dados sensíveis proíbe (já documentado em `analyticsRemoto.ts`).

## 3. Tabela no Supabase (rascunho)
```sql
create table public.eventos_uso (
  id uuid primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  organizacao_id uuid,
  sessao uuid not null,
  seq int not null,
  nome text not null,
  tela text, componente text,
  plataforma text not null, app_versao text,
  ts_cliente timestamptz not null,
  ts_servidor timestamptz not null default now(),
  props jsonb not null default '{}'
);
create index on public.eventos_uso (usuario_id, ts_servidor);
alter table public.eventos_uso enable row level security;
alter table public.eventos_uso force row level security;
revoke all on public.eventos_uso from anon, authenticated;
-- escrita só pela RPC abaixo (security invoker + auth.uid()); leitura só service_role (painel admin)
```
RPC `registrar_eventos_uso(p_eventos jsonb)`: exige login, aceita no máximo 100 eventos por chamada, descarta nome fora do catálogo, grava `usuario_id = auth.uid()`, respeita o opt-out (§7). `on delete cascade` faz a exclusão de conta apagar a jornada. Leitura do próprio usuário: não precisa (RLS sem policy de select = ninguém lê pelo cliente).
Retenção: bruto 30 a 90 dias; depois vira resumo diário por usuário e tela (sem sequência) e o bruto é apagado, no mesmo molde do `limparEventosAntigos` do worker (cron diário). A política atual já fala em 180 dias para o termômetro; alinhar.

## 4. Envio em lote offline-first
**App (React Native + SQLite):** `track()` continua gravando local (síncrono, nunca lança). Novo `flushEventos()` pega até 100 linhas sem `enviado_em`, chama a RPC, marca enviado só se a resposta foi 2xx; falha = tenta de novo depois com espera crescente (30 s, 2 min, 10 min, teto 1 h). Dispara ao voltar para primeiro plano, a cada 60 s com app aberto e ao atingir 50 pendentes. Sem rede: acumula, com teto de 5.000 linhas locais (o mais antigo sai primeiro) para não encher o aparelho. Linha enviada é apagada em 7 dias.
**Painel (web):** fila em memória + `localStorage` (try/catch), envio por `fetch` com `keepalive` em `visibilitychange` e a cada 30 s; mesma RPC. Instrumentação: um hook `useTela()` no roteador e um wrapper `Rastreado` com `componente` fixo. O painel hoje tem 0 chamadas, então é a maior parte do trabalho.
**Estados:** 3 estados em todo gate: opt-in carregando, erro de leitura (trata como "não sei" e NÃO envia), valor. Envio nunca bloqueia a tela e falha é silenciosa para o usuário mas contada (contador de descartes visível no admin).

## 5. Custo de disco e de capacidade (conta com número real)
- Banco hoje: **47 MB**. `user_activity_log`: 621 linhas = 224 kB, ou cerca de 360 bytes por linha com índice. [F]
- Plano grátis do Supabase: 500 MB de banco; ao passar, o projeto entra em modo leitura. Pro: US$ 25/mês, 8 GB de disco incluídos. [F: supabase.com/docs, resumo de busca]
- Hipótese de uso: 150 eventos por usuário por dia [H, medir no piloto]. Então 1 usuário gera ~4.500 linhas/mês ≈ 1,6 MB.
  - 100 usuários: ~160 MB/mês. 1.000 usuários: ~1,6 GB/mês, ou seja, passa de 500 MB em **cerca de 9 dias**.
- Mitigações obrigatórias: teto de 200 eventos por usuário por dia no servidor e retenção bruta de 30 dias. Mesmo assim, 30 dias de bruto com 1.000 usuários são ~1,6 GB, **não cabem nos 500 MB**. Saídas: (a) amostragem (100% das ações-chave, 10% de `tela_vista`), (b) levar o bruto para fora do Postgres (arquivo em disco ou R2; não verifiquei se o R2 grátis cobre), ou (c) assumir o plano Pro. **Decisão do Igor quando passar de ~150 usuários ativos**; abaixo disso (hoje são 44 com atividade) cabe com folga.
- Monitorar: alarme quando `pg_database_size` passar de 350 MB (o worker já tem rotina de alarmes).

## 6. Opções de ferramenta (grátis / código aberto) e RAM
| Opção | Custo | RAM / infra | Observação |
|---|---|---|---|
| **A. Tabela própria no Supabase (recomendada agora)** | R$ 0 | zero servidor novo | consulta por SQL e tela admin; limite é o disco (§5) |
| B. PostHog Cloud grátis | R$ 0 até 1 milhão de eventos/mês e 5 mil gravações [F: posthog.com/pricing, resumo]; acima disso cobra por evento | zero | adaptador já pronto; **dados vão para os EUA por padrão** (`us.i.posthog.com`): art. 33 da LGPD, precisa de cláusulas; usar host da UE se existir (não verifiquei) |
| C. PostHog autoalojado (MIT) | R$ 0 de licença | doc oficial: referência de **4 vCPU, 16 GB RAM, +30 GB de disco**; "oficialmente sem suporte"; recomenda Cloud acima de ~1 milhão de eventos/mês [F: posthog.com/docs/self-host] | não cabe no PC do Igor (16 GB total compartilhados); numa VM é ~€ 70/mês no Hetzner CPX42 [F: hetzner.com/cloud] — **não recomendo** |
| D. Umami (autoalojado) | R$ 0 | exige Postgres 12.14+ e Node 18.18+; **RAM não declarada na doc, não vou chutar** [F: docs.umami.is/docs/install] | feito para visitas de site; não conferi suporte a propriedades de eventos e licença, **não verificado** |
| Plausible / Matomo / OpenReplay | — | **não pesquisei** | fora deste plano; se o Igor quiser, pesquisar |

## 7. Transparência e base legal (a linha vermelha é a lei)
- **Hoje a política diz** (src/content/legal/privacidade.ts, linha 176): "Uso do app (analytics local no aparelho) — legítimo interesse (art. 7º, IX)". Enviar a jornada para o servidor muda isso. **Antes do primeiro envio:** atualizar a política (o que se coleta: telas, ações, sessão, versão; o que NÃO: conteúdo, dados de clientes), registrar a data e a versão, e avisar dentro do app. Transparência é princípio do art. 6º (VI). [Dr. Paulo confirma a redação]
- Base para a jornada de uso do produto: legítimo interesse (art. 7º, IX) com teste de proporcionalidade (LIA) escrito, dado mínimo e **opt-out claro** em Conta ("Ajudar a melhorar o OLLI com dados de uso", ligado por padrão, desligável com um toque). Opt-out valendo = a RPC descarta. [H sobre ser suficiente: o Dr. Paulo decide se exige consentimento]
- Base para a **comunidade** (convite a WhatsApp, Telegram, seguir Instagram/Facebook, coletar feedback) e para mensagens ativas: **consentimento** (art. 7º, I), tela separada, opt-in não pré-marcado, nunca condiciona o uso do app. Tabela `consentimentos` (usuario_id, finalidade, versao_do_texto, concedido_em, revogado_em). Revogar = parar na hora.
- Controladora do dado de uso do OLLI é a OLLI. O dado dos clientes finais dos prestadores (nomes, telefones, orçamentos) **nunca entra** na telemetria: o prestador é o controlador dele.
- Direitos do titular: exclusão de conta já existe (`/conta/excluir`) e a cascata apaga `eventos_uso`; exportação pode sair do mesmo SQL.
- Sem replay de tela, sem captura de teclado, sem fingerprint, sem localização exata.
- Mensagem ativa por WhatsApp a quem não pediu continua sob a regra do projeto (primeiro contato humano) e sob o consentimento acima.

## 8. Do dado à comunidade (o que o Igor quer)
1. **Entender onde focar:** funil por tela (visitou, agiu, concluiu), tempo até o 1º orçamento enviado, onde sai. Consulta SQL semanal e uma tela no admin.
2. **Recomendar ferramenta certa:** regras simples e explicáveis no servidor, sem IA no começo. Exemplo: "criou 3+ orçamentos e nunca abriu Contrato → sugerir Contrato"; "usa voz mas não usa catálogo → sugerir catálogo". Resultado aparece como cartão no Início, com "não quero ver isso".
3. **Comunidade:** depois de uma ação de sucesso (orçamento aprovado, 1º Pix), um convite opcional: grupo de WhatsApp/Telegram, seguir Instagram/Facebook, pesquisa curta. Resposta e aceite gravados em `consentimentos`. O "Pulso da semana" que já existe (`pulso_mostrado`, `pulso_respondido`) vira o canal de feedback.
4. **Medição honesta:** cada recomendação grava `reco_mostrada`, `reco_aceita`, `reco_dispensada` para saber se ajudou ou virou ruído.

## 9. Ordem de implementação (sem deploy agora)
1. Migration `eventos_uso`, `eventos_catalogo`, `consentimentos` + RPC + teste de RLS (usuário A não lê nem escreve como B).
2. Catálogo de eventos e ids de componente (documento único; o revisor barra evento fora dele).
3. App: colunas novas no SQLite (v15), `flushEventos`, opt-out em Conta, `useTela` nas rotas principais.
4. Painel: fila, hook de rota e wrapper `Rastreado` nas telas de orçamento, clientes e recibos.
5. Política de privacidade + aviso no app (**bloqueia o item 6**).
6. Ligar o envio (feature flag), com o contador de descartes e o alarme de tamanho do banco.
7. Tela admin de funil e regras de recomendação; depois a comunidade.
Cada passo: branch, `ci-local` verde, revisão independente, migration aplicada antes do app.

## 10. Decisões do Igor / pendências
- Aprovar a política nova e o opt-out por padrão ligado (com o Dr. Paulo).
- Aceitar o limite de disco: tabela própria agora; Pro (US$ 25/mês) ou amostragem quando passar de ~150 usuários ativos.
- Autorizar (ou não) PostHog Cloud como segunda ponta, sabendo que os dados vão ao exterior.
- Dr. Paulo: LIA do legítimo interesse, redação do aviso, base da comunidade e prazo de retenção.
