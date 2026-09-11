# Onda 2 — Janela 2.4: outbox local do Incremento A

Data: **2026-08-28**  
Estado: **LABORATÓRIO LOCAL — sem SQLite, runtime, rede ou produção**

## Resultado estreito desta fatia

Este pacote modela a fila offline que fica entre a mutação local e o gateway J2.3. Ele usa somente memória, relógio injetável, fixtures sintéticas e módulos nativos do Node. O objetivo é tornar executável a política de estados e falhas antes de escolher SQLite ou integrar o aplicativo.

```text
enqueue validado e particionado pelo ator original
  → pending
  → claim atômico + lease temporária
  → gateway J2.3 reautoriza membership/tenant/versão atuais
      ├─ acked      → terminal
      ├─ conflict   → terminal e visível
      ├─ rejected   → terminal e visível
      ├─ autorização após lease recuperada → reconcile_required
      ├─ transitório→ retry_wait + backoff limitado
      └─ desconhecido → reconcile_required fail-closed
  → lease vencida pode ser reclamada
  → lease antiga nunca confirma resultado
  → resultado canônico incerto nunca é rotulado como falha confirmada
```

## Matriz de estados

| Estado | Entra por | Sai por | Regra |
|---|---|---|---|
| `pending` | enqueue novo | claim | comando validado e imutável |
| `claimed` | claim elegível | resultado, falha ou expiração | uma lease fresca por item |
| `retry_wait` | falha transitória | claim após `available_at` | backoff exponencial limitado |
| `acked` | gateway `acked` | — | terminal; replay não duplica efeito |
| `conflict` | gateway `conflict` | — | terminal; não usa last-write-wins |
| `rejected` | gateway `rejected` | — | terminal; inclui revogação e kill switch |
| `reconcile_required` | lease recuperada com resultado ainda ambíguo | — | terminal automático; exige reconciliação autorizada futura e não revela recibo anterior |
| `dead_letter` | limite de falha normalizada com não entrega garantida | — | terminal e sem loop infinito |

## Autoridade e partição

- `enqueued_by_user_id` vem exclusivamente do contexto confiável da sessão;
- ator, papel, tenant, membership e versão nunca são aceitos do payload como autoridade;
- claim, inspeção e métricas são particionados pelo ator original, evitando mistura após troca de conta;
- `lease_id` é único dentro da partição do ator, impedindo que uma partição bloqueie outra por colisão controlada;
- o drain usa o ator original e passa novamente pelo gateway; revogação entre enqueue e drain resulta em rejeição;
- `item_id` e `command_id` têm deduplicação explícita pelo envelope canônico completo, incluindo `idempotency_key`, `device_id` e `created_at_local`; colisão divergente falha fechado.

## Dados internos versus projeções seguras

O store interno precisa manter o comando completo para entregá-lo ao gateway. Esse comando já passou pela allowlist J2.1, que bloqueia autoridade, segredo, blob, base64 longo e URL pública.

As superfícies `inspect()` e `metrics()` não retornam payload, nome do cliente, ator, device, mensagem de erro bruta ou lease token. Resultados do gateway são reprojetados por uma allowlist própria da outbox. O claim retorna o comando somente para o drainer interno e fica congelado.

## Recuperação modelada

- se o processo cai antes da aplicação, a lease expira e o item pode ser reclamado;
- se cai depois da aplicação e antes do ack local, o novo drain reapresenta o mesmo comando; o gateway responde por idempotência, sem duplicar o agregado;
- mesmo quando a última tentativa foi reclamada, existe uma única sonda final de reconciliação idempotente; um segundo abandono encerra em `reconcile_required`, nunca em `dead_letter` enganoso;
- se autorização, membership ou kill switch mudarem antes da reapresentação, a outbox não consegue consultar o ledger oculto pelo gate do gateway: ela preserva o resultado seguro atual e usa `reconcile_required`, sem alegar que o efeito anterior falhou nem expor recibo a um ator revogado;
- lease antiga ou vencida não pode concluir o item;
- apenas `OutboxTransientError` com código allowlistado entra em retry;
- `transport_timeout` é semanticamente ambíguo: mesmo na última tentativa ele agenda uma única sonda idempotente; se a sonda também não resolver, termina em `reconcile_required`;
- `transport_unavailable` e `rate_limited` só podem ser emitidos pelo futuro adapter quando ele puder afirmar que não houve aplicação; se essa garantia não existir, o adapter deve normalizar como `transport_timeout`;
- erro desconhecido e entrega assíncrona recusada terminam em `reconcile_required`, pois a outbox não pode provar que o efeito não aconteceu; mensagem/stack nunca são persistidos, a rejeição do thenable é consumida sem log/rethrow e não há retry automático;
- tentativas são limitadas e o backoff é determinístico no laboratório.

## Limites declarados

- o store em memória não prova persistência após reinício;
- não há SQLite, transação app+outbox, criptografia local, migração de schema ou isolamento entre processos;
- não há rede real, timeout real, Worker, Supabase, PostgreSQL, RLS ou autenticação;
- não há execução assíncrona; uma entrega thenable falha fechado nesta fatia síncrona;
- `reconcile_required` ainda não possui UI, operador, leitura privilegiada do ledger ou workflow de resolução; esta fatia apenas impede classificação falsa e retry inseguro;
- o laboratório não prova concorrência de threads/processos nem clock de aparelho adulterado;
- nenhum arquivo de runtime em `src/**`, `webapp/**`, `web/**`, `worker/**` ou `supabase/**` foi tocado.

## Validação

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_4 test
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_4\outbox\increment-a-outbox.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_4\fixtures\outbox-fixture.mjs
```

## Próximo gate

Após esta semântica passar nos testes e na revisão independente, o próximo passo ainda local é definir a porta de persistência/shadow-read. SQLite real e integração mobile/web exigem uma janela própria com teste de fechar/reabrir, partição de conta, migração local e rollback. PostgreSQL e produção continuam gates externos separados.
