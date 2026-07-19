# BLOQUEIOS — só o dono resolve (o enxame NÃO tenta, só reporta)

> Regra do loop: item humano → registra aqui e segue. Quando o dono voltar, esta é a lista dele.
> Fonte: Onda 1 (2026-07-17). Marcar `[x]` quando o dono resolver.

## ✅ DESTRAVADO EM 19/07 — não peça mais isso ao dono

O dono autorizou execução total e estes itens **foram feitos**, com verificação
depois de cada passo:

- [x] **As migrations foram APLICADAS em produção** (MCP do Supabase, projeto
      `yiaeplqinnnnniyvwtls`): `ia_cota_gratis` · `mp_preapproval_id` ·
      `membro_consentimento` · `unicidade_por_tenant` · `paywall_empresa_selado` ·
      `exclusoes_contadores_equipe` (com a whitelist que fecha o confused deputy).
      Provado: cota devolve `consumida` ×3, `esgotada` na 4ª, `ja_contada` no retry.
- [x] **O worker foi PUBLICADO** (`olli-diagnostico`). `diagnostico.` e `link.`
      respondem 200 e os **9 secrets seguem intactos** (deploy não apaga secret —
      confirmado pela terceira vez).
- [x] Painel e landing no ar com o código atual. APK recompilado (126,9 MB).

**Consequência prática:** a cobrança de IA deixou de ser ilimitada, e o vetor de
exfiltração por `organizacao_membros` está fechado. O que sobra abaixo é só o que
exige senha, conta ou assinatura de contrato — coisas que um agente não faz.

> ⚠️ A seção seguinte (custo do deploy) já foi PAGA: o worker subiu em 19/07.
> Fica registrada como histórico do que aconteceu, não como aviso pendente.

## ⚠️ LEIA ANTES DE `wrangler deploy` (custo medido, 18/07)

O deploy do worker tem **um custo de uma vez, em crédito de cliente**, e é melhor
você saber antes do que descobrir por reclamação:

- A chave de idempotência da IA de voz **mudou de formato** no caminho degradado
  (o caminho que 100% das cobranças usam hoje, porque a migration de cota ainda
  não rodou). A chave antiga não tinha prazo — valia para sempre.
- Quem estava "pegando carona" nessa chave eterna vai ser cobrado **1 crédito
  extra, uma única vez**, na primeira ação depois que o worker subir.
- **Vale a troca:** sem ela, cobrança feita com a RPC fora ficava invisível
  quando a RPC voltasse — 60/60 cobranças duplas nessa direção, e o pior momento
  seria exatamente quando você aplicasse a migration. Trocamos um custo pontual
  e conhecido por um risco recorrente e invisível.
- **Ordem recomendada:** subir o worker e aplicar as migrations na mesma janela,
  em horário de pouco movimento. Se alguém reclamar de 1 crédito, é isto.

**Enquanto a migration `20260727_ia_cota_gratis.sql` não rodar, a cobrança de IA
é ILIMITADA** (fail-open declarado, de propósito, para o deploy ser seguro
sozinho). Toda a máquina de idempotência só começa a valer com ela aplicada.

## 🗄️ ORDEM SEGURA DAS MIGRATIONS 20260729 → 20260732 (apurado 19/07)

> Fonte: `docs/ENXAME/REVISAO_MIGRATIONS.md` (revisão adversarial) + conferência
> tabela por tabela no repositório nesta leva. **Nenhuma das quatro apaga uma
> linha de dado e nenhuma é irreversível** — todas são DDL de policy, trigger ou
> índice. O risco não está em adiar; está em aplicar fora de ordem.

### Passo 0 — CONFERIR O BANCO ANTES DE QUALQUER COISA

```sql
-- (a) a 20260725 rodou? Bloqueante para a 20260730 E para convidar técnico.
select 1 from information_schema.columns
 where table_schema='public' and table_name='organizacoes'
   and column_name='equipe_grandfathered';
```

**Zero linhas = pare e rode `20260725_equipe_grandfathering.sql` primeiro.** Sem
essa coluna, `worker/src/equipe.js:176` pede `select=owner_user_id,equipe_grandfathered`,
o PostgREST devolve 400, `orgTemEmpresaAtivo` devolve `'erro'` e o convite responde
**503 fail-closed** — ou seja, **convidar técnico já está quebrado hoje**,
independentemente desta leva. (O fail-closed está certo: ninguém ganha Equipe de
graça por erro de leitura.)

Vale conferir junto quais policies e índices já existem:

```sql
select tablename, policyname, cmd from pg_policies
 where schemaname='public'
   and tablename in ('organizacao_membros','convites','organizacoes','exclusoes','contadores')
 order by tablename, policyname;

select indexname from pg_indexes where schemaname='public'
   and indexname in ('orcamento_versoes_orc_num_uidx','service_contract_versions_num_uidx',
                     'pmoc_plan_versions_num_uidx','pmoc_ordens_geradas_unica');
```

### A ordem

1. **`20260729_membro_consentimento.sql`** — aplicar. É o P0 de verdade (fecha o
   sequestro de tenant). Não quebra nada: nenhum client faz INSERT em
   `organizacao_membros` (entrar numa org é 100% `aceitar_convite`, SECURITY DEFINER).
2. **`20260732_unicidade_por_tenant.sql`** — aplicar. Inerte para o produto
   (nenhum `ON CONFLICT` do app aponta para os 4 índices trocados). `create unique
   index` **sem** `CONCURRENTLY` toma lock de escrita — rodar em horário de pouco
   movimento. As tabelas são pequenas hoje.
3. **`20260730_paywall_empresa_selado.sql`** — aplicar **só depois do passo 0(a)**.
   A dependência não falha na aplicação: `congelar_equipe_grandfathered` referencia
   `new.equipe_grandfathered`, e plpgsql resolve campo de `NEW` em tempo de
   EXECUÇÃO. Sem a 20260725 a migration **aplica sem erro** e a partir daí **todo
   UPDATE em `public.organizacoes` levanta** `record "new" has no field ...` —
   quebrando `criar_organizacao()` com um erro cru dias depois.
   **Esta migration não corta o acesso de ninguém** (ver abaixo).
4. **`20260731_exclusoes_contadores_equipe.sql`** — aplicar **inteira**, agora que
   o furo foi fechado nesta leva (ver a seguir).
5. **`20260727_numero_unico_por_tenant.sql.pendente`** — **NÃO aplicar.**
   Confirmado não-aplicável: o pré-requisito declarado no cabeçalho dela (o push
   renumerar no 23505) não existe — `cloudSync.ts:699` faz o upsert sem olhar
   `error.code` e o `catch` de `pushRowUnchecked` engole tudo. Aplicar hoje troca
   "número duplicado, visível" por "documento que nunca sobe, silencioso".

**Entre as quatro não há dependência nenhuma** — não compartilham objeto. As
dependências são todas para trás (20260707, 20260615160744, 20260624, 20260725,
20260708, 20260709, 20260715).

### Armadilha de ordem que não é de arquivo

Aplicar **sempre em ordem de nome de arquivo** (`supabase db push` faz isso). Se
alguém re-rodar uma migration antiga à mão no SQL editor **depois** desta leva, o
buraco correspondente reabre em silêncio:

- re-rodar `20260718_rls_owner_backdoor.sql` **recria** `membros_admin_insert` e
  desfaz a 20260729;
- re-rodar `20260707_multitenant.sql` **recria** `clientes_owner_write` (FOR ALL,
  self) e apaga `clientes_membro_insert` da 20260719 — a partir daí o cliente que
  o técnico cadastra volta a nascer fora do tenant do dono e a sumir da lista.

### O que a 20260731 tinha e não tem mais

A policy `exclusoes_equipe_insert` limitava o **tenant** e não a **tabela**. Um
técnico ativo podia inserir em `exclusoes` uma linha com `user_id = <dono>` e
`tabela = 'recibos'`; no sync seguinte a **sessão do próprio dono** executava o
hard delete e passava na RLS, porque quem apagava era ele. Deputado confuso.

O cabeçalho da migration justificava a policy aberta dizendo que o membro "já pode
apagar as linhas de negócio do dono". **Conferido nesta leva: ele pode apagar 4
das 10 tabelas de `DELETABLE_TABLES`**, não as 10 — e nem as 5 que a revisão
adversarial supôs. `clientes` **não** está entre elas desde a 20260719
(`clientes_owner_delete`), então a exposição era de **seis** tabelas: `clientes`,
`servicos`, `produtos`, `recibos`, `modelos`, `depoimentos`.

O `with check` agora exige as duas condições, e a lista de tabelas é literal e
fechada: `orcamentos`, `agendamentos`, `ordens_servico`, `equipamentos` — exatamente
aquelas em que a equipe já tem policy de DELETE. Nada legítimo é bloqueado: o
tombstone que o membro grava para si mesmo continua passando por `exclusoes_owner`
(permissiva, self-only, FOR ALL), que é por onde 100% dos tombstones do app passam
hoje.

**Fica aberto, de propósito:** `contadores_equipe_update` deixa o membro escrever
qualquer `valor` no contador do dono. Dano máximo = queimar a numeração para a
frente (fusão é `Math.max`, monotônica). Não dá para restringir sem quebrar o caso
legítimo. Registrado, não priorizado.

**Falta no teste:** `scripts/teste-isolamento-tenant.ts` checa que a equipe não
ganhou DELETE nem UPDATE em `exclusoes` — o vetor era INSERT com `tabela` livre.
Os 44 testes passavam com o buraco aberto.

### O que exige decisão do dono antes de rodar

1. **Nada nas quatro exige decisão de negócio.** Em particular, **a 20260730 não
   liga nem desliga o paywall e não corta ninguém**: o trigger só levanta exceção,
   não faz UPDATE nem backfill; o DROP de `convites_gestao_insert` fecha uma porta
   que **nenhum código do produto usa** (o app chama `POST /equipe/convite` e o
   painel manda convidar pelo celular); e o gate do worker não fica mais duro.
   Ela **protege** a decisão futura, impedindo o cliente de se re-conceder o flag
   pelo PostgREST.
2. **A decisão de negócio continua sendo outra linha, e só o dono roda:**
   `update public.organizacoes set equipe_grandfathered = false;` — **essa** corta
   gente.
3. **Atrito conhecido ao aplicar a 20260730:** quem tomar 402 (`plano_requer_empresa`)
   lê **"Não consegui criar o convite agora. Tente de novo."** — e tentar de novo
   nunca vai funcionar. `traduzirErroConvite` (`src/services/equipe.ts:299-316`)
   não tem esse caso e cai no `default`. Conserto de uma linha; vale junto, não é
   bloqueante.

## Destrava RECEITA (sem isso, ninguém paga)
- [ ] **MP_WEBHOOK_SECRET** ausente no cofre do worker (o `MP_ACCESS_TOKEN` já está lá). Único item que liga Pix/cartão. Registrar o webhook no painel Mercado Pago.
- [ ] **3 migrations no Supabase de produção** (ordem importa, fora de ordem = 500/503): `20260724_webhook_events.sql` → `20260725_equipe_grandfathering.sql` → `20260726_credit_ledger_imutavel.sql`. O código já assume que existem.
- [ ] **Stripe:** habilitar "Installments" (parcelamento BR) + criar 3 Prices (`olli_pro_12x`, `olli_empresa_mensal`, `olli_empresa_anual`) com lookup_keys.
- [x] **Cobrança de crédito da VOZ** — ✅ **APROVADO pelo dono (17/07): "ligar cobrança de crédito e voz, deixar tudo funcionando".** Decisão minha (dúvida→decido): manter os preços de pacote JÁ VIVOS no worker (R$0,25-0,498/cr — não mexer em preço live); consumo = **1 crédito por orçamento gerado por voz** (não por turno), 1ª conversa grátis, migrar os 3 usos grátis pro ledger (server-side, não burlável). **EM EXECUÇÃO** (Voz Fase 2).

## Google Play (trilha da loja — detalhe em LOJA.md)
- [ ] Abrir + pagar conta Play Console (cartão/CNPJ).
- [ ] Decidir conta pessoal vs. organização (pessoal = teste fechado 12 testadores × 14 dias antes de produção; organização isenta).
- [ ] Login EAS/Expo (`eas whoami` = Not logged in agora).
- [ ] Aprovar screenshots + feature graphic. **Existem e estão conformes** (medido byte a byte em 19/07, não lido de laudo): 8 PNGs 1080×1920 truecolor sem alpha em `assets/loja/screenshots/` (3,87 MB no total) + `feature-graphic.png` 1024×500 + `icone-512.png`. Regerar é `node scripts/telas/loja.mjs` — sem emulador, sem adb, sem APK. Falta só o **olhar do dono**, não o arquivo.
- [ ] Responder questionário de classificação de conteúdo (IARC) e aceitar termos.
- [ ] Clique final de publicar/enviar para revisão.
- [ ] Confirmar senha da keystore de upload no cofre (chave já existe: `CONFIG CLAUDE/olli-keystore/olli-upload.jks`).

## Infra / chaves
- [ ] **SENTRY_AUTH_TOKEN** — sem ele o build de RELEASE do APK **falha** na task
      `createBundleReleaseJsAndAssets_SentryUpload` (`@sentry/react-native/sentry.gradle:132`).
      Contorno usado no build de 18/07: `SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew assembleRelease`
      — funciona, mas aí o Sentry mostra stack trace **minificado** (linha `index.hbc:1:9553539`),
      que é quase inútil pra depurar crash de usuário. Com o token, o source map sobe e o stack
      vira legível. Vale os 2 minutos de configurar.
      ⚠️ Quando esse build falha, o gradle **deixa o APK antigo na pasta** — conferir a data antes
      de publicar, senão sobe binário velho na loja.
- [ ] **Chave PostHog** (projeto não criado) — feature codada e desligada até a chave existir.
- [ ] **Chave Resend + verificar domínio** `mail.olliorcamentos.online` — sem isso o e-mail de convite falha calado (best-effort).
- [ ] **TOTP/MFA na conta ADMIN_EMAIL** (Supabase Auth) — enforcement aal2 é poucas linhas quando o fator existir.
- [x] ~~Rotacionar senha da conta demo GR Tech~~ — **DECIDIDO NÃO FAZER** (dono, 17/07): ele exclui a conta depois. Não perguntar mais. Ver memória `olli-senha-demo-nao-rotacionar`.
- [ ] **OAuth client Android** (precisa do SHA-1 do keystore de release) — login Google nativo + Google Agenda no APK.
- [ ] **Consent screen OAuth** (escopo calendar.events) — verificar submissão pra revisão Google (lead time 1-4 semanas).
- [ ] **pg_dump --schema-only das 13 tabelas legadas** → baseline versionado (exige sessão com acesso live ao Supabase).

## Decisão de produto (do dono)
- [x] **IDENTIDADE VISUAL UNIFICADA** — ✅ **APROVADO pelo dono (17/07): "quero completo isso daí, execute tudo da melhor forma".** Direção: convergir as 3 pontas pra linguagem do APP (família de ícone única, painel adota Plus Jakarta+Spectral, escala de raio única, dark navy no painel, emoji→SVG na landing, status colors unificados). Detalhe em `CATALOGO_VISUAL.md`. **EM EXECUÇÃO** (workstream próprio).
- [ ] **O2-19 numeração atômica** — 4 opções em FOLLOWUPS #31 (a "opção 4" sozinha tem furo). Depois de decidir, o SEED da migration por tenant precisa conferir o banco real.
- [ ] **Emulador olli_phone** — prova ao vivo de O0-1/O0-2/O0-3 (exige digitar senha; o piloto não faz).
- [ ] **APK final** — regra do dono: só builda quando o ciclo comercial estiver perfeito e testado; aprovação do momento é dele.

## Conectores MCP que precisam de OAuth (sessão não-interativa não autentica)
- [ ] **mercadopago** e **cloudflare** MCP pedem login `/mcp` interativo. Sem eles, opero MP/CF por CLI/REST quando possível, ou marco bloqueado.
