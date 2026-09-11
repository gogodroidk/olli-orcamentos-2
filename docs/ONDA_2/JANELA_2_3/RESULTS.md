# Recibo de validação — Onda 2 / Janela 2.3

Data do fechamento: **2026-08-28T19:38:44-03:00**  
Estado: **DONE_LOCAL_OFFLINE**  
Escopo: gateway transacional em memória do Incremento A; sem runtime, banco remoto ou produção.

## Veredito

**GO para o laboratório local offline.** O pacote modela e testa a fronteira de autorização, co-tenancy, versão otimista, idempotência e recibo seguro que um adapter futuro deverá preservar.

**NO-GO para PostgreSQL, RPC, Supabase, runtime e produção.** Esta janela não executou migration, RLS, grants, locks, isolamento MVCC, concorrência entre sessões, rede, credenciais ou dados reais.

## Evidência executada

| Verificação | Resultado |
|---|---|
| `npm test` da J2.3 | **33/33** testes aprovados; 0 falhas |
| `node --check` | **4/4** módulos aprovados |
| cobertura do gateway | linhas **89,94%**; branches **83,08%**; funções **100%** |
| cobertura de todos os módulos carregados | linhas **91,94%**; branches **88,03%**; funções **93,06%** |
| regressão J2.1 | **17/17** testes aprovados |
| regressão J2.2 | **17/17** testes aprovados |
| validador estático J2.2 | `ok=true`; **11** arquivos; **5** tabelas requeridas |
| parser SQL J2.2 | `PGLAST_PARSE=PASS`; **6** arquivos; **141** statements |

Comandos principais:

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_3 test
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\gateway\increment-a-gateway.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\fixtures\gateway-fixture.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\tests\gateway.test.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\tests\security-boundaries.test.mjs
node --test --experimental-test-coverage C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\tests\*.test.mjs
```

## Comportamentos comprovados offline

- o contexto confiável aceita somente `session_user_id`; tenant, papel, capability, membership, versão e resultado são reidratados no servidor;
- autorização atual ocorre antes de idempotência, portanto revogação e kill switch também bloqueiam replay;
- replay exige mesma organização, mesma chave, mesmo hash e mesmo ator original;
- outro funcionário ativo da mesma empresa recebe apenas `authorization_denied`, sem acesso ao recibo anterior;
- `command_id` é único globalmente no laboratório, coerente com a chave primária draft da J2.2;
- o mesmo `command_id` com outra chave — inclusive em outra organização — falha antes de mutar agregado ou ledger;
- a mesma chave com hash divergente falha sem substituir o efeito original;
- dois writers com a mesma `expected_version` produzem um sucesso e um conflito explícito;
- cliente e local de tenants diferentes falham fechado;
- a transação copy-on-write não comita mutação parcial, callback assíncrono ou relógio canônico inválido;
- o ledger persiste apenas `command_id`, hash, ator, operação, IDs opacos, timestamp canônico e `safe_result` allowlistado; não persiste payload, nome, device, segredo ou horário local;
- pacote sem dependências externas, rede, ambiente, subprocesso, Supabase ou imports do runtime.

## Revisão independente

A revisão de segurança somente leitura encontrou inicialmente um P1: o laboratório aceitava reutilização de `command_id` que a PK draft da J2.2 recusaria. A correção introduziu um índice global transacional, gravou `command_id` no ledger e adicionou rejeição antes da mutação.

Na reinspeção:

- **P0: nenhum**;
- **P1: nenhum**;
- veredito: **GO para laboratório offline / NO-GO para runtime e produção**;
- duas sugestões P2 de cobertura foram incorporadas depois como testes permanentes: replay com a identidade exata e colisão global cross-tenant. A suíte final passou com **33/33**.

## Limites e gates ainda abertos

- IDs do contrato J2.1 são opacos, enquanto a migration J2.2 usa UUID; o adapter deverá mapear ou versionar essa fronteira explicitamente;
- colisão de `command_id` retorna `validation_failed` para manter compatibilidade com o contrato v1; um código dedicado exige evolução versionada de J2.1/J2.2;
- não há prova de estados `processing`, retomada após crash, lock, duas sessões concorrentes ou idempotência sob MVCC;
- não há prova executada de RLS, grants, rollback compensatório, service role ou policy real;
- `POSTGRES_EXECUTION_NOT_RUN`: o host continua sem engine/cliente local autorizado para essa prova;
- nenhuma integração foi feita em `src/**`, `webapp/**`, `web/**`, `worker/**` ou `supabase/**`.

## Snapshot verificável

O snapshot abaixo cobre os seis artefatos de fonte da J2.3 — `package.json`, `README.md`, gateway, fixture e dois arquivos de teste — excluindo este próprio recibo.

- arquivos: **6**;
- SHA-256 do manifesto determinístico: `5764cbff672cd8b63b00113cac4b991ec2fc4a4cba204efbe76d7388aa27d9f6`;
- protocolo do piloto: `v4.0.0`;
- SHA-256 do protocolo: `99912f0136a38dc179cdb1debee99925ba629e0f7cb58aceedb82b8ac06908a7`.

## Próxima fatia segura

A ordem arquitetural aprovada aponta para a Janela 2.4: outbox local do Incremento A, ainda isolada do runtime. Ela deverá modelar enqueue, claim/lease, drain com reautorização pelo gateway, retry/backoff, estados terminais, conflito explícito e payload sem blobs. Banco real, deploy e produção continuam gates separados.
