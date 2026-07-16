# FILA DO PILOTO — a ordem é a prioridade

> Fonte: `Entregas Claude\OLLI-Plano-Mestre\OLLI_Plano-Mestre.md` (Ondas 0–3).
> **Só o dono adiciona/reordena linhas.** O piloto só escreve no LEDGER, nunca aqui.
> O estado real vive em `docs/PILOTO/LEDGER.md` — nunca neste arquivo.
> `[AUTO]` = o piloto executa. `[HUMANO]` = o piloto marca BLOQUEADO e pula.

| id | item | superfície | tag | DoD / prova exigida |
|---|---|---|---|---|
| O0-4 | Fechar borda `contextoEquipeOwner` (erro→null) em `cloudSync.ts:558` | app | [AUTO] | Teste dos 3 estados + `tsc` verde; erro nunca colapsa em vazio |
| O0-5 | Eleger `EXECUTION_LOG.md` + `FOLLOWUPS.md` como fonte única de estado; marcar bundle `C:\ollx\h` e `olli-program` como aspiracional | docs | [AUTO] | Nota escrita nos dois arquivos + referência cruzada |
| O0-6 | Verificar no **repo vivo** se os `Form*.tsx` do painel estão roteados/funcionais na conta demo | web | [AUTO] | Rota confirmada funcional na demo; reconcilia a contradição "falta CRUD" vs código completo |
| O0-1 | Provar F0a (login 3-estados) no emulador `olli_phone`, com e sem rede | app | [HUMANO] | Exige emulador assistido → piloto marca PROVA-PENDENTE-HUMANO, nunca DONE |
| O0-2 | Partição do SQLite por `user_id`+`org_id` na troca de conta | app | [AUTO] | Teste A → logout → B: "sair e manter dados" não mistura tenants |
| O0-3 | Backup/restore por tenant com tombstones preservados | app | [AUTO] | Restore de técnico não ressuscita itens `excluido_em` do dono |
| O3-25 | Bug `"2.5"` → `25` no teclado numérico (`FormOrcamento.tsx:201`) | web | [AUTO] | Digitar 2.5 permanece 2.5; teste colado no log |
| O3-26 | Bug `ehProduto` apaga modelo (`FormItemCatalogo.tsx:65`) | web | [AUTO] | Alternar tipo não apaga campo |
| O3-27 | Desconto negativo aceito (`FormOrcamento.tsx:408`) | web | [AUTO] | Desconto < 0 rejeitado |
| O3-28 | Trava de "já enviado" morta (`FormOrcamento.tsx:424`) | web | [AUTO] | Trava funcional |
| O3-29 | Cap de 1.000 linhas do PostgREST corrompendo KPIs (`data.ts:19`) | web | [AUTO] | KPIs corretos acima de 1.000 registros |
| O3-24 | Auditar tenancy de escrita em todo `Form*.tsx` (membro não-dono carimba `user_id=ownerUserId`) | web | [AUTO] | Todos os `Form*` auditados; correções commitadas |
| O3-31 | Regra dos 3 estados em todo gate de plano/vertical/permissão do painel | web | [AUTO] | Nenhum gate com 2 estados restante |
| O1-12 | F0c — `<GatePro recurso="equipe">` em `EquipeScreen`/`EquipeAoVivoScreen` | app | [AUTO] | Plano Grátis não vê mais a tela inteira |
| O2-17 | Tabela `webhook_events` persistida (Stripe+MP) substituindo `Map` em memória do isolate | backend | [AUTO] | Evento persistido antes de processado; `event_id` único |
| O2-18 | Rate limit **fail-closed** nas rotas sensíveis + teto de payload em bytes | backend | [AUTO] | Rotas sensíveis negam quando o limiter falha |
| O2-19 | Numeração de documento via RPC `SECURITY DEFINER` transacional | backend | [AUTO] | Constraint única `(organizacao_id, tipo, numero)`; sem colisão dono/membro |
| O1-11 | Testar vivo o paywall Empresa (F0b): webhook simulado + convite Grátis vs Empresa | backend | [HUMANO] | Depende dos secrets do MP → bloqueado |

## HUMANO — o piloto NUNCA toca; só reporta no RESUMO FINAL

| id | o que o dono precisa fazer | destrava |
|---|---|---|
| O1-7/8 | `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET` no cofre (painel Mercado Pago) | O1-9 (`reparar.mjs`) e O1-10 (piloto Pix) → **o caixa** |
| O1-13 | Decisão **F0d**: grandfathering do paywall Empresa | fechamento da Onda 1 |
| O1-14 | Stripe dashboard: Installments (12x) + 3 Prices | plano Empresa vendável |
| O2-20 | `pg_dump` baseline das 13 tabelas legadas sem schema versionado | rede de segurança |
| O2-21 | TOTP/MFA no `/admin` (~10 min) | `/admin` hoje entra com 1 fator |
| O2-22 | Rotacionar a senha da conta demo GR Tech (está commitada em repo público) | vazamento real |
