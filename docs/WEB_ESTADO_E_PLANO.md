# OLLI — Web: estado, decisões e próximos passos (ideias guardadas)

> **Documento-mestre da reconstrução da WEB do OLLI.** Guarda TUDO pra não se
> perder: o que está pronto, as decisões, o que falta e os **planos passo a
> passo** (limpeza de Cloudflare/GitHub, deploy, CRUD, OAuth, APK).
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
- Refeita do zero na marca OLLI. **Hero 3D**: navegador com o print real do painel + **smartphone premium** (moldura metálica, dynamic island, tela de app OLLI caprichada) — Motion + CSS 3D, **sem loop contínuo**, parallax por MotionValue, respeita reduced-motion.
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

## 3. O QUE FALTA — com PLANO passo a passo

### 3.1 🔴 Limpeza de Cloudflare + GitHub (passo com o DONO — interativo)
> **Por que não foi feito no automático:** o MCP do Cloudflare precisa de **login interativo** (não autentico em sessão headless); e apagar coisa no GitHub é **destrutivo**. O histórico avisa: **mexer errado derruba o worker/APK que estão no ar**. Então é feito COM você, com cuidado.

**REGRA DE OURO:** **NUNCA tocar no Worker `olli-diagnostico`** (é a IA + pagamentos + links, no ar em `diagnostico.olliorcamentos.online`). E **push na `main` publica sozinho** (Cloudflare Pages `olli-app`).

**Cloudflare Pages — inventário e o que fazer:**
| Projeto | Domínio | O que é | Ação |
|---|---|---|---|
| `olli-app` | `app.olliorcamentos.online` | a web RN-web ANTIGA (mobile no browser) | **manter até o cutover**; depois do deploy do novo, mover o domínio pro `olli-web` e então aposentar |
| `olli-painel` | `painel.olliorcamentos.online` | **legado morto** (branch `legado/handoff-2026-06`) | **aposentar**: remover custom domain + deletar o projeto Pages (código preservado na branch) |
| Worker `olli-diagnostico` | `diagnostico.olliorcamentos.online` | IA/pagamentos/links — **VIVO** | **NÃO TOCAR** |

Ordem segura: (1) confirmar que ninguém usa `painel.olliorcamentos.online` → aposentar `olli-painel`; (2) criar o `olli-web` novo e deployar (§3.2); (3) só no fim, cutover do domínio `app.olliorcamentos.online` do `olli-app` → `olli-web`, mantendo o `olli-app` de pé ~1-2 semanas como rollback.

**GitHub — o que fazer:**
- **NÃO apagar `main`** (é o app real e auto-deploya). **NÃO reconectar** "Workers Build" (apagava os secrets do worker — já resolvido, não recriar).
- Limpeza = **arquivar branches velhas já mergeadas** (renomear pra `archive/…` ou deletar as claramente mortas), confirmando antes que nenhuma dispara deploy. Backups desta branch (tag + `backup/pre-redesign-2026-07-14`) ficam preservados.
- Merge desta branch (`claude/website-improvement-0d741a`) na main = **publica a web nova** — fazer só quando decidir o cutover.

### 3.2 🟠 Deploy da web nova
- **Landing:** projeto Pages novo (sugestão `olli-web`), root `web/`, build `astro build`, saída `dist`. Preview por branch ligado.
- **Painel:** é um SPA Vite (`webapp/`, build `vite build`, `dist`). Serve num caminho/subdomínio (ex.: `app.olliorcamentos.online` ou `/app`), com fallback SPA (`/* → index.html 200`).
- Headers de segurança (CSP razoável, X-Frame-Options, Referrer-Policy). **Sem** COEP/COOP (eram do SQLite-WASM, que morreu).
- Cutover de domínio por último (§3.1).

### 3.3 🟠 CRUD de escrita (criar/editar)
- Hoje as telas **listam e buscam** (leitura). Falta **criar/editar** orçamento/cliente/etc.
- **CRÍTICO — tenancy de escrita:** quando o autor é membro NÃO-dono (técnico/gestor), carimbar `user_id = ownerUserId` (via `getMinhaOrganizacao`), senão a linha nasce no tenant errado e o dono não vê. Writes normais não enviam `user_id` (RLS + `auth.uid()` preenchem). Fonte: `src/services/cloudSync.ts` (`toRow`).

### 3.4 🟡 OAuth Google/Apple (passo humano)
- Os botões estão prontos. Falta **adicionar os redirect URLs no painel do Supabase** (e um OAuth client **Web** no Google Cloud — o atual é Android). Enquanto isso, login por email/senha funciona.

### 3.5 🟡 APK / app do celular (redesign)
- O dono quer o app do celular (Expo/RN) repaginado, **casando com a web** (mesmo design system). **Não dá pra compilar o APK aqui** → o dono valida o build; eu escrevo, ele testa, corrige em cima.
- Compartilhar os **tokens de marca** (cores/tipografia). O RN já usa o azul `#0B6FCE` (coresMarca) → já consistente na cor.

---

## 4. Cuidados / gotchas (pra não quebrar nada)
- **Repo compartilhado com o APK que funciona** → **proibido deletar código RN/Expo**.
- **Worker `olli-diagnostico`** = vivo, não tocar. Push na main auto-deploya.
- Secrets do worker moram no worker/cofre local — nunca no código nem em env do front. Só valores públicos (Supabase URL + anon key) no front.
- Playwright (MCP) está enraizado noutro worktree (`full-audit-platform-updates-5ba65a`) — os prints caem lá.

## 5. Backlog / ideias soltas (pra não esquecer)
- Consolidar domínio de marca em `useolli.com.br` (dono cogita) — estruturar URLs/sitemap pra ser só troca de host + 301.
- Paywall do plano Empresa: camada de **entitlements** (`plano → capacidades`), Empresa aberto por grandfathering, enforcement no **worker** (server-side). Não espalhar `if (plano==='empresa')`.
- Mapa "Equipe ao vivo": construir pronto com `PUBLIC_MAPS_KEY` desligada (dono liga depois).
- PDF/print, link público `/o/<token>`, IA (chat/voz) e ferramentas de ofício (calculadoras/PMOC/diagnóstico) — portar do app conforme a fase.

---

*Fim. Fonte de verdade de produto que não estiver aqui: ler o código
(`src/services/`, `src/types/`, `worker/src/`) — nunca escrever de memória.*
