<!-- Pesquisa multi-agente (15 agentes, verificacao adversarial contra a web, jul/2026) — gateway de Pix alternativo ao AbacatePay + estrategia de preco de creditos. Gerada pelo workflow pesquisa-gateway-precos-olli. -->

# OLLI — Decisão de Gateway de Pix, Preços de Crédito e Pesquisa de Preço

**Contexto:** o AbacatePay "deu red" — não aprovava/ativava prestador pequeno (CPF/MEI). Precisamos de um gateway que aprove esse público com pouca fricção, tenha Pix barato, API+webhook e, idealmente, recorrência. Este documento decide isso e o que muda no código, nos preços e como validar com usuário.

**Convenção de confiança:** `[FATO]` = verificado em fonte primária (URL). `[INFERÊNCIA]` = raciocínio a partir de fatos. `[NÃO CONFIRMADO]` = sem fonte primária, tratar como hipótese a testar. `⚠️ CORREÇÃO ADVERSARIAL` = onde a verificação derrubou um dado da pesquisa original.

---

## 1. Gateway recomendado

### Decisão

- **1ª opção — InfinitePay** para o caso que derrubou o AbacatePay: **compra avulsa de créditos por Pix**. É o encaixe direto e substitui o AbacatePay quase 1:1.
- **2ª opção — Asaas** para **recorrência de verdade** (planos Pro/Empresa cobrados por Pix) e como *fallback* de gateway. Entra junto, não no lugar.
- **Menção honrosa técnica — Mercado Pago** (marca conhecida, API madura), fica em 3º pelos motivos abaixo.

### Por que InfinitePay em 1º

1. **Aprova o público que o AbacatePay recusava.** Aceita **CPF puro, sem MEI/CNPJ**, para conta digital, link/checkout e recebimento por Pix — só a maquininha física exige CNPJ. `[FATO]` (https://ajuda.infinitepay.io/pt-BR/articles/3406705-pessoa-fisica-pode-vender-com-a-infinitepay). Análise de cadastro em até 2 dias úteis. `[FATO]` (https://ajuda.infinitepay.io/pt-BR/articles/4844473-como-faco-o-meu-cadastro-na-infinitepay). **A verificação adversarial confirmou os três pontos (taxa, aprovação CPF, entidade mínima) contra as fontes oficiais e o Reclame Aqui.**
2. **Pix 0% — o melhor custo do mercado para ticket baixo.** "Taxa zero no Pix. Sem volume mínimo, sem asterisco", válido inclusive para recebimento via Checkout/API/QR. `[FATO]` (https://www.infinitepay.io/taxas ; https://www.infinitepay.io/checkout). Para créditos de R$24,90–R$99,90, 0% de taxa preserva 100% da margem — imbatível frente a Asaas (R$0,99–1,99/transação) ou Mercado Pago (0,49–0,99%).
3. **Melhor reputação da lista.** Selo **RA1000, 9,4/10** no Reclame Aqui, 95,8% resolvidas. `[FATO]` (https://www.reclameaqui.com.br/empresa/infinite-pay/).
4. **Webhook já documentado e do mesmo formato do AbacatePay:** payload com `capture_method` ('pix'), `amount`, `paid_amount`, `transaction_nsu`, `order_nsu`, `receipt_url`; API `POST .../links` (cria) e `POST .../payment_check` (consulta status). `[FATO — com ressalva]` (a doc `docs.infinitepay.io` falhou por DNS na coleta; superfície confirmada por `ajuda.infinitepay.io`).

**Ponto fraco honesto:** **não há confirmação de API dedicada para criar/gerir assinatura recorrente programaticamente** — o produto "Planos de Assinatura" existe, mas parece ser configurado no painel, não via API. `[NÃO CONFIRMADO]`. Isso **não bloqueia** o caso principal (créditos avulsos), e casa com a recomendação da pesquisa de que o público MEI/CPF prefere **pré-pago por Pix a card-on-file**. Se quisermos cobrança recorrente automatizada, é aí que entra o Asaas.

### Por que Asaas em 2º

- **Ataca o "deu red" na veia:** a doc oficial diz que dá para **emitir a primeira cobrança antes de a análise cadastral terminar**. `[FATO]` (https://docs.asaas.com/docs/onboarding-e-envio-de-documentos-via-link). Aceita CPF/MEI sem CNPJ. `[FATO]` (https://www.asaas.com/conta-digital).
- **Recorrência real por Pix:** tem **Assinaturas nativas** *e* **Pix Automático/Pix Recorrente** (débito recorrente via Pix, autorizado uma vez pelo pagador). `[FATO]` (https://docs.asaas.com/docs/pix-automatico). É o mecanismo certo para Pro/Empresa sem depender de cartão.
- **Webhook simples:** `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`, autenticado por header `asaas-access-token` (segredo compartilhado — mais simples que mTLS). `[FATO]` (https://docs.asaas.com/docs/webhook-para-cobrancas).
- **Custo:** Pix por cobrança/fatura = **R$0,99/transação paga nos 3 primeiros meses, depois R$1,99** (valor fixo, só cobra se pagar). `[FATO]` (https://www.asaas.com/precos-e-taxas). Em pacote de R$24,90 isso é ~8% — aceitável, mas **pesa proporcionalmente mais em pacote pequeno** (por isso, se usar Asaas para créditos, evitar pacote < R$25).
- **Risco:** reanálise cadastral pós-aprovação (exigência Bacen) pode reter saldo até 30 dias. `[FATO]` — risco de setor, categoricamente diferente da recusa-na-entrada do AbacatePay.

### ⚠️ Correções adversariais que mudam a decisão

- **Woovi/OpenPix foi REBAIXADO e sai do pódio.** A pesquisa original afirmava que aceita "CPF... prestador de serviço autônomo". **Os próprios Termos de Uso exigem pessoa jurídica:** *"o Usuário deve ser uma pessoa jurídica devidamente constituída"*. `[FATO]` (https://woovi.com/terms/). **Consequência:** um prestador CPF puro **não é elegível** — é reprovação estrutural, não "aprovação incerta". Woovi só serve se o prestador **já for MEI**. Como boa parte do público OLLI é CPF puro, isso o desqualifica como substituto direto do AbacatePay (a taxa de 0,80% capada em R$5 continua ótima — mas só para quem tem CNPJ).
- **Mercado Pago:** verificação **confirmou** as taxas (QR 0,49% / Checkout 0,99%, Pix P2P grátis para PF **e** PJ). `[FATO]` (https://www.mercadopago.com.br/ajuda/33399). Fica em 3º porque (a) recorrência 100% Pix via API é `[NÃO CONFIRMADO]`, e (b) o modelo split/marketplace adiciona passo de OAuth por prestador.
- **Asaas / InfinitePay:** verificação **não achou correção** — dados batem com as fontes.

### Tabela comparativa

| Gateway | CPF puro? | Taxa Pix (recebimento API) | API/Webhook | Recorrência Pix | Reputação RA | Nota OLLI |
|---|---|---|---|---|---|---|
| **InfinitePay** ✅ 1ª | **Sim** `[FATO]` | **0%** `[FATO ✔ verif.]` | Sim, formato conhecido | Produto sim, **API não confirmada** | **9,4 (RA1000)** | **9,0** |
| **Asaas** ✅ 2ª | **Sim** `[FATO]` | R$0,99→**R$1,99** fixo `[FATO]` | Sim (`asaas-access-token`) | **Sim (Pix Automático nativo)** `[FATO]` | 8,2 | 8,0 |
| Mercado Pago | Sim `[FATO ✔ verif.]` | 0,49% QR / 0,99% checkout `[FATO ✔]` | Sim (x-signature) | Não confirmado | 8,0 | 8,5 |
| Efí (ex-Gerencianet) | Sim (Efí Pro) `[FATO]` | **1,19%** `[FATO]` | Sim, **mas mTLS** (complexo) | Sim (Pix Automático, R$3,50 fixo) | ~8,5 | 7,0 |
| Pagar.me | **Não** (exige CNPJ) `[FATO]` | 1,19% `[FATO]` | Excelente | Não confirmado | 9,0–9,5 (RA1000) | 7,5 |
| PagBank | Sim `[FATO]` | **1,89%** (venda API) `[FATO]` | Sim | Só cartão confirmado | 8,6 | 7,0 |
| Iugu | Sim (no contrato) `[FATO]` | 0,99% **não confirmado** | Sim | Sim (Pix Automático) | 8,6 | 6,5 |
| ~~Woovi/OpenPix~~ | **⚠️ NÃO (só PJ)** `[FATO — corrigido]` | 0,80% cap R$5 / R$0,85 | Sim | Sim | 9,0 | ~~7,8~~ → só se MEI |
| Cora | **Não** (exige CNPJ) `[FATO]` | 1% cap R$0,50 + **mensalidade R$44,90** | Sim | Não confirmado | <7,5 | 4,0 |

**Leitura de uma linha:** InfinitePay ganha no que o AbacatePay perdeu (aprova CPF, Pix grátis, melhor reputação); Asaas cobre a lacuna dele (recorrência por Pix) e serve de rede de segurança.

---

## 2. O que muda no código

O worker já tem o padrão certo em `worker/src/abacate.js`: 4 rotas (`/abacate/pacotes`, `/pix`, `/status`, `/webhook`) + ledger **idempotente** em `worker/src/creditos.js` (`lancarCreditos`, com `(origem, ref)` único → reenvio de webhook não credita 2x). **A arquitetura é reutilizável quase inteira.** A troca é localizada.

### O que se preserva (invariantes — não mexer)

- **Crédito só no webhook, nunca otimista no cliente** (comentário nas linhas 19–23 de `abacate.js`).
- **`lancarCreditos(env, { userId, delta, origem:'pix', ref, descricao })`** com `ref = id do evento do gateway` → idempotência via 409 do índice único (`creditos.js` linhas 52–66). **Isso não muda em nenhum gateway.**
- **Catálogo `PACOTES` como fonte única de preço** (linhas 39–43), servido em `/pacotes`.
- **Vínculo usuário↔pagamento** viajando num campo echoado pelo gateway: hoje `metadata.externalId = olli:<userId>:<pedidoId>:<pacoteKey>` (linha 121). Cada gateway tem um campo equivalente — mapear.
- **Roteamento em `index.js`** por prefixo de path — só trocar `/abacate/` pelo novo módulo (ou manter e adicionar um flag de gateway).

### O que se adapta, por gateway (3 pontos: criar, status, webhook)

**Sugestão de implementação:** copiar `abacate.js` → `infinite.js` (ou `asaas.js`), manter a mesma forma das 4 funções (`criarPix`, `checarStatus`, `webhook`, `listarPacotes`) e trocar só o miolo. Deixar o AbacatePay atrás de um flag para rollback rápido.

#### InfinitePay (1ª opção — créditos avulsos)
- **Criar (`criarPix`):** trocar `POST /v2/transparents/create` por **`POST https://api.checkout.infinitepay.io/links`**. O `externalId` vira **`order_nsu`** (carregue nele `olli:<userId>:<pedidoId>:<pacoteKey>`, ou use um campo de metadados do link se disponível). `amount` continua em centavos, **Pix 0% → valor cheio**.
- **Status (`checarStatus`):** trocar `/transparents/check?id=` por **`POST .../payment_check`** (mesma função de UX; a verdade continua sendo o webhook).
- **Webhook:** o payload traz `capture_method`, `order_nsu`, `transaction_nsu`. Resolver o usuário/pacote a partir do `order_nsu`; usar **`ref = transaction_nsu`** para idempotência. ⚠️ **Ponto a validar antes de produção:** o esquema de assinatura do webhook InfinitePay **não está documentado publicamente** (DNS de `docs.infinitepay.io` falhou na coleta). **Mitigação enquanto isso:** confirmar o pagamento server-side via `payment_check` dentro do handler do webhook (como a rota `/status` já faz) antes de creditar — assim a autenticidade não depende só da assinatura. `[NÃO CONFIRMADO]` — abrir chamado no suporte para o esquema oficial.

#### Asaas (2ª opção — recorrência + fallback)
- **Criar:** `POST /v3/payments` com `billingType:"PIX"` (+ `GET .../pixQrCode` para o QR), ou `POST /v3/pixQrCodes`. O vínculo vai no campo **`externalReference`**.
- **Recorrência (o diferencial):** `POST /v3/subscriptions` (Assinaturas) ou fluxo de **Pix Automático** para Pro/Empresa — não existe no AbacatePay, é código novo, não adaptação.
- **Webhook:** evento **`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`**. **Trocar a autenticação:** em vez do `?webhookSecret=` na query (linha 207 de `abacate.js`), validar o header **`asaas-access-token`** (segredo compartilhado que você define). `ref = id do pagamento/evento`. Webhook mais simples que o do AbacatePay.

#### Mercado Pago (se um dia for a escolha)
- **Criar:** Orders API / `/v1/payments` com `payment_method_id:"pix"`; vínculo em **`external_reference`**.
- **Webhook diferente dos outros:** a notificação **só manda o `id`** — é preciso fazer **`GET /v1/payments/{id}`** para ler `status:"approved"` e o `external_reference`. Validar `x-signature` (HMAC). Mais um round-trip que o modelo AbacatePay.

#### Efí — evitar por ora
- Webhook exige **mTLS** (instalar o certificado público da Efí no servidor) — atrito real em Cloudflare Workers frente ao `webhookSecret`+HMAC atual. Só considerar se Efí for escolha final. `[FATO]`

### Resumo do esforço
Trocar para **InfinitePay = ~1 arquivo** (`infinite.js` espelhando `abacate.js`), 3 pontos de mudança, ledger intacto. **Asaas = mesmo esforço + código novo de assinatura** (que o AbacatePay nunca teve). Nenhuma mudança no schema do ledger nem no app (que só lê `/pacotes` e chama `/pix`+`/status`).

---

## 3. Preços dos créditos

### ⚠️ Resolver primeiro: divergência doc × código (decisão do dono, não correção técnica)

Existe conflito **dentro do próprio repositório**:

| Fonte | Pacotes | R$/crédito |
|---|---|---|
| **Produção** (`worker/src/abacate.js` linhas 40–42) | 50/R$24,90 · 150/R$49,90 · 400/R$99,90 | **R$0,498 · R$0,333 · R$0,250** |
| **Rascunho** (`docs/ESTRATEGIA_SUPERIOR.md`) | 100/R$14,90 · 500/R$59,90 · 1.500/R$149,90 | **R$0,149 · R$0,120 · R$0,100** |

O rascunho é **2,5×–3,3× mais barato por crédito**. **Se qualquer peça de marketing usar os números do doc, divulga um preço que o app não cobra.** O dono precisa decidir qual vale **antes** de comunicar preço. `[FATO — divergência real no repo]`

### A lógica de custo (piso de segurança)

Pesos por ação (`worker/src/creditos.js`): `voz_ia:1`, `whatsapp_utilidade:1`, `whatsapp_marketing:5`, `cnpj_consulta:1`, `review_google:3`.

- Insumo mais caro por crédito = **WhatsApp marketing**: custo real ~R$0,345 ÷ 5 créditos = **~R$0,069/crédito**. `[FATO — Meta Brasil]` (https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil)
- **Regra de bolso formal:** `preço_mínimo_por_crédito = custo_da_ação_mais_cara ÷ margem_alvo`. Com margem-alvo 75%: **piso ≈ R$0,092/crédito**. `[INFERÊNCIA]`
- Os pacotes de **produção (R$0,25–0,50/cr) estão 2,7×–5,4× acima do piso** → margem saudável (72–91%). O **rascunho (R$0,10 no pacote grande) encosta no piso** → arriscado se a Meta/BSP reajustar. `[INFERÊNCIA]`
- **Com InfinitePay (Pix 0%) a margem não sofre erosão de gateway** — mais um motivo para ele. Com Asaas (R$1,99/transação) o pacote pequeno perde ~8%; manter pacote mínimo ≥ R$25.

### Estrutura recomendada (para levar à pesquisa, não para cravar por intuição)

Manter **3 faixas com desconto de volume decrescente** (padrão que o público já entende via GetNinjas; converte melhor que 2 ou 4+ faixas `[direcional]`), **charm pricing** (terminação em 9/90, ~+24% de venda vs. redondo `[direcional]`), e **não descer para o rascunho** sem validar margem. Recomendo **partir da tabela de produção** (margem provada) e **testar um 4º pacote-âncora no topo**:

| Rótulo | Créditos | Preço | R$/crédito | Papel |
|---|---|---|---|---|
| Início | 50 | R$24,90 | R$0,498 | entrada |
| **Mais vendido** | 150 | R$49,90 | R$0,333 | âncora de conversão |
| Melhor valor | 400 | R$99,90 | R$0,250 | volume |
| *(testar)* Profissional | 1.000 | R$199,90 | R$0,200 | **âncora de topo** — faz o de 400 parecer melhor |

**Comparação com concorrentes:** `[FATO]`
- **GetNinjas** cobra **R$12–R$30 por 1 lead desbloqueado** (https://www.getninjas.com.br/central-de-ajuda/...). Um pacote OLLI de 150 créditos (R$49,90) rende dezenas de ações — âncora forte de "quanto você já paga por muito menos".
- **ElevenLabs** mantém preço por crédito **achatado** entre planos (diferenciação vem de outros benefícios). O OLLI faz o oposto (desconto de volume) — **correto para este público**; não copiar o modelo achatado. `[FATO]` (https://elevenlabs.io/pricing)
- **Não contar com breakage** (crédito comprado e não usado) como margem: o público consome ativamente porque a dor (cobrança, review, orçamento) é o gatilho. Planejar margem assumindo **redenção ~100%**; breakage é bônus. `[INFERÊNCIA]`

**Sobre as assinaturas:** os dados **não justificam baixar Pro (R$39) nem Empresa (R$99)** — ambos já ficam abaixo do DAS-MEI mensal (R$86,05, "chão" psicológico do público) e são mais baratos que qualquer concorrente. `[FATO]` Há **espaço para subir o Empresa** para R$129–149 **só depois** que multiusuário/mapa ao vivo saírem do "em breve" e o preço R$99 (hoje marcado como "confirmar com o dono" em `docs/PLAN_ENTITLEMENTS.md`) for decidido.

---

## 4. Plano de pesquisa com usuários (pronto para rodar)

**Método: combinar dois instrumentos** (é a prática recomendada, não escolher um). `[FATO]` (https://aprix.com.br/gabor-granger-e-van-westendorp-...)
- **Van Westendorp (PSM)** → achar a **faixa aceitável** dos planos Pro e Empresa (produto sem comparável direto no nicho).
- **Gabor-Granger + extensão NMS** → achar o **preço de receita ótima** dos pacotes de crédito (onde já há âncora de mercado: o modelo de moeda do GetNinjas).

### 4a. Perguntas exatas — Assinatura (Van Westendorp, uma bateria por plano, sem mostrar o preço atual antes)
Apresente **a lista de recursos primeiro**, depois pergunte:
1. "A partir de que valor mensal a assinatura [Pro/Empresa] começaria a ficar **cara**, mas você ainda consideraria pagar?"
2. "A partir de que valor mensal ela ficaria **tão cara que você não pagaria de jeito nenhum**?"
3. "A partir de que valor mensal ela começaria a parecer **barata — um baita negócio**?"
4. "A partir de que valor mensal ela pareceria **tão barata que você desconfiaria da qualidade**?"

Rode **separado para Pro e Empresa**. Rode o Empresa **com e sem** a "mesada" de créditos mencionada, para medir quanto ela sozinha eleva a disposição a pagar.

### 4b. Perguntas exatas — Créditos (Gabor-Granger + NMS, escada monádica, um pacote por vez)
Âncora contextual real: *"Hoje, no GetNinjas, desbloquear 1 contato custa R$12 a R$30. Um pacote de 100 créditos OLLI dá pra [X orçamentos por voz / Y lembretes de WhatsApp / Z consultas de CNPJ]."*
- "Você compraria esse pacote por **R$X**?" — subindo/descendo a partir de um preço **inicial aleatório por respondente**, 5–6 degraus que **cruzam as duas pontas em disputa**: ex. para o pacote hoje a R$24,90 → **R$9,90 / 14,90 / 19,90 / 24,90 / 29,90 / 39,90**.
- Repita para os 3 tamanhos, sempre **monádico** (o respondente não vê os 3 juntos).
- **NMS:** nos preços que ele marcou "barato" e "caro", pergunte intenção de compra em **escala 1–5** → constrói a curva de receita e acha o pico. **É isso que decide, com número, entre a tabela de produção (R$0,25–0,50) e o rascunho (R$0,10–0,15).**

### 4c. Amostra, segmentação, recrutamento
- **Amostra:** mínimo **100 respostas válidas** no corte mais grosso; ideal **150–200** para curva estável. `[FATO]` (B2B tolera 50–100). **Depende do nº de usuários ativos — dado que não existe no repo; o dono precisa informar** antes de fechar o desenho. `[NÃO CONFIRMADO]`
- **Segmentar** (não rodar curva única): (a) ofício/vertical, (b) CPF autônomo × MEI × ME/EPP, (c) plano atual (grátis × Pro × Empresa), (d) tempo de uso. Base pequena → priorizar só 2 cortes (CPF/MEI × PJ pequena; Pro × grátis).
- **Recrutar** na própria base (banner in-app + push + WhatsApp de serviço). **Incentivo pago em créditos grátis** (10–20 por resposta) → CAC ~zero e ainda ensina o valor do crédito.
- **Timing:** **evitar dias 15–20 do mês** (vencimento do DAS enviesa para "tudo tá caro"). Questionário mobile-first, < 3 min, português coloquial, campo com máscara de R$.

### 4d. Como interpretar
- **Van Westendorp:** faixa aceitável = entre o Ponto de Barateza Marginal (PMC) e o de Carestia Marginal (PME); Preço Ótimo = interseção "muito barato" × "muito caro".
- **NMS/Gabor-Granger:** o **pico da curva receita × preço** é o preço-alvo por pacote.
- **Caveat obrigatório:** os dois medem **intenção declarada**, que vem **mais baixa** que o comportamento real. `[FATO]` **Não faça A/B de cobrança real via Pix antes de o gateway estar resolvido** — rode o questionário primeiro (não depende de cobrança), o teste comportamental ao vivo só depois do InfinitePay/Asaas em produção.

---

## 5. Riscos e próximos passos

### Riscos
1. **InfinitePay sem API de assinatura confirmada.** `[NÃO CONFIRMADO]` — não basear Pro/Empresa recorrente nele sem confirmar; usar Asaas (Pix Automático) para recorrência.
2. **Esquema de assinatura do webhook InfinitePay não documentado publicamente.** Mitigar validando o pagamento server-side via `payment_check` dentro do handler antes de creditar; abrir chamado para o esquema oficial.
3. **Retenção de saldo pós-aprovação** (padrão do setor): InfinitePay tem relatos de bloqueio 120–180 dias em suspeita `[FATO]`; Asaas até 30 dias na reanálise Bacen `[FATO]`. Mitigar: **saque frequente, manter saldo baixo na conta do gateway**.
4. **Pix Automático é feature de 2025** — maturidade operacional não comprovada. `[NÃO CONFIRMADO]` Testar antes de apostar a cobrança de planos nele.
5. **Woovi fora** por exigir PJ (⚠️ correção adversarial) — não é opção para CPF puro.
6. **Divergência de preço doc × código** e **preço do Empresa (R$99) não confirmado** — decisões do dono, pendentes no próprio repo. `[FATO]`
7. **Nº de usuários ativos desconhecido** — bloqueia dimensionar a amostra da pesquisa. `[NÃO CONFIRMADO]`

### Próximos passos (ordem)
1. **[Dono]** Confirmar o modelo: manter **créditos pré-pagos por Pix** como espinha dorsal (recomendado pelos dados). Decidir tabela de crédito (produção × rascunho) e preço do Empresa — ou marcar como "a definir pela pesquisa".
2. **[Piloto — replica a falha do AbacatePay de propósito]** Abrir **uma conta InfinitePay real com um prestador CPF/MEI do perfil OLLI** e verificar: aprovação, Pix 0% no recebimento, e o esquema do webhook. Só migrar depois que passar.
3. **[Dev]** Portar `abacate.js` → `infinite.js` (mesmas 4 rotas + ledger intacto), AbacatePay atrás de flag para rollback.
4. **[Dev, se recorrência]** Abrir conta **Asaas (MEI)**, integrar Pix Automático para Pro/Empresa como gateway secundário.
5. **[Dono + growth]** Rodar a pesquisa (seção 4) para fechar preço de crédito e do Empresa **com número, não intuição**.
6. **[Copy — grátis, alto retorno]** Explorar a maior lacuna competitiva achada: **preço público, sem "fale com consultor", sem multa** — ataca os 4 concorrentes opacos (Auvo, Produttivo, Field Control parcial, ConstruManager) e ancora no que o público já paga sem reclamar (DAS R$86,05; streaming R$118/mês). `[FATO]`

---

### Arquivos de referência (caminhos absolutos)
- `C:\Users\ADMIN\Desktop\Projetos OLLI\olli-orcamentos\.claude\worktrees\full-audit-platform-updates-5ba65a\worker\src\abacate.js` — padrão a espelhar (rotas `/pix`, `/status`, `/webhook`, `PACOTES`, vínculo `externalId`).
- `...\worker\src\creditos.js` — ledger idempotente (`lancarCreditos`, `(origem,ref)` único; `CUSTO` = pesos por ação). Invariante a preservar em qualquer gateway.
- `docs/ESTRATEGIA_SUPERIOR.md` e `docs/PLAN_ENTITLEMENTS.md` — onde vivem a tabela-rascunho de créditos e o preço não confirmado do Empresa (as duas decisões pendentes do dono).