# AUDITORIA DO BANCO — RLS e o que ela deixa passar

**Cluster G3 · leitura apenas · 2026-07-18**
Fonte: as 26 migrations `.sql` + 1 `.sql.pendente` em `supabase/migrations/`, confrontadas com
`src/services/cloudSync.ts`, `src/services/equipe.ts`, `src/services/contextoEquipe.ts`,
`src/services/backup.ts` e `worker/src/`.

> **A ferramenta do Supabase (`mcp__supabase__*`) NÃO estava autorizada nesta sessão.**
> `list_projects` respondeu `Unauthorized. Please provide a valid access token`. Portanto **nada
> aqui foi confrontado com o banco de produção**: não rodei `list_tables`, não li os advisors de
> segurança, não confirmei quais migrations estão realmente aplicadas. Tudo abaixo é derivado do
> repo. Onde o repo não permite concluir, está escrito "não verificável" — e essa é uma resposta,
> não uma lacuna a preencher com chute. Ver §6 e §7, que são justamente sobre isso.

---

## 1. Veredito

O modelo de isolamento está **bem desenhado e, na maior parte, bem implementado**. O padrão é
consistente e maduro: dado é do OWNER (`user_id`), a organização é uma *lente* (`donos_visiveis()`),
as helpers são `SECURITY DEFINER` com `search_path = ''`, `user_id` é imutável por trigger em 10
tabelas, e as tabelas de dinheiro (`credit_ledger`, `webhook_events`, `ia_uso_gratis`, `cnpj_cache`)
são inacessíveis à escrita do cliente por desenho — não por sorte. Não achei nenhuma policy
`using (true)`, nenhuma tabela com RLS ligada e policy frouxa, nenhum `SECURITY DEFINER` exposto a
`authenticated` que não devesse estar.

**Mas há um furo P0 que anula tudo isso**, e ele não está numa policy errada — está numa policy que
falta. `organizacao_membros` aceita **INSERT de membro sem consentimento do inserido**. Como a
identidade de tenant do app é derivada dessa tabela, plantar uma linha lá faz o **aparelho da vítima
empurrar a base inteira dela para o tenant do atacante**. O dado não é *lido* através da RLS — ele é
*entregue* pelo cliente da vítima, com a RLS aprovando cada linha, porque do ponto de vista dela a
escrita é legítima. É a inversão exata do vazamento que a Onda 2 fechou.

Além disso: **um achado P1 de dinheiro** (`equipe_grandfathered` é auto-concedível pelo dono, contra
o que o comentário da própria migration manda), **um achado P1 de perda de dado** (`exclusoes` é
self-only e é o mecanismo de propagação de exclusão de tabelas compartilhadas → exclusão definitiva
ressuscita), e **a base do schema não está no repo** (§6).

| # | Gravidade | Achado | Ação |
|---|---|---|---|
| A1 | **P0** | Membro plantado sem consentimento → base da vítima migra para o tenant do atacante | Policy + código |
| A2 | **P1** | `equipe_grandfathered` é escrevível pelo dono = plano Empresa de graça | Policy |
| A3 | **P1** | `exclusoes` self-only propaga mal → item excluído em definitivo ressuscita | Policy ou código |
| A4 | **P1** | `contadores` self-only → numeração duplicada dentro do tenant do dono | Código |
| A5 | **P2** | Guarda de backup do membro é só no cliente (RLS não alcança blob) | Aceitar/documentar |
| A6 | **P2** | `perfil_visivel` entrega e-mail/nome via a mesma primitiva de A1 | Some com A1 |
| A7 | **P2** | UNIQUE global em `orcamento_versoes` permite DoS cross-tenant | Índice |
| A8 | **Info** | Base do schema (13 tabelas) não existe em migration nenhuma | Higiene |

---

## 2. Mapa: tabela por tabela, quem enxerga o quê

`DV` = `user_id in (select public.donos_visiveis())` — o dono **e** os membros ATIVOS da org dele.
`self` = `(select auth.uid()) = user_id`.

### 2.1 Dados do negócio (leitura compartilhada com a equipe)

| Tabela | SELECT | INSERT | UPDATE | DELETE | Origem |
|---|---|---|---|---|---|
| `empresa` | DV | self | self | self | 20260707 |
| `clientes` | DV | self **ou** (DV + `criado_por=uid`) | self | self | 20260707 + 20260719 |
| `servicos` | DV | self | self | self | 20260707 |
| `produtos` | DV | self | self | self | 20260707 |
| `recibos` | DV | self | self | self | 20260707 |
| `orcamentos` | DV | self **ou** (DV + `criado_por=uid`) | DV | DV | 20260707 |
| `agendamentos` | DV | self **ou** (DV + `criado_por=uid`) | DV | DV | 20260707 |
| `orcamento_versoes` | DV | self **ou** DV | DV | DV | 20260708 |
| `ordens_servico` | DV | self **ou** (DV + `criado_por=uid`) | DV | DV | 20260710 |
| `assets` | DV | self **ou** (DV + `criado_por=uid`) | DV | DV | 20260709 |
| `asset_qr_tokens` | DV | idem | DV | DV | 20260709 |
| `service_contracts` | DV | idem | DV | DV | 20260709 |
| `service_contract_versions` | DV | idem | DV | DV | 20260709 |
| `pmoc_plans` | DV | idem | DV | DV | 20260709 |
| `pmoc_plan_versions` | DV | idem | DV | DV | 20260709 |
| `pmoc_ordens_geradas` | DV | idem | DV | DV | 20260715 |
| `qr_scan_events` | DV **e** `user_id not null` | — | — | — | 20260709 |

**Um autenticado lê/escreve linha de outro tenant aqui?** Não — *desde que* a associação em
`organizacao_membros` seja legítima. `donos_visiveis()` é `SECURITY DEFINER` com `search_path=''`,
lê `organizacoes ⋈ organizacao_membros` filtrando por `auth.uid()` e `ativo`. Sem linha de membro,
o conjunto é `{eu}` e o comportamento é idêntico ao single-tenant. **É exatamente essa premissa que
A1 quebra.**

`orcamento_versoes` é a única com INSERT sem `criado_por = auth.uid()` — inconsistente com as
irmãs, mas não é vazamento (o alvo continua preso a `DV`); só perde a autoria.

### 2.2 Dados do dono, sem compartilhamento (self-only)

`backups`, `contadores`, `depoimentos`, `modelos` (20260615, `FOR ALL` self) · `exclusoes`,
`orcamentos_publicos` (20260624, `FOR ALL` self) · `extras_sync` (20260707000000, `FOR ALL` self).

Isolamento correto. Mas **quatro destas participam de fluxos compartilhados** e a assimetria produz
bug: `exclusoes` (A3), `contadores` (A4), `modelos` e `depoimentos` (o técnico nunca recebe os
modelos do dono — degradação funcional silenciosa, não vazamento).

### 2.3 Estrutura da organização

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `organizacoes` | `eh_membro_ativo(id)` | `owner_user_id = uid` | dono | dono |
| `organizacao_membros` | própria linha **ou** `eh_gestao` | **`eh_admin_org` + `papel<>'owner'`** | idem + `papel<>'owner'` | idem |
| `convites` | `eh_admin_org` | `eh_admin_org` | *(nenhuma)* | `eh_admin_org` |
| `localizacoes_equipe` | própria **ou** `eh_gestao` | própria + membro ativo | própria + membro ativo | *(nenhuma)* |
| `acessos_equipe` | própria **ou** `eh_gestao` | própria + membro ativo | *(nenhuma)* | *(nenhuma)* |
| `profiles` | `perfil_visivel(user_id)` | *(nenhuma)* | *(nenhuma)* | *(nenhuma)* |

O backdoor de owner foi corretamente fechado em `20260718` (INSERT ganhou `papel <> 'owner'` +
índice único parcial de 1 owner por org). **O que ficou aberto é o `user_id` do INSERT — ver A1.**

### 2.4 Tabelas de dinheiro e de servidor (§4 detalha)

| Tabela | RLS | Policies | Quem escreve |
|---|---|---|---|
| `credit_ledger` | on | SELECT self | só `service_role`; UPDATE/DELETE bloqueados **por trigger** |
| `ia_uso_gratis` | on | SELECT self | só `service_role` |
| `webhook_events` | on | **nenhuma** | só `service_role` |
| `cnpj_cache` | on | **nenhuma** | só `service_role` |
| `feedback` | on | INSERT self | app insere; só `service_role` lê |
| `eventos_orcamento_publico` | on | SELECT do dono do token | só `service_role` |
| `assinaturas` | **não verificável** | **não verificável** | webhook | 

RLS ligada **sem policy** nega tudo para `anon`/`authenticated` — está certo em `webhook_events` e
`cnpj_cache`, e é o desenho declarado. Nenhuma tabela do repo tem RLS desligada.

---

## 3. Onde o código depende de filtro que a RLS não garante

Varri `cloudSync.ts` atrás de consulta sem `.eq('user_id')` confiando na policy. **Três casos, e a
policy cobre os três** — mas dois cobrem *demais* ou *de menos*:

| Local | Consulta | Policy cobre? |
|---|---|---|
| `cloudSync.ts:1391` | `.from(tabela).select('*')` (pullAll) | Sim — `DV`. É o desenho. |
| `cloudSync.ts:865` | `.from(tabela).select('id, atualizado_em')` | Sim — `DV`. |
| `cloudSync.ts:1188` | `.from('exclusoes').select(...)` | Sim, mas **self-only ≠ o conjunto que o dado precisa** → **A3** |
| `cloudSync.ts:1295` | `.from('contadores').select('chave, valor')` | Sim, mas self-only → **A4** |

O caminho de `empresa` (linhas 727/733/753) é o **contraexemplo positivo**: alguém já sentiu essa
dor e adicionou `.eq('user_id', userId)` com comentário explicando que sem o filtro o `maybeSingle()`
via a empresa de outra pessoa. É o padrão certo. **`exclusoes` e `contadores` são o mesmo bug ainda
não corrigido, na direção oposta** (ali sobravam linhas; aqui faltam).

---

## 4. Tabelas de dinheiro: são imutáveis de verdade?

**`credit_ledger` — sim, e é o melhor pedaço deste banco.**
Um usuário **não consegue** se creditar: RLS ligada, só `credit_ledger_select_own` (SELECT self),
nenhuma policy de INSERT/UPDATE/DELETE → PostgREST recusa a escrita de `authenticated` (42501). O
saldo é derivado (`SUM(delta)`), não coluna materializada.
E `20260726` fecha o que a RLS **não** alcança: `credit_ledger_append_only()` é trigger `BEFORE
UPDATE/DELETE`, e trigger vale para o **`service_role` também**. UPDATE é sempre recusado; DELETE só
passa quando `auth.users` já não tem o dono — o que só acontece dentro do cascade da exclusão de
conta (LGPD). O raciocínio está correto: no cascade, o pai já foi removido quando o trigger roda.
Correção = linha nova com `origem='ajuste'`. Idempotência por `unique (origem, ref) where ref is not null`.

**`ia_uso_gratis` — sim.** Mesmo desenho. O usuário lê a própria cota e não a apaga.
`consumir_cota_ia` é `SECURITY DEFINER` com `revoke ... from authenticated` e `grant ... to
service_role` — se `authenticated` pudesse chamá-la, daria para queimar cota alheia ou não gastar a
própria. A janela de 10 min na idempotência está certa e o comentário explica o furo que ela fecha
(ref é string do cliente; idempotência eterna = IA infinita). `saldo_creditos(uuid)` e
`ref_cobranca_ia_recente` também são `service_role`-only. `meu_saldo_creditos()` é `SECURITY INVOKER`
de propósito — correto, a policy de SELECT já recorta.

**`assinaturas` — NÃO VERIFICÁVEL, e isso é o achado.**
A tabela é lida como fonte da verdade do plano (`src/services/planos.ts:98`,
`webapp/src/pages/olli/planos/index.tsx:60`) e é o que `worker/src/equipe.js:209` consulta para
liberar Equipe. **Ela não é criada por migration nenhuma do repo** — só um `alter table if exists`
em `20260728`. Não consigo dizer daqui se `authenticated` pode dar `UPDATE` na própria linha. Se a
policy dela seguir o padrão `*_owner FOR ALL` de `20260615` (que cobre `backups`, `clientes`,
`contadores`, `depoimentos`, `empresa`, `modelos`, `orcamentos`, `produtos`, `recibos`, `servicos` —
**`assinaturas` não está na lista**), então um `update assinaturas set plano='empresa'` concede o
plano mais caro de graça. **É a primeira coisa a checar quando a ferramenta do Supabase estiver
autorizada.** Não afirmo que está furado; afirmo que não dá para saber pelo repo, e que o custo de
estar errado é a receita inteira.

---

## 5. Achados, com o caminho concreto

### A1 · P0 — Membro plantado sem consentimento: a base da vítima migra para o tenant do atacante

**A policy.** `membros_admin_insert` (20260707, reescrita em 20260718):

```sql
with check (public.eh_admin_org(org_id) and papel <> 'owner')
```

Ela valida **quem insere** e **qual papel**. Não valida **quem está sendo inserido**. Não há
vínculo com `convites`, nem com aceite, nem nada. O caminho legítimo (`aceitar_convite`) é
`SECURITY DEFINER` e nem passa por aqui — então esta policy existe só para o INSERT direto, e o
INSERT direto não pede consentimento.

**Por que isso vira exfiltração, e não só um convite indesejado.** Porque a identidade de tenant do
app **é derivada desta tabela**:

`src/services/equipe.ts:104-113` lê a associação e — repare — sem `order by` e sem preferir
`papel='owner'`:

```ts
.from('organizacao_membros').select('org_id, papel, ativo')
.eq('user_id', user.id).eq('ativo', true).limit(1);
```

`contextoEquipe.ts:36` classifica: `if (r.org && r.org.papel !== 'owner') return { status: 'membro', ownerUserId: r.org.ownerUserId }`.
`decidirEscritaEquipe` devolve `userIdOverride = ownerUserId`.
`cloudSync.ts:689-697` aplica esse override em **toda** linha de `TABELAS_TENANT_EQUIPE`
(`clientes`, `orcamentos`, `agendamentos`, `ordens_servico`, `equipamentos`, `pmoc_planos`,
`pmoc_plano_versoes`, `pmoc_ordens_geradas`), e `pushAllLocal` (linha 1618) empurra **tudo**
(`SELECT * FROM clientes`, …), não só o que mudou.

**Exploração, passo a passo:**

1. Atacante (qualquer autenticado, inclusive um técnico **já desligado**) chama
   `select public.criar_organizacao('x')` → vira `owner` da própria org `O`. Grátis, sem gate.
2. Atacante precisa do `auth.uid()` da vítima. Um ex-membro **já tem**: enquanto era membro, todo
   `select user_id from clientes` devolvia o uuid do dono — é a coluna de tenant, ela vem em toda
   linha que ele sincronizou.
3. Atacante insere, direto no PostgREST com o próprio JWT:
   ```sql
   insert into organizacao_membros (org_id, user_id, papel, ativo)
   values ('<O>', '<uuid-da-vítima>', 'tecnico', true);
   ```
   Passa: `eh_admin_org('<O>')` é true (ele é owner), `papel <> 'owner'` é true.
4. No próximo sync da vítima, `carregarMinhaOrganizacao` retorna a org `O` — a vítima é
   classificada como **`membro`** do atacante. (Se a vítima nunca criou org própria, é o único
   resultado possível. Se criou, o `limit(1)` sem `order by` deixa o Postgres escolher.)
5. `pushAllLocal` reescreve **toda** a base local da vítima com `user_id = <atacante>`. A RLS
   **aprova cada linha**: `clientes_membro_insert` exige `user_id in donos_visiveis()` — e
   `donos_visiveis()` da vítima agora contém o atacante — e `criado_por = auth.uid()` — que é a
   própria vítima. Nada aqui é anômalo para o banco.
6. Atacante lê tudo: é o tenant dele.

**O que torna isso pior que um vazamento de leitura:** a vítima não perde uma cópia, ela perde a
**posse**. As linhas nascem no tenant do atacante. E o inverso do fluxo já foi mapeado neste repo —
`contextoEquipe.ts:93-99` descreve com precisão o dano de dado do dono acabar "dentro do tenant de
outra pessoa, que a leva embora ao ser desligada". A defesa foi construída para o membro honesto;
não para quem **fabrica** a associação.

**Correção (do dono — não apliquei nada):**
- Amarrar o INSERT a um convite aceito, ou remover a policy de INSERT direto e deixar
  `aceitar_convite()` (que exige o token de 128 bits) como único caminho. O token está correto:
  `crypto.getRandomValues(16 bytes)` → base64url, `worker/src/equipe.js:273-277`.
- Independente disso, corrigir `equipe.ts:104` para **preferir a própria org**:
  `.order('papel')` não basta — filtrar `papel='owner'` primeiro e só cair para membro se não houver.
  Ninguém deveria virar técnico de terceiro sem ter aceitado nada.

---

### A2 · P1 — `equipe_grandfathered` é auto-concedível: plano Empresa de graça

A migration `20260725` cria a coluna em `organizacoes` e o comentário final dela **manda
exatamente o contrário do que o schema faz**:

> "Ninguém pode ESCREVER esta coluna pelo client (…) Se um dia isso mudar, esta coluna vira
> auto-promoção a Empresa: mantenha-a fora de qualquer policy de UPDATE do client."

Mas `organizacoes_owner_update` (20260707) já é uma policy de UPDATE do client, e ela é **por
linha, não por coluna** — cobre toda coluna presente e futura:

```sql
using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()))
```

E o gate lê a coluna e retorna **antes** de olhar o plano — `worker/src/equipe.js:203`:
`if (org.equipe_grandfathered === true) return 'sim';`

**Exploração (uma linha):**
```sql
update public.organizacoes set equipe_grandfathered = true where owner_user_id = auth.uid();
```
→ Equipe + Mapa liberados sem assinar o Empresa (R$ 99/mês).

Não é teórico nem futuro: a condição que o comentário temia **já era verdade quando ele foi
escrito**. Correção: restringir o UPDATE do client às colunas legítimas (policy por coluna via
`GRANT UPDATE (nome) `, ou trigger que congela `equipe_grandfathered` para não-`service_role`).

---

### A3 · P1 — Exclusão definitiva ressuscita: `exclusoes` é self-only mas propaga dado compartilhado

`exclusoes` guarda os tombstones e sua policy é **self-only** (`exclusoes_owner`, 20260624). Mas
`DELETABLE_TABLES` (`cloudSync.ts:1149`) inclui `clientes`, `orcamentos`, `agendamentos`,
`ordens_servico`, `equipamentos` — todas **compartilhadas** (`DV`).

- `pushTombstone` (linha 795) grava **sem `user_id`** → o default `auth.uid()` carimba **quem
  apagou**.
- `applyCloudTombstones` (linha 1188) lê **sem filtro**, confiando na RLS → que devolve **só os
  tombstones próprios**.

**Caminho concreto:** o dono A usa "Excluir definitivamente" num cliente → nasce tombstone com
`user_id = A` e a linha some da nuvem. O técnico B **nunca vê esse tombstone** (RLS self-only), logo
`localDeleteById` não roda no aparelho dele e a cópia local sobrevive. No próximo
`pushAllLocal`, B reenvia a linha com `user_id = A` (o override de `TABELAS_TENANT_EQUIPE`) e
`clientes_membro_insert` **aprova**. O cliente que o dono apagou de vez **volta**, e volta no tenant
do dono.

Simétrico e igualmente ruim no sentido inverso (B apaga, A ressuscita). Esta é a mesma família do
bug já documentado em `contextoEquipe.ts:63-81` ("o backup do técnico ressuscita dados apagados do
dono") — a lixeira/soft-delete resolveu o caminho comum, mas o caminho de exclusão definitiva
continua dependendo de `exclusoes`, que ficou de fora da Onda 2.

Correção: ampliar `exclusoes` para `donos_visiveis()` na leitura (e gravar o tombstone no tenant do
dono, como as demais tabelas de equipe), **ou** migrar a exclusão definitiva para o mesmo mecanismo
compartilhado. Não é achado de segurança — é perda/ressurreição de dado, que para este público dói
igual.

---

### A4 · P1 — `contadores` self-only: numeração duplicada dentro do tenant do dono

Mesma raiz de A3. `contadores` é self-only e `cloudSync.ts:1295` lê sem filtro. Resultado: cada
membro mantém **a própria sequência**, enquanto os documentos que eles emitem nascem todos no tenant
do dono. Dois técnicos e o dono emitem, cada um, o "00426".

Isso interage diretamente com **`20260727_numero_unico_por_tenant.sql.pendente`**: o índice
`unique (user_id, numero)` que ela cria passaria a rejeitar (23505) o push do segundo emissor. E
`mirrorPush` é fire-and-forget e engole erro — o documento fica lindo no celular e **nunca aparece
no painel**. O arquivo já avisa disso no item 3 do cabeçalho e por isso está com extensão
`.pendente`; o que ele **não** diz é que a equipe torna a colisão *rotineira*, não uma corrida rara
de dois aparelhos offline. **O pré-requisito daquela migration deveria incluir compartilhar
`contadores`, não só ensinar o push a renumerar.**

---

### A5 · P2 — A guarda de backup do membro é só no cliente (e a RLS não tem como ajudar)

`backup.ts:52` (`exigirPermissaoBackupNuvem`) impede o membro de subir snapshot — e a análise em
`contextoEquipe.ts:88-105` está certa sobre o porquê. Mas essa guarda vive **inteiramente no
aparelho**. Qualquer membro que chame o PostgREST direto com o próprio JWT faz
`insert into backups_versionados (user_id, tipo, data) values (<eu>, 'manual', <base do dono>)` e a
RLS aprova, porque `user_id = auth.uid()`.

Registro isso como **risco residual aceito, não como bug a corrigir na RLS**: o membro já **pode
ler** todo esse dado por desenho (`donos_visiveis()`), e o banco não tem como saber que um blob
`jsonb` contém dado de outro tenant. O que se perde não é confidencialidade — é **persistência**: a
cópia sobrevive ao desligamento da equipe. Se isso for inaceitável, a resposta é reter snapshot de
membro no tenant do dono (ou não retê-lo), não uma policy.

**Nota:** `backups_versionados` **não é criada por migration nenhuma do repo** (ver §6). As policies
dela são desconhecidas daqui. Se a RLS dela estiver *desligada* em produção, isto deixa de ser P2 e
vira P0 — qualquer autenticado leria a base inteira de todos os tenants. **Checar assim que houver
acesso ao banco.**

---

### A6 · P2 — `perfil_visivel`: e-mail e nome pela mesma primitiva de A1

`perfil_visivel(alvo)` (20260723) libera o perfil de quem for membro de uma org onde eu sou gestão.
Com A1 (plantar a vítima na minha org), `profiles_visivel` passa a devolver o **e-mail e o nome**
dela. Impacto muito menor que A1 e **desaparece junto com ele** — listado para que a correção de A1
não seja avaliada só pelo eixo de dados de negócio. A view `organizacao_membros_perfil` está
corretamente `security_invoker = on` e não toca `auth.users`; o hardening de `20260723` está certo.

---

### A7 · P2 — UNIQUE global permite negar serviço a outro tenant

`orcamento_versoes_orc_num_uidx` é `unique (orcamento_id, numero_versao)` — **sem `user_id`**.
Idem `service_contract_versions_num_uidx`, `pmoc_plan_versions_num_uidx` e
`pmoc_ordens_geradas_unica`.

Quem souber o `orcamento_id` de outro tenant (um ex-membro sabe todos) pode inserir, **no próprio
tenant**, uma linha com aquele `orcamento_id` e `numero_versao = N`. O par fica ocupado
globalmente e o dono legítimo passa a tomar 23505 ao congelar a versão N. Não lê nem escreve dado
alheio — **impede** o dono de escrever o próprio. Grão certo seria `(user_id, orcamento_id, numero_versao)`.

---

## 6. Divergência repo × produção (achado por si só, como o briefing previa)

**Não consegui medir a divergência** (MCP não autorizado). Mas o repo prova, sozinho, que ela
existe: **a base do schema não está versionada**. A migration mais antiga (`20260615160744`) já
começa com `drop policy if exists` sobre tabelas que ninguém criou no repo.

Tabelas usadas em produção e **sem `CREATE TABLE` em migration alguma**:

`backups` · `backups_versionados` · `clientes` · `contadores` · `depoimentos` · `empresa` ·
`exclusoes` · `modelos` · `orcamentos` · `orcamentos_publicos` · `produtos` · `recibos` ·
`servicos` · `agendamentos` · `assinaturas`

Some-se a isso a função `rls_auto_enable()` (revogada em `20260615`, nunca definida no repo) — pelo
nome, um event trigger que liga RLS em tabela nova. Se ele existe, é uma boa rede de proteção; se
foi removido, tabela nova nasce **sem RLS**. Não dá para saber daqui.

Consequências práticas: (a) não é possível recriar o banco do zero a partir do repo; (b) as
policies de `assinaturas` e `backups_versionados` — as duas mais sensíveis que sobraram — são
invisíveis à revisão de código; (c) um `git diff` nunca mostraria se alguém afrouxou uma delas.

**Quando o MCP estiver autorizado, a ordem de checagem é:** `get_advisors(security)` →
policies de `assinaturas` → RLS de `backups_versionados` → `list_migrations` contra esta pasta.

---

## 7. Migrations no repo que (aparentemente) não foram aplicadas

Os cabeçalhos das próprias migrations são a única evidência disponível. Elas se dividem em três
grupos:

**Declaram-se APLICADAS:** `20260709_pmoc_fundacao` (08/07) · `20260715_pmoc_fase2` (09/07) ·
`20260714_atualizado_em` (09/07) · `20260716_publicos_revogacao` (09/07) ·
`20260717_feedback_inbox` (10/07) · `20260722_fk_covering_indexes` (14/07) ·
`20260723_profiles_view_hardening` (14/07).

**Declaram-se NÃO aplicadas no texto** (podem ter sido depois — o texto não é atualizado):
- **`20260720_credit_ledger`** — "NÃO aplicada ainda". Se não rodou: não há saldo, e
  `20260726_credit_ledger_imutavel` + `ref_cobranca_ia_recente` referenciam tabela inexistente.
- **`20260721_cnpj_cache`** — "NÃO aplicada ainda". Sem ela o worker consulta a BrasilAPI a cada
  request (fair-use), sem cache. Degrada, não quebra.

**Sem declaração — verificar:** `20260718_rls_owner_backdoor`, `20260719_clientes_insert_equipe`,
`20260724_webhook_events`, `20260725_equipe_grandfathering`, `20260726_credit_ledger_imutavel`,
`20260727_ia_cota_gratis`, `20260728_mp_preapproval_id`.

**O que quebra enquanto cada uma não roda** (as que importam):

| Migration | Enquanto não rodar |
|---|---|
| `20260718_rls_owner_backdoor` | Admin planta linha `papel='owner'` **irrevogável** pelo app (UPDATE/DELETE protegem `papel='owner'`) — backdoor persistente só limpável com `service_role` |
| `20260719_clientes_insert_equipe` | Cliente cadastrado pelo técnico nasce no tenant **dele** e **some para o dono, sem erro** (P1-3 original) |
| `20260726_credit_ledger_imutavel` | Ledger é append-only **só para o cliente**; bug no worker ou `UPDATE` manual reescreve histórico financeiro sem rastro |
| `20260727_ia_cota_gratis` | RPC ausente → worker recebe 404 → trata como `indisponivel` → **fail-open: IA ilimitada e grátis na conta do dono**. É o comportamento declarado da migration; é escolha, mas custa dinheiro por dia |
| `20260724_webhook_events` | Idempotência de webhook volta a ser o `Map` em memória do isolate — vale por isolate, não globalmente |
| `20260728_mp_preapproval_id` | Assinatura Mercado Pago sem id para cancelar → conta excluída **continua com o cartão sendo cobrado** |
| `20260725_equipe_grandfathering` | Coluna ausente → `equipe_grandfathered === true` é false → **orgs antigas perdem Equipe**, o oposto da decisão registrada |

**`20260727_numero_unico_por_tenant.sql.pendente` — NÃO aplicar.** A extensão `.pendente` é
deliberada (tira o arquivo do glob `*.sql`). O pré-requisito do item 3 do cabeçalho (ensinar o push
a renumerar no 23505, já que `mirrorPush` engole erro) **não foi cumprido** — `cloudSync.ts:699`
segue sem tratamento de 23505. Aplicá-la agora troca um bug visível por perda silenciosa de
documento. **E, conforme A4, o pré-requisito está incompleto: falta compartilhar `contadores`.**

---

## 8. O que exige decisão/ação do dono

1. **A1 (P0)** — fechar o INSERT direto em `organizacao_membros` **e** corrigir `equipe.ts:104` para
   preferir a própria org. É o único achado que move dado entre tenants. Enquanto estiver aberto,
   **qualquer ex-membro de equipe pode capturar a base futura do dono.**
2. **Autorizar o MCP do Supabase** (ou rodar as consultas à mão) para: advisors de segurança,
   policies de **`assinaturas`** (§4 — pode ser plano pago de graça) e RLS de
   **`backups_versionados`** (§A5 — se estiver desligada, é P0).
3. **A2** — tirar `equipe_grandfathered` do alcance do UPDATE do client. É receita saindo por uma
   linha de SQL que a própria migration mandou evitar.
4. **A3/A4** — decidir se `exclusoes` e `contadores` viram compartilhadas. São dado perdido e número
   duplicado, não vazamento — mas é o que o dono vê primeiro.
5. **Não aplicar a `.pendente`** até A4 + o tratamento de 23505 no push existirem.
6. **Versionar a base do schema** (§6) — sem isso nenhuma auditoria futura, humana ou automática,
   consegue afirmar nada sobre metade das tabelas.

---

### Onde NÃO há problema (dito de propósito)

`donos_visiveis()`, `eh_membro_ativo()`, `eh_gestao()`, `eh_admin_org()`, `perfil_visivel()` — todas
`SECURITY DEFINER` **com `search_path = ''`** e nomes qualificados, com `revoke ... from anon, public`
seguido de `grant ... to authenticated`. Está certo, e é o detalhe que a maioria dos projetos erra.
`(select auth.uid())` é usado uniformemente (InitPlan, 1× por query) — nenhuma policy reavalia por
linha. `user_id` é imutável por trigger em 10 tabelas, e `bloquear_troca_user_id` também congela
`criado_por`. Versão de contrato assinada e de plano PMOC aprovada são imutáveis por trigger.
`qr_token` é opaco (24 bytes aleatórios, base64url) e o token de convite tem 128 bits. `credit_ledger`
é append-only inclusive contra o `service_role`. Os webhooks validam JWT em `/auth/v1/user` e **nunca**
tiram o `user_id` do corpo do request (`conta.js:14-15` é explícito). Nenhuma policy `using (true)`
em lugar nenhum.

**O desenho está certo. O furo é uma porta que ficou sem tranca, não uma parede mal construída.**
