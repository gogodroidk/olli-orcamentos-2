# REVISÃO ADVERSARIAL — as 4 migrations novas (20260729 → 20260732)

Revisor read-only. Nada foi editado além deste arquivo.
Escopo: `supabase/migrations/20260729_membro_consentimento.sql`,
`20260730_paywall_empresa_selado.sql`, `20260731_exclusoes_contadores_equipe.sql`,
`20260732_unicidade_por_tenant.sql` — e o código que depende delas
(`src/services/cloudSync.ts`, `src/services/equipe.ts`, `worker/src/equipe.js`,
`webapp/src/olli/mutacoes.ts`).

Não tenho acesso ao banco de produção nesta sessão (Supabase MCP sem autorização),
então tudo abaixo é derivado do código atual do worktree. Onde o veredito depende
do estado real do banco, deixei a query de verificação.

---

## VEREDITO EM UMA LINHA

**O intervalo é seguro. Nenhuma das 4 quebra nada por estar ausente — o worker e
o app funcionam hoje exatamente como funcionariam depois.** O risco não está em
*adiar*; está em **aplicar a 20260731**, que abre um caminho novo de destruição de
dado que não existia antes. E há uma **dependência de ordem real** na 20260730 que
só explode em runtime, dias depois, se a 20260725 nunca tiver sido aplicada.

Sobre o paywall (pergunta 3): **aplicar a 20260730 NÃO corta o acesso de ninguém
automaticamente, e é totalmente reversível.** Detalhe abaixo — essa parte está
correta.

Nenhuma das 4 apaga uma linha de dado. Nenhuma é irreversível.

---

## ACHADO 1 — `20260731` deixa o técnico apagar `servicos`/`produtos`/`recibos` do dono, usando o aparelho do próprio dono como executor

**Gravidade: alta. É o único dos quatro arquivos que CRIA um risco ao ser aplicado.**

A justificativa da própria migration (linhas 38-41) é:

> "Isto NÃO concede poder novo a um membro mal-intencionado: ele já pode APAGAR as
> linhas de negócio do dono (…). Plantar um tombstone é estritamente menos do que
> já dá para fazer."

Isso é verdade para **5** tabelas. `DELETABLE_TABLES` tem **10**.

`src/services/cloudSync.ts:1149-1151`:

```
const DELETABLE_TABLES = new Set<string>([
  'clientes', 'servicos', 'produtos', 'orcamentos', 'recibos', 'modelos', 'depoimentos', 'agendamentos', 'ordens_servico', 'equipamentos',
]);
```

As 5 compartilhadas (`clientes`, `orcamentos`, `agendamentos`, `ordens_servico`,
`equipamentos`) de fato já são deletáveis pelo membro via RLS desde a 20260707.
Mas `servicos`, `produtos` e `recibos` têm o desenho OPOSTO e explícito em
`20260707_multitenant.sql:410-455` — leitura compartilhada, **escrita só do dono**:

```
create policy servicos_select      … using (user_id in (select public.donos_visiveis()));
create policy servicos_owner_write … for all … using ((select auth.uid()) = user_id);
```

(idem `produtos_*` e `recibos_*`. `modelos` e `depoimentos` também estão em
`DELETABLE_TABLES` e também não têm policy de escrita para a equipe.)

### O caminho concreto

Ator: um técnico ATIVO da organização (não precisa ser ex-membro; precisa estar
dentro). Ele já enxerga os `id` dos serviços/produtos/recibos do dono, porque o
`*_select` é `donos_visiveis()`.

1. Técnico, com o próprio JWT, no PostgREST:

   ```sql
   insert into public.exclusoes (user_id, tabela, item_id)
   values ('<uuid do dono>', 'recibos', '<id de um recibo do dono>');
   ```

   A policy nova `exclusoes_equipe_insert` (20260731:60-64) aprova:
   `with check (user_id in (select public.donos_visiveis()))` — e `donos_visiveis()`
   do técnico contém o dono. Não há CHECK nem FK na coluna `tabela` (não achei DDL
   de `exclusoes` no repositório; a policy é a única validação).

2. No próximo sync do **dono**, `applyCloudTombstones` (`cloudSync.ts:1185-1204`)
   lê `select tabela, item_id, excluido_em from exclusoes` **sem filtro**. O
   tombstone tem `user_id = dono`, então a policy self-only `exclusoes_owner` do
   próprio dono o entrega. O dono não distingue "tombstone que eu criei" de
   "tombstone que plantaram no meu tenant" — não existe coluna de autoria aqui.

3. `localDeleteById('recibos', id)` (`cloudSync.ts:1154-1163`) →
   `DELETE FROM recibos WHERE id = ?` no SQLite do dono. **Hard delete, não é a
   Lixeira** (a Lixeira da 20260713 é `excluido_em`; tombstone é exclusão
   definitiva).

4. `DELETABLE_TABLES.has('recibos')` → `removeRow('recibos', id)`
   (`cloudSync.ts:771-779`) → `supabase.from('recibos').delete().eq('id', id)`
   executado **com a sessão do DONO**, que obviamente passa em
   `recibos_owner_write`.

Resultado: o técnico apaga, de forma permanente e nos dois lados (nuvem + aparelho
do dono), linhas de tabelas que a RLS reserva ao dono de propósito. Não é "menos
do que já dá para fazer" — é uma classe nova (deputado confuso: quem executa o
DELETE é o dono, autorizado, a mando de uma linha que o técnico plantou).

`recibos` é o pior caso: é o comprovante de pagamento que o cliente final tem na
mão.

### Nota sobre o teste

`scripts/teste-isolamento-tenant.ts` já checa "exclusoes NÃO ganhou DELETE" e
"NÃO ganhou UPDATE" para a equipe — mas o vetor não é DELETE/UPDATE, é o INSERT
com `tabela` livre. O teste passa (44 ok) e o buraco existe.

### O que fecharia (para a leva de conserto, não para mim)

Qualquer uma resolve, e não são exclusivas:
- restringir a policy de INSERT às tabelas realmente compartilhadas
  (`with check (… and tabela in ('clientes','orcamentos','agendamentos','ordens_servico','equipamentos'))`); ou
- `applyCloudTombstones` passar a ignorar tombstone cuja `tabela` não seja
  compartilhada quando o `user_id` do tombstone não for o meu; ou
- adiar a metade INSERT da 20260731 e aplicar só os dois `*_select` — que é a
  metade que resolve A3/A4 hoje e **não concede escrita nenhuma** (ver "ordem
  segura" abaixo).

---

## ACHADO 2 — `20260730` + o app: quem tem Empresa vencido leva "Tente de novo" para sempre

**Gravidade: média. Já existe hoje; a 20260730 só torna o caminho obrigatório.**

`worker/src/equipe.js:345` devolve `402 { erro: 'plano_requer_empresa' }` quando a
org não é grandfathered e não tem Empresa ativo.

`src/services/equipe.ts:299-316` traduz o erro do worker — e **não tem o caso**:

```
function traduzirErroConvite(erro: unknown, status: number): string {
  switch (erro) {
    case 'sem_permissao':      …
    case 'sem_organizacao':    …
    case 'papel_invalido':     …
    case 'muitas_requisicoes': …
    case 'nao_autorizado':     …
    default:
      return status >= 500
        ? 'O serviço de convites está indisponível agora. Tente de novo em instantes.'
        : 'Não consegui criar o convite agora. Tente de novo.';
  }
}
```

`plano_requer_empresa` cai no `default` com status 402 (< 500) → o dono lê
**"Não consegui criar o convite agora. Tente de novo."** — e tentar de novo nunca
vai funcionar.

Caminho concreto de quem chega lá: o `GateEquipe` (`src/components/GateEquipe.tsx`)
usa `usePlano()`, que por desenho **cacheia o último plano bom** ("quem paga não
perde acesso numa oscilação"). Dono de Empresa cujo cartão falhou → `temAcesso('equipe')`
ainda true pelo cache → `acessoEquipe` devolve `pode: true` → sem muro → ele abre a
tela, clica em convidar → o worker lê `assinaturas.status` real, vê `unpaid`,
devolve 402 → mensagem genérica. Ele não é informado de que precisa renovar. É o
padrão "erro vira vazio" da casa na variante "negativa vira ruído".

Custo do conserto: uma linha (`case 'plano_requer_empresa': return 'Convidar técnicos faz parte do plano Empresa. Renove ou assine para continuar.'`).
Também falta `'indisponivel'` (503) e `'falha_convite'` (502) — esses dois caem no
ramo `status >= 500`, que já diz a coisa certa. Só o 402 está errado.

---

## ACHADO 3 — `20260730` tem uma dependência de ordem que só falha em runtime, não na aplicação

**Gravidade: média-alta se a 20260725 não estiver aplicada; nula se estiver.**

`congelar_equipe_grandfathered` (20260730:64-76) referencia
`new.equipe_grandfathered` / `old.equipe_grandfathered`. Em plpgsql, campo de
`NEW`/`OLD` é resolvido **em tempo de execução**, não no `CREATE FUNCTION`.

Consequência: se `20260725_equipe_grandfathering.sql` (que cria a coluna) nunca
foi aplicada, a 20260730 **aplica sem erro nenhum** — parece que deu certo — e a
partir daí **todo UPDATE em `public.organizacoes` levanta**
`record "new" has no field "equipe_grandfathered"`.

Quem faz UPDATE em `organizacoes` hoje: **ninguém pelo client** (confirmei —
`src/services/equipe.ts:117`, `webapp/src/olli/mutacoes.ts:73` e
`webapp/src/pages/olli/equipe/useEquipe.ts:107` são todos SELECT; o worker só faz
GET, `worker/src/equipe.js:147` e `:176`). O único caminho é dentro de
`criar_organizacao()` — `20260707_multitenant.sql:559`:

```sql
update public.organizacoes set nome = btrim(p_nome) where id = v_org;
```

Isso roda quando o usuário JÁ tem org e chama `criar_organizacao` com um nome
(`src/services/equipe.ts:183`). O RPC passa a falhar com um erro de plpgsql cru,
traduzido pelo app como falha genérica. Fail-loud, mas incompreensível.

**A 20260732 e a 20260729 não têm essa armadilha** (referenciam colunas que existem
desde a 20260707). A 20260731 falha **na aplicação** se faltar `donos_visiveis()`
ou as tabelas — fail-fast, que é o comportamento certo.

**Verificação antes de rodar a 20260730:**

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='organizacoes'
   and column_name='equipe_grandfathered';
```

Uma linha = pode rodar. Zero linhas = **rode a 20260725 primeiro**.

---

## RESPOSTAS DIRETAS ÀS PERGUNTAS

### "O código aguenta o intervalo entre o deploy e a aplicação?" — SIM, nas quatro

| Migration | Se NÃO existir no banco | Erro 500? | Fail-open / fail-closed |
|---|---|---|---|
| **20260729** membro_consentimento | Nada muda no produto. Nenhum client faz INSERT em `organizacao_membros` (só SELECT e `update({ativo})` — `src/services/equipe.ts:242`, `webapp/.../useEquipe.ts:127`). Entrar numa org já é 100% `aceitar_convite` (SECURITY DEFINER). | Não | Fica **fail-open** no sentido de segurança: o buraco A1 continua aberto até rodar. Nenhum usuário legítimo é afetado. |
| **20260730** paywall_selado | Nada muda no produto. Nenhum client insere em `convites` (o app usa `POST /equipe/convite` — `src/services/equipe.ts:275-296`; o painel nem oferece o fluxo). Nenhum client faz UPDATE em `organizacoes`. | Não | **Fail-open**: os dois bypasses continuam abertos. Só explorável por quem montar SQL/REST à mão — nenhum usuário chega lá pela UI. |
| **20260731** exclusoes/contadores | Nada muda. O app **ainda não** grava tombstone/contador no tenant do dono: `pushTombstone` (`cloudSync.ts:791-804`) e o upsert de `syncContadores` (`cloudSync.ts:1315`) seguem sem `user_id`, usando o default `auth.uid()`. A ordem "banco primeiro, app depois" declarada no cabeçalho está **respeitada** — o app não foi mudado. | Não | Neutro. A3 (exclusão que ressuscita) e A4 (número duplicado) continuam acontecendo, como hoje. |
| **20260732** unicidade_por_tenant | Nada muda. Nenhum `ON CONFLICT` do app, do painel ou de função SQL aponta para os 4 índices (conferi: os alvos são `id` ou `user_id,chave`; `clienteLink.ts:489` usa `onConflict: 'id'`). Os 4 são `create unique index`, não `constraint` — o `drop index` não vai falhar. | Não | Neutro. O DoS cross-tenant continua possível; sem vítima até alguém ser hostil. |

**O worker é indiferente às quatro.** Ele usa `service_role`, que ignora RLS, e não
depende de nenhum dos índices trocados. As policies dropadas e as criadas não o
tocam. Não há repetição do episódio "migration fora de ordem derruba o worker com
500" — nenhuma das quatro mexe em algo que o worker leia.

**A única dependência de banco que o worker tem, e que é ANTERIOR a esta leva**,
é a coluna `equipe_grandfathered` em `organizacoes` (`worker/src/equipe.js:176-177`,
`select=owner_user_id,equipe_grandfathered`). Sem a 20260725, o PostgREST devolve
400, `getOrg` devolve `{error:true}`, `orgTemEmpresaAtivo` devolve `'erro'` e
`handleConvite` responde **503 fail-closed**. Está certo (ninguém ganha Equipe de
graça), mas significa que **convidar fica 100% quebrado** se a 20260725 estiver
faltando. Vale confirmar isso antes de tudo (query no Achado 3).

### 1) ORDEM — existe dependência entre elas?

**Entre as quatro, não.** Cada uma declara no cabeçalho ser independente das
demais, e conferi: não compartilham objeto nenhum. Podem ser aplicadas em qualquer
ordem entre si.

As dependências são todas para **trás**:

- 20260729 → precisa de 20260707 (tabela + a policy que ela dropa) e faz sentido
  depois de 20260718 (que é quem RECRIA `membros_admin_insert`).
- 20260730 → precisa de 20260707 e **de 20260725** (Achado 3).
- 20260731 → precisa de 20260707 (`donos_visiveis()`), 20260615160744 e 20260624
  (as policies self-only que ela complementa). Falha alto se faltar.
- 20260732 → precisa de 20260708_versoes, 20260709_pmoc_fundacao, 20260715_pmoc_fase2.

**A armadilha de ordem real:** `20260718_rls_owner_backdoor.sql:33-37` **recria**
`membros_admin_insert`. Se o dono aplicar a 20260729 e depois, por qualquer motivo,
re-rodar a 20260718 (ou aplicar migrations antigas pendentes fora da ordem de
timestamp), **o buraco A1 reabre em silêncio**. Aplicar sempre em ordem de nome de
arquivo (`supabase db push` faz isso). O `scripts/teste-isolamento-tenant.ts` já
protege o repositório contra isso (ele reproduz a aplicação sequencial em vez de
olhar o último arquivo) — mas não protege contra alguém rodar um `.sql` à mão no
SQL editor.

### 2) IRREVERSIBILIDADE

**Nenhuma das quatro apaga dado. Nenhuma é irreversível.** Todas são DDL de
policy/trigger/índice.

| Migration | Como desfazer |
|---|---|
| 20260729 | `drop trigger organizacao_membros_chave_imutavel on public.organizacao_membros;` + recriar `membros_admin_insert` (DDL literal em `20260718:34-37`). |
| 20260730 | `drop trigger organizacoes_grandfathered_congelado on public.organizacoes;` + recriar `convites_gestao_insert` (DDL em `20260707_multitenant.sql`). |
| 20260731 | `drop policy` nas 5 policies novas. As self-only originais nunca são tocadas. |
| 20260732 | Recriar os 4 índices globais e dropar os por-tenant (DDL em 20260708_versoes:52, 20260709:202 e :248, 20260715:65). |

Uma ressalva operacional na 20260732: `create unique index` **sem** `CONCURRENTLY`
toma lock de escrita na tabela. O próprio arquivo avisa (linhas 28-30) e as tabelas
são pequenas hoje. Ok.

O que **é** irreversível no diretório é a `.pendente` — mas ela não está nesta leva
e o cabeçalho dela (`20260727_numero_unico_por_tenant.sql.pendente:39-71`) manda
não aplicar. **Confirmo: continua não-aplicável.** O pré-requisito declarado
(tratar 23505 no push) segue não cumprido — `cloudSync.ts:699` faz o upsert sem
olhar `error.code`, e o `catch` de `pushRowUnchecked` engole tudo. Aplicá-la hoje
troca "número duplicado, visível" por "documento que nunca sobe, silencioso".

### 3) O PAYWALL DO EMPRESA — aplicar a 20260730 corta alguém?

**Não. Confirmado, com três razões independentes:**

1. **O trigger não muda valor nenhum.** `congelar_equipe_grandfathered` só levanta
   exceção quando `new.equipe_grandfathered is distinct from old.equipe_grandfathered`
   **e** `current_user in ('authenticated','anon')`. Ele não faz UPDATE, não faz
   backfill, não zera nada. Quem está `true` continua `true`. A migration não
   contém um único `update`/`delete` de dado.

2. **O DROP da policy não bloqueia caminho legítimo.** `convites_gestao_insert`
   permitia ao client inserir em `convites` direto. **Nenhum código do produto usa
   esse caminho**: o app chama `POST /equipe/convite` (`src/services/equipe.ts:284`)
   e o painel exibe "O convite é enviado pelo aplicativo OLLI no celular". Quem
   convida hoje já passa pelo worker — e portanto já passa pelo gate. Dropar a
   policy não muda a experiência de ninguém.

3. **O gate do worker não fica mais duro.** `orgTemEmpresaAtivo`
   (`worker/src/equipe.js:196-232`) já é o que roda hoje, com grandfathering ANTES
   da consulta de plano e `'erro'` → 503 fail-closed. A 20260730 não o altera.

**A população que a 20260730 realmente atinge:** ninguém novo. A org que hoje leva
402 (criada depois de a 20260725 ter sido aplicada, sem Empresa) já leva 402 hoje.
A 20260730 só fecha a porta dos fundos que **nenhum usuário usa** e que exigiria
montar um INSERT à mão.

**Portanto: a 20260730 NÃO é a decisão de negócio.** Ela sela um bypass; ela não
liga o paywall. O paywall já está ligado (no worker, desde a leva do gate) e já é
grandfathered. A decisão que o dono ainda deve (cobrar / fundir com o Pro / matar)
continua sendo **`update public.organizacoes set equipe_grandfathered = false;`** —
essa sim corta gente, e continua sendo uma linha que só o dono roda, quando quiser.
A 20260730 inclusive **protege** essa decisão: depois dela, o cliente não pode se
re-conceder o flag pelo PostgREST.

Único ponto de atrito ao aplicar: o Achado 2 (a mensagem de 402 é genérica). Vale
consertar a linha do `traduzirErroConvite` antes ou junto — não é bloqueante.

### 4) RLS — as policies novas isolam mesmo o tenant?

**20260731 — isolamento de LEITURA: correto.** As 4 policies de SELECT/INSERT/UPDATE
usam `user_id in (select public.donos_visiveis())`, a mesma helper de
`clientes`/`orcamentos`/`agendamentos`. `donos_visiveis()`
(`20260707_multitenant.sql:193-207`) é `auth.uid()` ∪ `owner_user_id` das orgs onde
sou membro **ativo** — desligar o membro (`ativo=false`) o remove no mesmo instante.
Não achei caminho de leitura cruzada: um técnico da org A não consegue fazer
`donos_visiveis()` conter o dono de B sem uma linha de membresia ativa em B, e a
20260729 é exatamente o que impede plantar essa linha.

Assimetria a registrar (não é bug, é consequência do desenho): o **dono não vê**
nada novo. Para ele `donos_visiveis()` = `{ele}`. Então o "sentido inverso" que a
20260731 diz habilitar (técnico apaga em definitivo, dono fica sabendo) só passa a
funcionar **depois** da mudança de app que grava o tombstone com `user_id = dono`.
Hoje, aplicada sozinha, ela resolve só metade de A3 — que é o que o cabeçalho
promete. Consistente.

**20260731 — isolamento de ESCRITA: é onde está o Achado 1.** O `with check` limita
o *tenant*, mas não limita a *tabela*, e `applyCloudTombstones` no aparelho do dono
executa o que estiver lá. Ver Achado 1.

Uma observação menor no mesmo arquivo, que não vale achado separado:
`contadores_equipe_update` deixa o membro escrever qualquer `valor` no contador do
dono. Como o merge é `Math.max` e monotônico, o dano máximo é queimar a numeração
para frente (o dono passaria a emitir 999999). É estritamente menor do que apagar
os orçamentos dele, o que ele já pode. Registrado, não priorizado.

**20260732 — não é RLS, mas conferi o efeito colateral de tenant:** trocar
`(orcamento_id, numero_versao)` por `(user_id, orcamento_id, numero_versao)` poderia
"rachar" a unicidade entre dono e técnico. Não racha, porque **todas as escritas
dessas 4 tabelas caem no tenant do dono**: `pmoc_plano_versoes` e
`pmoc_ordens_geradas` estão em `TABELAS_TENANT_EQUIPE` (`cloudSync.ts:582-591`) e
`orcamento_versoes` recebe `user_id = ownerUserId` explicitamente em
`espelharVersaoNuvem` (`src/services/clienteLink.ts:474-486`).
`service_contract_versions` não tem nenhum código cliente ainda. A idempotência do
PMOC é preservada. Ok.

---

## ORDEM SEGURA DE APLICAÇÃO

**Passo 0 — antes de qualquer coisa, confirmar o estado real do banco.** Nada
abaixo vale sem isto:

```sql
-- (a) a 20260725 rodou? (bloqueante para a 20260730 E para o worker de convites)
select 1 from information_schema.columns
 where table_schema='public' and table_name='organizacoes'
   and column_name='equipe_grandfathered';

-- (b) que policies existem hoje nas tabelas envolvidas?
select tablename, policyname, cmd from pg_policies
 where schemaname='public'
   and tablename in ('organizacao_membros','convites','organizacoes','exclusoes','contadores')
 order by tablename, policyname;

-- (c) os 4 índices globais ainda existem?
select indexname from pg_indexes where schemaname='public'
   and indexname in ('orcamento_versoes_orc_num_uidx','service_contract_versions_num_uidx',
                     'pmoc_plan_versions_num_uidx','pmoc_ordens_geradas_unica');
```

Se (a) voltar vazio: rode `20260725_equipe_grandfathering.sql` **primeiro**. (Ele
faz um backfill que marca como grandfathered TUDO que existir naquele instante —
o que é a decisão já registrada, mas note que a fronteira é o momento da aplicação.)

**Depois, nesta ordem:**

1. **`20260729_membro_consentimento.sql`** — aplicar. É o P0 de verdade (fecha o
   sequestro de tenant), não quebra nada, é reversível em duas linhas.
2. **`20260732_unicidade_por_tenant.sql`** — aplicar. Inerte para o produto,
   fecha o DoS cross-tenant. Rodar em horário de baixo movimento (lock de escrita,
   curto).
3. **`20260730_paywall_empresa_selado.sql`** — aplicar **depois de confirmar o
   passo 0(a)**. Não corta ninguém. Ideal: junto com o conserto de uma linha do
   Achado 2, para que quem tomar 402 entenda o motivo.
4. **`20260731_exclusoes_contadores_equipe.sql`** — **NÃO aplicar inteira ainda.**
   Aplicar apenas as duas policies de SELECT (linhas 48-52 e 71-75), que resolvem
   a metade de A3/A4 que já vale hoje e **não concedem escrita nenhuma**. As três
   policies de INSERT/UPDATE (linhas 60-64, 81-85, 87-92) só depois do Achado 1
   fechado — e elas só têm utilidade quando a mudança de `cloudSync.ts` (gravar no
   tenant do dono) existir, que é justamente o que o próprio arquivo diz que ainda
   não foi feito (linhas 95-99).
5. **`20260727_numero_unico_por_tenant.sql.pendente`** — **não aplicar.** Confirmado
   não-aplicável: o pré-requisito (renumerar no 23505) não existe em `cloudSync.ts`.

Se o dono preferir a via simples, aplicar a 20260731 inteira também é aceitável —
o atacante precisa ser um técnico ativo e mal-intencionado dentro da org. Mas então
o Achado 1 vira dívida com prazo, não observação.

---

## O QUE EXIGE DECISÃO DO DONO ANTES DE RODAR

1. **Nada nas quatro exige decisão de negócio.** Repito porque a pergunta era essa:
   a 20260730 não liga nem desliga o paywall, e não corta ninguém. A decisão
   "cobrar / fundir com o Pro / matar o Empresa" segue intocada e continua sendo
   um `update … set equipe_grandfathered = false` que só ele roda.
2. **Decisão de risco, não de negócio:** aplicar a 20260731 inteira agora (aceitando
   o Achado 1 como dívida) ou só a metade SELECT. Recomendo a metade.
3. **Confirmar que a 20260725 está aplicada** — se não estiver, convidar técnico já
   está quebrado hoje (503 do worker), independentemente desta leva.

---

## O QUE EU **NÃO** VERIFIQUEI

- O estado real do banco de produção (sem acesso ao Supabase nesta sessão). Todas as
  queries de verificação estão acima.
- O DDL de `public.exclusoes` e `public.contadores` — não estão em
  `supabase/migrations/`; devem ter sido criadas pelo dashboard/MCP antes do
  versionamento. Se `exclusoes.tabela` tiver um CHECK que eu não vejo, o Achado 1
  fica limitado às tabelas que o CHECK permite (mas as 5 compartilhadas + as 5
  reservadas provavelmente estão todas lá, já que o app grava todas).
- Comportamento em runtime: nenhuma das análises acima foi executada contra um banco.
