# Onda 2 / Janela 2.5 — resultados do shadow-read e piloto local do Incremento A

Data da prova final: **2026-08-30 — America/Sao_Paulo**  
Escopo: **laboratório local, offline, sintético e em memória**.

## Veredito

**GO** para congelar e fechar localmente o contrato de shadow-read, troca de writer
e kill switch da J2.5.  
**NO-GO** para aplicativo/web em runtime, SQLite, PostgreSQL/Supabase, RLS real,
Worker, rede, autenticação real, migration, deploy, piloto remoto ou produção.

A aprovação abaixo prova somente o pacote local e determinístico. Ela não prova
persistência entre processos, concorrência/crash, vínculo com a outbox real,
comportamento em dispositivo ou aceite do ambiente correto.

## Evidência executada

| Gate | Comando | Resultado |
|---|---|---|
| suíte J2.5 | `npm test` | **57/57** testes aprovados; 0 falhas, 0 skips; exit 0 |
| cobertura J2.5 | `npm run coverage` | núcleo: **100% linhas / 98,11% branches / 96,97% funções**; exit 0 |
| sintaxe J2.5 | `node --check` no núcleo, fixture e duas suítes | **4/4** checks aprovados; exit 0 |
| regressão J2.1 | `npm test` | **17/17** testes aprovados; exit 0 |
| regressão J2.3 | `npm test` | **33/33** testes aprovados; exit 0 |
| regressão J2.4 | `npm test` | **41/41** testes aprovados; exit 0 |

## Comportamentos comprovados localmente

- projeção V2→V1 determinística, versionada, imutável e por allowlist;
- `client` e `location` preservam somente campos públicos/compatíveis;
- aplicação ordenada: replay idêntico é inócuo, stale não regride, gap não é
  aplicado e divergência não aciona reparo automático;
- `event_id` é vinculado ao envelope completo e não pode ser reciclado para outro
  tenant, agregado, versão ou conteúdo;
- `compareShadow()` é read-only, não escolhe um vencedor, não grava e não altera
  os objetos canônico/legado;
- relatório e métricas são sanitizados: sem IDs brutos, valores divergentes,
  payload, ator, device, lease, mensagem, stack, segredo ou PII;
- isolamento por organização/agregado, membership ativa, capability de leitura,
  usuário multiempresa e revogação são aplicados no boundary confiável;
- `location` exige cliente-pai canônico e projetado no mesmo tenant;
- `legacy`/`shadow` mantêm V1 como único writer; `pilot_v2` mantém V2 como único
  writer; não existe fase com dois writers independentes;
- cutover exige comparação interna verde, versões iguais, política atual e zero
  pendência; o chamador não pode autoatestar canônico, status ou timestamp;
- kill switch pausa novas escritas sem promover V1, apagar outbox ou remover a
  trilha; retomada exige nova evidência verde;
- rollback após cutover falha em `reconciliation_required`, sem fallback
  silencioso para V1;
- pacote sem dependência externa, rede, `process.env`, subprocesso, runtime,
  Supabase ou arquivo de produto.

## Revisão independente final

Revisor somente leitura executou as provas e inspecionou os invariantes:

- **P0 = 0**;
- **P1 = 0**;
- **P2 material = 0**;
- veredito: a J2.5 pode fechar localmente e o próximo incremento autônomo é o
  kernel documental `quote@1`.

A revisão não alterou arquivos e separou explicitamente prova laboratorial de
aceite real.

## Snapshot determinístico

Arquivos incluídos, ordenados pelo caminho relativo, no formato
`caminho<TAB>sha256<LF>`:

```text
fixtures/shadow-pilot-fixture.mjs	2ab7d924bee91ee682502ef272e5997e97d60b836cdc391abdffe2d3125c6a52
package.json	d66de8fae6255fd02a9b0334cf786937ff9906efa3be825a3690f083ac01fcd7
README.md	939c1d103de59f6ddafc5c36ec06c14f3999df19da592befff3f7622f4a41cc3
shadow/increment-a-shadow-pilot.mjs	e815f4722b48de17ad2e763f6bf25110d2db296721bd49e01e559e02192d0fe0
tests/security-boundaries.test.mjs	9fc07bff3a16223ea26b23c8e669c074644e32fb1edcbcd1a2011c2630166f7e
tests/shadow-pilot.test.mjs	9e4c02429bdbd3d47efdcbd3b7729e5dc89e73d1ae70cd7f44848fa2b5727bb2
```

SHA-256 do payload: `0c419009e77611db602a129aed05c9a310a3963453e91f56a69be08440f21734`.

`RESULTS.md` não faz parte do próprio snapshot para evitar autorreferência.

## Gates ainda abertos

1. adapter de persistência transacional com concorrência, crash e restart;
2. vínculo comprovado com itens reais da outbox J2.4;
3. autenticação/autorização reais no gateway e no runtime;
4. migration/RLS/grants ensaiados em ambiente efêmero autorizado;
5. aceite mobile/web, dois dispositivos, rede intermitente, revogação e rollback;
6. autorização humana específica antes de ambiente remoto, migration, deploy ou
   produção.
