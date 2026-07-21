# VISÃO DE LONGO PRAZO — síntese do Fable

> Escrito em 18/07/2026, depois de ler os cinco documentos do enxame
> (`IDEIA_ETA_TRANSITO.md`, `APIS_E_INTEGRACOES.md`, `IDENTIDADE_APP_SITE.md`,
> `TEMA_CLARO.md`, `DIFERENCIACAO_UAU.md`), mais `ENGAJAMENTO_VISAO.md`,
> `COMUNICACAO_VISAO.md`, `INTEGRACOES_IDEIA.md`, `AUDITORIA_RISCO.md`,
> `BLOQUEIOS.md` e `MISSAO.md`. Os fatos de código citados aqui eu reconferi
> com grep antes de escrever (assinatura, radares no painel, `departureTime`).
>
> Este documento discorda dos especialistas em três pontos, e diz onde.

---

## 1. O que o OLLI é, em uma frase

**O OLLI é o sócio de bolso do prestador que trabalha sozinho: enquanto ele está
com a mão na massa, o OLLI vigia o dinheiro parado, os clientes esfriando e o
dia de amanhã — e devolve cada aviso com a ação pronta em um toque, calculada
com o dado dele, nunca com achismo.**

O teste da frase é que nenhum concorrente pode dizê-la:

- **Auvo e Field Control** são ferramentas do *gestor* que administra técnicos.
  O sócio deles é o dono da empresa de 15 caminhões, não o cara sozinho.
- **Conectar** é um ERP de escritório (R$ 79,90, usuários ilimitados). Ele
  registra o que aconteceu; não vigia nada, não avisa nada.
- **Produttivo** é formulário e relatório. Preenche bem; não olha o dinheiro.
- Nenhum deles abre o dia dizendo *"R$ 2.340 esperando você — cobre agora"*
  com o Pix já montado. O OLLI já tem esse código pronto
  (`src/services/radarCobranca.ts`). É a frase virando tela.

A consequência prática da frase: **tudo que não for "vigiar e devolver ação
pronta" é dispersão.** Chat genérico, calculadora avulsa, mapa embutido,
rastreamento — nada disso é o sócio de bolso. O DIFERENCIACAO_UAU contou o
inventário: 22 ferramentas nível (a), 12 nível (b), 8 nível (c). O produto não
precisa de mais ferramentas. Precisa que as 22 boas se comportem como a frase.

---

## 2. Por que você não está vendo o uau

Diagnóstico, não consolo. São quatro causas, e nenhuma é "falta feature".

### 2.1 Você está olhando pela janela errada

Você testa em `app.olliorcamentos.online` — o painel React. As funções que
justificam o produto moram no app Expo e **não foram portadas**:

| O que impressiona | Está no app | Está no painel |
|---|---|---|
| Radar de cobrança (R$ parado + Pix pronto) | sim | **não** (conferi: zero imports de `radar*` em `webapp/src`) |
| Radar de reconquista (cliente sumido) | sim | **não** |
| Ritual "Bom dia da OLLI" / "Fechar o dia" | sim (Onda 20) | não (sem push) |
| Voz → orçamento | sim (1.686 linhas) | não |
| PMOC (723 linhas) | sim | não |
| Relatório do dia falado | sim | não |

O painel tem 15 rotas de cadastro; o app tem 61 telas de produto. **Você está
avaliando o uau olhando para a metade sem alma** — o DIFERENCIACAO_UAU está
certo nisso e é o achado mais importante dos cinco documentos.

### 2.2 O uau que existe não tem palco

Mesmo no app, o radar que vale R$ 800 é um card com o mesmo peso visual de um
contador de orçamentos. Uau não é o que o app faz — é o que o app **faz você
notar**. Um aviso de dinheiro precisa abrir a tela, não morar no meio dela.

### 2.3 A roupa contradiz o produto

Três medições dos especialistas explicam o "não está legal" que você sentiu:

- **O modo claro não tem escada.** O cartão está a ΔL\* = 0,00 do fundo, a
  sombra tem alfa efetivo 0,008 (bug de RN, não escolha) e a borda de todo
  cartão é a cor da marca a 28% — quem escolhe marca Vermelho ganha o app de
  contorno rosa (TEMA_CLARO §2–4). Conserto: **1 arquivo**, `src/theme/cores.ts`.
- **O azul está em todo lugar, então não vale nada.** O `GradientHeader` pinta
  32 de 41 telas com gradiente de marca; na landing que você adorou, o azul
  ocupa ~3% da tela e por isso pesa (IDENTIDADE §4). Marca escassa é marca cara.
- **959 `fontSize` literais em 29 tamanhos, 267 deles fracionários.** É isso
  que faz tela parecer "montada à mão" ao lado do site (IDENTIDADE §1.2).

### 2.4 Parte do uau que você quer vender já é paridade

Voz→orçamento não é mais exclusivo: Produttivo tem Manu IA, Auvo e Tecniko têm
NIKA. E falta uma coisa que **todos** os concorrentes têm: assinatura do
cliente na OS. O PDF já tem o lugar dela (`pdfGenerator.ts:910`,
`assinaturaClienteUri`) — **nenhuma tela captura uma**. Isso não é uau; é a
licença para competir que está faltando.

### 2.5 A causa que não é do produto

Com zero pagantes, o uau que você procura na tela é, em parte, o uau de
**alguém pagar**. Nenhuma feature substitui isso. O Plano-Mestre já concluiu:
o gargalo é caixa e confiança, não engenharia. As três apostas abaixo são
escolhidas por esse critério, não por elegância técnica.

---

## 3. A aposta — as três coisas dos próximos 3 meses

### Aposta 1 — Ligar o caixa (o que já está pronto e não recebe)

Hoje **ninguém consegue te pagar por Pix** e o app não está em loja. O código
está pronto; o que falta é quase todo passo humano seu (`BLOQUEIOS.md`):

| Passo | Tempo | O que destrava |
|---|---|---|
| `MP_WEBHOOK_SECRET` no worker + registrar webhook no painel MP | ~15 min | Pix de crédito e planos |
| Aplicar as **5 migrations** pendentes (a lista real está em `docs/ENTREGA.md`; o `BLOQUEIOS.md:29` diz 3 e está desatualizado) | ~20 min | cota de IA server-side (hoje **fail-open**: IA ilimitada de graça), ledger, grandfathering |
| Deploy do worker **na mesma janela** das migrations (aviso do 1 crédito em `BLOQUEIOS.md`) | ~10 min | cobrança de verdade |
| Stripe: Installments + 3 Prices | ~20 min | parcelamento BR |
| Conta Play Console + trilha de teste interno (`LOJA.md`) | ~1 h + espera | o APK sair da sua máquina |

**Esforço de engenharia: quase zero. Custo: R$ 0 além da taxa da Play (US$ 25).
O que quebra se a rede cair: nada — é infraestrutura de receber.**

Sem esta aposta, as outras duas são teatro. E ela tem um efeito colateral que
vale tanto quanto o dinheiro: **começa a medir**. Hoje você não sabe o que
converte porque ninguém pode converter.

### Aposta 2 — A tela que mostra dinheiro (o palco do uau)

Consolidar o que já está pago em código num único gesto visível. Quatro peças,
todas R$ 0 por uso, todas funcionam offline:

1. **A faixa de abertura** — app e painel abrem com o número:
   *"R$ 2.340 esperando você. [Cobrar os 3] [Chamar os 2]"*. Motor pronto
   (`radarCobranca.ts`, `radarClientes.ts`); no painel é portar como função
   pura sobre as `Row` do Supabase, com `ParadosCard.tsx` de molde
   (DIFERENCIACAO ideia 1). Esforço **P–M**.
2. **Preço sugerido pelo histórico dele** — "Você cobrou isso 14 vezes, mais
   comum R$ 180; nos 4 acima de R$ 220, 3 aprovados." Regra dura: abaixo de 5
   ocorrências, silêncio (DIFERENCIACAO ideia 2). É SQL local, sem IA.
   Esforço **M**. Ninguém no Brasil tem, e ataca o medo nº 1 do autônomo.
3. **Assinatura do cliente na tela** — canvas de dedo → PNG → o slot que o PDF
   já tem. Fecha a paridade com Conectar/Produttivo/Auvo de uma vez.
   Esforço **M**.
4. **Antes/depois no PDF + validade em frase humana** — dois toques P no maior
   ativo do produto (o documento que o cliente final recebe, que nenhum
   concorrente iguala).

Esta aposta é o "efeito uau" que você pediu, e ela é honesta: o uau é **um
número em reais aparecendo na hora certa com o botão do lado** — não um fade,
não um confete.

**Pega carona nesta aposta, sem contar como aposta** (tudo P, R$ 0):
a paleta do claro (`cores.ts`, 12 linhas, TEMA_CLARO §7), o ciano do logo
(`#34C6D9` → `#3FD8EA`, IDENTIDADE C2), a escala de raio (C1) e o piloto do
header `papel` em **3 telas** para você aprovar ou vetar (C6). São a roupa nova
da mesma semana — mas se só elas entrarem, nada mudou de verdade.

### Aposta 3 — A nota fiscal pronta antes de 1º de setembro

Em **01/09/2026**, MEI, ME e EPP do Simples — ou seja, o público inteiro do
OLLI — passam a ser obrigados a emitir NFS-e pelo Emissor Nacional (Resolução
CGSN 189/2026;
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional).

A versão certa é a barata e sem risco (APIS §5.6): **o OLLI prepara a nota, não
a emite.** Serviço concluído e pago → o app monta tomador, valor, discriminação
e código de tributação sugerido pelo CNAE que já temos, e leva o prestador ao
Emissor Nacional com tudo conferível. Zero certificado guardado, zero
responsabilidade fiscal. Esforço **M**, custo **R$ 0** (API do governo).
Sem rede: nota vira "pendente", nada trava.

Por que é aposta e não item de backlog: **tem prazo, e o prazo é seu aliado de
marketing.** Em agosto, milhares de prestadores vão pesquisar "NFS-e nacional
obrigatória como emitir". A landing que responde isso com "o OLLI deixa a nota
pronta" — antes dos concorrentes — é aquisição de graça, no exato tema em que
confiança se prova. O concorrente que não fizer vai ter que explicar em
setembro por que a nota do cliente não sai.

### Onde as apostas encostam no gargalo

| Aposta | Caixa | Confiança |
|---|---|---|
| 1 — Ligar o caixa | direto: alguém pode pagar | pagar e funcionar é a primeira prova |
| 2 — Tela que mostra dinheiro | põe dinheiro no bolso do prestador (cobrança 1 toque) — o argumento de renovação | assinatura + documento = profissional na frente do cliente |
| 3 — NFS-e | aquisição na onda de setembro | o app que resolve a obrigação legal vira indispensável |

---

## 4. A sequência

**Semanas 1–2 — o caixa.** Os passos humanos da Aposta 1, com o worker e as
migrations na mesma janela. Em paralelo (engenharia): paleta do claro + ciano +
raio (1 dia somado) e o início da faixa de radar no painel.
*Destrava:* alguém pode pagar; o teste interno da Play pode começar; e cada
tester novo que abrir o produto já abre na roupa consertada.

**Semanas 3–6 — o palco.** Faixa de radar no app e no painel, preço sugerido,
assinatura do cliente, antes/depois no PDF. Piloto do header `papel` em 3 telas
para sua decisão.
*Destrava:* a demo que você mostra para qualquer pessoa passa a abrir com um
número em reais — o uau vira reproduzível em 10 segundos. E a assinatura tira o
"o Conectar tem e vocês não" da mesa antes dos primeiros pagantes chegarem.

**Semanas 7–12 — a nota.** NFS-e preparada + página na landing + conteúdo SEO
sobre a obrigação de setembro, publicados **até meados de agosto** para
indexar antes da onda.
*Destrava:* aquisição com prazo trabalhando a seu favor; e o app passa a saber
quais serviços têm nota — meio caminho do financeiro que o contador pede.

**Durante tudo: a régua de recusa da seção 5.** A sequência só funciona se o
que está fora dela ficar fora.

Uma nota operacional que nenhum dos cinco levantou: **não faça o merge
big-bang.** A branch tem 36+ commits não pushados, 5 migrations e uma mudança
de chave de cobrança no worker. Subir tudo de uma vez num produto com usuários
vivos (mesmo sem pagantes) é o pior momento possível de descobrir uma
interação. Fatiar: worker+migrations primeiro (janela de baixo movimento, como
o `BLOQUEIOS.md` já recomenda), app/painel depois, landing por último.

---

## 5. O que você deve recusar agora (a seção que todo mundo pula)

Todas estas são ideias **boas**. É por isso que precisam de um "não" explícito
— ideia ruim se recusa sozinha.

1. **O ETA completo "saia às 14h20" — ainda não.** Discordo aqui do timing
   implícito do IDEIA_ETA_TRANSITO: o documento está certo em tudo, menos em
   quando. É a única feature com custo marginal por uso (R$ 3,70–6,10/prestador/mês
   nos cortes dele), exige engenharia de custo cuidadosa, e é feature de plano
   pago **num produto que ainda não tem pagantes**. Faça agora só a **Fase 0**
   dele, que é higiene barata e conserta o que já está no ar: `departureTime`
   no worker (conferi: não existe em `worker/src/`), lat/lng gravado no save do
   cliente (mata o furo do cache em memória), e o budget com corte no Google
   Cloud. O aviso proativo entra quando houver 20 pagantes pedindo — e aí entra
   rápido, porque o desenho já está pronto.
2. **Clima (Open-Meteo, US$ 29/mês) — espere até outubro.** Discordo do ranking
   do APIS_E_INTEGRACOES, que o pôs em nº 1. A ideia é ótima e o preço é justo,
   mas: (a) não move caixa nem confiança nos próximos 90 dias; (b) o radar
   ofensivo que vale dinheiro é o de **onda de calor**, e estamos em julho —
   inverno. Contratar em outubro e chegar pronto no verão é a mesma feature com
   3 meses de assinatura a menos e o timing certo.
3. **WhatsApp Cloud API / a Olli que lê e responde o WhatsApp.** Você mesmo já
   estacionou (`INTEGRACOES_IDEIA.md`). Mantido: custa por mensagem, exige
   número dedicado, e a versão "fácil" (QR não-oficial) tem risco real de
   banimento. O `wa.me` de 1 toque entrega 80% por R$ 0.
4. **Roteirização, `<MapView>` embutido, `expo-location`, rastreamento
   contínuo.** Os quatro pelos motivos dos especialistas: N² de custo, vaidade
   de produto (ele vai navegar no Waze mesmo), permissão de loja para responder
   pior a pergunta, e briga contra Auvo no terreno onde ele é mais forte.
5. **App do cliente final.** O Conectar tem e a tentação de copiar virá. A
   resposta certa já está desenhada: o **passaporte do equipamento por QR**
   (página pública que o cliente abre sem instalar nada) entrega o valor sem
   construir um segundo produto. Fica para depois das três apostas.
6. **Emitir NFS-e de verdade pelo OLLI.** Guardar `.pfx` e senha de milhares de
   empresas é custódia de assinatura digital — um negócio inteiro, com seguro e
   auditoria, não uma feature. A versão "preparar + deep-link" captura a dor
   sem o risco. Só reavaliar com receita e assessoria jurídica.
7. **A migração dos 196 ícones (C5) e a conversão total do header (C6) neste
   trimestre.** Discordo do alcance do IDENTIDade_APP_SITE para esta janela:
   C5 é esforço G com impacto zero em caixa. Faça os itens P (ciano, raio,
   paleta) e o piloto de 3 telas do header; o resto espera pagantes.
8. **Vender crédito no iOS / StoreKit agora.** A Onda 24 já fez a opção
   reversível (esconder compra no iOS). Implementar IAP com taxa de 15–30% é
   decisão para quando houver volume que a justifique.
9. **Mais animação.** `AuroraBackground`, `Celebracao`, `CountUp`, `Revelar` já
   existem. Para quem está de luva com o cliente esperando, o uau é um número
   em reais, não um fade.
10. **IA em cima de pouco dado.** O "aviso de recusa provável" (DIFERENCIACAO
    ideia 5) é bom e fica para depois **por matemática**: exige 8+ orçamentos
    na faixa, e usuário novo não tem histórico. Nos primeiros 90 dias ele só
    teria duas opções: mentir ou calar. Que cale — e entre no trimestre
    seguinte, quando a base tiver dado.
11. **O plano Empresa em cima do muro.** Não é "construir" — é decidir. Plano
    pago sem enforcement é promessa que o produto não cumpre. Ou o paywall
    entra na Aposta 1 (o worker já está aberto para isso), ou o tier sai da
    tabela de preços até existir. As duas são defensáveis; o meio-termo não.

E três mortes já recomendadas pelo DIFERENCIACAO que eu confirmo:
`CalculadoraTintaScreen` (duplica `calculosOficio.ts` pior),
`OlliChatScreen` como chat genérico (compete com o ChatGPT que ele já tem;
a Olli só vence onde conhece o dado dele), e qualquer investimento novo em
`EquipeAoVivoScreen` além de "última posição".

---

## 6. O risco que ninguém está olhando

**O OLLI nunca foi visto na mão de um prestador de verdade.**

Olhe a cadeia de evidência deste enxame: 67 agentes de auditoria, cinco
especialistas, medições de ΔL\* e APCA, preço de API com URL — e **zero
minutos de observação de campo**. Todos os documentos (este incluído) modelam
"o prestador brasileiro com luva suja e o cliente esperando" por raciocínio,
não por tê-lo visto usar o app. A conta demo é a casa testando a si mesma. O
painel de risco da Onda 23 notou o próprio sintoma: "20 achados, 0 refutados —
sinal amarelo". Um sistema que só conversa consigo mesmo fica cada vez mais
coerente e cada vez menos verificado.

O perigo concreto: os próximos 90 dias polirem, com precisão crescente, um
produto calibrado para um usuário imaginado. Se o prestador real travar no
cadastro do primeiro cliente, ou não entender o que o radar quer dele, nada da
seção 3 fica sabendo — o app não tem como reportar o silêncio de quem
desinstalou no segundo dia (analytics recém-ligado ajuda, mas número diz *que*
pararam, não *por quê*).

O antídoto é barato e cabe na Aposta 1: quando o teste interno da Play abrir,
**cinco prestadores de verdade** — de vertical e cidade diferentes, pelo menos
dois que você não conhece — usando por uma semana, com um grupo de WhatsApp
para reclamarem em voz alta. Custa cinco convites e a humildade de assistir.
É a informação mais valiosa que este produto pode comprar hoje, e é a única
que nenhum enxame consegue gerar.

Risco secundário, já dito na seção 4 mas repetido porque é operacional e mudo:
a **entrega concentrada** — 36+ commits, 5 migrations e a troca da chave de
cobrança esperando um único ato de merge. Quanto mais a operação continua sem
mesclar, maior o pacote e maior a chance de o primeiro dia de pagantes
coincidir com o maior deploy da história do produto. Fatiar não é burocracia;
é não estrear o caixa e o risco no mesmo instante.

---

## Resumo em cinco linhas

1. O produto é o **sócio de bolso** de quem trabalha sozinho — e as 22
   ferramentas boas já existem; o que falta é palco, não feature.
2. O uau está invisível por quatro motivos mensuráveis: janela errada
   (painel sem os radares), sem palco, roupa contraditória (claro sem escada,
   azul em 32 telas), e paridade vendida como mágica.
3. Três apostas: **ligar o caixa** (quase tudo passo humano seu), **a tela que
   mostra dinheiro** (radares com palco + preço do histórico + assinatura), e
   **NFS-e pronta antes de 01/09** (prazo legal virando marketing).
4. Recusar agora: ETA completo, clima até outubro, WhatsApp API, roteirização,
   app do cliente, emissão fiscal direta, ícones G, StoreKit, animação, IA sem
   dado — e decidir o plano Empresa em vez de deixá-lo no muro.
5. O risco cego: um produto cada vez mais perfeito para um usuário que ninguém
   nunca viu usar. Cinco prestadores reais por uma semana valem mais que a
   próxima onda de 67 agentes.
