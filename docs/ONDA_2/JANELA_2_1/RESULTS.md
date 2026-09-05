# Resultados — Onda 2, Janela 2.1 / contratos do Incremento A

Validado em: **2026-08-28T18:38:54-03:00**  
Repositório: `C:\OLLI_REL`  
Disposição: **PASS no laboratório local; runtime/remoto continuam NO-GO**

## Resultado

- 6 schemas JSON Schema draft 2020-12 parseados e estritos;
- 17/17 testes de contrato/segurança aprovados;
- 4/4 módulos `.mjs` passaram em `node --check`;
- duas organizações sintéticas, usuário multiempresa, owner/manager/técnico/viewer/revogado/outsider cobertos;
- co-tenancy cliente/local, versão esperada, allowlist, autoridade fora do payload e idempotência por organização comprovadas no fixture;
- nenhuma dependência npm, rede, `process.env`, Supabase, runtime, secret ou PII de fixture.

## Comandos e recibos

| Comando | Resultado |
|---|---:|
| `npm --prefix docs/ONDA_2/JANELA_2_1 test` | 17 aprovados, 0 falhas, exit 0 |
| `node --check contracts/tenancy-contract.mjs` | exit 0 |
| `node --check fixtures/synthetic.mjs` | exit 0 |
| `node --check tests/contracts.test.mjs` | exit 0 |
| `node --check tests/security-boundaries.test.mjs` | exit 0 |

Não foi rodada a suíte raiz, typecheck Expo ou build porque nenhum arquivo de runtime/TypeScript foi autorizado ou alterado nesta tarefa.

## Snapshot executável

O digest usa registros `caminho-relativo<TAB>sha256-do-arquivo`, ordenados por caminho e unidos por LF em UTF-8. Participam `package.json`, `schemas/**`, `contracts/**`, `fixtures/**` e `tests/**`; documentação não participa.

```text
EXECUTABLE_SNAPSHOT_SHA256=ed837923d3863d968024e7c18a115dbbf4ce2e646eae394d63d7d548f6b050ce
```

## O que foi provado

- os quatro comandos mínimos têm envelope fechado e sem ator/papel/capability autoritativos;
- `create_*` exige versão zero; `update_*` exige recurso existente e versão canônica exata;
- local não aponta para cliente de outro tenant;
- técnico só escreve com capability explícita; viewer/revogado/outsider falham fechado;
- usuário multiempresa não herda permissão de uma membership para outra;
- hash do comando é estável para replay e muda com tenant/payload;
- mesma organização + chave + hash repete o resultado; chave reutilizada com hash diferente rejeita; outra organização possui namespace próprio;
- campos desconhecidos, autoridade, segredo, data URI, URL pública e payload inadequado são rejeitados;
- pacote executável não acessa rede, ambiente, subprocesso ou código do produto.
- datas impossíveis/sem UTC são rejeitadas e o resultado não aceita combinações contraditórias de estado/código/versão/replay.

## Revisão independente incorporada

A revisão de segurança retornou GO para o laboratório e nenhum P0. Dois P1 foram corrigidos nesta mesma tarefa: validação RFC 3339 UTC/calendário real e matriz fechada de resultado. A diferença deliberada entre schema estrutural e política semântica foi formalizada em `VALIDATION_POLICY.md`; conformance bidirecional com um validator JSON Schema homologado continua gate antes de RPC/mobile/web.

O próximo harness também deve buscar organização, membership e recursos canônicos dentro da transação do banco. Os objetos de contexto deste fixture são simulação explícita e nunca podem vir do request do cliente em runtime.

## O que não foi provado

- Postgres, RLS, RPC, grants, `SECURITY DEFINER`, Storage ou Supabase reais;
- migration/backfill/rollback, concorrência de banco ou dois dispositivos físicos;
- integração com o app/web/Worker ou compatibilidade real do legado `site` → V2 `location`;
- autenticação, provider externo, dado real, deploy ou produção.

## Decisão

- **GO:** encerrar esta tarefa de schemas/fixtures como prova local.
- **GO:** próxima tarefa da fila pode preparar migration draft aditiva e harness de banco efêmero descartável.
- **NO-GO:** aplicar SQL remotamente, tocar runtime ou promover estes testes a prova de produção.
