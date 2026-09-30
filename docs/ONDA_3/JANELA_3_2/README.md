# J3.2 — contrato offline/outbox fixture-only

Estado: **LOCAL ONLY / SINTÉTICO**. Este diretório não integra o aplicativo,
SQLite, Supabase, HTTP, autenticação, provider ou produção.

## O que foi produzido

- `offline-outbox-contract.mjs`: contrato puro e determinístico que reutiliza a
  validação de comandos da J2.1 e modela todos os estados da J2.4:
  `pending`, `claimed`, `retry_wait`, `acked`, `conflict`, `rejected`,
  `reconcile_required` e `dead_letter`.
- `offline-outbox-contract.test.mjs`: dezesseis testes Node built-in cobrindo
  allowlist, isolamento de tenant/dispositivo, replay divergente, ack/conflito,
  identidade de envelope sem colisão, retry, sonda única para resultado
  incerto, limpeza de lease, clock skew, índices por organização, tombstone
  atômico, resolução de réplicas com contexto confiável e retenção.
- `INVENTARIO_OFFLINE_OUTBOX.md`: fontes do comportamento atual, limites e
  separação entre runtime existente e contrato futuro.

## Invariantes do contrato

1. `organization_id`, ator, dispositivo, membership e a capability de escrita
   pré-autorizada são obtidos do contexto confiável; valores do payload não
   concedem autoridade. A liquidação também exige que o dispositivo do contexto
   seja o mesmo que detém a lease reclamada.
2. Skew superior a cinco minutos, timestamp inválido/futuro ou tenant divergente
   falha fechado; empate de timestamp com payload divergente produz `conflict`.
3. Timeout ou falha não classificada conserva `outcome_uncertain` e exige uma
   única sonda antes de `reconcile_required`.
4. A identidade do envelope (`command_id` + `idempotency_key`) participa da
   comparação de replay por um digest canônico; separadores presentes nos ids
   não criam colisões e mesmo payload com identidade divergente falha fechado.
5. Tombstone só é considerado committed junto com a exclusão; a fixture de
   crash retorna estado anterior sem tombstone parcial, rejeita `deleted_at` no
   futuro e aceita replay idêntico entre dispositivos do mesmo tenant.
6. Dispositivo offline há mais de 90 dias exige reconciliação antes de qualquer
   poda; isso não é aceite de convergência.
7. Índices de itens, comandos e tombstones são compostos por organização + id;
   ids iguais em organizações diferentes não bloqueiam nem substituem dados.
8. `resolveReplica` só resolve réplicas do tenant declarado por um contexto
   confiável com membership ativa; payload não concede autoridade de tenant.
9. As views públicas de `state` são restritas à organização do contexto que
   produziu o resultado e projetam apenas campos allowlistados; payload, ator
   interno e demais registros de tenants não atravessam essa fronteira. O
   estado completo permanece privado à fixture para a próxima operação.

## Verificação

```text
npm test
```

Resultado comprovado em 2026-08-31: **16/16 testes verdes**, sem dependência nova.

As saídas de estado têm raiz congelada e mapas somente leitura; consumidores não
podem substituir coleções por atribuição acidental. Um lease expirado após a
sonda também termina em `reconcile_required` com `lease_id` e
`claimed_by_device_id` limpos. Claim e liquidação rejeitam relógio retrocedido
antes do estado persistido.

O contexto da fixture já chega autorizado (`can_write: true`); a decisão real de
papel/capability continua pertencendo à camada de autorização do produto e é um
gate obrigatório antes de qualquer adapter.

## Não-aceite

Os testes não provam dois aparelhos físicos, servidor, RLS, revogação real,
rede, sync, persistência SQLite, migração, deploy ou produção. Um adapter só
pode ser considerado após nova revisão independente e gate humano do ambiente.
