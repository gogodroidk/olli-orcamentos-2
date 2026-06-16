# OLLI Orçamentos — Painel Web (PWA)

Painel web da **OLLI Orçamentos**. Compartilha os **mesmos dados** do app mobile
(React Native / Expo, em `../src`) através do **Supabase** e pode ser **instalado
na tela inicial** do iPhone (Safari) e Android (Chrome) como um PWA.

> **Estilo é provisório.** A identidade visual virá depois, do dono do produto.
> Por isso a UI aqui é mínima e neutra, centralizada em `src/styles.css` e em
> variáveis CSS (`:root`), para que um novo design entre com pouca mudança.

## Stack

- **Vite + React + TypeScript** (modo `strict`)
- **react-router-dom** para rotas
- **@supabase/supabase-js** para dados + autenticação
- **vite-plugin-pwa** para instalabilidade (service worker, manifest)

## Pré-requisitos

- Node 18+ (testado em Node 22)
- npm

## Configuração

As credenciais públicas do Supabase ficam em `web/.env` (já incluído). A
**anon key é pública e segura no cliente** — o Row Level Security (RLS) de cada
tabela garante que um usuário logado só enxerga as próprias linhas.

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Para outro ambiente, copie `web/.env.example` para `web/.env` e preencha.

## Como rodar (desenvolvimento)

```bash
cd web
npm install
npm run dev
```

Abra o endereço que o Vite imprimir (ex.: http://localhost:5173).
O service worker fica **desligado em dev** para evitar cache antigo.

## Como gerar a build de produção

```bash
cd web
npm run build      # gera ícones, checa tipos (tsc) e compila para dist/
npm run preview    # serve a build localmente para testar (inclui o PWA)
```

O `dist/` é estático e pode ser hospedado em qualquer CDN/host. Por ser uma
SPA, configure o host para reescrever rotas desconhecidas para `index.html`
(o service worker já faz esse fallback offline via `navigateFallback`).

## Ícones do PWA

Ícones **placeholder** (quadrado #0A2540 com o texto "OLLI") são gerados por
`scripts/generate-icons.mjs` (sem dependências) para `public/`:
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`,
além de `favicon.svg`. O `npm run build` os regenera automaticamente
(`prebuild`). Para regenerar manualmente: `npm run icons`. Basta trocar esses
arquivos quando o design final chegar.

## Como instalar como app (PWA)

**Android (Chrome):** abra o site → menu (⋮) → **"Instalar app"** /
**"Adicionar à tela inicial"**.

**iOS (Safari):** abra o site → botão **Compartilhar** → **"Adicionar à Tela
de Início"**. Graças às metatags `apple-mobile-web-app-capable` e
`apple-touch-icon` no `index.html`, o app abre em **tela cheia** (sem a barra do
Safari), com a status bar no tom da marca.

> PWAs exigem **HTTPS** (ou `localhost`). Em produção, sirva por HTTPS para que
> a instalação e o service worker funcionem.

## Estrutura

```
web/
  index.html                 metatags de viewport / PWA / apple-touch-icon
  vite.config.ts             plugin react + vite-plugin-pwa (manifest + workbox)
  scripts/generate-icons.mjs gerador de ícones placeholder (sem deps)
  public/                    favicon.svg + ícones PNG gerados
  src/
    main.tsx                 entrada: Router + AuthProvider + App
    App.tsx                  definição de rotas
    styles.css               estilo neutro centralizado (variáveis CSS)
    lib/
      supabase.ts            client Supabase (env vars)
      types.ts               tipos das tabelas + payloads jsonb (dados)
      api.ts                 CRUD tipado por tabela (list/get/upsert/remove)
      format.ts              formatação BRL / data (pt-BR)
    auth/
      AuthContext.tsx        sessão (login/signup/logout), persistência
      ProtectedRoute.tsx     redireciona para /login quando deslogado
    hooks/useAsync.ts        carregamento assíncrono (data/loading/error/reload)
    components/              Layout (sidebar+logout), DataState, StatusBadge
    pages/                   Login, Signup, Dashboard, Orçamentos, Clientes,
                             Serviços, Produtos
```

## Dados

As tabelas e os formatos de `dados` (jsonb) seguem o schema do Supabase descrito
no `AGENTS.md`/`CLAUDE.md` do repositório e espelham os tipos do app mobile
(`../src/types/index.ts`), para manter os dois clientes compatíveis. Em todas as
escritas, o `user_id` é preenchido pelo RLS (`auth.uid()`) — o cliente nunca o
envia. `upsert` usa o alvo de conflito correto por tabela (`empresa` → `user_id`;
`contadores` → `user_id,chave`; demais → `id`).
