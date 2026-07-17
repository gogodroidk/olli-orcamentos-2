# LEDGER DO PILOTO — APPEND-ONLY

> **Nunca** edite nem apague uma linha existente. Só acrescente no fim.
> `INICIO` sem `FIM` = a sessão morreu no meio; o piloto retoma esse item conferindo o `git log` antes de refazer.
> Formato: `| quando (ISO) | item | evento | detalhe |`
>
> Eventos: `INICIO` · `FIM DONE` · `FIM BLOQUEADO-HUMANO` · `FIM BLOQUEADO-TECNICO` · `FIM TRAVADO` · `RESUMO FINAL`

| quando | item | evento | detalhe |
|---|---|---|---|
| 2026-07-16T00:00:00Z | O0-4 | INICIO | iteracao 1 |
| 2026-07-16T18:19:34Z | O0-4 | FIM DONE | 9d8e849 — 3 estados (desconhecido/pessoal/membro) em src/services/contextoEquipe.ts; cloudSync usa carregarMinhaOrganizacao (3 estados) e faz fail-closed no tenant desconhecido; reset no logout. PROVA: `npm run test:contexto-equipe` 13 ok/0 falhas exit 0, e com a mutacao do bug original (erro->pessoal) o teste FALHA exit 1 (tem dentes); `npm run typecheck` exit 0. Bonus: tsconfig sem `exclude` varria webapp/ (projeto separado) = 854 erros pre-existentes; gate consertado. Follow-up #29: mesma borda em clienteLink/localizacaoEquipe (fora de escopo: sem retry). |
| 2026-07-16T18:19:43Z | O0-5 | INICIO | iteracao 1 |
| 2026-07-16T18:21:54Z | O0-5 | FIM DONE | a18e641 — nota "FONTE UNICA DE ESTADO" nos DOIS arquivos com referencia cruzada verificada (links resolvem). Fatos verificados no mundo, nao copiados da sintese: C:\ollx\h sem .git e src/ so com types/ (mobile ausente -> o 4,6/10 auditou a embalagem); olli-program com 82 not_started e ZERO em outro status (template jamais aplicado). Marcador 00_NAO_E_ESTADO_LEIA_ISTO.md criado na raiz do bundle e em olli-program. |
| 2026-07-16T18:22:07Z | O0-6 | INICIO | iteracao 1 |
| 2026-07-16T18:27:16Z | O0-6 | FIM BLOQUEADO-HUMANO | cc795f9 — CONTRADICAO RECONCILIADA: "falta CRUD" e FALSO, o CRUD esta EM PRODUCAO. Provas: 7 Form*.tsx + ConvidarDialog, todos importados pela pagina que os usa (nenhum orfao); 9 rotas em routes/sections/dashboard/frontend.tsx; `pnpm build` (= tsc && vite build) exit 0 com chunk lazy proprio do FormOrcamento; em app.olliorcamentos.online o chunk FormOrcamento-CDjBaQRp.js baixa HTTP 200 / 21.753 bytes (= tamanho do build local) com a UI real dentro; trava de tenant de 3 estados do useSalvar viva nos 89 chunks servidos (mutacoes-FhDJ1ecc.js). Docs corrigidos (WEB_ESTADO_E_PLANO §4.1 + EXECUTION_LOG). BLOQUEADO no residuo: o DoD pede "funcional na DEMO" = smoke test AUTENTICADO (abrir /orcamentos, salvar, ver a linha). Exige digitar a senha da conta demo — o piloto nao digita senha. DONO: ~2 min. Tudo que independe de sessao esta provado. |
| 2026-07-16T18:27:28Z | O0-1 | FIM BLOQUEADO-HUMANO | Item marcado [HUMANO] na FILA: provar F0a (login 3-estados) no emulador olli_phone com e sem rede exige emulador assistido. O piloto nao simula nem contorna. DONO: rodar o runbook de 5 passos do PLANO_EXECUCAO.md antes de publicar build. |
| 2026-07-16T18:27:28Z | O0-2 | INICIO | iteracao 1 |
| 2026-07-16T18:33:39Z | O0-2 | FIM BLOQUEADO-HUMANO | 6f10eee — LOGICA PRONTA E PROVADA, falta prova em aparelho. src/database/particao.ts (novo): particao por usuario com ADOCAO (1o usuario adota o olli_orcamentos.db existente = zero copia de arquivo; usuario diferente ganha arquivo novo) + donoDoBanco em 3 estados. syncOnLogin abre a particao antes de tudo e so sincroniza se o banco for provadamente do usuario. ContaScreen + ContaDesktopScreen: "sair mantendo dados" agora aborta o sync antes do signOut (so o "apagar dados" fazia). DB_PARTICOES_KEY fora de APP_DATA_STORAGE_KEYS de proposito (se sumisse, o proximo usuario adotaria o banco alheio). PROVA: npm test = 33 asserts exit 0; teste-particao encena o DoD (A -> logout -> B nao mistura, A relogando reencontra os dados); mutacao faz falhar exit 1. typecheck exit 0. BLOQUEADO: troca de arquivo do expo-sqlite nao rodou em emulador (mesma classe do O0-1). DONO: validar no olli_phone junto com o runbook do O0-1. |
| 2026-07-17T00:03:57Z | O0-3 | INICIO | iteracao 2 |
| 2026-07-17T00:07:54Z | O0-3 | FIM BLOQUEADO-HUMANO | 8737c52 — LOGICA PRONTA E PROVADA, falta prova em aparelho. Cadeia do P0 3 fechada: o restore so propaga p/ a nuvem se o usuario for DONO do tenant (restaurePodeTocarNaNuvem, reusa os 3 estados do O0-4). Bloqueadas p/ membro e p/ desconhecido: limpar tombstone local, limpar tombstone na NUVEM (era a prova da exclusao do dono) e pushAllLocal (o botao Restaurar usa pushToCloud:true e subia a linha velha por cima da atual). Restore de membro segue valendo local; o pullAll seguinte reconcilia. PROVA: npm test 37 asserts exit 0; mutacao (tecnico propaga) falha exit 1; typecheck exit 0. BLOQUEADO: fluxo backup->restore nao rodou em emulador. DONO: validar junto do runbook do O0-1. |
| 2026-07-17T00:08:03Z | O3-25 | INICIO | iteracao 2 |
| 2026-07-17T00:11:42Z | O3-25 | INICIO | iteracao 2 (verificacao em lote) |
| 2026-07-17T00:11:42Z | O3-26 | INICIO | iteracao 2 (verificacao em lote) |
| 2026-07-17T00:11:42Z | O3-27 | INICIO | iteracao 2 (verificacao em lote) |
| 2026-07-17T00:11:42Z | O3-28 | INICIO | iteracao 2 (verificacao em lote) |
| 2026-07-17T00:11:42Z | O3-29 | INICIO | iteracao 2 (verificacao em lote) |
| 2026-07-17T00:11:42Z | O3-25 | FIM DONE | f3a4464 — JA ESTAVA CORRIGIDO por e9a4efe (ponto unico sem virgula = decimal). A FILA veio do Plano-Mestre, que sintetizou auditoria ANTERIOR a esse commit (epistemologia do O0-5 batendo na propria fila). DoD pedia teste e nao havia nenhum: parser extraido p/ webapp/src/olli/numero.ts + `npm run test:numero-web` (18 asserts, exit 0), incl. o dano medido (regressao=25 vs hoje=2.5 = 10x no PDF). BONUS: o teste achou bug NOVO — textoParaNumero("") devolvia 0 (Number("")===0), nao NaN; 0 e finito e passava pelo if(isFinite) do campo de quantidade, entao LIMPAR a quantidade zerava o item (linha R$0 no PDF do cliente), calado. Corrigido. pnpm build do painel exit 0. |
| 2026-07-17T00:11:42Z | O3-26 | FIM DONE | f3a4464 — JA CORRIGIDO por e9a4efe: `ehProduto` nao existe mais em FormItemCatalogo.tsx; marca/modelo derivam de `prod?.marca ?? ""` com o tipo vindo da rota (/produtos e /servicos sao telas separadas). Nada a fazer. |
| 2026-07-17T00:11:42Z | O3-27 | FIM DONE | f3a4464 — JA CORRIGIDO por e9a4efe: desconto negativo rejeitado na DIGITACAO (FormOrcamento.tsx:873, "um % negativo AUMENTARIA o total") e no SUBMIT (:453, "O desconto nao pode ser negativo"). |
| 2026-07-17T00:11:42Z | O3-28 | FIM DONE | f3a4464 — JA CORRIGIDO por e9a4efe: a trava esta VIVA — `propostaJaEnviada(status) || aprovado || convertido` (FormOrcamento.tsx:70) + dialogo dedicado "Este orcamento ja foi enviado ao cliente" (:128). |
| 2026-07-17T00:11:42Z | O3-29 | FIM DONE | f3a4464 — JA CORRIGIDO por e9a4efe: webapp/src/olli/data.ts pagina de 1000 em 1000 (TAMANHO_PAGINA=1000, MAX_PAGINAS=100 = 100k linhas) e acende a flag `truncado` se a trava cortar. KPIs nao mentem mais acima de 1.000 registros. |
| 2026-07-17T00:11:56Z | O3-24 | INICIO | iteracao 2 |
| 2026-07-17T00:14:36Z | O3-24 | FIM DONE | 983e073 — AUDITADOS os 8 Form* + ConvidarDialog. Tenancy CORRETA: todos gravam por useSalvar (zero supabase cru nos forms; a unica escrita fora e meu-negocio/empresa, dono-only e gated); useSalvar carimba user_id=ownerUserId nas 5 tabelas do tenant e BLOQUEIA quando o papel e desconhecido (3 estados). As 3 nao-carimbadas (produtos/servicos/recibos) sao so-do-dono por design (espelha o app) e as telas barram o membro com 3 estados (FormRecibo, ListaCatalogo, meu-negocio). CORRIGIDO buraco LATENTE: o Set era silencioso sobre omissao -> virou TENANT_DA_TABELA (Record<TabelaOlli,...>), entao esquecer de classificar tabela nova NAO COMPILA. Prova: mutacao (pmoc_planos sem classificar) -> tsc exit 2 com "Property pmoc_planos is missing"; restaurado exit 0; pnpm build exit 0. |
| 2026-07-17T00:14:49Z | O3-31 | INICIO | iteracao 2 |
| 2026-07-17T00:21:15Z | O3-31 | FIM DONE | df0f39e — varridos TODOS os gates do painel (subagente sonnet + verificacao linha a linha minha; subagente nao vota). JA OK (3 estados): useSalvar, meu-negocio, FormRecibo, planos. CORRIGIDOS 2 que colapsavam carregando/erro em "sou o dono" (ListaCatalogo:175 e recibos/index:73, ambos `data?.ownerUserId != null` -> data undefined = false = LIBERA). Era benigno em dado (useSalvar+RLS barram) mas era o padrao proibido vivo na UI e dependia da 2a camada existir; e o usuario so descobria no submit (42501). Estavam assim de proposito (o `{podeEditar && }` ESCONDE, negar no loading faria piscar) -> resolvido dando UI PROPRIA ao 3o estado: botao VISIVEL e DESABILITADO com title "Verificando suas permissoes...". Nao pisca, nao permite. Editar/Excluir de recibo agora exigem papel confirmado. 2 comentarios que mentiam viraram verdade. PROVA: pnpm build exit 0; nenhum gate restante colapsa erro no permissivo. calculos.ts sem chamador -> FOLLOWUPS #30. |
| 2026-07-17T00:21:58Z | O1-12 | INICIO | iteracao 2 |
| 2026-07-17T00:25:51Z | O1-12 | FIM DONE | c8fbbe0 — GatePro aplicado nas TRES portas (a FILA citava 2): EquipeScreen (recurso=equipe), EquipeAoVivoScreen (recurso=mapa_equipe, GatePro POR FORA do GuardaPapel p/ nao dizer "sem permissao" a quem so falta assinar) e EquipeDesktopScreen — esta era PORTA DOS FUNDOS: o AppNavigator:442 registra ela direto como EquipeTab do desktop/web, sem passar pelo comCentroDesktop(EquipeScreen). Gate no componente EXPORTADO p/ o navigator herdar. GatePro ja e fail-closed no carregando e o usePlano mantem o ultimo plano bom do cache no erro (pagante nao perde a tela). Cabecalho do EquipeAoVivo que dizia "pronto para ser envolvido em GatePro por quem registrar a rota" corrigido. PROVA: typecheck exit 0, npm test 55 asserts exit 0. ATENCAO DONO: o MERGE depende da decisao F0d (grandfathering) — mergear sem ela corta quem hoje usa Equipe de graca. |
| 2026-07-17T00:26:13Z | O2-17 | INICIO | iteracao 3 |
| 2026-07-17T00:31:41Z | O2-17 | FIM BLOQUEADO-HUMANO | e423334 — CODIGO E MIGRATION PRONTOS, falta o dono aplicar. supabase/migrations/20260724_webhook_events.sql (unique (origem,event_id) + RLS sem policy = so service_role) + worker/src/webhookEvents.js + stripe.js sem o Map. CORRECAO DO DIAGNOSTICO DA FILA: "evento duplicado = efeito financeiro duplicado" NAO se sustenta hoje — assinatura e upsert por user_id, credito tem unique (origem,ref) no credit_ledger e o MP deriva vigencia da data de aprovacao. A tabela e rede p/ o PROXIMO handler + trilha. ACHADO GRAVE NO PROPRIO FIX: persistir o claim ingenuamente cria bug PIOR — 1a tentativa morre no meio, linha fica recebido, gateway reenvia, 409 viraria duplicado->200 e a assinatura PAGA nunca ligaria, calada, para sempre. Resolvido: 409 le o status, so pula processado; recebido/falhou REPROCESSAM; banco fora = 5xx p/ reenviar. PROVA: npm run test:webhook-events 11 asserts exit 0 (Supabase falso encenando 201/409/5xx); mutacao (409=sempre duplicado) falha 6 asserts exit 1; node --check OK. DONO: rodar a migration ANTES de publicar o worker — sem a tabela, reivindicarEvento devolve ok:false e o webhook responde 500. |
| 2026-07-17T00:31:47Z | O2-18 | INICIO | iteracao 3 |
| 2026-07-17T00:35:06Z | O2-18 | FIM BLOQUEADO-HUMANO | 2e9c0ec — CODIGO PRONTO, falta o dono publicar. worker/src/rateLimit.js (novo): checarLimite com 3 estados (permitido|negado|indisponivel); a ROTA decide o que fazer com indisponivel, nao o limitador. Fail-closed nas 5 rotas sensiveis (stripe, mercadopago, abacate = dinheiro; conta = exclusao irreversivel; equipe = convite da ACESSO ao tenant) — as 5 tinham copias identicas de rateOk fail-OPEN ("binding ausente: nao bloqueia" + catch return true). Nao era hipotese: um build por Git ja apagou os 5 rate limiters em producao e, com fail-open, "sem limiter" e "dentro do limite" sao indistinguiveis. + Teto de payload de 128KB no /stripe/webhook checado no Content-Length ANTES de bufferizar, reconferido em BYTES apos a leitura (Content-Length e dica, nao promessa). NAO alterado de proposito: LINK_RL inline no index.js segue fail-open — token de 192 bits nao e forcavel e e a pagina que o CLIENTE FINAL usa p/ aprovar; negar ali quebraria o negocio sem ganho. PROVA: npm run test:rate-limit 23 asserts exit 0; suite completa 89 asserts exit 0; node --check OK. DONO: fail-closed troca disponibilidade por seguranca — se um binding _RL sumir, as rotas de pagamento passam a responder 429/503 em vez de degradar caladas (desejado, mas e mudanca real de comportamento). |
| 2026-07-17T00:35:06Z | O2-19 | INICIO | iteracao 3 |
| 2026-07-17T00:36:34Z | O2-19 | FIM BLOQUEADO-HUMANO | Analise em FOLLOWUPS #31. NAO IMPLEMENTADO DE PROPOSITO — o DoD nao sobrevive ao contato com o repo: (a) `organizacao_id` NAO EXISTE nesses documentos; o multi-tenant e user_id + donos_visiveis(), logo a constraint equivalente seria (user_id, tipo, numero); (b) MAIS GRAVE: a constraint unica sozinha TROCA UM BUG POR UM PIOR — o app numera offline pelo `contadores` do SQLite; dois aparelhos offline geram 00126; no sync o unico rejeita o 2o com 409 e o pushRowUnchecked ENGOLE o erro num catch silencioso: o orcamento nunca chega na nuvem e ninguem e avisado. Isso e "documento que some" no lugar de "numero repetido" — o risco existencial do projeto. Offline e vantagem rara (2/25 no benchmark), nao se sacrifica por indice. FALTA DECISAO DE PRODUTO DO DONO (4 opcoes documentadas): (1) numero so no servidor = mata offline; (2) provisorio + renumera no sync = o numero MUDA depois de enviado ao cliente; (3) numero por origem (00126-A) = muda o formato; (4) so o caminho ONLINE via RPC = resolve a colisao dono/membro real, sem risco, e deixa o offline como esta. RECOMENDACAO: opcao 4 agora. |
| 2026-07-17T00:36:44Z | O1-11 | FIM BLOQUEADO-HUMANO | Item marcado [HUMANO] na FILA: testar vivo o paywall Empresa (F0b) exige webhook real + os secrets do MP no cofre (MP_ACCESS_TOKEN + MP_WEBHOOK_SECRET). O piloto nao toca em secrets nem simula webhook real. O lado do CLIENT (F0c) foi entregue no O1-12. |

## RESUMO FINAL — 2026-07-16

**Fila: 18 itens, todos em estado terminal.** Branch `claude/piloto-p0`, 12 commits, nada publicado
(sem `push`, sem publicar worker, sem tocar em secrets — o merge é ato do dono).

**Contagem:** 9 DONE · 9 BLOQUEADO-HUMANO · 0 TRAVADO.

| estado | itens |
|---|---|
| **DONE** (9) | O0-4, O0-5, O3-25, O3-26, O3-27, O3-28, O3-29, O3-24, O3-31 |
| **BLOQUEADO-HUMANO** (9) | O0-1, O0-2, O0-3, O0-6, O1-11, O1-12(*), O2-17, O2-18, O2-19 |

(*) O1-12 está DONE em código; o **merge** é que depende da decisão F0d.

### O que mudou de verdade

- **Onda 0 (confiança).** Os 3 P0 de integridade estão CODADOS e provados em teste, faltando só a
  prova em aparelho: contexto de equipe com 3 estados (O0-4), partição do SQLite por usuário (O0-2)
  e restore que não ressuscita dado do dono (O0-3). O bug do O0-4 era **pior que o relatado**:
  `atualizarContextoEquipe()` só rodava no `syncOnLogin`, mas `pushRow` dispara a CADA escrita local
  — o técnico gravava no tenant errado mesmo SEM erro de rede.
- **Onda 3 (dinheiro no painel).** Os 5 bugs (O3-25..29) **já estavam corrigidos** por `e9a4efe`; a
  FILA nasceu de uma síntese anterior a esse commit. O trabalho real foi extrair o parser de dinheiro
  para um módulo testado — e o teste **achou um bug novo**: `textoParaNumero("")` devolvia 0 (não NaN),
  então **limpar a quantidade zerava o item** (linha de R$ 0 no PDF do cliente), calado.
- **Gate sempre vermelho.** O `tsconfig` raiz não tinha `exclude` e compilava o `webapp/` (projeto
  separado) com o compilador do app: 854 erros que não eram bugs. `npm run typecheck` agora é exit 0
  — e volta a distinguir regressão de ruído.
- **Suíte de testes onde não havia nenhuma:** `npm test` = **89 asserts, exit 0** (5 arquivos). Todos
  os testes foram verificados por MUTAÇÃO (reintroduzir o bug faz falhar) — teste que não falha com o
  bug de volta não é prova.

### O que o piloto se RECUSOU a fazer (e por quê)

- **O2-19 (numeração atômica):** o DoD não sobrevive ao repo. `organizacao_id` **não existe** nesses
  documentos, e a constraint única sozinha faria o sync rejeitar o 2º documento criado offline — com
  o erro engolido por um `catch {}`. Trocaria "número repetido" por "**documento que some**". Falta
  decisão de produto (4 opções em FOLLOWUPS #31; recomendação: opção 4).
- **`clienteLink.ts`:** mesma borda do O0-4, mas `orcamento_versoes` não é `SyncTable` — sem retry,
  "adiar" viraria "nunca espelhar". Exige dar retry antes. FOLLOWUPS #29.
- **`LINK_RL` fail-open:** deixado de propósito. Token de 192 bits não é forçável, e é a página que o
  CLIENTE FINAL usa para aprovar — negar ali quebraria o negócio sem ganho de segurança.

### ESPERANDO O DONO (em ordem de impacto)

1. **F0d — grandfathering do paywall Empresa.** Trava o merge do O1-12: mergear sem decidir corta
   HOJE quem usa Equipe de graça.
2. **`MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET` no cofre.** Continua sendo o caixa (destrava O1-11).
3. **Emulador `olli_phone`:** provar O0-1 (login), O0-2 (troca de arquivo do SQLite no expo-sqlite) e
   O0-3 (backup→restore). É o único gate entre a Onda 0 e "resolvido".
4. **Rodar a migration `20260724_webhook_events.sql` ANTES de publicar o worker.** Sem a tabela,
   `reivindicarEvento` devolve `ok:false` e o webhook responde 500.
5. **Ao publicar o O2-18:** fail-closed troca disponibilidade por segurança — se um binding `*_RL`
   sumir, pagamento/convite passam a responder 429/503 em vez de degradar calados. É o desejado, mas
   é mudança real de comportamento.
6. **Smoke test autenticado na demo** (O0-6): abrir `/orcamentos`, salvar, ver a linha. ~2 min — o
   piloto não digita senha.
7. Stripe (Installments + 3 Prices) · TOTP no `/admin` · rotacionar a senha da demo GR Tech ·
   `pg_dump` baseline das 13 tabelas legadas.
