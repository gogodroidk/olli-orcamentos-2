# Sessão 16/06/2026 — Etapas 0 e 1 construídas (o anzol no ar)

Continuação a partir do `OLLI_HANDOFF.zip`. O zip foi **desempacotado no repositório**
(app, backend, web, design, pesquisa, contexto_memoria + docs de planejamento), tornando o
código versionável. O zip original foi preservado na raiz. Branch: `claude/amazing-newton-49g66j`.

## Etapa 0 — Fundação ✅
- **0.1 segmento:** `Empresa.segmento` (ar-condicionado/elétrica/hidráulica/pintura/outro),
  com seletor em chips no **Meu Negócio** e default `ar-condicionado`. Núcleo genérico,
  lançamento vertical. (`types/index.ts`, `database.ts`, `MeuNegocioScreen.tsx`)
- **0.2 git:** repo com commits curtos por etapa.
- **0.3 cache de IA:** tabela `cache_ia(chave, resposta, criado_em)` + `getCacheIA/setCacheIA`.
  Base para o diagnóstico-IA da Etapa 2 (cache por código+marca antes de chamar a API).
- **0.4 eventos:** tabela `eventos` + `insertEvento/getEventos` + `services/analytics.ts`
  com `track(evento, props)` (fire-and-forget) e constantes `Eventos`. Instrumentação do
  funil desde o dia 1 (signup, quote_*, error_code_searched/opened/not_found, ai_used…).

## Etapa 1 — O anzol: Códigos de erro (sem IA) ✅
- **1.1/1.2:** tabela `codigos_erro` (+índices marca/código) e **importação dos 602 códigos**
  de `assets/codigos_erro.json` na 1ª abertura (`seedCodigosErro`, idempotente, transação).
- **1.3/1.4:** `CodigosErroScreen` — busca livre (código/marca/sintoma, ex.: "E4", "LED
  piscando") + **filtro por marca em chips**; resultado estruturado e, no detalhe, falha,
  causa provável, ação inicial segura, severidade, confiança, exibição, categoria, **fonte
  auditável (link)** e observação.
- **1.5:** **Regra de ouro** sempre visível (peça marca+modelo, veja a confiança, nunca troque
  a placa sem testar) + bloco "Antes de trocar a placa" no detalhe. Feature + blindagem jurídica.
- **1.6:** "**Não achei meu erro**" → salva o caso em `casos_erro` (marca/modelo/código/sintoma)
  e dispara `error_code_not_found` para enriquecer a base.
- **Pontos de entrada:** nova aba **Diagnóstico** (2ª posição), card-anzol na **Home** e item no
  **Catálogo**. Gancho "Perguntar à OLLI" preparado para a Etapa 2 (ainda sem chave).

## Backend
- `backend/migrations/0002_create_etapa0_etapa1_schema.sql`: `cache_ia` e `codigos_erro`
  (globais, leitura p/ autenticados), `eventos` e `casos_erro` (por usuário, RLS owner).
  **Não aplicada** ao projeto vivo (`yiaeplqinnnnniyvwtls`) — o app roda 100% offline com SQLite;
  aplicar quando for ligar sync/diagnóstico-IA/painel master.

## Qualidade
- `npm install` OK; `npm run typecheck` (tsc --noEmit) **0 erros**.
- Padrões seguidos: `expo-sqlite` async, componentes Olli*, tema escuro cockpit, imports por arquivo.

## Próximo (precisa de chave do Igor)
Etapa 2 (diagnóstico IA — **Anthropic key**, usar `cache_ia` antes de chamar) · Etapa 3 (link do
cliente — **Cloudflare**) · Etapa 6 (planos — **Stripe**). Ver `PROCESSO_OLLI_0_a_100.md`.
