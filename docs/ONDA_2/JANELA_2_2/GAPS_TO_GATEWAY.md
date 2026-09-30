# Gates explícitos entre schema e gateway

Estado: **abertos por desenho; impedem alegação de runtime seguro**

O draft da Janela 2.2 prova somente estrutura estática. As garantias abaixo exigem a próxima fatia transacional e testes PostgreSQL reais:

1. derivar ator de `auth.uid()` e buscar membership/recurso canônicos na mesma transação;
2. verificar `v2_commands_enabled` antes de qualquer escrita;
3. reservar `organization_id + idempotency_key`, comparar `payload_hash` e:
   - devolver o resultado persistido quando o hash for igual;
   - rejeitar `idempotency_key_reused` quando o hash divergir;
4. em `update_*`, comparar a versão persistida com `expected_version`, atualizar com predicado de versão e incrementar atomicamente;
5. em `create_*`, exigir ausência do agregado e versão inicial um;
6. derivar `actor_user_id`, `canonical_version` e `safe_result` no servidor; nunca aceitar esses campos como autoridade do cliente;
7. validar co-tenancy do agregado dentro da transação, além da FK composta de local/cliente;
8. ensaiar duas sessões concorrentes, replay dez vezes, hash divergente, revogação entre enqueue/drain e rollback;
9. permitir somente resultado JSON allowlistado, sem PII, conteúdo do payload, custo, segredo ou stack trace;
10. manter escrita direta do papel `authenticated` sem grant.

Até esses itens estarem executados e verdes, os termos corretos são:

- constraints de formato de `expected_version`;
- unicidade da chave idempotente por organização;
- harness preparado;
- PostgreSQL/RLS/RPC **não executados**.
