# OLLI — Worker de IA (OpenRouter + Cloudflare)

Backend de IA do app (diagnóstico, voz→itens, chat). O raciocínio textual usa
modelos gratuitos e explícitos no OpenRouter; a voz é transcrita pelo binding
Workers AI antes de virar texto. As chaves ficam **só aqui** (secrets do Worker),
nunca no app ou no APK.

## Endpoints
- `POST /` — diagnóstico técnico (OLLI Técnica)
- `POST /voz` — transcrição → itens de orçamento
- `POST /voz/conversa` — conversa guiada → itens de orçamento
- `POST /transcrever` — áudio → texto, ou áudio → texto → itens
- `POST /chat` — assistente conversacional
- `GET /` — health check (`{ ok:true, service:'olli-diagnostico', ia:'on'|'off' }`)

Todos os POST exigem `Authorization: Bearer <token Supabase>`.

## Deploy

Ordem obrigatória de produção (o Worker falha fechado se a cota ainda não
existir):

1. aplique `supabase/migrations/20260817_openrouter_quota_diaria.sql`;
2. confirme, com `service_role`, as RPCs `reservar_cota_ia_diaria`,
   `consumir_cota_ia` e `consumir_creditos_atomico` usando uma transação de
   canário que termina em `ROLLBACK`;
3. grave a chave **dedicada** do OLLI como secret;
4. rode testes + dry-run, depois faça o deploy;
5. faça um canário autenticado com usuário de teste e conteúdo sintético.

```bash
cd worker
# Depois da migration/canário do banco, grave a chave dedicada:
npx wrangler secret put OPENROUTER_API_KEY
# Verifique o pacote antes de publicar:
npm run test:ai
npm run test:audio
npm run test:body
npx wrangler deploy --dry-run
# Só então publique (precisa estar logado no Wrangler):
npx wrangler deploy
```

A URL sai no fim do deploy (ex.: `https://olli-diagnostico.SEU-SUBDOMINIO.workers.dev`).
Coloque-a no app em `.env.local`:

```bash
EXPO_PUBLIC_DIAGNOSTICO_URL=https://olli-diagnostico.SEU-SUBDOMINIO.workers.dev
```

## Variáveis
- `AI_PROVIDER=openrouter` e `OPENROUTER_TEXT_MODELS` → públicas (em `wrangler.jsonc`).
- `OPENROUTER_API_KEY` → **secret** (`wrangler secret put`).
- `AI` → binding Workers AI para transcrição; não é uma chave no APK.
- `GEMINI_MODEL`/`GEMINI_API_KEY` existem apenas para rollback deliberado com
  `AI_PROVIDER=gemini`; não há troca silenciosa de fornecedor.

Trocar os modelos: edite `OPENROUTER_TEXT_MODELS`. Só IDs explícitos terminados
em `:free` são aceitos; `openrouter/free` e modelos pagos são recusados.

Toda chamada ao OpenRouter envia `provider.data_collection=deny`. Isso impede
rotas que declaram coleta para treinamento, mas não equivale a ZDR garantido.
O áudio não é enviado ao OpenRouter. Não registre prompt, resposta ou transcrição.

Essa migration reserva a cota global e por usuário de forma atômica antes da inferência.
Se o contador estiver indisponível, a IA falha fechado e o diagnóstico cai no
fallback offline. Os limites conservadores ficam em `wrangler.jsonc`.

Sem a chave, o Worker responde `{ ok:false, motivo:'ia_nao_configurada' }` e o app
usa o fallback offline (602 códigos) — nunca quebra.

### Validação antes de publicar

```bash
node scripts/teste-ai-provider.ts
npx wrangler deploy --dry-run
```

Depois do deploy, `GET /` deve mostrar `ia:"on"`, `provedor:"openrouter"` e
`voz:"on"`, mas isso é só saúde de configuração: não prova banco, cota nem
modelo. A aprovação final exige um POST autenticado sintético. Nunca use áudio,
nome ou dado de cliente no canário.

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
