# PESQUISA DE CONCORRÊNCIA — 2026

> Lente: **o que os concorrentes entregam, e onde o OLLI está atrás ou na frente.**
> Consultas feitas em **21/07/2026**. Todo preço tem URL e data — preço de SaaS muda,
> e decidir com número de memória custa dinheiro real.
> Todo item de "o OLLI tem" foi conferido **lendo o código**, com o arquivo citado.
>
> **Sem otimismo.** Este documento existe para dizer onde o OLLI perde. Três das cinco
> "exclusividades" que o briefing me deu para confirmar **não são exclusivas** — e uma
> delas (PMOC) tem no mínimo sete concorrentes brasileiros vendendo a mesma coisa hoje.

---

## 0. Resumo executivo (leia isto se ler só uma coisa)

1. **PMOC não é lacuna. É praça lotada.** Auvo, Produttivo, Conectar Play, Arcke, Refriplay, Matum/SisUM, IClass e Neovero vendem PMOC hoje. O OLLI chegou por último nesse território, não primeiro.
2. **Existe um concorrente que é quase o OLLI, mais barato, e já tem 3.200 empresas:** Conectar Play — **R$ 79,90/mês com usuários ilimitados**, PMOC automático, QR no equipamento, assinatura com ICP-Brasil, estoque de gases, boleto e Pix. O plano **Empresa do OLLI (R$ 99) é mais caro e entrega menos** no nicho de refrigeração.
3. **A "IA de voz que monta orçamento falando" já é reivindicada por outro.** O Produttivo anuncia a **Manu IA**: o técnico grava um áudio e o relatório/checklist sai pronto, e áudio de WhatsApp vira ordem de serviço. Chamar isso de exclusividade do OLLI na landing é uma afirmação falsa que o primeiro prospect com Google derruba.
4. **"Diagnóstico por código de erro" também não é exclusivo.** O Auvo distribui um **"Auvo Busca Erro" de graça** como isca de lead, e apps dedicados (Facilita Técnico, Ajuda Técnico) já entregam base de erros offline com mais módulos que o OLLI.
5. **O diferencial real do OLLI não é feature — é estrutura de venda:** preço publicado, autosserviço sem vendedor, offline de verdade e um piso de entrada (1 pessoa) que o líder do mercado **recusa por política**. O Auvo só atende empresa com **2 ou mais pessoas em campo**. O Field Control começa em **R$ 525/mês**. O ServiceTitan é enterprise com contrato de 12 meses.
6. **A lacuna defensável para uma pessoa só é o MEI de campo** — 13,5 milhões de CNPJs MEI ativos no Brasil em 2026 — **cruzado com "o documento obrigatório do meu ofício"**. Os players de PMOC são HVAC-only; os genéricos não têm documento de ofício nenhum. O `verticais.ts` do OLLI já é a planta desse fosso.
7. **O maior risco não é técnico, é de comunicação:** o produto está anunciando como exclusivo três coisas que o concorrente também tem, e escondendo duas que ninguém tem (preço publicado, offline real).

---

## 1. A tabela de preços do mercado (verificada, com fonte e data)

### 1.1 Brasil

| Produto | Preço publicado? | Preço (21/07/2026) | Usuários | Fonte |
|---|---|---|---|---|
| **Conectar Play** (Conectar Sistemas) | **Sim** | **R$ 79,90/mês** · 10 dias grátis sem cartão | **Ilimitados** | [conectarplay.com](https://conectarplay.com/) |
| **Tecniko** | Parcial | Plano **grátis permanente** + pagos **a partir de R$ 59,90/mês** | n/d | [tecniko.app/blog/alternativa-ao-auvo](https://tecniko.app/blog/alternativa-ao-auvo) |
| **Field Control** | Só via revenda | **R$ 525,00/mês** (Básico: painel ilimitado + **4 licenças de campo**) · licença extra **R$ 89,00/mês** · módulos **R$ 89,00/mês** cada (Otimizador Avançado **R$ 169,00**) · **implantação R$ 899,00** | 4 no básico | [store.omie.com.br/apps/field-control](https://store.omie.com.br/apps/field-control) |
| **Field Control** (2ª fonte, conflita) | — | "R$ 295 por usuário/mês" como preço inicial | — | [Capterra](https://www.capterra.com/p/207608/Field-Control/) |
| **Auvo** | **Não** | "Contact vendor for pricing". Atende só empresa com **2+ pessoas em campo**. Teste grátis. | — | [Capterra](https://www.capterra.com/p/201778/Auvo/) · [GetApp](https://www.getapp.com/operations-management-software/a/auvo/) |
| **Produttivo** | **Não** | 4 faixas (Padronização, Produtividade, **Performance** "mais utilizado", Automação). **15 dias grátis.** Valores só com consultor. | — | [produttivo.com.br/planos](http://www.produttivo.com.br/planos/) |
| **Arcke** | **Não** | Só "agendar demonstração" | — | [arcke.com.br](https://www.arcke.com.br/) |
| **Refriplay** | **Não** | 7 dias grátis sem cartão; "ver planos" sem valor na home | — | [refriplay.com.br](https://refriplay.com.br/) |
| **Matum / SisUM** | **Não** | Nenhum valor na página; só demonstração | — | [matum.com.br](https://matum.com.br/software-pmoc-refrigeracao/) |
| **OLLI** | **Sim** | **R$ 39 Pro · R$ 99 Empresa** (mensal); anual −20%; 12× é valor cheio | Ver §4 | `src/services/precosPlanos.ts` (conferido contra Stripe live em 19/07/2026) |

> ⚠ **Conflito de fonte no Field Control:** a página da Omie Store lista R$ 525 de pacote com 4 licenças e valores itemizados (inclusive uma promoção datada 20/07–31/08/2026); o Capterra diz "R$ 295 por usuário/mês". **Confio na Omie Store** — é página de revenda com itens e datas, não um campo genérico de diretório. Se for usar em material de venda, refaça a checagem no dia.

> ⚠ **Contradição no Auvo:** o Capterra diz "sem versão gratuita"; o GetApp diz "versão gratuita: sim". Nenhum dos dois é a Auvo falando. **Não cite nenhum dos dois como fato do Auvo.**

### 1.2 Fora (referência de teto, não concorrência direta)

| Produto | Preço (2026) | Usuários | Fonte |
|---|---|---|---|
| **Jobber** | Core **US$ 39/mês** · Connect **US$ 119** · Grow **US$ 199** (mensal). Anual: US$ 28 / 72 / 120. Times: Connect US$ 169 · Grow US$ 349 · Plus US$ 599 | Core 1 · Connect até 5 · Grow até 15 · extra **US$ 19/usuário** | [Capterra](https://www.capterra.com/p/127994/Jobber/pricing/) |
| **Housecall Pro** | Basic **US$ 79/mês** (US$ 59 anual) · Essentials **US$ 189** (US$ 149) · MAX **US$ 329** (US$ 299). 14 dias grátis | 1 · 5 · 8 (+**US$ 35/usuário**) | [housecallpro.com/pricing](https://www.housecallpro.com/pricing/) |
| **ServiceTitan** | **Não publica.** Estimativas de terceiros: **US$ 245–500+ por técnico/mês** + **US$ 5.000–50.000 de implantação** + contrato de 12 meses | por técnico | [fieldcamp.ai](https://fieldcamp.ai/reviews/servicetitan/) · [rivetops.io](https://www.rivetops.io/servicetitan-pricing) — **dados de contratantes, não oficiais** |

**Leitura:** a qualquer câmbio dos últimos anos (R$ 5–6/US$), o plano de **entrada** do Jobber custa mais que **cinco vezes** o Pro do OLLI, e o Housecall Basic mais de **dez vezes**. Eles não são concorrentes do OLLI: são a prova de que **existe disposição a pagar** neste tipo de software quando ele resolve o ciclo de dinheiro. Nenhum deles opera em português nem processa Pix. **Não são canal, não são ameaça, e não devem ser copiados feature a feature.**

---

## 2. Pergunta 1 — O QUE ELES TÊM QUE O OLLI NÃO TEM

### 2.1 ESSENCIAL — a falta impede a venda

**E1. Estoque e, no HVAC, controle de gás refrigerante.**
O Conectar Play vende explicitamente "Estoque e Gases Refrigerantes — controle de peças e R-22, R-32, R-410A, R-404A" ([conectarplay.com](https://conectarplay.com/), 21/07/2026). Arcke tem app de inventário com etiqueta. O OLLI tem **catálogo** de produtos, não saldo: `grep quantidadeEstoque` em `src/` volta vazio.
- **Para o prestador:** quem faz manutenção compra gás e peça. Sem saldo, ele não sabe quanto gastou por OS — e no HVAC o gás é item rastreado.
- **Esforço:** M (saldo por item + baixa na OS; o catálogo e a OS já existem).
- **Custo por uso:** R$ 0 (SQLite local + sync que já roda).
- **Sem rede:** funciona — é escrita local; o conflito de saldo entre dois aparelhos é o único ponto que exige regra (último-a-escrever-vence já é o padrão do `cloudSync`).
- **Recorte honesto:** fazer estoque completo é armadilha. Fazer **só "quanto de gás/peça saiu nesta OS"** entrega 80% do argumento com 20% do trabalho.

**E2. O cliente abrir chamado sozinho.**
Auvo ("Central do Cliente"), Arcke ("Central do Cliente"), Conectar (app do cliente iOS/Android), Housecall Pro ("online booking"), Jobber ("Client Hub"). O OLLI tem link público do orçamento (`/o/<token>`) e página do QR do equipamento (`/q/<token>`) — conferido em `worker/src/index.js:784,816` — mas **não existe abertura de chamado**: `grep -rl "chamado"` em `src/` só bate em comentários.
- **Para o prestador:** administradora de condomínio e empresa com contrato **exigem** um canal registrado. Sem isso o OLLI perde a venda B2B de manutenção recorrente — que é justamente a venda que paga contrato mensal.
- **Esforço:** M.
- **Custo por uso:** R$ 0 marginal (o worker e a página pública já existem; é mais uma rota).
- **Sem rede:** o **cliente** precisa de rede (é ele que abre, do sofá dele). O prestador vê o chamado no próximo sync — nada quebra no aparelho dele.
- **Não faça app do cliente.** Segundo binário na loja = segunda esteira de revisão, segunda política de privacidade, segundo suporte. Para uma pessoa só isso é proposta morta. Página no link já resolve.

**E3. Financeiro além do recibo.**
Auvo tem módulos Financeiro e Cobranças; Conectar tem boleto e Pix integrados. O OLLI tem recibo, Pix copia-e-cola e o radar de cobrança — mas `grep "contas a pagar\|fluxo de caixa"` em `src/` e `webapp/src/` volta **vazio**.
- **Para o prestador:** ele sabe o que entrou, não o que vai sair. "Sobrou dinheiro este mês?" é a pergunta dele.
- **Esforço:** M para um lançamento de saída simples + saldo do mês. **G** para fluxo de caixa de verdade.
- **Custo por uso:** R$ 0.
- **Sem rede:** funciona (local).
- **Boleto: não faça.** Exige registro bancário, remessa/retorno e conciliação. Pix já cobre o caso brasileiro e o OLLI já tem.

**E4. Roteirização (ordem das paradas do dia).**
Field Control vende como módulo pago (R$ 89, ou R$ 169 no Otimizador Avançado). Housecall MAX inclui otimização de rota. Jobber tem routing a partir do Connect. O OLLI tem a **porta** definida (`src/services/ports/RoutingProvider.ts`) e o próprio arquivo admite: *"Impl de-facto HOJE: NENHUM cálculo de rota"* — só deep-link para o Google Maps.
- **Esforço:** M (o worker já fala com a Routes API para o ETA).
- **Custo por uso:** **pago, por chamada** — é o único terceiro caro do OLLI, e o `etaSaida.ts` já documenta a trava de custo.
- **Sem rede:** **quebra**. Cálculo de rota é online por definição.
- **Veredito: NÃO FAÇA AGORA.** Otimizar paradas só paga acima de ~6 visitas/dia. O alvo do OLLI faz 3–5. O Field Control cobra R$ 169 por isso porque vende para frota, não para o MEI. Ver §6.

**E5. GPS do técnico em tempo real.**
É o **coração** do Auvo e do Field Control — a categoria deles chama "gestão de equipes externas", não "orçamento". No OLLI existe tela e schema, mas a captura nativa depende de `expo-location` e de um prebuild final (ver `FEATURE_MATRIX.md`).
- **Veredito:** essencial **só** para vender ao gestor de equipe. Para o MEI é irrelevante — e pior, é o que faz o técnico odiar o app. **Não é o campo de batalha do OLLI.**

**E6. Assinatura com validade jurídica reforçada (ICP-Brasil).**
Conectar Play anuncia "Assinatura Digital com validade jurídica ICP-Brasil". O OLLI é honesto no código — `src/components/assinatura/AssinaturaClienteModal.tsx` diz textualmente que **não** é ICP-Brasil, sem certificado nem carimbo de tempo.
- **Veredito:** a honestidade está certa e **não deve ser "melhorada"**. Mas numa mesa de compra corporativa isso é uma desvantagem declarada. Integrar ICP-Brasil é **G** e custa por assinatura — **não faça**; venda o que a assinatura desenhada é: comprovação de aceite, do naipe do canhoto de entrega.

**E7. Integração com ERP brasileiro.**
Field Control está **dentro da Omie Store**, com oferta conjunta datada. Jobber e Housecall integram QuickBooks. O OLLI não integra nada.
- **Isto é canal antes de ser feature** — ver §5.

### 2.2 ENFEITE — a falta não impede a venda para o alvo do OLLI

Auvo Chat (chat interno), Auvo Desk (helpdesk), pesquisa de satisfação/NPS, gestão de veículos, controle de km rodado, comissão de técnico, BI customizável, marketing suite, e **AI Receptionist** (Jobber cobra **US$ 99/mês** de adicional por isso; Housecall tem CSR AI/Voice — [comparativo Jobber](https://www.getjobber.com/comparison/jobber-vs-housecall-pro/), 2026).

Nenhum desses vende o OLLI para um MEI. Comissão e ponto só existem com funcionário; BI só existe com gestor. **Construir qualquer um deles agora é queimar o único recurso escasso do projeto.**

---

## 3. Pergunta 2 — O QUE O OLLI TEM QUE ELES NÃO TÊM

Li o código antes de escrever cada linha. **Três dos cinco itens do briefing não sobrevivem à checagem.**

| Diferencial alegado | Existe no OLLI? | O concorrente tem? | Veredito |
|---|---|---|---|
| IA de voz monta orçamento falando | **Sim** — `src/services/vozNuvem.ts` (grava com `expo-audio`, manda pro worker, Gemini monta os itens) | **SIM.** Produttivo **Manu IA**: "o técnico grava um áudio no app e o checklist ou relatório fica pronto na hora"; áudio de WhatsApp vira OS ([materiais.produttivo.com.br/manu-ia](https://materiais.produttivo.com.br/manu-ia), 21/07/2026) | ❌ **Não é exclusivo.** Paridade, não fosso |
| Diagnóstico por código de erro | **Sim** — 698 códigos offline (`src/database/database.ts:574`) + IA aterrada em manuais (`hvac_chunks`) | **SIM.** Auvo distribui **"Auvo Busca Erro" grátis** como isca de lead ([auvo.com/ferramentas-gratuitas](https://www.auvo.com/ferramentas-gratuitas)); Facilita Técnico e Ajuda Técnico entregam offline com **mais** módulos (superaquecimento, régua de gases, carga térmica) | ❌ **Não é exclusivo.** O que é diferente é a **integração** (do erro ao orçamento) |
| PMOC | **Sim** — `src/services/pmoc.ts`, com versionamento append-only, aprovação por RT e geração idempotente de OS | **SIM, sete deles:** Auvo, Produttivo, Conectar, Arcke, Refriplay, Matum/SisUM, Neovero | ❌ **Praça lotada.** O OLLI está **atrás**, não à frente |
| Assinatura do cliente no aparelho | **Sim** — `AssinaturaClienteModal.tsx`, offline por construção | **SIM.** Conectar (com ICP-Brasil), Auvo (formulários com assinatura), Arcke, Jobber, Housecall | ❌ **Comódite.** E a deles tem mais peso jurídico |
| Radar de dinheiro parado | **Sim** — `radarCobranca.ts` (aprovado sem recibo) + `radarFollowUp.ts` (proposta parada ≥3 dias) + `PainelDinheiroParado.tsx` na home, com **Pix copia-e-cola pré-montado** e WhatsApp em 1 toque | **Parcial.** Jobber/Housecall têm follow-up automático de fatura; Auvo tem módulo de Cobranças. **Não achei ninguém que ponha "R$ X parados há N dias" como primeira coisa da tela inicial, com o Pix já pronto** | ✅ **Diferencial real** — mas pequeno e copiável (esforço P para o concorrente) |
| Contrato + garantia + termo de conclusão gerados do orçamento | **Sim** — `GerarDocumentoModal.tsx`, cláusulas editáveis, sem redigitar | Arcke tem "Contratos"; os apps de campo geralmente **não** geram contrato brasileiro de prestação | ✅ **Diferencial moderado**, pouco explorado na comunicação |

### 3.1 O que é diferencial de verdade (e não estava na lista do briefing)

**D1. Preço publicado + autosserviço sem vendedor.**
Auvo, Produttivo, Arcke, Refriplay, Matum e ServiceTitan **escondem o preço**. Só Conectar e Tecniko publicam. O prestador que chega às 22h, depois do último serviço, e quer saber quanto custa **não vai agendar demonstração**. Este é o fosso mais barato e mais real que o OLLI tem — e a landing precisa gritar isso.

**D2. Offline por construção, incluindo assinatura e PDF.**
`AssinaturaClienteModal.tsx` documenta: *"nada aqui toca a rede — nem para desenhar, nem para virar imagem"*. O banco é SQLite local com sync em segundo plano. Casa de máquinas, subsolo, prédio de concreto: é onde o técnico está. Concorrente que anuncia "modo offline" quase sempre quer dizer "o formulário guarda e envia depois", não "o app inteiro funciona".

**D3. "A que horas eu preciso sair" (ETA com trânsito).**
`src/services/etaSaida.ts` + `worker/src/etaSaida.js`. Não achei equivalente em nenhum concorrente brasileiro. É a única feature do OLLI que resolve a dor nº1 de quem trabalha em cidade grande: **chegar atrasado**.

**D4. Vertical deduzida do CNAE.**
`src/services/verticais.ts` mapeia CNAE → ofício → ferramentas (PMOC, checklist NR-10, laudo, certificado ANVISA, calculadora de tinta). Conectar e Refriplay são **HVAC-only**; Auvo e Field Control são **genéricos sem documento de ofício nenhum**. Ninguém faz os dois. Este é o fosso de produto — ver §6.

**D5. Cota de IA no plano grátis.**
`IA_USOS_GRATIS_MES = 3` (`src/services/entitlements.ts`). O Produttivo tem IA, mas atrás de demonstração e plano pago. Deixar o prestador **provar** a IA sem cartão é vantagem de aquisição, não de produto.

> **Custo da IA, para decidir com número:** o worker usa `gemini-2.5-flash` (`worker/src/gemini.js:15`), a US$ 0,30 por 1M de tokens de entrada e US$ 2,50 por 1M de saída ([pricepertoken](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash), 2026). Um orçamento falado típico (alguns milhares de tokens de entrada, algumas centenas de saída) custa **ordem de centavos de real**. **Ressalva honesta: não confirmei a tarifa de token de ÁUDIO**, que é cobrada em faixa própria e pode ser várias vezes a de texto — confira antes de prometer "IA ilimitada" no Pro de R$ 39 para um usuário pesado.

---

## 4. Pergunta 3 — PREÇO: onde R$ 39 e R$ 99 caem

### 4.1 O Pro (R$ 39) está certo. Não mexa.

Contra tudo que é comparável no Brasil, R$ 39/mês para uma pessoa está **abaixo do piso do mercado** — o único mais barato é o plano grátis do Tecniko. Isso **não** sinaliza produto ruim para o público-alvo:

- O teto de faturamento do MEI é R$ 81.000/ano ≈ R$ 6.750/mês. **R$ 39 é 0,58% do faturamento de um mês.**
- Um único orçamento que ele deixa de perder por esquecimento paga o ano inteiro.
- Para esse comprador, preço baixo **não** é sinal de má qualidade: é sinal de que o produto foi feito para ele e não para uma empresa com departamento de compras.

**Onde R$ 39 sinaliza mal:** numa venda para administradora ou indústria. Mas essa venda o OLLI não faz hoje — e não deveria tentar fazer com uma pessoa só de equipe.

### 4.2 O Empresa (R$ 99) é o problema. E é grave.

**O Conectar Play cobra R$ 79,90 com usuários ilimitados** e entrega, no nicho de refrigeração, mais que o OLLI: PMOC, QR, ICP-Brasil, estoque de gases, certificado de higienização, app do cliente, boleto e Pix. Um refrigerista comparando as duas páginas escolhe o Conectar em trinta segundos.

Pior: no código do OLLI, `RECURSOS_POR_PLANO` (`src/services/entitlements.ts`) é um `Set` de recursos — **não existe limite de assentos codificado**. O Empresa já é, de fato, "técnicos ilimitados". **O OLLI cobra mais caro que o concorrente por uma coisa que o concorrente anuncia e o OLLI não anuncia.**

**O que fazer (esforço P, custo R$ 0):**
1. Escrever na landing e na tela de planos: **"Empresa: R$ 99/mês, técnicos ilimitados — por empresa, não por pessoa."** Isso ganha do Field Control com folga (R$ 525 + R$ 89/licença ⇒ 8 técnicos ≈ R$ 881/mês) e empata com o Conectar num produto multi-vertical.
2. Fechar o paywall do Empresa (achado já conhecido do projeto). Anunciar "ilimitado" sem enforcement é dar de graça.

**O que NÃO fazer:**
- **Não crie plano por assento.** Cobrança por usuário gera pergunta de suporte, prorata, downgrade e disputa — para uma pessoa só isso é custo operacional puro. "Por empresa" é mais simples de vender **e** mais barato de operar.
- **Não baixe o preço para brigar com o grátis do Tecniko.** Guerra de preço contra quem tem plano gratuito permanente é perdida por definição. O grátis do OLLI (orçamentos, recibos, clientes, agenda, diagnóstico offline e link do cliente ilimitados, + 3 usos de IA/mês) já é competitivo — e é a arma certa.
- **Não suba o Pro para "parecer sério".** Sem marca, preço alto não vende: só reduz o topo do funil.

### 4.3 O detalhe do 12× que precisa continuar visível

`precosPlanos.ts` já registra: o parcelado é **46.800 centavos = 39,00 × 12 exatos**, ou seja **R$ 93,60 mais caro que o anual à vista**. O comentário do próprio arquivo está certo — **quem descobre depois pede reembolso e não volta.** Não esconda.

---

## 5. Pergunta 4 — COMO ELES CONSEGUEM CLIENTE (sem verba, o que funciona)

Este mercado é ganho por **conteúdo e canal**, não por anúncio. Quatro jogadas verificadas, todas ao alcance de uma pessoa:

**C1. Ferramenta grátis na web como isca (a jogada do Auvo).**
O Auvo publica **dez calculadoras e geradores grátis**: BTU, homem-hora, MTBF/MTTR, km rodado, ROI, consumo de energia, precificação, gerador de orçamentos e **"Auvo Busca Erro"** — com captura de e-mail ([auvo.com/ferramentas-gratuitas](https://www.auvo.com/ferramentas-gratuitas), 21/07/2026).
- **O OLLI já tem esses ativos dentro do app** e não os publica: `src/services/calculadoras.ts`, `calculosOficio.ts`, `CalculadoraTintaScreen.tsx`, e a base de **698 códigos de erro**.
- **Proposta:** publicar essas calculadoras + uma **página pública de consulta de código de erro** na landing Astro.
- **Para o prestador:** ele acha o OLLI procurando "erro E5 ar condicionado", não procurando "software de ordem de serviço".
- **Esforço:** **P** para a página de códigos (o dado já existe no seed); **M** para o conjunto de calculadoras.
- **Custo por uso:** R$ 0 — conteúdo estático no Astro, sem chamada de IA.
- **Sem rede:** irrelevante (é página pública de aquisição, não do app).
- **É a maior alavanca de aquisição disponível hoje, e o ativo já está pronto no repositório.**

**C2. Modelos e planilhas gratuitas (a jogada do Produttivo).**
O Produttivo mantém `/modelo/`, `/conteudos/` (planilhas gratuitas), blog e newsletter — e ranqueia com "modelo de PMOC PDF", "modelo PMOC digital". Modelo pronto de PMOC, de contrato de manutenção, de checklist NR-10, de certificado de dedetização: cada um é uma porta de entrada.
- **Esforço:** P por modelo. **Custo:** R$ 0.

**C3. Marketplace de ERP e revenda setorial.**
- Field Control vende **dentro da Omie Store**, com promoção conjunta datada ([store.omie.com.br](https://store.omie.com.br/apps/field-control)).
- Conectar Play aparece revendido por **loja de peças de refrigeração** (Gelar Rápido).
- **Para o OLLI:** distribuidor de peças, loja de gás, escola técnica e curso de refrigeração são canais de custo zero em mídia, com público 100% qualificado. Uma pessoa consegue fechar isso por WhatsApp.

**C4. Indicação formalizada.**
O Produttivo tem página "Indique e ganhe". Programa de indicação é **P** de esforço e o custo só existe quando a venda acontece.

**C5. Diretórios de software (Capterra/GetApp Brasil).**
Auvo, Field Control, Produttivo e Jobber estão lá; o OLLI não. É de onde vem o tráfego de comparação ("alternativa ao Auvo"). **Verificar se a listagem básica continua gratuita antes de investir tempo — não confirmei isso nesta pesquisa.**

**O que NÃO funciona no cenário do dono:**
- Mídia paga (não há verba).
- Outbound com SDR/telefone (exige equipe).
- Feira do setor (custo alto, retorno lento).
- Escrever para o mercado errado: **conteúdo em inglês, ou mirando gestor de frota, não converte MEI brasileiro.**

---

## 6. Pergunta 5 — A LACUNA QUE NINGUÉM COBRE

### 6.1 Mate a hipótese errada primeiro: **PMOC não é lacuna**

A Lei 13.589/2018 obriga PMOC em edifícios de uso público e coletivo, com fiscalização de Vigilância Sanitária/ANVISA e multas que a literatura do setor coloca entre R$ 2.000 e R$ 1.500.000 conforme a gravidade ([ABRAVA](https://abrava.com.br/a-abrava/pmoc-perguntas-e-respostas/); [Direct Ar Condicionado](https://directarcondicionado.com.br/blog/pmoc-obrigatorio-lei-13589), 2026). A obrigação é real e o dinheiro é real — **e é exatamente por isso que sete produtos já estão lá:** Auvo (módulo PMOC), Produttivo (Programa PMOC), Conectar Play, Arcke, Refriplay, Matum/SisUM, Neovero, além do IClass.

**Diga isto sem rodeio: entrar em PMOC como se fosse território livre é o erro mais caro disponível neste documento.** O PMOC do OLLI é bom (versionamento append-only, aprovação por responsável técnico, geração idempotente de OS, e o caveat legal correto de nunca declarar conformidade). Mas ele é **paridade de mesa**, não fosso.

### 6.2 Lacuna verdadeira nº 1 — **o prestador de UMA PESSOA, que o líder recusa por política**

- **Auvo:** atende empresa com **2 ou mais pessoas em campo** ([registro público de atendimento da Auvo no Reclame Aqui](https://www.reclameaqui.com.br/empresa/auvo-tecnologia/), 21/07/2026).
- **Field Control:** entrada em **R$ 525/mês** com 4 licenças + **R$ 899 de implantação**.
- **Produttivo:** preço só com consultor — o que já filtra quem tem verba de compra.
- **ServiceTitan:** contrato de 12 meses e implantação de cinco dígitos em dólar.
- **O mercado:** **13.512.528 CNPJs MEI ativos no Brasil em 2026**, e MEIs foram 78% das empresas abertas no ano ([Exame](https://exame.com/economia/brasil-tem-132-milhoes-de-meis-que-representam-70-das-empresas-do-pais/); [Contabeis](https://www.contabeis.com.br/noticias/78127/meis-78-das-novas-empresas-no-brasil-em-2026/), 2026). Eletricista, encanador e instalador de ar-condicionado estão entre as ocupações permitidas.

O OLLI já está nessa lacuna — **por acidente de origem, não por estratégia declarada.** A ação é de posicionamento, não de código: dizer na primeira dobra da landing que o OLLI é **para quem trabalha sozinho ou com um ajudante**, com preço na tela, sem demonstração, sem implantação, sem contrato.
- **Esforço:** **P** (copy). **Custo:** R$ 0. **Sem rede:** n/a.

### 6.3 Lacuna verdadeira nº 2 — **"o documento obrigatório do MEU ofício", multi-vertical**

Os que têm documento de ofício (PMOC) são **HVAC-only**: Conectar, Refriplay, Matum, Neovero.
Os que são multi-ofício (Auvo, Field Control) **não entregam documento de ofício nenhum** — entregam formulário customizável, que é a mesma coisa que uma folha em branco.

Ninguém entrega, no mesmo produto e no mesmo ciclo comercial:
- PMOC para o refrigerista (Lei 13.589/2018),
- certificado de dedetização para o controlador de pragas (toda empresa precisa de licença sanitária, responsável técnico e certificado com os dados técnicos dos produtos aplicados — [Biodoca](https://www.biodoca.com.br/certificado-dedetizacao-anvisa-importancia/), 2026) — e o OLLI **já tem** `CertificadoAnvisaScreen.tsx`,
- checklist/laudo para o eletricista,
- contrato de manutenção recorrente para todos eles.

**O OLLI já tem a planta** (`src/services/verticais.ts` mapeia CNAE → vertical → ferramenta, com `disponivel: boolean` marcando a fila de construção). Este é o único fosso do documento que é **estrutural** e não copiável em uma semana: exigiria dos concorrentes HVAC sair do nicho, e dos genéricos entrar em norma técnica.
- **Para o prestador:** ele deixa de pagar contador/engenheiro por um Word e passa a emitir o documento que o cliente exige.
- **Esforço:** **M por vertical** (o motor de documento e o de PMOC já existem e são reaproveitáveis).
- **Custo por uso:** R$ 0 (geração local de PDF).
- **Sem rede:** funciona — os documentos são gerados no aparelho.

### 6.4 Candidata que eu investiguei e **recomendo NÃO perseguir**: laudo SPDA / NBR 5419

A NBR 5419 foi atualizada em 2026, exige plano de inspeção documentado e inspeção visual anual, e o laudo é pré-requisito para o AVCB do Corpo de Bombeiros ([EletroProj](https://eletroproj.com.br/laudo-spda/); [Token Engenharia](https://tokenengenharia.com.br/servicos/laudo-de-spda/), 2026). Parece uma lacuna perfeita — **e não é para este produto**: a norma exige que a inspeção seja feita por **profissional qualificado com registro ativo no CREA** (na prática, engenheiro eletricista). **O usuário do OLLI, o eletricista MEI, não assina esse laudo.** Construir para um comprador que não é o usuário é como o projeto queima seis meses.

---

## 7. O QUE NÃO FAZER (a parte que decide)

1. **Não anuncie "IA de voz" como exclusividade.** O Produttivo reivindica ser o primeiro do segmento com IA e faz áudio→relatório e WhatsApp→OS. A afirmação falsa cai no primeiro prospect que pesquisa.
2. **Não trate PMOC como território livre.** Sete concorrentes já estão lá. Use como paridade, não como manchete.
3. **Não chame a assinatura de "assinatura digital" sem qualificar.** O código já é honesto (não é ICP-Brasil); a copy tem que ser também. E **não** integre ICP-Brasil — é G e custa por assinatura.
4. **Não construa roteirização.** Custa por chamada, quebra sem rede, e só paga acima de ~6 paradas/dia. O alvo faz 3–5.
5. **Não construa NF-e/NFS-e.** Cada município tem seu webservice; é manutenção perpétua. Para uma pessoa só, é proposta morta. Integre ou não faça.
6. **Não construa app do cliente.** Segundo app na loja = segunda esteira de revisão e suporte. O link público + QR já cobre.
7. **Não construa BI/relatório customizável.** É o terreno do Auvo e do SisUM (170+ relatórios). Não é o campo de batalha do MEI.
8. **Não persiga GPS em tempo real como manchete.** É o produto do Auvo e do Field Control, é o que o técnico odeia, e não é a dor de quem trabalha sozinho.
9. **Não crie plano por assento.** "Por empresa, técnicos ilimitados" vende melhor e custa menos para operar.
10. **Não baixe preço para brigar com plano gratuito** (Tecniko). Guerra perdida por definição.
11. **Não vá para o mercado americano.** Jobber/Housecall/ServiceTitan são referência de teto de preço, não alvo. Sem pt-BR, sem Pix, sem suporte — nada disso se resolve sozinho.
12. **Não persiga laudo SPDA.** O comprador (engenheiro CREA) não é o usuário (eletricista MEI).
13. **Não confie em preço de diretório** (Capterra/GetApp) sem confirmar na fonte: os dois se contradizem sobre Auvo e Field Control.

---

## 8. A verdade desconfortável

O OLLI tem **57 commits, ~95 telas e zero usuários pagantes**. Os concorrentes têm menos features por real e mais clientes: o Conectar Play anuncia 3.200 empresas ativas e 120.000 ordens de serviço; o Produttivo, mais de duas mil empresas.

**A diferença entre eles e o OLLI não é engenharia. É que eles têm uma página onde o prestador encontra a resposta que procurou no Google, e o OLLI não.**

Todo item de §2 (o que falta) é opcional. **Só duas coisas deste documento não são:**

1. **Dizer a verdade nova na landing** — preço publicado, sem vendedor, técnicos ilimitados no Empresa, funciona sem sinal, e **parar** de reivindicar as três exclusividades que não existem. Esforço **P**, custo **R$ 0**.
2. **Publicar na web os ativos que já estão no repositório** — 698 códigos de erro e as calculadoras de ofício, como página pública. Esforço **P–M**, custo **R$ 0**, e é exatamente a jogada que o líder do mercado usa há anos.

Se só uma coisa for feita depois de ler isto, que seja a nº 2. É a única do documento que traz gente nova sem gastar dinheiro nem exigir equipe.

---

### Fontes (todas consultadas em 21/07/2026)

- Conectar Play / Conectar Sistemas — https://conectarplay.com/
- Field Control via Omie Store — https://store.omie.com.br/apps/field-control
- Field Control (Capterra) — https://www.capterra.com/p/207608/Field-Control/
- Auvo — https://www.auvo.com/ · ferramentas grátis: https://www.auvo.com/ferramentas-gratuitas
- Auvo (Capterra) — https://www.capterra.com/p/201778/Auvo/ · (GetApp) — https://www.getapp.com/operations-management-software/a/auvo/
- Auvo, política de atendimento a 2+ colaboradores em campo — https://www.reclameaqui.com.br/empresa/auvo-tecnologia/
- Produttivo — planos: http://www.produttivo.com.br/planos/ · Manu IA: https://materiais.produttivo.com.br/manu-ia
- Tecniko — https://tecniko.app/blog/alternativa-ao-auvo
- Arcke — https://www.arcke.com.br/ · Refriplay — https://refriplay.com.br/ · Matum/SisUM — https://matum.com.br/software-pmoc-refrigeracao/
- Jobber (Capterra) — https://www.capterra.com/p/127994/Jobber/pricing/ · Jobber vs Housecall — https://www.getjobber.com/comparison/jobber-vs-housecall-pro/
- Housecall Pro — https://www.housecallpro.com/pricing/
- ServiceTitan (estimativas de terceiros) — https://fieldcamp.ai/reviews/servicetitan/ · https://www.rivetops.io/servicetitan-pricing
- PMOC / Lei 13.589/2018 — https://abrava.com.br/a-abrava/pmoc-perguntas-e-respostas/ · https://directarcondicionado.com.br/blog/pmoc-obrigatorio-lei-13589
- Certificado de dedetização / ANVISA — https://www.biodoca.com.br/certificado-dedetizacao-anvisa-importancia/
- Laudo SPDA / NBR 5419:2026 — https://eletroproj.com.br/laudo-spda/ · https://tokenengenharia.com.br/servicos/laudo-de-spda/
- MEIs no Brasil — https://exame.com/economia/brasil-tem-132-milhoes-de-meis-que-representam-70-das-empresas-do-pais/ · https://www.contabeis.com.br/noticias/78127/meis-78-das-novas-empresas-no-brasil-em-2026/
- Preço Gemini 2.5 Flash — https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash

### Arquivos do OLLI lidos para esta pesquisa

`src/services/precosPlanos.ts` · `web/src/data/planos.ts` · `src/services/entitlements.ts` · `src/services/planos.ts` · `src/services/verticais.ts` · `src/services/pmoc.ts` · `src/services/ordemServico.ts` · `src/services/equipamentos.ts` · `src/services/vozNuvem.ts` · `src/services/radarCobranca.ts` · `src/services/radarFollowUp.ts` · `src/services/etaSaida.ts` · `src/services/relatorioDia.ts` · `src/services/ports/RoutingProvider.ts` · `src/components/PainelDinheiroParado.tsx` · `src/components/assinatura/AssinaturaClienteModal.tsx` · `src/components/documentos/GerarDocumentoModal.tsx` · `src/database/database.ts` · `worker/src/index.js` · `worker/src/gemini.js` · `worker/src/link.js` · `docs/FEATURE_MATRIX.md`
