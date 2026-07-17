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

## RESEND_API_KEY / RESEND_FROM — e-mail transacional (prioridade 14, OPCIONAL)

Sem `RESEND_API_KEY` no cofre, o worker **não manda e-mail** e se comporta exatamente
como antes: o convite continua válido, o link vai na resposta e o app oferece o
compartilhar. É no-op, não erro.

Para ligar, nesta ordem:
1. Crie a conta em resend.com e gere uma API key.
2. **Verifique o domínio** no painel do Resend (registros DNS). O Resend só entrega de
   domínio verificado — sem este passo, a chave existe e o envio falha calado.
3. Guarde `RESEND_API_KEY` no cofre do worker (gate humano — ver o protocolo).
4. Opcional: `RESEND_FROM` (padrão `OLLI <nao-responda@olliorcamentos.online>`). Tem de
   ser um endereço do domínio verificado no passo 2.

Usado hoje no convite de equipe (`POST /equipe/convite`, quando o e-mail é informado).
Envio best-effort: falhar não derruba o convite.
