# Sessão 16/06/2026 (parte 2) — Etapas 2 e 3 (esqueleto pronto, falta a chave)

Pedido do Igor: "faz tudo o que dá pra fazer e deixa pronto pra eu só colocar a chave".
Construído o esqueleto completo do **diagnóstico por IA** e do **link do cliente**, com a
arquitetura de segurança correta (chaves no servidor, nunca no app).

## Etapa 2 — Diagnóstico por IA (OLLI Técnica) ✅ (falta a key)
- **Edge Function** `supabase/functions/diagnostico/index.ts` (Deno, sem deps): guarda
  `ANTHROPIC_API_KEY` como **secret do servidor**; cache global por código+marca em `cache_ia`;
  chama a API Claude com **prompt caching** no system. Model default **`claude-opus-4-8`**,
  trocável por `OLLI_DIAGNOSTICO_MODEL` (ex.: sonnet/haiku p/ cortar custo). Prompt da OLLI
  Técnica **fiel ao briefing** (regra de ouro, "não faça ainda", tom direto).
- **App** `services/olliIA.ts`: cache local (SQLite) → Edge Function → **fallback pra base de
  602 códigos**. Nunca deixa o técnico na mão (offline-safe). Eventos `ai_used`.
- **Tela** `DiagnosticoIAScreen` ("Me ajuda com esse caso"): formulário + resultado nos 10
  campos do briefing; badge de origem (IA/cache/base) e aviso quando a IA não está ligada.
- **Entradas:** "Perguntar à OLLI" no detalhe do código + atalho "OLLI" no header de Diagnóstico.
- **Pendente:** `2.5` limite de IA no plano grátis (vai junto com a monetização, Etapa 6).
- **Pra ligar:** `supabase functions deploy diagnostico` + `supabase secrets set ANTHROPIC_API_KEY=...`.

## Etapa 3 — Link do cliente (Cloudflare + Supabase) ✅ parcial
- **`3.2` feito:** `cloudflare/orcamento-link` — Worker pronto p/ `wrangler deploy`: página
  clara com itens/total, **Aprovar/Recusar** (Post/Redirect/Get) e **Dúvida no WhatsApp**;
  rodapé "Feito com OLLI". Usa **service_role** (secret do Worker) p/ ler/gravar por token.
  Migration `backend/migrations/0003` cria `orcamentos_publicos` (snapshot + status, RLS).
- **App** `services/clienteLink.ts` + botão **"Link"** no Visualizar Orçamento (gera/reaproveita
  token, publica snapshot, compartilha; marca como enviado). `EXPO_PUBLIC_LINK_BASE_URL`.
- **Pendente (honesto):** `3.1` diagnóstico→orçamento em 1 toque · `3.3` push pro prestador na
  aprovação (`expo-notifications`) + auto-refresh · `3.4` cobrança automática por estágio
  (1/3/5/7 dias) · `3.5` "Receber agora" (Pix/link).
- **Pra ligar:** aplicar a migration `0003`, `wrangler secret put SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`, `wrangler deploy`, apontar o domínio e setar `EXPO_PUBLIC_LINK_BASE_URL`.

## Segurança (decisão congelada)
Chave Anthropic → Edge Function. service_role → Worker. O app só carrega a **anon key** pública.
Nenhuma chave secreta entra no bundle/APK.

## Qualidade
`npm run typecheck` (app) **0 erros** após cada etapa. Stripe (Etapa 6) **adiado pelo Conselho**
(pós-validação) — não construído de propósito.

## Atualização (mesmo dia) — Gemini + TUDO no Cloudflare
Igor vai usar **Gemini** (já tem faturamento lá) e quer tudo rodando no Cloudflare.
- **Diagnóstico migrou de Supabase Edge Function → Cloudflare Worker** `cloudflare/diagnostico`:
  **multi-provedor** (Gemini padrão `gemini-3.5-flash` / Claude opcional), cache em **KV**.
  A Edge Function do Supabase foi **removida** (sem duplicar implementação). O app agora chama o
  Worker por `EXPO_PUBLIC_DIAGNOSTICO_URL` (`olliIA.ts` via fetch). `config.DIAGNOSTICO_URL`.
- **Já feito por ferramenta (não precisa Igor):** KV `olli-diagnostico-cache`
  (id `193f53aa847447598e3f5b6b716ebdad`) criado; migration `0003` (`orcamentos_publicos`)
  **aplicada** no projeto `yiaeplqinnnnniyvwtls`.
- **Chaves (todas em Worker, nunca no app):** `GEMINI_API_KEY` → Worker `olli-diagnostico`;
  `SUPABASE_SERVICE_ROLE_KEY` → Worker `olli-orcamento-link`.

## Checklist do Igor para ativar (só isto)
- [ ] **IA:** publicar o Worker `olli-diagnostico` (painel ou `wrangler deploy`) + secret
      `GEMINI_API_KEY` (de aistudio.google.com) + setar `EXPO_PUBLIC_DIAGNOSTICO_URL` no app.
- [ ] **Link:** publicar o Worker `olli-orcamento-link` + secrets `SUPABASE_URL` /
      `SUPABASE_SERVICE_ROLE_KEY` + setar `EXPO_PUBLIC_LINK_BASE_URL` (workers.dev agora, domínio depois).
- [ ] Rebuild do app pra pegar as duas URLs (vars `EXPO_PUBLIC_*` são embutidas no build).
