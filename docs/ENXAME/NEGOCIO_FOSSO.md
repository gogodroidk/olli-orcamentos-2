# NEGÓCIO — O FOSSO (o que sobra se copiarem tudo)

> Escrito em 18/07/2026, read-only. Antes de opinar eu li o código
> (`src/screens/` — 40 telas + 21 desktop, `src/services/`, `webapp/src/pages/`,
> `worker/src/` — 17 módulos) e os documentos da operação (`VISAO_FABLE.md`,
> `DIFERENCIACAO_UAU.md`, `APIS_E_INTEGRACOES.md`, `AUDITORIA_RISCO.md`,
> `BLOQUEIOS.md`, `MISSAO.md`). Todo fato de mundo tem URL. Preço de plano
> conferido na fonte (`src/services/entitlements.ts:16` — R$ 0 / 39 / 99).
>
> A pergunta deste documento: **se a Auvo puser 50 engenheiros para copiar o
> OLLI amanhã, o que sobra em 3 meses?** A resposta honesta está abaixo, e ela
> não é confortável.

---

## A resposta curta

**Hoje o OLLI não tem fosso. Tem produto bom.** São coisas diferentes: produto
bom se copia; fosso não. Quase tudo que está no repositório é copiável por uma
equipe grande em semanas — e boa parte num fim de semana.

O que **não** se copia não é nenhuma feature. São quatro coisas, e as quatro
têm o mesmo pré-requisito:

1. **O dado que só acumula com uso** (o histórico de preço de cada prestador, o
   histórico de cada equipamento).
2. **A etiqueta QR colada no aparelho do cliente final** — o único pedaço do
   OLLI que existe no mundo físico.
3. **O hábito diário** (abrir o app de manhã porque ele diz quanto dinheiro
   está parado).
4. **A estrutura de custo** — uma pessoa + worker serverless consegue cobrar
   R$ 39 de um cliente que não paga o vendedor da Auvo.

O pré-requisito das quatro é **usuário usando**. Com zero pagantes e zero
usuários reais, fosso é conversa de bar. O fosso do OLLI não se constrói
escrevendo código: se constrói destravando o caixa (Aposta 1 do
`VISAO_FABLE.md`) e pondo cinco prestadores de verdade dentro do produto. Cada
semana sem usuário é uma semana em que o único fosso possível não está sendo
cavado — enquanto os concorrentes, que já têm usuários, cavam o deles.

---

## 1. INVENTÁRIO HONESTO — quanto tempo para copiar cada coisa

Régua: "fim de semana" = 1 dev bom copia o comportamento visível em 2 dias.
"Sprint" = 1–3 semanas. "Meses" = precisa de conhecimento de domínio ou
retrabalho de arquitetura. Avaliei o que um concorrente **já estabelecido**
levaria — não uma startup do zero (essa levaria mais, mas não é ela que
enterra o OLLI).

### Copiável num fim de semana (a maior parte do app)

| O que | Onde vive | Por que é rápido de copiar |
|---|---|---|
| Orçamento / recibo / OS / clientes / agenda (CRUD) | `NovoOrcamentoScreen`, `EmitirReciboScreen`, `OrdemServicoScreen`, `AgendaScreen` | Todo concorrente já tem. É o preço de entrada da categoria. |
| Radar de cobrança / reconquista / follow-up | `radarCobranca.ts` (115 linhas), `radarClientes.ts` (176), `radarFollowUp.ts` (110) | **A melhor ideia do produto é a mais fácil de copiar.** É contagem sobre dados que qualquer concorrente já tem no banco. O valor está na decisão de produto, não no código. |
| Pix Copia-e-Cola offline | `pixBrCode.ts` | O BR Code EMV é especificação pública do BACEN. |
| CNPJ→cadastro, CEP→endereço, ETA | `cnpj.ts`, `cep.ts`, `eta.ts` | APIs públicas (BrasilAPI, ViaCEP, Google Routes). |
| Vertical por CNAE (esconder ferramenta de outro ofício) | `verticais.ts` (205 linhas) | A ideia é boa; a implementação é um mapa CNAE→vertical. |
| Assinatura do cliente no aparelho | `src/components/assinatura/` (entrou em f6c1e64) | Era paridade que faltava; agora existe. Todos já têm. |
| Ritual bom dia / fechar o dia | `ritualDiario.ts` | Notificação agendada com um resumo. |
| Radar de clima (quando entrar) | proposto em `APIS` §5.1 | Consulta de previsão + cruzamento com agenda. Anoto aqui de propósito: **a integração nº 1 do ranking do APIS é copiável num fim de semana** — é boa feature, não é fosso. |

### Copiável num sprint (1–3 semanas)

| O que | Onde vive | O que atrasa o copiador |
|---|---|---|
| PDF do cliente final (QR aprovar/recusar, Pix embutido, depoimentos, cor da marca extraída da logo, white-label) | `pdfGenerator.ts` (989 linhas) | O conceito se copia em dias; a **polidez** (modelos, capa, degradação sem link) leva semanas. É o ativo mais forte e mesmo assim não passa de um sprint para uma equipe grande. |
| Link `/o/token` com trilha (enviado→visualizado→aprovado/recusado+motivo) | `clienteLink.ts` + `worker/src/link.js` | Infra simples; a trilha exige mexer no funil deles. |
| Voz → orçamento com modo conversa | `OlliVozScreen` (1.686 linhas) + `worker/src/voz.js` | **Já copiaram antes de existir**: Produttivo tem Manu IA, Auvo/Tecniko têm NIKA (`DIFERENCIACAO` Parte 2). Isto é paridade, não vantagem. |
| Diagnóstico IA em 3 camadas (cache → IA → base offline) | `olliIA.ts` + `CodigosErroScreen` | A arquitetura se copia em dias. A **base de 698 códigos de erro** leva semanas de compilação chata — é o único pedaço com atrito real. |
| Créditos + idempotência + cota server-side | `worker/src/creditos.js` | Concorrente grande já tem billing. Isto é custo de operar, não diferencial. |
| ETA "a que horas sair" com `departureTime` | `worker/src/etaSaida.js` (novo) | Chamada de API com um campo a mais. Bem feito aqui (3 estados, sem chute), mas replicável. |

### Leva meses (os únicos atritos técnicos de verdade)

| O que | Onde vive | Por que demora |
|---|---|---|
| **Offline-first de verdade** (SQLite local + sync + tudo funciona sem sinal) | `database/database.ts`, `cloudSync.ts` | Auvo/Field Control são online-first com "modo offline". Refazer a arquitetura para o app inteiro funcionar em subsolo/cobertura sem sinal é retrabalho de meses **num produto que já tem clientes** — o tipo de migração que empresa estabelecida adia para sempre. É o ativo técnico mais subestimado do OLLI. |
| Calculadoras por ofício ancoradas em norma real | `calculosOficio.ts` (1.100 linhas) | Não é código, é pesquisa de domínio (NBR, fórmula, quando dizer "não há norma única"). Semanas de trabalho chato e sem glória. |
| Motor de PMOC versionado com geração idempotente de OS | `pmoc.ts` (723 linhas) | A qualidade interna (append-only, idempotência por período-calendário, caveat legal) levaria semanas — **mas o comprador não vê isso**, e Auvo/Produttivo já têm módulo de PMOC vendável (ver seção 3). |
| A disciplina "não sei ≠ não tem" em todo o produto | `erroIA.ts`, 3 estados em toda integração | Não é feature, é cultura de código. Concorrente não copia porque não percebe — mas também não perde venda por não ter. Vira fosso só quando o usuário compara a confiança dos dois no dia a dia. |

### O placar

De tudo que existe: **~70% se copia entre um fim de semana e um sprint.** Os
30% restantes (offline-first, bases de domínio, disciplina de honestidade) são
atritos reais mas invisíveis na demo — não impedem um concorrente de lançar um
clone *convincente* em 3 meses, ainda que pior por dentro.

Conclusão da seção: **não existe fosso de feature. Parem de procurar um.**
O que existe é vantagem de segmento e de custo (seção 5) e a chance de
construir os fossos de acúmulo (seção 2) — se houver usuários.

---

## 2. O QUE NÃO SE COPIA — e o que uma pessoa só consegue construir

### 2.1 O dado que só acumula com uso — o melhor fosso possível, e viável para você

**Histórico de preço do próprio prestador.** A ideia 2 do `DIFERENCIACAO`
("você cobrou isso 14 vezes, mais comum R$ 180") ainda não foi construída, e é
a feature com a melhor propriedade de fosso do backlog inteiro: o concorrente
pode copiar a *tela* num fim de semana, mas **não copia os 14 registros do seu
usuário**. Cada orçamento emitido no OLLI torna o OLLI melhor *para aquele
usuário* e pior a troca. É custo de troca crescendo sozinho, sem esforço seu.
Viável para uma pessoa: sim — é SQL local, sem IA, já desenhado.

**Base de defeitos por equipamento (entre usuários).** "Split Midea MSAF-12
com esse sintoma = porca flare em 60% dos casos" só nasce de milhares de OS
com marca/modelo/defeito preenchidos. Isso é um fosso de anos — e **hoje é
impossível**, porque não há usuários. O que dá para fazer agora, barato:
garantir que OS e diagnóstico gravem marca/modelo/sintoma/solução de forma
estruturada (o `equipamentos.ts` já encaminha isso) para que o dado exista
quando houver volume. Plantar agora, colher em 2027. Não prometer antes.

**Histórico do equipamento.** Cada manutenção registrada num equipamento com
QR é um dado que o app rival não tem. Trocar de sistema = perder a linha do
tempo do parque do cliente. No PMOC isso pesa dobrado (seção 3).

### 2.2 A etiqueta física — o fosso que ninguém está tratando como fosso

A etiqueta QR (`etiquetaQrPdf.ts` + `worker` resolvendo `/q/<token>`) é **o
único pedaço do OLLI que existe no mundo físico, colado no ativo do cliente
final**. Se o prestador troca de app, ou ele re-etiqueta o parque inteiro dos
clientes dele, ou os QRs viram lixo. Isso é custo de troca físico — a coisa
mais parecida com o "cabo na parede" das telecoms que um SaaS consegue ter.

E tem um segundo efeito que nenhum documento da operação nomeou: **cada QR é
um outdoor**. Quem escaneia a etiqueta é o cliente final — síndico, gerente de
loja, dono de clínica — exatamente a pessoa que contrata *outros* prestadores.
A página pública do passaporte do equipamento (ideia 6 do `DIFERENCIACAO`,
ainda não polida) é canal de aquisição de custo zero quando houver volume.
Viável para uma pessoa: sim, o worker já resolve o token; falta a página ser
boa.

### 2.3 A relação com o cliente final do prestador

O link `/o/token`, o PDF com depoimentos, o recibo bonito: o OLLI já aparece
na frente do cliente final mais do que qualquer concorrente brasileiro (o
Conectar tem app do cliente, mas exige instalar — o link não). O rodapé "feito
com OLLI" no plano grátis (white-label só no Pro) transforma cada usuário
grátis em distribuição. Isso não é fosso hoje; é a **semente** de um efeito de
rede fraco (prestador → cliente final → outro prestador) que só liga com
escala. Custo de manter: zero. Não atrapalha; deixar plantado.

### 2.4 O hábito diário

"Abrir o OLLI de manhã porque ele me diz quanto tem parado" é o fosso
comportamental. A feature se copia (é o radar); o hábito instalado, não — quem
já abre o OLLI todo dia não instala o clone para conferir se é igual. Mas
hábito só se instala em usuário que existe. De novo: tudo volta para a
Aposta 1.

### 2.5 O que uma pessoa só NÃO consegue construir (honestidade)

- **Efeito de rede de verdade** (marketplace, comunidade, integração com
  distribuidores de peça): exige gente de negócio em tempo integral. Não é
  para este ciclo.
- **Fosso regulatório de emissão fiscal** (custódia de certificado): já
  descartado com razão no `APIS` §5.6. Uma pessoa não opera custódia.
- **Fosso de marca**: marca se compra com anos ou com dinheiro. Você não tem
  nenhum dos dois sobrando. A marca do OLLI vai ser construída pelo documento
  que o cliente final recebe — mais nada por enquanto.

---

## 3. O PMOC — fosso de verdade ou detalhe?

### Os fatos, pesquisados

- **A lei existe e é federal.** Lei 13.589/2018: todos os edifícios de uso
  público e coletivo com ambientes climatizados artificialmente são obrigados
  a ter PMOC ([Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm)).
  Vale para escritório, loja, clínica, escola, academia, condomínio —
  praticamente todo cliente PJ de um técnico de refrigeração.
- **As multas assustam no papel**: R$ 2.000 a R$ 1,5 milhão conforme a
  gravidade, dobrada na reincidência
  ([Direct Ar](https://directarcondicionado.com.br/blog/pmoc-obrigatorio-lei-13589)).
- **Mas a fiscalização é fraca na prática.** O próprio Confea admite que as
  vigilâncias sanitárias fazem só ações pontuais e falta treinamento para
  fiscalizar em escala ([Confea](https://www.confea.org.br/sistema-necessita-dar-novos-passos-para-aplicacao-da-lei-do-pmoc)).
  Tradução: o comprador não compra por medo de multa amanhã — compra quando o
  condomínio, o auditor ou o contrato dele **exige o papel**.
- **O mercado embaixo é grande e é o segmento que mais cresce.** O setor
  AVAC-R faturou **R$ 50,15 bilhões em 2025** (+10,4%), com projeção de
  R$ 55,6 bi em 2026 — e o subsetor que mais cresceu foi exatamente
  **instalação e manutenção: +20,7% em 2025, projeção de +19,8% em 2026**, num
  setor com ~350 mil empregos
  ([ABRAVA](https://abrava.com.br/setor-de-ventilacao-ar-condicionado-e-refrigeracao-no-brasil-teve-faturamento-da-ordem-de-r-5015-bilhoes-em-2025/),
  [FEBRAVA](https://www.febrava.com.br/pt-br/blog/refrigeracao/setor-de-climatizacao-fatura-50-bi-em-2025.html)).
- **E a base de autônomos não para de crescer**: o Brasil passou de 12,9
  milhões de MEIs ativos, com mais de 1 milhão de novos MEIs de serviços só
  entre janeiro e abril de 2026
  ([Agência Sebrae](https://agenciasebrae.com.br/dados/meis-lideram-abertura-de-empresas-no-pais-e-ja-representam-78-dos-novos-negocios-em-2026/),
  [FENACON](https://fenacon.org.br/noticias/brasil-bate-recorde-de-microempreendedores-individuais-em-atividade/)).

### A parte que dói — e que nenhum documento da operação disse

**PMOC não é exclusividade do OLLI. Os dois concorrentes mais fortes já vendem
"software de PMOC" como página de produto** — Auvo tem módulo dedicado
([auvo.com/modulo-pmoc](https://www.auvo.com/modulo-pmoc)) e o Produttivo tem
página de produto e **domina o SEO do termo** com meia dúzia de artigos
ranqueando ([produttivo.com.br/programa-pmoc](https://www.produttivo.com.br/programa-pmoc/),
[modelo de PMOC](https://www.produttivo.com.br/blog/pmoc-pdf-modelo/)). Quem
buscar "software PMOC" hoje encontra eles, não o OLLI. Se alguém na operação
estava contando o módulo de PMOC como diferencial de feature, apague isso: é
paridade com os líderes.

### Então onde está o fosso do PMOC?

Em três lugares que os líderes não ocupam:

1. **O segmento.** Auvo e Produttivo vendem PMOC para a *empresa de
   manutenção* — preço sob consulta, venda com vendedor, cobrança por técnico.
   O técnico sozinho ou a dupla que atende a padaria, a clínica e o condomínio
   pequeno não passa pelo funil deles — não paga o custo do vendedor. **O OLLI
   a R$ 39 self-service é o único jeito economicamente viável de servir esse
   comprador.** Isso não é retórica: é a estrutura de custo deles trabalhando
   a seu favor (ver seção 5).
2. **O histórico.** PMOC é documento vivo: plano + registros de execução que
   precisam estar disponíveis para a fiscalização. O motor do OLLI é
   append-only e versionado (`pmoc.ts`) — feito para ser o **arquivo** do
   prestador. Depois de 2 anos de registros de um parque de 40 equipamentos
   dentro do OLLI, trocar de app significa carregar (ou perder) o histórico
   que protege o CNPJ do cliente dele. O PMOC é a feature onde o fosso de
   acúmulo (seção 2.1) liga mais rápido e com mais força.
3. **A honestidade legal.** O caveat do `pmoc.ts` ("o app não declara
   conformidade; quem valida é o responsável técnico") é o oposto do marketing
   dos concorrentes ("garanta sua conformidade"). Num nicho regulatório, ser o
   produto que não mente sobre a lei é posicionamento defensável — e barato.

### Veredito

**PMOC é a melhor cunha de entrada que o OLLI tem — não porque é fosso hoje,
mas porque é o único nicho onde a lei cria demanda recorrente, o mercado
embaixo cresce 20% ao ano, o comprador-alvo está descoberto pelos líderes, e o
produto já tem profundidade real (698 códigos, PMOC versionado, certificado,
calculadoras).** Um nicho obrigatório por lei é exatamente onde uma empresa de
uma pessoa deve começar: a demanda não precisa ser criada, só capturada.

Duas ressalvas para não se enganar:

- **Não vender por medo de multa.** A fiscalização fraca faz esse argumento
  soar falso para quem vive o mercado. Vender por "o síndico pediu o PMOC e
  você monta em 10 minutos no celular" — dor real, frequência real.
- **Não tentar ganhar a busca "software PMOC"** — o Produttivo tem anos de
  vantagem. Ir pela cauda longa que eles ignoram: "PMOC para técnico
  autônomo", "PMOC MEI", "modelo PMOC condomínio pequeno", "quanto cobrar
  PMOC" — as buscas de quem tem CNPJ na mão e ninguém atende.

---

## 4. A IA É FOSSO?

**Não. E quem disser que é está te vendendo otimismo.**

Todo mundo chama o mesmo Gemini/GPT. A Produttivo tem Manu IA, Auvo e Tecniko
têm NIKA — a voz→orçamento que era o orgulho do OLLI virou paridade antes de o
OLLI ter o primeiro pagante (`DIFERENCIACAO` Parte 2 já disse; confirmo). Em
12 meses, toda IA de categoria será igual na demo.

O que faria a IA do OLLI ser melhor **para este trabalho** não é o modelo — são
quatro coisas que ficam em volta dele:

1. **O contexto que só o OLLI tem.** IA respondendo com o dado do próprio
   prestador ("você cobrou isso 14 vezes...") é imbatível por um clone sem o
   histórico. A IA não é o fosso; **ela é a torneira — o fosso é a caixa
   d'água de dados dela** (seção 2.1). Sem dado acumulado, a IA do OLLI é
   igual à NIKA.
2. **A disciplina de não mentir.** `erroIA.ts`, os 3 estados, "abaixo de 5
   ocorrências, silêncio". Uma resposta errada dita com confiança na frente do
   cliente final mata a confiança para sempre. Concorrente que corre atrás de
   demo bonita erra aqui — é o erro que não aparece no lançamento e aparece no
   churn. É vantagem real, mas silenciosa: só vira fosso com o tempo de uso.
3. **O fallback offline** (698 códigos no aparelho). Subsolo, casa de máquinas,
   cobertura sem sinal — onde o técnico mais precisa. Concorrente online-first
   não replica isso sem a dor de meses da seção 1.
4. **A engenharia de custo.** Cache, idempotência, cota server-side, Gemini
   Flash em vez de APIs caras (o `APIS` provou: R$ 0,005/foto). É isso que
   permite dar IA no plano de R$ 39 enquanto a Auvo precisa embutir IA no
   preço "sob consulta". Custo não é fosso — mas sustenta o posicionamento de
   preço, que é a defesa da seção 5.

**Regra prática para o marketing:** nunca dizer "temos IA". Dizer o resultado:
"o orçamento sai antes de você tirar a luva". E jamais fazer da IA a
manchete — a manchete é o dinheiro parado.

---

## 5. SE COPIAREM A COISA BOA, QUAL É O PLANO

Cenário concreto: o radar de dinheiro parado aparece na screenshot da landing,
funciona, e em 6 meses a Tecniko (que já tem plano grátis permanente e preço
de R$ 59,90 — [tecniko.app](https://tecniko.app/blog/alternativa-ao-auvo)) lança
"Painel de Cobrança" igual. O que sobra?

### 5.1 A defesa estrutural: ser pequeno demais para valer a pena

A Auvo, a Field Control e o Produttivo vendem **sob consulta, com vendedor,
por técnico**. O custo de aquisição e o preço deles são calibrados para a
empresa com frota. Para atacar o autônomo de R$ 39, eles teriam que canibalizar
o próprio preço e desmontar o funil de vendas — empresa estabelecida não faz
isso para pegar um segmento que os investidores dela consideram pobre. **A
proteção do OLLI contra os grandes não é técnica: é que o cliente do OLLI dá
prejuízo para eles.** Essa defesa é real e dura anos (é o livro clássico de
disrupção por baixo — mas sem jargão: eles não descem porque descer custa caro).

Contra quem essa defesa NÃO funciona: **Tecniko** (grátis permanente,
R$ 59,90, IA) e o **Conectar** (R$ 79,90 usuários ilimitados,
[conectarplay.com](https://conectarplay.com/)). Esses já estão no andar de
baixo. É deles que o plano precisa tratar.

### 5.2 O plano concreto, em ordem

1. **Correr para instalar o custo de troca antes do clone chegar.** As três
   peças de acúmulo — preço sugerido pelo histórico, passaporte do equipamento
   por QR, arquivo de PMOC — têm que estar funcionando quando os primeiros
   cem usuários entrarem, porque é o uso *desde o primeiro mês* que cria o
   dado que segura o usuário no décimo segundo. Cada uma já está desenhada e
   nenhuma depende de terceiros. (Isto reordena a fila: o preço sugerido, que
   o `VISAO_FABLE` pôs na Aposta 2, é pela lente do fosso a feature mais
   importante do backlog — mais que qualquer integração nova.)
2. **Ocupar a cauda longa de SEO agora, enquanto é de graça.** As páginas por
   ofício já existem (`web/src/pages/para/[oficio].astro`); falta o conteúdo
   que responde a busca de quem tem a dor: NFS-e obrigatória em setembro
   (Resolução CGSN 189/2026 —
   [Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)),
   PMOC para autônomo, "quanto cobrar limpeza de split". Conteúdo publicado
   hoje compõe por anos e é o único canal de aquisição que uma pessoa sozinha
   sustenta. Clone não copia posição de busca.
3. **Fazer do documento a propaganda.** Todo orçamento grátis leva o rodapé do
   OLLI; todo QR colado é um outdoor. Quando o clone chegar, o OLLI precisa já
   estar circulando nas mãos dos clientes finais. Distribuição embutida no
   produto é a única "equipe de marketing" possível aqui.
4. **Ter dez depoimentos verdadeiros antes do clone ter um.** Os 5 prestadores
   reais do `VISAO_FABLE` §6 não são só teste de usabilidade — são a prova
   social que o clone não consegue falsificar. Prestador compra de prestador:
   "o Jorge da climatização usa" vale mais que qualquer feature.
5. **E se mesmo assim a Tecniko copiar tudo?** Então a disputa vira execução
   no nicho: o OLLI ganha se for **o melhor no PMOC/refrigeração** (onde tem
   profundidade que a Tecniko, generalista, não tem) e se o custo de troca do
   item 1 já estiver instalado. Se em 12 meses o OLLI não tiver nem usuários
   nem nicho dominado, nenhum plano salva — e é por isso que a resposta a
   "copiaram, e agora?" é sempre a mesma: **chegar primeiro no usuário, não na
   feature.**

### 5.3 O que NÃO é plano

- "A gente inova mais rápido" — uma pessoa não vence 50 engenheiros em
  velocidade de feature. Nunca apostar nisso.
- Patente, exclusividade, segredo de código — nada disso se aplica aqui.
- Dificultar exportação de dados para prender usuário — além de errado, mata
  a confiança que é o único ativo de marca. O custo de troca certo é o dado
  valer mais dentro do OLLI, não a porta trancada.

---

## 6. O QUE ABANDONAR — força gasta em terreno perdido

1. **Rastreamento de equipe além de "última posição"** (`EquipeAoVivoScreen`).
   Terreno onde Auvo/Field Control têm anos e o cliente deles é outro.
   Confirmo o corte do `DIFERENCIACAO`; pela lente do fosso é ainda mais
   claro: é gastar para empatar onde não há prêmio.
2. **Chat genérico** (`OlliChatScreen`). Compete com o ChatGPT do bolso dele.
   IA sem o dado do usuário é commodity — matar e realocar.
3. **O plano Empresa como frente ativa.** Discordo aqui do meio-termo do
   `VISAO_FABLE` (que aceitou "ou liga o paywall ou tira da tabela" como
   equivalentes): pela lente do fosso, **tirar da tabela é a resposta certa
   agora**. O comprador de R$ 99 exige gestão de equipe — exatamente o terreno
   da seção 6.1 onde o OLLI não vence. Cada hora no Empresa é uma hora tirada
   do prestador solo, único segmento onde existe defesa estrutural. Reabrir
   quando o solo estiver pago e pedindo upgrade (o sinal virá dos usuários,
   não do roadmap).
4. **Marketing multi-vertical simultâneo.** O código das verticais é barato e
   fica (`verticais.ts` esconde, não apaga — está certo). Mas uma pessoa não
   sustenta aquisição para 5 ofícios ao mesmo tempo, e a memória do dono pede
   landing de "prestador geral". Proposta de sequência, não de reversão: a
   landing pode ser geral, mas **o esforço de conteúdo, prova social e
   ajuste fino vai primeiro para refrigeração/PMOC** — o único ofício com lei
   criando demanda, mercado crescendo 20% a.a. e profundidade de produto já
   construída. Eletricista e encanador entram quando o primeiro nicho estiver
   pagando. (Discordância parcial e declarada com a visão da landing ampla
   como estratégia de lançamento.)
5. **iOS.** Já decidido (compra escondida, Onda 24) — reafirmo pela lente do
   fosso: iOS não adiciona um centímetro de fosso, só taxa de 15–30% e review.
   O prestador brasileiro de campo é Android. Voltar quando houver receita.
6. **Roteirização avançada e mapa embutido.** Já recusados pelos outros
   documentos; confirmo. Campo de batalha da Auvo, custo N², prêmio pequeno.
7. **Perseguir paridade de IA na propaganda.** Não gastar um minuto de
   marketing dizendo "temos IA por voz" — Manu/NIKA já neutralizaram. Gastar
   dizendo o número em reais.
8. **Qualquer feature nova que não acumule dado nem gere distribuição.** Régua
   simples para os próximos 6 meses, colável na parede: *"isso fica melhor
   quanto mais ele usa, ou aparece na frente do cliente final? Se nenhum dos
   dois, espera."* O radar de clima, por exemplo, é útil — mas falha na régua
   e pode esperar outubro (concordo com o `VISAO_FABLE` contra o ranking do
   `APIS`).

---

## Resumo em seis linhas

1. **Fosso hoje: nenhum.** ~70% do produto se copia entre um fim de semana e
   um sprint; o clone convincente sai em 3 meses. Parar de procurar fosso em
   feature.
2. O que não se copia: **dado acumulado por usuário, a etiqueta QR no mundo
   físico, hábito diário e estrutura de custo** — e os quatro exigem usuários,
   que exigem o caixa ligado. A Aposta 1 continua sendo tudo.
3. **PMOC é a cunha certa** (lei federal + manutenção crescendo 20% a.a. +
   comprador solo descoberto pelos líderes) — mas não é exclusividade: Auvo e
   Produttivo já vendem PMOC. O fosso é o segmento e o arquivo histórico, não
   o módulo.
4. **IA não é fosso** — é torneira. O fosso é a caixa d'água: o histórico do
   próprio prestador alimentando preço sugerido e diagnóstico. Priorizar o
   preço sugerido acima de qualquer integração nova.
5. Contra os grandes, a defesa é estrutural (o cliente de R$ 39 dá prejuízo
   para eles); contra Tecniko/Conectar, a defesa é chegar primeiro no usuário
   com custo de troca instalado e nicho dominado.
6. Abandonar: rastreamento, chat genérico, plano Empresa (tirar da tabela),
   marketing multi-vertical simultâneo, iOS, paridade de IA na propaganda — e
   toda feature que não acumula dado nem gera distribuição.

---

## Fontes

- [Lei 13.589/2018 — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm)
- [PMOC obrigatório: quem precisa e multas — Direct Ar](https://directarcondicionado.com.br/blog/pmoc-obrigatorio-lei-13589)
- [Confea: fiscalização do PMOC precisa avançar](https://www.confea.org.br/sistema-necessita-dar-novos-passos-para-aplicacao-da-lei-do-pmoc)
- [ABRAVA: setor AVAC-R faturou R$ 50,15 bi em 2025](https://abrava.com.br/setor-de-ventilacao-ar-condicionado-e-refrigeracao-no-brasil-teve-faturamento-da-ordem-de-r-5015-bilhoes-em-2025/) · [FEBRAVA: instalação e manutenção +20,7%](https://www.febrava.com.br/pt-br/blog/refrigeracao/setor-de-climatizacao-fatura-50-bi-em-2025.html)
- [Agência Sebrae: MEIs = 78% das novas empresas em 2026](https://agenciasebrae.com.br/dados/meis-lideram-abertura-de-empresas-no-pais-e-ja-representam-78-dos-novos-negocios-em-2026/) · [FENACON: recorde de MEIs ativos](https://fenacon.org.br/noticias/brasil-bate-recorde-de-microempreendedores-individuais-em-atividade/)
- [Auvo — módulo PMOC](https://www.auvo.com/modulo-pmoc) · [Produttivo — programa PMOC](https://www.produttivo.com.br/programa-pmoc/) · [Produttivo — modelo PMOC (SEO)](https://www.produttivo.com.br/blog/pmoc-pdf-modelo/)
- [Tecniko: plano grátis permanente, a partir de R$ 59,90](https://tecniko.app/blog/alternativa-ao-auvo) · [Conectar: R$ 79,90 usuários ilimitados](https://conectarplay.com/)
- [Receita Federal: NFS-e nacional obrigatória para o Simples em 01/09/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)

**Código lido:** `src/screens/` (40 + 21 desktop) · `src/services/{pmoc,radarCobranca,radarClientes,radarFollowUp,calculosOficio,verticais,planos,entitlements,olliIA,clienteLink,equipamentos}.ts` · `src/utils/{pdfGenerator,pixBrCode}.ts` · `webapp/src/pages/olli/` (16 grupos de rota, incl. os novos `radares.ts`/`RadarDinheiroCard.tsx`) · `worker/src/` (17 módulos, incl. `etaSaida.js` novo).
