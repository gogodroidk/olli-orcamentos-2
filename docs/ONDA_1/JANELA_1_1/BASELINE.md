# Linha de base técnica — Janela 1.1

Data: 2026-08-26

Estado: AMARELO — superfícies locais reproduzíveis; preflight de release bloqueado por drift de patches.

## 1. Escopo e fronteiras

Esta linha de base cobre somente o checkout local C:\OLLI_REL.

Foram permitidos:

- leitura do código e das migrations versionadas;
- comandos locais de typecheck, testes, build, export e dry-run;
- consulta pública usada pelo verificador já existente de modelos gratuitos;
- auditoria local das dependências;
- varredura de segredos com conteúdo redigido.

Não foram realizados:

- conexão administrativa ao Supabase;
- leitura de .env, cofres, sessões ou dados de clientes;
- escrita remota;
- deploy;
- atualização de dependências;
- alteração funcional do aplicativo.

## 2. Identidade do checkout

| Campo | Valor verificado |
|---|---|
| Repositório | C:\OLLI_REL |
| Branch | main |
| Commit-base | df63a25f25a57b9644995bf3adc63c098d0b3cb7 |
| Tipo de clone | completo, não shallow |
| Arquivos rastreados | 1.037 |
| Árvore de trabalho no snapshot | 44 entradas |
| Modificados | 31 |
| Não rastreados | 13 |
| Snapshot | 2026-08-26 19:25:44 -03:00 |

As alterações preexistentes pertencem ao usuário e às etapas anteriores. Elas foram preservadas. Nenhum reset, checkout destrutivo, stash ou commit foi executado.

## 3. Superfícies e gerenciadores

| Superfície | Stack | Gerenciador | Arquivos no código da superfície |
|---|---|---|---:|
| Aplicativo | Expo SDK 57, React Native 0.86, React 19 | npm na raiz | 254 |
| Painel web | Vite + React | pnpm declarado no próprio pacote | 306 arquivos de código em 373 arquivos |
| Site público | Astro | npm | 13 arquivos de código em 43 arquivos |
| API/edge | Cloudflare Worker | npm | 22 |
| Banco versionado | Supabase/Postgres migrations | SQL | 34 arquivos, 33 SQL/código |
| Verificações locais | scripts | npm/Node | 59 arquivos de código em 62 arquivos |

O repositório ainda não é um workspace único. A raiz não declara workspaces nem packageManager. O painel declara pnpm@10.8.0; raiz, site e Worker possuem lockfiles npm próprios. Qualquer migração para monorepo precisa começar em spike descartável e não é parte desta janela.

## 4. Ferramentas observadas

| Ferramenta | Versão |
|---|---|
| Node.js | v24.16.0 |
| npm | 11.13.0 |
| pnpm global | 11.19.0 |
| Expo CLI | 57.0.18 |
| Git | 2.54.0.windows.1 |
| ripgrep | 15.2.0 |
| Gitleaks | 8.30.1 |

O health check do arsenal central passou. O catálogo do arsenal não foi tratado como prova suficiente: cada executável relevante foi verificado antes do uso.

## 5. Verificações executadas

### 5.1 Aplicativo/root

| Verificação | Resultado | Observação |
|---|---|---|
| TypeScript/typecheck | PASSOU | Executado pelo preflight |
| Cadeia npm test | PASSOU | 43 comandos encadeados |
| Contraste | PASSOU | 12 marcas, mínimo 4,5:1 |
| Expo Doctor | FALHOU | 20 de 21 verificações passaram; 16 patches recomendados |
| Configuração de release | PASSOU | URL pública nos três perfis; sem segredo embutido; Google Calendar falha fechado |
| Modelos gratuitos de IA | PASSOU | 3 modelos estruturados encontrados pelo verificador existente |
| Export web do Expo | PASSOU | 2.871 módulos; saída local em dist |
| npm audit da raiz | PASSOU | 0 vulnerabilidades reportadas |

O comando agregado npm run preflight:release terminou com código 1 no Expo Doctor e, por causa do encadeamento fail-fast, não executou automaticamente os passos posteriores. Esses passos foram executados separadamente e passaram. Portanto, é incorreto declarar o preflight completo como verde.

### 5.2 Drift atual detectado pelo Expo

| Pacote instalado | Patch recomendado |
|---|---|
| @expo/metro-runtime 57.0.13 | ~57.0.14 |
| expo 57.0.16 | ~57.0.17 |
| expo-asset 57.0.14 | ~57.0.15 |
| expo-file-system 57.0.5 | ~57.0.6 |
| expo-haptics 57.0.1 | ~57.0.2 |
| expo-image-manipulator 57.0.13 | ~57.0.14 |
| expo-image-picker 57.0.13 | ~57.0.14 |
| expo-linking 57.0.7 | ~57.0.8 |
| expo-notifications 57.0.14 | ~57.0.15 |
| expo-secure-store 57.0.1 | ~57.0.2 |
| expo-sharing 57.0.15 | ~57.0.16 |
| expo-speech 57.0.1 | ~57.0.2 |
| expo-sqlite 57.0.1 | ~57.0.2 |
| expo-system-ui 57.0.2 | ~57.0.3 |
| react-native 0.86.2 | 0.86.3 |
| expo-build-properties 57.0.14 | ~57.0.15 |

Decisão desta janela: não atualizar. A correção será um patch controlado, com lockfile, build, testes e validação em dispositivo, depois que a linha de base estiver congelada.

### 5.3 Painel web

| Verificação | Resultado | Observação |
|---|---|---|
| corepack pnpm run build | PASSOU | 3.260 módulos |
| test:importacao | PASSOU | Código de saída 0 |
| Auditoria pnpm | PASSOU | Código 0, sem advisories reportados |

O build emitiu três avisos de módulos importados de forma estática e dinâmica e mostrou chunks grandes. São dívida de performance, não falha de compilação.

### 5.4 Site público

| Verificação | Resultado | Observação |
|---|---|---|
| npm run build | PASSOU | 24 páginas |
| Arquivo de headers/CSP | PASSOU LOCALMENTE | 21 hashes de scripts inline gerados; aplicação pelo host depende de validação HTTP pós-deploy |
| npm audit | PASSOU | 0 vulnerabilidades reportadas |

### 5.5 Worker

| Verificação | Resultado | Observação |
|---|---|---|
| npm run check | PASSOU | Wrangler dry-run; nenhum deploy |
| test:ai | PASSOU | 56 de 56 |
| test:audio | PASSOU | 16 de 16 |
| test:body | PASSOU | 6 de 6 |
| npm audit | PASSOU | 0 vulnerabilidades reportadas |

O dry-run pode materializar bindings de configuração no console. Nenhum valor foi transcrito para estes documentos.

### 5.6 Integridade da árvore

| Verificação | Resultado |
|---|---|
| git diff --check | PASSOU |
| Gitleaks no diff rastreado | PASSOU |
| Gitleaks nos 13 arquivos não rastreados do snapshot | PASSOU |
| Alterações inesperadas causadas pelos builds | Nenhuma observada |

Os avisos de conversão LF → CRLF são informativos e não representam erro de whitespace.

## 6. Constatações arquiteturais

1. Há quatro runtimes independentes, sem workspace raiz.
2. O mobile usa SQLite como fonte operacional e espelha para Supabase.
3. O painel web escreve diretamente no Supabase.
4. O mecanismo chamado de sync não possui outbox durável: offline pode virar no-op e o retry não tem estado de comando observável.
5. O tenancy atual usa user_id do owner e donos_visiveis(), não organization_id nas linhas de negócio.
6. Um membro ativo em mais de uma organização não possui seleção explícita de organização ativa; a escrita escolhe a associação mais antiga.
7. Papéis de equipe ainda não formam uma matriz completa nas policies de negócio.
8. O Worker usa service_role em superfícies privilegiadas e, por isso, precisa autorizar ator, organização, papel e objeto em cada endpoint.
9. Não há buckets nem policies de Supabase Storage versionados.
10. Mobile, painel e Worker possuem pontos de dupla escrita que precisam de um único contrato de comando.

## 7. Gates externos ainda abertos

| Gate | Estado |
|---|---|
| Catálogo real de schema, policies, grants e funções no Supabase | NÃO VERIFICADO NESTA JANELA |
| Testes RLS com identidades reais em ambiente efêmero/staging | PENDENTE |
| Atualização controlada dos 16 patches + Android físico | PENDENTE |
| OAuth Google em ambiente real | PENDENTE |
| IA e fallback com credenciais reais e limites reais | PENDENTE |
| Numeração concorrente em banco aplicado | PENDENTE |
| Storage privado, URLs assinadas e retenção | NÃO IMPLEMENTADO |
| Publicação web/app/deploy Worker | NÃO AUTORIZADO |
| Conformidade jurídica e sanitária dos modelos | PENDENTE DE PESQUISA OFICIAL E REVISÃO HUMANA |

## 8. Gate de saída da Janela 1.1

Passa para pesquisa da Janela 1.2 porque:

- o checkout está identificado e preservado;
- as quatro superfícies foram reproduzidas localmente;
- o bloqueio do preflight foi isolado e documentado;
- tenancy, sync e dupla escrita foram inventariados;
- decisões estruturais ficaram registradas como propostas, não como mudanças silenciosas;
- os limites de produção e conformidade permaneceram fechados.

Não passa para release, migration ou produção.
