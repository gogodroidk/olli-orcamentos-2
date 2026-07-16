# EXECUTION_LOG — OLLI Orçamentos

> O que já foi ENTREGUE, com evidência (commit ou arquivo). Atualizar ao fim de cada onda.
> Última atualização: 2026-07-12.

## ⚖️ FONTE ÚNICA DE ESTADO (decidido em 2026-07-16 — item O0-5)

**Este arquivo + [`FOLLOWUPS.md`](FOLLOWUPS.md) são o registro OFICIAL do que existe no OLLI.**
Estado só é real aqui com evidência **verificável**: hash de commit, migration aplicada, exit code,
HTTP status. Divergiu de qualquer outro documento? **Estes dois vencem** — e o outro documento é que
está errado. Quem for escrever plano, roadmap ou auditoria começa por aqui, não por síntese.

Por que a regra existe: três camadas de documentação divergiam e cada leitor novo priorizava
fantasma. No mesmo dia (14/07) o MESMO painel tirou **7,5/10** numa auditoria aba-por-aba e
**4,6/10** noutra feita sobre o bundle — a diferença não era o painel, era o material lido.

| Fonte | O que é | Como tratar |
|---|---|---|
| `docs/EXECUTION_LOG.md` + `docs/FOLLOWUPS.md` | Registro vivo, com commit/migration/teste | **OFICIAL — é o estado** |
| `C:\ollx\h` (bundle de handoff) | **Snapshot** de ~15/07. Verificado em 16/07: **não tem `.git`** e o `src/` só contém `types/` — o app mobile inteiro (`services/`, `screens/`, `database/`) **não está lá**. Foi ele que gerou o "4,6/10, build quebrado, módulos ausentes": a auditoria acusou a ausência do bundle, não do produto. | **Aspiracional/parcial — NUNCA como estado corrente** |
| `C:\ollx\h\olli-program` (kit de programa) | Template **nunca aplicado**. Verificado em 16/07: **82 itens `"status":"not_started"` e ZERO em qualquer outro status** — nenhum item jamais avançou, inclusive coisas comprovadamente em produção (RLS, admin fail-closed). O `EXECUTION_LEDGER.md` dele tem 5 linhas. | **Template em branco — não é registro de progresso** |
| `Entregas Claude\OLLI-Plano-Mestre\` | **Síntese** e priorização (o "porquê" e a ordem) | Ótimo para decidir; **não é inventário** |
| `docs/PILOTO/LEDGER.md` | Trilha append-only do piloto automático | Complementa este log; a FILA é do dono |

**Contradições conhecidas que esta regra resolve** (o lado errado é sempre o de fora):
`WEB_ESTADO_E_PLANO` diz "falta CRUD de escrita" enquanto os `Form*.tsx` existem completos no código ·
`CURRENT_STATE` diz que `verticais.ts` não existe, mas há commit (`06a5269`) ·
docs de PMOC do bundle dizem "nada implementado", mas as Fases 1-2 estão aplicadas e testadas 5/5 ·
`FEATURE_MATRIX` ainda trata o webhook Stripe como fonte da verdade do plano, ignorando a decisão
posterior do dono pelo Mercado Pago como gateway único.

*Regra da casa que nasce daqui: **copy/preço/feature só derivada da fonte** (`PLANOS_BASE`, types,
Stripe live) — nunca de memória. Já mentiu 5 vezes.*

## Ciclo v1–v8 (pré-roadmap atual)

| Versão | Commit | Entrega | Evidência |
| --- | --- | --- | --- |
| Blindagem | `526d6ec` | Rate limit no worker, sync com guard de timestamp, schema versionado, RLS otimizada (padrão `(select auth.uid())`) | migrations `20260615`/`20260624`, `worker/src` |
| Revisão adversarial | `fcf9cc6` | Restore de backup recupera de verdade, timestamps robustos | `src/services/backup.ts` |
| v1 "perfeição" | `ab24ce2` | 110+ correções tela a tela, sync blindado, APK/iOS prontos | diff do commit |
| v2 | `56e1a2e` | Stripe ponta a ponta (checkout, portal, webhook fonte da verdade) + backup automático versionado + customização da marca | `worker/src/stripe.js`, `src/services/autoBackup.ts` |
| v3 | `15f245e` | Login obrigatório + Google (web), motion system (motion.ts, OlliPressable, AnimatedEntrance), templates PDF, cor extraída da logo, voz nativa | `src/theme/motion.ts`, `src/utils/pdfGenerator.ts` |
| v3.5 | `7a4536b` | Radar de clientes sumidos + relatório do dia falado | `src/services/radarClientes.ts`, `relatorioDia.ts` |
| v4 | `46dbd65` | Plataforma web DESKTOP real: sidebar, dashboard, tabelas, agenda semanal, URLs reais | `src/screens/desktop/*`, `src/components/web/` |
| fix crítico | `f551ad8` | APK v6 crashava no boot (fast-png + TextDecoder latin1 no Hermes) — regra: testar APK no emulador `olli_phone` antes de entregar | memória `olli-hermes-emulador.md` |
| v5 | `9f85d7a` | Base HVAC 698 códigos de erro + `hvac_chunks` (IA aterrada em manuais), 40 correções de especialistas | `src/screens/CodigosErroScreen.tsx` |
| v6 | `fefd4cc` | Microfone na nuvem (Gemini), tela de erros v2, Google Agenda por flag, rota no Maps via deep-link | `src/services/vozNuvem.ts`, `googleAgenda.ts`, `rotas.ts` |
| fix raiz mic | `0fed0ef` | expo-image-picker com `microphonePermission:false` apagava RECORD_AUDIO do manifest | `app.json` |
| v7/v8 | `6f10453`, `c51d53c` | Bumps de versionCode | — |

## Onda 1 — Monetização (CONCLUÍDA)

Commit: `03ec66d` — "Onda 1 (monetizacao) + correcoes do gate: freemium que converte, Stripe 12x/Empresa".

- `usePlano()` — hook central de plano com cache AsyncStorage (evita piscar muro Pro no cold start). Evidência: `src/hooks/usePlano.ts`.
- `<GatePro>` — gate visual com preview real + CTA "Ver planos" + analytics `gate_visto`/`gate_cta`. Evidência: `src/components/GatePro.tsx`.
- `RECURSOS_POR_PLANO` — mapa único de entitlements em `src/services/planos.ts` (hoje `Set<Recurso>`; evoluir para chaves com limites — ver `PLAN_ENTITLEMENTS.md`).
- Cota de IA no grátis: 3 usos/mês, contador local (`IA_USOS_GRATIS_MES`, `olli.ia.usos.mes`), mensagem calorosa ao esgotar.
- Stripe: `pro mensal`, `pro anual`, `pro_12x` (mode=payment, `installments` habilitado no request, acesso 12 meses via `processar12x`), `empresa mensal/anual`. Webhook = fonte da verdade; `LOOKUP_PARA_PLANO` em `worker/src/stripe.js` (linhas 30–33, 268–316, 480+).
- PlanosScreen com 3 modos de preço; Empresa assinável (CTA checkout), WhatsApp secundário.
- Gates aplicados: relatórios (teaser borrado), radar (1 grátis + contagem), voz/chat (contador "2 de 3"), relatório do dia.
- Regra respeitada: criar orçamento/recibo/cliente/agenda NUNCA gateado.

Pendência humana da Onda 1: habilitar "installments" no dashboard Stripe + criar Prices com lookup_keys (`olli_pro_12x`, `olli_empresa_mensal`, `olli_empresa_anual`). Código pronto.

## Onda 2 — Multi-tenant / Modo Empresa (CONCLUÍDA)

Commits: `34db77b` (schema + fluxo empresa) — migrations `20260707_multitenant.sql` + `20260708_multitenant_fixes.sql` **aplicadas em produção**.

- Org como CAMADA sobre os dados do owner (sem big-bang para `org_id`): `donos_visiveis()` SECURITY DEFINER retorna {self} ∪ {owners de orgs onde sou membro ativo}. Usuário sozinho = single-tenant idêntico. Doc: `docs/multi-tenant.md`.
- Tabelas: `organizacoes`, `organizacao_membros` (papéis owner/admin/gestor/tecnico), `convites` (token + expiração), `localizacoes_equipe`, `acessos_equipe`. `criado_por` em `orcamentos`/`agendamentos`.
- Trigger `bloquear_troca_user_id()` (user_id imutável) + `aceitar_convite` não rebaixa owner + valida e-mail do convite.
- `worker/src/equipe.js`: convite server-side (JWT owner/admin) + página pública do convite.
- **RLS testada com 2 contas reais** (isolamento, exfiltração bloqueada). 4 HIGH do gate corrigidos e re-verificados.

## Integração da pesquisa V3 + PMOC (CONCLUÍDA)

Commit: `478ca6a`. Análise das 3 pesquisas → plano executável, sem instalar nada por impulso.

- `docs/TECHNOLOGY_RADAR.md` (veredito nosso por ferramenta), `docs/INTEGRATION_BACKLOG.md`, `docs/TARGET_ARCHITECTURE.md`.
- `src/services/ports/` — 13 interfaces de adaptador (Payment/Email/Maps/Fiscal/AI/…), 100% declarativas e aditivas (UI → caso de uso → porta → adaptador).
- `docs/PMOC_MODULE.md` + `supabase/migrations/20260709_pmoc_fundacao.sql` (esqueleto **NÃO-aplicado**): vertical HVAC/PMOC como track pós-ciclo-comercial.
- `KNOWN_BLOCKERS.md`: +B7 Sentry, B8 PostHog, B9 Gotenberg, B10 Asaas, B11 Nuvem Fiscal.

## Onda 3 — Ciclo comercial (CONCLUÍDA)

Commit: `a8e617c`. Migrations `20260708_portal_trilha.sql` + `20260708_versoes.sql` **aplicadas + testadas (RLS 4/4)**; worker deployado (`v 14e3ebd6`, smoke ok).

- **Portal do cliente v2** (`worker/src/link.js`): recusar com MOTIVO; TRILHA append-only (`eventos_orcamento_publico`) visualizado/aprovado/recusado com `ip_hash` (SHA-256 salgado, nunca o IP cru) — LGPD; GET carimba `visualizado_em`. Trilha owner-only, imutável (42501).
- **Versões** (`database.ts`, `clienteLink.ts`): regra de ouro 13.5 — editar proposta enviada congela a versão anterior. Fingerprint por **lista de exclusão** + stringify canônico (cobre formas de pagamento/PIX/fotos/subtotais). Numeração resiliente a merge (renumera no 23505, de-dup).
- **Status expandido** 6→10; filtros/pizza derivados de fonte única. Radar de parados passa a contar `visualizado`/`em_negociacao`.
- **Pagamento + recibo** (`pagamentos.ts`): estado financeiro derivado dos recibos + badge (aguardando/pago/recibo emitido); "Registrar pagamento" no aprovado; recibo pré-preenchido sem duplicar número.
- **Gate Fable**: 13 achados → 10 confirmados (1 HIGH + 3 MEDIUM + 6 LOW). HIGH (fingerprint incompleto — coração da feature) + 3 MEDIUM + 5 LOW aplicados; 1 LOW adiado (limpeza de versões órfãs na nuvem, protegido por RLS — follow-up).

## Onda 4 — Ordem de Serviço + app do técnico (CONCLUÍDA)

Commit: `2135b77`. Migration `20260710_ordens_servico.sql` **aplicada + testada (RLS 6/6)**; push main.

- `public.ordens_servico` no padrão multi-tenant (reusa `donos_visiveis()` + trigger `user_id` imutável + `criado_por` + check dos 6 estados). RLS testada com 2 contas: isolamento, acesso de membro em nome do owner, autoria carimbada (`criado_por=auth.uid()` barra autoria falsa), imutabilidade, status check.
- **Sync de primeira classe** (`cloudSync.ts`): `ordens_servico` no `SyncTable` — `TO_ROW`/`fromRow` (checklist/fotos array-ou-string), `localUpsert` com guarda anti-perda (`tsMaisNovo`), pull-no-login (`pullAll`), push com guard de timestamp (`pushAllLocal`), injeção team-tenant (`pushRowUnchecked` grava no tenant do owner), tombstone (`DELETABLE_TABLES`). Mirror auto-contido removido de `database.ts`. Recuperação: o agente que integrava caiu na metade (erro de infra) → integração completada à mão.
- **App role-aware** (`ordemServico.ts`, `OrdemServicoScreen.tsx`): gestão cria (de orçamento aprovado ou manual, com **dedupe** por `orcamentoId`)/atribui (`ver_agenda_equipe` inclui gestor)/muda status/vê todas; técnico vê só "Minhas OS" e executa (checklist com autosave, fotos, concluir) offline. Entrada mobile na `HomeScreen` ("Minhas OS" em destaque para técnico).
- **Gate Fable** (sync=0 achados): 1 CRITICAL (OS inacessível no celular do técnico — a UI só tinha entrada no SidebarNav desktop) + 1 MEDIUM (dedupe) + 1 LOW (permissão do gestor) + closure stale no checklist otimista — todos aplicados.

## Onda 5 — Plataforma web profissional (CONCLUÍDA)

Commit: `7e77d47`. Push main.

- **Entrada/landing** (`EntrarScreen.tsx` + `components/web/LandingHero.tsx`): deslogado no desktop, o domínio mostra uma página de produto (hero "Do orçamento ao recibo, sem planilha" + pilares de valor à esquerda, card de login à direita). Mobile inalterado; login/OAuth intacto (só a apresentação mudou).
- **Dashboard por conta + papel** (`desktop/InicioDesktopScreen.tsx` + `components/web/KpiCard.tsx`): dados REAIS clicáveis. Pessoal/autônomo (receita do mês, em aberto, contas a receber, taxa de aprovação, gráfico 6 meses); empresa (+ faixa de OS + OS por técnico); técnico (dashboard enxuto, sem receita/margem da empresa). Guard de papel evita piscar valores antes de resolver.
- **Menus** (`components/web/SidebarNav.tsx`): itens derivados de `usePermissao` + `useTipoConta` + `usePlano` — pessoal não vê Equipe; técnico vê menu enxuto; recursos pagos com cadeado→Planos.
- **Gate Fable**: 1 MEDIUM (receita agrupada por `criadoEm` em vez de `dataRecebimento` → pagamento retroativo no mês errado) **corrigido** (bucketiza por data de recebimento, meio-dia local, fallback `criadoEm`). 2 LOW viraram follow-up (campo `concluidoEm` na OS; KPIs abrirem lista já filtrada — exigem migration/param, desproporcional ao risco).

## Onda 7 — Orçamento/PDF elegante (CONCLUÍDA)

Commit: `5a4f4f7`. Push main.

- **Logo encaixada** (`utils/pdfGenerator.ts`): a "logo dividida em 2" era a logo renderizada duas vezes no modelo com capa (capa + cabeçalho) + largura fixa que achatava. Agora o header não repete a logo quando a capa já a mostra (guard cobre capa `'logo'` E `'foto'`), com `object-fit:contain` + max-w/max-h → logo inteira, sem distorção, em qualquer proporção.
- **Capa** (`o.capaEstilo`/`o.capaFotoUri`): `'logo'` (marca), `'foto'` (foto de capa escolhida, fallback 1ª foto→logo) ou `'nenhuma'`. `Step4Personalizacao` deixa escolher/anexar a foto; **preview real** (`PdfPreviewModal`) byte-idêntico ao envio.
- **Marca OLLI removível**: rodapé discreto no grátis, removível no Pro/Empresa via novo entitlement `remove_olli_brand` (`planos.ts` + `GatePro`). PIX/validade/dados do prestador nunca saem — só a marca. Call sites passam `removerMarca=temAcesso('remove_olli_brand')`.
- **Modelos**: guardas de overflow (nomes longos, muitos itens/fotos, valores grandes, acentos, `page-break-inside:avoid`). ADR-0007 (Gotenberg POC servidor) + porta `DocumentRenderer`.
- **Fixes de integração**: `GatePro.COPY_RECURSO` faltava `remove_olli_brand`; `pickFoto` do Step4 substituía a lista (perdia fotos ao anexar a 2ª) → mescla. **Gate Fable**: 1 HIGH (capa-foto duplicava a logo no header — o próprio fix da logo abriu novo caminho de duplicação) **corrigido**.

## Onda 10 — Motion / dar vida ao app seco (CONCLUÍDA)

Commit: `e415892`. Push main.

- **Hoje/Agenda/Conta** (`HojeScreen`, `AgendaScreen`, `ContaScreen`): entrada escalonada dos cards/blocos, feedback tátil (`OlliPressable`) nos itens tocáveis, skeletons fiéis ao layout real (sem salto skeleton→conteúdo), empty states com vida, micro-animação de sucesso moderada ao concluir. Reusa o motion system existente (zero libs novas), com moderação ("movimento explica mudança de estado, não purpurina").
- **Reduced-motion no app inteiro** (`theme/motion.ts` + `components/AnimatedEntrance.tsx`): novo hook `useReducedMotion()` (iOS/Android "Reduzir movimento" + `prefers-reduced-motion` no web via RNW); `AnimatedEntrance` renderiza direto no estado final quando ativo — atende ao pedido de respeitar reduced-motion de uma vez, para todas as telas que usam `AnimatedEntrance`.
- **Gate Fable**: 2 findings, ambos LOW e explicitamente não-bloqueantes (gate PASSA). A re-animação da agenda ao navegar fica coberta pelo reduced-motion; o role de checkbox para leitor de tela (`OlliPressable` a11y) virou follow-up.

## Track PMOC — Fase 1: inventário HVAC + etiqueta QR (CONCLUÍDA)

Commits: `f54c212` (WIP) + fix do gate. Push main. **A maior aposta comercial** (receita recorrente / retenção — "quem cadastra centenas de equipamentos não volta pra planilha").

- **Fundação** `20260709_pmoc_fundacao.sql` **aplicada + RLS testada 4/4** (assets, asset_qr_tokens, qr_scan_events, service_contracts, pmoc_plans + versões; multi-tenant via `donos_visiveis()`, `user_id` imutável, versões de contrato/plano congeladas após assinatura). QR opaco (`gen_random_bytes(24)` base64url ~32 chars, UNIQUE, revogável). `20260711_assets_fotos.sql` (coluna `fotos` jsonb).
- **Inventário** (`equipamentos.ts` + `EquipamentoScreen` + `database.ts`): cadastro HVAC (categoria/fabricante/modelo/série/BTU/tensão/refrigerante/local/criticidade/fotos), offline-first. **Sync de 1ª classe** — `equipamentos` (local) ↔ `assets` (nuvem) via `REMOTE_TABLE` no cloudSync; o `qr_token` opaco é gerado pelo banco e só preservado pelo app (omitido no 1º insert, backfill no pull).
- **Porta física QR** (`worker/src/pmoc.js`, deploy `v4e5a8819`): `GET /q/<token>` página pública LGPD-safe (só prestador+código+categoria+situação+contato; nunca cliente/endereço/contrato/valores); revogado e inexistente indistinguíveis; `qr_scan_events` sem IP cru (hash salgado com segredo fixo do worker); QR image `/q/<token>.svg` gerado em JS puro (round-trip verificado).
- **Gate Fable**: 1 CRITICAL (`id: parcial.id ?? generateId()` — `??` não pegava `''` → todo equipamento salvo com id vazio, colapso do inventário), 1 HIGH (rate-limit anti-enumeração inerte por salgar o hash com o token), 1 MEDIUM (push zerava revogação de QR) — **todos corrigidos**.

## Bloco A — Lixeira, assinatura, ajuda, landing/SEO, legal, modo técnico (CONCLUÍDO)

Força total: 7 frentes de construção + 2 gates adversariais + 5 frentes de correção. 42 arquivos.

### O que entrou
- **Lixeira real** (`lixeira.ts`, `LixeiraScreen`, `database.ts`): `excluido_em` em 10 entidades. Excluir = mandar pra lixeira (retenção 30 dias, restaurar item a item, excluir de vez, expurgo automático no boot). Antes a exclusão era permanente e escondida. Migrations `20260713_lixeira.sql` + `20260714_atualizado_em.sql` (aplicadas).
- **Assinatura** (`AssinaturaScreen`, `assinatura.ts`, worker `/stripe/faturas|/stripe/metodo`): valor, ciclo, próxima cobrança, histórico de faturas, cartão (bandeira+last4), cancelar pelo portal. `ContaScreen` sem venda para quem já paga. Foto de perfil.
- **Excluir minha conta** (`conta.ts`, `worker/src/conta.js`): exigência da Apple e da LGPD. Cancela a assinatura na Stripe **antes** e só então apaga `auth.users`; se o cancelamento falhar, não apaga nada (502 retryável).
- **Central de Ajuda** (`AjudaScreen`, `content/ajuda/`) + onboarding com liga/desliga.
- **Landing + SEO** (`LandingScreen`, `LandingSecoes`, `public/index.html`, `robots.txt`, `sitemap.xml`, `seoWeb.ts`) e **Legal** (Privacidade/Termos).
- **Modo técnico** (`TecnicoHomeScreen`, `GuardaPapel`): no APK o técnico tem home de campo, sem aba de orçamento, sem financeiro.

### Gate 1 (5 dimensões) — 4 HIGH + 6 MEDIUM, todos corrigidos
Cada achado era um **comentário prometendo uma invariante que o código deixara de garantir** quando soft-delete e papéis entraram:
- **Ressurreição de item excluído** (`cloudSync.ts`): 6 tabelas (clientes/servicos/produtos/modelos/depoimentos/recibos) não tinham `atualizado_em`. Excluir offline → `mirrorPush` falha → o pull da linha ativa zerava o `excluido_em` local. **Correção estrutural**: relógio de sync nessas 6 tabelas (nuvem + SQLite v3), guards nos dois sentidos. "Exclusão sempre vence" foi rejeitado: tornaria a exclusão estado absorvente e desfaria o Restaurar.
- **Deep link público descartado** (`App.tsx`): o `onReady` tratava toda rota ≠ `initialRoute` como protegida → Privacidade, Termos, Ajuda e Planos eram inalcançáveis por URL. `ROTAS_PUBLICAS`.
- **Pro 12x rebaixado** (`worker/src/stripe.js`): a linha do 12x tem `stripe_subscription_id: null`, e `null && ...` fazia o guard pular exatamente a linha que ele devia proteger. Um `deleted` da mensal antiga cancelava quem pagou R$468.
- **Papel indeterminado = permissões de dono** (`usePermissao`/`useTipoConta`/`equipe.ts`/`AppNavigator`): `getMinhaOrganizacao` devolvia `null` em erro de rede, e `null` caía na matriz `pessoal` — a mais permissiva. Técnico offline via faturamento a sessão inteira. Agora: `carregarMinhaOrganizacao` distingue erro de ausência; `resolvido` fail-closed; cache do papel amarrado ao `userId`; Home neutra enquanto carrega.
- MEDIUM: número de OS colidindo com OS na lixeira; conta apagada com assinatura viva; técnico alcançando financeiro por deep link; ferramentas de dono na aba Conta do técnico; landing vendendo "equipe" como pronta (a tela de compra dizia "em breve"); artigo de ajuda negando a existência da Lixeira.

### Gate 2 (sobre as próprias correções) — 3 HIGH + 1 MEDIUM, todos corrigidos
Correção errada é pior que o bug, porque cria a ilusão de resolvido:
- **Guard fail-closed era código morto** (`conta.js`): o arquivo tem seu *próprio* `getAssinatura`, que retorna `null` em erro — não `{error:true}`. A cobrança órfã seguia possível, agora com um comentário jurando que não.
- **Exclusão de conta travada para sempre**: a Stripe responde `400 subscription_already_canceled` (não 404) para quem já cancelou, e o `deleted` mantém o `subscription_id` na linha. Quem cancelou pelo portal nunca mais conseguiria apagar a conta.
- **Upgrade legítimo descartado**: ao alargar o guard (b) para a linha avulsa, todo evento de subscription virou "outra origem". Quem tinha 12x e assinasse Empresa pagaria R$99/mês e receberia Pro. Agora só eventos de **término** são ignorados; um evento **ativo** grava a subscription nova preservando o maior nível e a maior vigência.
- MEDIUM: `/conta/excluir` dividia balde de rate-limit com `/stripe/portal` — retentar a exclusão derrubava o botão Cancelar.

Dois bugs eu achei nas minhas próprias correções antes do gate: `auth.getUser()` (rede) no lugar de `getSession()` (disco), que faria o fix offline falhar exatamente offline; e `!assinatura.error` reabrindo a cobrança órfã.

**Raiz comum de três bugs da onda**: colapsar o estado de *erro* no estado *vazio* (`erro → null → "não tem" → permitido`).

### Verificações
`npx tsc --noEmit` exit 0 · `node --check` nos 4 arquivos do worker · migrations aplicadas e idempotentes (backfill `atualizado_em = criado_em`, zero nulos) · semântica de soft-delete testada na nuvem (exclusão offline sobrevive ao pull; restaurar mais novo vence) · varredura confirmando que toda escrita nas 5 tabelas de coluna carimba o relógio · 7 cenários de webhook Stripe simulados contra a lógica real · worker deployado (`705a60c7`) e smoke verde (4 rotas novas em 401 sem auth).

## Track PMOC — Fase 2: periodicidade + ordens recorrentes (CONCLUÍDA)

Migration `20260715_pmoc_fase2.sql` **aplicada** (idempotente; RLS 4 policies; isolamento entre donos testado). SQLite ganhou `pmoc_planos`, `pmoc_plano_versoes`, `pmoc_ordens_geradas`; as três sincronizam pelo `cloudSync` (guards de relógio + injeção do tenant do dono).

- **A idempotência mora no BANCO.** Índice `UNIQUE (plano, equipamento, período, periodicidade)` nas duas pontas. Testado 5/5 na nuvem: a 2ª geração do mesmo período é barrada; período e periodicidade distintos passam. Sem isso, dois aparelhos gerando "a manutenção de julho" mandariam o técnico duas vezes ao mesmo endereço.
- **Períodos alinhados ao calendário, sem âncora.** `2026-07` / `2026-B4` / `2026-T3` / `2026-S2` / `2026`, extraídos em UTC. Se o rótulo dependesse de uma data de início, dois aparelhos calculariam rótulos diferentes para a mesma visita e a chave de idempotência não casaria. 17/17 testes da matemática pura (bissexto, virada de ano, ano cruzado, frequência desconhecida → `[]` sem lançar).
- **Reserve, depois construa.** A OS só nasce se a reserva no livro-caixa pegou. O caminho ingênuo (criar OS → registrar) deixaria OS órfã quando a reserva colidisse.
- **Caveat legal respeitado.** Periodicidades, atividades e referências normativas vivem no jsonb versionado da versão do plano, nunca em coluna ou constante. `frequencia` é `string` validada em runtime (uma union type seria constante de código disfarçada: mudar a norma exigiria republicar o app). A dimensão legal/permissão do gate voltou **limpa** — nenhuma afirmação de conformidade, técnico barrado por `GuardaPapel` em tela e rota.

### Gate (3 dimensões) — 1 HIGH + 2 MEDIUM + 2 LOW, todos tratados
- **HIGH — reserva órfã (crítica ao MEU desenho).** `registrarOrdemGerada` faz commit e espelha na nuvem ANTES de `criarOSManual`. Se a criação da OS falhasse depois (SQLITE_BUSY com o sync concorrente, ou o SO matando o app em background), sobrava reserva sem OS — e a tentativa seguinte via `false`, contava "já existia", e a visita **nunca** ganhava ordem. Eu tinha trocado um órfão por outro. Corrigido com um **reconciliador**: snapshot das reservas antes do laço e, no `false`, pergunta o estado real (OS ativa → já existia; na lixeira → não ressuscita; tombstone → não recria; ausente → reconstrói com o id reservado). Reusar o id é seguro justamente porque não há tombstone — e é o token que faz dois aparelhos convergirem para uma única OS.
- MEDIUM: teto de 24 períodos truncava em silêncio (agora conta `omitidas` e a tela avisa); OS excluída bloqueava a regeração para sempre (agora distingue lixeira de exclusão definitiva).
- LOW: rótulo do read-view vs versão de trabalho; copy "nunca cria visita futura" contradizia a OS do período em andamento.

### Re-gate sobre as próprias correções — **PASSA**
Nenhum critical/high/medium. Confirmou o ponto que mais importava: `getOrdemServico(id)` não filtra soft-delete, então o reconciliador enxerga a OS na lixeira e **não** desfaz uma exclusão deliberada. Restaram 3 notas LOW de robustez (uma delas — guarda de `ordemId` vazio, o velho `?? vs ||` — foi fechada na hora).

## Sign in with Apple + dicas contextuais + SEO por rota (CONCLUÍDO)

### Sign in with Apple (exigência da Guideline 4.8, não escolha nossa)
`src/services/appleAuth.ts`, `src/components/BotaoApple.tsx`, `EntrarScreen`, `app.json` (plugin + `ios.usesAppleSignIn`), `expo-apple-authentication` e `expo-crypto` no SDK 56.

- **iOS apenas.** `expo-apple-authentication` não suporta Android nem web, então o módulo é resolvido com `require` preguiçoso atrás de guarda de plataforma — import estático quebraria o bundle do APK. Fora do iOS o botão renderiza `null`.
- **Anti-replay com nonce.** O SHA-256 vai para a Apple (vira claim no `identityToken`); o valor CRU vai para o `signInWithIdToken`, que hasheia e compara. Verificado na tipagem instalada (`auth-js/types.d.ts:586`), não num resumo de doc — o resumo dizia "cru para os dois", o que faria o login falhar SEMPRE.
- **Gate: 1 HIGH.** O nome vindo da Apple era gravado em `user_metadata.nome`, e o app inteiro lê `full_name` (`supabase.ts:53`, `ContaScreen:181`, `admin.js:126`). Como a Apple só manda o nome na PRIMEIRA autorização, ele sumiria para sempre. Corrigido.
- **Falta 1 passo humano** (não precisa da conta paga): Supabase → Authentication → Providers → Apple → habilitar e colar `online.olliorcamentos.app` em Client IDs. Para login nativo é só isso. **Não dá para testar** antes da conta Developer: a entitlement exige provisioning profile.

### Dicas contextuais — o toggle finalmente controla alguma coisa
`DicaContextual` existia, o serviço rastreava dicas dispensadas, o toggle estava na Conta — e o componente **nunca era renderizado**. Um gate anterior classificou como LOW e só corrigiu o rótulo do switch: ficou honesto e continuou inútil. Agora há 6 dicas (Home, Orçamentos, Agenda, Clientes, Equipamento, TecnicoHome), o componente reavalia no foco (desligar o toggle some com a dica na hora) e a do técnico não cita financeiro.

### SEO por rota
`aplicarSeo` agora escreve `title`, `description`, `canonical` **e** `og:*`/`twitter:*`, chamado nas 4 rotas do `sitemap.xml`. Sem as Open Graph, indexar `/planos` como página própria não adiantaria: o cartão compartilhado continuaria o da home.

### Gates — 4 HIGH, todos de TEXTO QUE MENTE
Este repo já mentiu três vezes em copy. Voltou a mentir, duas delas por minha mão:
- **`/planos` (meu texto):** "o Pro libera orçamentos ilimitados" — o **Grátis** já os inclui (`PLANOS_BASE:88`); "o Empresa acrescenta os recursos de equipe" — a própria tela marca "(em breve)"; "cancele direto no app" — o cancelamento abre o portal externo da Stripe.
- **`/` (copy antiga promovida a meta description):** "ordem de serviço com fotos e **assinatura**" — a interface `OrdemServico` não tem campo de assinatura (quem assina é o orçamento); e "**equipe**", que a tela de compra marca "(em breve)".
- **Dica do equipamento:** prometia "ficha e histórico" — a página `/q/<token>` mostra de propósito só identificação e contato; e prometia QR imediato, quando o `qrToken` só é gerado no primeiro sync.
- **LOW:** wrapper de dica com `paddingTop` deixava um vão permanente depois do "Entendi" (um `View` sem filho ainda ocupa o padding).

**Lição registrada:** copy que descreve o produto tem que ser DERIVADA da fonte de verdade lida na hora (`PLANOS_BASE`, `types/index.ts`), nunca escrita de memória. E promover copy de posicionamento a `<meta name="description">` muda o padrão de qualidade dela: deixa de ser tom de marca e vira declaração factual ao Google.

## Queda de produção (auto-infligida) + PDF que aprova (2026-07-10)

### O incidente
Depois de trazer o worker órfão `olli-site` para o repositório e publicar, **toda leitura de banco do `olli-diagnostico` passou a devolver 503**. Causa: o Workers Build por Git republica o worker a cada push na `main`, e `wrangler deploy` **apaga as vars de texto do painel** antes de aplicar as do `wrangler.jsonc` (`keep_vars` é `false` por padrão). Os segredos moravam como vars de texto. `wrangler secret list` devolveu `[]`.

Restaurados os segredos:

| segredo | como voltou |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Management API do Supabase, `?reveal=true` (exige `User-Agent` de navegador) |
| `STRIPE_SECRET_KEY` | cofre local |
| `ADMIN_EMAIL` | **não é segredo** — `admin.js:28` já usa `igoreluisa@gmail.com` como default; setei a var pelo mesmo valor |
| `GEMINI_API_KEY` | `gcloud services api-keys get-key-string` — chaves novas do Google começam com `AQ.A`, não `AIza` |
| `STRIPE_WEBHOOK_SECRET` | **irrecuperável**: a Stripe só devolve o `secret` na criação. Endpoint recriado (`we_1TrWMD…`), o antigo apagado |

Enquanto faltou o `STRIPE_WEBHOOK_SECRET`, `handleWebhook` rejeitava **todo** evento com `400 assinatura_invalida` — falha fechada, correta por desenho, mas o estado das assinaturas parou de ser atualizado em silêncio. Era um bug de dinheiro.

**Verificação (5/5, contra produção):** assinatura válida → `200 {ok:true}`; segredo errado, timestamp fora dos 300s de replay, header ausente e `v1` truncado → `400 assinatura_invalida`. Vetor de teste: evento de tipo inexistente, que atravessa a verificação e cai fora de todos os `else if` sem escrever no banco. `GET /` responde `{"ia":"on"}`.

### A queda voltou — porque eu deduzi em vez de testar (2026-07-10, à tarde)
Declarei o problema estrutural "resolvido" com a tese **"secrets sobrevivem a `wrangler deploy`, então o Workers Build por Git deixou de ser perigoso e não deve ser desativado"**. A tese vem da documentação do Cloudflare. **A realidade a refutou**: cada push na `main` derrubou o worker de novo (3× no dia — versões 109/110/111), e cada `wrangler deploy` de restauração **apagou os secrets**. O `GET /` passou a servir o HTML do site (o build publica um worker de *assets*, sem módulo JS nem bindings), o webhook virou 404, e as assinaturas pararam de novo.

**Correções de fato:**
- **Ordem de restauração:** `wrangler deploy` PRIMEIRO, secrets DEPOIS (o deploy os apaga). Esperar ~30s de propagação antes de concluir que a assinatura falhou.
- **O passo humano é real e obrigatório:** desativar o Workers Build por Git do `olli-diagnostico` no dashboard. A API de builds recusa o token (`401`), então não há automação possível. Enquanto não for desativado, **todo push na main derruba pagamento**.
- `keep_vars` não resolve: o problema não são as vars (voltam do `wrangler.jsonc`), são os secrets, que o deploy zera.
- Memória `olli-cloudflare-git-integracoes` corrigida com a receita completa. **Lição:** "a doc diz que sobrevive" não é o mesmo que "sobrevive" — este repo já me puniu por colapsar dedução e teste.

### PDF que aprova — `1375de7`
Botão de verdade dentro de PDF não é viável (AcroForm+JS bloqueado por WhatsApp, Quick Look do iOS, Gmail e visor do Chrome; e o `expo-print` no iOS descarta até hyperlink). Entregue: dois QR codes, "Aprovar" e "Recusar", em **SVG inline** (o iOS descarta `data:image/svg+xml` em `<img>`), gerados por `src/utils/qrcode.ts` — TS puro, sem dependência nova, funciona offline.

`?acao=` **só pré-seleciona**. `GET` nunca muta estado: um fetcher de preview de link do WhatsApp ou do Slack aprovaria o orçamento sozinho. A URL vai impressa embaixo de cada QR, para papel fotocopiado e leitor que não lê SVG.

### Tema: a fundação encostou na UI
70 arquivos migrados de `Colors` estático para `useEstilos`/`useCores`. O gate adversarial da própria migração achou dois HIGH sistêmicos, ambos da mesma raiz — **a cor foi escolhida pelo nome, não pela pergunta "o que está atrás deste texto?"**:

- **Tinta fixa sobre preenchimento que muda com o modo.** `#0A1626` cravado sobre `c.accentLight`. `accentLight` é token de *primeiro plano*: no claro ele escurece (`#34C6D9` → `#197884`) para contrastar com branco. Tinta escura por cima dá 3.51:1 no claro e 8.85:1 no escuro — por isso ninguém viu. Atingia CTAs primárias (FAB "Agendar visita", "Convidar para a equipe", selo "OLLI PRO").
- **Token de preenchimento como primeiro plano.** `color: c.accent` (marca pura, sem ajuste) sobre superfície clara: 2.05:1.

Achados meus, no mesmo gate:

- **`OlliButton`** pintava o rótulo com `cores.onSurface` — o texto da *superfície do app*, não o do *botão*. No app dark-only os dois coincidiam; no modo claro todo botão preenchido caiu para 3.41–3.72:1. Agora `textoSobre(bg)`, e o gradiente traz a própria cor.
- **`gradientes.header` no escuro** é azul-marinho fixo, mas o texto vinha de `onPrimary`, derivado da *marca*. Marca clara ⇒ tinta escura sobre marinho ⇒ **1.10:1**, invisível.
- **Cor de marca personalizável quebrava o hero e o header.** `#fff` cravado sobre `gradientes.primary`: 1.05–2.53:1 para marcas claras (8 de 14 combinações medidas).

Raiz consertada em `src/theme/cores.ts`: um gradiente é uma superfície **contínua**, então as duas pontas precisam do mesmo texto. `parLegivel(a, b)` ancora a decisão na primeira ponta (a identidade) e empurra as duas em luminosidade até 4.5:1; matiz e saturação não se movem. `Gradientes` ganhou `sobrePrimary`, `sobreHeader`, `sobreBrand`.

**Prova:** 5 marcas × 2 modos × 3 gradientes ⇒ **0 pares abaixo de 4.5:1** (antes: 8 falhas só em `primary`). A marca padrão saiu **byte a byte idêntica** em `primary` e `header`. Único pixel que mudou: a ponta `accent` do gradiente dos botões, `#34C6D9` → `#1A808D` — dívida que já estava em produção (branco sobre ciano = **2.05:1**, reprovado hoje). O ciano segue vivo em `accent`, `frost`, aba ativa e `glowCyan`.

### Web deixou de ser celular
Dois culpados, ambos removidos:
- `App.tsx` aplicava `maxWidth: 430` sempre que a janela tinha menos de 1024px — um telefone desenhado no meio do navegador.
- `comCentroDesktop` embrulhava as telas em uma coluna de **560px com bordas laterais** — a largura e a moldura de um aparelho. Virou página web: 1100px, respiro lateral, sem bordas. As 29 telas do navigator seguem intactas (o nome exportado não mudou) e o pass-through no nativo continua sendo identidade — **zero efeito no APK**.

### O gate mecânico, e os três defeitos que ele não via
A regra virou código: `scripts/checar-contraste.mjs`, ligado ao `npm run preflight`.

1. **Lint estático** dos defeitos [A] `accent` como cor de texto e [B] tinta cravada sobre fill do tema. Exceção legítima se declara **na própria linha** (`// contraste-ok: <fundo> — <razão> (<razão medida>:1)`); uma lista de exceções em arquivo separado apodrece, um comentário na linha some junto com a linha. Ficaram 14 exceções, todas com número medido — duas verificadas por mim de forma independente.
2. **Prova da paleta**: as 12 cores do seletor × 2 modos × 4 superfícies × 6 tokens + as duas pontas dos 3 gradientes com texto. Pior par de todas: exatamente 4.50:1.
3. **O acoplamento invisível**: existem 92 `#fff` cravados sobre gradientes de marca. Eles só estão corretos porque toda cor oferecida é escura o bastante para `textoSobre` devolver branco. O gate agora falha o build se alguém acrescentar uma cor clara ao seletor. Verifiquei injetando `#FFD700`: o gate rejeita e sai com 1.

**Consertos de raiz na paleta:** `primaryLight`, `accentLight`, `success`, `danger`, `warning` e `plan` eram ajustados contra o `background` — o fundo mais **fácil**. São pintados sobre `surface` e `surfaceElevated`, que no escuro são mais **claras** que o fundo. `danger` como texto sobre um card dava 3.43:1. Agora o ajuste é contra a superfície mais difícil (a mais clara no escuro, a mais escura no claro): 15/15 cores candidatas passam, contra 11/15 antes.

**Três defeitos que o gate não via, achados por outros meios:**
- **Setas do cabeçalho da Agenda a 1.03:1.** `accentLight` (token de *superfície*) pintado sobre o gradiente de marca. O conserto do gate anterior tinha sido perdido quando um workflow foi morto; descobri comparando um `.tmp` que um agente esqueceu no disco. Nem `tsc` nem gate acusavam.
- **`SincronizandoPill` divergiu em 6 cópias.** Quatro consertadas, duas esquecidas com 2.88:1. Achado por comparação entre as cópias, não por lint.
- **Comentário depois de `/>` vira texto na tela.** Eu mesmo cometi ao anotar uma exceção: em posição de filho do JSX, `//` não é comentário. O `tsc` cala. Virou a terceira regra do lint, hoje em zero.

**Adversarialidade que pagou por si:** os céticos acharam a **inversão** do defeito — aplicar `accent → accentLight` sobre uma pílula de fundo escuro fixo *cria* o bug que a regra existe para matar (no claro `accentLight` escurece para `#197884` e cai a 2.9:1). Quatro sítios corrigidos no sentido oposto.

**Seletor entregue.** `ContaScreen` → "Aparência": interruptor de modo escuro (com anúncio para leitor de tela — trocar paleta não muda o foco nem a árvore de acessibilidade) e 12 amostras de cor. `OlliPressable` passou a encaminhar `accessibilityRole` e `accessibilityState`, que engolia: uma amostra selecionada era indistinguível para quem não enxerga a borda.

## APK v1.1.0 testado no emulador (2026-07-10)

**BUILD SUCCESSFUL**, 100,8 MB, `online.olliorcamentos.app`, versionCode 9. Assinado com a chave de **debug** — instala e roda, mas a Play Store recusa; o artefato da loja é um AAB com a chave de upload (dia 20).

### Emulador `olli_phone` (Android 15, x86_64)
- Boot sem `FATAL EXCEPTION`, sem `SIGABRT`, **zero** erro de `ReactNativeJS`. Mesmo PID depois de 8s: não houve crash-restart.
- **Zero** ocorrência de `Unknown encoding`/`latin1` — o crash que matou o v6.
- Abre no **modo claro**: fundo `#F5F7FA` e `#EDF1F6` amostrados do screenshot.
- Forçando `olli.tema.v1 = {escuro, #B45309}` no AsyncStorage (via `adb root`), o **modo escuro** e a **marca Terracota** renderizam: fundo `#07111F`, gradientes recalculados, sem crash. As duas features que o dono pediu, provadas no aparelho.

### O que só a tela mostrou
`tsc` verde, gate verde, 68 agentes, e mesmo assim a **primeira tela do app** tinha a tagline "Orçamentos que fecham negócio" a **2,36:1** — medido nos pixels do screenshot. A partir daí caíram três famílias inteiras, todas da mesma raiz.

| família | o que era | pior caso | onde |
| --- | --- | --- | --- |
| 3ª — token de superfície sobre gradiente | `accentLight` sobre a marca | **1,03:1** | setas da Agenda, tagline do login, ícones da landing |
| 4ª — `rgba(...)` cravado como texto | branco translúcido sobre gradiente | **1,06:1** | **hero da Home** (8 de 8 elementos), Onboarding, StepIndicator |
| 5ª — matiz de categoria como texto | `#2BD787` = "limpeza" | **1,72:1** | chips de tipo de agendamento (8 de 12 pares, dois no escuro) |

O hero da Home merece destaque: ele não usa gradiente do tema, e sim um véu literal `rgba(11,111,206,0.38)` sobre `background`. No escuro o composto é escuro e o texto claro funciona; no claro vira `#9CC3E9` → `#E6F3F7` e **o título ficava branco sobre branco**. Oito de oito passavam no escuro — por isso ninguém viu.

O conserto perdido das setas da Agenda só apareceu porque um agente esqueceu um `.tmp` no disco e eu comparei os dois arquivos. Nem `tsc` nem gate acusavam.

### Ferramentas novas, cada uma provada antes de usada
- **`sobreSecundario(sobre, pontas)`** — texto secundário sobre gradiente. **Alfa fixo não pode ser seguro**: branco opaco sobre o azul mede 5,02:1 (dez por cento de folga) e sobre o vermelho 4,83:1. Um `comAlfa(sobreHeader, 0.82)` cravado — que **eu** escrevi — derruba a ponta clara para 3,90:1. A função sobe o alfa a partir do ideal até as duas pontas passarem: **0 de 48** combinações reprovam.
- **`achatarVeu(base, veu)`** — compõe `rgba` sobre base opaca. `contraste()` só lê hex; medir contra o véu, ou contra a base, dá as duas respostas erradas.
- **`corCategoria` / `corCategoriaEmChip`** — ajusta a **luminosidade** do matiz contra o fundo real (inclusive o próprio matiz a 13%, que é o fundo do chip). O matiz, que é o significado, não se move. **8/12 → 0/12**. Nenhum hex estático resolveria: `#64748B` passa no claro (4,76:1) e reprova no escuro (3,37:1).

### O gate aprendeu três regras
`rgba(...)` como cor de texto; `comAlfa(gradientes.sobreX, <fixo>)`; e **`//` depois de `/>`**, que em JSX está na posição de filho e **renderiza como texto** — eu mesmo cometi ao anotar uma exceção, e o `tsc` cala.

### Dois bugs de build
- **`expo-asset` faltando.** É peer de `expo-audio` e o `expo-doctor` avisava: *"your app may crash outside of Expo Go"* — ou seja, exatamente no APK. Agora 21/21.
- **`clienteLink.base64url` devolvia lixo silencioso.** O ramo final entregava a string **binária crua** como se fosse base64 quando `btoa` e `Buffer` faltassem — sem lançar. Nem o RN 0.85 nem nenhuma dependência instalam `btoa` (verificado varrendo `node_modules`), então o ramo dependia do motor. Esse token é a **única** proteção do link que expõe o orçamento ao cliente, e é o mesmo que o QR do PDF carrega. Reescrito em ES puro e provado contra o `Buffer` do Node: comprimentos 0–64, casos de borda, exaustivo em 1 e 2 bytes.

## Pedido do dono: nav-bar, motion, filtros, relatório, modelos (2026-07-10)

Seis frentes a partir de um pedido único, cada uma commitada e provada (tsc 0, gate verde).

**A barra de gestos comia o conteúdo.** No aparelho do dono (navegação virtual), FAB, rodapé e fim das listas ficavam SOB os botões do Android — Catálogo, Diagnóstico "e em todas as abas". `useSafeAreaInsets()` em 11 telas: `paddingBottom` das listas passou a somar `insets.bottom`, FABs sobem `insets.bottom+N`. Web não pega isso; só se vê no aparelho.

**"Efeito uau" derivado do 21st.dev, reimplementado em RN.** O catálogo do 21st.dev é web (shadcn/Framer) — não roda no app; virou referência. Saíram `AuroraBackground` (orbes animados, `useNativeDriver`, estático no reduced-motion, `blur` só na web) no hero da landing/login e no onboarding, e `Revelar` (reveal-on-scroll por `measureInWindow`, fade+translate, instantâneo no reduced-motion) na landing. Perfil generic-saas: zero canvas/WebGL atrás de formulário ou tabela.

**"Não gostei desses filtros" (Diagnóstico).** Duas queixas reais: Crítica e Alta eram o **mesmo vermelho** (`c.danger`), e o filtro não dizia quantos casos havia. Severidade virou eixo de tema (`sevCritica/sevAlta/sevMedia/sevInfo`, rampa de 4 matizes ajustadas a 4,5:1 nos dois modos) e ganhou **contagem ao vivo** (`countCodigosErroPorSeveridade`) — vira triagem. Verifiquei contra o dataset: `Crítica/Alta/Média/Info` = 30/370/293/5, batem com os rótulos → zero "erro vira vazio".

**Onde o dono vê feedback e erros: a caixa de entrada.** Antes, o formulário da Ajuda só abria `mailto` — não guardava nada. Agora: tabela `public.feedback` (RLS insert-only-own, sem policy de select → só `/admin` lê via service_role), `services/feedback.ts`, captura GLOBAL de erro JS (`errorReport.ts`: `ErrorUtils` no Hermes + `window.onerror` na web, defensivo, deduplicado, teto por sessão) gravando tipo 'erro', e a seção "Feedback & Erros" no painel `/admin` com filtros/resolver. Caminho provado ponta a ponta: insert do usuário 201, leitura do usuário negada pela RLS, admin vê tudo.

**Relatório diário com nota manual.** `RelatorioDia.nota` mora dentro do snapshot (blob), sincroniza pelo mesmo LWW de `relatorios_diarios` — sem coluna nem sync novo. A pegadinha: o relatório é um cache recomputado por aparelho e re-salvo a cada foco; `gerarRelatorioDia` agora **preserva a nota** ao regenerar (padrão recompute-but-preserve), senão um foco/sync a apagaria. Card "Como foi o dia?" editável, visível até em dia parado, aparece no histórico e no falar/compartilhar.

**Modelos de documento em Conta → Ferramentas.** Os 7 templates já existiam (escolha por-orçamento no Step4); faltava o **padrão global**. `empresa.modeloPdfPadrao` (schema-less), herdado por `emptyOrcamento`. Tela nova com os 7 modelos e **prévia REAL** (mesmo `PdfPreviewModal`/HTML do envio, orçamento fictício na cor de marca do dono). Salvamento otimista com reversão em falha. Recibo segue com layout compacto próprio — modelos alternativos ficaram em `FOLLOWUPS` (#28).

## Entrega: recibo multi-template, revisão adversarial, main no ar, APK testado (2026-07-10)

O dono pediu "faça tudo e me entrega o app pronto, força total". Fechei o pedido inteiro.

**Recibo multi-template (FOLLOWUP #28, fechado).** O recibo cravava `#0B6FCE` — NÃO seguia a marca (a nota que a tela de Modelos dizia o contrário era falsa). Extraí `montarHtmlRecibo` para `utils/reciboPdf.ts`, brand-aware, 3 modelos (clássico/compacto/faixa), e a tela de Modelos ganhou a seção de recibo com prévia real (via `PdfPreviewModal` generalizado com `construirHtml`).

**Revisão adversarial antes do merge** (workflow de 13 agentes: revisar por dimensão → cético refuta cada achado; 1.5M tokens, ~14 min). 5 confirmados, todos corrigidos e reverificados:
- **[HIGH] Perda silenciosa da nota do dia entre aparelhos** (bug classe e). A nota autoral vivia no snapshot recomputado e re-salvo com `criado_em=now()` a cada foco; um aparelho que só VISUALIZA gerava um carimbo mais novo (sem nota) que vencia o LWW e apagava a nota escrita em outro. Fix: carimbo autoral próprio (`notaEm`), separado do `criado_em` do snapshot; a visualização preserva `criado_em`; o pull faz MERGE POR CAMPO (números por `criado_em`, nota por `notaEm`).
- **[HIGH] XSS no recibo.** `recibo-${modelo}` interpolava `modeloReciboPadrao` cru (um registro sincronizado adulterado, escrito direto na API, injetaria atributos no `<body>` — a prévia roda em `<iframe srcDoc>` same-origin na web); as data URIs de logo/assinatura também entravam sem escape. Fix: `modeloSeguro()` (whitelist runtime) + `escapeHtml` nas data URIs.
- **[MEDIUM] Recibo ilegível com marca clara.** Branco sobre `gradiente(marca→navy)`: a ponta CLARA é a marca crua, então Ciano dava 1.83:1. Fix: `ajustarParaContraste(cor,#FFF,4.5)`. Provado: pior caso 4.61:1 nas 10 marcas.
- **[MEDIUM] Badge de severidade/confiança < 4.5:1 no claro** (bug d). Texto sobre o tint de 13% da própria cor. Fix: `corCategoriaEmChip` no texto. Provado: antes 4.02–4.38, depois ≥4.55:1.

Um bug meu no meio: `sev*/status` num JSDoc — o `*/` fechou o comentário. `tsc` pegou.

**No ar.** `git push origin HEAD:main` (fast-forward, 10 commits). O Pages `olli-app` fez o deploy do web; o Workers Build clobberou o `olli-diagnostico` e `reparar.mjs` restaurou os 5 secrets. Provado o caminho do dinheiro: `GET /`→`ia:on`, `/o/<inexistente>`→404, e **`POST /stripe/webhook`→400** (rota viva validando assinatura, não 404 clobberado).

**APK testado no emulador** (regra dura da memória). Build de `C:\olli` no `origin/main` (100.8 MB). Provado que o bundle tem meu código (`modeloReciboPadrao`, `Modelos de documento`, `Como foi o dia`, `notaEm`, `sevCritica` no `index.android.bundle`). Smoke test no `olli_phone`: instala, sobe, renderiza a Home (dark, dados GR Tech, nav acima da barra de gestos), navega para Conta/Ferramentas e rola a Home — **zero FATAL** no logcat. O `errorReport.ts` (ErrorUtils/globalThis, específico de Hermes) não derruba o boot.

APK: `C:\olli\android\app\build\outputs\apk\release\app-release.apk`.

## Roadmap Mestre + Fase 0/1 (2026-07-10/11)

Commits: `8309b37` (roadmap mestre — 8 lentes Sonnet + Fable), `e4bf966` (Fase 0 segurança/loja:
Data Safety fiel a "sem Supabase Storage", base legal LGPD por legítimo interesse, admin fail-closed),
`53c8113` (Fase 1 Receita — "o OLLI fala": radar de cobrança, "estou a caminho", lembrete PMOC,
avaliação Google), `d2ac2d6` (Fase 1 Fricção: erro de IA unificado `<EstadoIA>`, moldura/zoom do
PdfPreview, ErrorBoundary de topo, paywall/EmptyState), `5d2952c` (Fase 1 Velocidade: transação no
pull, dashboard em SQL agregado, memoização — **paginação foi tentada e depois revertida por decisão
documentada**), `c46bdbd` (Fase 1 Agenda — os P's: sobreposição, filtros, TimePicker do paper-dates).
Landing/site de marketing "SETPOINT": `c0bc5d4`/`e5f7807`/`ed440be`/`ad54801`. ETA com trânsito ponta a
ponta: `0e6759d`/`da3635a` (worker `/eta` + `/geocodificar`). Desktop "fim do vira-celular": `c8c84a5`.

## Auditoria Geral (7 lentes + Fable) + Ondas de Correção (2026-07-11)

Auditoria: `6b36f46` — 7 lentes Sonnet + síntese Fable, **38 achados únicos (4 P0, 14 P1)** em
`docs/AUDITORIA_GERAL.md`. As correções entraram em 5 ondas, cada uma citando o achado que fecha:

| Onda | Commit | Achados fechados (evidência lida no código) |
| --- | --- | --- |
| 1 — segurança/dinheiro | `7da4a94` | P0-2 (migrations `20260718_rls_owner_backdoor` + `20260719_clientes_insert_equipe` — `papel<>'owner'` + índice único; INSERT de clientes a membro ativo), P1-1 (rate limit + teto de payload em `/eta`+`/geocodificar`), P1-2 (gate de papel fail-closed em Ordens/EquipamentosDesktop), P1-3/P1-4 (injeção de owner em `cloudSync.ts`/`clienteLink.ts`), P1-6 (prefixo `convite:` no rate limit), P1-7 (PKCE S256), P2-6 (reparar.mjs sem fallback de ADMIN_EMAIL) |
| 2 — tamanho do APK | `337daa1` | P0-3 (`expo-build-properties` no `app.json`: ProGuard + shrinkResources), P0-4 (split de plataforma do Metro: `src/screens/desktop/index.ts` stub + `index.web.ts` real, `LandingScreen.tsx/.web.tsx` — ~12k linhas fora do bundle Hermes), P1-14a (`react-native-vector-icons` removido) |
| 3a — ConfirmDialog | `7c0d50e` | P1-10 (96 `window.confirm/alert` crus do desktop → `ConfirmDialog` temático + `DialogoDesktopHost`) |
| 3b — consistência/UX | `b6abcf4` | P1-5 (copy da privacidade sem promessa falsa), P1-9 (contraste dos badges via `corStatusOrcamento`/`corCategoriaEmChip` no theme), P1-12 (reduced-motion no `OlliMascot`/`EmptyState`) |
| 4 — P2 codáveis | `7f975a6` | P2 (cache de ETA, zoom do `PdfPreviewModal`, cabeçalho da `pmoc_fundacao`, `KNOWN_BLOCKERS` B4) |

Pós-auditoria (já em main): `6b11106` (reduced-motion estendido ao HojeScreen), `fbdf7e2` (usuário
existente caía no onboarding em aparelho novo — checa a nuvem antes do wizard), `5250f49` (perf do login:
`getCurrentUser` passou a usar `getSession` local em vez de `getUser`, + push do sync em paralelo com
teto de concorrência — mata o "arrasta ao logar" / flood de `/auth/v1/user`).

**Aplicação em produção (2026-07-11):** as 2 migrations de segurança (owner backdoor + cliente-do-técnico)
aplicadas no projeto `yiaeplqinnnnniyvwtls`; APK v1.1.0 (vc9, R8 ligado, 93 MB) buildado e testado no
emulador `olli_phone` (boot limpo, sem FATAL); web publicada; o dono confirmou ter desativado o Workers
Build por Git no Cloudflare (push monitorado ~6 min sem clobber).

## Re-auditoria total (10 lentes + Fable) — 2026-07-12

`docs/AUDITORIA_GERAL.md` foi **reescrito** com a re-auditoria de 10 lentes (app + web + landing + worker +
db + build) + verificação adversarial contra o código + crítico de completude. Resultado: **os 4 P0 codáveis
e ~12 P1 de 07-11 confirmados CORRIGIDOS**; perfeição estimada subiu de 80-85% → **88-90%**. Achados que
sobram (detalhe no AUDITORIA_GERAL): P0-1 Workers Build (humano, risco composto — apaga também os 5 bindings
de rate limit → worker fail-open); paywall do plano Empresa inexistente (achado NOVO — dinheiro); reintrodução
da classe "erro vira vazio" em bordas multi-tenant (tombstone single-tenant, cliente do técnico falha em
silêncio, `contextoEquipeOwner` colapsa erro em null); correções de contraste/reduced-motion/dialogs que não
chegaram ao mobile (badges PMOC, shimmer do skeleton, NovoOrcamentoScreen com `window.alert`); `codigos_erro.json`
(365KB) importado estático no boot; notificação de PMOC sem handler de toque (payload morto); MFA do admin; e
drift de docs (corrigido nesta rodada). Nenhum é retrabalho estrutural.

## Bloqueios externos ativos

Ver `KNOWN_BLOCKERS.md`.
