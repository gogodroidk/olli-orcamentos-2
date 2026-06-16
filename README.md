# OLLI — Orçamentos & Copiloto de Campo para Prestadores de Serviço

Plataforma para **prestadores de serviço** (lançamento vertical em **HVAC / ar-condicionado**,
arquitetura horizontal para qualquer segmento). O OLLI é o **copiloto de campo**: diagnostica
erro (base de **602 códigos** + IA), monta orçamento, envia link pro cliente aprovar, cobra e
organiza a operação do dia. Tema escuro "cockpit". Dono: **Igor — GR TECH Refrigeração**.

> Este repositório foi desempacotado a partir do `OLLI_HANDOFF.zip` (preservado na raiz).
> Comece lendo, **nesta ordem**, `HANDOFF_LEIA_PRIMEIRO.md` → `contexto_memoria/` →
> `PLANO_MESTRE_OLLI.md` → `PROCESSO_OLLI_0_a_100.md` → `council-report-olli-estrategia.md`.

## Estrutura do repositório

```
HANDOFF_LEIA_PRIMEIRO.md      Boot: leia primeiro
PLANO_MESTRE_OLLI.md          Visão, estratégia e arquitetura
PROCESSO_OLLI_0_a_100.md      Execução passo a passo (11 etapas, com checkboxes)
council-report-olli-estrategia.md   Veredito do Conselho (o que cortar/priorizar)
contexto_memoria/             Memória acumulada do projeto (perfil, decisões, design)
pesquisa/                     Pesquisa de campo + base de 602 códigos de erro (.xlsx)
design/                       Design handoff (HTML hi-fi das 12 telas)
app/olli-orcamentos/          O app (Expo / React Native / TypeScript) — base do produto
backend/                      Migrations Supabase (schema + RLS)
web/                          Painel web (esqueleto PWA)
OLLI_HANDOFF.zip              Pacote de handoff original (preservado)
```

## App (Expo / React Native)

```bash
cd app/olli-orcamentos
npm install
npx expo start          # abre o Metro; use Expo Go ou um emulador
npm run typecheck       # checagem de tipos (tsc --noEmit)
```

Stack: **Expo SDK 56 · React Native 0.85 · TypeScript · Supabase · expo-sqlite · expo-print**.
Fontes: **Plus Jakarta Sans** (UI) + **Spectral** (documentos/PDF).

### Estado da construção

Concluído (handoff): app funcional de orçamento (wizard de 4 etapas), PDF, catálogo
(serviços/produtos), clientes, recibo, backup na nuvem (Supabase), tema escuro "cockpit",
Home cockpit e a base de 602 códigos de erro exportada em `assets/codigos_erro.json`.

Implementado neste branch (Etapas 0 e 1 do `PROCESSO`):

- **Etapa 0 — Fundação:** campo `segmento` no cadastro da empresa; tabela `cache_ia`
  (cache de diagnóstico por `código+marca`); função `track(evento, props)` gravando em
  `eventos` (instrumentação desde o dia 1).
- **Etapa 1 — O anzol (Códigos de erro, sem IA):** tabela `codigos_erro` + importação dos
  602 códigos na primeira abertura; **tela de busca** (marca → busca livre por código/sintoma
  → diagnóstico estruturado: falha, causa, ação inicial, severidade, confiança e fonte
  auditável); filtro por marca em chips; **Regra de Ouro** visível; botão **"não achei meu
  erro"** que salva o caso (`casos_erro`) para enriquecer a base.

As próximas etapas (diagnóstico por IA, link do cliente, planos) dependem de credenciais do
Igor (Anthropic, Cloudflare, Stripe) — ver `PROCESSO_OLLI_0_a_100.md`.

## Backend (Supabase)

Projeto **OLLI ORCAMENTOS** (`yiaeplqinnnnniyvwtls`). Schema e RLS em `backend/migrations/`.
As tabelas de fundação novas (`cache_ia`, `eventos`, `codigos_erro`, `casos_erro`) têm a
migration correspondente em `backend/migrations/` pronta para aplicar quando for ligar o sync
na nuvem — o app já funciona 100% offline com SQLite local.
