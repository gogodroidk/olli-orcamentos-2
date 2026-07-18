# PRÉ-MORTEM — julho de 2027: o OLLI morreu. Esta é a autópsia.

> **Escrito em 18/07/2026**, depois de ler o código (`src/services/planos.ts`,
> `worker/src/`, os radares, o fluxo de créditos) e os documentos da operação
> (`VISAO_FABLE.md`, `DIFERENCIACAO_UAU.md`, `APIS_E_INTEGRACOES.md`,
> `AUDITORIA_RISCO.md`, `BLOQUEIOS.md`, `docs/ENTREGA.md`, `MISSAO.md`, `LOJA.md`).
> Todo fato do mundo tem URL. Todo fato do produto tem arquivo.
>
> **A técnica:** em vez de listar riscos (que o cérebro descarta), assumimos que
> a morte JÁ aconteceu e explicamos como. Estamos em julho de 2027. O domínio
> `olliorcamentos.online` não renovou. O que matou?
>
> Uma verdade desconfortável antes de começar: das sete mortes abaixo,
> **nenhuma é técnica**. O código está ~90% pronto e auditado. Todas as mortes
> passam por uma mesma artéria: **o produto nunca encostou num prestador de
> verdade, e cada mês que isso continuou verdade deixou todas as outras mortes
> mais prováveis.**

---

## MORTE 1 — Ninguém nunca soube que existia

**A narrativa.** Agosto de 2026: a branch foi mesclada, o worker subiu, o Pix
ligou. Tecnicamente, alguém *podia* pagar. Setembro: a landing está no ar,
bonita, com SEO — mas SEO de site novo leva meses para ranquear, e "sistema
para prestador de serviço" é palavra disputada por Auvo, Field Control,
Produttivo e Tecniko, que pagam tráfego há anos. Outubro: 40 visitas orgânicas
no mês, 3 cadastros, 0 que completaram um orçamento. Novembro: o dono conclui
que "falta a NFS-e" e volta a codar. Dezembro: a NFS-e está pronta e continua
não vindo ninguém, porque feature nova não gera visita. Março de 2027: o
Analytics mostra o mesmo platô. Junho: o dono para de olhar o Analytics.

O mercado existia — o Brasil tem **mais de 16,8 milhões de MEIs**
([gov.br](https://www.gov.br/memp/pt-br/assuntos/noticias/mei-completa-17-anos-e-segue-no-centro-das-politicas-do-governo-federal-para-mais-de-16-8-milhoes-de-empreendedores)),
**7,6 milhões deles em serviços**
([Brasil 61](https://brasil61.com/n/brasil-tem-15-7-milhoes-de-microempreendedores-individuais-bras2411699)).
O problema nunca foi mercado. É que **produto sem canal é segredo**. E o OLLI,
em julho de 2026, tem exatamente zero canais funcionando: sem base de e-mail,
sem perfil ativo em grupo de HVAC/eletricista, sem parceria com distribuidor de
peças, sem indicação — porque não tem usuário que indique.

**O sinal que apareceria primeiro (30–60 dias):** o funil da landing.
Visitas → cadastros → primeiro orçamento criado. Se em 60 dias pós-lançamento
esse funil tiver menos de 10 pessoas na última etapa, esta morte já começou.
Detalhe que dói: hoje esse funil **nem é medível** — a chave do PostHog não
existe (`BLOQUEIOS.md`, "feature codada e desligada até a chave existir").
O produto pode estar morrendo desta morte e não haveria como saber.

**O antídoto mais barato (esta semana):** não é tráfego pago nem blog. É
**vender na unha para 5 pessoas com nome e telefone**. Grupo de WhatsApp de
técnico de refrigeração da sua cidade, o eletricista que já fez serviço na sua
casa, o balcão da distribuidora de peças. O APK de debug que já existe instala
sem loja. Cinco prestadores usando é simultaneamente: canal, pesquisa de campo
e a prova que a landing não tem (depoimento real).

**O que NÃO fazer:** não comprar tráfego antes de 5 usuários orgânicos
completarem o ciclo (pagar para levar gente a um funil não validado é queimar
dinheiro para descobrir mais rápido que o funil vaza). E não tratar a onda de
SEO da NFS-e de setembro como "o canal" — ela é uma maré de uma estação, não
um canal permanente.

---

## MORTE 2 — O dono cansou (a morte silenciosa)

**A narrativa.** Nenhum dia específico. Agosto de 2026: o merge acontece, as
migrations rodam, o dia tem 46 commits de glória técnica atrás e zero clientes
na frente. Setembro: o Play Console pede screenshots, questionário IARC,
data safety — burocracia sem dopamina. Outubro: primeira fatura do Google
Cloud, primeira renovação de domínio, e a receita segue R$ 0. O OLLI é tocado
em paralelo, então cada hora nele compete com trabalho que paga boleto.
Novembro: as sessões de código ficam quinzenais. Janeiro de 2027: uma lib do
Expo deprecia, o build quebra, e consertar build de app que ninguém usa é a
tarefa mais desmotivante que existe. Março: o projeto Supabase (se estiver no
plano grátis) **pausa sozinho após 7 dias sem atividade de banco**
([docs do Supabase](https://supabase.com/docs/guides/platform/free-project-pausing))
— e fica pausado 3 semanas até alguém notar, porque não há usuário para
reclamar. Julho de 2027: o repositório tem 5 commits no ano.

Esta morte não tem vilão nem dia. Ela é a morte-padrão de projeto solo sem
resposta do mercado: **o produto não morre; o dono para de voltar.**

**O sinal que apareceria primeiro (30–60 dias):** os itens humanos de 15
minutos continuarem abertos. O `MP_WEBHOOK_SECRET` — o ÚNICO item entre o
produto e a capacidade de receber dinheiro, estimado em 15 minutos — está
pendente em `BLOQUEIOS.md` há dias. Quando a tarefa mais barata e mais
importante da lista fica parada enquanto se produzem 46 commits de polimento,
isso não é falta de tempo. É evitação — e evitação é o primeiro estágio do
cansaço. O termômetro: se em 18/08/2026 o checklist "Destrava RECEITA" de
`BLOQUEIOS.md` ainda tiver caixas vazias, esta morte está em curso.

**O antídoto mais barato (esta semana):** fazer os passos humanos AGORA,
enquanto a energia da operação existe — webhook, migrations, worker, na mesma
janela (a ordem já está escrita em `docs/ENTREGA.md`, passo a passo). E trocar
a métrica pessoal: parar de contar commits, passar a contar conversas com
prestador. Uma conversa por semana mantém um projeto vivo melhor que dez
commits, porque devolve dopamina de gente, não de gate verde.

**O que NÃO fazer:** não "reservar um fim de semana para resolver tudo da
loja". Projetos paralelos morrem esperando o fim de semana perfeito. Um item
humano por dia, 15 minutos, esgota a lista em duas semanas.

---

## MORTE 3 — O primeiro prestador de verdade desistiu no terceiro dia

**A narrativa.** Setembro de 2026: o app finalmente chega na mão do Jorge,
técnico de split em Diadema, indicado por um conhecido. O APK tem 125 MB
(`docs/ENTREGA.md`) — no Moto G do Jorge, com 3 GB livres e 4G oscilando, o
download já é um suspiro. Ele abre. Quer uma coisa: fazer o orçamento da
cliente de amanhã. O app pede cadastro, e-mail, confirma e-mail. Ele tenta a
voz — a tela pede confirmação de crédito, ele não entende o que é crédito, tem
medo de estar sendo cobrado, cancela. Digita o orçamento no teclado, sai
bonito em PDF — isso ele gosta. Dia 2: abre de novo, esquece a senha, o fluxo
de recuperar manda e-mail para uma caixa que ele não olha no celular. Dia 3:
a cliente chama no WhatsApp, ele responde por lá, faz o preço por áudio como
sempre fez. Nunca mais abre o app. Quando perguntam, diz: "é bom, mas é muita
coisa". O app nunca fica sabendo o motivo — só registra o silêncio.

Isso não é azar: **77% dos usuários abandonam um app nos 3 primeiros dias, e
90% em 30 dias**
([Business of Apps](https://www.businessofapps.com/data/app-retention-rates/)).
Para o OLLI o risco é maior que a média, porque — como o próprio enxame
admitiu na seção "O risco que ninguém está olhando" de `VISAO_FABLE.md` —
**zero minutos de observação de campo** existiram até hoje. O APK atual nunca
foi sequer aberto num aparelho (`docs/ENTREGA.md`: "não testei em aparelho
nenhum — a maior lacuna do pacote"). O produto foi calibrado por 67 agentes
para um prestador imaginado.

**O sinal que apareceria primeiro (30–60 dias):** instalações sem segundo dia.
Cadastros que não criam o primeiro orçamento em 24h. E o silêncio no grupo de
WhatsApp dos testadores — testador que não reclama não está usando.

**O antídoto mais barato (esta semana):** assistir. Cinco prestadores, uma
semana, um grupo de WhatsApp para reclamar em voz alta — exatamente o que o
`VISAO_FABLE.md` já receitou, com um adendo deste documento: **assistir o
primeiro uso ao vivo** (presencial ou por chamada com tela compartilhada) de
pelo menos 2 deles. O que trava usuário no dia 1 nunca é o que o construtor
imagina — é sempre um botão que ele não achou ou uma palavra que ele não
entendeu. E ligar a chave do PostHog antes (item de minutos), senão o teste
gera opinião e não gera número.

**O que NÃO fazer:** não responder ao primeiro feedback com uma onda de
features. A resposta certa para "é muita coisa" é esconder, não adicionar. O
app tem 61 telas; o Jorge precisava de 3.

---

## MORTE 4 — Um dado sumiu, e a confiança foi junto

**A narrativa.** Fevereiro de 2027: o OLLI tem 30 usuários ativos, os
primeiros 6 pagantes. Um deles, empresa pequena de climatização com dois
técnicos, usa desde novembro. Numa terça-feira, dois aparelhos offline criam
orçamento ao mesmo tempo — e a trava definitiva de numeração no banco é
exatamente a migration que ficou **deliberadamente não aplicada**
(`20260727_numero_unico_por_tenant.sql.pendente` — `docs/ENTREGA.md`: "dois
aparelhos offline ao mesmo tempo ainda podem colidir"). Dois clientes recebem
orçamentos com o mesmo número. Um deles é uma administradora de condomínio que
recusa o documento por "inconsistência". O dono da empresa de climatização
posta no grupo de WhatsApp de 400 técnicos onde foi buscado como cliente:
"cuidado com esse app, saiu dois orçamentos com o mesmo número, quase perdi
contrato". Neste mercado, que funciona por indicação, uma mensagem dessas num
grupo grande desfaz seis meses de trabalho. Março: churn dos pagantes.
O suporte é uma pessoa — a mesma que desenvolve, vende e dorme.

Versão alternativa da mesma morte, ainda mais barata: **a produção de hoje
roda a versão PRÉ-operação** (`docs/ENTREGA.md`: painel e landing no ar são
de antes da branch; o worker não subiu). Ou seja: os bugs já *achados e
consertados* — backup do técnico levando a base do dono, pull de empresa sem
filtro de dono, IA de graça no caixa (`AUDITORIA_RISCO.md`, achados
reconferidos à mão) — continuam **vivos no ar**. Se o primeiro usuário real
chegar antes do merge, ele estreia na versão que a própria auditoria já
condenou.

**O sinal que apareceria primeiro (30–60 dias):** a primeira mensagem de
suporte contendo a palavra "sumiu". E crashes indecifráveis: sem o
`SENTRY_AUTH_TOKEN`, o stack trace chega minificado
(`index.hbc:1:9553539` — `BLOQUEIOS.md`), ou seja, o app quebra na mão do
usuário e não dá para saber onde.

**O antídoto mais barato (esta semana):** (1) mesclar e subir — os consertos
existem, só não estão no ar; (2) o token do Sentry, 2 minutos, para enxergar o
primeiro crash real; (3) ensaiar UMA restauração de backup de ponta a ponta na
conta demo — backup que nunca foi restaurado é uma esperança, não um backup;
(4) decidir a numeração atômica (FOLLOWUPS #31) antes do primeiro cliente com
dois aparelhos, não depois.

**O que NÃO fazer:** não fazer o merge big-bang. 36+ commits, 5 migrations e
troca de chave de cobrança num ato único é estrear o caixa e o risco no mesmo
instante — fatiar como `VISAO_FABLE.md` já mandou (worker+migrations primeiro,
app/painel depois, landing por último).

---

## MORTE 5 — A loja disse não (ou disse "espere")

**A narrativa.** Setembro de 2026: conta do Play Console criada — **pessoal**,
porque era mais rápido. Surpresa: conta pessoal criada depois de 13/11/2023
exige **teste fechado com 12 testadores opt-in por 14 dias contínuos** antes
de poder pedir produção
([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)).
O dono não tem 12 testadores — não tem nem 5 (ver Morte 1). Outubro passa
recrutando testador. Novembro: produção liberada, app no ar. Janeiro de 2027:
e-mail do Google Play — o app vende bem digital (créditos de IA) por Pix
próprio, fora do Play Billing, exatamente o risco que a auditoria já tinha
classificado como P1 (`AUDITORIA_RISCO.md` #8: "Android: bem digital sem Play
Billing"). O app é removido até adequação. A adequação (Billing Library ou
user choice billing) é semanas de trabalho numa fase em que o dono já está na
Morte 2. O iOS nunca aconteceu (nunca houve pasta `ios/`; a Apple exige IAP
com taxa de 15–30% para o crédito consumido no app). Resultado: o produto
vira "só web" — e o web é justamente a metade sem alma (`DIFERENCIACAO_UAU.md`:
os radares, a voz, o PMOC moram no app).

**O sinal que apareceria primeiro (30–60 dias):** na primeira semana de
Play Console, a escolha pessoal × organização; e qualquer e-mail de política
do Google. Este sinal é dos raros que dá para **antecipar a zero custo**: a
resposta já está escrita em `docs/ENTREGA.md` (recomendação: organização, o
CNPJ da GR Tech existe).

**O antídoto mais barato (esta semana):** (1) abrir a conta como
**organização** — elimina a trava dos 12 testadores de uma vez; (2) decidir
JÁ o modelo de compra no Android: a saída barata e reversível é a mesma do
iOS — `COMPRA_NO_APP` desligado também no Android, compra só pelo site — até
ter volume que justifique integrar Play Billing. Vender por Pix dentro do APK
publicado é carregar o motivo da suspensão para dentro da loja.

**O que NÃO fazer:** não gastar um mês em StoreKit/IAP agora (o
`VISAO_FABLE.md` já recusou, e este documento concorda: taxa de 15–30% sobre
uma receita que ainda é zero é otimização de imposto de quem não tem renda).
E não publicar o APK antes das migrations — `docs/ENTREGA.md`, passo 5:
APK construído contra servidor sem cota carrega a IA ilimitada para dentro da
loja, e trocar APK publicado é mais lento que trocar servidor.

---

## MORTE 6 — A conta chegou antes da receita

**A narrativa.** Esta é a morte mais barata de todas — e por isso quase
vergonhosa. Agosto de 2026: o worker ainda não subiu e a migration de cota não
rodou, então **a cobrança de IA em produção é ilimitada por design declarado**
(`BLOQUEIOS.md`: "enquanto a migration `20260727_ia_cota_gratis.sql` não
rodar, a cobrança de IA é ILIMITADA"). Um usuário curioso — ou um script que
achou o endpoint — usa Gemini na conta do dono. O alerta de orçamento do
Google Cloud (teto 50) dispara num sábado. Não é dinheiro que quebra ninguém:
Gemini 2.5 Flash custa centavos por chamada
([ai.google.dev](https://ai.google.dev/gemini-api/docs/pricing)). O que mata
não é o valor — é o **efeito psicológico composto** sobre a Morte 2: cada
fatura (Google Cloud, domínios, Apple US$ 99/ano, Supabase Pro quando o grátis
pausar, Cloudflare) chega contra uma receita de R$ 0, e todo mês o projeto
"paga para existir". Em fevereiro de 2027, na renovação anual de alguma conta,
o dono faz a conta que todo fundador solo faz um dia: "isso aqui já me custou
X e me devolveu zero". Cancelar vira alívio.

**O sinal que apareceria primeiro (30–60 dias):** o primeiro e-mail de alerta
de orçamento do Google Cloud; ou o primeiro mês em que a fatura somada da
infra superar R$ 100 com zero pagantes.

**O antídoto mais barato (esta semana):** o buraco tem UM tampão e ele já está
escrito — subir o worker e aplicar a migration nº 4 na mesma janela
(`docs/ENTREGA.md`, passos 3–4). Depois disso a IA do grátis vale 3 usos/mês
decididos no servidor (`IA_USOS_GRATIS_MES = 3`, `src/services/planos.ts:159`)
e o teto de custo por usuário fica conhecido. Complemento de 10 minutos:
conferir que o budget do Google Cloud tem **corte**, não só alerta.

**O que NÃO fazer:** não adicionar nenhuma feature com custo variável por uso
(ETA completo, clima, WhatsApp API) antes do primeiro pagante — o
`VISAO_FABLE.md` já recusou as três, e a lente do pré-mortem endossa com força:
custo marginal sem receita marginal é a Morte 6 pedindo passagem.

---

## MORTE 7 — O produto perfeito que nunca foi lançado

**A narrativa.** Esta morte não precisa de futuro: ela está acontecendo em
câmera lenta desde já. Julho de 2026: 46 commits de melhoria, gate verde, 455
asserções — e a regra registrada do dono: *"só builda quando o ciclo comercial
estiver perfeito e testado"* (`BLOQUEIOS.md`). Agosto: mais uma onda acha mais
20 achados (a Onda 23 achou 20; a 25 achou furos na 24; a 26 achou furos na
25 — **cada onda de perfeição fabrica a justificativa da próxima**). Setembro:
a janela da NFS-e — a única data de marketing do ano, quando milhares de
prestadores do Simples são obrigados ao Emissor Nacional
([gov.br](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional))
— passa com o produto ainda "quase pronto". Dezembro: a branch acumulou tanto
que o merge dá medo, e coisa que dá medo é adiada. O Tecniko, com plano grátis
permanente ([tecniko.app](https://tecniko.app/blog/alternativa-ao-auvo)), e o
Conectar, a R$ 79,90
([conectarplay.com](https://conectarplay.com/)), recolhem os prestadores que
pesquisaram. Julho de 2027: o OLLI está tecnicamente melhor que ambos. Está
também em zero celulares.

O polimento é sedutor porque **dá resposta**: o gate fica verde, o contraste
passa, o cético aprova. O mercado não responde nada — até você lançar. Buscar
a resposta onde ela é garantida em vez de onde ela importa é o viés que mata
fundador tecnicamente forte. Não por acaso, a razão nº 1 de morte de startup
nos post-mortems clássicos é "não havia necessidade de mercado" (42%) — que
quase sempre significa "descobrimos tarde demais porque lançamos tarde demais"
([CB Insights](https://www.cbinsights.com/research/report/startup-failure-reasons-top/)).

**O sinal que apareceria primeiro (30–60 dias):** simples e binário — a branch
continuar não-mesclada e o checklist de receita intocado em 18/08/2026,
enquanto novas ondas de melhoria continuam sendo produzidas.

**O antídoto mais barato (esta semana):** declarar o produto BOM O SUFICIENTE
por decreto, porque por critério ele nunca será (o critério anda). Merge
fatiado esta semana. Congelamento de feature por 30 dias: nenhuma linha nova
de produto até 5 prestadores reais completarem o ciclo
orçamento → aprovação → recibo. O gate desses 30 dias não é `npm test` —
é gente.

**O que NÃO fazer:** não lançar mais nenhuma onda de auditoria/polimento antes
do merge. Discordância explícita com a inércia da operação: o `MISSAO.md`
programa "cadência de polish até o dono voltar" — este documento diz que a
cadência certa agora é **zero**. Cada onda nova aumenta o pacote do merge,
o medo do merge, e a distância até o primeiro usuário.

---

## A MORTE QUE FICOU DE FORA (e por quê)

**"Um concorrente com dinheiro lançou o mesmo e comprou o mercado."** Não
entrou no ranking. Auvo, Field Control e Produttivo miram o gestor de equipe,
não o autônomo (`DIFERENCIACAO_UAU.md`); o mercado de 7,6 milhões de MEIs de
serviço é grande demais para qualquer um "comprar"; e concorrente grande
mata startup pequena por asfixia de distribuição — que é a Morte 1, já
ranqueada, com ou sem concorrente. Se o Jobber lançar em português amanhã, a
causa da morte no atestado continuaria sendo "ninguém conhecia o OLLI", não
"o Jobber chegou". Também ficou de fora "a complexidade técnica ficou grande
demais para uma pessoa": é real (app + painel + landing + worker + Supabase +
2 lojas é superfície de empresa de 5 pessoas), mas ela não mata sozinha — ela
é o combustível da Morte 2, e o antídoto é o mesmo: encolher a superfície,
não aguentá-la.

---

## O RANKING — qual morte é a mais provável DE VERDADE

Pela leitura do código, dos documentos e do comportamento registrado da
operação (não do que se diz, do que se **faz**):

1. **Morte 7 + Morte 2, que são a mesma espiral** — o produto nunca é lançado
   de verdade, e o dono cansa antes de lançar. É a mais provável porque é a
   única que **já está acontecendo**: a evidência não é hipótese, está no
   repositório. Quarenta e seis commits de perfeição e o webhook de 15 minutos
   parado. A regra "só builda quando estiver perfeito". Ondas que fabricam
   ondas. Um produto com zero usuários sendo polido com precisão crescente.
   Nada disso é engenharia ruim — é engenharia ótima apontada para longe do
   único gate que importa, que é um estranho pagando.
2. **Morte 1 (ninguém soube que existia)** — se o lançamento acontecer, esta
   é a próxima na fila, porque não existe nenhum canal montado e nem o
   instrumento de medir o silêncio (PostHog sem chave) está ligado.
3. **Morte 3 (desistiu no terceiro dia)** — se alguém aparecer, o produto
   nunca foi visto na mão de um prestador; a estatística de 77% em 3 dias
   pega app calibrado no escuro.
4. **Morte 5 (loja)** — provável como ATRASO (conta pessoal, Play Billing),
   improvável como morte direta; mas atraso alimenta a espiral do item 1.
5. **Morte 4 (dado traído)** — grave porém menos provável no curto prazo,
   porque exige o que ainda não existe: usuários. Cresce de probabilidade
   exatamente na velocidade do sucesso.
6. **Morte 6 (conta antes da receita)** — a mais barata de prevenir; só mata
   em combinação com a 2.

Honestidade final do ranking: os documentos da operação — todos bons —
compartilham um pressuposto otimista: que "ligar o caixa" gera pagantes. Não
gera. **Ligar o caixa multiplica por 1 um número que hoje é zero.** O caixa é
condição necessária (e são só cliques, faça), mas a variável que decide se o
OLLI existe em julho de 2027 é quantos prestadores de carne e osso o dono
colocou dentro do produto — e essa variável não tem commit, não tem gate, não
tem enxame que a produza. Só tem o dono, o telefone e a semana que vem.

---

## O QUE EU FARIA SEGUNDA-FEIRA DE MANHÃ SE FOSSE VOCÊ

1. **Segunda de manhã, 1 hora, o caixa:** `MP_WEBHOOK_SECRET` no cofre +
   registrar o webhook no painel MP + `wrangler deploy` + as 5 migrations na
   ordem de `docs/ENTREGA.md` (NÃO a `.pendente`), tudo na mesma janela.
   Fecha as Mortes 6 e metade da 4, e mata o item de evitação da Morte 2.
2. **Segunda à tarde, os instrumentos (30 min):** chave do PostHog +
   `SENTRY_AUTH_TOKEN`. Sem eles, tudo que acontecer nos próximos 60 dias
   acontece no escuro.
3. **Terça, o merge — fatiado, não big-bang:** worker+migrations já subiram
   segunda; agora app/painel, depois landing. Produção para de rodar a versão
   que a sua própria auditoria condenou.
4. **Quarta, as 5 pessoas:** mandar o APK de debug (instala sem loja) para 5
   prestadores de verdade — pelo menos 2 que você não conhece — com um grupo
   de WhatsApp para reclamarem. Assistir ao primeiro uso de 2 deles ao vivo.
   Isso vale mais que a próxima onda de 67 agentes, e o enxame inteiro
   concorda.
5. **Quinta, tirar as mortes do caminho por decreto:** conta Play Console
   como **organização** (CNPJ da GR Tech) + decidir compra no Android fora do
   app (mesmo interruptor do iOS) até existir volume + congelar feature nova
   por 30 dias. O critério de descongelamento não é gate verde: é o primeiro
   estranho completando orçamento → aprovação → recibo sem você no ombro.

---

### Fontes (fatos do mundo citados)

- MEIs no Brasil: [gov.br — 16,8 milhões](https://www.gov.br/memp/pt-br/assuntos/noticias/mei-completa-17-anos-e-segue-no-centro-das-politicas-do-governo-federal-para-mais-de-16-8-milhoes-de-empreendedores) · [Brasil 61 — 7,6 mi em serviços](https://brasil61.com/n/brasil-tem-15-7-milhoes-de-microempreendedores-individuais-bras2411699) · [Agência Sebrae](https://agenciasebrae.com.br/dados/metade-das-empresas-brasileiras-sao-mei/)
- Retenção de apps (77% somem em 3 dias): [Business of Apps](https://www.businessofapps.com/data/app-retention-rates/)
- Play Console — conta pessoal exige 12 testadores × 14 dias: [Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- Supabase — pausa de projeto grátis por 7 dias de inatividade: [supabase.com/docs](https://supabase.com/docs/guides/platform/free-project-pausing)
- Razões de morte de startups (42% "no market need"): [CB Insights](https://www.cbinsights.com/research/report/startup-failure-reasons-top/)
- NFS-e nacional obrigatória p/ Simples em 01/09/2026: [Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)
- Preços de concorrentes: [Conectar R$ 79,90](https://conectarplay.com/) · [Tecniko grátis permanente / R$ 59,90](https://tecniko.app/blog/alternativa-ao-auvo) · [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
