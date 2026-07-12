<!--
  ROADMAP MESTRE do OLLI — gerado por analise multiespecialista (8 lentes Sonnet + pesquisa web)
  e sintetizado pelo Fable 5, em 2026-07-10. Validado pelo Opus (spot-checks confirmaram:
  admin.js:28 fallback hardcoded, react-native-paper-dates ja no bundle, zero Supabase Storage).

  >>> STATUS 2026-07-12 (re-auditoria): este roadmap NÃO está mais "nada executado".
  Fase 0 e a maior parte da Fase 1 já foram entregues e estão em produção. Evidência por commit:
    - Fase 0 (loja/legal): e4bf966 (Data Safety fiel, base legal LGPD, admin fail-closed). 0.1-0.4 seguem HUMANO.
    - Fase 1 Receita (1.1-1.4): 53c8113. Fricção (1.8/1.9/1.11-1.16): d2ac2d6. Velocidade (1.17-1.19/1.21): 5d2952c
      (paginação 1.13/1.18 foi TENTADA e depois REVERTIDA por decisão documentada — segue full-load nas telas desktop;
       HojeScreen e os radares ficaram FORA do dashboard-agg — ver AUDITORIA_GERAL 2026-07-12). Agenda P's (1.5-1.7): c46bdbd.
    - Fase 2: 2.4 S256 e 2.6 R8/shrink FEITOS (337daa1 + app.json). 2.7 ícone 990KB PENDENTE. 2.1-2.3 (Calendar/contacts/push)
      seguem atrás dos passos humanos (OAuth Android, FCM).
    - Fase 3 (pós-loja): 3.9 split de plataforma FEITO (index.web.ts). Resto PENDENTE.
  O que NÃO foi executado: 1.20 (code-splitting web), o paywall do plano Empresa (achado NOVO da re-auditoria — hoje
  Equipe funciona de graça), e toda a Fase 3 grande. Detalhe e reconciliação item-a-item em docs/AUDITORIA_GERAL.md.
-->

# ROADMAP MESTRE — OLLI Orçamentos
### Síntese das 8 lentes (produto, integrações, UX, calendário, PDF, performance, erros/IA, segurança) — 10/jul, prazo de loja ~dia 20

---

## A DIREÇÃO CRIATIVA — o fio que conecta tudo

**"O OLLI já sabe. Falta ele falar."**

O achado que se repete em quase todas as lentes: o produto já *coleta* os dados mais valiosos do negócio — o cliente viu o orçamento (evento já chega no worker), o PMOC tem data de vencimento calculada, o ETA com trânsito já está pago e ligado, o orçamento aprovado sem recibo está no banco — mas **não fala nada com ninguém**. Nenhum radar de cobrança, nenhum aviso de contrato vencendo, nenhum "estou a caminho". Os concorrentes (Jobber, Housecall Pro) ganham exatamente aí.

A boa notícia: dar voz a esses dados é quase todo **esforço P, risco baixo, zero dependência nova** — porque a infraestrutura (notificação local, deep-link WhatsApp, ETA, motor PMOC) já existe. O "efeito uau" desta rodada não é visual, é **o app parecer vivo**: ele avisa, cobra, lembra e sugere — sempre com o humano no loop (um toque abre o WhatsApp pronto), o que é mais barato, mais LGPD-friendly e mais brasileiro que qualquer API paga.

**As 5 apostas de maior alavancagem:**

1. **Radar de Cobrança** — "4 orçamentos aprovados sem pagamento registrado, R$ X parado". Dinheiro parado é a dor nº 1 do autônomo; espelha 1:1 o radar de clientes que já funciona. Esforço P, valor máximo.
2. **O trio WhatsApp de um toque** — "Estou a caminho" (com ETA real), "Cobrar", "Pedir avaliação no Google". Três botões, zero custo por mensagem, zero aprovação da Meta. É a camada de comunicação inteira dos concorrentes, na versão pragmática.
3. **Velocidade de volta** — sync incremental + transação em lote + dashboard com SQL agregado. A lentidão percebida é real e cresce sozinha com o histórico; consertar é o "uau" invisível que segura o cliente pagante.
4. **Push remota (fundação no APK único)** — o único gap estrutural: hoje o app não avisa ninguém de nada que acontece fora do aparelho. "Seu orçamento foi VISTO agora" é o motor de engajamento diário dos líderes do setor.
5. **Identidade nos momentos de fricção** — mascote nos estados de erro/vazio da IA + ConfirmDialog com a marca no lugar dos 93 `window.confirm` do navegador. É onde um SaaS genérico vira um produto com personalidade — dentro do perfil de motion funcional, sem WebGL, sem circo.

---

## COMO LER AS FASES

- **"Sem prebuild"** = JS/web/worker puro, sem módulo nativo nem permissão nova. Vale ressaltar com honestidade: mudança JS só chega ao celular do técnico **no APK final** do mesmo jeito — mas é testável na web hoje, não carrega risco nativo e não builda nada sozinha (regra D-10: 1 APK só, no fim).
- **"Prebuild"** = exige nova permissão/módulo nativo → entra na fila do APK único final.
- **"Gated humano"** = console/verificação externa que nenhum agente resolve por API.

---

## FASE 0 — DISPARAR HOJE (passos humanos com lead time + higiene pré-loja)

Estes itens têm fila externa (Google leva dias/semanas) ou são obrigatórios antes da submissão. Custam minutos de trabalho e dias de espera — por isso vêm ANTES de qualquer código.

| # | Item | O quê / por quê | Esf. | Risco | Valor | Depende de |
|---|------|-----------------|------|-------|-------|------------|
| 0.1 | **Criar OAuth client Android (B3)** | Console Google Cloud: client Android com pacote `online.olliorcamentos.app` + SHA-1 da keystore. Destrava Calendar sync (código 100% pronto em `googleAgenda.ts`) e login Google nativo. | P | baixo | alto | Humano |
| 0.2 | **Enviar OAuth consent screen para verificação** | Escopo `calendar.events` é "sensível": sem verificação, o refresh token expira em 7 dias e o sync morre em silêncio. Leva de dias a semanas — se não entrar na fila HOJE, Calendar não funciona de verdade no lançamento. Adicionar ao checklist de `docs/LOJAS.md`. | P | alto | alto | 0.1 |
| 0.3 | **Criar projeto Firebase + subir credencial FCM v1** (`eas credentials`) | Pré-requisito da push remota (API legada foi descontinuada). `expo-notifications` já está instalado — o custo é só este setup. | P | baixo | alto | Humano |
| 0.4 | **Ligar toggle Google Pay no dashboard Stripe + QA** | A premissa "Google Pay depende do OAuth Android" está ERRADA: wallet no Checkout **hospedado** (que o OLLI já usa via `Linking.openURL`) é toggle no dashboard da Stripe. QA: abrir o link de checkout num Android com cartão salvo. Se aparecer, Google Pay custou zero linhas de código. Payment Sheet nativo fica descartado por ora (módulo nativo, mobile-only, quebraria "um app dois rostos"). | P | baixo | alto | Humano (2 min) |
| 0.5 | **Corrigir Data Safety / Privacy Label em `docs/LOJAS.md`** | O doc afirma que fotos sobem via Supabase Storage — **não existe nenhuma chamada de Storage no código** (só o caminho local sincroniza). Declaração errada na loja é risco de rejeição/suspensão. Adicionar também a linha "Calendar" e, se contacts entrar (Fase 2), a linha READ_CONTACTS. | P | médio | alto | — |
| 0.6 | **Reenquadrar base legal da localização da equipe** | `privacidade.ts` usa "Consentimento" para rastrear empregado — juridicamente frágil na jurisprudência trabalhista. Trocar por legítimo interesse (art. 7º, IX) + política de expediente/rota. Agora, antes da Onda 8 tornar isso contínuo. | P | médio | alto | — |
| 0.7 | **Remover fallback hardcoded de `ADMIN_EMAIL`** + **MFA no super-admin** | `admin.js:28` concede o painel de TODOS os tenants a um e-mail fixo se a env faltar; e o painel inteiro está atrás de um fator só. Fallback: poucas linhas. MFA: TOTP no Supabase + checar `aal2` em `requireAdmin()`. Zero impacto no APK. | P/M | — | alto | — |

---

## FASE 1 — QUICK WINS SEM PREBUILD (o enxame começa aqui, dias 11–15)

### 1A. "O OLLI fala" — comunicação proativa com o que já existe

| # | Item | O quê / por quê | Esf. | Risco | Valor | Depende de |
|---|------|-----------------|------|-------|-------|------------|
| 1.1 | **Radar de Cobrança** | `radarCobranca.ts` espelhando `radarClientes.ts`: orçamento aprovado sem recibo emitido, dias parado, botão "Cobrar no WhatsApp". Card na Home/Início. Aposta nº 1. | P | baixo | **alto** | — |
| 1.2 | **Lembrete proativo de PMOC vencendo** | `PmocOrdemGerada.vencimento` já existe; disparar notificação LOCAL (infra já em produção) 15/7/1 dias antes. Retenção de receita recorrente sem push remota. | P | baixo | **alto** | — |
| 1.3 | **"Estou a caminho" via WhatsApp** | Botão na visita do dia: monta mensagem com nome + ETA real (rota `/eta` já paga e ligada) via `abrirWhatsApp` já existente. Reduz no-show. | P | baixo | médio | — |
| 1.4 | **Pedir avaliação Google pós-serviço** | Campo "link do Google Maps" em Meu Negócio + botão no recibo/relatório que abre WhatsApp com o link. SEM API do Google Business (oneraria onboarding). | P | baixo | médio | — |

### 1B. Agenda — os P's (o redesenho grande fica pós-loja)

| # | Item | O quê / por quê | Esf. | Risco | Valor |
|---|------|-----------------|------|-------|-------|
| 1.5 | **Detectar sobreposição de horário ao salvar** | Hoje só valida fim>início; comparar contra itens já em memória, aviso não-bloqueante. | P | baixo | alto |
| 1.6 | **ChipsFiltro na Agenda** | Componente já existe no kit; filtrar por tipo/status client-side. | P | baixo | médio |
| 1.7 | **TimePicker de verdade** | `react-native-paper-dates` JÁ está no bundle sem uso; trocar a máscara de texto manual pelo TimePickerModal temático. Zero KB novo. | P | baixo | médio |

### 1C. PDF — resolver a queixa real (decisão de conflito entre lentes)

**DECISÃO: melhorar o preview existente. NÃO adotar react-native-pdf nem pdf.js.** As duas lentes (PDF e Performance) convergem: a queixa "pequena e fora de layout" é CSS/UX, não engine. `react-native-pdf` dobraria o APK (pdfium por ABI, relatos de 50→64MB) para reexibir o que o WebView já mostra; pdf.js somaria 1MB+ de assets para decodificar de volta um PDF que o próprio app gerou. Ideia-legal-mas-cara, rejeitada.

| # | Item | O quê / por quê | Esf. | Risco | Valor |
|---|------|-----------------|------|-------|-------|
| 1.8 | **Moldura de página + zoom/fit no preview** | Fundo cinza + sombra de "folha" + botões +/−/ajustar-largura (`transform: scale`); no desktop, limitar o overlay (~900px) em vez do branco full-viewport que quebra o padrão do `CentroDesktop`. | P | baixo | **alto** |
| 1.9 | **Atalho "abrir PDF de verdade" dentro do preview** | Ícone no header que chama o `exportarHtmlComoPdf` já testado em produção — share sheet no nativo, diálogo de impressão na web. | P | baixo | alto |
| 1.10 | **Manter QR + URL (não perseguir botão clicável no PDF)** | Já investigado e correto: WhatsApp não deixa link de PDF clicável e o iOS derruba hyperlinks no print. Decisão registrada, zero trabalho. | — | — | — |

### 1D. Identidade nos momentos de fricção

| # | Item | O quê / por quê | Esf. | Risco | Valor |
|---|------|-----------------|------|-------|-------|
| 1.11 | **ConfirmDialog temático (matar os 93 `window.confirm`)** | Maior desvio visível do design system: diálogo cru do navegador em 18 telas desktop. Construir com o padrão de overlay que `OverlayProgresso`/`GatePro` já usam — 100% RN, nenhuma lib. shadcn/Radix/21st.dev = **moodboard, nunca fonte de código** (DOM+Tailwind não roda na árvore View/Text). | M | baixo | **alto** |
| 1.12 | **ErrorBoundary de topo** | Sem nenhum no repo: exceção de render = tela branca, fora dos 3 estados contratados (regra de ouro nº 4). | P | baixo | alto |
| 1.13 | **Unificar taxonomia de erro de IA + componente `<EstadoIA>` com mascote** | 3 taxonomias e 3 visuais divergentes para "a IA não ajudou" (Diagnóstico/Chat/Códigos); nenhum usa o OlliMascot. Um módulo `erroIA.ts` + um componente com o mascote (pose "confuso" = variação de vetor, ~0 impacto de APK). | M | baixo | alto |
| 1.14 | **Corrigir a promessa do "Não achei meu erro"** | A copy promete "enriquecer a base" mas `casos_erro` nunca sai do SQLite e é apagado no logout — e ainda cita uma IA "que vai chegar" que já chegou. Versão P: corrigir a copy para a verdade. Sync real para Supabase = candidato pós-loja. | P | baixo | alto |
| 1.15 | **Botão "Buscar no Google/YouTube" quando confiança = Baixa** | Recuperação honesta e grátis: abre busca real com marca+modelo+código. Zero IA nova, zero alucinação. | P | baixo | alto |
| 1.16 | **Consolidar paywall (`gateCartao` inline → GatePro/FaixaUpsell)** + **EmptyState nos 2 blocos manuais do Início** | Duas identidades de "isto é PRO" e dois vazios artesanais na mesma tela do dono. Puro reuso. | P | baixo | médio |

### 1E. Performance — "ficou rápido de novo" (aposta nº 3)

| # | Item | O quê / por quê | Esf. | Risco | Valor |
|---|------|-----------------|------|-------|-------|
| 1.17 | **Transação em lote no pull do sync** (parte barata) | Hoje: pull COMPLETO das 13 tabelas em todo boot, gravando linha a linha fora de transação (~50x mais lento). Envolver em `withTransactionAsync` primeiro; depois o filtro incremental `atualizado_em > ultimoSync` (cuidado com LWW/tombstones). | M | médio | **alto** |
| 1.18 | **Dashboard e listas sem "recarrega tudo a cada foco"** | Início do dono chama histórico COMPLETO + reduce em JS a cada foco. Trocar por SUM/COUNT no SQLite + paginação de 50 na lista de orçamentos + cache-then-revalidate. | M | baixo | **alto** |
| 1.19 | **Colunas virtuais + índices no JSON de orçamentos** | `json_extract` sem índice = full scan toda vez. Migração aditiva, padrão já existente. | P | baixo | médio |
| 1.20 | **Code-splitting web (landing não baixa o ERP)** | Visitante anônimo baixa 1,24MB gzip (app inteiro) para ver marketing. `React.lazy` nas rotas fora do caminho crítico. Só afeta web — e SEO agradece. | M | baixo | alto |
| 1.21 | **Memoizar linhas de lista + limitar animação de entrada em tabelas web** | React.memo + useCallback; manter o motion (já respeita reduced-motion), só limitar quantas linhas animam. | P | baixo | médio |

---

## FASE 2 — O APK ÚNICO FINAL (prebuild, dias 15–18)

Regra D-10 respeitada: **um único prebuild, um único APK**, tudo testado junto no emulador `olli_phone` (lição Hermes/TextDecoder). Cada item abaixo entra nesse mesmo trem — nada builda sozinho.

| # | Item | O quê / por quê | Esf. | Risco | Valor | Depende de |
|---|------|-----------------|------|-------|-------|------------|
| 2.1 | **Fiação final do Google Calendar** | Preencher `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID` + intent filter do reverse client ID (lógica já comentada no código). É só ligar — o código está pronto. | P | baixo | **alto** | 0.1, 0.2 |
| 2.2 | **Importar contatos → clientes (`expo-contacts`)** | **DECISÃO do conflito entre lentes:** `expo-contacts` com `presentContactPickerAsync` (usuário escolhe quem importa — melhor pra LGPD), gated por `Platform.OS` no mobile; **People API descartada** (redundante, valor incerto, mesmo gate B3). Complemento barato: **import CSV no desktop** (sem permissão nenhuma, serve quem migra de outro sistema) pode até entrar na Fase 1. Exige READ_CONTACTS → declarar no Data Safety ANTES de submeter (0.5). | M | médio | alto | Prebuild |
| 2.3 | **Fundação da push remota (FCM v1)** | Token por device (`getExpoPushTokenAsync`), tabela `push_tokens` com RLS, rota no worker. **Primeiro caso de uso no APK: "OS atribuída a você"** (hoje o técnico só descobre por pull-to-refresh). Os eventos de orçamento visto/aprovado são só worker — podem amadurecer PÓS-loja sem novo APK. | M/G | médio | **alto** | 0.3, Prebuild |
| 2.4 | **PKCE plain → S256** (`expo-crypto`, poucos KB) | Prática da RFC e evita pergunta do revisor de escopo sensível do Google. | P | baixo | baixo | Prebuild |
| 2.5 | **Check-in/check-out na OS** | Timestamps `iniciadoEm`/`concluidoEm` (aditivo, sem migração) + leitura pontual de localização em foreground. NÃO é o background location da Onda 8 — é só carimbo. Habilita relatório de horas. | M | baixo | médio | — (JS, pega carona) |
| 2.6 | **Ligar R8/ProGuard + shrinkResources** — *com plano B* | Está tudo DESLIGADO hoje; proguard-rules nunca auditadas (têm keep de lib que nem existe no projeto). Ganho típico 20-30% de APK. **Honestidade:** pode derrubar módulo nativo por reflection. Tentar no INÍCIO da janela de prebuild; se o QA no emulador acusar qualquer quebra, **desligar e adiar sem dó** — é otimização, não feature, e o prazo manda. | P | médio | médio | QA emulador |
| 2.7 | Comprimir `android-icon-background.png` (990KB → <50KB) | Higiene barata de asset. | P | baixo | baixo | — |

---

## FASE 3 — PÓS-LOJA (as frentes grandes, com o app já publicado)

| # | Item | O quê / por quê | Esf. | Risco | Valor |
|---|------|-----------------|------|-------|-------|
| 3.1 | **Agenda profissional: grade horária real (eixo de horas)** | Hoje é lista empilhada — não dá pra ver buraco nem lotação. Timeline com posição/altura proporcionais, 100% JS/RN, sem lib. A frente mais visível do produto depois da loja. | G | baixo | alto |
| 3.2 | **OS agendadas dentro da Agenda (leitura)** + **paridade Mês/Dia no desktop** | Trabalho comprometido invisível no calendário + desktop só tem Semana (quebra "um app dois rostos"). | M+G | médio | alto |
| 3.3 | **Aviso de deslocamento insuficiente entre visitas** | ETA já pago comparando pares consecutivos do dia focado (nunca semana inteira — custo por chamada). Cache por par de endereços. | M | baixo | alto |
| 3.4 | **Reagendar rápido — faseado** | Fase A: long-press → "Mover pra amanhã / próxima semana" (JS puro, risco ~zero). Fase B: drag de verdade — **só desktop primeiro** (mouse é simples); no mobile exigiria Reanimated (módulo nativo novo, peso de APK) — decisão consciente adiada. | M→G | alto | alto |
| 3.5 | **Push de eventos de negócio completa** | "Cliente VIU seu orçamento", "aprovou", "recusou" — só worker (dados já chegam lá), sem APK novo, em cima da fundação 2.3. | M | baixo | **alto** |
| 3.6 | **Portal do cliente expandido** | "Solicitar novo atendimento" na página pública (cria lead a moderar, nunca auto-agenda). Fecha o loop com a push. | G | médio | médio |
| 3.7 | **Unificar linguagem de gate na sidebar** (decisão de produto: papel oculto vs descobrível) + **pose do mascote** + **avaliar rn-primitives p/ Select/Combobox** | Polimentos de sistema; rn-primitives é a única peça do ecossistema que roda em View/Text de verdade, mas é dependência nova → emulador antes de merge. | M/G | médio | médio |
| 3.8 | **Sync real de `casos_erro` + painel admin** e **exportação self-service de dados (LGPD)** | Cumprir de verdade a promessa da base + botão "baixar meus dados". | M | baixo | médio |
| 3.9 | **Split por extensão de plataforma** (desktop/marketing fora do bytecode Hermes) | "Não montada" ≠ "não empacotada": gifted-charts e a landing inteira vão no APK hoje. Resolver via resolução `.web.tsx` do Metro. | M | médio | médio |
| 3.10 | **Especificar a tela de divulgação proeminente ANTES da Onda 8** (background location) | Play Store pede vídeo dessa tela; pular = rejeição clássica. Spec antes de qualquer código de captura contínua. | M | alto | médio |

---

## O QUE DECIDIMOS **NÃO** FAZER (e por quê — para não voltar ao assunto)

| Item | Veredito | Motivo em uma linha |
|------|----------|---------------------|
| **WhatsApp Cloud/Business API** | Não agora | Deep-link `wa.me` cobre 100% dos casos do mestre de graça; a API custa ~US$0,06/mensagem + 2-10 dias de verificação Meta para resolver um problema que não existe. A lacuna real (disparo automático) se resolve com push AO técnico. |
| **Stripe Connect / cobrança recorrente do cliente final** | Não | Exigiria KYC por prestador e custódia de dinheiro de terceiros; cultura BR é PIX na hora. A dor (retenção PMOC) já é coberta pelo item 1.2. |
| **Controle de estoque real** | Fase própria, futura | Mudança de natureza do produto (território de ERP pesado); a maioria dos autônomos compra a peça na hora. |
| **react-native-pdf / pdf.js** | Não | Dobra o APK / soma 1MB+ para reexibir o que o WebView já mostra pixel-idêntico. |
| **NativeWind / Tamagui / gluestack / HeroUI** | Não (registrar como decisão) | Trocaria o motor de estilo do app inteiro, que já funciona, por nada. |
| **People API para contatos** | Não | Redundante com expo-contacts, mesmo gate humano, valor incerto. |
| **Grounding web no diagnóstico IA** | Adiar | Incompatível com o JSON estruturado no Gemini 2.5 na mesma chamada; introduziria o primeiro custo variável por resposta. O item 1.15 (busca honesta) cobre 80% do valor de graça. |
| **Payment Sheet nativo (Stripe)** | Adiar até dado de conversão | Módulo nativo, mobile-only, quebraria "um app dois rostos"; primeiro medir o checkout hospedado (0.4). |

---

## SEQUÊNCIA DE EXECUÇÃO RECOMENDADA (para caber antes do dia ~20)

**Dia 10–11 — Fase 0 inteira (paralelo total).** O dono dispara os 4 passos humanos (OAuth client, verificação do consent screen — este tem fila de SEMANAS, é o mais urgente do roadmap inteiro —, Firebase/FCM, toggle Google Pay). O enxame corrige em paralelo: LOJAS.md/Data Safety, base legal, fallback ADMIN_EMAIL, MFA.

**Dia 11–14 — Fase 1 em três frentes paralelas.**
- *Frente Receita:* 1.1 → 1.2 → 1.3 → 1.4 (o trio WhatsApp + radares).
- *Frente Fricção:* 1.11 (ConfirmDialog) → 1.8/1.9 (PDF) → 1.12–1.15 (ErrorBoundary + erro IA) → 1.16.
- *Frente Velocidade:* 1.17 (transação primeiro, incremental depois) → 1.18 → 1.19 → 1.20 → 1.21. Agenda P's (1.5–1.7) entram onde houver folga.

**Dia 15–17 — Fase 2: o prebuild único.** Congelar features JS. `expo prebuild` com: Calendar (2.1), contacts (2.2), fundação push (2.3), S256 (2.4), check-in (2.5), R8 (2.6 — primeiro da fila de teste, com plano B de desligar), ícone (2.7). QA completo no emulador `olli_phone` — Hermes já mordeu uma vez.

**Dia 17–19 — QA final + submissão.** Formulário Data Safety coerente com 0.5 e 2.2, AAB/APK final, envio às lojas com margem de 1 dia para imprevisto.

**Pós-loja — Fase 3**, começando por 3.5 (push de eventos — só worker, colhe a fundação plantada) e 3.1 (a Agenda profissional, a frente de maior impacto visível do próximo ciclo).

> **Regra de corte se o prazo apertar:** sobrevivem a qualquer corte, nesta ordem: Fase 0 inteira → 1.1/1.2 (radares) → 1.17/1.18 (velocidade) → 1.8 (PDF) → prebuild com 2.1 e 2.3. Todo o resto pode escorregar uma semana sem dano estratégico. O que NÃO pode escorregar é a verificação do consent screen (0.2) e a correção do Data Safety (0.5) — são os dois únicos itens com risco real de loja.