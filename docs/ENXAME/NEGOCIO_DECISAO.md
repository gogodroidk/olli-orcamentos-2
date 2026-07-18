# A DECISÃO — leia uma vez, saiba o que fazer

> Escrito em 18/07/2026. Síntese das quatro lentes de negócio
> (`NEGOCIO_PRIMEIROS_PAGANTES.md`, `NEGOCIO_PRECO.md`, `NEGOCIO_FOSSO.md`,
> `NEGOCIO_PREMORTEM.md`) mais `VISAO_FABLE.md`, `BLOQUEIOS.md`, `docs/ENTREGA.md`
> e o código (`src/services/planos.ts`, `entitlements.ts`, worker). Fato de mundo
> tem URL nos documentos de origem — aqui só entra o que já foi verificado lá.
> Onde as lentes discordam entre si, eu decido e digo por quê (seção 7).

---

## 1. A VERDADE EM 5 LINHAS

1. O produto está ~90% pronto e auditado — e está em **zero celulares**: a produção
   roda a versão de ANTES da operação, ninguém consegue pagar (falta um segredo de
   15 minutos) e nenhum prestador de verdade jamais abriu o app.
2. Mercado e preço não são o problema: 7,6 milhões de MEIs de serviço, manutenção
   HVAC crescendo ~20% ao ano, e o Pro a R$ 39 é o mais barato da categoria
   (Tecniko R$ 59,90, Conectar R$ 79,90).
3. Fosso hoje: **nenhum**. ~70% do produto se copia num sprint. O único fosso
   possível (dado acumulado, hábito diário, QR colado no equipamento) exige
   usuários usando — que não existem.
4. O gargalo não é engenharia: são ~2 horas de cliques seus e o seu telefone.
   Saíram 46 commits de polimento enquanto o webhook de 15 minutos ficou parado.
5. Os próximos 30 dias decidem se isto é um negócio ou um hobby caro: 10 técnicos
   instalados até meados de agosto, 8 ativados, primeira mensalidade paga em setembro.

---

## 2. A DECISÃO PRINCIPAL DESTA SEMANA

**Declarar o produto pronto por decreto e trocar o gate. O gate deixa de ser
"ciclo comercial perfeito e testado" e passa a ser "um técnico de verdade usando".**

Não é uma opção entre outras — é a única decisão que destrava todas as outras.
A regra registrada em `BLOQUEIOS.md` ("só builda quando estiver perfeito") tem um
defeito estrutural: o critério anda. Cada onda de auditoria fabrica os achados que
justificam a próxima (a 23 achou 20, a 25 achou furos na 24, a 26 na 25). Por
critério, o produto nunca fica pronto; por decreto, fica pronto segunda-feira.

Na prática, a decisão significa três coisas nesta semana:

1. **Segunda de manhã, ~2 h:** o caixa e os instrumentos (ação 1 abaixo).
2. **Nenhuma onda nova** de melhoria/auditoria por 30 dias. Zero. O que está em
   voo no worktree fecha; nada novo abre.
3. **Três técnicos com o app instalado até domingo** — do seu círculo, com você
   do lado (ação 3). O mês 1 deles é grátis, então nem o caixa os bloqueia.

---

## 3. AS 5 AÇÕES DOS PRÓXIMOS 30 DIAS (nesta ordem)

### Ação 1 — Segunda de manhã: ligar o caixa e abrir os olhos (~2 h, tudo clique seu)

- `MP_WEBHOOK_SECRET` no cofre do worker + registrar o webhook no painel do
  Mercado Pago (15 min).
- `wrangler deploy` (tirando o `CLOUDFLARE_API_TOKEN` fraco do ambiente antes —
  o comando PowerShell exato está em `docs/ENTREGA.md`, passo 3). Aviso conhecido:
  cobra 1 crédito extra, uma vez, de quem pegava carona na chave antiga.
- As **5 migrations na ordem de `docs/ENTREGA.md` passo 4** — não as 3 de
  `BLOQUEIOS.md`, que está desatualizado, e **nunca** a `.sql.pendente`.
  A nº 4 fecha a IA de graça; a nº 2 já liga o paywall do Empresa com
  grandfathering (ver seção 4.3).
- Chave PostHog + `SENTRY_AUTH_TOKEN` (30 min). Sem eles, os próximos 60 dias
  acontecem no escuro.

**Resultado esperado:** alguém pode te pagar; a IA para de ser ilimitada de graça;
crash e funil ficam visíveis.
**Sinal de que deu certo:** você compra um pacote de R$ 24,90 na conta demo, o Pix
cai, o crédito entra sozinho e o evento aparece no PostHog. Teste você mesmo, no dia.

### Ação 2 — Terça: o resto do merge, fatiado, e a Play como organização

- App e painel sobem; landing por último (a produção de hoje roda a versão que a
  sua própria auditoria condenou — backup do técnico levando sua base, IA de graça).
- Conta Play Console como **organização** (CNPJ da GR Tech) — conta pessoal exige
  12 testadores por 14 dias antes de produção; organização é isenta. Abrir a faixa
  de **teste interno**.

**Resultado esperado:** produção auditada no ar; um caminho de instalação que não é
"fonte desconhecida" para o 4º técnico em diante.
**Sinal:** `app.olliorcamentos.online` com a versão nova; primeiro convite de teste
interno aceito.

### Ação 3 — Ainda esta semana: os 3 primeiros técnicos, na unha

- Lista de 20 nomes: refrigeristas da sua região — quem já te atendeu, quem você
  conhece, quem atende gente próxima. Sem a lista, nada começa.
- Mensagem de abertura (o roteiro pronto está em `NEGOCIO_PRIMEIROS_PAGANTES.md` §2)
  para os 5 primeiros. Sessão de 30 min com cada um que topar: cadastro por CNPJ,
  logo, os 10 serviços dele com preço, e **um orçamento real de um cliente real**
  saindo em PDF na própria sessão. Mês 1 por sua conta; R$ 39 no Pix a partir do
  mês 2, dito em voz alta.
- Grupo de WhatsApp "OLLI Fundadores" nasce com o primeiro instalado.

**Resultado esperado:** o produto encosta num prestador de verdade pela primeira
vez na história — a informação que 67 agentes não conseguem gerar.
**Sinal:** 3 PDFs com a logo DELES no WhatsApp de clientes DELES até domingo.
Assista ao primeiro uso de pelo menos 2 ao vivo — o que trava usuário nunca é o
que o construtor imagina.

### Ação 4 — Semanas 2 a 4: completar os 10 e medir sem mentir

- Mais 7: 3 de grupo local de WhatsApp/Facebook (regra: nunca postar link — responder
  dúvida, mostrar print do PDF), 2 do balcão do distribuidor (Dufrio/Frigelar da sua
  cidade, com o app aberto no seu celular), 2 por indicação pedida olho no olho.
- Toda sexta, planilha de 10 linhas com 3 colunas: **ativou em 48 h?** (orçamento
  real) · **3+ documentos na semana 3 sem cutucão?** · **pagou a 2ª mensalidade?**
- Silêncio de 7 dias no grupo = mensagem individual sua no mesmo dia. Reclamação
  é sinal verde; silêncio é o vermelho.

**Resultado esperado:** 10 instalados até ~15/08; metas honestas: 8 ativados,
6 com hábito na semana 3.
**Sinal:** a planilha preenchida 4 sextas seguidas. Proibido na planilha:
downloads, visitas, seguidores.

### Ação 5 — Semanas 2 a 4 (engenharia): só o que converte o 11º, e a página de setembro

Regra dos 30 dias: hora com técnico vale mais que hora com código. A única
engenharia permitida é a que vende sozinha quando você não estiver do lado:

- **Catálogo semente por vertical** — o app já deduz o ofício pelo CNAE e joga
  fora: "você é de refrigeração — começar com estes 10 serviços?" É 1 arquivo de
  dados + 1 tela, e é a maior alavanca barata do onboarding.
- **Botão "veja como seu cliente recebe"** no fim do primeiro orçamento (manda o
  PDF para o próprio técnico) — fecha o "aha" que hoje não tem entrega garantida.
- **Onboarding de 6 para 3 etapas** (Endereço e Visual migram para depois do
  primeiro PDF).
- **Página da NFS-e no ar até 15/08** — em 01/09 todo o seu público vira obrigado
  ao Emissor Nacional; a página precisa indexar antes da onda. É a aquisição da
  leva 11–100, não dos 10.

**Resultado esperado:** o 11º, que instala sem você, chega ao primeiro PDF em vez
de desinstalar no dia 2.
**Sinal:** funil do PostHog sem nenhum degrau perdendo mais de 50%; página NFS-e
indexada no Search Console antes de setembro.

O que NÃO entra nos 30 dias mesmo estando desenhado: preço sugerido pelo
histórico, palco completo dos radares no painel, clima, ETA completo, WhatsApp
API. Ver seções 5 e 7.

---

## 4. AS DECISÕES QUE SÓ VOCÊ TOMA

### 4.1 Preço: manter R$ 0 / 39 / 99. Não mexer em nada antes de 90 dias de caixa ligado.

R$ 39 já é o mais barato da categoria e "menos da metade do DAS-MEI (R$ 86)" — a
frase vende sozinha. Sem desconto de lançamento (desconto treina cliente a esperar
desconto); o gatilho de urgência honesto é **preço de fundador travado**: quem
assinar agora mantém R$ 39 enquanto a assinatura viver — anuncie isso na página de
planos. Reajuste (R$ 39 → 49, para novos) só em setembro, amarrado à NFS-e
entregue. Créditos ficam como estão (R$ 24,90/49,90/99,90); marcar o rascunho
antigo de R$ 0,10–0,15/cr como morto antes que alguma peça de marketing o copie.

### 4.2 iPhone: adiar com gatilho. E quando entrar, é link externo — não IAP.

A premissa "Apple exige IAP de 15–30%" **morreu em 18/06/2026**: pelo acordo com o
CADE, o iOS brasileiro aceita venda por link externo a 10% (Small Business) — o
checkout web que você já tem serve inteiro (detalhe e fontes em `NEGOCIO_PRECO.md`
§4). Ainda assim, iOS agora é gastar semanas numa plataforma com 21% do mercado e
~0% do seu público. **Gatilho para entrar:** 30 pagantes no Android/web OU 25
e-mails num botão "Quero no iPhone" na landing (custa uma tarde — faça o botão,
não o app). Nunca StoreKit. Reavaliar em outubro mesmo sem gatilho.

### 4.3 Plano Empresa: o paywall liga sozinho segunda-feira. Depois disso, zero horas nele.

A migration de grandfathering é a nº 2 da lista obrigatória — ao aplicá-la, org
nova passa a exigir o plano e quem já usa equipe fica isento. Ou seja: **"cobrar"
custa zero e acontece de graça na ação 1**. O Empresa fica na tabela pública como
âncora (é ele que faz o R$ 39 parecer óbvio), mas não recebe um minuto de produto,
marketing ou venda até um pagante Pro pedir upgrade. Os 10 primeiros são todos Pro.

### 4.4 Compra dentro do APK da loja: desligar, igual ao iOS.

Vender crédito por Pix próprio dentro de um APK publicado é o risco P1 da
auditoria (política de pagamentos do Google — remoção do app). O interruptor
`COMPRA_NO_APP` já existe; desligar no build da loja e vender pelo site custa
minutos e é reversível quando você integrar Play Billing (só com volume). Para os
10 primeiros nada muda — você instala com eles do lado.

### 4.5 Quanto tempo por semana: decida com número, não com culpa.

O plano acima assume **~10 h/semana por 8 semanas** (1 dia inteiro, ou 2 h/dia):
2 h de cliques na semana 1 e o resto quase todo telefone e sessões de 30 min.
Com 5 h/semana: corte a ação 5 (engenharia) inteira e mantenha caixa + gente — o
plano ainda fecha, mais devagar. Com menos de 5 h/semana: a decisão honesta é
pausar formalmente (congelar contas pagas, deixar o grátis no ar) em vez de morrer
devagar pagando infra — a Morte 2 do pré-mortem é exatamente essa agonia. A régua
dos 30 dias, colável na parede: **hora com técnico > hora com código.**

---

## 5. O QUE PARAR DE FAZER (inclusive o que esta operação construiu)

1. **Ondas de auditoria e polimento.** Cadência zero por 30 dias. Cada onda nova
   aumenta o pacote do merge e a distância até o primeiro usuário. Isto contradiz
   o `MISSAO.md` ("cadência de polish até o dono voltar") — e é intencional.
2. **O ETA "a que horas sair".** Foi construído nesta operação
   (`worker/src/etaSaida.js`, `scripts/teste-eta-saida.ts`) e não deveria ter
   sido prioridade: é a única feature com custo por uso, é copiável num fim de
   semana e serve um pagante que não existe. Congelar como está: não anunciar,
   não evoluir, não gastar mais um minuto. Custo afundado não é argumento.
3. **Chat genérico (`OlliChatScreen`) e `CalculadoraTintaScreen`.** Competem com
   o ChatGPT do bolso dele e duplicam `calculosOficio.ts`. Zero manutenção;
   esconder quando alguém tocar nesses arquivos.
4. **Rastreamento de equipe além de "última posição".** Terreno da Auvo, prêmio
   nenhum.
5. **Anúncio pago, programa de indicação, parceria formal com distribuidor,
   marketplace.** Todos viram opção DEPOIS dos 10 — hoje só colocam uma camada
   entre você e o motivo de a pessoa não comprar.
6. **Marketing multi-vertical.** A landing ampla fica (está pronta, não custa
   nada). Mas 100% do esforço de venda e conteúdo vai para
   refrigeração/PMOC numa região só até os 10 pagarem. Dez clientes em 6 ofícios
   e 5 cidades não geram indicação nem validam o mesmo fluxo.
7. **Discussão de preço.** Encerrada por 90 dias (seção 4.1).
8. **iOS.** Encerrado até o gatilho (seção 4.2).
9. **Contar commits.** A métrica pessoal dos próximos 30 dias é conversas com
   prestador por semana. Mínimo: 1. Bom: 3.

---

## 6. A MORTE MAIS PROVÁVEL E O ANTÍDOTO DE MENOR CUSTO

**A morte: o produto nunca é lançado de verdade e você cansa antes de lançar**
(Mortes 7 + 2 do pré-mortem, que são a mesma espiral). É a mais provável porque é
a única que **já está acontecendo** — a evidência está no repositório: 46 commits
de perfeição, o webhook de 15 minutos parado, uma regra de build cujo critério
anda, e ondas que fabricam a justificativa da próxima. Nenhuma das sete mortes
mapeadas é técnica; todas passam pela artéria "o produto nunca encostou num
prestador".

**O antídoto custa R$ 0 e cabe em três linhas:**

1. As ~2 h de cliques da ação 1 feitas **segunda-feira, antes de qualquer outra
   coisa** — enquanto a energia da operação existe. Um item humano por dia esgota
   a lista de `BLOQUEIOS.md` em duas semanas; "o fim de semana em que resolvo
   tudo" nunca chega.
2. Decreto de 30 dias sem feature nova. O critério de descongelamento não é gate
   verde: é **5 prestadores completando orçamento → aprovação → recibo** sem você
   no ombro.
3. Trocar a dopamina: contar conversas, não commits. Uma conversa por semana
   mantém projeto solo vivo melhor que dez gates verdes, porque devolve resposta
   de gente — a única resposta que o mercado dá.

O termômetro objetivo: se em 18/08/2026 o checklist "Destrava RECEITA" de
`BLOQUEIOS.md` ainda tiver caixa vazia, a morte está em curso e o problema não é
o produto.

---

## 7. ONDE EU DISCORDO

1. **Do briefing desta operação e de `AUDITORIA_RISCO.md`/`LOJA.md`: "a Apple
   exige IAP com taxa de 15–30%".** Ficou velho em 18/06/2026 — o acordo
   CADE/Apple abriu venda por link externo a 10% no Brasil (fontes em
   `NEGOCIO_PRECO.md` §4). Os documentos não estavam errados quando escritos,
   mas qualquer decisão de iOS tomada com o número antigo será errada. Anotar
   nos dois arquivos quando alguém os tocar.
2. **Do FOSSO no plano Empresa ("tirar da tabela") e de qualquer leitura do PRECO
   como "Empresa é frente ativa".** Minha resolução: como a migration de
   grandfathering está na lista obrigatória de segunda-feira, o paywall liga de
   graça — cobrança sem esforço. Tirar da tabela custaria mexer em tela e
   jogaria fora a âncora que faz o R$ 39 parecer barato. E tratar como frente
   custaria horas no único terreno onde o OLLI não tem defesa. Fica: na tabela,
   cobrando, ignorado.
3. **Do PRIMEIROS_PAGANTES §0, que faz do caixa pré-condição de qualquer
   abordagem.** As 3 primeiras instalações são do círculo direto, com mês 1
   grátis — não dependem do webhook. Não serializar: caixa segunda de manhã,
   lista de 20 nomes segunda à tarde, primeira sessão na mesma semana. O caixa é
   pré-condição do mês 2, não do primeiro contato.
4. **Do VISAO_FABLE (semanas 3–6 = palco dos radares) e do FOSSO (preço sugerido
   = prioridade nº 1 do backlog).** Nos primeiros 30 dias, engenharia só a que
   converte o 11º usuário (ação 5). O preço sugerido é de fato a melhor feature
   de fosso do backlog — mas ele exige 5+ registros do próprio usuário para
   abrir a boca, e usuário novo tem zero. Construí-lo antes dos 10 instalados é
   construir uma tela muda. Entra no mês 2, quando os primeiros históricos
   existirem. O palco dos radares no painel: fechar o que já está em voo no
   worktree e parar.
5. **Da regra registrada do dono ("só builda quando o ciclo comercial estiver
   perfeito e testado").** Respeitosamente: essa regra é a Morte 7 por escrito.
   O ciclo comercial só pode ser testado por um pagante, e o pagante só existe
   depois do build. A regra, mantida, é circular. A seção 2 propõe a troca.
6. **Detalhe do briefing:** o concorrente "Contornos" não existe em busca —
   os documentos da operação apuraram **Conectar** (conectarplay.com, R$ 79,90)
   como o quarto concorrente BR. Se "Contornos" for real, ninguém o achou.

E uma concordância que vale registrar como número: o PRIMEIROS_PAGANTES fecha com
a meta certa — **10 instalados em 4 semanas, 10 pagantes em 8–10**. Se em 8
semanas ninguém topar pagar R$ 39 nem com você instalando na mão, isso não é
fracasso: é a informação mais barata que existe sobre preço, público ou produto,
comprada com R$ 0 de mídia. A resposta certa a ela será mexer em mensagem, público
ou no que é grátis vs. pago — nunca "mais uma onda de features".
