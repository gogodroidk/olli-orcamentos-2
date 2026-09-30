# Onda 3 / Janela 3.2 — inventário offline, outbox e dois dispositivos

Estado: inventário local inicial; não é aceite físico, de servidor ou de produção.

## Limites da janela

Esta janela prepara uma fatia fixture-only para testar operação sem rede,
retentativas, idempotência, tombstones, clock skew e conflitos entre dispositivos.
O inventário não autoriza editar `src/**`, `webapp/**`, `worker/**`, banco,
migrations, RLS, providers, autenticação, deploy ou dados reais.

## Evidências encontradas

| Capacidade | Evidência local | Limite atual |
|---|---|---|
| Persistência offline | `src/database/database.ts:143-166` abre SQLite local; `:288-297` cria `exclusoes`; `:547-558` mantém relógio `atualizado_em`. | É comportamento do app e depende de Expo/SQLite; não deve ser importado por contrato fixture-only. |
| Tombstone | `src/database/database.ts:45-64` registra exclusão local e chama `pushTombstone` em background; `src/services/cloudSync.ts:1027-1050` faz upsert remoto idempotente; `:1428-1465` reconcilia nuvem/local. | A convergência real requer sessão, banco e rede; nesta janela só se modela como evento sintético. |
| Guarda de timestamp | `src/services/cloudSync.ts:1082-1090` introduz guarda anti-perda; `:1860-1871` compara `atualizado_em` antes do push. | É LWW/guard da implementação atual, não prova geral de resolução de conflitos entre aparelhos. |
| Reentrância e cancelamento | `src/services/cloudSync.ts:2381-2398` usa geração de sync e aborto antes de novas escritas; `:2436-2448` evita sync concorrente e valida partição. | Falha de rede, logout e troca de conta exigem teste autenticado futuro; não simular como aceite. |
| Idempotência de comandos | O harness local J2.4 (`docs/ONDA_2/JANELA_2_4/outbox/increment-a-outbox.mjs:366-465`) valida `item_id`, `command_hash`, usuário e duplicatas; `:600-617` controla retry/backoff. | O contrato J2.4 é em memória e não substitui outbox persistida no app. |
| Retry e lease | J2.4 usa estados `pending`, `claimed`, `retry_wait` e terminais `acked`, `conflict`, `rejected`, `reconcile_required`, `dead_letter` (`:10-35`, `:228-236`, `:350-360`). | Lease/clock skew entre dispositivos ainda não foi testado com relógios independentes. |
| Partição por usuário | `src/database/particao.ts:24-52` resolve arquivo SQLite por usuário e garante saída idempotente. | Protege partição local; não prova autorização remota nem troca segura de organização. |

## Riscos e decisões

1. O app já possui sincronização best-effort e tombstones, mas os efeitos são
   externos ao contrato puro. Importar `database.ts` ou `cloudSync.ts` criaria
   I/O, sessão e risco de dual-write invisível.
2. O harness J2.4 é a fonte de comportamento sintético para enqueue/claim/retry;
   J3.2 deve reutilizá-lo ou criar apenas um adaptador puro sobre seus DTOs.
3. Dois dispositivos reais, servidor e revogação de membro são gates humanos;
   simulação fixture-only será evidência parcial e deve declarar relógios,
   autoridade e resultado esperado de cada dispositivo.
4. `atualizado_em` e tombstone têm semântica de convergência, não de resolução
   universal. Clock skew deve falhar fechado ou exigir reconciliação explícita,
   nunca escolher silenciosamente um vencedor inseguro.

## Slice seguro proposto

Criar, somente em `docs/ONDA_3/JANELA_3_2/**`, um contrato determinístico que:

- aceite DTO allowlistado de comando, dispositivo, tenant e relógio lógico;
- produza estados imutáveis de fila e decisão (`pending`, `retry_wait`,
  `conflict`, `acked`, `dead_letter`);
- preserve `command_hash`/idempotency key e rejeite replay divergente;
- modele tombstone e clock skew sem chamar SQLite, Supabase, HTTP ou runtime;
- tenha fixtures para dois dispositivos e testes de isolamento de fonte.

## DoD e não-aceite

- inventário rastreável e linha de autoridade para cada capacidade;
- contrato/testes locais reproduzíveis, sem dependência nova;
- revisão independente P0/P1 antes de qualquer adapter/runtime;
- resultados rotulados `LOCAL ONLY`/`SINTÉTICO`;
- nenhum claim de aceite em dois aparelhos, servidor, banco ou produção.

## Correções após revisão independente (2026-08-30)

O parecer read-only identificou quatro riscos de promoção e dois ajustes de
rastreabilidade. O contrato local em `offline-outbox-contract.mjs` registra as
seguintes decisões, sem importar runtime:

- todos os estados e terminais do harness J2.4 são preservados (`pending`,
  `claimed`, `retry_wait`, `acked`, `conflict`, `rejected`,
  `reconcile_required`, `dead_letter`), incluindo uma única sonda para resultado
  incerto;
- `clock_skew` acima de cinco minutos, timestamp inválido/futuro e tenant
  divergente falham fechado; empate de timestamp com payload divergente vira
  `conflict`, sem LWW silencioso;
- tombstone é modelado como transação atômica: a fixture de crash/restart devolve
  o estado anterior e não simula uma exclusão sem tombstone;
- dispositivo ausente por mais de 90 dias exige `reconcile_required` antes de
  poda; a limitação de ressurgimento continua explicitamente fora de aceite;
- `organization_id`, ator, dispositivo e membership vêm de contexto confiável,
  nunca do payload; a fixture exige `can_write` já pré-autorizado e deixa a
  decisão real de papel/capability para a camada de autorização do produto.
  Fixtures verificam dois dispositivos no mesmo tenant e rejeitam co-tenancy
  indevida;
- referências de timestamp/push são tratadas como evidência do comportamento
  atual, não como autorização para importar `database.ts`/`cloudSync.ts` ao
  contrato.

Após a revisão, o contrato também passou a rejeitar `created_at_local` no futuro,
expor apenas views de estado somente leitura, impedir reutilização de `lease_id`
ativo, tornar tombstone replay divergente um erro fechado e indexar a unicidade
por `organization_id + idempotency_key`.

Os riscos permanecem P1/P2 documentais até uma revisão independente do contrato.
O pacote continua **LOCAL ONLY / SINTÉTICO** e não autoriza adapter, dual-write,
sync, banco, rede, aparelho ou produção.
