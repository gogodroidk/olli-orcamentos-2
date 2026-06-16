# OLLI — Diagnóstico por IA (Cloudflare Worker)

A "OLLI Técnica": recebe um caso de campo e devolve um diagnóstico estruturado
(testes em ordem, peças suspeitas, *não faça ainda*, confiança, mensagem pro
cliente, sugestão de orçamento, fontes). **A chave da IA é secret do Worker —
nunca entra no app.**

- Código: `src/index.ts`. Provedor automático: **Gemini** se `GEMINI_API_KEY`
  estiver setada (padrão), ou **Claude** se `ANTHROPIC_API_KEY` estiver.
- Cache opcional em **KV** (binding `CACHE` → `olli-diagnostico-cache`, já criado).
- Worker publicado: `olli-diagnostico` → `https://olli-diagnostico.<conta>.workers.dev`.

```
POST /   body: { marca?, modelo?, codigo?, sintoma?, contextoBase? }
→ { ok: true, fonte: "ia"|"cache", modelo, diagnostico: {...} }
GET  /   → texto de saúde ("OLLI — Worker de diagnóstico…")
```

## Deploy

A configuração de deploy fica em **`wrangler.jsonc` na raiz do repositório**
(`main` aponta para `cloudflare/diagnostico/src/index.ts` e o binding KV `CACHE`).

### Via GitHub (recomendado — o que está em uso)
A conta Cloudflare está conectada a este repositório (Workers Builds). **Todo push
na `main` republica o Worker automaticamente** lendo o `wrangler.jsonc` da raiz.
Só falta o secret da chave:
- Painel do Worker → **Settings → Variables and Secrets → Add (Secret)** →
  `GEMINI_API_KEY` = sua chave do Google AI Studio.

### Via wrangler (alternativa manual, da raiz do repo)
```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy           # usa o wrangler.jsonc da raiz
```

## Onde pegar a chave do Gemini
**aistudio.google.com → Get API key → Create API key** (no projeto onde seu
faturamento já está configurado).

## Trocar pra Claude depois
Remova `GEMINI_API_KEY` e adicione `ANTHROPIC_API_KEY` (console.anthropic.com).
O Worker passa a usar o Claude sem mexer no código.
