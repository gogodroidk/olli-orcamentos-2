# FOLLOWUPS — tarefas adiadas (recriar como chips ao retomar)

> Os chips de tarefa não sobrevivem ao reinício do app. Este arquivo é a fonte
> durável: ao retomar a sessão, recriar cada item abaixo como chip (spawn_task)
> ou atacá-los diretamente. Todos são melhorias fora do caminho crítico —
> nenhum bloqueia o que já está no ar.

## ⚖️ FONTE ÚNICA DE ESTADO (decidido em 2026-07-16 — item O0-5)

**Este arquivo + [`EXECUTION_LOG.md`](EXECUTION_LOG.md) são o registro OFICIAL do estado do OLLI.**
A tabela completa (o que é oficial, o que é aspiracional e por quê) mora no
[`EXECUTION_LOG.md`](EXECUTION_LOG.md) — **leia lá antes de escrever qualquer plano ou auditoria**.

Resumo da divisão de trabalho entre os dois:
- **`EXECUTION_LOG.md`** = o que **existe**, com evidência (commit, migration, exit code).
- **`FOLLOWUPS.md`** (este) = o que **falta e é conhecido**: dívida, achado adiado, borda aberta.
  Um item aqui é um **débito reconhecido**, não uma ideia solta — se não tem dono nem gravidade,
  não entra.

O que **não** é estado, por mais convincente que pareça: o bundle `C:\ollx\h` (snapshot sem `.git`,
e cujo `src/` só tem `types/` — o mobile não está lá), o kit `olli-program` (82 itens
`not_started`, **zero** em qualquer outro status: template jamais aplicado) e o Plano-Mestre em
`Entregas Claude\` (síntese e priorização, não inventário). Divergência entre eles e estes dois
arquivos: **estes dois vencem**.

## RE-AUDITORIA 2026-07-12 — onda de correção codável (checklist para o enxame)

> Detalhe e severidade em `docs/AUDITORIA_GERAL.md`. Ordem por gravidade. Os P0-A/B/C são de INTEGRIDADE
> DE DADOS na camada de identidade/conta — atacar antes do resto (o dono pediu "login perfeito").

**P0 — integridade de dados (fazer primeiro):**
- [ ] **Login não pode gravar empresa em branco.** `EntrarScreen.tsx:129-151`: distinguir 3 estados
  (`tem`/`não tem`/`não sei`); `não sei` (erro de rede) → tela de retry, NUNCA Onboarding. E o Onboarding
  (`salvarTudo`) faz MERGE, nunca overwrite de campo já preenchido remotamente. `empresaNuvemMudouDesdeUltimoPull`
  deve falhar FECHADO (não empurrar) quando não há carimbo local e a origem foi o Onboarding pós-login.
- [ ] **Logout "Sair e manter dados" não pode contaminar o próximo usuário.** `ContaScreen.tsx:323-344` +
  `cloudSync.pullAll` aditivo: marcar o SQLite com o `user_id` dono e, no login de outra conta, exigir "apagar
  dados" (ou isolar por conta) antes do primeiro pull.
- [ ] **Backup de membro não pode ressuscitar dados do dono.** `database.exportAllData` + `backup.ts` +
  role gate na UI: o backup do técnico não deve snapshotar o tenant do dono; e o restore não pode reintroduzir
  itens com `excluido_em` (respeitar tombstones da nuvem).

**P1 — dinheiro, segurança, entrega ao cliente:**
- [ ] **Paywall do plano Empresa** (worker `handleConvite` checa plano do owner + `GatePro` nas rotas de Equipe).
  Ver `olli-paywall-empresa-ausente`. **DEPENDE de decisão do dono.**
- [ ] **XSS em `modeloPdf`** do orçamento (`pdfGenerator.ts`) — mesma blindagem `modeloSeguro()` do recibo.
- [ ] **`/stripe/webhook` e `/transcrever`**: teto de payload + rate-limit por IP ANTES de bufferizar o corpo;
  `/transcrever` deve validar plano/cota mensal (hoje só client-side).
- [ ] **`contextoEquipeOwner` com 3 estados** — usar `carregarMinhaOrganizacao` (não o wrapper que colapsa);
  `erro` ⇒ não empurra escrita de equipe / re-tenta. `cloudSync.ts:558`.
- [ ] **Gate de papel na UI de clientes** (edição/exclusão do técnico não pode falhar em silêncio) + **tombstone
  `exclusoes` multi-tenant** + **query de `OrdensDesktopScreen` fail-closed** enquanto o papel resolve.
- [ ] **Sinal (R$ + data) e Laudo técnico no PDF** (`Step3Detalhes`/`pdfGenerator` — hoje somem na entrega).
- [ ] **`NovoOrcamentoScreen`**: trocar `window.alert/confirm` pelo `ConfirmDialog` temático.
- [ ] **reduced-motion**: `OlliSkeleton` (shimmer), pulso do mic (`OlliVozScreen`), "digitando" (`OlliChatScreen`),
  container do wizard (`NovoOrcamentoScreen`).
- [ ] **Handler de toque na notificação** (`addNotificationResponseReceivedListener` → navega pra OS/agenda) +
  **teto de lembretes PMOC** + **cancelar lembretes no logout "manter dados"** (hoje vazam nome/endereço).
- [ ] **Badges PMOC** via `corCategoriaEmChip` (contraste — 2 telas).
- [ ] **Copy que mente**: `public/index.html` estático + `ComparadorLanding` ("assinatura", "equipe no mapa").

**P2/P3 — perf, higiene, código morto:**
- [ ] `codigos_erro.json` (365KB) fora do import estático do boot (carregar sob demanda / só no seed).
- [ ] `HojeScreen` + radares (`radarClientes`/`radarCobranca`) e KPIs de recibos → dashboard-agregado em SQL.
- [ ] `useCallback` nas telas que usam `TabelaDados`; ícone android 990KB comprimido; cache de ETA com origem.
- [ ] `code-splitting` web (landing não baixa o ERP); `_headers` com CSP; `ErrorBoundary` com "ir para o início".
- [ ] Higiene: exports mortos do worker; `tsconfig noUnusedLocals`/linter mínimo; fotos `file://` (decisão: subir
  pra Storage — ver D-13 — ou avisar que é local).

## Pendentes (27)

1. **Badge financeiro na tabela desktop de orçamentos**
   - `src/screens/desktop/OrcamentosDesktopScreen.tsx` não recebeu o badge de estado
     financeiro (Pago / Recibo emitido / Aguardando) nem o atalho "Registrar pagamento"
     que o mobile (`OrcamentosScreen`) ganhou na Onda 3. Portar `getStatusFinanceiro` +
     `BadgeFinanceiroPill` de `src/services/pagamentos.ts` (carregar `getRecibos` junto
     de `getOrcamentos`). Paridade desktop, não elo quebrado.

2. **Limpar versões órfãs de orçamento na nuvem ao excluir**
   - `src/database/database.ts` `deleteOrcamento` apaga versões locais + tombstone do
     orçamento, mas NÃO propaga a exclusão de `orcamento_versoes` para a nuvem (a tabela
     não tem FK/cascade). Linhas órfãs podem ressuscitar histórico apagado se o
     `orcamento_id` reaparecer. Propagar a exclusão via o mecanismo de tombstone existente
     (ou cascade na nuvem). Protegido por RLS (não vaza) — é lixo, não vulnerabilidade.

3. **Campo `concluidoEm` na Ordem de Serviço**
   - "Concluídas no mês" (`src/screens/desktop/InicioDesktopScreen.tsx`) usa `atualizadoEm`
     como proxy de conclusão — qualquer edição posterior (foto/observação) re-carimba e
     conta no mês errado. Adicionar `concluidoEm?: string` ao tipo `OrdemServico`, gravado
     só na transição de status→`concluida` (em `atualizarStatusOS`), com coluna
     (migration aditiva + local + cloudSync como as demais colunas de OS), e filtrar por
     `noMesAtual(o.concluidoEm)`.

4. **KPIs do dashboard abrem lista já filtrada**
   - No `InicioDesktopScreen`, "Em aberto" e "Contas a receber" navegam para `OrcamentosTab`
     SEM filtro → abrem a lista completa (enganoso). Estender o param de `OrcamentosTab`
     (`AppNavigator` TabParamList) com um recorte inicial (ex.: `recorteInicial?: 'em_aberto'
     | 'a_receber' | StatusOrcamento`) e `OrcamentosDesktopScreen` inicializar o filtro a
     partir dele (recortes derivados via `propostaJaEnviada`/`getReciboDoOrcamento`).

5. **Role de checkbox no `OlliPressable` (acessibilidade)**
   - O toggle de checklist (`CheckRow` em `src/screens/HojeScreen.tsx`) usa `OlliPressable`,
     que hardcoda `accessibilityRole="button"` e não expõe `accessibilityRole/State`. Para
     leitor de tela soa como "botão", não "caixa marcada/desmarcada". Estender
     `src/components/OlliPressable.tsx` para repassar `accessibilityRole`+`accessibilityState`
     e usar `role="checkbox"` + `{checked: item.feito}` no CheckRow.

---

## RETOMAR AQUI (estado da sessão ao pausar — 2026-07-08)

**No ar em produção** (main até `6c29e70`): Ondas 1, 2, 3, 4, 5, 7, 10.

**PMOC Fase 1 — inventário HVAC + etiqueta QR — feita mas AINDA NÃO no gate/main:**
- Fundação `20260709_pmoc_fundacao.sql` APLICADA + RLS testada 4/4 (isolamento, membro,
  autoria carimbada, `user_id` imutável; QR opaco/único). `20260711_assets_fotos.sql`
  APLICADA (coluna `fotos` jsonb). Worker `/q/<token>` DEPLOYADO (v `c64671f4`).
- Código no working tree do branch (typecheck 0): `equipamentos.ts` (service),
  integração cloudSync `equipamentos`→`assets` (via `REMOTE_TABLE`, `qr_token`
  preservado/omitido), `EquipamentoScreen`, nav/SidebarNav, `worker/src/pmoc.js`.
- **A recuperar ao retomar:** o gate Fable da PMOC Fase 1 foi INTERROMPIDO na pausa.
  Resumir o workflow (runId `wf_ce6ac9c8-728`, os revisores estão em cache) → aplicar
  findings até zero critical/high/medium → re-typecheck → (se tocar worker, redeploy)
  → push main → atualizar cabeçalho de `20260709_pmoc_fundacao.sql` (era "NÃO APLICAR"
  → APLICADA) → `EXECUTION_LOG.md`.

**Próximo depois disso:** PMOC Fase 2 (plano PMOC + periodicidade + geração de ordens
recorrentes reusando `ordens_servico`).

**Bloqueios humanos (destravam ondas paradas):** chaves no cofre
`CONFIG CLAUDE/credenciais-locais.env` — Sentry DSN + PostHog key (Onda 2.5), Resend
key (Onda 6). Ver `docs/KNOWN_BLOCKERS.md`. Chrome extension desconectada (OAuth Android).

**Contas QA:** A=`e4f2858f-440f-469d-aca5-18bf0c35569a`, B=`daeb08b4-b1a3-4f96-b568-33b6eea879f0`.
</content>

## Novos follow-ups (Bloco A, 2026-07-09)

Nenhum é bloqueante; todos saíram dos dois gates e foram deliberadamente adiados.

1. **Deep link de convite deslogado perde o token.** `Convite` não está em `ROTAS_PUBLICAS`
   (App.tsx): um convidado que clica no link sem estar logado é mandado para a porta e o
   token some. É **pré-existente** (o reset já fazia isso antes da Landing), mas agora que
   há equipe de verdade vale resolver: guardar o token e reaplicar após o login.
2. **Copy do HERO da landing** ("cobre e gerencie a equipe") e o pilar 3 ainda falam de
   equipe como pronta. A FAQ e os bullets por plano já foram sincronizados com
   `PlanosScreen` ("em breve"); o HERO é copy de posicionamento e ficou de fora — decisão
   de produto, não de código.
3. **`MeuNegocio` some da lista de Ferramentas do técnico, mas o card de perfil no topo da
   ContaScreen continua levando lá.** Não é furo de permissão (o técnico edita o próprio
   negócio, não o do dono), é inconsistência de UX. Decidir se o técnico deve ter perfil.
4. **SEO por rota só cobre a home.** `seoWeb.ts` tem a API (`aplicarSeo`), mas só a Landing
   chama. Como `web.output='single'`, `/planos`, `/ajuda`, `/privacidade` e `/termos`
   servem o mesmo `index.html` e herdam o canonical da raiz — o Google as trata como
   duplicatas. Chamar `aplicarSeo` nessas 4 telas (ou pré-renderizar) resolve.
5. **`EmitirRecibo` está gateado por `ver_valores_agregados`.** É fail-safe, mas discutível:
   um técnico talvez precise emitir recibo em campo. Decisão de produto.
6. **Restaurar backup traz de volta como ATIVOS os itens que estavam na lixeira.**
   `importAllData` substitui o SQLite inteiro e o snapshot só contém itens ativos. Coerente,
   mas convém confirmar que é a semântica desejada (a Central de Ajuda já documenta assim).
7. **Upgrade sobre vigência paga registra a subscription nova mas o cliente paga duas vezes.**
   Quem tem Pro 12x e assina Empresa passa a ser cobrado pelos dois. O worker preserva o
   maior nível e a maior vigência (não entrega menos do que foi pago), mas o ideal comercial
   é a `PlanosScreen` avisar/creditar o saldo do 12x antes de deixar assinar.

## PMOC Fase 2 (2026-07-09) — notas LOW não bloqueantes

8. **`houveExclusaoDefinitiva` retorna `true` no catch.** É a direção segura (não ressuscita), mas
   se a leitura de `exclusoes` falhar isoladamente, uma reserva órfã é rotulada "removida de vez"
   em vez de "recuperada". Auto-cura na geração seguinte. Para precisão, devolver um terceiro
   estado ("indeterminado") em vez de colapsar erro em `true`.
9. **Read-view do plano mostra a versão VIGENTE, mas "Editar" salva na versão de TRABALHO.** Em
   plano já aprovado, salvar cria uma v2 rascunho e a seção de periodicidades continua exibindo a
   v1. Há banner de rascunho pendente; falta rotular a seção.
10. **Se um dia existir soft-delete de reserva** (`pmoc_ordens_geradas.excluido_em`), o
   reconciliador fica cego: `getOrdensGeradas` filtra ativos, a reserva soft-deletada some do
   snapshot mas continua ocupando o índice único → bloqueia a regeração em silêncio. Não é bug
   hoje (nada soft-deleta reserva); é um convite a cuidado.

## Sign in with Apple / SEO (2026-07-09)

11. ~~PASSO HUMANO — Supabase → Providers → Apple~~ **FEITO (2026-07-09).** Provider habilitado via
   Management API com `external_apple_client_id = online.olliorcamentos.app`, verificado relendo a
   config. Login nativo não precisa de Services ID / Team ID / `.p8`.
12. **Sign in with Apple NÃO foi testado**, e não dá para testar antes da conta Developer (a
   entitlement `com.apple.developer.applesignin` exige provisioning profile). O ponto mais frágil é
   o nonce: se o login falhar com "invalid nonce", a alternativa documentada é remover o argumento
   `nonce` das DUAS chamadas (Apple e Supabase).
13. **Preview de link (WhatsApp/Slack) ainda mostra o cartão da home** em todas as rotas: esses
   crawlers não executam JavaScript e leem o `index.html` estático. `aplicarSeo` só conserta para o
   Googlebot, que renderiza JS. Solução completa: pré-render por rota (SSG), que troca o pipeline
   de build.
14. **HERO da landing** (`LandingSecoes.tsx`) ainda diz "cobre e gerencie a equipe". Não é meta
   description, mas é a mesma promessa que `PlanosScreen` marca "(em breve)". Decisão de produto.
15. **`expo-crypto` e `expo-apple-authentication` são módulos nativos novos:** o APK v1.1.0 atual
   não os tem. Nada quebra (o Apple é iOS-only e o crypto só é chamado por ele), mas o próximo
   build precisa ser feito do zero.
16. **Dica do técnico:** "Toque numa OS para ver os detalhes" navega para a tela de OS sem id, não
   para o detalhe daquela OS. Imprecisão leve de navegação, não promessa falsa.

17. **Botão "premium" mudou de cor e o dono precisa ver.** `gradientes.brand` / `primaryDiagonal`
    tinham a ponta `accent` em `#34C6D9`; rótulo branco por cima dava **2.05:1** — reprovado hoje,
    em produção, antes de qualquer picker. `parLegivel` escureceu a ponta para `#1A808D` (4.65:1).
    Alternativa de design, se ele achar que perdeu brilho: manter o gradiente e trocar o
    preenchimento do botão por `cores.primary` sólido (5.02:1), deixando o ciano só no
    `sombras.glowCyan`. Decisão do dono, não minha.

18. **Telas mobile dentro da página desktop de 1100px ainda são de coluna única.** `comCentroDesktop`
    deixou de desenhar um telefone, mas as telas que ele embrulha (Equipamentos, wizard de orçamento,
    recibo) não usam a largura nova: continuam empilhando verticalmente. Não é bug — é a v5 do
    desktop. Priorizar Equipamentos, que foi a tela que o dono citou.

19. ~~**`accent` como cor de texto: varrer o resto do repo.**~~ **FEITO.** A regra está mecanizada em
    `scripts/checar-contraste.mjs`, ligada ao `npm run preflight`. Ela faz duas coisas: (a) lint
    estático dos dois defeitos, com exceção declarada na própria linha via `// contraste-ok: <motivo>`;
    (b) prova da paleta — as 12 cores de marca do seletor medidas contra 2 modos × 4 superfícies ×
    6 tokens + as duas pontas dos 3 gradientes que carregam texto. Falha o build abaixo de 4.5:1.

20. **Toggle de tema e seletor de cor de marca ainda não estão expostos na `ContaScreen`.** A fundação
    (provider, persistência em `olli.tema.v1`, paleta acessível para qualquer cor) está pronta e agora
    a UI inteira responde a ela. Falta só o controle. Foi deixado para o fim de propósito: um
    interruptor que acende metade da sala é pior que nenhum.

21. **Vermelho destrutivo ficou mais claro no modo escuro.** `danger` era ajustado contra o
    `background` (o fundo mais fácil) e usado como texto sobre cards, onde dava **3.43:1**. Agora é
    ajustado contra a superfície mais difícil: `#E5484D` → `#EB7578`, e como texto sobe para 4.70:1.
    O rótulo do botão destrutivo já era tinta escura antes (não branco), então não há regressão de
    legibilidade — o contraste dele até sobe de 4.42 para 6.05. O que muda é o tom do preenchimento
    em 4 lugares. Se o dono achar o salmão fraco, a saída é separar os papéis: `danger` como
    preenchimento e um `dangerText` para texto sobre superfície. Isso toca ~58 sítios.

22. **`OlliButton` obriga quem chama a saber o gradiente interno.** O rótulo o botão colore sozinho,
    mas o `icon` é um `ReactNode` pronto — o chamador precisa passar `gradientes.sobreBrand` à mão e
    acertar. Quatro sítios (`EntrarScreen`, `OnboardingScreen`) fazem isso hoje; um quinto vai errar.
    Conserto: `React.cloneElement(icon, { color })` dentro do botão, guardado por `isValidElement`.
    Cuidado: na web o `color` encaminhado a uma `View` vira aviso do React.

23. **`variant="outline"` do `OlliButton` pinta ícone e rótulo com cores diferentes.** O rótulo usa
    `cores.accentLight`; os call-sites passam ícone com `cores.primary`. Some junto com o item 22.

24. **`SincronizandoPill` está copiada em seis telas.** Home, Hoje, Agenda, Orçamentos, Clientes e
    RelatorioDia têm a mesma pílula (`rgba(10,22,38,0.92)`, ícone `cloud-sync-outline`, texto
    "Sincronizando..."). As cópias derivaram: quatro foram consertadas por agentes diferentes e duas
    ficaram com `accentLight` (2.88:1) até serem pegas por comparação. Extrair para
    `src/components/SincronizandoPill.tsx` mata a classe inteira. O bug não é a cor — é a duplicação.

25. **Os 92 `#fff` cravados prendem o seletor de cor a marcas escuras.** Estão corretos hoje: as 12
    cores oferecidas resolvem `sobrePrimary`/`sobreHeader`/`sobreBrand` para `#FFFFFF`, e o passo [3]
    de `scripts/checar-contraste.mjs` falha o build se alguém acrescentar uma cor clara. Para liberar
    amarelo/ciano/verde-limão (todas já provadas acessíveis em [2]), é preciso antes eliminar os
    brancos — a maior parte deles some junto com o item 22 (`OlliButton` colorindo o próprio ícone).

26. **Badges de status ainda usam matiz de categoria como cor de texto.** `STATUS_OS_CORES`,
    `STATUS_EQUIP_CORES`, `STATUS_COLORS` e `TIPO_LIXEIRA_META` são mapas estáticos de matiz,
    pintados direto em `color:` de rótulo (`CardOS:100`, `OrdemServicoScreen:82`,
    `EquipamentoScreen:103`, `PmocPlanosScreen:96`, `LixeiraScreen:61`). A primitiva já existe —
    `corCategoriaEmChip(matiz, cores.surface)` — e foi aplicada nos chips de tipo de agendamento
    (8 de 12 pares reprovavam, dois no modo escuro). Falta aplicá-la nesses cinco. O gate não pega:
    são hex, não `rgba`, e o lint não sabe qual `color:` é rótulo e qual é preenchimento.

27. **O mascote (`OlliMascot`) não segue a cor da marca.** É um asset azul-ciano fixo. Com o tema
    padrão passa despercebido; com Terracota ou Vinho ele destoa no hero do login (visto no APK).
    Não é bug de contraste — é coerência visual. Ou o mascote vira SVG parametrizado pelo `primary`,
    ou ele é declarado neutro por decisão de marca.

28. ~~**Recibo só tem um layout; falta multi-template de recibo.**~~ **FEITO (2026-07-10).** O recibo
    virou `utils/reciboPdf.ts` (`montarHtmlRecibo`), brand-aware, com 3 modelos (`ModeloReciboId` =
    clássico/compacto/faixa) via classe no `<body>`; `empresa.modeloReciboPadrao`; seção de recibo em
    `ModelosDocumentoScreen` com prévia real (`PdfPreviewModal` generalizado com `construirHtml`). De
    quebra corrigiu o `#0B6FCE` cravado — o recibo NÃO seguia a marca (nota falsa na tela, agora
    verdadeira). Restam ideias futuras: mais modelos, e um `modeloRecibo` por-recibo (hoje é só padrão
    global).

29. **A mesma borda "erro → tenant errado" ainda vive em `clienteLink.ts` e `localizacaoEquipe.ts`.**
    Achado ao fechar o O0-4 (que corrigiu só o `cloudSync.ts`, escopo do item na FILA).
    `espelharVersaoNuvem` (`clienteLink.ts:446`) resolve o dono com `getMinhaOrganizacao()`, que
    colapsa erro em `null` — e o comentário no código racionaliza: *"o pior caso de falha é gravar
    no próprio tenant (comportamento de hoje), nunca vazamento"*. Não é vazamento, mas é exatamente
    o **P1-4 que a própria função existe para evitar**: a versão nasce com o `user_id` do técnico e
    **o dono nunca a vê** — pior, ela fica órfã, apontando para um orçamento que mora no tenant do
    dono. Não foi corrigido junto porque o remédio do `cloudSync` (fail-closed: adiar o espelho)
    **não serve aqui**: `orcamento_versoes` NÃO é `SyncTable`, logo não há `pushAllLocal` que tente
    de novo — `espelharVersaoNuvem` é tiro único (`database.ts:1351`). Adiar ali = nunca espelhar.
    O conserto certo exige primeiro dar retry à versão (entrar no pipeline de sync ou ganhar fila
    própria) e só então aplicar `classificarContextoEquipe`. `localizacaoEquipe.ts:149,182` usa o
    mesmo `getMinhaOrganizacao()` para achar o `org_id` — avaliar se um erro de rede ali vira
    "sem equipe" em silêncio. A primitiva de 3 estados já existe e está testada:
    `src/services/contextoEquipe.ts` (+ `npm run test:contexto-equipe`).
