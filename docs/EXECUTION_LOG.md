# EXECUTION_LOG — OLLI Orçamentos

> O que já foi ENTREGUE, com evidência (commit ou arquivo). Atualizar ao fim de cada onda.
> Última atualização: 2026-07-08.

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
- **Falta 1 passo humano** (não precisa da conta paga): Supabase → Authentication → Providers → Apple → habilitar e colar `com.grtech.olliorcamentos` em Client IDs. Para login nativo é só isso. **Não dá para testar** antes da conta Developer: a entitlement exige provisioning profile.

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

## Bloqueios externos ativos

Ver `KNOWN_BLOCKERS.md`.
