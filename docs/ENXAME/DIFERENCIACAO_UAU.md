# DIFERENCIAÇÃO — onde está o "uau" (e por que você não está vendo)

**Data:** 18/07/2026 · **Escopo:** leitura de `src/` (95 telas), `webapp/src/`, `worker/src/`, `web/`
**Regra deste documento:** nada aqui é proposto sem eu ter aberto o código primeiro. Onde a coisa
já existe, eu digo que existe e digo onde. Preço de API foi pesquisado hoje, com URL.

**Câmbio assumido nas contas: R$ 5,50/US$.** Confira antes de fechar qualquer preço de plano.

---

## VEREDITO — a resposta curta para "não estou vendo o efeito uau"

O uau existe. Ele está construído, testado e comentado com um cuidado que eu raramente vejo.
**Ele só não está na tela que você abre.**

Você testa em `app.olliorcamentos.online` (o painel React, `webapp/`). As três funções mais
mágicas do OLLI moram no app Expo (`src/`) e **duas delas nunca foram portadas para o painel**:

| Função mágica | Onde está | Está no painel web? |
|---|---|---|
| Radar de reconquista — "faz 6 meses que você não vai lá" (`src/services/radarClientes.ts`) | HomeScreen, ClientesScreen, InicioDesktopScreen | **NÃO** |
| Radar de cobrança — "aprovado sem recibo = dinheiro parado" (`src/services/radarCobranca.ts`) | HomeScreen, InicioDesktopScreen | **NÃO** (só existe o KPI passivo "a receber") |
| Radar de follow-up — proposta parada há 3 dias (`src/services/radarFollowUp.ts`) | HomeScreen | **SIM** — é o `ParadosCard.tsx` |
| Ritual diário — bom dia / fechar o dia / domingo (`src/services/ritualDiario.ts`) | notificações do app | **NÃO** (painel web não tem push) |
| Relatório do dia FALADO em voz alta (`relatorioDia.falarRelatorio`) | RelatorioDiaScreen | **NÃO** — a rota `relatorios` nem existe em `webapp/src/routes/sections/dashboard/frontend.tsx` |
| PMOC (motor de 723 linhas, geração idempotente de OS) | PmocPlanoScreen + desktop | **NÃO** |
| Olli Voz — falar e virar orçamento | OlliVozScreen (1.686 linhas) | **NÃO** |

Comparei a lista de rotas do painel (15 rotas) com a do app (38 telas + 22 desktop). O painel é
o **cadastro** do OLLI. O app é o **produto**. Você está avaliando o uau olhando para a metade
sem alma.

**Isso muda a ordem das minhas recomendações.** A ideia nº 1 deste documento não é uma feature
nova — é portar para o painel o que você já pagou para construir. É a única coisa aqui com
esforço P e retorno imediato.

Segunda causa, menor mas real: mesmo no app, os radares aparecem como *cards no meio de uma
lista de cards*. Um aviso que vale R$ 800 tem o mesmo peso visual de um contador de orçamentos.
Uau não é o que o app faz — é o que o app faz **você notar**.

---

## PARTE 1 — INVENTÁRIO HONESTO

Legenda: **(a)** existe e é boa — defensável na frente de concorrente · **(b)** existe e é
genérica — qualquer concorrente tem igual ou melhor · **(c)** existe pela metade.

### Comercial

| Ferramenta | O que faz | Nível |
|---|---|---|
| `NovoOrcamentoScreen` + `steps/` | Orçamento em passos, itens do catálogo, fotos, formas de pagamento | **(b)** todo mundo tem |
| `pdfGenerator.ts` (989 linhas) | PDF com capa (logo/foto/nenhuma), modelo escolhível, cor da marca extraída da logo, Pix Copia-e-Cola, **QR de Aprovar e QR de Recusar**, depoimentos de outros clientes, white-label no Pro | **(a)** — e é a coisa mais forte do produto. Ver "Parte 3, ideia 3" |
| `ModelosDocumentoScreen` | Escolhe modelo de PDF e de recibo com prévia real | **(a)** raro no BR |
| `clienteLink.ts` + `worker/src/link.js` | Link `/o/<token>`: cliente abre no navegador, vê o orçamento, **aprova ou recusa com motivo, sem instalar nada**. Token de 128 bits, XSS escapado | **(a)** |
| Trilha do cliente (`trilhaDoLink`) | Registra enviado → **visualizado** → aprovado/recusado + motivo | **(a)** — "ele abriu e não respondeu" é ouro comercial |
| `OrcamentosScreen` / `orcamentos` (painel) | Lista, filtro por status | **(b)** |
| `EmitirReciboScreen` + `reciboPdf.ts` | Recibo com modelo próprio | **(b)** |
| `radarFollowUp.ts` / `ParadosCard.tsx` | Proposta parada 3+ dias → botão de WhatsApp com texto pronto | **(a)** |
| `radarCobranca.ts` | Aprovado sem recibo → WhatsApp **com Pix Copia-e-Cola já embutido com valor** | **(a)** — só que invisível no painel |
| `radarClientes.ts` | Cliente sumido há 150 dias com histórico real → mensagem de reconquista | **(a)** — idem |
| `Depoimento` no PDF | Prova social do próprio prestador dentro da proposta | **(a)** ninguém no BR faz isso |

### Operação de campo

| Ferramenta | O que faz | Nível |
|---|---|---|
| `OrdemServicoScreen` (1.425 linhas) | OS com status, técnico, checklist, fotos, valor | **(c)** — **não tem assinatura do cliente**. Ver "Parte 2" |
| `checklistVertical.ts` | Checklist pronto por ofício, na ordem real do serviço, começando por segurança | **(a)** |
| `AgendaScreen` + `googleAgenda.ts` | Agenda com detecção de conflito e sync Google Calendar | **(b)** |
| `eta.ts` + `EtaChip` | ETA com trânsito real (Routes API) | **(a)** poucos têm |
| `localizacaoEquipe.ts` + `EquipeAoVivoScreen` | Última posição de cada técnico | **(b)** Auvo/Field Control fazem melhor |
| `equipamentos.ts` + `etiquetaQrPdf.ts` + `EscanearQrScreen` | Inventário + etiqueta QR + leitor | **(a)** |
| `pmoc.ts` (723 linhas) + telas | Plano PMOC versionado, geração idempotente de OS, aprovação por responsável técnico, **sem afirmar conformidade legal** | **(a)** — o caveat legal é honestidade que concorrente não tem |
| `pmocLembretes.ts` | Lembrete do ciclo | **(b)** |
| `CertificadoAnvisaScreen` (189 linhas) | Certificado de higienização | **(c)** — fino demais perto do resto |
| `TecnicoHomeScreen` | Home reduzida do técnico | **(b)** |

### IA e voz

| Ferramenta | O que faz | Nível |
|---|---|---|
| `OlliVozScreen` (1.686 linhas) + `worker/src/voz.js` | Fala → itens de orçamento. Tem modo **conversa** (a Olli pergunta de volta o que falta) | **(a)** o modo conversa é bom — mas **não é mais exclusivo**, ver Parte 2 |
| `olliIA.ts` + `DiagnosticoIAScreen` | Diagnóstico por marca/modelo/código/sintoma, com 3 camadas: cache SQLite → IA → base de 698 códigos offline | **(a)** o fallback offline é raríssimo |
| `CodigosErroScreen` | Busca na base de 698 códigos | **(a)** |
| `OlliChatScreen` + `olliAssistente.ts` | Chat com a Olli | **(b)** |
| `relatorioDia.ts` | Compila o dia **e fala em voz alta** (expo-speech, on-device, custo zero) | **(a)** |
| `ritualDiario.ts` | Notificação de bom dia (o que tem hoje), fechar o dia, revisão de domingo | **(a)** |
| `erroIA.ts` / `SinalizarIA` / `EstadoIA` | Estados honestos de falha de IA (timeout ≠ offline ≠ servidor) | **(a)** disciplina, não feature |

### Ferramentas de ofício

| Ferramenta | O que faz | Nível |
|---|---|---|
| `calculosOficio.ts` (1.100 linhas) | Calculadoras por vertical, ancoradas em NBR/fórmula real, offline, com `aviso` quando não há norma única | **(a)** |
| `verticais.ts` + `useVerticais` | CNAE → vertical deduzida; sem ofício vê tudo, só esconde o de outra vertical | **(a)** |
| `CalculadoraTintaScreen` (144 linhas) | Tinta | **(c)** — duplica o que `calculosOficio` já faz melhor |
| `FerramentasOficioScreen` | Renderiza as calculadoras da vertical | **(a)** |

### Dinheiro e conta

| Ferramenta | Nível |
|---|---|
| Planos Grátis / Pro R$39 / Empresa R$99 (`planos-base.ts`) | **(c)** — Empresa **sem enforcement** (já registrado em memória: paywall Empresa ausente) |
| `creditos.ts` + `CreditosScreen` + `mercadopago.js` | **(c)** — MP pronto e testado, falta só `MP_WEBHOOK_SECRET` (passo humano) |
| KPIs do painel (`financeiro.ts`) | **(a)** — a regra "NÃO SEI ≠ ZERO" (devolve `semValor`/`semData` junto do total) é honestidade contábil que nenhum concorrente tem |
| `MeuNegocioScreen`, `extrairCoresLogo.ts` | **(a)** cor da marca saindo da logo é detalhe caro |
| `lixeira.ts`, `autoBackup.ts`, `cloudSync.ts` | **(b)** |
| `EquipeScreen`, `ConviteScreen`, `entitlementEquipe.ts` | **(c)** — Equipe funciona de graça |

### Placar honesto
**(a) 22 · (b) 12 · (c) 8.** Isso é excelente para um produto desta idade. O problema **não é
falta de ferramenta.** É que 6 das 22 melhores só existem na superfície que você não abre.

---

## PARTE 2 — O CONCORRENTE

### Brasil

| Produto | Preço | O que tem que o OLLI não tem |
|---|---|---|
| **Conectar Sistemas** ([conectarplay.com](https://conectarplay.com/)) | **R$ 79,90/mês, usuários ilimitados** | **Assinatura digital do cliente na OS**, **app do CLIENTE** (abre chamado, acompanha o técnico, vê histórico), estoque de **gases refrigerantes** com baixa automática na OS, boleto+Pix, DRE e fluxo de caixa |
| **Produttivo** ([produttivo.com.br](https://produttivo.com.br/)) | sob consulta, trial 15 dias | **Manu IA: áudio do técnico → campos do relatório preenchidos**, chamado nascendo de mensagem no WhatsApp, roteirização, integração Omie/Conta Azul |
| **Auvo** ([auvo.com](https://www.auvo.com/)) | sob consulta (entrada alta) | Roteirização avançada, IA **NIKA** para redigir laudos e orçamentos, escala para equipe grande |
| **Field Control** ([fieldcontrol.com.br](https://fieldcontrol.com.br/)) | sob consulta | Formulários customizáveis, integração Omie |
| **Tecniko** ([tecniko.app](https://tecniko.app/blog/alternativa-ao-auvo)) | **a partir de R$ 59,90, com plano grátis PERMANENTE** | Plano grátis sem cartão, IA NIKA para laudo/orçamento |

### Exterior (para saber para onde a categoria vai)
- **Jobber**: **AI Receptionist** — atende o telefone quando o prestador não pode, tira dúvida e
  agenda no calendário 24/7. US$29/mês por 30 conversas, US$0,79 por conversa extra; incluso no
  plano Plus (US$399–499/mês). [getjobber.com](https://www.getjobber.com/comparison/jobber-vs-housecall-pro/)
- **Housecall Pro**: US$59 (1 usuário) → US$149 Essentials. Booking online + QuickBooks.

### As três conclusões que doem

1. **Voz não é mais o diferencial.** Produttivo tem Manu IA (áudio→relatório) e Auvo/Tecniko têm
   NIKA (laudo/orçamento). O `OlliVozScreen` continua ótimo, mas se a landing vender "fale e vire
   orçamento" como o grande truque, você está vendendo paridade como se fosse mágica.
2. **Falta uma coisa que TODOS têm: assinatura do cliente.** Varri `src/` — não existe captura de
   assinatura em lugar nenhum. `AssinaturaScreen` é *assinatura de plano*, não rubrica. `OrdemServico`
   (types/index.ts:586) tem checklist e fotos e nenhum campo de assinatura. Isso não é uau — é
   **pré-requisito**. Um prestador que vem do Conectar vai perguntar na primeira semana.
3. **O que NINGUÉM tem:** ninguém entrega um *documento para o cliente final* comparável ao PDF do
   OLLI (QR de aprovar/recusar + Pix embutido + depoimentos + white-label). Ninguém sugere preço a
   partir do histórico do próprio prestador. Ninguém diz "não sei" em vez de "R$ 0,00". E ninguém
   diagnostica por foto.

---

## PARTE 3 — O UAU

Critério: economiza tempo visível, faz ele parecer profissional na frente do cliente, ou traz
dinheiro. As 5 primeiras cabem nas próximas semanas.

---

### 1. Levar os radares para o painel — e dar a eles o palco que merecem
**Esforço: P (o motor está pronto) · Custo por uso: R$ 0 · Se a rede cair: é leitura do que já
está em cache; degrada como qualquer lista do painel.**

**O que o prestador vê:** ao abrir o painel, antes de qualquer KPI, uma faixa:
> **R$ 2.340 esperando você.** 3 orçamentos aprovados sem pagamento registrado · 2 clientes sumidos
> há mais de 5 meses. [Cobrar os 3] [Ver os 2]

Cada botão abre o WhatsApp com o texto pronto — e no caso da cobrança, **com o Pix Copia-e-Cola
já com o valor embutido** (`radarCobranca.ts` já pré-computa isso).

**Por que é uau:** é o app dizendo um número em reais que ele não sabia, e entregando a ação em um
toque. Nenhum concorrente brasileiro abre o dia com "aqui está seu dinheiro parado, cobre agora".

**O que já existe:** `radarCobranca.ts`, `radarClientes.ts`, `radarFollowUp.ts` — completos, com
`mensagemCobranca`/`mensagemReconquista` já montando o texto. `ParadosCard.tsx` no painel é o molde
exato de UI a copiar. **Falta só o adaptador de leitura**: os radares leem de `database.ts` (SQLite);
o painel lê de Supabase via `useOlliList`. Reescrever as três funções contra as `Row` do painel é
trabalho mecânico de meio dia cada — a *regra* não muda.

**Risco:** duplicar a regra de negócio em dois lugares e elas divergirem. Mitigação: extrair as três
para funções puras que recebem as listas (exatamente o padrão que `financeiro.ts` já usa no painel),
e as duas superfícies chamam a mesma função.

---

### 2. A Olli sugere o preço — a partir do histórico DELE
**Esforço: M · Custo por uso: R$ 0 (é SQL/JS local, sem IA) · Se a rede cair: funciona 100%.**

**O que o prestador vê:** ao adicionar "Limpeza de split 12.000" no orçamento, abaixo do campo:
> Você cobrou isso 14 vezes. **Mais comum: R$ 180.** Faixa: R$ 150 a R$ 260.
> Nos 4 que você cobrou acima de R$ 220, **3 foram aprovados.**

**Por que é uau:** o medo nº 1 do autônomo brasileiro é errar o preço — cobrar de menos e trabalhar
de graça, ou cobrar de mais e perder. O app responde com o dado **dele**, não com uma tabela de
mercado que ele não confia. E a segunda linha é a que arrepia: *"quando você teve coragem de cobrar
mais, o cliente aceitou"*. Isso muda o comportamento dele e aumenta o ticket — o que aumenta o valor
percebido do OLLI.

**O que já existe:** `getOrcamentos()` já traz todos os orçamentos com itens; `Orcamento.status` já
distingue aprovado/recusado; `getServicos()` já é o catálogo. O casamento item↔serviço é por
`servicoId` quando veio do catálogo, e por nome normalizado (`norm()` de `olliIA.ts`) quando digitado.

**Risco real:** com menos de ~5 registros do mesmo item a sugestão é ruído. **Regra dura: abaixo de
5 ocorrências, não mostra nada.** Não invente faixa com 2 pontos — isso quebra a confiança e é
exatamente o bug "não sei virou número" que já derrubou o produto antes.

---

### 3. Deixar o documento do cliente ser *inegavelmente* o melhor do Brasil
**Esforço: P a M · Custo por uso: R$ 0 · Se a rede cair: o PDF é gerado local; só o QR do link
público precisa de nuvem, e `pdfGenerator` já degrada para texto quando não há `linkPublico`.**

Este já é seu maior ativo. Faltam três toques baratos que transformam bom em memorável:

**3a. Antes e depois lado a lado (P).** `fotosOrcamento.ts` já captura e comprime. Marcar uma foto
como "antes" e outra como "depois" e o PDF renderizar o par em duas colunas com legenda. É a foto
que o cliente **manda para o marido**. É o marketing mais barato que existe e o Produttivo já vende
"relatório fotográfico" como funcionalidade principal.

**3b. Assinatura do cliente na tela (M).** O gap da Parte 2. Canvas de dedo → PNG → dentro do PDF da
OS e do recibo, com data/hora e (opcional) coordenada. Fecha a paridade com Conectar/Produttivo/Auvo
de uma vez. **Não é uau — é a licença para competir.** Fazer junto com 3a, no mesmo PDF.

**3c. Uma linha de honestidade que ninguém escreve (P).** No rodapé do orçamento:
> *Este orçamento vale até 15/08. Depois dessa data os preços podem mudar — chame que eu refaço.*

Você já tem `validade`. Está no PDF como campo, não como frase humana. Frase humana em documento
técnico é o que faz o cliente do prestador confiar nele.

**Risco:** peso do PDF. Fotos antes/depois em par podem estourar o tamanho no WhatsApp.
`fotosOrcamento` já comprime — validar o teto (o WhatsApp corta ~100 MB, mas rede de campo sofre
bem antes disso). Teste com 8 pares antes de soltar.

---

### 4. Foto do equipamento vira diagnóstico
**Esforço: M · Custo por uso: ~R$ 0,015 por foto · Se a rede cair: cai no fluxo de texto que já
existe (marca/modelo/sintoma) e na base de 698 códigos offline.**

**O que o prestador vê:** aponta a câmera para a placa/plaqueta/vazamento. A Olli responde:
> Split Midea 12.000, plaqueta legível: modelo MSAF-12CRN1. Mancha de óleo perto da conexão da
> sucção = **vazamento na porca flare**, causa mais comum nesse modelo. Confirme com detector.
> [Puxar diagnóstico completo] [Virar item de orçamento]

**Por que é uau:** ele não precisa digitar marca nem modelo — de luva suja, com o cliente olhando.
E a leitura da plaqueta sozinha já paga: transcrever plaqueta de ar-condicionado em cima de escada
é uma das piores tarefas do ofício.

**Custo real, com conta na mão:** Gemini 2.5 Flash cobra **US$ 0,30 por 1M tokens de entrada
(texto/imagem/vídeo)** e **US$ 2,50 por 1M de saída**
([ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)). Uma foto
comprimida + prompt ≈ 1.500 tokens de entrada; resposta ≈ 800 de saída.
→ (1.500 × 0,30 + 800 × 2,50) / 1.000.000 = **US$ 0,00245 ≈ R$ 0,013 por foto.**
Mil diagnósticos por foto no mês = **R$ 13**. Com Flash-Lite (US$0,10/US$0,40) cai para ~R$ 0,003.
Cabe no sistema de créditos que já existe sem repensar preço de plano.

**O que já existe — e isto é o achado que barateia tudo:** `worker/src/gemini.js` **já aceita
`userParts` com `inline_data`** (foi construído assim para mandar áudio junto do prompt em
`/transcrever`). Mandar imagem é o mesmo caminho, mesmo formato. `fotosOrcamento.ts` já faz
câmera + compressão. `olliIA.ts` já tem cache SQLite, timeout de 30s, cancelamento e fallback para
a base offline. **A infraestrutura inteira está pronta; falta o campo `imagem` no contrato e o
prompt.**

**Risco:** IA errando com confiança na frente do cliente. Regra: a resposta da foto é sempre
**hipótese**, nunca laudo — mesma disciplina de `pmoc.ts` com conformidade legal. E a foto vai
para a IA, então precisa de aviso claro de privacidade (o `analyticsScrub.ts` mostra que essa
disciplina já existe na casa).

---

### 5. "Esse orçamento vai ser recusado" — o aviso antes do envio
**Esforço: M · Custo por uso: R$ 0 (regra local, sem IA) · Se a rede cair: funciona 100%.**

**O que o prestador vê:** antes de tocar em "Enviar":
> ⚠️ Você já mandou 3 orçamentos acima de R$ 1.200 sem parcelamento. **Nenhum foi aprovado.**
> Os 9 que você parcelou nessa faixa: 7 aprovados. [Oferecer em 3x] [Mandar assim mesmo]

**Por que é uau:** o app está olhando o passado dele e prevendo o futuro. Não é IA, é contagem — e
por isso é confiável e explicável ("nenhum foi aprovado" é auditável, ele pode conferir).

**O que já existe:** `Orcamento.status` distingue `recusado` de `aprovado`; `trilhaDoLink` guarda
até o **motivo da recusa** que o cliente digitou; formas de pagamento já são campo
(`formasPagamentoPadrao.ts`). Bastam 3 ou 4 regras contáveis: faixa de valor × parcelamento,
faixa de valor × cliente novo vs. recorrente, prazo de validade curto demais, e "esse cliente já
recusou 2 vezes acima de R$ X".

**Risco — o maior deste documento:** falso positivo que faz o prestador *não* mandar um orçamento
bom. Mitigação: nunca bloquear, nunca esconder o botão de enviar, sempre mostrar a contagem crua
que gerou o aviso. E piso alto de amostra (mínimo 8 orçamentos na faixa). Com pouco dado, cale a boca.

---

### 6–10 — a fila de trás (bons, mas não são as próximas semanas)

**6. Passaporte do equipamento (M).** O QR da etiqueta já existe (`worker` resolve `GET /q/<token>`).
Falta a página pública ser *bonita e para o cliente*: "Split da sala — 4 manutenções, última em
12/03/2026 por João Silva, próxima prevista 12/09". O cliente escaneia com a câmera do celular, sem
app. **É o Conectar's "app do cliente" sem construir app nenhum.** Custo R$ 0. Risco: exposição de
dado — o token é a única credencial, mostrar só o mínimo (nunca valor cobrado, nunca telefone).

**7. Fechamento do mês em voz (P).** `relatorioDia.falarRelatorio` já fala o dia com expo-speech
(on-device, **custo zero** — não precisa do Google TTS, que custaria US$30/1M caracteres). Um
`relatorioParaTexto` mensal e o botão "Ouvir o mês" reaproveita 90% do código. Uau para quem dirige
entre atendimentos.

**8. Recibo que já nasce cobrado (P).** O `radarCobranca` já monta Pix com valor. Falta o caminho
inverso: recibo emitido → botão "Cobrar agora" no mesmo lugar. Fecha o ciclo em uma tela só.

**9. Chamado nascendo do WhatsApp (G).** O que o Produttivo vende. **Custo real:** WhatsApp Business
Platform passou a faturar em **BRL desde 01/07/2026**; mensagem de **utilidade ~R$ 0,04–0,05**,
**marketing ~R$ 0,31–0,38**, e **resposta dentro da janela de 24h do cliente é grátis**
([developers.facebook.com](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
[messagecentral](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil)).
Hoje o OLLI usa `wa.me` (grátis, manual, sem verificação). Migrar para a API exige verificação de
negócio, número dedicado e um custo variável que hoje é zero. **Adiar** — ver "o que NÃO fazer".

**10. Atendente que agenda sozinha (G).** O AI Receptionist do Jobber (US$29/mês por 30 conversas).
É para onde a categoria vai. **Não é para 2026 no OLLI**: exige telefonia, e telefonia no Brasil
para autônomo é um produto inteiro, não uma feature.

---

## O QUE MATAR (6 excelentes > 20 medianas)

| Cortar | Por quê |
|---|---|
| **`CalculadoraTintaScreen`** (144 linhas, rota própria) | `calculosOficio.ts` já faz cálculo de tinta melhor, ancorado em norma, dentro de `FerramentasOficioScreen`. Duas portas para a mesma coisa, uma pior. Apagar a rota, manter a de dentro das ferramentas. |
| **`CertificadoAnvisaScreen`** (189 linhas) | Fino demais perto do PMOC de 723 linhas ao lado. Ou vira parte do fluxo de PMOC/OS (o certificado sai do serviço executado, não de uma tela avulsa) ou sai. Do jeito que está, é uma promessa que decepciona quem abre. |
| **`OlliChatScreen`** (456 linhas) | Chat genérico competindo com o próprio ChatGPT que o prestador já tem no celular. A IA da Olli só vence onde ela **conhece os dados dele** — diagnóstico, voz→orçamento, preço sugerido. Chat solto é (b) para sempre. Realocar o esforço para as ideias 2 e 4. |
| **`EquipeAoVivoScreen`** — como está | Rastreamento é o campo de batalha do Auvo/Field Control, que têm anos de vantagem. Você não vai ganhar aí, e é a feature que mais consome bateria e mais gera atrito com o técnico. Manter como "última posição conhecida" (o que já é), **nunca** investir em rastreamento contínuo. |
| **Plano "Empresa" sem enforcement** | Já registrado: existe plano pago sem paywall. Um plano que não existe de verdade é pior que não ter plano — cria promessa que o produto não cumpre. Decisão do dono, mas não pode ficar em cima do muro. |
| **Rotas placeholder no painel** | `OlliPlaceholderPage` existe e está órfã (nenhuma rota a usa). Ou some, ou vira a ponte honesta enquanto PMOC/Relatórios/Voz não chegam ao painel. Um "Chegando já" é honesto; um menu que não existe é pior. |

---

## O QUE **NÃO** FAZER (e por quê)

1. **Não migrar para a WhatsApp Business API agora.** Custo variável real (R$0,04–0,38/mensagem),
   verificação de negócio, número dedicado, e o `wa.me` atual entrega 80% do valor por R$ 0. O momento
   de migrar é quando o volume justificar — não antes.
2. **Não investir em rastreamento em tempo real.** Ver acima. Bateria + atrito + concorrente
   entrincheirado.
3. **Não fazer mais animação.** Você tem `AuroraBackground`, `Celebracao`, `CountUp`, `Revelar`,
   `AnimatedEntrance`, `OverlayProgresso`. Não é isso que falta. Para o prestador com luva suja e
   cliente esperando, o uau é um número em reais aparecendo, não um fade.
4. **Não colocar IA em cima de pouco dado.** Ideias 2 e 5 são as mais valiosas *e* as mais fáceis de
   quebrar. Com amostra pequena elas mentem — e uma mentira sobre dinheiro apaga a confiança em tudo
   o que veio antes.
5. **Não construir chat/atendente.** Ver "matar".
6. **Não vender voz como diferencial na landing.** Produttivo (Manu IA) e Auvo/Tecniko (NIKA) já
   têm. Vender paridade como mágica é o jeito mais rápido de perder credibilidade com quem já testou
   o concorrente.

---

## O RANKING, em uma linha cada

1. **Radares no painel** — P · R$0 · o uau já está pago, só não está na tela.
2. **Preço sugerido pelo histórico** — M · R$0 · ninguém no BR tem, e resolve o medo nº1 dele.
3. **Documento do cliente: antes/depois + assinatura + validade humana** — P/M · R$0 · seu maior ativo, e fecha o gap de paridade.
4. **Foto vira diagnóstico** — M · R$0,013/foto · a infra do worker já aceita `inline_data`.
5. **Aviso de recusa provável** — M · R$0 · contagem, não IA; explicável e auditável.
6. Passaporte do equipamento por QR · 7. Fechamento do mês falado · 8. Recibo já cobrado ·
9. Chamado do WhatsApp (adiar) · 10. Atendente por telefone (não agora).

---

## Fontes

- [Gemini API — pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [WhatsApp Business Platform — pricing (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [WhatsApp Business API pricing Brazil 2026 — Message Central](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil)
- [Google Cloud Text-to-Speech — pricing](https://cloud.google.com/text-to-speech/pricing)
- [Conectar Sistemas](https://conectarplay.com/) · [Produttivo](https://produttivo.com.br/) · [Auvo](https://www.auvo.com/) · [Field Control](https://fieldcontrol.com.br/) · [Tecniko vs Auvo](https://tecniko.app/blog/alternativa-ao-auvo)
- [Jobber vs Housecall Pro 2026](https://www.getjobber.com/comparison/jobber-vs-housecall-pro/) · [Jobber AI Receptionist](https://help.getjobber.com/hc/en-us/articles/25315927533847-Receptionist-powered-by-Jobber-AI)
