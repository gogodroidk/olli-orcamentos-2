# APIS E INTEGRAÇÕES — inventário decisório

> Pesquisado na web em **2026-07-18**. Preço de API muda; cada número abaixo tem URL.
> Câmbio usado: **US$ 1 ≈ R$ 5,40** (aproximado — confira antes de fechar orçamento).
> Código lido antes de propor: `src/services/`, `worker/src/`, `docs/INTEGRATION_BACKLOG.md`.
>
> **Este documento não é catálogo. Cada linha tem veredito.** Se algo já existe no OLLI,
> está na seção 1 e não é proposto como novo.

---

## 0. Como ler

Cada item tem: **o que muda pro prestador** · **esforço (P/M/G)** · **custo real por uso** ·
**o que quebra se a rede cair** · **veredito**.

- **ENTRA JÁ** — valor alto, esforço baixo, custo conhecido, sem bloqueio humano pendente.
- **ENTRA DEPOIS** — vale, mas depende de outra coisa fechar (onda, decisão do dono, passo humano).
- **NÃO ENTRA** — e o motivo. Metade do valor deste documento está aqui.

Esforço: **P** = até 1 dia · **M** = 2–5 dias · **G** = semanas / envolve passo humano ou risco jurídico.

Dois cenários de volume para todo cálculo de custo:
- **HOJE** — ~50 prestadores ativos.
- **ESCALA** — 1.000 prestadores ativos, cada um com 8 orçamentos e 20 atendimentos/mês.

---

## 1. O que JÁ EXISTE hoje (não proponha isso como novo)

Conferido no código, com arquivo e linha de entrada:

| Coisa | Onde vive | Estado |
|---|---|---|
| **CNPJ → cadastro mágico** | `src/services/cnpj.ts` → worker `GET /cnpj/:14dig` (`worker/src/index.js:422`) | **Em produção.** Proxy fino da **BrasilAPI** (grátis, sem chave), cache 30 dias, autenticado + rate limit. Devolve razão, fantasia, CNAE principal + secundários, endereço. Dedução CNAE→vertical no cliente (`src/services/verticais.ts`). Trata os 4 estados (`ok`/`nao_encontrado`/`invalido`/`indisponivel`). |
| **CEP → endereço** | `src/services/cep.ts` (+ hook `useCepLookup`) | **Em produção.** ViaCEP direto do app, timeout 5s, falha silenciosa → digitação manual. |
| **ETA com trânsito** | `src/services/eta.ts` → worker `POST /eta` (`worker/src/index.js:354`) | **Em produção.** Google **Routes API** (`computeRoutes`, `TRAFFIC_AWARE`), chave só no worker, rate limit por usuário antes do fetch pago. |
| **Geocodificação** | worker `POST /geocodificar` (`worker/src/index.js:518`) | **Em produção.** Google Geocoding API, mesma chave restrita. |
| **IA (diagnóstico, voz→orçamento, chat)** | `worker/src/gemini.js`, `worker/src/voz.js`, `src/services/olliIA.ts`, `olliAssistente.ts` | **Em produção.** Gemini (`gemini-2.5-flash` por default). Fallback offline de 698 códigos. |
| **Transcrição de áudio** | worker `POST /transcrever` (`worker/src/index.js:588`) | **Em produção.** Áudio base64 → Gemini multimodal (`inline_data`). **Não usa Speech-to-Text.** |
| **Pix "copia e cola"** | `src/utils/pixBrCode.ts` | **Em produção e 100% offline.** Monta o BR Code EMV no aparelho, com CRC16. Não toca gateway. |
| **Google Agenda** | `src/services/googleAgenda.ts` | **Completo, atrás de flag.** PKCE + refresh + push/delete. Desligado por falta do OAuth client Android (bloqueio B3). Calendar API + People API **já habilitadas** no projeto `voice-teste-b8b2a`. |
| **WhatsApp** | deep-link `wa.me` em ~15 telas | **Em produção, custo zero.** Não é a Cloud API — é link. |
| **Assinatura / créditos / Pix de crédito** | `worker/src/stripe.js`, `mercadopago.js`, `creditos.js` | Stripe vivo; Mercado Pago pronto, falta `MP_WEBHOOK_SECRET`. |

**Estado do Google Cloud** (de `olli-google-cloud-mapa`): billing **LIGADO** no projeto
`olli-orcamentos` desde 2026-07-10, com alerta de orçamento (teto 50). **Routes API** e
**Geocoding API** habilitadas, chave `OLLI_ROUTES_API_KEY` restrita a essas duas.
Consequência prática: **habilitar Places, Vision ou qualquer outra API no mesmo projeto é
um clique — não precisa de cartão, não precisa do dono.** Esse é o ativo mais subaproveitado
do inventário.

---

## 2. Duas notícias que mudam decisões já tomadas

Achei isto pesquisando e não posso deixar passar — as duas contradizem o
`docs/INTEGRATION_BACKLOG.md` de 2026-07-08.

### 2.1. A **Nuvem Fiscal vai ser desligada em 31/07/2026** — daqui a 13 dias

O `INTEGRATION_BACKLOG.md` elege "**Nuvem Fiscal** (candidato)" como provider da porta
`FiscalProvider`. O site deles hoje estampa: *"Comunicamos que o serviço Nuvem Fiscal será
desativado em 31/07/2026"* (comunicado de 22/04/2026, 90 dias de prazo).
Fonte: https://www.nuvemfiscal.com.br/ e https://www.nuvemfiscal.com.br/suporte/

**Não custou nada porque o OLLI nunca fiou essa porta** (`FiscalProvider.ts` é interface pura,
sem implementação — verifiquei). Sorte, não mérito. Mas a linha FISCAL do backlog está morta e
precisa ser reescrita. **Ação: apagar "Nuvem Fiscal" do backlog.** Isso é edição de doc, não de
código — outra onda que faça, eu sou read-only.

### 2.2. NFS-e deixou de ser "pesadelo municipal" para virar **prazo legal em 6 semanas**

O brief me pediu para "dizer a verdade sobre a dificuldade" da NFS-e. A verdade mudou:

- **Resolução CGSN nº 189/2026** (publicada 28/04/2026): a partir de **1º de setembro de 2026**,
  ME e EPP optantes do Simples Nacional **são obrigadas** a emitir NFS-e de **padrão nacional**,
  exclusivamente pelo **Emissor Nacional** (web **ou API**). Sistema municipal próprio deixa de
  ser opção para o Simples.
  Fontes: https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional
  · https://www.contabeis.com.br/noticias/76438/nfs-e-nacional-sera-obrigatoria-para-me-e-epp-do-simples-nacional/
- **MEI prestador de serviço já é obrigado** ao sistema nacional desde setembro/2023.
- (Menor confiança: uma fonte cita 01/08/2026 para autônomos e liberais isentos —
  https://simplifique.contmatic.com.br/blogs/nfse-nacional-obrigatoria-setembro-2026 — **checar
  antes de usar em copy**.)

**O que isso significa em português:** o argumento "são 5.570 municípios, cada um com um
webservice diferente, é inviável" **acabou de deixar de valer para o público do OLLI**. MEI, ME e
EPP — que é literalmente todo mundo que usa o app — passam a ter **uma API só, federal, gratuita**.
O pesadelo continua existindo, mas para empresa grande fora do Simples. Não é o nosso cliente.

Detalhe brutal que ninguém conta (seção 5.6 abaixo): a API exige **certificado digital
e-CNPJ A1**, e um SaaS que emite pelo cliente precisa **guardar o `.pfx` e a senha do cliente**.
Isso é custódia de assinatura digital. É o verdadeiro bloqueio — não é o XML.

---

## 3. AS 5 QUE MUDAM O JOGO

Sem jargão. Se alguma destas não fizer sentido lendo em voz alta, é minha culpa.

### 1) Nota fiscal de serviço — porque em setembro vira lei, não vantagem

Até 1º de setembro, todo cliente do OLLI que seja MEI, ME ou EPP tem que emitir a nota de serviço
pelo sistema **nacional** do governo — o município dele deixa de valer. Hoje o prestador termina o
serviço no OLLI, marca como pago, e aí abre o navegador, entra no gov.br, redigita nome, CPF,
endereço, valor e descrição do serviço que **já estão no OLLI**. É retrabalho puro, num momento em
que ele já está com o próximo cliente esperando. A versão barata e sem risco: o OLLI monta a nota
inteirinha e joga ele no Emissor Nacional com tudo pronto para conferir e assinar — ele não
redigita nada. A versão cara e arriscada (guardar o certificado digital de cada cliente para emitir
sozinho) fica para depois, se é que fica. **O uau aqui não é tecnológico, é de timing: o
concorrente que não fizer isso até setembro vai ter que explicar ao cliente por que a nota dele
não sai.**

### 2) Clima — a única API desta lista que gera dinheiro em vez de economizar tempo

O dono intuiu certo, e é mais forte do que parece. Duas coisas diferentes, mesma fonte de dados.
A defensiva: chove amanhã às 14h e o cara tem três serviços externos marcados nesse horário — o
OLLI avisa na véspera e oferece remarcar, em vez de ele descobrir dirigindo debaixo d'água e
perder a viagem. A ofensiva, que é a que vale: previsão de 36°C por três dias na cidade dele, e o
OLLI diz *"você tem 41 clientes com ar-condicionado que não fazem limpeza há mais de 8 meses —
quer mandar mensagem para eles hoje?"*. Onda de calor é quando o telefone do técnico de
refrigeração toca sozinho; quem avisa **antes** da onda pega a agenda cheia enquanto o
concorrente ainda está esperando tocar. Isso não existe em nenhum app de orçamento brasileiro que
eu conheça. Custa **US$ 29 por mês fixo para o OLLI inteiro** — não por prestador, não por
consulta. É a melhor relação valor/custo do documento inteiro.

### 3) Endereço que se completa sozinho enquanto ele digita

Hoje, para preencher o endereço de um cliente novo, o prestador precisa **saber o CEP** — porque o
único atalho que existe no app é o CEP. Ninguém sabe o CEP do cliente. Então ele digita rua,
número, bairro, cidade, no celular, em pé, de luva. Com o autocompletar do Google ele digita
"rua das paineiras 40" e toca na sugestão certa: rua, bairro, cidade, estado e **coordenada**
entram de uma vez. A coordenada é o bônus escondido — é ela que faz o ETA e o roteiro do dia (item
5) funcionarem sem gambiarra. É a menor mudança de código deste documento com o maior efeito
percebido, e o Google dá 10.000 buscas por mês de graça. Tem uma pegadinha de conta que eu
detalho na seção 4.2: feito errado, custa 4x mais.

### 4) A foto da plaqueta do equipamento vira cadastro — usando a IA que já pagamos

O técnico chega, encontra um split, e para cadastrar aquele equipamento no OLLI ele digita marca,
modelo, número de série, capacidade em BTU, tensão, tipo de gás — tudo copiado de uma etiqueta
prateada, escrita miúdo, atrás do aparelho, geralmente no alto. É o cadastro mais odiado do app.
Com uma foto, a Olli lê a etiqueta e preenche os campos. O detalhe que faz esta ideia ser boa em
vez de cara: **não devemos usar a API de OCR do Google.** O OCR devolve um monte de texto solto e
custa mais; a Olli **já tem** o Gemini ligado no worker, que olha a mesma foto e devolve os campos
já organizados e já entendidos ("isto é um split 12.000 BTU, gás R-410A, 220V") por **menos de um
centavo por foto**. A opção mais barata também é a melhor, e a fiação já está pronta. O mesmo
truque serve para ler nota fiscal de peça comprada e etiqueta de produto químico da dedetização.

### 5) O dia do técnico em ordem, não na ordem que ele marcou

Quem trabalha sozinho marca os serviços na ordem em que o cliente ligou, não na ordem que faz
sentido dirigir. Seis paradas marcadas ao acaso num dia costumam ter uma ou duas horas de
zigue-zague evitável. O OLLI já sabe calcular tempo com trânsito entre dois pontos (isso está no
ar). Falta a parte simples: pegar as paradas do dia, calcular o tempo entre todas elas e sugerir a
ordem que menos dirige — "nesta ordem você economiza 47 minutos". Quarenta minutos por dia é um
atendimento a mais por semana, que é dinheiro direto. O cálculo das combinações é feito no próprio
aparelho (com 6 a 8 paradas é matemática trivial), e o Google dá 10.000 consultas de matriz por
mês de graça. Depende do item 3 estar feito, porque sem coordenada boa não há roteiro bom.

---

## 4. FAMÍLIA A — Google Cloud

> Fonte de preço: https://developers.google.com/maps/billing-and-pricing/pricing ·
> https://cloud.google.com/vision/pricing · https://cloud.google.com/document-ai/pricing ·
> https://cloud.google.com/speech-to-text/pricing · https://cloud.google.com/text-to-speech/pricing ·
> https://cloud.google.com/translate/pricing · https://ai.google.dev/gemini-api/docs/pricing

### 4.0. Tabela de veredito

| API | Já ligada? | Custo real | Esforço | Veredito |
|---|---|---|---|---|
| **Routes (computeRoutes)** | ✅ sim, em produção | 10k grátis/mês, depois US$5/1k | — | **JÁ ESTÁ** |
| **Geocoding** | ✅ sim, em produção | 10k grátis/mês, depois US$5/1k | — | **JÁ ESTÁ** |
| **Gemini (generativelanguage)** | ✅ sim, em produção | US$0,30/M in · US$2,50/M out (2.5 Flash) | — | **JÁ ESTÁ** |
| **Calendar API** | ✅ habilitada, app atrás de flag | grátis | P (só destravar B3) | **ENTRA DEPOIS** (bloqueio humano) |
| **Places Autocomplete** | ❌ (1 clique — billing já ligado) | 10k grátis/mês, depois US$2,83/1k | **P/M** | 🟢 **ENTRA JÁ** |
| **Place Details (Essentials)** | ❌ | 10k grátis/mês, depois US$5,00/1k | (junto do acima) | 🟢 **ENTRA JÁ** |
| **Route Matrix (Essentials)** | ❌ (1 clique) | 10k grátis/mês, depois US$5/1k | **M** | 🟡 **ENTRA DEPOIS** (depois do autocomplete) |
| **Vision API (OCR)** | ❌ | 1k grátis/mês, depois US$1,50/1k | M | 🔴 **NÃO ENTRA** — Gemini faz melhor e mais barato |
| **Document AI** | ❌ | OCR US$1,50/1k pág · **Form Parser US$30/1k pág** | G | 🔴 **NÃO ENTRA** |
| **Speech-to-Text** | ❌ | 60 min grátis/mês, depois **US$0,016/min** | M | 🔴 **NÃO ENTRA** — 8x o preço do que já usamos |
| **Text-to-Speech** | ❌ | 4M car. grátis (Standard), depois US$4/M | M | 🔴 **NÃO ENTRA** — resolve problema que ninguém tem |
| **Translate** | ❌ | 500k car. grátis/mês, depois US$20/M | P | 🔴 **NÃO ENTRA** — público é 100% pt-BR |
| **Address Validation** | ❌ | 5k grátis/mês (Pro), depois **US$17/1k** | M | 🔴 **NÃO ENTRA** — 6x o autocomplete, ganho marginal |

### 4.1. O ativo escondido: billing já está ligado

Vale repetir porque muda o custo de tudo nesta seção: o projeto `olli-orcamentos` **já tem
cartão, já tem alerta de orçamento configurado (teto 50) e já tem duas APIs pagas rodando em
produção sem sustos.** Ligar Places ou Route Matrix ali é habilitar a API e ampliar a restrição da
chave existente. **Não há passo humano, não há cartão novo, não há espera.** O bloqueio "B4
(billing Google)" citado no `INTEGRATION_BACKLOG.md` para as portas MAPS e ROUTING **está
desatualizado — B4 caiu em 2026-07-10.**

### 4.2. Places Autocomplete — 🟢 ENTRA JÁ (e a pegadinha de US$ 226/mês)

**O que muda pro prestador:** para de precisar saber o CEP. Digita "paineiras 40" e toca na
sugestão. Vem rua, bairro, cidade, UF **e coordenada** — a coordenada alimenta ETA e roteiro sem
uma chamada extra de geocoding.

**Esforço: P/M.** Um componente de input com sugestões + rota nova no worker (a chave **não** pode
ir pro bundle). O `useCepLookup` de `src/services/cep.ts` já é o molde do padrão "digita → completa";
o ViaCEP continua como caminho alternativo, não sai.

**Custo — e é aqui que quase todo mundo erra.** A cobrança do Places mudou: **sem `sessionToken`,
cada tecla digitada é 1 request cobrado** (SKU "Autocomplete Requests"). Com session token
terminando em Place Details Essentials, as 12 primeiras teclas são cobradas e o resto da sessão é
zero. Fonte: https://developers.google.com/maps/documentation/places/web-service/session-pricing

Com `sessionToken` **+ debounce de 300ms + mínimo de 4 caracteres**, um endereço custa ~5 requests
de autocomplete + 1 Place Details:

| Cenário | Requests/mês | Conta |
|---|---|---|
| **HOJE** (~50 prestadores, ~400 endereços/mês) | 2.000 + 400 | **R$ 0** (dentro do free tier) |
| **ESCALA** (1.000 prestadores, 8.000 endereços/mês) | 40.000 + 8.000 | 30k × US$2,83 = **US$ 85/mês ≈ R$ 460** → **R$ 0,46 por prestador/mês** |
| **ESCALA feito ERRADO** (sem token, sem debounce, ~15 teclas) | 120.000 | **US$ 311/mês ≈ R$ 1.680** |

A diferença entre as duas últimas linhas é ~US$226/mês em três linhas de código. **Isto tem que
estar escrito no PR, não na cabeça de quem implementou.**

**Se a rede cair:** o campo continua sendo um campo de texto comum. Digita à mão, salva igual. A
busca por CEP (ViaCEP) segue como segunda porta. Zero beco sem saída — mesma regra do `cnpj.ts`.

### 4.3. Route Matrix — 🟡 ENTRA DEPOIS (o roteiro do dia)

**O que muda:** ordena as paradas do dia. "Nesta ordem você dirige 47 minutos a menos."

**Esforço: M**, e a maior parte não é a API — é a UI de aceitar/recusar a sugestão sem bagunçar a
agenda que ele já montou. **A otimização em si roda no aparelho:** com ≤8 paradas, força bruta com
poda resolve em milissegundos. Nada de serviço de otimização de rota (US$/veículo/mês).

**Custo:** 1 chamada de Route Matrix por dia por prestador que usar o roteiro. Em ESCALA com 30%
de adesão: 300 prestadores × 22 dias = 6.600 chamadas/mês → **dentro dos 10.000 grátis. R$ 0.**
Mesmo com 100% de adesão (22.000): 12k × US$5/1k = US$60/mês ≈ R$ 324.

**Se a rede cair:** a agenda aparece na ordem que ele marcou, como hoje. O roteiro é um **botão
que some**, não uma tela que dá erro. Cachear o último roteiro calculado do dia resolve o caso
"calculou de manhã no wi-fi, saiu para a rua".

**Por que DEPOIS e não já:** roteiro com endereço não-geocodificado é roteiro errado, e endereço
errado é pior que endereço nenhum. Faz o 4.2 primeiro.

### 4.4. Vision API e Document AI — 🔴 NÃO ENTRA (e a razão é boa)

O caso de uso é ótimo (ler plaqueta, nota de peça, etiqueta de produto). **A ferramenta é que está
errada.** Comparando a mesma tarefa — foto da plaqueta de um split → campos preenchidos:

| Caminho | Custo por foto | O que devolve |
|---|---|---|
| **Vision API** (`TEXT_DETECTION`) | US$0,0015 (**R$ 0,008**) | Texto solto. Ainda precisa de uma segunda chamada de IA para virar campo. |
| **Document AI Form Parser** | US$0,030 (**R$ 0,16**) | Pares chave-valor de **formulário**. Plaqueta de ar-condicionado não é formulário. |
| **Gemini 2.5 Flash — já ligado** | ~US$0,0009 (**R$ 0,005**) | `{marca, modelo, serie, btus, tensao, gas}` já normalizado, já em pt-BR. |

O Gemini é **mais barato que o OCR puro** e devolve o resultado final em vez do insumo. Somando:
zero credencial nova, zero API nova, zero projeto novo — `worker/src/gemini.js` já aceita
`userParts` com `inline_data`, que é exatamente como o `/transcrever` manda áudio hoje
(`worker/src/index.js:608`). **A foto entra pelo mesmo cano do áudio.**

**Veredito: NÃO ENTRA Vision, NÃO ENTRA Document AI. ENTRA "foto → campos" via Gemini** — está
detalhado em 4.7, porque não é integração nova, é uso novo do que já existe.

### 4.5. Speech-to-Text — 🔴 NÃO ENTRA

O brief pediu para comparar com o Gemini que o app já usa. Comparei:

| | Preço/min | O que devolve |
|---|---|---|
| **Speech-to-Text V2** (tempo real) | US$0,016 → **R$ 0,086/min** | Texto transcrito. |
| **Gemini 2.5 Flash áudio** (hoje) | ~1.920 tokens/min × US$1,00/M = US$0,0019 → **R$ 0,010/min** | Transcrição **ou os itens do orçamento já estruturados**, conforme o `modo`. |

**8,6x mais caro para entregar menos.** O `/transcrever` atual (`worker/src/index.js:588`) já faz
o trabalho dos dois em uma chamada só. Trocar seria pagar mais para regredir.

*(Nota honesta: o Speech-to-Text tem uma vantagem real — streaming palavra-a-palavra enquanto o
cara fala, que o Gemini não dá do mesmo jeito. Se algum dia a Olli precisar transcrever ao vivo
durante a conversa, isso volta à mesa. Hoje o fluxo é gravar-e-enviar, então não pesa.)*

### 4.6. Text-to-Speech e Translate — 🔴 NÃO ENTRA

**TTS:** a tentação é "a Olli lê o orçamento em voz alta enquanto ele dirige". O problema não é
preço (Standard: 4M caracteres grátis/mês, depois US$4/M — barato). É que **ninguém pediu isso** e
o técnico não está dirigindo enquanto orça, está parado na frente do cliente. Voz **de entrada**
resolve mão suja; voz **de saída** resolve olho ocupado, que não é o problema dele. Fica no
"reavaliar se alguém pedir".

**Translate:** público 100% brasileiro falando português. US$20/M caracteres para traduzir do
pt-BR para o pt-BR. Não. (Reabre no dia que o OLLI for para fora, e aí o Gemini já traduz de
graça dentro das chamadas que já fazemos.)

### 4.7. Gemini multimodal — 🟢 ENTRA JÁ (não é API nova, é cano novo no mesmo tubo)

Já está pago, já está ligado, já está testado. Três usos novos, todos **P** de esforço porque
`gemini.js` já aceita imagem:

1. **Plaqueta do equipamento → cadastro** (PMOC/`equipamentos.ts` — hoje é o formulário mais
   odiado do app). ~R$ 0,005/foto.
2. **Nota fiscal da peça comprada → despesa lançada** (alimenta o financeiro da Onda 9).
3. **Etiqueta do produto químico → registro ANVISA no certificado de dedetização**
   (`src/utils/certificadoAnvisaPdf.ts` já existe e hoje exige digitação).

**Custo em ESCALA:** 1.000 prestadores × 10 fotos/mês × R$0,005 = **R$ 50/mês.** Cabe no sistema
de créditos que já existe (`worker/src/creditos.js`, `CUSTO`) sem inventar moeda nova.

**Se a rede cair:** todos os campos continuam editáveis à mão — a foto é atalho, nunca é a única
porta. E **os campos devem vir preenchidos mas revisáveis**, nunca salvos direto: número de série
lido errado numa plaqueta suja vira equipamento fantasma no PMOC do cliente.

⚠️ **Armadilha conhecida deste repo:** IA que não sabe ler tem que dizer "não consegui ler",
nunca devolver campo vazio como se a plaqueta estivesse em branco. É exatamente o bug recorrente
`olli-gate-erro-vira-vazio`. Três estados obrigatórios, igual ao `cnpj.ts`.

### 4.8. Calendar API — 🟡 ENTRA DEPOIS (100% pronto, travado em humano)

`src/services/googleAgenda.ts` está **completo** (PKCE S256, refresh, push e delete de evento) e
as APIs Calendar + People **já estão habilitadas**. Falta só o OAuth client Android
(console-only, exige o SHA-1 `44:93:1D:96:...:20:1E` e o pacote `online.olliorcamentos.app`) —
bloqueio **B3**. **Custo: zero.** Não é decisão de engenharia, é 10 minutos de console do dono.

---

## 5. FAMÍLIA B — APIs brasileiras

| API | Grátis? | Custo/limite real | Esforço | Veredito |
|---|---|---|---|---|
| **BrasilAPI — CNPJ** | ✅ | grátis, sem chave, fair-use | — | **JÁ ESTÁ** (`worker/src/index.js:444`) |
| **ViaCEP** | ✅ | grátis, sem chave | — | **JÁ ESTÁ** (`src/services/cep.ts`) |
| **Clima (Open-Meteo comercial)** | 💰 | **US$29/mês fixo**, 1M chamadas | **M** | 🟢 **ENTRA JÁ** |
| **NFS-e Nacional (deep-link preparado)** | ✅ | grátis (API do governo) | **M** | 🟢 **ENTRA JÁ** — prazo 01/09/2026 |
| **NFS-e Nacional (emissão direta pelo OLLI)** | ✅ API | grátis, mas exige custódia de certificado | **G** | 🔴 **NÃO ENTRA AINDA** (risco, não custo) |
| **Avaliação no Google (link direto, sem API)** | ✅ | **R$ 0** | **P** | 🟢 **ENTRA JÁ** |
| **Google Business Profile API** | ✅ | grátis, mas **quota 0 até aprovação manual** | G | 🟡 **ENTRA DEPOIS** |
| **BrasilAPI — CEP v2** | ✅ | grátis, agrega 4 fontes | P | 🟡 **ENTRA DEPOIS** (rede de segurança do ViaCEP) |
| **IBGE — municípios/UF** | ✅ | grátis | P | 🟡 **ENTRA DEPOIS** (dado estático, embutir) |
| **BrasilAPI — feriados nacionais** | ✅ | grátis | P | 🟡 **ENTRA DEPOIS** (barato e simpático) |
| **ReceitaWS** | ⚠️ | grátis: **3 consultas/min**; pago: R$149–699/mês | P | 🔴 **NÃO ENTRA** — BrasilAPI já resolve de graça |
| **CNPJ.ws / CNPJá** | ⚠️ | free tier apertado, pago | P | 🔴 **NÃO ENTRA** — mesma razão |
| **Tabela FIPE** | ✅ | grátis via BrasilAPI | P | 🔴 **NÃO ENTRA** — prestador não vende carro |
| **Correios (rastreio/frete)** | ❌ | **exige contrato** com os Correios | G | 🔴 **NÃO ENTRA** — prestador não despacha encomenda |
| **SINTEGRA** | ❌ | pago, por consulta | M | 🔴 **NÃO ENTRA** — dado de ICMS, não de ISS |
| **Pix / BACEN (DICT, Pix Automático)** | ❌ | só para instituição de pagamento autorizada | G | 🔴 **NÃO ENTRA** — não somos PSP |
| **WhatsApp Business Cloud API** | 💰 | ~R$0,04–0,05/utilidade · ~R$0,31–0,38/marketing | G | 🔴 **NÃO ENTRA** — o `wa.me` grátis resolve |
| **INMET (clima gov)** | ✅ | grátis, mas **API não documentada, sem SLA** | M | 🟡 **fallback** do item de clima, nunca primário |

### 5.1. Clima — 🟢 ENTRA JÁ (a de maior retorno do documento)

**Provedor escolhido: Open-Meteo, plano comercial.** Comparei três:

| Fonte | Preço | Problema |
|---|---|---|
| **Open-Meteo Free** | grátis, 10k/dia | ⛔ **licença é só uso NÃO-comercial.** O OLLI é SaaS pago. Usar seria violar o termo. |
| **Open-Meteo Standard** | **US$29/mês fixo**, 1M chamadas, endpoint dedicado, 99,9% | ✅ preço fixo, sem surpresa de fatura |
| **OpenWeather One Call** | 1.000 chamadas/dia grátis, depois por chamada | cobrança por chamada = fatura imprevisível |
| **INMET** | grátis, oficial | API não documentada, sem SLA, sem garantia de continuidade |

Fontes: https://open-meteo.com/en/pricing · https://open-meteo.com/en/licence ·
https://openweathermap.org/price

**Honestidade sobre o free tier:** existe a tentação de usar o Open-Meteo grátis "porque é só
consulta". A licença diz não-comercial e o OLLI cobra assinatura. **US$29/mês para o produto
inteiro** é barato demais para justificar o risco de termo de uso. Não vale.

**Custo real: US$29/mês ≈ R$ 157/mês, FIXO**, independente de ter 50 ou 5.000 prestadores. Com
1.000 prestadores consultando 2x/dia: 60.000 chamadas/mês — 6% da cota. E dá para reduzir mais
consultando **por cidade, não por prestador** (dez mil prestadores em São Paulo = 1 consulta).

**Esforço: M.** A consulta é trivial; o trabalho está em transformar previsão em **ação**:
- **Defensivo:** cruzar previsão de chuva com agendamentos externos do dia seguinte → aviso na
  véspera com botão "remarcar".
- **Ofensivo (o que vale dinheiro):** cruzar previsão de calor extremo com a base de clientes que
  têm equipamento sem manutenção há X meses → sugerir campanha. **A infraestrutura para isso já
  existe**: `src/services/radarClientes.ts`, `radarFollowUp.ts`, `radarCobranca.ts` e
  `ritualDiario.ts` já fazem exatamente esse tipo de varredura-e-sugestão. **É um radar novo na
  família de radares que já existe, não um sistema novo.** Isso derruba o esforço bastante.

⚠️ **Não é para todo ofício.** Chuva importa para elétrica externa, pintura, jardinagem,
telhado, dedetização de área externa. Calor importa para refrigeração. Para encanador de
apartamento, chove ou faz sol, o serviço acontece igual. **Tem que passar pelo gate de
`src/services/verticais.ts`** — senão vira notificação inútil, que é como se mata o valor de uma
notificação útil.

**Se a rede cair:** o aviso simplesmente não aparece. Previsão é conselho, não trava nada. Guardar
a previsão do dia em cache local na primeira consulta do dia cobre o caso "saiu para a rua".

### 5.2. Avaliação no Google **sem API** — 🟢 ENTRA JÁ

A ideia óbvia é integrar a Google Business Profile API para pedir e responder avaliações. **A
ideia boa é não integrar nada.**

Cada perfil do Google tem um link curto de avaliação (`g.page/r/<id>/review`) que abre a caixa de
5 estrelas direto. O prestador cola esse link **uma vez** no cadastro dele no OLLI, e o app passa
a oferecer "pedir avaliação" no momento certo — quando o serviço é marcado como concluído **e**
pago, que é o pico de satisfação do cliente e o instante em que ninguém se lembra de pedir.

| | Link direto | GBP API |
|---|---|---|
| Custo | **R$ 0** | grátis, mas… |
| Esforço | **P** — um campo no cadastro + botão | **G** |
| Bloqueio | nenhum | **quota 0 até aprovação manual do Google**; exige perfil verificado há 60+ dias, site válido, justificativa de uso |
| Funciona para quem não tem perfil no Google? | não (mas o campo fica vazio e o botão some) | não |

Fonte da trava de quota: https://developers.google.com/my-business/content/limits ·
https://xovionlabs.com/blog/google-business-profile-api-hidden-gate/

Para um prestador local, **nota no Google é o canal de aquisição**. Automatizar o *pedido* entrega
quase todo o valor; automatizar a *leitura e resposta* das avaliações (que é o que a API dá) é
refinamento — e o refinamento custa uma aprovação manual do Google que pode não vir.
**Veredito: link direto ENTRA JÁ; API ENTRA DEPOIS, e só se alguém pedir.**

### 5.3. WhatsApp Business Cloud API — 🔴 NÃO ENTRA

Vale detalhar porque parece óbvio que deveria entrar, e não deveria.

O OLLI já manda orçamento, recibo e cobrança por WhatsApp em ~15 telas, via deep-link `wa.me`.
Custo: **zero**. Sai do número pessoal do prestador, que é o número que o cliente conhece e
responde.

A Cloud API traria envio automático sem o prestador tocar no celular. Preço em Brasil, 2026:
~R$0,04–0,05 por mensagem de **utilidade**, ~R$0,31–0,38 por **marketing**
(https://www.socialhub.pro/blog/preco-whatsapp-api-2026-brasil/). E o modelo está **piorando**:
desde julho/2025 a cobrança é por mensagem, e há mudança anunciada para **1º de outubro de 2026**
tornando pagas também as mensagens de serviço e de utilidade dentro da janela de 24h
(https://www.aleguimas.com.br/blog/whatsapp-business-api-o-que-muda/ — confirmar na
https://developers.facebook.com/docs/whatsapp/pricing/, que ainda não reflete essa mudança).

Mas o custo nem é o pior. **O pior é o número.** Migrar um número para a Cloud API tira ele do
WhatsApp normal do celular. O prestador autônomo **usa o mesmo número para tudo** — é o número
dele. Pedir que ele sacrifique isso para o OLLI mandar mensagem automática é pedir a coisa errada
para a pessoa errada. E o valor entregue seria... uma mensagem que ele hoje manda com dois toques.

**Veredito: NÃO ENTRA.** Reavaliar **só** quando existir cliente Empresa com número comercial
dedicado e volume que justifique. Aí vira feature de plano Empresa, não do app.

### 5.4. CNPJ — o que já temos e a única melhoria que vale

Já está em produção e bem feito (cache 30 dias, 4 estados, rate limit). As alternativas pagas
(ReceitaWS R$149–699/mês, CNPJ.ws, CNPJá) **não entram** — a BrasilAPI entrega o mesmo dado de
graça, e ReceitaWS grátis é 3 consultas/minuto, o que quebraria no primeiro pico.
Fonte: https://developers.receitaws.com.br/

**A melhoria que vale (esforço P):** o CNAE que já vem na resposta é usado só para deduzir a
vertical. Ele também diz **porte** e **MEI sim/não** — e a partir de setembro isso determina o
regime de NFS-e do cliente. O dado já está na mão (`EmpresaCnpj.porte`, `EmpresaCnpj.mei` em
`src/services/cnpj.ts`), só não está sendo usado para nada além do cadastro.

**Rede de segurança (esforço P, ENTRA DEPOIS):** hoje BrasilAPI fora do ar = cadastro por CNPJ
fora do ar. O `cnpj.ts` trata isso com elegância (`indisponivel`, nunca "não existe"), então nada
quebra. Mas a BrasilAPI é mantida pela comunidade, sem SLA. Vale ter um segundo provedor atrás
dela **no worker** — o app não precisa saber. Só não é urgente.

### 5.5. ViaCEP, IBGE, feriados — 🟡 ENTRA DEPOIS, tudo P e grátis

- **BrasilAPI CEP v2** como fallback do ViaCEP: agrega várias fontes, cobre CEP novo que o ViaCEP
  ainda não tem. Grátis. Encaixa em `src/services/cep.ts` sem mudar a interface.
- **IBGE municípios/UF**: dado **estático**. Não integre API para isso — **baixe uma vez, embuta
  um JSON no app.** 5.570 municípios cabem em poucas centenas de KB e funcionam **offline**, que
  é o que importa para este público. API para dado que não muda é dependência de rede de graça.
- **Feriados nacionais (BrasilAPI)**: barato, simpático, evita agendar serviço em 7 de setembro.
  Mesma regra: baixa o ano inteiro de uma vez e guarda. Feriado **municipal** a BrasilAPI não
  cobre — e é justamente o que mais atrapalha o prestador. Honestidade: resolve 60% do problema.

### 5.6. NFS-e Nacional — a verdade completa sobre a dificuldade

O brief pediu: *"NFS-e é um pesadelo: diga a verdade sobre a dificuldade"*. A verdade em três
camadas, porque a resposta mudou em abril de 2026.

**Camada 1 — o pesadelo antigo acabou (para o nosso público).** Não são mais 5.570 webservices.
MEI, ME e EPP do Simples passam a emitir **exclusivamente pelo Emissor Nacional**, web ou API.
Uma integração, federal, gratuita, documentada
(https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/). Para empresa fora do Simples o
pesadelo continua — mas essa não é a base do OLLI.

**Camada 2 — o novo problema não é técnico, é de custódia.** A API exige **certificado digital
ICP-Brasil e-CNPJ A1** para gerar o token de acesso. Para o OLLI emitir *pelo* prestador, o OLLI
teria que **guardar o arquivo `.pfx` e a senha de cada cliente**. Isso é guardar a assinatura
digital de milhares de empresas. Um vazamento não é "vazou dado de cliente" — é **alguém pode
assinar documento fiscal como aquela empresa**. Custódia de certificado é um negócio inteiro,
com seguro e auditoria. Não é uma feature de sprint.

**Camada 3 — a versão que entrega o valor sem o risco (🟢 ENTRA JÁ, esforço M):**

> O OLLI **prepara** a nota, não a emite. Terminou e recebeu o serviço, o app monta o conjunto
> completo (tomador, CPF/CNPJ, endereço, discriminação do serviço, valor, código de tributação
> nacional sugerido pelo CNAE que já temos) e leva o prestador ao Emissor Nacional com tudo
> conferível. Ele revisa e assina. **Zero certificado guardado, zero responsabilidade fiscal do
> OLLI, e ele para de redigitar o que já digitou.**

Isso captura a maior parte da dor (o retrabalho e o esquecimento) sem nenhuma das
responsabilidades. **E ainda tem um efeito colateral valioso: o app passa a saber quais serviços
já geraram nota e quais não**, que é meio caminho do "meu contador me pede isso todo mês".

Para MEI é ainda mais suave: MEI entra no Emissor Nacional com **conta gov.br, sem certificado**
(https://www.nfse.gov.br/EmissorNacional).

**Se a rede cair:** o serviço, o recibo e o pagamento continuam funcionando como hoje — nota é
etapa posterior, sempre foi. Marcar "nota pendente" e lembrar depois é melhor que travar o
fechamento do serviço.

⚠️ **Regra da casa que continua valendo:** `docs/INTEGRATION_BACKLOG.md` diz, citando a pesquisa
§15, que é **proibido emitir nota antes de financeiro e status estarem sólidos**. A versão
"preparar + deep-link" **não viola isso** — ela não emite. A versão "emitir de verdade" viola, e
segue proibida até a Onda 9 fechar.

---

## 6. Ranking por (valor pro prestador) ÷ (esforço + custo)

| # | O quê | Valor | Esforço | Custo/mês em escala | Índice |
|---|---|---|---|---|---|
| 1 | **Clima → radar de chuva e de calor** | altíssimo (gera receita) | M | **US$29 fixo** | 🥇 |
| 2 | **Places Autocomplete no endereço** | alto (dor diária) | P/M | R$ 460 (R$0,46/prestador) | 🥈 |
| 3 | **Foto da plaqueta → cadastro (Gemini)** | alto | P | R$ 50 | 🥉 |
| 4 | **Pedir avaliação no Google (link)** | alto (aquisição) | P | **R$ 0** | 4 |
| 5 | **NFS-e preparada + deep-link** | alto **e com prazo legal** | M | **R$ 0** | 5 |
| 6 | **Calendar API (destravar B3)** | médio | P (humano) | **R$ 0** | 6 |
| 7 | **Roteiro do dia (Route Matrix)** | alto | M | R$ 0–324 | 7 |
| 8 | Feriados + IBGE embutidos | baixo | P | R$ 0 | 8 |
| 9 | Fallback CNPJ e CEP no worker | seguro, não visível | P | R$ 0 | 9 |
| 10 | GBP API (ler/responder avaliações) | médio | G (aprovação Google) | R$ 0 | 10 |

**Soma de tudo que é "ENTRA JÁ" em escala de 1.000 prestadores: ~R$ 670/mês.** Menos de
**R$ 0,70 por prestador por mês**. Nenhuma destas decisões é sobre dinheiro — todas são sobre
tempo de engenharia e sobre não quebrar o que funciona.

---

## 7. O que NÃO fazer — e por quê

Um documento que só diz "vamos fazer tudo" é inútil. Estas ficam de fora **de propósito**:

1. **Vision API e Document AI.** O Gemini que já pagamos faz melhor e mais barato. Ligar seria
   pagar por um passo intermediário que não queremos. *(4.4)*
2. **Speech-to-Text.** 8,6x mais caro que o Gemini atual e devolve menos. *(4.5)*
3. **Text-to-Speech e Translate.** Resolvem problemas que este público não tem. *(4.6)*
4. **Address Validation.** US$17/1.000 (6x o autocomplete) para validar endereço que o
   autocomplete já entregou correto. O ganho marginal não paga. *(4.0)*
5. **WhatsApp Business Cloud API.** Custa dinheiro, tira o número pessoal dele do WhatsApp
   normal, e substitui algo que hoje funciona de graça com dois toques. *(5.3)*
6. **ReceitaWS / CNPJ.ws / CNPJá.** R$149–699/mês por dado que a BrasilAPI dá de graça. *(5.4)*
7. **Correios.** Exige contrato e o prestador de serviço não despacha encomenda. Se um dia houver
   venda de peça com envio, reabre.
8. **Tabela FIPE.** Bonito, inútil aqui. Prestador não negocia veículo dentro do OLLI.
9. **SINTEGRA.** É consulta de ICMS. Serviço é ISS. Erro de categoria.
10. **Pix/BACEN direto (DICT, Pix Automático).** Exige ser instituição autorizada pelo BACEN. Já
    existe decisão do dono pelo Mercado Pago, e o `pixBrCode.ts` já cobre o Pix estático offline.
11. **Emitir NFS-e diretamente pelo OLLI (v1).** Não pelo XML — pela custódia de certificado
    digital de milhares de empresas. Risco desproporcional ao ganho sobre a versão deep-link. *(5.6)*
12. **API do IBGE em runtime.** Dado estático. Embutir JSON e funcionar offline é melhor em todos
    os eixos. *(5.5)*
13. **Open-Meteo no plano gratuito.** Licença não-comercial; o OLLI cobra assinatura. US$29/mês
    resolve legalmente. *(5.1)*

---

## 8. Regras que valem para TODA integração desta lista

Não são burocracia — são os bugs que este repo já teve.

1. **Três estados, nunca dois.** `ok` / `não tem` / **`não sei`**. O `src/services/cnpj.ts` é o
   modelo (`ok`/`nao_encontrado`/`invalido`/`indisponivel`). Tratar "não sei" como "não tem" é o
   bug recorrente `olli-gate-erro-vira-vazio` — concede acesso e apaga dado.
2. **Chave paga nunca no bundle.** Places, Route Matrix e qualquer coisa nova entram por rota do
   worker, como `/eta`, `/geocodificar` e `/cnpj` já fazem. Chave no app = chave pública.
3. **Rate limit ANTES do fetch pago.** Padrão de `handleEta` (`worker/src/index.js:369`): o
   limite roda antes de a request custar dinheiro. Sem isso, uma API paga é ilimitada por conta.
4. **Rede caída nunca é beco sem saída.** Toda integração aqui é atalho de algo que já dá para
   fazer à mão. Se ela some, some o **botão** — não aparece tela de erro.
5. **Cache agressivo.** O `/cnpj` cacheia 30 dias. Clima cacheia por cidade/dia. Endereço
   resolvido cacheia para sempre. Cada acerto de cache é dinheiro e é resiliência.
6. **Gate por vertical.** `src/services/verticais.ts` decide quem vê o quê. Alerta de chuva para
   encanador de apartamento é ruído, e ruído mata a atenção do alerta que importa.
7. **Alerta de orçamento no Google Cloud.** Já existe (teto 50). **Toda API nova habilitada no
   projeto tem que ser revisada contra esse teto** — a conta hoje só aguenta Routes/Geocoding.
8. **Nenhuma tela chama API externa direto.** Regra do `INTEGRATION_BACKLOG.md`:
   UI → caso de uso → porta (`src/services/ports/`) → adaptador → API. As portas `MapsProvider`,
   `RoutingProvider`, `CalendarProvider` e `FiscalProvider` já existem vazias esperando isso.

---

## 9. Ações que não são código (para o dono, não para o enxame)

1. **Habilitar Places API** no projeto `olli-orcamentos` e ampliar a restrição da chave
   `OLLI_ROUTES_API_KEY` (ou criar uma segunda). ~2 minutos, billing já ligado.
2. **Assinar Open-Meteo Standard** (US$29/mês). Cartão.
3. **Criar o OAuth client Android** (bloqueio B3) — libera Google Agenda, que já está pronto.
   Pacote `online.olliorcamentos.app`, SHA-1 `44:93:1D:96:77:A6:24:40:26:F3:87:2B:AC:71:AC:91:38:88:20:1E`.
4. **Decidir sobre NFS-e antes de 1º de setembro.** Não é decisão técnica — é decisão de produto,
   e tem data.
5. *(edição de doc, não de código)* **Remover "Nuvem Fiscal" do `INTEGRATION_BACKLOG.md`** e
   marcar o bloqueio **B4 (billing Google) como resolvido desde 2026-07-10** — ele está travando
   as portas MAPS e ROUTING no papel sem estar travando nada na realidade.

---

## 10. Fontes

**Google:**
https://developers.google.com/maps/billing-and-pricing/pricing ·
https://developers.google.com/maps/documentation/places/web-service/session-pricing ·
https://cloud.google.com/vision/pricing ·
https://cloud.google.com/document-ai/pricing ·
https://cloud.google.com/speech-to-text/pricing ·
https://cloud.google.com/text-to-speech/pricing ·
https://cloud.google.com/translate/pricing ·
https://ai.google.dev/gemini-api/docs/pricing ·
https://developers.google.com/my-business/content/limits

**Brasil / fiscal:**
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional ·
https://www.contabeis.com.br/noticias/76438/nfs-e-nacional-sera-obrigatoria-para-me-e-epp-do-simples-nacional/ ·
https://www.nfse.gov.br/EmissorNacional ·
https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/ ·
https://www.nuvemfiscal.com.br/ (aviso de desativação) ·
https://developers.receitaws.com.br/ ·
https://www.correios.com.br/atendimento/developers

**Clima e mensageria:**
https://open-meteo.com/en/pricing · https://open-meteo.com/en/licence ·
https://openweathermap.org/price · https://portal.inmet.gov.br/ ·
https://developers.facebook.com/docs/whatsapp/pricing/ ·
https://www.socialhub.pro/blog/preco-whatsapp-api-2026-brasil/

**Código lido:** `src/services/{cnpj,cep,equipamentos,googleAgenda,verticais,radarClientes}.ts` ·
`src/services/ports/{MapsProvider,FiscalProvider}.ts` · `src/utils/pixBrCode.ts` ·
`worker/src/{index,gemini,voz,creditos}.js` · `docs/INTEGRATION_BACKLOG.md`
