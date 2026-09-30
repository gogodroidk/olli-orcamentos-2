# J3.1 — contrato shadow local para organização, cliente, local e equipamento

Este diretório contém apenas o slice sintético/read-only aprovado no inventário
J3.1. Ele reutiliza o contrato/harness puro de
`docs/ONDA_2/JANELA_2_5/` para cliente e local e acrescenta a projeção
allowlistada de organização e equipamento.

## Limites

- nenhuma importação de `src/**`, `webapp/**`, `worker/**`, SQLite, Supabase ou
  `cloudSync`;
- nenhuma escrita, rede, adapter, feature flag, dual-write, migração ou dado real;
- `local` e `equipment` são entidades apenas do fixture e não representam uma
  tabela V1 existente;
- decisões e hashes são evidência local/sintética; não provam RLS, sync,
  dispositivo, produção ou aceite.

## Invariantes fechadas

- cada `client_id`, `location_id` e `equipment_id` aparece no máximo uma vez
  por organização antes de qualquer projeção ou decisão;
- cada combinação `aggregate_type + aggregate_id` produz uma única projeção e
  uma única decisão no escopo da organização;
- timestamps locais usam RFC 3339 UTC com milissegundos e round-trip exato;
- `organization.updated_at` nunca pode ser anterior a `created_at`;
- colisão, data não canônica, data impossível e travessia de tenant falham
  fechadas;
- propriedades próprias `Symbol` também são recusadas pela allowlist e o
  baseline congela somente suas cópias, sem congelar o input do chamador.

A revisão independente inicial encontrou a ausência das duas primeiras
garantias e uma validação temporal permissiva. O kernel e os testes foram
corrigidos. O parecer independente pós-correção não encontrou P0/P1, reproduziu
as recusas e aprovou o encerramento como `LOCAL_ONLY`; isso não promove nenhuma
evidência para runtime ou produção.

## Verificação

```powershell
npm test
npm run coverage
```
