# Onda 3 / Janela 3.1 — inventário do boundary de shadow mode

**Estado:** evidência local/read-only — não é uma integração, migração ou aceite.  
**Run/handoff:** `olli-20260830-124422-11` / `handoff-20260830-124422-o3j31-shadow-baseline`  
**Protocolo:** `v4.0.0 / 99912f0136a38dc179cdb1debee99925ba629e0f7cb58aceedb82b8ac06908a7`  
**Data da inspeção:** 2026-08-30 (America/Sao_Paulo)

## Decisão desta subetapa

Não há um boundary seguro para ligar shadow mode ao runtime atual nesta janela.
O único próximo slice potencialmente seguro é um **contrato puro, local e
sintético**, fora do app e sem importar `database.ts` nem `cloudSync.ts`. Ele
precisa representar organização, cliente, local e equipamento com fixtures e
testes, antes de se cogitar adapter, feature flag, migração ou dual-write.

O motivo central é simples: cada escrita real de equipamento pode disparar o
espelho remoto existente, enquanto o painel web também escreve diretamente no
remoto; e `local` ainda não é um agregado persistido do V1. Criar uma camada
nova ligada a esses módulos criaria uma segunda fonte de verdade ou uma escrita
invisível, exatamente o risco que shadow mode deve evitar.

## Mapa de autoridade e superfície

| Entidade | Leitura local observada | Escrita/espelho observados | Autoridade atual | Risco para shadow ligado ao runtime | Decisão agora |
|---|---|---|---|---|---|
| Organização / empresa ativa | `carregarMinhaOrganizacao` lê a membresia ativa e escolhe uma linha em `src/services/equipe.ts:95-130`; painel repete a regra em `webapp/src/olli/mutacoes.ts:56-93`. | Para membro não-dono, tabelas classificadas são carimbadas no tenant do dono; empresa é linha por dono. | A empresa ativa é **derivada da membresia ativa mais antiga** (`criado_em ASC`), não de um seletor explícito de empresa ativa. | Alto: uma interpretação nova de “empresa atual” pode divergir entre celular, painel e sync. | Não introduzir seleção, estado de organização ou adapter nesta janela. Registrar a regra derivada no contrato sintético. |
| Cliente | Tabela SQLite `clientes` em `src/database/database.ts:178-192`; push em lote lê clientes em `src/services/cloudSync.ts:1899-1900`. | No mobile, cliente é tabela de tenant do dono em `src/services/cloudSync.ts:597-606` e há `pushRow` fire-and-forget em `src/services/cloudSync.ts:535-548`; no painel, `useSalvar` faz upsert remoto direto em `webapp/src/olli/mutacoes.ts:218-230`. | Duas superfícies de escrita: SQLite + espelho no app e remoto direto no painel, ambas sob contexto de equipe. | Crítico: uma nova leitura poderia comparar estados de superfícies diferentes ou sincronizar sem chamada explícita do recurso. | Só fixture/contrato; nenhum CRUD, sync, adapter ou dual-write. |
| Local | Não foi encontrada tabela SQLite `locais`, `SyncTable` ou tabela remota correspondente no recorte `src/`, `webapp/` e `worker/`; é apenas `equipamentos.local_id` / `Equipamento.localId`. | Não há CRUD, SyncTable ou autoridade própria de `local` no V1. | **Inexistente como agregado persistido.** Hoje é uma referência textual/ID suave em equipamento. | Crítico para modelagem: tratar `local_id` como FK válida inventaria uma fonte de verdade que não existe. | O contrato futuro deve declarar `local` como entidade candidata independente, nunca assumir que um `local_id` atual resolve para uma tabela. Sem migration agora. |
| Equipamento | SQLite `equipamentos` em `src/database/database.ts:401-426`; leitura e save em `src/database/database.ts:1766-1851`. O painel relê `assets` direto antes de editar em `webapp/src/pages/olli/equipamentos/FormEquipamento.tsx:163-180`. | No mobile, `saveEquipamentoDb` chama `mirrorPush` em `:1847-1850` e o sync mapeia `equipamentos` local para `assets` remoto em `src/services/cloudSync.ts:94-104`, `:435-467`; no painel, o formulário salva via `useSalvar`/Supabase direto. | Duas superfícies de escrita/leitura: SQLite + sincronização em background no app e remoto direto no painel; a tabela remota é `assets`. | Crítico: um save aparentemente local ou uma releitura web pode observar/escrever autoridade diferente quando existir sessão. | Não importar nem chamar os módulos de banco/sync. Só fixture estática, sem equipamento real. |

## Evidência técnica rastreável

1. **Persistência existente.** `empresa` e `clientes` são criadas em
   `src/database/database.ts:169-192`; `equipamentos` é criada em
   `src/database/database.ts:395-426`. A varredura estática não encontrou
   `CREATE TABLE IF NOT EXISTS locais`, `SyncTable` com `locais` ou tabela
   equivalente no recorte permitido.
2. **Local não tem integridade referencial local.** O schema expõe
   `equipamentos.local_id` em `src/database/database.ts:401-405`, mas não há
   tabela de locais nem `FOREIGN KEY`; a conversão mantém apenas
   `localId` em `src/database/database.ts:1783-1804`.
3. **Equipamento já possui caminho de escrita remota.** O save SQLite chama
   `mirrorPush('equipamentos', e)` em `src/database/database.ts:1833-1851`.
   `pushRow` não lança e realiza upsert quando há sessão
   (`src/services/cloudSync.ts:535-548`); equipamentos viram `assets` remoto
   (`src/services/cloudSync.ts:94-104`, `:435-467`).
4. **O painel também grava diretamente no remoto.** `useSalvar` converte o
   objeto de domínio e faz upsert remoto em `webapp/src/olli/mutacoes.ts:218-230`;
   o formulário de equipamento relê `assets` direto antes da edição em
   `webapp/src/pages/olli/equipamentos/FormEquipamento.tsx:163-180`.
5. **A sincronização de login é ampla.** `syncOnLogin` abre a partição,
   atualiza o contexto de equipe, faz pull e chama `pushAllLocal`
   (`src/services/cloudSync.ts:2436-2469`). O lote inclui clientes e consulta
   timestamps de equipamentos (`src/services/cloudSync.ts:1873-1900`).
6. **Autoridade de tenant é determinística, mas implícita.** App e painel
   escolhem a membresia ativa mais antiga, ambos ordenando `criado_em ASC`
   (`src/services/equipe.ts:101-129`, `webapp/src/olli/mutacoes.ts:63-93`).
   Para tabelas de colaboração, clientes e equipamentos pertencem ao tenant do
   dono (`src/services/cloudSync.ts:597-606`,
   `webapp/src/olli/contrato.ts:65-102`).
7. **Restore não é uma base de shadow mode.** Ele substitui tabelas reais e
   depois pode disparar `pushAllLocal` (`src/database/database.ts:2461-2488`);
   portanto não é admissível para esta experiência isolada.

## Invariantes obrigatórios para qualquer slice posterior

- Nenhuma importação de `src/database/database.ts` ou
  `src/services/cloudSync.ts` pelo novo contrato/harness.
- Nenhuma chamada a `saveEquipamentoDb`, `pushRow`, `pushAllLocal` ou
  `syncOnLogin`; nenhum SQLite, rede, Supabase, Worker ou dado real.
- O contrato deve tratar app (SQLite + mirror) e painel web (upsert remoto
  direto) como superfícies distintas; não assumir que o sync móvel é a única
  autoridade nem que uma leitura web representa o estado local.
- O tenant no fixture deve ser declarado explicitamente, e a regra atual
  “membresia ativa mais antiga” deve ser testada como dado de entrada — não
  recalculada contra sessão real.
- `local` deve começar como objeto sintético do novo contrato, identificado por
  uma chave estável própria; não pode presumir uma tabela V1, FK ou sync já
  existentes.
- O resultado local precisa declarar que não prova RLS, banco, dispositivo,
  sync, produção ou aceite.

## Próximo slice proposto — ainda não implementado

Reutilizar primeiro o laboratório puro já existente em
`docs/ONDA_2/JANELA_2_5/` (`shadow/increment-a-shadow-pilot.mjs`, fixtures e
testes) e acrescentar somente o contrato que falta para organização e
equipamento em um módulo Node puro sob
`docs/ONDA_3/JANELA_3_1/kernel/` (ou futuro diretório de teste explicitamente
autorizado) com:

1. DTOs allowlistados: `ShadowOrganization`, `ShadowClient`,
   `ShadowLocation` e `ShadowEquipment`;
2. fixtures sintéticas de uma organização, dois clientes, dois locais e
   equipamentos ligados apenas por IDs do próprio fixture;
3. uma projeção determinística de leitura e uma trilha de decisão local;
4. testes de isolamento que provem ausência de import de runtime/sync e ausência
   de chamadas de rede;
5. revisão read-only P0/P1 antes de criar qualquer adapter ou tocar no app.

O reuso evita duplicar o harness de cliente/local já auditado e mantém o slice
reversível porque nenhum estado V1 é lido, escrito ou convertido.
Ele deve parar se o contrato demandar uma decisão de produto sobre a semântica
de `local`, escolha explícita de empresa ativa ou fonte de verdade.

## Limites desta evidência

Esta inspeção foi estática e local. Não foram executados app, Expo, SQLite,
sync, Worker, banco, migrations, chamadas HTTP, provider, login, dispositivo,
pagamento, deploy ou produção. Consequentemente, ela não declara qualquer
comportamento remoto como aceito; apenas identifica os caminhos que devem ficar
fora do shadow mode inicial.
