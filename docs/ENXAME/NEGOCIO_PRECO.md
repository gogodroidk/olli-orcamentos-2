# NEGÓCIO — quanto cobrar, por quê, e o que fazer no iPhone

> Escrito em 18/07/2026. Antes de opinar eu li o código que decide dinheiro
> (`src/services/planos.ts`, `src/services/entitlements.ts`, `src/services/pixCreditos.ts`,
> `worker/src/creditos.js`, `worker/src/mercadopago.js`, `src/screens/PlanosScreen.tsx`,
> `src/screens/CreditosScreen.tsx`, migration `20260725_equipe_grandfathering.sql`) e os
> documentos da operação (`VISAO_FABLE.md`, `DIFERENCIACAO_UAU.md`, `AUDITORIA_RISCO.md`,
> `BLOQUEIOS.md`, `MISSAO.md`, `LOJA.md`, `docs/PESQUISA_GATEWAY_PRECOS.md`).
> Todo fato de mundo (preço de concorrente, taxa da Apple, fatia do iPhone) foi pesquisado
> hoje na web, com URL. Onde a conta é minha, eu digo que é minha.
> Câmbio assumido: R$ 5,50/US$ (mesmo do DIFERENCIACAO_UAU — confira antes de fechar preço).

**A notícia que muda uma das suas perguntas:** desde **18/06/2026** a Apple é obrigada,
por acordo com o CADE, a aceitar venda por **link externo dentro do iOS no Brasil** — a
premissa "iPhone só com IAP de 15–30%" ficou velha há um mês. A conta completa está na
seção 4. Três documentos da operação (AUDITORIA_RISCO, LOJA, VISAO_FABLE item 8) foram
escritos na premissa antiga; eles não estavam errados quando escritos, mas a decisão de
iOS precisa ser refeita com o número novo.

---

## 0. Antes de qualquer preço: hoje ninguém consegue te pagar

Preço só existe quando alguém pode pagar. Falta o `MP_WEBHOOK_SECRET` + registro do
webhook (15 min, `BLOQUEIOS.md`) e as migrations. Enquanto isso, toda esta discussão é
ensaio. **Nada nesta página justifica adiar a Aposta 1 do VISAO_FABLE** — e nenhuma
mudança de preço deve ser feita ANTES de o caixa ligar: mexer em preço sem nenhum dado de
conversão é trocar um chute por outro.

---

## 1. O preço dos planos está certo?

### O que os concorrentes cobram HOJE (pesquisado 18/07/2026)

| Concorrente | Preço público | Modelo | Grátis? | Fonte |
|---|---|---|---|---|
| **Auvo** | **não publica** ("fale com consultor"); entrada relatada como alta | por usuário | trial | [Capterra](https://www.capterra.com/p/201778/Auvo/), [GetApp](https://www.getapp.com/operations-management-software/a/auvo/) |
| **Field Control** | **R$ 295/usuário/mês** (preço inicial listado no Capterra); módulos adicionais R$ 89/mês; implantação R$ 899 | por usuário | trial, sem plano grátis | [Capterra](https://www.capterra.com/p/207608/Field-Control/), [Omie Store](https://store.omie.com.br/apps/field-control) |
| **Produttivo** | **não publica** (4 planos, todos "sob consulta") | por usuário | trial 15 dias | [produttivo.com.br/planos](https://www.produttivo.com.br/planos/) |
| **Conectar Sistemas** | **R$ 79,90/mês, usuários ilimitados**, tudo incluso | por conta | trial 10 dias | [conectarplay.com](https://conectarplay.com/) |
| **Tecniko** | pago a partir de **R$ 59,90/mês**; **plano grátis permanente** | por conta | sim | [tecniko.app](https://tecniko.app/blog/alternativa-ao-auvo) |
| **OLLI** | **R$ 0 / R$ 39 / R$ 99** (anual com 20% off: R$ 374,40 / R$ 950,40) | por conta | sim, generoso | `PlanosScreen.tsx`, `worker/src/mercadopago.js:49-58` |

**Sobre o "Contornos" do briefing:** pesquisei e **não encontrei** concorrente com esse
nome. Os documentos da operação citam **Conectar** (conectarplay.com) como o quarto
concorrente BR — assumo que era ele. Se "Contornos" existir mesmo, me mande o link, porque
hoje ele não aparece em busca.

### Veredito: R$ 39 está certo. Não mexa.

1. **R$ 39 não é "barato demais que sinaliza produto ruim" — é outra categoria.** Auvo e
   Field Control cobram por usuário e vendem para o **gestor de frota de técnicos**
   (R$ 295/usuário é preço de empresa com CNPJ robusto e 10 técnicos). O OLLI vende para o
   cara sozinho. R$ 39 diz exatamente o que o produto é: "sou seu, não do seu patrão".
   O sinal de qualidade, para esse público, não vem do preço — vem do PDF bonito que o
   cliente final recebe e do app funcionar offline. Quem carrega o sinal de "produto sério"
   é o plano **Grátis sem pegadinha** (orçamento ilimitado), não o número 39.
2. **As âncoras psicológicas do público confirmam a faixa.** O DAS-MEI de serviços em 2026
   é **R$ 86,05/mês** ([Receita/Simples Nacional](https://www8.receita.fazenda.gov.br/simplesnacional/noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3),
   [Nubank blog](https://blog.nubank.com.br/valor-das-mei/)). R$ 39 é "menos da metade do
   meu imposto" — frase que vende sozinha. R$ 99 do Empresa fica logo acima do DAS, ainda
   abaixo do Conectar+um funcionário em qualquer concorrente por usuário.
3. **O concorrente direto de preço não é o Auvo — é o Tecniko (R$ 59,90 com grátis
   permanente) e o Conectar (R$ 79,90).** O OLLI a R$ 39 entra por baixo dos dois com um
   produto mais completo que o Tecniko. Isso é posição de ataque, não de fraqueza.
4. **Publicar preço é arma, não vulnerabilidade.** Verificado hoje: Auvo e Produttivo
   escondem preço; Field Control só aparece via Capterra. O LANDING_BLOG_SEO já notou isso
   (post 20: "comparativo com preço na mesa é conteúdo que só quem publica preço pode
   escrever"). Concordo e reforço: manter R$ 0/39/99 público e visível é diferenciação de
   confiança que os grandes não podem copiar sem reestruturar o funil de vendas deles.

**O que NÃO fazer:**
- **Não baixar o preço** para "facilitar a entrada" — a entrada já é o Grátis. Baixar o
  Pro só reduz a receita de quem já ia pagar.
- **Não subir agora.** Com zero pagantes, subir preço é otimizar uma função sem dado.
  A hora de subir é a seção 6.
- **Não criar "promoção de lançamento com desconto".** Desconto sobre R$ 39 treina o
  cliente a esperar desconto. Se quiser gatilho de urgência, use o **preço travado de
  fundador** (seção 6), que é urgência sem desvalorizar.
- **Não copiar o "por usuário" dos grandes.** O modelo por conta é parte da promessa ao
  autônomo. O dia de cobrar por usuário é dentro do Empresa, nunca no Pro.

Uma ressalva honesta sobre margem: o Pro dá `ia_ilimitada` (entitlements.ts). A IA de voz
usa Gemini com custo de centavos por chamada; mesmo um usuário pesado (200 chamadas/mês)
custa poucos reais. R$ 39 aguenta. Mas essa conta só continua verdadeira enquanto a
migration da cota estiver aplicada — **hoje, sem ela, a IA está fail-open e de graça para
qualquer conta** (`BLOQUEIOS.md`). Mais um motivo para a Aposta 1 vir antes de qualquer
discussão de preço.

---

## 2. O modelo de crédito faz sentido para este público?

### O que existe no código

- Pacotes (fonte única `worker/src/mercadopago.js:41-44`): **50 cr/R$ 24,90 (R$ 0,498/cr) ·
  150 cr/R$ 49,90 (R$ 0,333/cr) · 400 cr/R$ 99,90 (R$ 0,250/cr)**, pagos por Pix.
- Só **voz_ia (1 crédito)** cobra de fato. Grátis tem 3 usos de IA/mês; Pro/Empresa não
  tocam em crédito (ilimitado).
- O rascunho antigo (R$ 0,10–0,15/cr em `docs/ESTRATEGIA_SUPERIor.md`) diverge da produção.

### Veredito: o modelo está certo, a divergência de preço precisa morrer

**Prestador brasileiro entende pré-pago melhor do que quase qualquer público do mundo.**
Recarga de celular é pré-paga; a maquininha desconta por transação; e o GetNinjas — que
boa parte desse público já usou — vende **moedas para desbloquear contato, a R$ 12–30 por
lead** (referência já apurada com URL em `docs/PESQUISA_GATEWAY_PRECOS.md`). Crédito não é
atrito cultural aqui. Atrito seria mensalidade obrigatória sem plano grátis.

O que o crédito resolve, e a cota-no-plano não resolve:
- **Controle de gasto para quem tem caixa apertado.** "Coloquei R$ 24,90, uso até acabar"
  é previsibilidade na cabeça desse público — mais até do que assinatura, porque não tem
  cobrança recorrente surpreendendo o cartão.
- **Ponte de conversão.** Quem estoura os 3 usos grátis e paga R$ 24,90 de créditos já
  provou que paga. Quando o gasto mensal dele em créditos encostar em R$ 20–39, o app deve
  dizer: *"esse mês você gastou R$ 32 em créditos — no Pro por R$ 39 a IA é ilimitada"*.
  Essa frase é o vendedor mais barato que o OLLI vai ter. (117 ações de voz no pacote
  médio = R$ 39; um usuário que chega perto disso é Pro por definição.)

As três regras para o modelo não virar bagunça:

1. **Crédito só cobra o que tem custo por uso real** (IA na nuvem hoje; WhatsApp API se um
   dia entrar). Feature de produto (relatório, radar, PDF premium) é plano, nunca crédito.
   O código já respeita isso — manter.
2. **Assinante não vê a palavra "crédito".** Pro/Empresa têm IA ilimitada; mostrar saldo
   de crédito para eles cria uma segunda moeda mental sem função. Hoje o CreditosScreen
   é acessível a todos — quando houver tempo, esconder/neutralizar para plano pago.
3. **Uma tabela de preço só.** A produção (R$ 0,25–0,50/cr) tem margem provada
   (`PESQUISA_GATEWAY_PRECOS.md` calcula piso de segurança ~R$ 0,09/cr); o rascunho de
   R$ 0,10–0,15 encosta no piso e nunca foi validado. **Marque o rascunho como morto**
   (uma linha no topo do `ESTRATEGIA_SUPERIOR.md` dizendo "preços substituídos pela
   produção") antes que alguma peça de marketing o copie. Se um dia quiser testar preço
   menor, o roteiro Gabor-Granger já está pronto na PESQUISA — teste com gente, não com fé.

**O que NÃO fazer:**
- **Não trocar o modelo por "tudo no plano com cota"** (ex.: "Pro tem 100 usos/mês").
  Cota mensal em plano pago gera a pior conversa possível — "paguei e fui bloqueado" — e
  joga fora a ponte de conversão do Grátis. A arquitetura atual (grátis = cota pequena,
  crédito = excedente, pago = ilimitado) é a certa.
- **Não adicionar o 4º pacote-âncora (1.000 cr/R$ 199,90) agora.** A PESQUISA sugere
  testar; com zero compradores não há o que testar. Fica para quando houver 50+ compras
  de pacote.
- **Não contar com crédito como receita principal.** Crédito é funil e cobertura de custo;
  a receita que sustenta o negócio é a assinatura.

---

## 3. As 4 ações com preço e sem produto

`worker/src/creditos.js:8-14` tabela: `voz_ia:1` (cobra de verdade), e quatro preços sem
produto atrás: `whatsapp_utilidade:1`, `whatsapp_marketing:5`, `cnpj_consulta:1`,
`review_google:3`.

Primeiro, o tamanho real do problema: **essa tabela é interna** (worker + docs). Conferi o
`CreditosScreen` — o usuário vê saldo e pacotes, nunca a lista de ações com preço. Então
ainda não há dívida de confiança com cliente; há uma **armadilha de comunicação** esperando
alguém copiar a tabela para a landing ou para a tela de planos. O conserto é barato:

| Chave | O que é | Custo real | Decisão recomendada |
|---|---|---|---|
| `whatsapp_utilidade:1` / `whatsapp_marketing:5` | mensagens via WhatsApp Cloud API | Meta cobra ~US$ 0,0068/utilidade e ~US$ 0,0625/marketing no Brasil ([Message Central](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil)); 5 cr = R$ 1,25–2,49 cobre com folga | **Manter a chave, não construir agora.** O produto foi corretamente estacionado (INTEGRACOES_IDEIA; o `wa.me` entrega 80% por R$ 0). É o único par cujo preço se sustenta por custo — quando a Cloud API entrar, o preço já está certo. Até lá: **não aparece em nenhuma comunicação.** |
| `cnpj_consulta:1` | autofill de cadastro por CNPJ | **zero** — BrasilAPI/ReceitaWS são públicas e gratuitas | **Apagar o preço (fazer de graça) quando a feature nascer.** Cobrar R$ 0,33 por uma consulta que não custa nada é margem sem valor — e o autofill melhora a qualidade do SEU dado (cliente com CNPJ certo = cobrança e NFS-e certas). Feature que ajuda o produto não se pedagia. |
| `review_google:3` | pedir avaliação Google pós-serviço | zero (link `wa.me` + Place ID) | **Apagar o preço.** O INTEGRACOES_IDEIA chama de "maior ROI da lista, custo zero" — e está certo. Cobrar 3 créditos pelo comportamento que mais faz o prestador renovar (ver a própria reputação crescer) é atirar no pé. Se um dia for um fluxo automatizado via WhatsApp API, cobra-se o preço do WhatsApp, não um preço próprio de "review". |

**Regra geral: preço público só do que existe.** A tabela viva de hoje tem uma linha:
`voz_ia = 1 crédito` ("1 crédito = 1 orçamento por voz" é a única frase de preço de crédito
que pode sair do worker). As outras chaves ficam no código como reserva — custo zero,
nenhuma promessa. Nenhuma das quatro vira produto nos próximos 90 dias (concordo com a
régua de recusa do VISAO_FABLE): nenhuma delas move caixa nem confiança antes de existir
pagante.

---

## 4. A conta do iPhone — com os números de HOJE, não os do ano passado

### O fato novo que muda a pergunta

- **23/12/2025** — o CADE homologou o TCC com a Apple: ela é obrigada a permitir, no
  Brasil, **oferta e venda por link externo** e lojas alternativas
  ([CADE](https://www.gov.br/cade/pt-br/assuntos/noticias/cade-forma-maioria-pela-homologacao-de-tcc-em-investigacao-sobre-praticas-da-apple-no-ios),
  [CNN Brasil](https://www.cnnbrasil.com.br/economia/negocios/cade-faz-acordo-para-apple-oferecer-pagamento-e-lojas-de-apps-alternativos/)).
- **18/06/2026** — a Apple oficializou a abertura no iOS 26.5, com esta tabela para o
  Brasil ([MacMagazine](https://macmagazine.com.br/post/2026/06/18/apple-oficializa-abertura-do-ios-no-brasil/)):
  - Venda **na App Store (IAP)**: comissão **21%** padrão / **10%** Small Business, **+5%**
    de processamento se usar o pagamento da Apple.
  - Venda por **link externo** (site vinculado ao app): **15%** padrão / **10%** Small
    Business — e o pagamento é no SEU gateway (Pix/Stripe), sem os 5% da Apple.
  - App distribuído **fora da App Store**: **5%**.
  - (A imprensa divergiu entre 21% e 25% na alíquota padrão de IAP; o 10% do Small
    Business foi consistente em todas as fontes. **Confirme os números exatos no contrato
    quando abrir a conta de desenvolvedor** — imprensa não é contrato.)
- O **Small Business Program** continua existindo: 15% clássico (agora 10%+5% no Brasil)
  para quem fatura até **US$ 1 milhão/ano** via Apple
  ([Apple Developer](https://developer.apple.com/app-store/small-business-program/)).
  A US$ 1M ≈ R$ 5,5M/ano, o teto só seria tocado com ~11.700 assinantes Pro pagando pela
  Apple. Não é preocupação para esta década do produto.

Ou seja: os documentos da operação que tratam iOS como "IAP obrigatório, 15–30%, QR de
Pix proibido nominalmente" (AUDITORIA_RISCO "BLOQUEIO DE LOJA", LOJA.md item 4, VISAO_FABLE
recusa nº 8) descrevem o mundo de **antes de 18/06/2026**. A Onda 24 escondeu a compra no
iOS (`COMPRA_NO_APP`) — decisão certa e reversível, continua sendo o estado correto do
código **até** o OLLI assinar os termos novos. Mas a DECISÃO estratégica muda: o pedágio
caiu de 15–30% para **10–15%**, e o caminho de engenharia deixou de ser StoreKit.

Uma cautela que mantenho: a regra é nova (1 mês), a operacionalização fina (janela de
atribuição do link, tratamento de consumível como crédito, o texto exato permitido na tela)
só se confirma lendo os termos ao abrir a conta. O QR de Pix **dentro** do app segue zona
cinzenta — o caminho claramente coberto pelo acordo é o **link que abre o navegador**.
Planeje pelo link-out, não pelo QR embutido.

### A conta, por assinatura Pro de R$ 39/mês (conta minha, aritmética simples)

| Caminho | Taxa | Fica com a Apple | Gateway próprio | Sobra p/ você |
|---|---|---|---|---|
| (mundo antigo) IAP padrão 30% | 30% | R$ 11,70 | — | R$ 27,30 |
| (mundo antigo) IAP Small Business 15% | 15% | R$ 5,85 | — | R$ 33,15 |
| **Brasil hoje** — IAP padrão (21%+5%) | 26% | R$ 10,14 | — | R$ 28,86 |
| **Brasil hoje** — IAP Small Business (10%+5%) | 15% | R$ 5,85 | — | R$ 33,15 |
| **Brasil hoje** — link externo SB + Pix MP (~0,99%) | 10% | R$ 3,90 | ~R$ 0,39 | **~R$ 34,71** |
| **Brasil hoje** — link externo SB + cartão (~4%+R$ 0,39) | 10% | R$ 3,90 | ~R$ 1,95 | ~R$ 33,15 |
| Comparação: Android/web hoje (sem Apple) | — | — | R$ 0,39–1,95 | R$ 37,05–38,61 |

(Taxas de gateway: Pix Mercado Pago ~0,99%, cartão 3,9–4,9%+fixo — [Mercado Pago](https://esteeolugar.com.br/artigos/taxa-pix-mercado-pago/), [Stripe pricing](https://stripe.com/pricing).)

Leituras da tabela:
- O **pedágio real da Apple** no melhor caminho é ~**R$ 3,90 por assinatura/mês** (10 p.p.).
  Doeu? Dói. Mata a margem de um plano de R$ 39? Não — sobra ~R$ 34,70 contra ~R$ 38,20 do
  Android via Pix.
- A diferença entre "implementar IAP" e "link externo" encolheu para **R$ 0–1,50 por
  assinatura**. Portanto **IAP/StoreKit perdeu a razão de existir para o OLLI**: o link
  externo reaproveita 100% do checkout Stripe/MP que já está pronto, e custa igual ou menos.
- **"Em que volume deixa de doer":** a taxa é percentual — não dilui com volume. O que
  dilui são os fixos: conta Apple Developer (US$ 99/ano ≈ R$ 545) + o tempo de build/review.
  Com a sobra de ~R$ 34,70/mês por assinante iOS, **2 assinantes pagam a conta Apple do
  ano em 8 meses; 5 pagam em ~3 meses**. O fixo é irrelevante; o custo relevante é o SEU
  tempo de engenharia num trimestre que precisa de caixa e de 5 usuários reais.

### O custo de NÃO vender no iOS

- iOS tem **21,03%** do mercado mobile brasileiro (junho/2026, [StatCounter](https://gs.statcounter.com/os-market-share/mobile/brazil); Android 78,96%).
- O público do OLLI (prestador de campo, sensível a preço) deve estar **abaixo** dessa
  média — iPhone no Brasil concentra renda alta. Não achei número confiável de "% de
  prestadores de serviço com iPhone" e **não vou inventar um**; a leitura honesta é:
  perder o iOS custa algo entre 5% e 20% dos clientes potenciais.
- Mas hoje o custo absoluto é **zero**: 21% de zero pagante é zero. E dá para medir de
  graça: um botão "Quero no iPhone" na landing (e-mail + aviso) transforma o achismo em
  fila contada.

### Recomendação clara

**(c) Adiar o iOS inteiro — com gatilho objetivo e data de reavaliação. E quando entrar,
nem (a) nem (b): vender por LINK EXTERNO sob a regra nova do CADE.**

1. **Agora (próximos 60–90 dias): não fazer nada de iOS além do que já está feito.**
   O bloqueio real do iOS nunca foi a taxa — é que não existe conta Apple, não existe
   build iOS (a Onda 28 confirmou: sem pasta `ios/`, sem bundle), não existe UM pagante em
   lugar nenhum. Cada semana de engenharia vale mais no caixa (Aposta 1) e no palco
   (Aposta 2). O `COMPRA_NO_APP` escondendo compra continua correto como estado do código.
2. **Medir a demanda de graça, já:** botão/campo "Quero no iPhone" na landing. Custa uma
   tarde e substitui esta discussão por um número.
3. **Gatilho para entrar no iOS** (qualquer um dos dois): **30 pagantes** no Android/web,
   ou **25+ e-mails** na fila do iPhone. Aí a sequência é: conta Apple Developer (US$ 99)
   → aceitar os termos brasileiros novos → build EAS (a config já está pronta, LOJA.md) →
   tela de planos no iOS abre o **checkout web existente por link externo** → Small
   Business Program → TestFlight → review. Sem StoreKit, sem produto de IAP, sem tabela
   de preço duplicada no App Store Connect.
4. **Reavaliar em outubro/2026 mesmo sem gatilho** — se a fila do iPhone estiver vazia até
   lá, o iOS não era prioridade mesmo, e você terá economizado o ano de conta Apple.

**O que NÃO fazer no iOS:**
- **Não implementar StoreKit/IAP.** Com a regra nova, é pagar 15% para duplicar um
  checkout que já existe e custaria 10%+Pix. Só reabrir essa hipótese se a Apple
  dificultar o link externo na prática (aí sim, IAP Small Business a 15% é o plano B).
- **Não mostrar QR de Pix dentro do app iOS** mesmo depois do acordo — o caminho blindado
  é o link que abre o navegador. QR embutido é convite para review recusada.
- **Não esperar o iOS para lançar.** O Android+web com caixa ligado vale mais do que a
  paridade de plataforma.

---

## 5. O plano Empresa sem paywall: cobra, funde ou mata?

Estado real no código: `entitlements.ts` define o Empresa como superconjunto
(equipe/mapa/dashboard), mas **nada trava** — Equipe funciona de graça (DIFERENCIACAO,
memória `olli-paywall-empresa-ausente`). A migration `20260725_equipe_grandfathering.sql`
**já existe e está pronta**: marca as orgs atuais como isentas (`equipe_grandfathered`) e
faz org nova exigir o plano. Ou seja: a engenharia do "cobrar" está 90% feita e é
reversível; o que falta é a decisão.

### Recomendação: COBRA. Liga o paywall na mesma janela da Aposta 1.

- **Fundir com o Pro seria o pior dos três.** Multiusuário é exatamente o perfil de conta
  mais caro de servir (mais IA, mais sync, mais suporte) — dá-lo a R$ 39 é vender o mais
  caro pelo preço do mais barato. E o Empresa a R$ 99 cumpre função de âncora: é ele que
  faz o Pro parecer óbvio. Tirar a âncora deixa o R$ 39 "caro" por comparação com nada.
- **Matar também não.** O Conectar prova disposição a pagar R$ 79,90/mês por conta com
  equipe na MESMA vertical; PMOC (o módulo mais forte do OLLI) é dor de empresa com
  técnicos, não de autônomo. O tier tem demanda real — só nunca foi cobrado.
- **Cobrar é barato e reversível:** aplicar a migration (junto das outras 5, mesma janela
  do worker — `docs/ENTREGA.md`), e o enforcement passa a valer para org nova. Quem já usa
  equipe hoje fica isento pelo grandfathering — ninguém é expulso, nenhuma reclamação de
  "tiraram o que eu usava". É o desenho certo e já está no repo.
- Se, ainda assim, você não quiser ligar a cobrança agora, a única alternativa honesta é a
  que o VISAO_FABLE (item 11) já colocou: **tirar o Empresa da tabela pública** até
  existir enforcement. Plano pago sem trava não é generosidade, é promessa furada em
  produção — e é dado de conversão contaminado (você nunca saberá quem pagaria).
- O reajuste para R$ 129–149 que a PESQUISA_GATEWAY_PRECOS enxerga: **só depois** de
  (1) enforcement ligado, (2) mapa/dashboard saírem de "em breve", (3) primeiros pagantes
  Empresa reais. Subir preço de um plano que nunca cobrou é subir um número imaginário.

---

## 6. Como subir preço depois, sem quebrar quem entrou cedo

O ativo mais valioso dos primeiros 100 pagantes não é a receita — é a prova social num
mercado onde o concorrente esconde preço. O mecanismo de reajuste tem que proteger isso.

**A regra de ouro: preço de fundador travado.** Quem assinar no preço atual **mantém o
preço enquanto a assinatura ficar ativa**. Anuncie isso na página de planos desde já
("assinou, travou — reajuste é só para quem chega depois"). Custa pouco (100 fundadores a
R$ 39 vs R$ 49 = R$ 1.000/mês — preço de banner) e compra três coisas: urgência honesta
para converter cedo, lealdade de quem apostou primeiro, e uma frase de marketing que Auvo
e Field Control não podem dizer.

Mecânica prática (já compatível com o código):
1. **No Stripe/MP, preço novo = Price novo.** Assinatura existente continua no Price
   antigo para sempre; só checkout novo usa o novo. Zero migração forçada, zero código —
   é assim que o grandfathering de preço funciona de fábrica. (No MP Preapproval, idem:
   não tocar no `preapproval` vigente.)
2. **Suba amarrado a valor visível, nunca "porque sim".** O momento natural já está no
   calendário da operação: **setembro/2026, NFS-e obrigatória** (Aposta 3 do VISAO_FABLE).
   "O OLLI agora deixa sua nota pronta — para novos assinantes, o Pro passa a R$ 49" é um
   reajuste que se explica sozinho. Reajuste sem feature nova é o que gera Reclame Aqui.
3. **Avise antes, por escrito.** 30+ dias, e-mail + aviso no app, mesmo quando só afeta
   novato — quem já paga precisa LER que não foi afetado ("seu preço está travado"). O
   silêncio é o que assusta.
4. **Anual é contrato: vale até o fim do período pago**, e o aviso de reajuste chega antes
   da renovação. Nunca reajustar período já pago.
5. **Crédito comprado é sagrado.** Saldo pré-pago nunca é reprecificado nem expira por
   mudança de tabela — o ledger imutável já garante a metade técnica disso; a metade de
   política é nunca anunciar o contrário. Mudança de preço de pacote vale só para compra
   nova.
6. **Degraus pequenos e raros.** R$ 39→49 (+26%) uma vez faz sentido; R$ 39→79 nunca, nem
   em dois anos — o público compara com o DAS (R$ 86) e com o Tecniko (R$ 59,90). O teto
   prático do Pro "solo" é a casa dos R$ 59–69, e só com o produto visivelmente maior
   (NFS-e + WhatsApp + radar com palco).

**O que NÃO fazer ao subir:**
- Não subir antes de o pagamento funcionar e de existir baseline de conversão (mínimo
  ~90 dias de caixa ligado).
- Não reajustar quem já assina "para uniformizar". A uniformidade que importa é a promessa.
- Não esconder a tabela antiga — deixe registrado ("preço de fundador, encerrado em
  DD/MM"). Transparência retroativa é o que diferencia reajuste de pegadinha.
- Não usar o reajuste para compensar custo de iOS/gateway — margem se resolve no desenho
  (seção 4), não empurrando taxa para o cliente.

---

## Resumo executivo — o que fazer segunda-feira

1. **Preços atuais ficam** (R$ 0/39/99 + créditos R$ 24,90/49,90/99,90). Nenhum número
   muda antes de o caixa ligar e gerar 90 dias de dado.
2. **Ligar o caixa** (webhook MP + migrations) continua sendo A prioridade — e ao aplicar
   as migrations, **ligar junto o paywall do Empresa** (a migration de grandfathering já
   protege quem usa equipe hoje). Cobra; não funde; não mata.
3. **Matar o rascunho de crédito barato** (nota de "substituído" no ESTRATEGIA_SUPERIOR)
   e garantir que nenhuma comunicação pública liste whatsapp/cnpj/review com preço.
   Quando cnpj e review nascerem, nascem grátis.
4. **iOS: adiar com gatilho** (30 pagantes ou 25 pedidos na fila "Quero no iPhone" — botão
   que dá para pôr na landing esta semana). Quando entrar, é **link externo sob a regra
   CADE (10% Small Business) + checkout que já existe**, não StoreKit. A premissa
   "Apple leva 15–30%" morreu em 18/06/2026 — atualizar AUDITORIA_RISCO/LOJA quando
   alguém tocar nesses arquivos.
5. **Anunciar o preço de fundador travado** na página de planos — é o gatilho de urgência
   honesto, e prepara o reajuste de setembro (junto da NFS-e) sem quebrar confiança.

---

## Fontes (conferidas em 18/07/2026)

- Concorrentes: [Capterra — Field Control](https://www.capterra.com/p/207608/Field-Control/) · [Omie Store — Field Control](https://store.omie.com.br/apps/field-control) · [Capterra — Auvo](https://www.capterra.com/p/201778/Auvo/) · [GetApp — Auvo](https://www.getapp.com/operations-management-software/a/auvo/) · [Produttivo — planos](https://www.produttivo.com.br/planos/) · [Conectar](https://conectarplay.com/) · [Tecniko](https://tecniko.app/blog/alternativa-ao-auvo)
- DAS-MEI 2026: [Simples Nacional/Receita](https://www8.receita.fazenda.gov.br/simplesnacional/noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3) · [Nubank blog](https://blog.nubank.com.br/valor-das-mei/)
- Apple/Brasil: [CADE — homologação do TCC (23/12/2025)](https://www.gov.br/cade/pt-br/assuntos/noticias/cade-forma-maioria-pela-homologacao-de-tcc-em-investigacao-sobre-praticas-da-apple-no-ios) · [MacMagazine — abertura oficializada, taxas (18/06/2026)](https://macmagazine.com.br/post/2026/06/18/apple-oficializa-abertura-do-ios-no-brasil/) · [CNN Brasil](https://www.cnnbrasil.com.br/economia/negocios/cade-faz-acordo-para-apple-oferecer-pagamento-e-lojas-de-apps-alternativos/) · [Apple — Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- Mercado: [StatCounter — mobile OS Brasil (jun/2026: iOS 21,03%)](https://gs.statcounter.com/os-market-share/mobile/brazil)
- Custos por uso: [Message Central — WhatsApp API Brasil](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil) · [Stripe — pricing](https://stripe.com/pricing) · [taxa Pix Mercado Pago](https://esteeolugar.com.br/artigos/taxa-pix-mercado-pago/)
- Android (contexto, não decisão desta página): assinaturas no Play a 15% efetivo, com mudanças de junho/2026 valendo por ora só em EUA/EEE/UK — [Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622) · [Android Developers Blog (jun/2026)](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html)
