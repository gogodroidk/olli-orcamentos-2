# OLLI — Diagnóstico por IA (Cloudflare Worker)

A "OLLI Técnica": recebe um caso de campo e devolve um diagnóstico estruturado
(testes em ordem, peças suspeitas, *não faça ainda*, confiança, mensagem pro
cliente, sugestão de orçamento, fontes). **A chave da IA é secret do Worker —
nunca entra no app.**

- Provedor automático: **Gemini** se `GEMINI_API_KEY` estiver setada (padrão),
  ou **Claude** se `ANTHROPIC_API_KEY` estiver setada.
- Cache opcional em **KV** (binding `CACHE` → `olli-diagnostico-cache`, já criado).

```
POST /   body: { marca?, modelo?, codigo?, sintoma?, contextoBase? }
→ { ok: true, fonte: "ia"|"cache", modelo, diagnostico: {...} }
```

## Deploy

### Opção A — painel (sem terminal)
1. **dash.cloudflare.com → Workers & Pages → Create application → Create Worker**.
2. Nome: `olli-diagnostico` → **Deploy**.
3. **Edit code** → cole `src/index.ts` → **Deploy**.
4. **Settings → Variables and Secrets**:
   - Secret `GEMINI_API_KEY` = sua chave do Google AI Studio.
   - (opcional) Var `GEMINI_MODEL` = `gemini-3.5-flash`.
5. (opcional, recomendado) **Settings → KV Namespace Bindings**: `CACHE` → `olli-diagnostico-cache`.
6. Copie a URL do Worker (`https://olli-diagnostico.SEU-USUARIO.workers.dev`) e
   coloque em `EXPO_PUBLIC_DIAGNOSTICO_URL` no app.

### Opção B — wrangler
```bash
cd cloudflare/diagnostico && npm install
npx wrangler secret put GEMINI_API_KEY   # cola a chave
npx wrangler deploy                       # já vincula o KV pelo wrangler.toml
```

## Onde pegar a chave do Gemini
**aistudio.google.com → Get API key → Create API key** (use o projeto onde seu
faturamento já está configurado).

## Trocar pra Claude depois
Remova `GEMINI_API_KEY` e adicione `ANTHROPIC_API_KEY` (console.anthropic.com).
O Worker passa a usar o Claude sem mexer no código.
