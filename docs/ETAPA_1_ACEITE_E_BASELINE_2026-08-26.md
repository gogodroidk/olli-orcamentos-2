# Etapa 1 — aceite e baseline técnico

- **Data do fechamento local:** 2026-08-26
- **Escopo do plano-mestre:** fundações e estabilização, marco de 0% a 15%
- **Repositório canônico validado:** `C:\OLLI_REL`
- **Branch observada:** `main`
- **Baseline anterior às mudanças desta etapa:** `df63a25`

## Resultado executivo

A Etapa 1 está **aprovada no ambiente local**. O app Expo, o painel web, a
landing e o worker compilam; os testes automatizados executados passaram; os
quatro pacotes retornam zero vulnerabilidades conhecidas nos respectivos
audits; e as correções de maior risco foram protegidas por testes focados.

Este aceite **não equivale a publicação em produção**. Nenhum deploy, migration
live, alteração de OAuth, envio a loja, cobrança, DNS ou escrita deliberada no
banco de produção foi realizado nesta etapa. Os critérios que dependem desses
ambientes continuam explicitamente separados na seção de gates externos.

## O que foi fechado nesta etapa

### 1. Datas civis de recibos

- Datas `DD/MM/AAAA` agora são convertidas de forma estrita para ISO.
- Datas impossíveis, como `31/02`, não são mais normalizadas silenciosamente
  pelo JavaScript.
- App e painel seguem o mesmo contrato de validação.
- O teste focado cobre nove cenários válidos e inválidos.

### 2. Inteligência artificial, quota e créditos

- A lista de modelos gratuitos do OpenRouter foi atualizada e ganhou verificação
  automática contra o catálogo oficial ao vivo.
- O worker usa fallback explícito entre modelos conhecidos; não entrega a
  escolha a um roteador aleatório.
- A disponibilidade gratuita passou a consultar o uso mensal no servidor quando
  existe sessão e conectividade; o contador local ficou apenas como fallback
  offline.
- O servidor continua sendo a autoridade final para uso e cobrança.
- Consumir um crédito exige ação explícita do usuário e referência idempotente;
  não há cobrança automática ao esgotar a franquia.

### 3. Configuração de release Android

- Os perfis do EAS declaram explicitamente o endpoint público de diagnóstico.
- Um verificador local impede release com URL ausente, insegura ou divergente.
- O bundle Android em modo de exportação foi gerado com sucesso após a correção
  das dependências do Metro/Hermes.

### 4. Google Agenda em modo seguro

- O fluxo nativo antigo foi desabilitado de forma explícita porque depende de
  uma arquitetura OAuth não aceita pelo contrato atual do Google para apps
  instalados.
- O produto falha fechado: não apresenta como disponível uma integração que não
  tem prova em aparelho assinado.
- A exportação web por `.ics`/template do Google continua sendo uma capacidade
  separada.

### 5. Identidade visual portátil

- Logo e assinatura escolhidas no aparelho são normalizadas para uma imagem
  pequena e portátil antes de serem persistidas.
- Há limites de entrada, dimensão e tamanho final, com fallback PNG/JPEG.
- Arquivos grandes futuros continuam destinados a Storage privado; a decisão
  inline vale somente para a identidade pequena e limitada da empresa.

### 6. Numeração concorrente de documentos

- App e painel tratam colisões reais de unicidade (`23505`) com até três
  tentativas controladas.
- A renumeração deixa trilha por `numeroAnterior` e `renumeradoEm`.
- O contador local é realinhado e a edição que ainda estava na interface é
  preservada durante o retry.
- A migration de índice único permanece propositalmente `.pendente`: ela só
  pode ser aplicada depois de auditar e corrigir duplicatas históricas no banco
  live, com rollback definido.

### 7. Dependências e cadeia de build

- O app raiz convergiu Expo e React Native para Metro `0.84.5`, retirando a
  cadeia vulnerável antiga do `image-size` sem forçar um pacote incompatível.
- A landing recebeu correções compatíveis do lockfile.
- O painel removeu `react-scan`, que não era usado, atualizou `commitlint`,
  manteve o `shiki` na mesma versão principal e fixou apenas versões transitivas
  compatíveis com correções publicadas.
- O worker atualizou o `wrangler` para `4.126.0`; dry-run e testes foram repetidos.
- App, painel, landing e worker retornaram zero vulnerabilidades no estado final.

### 8. Verdade documental

- A matriz de funcionalidades agora separa capacidade existente no repositório,
  capacidade parcial e aceite que depende de serviço externo.
- O documento do PMOC passou a refletir o código realmente existente e o estado
  regulatório atual, inclusive a revogação da RE 9/2003 pela RDC 886/2024.
- O registro de bloqueios diferencia problema de código, decisão, credencial e
  validação em produção.
- As decisões estruturais desta etapa foram consolidadas em ADR próprio.

## Evidência de validação

| Área | Comando ou prova | Resultado final |
|---|---|---|
| App raiz | `npm run preflight:release` | Aprovado: typecheck, suíte agregada, contraste, Expo Doctor, configuração de release, catálogo de IA e export web |
| Expo Doctor | Executado dentro do preflight | 21/21 verificações aprovadas |
| Catálogo gratuito de IA | `npm run check:ai-models` | Três modelos gratuitos configurados encontrados no catálogo ao vivo |
| Datas de recibo | `npm run test:recibo-data` | 9/9 verificações aprovadas |
| Crédito explícito no chat | `npm run test:chat-creditos` | 16/16 verificações aprovadas |
| Identidade portátil | `npm run test:identidade-portatil` | 15/15 verificações aprovadas |
| Numeração app/painel | `npm run test:numero-web` | 73/73 verificações aprovadas |
| Bundle Android | `npx expo export --platform android --output-dir <temporário>` | Aprovado: 3.079 módulos e bundle Hermes gerado |
| Painel web | `corepack pnpm run build` | Aprovado: TypeScript + Vite, 3.260 módulos |
| Importação no painel | `corepack pnpm run test:importacao` | Aprovado |
| Commit hook do painel | mensagem válida enviada a `commitlint` | Aprovado na versão atualizada |
| Worker | `npm run check` | Aprovado em `wrangler deploy --dry-run`; nenhum deploy realizado |
| IA do worker | `npm run test:ai` | 56/56 verificações aprovadas |
| Áudio do worker | `npm run test:audio` | 16/16 verificações aprovadas |
| Limite de body do worker | `npm run test:body` | 6/6 verificações aprovadas |
| Landing | `npm run build` | Aprovado: 24 páginas e headers de CSP gerados |
| Dependências | `npm audit --json` / `corepack pnpm audit --json` | Zero vulnerabilidades no app, painel, landing e worker |
| Segredos no diff | busca por padrões de chave/token no diff | Nenhum padrão de segredo encontrado |
| Integridade do patch | `git diff --check` | Sem erro de whitespace |

## Gates externos que continuam obrigatórios

Estes itens não são falhas escondidas da Etapa 1; são aceitações que não podem
ser simuladas localmente nem executadas sem a autorização e o ambiente corretos.

1. **Android físico assinado:** instalar um build novo, autenticar e comprovar o
   endpoint de diagnóstico no aparelho real.
2. **IA autenticada ponta a ponta:** realizar uma chamada com usuário de teste,
   conferir quota no servidor e observar logs sem expor conteúdo sensível.
3. **Google Agenda nativo:** escolher e implementar arquitetura suportada,
   configurar o cliente OAuth oficial e comprovar em aparelho assinado antes de
   reativar o recurso.
4. **Numeração no banco:** consultar duplicatas por empresa/tipo, produzir
   relatório de correção, ensaiar rollback e somente então aplicar o índice único.
5. **Baseline do schema/RLS:** reconciliar migrations com o banco realmente
   publicado e repetir a prova de isolamento entre empresas.
6. **Persistência de identidade em produção:** confirmar sincronização entre dois
   dispositivos; se a identidade ultrapassar os limites inline, migrar para
   bucket privado com URL assinada.
7. **Publicação:** builds EAS, lojas, Cloudflare, domínio, OAuth, e-mails e
   pagamentos continuam fora do aceite até uma janela autorizada.

## Dívidas não bloqueantes observadas

- O Vite ainda avisa sobre três módulos importados de forma estática e dinâmica;
  isso afeta divisão de chunks, não a correção funcional do build.
- O maior chunk do painel continua grande e merece otimização em etapa de
  performance.
- `react-day-picker` e `react-helmet-async` ainda declaram peers até React 18,
  enquanto o painel usa React 19. O build e os testes atuais passam, mas a
  compatibilidade deve ser eliminada por upgrade/substituição planejada.
- O teste de contraste passa no mínimo WCAG AA, porém o inventário ainda aponta
  123 ocorrências de cor branca escrita diretamente no código; é dívida de
  design system, não quebra do gate de contraste.

## Decisão de passagem

**PASSA para a Etapa 2 no código local**, mantendo todos os gates externos acima
fechados. A próxima etapa pode começar pela reconciliação segura de schema,
multiempresa/RLS e infraestrutura de dados para contratos, documentos e
aprendizado analítico, sem declarar produção pronta antes das provas live.

## Referências oficiais usadas nesta etapa

- Lei 13.589/2018 (Planalto):
  <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm>
- Cópia oficial da RE 9/2003 com indicação de revogação (Anvisa):
  <https://antigo.anvisa.gov.br/documents/10181/2718376/RE_09_2003_COMP.pdf/2142ffe5-88bd-4f94-910f-48d6c8a3b23a?version=1.0>
- Consolidação normativa da Anvisa:
  <https://www.gov.br/anvisa/pt-br/assuntos/regulamentacao/gestao-do-estoque/consolidacao/resultados-da-avaliacao-e-consolidacao>
- OAuth 2.0 para apps instalados (Google):
  <https://developers.google.com/identity/protocols/oauth2/native-app>
- Advisory do `image-size` (GitHub Advisory Database):
  <https://github.com/advisories/GHSA-w3rx-r6r6-pgpr>
