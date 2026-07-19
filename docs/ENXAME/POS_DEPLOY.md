# PÓS-DEPLOY — teste de fumaça do conjunto (19/07/2026)

> Read-only. Nenhuma linha de código foi tocada, nenhuma migration aplicada,
> nenhum `wrangler deploy`. Todo número aqui saiu de um comando que rodou —
> onde eu não consegui medir, está escrito que não consegui.
>
> Escopo: worker (`olli-diagnostico`), landing (raiz), painel (`app.`), e a
> coerência entre `worker/src/creditos.js` e o banco de produção.

---

## Veredito em uma linha

**As três pontas subiram juntas e respondem.** 27 rotas de worker, 20 páginas de
landing e 108 assets de painel testados: **zero 500, zero 404 não-intencional,
zero erro de console.** As 6 migrations estão aplicadas e as RPCs que o worker
chama existem com os nomes exatos — a cobrança de IA está **corretamente
ligada**. Três achados abaixo; nenhum é quebra de produção, e o mais importante
é de painel da Cloudflare, não de código.

---

## 1) Worker — rotas públicas

Health, com a chave de IA presente:

```
$ curl -sS https://diagnostico.olliorcamentos.online/
{"ok":true,"service":"olli-diagnostico","ia":"on"}
```

`link.olliorcamentos.online/` responde o mesmo JSON (200) — os dois hostnames
servem o mesmo worker, como esperado.

### Rotas sem autenticação (as que dá para testar sem efeito colateral)

| Rota | Método | HTTP | Corpo |
|---|---|---|---|
| `/` | GET | **200** | `{"ok":true,"service":"olli-diagnostico","ia":"on"}` |
| `/o/<token inválido>` | GET | **404** | página HTML do portal, 6.743 b |
| `/q/<token inválido>` | GET | **404** | página HTML da etiqueta, 3.581 b |
| `/q/abc123.svg` | GET | **404** | SVG placeholder "QR indisponível", 376 b |
| `/equipe/convite/<inválido>` | GET | **404** | página HTML do convite, 2.427 b |
| `/mp/pacotes` | GET | **200** | 3 pacotes de crédito, 242 b |
| `/abacate/pacotes` | GET | **200** | idem, 242 b |
| `/stripe/sucesso` | GET | **200** | HTML, 2.125 b |
| `/stripe/cancelado` | GET | **200** | HTML, 2.093 b |
| `/admin` | GET | **200** | tela de login do painel admin, 25.100 b |

Os quatro 404 são **404 de verdade** (token inexistente tratado, página de erro
renderizada, nada vazado) — não são 500 disfarçado, que era o que essa
verificação existia para pegar.

### Rotas protegidas — todas negam sem credencial

`401` em: `/admin/api/metrics`, `/cep/01001000`, `/cnpj/<14>`, `/feriados/2026`,
`/eta`, `/conta/excluir`, `/equipe/convite`, `/mp/status`, `/mp/pix`,
`/mp/plano/assinatura`, `/abacate/status`, `/abacate/pix`, `/stripe/checkout`,
`/stripe/portal`, `/stripe/faturas`, `/stripe/metodo`, `/voz`, `/chat`,
`/transcrever`, e `POST` em path inexistente.

Nenhum webhook foi disparado (`/mp/webhook`, `/stripe/webhook`,
`/abacate/webhook` são efeito colateral — não toquei, de propósito).

---

## 2) Landing

**20/20 páginas do sitemap respondem 200.** Home 80.359 b · `/ajuda/` 42.480 b ·
`/blog/` 23.254 b · 8 posts (23.477–30.535 b) · `/legal/privacidade/` 26.760 b ·
`/legal/termos/` 19.105 b · 6 páginas `/para/*` (20.199–25.146 b).

Infra e ícones, todos **200**: `robots.txt` (1.919 b), `sitemap-index.xml`
(235 b), `sitemap-0.xml` (2.230 b), `blog/rss.xml` (5.276 b), `llms.txt`
(3.492 b), `site.webmanifest` (674 b), `favicon.ico/.svg/-32/-48`,
`icon-192/-512`, `apple-touch-icon`, `og-image.png` (239.577 b).

Path inexistente → **404** com a página de erro real (6.382 b), inclusive
`/para/<ofício inexistente>` e `/blog/<post inexistente>`.

No navegador (Playwright), a home carrega com **0 erros e 0 avisos de console** e
**0 requisições com status ≥ 400**.

### `/telas/` — 17 arquivos 200, 16 com um salto a mais

Os 17 arquivos base servem direto (7.761–33.268 b). Os **16 arquivos `@2x`
respondem 307** e só então 200 — é normalização de URL (`@` → `%40`):

```
$ curl -sS -D- -o /dev/null https://olliorcamentos.online/telas/agenda@2x.avif
HTTP/1.1 307 Temporary Redirect
Location: /telas/agenda%402x.avif
$ curl -sSL -o /dev/null -w '%{http_code} %{size_download}\n' .../agenda@2x.avif
200 30600
```

**Funciona** — imagem nenhuma está quebrada. Ver achado **A2**.

### Categorias do blog: 4 dão 404, e está certo

`documentos`, `ferramentas`, `regras` e `tecnico` retornam 404; só
`precificacao` existe. Conferi antes de chamar de bug: `categoriasComRota`
(`web/src/pages/blog/_dados.ts:47`) só cria rota acima de `MINIMO_POR_CATEGORIA`
posts, e `urlCategoria` devolve `null` fora disso — então **nenhum link aponta
para elas**. Verifiquei no HTML publicado de um post da categoria `tecnico`: ele
não linka a própria categoria. Comportamento desenhado, não defeito.

---

## 3) Painel

`https://app.olliorcamentos.online/` → **200**, 1.016 b, `<title>OLLI — Painel</title>`, `<div id="root">` presente.

- **5 assets de entrada, todos 200**: `index-B455_9Uk.js` (930.753 b),
  `index-XyRezpWB.css` (174.515 b), `vendor-core` (93.786 b), `vendor-ui`
  (33.588 b), `vendor-utils` (71.146 b).
- **103 chunks lazy extraídos do bundle e testados um a um: 103/200, 0 falhas.**
  Nenhum chunk faltando — que era o risco real de um deploy de SPA com hash.
- Fallback de SPA correto: `/olli`, `/olli/orcamentos` e path inexistente todos
  servem o `index.html` (1.016 b), sem 404 de servidor.

**Tela de login renderiza** (`/auth/login` — `/sys/login` é caminho de arquivo,
não de URL; ele cai no `/404` do próprio SPA, corretamente):

```
Total de mensagens de console: 0 (Erros: 0, Avisos: 0)
Requisições com status >= 400: nenhuma (27 estáticas, todas OK)
```

Formulário completo no snapshot de acessibilidade: campos E-mail e Senha,
"Entrar", "Esqueceu a senha?", "Criar conta", Google e Apple, e o toggle de tema.
**Não digitei senha e não fiz login** — o teste é de renderização.

---

## 4) Coerência CÓDIGO × BANCO — a cobrança de IA está ligada certo

Este era o item que falha em silêncio ("funciona de graça para sempre").
Conferi contra o **banco de produção**, não contra o arquivo de migration:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
      ('consumir_cota_ia','ref_cobranca_ia_recente','saldo_creditos');
```

| RPC (viva no banco) | Assinatura real | O que `creditos.js` manda | Bate? |
|---|---|---|---|
| `consumir_cota_ia` | `p_user uuid, p_acao text, p_ref text, p_limite integer` | `{p_user, p_acao, p_ref, p_limite}` (`creditos.js:331`) | ✅ |
| `ref_cobranca_ia_recente` | `p_user uuid, p_prefixo text` | `{p_user, p_prefixo}` (`creditos.js:199`) | ✅ |
| `saldo_creditos` | `p_user uuid` | `{p_user}` (`creditos.js:74`) | ✅ |

As três são `SECURITY DEFINER` e o grant é **`postgres, service_role` apenas** —
`authenticated`/`anon` não executam. O worker chama com
`SUPABASE_SERVICE_ROLE_KEY`. Correto.

**Sobre "a ordem dos parâmetros":** pelo PostgREST a chamada é por **nome**
(JSON no corpo), não por posição — a ordem no `JSON.stringify` é irrelevante. O
que precisava bater era o **nome** de cada parâmetro, e bate, um a um. Se um
nome estivesse errado, o PostgREST devolveria `PGRST202`, o worker leria
`'indisponivel'` e cairia em fail-open — a falha invisível que este item
procurava. **Não está acontecendo.**

Também confere: `JANELA_IDEM_MS = 10 * 60 * 1000` (`creditos.js:45`) espelha os
dois `interval '10 minutes'` da migration. `IA_GRATIS_MES = 3` é o `p_limite`.

### Migrations: as 6 estão aplicadas, e na ordem que o BLOQUEIOS mandava

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 6;
```

| Aplicada em (UTC) | Nome registrado |
|---|---|
| 2026-07-19 17:14:44 | `ia_cota_gratis_servidor` |
| 2026-07-19 17:17:20 | `mp_preapproval_id` |
| 2026-07-19 17:19:42 | `membro_consentimento_fecha_exfiltracao` |
| 2026-07-19 17:20:59 | `unicidade_por_tenant` |
| 2026-07-19 17:22:22 | `paywall_empresa_selado` |
| 2026-07-19 17:25:34 | `exclusoes_contadores_equipe_com_whitelist` |

É exatamente a ordem prescrita em `BLOQUEIOS.md` (consentimento → unicidade →
paywall → exclusões). Não confiei no registro: conferi **objeto por objeto**.

| O que | Estado real | Migration |
|---|---|---|
| `ia_uso_gratis` + índice `..._ref_janela_uidx` | existem | 20260727 |
| `assinaturas.mp_preapproval_id` | existe | 20260728 |
| policy `membros_admin_insert` (o backdoor) | **0 — removida** | 20260729 |
| trigger `organizacao_membros_chave_imutavel` + `bloquear_troca_membro()` | existem | 20260729 |
| trigger `organizacoes_grandfathered_congelado` + `congelar_equipe_grandfathered()` | existem | 20260730 |
| policy `convites_gestao_insert` | **0 — removida** | 20260730 |
| policy `exclusoes_equipe_insert` | existe | 20260731 |
| 4 índices `*_tenant_*` novos | **4 de 4** | 20260732 |
| 4 índices antigos sem tenant | **0 — removidos** | 20260732 |

### O cenário de quebra silenciosa do BLOQUEIOS **não** está acontecendo

`BLOQUEIOS.md` avisava: se a 20260730 subisse sem a coluna `equipe_grandfathered`
(20260725), **todo UPDATE em `organizacoes`** passaria a levantar
`record "new" has no field ...`, dias depois, em erro cru. Não bastava ver a
coluna — testei o caminho, com rollback forçado:

```sql
do $$ declare v_org uuid; v_n int;
begin
  select count(*) into v_n from public.organizacoes;
  select id into v_org from public.organizacoes limit 1;
  update public.organizacoes set nome = nome where id = v_org;  -- dispara o trigger
  raise exception 'TRIGGER_OK_UPDATE_PASSOU_ROLLBACK_FEITO — organizacoes=%', v_n;
end $$;
-- ERROR: P0001: TRIGGER_OK_UPDATE_PASSOU_ROLLBACK_FEITO — organizacoes=2
```

O UPDATE **passou pelo trigger** e o `raise` abortou o bloco (nada persistiu). A
coluna existe (`boolean`), junto de `owner_user_id` (`uuid`) — então o
`select=owner_user_id,equipe_grandfathered` de `worker/src/equipe.js:176` também
volta a funcionar: **convidar técnico deixou de estar quebrado**.

### Estado de negócio medido (não estimado)

| | |
|---|---|
| organizações | 2 (as duas com `equipe_grandfathered = true`) |
| assinaturas | 2 |
| lançamentos no `credit_ledger` | **0** |
| usos em `ia_uso_gratis` | **0** |
| `webhook_events` | 0 |

Ver achado **A3**: a máquina de cobrança está ligada e correta, mas **nenhuma
transação passou por ela ainda**.

---

## ACHADOS

### A1 — `robots.txt` de produção bloqueia TODOS os crawlers de IA, e isso não está no repositório
**Gravidade: média · quem resolve: o dono, no painel da Cloudflare**

O `web/public/robots.txt` do repo tem 3 linhas:

```
User-agent: *
Allow: /
Sitemap: https://olliorcamentos.online/sitemap-index.xml
```

O que produção **serve** tem ~60 linhas, num bloco
`# BEGIN Cloudflare Managed content`, com `Disallow: /` para **nove** agentes:
`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `meta-externalagent`,
`Bytespider`, `Amazonbot`, `Applebot-Extended`,
`CloudflareBrowserRenderingCrawler` — mais
`Content-Signal: search=yes,ai-train=no,use=reference`.

Nada disso está em nenhum arquivo do repositório (`grep -ci
"gptbot|claudebot|ccbot|google-extended|content-signal" web/public/robots.txt`
→ **0**). É a Cloudflare injetando na borda.

**Por que importa:** busca comum está liberada (`User-agent: *` → `Allow: /`),
então **SEO não foi afetado**. Mas o projeto publica `/llms.txt` — que responde
200, 3.492 b — cuja razão de existir é ser lido por assistentes de IA, e
`LANDING_BLOG_SEO.md` trata "Plano GEO" como alavanca declarada (linha 560: *"A
alavanca de GEO"*). **O site serve o `llms.txt` e, no mesmo request, manda todo
crawler de IA que respeita robots ir embora.** As duas decisões se anulam, e
como o arquivo é gerado na borda, ninguém olhando o repo descobre.

Não é bug de código e eu não consigo mexer nisso: é uma chave no painel
(Cloudflare → AI Crawl Control / managed `robots.txt`). **É uma decisão do dono,
não um conserto:** bloquear IA é uma postura legítima — só precisa ser
*escolhida*, e hoje ela está valendo por padrão, contra a estratégia escrita.

### A2 — 16 imagens `@2x` custam um redirect a mais em tela retina
**Gravidade: baixa (desempenho) · quem resolve: o enxame**

A home referencia `@2x` com o `@` literal — 16 ocorrências:

```
srcset="/telas/orcamento-aprovado.avif 393w, /telas/orcamento-aprovado@2x.avif 786w"
```

e `/telas/<nome>@2x.<ext>` responde **307 → `%402x` → 200**. Zero ocorrências de
`%402x` no HTML.

Funciona; ninguém vê imagem quebrada. Mas **só aparece em tela retina** (DPR ≥ 2
— ou seja, praticamente todo celular), que é por isso que passou batido: no
Playwright com DPR 1 o navegador escolhe a variante 393w e o 307 nem acontece —
confirmei que nenhuma requisição a `/telas/` apareceu naquele trace. No celular
do prestador, cada screenshot do hero paga um round-trip extra. Conserto é
emitir o nome já codificado (ou renomear os arquivos sem `@`).

### A3 — a cobrança de IA está ligada e correta, mas nunca foi exercida
**Gravidade: informativa · não é defeito**

`credit_ledger` e `ia_uso_gratis` estão **vazias**. Ou seja: provei que o
contrato está certo (nomes, tipos, grants, janela, trigger), mas **não** que uma
cobrança real acontece de ponta a ponta — nenhuma passou. A primeira ação de voz
de um usuário grátis é que vai exercitar o caminho pela primeira vez.

Vale lembrar do custo já documentado no `BLOQUEIOS.md` e que agora está **em
vigor**: quem estava pegando carona na chave de idempotência antiga leva **1
crédito extra, uma vez só**, na primeira ação depois do deploy. Se aparecer
reclamação de "1 crédito a mais", é isto, é esperado, e é uma vez.

### A4 — `GET` em rota inexistente devolve 405, não 404
**Gravidade: cosmética**

```
GET /rota-que-nao-existe-teste → 405 {"ok":false,"erro":"metodo_nao_suportado"}
```

`worker/src/index.js:897` barra por método antes de por rota, então todo GET fora
da lista vira "método não suportado" em vez de "não encontrado". Não é 500, não
vaza nada, não quebra cliente nenhum. Anoto porque um dia confunde quem depurar.

### A5 — o registro de migrations não bate com os nomes de arquivo do repo
**Gravidade: média se alguém rodar `supabase db push` · quem resolve: o dono**

As 6 foram registradas com versão **nova** (`20260719171444`…`20260719172534`),
não com a versão do arquivo (`20260727_`…`20260732_`). O mesmo já valia para
levas antigas — `20260718_rls_owner_backdoor.sql` está no ledger como versão
`20260711130011`.

Consequência concreta: o ledger tem **19 versões**, o repo tem **28 prefixos
distintos**. Um `supabase db push` compara por versão e vai considerar ~24
migrations pendentes — inclusive `20260718_rls_owner_backdoor.sql`, que
**recria `membros_admin_insert`** (linha 34), a policy que a 20260729 acabou de
derrubar, e `20260707_multitenant.sql`, que **recria `clientes_owner_write`**
(linha 403).

Sendo honesto sobre o risco: um push **completo**, em ordem de nome de arquivo,
provavelmente converge para o estado certo, porque a 20260729 roda depois da
20260718 e conserta de novo. O perigo real é (a) push interrompido no meio, que
deixa os furos de isolamento de tenant abertos, e (b) re-rodar DDL fundacional
pesada (`20260707_multitenant.sql`) contra banco com dado vivo. Isso é a mesma
"armadilha de ordem" que o `BLOQUEIOS.md` já descrevia — só que agora o
descompasso do ledger faz o `db push` cair nela **sozinho**.

**Recomendação: não rodar `supabase db push` neste projeto.** Reconciliar o
ledger primeiro (registrar as versões do repo como aplicadas). Não fiz nada
disso — é escrita em banco de produção e não é meu escopo.

---

## O QUE DEPENDE DO DONO — lista atualizada

### ✅ Deixou de ser bloqueio agora

- ~~**3 migrations no Supabase de produção** (`20260724_webhook_events` →
  `20260725_equipe_grandfathering` → `20260726_credit_ledger_imutavel`)~~ —
  **FEITO.** `webhook_events` existe, `organizacoes.equipe_grandfathered` existe
  (`boolean`), `credit_ledger` existe.
- ~~**As 4 migrations da leva 20260729→20260732**~~ — **FEITO**, na ordem
  prescrita, conferidas objeto por objeto (tabela acima).
- ~~**Convidar técnico está quebrado hoje**~~ (`BLOQUEIOS.md` §Passo 0) —
  **RESOLVIDO** pela coluna `equipe_grandfathered`. `getOrg` volta a ler os dois
  campos; o 503 fail-closed não acontece mais.
- ~~**Migration de cota não aplicada → cobrança de IA ilimitada**~~ —
  **RESOLVIDO.** As RPCs existem e o fail-open não é mais o caminho normal.
- ~~**Atrito da 20260730: 402 `plano_requer_empresa` vira "Tente de novo"**~~ —
  **JÁ CONSERTADO no código.** `src/services/equipe.ts:346` tem o `case` com a
  mensagem certa ("Convidar técnicos faz parte do plano Empresa..."). Conferi
  hoje: o defeito **não** existe mais.
- ~~**`MP_ACCESS_TOKEN` no cofre**~~ — presente (lista abaixo).
- ~~**Deploy do worker apaga secrets**~~ — **não apagou.** 9 secrets, íntegros.

### ❌ Continua dependendo só de você

**Receita (sem isto ninguém paga):**
1. **`MP_WEBHOOK_SECRET`** — **confirmado ausente hoje**:
   ```
   $ npx wrangler secret list   # (9) ABACATEPAY_API_KEY, ABACATE_WEBHOOK_SECRET,
     ADMIN_EMAIL, GEMINI_API_KEY, MP_ACCESS_TOKEN, OLLI_ROUTES_API_KEY,
     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
   ```
   Enquanto faltar, `/mp/webhook` roda no caminho **não assinado**
   (`mercadopago.js:626-631`): a confirmação vem só do GET à API do MP e a rota
   fica pública, protegida apenas pelo teto `MPHOOK_RL` (120/min/IP). Falta
   também **registrar o webhook no painel do Mercado Pago**.
2. **Stripe:** habilitar Installments (parcelamento BR) + criar os 3 Prices
   (`olli_pro_12x`, `olli_empresa_mensal`, `olli_empresa_anual`) com lookup_keys.
3. **Decisão do paywall Empresa** — as **2** organizações estão com
   `equipe_grandfathered = true`, então **hoje o paywall não corta ninguém**. A
   linha que corta continua sendo sua, e só sua:
   `update public.organizacoes set equipe_grandfathered = false;`

**Novo nesta rodada:**
4. **`robots.txt` gerenciado pela Cloudflare bloqueando 9 crawlers de IA** —
   achado **A1**. Decidir: manter (e então aposentar o `/llms.txt` e o "Plano
   GEO") ou liberar no painel. Hoje as duas coisas estão valendo ao mesmo tempo.
5. **Não rodar `supabase db push`** até reconciliar o ledger — achado **A5**.

**Chaves e infra (inalterado):**
6. **`SENTRY_AUTH_TOKEN`** — sem ele o build release do APK falha; o contorno
   (`SENTRY_DISABLE_AUTO_UPLOAD=true`) entrega stack trace minificado. ⚠️ quando
   esse build falha o gradle deixa o APK **antigo** na pasta — confira a data.
7. **Chave PostHog** (projeto não criado) — feature desligada até existir.
8. **Chave Resend + verificar `mail.olliorcamentos.online`** — confirmado: não há
   `RESEND_API_KEY` no cofre do worker. E-mail de convite falha calado.
9. **TOTP/MFA na conta `ADMIN_EMAIL`.**
10. **OAuth client Android** (precisa do SHA-1 do keystore de release) +
    **consent screen** (escopo `calendar.events`, 1–4 semanas de revisão).
11. **`pg_dump --schema-only` das 13 tabelas legadas** → baseline versionado.

**Google Play** (detalhe em `LOJA.md`): conta Play Console, pessoal vs.
organização, login EAS, aprovar screenshots (existem e estão conformes),
questionário IARC, clique final, senha da keystore no cofre.

**Produto:** O2-19 numeração atômica; emulador `olli_phone`; APK final.

**MCP:** `mercadopago` e `cloudflare` continuam pedindo OAuth interativo — sessão
não-interativa não autentica. Por isso o A1 foi diagnosticado por `curl` e o
cofre por `wrangler secret list`, não pelo MCP.

---

## O que este teste NÃO cobriu

Para o próximo não achar que está provado o que não está:

- **Nenhum fluxo autenticado.** Não digito senha — login, criar orçamento,
  gerar voz por IA, cobrar crédito de verdade: tudo não testado ao vivo.
- **Nenhum webhook.** `/mp/webhook`, `/stripe/webhook`, `/abacate/webhook` têm
  efeito colateral em dinheiro; não disparei.
- **Os gates de build** (`npm run preflight`, `tsc && build`, `astro check`) —
  **de propósito**: outro agente está editando a árvore agora, e um build sobre
  código em mutação dá resultado que não significa nada. Além disso este teste é
  sobre o que está **em produção**, não sobre a working tree.
- **A cobrança de IA ponta a ponta** — contrato provado, execução não (**A3**).
- Rede local instável durante a sessão (alguns `Recv failure` / falha de DNS
  isolados). Toda medição acima repete até obter resposta; nada foi reportado a
  partir de uma falha de rede minha.
