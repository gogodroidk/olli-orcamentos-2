# RELEASE 07/10 — ordem de merge e checklist de deploy
Autor: TECH — GitHub & CI · base: main `a1f846b` (#180) · NADA foi mesclado nem aplicado. Destino pedido: `docs/RELEASE-07-10.md` (meu papel não edita o repo: o CTO/Maestro copia).

## 1. PRs abertos (3) — estado medido
| PR | O que é | Toca | ci-local (combinação #181+#182+#183 em cima da main, 07/10) |
|---|---|---|---|
| #183 | prévia OG do `/o/<token>` | `worker/src/link.js`, `package.json` | worker ✅ lint ✅ segredos ✅ |
| #182 | CAPI: `ph` hash + evento `OrcamentoEnviado` | migration `20261007120000`, `worker/src/anunciosConversoes.js`, `package.json` | idem |
| #181 | WhatsApp Cloud API multi-número | migration `20261007110000`, `worker/src/index.js`, `whatsappCloud.js`, `package.json`, doc | idem |
| alarme-pix | **não existe PR** (nada aberto/mesclado com esse nome) | — | — |

Resultado do `ci-local` na combinação: segredos ✅ · worker ✅ · lint ✅ · **app-gate ❌ · dependencias ❌**.
- ❌ app-gate: `teste-rotas-metodo` — "index.js trata a família '/whatsapp/' e a tabela conhece". **Causa: #181.** Falta a linha `['/whatsapp/', ...]` na tabela de métodos em `worker/src/util.js` (~linha 66). Os PRs só rodaram lint+worker+segredos; o preflight completo pega isto. Correção: 1 linha, no #181.
- ❌ dependencias (trivy): shell-quote 1.10.0→1.11.0 **CRITICAL** (raiz), sharp 0.35.4→0.35.5 + source-map-js 1.2.1→1.2.2 HIGH (web/webapp). **Não é dos PRs** (nenhum toca lockfile): é a base de CVE atualizada hoje. Main também fica vermelha → bump (ou `.trivyignore` com `exp:`) é pré-requisito de QUALQUER merge, senão o gate nunca fica verde.

## 2. Conflitos
- **Migrations 20261007\***: sem duplicata entre PRs e main (`110000` e `120000` são únicos). Na main há versões repetidas ANTIGAS (`20260708*`, `20261005090000`) — não são deste lote.
- **Ordem de arquivo**: as duas migrations (`…7110000`, `…7120000`) ficam ANTES de `20261008*` e `20261009*` já na main. `supabase db push` recusa fora de ordem. **Aplicar por MCP `apply_migration`** (produção registra a data de aplicação como versão; conferi `list_migrations`: tudo da main até `pagamentos_vinculo_recibo_gatilho` já está aplicado; `wa_*` e a 120000 NÃO).
- **Código**: os 3 PRs só colidem em `package.json` (todos acrescentam script à cadeia `test`). `worker/src` não se sobrepõe. Resolução trivial (união dos scripts) — testada: combinação monta e o `worker` fica verde.

## 3. ORDEM de merge proposta
0. **Pré-requisito:** PR do CTO com bump shell-quote/sharp/source-map-js (+ undici/devalue pendentes) → `dependencias` verde.
1. **#183 OG** — só worker/link, sem migration, sem segredo, reversível (revert). Rebase no `package.json` não precisa (primeiro).
2. **#182 CAPI** — rebase em main (só `package.json`), `ci-local` completo, migration por MCP, deploy do worker. Sem segredo novo (token Meta já no Vault). Respeita consentimento (filtro não afrouxado).
3. **#181 WhatsApp** — por último: mais passos humanos (Vault ×5, webhook Meta), número nasce `ativo=false`. Antes: adicionar linha `/whatsapp/` em `util.js`, rebase, `ci-local` COMPLETO (app-gate!). Ver pré-requisitos do 2º tenant no fim de `docs/WHATSAPP_CLOUD_API.md`.
Cada merge = 1 squash, `ci-local` completo no commit rebaseado, sem force-push; após cada um, deploy e verificação antes do próximo.

## 4. Checklist de deploy
**Antes (todos):** `git status` limpo; `ci-local` completo verde no commit exato; `wrangler secret list` = anotar contagem (hoje 9; `wrangler deploy` não apaga — refutado 16/07); avisar o Igor (zona de produção).
**#183:** merge → `cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy` → GET `/o/<token de teste>` com `User-Agent` de preview (WhatsApp/facebookexternalhit): HTML com `og:title` do prestador, sem valor nem nome do cliente; navegador normal inalterado. Rollback: revert + deploy.
**#182:** merge → migration `20261007120000_anuncios_conversoes_orcamento_enviado_telefone` por MCP (idempotente) → deploy worker → conferir `anuncios_conversoes`: novas linhas só de quem tem consentimento 'sim', `event_id orcamento-enviado-<user_id>`, `detalhe` só com códigos. Sem Vault novo. Rollback: revert + deploy (a migration é aditiva/idempotente).
**#181 (só com OK do Igor para a parte Meta):**
1. Migration `20261007110000_whatsapp_cloud_multinumero` por MCP (aditiva; cria `wa_numeros`, `wa_contatos`, `wa_entrada`, `wa_envios`; RLS fechada; número inserido com `ativo=false`).
2. **Vault ×5** (SQL/MCP, nunca no repo): `wa_verify_token`, `wa_app_secret` (app Meta 869290166155166), `wa_envio_token` (≥32 car.), `wa_aprovacao_token` (DIFERENTE, só humano), `wa_access_token` (system user). Sem segredo = rotas respondem 503 (fechadas). O worker está em 64/64 variáveis: nenhuma variável nova.
3. Deploy do worker.
4. **Webhook Meta**: callback `https://diagnostico.olliorcamentos.online/whatsapp/webhook` + `wa_verify_token`, assinar `messages`. O GET tem de dar 200.
5. Teste com número próprio: POST assinado entra em `wa_entrada`; `SAIR` vai para `whatsapp_nao_contatar`; envio sem OK humano é recusado.
6. `update wa_numeros set ativo=true` só depois do teste. **Custo:** template de marketing fora da janela é PAGO por mensagem entregue — nenhum sai sem custo dito e OK do Igor (>R$100 pergunta); começar com `teto_diario_templates` baixo.
Regras do projeto que continuam: primeiro contato é humano; erro nunca vira vazio (3 estados); sem modo demo/sombra (número desligado diz que está desligado).

## 5. Pendências / riscos
- alarme-pix: sem PR — quando abrir, entra depois do #182 (precisa passar pelo mesmo gate).
- Pré-requisitos do 2º tenant do WhatsApp (anti-replay do webhook etc.) estão adiados de propósito no doc do #181.
- Limpeza: worktrees `C:\OLLI_WT\tech-ci2` (minha) a remover ao fim.
