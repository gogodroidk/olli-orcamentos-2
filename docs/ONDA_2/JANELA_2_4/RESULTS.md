# Onda 2 / Janela 2.4 — resultados da outbox local do Incremento A

Data da prova final: **2026-08-29 — America/Sao_Paulo**  
Escopo: **laboratório local, offline e em memória**.

## Veredito

**GO** para congelar a semântica desta outbox como artefato local da J2.4.  
**NO-GO** para SQLite, aplicativo/web em runtime, sincronização real, rede, Worker, Supabase/PostgreSQL, autenticação real, migration, deploy ou produção.

Os testes abaixo provam somente o contrato em memória com fixtures sintéticas. Eles não provam persistência entre processos, isolamento transacional de banco, RLS, comportamento de um adapter de transporte real, funcionamento em aparelho ou aceite de produção.

## Evidência executada

| Gate | Comando | Resultado |
|---|---|---|
| suíte J2.4 | `npm test` | **41/41** testes aprovados; 0 falhas, 0 skips; exit 0 |
| cobertura J2.4 | `node --experimental-test-coverage --test tests/*.test.mjs` | outbox: **90,26% linhas / 86,75% branches / 100% funções**; todos os arquivos: **85,90% / 79,94% / 92,56%**; exit 0 |
| sintaxe J2.4 | `node --check` no núcleo, fixture e duas suítes | **4/4** checks aprovados; exit 0 |
| regressão J2.1 | `npm test` | **17/17** testes aprovados; exit 0 |
| regressão J2.3 | `npm test` | **33/33** testes aprovados; exit 0 |

## Comportamentos comprovados localmente

- enqueue idempotente e colisão divergente fail-closed;
- igualdade do envelope canônico completo, inclusive `idempotency_key`, `device_id` e `created_at_local`;
- partição por ator em inspeção, métricas, claim e namespace de lease;
- recuperação de lease vencida e bloqueio de settle por lease stale;
- replay idempotente após crash pós-aplicação e pré-ack, sem duplicar efeito;
- uma sonda final de reconciliação quando a última tentativa pode ter sido aplicada;
- `reconcile_required` quando o resultado permanece ambíguo, em vez de falso `dead_letter`;
- revogação e kill switch antes do drain como rejeição terminal;
- revogação ou kill switch após efeito possivelmente aplicado como reconciliação sem expor recibo;
- conflito explícito de `expected_version`, sem last-write-wins;
- retry somente para falhas explicitamente classificadas, backoff determinístico e teto comprovado;
- timeout pós-entrega tratado como ambíguo;
- erro desconhecido e gateway assíncrono/thenable falham fechado, sem loop nem mensagem bruta;
- projeções por allowlist, sem payload, ator, lease, stack, segredo ou PII;
- pacote sem dependência externa, rede, ambiente, subprocesso, runtime ou Supabase.

## Revisões independentes

- revisão de segurança final: **P0 = 0, P1 = 0, P2 = 1**; GO somente para o laboratório offline;
- auditoria de continuidade/governança na retomada: **P0 = 0, P1 de código = 0**; confirmou o mesmo `run_id`/`handoff_id`, a worktree suja preservada e a necessidade deste arquivo antes do fechamento;
- P2 não bloqueante: o futuro adapter precisa de contrato e testes de conformidade que diferenciem entrega confirmadamente não iniciada (`transport_unavailable`/`rate_limited`) de resultado pós-envio ambíguo (`transport_timeout`), preferencialmente sem depender apenas de códigos string.

## Snapshot determinístico

Arquivos incluídos, ordenados pelo caminho relativo, no formato `caminho<TAB>sha256<LF>`:

```text
fixtures/outbox-fixture.mjs	14a89054bcd54fac88b5259b68b73dcfb67a23b6a8cbfac2401f6a264df43a4a
outbox/increment-a-outbox.mjs	ff79a788bd6a6b67f9b1b84198042b75cd777b272ca8e9475336801a120049ca
package.json	eec6dc446521285c5c86b6f46ef92d04d9ec85269a6fc43d600624b846423d85
README.md	eb4a807f876e321e58401fbb5bd0d1759d30ca8c407bdea1abde777aeab9c8dc
tests/outbox.test.mjs	436db27d0f64a67c62d39a7871523cd6f1622a4e0dd7d8de3ec4597a7dcca2aa
tests/security-boundaries.test.mjs	70853ab84813c9bee8cd040223d2975a5f347685580c57ec25d3632fa8c5fefc
```

SHA-256 do payload: `cf736fce90c382d868e89ebec1f5aafa7d153908ba9255bf776376dc23a15b25`.

`RESULTS.md` não faz parte do próprio snapshot para evitar autorreferência.

## Gates ainda abertos

1. definir e testar a porta do adapter real de transporte, incluindo normalização de ambiguidade;
2. provar persistência transacional e concorrência entre processos em ambiente descartável autorizado;
3. provar autenticação, troca de conta e limpeza/partição de dados no runtime;
4. revisar e executar migration/RLS/grants em ambiente correto e com rollback, mediante gate humano;
5. executar aceite mobile/web e aparelho físico antes de qualquer alegação de release;
6. manter Supabase, Worker, deploy e produção fora do alcance desta evidência local.
