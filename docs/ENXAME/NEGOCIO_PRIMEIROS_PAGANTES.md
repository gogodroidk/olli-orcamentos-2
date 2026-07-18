# NEGÓCIO — do zero aos 10 primeiros pagantes

> Escrito em 18/07/2026, depois de ler `VISAO_FABLE.md`, `DIFERENCIACAO_UAU.md`,
> `APIS_E_INTEGRACOES.md`, `AUDITORIA_RISCO.md`, `BLOQUEIOS.md` e `MISSAO.md`,
> e de abrir o código: `src/screens/OnboardingScreen.tsx`, `src/screens/EntrarScreen.tsx`,
> `src/services/planos.ts`, `src/services/entitlements.ts`. Fato de mundo tem URL;
> fato de produto tem arquivo. Onde discordo dos outros documentos, digo.
>
> **A lente deste documento é uma só: como aparecem os 10 primeiros que pagam.**
> Não 1.000. Dez. Dez pagantes provam que alguém paga; escala é problema de quem
> já tem os dez.

---

## A resposta em um parágrafo

Os seus 10 primeiros pagantes são **refrigeristas/técnicos de ar-condicionado
PJ, sozinhos ou com 1 ajudante, numa única região**, e você chega neles **um por
um, instalando o app na mão deles** — três do seu círculo, três de grupo de
WhatsApp/Facebook do ofício, dois do balcão do distribuidor da sua cidade, dois
por indicação dos primeiros. A oferta é: primeiro mês de Pro por sua conta, você
faz o cadastro chato junto com ele em 30 minutos, e a partir do mês 2 ele paga os
R$ 39 por Pix — que hoje **ninguém consegue pagar** porque falta o
`MP_WEBHOOK_SECRET` (BLOQUEIOS.md). Antes de qualquer abordagem, o caixa tem que
ligar. E nada abaixo é anúncio, SEO, indicação programada ou parceria: com zero
verba e zero prova, o único canal que funciona é o fundador vendendo na unha —
que é também o único canal que te devolve a informação que nenhum enxame de
agentes consegue gerar: **ver um prestador de verdade usando o produto**
(o risco cego apontado no VISAO_FABLE §6).

---

## 0. A pré-condição (sem isso, o resto é teatro)

Hoje o OLLI não tem como receber dinheiro nem como chegar ao telefone de um
desconhecido sem você presente. Antes do primeiro contato:

| O que | Onde está descrito | Tempo |
|---|---|---|
| `MP_WEBHOOK_SECRET` no worker + registrar webhook no painel MP | `BLOQUEIOS.md` | ~15 min |
| Migrations pendentes + deploy do worker na mesma janela | `BLOQUEIOS.md` / `docs/ENTREGA.md` | ~30 min |
| Conta Play Console + faixa de **teste interno** (até 100 testadores por e-mail, sem review demorada) | `LOJA.md` | ~1 h + espera |
| Chave PostHog criada | `BLOQUEIOS.md` | ~10 min |

A chave PostHog parece detalhe e não é: o app **já rastreia** onde a pessoa
desiste do onboarding (`Eventos.onboardingSkipped` carrega o `step` —
`OnboardingScreen.tsx:293`), mas sem a chave o evento morre no vácuo. Com 10
usuários você não precisa de dashboard — precisa de saber **em qual tela o
primeiro desistiu**.

Para os 2–3 primeiros, que você instala pessoalmente, o APK direto no aparelho
resolve (você está do lado para autorizar "fonte desconhecida"). Do quarto em
diante, o teste interno da Play é o caminho — mandar um APK avulso por WhatsApp
para desconhecido mata a confiança antes do primeiro orçamento.

---

## 1. QUEM são os 10

### Primeiro, uma discordância

A visão registrada da landing é **ampliar de HVAC para prestador de serviço
geral** (memória `olli-landing-visao-e-ideias`). Para a landing, ok. Para os 10
primeiros pagantes, é o erro clássico: **10 clientes espalhados em 6 ofícios e 5
cidades não conversam entre si** — não geram indicação, não validam o mesmo
fluxo, e cada um pede uma feature diferente. 10 refrigeristas da mesma região se
conhecem, frequentam o mesmo balcão de distribuidor, estão nos mesmos grupos — o
décimo fica mais barato que o primeiro. E o produto é objetivamente mais fundo
em HVAC do que em qualquer outra vertical: PMOC de 723 linhas, base offline de
698 códigos de erro, checklist por ofício (`DIFERENCIACAO_UAU.md`, Parte 1).
Venda onde o produto é mais fundo.

### O perfil, ao ponto de dar para listar nomes

**O refrigerista PJ que trabalha só (ou com 1 ajudante), entre 28 e 50 anos, na
sua cidade ou região metropolitana.** Características que o tornam O cliente:

- **Tem CNPJ** (MEI ou ME) — o cadastro mágico por CNPJ já funciona para ele
  (`OnboardingScreen.tsx:179`), e é ele que a obrigação da NFS-e nacional
  alcança em 01/09/2026 ([Resolução CGSN 189/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)).
  O Brasil tem mais de 15 milhões de MEIs ativos e eles são 78% das empresas
  novas abertas em 2026 ([Agência Sebrae](https://agenciasebrae.com.br/dados/meis-lideram-abertura-de-empresas-no-pais-e-ja-representam-78-dos-novos-negocios-em-2026/)) — o perfil não é nicho, é a regra.
- **Atende residência E pequeno comércio** — padaria, farmácia, clínica,
  escritório. O comércio é o que importa: é onde mora a dor do **PMOC**, que é
  lei desde 2018 ([Lei 13.589/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm))
  com multa que vai de R$ 2 mil a R$ 1,5 milhão via vigilância sanitária
  ([Ambientec](https://ambientec.com/lei-13-589-2018-pmoc-torna-se-obrigatoria-manutencao-de-sistemas-de-ar-condicionado/)).
  Um técnico que oferece PMOC documentado cobra contrato recorrente — e o OLLI é
  o único app de R$ 39 com motor de PMOC pronto.
- **Trabalha no WhatsApp e no papel.** Orçamento por áudio, preço de cabeça,
  cobrança por Pix "quando lembra". O WhatsApp está em 99% dos smartphones
  brasileiros ([Mobile Time/Opinion Box](https://www.mobiletime.com.br/noticias/27/02/2020/whatsapp-alcanca-presenca-recorde-em-99-dos-smartphones-no-brasil/)) — por isso o
  `wa.me` de 1 toque do OLLI é canal, não feature.
- **Nunca pagou por software de gestão.** Quem já paga Auvo/Field Control tem
  gestor e frota — não é ele. Quem ele conhece que "usa sistema" paga o Conectar
  (R$ 79,90, [conectarplay.com](https://conectarplay.com/)) ou testou o Tecniko
  (grátis permanente, pago a partir de R$ 59,90,
  [tecniko.app](https://tecniko.app/blog/alternativa-ao-auvo)). O Pro a R$ 39 é
  o mais barato da categoria — não há por que ter vergonha do preço.
- **Usa Android.** ~80% do mercado móvel brasileiro
  ([StatCounter](https://gs.statcounter.com/os-market-share/mobile/brazil)) — e
  no público de ferramenta de trabalho a fração é maior ainda. Mais um motivo
  para o iOS esperar (concordo com a AUDITORIA_RISCO: opção (a), esconder compra).

**A dor aguda dele, na ordem que ele mesmo diria:** (1) orçamento feio/por áudio
perde para concorrente que manda PDF; (2) esquece de cobrar serviço feito —
exatamente o radar de cobrança que já existe (`src/services/radarCobranca.ts`);
(3) cliente some e ele não percebe; (4) em setembro, a nota fiscal vira
obrigação que ele não sabe emitir.

### Onde esse público se reúne DE VERDADE (nomes e URLs)

| Lugar | O que é | Tamanho / detalhe |
|---|---|---|
| Grupo **"Refrigeração"** no Facebook | maior comunidade HVAC-R em português, criada em 2012 | perto de 100 mil membros ([Blog do Frio](https://blogdofrio.com.br/grupo-refrigeracao-ja-reune-quase-100-mil-membros/)) |
| Grupo **"Refrigeristas do Brasil"** no Facebook | fundado em 2011 por Frank Gomes (CE) | 50 mil+ membros ([Blog do Frio](https://blogdofrio.com.br/grupo-refrigeristas-do-brasil-facebook/)) |
| **Clube dos Refrigeristas** | rede que nasceu de UM grupo de WhatsApp e virou 49 grupos + cursos (foco forte em refrigeração automotiva — adjacente, não idêntico ao alvo) | [clubedosrefrigeristas.com](https://clubedosrefrigeristas.com/) · [história](https://www.movenews.com.br/do-whatsapp-para-o-brasil-conheca-a-historia-do-clube-dos-refrigeristas/) |
| Canal **R&E Prestadora de Serviços** (Rodrigo Ferreira) | técnico de campo que virou referência no YouTube | 200 mil+ inscritos ([perfil](https://tudosobrearcondicionado.com/curso-vivendo-de-ar-condicionado/)) |
| **Leandro Moraes / Polo Norte Cursos** ("Vivendo de Ar Condicionado") | curso online com mentoria por WhatsApp, 1.000+ alunos formados — alunos recém-formados montando clientela | canal ~50 mil ([análise do curso](https://tudosobrearcondicionado.com/curso-vivendo-de-ar-condicionado/)) |
| Balcão da **Dufrio** (32 filiais, 18 estados) e da **Frigelar** | o técnico vai lá TODA SEMANA comprar gás, tubo, suporte; a Dufrio faz treinamento técnico para instaladores parceiros | [dufrio.com.br/nossas-lojas](https://www.dufrio.com.br/nossas-lojas) |
| **ABRAVA** e associações regionais | associação nacional do setor; a lista completa de sindicatos/associações está mapeada | [abrava.com.br](https://abrava.com.br/) · [lista no WebArCondicionado](https://www.webarcondicionado.com.br/associacoes-conselhos-sindicatos-e-comites-de-ar-condicionado-no-brasil) |
| **Febrava** (feira do setor, São Paulo Expo) | próxima edição SP: 14–17/09/2027; há uma edição Rio em 2026 | [febrava.com.br](https://www.febrava.com.br/) — longe demais para os 10; registre e ignore por ora |
| Para a 2ª vertical (eletricista), quando chegar a hora | **Mundo da Elétrica** (1 M+ inscritos) e **Engehall** | [YouTube](https://www.youtube.com/channel/UCQzm6RcaOty8QU2VhHbRg-g) · [Engehall](https://www.youtube.com/channel/UCEfj0OBQaSK5jNnVXi0QBoQ) |

E os dois lugares que nenhuma lista de "canais" inclui, mas que são os mais
quentes para os 10 primeiros: **os grupos de WhatsApp/Facebook da SUA cidade**
(busque "refrigeração + [cidade]", "ar condicionado + [cidade]" no Facebook) e
**os técnicos que já atenderam VOCÊ** — o cara que instalou o seu split, o da
manutenção do seu prédio, o indicado pelo seu síndico. Esses você chama pelo
nome hoje.

### A composição concreta dos 10

- **3 do círculo direto** — técnicos que você conhece ou que já te atenderam.
  São os únicos que aceitam usar um produto sem prova social. Também são os 5
  testadores reais que o VISAO_FABLE §6 pediu — **mesmas pessoas, mesmo
  esforço**: o beta de uma semana é a primeira metade da venda.
- **3 de grupo local** — respondendo dor real em grupo de WhatsApp/Facebook da
  região (ver §2, a regra do grupo).
- **2 do balcão** — abordagem no distribuidor da cidade, na fila do balcão, com
  o app aberto no SEU celular mostrando um PDF de verdade.
- **2 por indicação dos primeiros** — pedida à mão ("me apresenta um colega que
  sofre com orçamento?"), não por programa.

---

## 2. COMO chegar neles sem verba

### O caminho mais curto: você, um por um, instalando junto

Com zero pagantes, zero prova social e zero verba, todo canal indireto (anúncio,
SEO, parceria) tem um problema em comum: **põe uma camada entre você e a
informação de por que a pessoa não comprou.** O canal fundador-vende-na-unha é
mais lento por contato, mas é o único com taxa de aprendizado de 100%. Com meta
de 10, não existe problema de escala — existe problema de verdade.

**O roteiro de um contato (60–90 min do seu tempo, total):**

1. **Mensagem de abertura no WhatsApp** — curta, sem link, sem "app
   revolucionário": *"Fulano, montei um app pra técnico que trabalha sozinho:
   orçamento em PDF com sua logo, o cliente aprova pelo link, e ele te avisa
   quem tá te devendo. Tô escolhendo 10 técnicos pra usar comigo do lado. Topa
   me dar 30 min essa semana? O primeiro mês é por minha conta."*
2. **Sessão de 30 min** (presencial ou vídeo): você instala, faz o cadastro por
   CNPJ (o app já preenche empresa e deduz o ofício — `consultarCnpj`), coloca a
   logo, cadastra com ele os **10 serviços que ele mais faz, com preço**, e
   monta o primeiro orçamento REAL — de um cliente real que ele está devendo
   resposta. Termina com o PDF no WhatsApp do cliente dele ou no dele próprio.
3. **Grupo de WhatsApp "OLLI Fundadores"** com os 10: reclamação em voz alta,
   resposta sua em minutos. É o mecanismo de feedback E o começo da comunidade
   que futuramente vende por você.
4. **D+2 e D+7**: duas mensagens suas, individuais, perguntando UMA coisa
   concreta ("conseguiu mandar orçamento novo?" / "o que te travou?").

### A regra do grupo (Facebook/WhatsApp): nunca poste o link primeiro

Grupo de ofício expulsa vendedor e respeita colega. O jeito de existir lá:

- Responda dúvida real com conteúdo real: "como cobrar cliente que some",
  "como fazer orçamento que não é ignorado", "o que muda com a NFS-e em
  setembro", "o que é PMOC e quanto cobrar". Você tem material técnico de sobra
  nos docs do produto.
- Quando fizer sentido, mostre um **print do PDF ou do link de aprovação** —
  sem URL de download. Quem quiser, pergunta. O PDF do OLLI (QR de
  aprovar/recusar, Pix embutido, depoimentos) é o seu material de marketing: é
  bonito de mostrar e **cada orçamento que um usuário manda é uma demo** vista
  por um cliente final que também contrata técnico.
- Meta modesta e suficiente: **3 conversas privadas por semana** saindo de
  grupo. Você precisa de 3 clientes desse canal, não de 300.

### Por que os outros caminhos são mais lentos (para os 10)

| Caminho | Por que não agora |
|---|---|
| Anúncio pago | compra tráfego para um funil que nunca converteu ninguém; cada real gasto te diz "não converteu" sem dizer por quê. Depois dos 10, com funil medido, reavalie |
| SEO / conteúdo | leva meses para indexar e ranquear; é a aposta certa para a leva 11–100 (a página de NFS-e de agosto do VISAO_FABLE §3), não para os 10 |
| Parceria com distribuidor / revenda | negociação de meses, e o distribuidor quer volume e comissão que você não tem; a versão de R$ 0 é você na fila do balcão |
| Marketplace / loja de apps como canal | review, ranking e busca só funcionam com volume de avaliação que você não tem |
| Influenciador / professor | funciona — mas cobra ou exige relação; vira canal quando você tiver 10 depoimentos reais para oferecer em troca. Semear agora (mandar acesso cortesia para 1–2, ex.: Polo Norte), colher depois |

---

## 3. O QUE OFERECER

### O preço não é o problema — o atrito é

Tabela real do mercado: Conectar R$ 79,90
([conectarplay.com](https://conectarplay.com/)), Tecniko a partir de R$ 59,90
com grátis permanente ([tecniko.app](https://tecniko.app/blog/alternativa-ao-auvo)),
Auvo sob consulta com entrada alta ([Capterra](https://www.capterra.com/p/201778/Auvo/)).
**O Pro a R$ 39 já é o mais barato da categoria.** Não dê desconto agressivo:
quem paga R$ 9 "de fundador" não prova que o produto vale R$ 39 — e a pergunta
que os 10 existem para responder é essa.

### A oferta de fundador (concreta)

- **Mês 1: Pro liberado, por sua conta**, com data de fim dita em voz alta no
  dia da instalação ("até 30/08 é por minha conta; depois são R$ 39 no Pix").
- **Mês 2 em diante: R$ 39/mês, preço travado por 12 meses**, por Pix (Mercado
  Pago — por isso o webhook é pré-condição).
- **Contrapartida do fundador** (é isso que o título "fundador" significa, não
  desconto): uma conversa de 20 min a cada 15 dias no 1º trimestre, permissão
  para usar nome/depoimento, e prioridade de voto no que entra no produto.
- **Não venda o plano Empresa para os 10.** Ele não tem enforcement (memória
  `olli-paywall-empresa-ausente`; VISAO_FABLE §5.11) e o perfil-alvo não tem
  equipe. Os 10 são Pro.

Uma honestidade que precisa estar escrita: o plano Grátis do OLLI é generoso —
orçamentos, recibos, clientes e agenda **ilimitados**
(`src/services/entitlements.ts:44`). O que o Pro vende para um técnico sozinho
é: IA sem cota, radar de clientes completo, relatórios, modelos premium e
**tirar a marca OLLI do documento** (`RECURSOS_POR_PLANO`). Se na conversa de
venda o argumento não se sustentar, você vai descobrir nos 10 — e essa
descoberta (mexer no que é grátis vs. o que é pago) vale mais que qualquer
plano de marketing. É exatamente para isso que os 10 servem.

### O trabalho chato: faça por ele — mas o certo, não o mito

O medo declarado é "o prestador com 300 clientes na cabeça não vai digitar 300
cadastros". Verdade — e ele **não precisa**. Confirmei no código: não existe
importação de contatos nem de planilha (zero ocorrências de `expo-contacts` ou
importador em `src/`). Mas o fluxo real do produto não pede: **cliente entra no
OLLI quando recebe o primeiro orçamento**, um por vez. Em 4 semanas de uso, os
15–30 clientes ativos dele estão dentro — e são os únicos que importam para os
radares. Os outros 270 são agenda morta.

O que fazer por ele na sessão de 30 min, na ordem de valor:

1. **Cadastro da empresa via CNPJ** (o app já faz sozinho — você só confere).
2. **Logo no PDF** — é o que ele mostra para o cliente NO MESMO DIA.
3. **Os 10 serviços mais comuns com preço** — você digita, ele dita. É o
   pré-requisito do orçamento em 30 segundos e do futuro preço-sugerido.
4. **Os 5 clientes que devem resposta ou dinheiro agora** — só esses. Cada um
   já entra com um orçamento ou cobrança de verdade pendurada.

E uma recomendação de produto para depois dos 10 (não sou eu que codifico, e
não bloqueia nada agora): **importar contatos do aparelho (`expo-contacts`) com
seleção múltipla** é o único "cadastre por mim" que escala quando você não
estiver mais presente em toda instalação. Registrar no backlog, não fazer agora.

---

## 4. O PRIMEIRO MINUTO

Li `OnboardingScreen.tsx` inteiro com olho de quem nunca viu o produto.

### O que está certo (e é raro estar)

- **Desemboca no wizard do primeiro orçamento**, não numa home vazia — e o
  comentário no código (`OnboardingScreen.tsx:230`) mostra que foi decisão
  pensada: "a recompensa de configurar não pode ser um menu". Certíssimo.
- **Cadastro mágico por CNPJ** que preenche empresa e deduz o ofício pelo CNAE.
  É o melhor momento do onboarding — o app "adivinha" o que ele faz.
- **CEP preenche endereço**, "Pular" sempre visível, salvar best-effort (pular
  nunca perde o que já foi digitado), erros com 3 estados. Disciplina boa.

### O que trava um novato de verdade

1. **A conta vem antes do valor.** Antes de ver qualquer tela do produto, o
   técnico cria conta com e-mail e senha (`EntrarScreen` → onboarding é
   pós-login). Para o público que vive no WhatsApp e usa e-mail duas vezes por
   ano, esse é o primeiro muro — e é ANTES da primeira recompensa. Não dá para
   remover a conta (o sync precisa dela), mas dá para encurtar o que vem depois.
2. **Seis etapas, ~15 campos, zero recompensa no meio.** Empresa → Você →
   Endereço → PIX → Visual → Serviço. A tela de boas-vindas promete "orçamento
   pronto em minutos" e o app responde pedindo CNPJ, CEP, rua, número,
   complemento, bairro. **Endereço (etapa 3) e Visual (etapa 5) deviam migrar
   para depois do primeiro PDF** — endereço só existe para o cabeçalho do
   documento, e a logo fica ótima como "deixe seu documento com a sua cara"
   DEPOIS que ele viu o documento sem ela. De 6 etapas para 3 (Empresa+Você,
   PIX, Serviço) sem perder nada que o primeiro orçamento exija.
3. **A vertical é deduzida e desperdiçada.** O app descobre pelo CNAE que ele é
   refrigerista — e mesmo assim a etapa 6 pede para digitar UM serviço na mão.
   Confirmei: **não existe catálogo semente por vertical** (nenhum
   `servicosSugeridos`/seed em `src/`). O onboarding mágico seria: "Você é de
   refrigeração — quer começar com estes 10 serviços? Só ajustar os preços."
   Isso é 1 arquivo de dados + 1 tela, e transforma a etapa mais fraca na mais
   impressionante. É a maior alavanca barata do primeiro minuto.
4. **O "aha" não tem entrega garantida.** O momento que converte é: **PDF com a
   logo dele chegando no WhatsApp em menos de 5 minutos**. Hoje o wizard
   termina no orçamento, mas nada garante que ele MANDE. Um botão "manda pra
   mim mesmo pra ver como o cliente recebe" no fim do primeiro orçamento fecha
   o circuito — ele vê com os olhos do cliente dele.
5. **Você não vai ver onde eles desistem.** O funil está instrumentado
   (`onboardingSkipped` com step, `onboardingCompleted`), mas a chave PostHog
   não existe (`BLOQUEIOS.md`). Para os 10 você estará presente; para o 11º em
   diante, essa chave é o seu olho.

Para os 10 primeiros nada disso bloqueia — **o onboarding dos 10 é você**, na
sessão de 30 min. Mas cada item acima decide se o 11º, que instala sem você do
lado, chega ao primeiro PDF ou desinstala no segundo dia.

---

## 5. O QUE MEDIR

Com 10 usuários, dashboard é enfeite. Planilha de 10 linhas, atualizada à mão
toda sexta, com três colunas que não mentem:

1. **Ativou? — primeiro orçamento REAL (cliente de verdade) em até 48 h da
   instalação.** Se você fez a sessão de 30 min direito, isso acontece na
   própria sessão. Quem não ativou em 48 h recebe sua mensagem individual — e o
   motivo vai anotado na planilha. Meta honesta: 8 de 10.
2. **Criou hábito? — 3+ documentos (orçamento/recibo/OS) na semana 3, sem você
   cutucar.** A semana 3 é a prova de que o app entrou na rotina depois que a
   novidade passou. Uso assistido (você mandou mensagem antes) não conta — a
   régua é uso espontâneo. Meta: 6 de 10.
3. **Pagou de novo? — a 2ª mensalidade por Pix, sem lembrete além do
   automático.** A 1ª cobrança paga prova educação; a 2ª prova valor. É a única
   métrica que responde a pergunta da operação inteira. Meta: 7 dos que
   ativaram.

E um sinal qualitativo que vale como métrica: **reclamação no grupo de
fundadores é sinal VERDE** (quem reclama, usa). O vermelho é o silêncio — quem
some do grupo já desinstalou, só ainda não te contou. Silêncio de 7 dias =
mensagem individual sua, no mesmo dia.

Anti-métricas — proibidas na planilha: downloads, visitas na landing, seguidores,
"conversas iniciadas". Com N=10, tudo isso é ruído com cara de progresso.

---

## 6. O QUE NÃO FAZER agora

1. **Anúncio pago.** Sem funil que já converteu uma vez, mídia paga é pagar
   para descobrir mais devagar. O CAC que você mediria hoje não vale nada — o
   produto, o preço e a mensagem ainda vão mudar com o que os 10 ensinarem.
2. **SEO como canal principal.** Meses de espera e zero feedback tático.
   Exceção cirúrgica, já decidida no VISAO_FABLE: a página da NFS-e publicada
   até meados de agosto — mas ela é a aquisição da leva 11–100. Nenhum dos 10
   virá por busca.
3. **Programa de indicação.** Indicação formal multiplica satisfação — e a sua
   base satisfeita hoje é zero. Zero vezes bônus é zero. Nos primeiros 10, a
   indicação é pedida olho no olho, uma a uma.
4. **Marketplace / integração com plataforma de leads** (GetNinjas e afins).
   Público errado (lá o prestador compra lead, não gestão), esforço de
   integração alto, e te afasta do contato direto que é o único ativo desta
   fase.
5. **Revenda / parceria formal com distribuidor.** A Dufrio da sua cidade é
   canal — mas como LUGAR onde o público está, não como contrato. Parceria
   formal exige volume, material e comissão. Depois dos 10, com depoimentos, o
   gerente da filial vira conversa real.
6. **iOS.** Android é ~80% do Brasil
   ([StatCounter](https://gs.statcounter.com/os-market-share/mobile/brazil)) e
   perto de 100% do seu público-alvo; o iOS exige IAP com taxa de 15–30% para
   crédito digital (AUDITORIA_RISCO, bloqueio de loja). A Onda 24 já escondeu a
   compra no iPhone — deixa assim até haver pagantes pedindo iPhone.
7. **Ampliar a mensagem para "todo prestador" na caça aos 10.** Repetindo a
   discordância do §1: a landing pode ser larga; a venda dos 10 é estreita. O
   pitch para o refrigerista fala PMOC, código de erro, gás, plaqueta — coisas
   que "software para prestadores de serviço" nunca diz.
8. **Esperar o produto "ficar pronto" para começar a chamar gente.** O gate
   verde de 46 commits não muda o fato central do VISAO_FABLE §6: o produto
   nunca foi visto na mão de um prestador. As 3 primeiras instalações SÃO o
   teste que falta — adiá-las para polir mais é polir no escuro.

---

## Segunda-feira de manhã (na ordem)

1. Os passos humanos do caixa: `MP_WEBHOOK_SECRET` + webhook no painel MP +
   migrations + deploy do worker na mesma janela (`BLOQUEIOS.md` — total ~1 h).
2. Conta Play Console + faixa de teste interno. Chave PostHog no caminho.
3. **Lista de 20 nomes**: técnicos que você conhece, que já te atenderam, ou
   que atendem gente próxima. Sem lista de nomes, nada do resto começa.
4. Mandar a mensagem de abertura (§2) para os 5 primeiros da lista.
5. Fazer a 1ª sessão de 30 min ainda nesta semana. O grupo "OLLI Fundadores"
   nasce com o primeiro instalado.
6. Entrar em 2 grupos (1 nacional — "Refrigeração" ou "Refrigeristas do
   Brasil" —, 1 local da sua cidade) e passar a semana só respondendo, sem
   vender.
7. Sexta-feira: planilha das 3 métricas do §5, linha por pessoa.

Meta de calendário, para não virar elástico: **10 instalados em 4 semanas, 10
pagantes em 8–10** (o mês grátis empurra a prova de pagamento para o mês 2).
Se em 8 semanas ninguém topou pagar R$ 39 nem com você instalando na mão, isso
não é fracasso do plano — é a informação mais barata que existe sobre preço,
público ou produto, comprada por R$ 0 de mídia. É exatamente para isso que os
10 servem.

---

## Fontes

- [Resolução CGSN 189/2026 — NFS-e nacional obrigatória p/ Simples em 01/09/2026 (Receita Federal)](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)
- [Lei 13.589/2018 — PMOC (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm) · [multas e fiscalização (Ambientec)](https://ambientec.com/lei-13-589-2018-pmoc-torna-se-obrigatoria-manutencao-de-sistemas-de-ar-condicionado/)
- [MEIs = 78% das empresas novas em 2026 (Agência Sebrae)](https://agenciasebrae.com.br/dados/meis-lideram-abertura-de-empresas-no-pais-e-ja-representam-78-dos-novos-negocios-em-2026/)
- [Grupo "Refrigeração" ~100 mil membros (Blog do Frio)](https://blogdofrio.com.br/grupo-refrigeracao-ja-reune-quase-100-mil-membros/) · ["Refrigeristas do Brasil" 50 mil+ (Blog do Frio)](https://blogdofrio.com.br/grupo-refrigeristas-do-brasil-facebook/)
- [Clube dos Refrigeristas](https://clubedosrefrigeristas.com/) · [história (Movenews)](https://www.movenews.com.br/do-whatsapp-para-o-brasil-conheca-a-historia-do-clube-dos-refrigeristas/)
- [Curso "Vivendo de Ar Condicionado" / canais do setor (Tudo Sobre Ar Condicionado)](https://tudosobrearcondicionado.com/curso-vivendo-de-ar-condicionado/)
- [Mundo da Elétrica (YouTube, 1 M+)](https://www.youtube.com/channel/UCQzm6RcaOty8QU2VhHbRg-g) · [Engehall](https://www.youtube.com/channel/UCEfj0OBQaSK5jNnVXi0QBoQ)
- [Dufrio — lojas e treinamentos](https://www.dufrio.com.br/nossas-lojas)
- [ABRAVA](https://abrava.com.br/) · [associações do setor (WebArCondicionado)](https://www.webarcondicionado.com.br/associacoes-conselhos-sindicatos-e-comites-de-ar-condicionado-no-brasil)
- [Febrava](https://www.febrava.com.br/) · [Febrava 2027: 14–17/09/2027 (EventsEye)](https://www.eventseye.com/fairs/f-febrava-10779-1.html)
- [WhatsApp em 99% dos smartphones BR (Mobile Time/Opinion Box)](https://www.mobiletime.com.br/noticias/27/02/2020/whatsapp-alcanca-presenca-recorde-em-99-dos-smartphones-no-brasil/)
- [Android ~80% no Brasil (StatCounter)](https://gs.statcounter.com/os-market-share/mobile/brazil)
- [Conectar Sistemas R$ 79,90](https://conectarplay.com/) · [Tecniko a partir de R$ 59,90 + grátis permanente](https://tecniko.app/blog/alternativa-ao-auvo) · [Auvo sob consulta (Capterra)](https://www.capterra.com/p/201778/Auvo/)
