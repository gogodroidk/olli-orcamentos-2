# Política executável de validação — Incremento A v1

Identificador: `urn:olli:validation-policy:increment-a-command:v1`  
Estado: **obrigatória junto ao JSON Schema; local/fixture; runtime NO-GO**

## Relação entre schema e validator

Os JSON Schemas descrevem a estrutura interoperável e falham para campos extras. O módulo `contracts/tenancy-contract.mjs` é a política semântica executável desta versão. Um consumidor só está conforme quando passa por **ambos**; validar apenas o JSON Schema não autoriza comando, tenant, ator ou recurso.

Antes de RPC/mobile/web, a implementação deve adotar um validator JSON Schema draft 2020-12 homologado e executar o mesmo corpus positivo/negativo contra o schema e contra a política semântica. Divergência falha fechado e bloqueia rollout.

## Controles semânticos adicionais

- data/hora: RFC 3339 UTC exato com milissegundos e data calendária real;
- ator, papel, capability, owner, audiência, tenant derivado ou qualquer credencial não pertencem ao payload;
- segredo/token/sessão/cookie/API key/authorization e aliases são proibidos;
- bytes, base64, blob, arquivo/anexo, `data:` URI e URL pública são proibidos no comando desta fatia;
- payload máximo: 16 KiB após canonicalização;
- organização, membership e recurso canônico vêm do repository/transação server-side no próximo harness;
- `create_*` usa versão zero; `update_*` usa versão canônica positiva exata;
- local e cliente devem pertencer à mesma organização;
- resultado aplica matriz fechada estado × código × versão × replay;
- idempotência é escopada por organização e compara hash canônico do efeito pretendido.

## Gate de integração

Nenhum schema deste pacote deve ser publicado como contrato suficiente de segurança. Integração exige conformance bidirecional, repository transacional, testes em banco efêmero e revisão do adapter. Dados reais, remoto e produção permanecem bloqueados.
