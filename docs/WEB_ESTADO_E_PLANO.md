# OLLI — Web: estado, decisões e próximos passos (ideias guardadas)

> **Documento-mestre da reconstrução da WEB do OLLI.** Guarda TUDO pra não se
> perder: o que está pronto, as decisões, o que falta e os **planos passo a
> passo**. A web nova está **NO AR** desde 14/07/2026 (ver §3).
> **Data:** 2026-07-14 · **Branch:** `claude/website-improvement-0d741a`
> **Backup de segurança:** tag `olli-pre-redesign-2026-07-14` + branch `backup/pre-redesign-2026-07-14`.

---

## 1. Arquitetura (decidida e implementada)

- **Landing (site de marketing)** = **Astro** em `web/` — saída 100% estática (SSG), boa pra SEO/perf. É "a frente".
- **Painel (o app por dentro)** = **Vite + React 19 + shadcn/ui + Tailwind v4** em `webapp/` — base do template **Slash Admin** (MIT), rebrandeado OLLI. É "a outra".
- **Backend NÃO é reconstruído** — Supabase (auth+banco+RLS) + Worker Cloudflare `olli-diagnostico` (IA/pagamentos/links) + Mercado Pago **ficam como estão; a web só CONSOME**.
- **Marca:** azul `#0B6FCE` (primária) · ciano `#3FD8EA` · menta `#2BE39A` (sucesso/"aprovado") · navy `#0A2547`. Logo = mascote balão-documento com check.
- **Menos peças móveis** foi requisito (complexidade de build já quebrou o projeto antes). Landing e painel são dois builds estáticos.

### Como rodar (dev)
- Landing: `cd web && npm run dev` (ou `npx astro preview`).
- Painel: `cd webapp && npm run dev` → http://localhost:3001 (login demo **preenchido em DEV**).
- Conta demo (QA): `demo@grtech.com.br` / `GrTechDemo2026`.
- ⚠️ `pnpm`/`corepack` bloqueados nesta máquina → usar `npm install --legacy-peer-deps`.

---

## 2. O que JÁ ESTÁ PRONTO (feito, testado, commitado nesta branch)

**Landing (`web/`):**
- Refeita do zero na marca OLLI. **Hero 3D**: navegador com o painel DESENHADO EM CÓDIGO (não é print — o print antigo era a demo do template Slash) + **smartphone premium** (moldura metálica, dynamic island, tela de app OLLI caprichada) — Motion + CSS 3D, **sem loop contínuo**, parallax por MotionValue, respeita reduced-motion.
- Seções: como funciona, recursos, IA, **planos (R$0/39/99 — conferido no Stripe live)**, FAQ, CTA. Copy **derivada da fonte** (698 códigos, PMOC Lei 13.589/2018, features do `RECURSOS_POR_PLANO`).
- Páginas **Privacidade/Termos/Ajuda** (conteúdo real de `src/content/`), favicon OLLI, **og:image PNG 1200×630**, robots.txt, sitemap. Responsiva (testada 320/390/1440).

**Painel (`webapp/`):**
- **Auth REAL Supabase** (email/senha + OAuth Google/Apple) + `useAuthSync` (espelha a sessão no store; logout faz `signOut` de verdade + limpa cache + reseta marca).
- **100% pt-BR** (menu, login com BrandHero, casca, erros).
- Menu OLLI (Comercial/Operação/Ferramentas/Conta) + **telas com dados REAIS do Supabase** (RLS-scoped, regra dos 3 estados):
  - **Início** = dashboard premium (saudação, 6 StatCards, donut ApexChart "Orçamentos por status", "Orçamentos recentes").
  - **Listas premium** (Clientes/Orçamentos/Produtos/Serviços/Recibos/OS/Agenda/Equipe/Equipamentos) via `RecordListPage`: badges de status coloridos, mini-avatares, busca, contador; no **mobile viram cards**.
  - **Quadro** = Kanban de orçamentos (drag-and-drop, dnd-kit).
- **White-label**: a cor da marca da empresa (empresa.cor_marca) repinta o painel (`olli/branding.ts`).
- **Bundle 4.3MB → 1.03MB** (arrancado @faker-js/faker + MSW só no DEV; cruft do template removido → `_arquivo-antigo/`).
- Revisão adversarial (2 agentes) rodada e **bugs corrigidos**: OAuth social, logout, sessão expirada, vazamento white-label entre tenants, data com −1 dia (fuso), CTAs `/app` 404, og SVG→PNG, copy PMOC "certificado"→"doc de responsabilidade (ART)", motion sem loop, contraste do CTA.

**Arquivo:** a **1ª landing** ("SETPOINT", tema escuro) foi aposentada → `_arquivo-antigo/web-landing-setpoint/` (git mv, reversível, fora do build).

**Gates:** `tsc` do painel limpo · `astro check` 0/0/0 · os dois builds passam.

---

## 3. NO AR — o que foi publicado em 2026-07-14 ✅

> A web nova **está no ar**, o antigo saiu, e **o backend do app nunca parou**.
> Feito por troca a quente: o novo subiu num endereço de teste, foi verificado, e
> só então o domínio virou. Backups offline em `Entregas Claude\OLLI-web\backups\`
> (com `LEIA-ME.md` explicando o rollback).

**Topologia atual (Cloudflare):**
| Endereço | Servido por | O que é |
|---|---|---|
| `olliorcamentos.online` (raiz) | Worker **`olli-site`** (assets = `web/dist`) | **landing nova** (Astro) |
| `app.olliorcamentos.online` | Pages **`olli-painel-web`** (upload direto) | **painel novo** (Vite SPA) |
| `diagnostico.` + `link.` | Worker **`olli-diagnostico`** | 🔒 **backend — API, pagamentos, portal `/o/<token>`, `/admin`. NÃO TOCAR.** |
| ~~`painel.olliorcamentos.online`~~ | — | legado **apagado** (projeto + DNS) |
| `olli-app` (Pages) | — sem domínio — | web antiga, **dormente = rollback**. Apagar quando o dono confirmar. |

**Como republicar:**
```bash
cd web    && npm run build            # gera web/dist + o _headers com o CSP
cd ../site && npx wrangler deploy      # publica a LANDING na raiz

cd ../webapp && npm run build
npx wrangler pages deploy dist --project-name olli-painel-web --branch main
```
⚠️ **Não deixe `CLOUDFLARE_API_TOKEN` no ambiente** ao rodar o wrangler: o token do
`.env` é fraco (só lê zona) e **sobrescreve** o login OAuth bom. Use `env -u CLOUDFLARE_API_TOKEN`.

**Armadilha desativada:** `olli-app` e `olli-painel` eram **conectados ao Git** — todo
push republicava a web antiga por cima (a causa de "voltar pro antigo sozinho"). O
projeto novo é de **upload direto**; push não derruba mais nada.

**Bugs achados na verificação do deploy (todos corrigidos):**
- O hero anunciava a **demo do template Slash** como se fosse o produto (menu em inglês, botão "Join Discord", valores em dólar) — no site **e** na imagem de compartilhamento. O painel do hero agora é **desenhado em código**, em português.
- O painel buscava **todos os ícones na `api.iconify.design`** em runtime → se aquele servidor caísse, a UI ficava **sem ícone nenhum**. Agora os 45 ícones usados são empacotados (`webapp/scripts/gerar-icones-offline.mjs`).
- `flag-br.svg` não existia — e pt-BR é o idioma padrão.
- 26 MB de mascotes do template nas páginas de erro (bundle 17 MB → 3 MB).
- No celular, o mockup esticava a coluna do grid e **o título e os botões vazavam pra fora da tela**.
- Landing sem página 404; painel sem `noindex` e com título de marketing na aba.

**Segurança:** CSP de verdade nos dois (script inline autorizado por **hash**, não `unsafe-inline`), nosniff, `frame-ancestors none`, Referrer-Policy, Permissions-Policy. SPA fallback no painel.

---

## 4. O QUE AINDA FALTA

### 4.1 ~~🟠 CRUD de escrita (criar/editar)~~ → ✅ **FEITO. Esta seção estava ERRADA** (verificado 2026-07-16, item O0-6)

> ⚠️ **Não replique o "falta CRUD" daqui.** Esta seção sobreviveu à própria entrega e virou a
> contradição mais cara do projeto: planos e auditorias a citaram para orçar do zero um trabalho
> que **já estava no ar**. Fonte de estado é `docs/EXECUTION_LOG.md` — ver "FONTE ÚNICA DE ESTADO".

O CRUD de escrita **existe, está roteado, compila e está EM PRODUÇÃO**. Provas colhidas contra o
mundo (não leitura de código):

- **Existe e está ligado:** 7 formulários (`FormOrcamento` 1014 linhas, `FormRecibo` 750, `FormOs`
  505, `FormItemCatalogo` 482, `FormCliente` 462, `FormEquipamento` 385, `FormAgendamento` 378) +
  `ConvidarDialog`. Cada um é importado pelo `index.tsx` da sua página — nenhum é órfão.
- **Roteado:** `src/routes/sections/dashboard/frontend.tsx` registra as 9 rotas
  (`orcamentos`, `clientes`, `produtos`, `servicos`, `recibos`, `ordens-servico`, `agenda`,
  `equipamentos`, `equipe`).
- **Compila:** `pnpm build` (que é `tsc && vite build`) → **exit 0**, e o Vite emite
  `FormOrcamento-*.js` como chunk lazy próprio (código morto não vira chunk de rota).
- **Está no ar:** o bundle servido em `app.olliorcamentos.online` referencia
  `FormOrcamento-CDjBaQRp.js` / `FormCliente-*.js` / `FormOs-*.js`; o chunk baixa (HTTP 200,
  21.753 bytes — **o mesmo tamanho do build local**, logo o deploy bate com o fonte) e contém a
  UI real ("Novo orçamento", "Editar orçamento", "Adicionar item", "Desconto", "Validade").
- **A escrita é centralizada** em `webapp/src/olli/mutacoes.ts` (`useSalvar` / `useExcluir`),
  não espalhada nos formulários.

**A tenancy de escrita já está resolvida — e melhor do que o texto antigo pedia.** O antigo mandava
usar `getMinhaOrganizacao`, que **colapsa erro em `null`** e faria justamente a linha nascer no
tenant errado. O `useSalvar` faz o certo: **3 estados**. `isLoading` → "Carregando seu perfil…";
`isError`/sem dado → **bloqueia a gravação** ("Não consegui confirmar a qual empresa este registro
pertence"); só com o papel confirmado grava, carimbando `user_id = ownerUserId` para membro não-dono
(`TABELAS_DO_TENANT_DO_DONO`). Confirmado **em produção**: varridos os 89 chunks servidos, as duas
mensagens estão em `mutacoes-FhDJ1ecc.js`. Exclusão é **soft delete** (carimba `excluidoEm` no blob
+ `excluido_em` na coluna), senão o próximo sync do celular ressuscitaria o registro.

**O que de fato falta aqui (o resíduo honesto):** um *smoke test* autenticado na conta demo —
abrir `/orcamentos`, salvar e ver a linha no banco. Não foi feito porque exige digitar a senha da
conta demo, coisa que o piloto não faz. É ~2 minutos do dono. Tudo que **não** depende de sessão
já está provado acima.

### 4.2 🟡 OAuth Google/Apple (passo humano)
- Os botões estão prontos. Falta **adicionar os redirect URLs no painel do Supabase** (e um OAuth client **Web** no Google Cloud — o atual é Android). Enquanto isso, login por email/senha funciona.

### 4.3 🟡 APK / app do celular (redesign)
- O dono quer o app do celular (Expo/RN) repaginado, **casando com a web** (mesmo design system). **Não dá pra compilar o APK aqui** → o dono valida o build; eu escrevo, ele testa, corrige em cima.
- Compartilhar os **tokens de marca** (cores/tipografia). O RN já usa o azul `#0B6FCE` (coresMarca) → já consistente na cor.

---

## 5. Cuidados / gotchas (pra não quebrar nada)
- **Repo compartilhado com o APK que funciona** → **proibido deletar código RN/Expo**.
- **Worker `olli-diagnostico`** = vivo, não tocar. Push na main auto-deploya.
- Secrets do worker moram no worker/cofre local — nunca no código nem em env do front. Só valores públicos (Supabase URL + anon key) no front.
- Playwright (MCP) está enraizado noutro worktree (`full-audit-platform-updates-5ba65a`) — os prints caem lá.

## 6. Backlog / ideias soltas (pra não esquecer)
- Consolidar domínio de marca em `useolli.com.br` (dono cogita) — estruturar URLs/sitemap pra ser só troca de host + 301.
- Paywall do plano Empresa: camada de **entitlements** (`plano → capacidades`), Empresa aberto por grandfathering, enforcement no **worker** (server-side). Não espalhar `if (plano==='empresa')`.
- Mapa "Equipe ao vivo": construir pronto com `PUBLIC_MAPS_KEY` desligada (dono liga depois).
- PDF/print, link público `/o/<token>`, IA (chat/voz) e ferramentas de ofício (calculadoras/PMOC/diagnóstico) — portar do app conforme a fase.

---

*Fim. Fonte de verdade de produto que não estiver aqui: ler o código
(`src/services/`, `src/types/`, `worker/src/`) — nunca escrever de memória.*
