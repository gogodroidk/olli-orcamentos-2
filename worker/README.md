# OLLI — Worker de IA (Gemini)

Backend de IA do app (diagnóstico, voz→itens, chat). A chave da IA fica **só aqui**
(secret do Worker), nunca no app.

## Endpoints
- `POST /` — diagnóstico técnico (OLLI Técnica)
- `POST /voz` — transcrição → itens de orçamento
- `POST /chat` — assistente conversacional
- `GET /` — health check (`{ ok:true, service:'olli-diagnostico', ia:'on'|'off' }`)

Todos os POST exigem `Authorization: Bearer <token Supabase>`.

## Deploy
```bash
cd worker
# 1) sobe o Worker (precisa estar logado: npx wrangler login)
npx wrangler deploy
# 2) define a chave do Google AI Studio (Gemini) — colar quando pedir:
npx wrangler secret put GEMINI_API_KEY
```

A URL sai no fim do deploy (ex.: `https://olli-diagnostico.SEU-SUBDOMINIO.workers.dev`).
Coloque-a no app em `.env.local`:

```bash
EXPO_PUBLIC_DIAGNOSTICO_URL=https://olli-diagnostico.SEU-SUBDOMINIO.workers.dev
```

## Variáveis
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_MODEL` → públicas (em `wrangler.jsonc`).
- `GEMINI_API_KEY` → **secret** (`wrangler secret put`).

Trocar o modelo: edite `GEMINI_MODEL` em `wrangler.jsonc` (ex.: `gemini-2.5-flash`) e re-deploy.

Sem a chave, o Worker responde `{ ok:false, motivo:'ia_nao_configurada' }` e o app usa
o fallback offline (602 códigos) — nunca quebra.
