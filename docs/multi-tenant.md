# Multi-tenant (Modo Empresa) — fundação

> Onda 2, frente **"Schema multi-tenant + RLS (fundação)"**.
> Migration: `supabase/migrations/20260707_multitenant.sql` (idempotente).
> **APLICADA em produção** (projeto `yiaeplqinnnnniyvwtls`), junto de `20260708_multitenant_fixes.sql`,
> `20260718_rls_owner_backdoor.sql` (fecha o backdoor de owner — P0-2) e
> `20260719_clientes_insert_equipe.sql` (abre INSERT de `clientes` a membro ativo — P1-3).
> RLS testada com 2 JWTs (ver `docs/RLS_MATRIX.md`).

## A decisão central: organização é uma CAMADA, não um dono de dados

Os dados do negócio (`orcamentos`, `clientes`, `servicos`, `produtos`, `recibos`,
`empresa`, `agendamentos`) **continuam pertencendo ao OWNER** — a coluna `user_id`
segue apontando para o dono da conta. **Nada foi migrado para `org_id`.**

A organização é uma **camada de acesso**: um membro ativo "enxerga" e (quando
autorizado) "escreve" nos dados cujo `user_id` é o `owner_user_id` da org à qual
ele pertence. Isso mantém o modelo single-tenant existente 100% funcional:

- **Dono sozinho, sem nenhuma organização** → `donos_visiveis()` devolve só o
  próprio uid → ele vê exatamente o que via antes. **Zero regressão.**
- **Usuário sem org** → nunca enxerga dado de outro usuário. **Zero vazamento.**

Por que não big-bang para `org_id`? Porque migrar milhares de linhas + reescrever
todo o `cloudSync.ts` (que sincroniza por `user_id`) seria arriscado e sem ganho:
o produto define que "a empresa É o negócio do dono". A camada resolve o
compartilhamento com muito menos superfície de risco.

## Tabelas novas

| Tabela | Papel | Chave |
| --- | --- | --- |
| `organizacoes` | uma por dono (`owner_user_id` **UNIQUE**), com `nome` | `id` (uuid) |
| `organizacao_membros` | quem pertence a qual org e com que papel/ativo | `(org_id, user_id)` |
| `convites` | link tokenizado de entrada (papel, expiração, aceite) | `id` (uuid), `token` UNIQUE |
| `localizacoes_equipe` | última posição de cada membro (upsert) | `(org_id, user_id)` |
| `acessos_equipe` | log append-only de eventos (login/app_open) | `id` (bigint identity) |

Papéis: `owner` (dono da org, intocável via RLS de membros), `admin`, `gestor`,
`tecnico`. O próprio owner também vira uma linha em `organizacao_membros` com
papel `owner` (uniformiza os joins de RLS) — feito automaticamente pela função
`criar_organizacao`.

### Colunas novas nas tabelas de dados

- `orcamentos.criado_por uuid default auth.uid()`
- `agendamentos.criado_por uuid default auth.uid()`

Registram **quem** (técnico) criou o registro que pertence ao owner. O dono
continua gravando sem enviar nada (default = ele mesmo); o técnico grava
`user_id = owner` + `criado_por = ele`.

> Detalhe Postgres: DEFAULT de coluna **não aceita subquery**, então é
> `auth.uid()` cru. O truque `(select auth.uid())` (InitPlan, avaliado 1×/query)
> só vale **dentro das policies** — é o padrão de perf das migrations
> `20260615`/`20260624` e é mantido aqui.

## Funções auxiliares de RLS (SECURITY DEFINER, STABLE)

Encapsulam os joins de pertencimento. São `security definer` para **quebrar a
recursão de RLS**: uma policy em `organizacoes` que consultasse
`organizacao_membros` (e vice-versa) dispararia a RLS da outra tabela em loop.
Rodando como owner do schema, a função lê as tabelas de membros sem RLS.
Todas com `set search_path = ''` (hardening) e `grant execute` só a `authenticated`.

| Função | Retorno | Uso |
| --- | --- | --- |
| `eh_membro_ativo(org)` | bool | membro ativo (qualquer papel) da org |
| `eh_gestao(org)` | bool | papel owner/admin/gestor (lê acessos, localizações) |
| `eh_admin_org(org)` | bool | papel owner/admin (gerencia membros/convites) |
| `donos_visiveis()` | setof uuid | **peça central**: `{próprio uid} ∪ {owners das orgs onde sou membro ativo}` |

`donos_visiveis()` é o que abre os dados do owner para os técnicos sem vazar para
quem não é membro. Todas as policies de SELECT das 7 tabelas de dados usam
`user_id in (select public.donos_visiveis())`.

## Contrato de RLS por tabela

### Tabelas novas

- **organizacoes**: SELECT p/ membro ativo; INSERT/UPDATE/DELETE só do dono.
- **organizacao_membros**: SELECT p/ o próprio + gestão; INSERT/UPDATE/DELETE p/
  owner/admin, **nunca** tocando a linha `owner` (papel owner é intocável aqui).
- **convites**: SELECT/INSERT/DELETE p/ owner/admin da org. O aceite lê por token
  via função SECURITY DEFINER (não precisa de SELECT aberto ao convidado).
- **localizacoes_equipe**: SELECT p/ gestão + o próprio; INSERT/UPDATE só da
  **própria** linha (membro ativo grava a própria posição — upsert).
- **acessos_equipe**: SELECT p/ gestão + o próprio; INSERT só do próprio evento;
  **sem** UPDATE/DELETE (append-only).

### Tabelas de dados existentes (policies reescritas)

A policy única `*_owner` (FOR ALL) foi trocada por policies separadas:

| Tabela | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `empresa` | dono **ou membro ativo** | só o dono |
| `clientes` | dono **ou membro ativo** | **INSERT: dono ou membro ativo** (carimba `criado_por`); UPDATE/DELETE só do dono *(ver nota)* |
| `servicos` | dono **ou membro ativo** | só o dono |
| `produtos` | dono **ou membro ativo** | só o dono |
| `recibos` | dono **ou membro ativo** | só o dono |
| `orcamentos` | dono **ou membro ativo** | **dono ou membro ativo** (equipe escreve) |
| `agendamentos` | dono **ou membro ativo** | **dono ou membro ativo** (equipe escreve) |

- **SELECT** amplia em todas via `donos_visiveis()`.
- **Escrita da equipe** (INSERT) em `orcamentos`/`agendamentos` exige
  `criado_por = auth.uid()` quando `user_id` é o owner (carimba a autoria);
  o dono gravando o próprio dado passa pelo ramo `user_id = auth.uid()`.
- **UPDATE/DELETE** de `orcamentos`/`agendamentos` liberados a membros ativos
  (a UI/`usePermissao` afina quem pode o quê; a RLS é o **piso** de segurança).

> **Nota (clientes — ATUALIZADA em `20260719_clientes_insert_equipe.sql`, achado P1-3):**
> o INSERT de `clientes` **foi ampliado** para membro ativo (mesmo par
> `user_id in donos_visiveis()` + `criado_por = auth.uid()` de `orcamentos`), porque o
> wizard (`Step1Cliente`) já deixava o técnico cadastrar cliente — e sem a RLS acompanhar,
> o registro nascia no tenant do técnico e sumia pro dono ("erro vira vazio"). **UPDATE/DELETE
> de `clientes` seguem owner-only** por decisão. ⚠️ Furo de UI conhecido (re-auditoria 2026-07-12):
> a tela de clientes NÃO tem gate de papel, então um técnico que "edita/exclui" um cliente do dono
> vê sucesso local mas a mudança nunca chega ao owner (falha silenciosa). `servicos`/`produtos`/
> `empresa`/`recibos` continuam escrita conservadora só do dono.

## Funções de negócio

- **`criar_organizacao(nome) → uuid`**: cria a org do usuário atual e o inscreve
  como membro `owner` ativo. Idempotente (não duplica se já existir; atualiza o
  nome se vier preenchido). É como o app "vira empresa".
- **`aceitar_convite(token) → text`**: valida o convite (existe / não expirou /
  não foi usado), inscreve/reativa o usuário como membro com o papel do convite
  e marca o convite como aceito. Retorno legível:
  `ok` · `ja_aceito` · `erro:convite_invalido` · `erro:convite_ja_usado` ·
  `erro:convite_expirado` · `erro:nao_autenticado`.
  `SECURITY DEFINER` porque o convidado ainda não é membro (não passaria pela RLS).

## `tipo_conta` é DERIVADO

Não existe coluna `tipo_conta`. A conta é **empresa** se o usuário pertence a uma
organização (linha ativa em `organizacao_membros`). O hook `useTipoConta` (frente
de UI) deriva isso; no banco, basta um
`select exists(... organizacao_membros where user_id = auth.uid() and ativo)`.

## Interação com `cloudSync.ts` (ponto de maior atenção da onda)

O `cloudSync` já faz **pull** com `supabase.from(tabela).select('*')` **sem**
`.eq('user_id', ...)` — ou seja, ele confia 100% na RLS para escopar as linhas.
**Consequência ótima:** ao ampliar o SELECT para incluir os dados do owner, o
pull do técnico passa a trazer os dados do owner **sem mudar uma linha de código
de sync**. Não há `.eq('user_id')` hardcoded a corrigir no caminho de leitura.

O **push** faz `upsert` **sem** enviar `user_id` (confia no `DEFAULT auth.uid()`).
Isso significa que, hoje, um técnico criando um orçamento gravaria com
`user_id = ele` (passa pelo ramo self da policy). Para o técnico gravar **em nome
do owner**, o cliente precisa enviar `user_id = owner` + `criado_por = ele`
explicitamente — isso é trabalho da **frente de UI/serviço `equipe.ts`**, não
desta migration. A RLS aqui **permite** esse caminho; ela não o força.

## Testes (2 JWTs)

O fim do arquivo `.sql` traz 7 blocos de teste comentados (T1–T7) que o
integrador roda no SQL editor do Supabase simulando dois usuários (A = dono,
B = técnico) via `set request.jwt.claims` + `set role authenticated`:

1. **T1** — dono sozinho não regride (single-tenant intacto).
2. **T2** — B sem org não vê nada de A (zero vazamento).
3. **T3** — A cria org, convida B, B aceita → B passa a ver os dados de A.
4. **T4** — B (técnico ativo) cria orçamento em nome de A (com `criado_por = B`);
   tentativa de gravar em nome de A sem ser o autor **falha**.
5. **T5** — desativar B (`ativo = false`) corta o acesso na hora.
6. **T6** — convite inválido/expirado/reusado retorna o status certo.
7. **T7** — técnico **não** edita `empresa`/catálogo (escrita conservadora).

> Simular JWT exige rodar como `authenticated` (o role `postgres`/owner **ignora**
> RLS). Trocar `<A>`, `<B>`, `<ORG>` pelos UUIDs reais antes de rodar.

## O que esta frente NÃO fez (fica para as frentes irmãs)

- `worker/src/equipe.js`, `EquipeScreen`, `usePermissao`, `useTipoConta`,
  `equipe.ts` — frente "Convites + cadastro + papéis na UI".
- `localizacaoEquipe.ts` (captura via `expo-location`) — frente "Equipe ao vivo";
  a **captura nativa** só liga no prebuild da Onda 8 (flag `LOCALIZACAO_DISPONIVEL`).
- Aplicar a migration — **o integrador** aplica após revisar.
