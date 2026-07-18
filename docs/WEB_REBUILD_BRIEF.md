# WEB_REBUILD_BRIEF — Reconstrução da aplicação WEB do OLLI Orçamentos

> **Para quem é este documento:** um chat NOVO do Claude Code, sem nenhum contexto prévio.
> Ele é autossuficiente: contém o diagnóstico, os requisitos do dono, o contrato do backend,
> a stack recomendada, o plano em fases e as armadilhas de deploy. Leia inteiro antes de codar.
>
> **Dono do produto:** Igor (GR Tech). **Data:** 2026-07-13.
> **Repo:** GitHub `gogodroidk/olli-orcamentos-2` (local: `C:\Users\ADMIN\Desktop\Projetos OLLI\olli-orcamentos`).
> **Fonte da verdade do código = `origin/main`** (branches de feature podem estar atrasadas — confira sempre contra a main).

---

## 0. Regras de ouro (leia antes de qualquer coisa)

1. **O app MOBILE (APK nativo Expo/React Native) FUNCIONA e NÃO PODE SER TOCADO.** O repo é
   compartilhado entre mobile e web. Deletar/alterar código RN quebra o produto mobile. A "web
   antiga" que sai é só o caminho de export web (detalhado na seção 8).
2. **Backup lógico ANTES de mexer em qualquer coisa** (tag + branch git — seção 8). Nada é
   apagado até a web nova estar no ar.
3. **O backend NÃO é reconstruído.** Supabase + Worker Cloudflare + Mercado Pago ficam como
   estão; a web nova só CONSOME (seção 3).
4. **Copy derivada da fonte.** Texto de produto (nomes de plano, preço, limites, features) é
   lido dos arquivos-fonte (`src/services/planos.ts`, `src/services/verticais.ts`, types) —
   nunca escrito de memória. Já houve 5 incidentes de copy inventada neste projeto.
5. **Push na `main` publica a web automaticamente** (Cloudflare Pages). Trabalhe em branch/preview
   e só promova pra `main` quando estiver pronto. *(O antigo problema de push apagar os secrets do
   worker já foi RESOLVIDO pelo dono — não é mais preocupação; ver 7.2.)*
6. **Erro ≠ vazio.** Padrão recorrente de bug neste projeto: "não sei" tratado como "não tem"
   concede/nega acesso errado e apaga dado. Toda consulta de gate (plano, vertical, permissão)
   precisa de 3 estados: `carregando | erro | valor`. Nunca degrade erro para default silencioso.

---

## 1. Missão e causa-raiz (por que reconstruir)

### 1.1 A missão

Reconstruir do zero a aplicação web do OLLI Orçamentos como um **site de verdade** — feito para
a web, que abre no Chrome como qualquer site — substituindo a web atual, que é um export
`react-native-web` do app mobile e está quebrada na experiência.

### 1.2 A causa-raiz única

A web atual **não é uma aplicação web**: é o MESMO código do APK nativo (Expo/React Native)
compilado para o navegador via `react-native-web`:

- Build: `npm run export:web` (bundler Metro), `app.json` → `web.output: "single"` (SPA).
- Deploy: Cloudflare Pages, projeto **`olli-app`**, domínio `app.olliorcamentos.online`,
  branch `main`, diretório de saída `dist`.

### 1.3 Sintomas relatados pelo dono e a explicação técnica (tudo confirmado no código)

| Sintoma (palavras do dono) | Causa técnica real |
|---|---|
| "Duas páginas conflitando" | Boot multi-estágio que se atropela: `App.tsx` mostra `BrandSplash` enquanto `dbReady && fontsLoaded` é false; carrega fontes Google (Plus Jakarta Sans + Spectral), abre **SQLite via WASM** (`expo-sqlite`) e checa sessão Supabase — tudo async ANTES do primeiro paint. Depois monta `NavigationContainer` com rota inicial `Landing` (deslogado) ou `Tabs`. Ainda há `navigationRef.reset()` no `onReady` (guard de rota pública) e no listener de auth (`INITIAL_SESSION`/`SIGNED_OUT`). Cada reset é um salto visual — parece "duas páginas brigando". |
| "Vira PWA ao encolher a tela" | **NÃO é PWA** (não existe service worker, manifest nem plugin PWA — verificado por grep; `app.json` não tem plugin pwa). O que acontece: o hook `useEhDesktop` (`src/hooks/useEhDesktop.ts`, `DESKTOP_BREAKPOINT = 1024`) troca o LAYOUT para a UI MOBILE abaixo de 1024px — ou seja, o app de celular renderizado no navegador. O dono ODEIA isso. |
| "Não carrega direito dentro" | Peso do bundle RN-web + headers `COEP: credentialless` / `COOP: same-origin` (`public/_headers`, exigidos pelo SQLite-WASM/cross-origin isolation) + jank de loops `Animated.loop` do RN sem driver nativo na web. |
| (limitação conhecida) | O mapa de URL (`linking.ts`) é FIXADO no boot pela largura da janela; redimensionar cruzando 1024px troca o layout mas não o mapa de URL — só um F5 realinha. |

**Conclusão:** não há conserto incremental que valha a pena. A arquitetura (RN-web + SQLite-WASM
+ navegação mobile portada) é a doença. Reconstrução web-nativa autorizada pelo dono
("mude tudinha a página web").

### 1.4 Projeto legado a aposentar

Cloudflare Pages **`olli-painel`** → `painel.olliorcamentos.online`, branch
`legado/handoff-2026-06`, MESMO repo, build `npm run build`. É duplicata morta (subdomínio
diferente, não conflita com o app, mas confunde). Previews já desativados. Aposentar no fim do
plano (seção 8).

---

## 2. Requisitos duros (literal, do dono)

1. A web tem que ser um **SITE DE VERDADE**, focado na web, que abre no Chrome como qualquer site.
2. **SEM PWA**: nada de manifest, service worker, install prompt, display standalone. Nunca
   "virar app" ao encolher a tela.
3. **Responsivo de verdade**: desktop-first que degrada com elegância. Em QUALQUER largura a UI
   continua sendo web (tabelas viram cards, sidebar vira menu, etc.) — NÃO um celular espremido
   no meio do navegador.
4. **O app MOBILE continua sendo o APK NATIVO** (Expo/RN). Ele fica, funciona, e não é
   tocado nem deletado.
5. Reconstrução do zero autorizada ("mude tudinha a página web").
6. **Backup lógico antes de apagar** qualquer coisa da web antiga.

---

## 3. Backend existente — MANTER, apenas consumir

A web nova NÃO cria backend. Tudo abaixo já existe, funciona e serve o APK também.

### 3.1 Supabase (auth + banco + storage)

- Projeto: `https://yiaeplqinnnnniyvwtls.supabase.co` (URL e anon key públicas estão em
  `src/config.ts` do repo — a anon key é pública por design; RLS protege os dados).
- **Auth:** email/senha + OAuth Google e Apple. Na web nova usar `@supabase/supabase-js` direto
  (`supabase.auth.signInWithPassword`, `signInWithOAuth`). Conferir no painel Supabase os
  redirect URLs permitidos e adicionar os da web nova.
- **Banco:** Postgres com RLS. Tabelas principais: empresas, orcamentos, clientes, ordens de
  serviço, equipamentos, planos PMOC, equipe/organização, assinaturas/créditos, etc.
  Existe a view `organizacao_membros_perfil`. Para o mapa completo, inspecione via MCP do
  Supabase (`list_tables`) ou leia `src/services/cloudSync.ts` (o sync per-row do app atual
  documenta o shape de cada tabela).
- **Storage:** buckets para logos/anexos (ver usos em `src/services/`).
- A web nova fala com o Supabase **direto do browser** (RLS é a segurança). Não inventar API
  intermediária para CRUD.
- **Modelo de tenancy (leia antes de tocar em dados):** cada usuário-dono tem **1 linha em
  `empresa`** (`upsert onConflict 'user_id'`). Uma **organização/equipe** agrega técnicos/gestores
  sob o `user_id` do DONO (`ownerUserId`; papéis owner/gestor/tecnico via `getMinhaOrganizacao` em
  `src/services/equipe.ts`). As `verticaisEmpresa` que alimentam o gate (6.1) saem da empresa
  corrente. **A regra de ESCRITA multi-tenant é crítica — ver 6.4.**

### 3.2 Cloudflare Worker `olli-diagnostico` (IA, pagamentos, links, integrações)

- URL: `https://diagnostico.olliorcamentos.online`.
- Código: `worker/src/{index,mercadopago,stripe,abacate,creditos,link,conta,equipe,pmoc,admin}.js`.
- **Autenticação:** o app envia o access token do Supabase:
  `Authorization: Bearer <supabase access_token>` (padrão confirmado em
  `src/services/olliIA.ts`, `pixCreditos.ts`, `conta.ts`, `equipe.ts`, `eta.ts`, `cnpj.ts` etc.).
  A web nova replica exatamente esse padrão.
- **Contrato de rotas (reais, confirmadas):**

| Rota | Função |
|---|---|
| `GET /` | Health check (`{ok,…,ia}`) |
| `POST /` | **Diagnóstico técnico HVAC** (OLLI Técnica / DiagnosticoIA) — `olliIA.diagnosticarCaso` faz `POST` na RAIZ, sem path |
| `POST /chat` | **OlliChat** — assistente conversacional |
| `POST /voz` | Voz→itens: transcript → itens de orçamento (OlliVoz) |
| `POST /transcrever` | Voz na nuvem: áudio → transcrição/itens (OlliVoz). *TTS do app é on-device (`expo-speech`), NÃO é rota do worker.* |
| `GET /cnpj/…` | Consulta CNPJ (proxy) |
| `POST /eta`, `POST /geocodificar` | Routes API / ETA / geocodificação |
| `/conta/…` | Operações de conta (ex.: exclusão) |
| `/equipe/…` | Operações de equipe/organização |
| `/mp/*` | **Mercado Pago — gateway OFICIAL** (créditos via Pix + assinatura de planos) |
| `/stripe/*` | Stripe (fallback; checkout/portal/webhook) |
| `/abacate/*` | AbacatePay — **DESCONTINUADO**, não usar |
| `GET /o/…`, `GET /q/…` | Páginas públicas de orçamento / QR **servidas pelo próprio worker** (`link.olliorcamentos.online`). A web nova NÃO reconstrói essas páginas — só CRIA o link (ver 6.3). |
| `/admin` | Feedback / registro de erros |

*(Gate: só `/`, `/voz`, `/chat`, `/transcrever` passam pelo filtro `IA_ROUTES` em `index.js`; as demais têm handlers próprios. Fonte: `worker/src/index.js`.)*

- **Deploy do worker:** `wrangler deploy` (o `worker/reparar.mjs` existe para (re)semear os
  secrets do cofre local se algum dia precisar). A web nova NÃO mexe no worker.
- Referências: `docs/MERCADOPAGO.md` (estratégia MP completa), `docs/PROMPT_MESTRE.md` (visão
  do produto).

### 3.3 Mercado Pago

Gateway ÚNICO de pagamento (Pix para créditos + assinatura de planos), sempre via `/mp/*` do
worker. Stripe é fallback (`/stripe/*`). **A regra de negócio — a web nunca fala com o MP direto,
nunca vê o token, confirmação é o webhook — está em 6.3** (não repetir aqui).

### 3.4 Variáveis de ambiente

O app atual usa (em `src/config.ts`):

| Atual (Expo) | Valor / observação | Nome sugerido na web nova |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://yiaeplqinnnnniyvwtls.supabase.co` | `PUBLIC_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon key (pública) | `PUBLIC_SUPABASE_ANON_KEY` |
| `EXPO_PUBLIC_DIAGNOSTICO_URL` | `https://diagnostico.olliorcamentos.online` — **sem fallback hardcoded** (vazio = IA desligada, por design) | `PUBLIC_DIAGNOSTICO_URL` |
| `EXPO_PUBLIC_LINK_BASE_URL` | `https://link.olliorcamentos.online` (links `/o/<token>`) | `PUBLIC_LINK_BASE_URL` |
| `EXPO_PUBLIC_WHATSAPP_SUPORTE` | `5511941727487` | `PUBLIC_WHATSAPP_SUPORTE` |
| `EXPO_PUBLIC_MAPS_KEY` | vazio por padrão (mapa embutido desligado) | `PUBLIC_MAPS_KEY` |

Só valores públicos vão para env do front. Secrets (MP, Gemini, service_role…) moram no worker.

### 3.5 Conta de demonstração (para QA)

`demo@grtech.com.br` (senha no cofre local / variável `VITE_DEMO_PASSWORD`) — conta demo da GR Tech, plano Empresa ativo, dados
completos semeados. Use para testar cada tela reconstruída contra dados reais.

---

## 4. Stack recomendada (decisão + trade-offs)

### 4.1 Critérios

(a) Landing de marketing com SEO (já existem `sitemap.xml`, `robots.txt`, `og-image`) →
favorece SSG/SSR; (b) o app em si é autenticado e data-heavy → na web, **online-first direto
no Supabase** (dropar SQLite-WASM, que é a fonte do peso e dos headers COEP/COOP); (c) o time
domina React/TypeScript; (d) hospedagem Cloudflare; (e) sem PWA; (f) **histórico do projeto:
complexidade de build/deploy é o que quebrou tudo — menos peças móveis é requisito implícito.**

### 4.2 Comparativo

| Opção | Prós | Contras |
|---|---|---|
| **Next.js (App Router) no Cloudflare** (`@opennextjs/cloudflare`; o antigo `@cloudflare/next-on-pages` está em modo manutenção) | Um framework só; ecossistema gigante; SSR/SSG maduros | Camada adaptadora Next↔Workers historicamente frágil (nodejs_compat, breakages em minor releases); SSR de app autenticado exige auth por cookie (`@supabase/ssr`) — complexidade que este app não precisa; é reintroduzir risco de build exatamente onde o projeto já se queimou |
| **Remix / React Router 7 (framework mode) no Workers** | React puro, um modelo só; SSR bom; adapter oficial CF | Exige runtime de servidor no edge + auth por cookie para SSR; para um app que é 95% dashboard autenticado, o SSR não paga o custo; landing SEO exigiria configurar prerender |
| **Astro (SSG) + React SPA (Vite) — RECOMENDADA** | Saída **100% estática** = deploy é upload de arquivos, zero runtime de servidor, zero classe de erro de build/adapter; landing com SEO perfeito (HTML puro); o app é uma ilha React client-only — mesmo modelo de auth do app atual (supabase-js no client, sessão em localStorage), sem cookie/SSR; React/TS que o time já domina | Dois modelos mentais no mesmo projeto (páginas Astro + app React); app não tem SSR (irrelevante: é atrás de login); bundle inicial do app exige code-splitting disciplinado |

### 4.3 Recomendação: **Astro + React SPA (Vite), projeto único, saída estática**

Um único projeto Astro no diretório novo **`web/`** do repo:

- **Landing/marketing** (`/`, `/planos`, `/legal`, `/ajuda` públicas): páginas Astro estáticas
  — HTML puro, SEO máximo, `sitemap`/`robots`/OG migrados para cá.
- **O app** (`/app/*`): uma rota catch-all Astro (`src/pages/app/[...rest].astro`) que monta
  `<AppRoot client:only="react" />` — um SPA React completo com roteador client-side.
- **Deploy:** projeto NOVO **Cloudflare Pages** (nome sugerido: `olli-web`), **root directory =
  `web/`**, build `astro build`, saída estática (`dist`). Pages (não Workers) porque a saída é
  100% estática — caminho mais simples e igual ao do `olli-app` atual. Convive com o `olli-app`
  antigo até o cutover de domínio.

**Por que ganha:** elimina por construção a classe inteira de falhas que matou a web atual
(runtime pesado, WASM, headers COEP/COOP, adapter de framework). Estático não quebra em
produção. E o modelo de dados/auth é o MESMO que os services atuais já usam (supabase-js no
client), o que maximiza reaproveitamento.

**Plano B** (se o implementador preferir um framework só): React Router 7 em SPA-mode com
prerender das rotas públicas. Aceitável, mas segunda escolha.

### 4.4 Bibliotecas do app React (dentro do Astro)

- **Roteador:** TanStack Router ou React Router (library mode) — URLs limpas, deep-link e F5
  funcionando em TODAS as rotas (fallback SPA `/app/*` → página do catch-all).
- **Dados:** `@supabase/supabase-js` + **TanStack Query** (cache, revalidação, estados de
  loading/erro explícitos — casa com a regra dos 3 estados). **Online-first**: sem SQLite,
  sem sync engine na web. `supabase.channel()` (Realtime) onde fizer diferença (EquipeAoVivo).
- **UI:** Tailwind CSS v4 + shadcn/ui (Radix) — velocidade + acessibilidade + tema consistente.
- **Formulários/validação:** react-hook-form + zod.
- **Qualidade (gate, não sugestão):** TypeScript strict, Biome (lint+format), Vitest +
  Testing Library, Playwright para smoke E2E dos fluxos críticos.
- **Proibido:** `react-native-web`, `expo-*`, qualquer wrapper RN, service worker, manifest.

### 4.5 Reaproveitamento da lógica de negócio

Boa parte de `src/services/` **e de `src/utils/`** é **TypeScript puro** e porta direto.

**De `src/services/`:** `calculosOficio.ts` (o array `CALCULOS` tem **21 calculadoras** por ofício,
aterradas em NBR — refrigeração (BTU, carga de gás, superaquec./subresfr., disjuntor do compressor,
vácuo), hidráulica (caixa d'água, água fria por pesos, perda de carga, fossa séptica), pintura
(massa, diluição, secagem, rendimento de selador), dedetização (diluição), jardinagem (grama,
adubação NPK, mudas, cova/substrato) e **elétrica** (dimensionamento de circuito, eletroduto, queda
de tensão) — **confira o número no arquivo em `origin/main`, não numa branch velha**), `verticais.ts`
+ `verticalSegmento.ts` + `checklistVertical.ts` (gate por vertical), `planos.ts`, parsing de
`cnpj`/`cep`, os 698 códigos de erro (em `olliIA`/`erroIA`), lógica de PMOC, `clienteLink.ts`
(cria o link público — ver 6.3).

**De `src/utils/` (NÃO ignore esta pasta):** `pdfGenerator.ts` (gera o PDF do orçamento em vários
modelos) + `exportarDocumento.ts` (na web: **HTML → imprimir/salvar como PDF** via `window.print()`),
`reciboPdf.ts`, `certificadoAnvisaPdf.ts`, `etiquetaQrPdf.ts` (etiqueta QR do Equipamento),
`pixBrCode.ts` (copia-e-cola do Pix), `qrcode.ts`, `mensagensOrcamento.ts`, `masks.ts`,
`currency.ts`, `date.ts`, `seoWeb.ts`, `coresMarca.ts`/`extrairCoresLogo.ts`. **A estratégia de PDF
na web é essa (HTML→print), não reinventar** — cobre VisualizarOrcamento, EmitirRecibo,
ModelosDocumento e a etiqueta do Equipamento.

**Estratégia:** na v1, **copie módulo a módulo para `web/src/lib/`** (só extraia um pacote `shared/`
depois, se a duplicação começar a doer), removendo imports de RN/Expo (`AsyncStorage`, `Platform`,
`expo-*`) e trocando por equivalentes web. **A camada de UI (screens/components) é 100% reescrita** —
nada de portar JSX de React Native.

---

## 5. Inventário de features (39 telas) por área + fases

O que existe hoje e precisa existir na web nova, agrupado. A pasta `src/screens/desktop/` tem
variantes desktop com sidebar — use-as como referência de layout desejado, não como código.

### Fase 0 — Fundação (sem feature visível)
Scaffold `web/` (Astro + React + Tailwind + CI), projeto Cloudflare `olli-web` com preview
por branch, envs `PUBLIC_*`, tema/design tokens (seção 9), layout base desktop-first
(sidebar + topbar) com colapso elegante para tablet/celular.

### Fase 1 — Auth + casca + landing
- **Entrar** (login email + OAuth Google/Apple via Supabase), recuperação de senha, **Convite**
  (aceite de convite de equipe), **Onboarding** (primeiro acesso: ofício/vertical, dados da empresa).
- **Landing/LandingScreen.web** → páginas Astro de marketing (hero, features, planos, CTA),
  **Legal** (privacidade/termos), **Ajuda**.
- Shell autenticada: navegação, guard de rotas, seletor de empresa/organização.

### Fase 2 — Núcleo comercial (o coração do produto)
- **Orcamentos** (lista/filtros), **NovoOrcamento** (editor: itens, produtos/serviços,
  desconto, foto, IA de descrição), **VisualizarOrcamento** (preview + PDF via HTML→print +
  **gera** o link público `/o/<token>` e o QR `/q/` — as páginas em si continuam servidas pelo
  worker, não reconstruir; ver 3.2/6.3), **Clientes** (CRUD + radar de clientes/cobrança),
  **Produtos**, **Servicos**, **ModelosDocumento**, **EmitirRecibo**, **Lixeira** (soft-delete).

### Fase 3 — Operação de campo
- **OrdemServico** (orçamento → OS, checklist por vertical, **assinatura**: captura via canvas/pad
  client-side gravando imagem, governada pelas flags `exibirAssinatura`/`solicitarAssinaturaCliente`
  em `src/types`; assinatura formal via Documenso é camada futura bloqueada — ver 11.4), **Agenda**
  (+ integração Google Agenda — ver 11.4), **Hoje** / **Home** / **RelatorioDia** (dashboards),
  **TecnicoHome** (visão do técnico), **Equipe** (membros, papéis, permissões — hooks
  `usePermissao`/`useTipoConta`), **EquipeAoVivo** (localização: na web, VISUALIZAÇÃO do mapa/lista;
  captura de GPS contínua é papel do APK).

### Fase 4 — Ferramentas de ofício (gate por vertical — seção 6.1)
- **FerramentasOficio** (hub), **CalculadoraTinta** e demais calculadoras (`calculosOficio`),
  **CodigosErro** (diagnóstico ar-condicionado, 698 códigos), **DiagnosticoIA**,
  **Equipamento** (inventário HVAC + etiqueta QR), **EscanearQr** (câmera via `getUserMedia` +
  entrada manual do código como fallback — **DECIDIDO, ver 11.3**), **PmocPlano/PmocPlanos**
  (manutenção HVAC + lembretes), **CertificadoAnvisa**.

### Fase 5 — Billing e conta
- **Planos** (copy derivada de `PLANOS_BASE` em `src/services/planos.ts`!), **Assinatura**
  (status, portal), **Creditos** (compra via Pix Mercado Pago — rotas `/mp/*`), **Conta**
  (perfil, exclusão via `/conta/`), **MeuNegocio** (dados da empresa, logo, CNPJ via `/cnpj/`).

### Fase 6 — IA e voz
- **OlliChat** (chat IA via `/chat`), **OlliVoz** (voz via `/transcrever` + `/voz`; na web usar
  MediaRecorder/Web Audio — sem dependência Expo).

### Fase 7 — Cutover e limpeza
SEO final, redirects, troca de domínio, aposentadoria do legado, remoção dos artefatos web do
RN (seção 8, sequência exata).

**Serviços de apoio a portar conforme a fase pedir:** `olliIA`/`olliAssistente`, `creditos`/
`pixCreditos`/`pagamentos`/`assinatura`, `pmoc`/`pmocLembretes`, `ordemServico`, `clienteLink`
(cria o link público — 6.3), `equipe`/`localizacaoEquipe`, `agenda`/`googleAgenda`,
`cnpj`/`cep`/`eta`/`rotas`, `radarClientes`/`radarCobranca`, `erroIA`, `feedback`, `analytics`.

**Não portar o MOTOR de `cloudSync`/`backup`/`autoBackup`** (existem por causa do SQLite local; a
web é online-first, Supabase É a fonte). **MAS extraia de `cloudSync.ts` duas coisas que não são
sync:** (a) os mapeadores `toRow` — documentam EXATAMENTE as colunas de cada tabela Supabase;
(b) a **regra de tenancy de escrita** (ver 6.4). Ignorar isso faz a web gravar dado que a empresa
não enxerga.

---

## 6. Regras de negócio críticas a preservar

### 6.1 Gate por VERTICAL/ofício (a mais importante)

"O setor de ar-condicionado NÃO pode ver as ferramentas do setor de pintura."

Fonte da verdade: `src/services/verticais.ts`, função `empresaMostraVertical(verticaisEmpresa, id)`:

- Empresa **SEM ofício definido** (undefined/`[]`) → vê **TUDO** (`length === 0 → return true`;
  backward-compat para usuários antigos).
- Empresa **com ofício(s) específico(s)** → vê **só** os próprios ofícios
  (`verticaisEmpresa.includes(id)`). É aqui que **HVAC não vê pintura**.
- **`'geral'` (Serviços em Geral) NÃO é coringa** — foi de-wildcarado na `main` (commit `286b087`):
  `empresaMostraVertical(['geral'], id)` = `['geral'].includes(id)` = **false** para qualquer nicho
  (nenhuma ferramenta é marcada `'geral'`), então empresa com `['geral']` vê só o núcleo genérico e
  **esconde** ferramentas de nicho. **Sutileza a conhecer:** `deduzirVerticais` ainda deduz
  `['geral']` quando o CNAE não casa com nenhum ofício → uma empresa não-classificada, por padrão,
  não vê nicho até **ajustar o ofício no onboarding** (a dedução é o default editável, nada imposto).
  Reproduza o comportamento da `main` (esconde), não o wildcard antigo.
- Atalho `empresaMostraHvac()` = `empresaMostraVertical(v, 'refrigeracao')` — gateia PMOC,
  equipamentos, códigos de erro, diagnóstico.
- O gate **ESCONDE, não bloqueia com paywall** — é personalização, não monetização.
- Hook de referência: `src/hooks/useVerticais.ts`. Também por vertical: sugestões de IA,
  calculadoras (`calculosOficio`), checklist de OS (`checklistVertical`).

**Porte o módulo `verticais.ts` inteiro (é TS puro) e escreva testes unitários do gate na web
nova.** Enquanto as verticais da empresa não carregaram, mostre loading — não mostre nem esconda
em definitivo (regra dos 3 estados; ver regra 6).

### 6.2 Planos comerciais

- IDs no código: `PlanoId = 'gratis' | 'pro' | 'empresa'` (`src/services/planos.ts`); "Equipe"
  aparece como RECURSO/capacidade, não como ID de plano. **Derive nomes, preços e limites de
  `PLANOS_BASE` e dos types — não invente.**
- Consulta de plano nunca lança; sem Supabase/logado → `'gratis'`.
- **Empresa sem enforcement na v1.** Construir camada de entitlements (`plano → capacidades`),
  Empresa aberto por grandfathering, enforcement no worker. **Decisão canônica e detalhes em 11.2.**

### 6.3 Pagamentos e link público

Créditos (Pix) e assinaturas passam SEMPRE pelo worker (`/mp/*`). A web só: pede a cobrança,
mostra o QR/copia-e-cola, e consulta o status. Confirmação de pagamento é o WEBHOOK worker-side
(fonte da verdade) — a web nunca "confirma" pagamento por conta própria.

**Link público de orçamento é da WEB:** `clienteLink.gerarLinkOrcamento` gera o token e grava
token + snapshot do orçamento na tabela **`orcamentos_publicos`** (`upsert onConflict 'token'`; na
colisão de token → `unique_violation 23505` → gera outro). O worker só **serve** `/o/<token>` e
`/q/` — a web CRIA o registro, não reconstrói as páginas.

### 6.4 Tenancy de escrita (tão crítica quanto o gate por vertical)

Fonte: `src/services/cloudSync.ts`. Como a web é online-first e fala direto com o Supabase, ela
**precisa reproduzir isto ou some com dados da empresa:**
- Writes **não enviam `user_id`** — o default `auth.uid()` + RLS preenche.
- Quando o autor é um **membro NÃO-dono** (técnico/gestor) de uma organização, as linhas de
  `cliente`/`orçamento`/`agendamento`/OS/`equipamento`/plano PMOC devem nascer no **tenant do
  DONO**: carimbar `user_id = ownerUserId` (via `getMinhaOrganizacao`). Sem isso, a linha nasce no
  tenant do técnico e **o dono nunca a vê** (bug real: cliente cadastrado pelo técnico sumia).
  `recibo` segue escrita só do dono — não injetar.

---

## 7. Deploy / Cloudflare / ARMADILHAS

### 7.1 Estado atual

- **Pages `olli-app`** → `app.olliorcamentos.online` (a web RN-web atual). Repo
  `gogodroidk/olli-orcamentos-2`, branch `main` = produção, saída `dist`.
- **Pages `olli-painel`** → `painel.olliorcamentos.online` (legado morto, branch
  `legado/handoff-2026-06`).
- **Worker `olli-diagnostico`** → `diagnostico.olliorcamentos.online`.
- DNS/zone `olliorcamentos.online` no Cloudflare. Worker de links em
  `link.olliorcamentos.online`.
- `public/_redirects`: `/* /index.html 200` (fallback SPA). `public/_headers`: COEP/COOP —
  **desaparecem no rebuild** (só existiam por causa do SQLite-WASM).

### 7.2 Secrets do worker — RESOLVIDO (não é mais preocupação)

Já resolvido pelo dono: a integração **"Workers Build"** (build do worker por Git) foi
**removida** do Cloudflare. Com ela fora, **push na `main` NÃO apaga mais os secrets do worker** —
ficam estáveis. Deploy do worker é manual (`wrangler deploy`); `worker/reparar.mjs` só (re)semeia
os secrets do cofre se algum dia precisar. Regra simples que sobra: **não reconectar** o worker a
build automático por Git, e secrets ficam só nos secrets do worker / cofre local (nunca no código
nem em env do front). A web nova não toca no worker — esta nota é só pra você não recriar o
problema antigo.

### 7.3 Deploy da web nova

- Criar projeto NOVO **Cloudflare Pages** (`olli-web`), root directory `web/`, build `astro build`,
  saída `dist`, sem tocar no `olli-app` (que segue servindo a web velha até o cutover).
- Preview deployments por branch LIGADOS no `olli-web` (e continuam desligados no legado).
- Enquanto o `olli-app` existir conectado à `main`, cada push também re-builda a web velha —
  inofensivo, mas se incomodar, pausar auto-deploy do `olli-app` no dashboard (não deletar).
- Cutover (só no fim): mover o domínio custom `app.olliorcamentos.online` do projeto `olli-app`
  para o `olli-web`. DNS não muda de zona; é troca de custom domain entre projetos.
- Na web nova não há `_headers` COEP/COOP; adicione, isso sim, headers de segurança padrão
  (CSP razoável, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`).

---

## 8. Plano de BACKUP LÓGICO + deleção

> ### AVISO CRÍTICO — REPO COMPARTILHADO
> O repositório contém o **APK nativo (produto mobile, FUNCIONA)** e a web RN-web no MESMO
> código. **É PROIBIDO deletar código React Native/Expo** — quebraria o APK. A "web antiga"
> removível é APENAS: o caminho de export web (`npm run export:web`, pasta `dist`), arquivos
> `*.web.tsx` (ex.: `src/screens/LandingScreen.web.tsx`), a config `web` do `app.json`,
> `public/_headers`/`_redirects` usados só pelo export web, e o projeto Pages `olli-app`.
> Hooks como `useEhDesktop` e telas `desktop/` são importados pelo código RN — **ficam**.

### 8.1 Backup lógico (PASSO 1, antes de qualquer coisa)

```bash
git tag web-rn-web-backup-2026-07-13
git branch backup/web-rnweb
git push origin web-rn-web-backup-2026-07-13 backup/web-rnweb
```

- NÃO apagar o projeto Pages `olli-app` até a web nova estar no ar e validada — a troca do
  domínio é o ÚLTIMO passo.
- Opcional (recomendado): baixar um zip do último deploy do `olli-app` como artefato.

### 8.2 Arquitetura de isolamento

A web nova vive em **`web/` (novo diretório no repo)** — projeto separado com `package.json`
próprio, que consome o MESMO backend. O APK RN fica 100% intacto; a web nova evolui isolada.
(Repo próprio também seria válido, mas o monorepo facilita compartilhar os módulos TS de
`src/services/` e mantém o histórico em um lugar só.)

### 8.3 Sequência completa

1. **Tag + branch de backup** (8.1).
2. **Andaimar `web/`** isolada + projeto Cloudflare `olli-web` com preview.
3. **Reconstruir por fases** (seção 5): auth → orçamentos → clientes → operação → ferramentas
   → billing → IA.
4. **Cutover:** apontar `app.olliorcamentos.online` para o `olli-web` (mover custom domain).
   Manter `olli-app` de pé (sem domínio) por 1–2 semanas como rollback.
5. **Aposentar `olli-painel`:** remover o custom domain `painel.olliorcamentos.online` e
   deletar o projeto Pages (o código continua na branch `legado/handoff-2026-06`, preservado).
6. **Só então** limpar os artefatos web do RN: script `export:web` do `package.json`, bloco
   `web` do `app.json`, `*.web.tsx`, `_headers`/`_redirects` do export, deps web-only
   (ex.: WASM do `expo-sqlite` para web se listada) — **cada remoção validada com um build do
   APK** (`npx expo prebuild`/build Android OK) antes do commit. Por fim, deletar o projeto
   Pages `olli-app`.

---

## 9. Branding / UX

- **Nome:** OLLI Orçamentos. **Taglines:** "Do orçamento ao recibo, sem planilha" /
  "Orçamentos que fecham negócio".
- **Fontes:** Plus Jakarta Sans (texto/UI) + Spectral (display serif). Self-host via
  `@fontsource` (sem FOUT de Google Fonts em runtime, sem request externo no boot).
- **Logo/mascote:** "OLLI" (símbolo próprio; assets nos componentes `OlliLogo`/`OlliMascot` do
  app RN — exportar os SVGs de lá).
- **Público:** prestadores de serviço de campo no Brasil — climatização/HVAC, pintura,
  elétrica etc. Tom direto, sem jargão de SaaS; o usuário é o dono/técnico da empresa.
- **Produto:** sistema de gestão de campo — orçamento → OS → recibo → PMOC.
- **UX web:** desktop-first (sidebar + área de trabalho densa, tabelas de verdade, atalhos),
  degradando com elegância — em telas pequenas os MESMOS padrões web se reorganizam (tabela →
  cards, sidebar → drawer). Nunca renderizar uma "UI de celular". Animações discretas
  (CSS/`prefers-reduced-motion`), nada de loops de animação contínuos.
- Idioma: 100% pt-BR, incluindo mensagens de erro.

---

## 10. Checklist de "pronto" (definição de 100% redondo)

**Anti-regressão da causa-raiz**
- [ ] Zero `react-native-web`, zero `expo-*` no bundle da web.
- [ ] Zero service worker / manifest / install prompt (sem PWA). Auditar build final.
- [ ] Sem SQLite-WASM; sem headers COEP/COOP; boot = 1 paint direto na página certa, sem
      splash em cascata nem "salto" de navegação.
- [ ] Em 320px, 768px, 1024px e 1440px a UI é sempre WEB (redimensionar a janela ao vivo não
      "vira app" nem exige F5).
- [ ] Toda rota funciona com F5 e deep-link (fallback SPA correto em `/app/*`).

**Funcional**
- [ ] Login email + Google + Apple; convite de equipe; onboarding.
- [ ] CRUD completo: orçamentos (criar/editar/PDF/link público), clientes, produtos, serviços,
      OS, agenda, equipe.
- [ ] Gate por vertical com testes unitários batendo com `verticais.ts` (HVAC com ofício
      `refrigeracao` não vê pintura; sem ofício [`[]`] vê tudo; **`'geral'` esconde nicho — NÃO é coringa**).
- [ ] Créditos Pix (MP) e assinatura testados em sandbox; status confirmado via webhook.
- [ ] OlliChat + DiagnosticoIA funcionando via worker (token Supabase no header).
- [ ] Links públicos `/o/`/`/q/` (worker) continuam funcionando — não regredir.
- [ ] Conta demo (`demo@grtech.com.br`) navegável de ponta a ponta sem erro de console.

**Qualidade/entrega**
- [ ] Lighthouse na landing ≥ 90 (Performance/SEO/Accessibility); app com bundle inicial
      enxuto (code-splitting por rota).
- [ ] TypeScript strict + lint limpos no CI; smoke E2E (login → criar orçamento → PDF) verde.
- [ ] Domínio trocado, `olli-painel` aposentado, artefatos web do RN removidos COM build do
      APK validado, tag/branch de backup preservadas.

---

## 11. Decisões já tomadas pelo dono (2026-07-13) + o que resta

O dono delegou as decisões abaixo ("decide o que for melhor; se tiver dúvida, pesquise") e deu
**autorização mestre** (inclusive pra usar o Chrome logado dele quando for EXECUTAR). Estas são
DECISÕES, não perguntas — implemente conforme abaixo:

### 11.1 Landing / domínio → **v1 em `app.olliorcamentos.online`, código pronto pra mudar depois**
Landing + app no MESMO domínio na v1 (cutover único, zero risco de migração de SEO agora). MAS
estruture as URLs e o `sitemap`/`robots`/canonical de forma que mover a landing para o domínio
raiz (o dono cogita consolidar em **`useolli.com.br`**) seja depois só troca de host + redirects
301 — não reescrita. Não acople caminhos ao domínio no código. *(Na v1 a landing fica em
`app.olliorcamentos.online/` mesmo; o SEO técnico é HTML estático — o Lighthouse ≥90 do checklist
se atinge ali. Ranking de marketing é objetivo pós-consolidação em `useolli.com.br`.)*

### 11.2 Paywall do plano Empresa → **construir a CAMADA de entitlements, manter Empresa ABERTO na v1**
Decisão embasada em best practice de monetização SaaS (médio/longo prazo): **não** espalhar
`if (plano === 'empresa')` pelo código. Em vez disso:
- Criar uma **camada de entitlements/capabilities** (`web/src/lib/entitlements.ts`): um mapa
  `plano → capacidades` (ex.: `equipe.membrosMax`, `os.avancada`, `relatorios.export`). A UI e o
  worker perguntam "esta conta PODE X?", nunca "esta conta É Empresa?".
- **v1 = todos grandfathered** (Empresa aberto, como hoje) — ligar o paywall depois é mudar o
  MAPA, não deployar código novo.
- **Enforcement no SERVIDOR (worker) é obrigatório** — o gate no client é só UX; a verdade é
  server-side. Respeite os **3 estados** (`carregando | erro | valor`): "não sei o plano" NUNCA
  vira "liberado" nem "bloqueado" silenciosamente (bug recorrente do projeto).
- Fontes: entitlements > plan-checks e grandfathering por flag/versão de plano —
  Stigg, Schematic, Chargebee (links no fim desta seção).

### 11.3 Câmera/QR e mapa da equipe → **construir tudo na web; deixar a chave do Maps OFF**
- **EscanearQr / câmera na web: SIM** — implementar leitura de QR via `getUserMedia`
  (BarcodeDetector com fallback a lib de QR), com entrada manual do código como degradação.
- **EquipeAoVivo (mapa) na web: SIM, construir** o componente de mapa, porém deixá-lo
  **pronto-pra-ligar com a chave desligada** (`PUBLIC_MAPS_KEY` vazia → cai para lista + rota
  externa). O dono liga a chave depois (passo humano). "Deixa tudo pronto no app e só liga depois."
- Regra geral do dono: **"faça tudo o que conseguir"** — inclua todas as ferramentas na web nova;
  o que depende de passo humano (chave/OAuth) fica pronto e desligado, não ausente.

### 11.4 Ainda depende do dono (passo humano — não bloqueia codar, bloqueia LIGAR)
- **Google Agenda na web:** o OAuth atual é client **Android**
  (`EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`). A web precisa de um **OAuth client Web** no
  Google Cloud (o dono cria). Construa a integração pronta; fica desligada até a credencial existir.
- **Google Maps key:** billing já ligado no projeto `olli-orcamentos`; o dono habilita/injeta
  `PUBLIC_MAPS_KEY` quando quiser o mapa embutido no ar.
- **Aposentar `olli-painel`:** confirmar que ninguém usa `painel.olliorcamentos.online` antes de
  deletar o projeto Pages (o código fica preservado na branch `legado/handoff-2026-06`).
- **Local-first na web = NÃO** (decidido): online-first direto no Supabase; o offline continua
  sendo papel do APK.
- **Antes de "deixar pronto e desligado", leia os registros de bloqueio do repo:**
  `docs/KNOWN_BLOCKERS.md` e `docs/INTEGRATION_BACKLOG.md`, e a camada de contratos
  `src/services/ports/` (interfaces `AiProvider`, `PaymentProvider`, `CalendarProvider`,
  `DocumentRenderer`, `SignatureProvider`, `EmailProvider`, `FiscalProvider`, `MapsProvider`…).
  Eles dizem o que está **bloqueado por passo humano** e não pode ser dado como "ligado": PDF
  autoritativo server-side (Gotenberg — `docs/ADR-0007-gotenberg-pdf.md`), assinatura formal
  (Documenso), fiscal e envio por e-mail. Construa desligado, não ausente (11.3).

Sources (paywall/entitlements): [Stigg — Entitlements](https://www.stigg.io/blog-posts/entitlement-management-system) · [Schematic — Entitlements Layer](https://schematichq.com/blog/the-entitlements-layer-how-saas-products-control-customer-access) · [Chargebee — Grandfathering](https://www.chargebee.com/docs/billing/2.0/entitlements/grandfathering-entitlements)

---

*Fim do briefing. Qualquer fato de produto não coberto aqui: leia o código-fonte
(`src/services/`, `src/types/`, `worker/src/`) — nunca escreva de memória.*
