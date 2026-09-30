# Onda 2 — Janela 2.1: contratos do Incremento A

Data: **2026-08-28**  
Estado: **LABORATÓRIO LOCAL — schemas/fixtures/testes; runtime e remoto NO-GO**

## Resultado observável

Este pacote formaliza a menor espinha segura da V2:

```text
organização
  → membership atual
  → cliente
  → local da mesma organização/cliente
  → comando versionado e idempotente
  → decisão de autorização server-side simulada
```

Ele não integra o aplicativo e não é migration. O pacote roda offline com Node built-in, usa somente fixtures sintéticas e transforma parte dos ADRs 001/002/003/005 em contratos executáveis antes de qualquer SQL ou ambiente remoto.

## Artefatos

- `schemas/*.schema.json`: JSON Schema draft 2020-12, `additionalProperties=false`;
- `contracts/tenancy-contract.mjs`: validação fail-closed, co-tenancy, autorização contextual, hash e ledger idempotente fixture;
- `fixtures/synthetic.mjs`: duas organizações, papéis/estados e comandos sem dados pessoais;
- `tests/contracts.test.mjs`: casos positivos e negativos do contrato;
- `tests/security-boundaries.test.mjs`: barreira contra rede, ambiente, runtime, dependência externa, secrets e PII de fixture.
- `VALIDATION_POLICY.md`: regras semânticas obrigatórias além da estrutura JSON Schema e gate de conformance bidirecional.

## Decisões estreitas

- vocabulário canônico: `organization`, `membership`, `client`, `location`;
- comandos: `create_client`, `update_client`, `create_location`, `update_location`;
- ator, papel, capability, owner e audiência não entram no envelope autoritativo;
- owner/admin/manager podem escrever no baseline; técnico exige `clients_locations.write`; viewer e revogado negam;
- `create_*` exige `expected_version=0`; `update_*` exige recurso existente e versão positiva exata;
- local deve apontar para cliente da mesma organização;
- idempotência é escopada por organização: mesma chave/hash repete resultado; mesma chave/hash divergente rejeita;
- payload rejeita campos desconhecidos, autoridade, segredo, blob/data URI, URL pública e bytes embutidos.
- datas exigem RFC 3339 UTC real; resultados usam combinações fechadas de estado/código/versão/replay.

## Não-objetivos

- sem `src/**`, Expo, web, Worker ou integração de UI;
- sem SQL, migration aplicada, Supabase, RLS real ou Storage;
- sem provider externo, rede, credencial, sessão ou dado real;
- sem compatibilidade completa com o spike J1.3: o mapeamento legado `site` → V2 `location` será tratado na migration/projeção draft seguinte;
- sem afirmar que fixture comprova produção.

## Validação

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_1 test
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_1\contracts\tenancy-contract.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_1\fixtures\synthetic.mjs
```

## Critério de parada e próxima fila

Parar esta tarefa quando todos os testes focados estiverem verdes e os schemas/fixtures estiverem coerentes entre si. A próxima tarefa segura é uma migration **draft** aditiva e um harness de banco efêmero descartável; nada deve ser aplicado remotamente sem gate separado.
