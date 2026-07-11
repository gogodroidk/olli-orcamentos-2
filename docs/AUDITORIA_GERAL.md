<!--
  AUDITORIA GERAL do OLLI — 7 lentes (Sonnet) + sintese Fable, 2026-07-11.
  Documento de ACHADOS (nada corrigido ainda). Checks ao vivo do Opus:
  GCP chave restrita a Routes+Geocoding OK, billing so no olli-orcamentos OK,
  worker ia:on + /eta e /geocodificar 401 OK.
-->

# RELATÓRIO CONSOLIDADO — Auditoria Geral OLLI (7 lentes)

**Data:** 2026-07-10 · **Prazo de loja:** ~dia 20 (9-10 dias) · **Worktree:** 14 commits à frente de origin/main, ainda não empurrados

Deduplicação: 52 achados brutos → **38 únicos** (o rate-limit do /eta apareceu em 3 lentes; o buraco do `papel='owner'` em 2; o CSP unsafe-inline em 2).

---

## ALERTA OPERACIONAL — leia antes de qualquer push

O achado mais urgente não é código: é que **o próximo `git push` na main pode derrubar o worker de produção** (P0-1 abaixo). As 14 commits deste worktree não devem ser mescladas antes de confirmar no dashboard da Cloudflare que o Workers Build por Git foi desconectado. Já aconteceu 3x em 2026-07-10; quando acontece, o webhook da Stripe vira 404 e **pagamentos se perdem** nesse intervalo.

---

## P0 — Críticos (4)

### P0-1 · Workers Build por Git ainda pode estar ligado — push na main derruba o worker
- **Onde:** Dashboard Cloudflare → olli-diagnostico → Settings → Build (estado só existe no dashboard, não no repo).
- **Por que importa:** cada push republica o worker como worker de assets (sem JS, sem secrets). GET / vira HTML, `/stripe/webhook` vira 404 → **perda de pagamentos**. Verificado ao vivo que o worker está saudável AGORA, mas isso não prova que a integração foi desligada.
- **Correção:** desconectar o repositório do worker no dashboard. Rede de segurança: rodar `node worker/reparar.mjs` após qualquer push até a desativação ser confirmada.
- **Quem:** **PASSO HUMANO** (dashboard, ~5 min) + **VERIFICAR AO VIVO**. Bloqueia o merge de tudo o mais.

### P0-2 · RLS: admin pode plantar um co-owner backdoor irrevogável
- **Onde:** `supabase/migrations/20260707_multitenant.sql:264-270` — policy `membros_admin_insert` em `organizacao_membros`.
- **Por que importa:** UPDATE/DELETE bloqueiam `papel='owner'`, o INSERT não. Um membro `admin` pode inserir uma linha `papel='owner'` para qualquer user_id — e como as policies de UPDATE/DELETE protegem linhas owner, **nem o dono legítimo consegue remover** via app. Backdoor persistente, só limpável com service_role.
- **Correção:** nova migration com `and papel <> 'owner'` no WITH CHECK + índice único parcial (`on organizacao_membros (org_id) where papel='owner'`) garantindo 1 owner por org.
- **Quem:** **ENXAME** escreve a migration; **VERIFICAR AO VIVO** para aplicar (o token do Supabase MCP estava sem autorização nesta sessão) e reproduzir o insert com JWT de admin antes/depois.

### P0-3 · R8/ProGuard e shrinkResources DESLIGADOS em todo build de release
- **Onde:** `android/` é 100% gerado (não versionado); não existe `expo-build-properties` em `app.json`/`package.json`. Todo `expo prebuild` reseta as flags para off.
- **Por que importa:** viola diretamente a regra "APK não pode inchar" — o release sai sem minificação nem shrink de recursos, silenciosamente. Ganho típico ao ligar: 20-40% do APK.
- **Correção:** adicionar `expo-build-properties` com `enableProguardInReleaseBuilds: true` + `enableShrinkResourcesInReleaseBuilds: true` (versionado, sobrevive a prebuild).
- **Quem:** **ENXAME** codifica; **PASSO HUMANO/VERIFICAR**: gerar `assembleRelease` real e testar Supabase/SQLite/assinatura/voz no emulador (regra da memória: Hermes só quebra no APK, nunca na web) — R8 pode quebrar reflection sem quebrar em debug.

### P0-4 · 21 telas desktop + Landing inteira embarcadas no APK nativo
- **Onde:** `src/navigation/AppNavigator.tsx:46,55-74,478` + `src/screens/desktop/index.ts` (barril `.ts`, não `.web.ts`).
- **Por que importa:** o comentário "no APK nada disto entra na árvore" está errado — import estático entra no bundle Hermes independente do runtime. São ~8000+ linhas (desktop + landing + gifted-charts) que o usuário de celular baixa e nunca renderiza. Segunda violação direta do "APK não incha".
- **Correção:** transformar o barril em `index.web.ts` (com `index.ts` nativo de stubs) e mesmo tratamento para `LandingScreen` — resolução de plataforma do Metro é o único mecanismo real de exclusão de bundle.
- **Quem:** **ENXAME**.

---

## P1 — Graves (14, deduplicados)

### Segurança e custo

**P1-1 · `/eta` e `/geocodificar` sem rate limit e sem teto de payload** (3 lentes convergiram)
`worker/src/index.js:721-732` + `wrangler.jsonc`. São as **únicas rotas que geram custo direto no Google** (Routes + Geocoding, billing ligado) e as únicas rotas de negócio sem limiter — IA, Stripe, link e admin todos têm. Qualquer conta autenticada (inclusive grátis) chama em loop sem freio; o orçamento de R$50 do GCP é só e-mail, não bloqueia gasto. As rotas também retornam antes do `bodyMuitoGrande()`. **Correção:** binding `ETA_RL` por user.id (padrão IA_RL) + teto de content-length (~4KB). **ENXAME**. Complemento: cota dura em APIs & Serviços → Cotas no console GCP = **PASSO HUMANO** (P1-10).

**P1-2 · Gate de papel fail-open nas telas desktop de OS/Equipamentos**
`OrdensDesktopScreen.tsx:57-58`, `EquipamentosDesktopScreen.tsx:113-116`, `PainelOS.tsx`. `ehGestao = papel !== 'tecnico'` computado antes do papel resolver (e offline sem cache fica indeterminado) → técnico vê "Nova OS", "Atribuir técnico", "Cancelar". Nenhum serviço checa papel no servidor — gate 100% client-side, e a réplica desktop ficou mais fraca que o padrão mobile que ela diz espelhar. **Correção:** usar o `carregando` fail-closed de `usePermissao` antes de computar `ehGestao` (padrão de `OrdemServicoScreen.tsx:221`) + considerar checagem no serviço como defesa em profundidade. **ENXAME**.

**P1-3 · Cliente criado por técnico cai no tenant errado e some**
`cloudSync.ts:102-121, 584-591`. `clientes` fica fora da injeção de `contextoEquipeOwner`, mas o wizard de orçamento (`Step1Cliente.tsx`) deixa técnico cadastrar cliente. O registro nasce com `user_id` do técnico, invisível pro dono e pra equipe — **sem erro nenhum** ("erro vira vazio", a regra que o dono mais odeia). **Correção:** decisão de produto — (a) incluir clientes na injeção + abrir a RLS de INSERT para membro ativo, ou (b) bloquear a UI de novo cliente para técnico com aviso explícito. **ENXAME** (recomendo (a), alinhando com o que `usePermissao.ts` já documenta); reproduzir com a conta demo = **VERIFICAR AO VIVO**.

**P1-4 · Histórico de versões de orçamento some do painel do dono**
`clienteLink.ts:429-464` (`espelharVersaoNuvem` nunca seta `user_id`). Quando um técnico edita orçamento do dono, o snapshot congelado nasce no tenant do técnico — o dono perde exatamente a prova que a feature existe pra preservar. A RLS já permitiria o valor correto; o app só não manda. **Correção:** resolver `ownerUserId` via `getMinhaOrganizacao()` e incluir no payload — mesmo padrão do cloudSync. **ENXAME**.

**P1-5 · Política de privacidade promete restrição técnica que não existe**
`privacidade.ts:126` vs `localizacaoEquipe.ts:95-167`. A política diz "localização SOMENTE em horário de trabalho"; o código não tem gate nenhum. Enfraquece a base de legítimo interesse (LGPD art. 7 IX). **Correção:** suavizar a copy agora (rápido) ou implementar gate de expediente — obrigatório resolver ANTES da Onda 8 (expo-location em background). **ENXAME** (copy) — e é violação da regra "copy vem da fonte".

**P1-6 · Convites esgotam o balde de rate limit do Stripe**
`equipe.js:230` usa `STRIPE_RL` com a mesma chave `user.id` do checkout/portal — `conta.js` já documenta e corrige exatamente esse risco com prefixo. Dono convidando vários técnicos pode ficar bloqueado do Portal (o caminho que a Apple exige para cancelar). **Correção:** chave `convite:${user.id}`. **ENXAME** (1 linha).

**P1-7 · PKCE do Google Agenda usa 'plain' em vez de S256**
`googleAgenda.ts:186-189`. Código inerte hoje, mas o roadmap diz "é só ligar" — e liga com escopo sensível `calendar.events`. 'plain' anula a proteção do PKCE em custom URI scheme no Android. **Correção:** S256 via `crypto.subtle.digest` (sem dependência nova) + corrigir o comentário que afirma equivalência de segurança falsa. **ENXAME**.

### Prazo externo (relógio que não é nosso)

**P1-8 · Consent screen OAuth com escopo `calendar.events` nem foi submetida**
Projeto voice-teste-b8b2a, console-only. A homologação do Google leva de dias a semanas e é o único bloqueio com prazo fora do controle do time — mas está como item 5 da fila do KNOWN_BLOCKERS.md, ordenada por esforço e não por lead time. **Correção:** submeter HOJE, em paralelo a tudo. Se não fechar a tempo, lançar com Agenda desligada (já é o default). **PASSO HUMANO (Igor logado), lead time 1-4 semanas — iniciar imediatamente.**

### Experiência e consistência

**P1-9 · Badges de status falham contraste WCAG no modo padrão do app**
`StatusBadge.tsx` + `STATUS_COLORS`/`STATUS_OS_CORES` em ~10 call-sites. Cinza de rascunho/aberta = 2,54:1 sobre branco (mínimo AA: 4,5:1) — no badge mais visto do app. O tema já tem `corCategoriaEmChip` exatamente pra isso, usado corretamente na Agenda. **Correção:** centralizar `corStatusOrcamento`/`corStatusOS` no theme e trocar os call-sites. **ENXAME**.

**P1-10 · 96 diálogos do desktop são `window.confirm`/`alert` crus do navegador**
`src/screens/desktop/dialogo.ts`, 17 telas. Popup cinza "localhost diz:" sem tema, sem marca, no momento de maior tensão (excluir dado). Maior desvio de "sinergia total" do app; PaperProvider + Dialog já estão montados, sem dependência nova. **Correção:** componente único de confirmação temado substituindo `avisar()`/`confirmar()`. **ENXAME**.

**P1-11 · Regra de ouro violada ao vivo: texto solto fora de `<Text>` (2x por carregamento)**
Confirmado nos logs de console da sessão. String vazia como filho de View (padrão `{str && <View>}` sem `!!`), em componente montado globalmente (App/Navigator/providers). **Correção:** caçar com DevTools + grep nos componentes globais e corrigir. **ENXAME** + **VERIFICAR AO VIVO** (stack trace completo no navegador).

**P1-12 · Mascote onipresente ignora reduced-motion**
`OlliMascot.tsx:28-77` (3 loops infinitos) — presente em Home, Chat, Onboarding e overlay de PDF. O hook `useReducedMotion` existe e é usado com louvor no EtaChip; o mascote não. Mesmo problema no `EmptyState` (P2). **Correção:** pular `loop.start()` quando reduzido. **ENXAME**.

### Performance / peso

**P1-13 · Regressão: telas desktop novas voltaram ao `getOrcamentos()` sem paginação**
`RelatoriosDesktopScreen.tsx:47-53`, `OrcamentosDesktopScreen.tsx:51`. SELECT * + JSON.parse do histórico inteiro a cada foco/sync — exatamente o padrão que a própria fase Velocidade corrigiu no mobile (item 1.18). **Correção:** usar `getOrcamentosAgregadoPorStatus` (relatórios) e `getOrcamentosPagina` (lista). **ENXAME**.

**P1-14 · Peso morto no bundle e nos assets** (agrupa 3 achados)
(a) `react-native-vector-icons` (8,8 MB, nativo, autolinkável) declarado e **nunca importado** — remover. (b) Bundle web único de 5,4 MB servindo landing + ERP: 19 famílias de ícone empacotadas quando só MaterialCommunityIcons é usada (~2,7 MB), 21 .ttf de Google Fonts não usados (~4 MB itálicos). (c) `android-icon-background.png` de 990 KB onde uma cor sólida (`#0A2547`) resolve. **ENXAME** para tudo; (a) exige build limpo de confirmação.

---

## P2 — Relevantes (resumo, 16 itens)

| # | Item | Quem |
|---|------|------|
| 1 | **ETA/"estou a caminho" NÃO funciona no APK nativo hoje** (`LOCALIZACAO_DISPONIVEL=false`; o chip oferece "ative a localização" que é beco sem saída). Ajustar copy/esconder no nativo até a Onda 8. **O dono precisa saber: essa feature anunciada só existe na web/desktop.** | ENXAME + aviso ao dono |
| 2 | Cache de ETA indexado só por destino, TTL 5 min — pode mandar "chego em ~X min" defasado ao cliente via WhatsApp | ENXAME |
| 3 | Zoom do PdfPreviewModal extrapola a moldura sem scroll/pan | ENXAME |
| 4 | Memoização de TabelaDados anulada por callbacks inline nas 10 telas desktop | ENXAME |
| 5 | `bodyMuitoGrande()` das rotas IA confia só em content-length (chunked escapa) — link.js já tem a correção pronta pra replicar | ENXAME |
| 6 | `reparar.mjs:61` tem fallback hardcoded de ADMIN_EMAIL — contradiz a regra fail-closed que o próprio admin.js documenta | ENXAME |
| 7 | Domínios customizados do worker só existem no dashboard (mesmo padrão que causou o problema do Git Build) — declarar em `routes` ou documentar | ENXAME + VERIFICAR |
| 8 | Painel /admin sem MFA — cadastrar TOTP e exigir aal2 no requireAdmin | HUMANO (TOTP) + ENXAME (aal2) |
| 9 | `assets.fotos`/`ordens_servico.fotos` sincronizam paths locais mortos (file:///) pro banco | ENXAME (decisão simples) |
| 10 | Cabeçalho contraditório em `20260709_pmoc_fundacao.sql` ("APLICADA" + "NÃO aplicar") | ENXAME |
| 11 | Sem migration baseline das 13 tabelas legadas — schema não reconstruível do repo; RLS delas não confirmável estaticamente | ENXAME (dump) + VERIFICAR (advisors) |
| 12 | `orcamentos_publicos` owner-only: técnico que mandou a proposta não vê a resposta do cliente | Decisão do dono → ENXAME |
| 13 | EmptyState + LayoutAnimation (Agenda/RelatorioDia) sem reduced-motion; hex crus em HomeScreen/OlliVozScreen; 263 hex fora do tema → regra Semgrep como gate | ENXAME |
| 14 | KNOWN_BLOCKERS.md B4 desatualizado (billing já está LIGADO desde 2026-07-10) — doc mentindo pra sessões futuras | ENXAME |
| 15 | Chave Gemini órfã ativa no GCP (2 chaves, 1 secret) — identificar e revogar | HUMANO/VERIFICAR |
| 16 | APIs supérfluas habilitadas no único projeto com billing (Ads, Business Profile, BigQuery) | HUMANO (gcloud, 10 min) |

## P3 — Menores (resumo)

Guard `Platform.OS` inconsistente em pmocLembretes; `ultimoMotivoFalha` mutável de módulo em olliIA; revoke faltante em `sincronizar_revogacao_publico`; `geocodificarEndereco` colapsa erros em null (desvio da regra 3-estados); constantes de rota exportadas e nunca consultadas no worker; README do worker desatualizado; entrada morta `olli_pro_12x`; CSP unsafe-inline (mitigado por escaping correto — verificado); copy divergente de "nenhuma OS"; paddings fora de Spacing; PNGs de ícone sem otimizar; chaves Firebase sem allowlist (sem dado atrás delas, confirmado); splits de ABI no build local. Todos codáveis pelo enxame ou higiene rápida.

---

## Separação de responsabilidades

### (a) ENXAME corrige JÁ (codável, sem depender de ninguém)
1. Migration `papel <> 'owner'` + índice único de owner (P0-2 — escrever; aplicar depende de token)
2. `expo-build-properties` com R8/shrink (P0-3)
3. `index.web.ts` para desktop + landing fora do bundle nativo (P0-4)
4. Rate limit + teto de payload em /eta e /geocodificar (P1-1)
5. Gate fail-closed de papel nas telas desktop (P1-2)
6. Injeção de owner em clientes e em espelharVersaoNuvem (P1-3, P1-4)
7. Conflito de agenda buscando o dia efetivamente selecionado (Bugs P1)
8. Prefixo `convite:` no rate limit (P1-6)
9. PKCE S256 (P1-7)
10. Copy da política de privacidade sem promessa falsa (P1-5)
11. Contraste dos badges de status via theme (P1-9)
12. Diálogo temado substituindo window.confirm/alert (P1-10)
13. Caça ao texto solto fora de Text (P1-11)
14. reduced-motion no mascote/EmptyState/LayoutAnimation (P1-12)
15. Paginação/agregação nas telas desktop regressadas (P1-13)
16. Limpeza de peso: vector-icons morto, fontes, ícone 990KB (P1-14)
17. Copy honesta do ETA no nativo (P2-1) + todo o bloco P2/P3 codável

### (b) VERIFICAR AO VIVO (infra, precisa de acesso)
- Dashboard Cloudflare: Git Build desconectado? Bindings dos 4 rate limiters provisionados?
- Supabase (token válido): aplicar migration do P0-2 e reproduzir o insert malicioso; `list_migrations` (15 aplicadas?); `get_advisors` security; RLS nas 13 tabelas legadas
- Google Cloud Console: chave Routes restrita só às 2 APIs (auditor de GCP já confirmou ao vivo — OK); cota dura em Routes/Geocoding; qual chave Gemini é a ativa
- Build de release com R8 ligado testado no emulador `olli_phone` (fluxos Supabase/SQLite/assinatura/voz)
- Stack trace completo do "Unexpected text node" no DevTools

### (c) PASSO HUMANO do dono (com lead time)
| Ação | Lead time | Quando |
|---|---|---|
| Desconectar Workers Build por Git no dashboard | 5 min | **HOJE, antes de qualquer push** |
| Submeter consent screen OAuth (escopo calendar.events, política, vídeo se pedirem) | **1-4 semanas de fila do Google** | **HOJE, em paralelo** |
| Cota dura nas APIs Routes/Geocoding no console | 10 min | Esta semana |
| Cadastrar TOTP na conta ADMIN_EMAIL | 10 min | Esta semana |
| Revogar chave Gemini órfã + desabilitar APIs supérfluas no projeto com billing | 15 min | Esta semana |
| Decisão de produto: técnico pode cadastrar cliente? Equipe vê resposta do cliente no link público? | decisão | Antes do bloco de sync |

---

## SEQUÊNCIA RECOMENDADA

1. **Hoje, humano (15 min):** desligar Workers Build + submeter consent screen (o relógio do Google começa a contar). Só depois disso, mesclar/empurrar as 14 commits (com `reparar.mjs` de plantão no primeiro push).
2. **Onda enxame 1 — Segurança e dinheiro (1 dia):** itens 1, 4, 5, 6, 8, 9 da lista (a) + reparar.mjs sem fallback. São os furos por onde entra prejuízo ou escalada de privilégio.
3. **Verificação ao vivo 1:** aplicar migration no Supabase, testar o insert de owner, advisors, bindings.
4. **Onda enxame 2 — APK e loja (1-2 dias):** itens 2, 3, 16 + build de release R8 testado no emulador. É o que decide se o APK da loja sai no peso certo — e R8 precisa de tempo de teste, não pode ficar pra véspera.
5. **Onda enxame 3 — Multi-tenant e UX (1-2 dias):** itens 6 (sync), 7, 10-15, 17 + P2 codáveis.
6. **Humano em paralelo:** cota GCP, TOTP, higiene de chaves, decisões de produto.
7. **Gate final:** Semgrep de hex/spacing como pre-commit, re-rodar os logs de console limpos, smoke test com a conta demo GR Tech nos dois papéis (dono E técnico — vários bugs desta auditoria só aparecem na conta do técnico).

## Quão perto de PERFEITO estamos

**Honestamente: a fundação é excelente e a superfície ainda não — algo como 80-85% do caminho.**

O que está genuinamente forte, confirmado por múltiplas lentes: RLS multi-tenant com triggers de imutabilidade e testes embutidos (disciplina rara), worker com HMAC/anti-replay/fail-closed corretos, design system com contraste WCAG de verdade implementado, dashboard SQL e sync com transação sem regressões, escaping consistente em todas as páginas públicas. Nenhum segredo vazado, nenhuma injection, nenhuma rota de IA aberta.

O que separa do perfeito são cinco coisas, todas nomeáveis e todas com correção conhecida:

1. **Um risco operacional único** (Workers Build) capaz de desfazer tudo num push — e é um clique no dashboard.
2. **Furos de borda no multi-tenant**: o backdoor de owner e os dois sumiços silenciosos de dados do técnico. São exatamente o bug que a memória do projeto chama de "erro vira vazio" — a regra existe porque isso já mordeu antes, e mordeu de novo.
3. **As duas regras "APK não incha" estão sendo violadas agora** (sem R8, com código web embarcado). O APK atual está objetivamente maior do que o produto exige.
4. **Adesão desigual ao próprio design system**: as ferramentas certas existem (corCategoriaEmChip, useReducedMotion, EstadoIA) e são usadas com louvor em metade dos lugares — a outra metade precisa de varredura + lint como gate para não regredir.
5. **Dois itens com relógio externo** (consent screen do Google, teste de R8 em release) que não aceitam ser deixados pra véspera do dia 20.

Nota de transparência ao dono: **o "estou a caminho" e o ETA anunciados nesta sessão só funcionam na web/desktop hoje** — o APK não tem expo-location até a Onda 8. E este relatório não pôde confirmar ao vivo o estado do Supabase de produção nem dos bindings da Cloudflare (tokens sem autorização na sessão dos auditores) — a seção (b) fecha essas lacunas.

Nada aqui é retrabalho estrutural. É uma lista finita, priorizada, e ~80% dela o enxame executa sozinho em 3-4 dias de ondas — sobrando margem real antes do dia 20 para o que só o Google decide.