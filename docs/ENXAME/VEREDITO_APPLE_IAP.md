# VEREDITO — Apple, IAP e a venda dentro do iPhone

**Data da apuração: 18/07/2026.** Todas as páginas da Apple citadas aqui foram abertas nesta data.
Este documento decide onde o dinheiro entra. Onde a evidência é fraca, está escrito que é fraca.

---

## 1. O VEREDITO EM 3 LINHAS

**DEPENDE — e depende de UMA coisa só: se o app iOS vende alguma coisa dentro dele.**

1. Se o OLLI **não vende nada** dentro do app no iPhone (estado atual do código), a Apple **não exige IAP** e **não cobra nada** — amparo na Guideline 3.1.3(f).
2. Se o OLLI **vende** dentro do app no iPhone — seja por Pix/processador alternativo, seja por link que abre o site — a Apple **exige que a Compra no App (IAP) exista e seja exibida com destaque igual ou superior** à opção alternativa, **mais** entitlement, disclosure sheet, relatório mensal e comissão de **10% a 21%**.
3. Ou seja: **não existe caminho "vender por fora sem construir a IAP"** no Brasil hoje. Existe "não vender no iOS" (0%) ou "construir a IAP de qualquer jeito e escolher quem processa" (10%–21%).

Fonte da trava, verbatim (página oficial da Apple em pt-BR, consultada 18/07/2026 — https://developer.apple.com/br/support/payment-options-on-the-app-store-in-brazil/):

> "Para garantir uma experiência de usuário consistente e transparente ao disponibilizar opções de pagamento alternativas para bens e serviços digitais dentro do seu app, você também deve apresentar a Compra no App com a Apple como opção ao mesmo tempo em que:
> - Oferecer pagamentos dentro do app usando um processador de pagamento alternativo.
> - **Direcionar os usuários para fora do seu app por meio de um link acionável** que abre o navegador e leva a um site destinado à compra de bens e serviços digitais."

> "A Compra no App com a Apple deve ser exibida com **destaque igual ou superior** ao de qualquer outra opção de pagamento apresentada."

---

## 2. A AFIRMAÇÃO CONTESTADA: "a premissa da Apple IAP está morta desde 18/06/2026"

**PROCEDE EM PARTE — a data é real, o fato é real, a conclusão é falsa.**

### O que é verdade
A data existe e é do Brasil. Apple Developer News, **18/06/2026** — https://developer.apple.com/news/?id=dhwadr2x, verbatim:

> "As part of a recent agreement with Brazil's competition regulator CADE (Conselho Administrativo de Defesa Econômica), Apple is introducing changes to iOS that create new options for developers' apps in Brazil. Beginning with iOS 26.5, developers can distribute apps on alternative app marketplaces, operate alternative app marketplaces, **process app payments for digital goods and services outside of Apple In-App Purchase in iOS**, and more."

Confirmado também em https://www.apple.com/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/ (18/06/2026) e na página técnica https://developer.apple.com/support/app-distribution-in-brazil.

Então **a IAP deixou de ser o ÚNICO caminho no Brasil**. Nesse sentido específico, quem disse "mudou em 18/06/2026" acertou, e a auditoria antiga ("a Apple EXIGE IAP") ficou desatualizada nessa data.

### Onde a leitura errou — três erros, em ordem de custo

**Erro 1 — confundiu "deixou de ser exclusiva" com "morreu".** A IAP continua obrigatória como opção exibida sempre que houver venda alternativa (citação da seção 1). Você não escapa de implementar StoreKit; você só ganha o direito de colocar um segundo botão do lado. Isso inverte o cálculo: o "caminho barato" custa **mais** trabalho de engenharia que o caro, não menos.

**Erro 2 — confundiu "sem IAP" com "sem comissão".** A comissão continua. Tabela verbatim de https://developer.apple.com/support/app-distribution-in-brazil:

| Cobrança | Taxa | Aplica-se a |
|---|---|---|
| App Store commission | **21%** | "Sale of digital goods or services (including using alternative payments within apps)" |
| App Store commission | **10%** | participantes do **App Store Small Business Program**, Mini Apps / Video / News Partner Program |
| App Store commission | **10%** | "Auto-renewable subscriptions after their first year" |
| Apple Payment Processing | **+5%** | "Payments processed by Apple In-App Purchase" |
| **Store services commission** | **15%** | "Out-of-app offers" |
| **Store services commission** | **10%** | out-of-app offers de participantes do SBP / assinaturas após o 1º ano |
| Core Technology Commission | **5%** | apps distribuídos por marketplaces alternativos |

Janela de cobrança, verbatim: *"Only sales made within 7 days of the link tap are subject to this commission."*

**Erro 3 — provável contaminação do caso dos EUA.** Nos EUA existe, hoje, um cenário de **comissão zero** em link externo — mas por ordem judicial, não por regra da Apple, e ele é instável. A District Court declarou a Apple em desacato em 30/04/2025 e proibiu qualquer comissão em compra por link; o 9º Circuito confirmou o desacato em 11/12/2025 **mas anulou a proibição total de comissão** e devolveu o caso; e a Suprema Corte aceitou o recurso (caso 25-1311) no fim de junho/2026 (fontes **secundárias**, sinalizadas como tal: https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/ e https://en.wikipedia.org/wiki/Epic_Games_v._Apple). **Nada disso vale no Brasil.** O regime brasileiro veio do TCC com o CADE e tem tabela de preço própria.

O texto das próprias Guidelines deixa a separação explícita — 3.1.1(a), verbatim (https://developer.apple.com/app-store/review/guidelines/, consultada 18/07/2026):

> "In all other storefronts, **except for the United States storefront**, where this prohibition does not apply, apps and their metadata may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase."

⚠️ **Achado que ninguém deve ignorar:** a palavra **"Brazil" não aparece em lugar nenhum das App Review Guidelines** (verificado hoje na página inteira). O único storefront nomeado como exceção no texto das Guidelines é o dos EUA. O regime brasileiro vive **fora** das Guidelines — numa página de suporte + no Attachment do contrato de desenvolvedor. A página das Guidelines **também não exibe data de última atualização**, o que impede datar com precisão a versão do texto citado. Isso é uma inconsistência real da documentação da Apple, não uma interpretação minha.

---

## 3. ONDE OS TRÊS ÂNGULOS DISCORDAM — e em quem confiar

Os três concordam no essencial (data real, Brasil, comissão continua). **Isso não é confirmação independente:** os três leram as **mesmas 2 ou 3 páginas da Apple**. A convergência prova que leram certo, não que a coisa funciona assim na prática. Nenhum dos três tem evidência de como o App Review está **aplicando** isso — o framework tem 1 mês de vida.

Divergências reais, com o desempate verificado por mim:

### 3.1 Link externo exige construir a IAP? — **A3 está certo; A1 e A2 erraram, e é o erro mais caro**
A1 e A2 leram só a página **em inglês**, que amarra a obrigação de IAP-lado-a-lado a pagamento alternativo *"within your app"*. Concluíram que o link externo era o caminho barato e limpo (10%–15%, sem IAP). A3 leu a página **em pt-BR** e viu que a obrigação cobre **os dois** casos, incluindo o link acionável.
**Verifiquei na fonte: A3 está certo** (citação na seção 1). Isso derruba a tese de que "link out" é uma rota que evita StoreKit.
**Lição operacional: a página pt-BR da Apple tem mais detalhe técnico que a EN. Ela é a fonte a usar.**

### 3.2 Existe identificador público do entitlement? — **A3 está certo**
A1 registrou "não achei o identificador na doc pública". A3 achou, na página pt-BR: **`com.apple.developer.storekit.custom-purchase-link.allowed-regions`**, com valor `["br"]`. Verifiquei — existe. Mesma causa: A1 não abriu a versão pt-BR.
A mesma página fixa o escopo, verbatim: *"O perfil do Entitlement é compatível e só pode ser usado com apps distribuídos na loja do Brasil em iPhones com **iOS 26.5 ou posterior**."*

### 3.3 QR code — **A1 está certo no fato, e o ponto dele é o mais subestimado pelos outros dois**
A2 e A3 nem trataram do assunto. A1 fez disso o eixo, e verifiquei: a frase proibitiva **continua literalmente viva** em 3.1.1 hoje:

> "Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, **QR codes**, cryptocurrencies and cryptocurrency wallets, etc."

Busquei "QR", "escaneado", "scan" nas páginas do Brasil (EN e pt-BR): **não aparecem**. Para contraste, na UE a Apple escreveu explicitamente que o link pode ser *"tapped, clicked, or scanned"* (https://developer.apple.com/news/?id=szrqxadx, 08/08/2024) — **o Brasil não ganhou frase equivalente**.
**Contexto que A1 não deu, e que importa:** o QR de Pix do OLLI é hoje um mecanismo **próprio** de venda, sem entitlement, sem PSP declarado, sem disclosure sheet. Sob o regime novo existe uma rota legal para pagamento alternativo dentro do app — mas ela **não é "colar um QR"**, é o pacote inteiro. A mudança de 18/06 **não legaliza retroativamente** o QR cru.

### 3.4 Crédito que expira — **A1 levantou um risco que não existe no OLLI**
A1 alertou sobre 3.1.1: *"Any credits or in-game currencies purchased via in-app purchase may not expire"*. A regra é real. Conferi o código: **os créditos do OLLI não expiram** — o que expira é a *cobrança* Pix (`expiresAt` em `src/services/pixCreditos.ts`), não o saldo. Não há lógica de validade em `worker/src/creditos.js`. **Risco descartado.**

### 3.5 Oferta externa por TEXTO ESTÁTICO (sem link) — **só A2 viu, e está certo em não resolver**
A2 foi o único a marcar isso como a pergunta de maior impacto financeiro. Verifiquei o texto pt-BR e ele empurra na direção de "sem link = sem comissão e sem obrigação de IAP", mas **nunca afirma isso**:
- A comissão: *"A comissão de serviços da loja é aplicável quando o seu app direciona usuários para ofertas e promoções disponíveis fora do app **por meio de links acionáveis**"* + janela de 7 dias contada do **toque no link**.
- As APIs: *"Se você oferece pagamentos dentro do app com um processador de pagamento alternativo ou direciona os usuários para ofertas de compras fora do app **com um link acionável**, também precisa usar as APIs StoreKit External."*
- A obrigação de IAP-lado-a-lado (seção 1) cobre só os dois bullets — nenhum deles é texto estático.
- E a página EN permite oferta externa *"whether or not you use an actionable link"*.

**Leitura literal:** texto estático → sem comissão, sem StoreKit External, sem IAP obrigatória.
**Por que NÃO tratar isso como decidido:** (a) a Apple não escreveu a frase; (b) o preâmbulo de 3.1.3 continua proibindo, fora dos EUA, *"encourage users to use a purchasing method other than in-app purchase"*; (c) 3.1.3(f) exige "no calls to action for purchase outside of the app" — texto estático dizendo "compre no nosso site" **é** call to action. **Ambiguidade real. Não resolvo com opinião.**

### 3.6 Quem eu considero mais confiável, no geral
**A3**, por margem: foi o único a usar a fonte pt-BR (que é a mais detalhada), o único a citar entitlement, disclosure sheet e regra de menor de 18, e o único a olhar o mercado real. **A1** é o mais valioso no ponto do QR code e no achado de que "Brazil" não existe nas Guidelines. **A2** é o mais valioso na cronologia regulatória e por ter isolado a ambiguidade do texto estático.
Ressalva sobre a parte de mercado de A3 (amostra de ERPs brasileiros na App Store): é **evidência fraca**. Observação de fichas de loja não revela regime contratual, e o framework tem 1 mês — ausência de apps vendendo por link externo não prova nada ainda. Trate como sinal, não como prova.

---

## 4. RECOMENDAÇÃO PARA O DONO

### Antes: o menu de 3 opções está mal posto
"(c) vender por link externo" **não é** uma alternativa a "(b) implementar IAP". Link acionável **exige** IAP construída e exibida com destaque igual ou superior. O menu real é:

| Caminho | Custo Apple | Engenharia | Reversível? |
|---|---|---|---|
| **(a) Não vender no iOS** (estado atual) | **0%** | zero — já está pronto | **SIM** |
| **(b) IAP pura** | 21%+5% = **26%**, ou **~15%** no Small Business Program | StoreKit + produtos + validação de recibo | Não (código fica) |
| **(c) IAP + link externo** | **15%** (ou **10%** no SBP), só em 7 dias do toque | StoreKit **+** entitlement **+** disclosure sheet **+** StoreKit External APIs **+** relatório mensal + tributos | Não |
| **(d) IAP + Pix dentro do app** | **21%** (ou **10%** no SBP) + custo do MP | tudo de (c) **+** PSP PCI Nível 1 + parental gate | Não |

Ganho real de (c) sobre (b), no SBP: **5 pontos percentuais**, comprados com entitlement, modal, API de relatório mensal e responsabilidade tributária. **Não são "30% contra 0%".**

### O QUE É REVERSÍVEL: (a) — e é o que eu recomendo manter agora

Sob incerteza, reversibilidade vale mais que otimização, e aqui a assimetria é grande:
- (a) já está implementado e é limpo. `src/screens/CreditosScreen.tsx` e `src/screens/PlanosScreen.tsx` isolam o desvio numa constante única (`const COMPRA_NO_APP = Platform.OS !== 'ios';`). **Ligar a venda depois é mudar uma constante, não reescrever telas.**
- (a) tem amparo escrito — 3.1.3(f), verbatim: *"Free apps acting as a stand-alone companion to a paid web based tool (i.e. VoIP, Cloud Storage, Email Services, Web Hosting) do not need to use in-app purchase, provided there is no purchasing inside the app, or calls to action for purchase outside of the app."*
- (a) custa **0%** e não gasta nenhum orçamento de revisão da Apple num app que ainda nem entrou na loja.
- (b), (c) e (d) só se justificam com **volume de iPhone medido**. Hoje esse número não existe. Pagar 15% a 26% sobre uma receita que ainda não foi observada é otimizar no escuro.

**Risco residual de (a), declarado:** 3.1.3(f) (que dispensa IAP) tem tensão com 3.1.3(b) Multiplatform Services, verbatim: *"Apps that operate across multiple platforms may allow users to access content, subscriptions, or features they have acquired in your app on other platforms or your web site, **including consumable items** in multi-platform games, **provided those items are also available as in-app purchases within the app**."* Os créditos de IA são consumíveis usados dentro do app — puxam para 3.1.3(b), que exigiria IAP. A assinatura encaixa limpo em 3.1.3(f). **Qual regra prevalece depende do revisor. É ambíguo na fonte.** Se rejeitarem, o custo é uma rejeição recuperável no Resolution Center — não banimento.

### Regra de decisão sugerida
Manter (a). Só reabrir a discussão quando **existir número**: se a receita atribuível a usuários de iPhone passar de um patamar que o dono defina (ex.: R$ X/mês), aí a conta 10% vs. 15% vs. 26% vira relevante e a engenharia se paga. Antes disso, é custo sem receita.

---

## 5. O QUE FICOU SEM RESPOSTA — e como o dono descobre

Em ordem de impacto financeiro.

**5.1 — Oferta externa só com TEXTO ESTÁTICO é comissionável? Exige IAP do lado?**
Maior impacto de todos: se a resposta for "não e não", existe um caminho de 0% mais rico que o (a) atual.
*Como descobrir:* consulta formal à Apple. A página https://developer.apple.com/support/app-distribution-in-brazil oferece agendamento de consultoria; alternativamente, App Store Connect → Contact Us → App Review. **Perguntar por escrito e guardar a resposta.** Não inferir da leitura.

**5.2 — A conta OLLI aceitou o Apple Developer Program License Agreement atualizado?**
O prazo era **06/07/2026** (verbatim, https://developer.apple.com/news/?id=dhwadr2x: *"By July 6, 2026, all current members of the Apple Developer Program will need to agree to the latest update..."*). **Hoje é 18/07/2026 — venceu.** Sem esse aceite, nada do regime brasileiro está destravado na conta.
*Como descobrir:* App Store Connect → Business (Agreements, Tax, and Banking), com a conta do Account Holder. **Leva 2 minutos e é o único item genuinamente urgente deste documento.** Não é o dono que decide — ou está aceito, ou não está.

**5.3 — O OLLI está inscrito no App Store Small Business Program?**
Todos os números bons (10% em vez de 21%, 15% em vez de 26%) dependem disso, e **a inscrição NÃO é automática**. Verbatim de https://developer.apple.com/app-store/small-business-program/: qualificam-se desenvolvedores com até **US$ 1 milhão** em proceeds no ano anterior e desenvolvedores novos na App Store; é preciso o Account Holder aceitar o **Paid Apps agreement (Schedule 2)** no App Store Connect e listar contas associadas.
*Como descobrir:* App Store Connect → Business. Se o caminho (b)/(c)/(d) for cogitado algum dia, **inscrever antes**.

**5.4 — 3.1.3(f) cobre um ERP com créditos de IA consumidos no app?**
A ambiguidade da seção 4. Os exemplos da Apple em 3.1.3(f) são todos de infraestrutura (VoIP, cloud, e-mail, hosting) — nenhum é ERP, nenhum tem crédito consumível.
*Como descobrir:* **submeter o build atual e ver.** É o teste mais barato disponível, porque o build já está no estado (a) e a rejeição é recuperável. A resposta do App Review vale mais que qualquer leitura. Se rejeitarem citando 3.1.3(b), aí — e só aí — a IAP entra na conversa.

**5.5 — QR code de Pix é "link acionável" no Brasil?**
Sem texto da Apple para o Brasil nos dois sentidos. A UE tem "scanned" escrito; o Brasil não tem. A proibição genérica de QR code em 3.1.1 continua vigente e sem exceção brasileira publicada.
*Como descobrir:* mesma consulta formal de 5.1. **Não presumir que está liberado.** Enquanto não houver resposta escrita, um QR de Pix dentro do app iOS é o pior lugar para apostar.

**5.6 — Como o App Review está aplicando o regime brasileiro na prática?**
Ninguém sabe: 1 mês de vigência, exige iOS 26.5, e as APIs ainda estão em movimento (a página da Apple diz que uma API de sistema vai substituir o disclosure sheet customizado numa versão futura do iOS).
*Como descobrir:* só com o tempo, ou pelo Apple Developer Forums. **Motivo adicional para não ser o primeiro a testar com dinheiro.**

---

## RESUMO DE UMA LINHA

A auditoria antiga estava certa até 17/06/2026 e errou a taxa; a análise nova acertou a data e errou a conclusão; **o certo é que no Brasil a IAP deixou de ser exclusiva mas não deixou de ser obrigatória quando se vende dentro do app — e por isso a decisão barata, correta e reversível é continuar não vendendo no iOS até existir número de iPhone que justifique 10%–26%.**

---

### Fontes primárias (todas consultadas em 18/07/2026)
- App Review Guidelines — https://developer.apple.com/app-store/review/guidelines/ (sem data de atualização exibida; "Brazil" não aparece na página)
- Payment options on the App Store in Brazil (pt-BR, **a mais completa**) — https://developer.apple.com/br/support/payment-options-on-the-app-store-in-brazil/
- Changes to iOS in Brazil (suporte, EN) — https://developer.apple.com/support/app-distribution-in-brazil
- Changes to iOS in Brazil (Developer News, 18/06/2026) — https://developer.apple.com/news/?id=dhwadr2x
- Apple announces changes to iOS in Brazil (Newsroom, 18/06/2026) — https://www.apple.com/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/
- App Store Small Business Program — https://developer.apple.com/app-store/small-business-program/
- Updated guidelines now available (EUA, 01/05/2025) — https://developer.apple.com/news/?id=9txfddzf
- StoreKit External Purchase Link Entitlement, UE ("tapped, clicked, or scanned", 08/08/2024) — https://developer.apple.com/news/?id=szrqxadx

### Fontes secundárias (sinalizadas — não usar para decidir sozinhas)
- CADE, homologação do TCC (23/12/2025) — https://www.gov.br/cade/pt-br/assuntos/noticias/cade-forma-maioria-pela-homologacao-de-tcc-em-investigacao-sobre-praticas-da-apple-no-ios
- 9º Circuito, 11/12/2025 — https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf
- SCOTUS, cert concedido (fim de junho/2026), caso 25-1311 — https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/

### Código do OLLI referenciado
- `src/screens/CreditosScreen.tsx` — `const COMPRA_NO_APP = Platform.OS !== 'ios';`
- `src/screens/PlanosScreen.tsx` — mesma constante
- `src/services/pixCreditos.ts` — `expiresAt` é da cobrança Pix, não do saldo
- `worker/src/creditos.js` — sem lógica de expiração de crédito
