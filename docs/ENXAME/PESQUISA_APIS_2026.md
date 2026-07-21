# PESQUISA DE APIs — 2026

> Pesquisa web feita em **2026-07-20/21**. Código conferido por `grep` antes de cada proposta.
> Câmbio do dia: **US$ 1 = R$ 5,11** ([Investing.com, 20/07/2026](https://br.investing.com/currencies/usd-brl)).
> Arredondo para **R$ 5,15** em toda conta abaixo — se o dólar subir, a conta ainda fecha.
>
> **Este documento não repete o `APIS_E_INTEGRACOES.md`.** Aquele é o inventário. Este é a
> pesquisa que **testa** o inventário contra a fonte primária — e em quatro pontos ele muda.
> Onde os dois divergirem, **vale este**, porque aqui tem URL e data.

---

## 0. Como ler, e o filtro que descarta a maioria das ideias

Cada proposta tem cinco linhas obrigatórias:

- **Resolve o quê, pro prestador** — em português, sem jargão.
- **Esforço** — **P** (≤1 dia) · **M** (2–5 dias) · **G** (semanas, ou envolve risco jurídico/passo humano).
- **Custo em R$** — hoje (~0 pagantes) e em escala (1.000 prestadores, 6 notas e 20 atendimentos/mês cada).
- **Sem rede** — o app é offline-first, de campo. O que some, o que quebra, o que continua.
- **Veredito** — ENTRA JÁ / ENTRA DEPOIS / NÃO ENTRA.

E um filtro que mata mais ideia do que qualquer análise de custo:

> **O dono é uma pessoa só, sem equipe, sem aporte, com ZERO usuários pagantes.**
> Proposta que exige manutenção contínua, aprovação de terceiro que pode não vir, ou
> mensalidade fixa antes do primeiro real de receita — **é proposta morta.** Onde for o caso,
> está escrito.

---

## 1. QUATRO FATOS QUE A PESQUISA MUDOU

### 1.1. A Resolução CGSN nº 189/2026 é **REAL**. Confirmada. ✅

O brief pediu: *"o projeto tem uma nota sobre a Res. CGSN 189/2026 que eu NUNCA confirmei —
confirme ou desminta com fonte oficial."*

**Confirmada.** Publicada em **28/04/2026**. A partir de **1º de setembro de 2026**, ME e EPP
optantes do Simples Nacional prestadoras de serviço sujeito a ISS **são obrigadas** a emitir
NFS-e de padrão nacional, **exclusivamente pelo Emissor Nacional — modalidade web OU API**.
A norma ainda **veda** a ME/EPP emitir NFS-e em operação sujeita só a ICMS.

Notícia oficial do **Ministério da Fazenda**:
https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/abril/nota-fiscal-de-servico-eletronica-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional
· notícia da **Receita Federal**:
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional
· nota técnica do **CRC-CE** (conselho profissional, 05/2026):
https://www.crc-ce.org.br/2026/05/nota-tecnica-sobre-a-resolucao-cgsn-no-189-2026-e-a-obrigatoriedade-da-nfs-e-de-padrao-nacional-para-optantes-do-simples-nacional/

⚠️ **Honestidade sobre o método:** as duas páginas do gov.br respondem *"Conteúdo Restrito"*
para leitor automatizado — eu **não** li o corpo delas diretamente. O que confirma o fato são
os títulos oficiais dessas URLs somados a três fontes profissionais independentes que citam a
mesma resolução, a mesma data de publicação e a mesma data de vigência. **Antes de virar copy
pública, alguém abre a
[Resolução no site do Simples Nacional](http://www8.receita.fazenda.gov.br/SimplesNacional/Legislacao/)
no navegador.** É uma tarde de trabalho ser processado por propaganda enganosa fiscal.

**Desmentido junto:** o `APIS_E_INTEGRACOES.md` §2.2 cita, com "menor confiança", uma data de
01/08/2026 para autônomos e liberais. **Não encontrei nenhuma fonte que sustente isso.** A data
que aparece em toda fonte séria é **01/09/2026, e só ela**. Tirar do documento.

### 1.2. Clima **não precisa custar US$ 29/mês**. Existe free tier com licença comercial.

O `APIS_E_INTEGRACOES.md` §5.1 e §11.5 concluem que clima está bloqueado no cartão do dono,
porque o free tier do Open-Meteo proíbe uso comercial. **A premissa está certa; a conclusão,
não** — o erro foi comparar só três provedores.

O **Visual Crossing** dá **1.000 registros por dia no plano gratuito, com licença de uso
comercial explícita**. Nas palavras deles: *"Yes! Developers and businesses can begin building
applications using the free plan and upgrade later as usage grows."*
E — o detalhe que decide — **uma consulta de previsão de 15 dias conta como UM registro**, não
quinze.
Fontes: https://www.visualcrossing.com/resources/documentation/visual-crossing-weather-free-plan-free-weather-data-for-analysts-and-api-developers/
· https://www.visualcrossing.com/weather-data-pricing/ (lidas em 20/07/2026)

Open-Meteo confirmado como antes, para registro: free = **300.000 chamadas/mês, "Commercial
use ❌"**; Standard = **US$ 29/mês** (≈ R$ 149), 1M chamadas, comercial ✅.
https://open-meteo.com/en/pricing (lida em 20/07/2026)

**O que isso faz com a conta:** consultando **por cidade, uma vez por dia** (que é o desenho
certo — mil prestadores em São Paulo são uma consulta, não mil), 1.000 registros/dia cobrem
**1.000 cidades distintas por dia**. O OLLI não terá 1.000 cidades tão cedo. **Clima passa de
"US$ 29/mês travado no cartão do dono" para R$ 0,00 e nenhum passo humano.**

### 1.3. WhatsApp: o argumento principal contra ele **morreu**. O veredito continua NÃO.

O `APIS_E_INTEGRACOES.md` §5.3 rejeita a Cloud API com este raciocínio: *"Migrar um número para
a Cloud API tira ele do WhatsApp normal do celular."*

**Isso deixou de ser verdade em maio de 2025.** A Meta lançou o **Coexistence**: o mesmo número
fica ativo no app do WhatsApp Business **e** na Cloud API ao mesmo tempo, com espelhamento das
mensagens por webhook nos dois sentidos e importação de até 6 meses de histórico. Na
documentação oficial da Meta:

> *"Solution providers can onboard WhatsApp Business app users via Embedded Signup (aka
> 'Coexistence'). These clients can connect their existing WhatsApp Business app account and
> phone number to Cloud API, allowing them to use your app to message at scale **while still
> using the WhatsApp Business app for one-to-one conversations**."*
> — https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview

**Um detalhe que muda quem pode usar:** Coexistence é com o **app WhatsApp Business**, não com
o WhatsApp comum. Boa parte do público do OLLI usa o WhatsApp comum, do número pessoal. Para
esses, migrar continua sendo mudança de app.

O veredito segue NÃO — mas **por outro motivo, e o motivo novo é mais forte**. Ver §3.2.

### 1.4. 🚨 **O `SignatureProvider.ts` do repo aponta para software AGPL-3.0.** Armadilha jurídica.

Isto não é proposta. É um achado no código, e é o mais grave deste documento.

`src/services/ports/SignatureProvider.ts`, linha 12, escrito e commitado:

```
 * Provider escolhido: Documenso (open-source, campos de assinatura, webhooks,
 * certificado) para documentos juridicamente relevantes / múltiplos signatários
```

**O Documenso Community Edition é licenciado sob AGPL-3.0.** Não MIT, não Apache. AGPL.

O que a AGPL-3.0 **exige** (cláusula de rede, §13): se você **modifica** o software e o
disponibiliza **por rede** para usuários, é obrigado a oferecer a esses usuários o
**código-fonte completo da sua versão modificada**, sob AGPL-3.0. Não basta não distribuir
binário — servir por HTTP já dispara a obrigação.

E a própria Documenso diz, na página de licenças, que a licença comercial existe justamente
para quem quer *"build proprietary products, integrate Documenso into commercial software
without releasing source code, offer SaaS with modifications, or keep modifications private"*.
https://docs.documenso.com/docs/policies/licenses · https://docs.documenso.com/users/licenses/community-edition
(lidas em 20/07/2026)

**Traduzindo para o OLLI:** o OLLI é um SaaS pago, fechado. Se alguém, um dia, seguir esse
comentário e subir um Documenso adaptado dentro da infra do OLLI, **a leitura mais provável da
AGPL é que o OLLI passa a dever o código-fonte dessa parte a quem usar o serviço.** Existe zona
cinzenta (usar 100% sem modificar, em processo separado, é discutível), e é exatamente por isso
que é armadilha: a decisão errada não dá erro de compilação, dá processo três anos depois.

**Ação (é edição de comentário, 30 segundos, e eu sou read-only):** trocar a linha "Provider
escolhido: Documenso" por **"Provider: A DECIDIR. ⚠️ Documenso é AGPL-3.0 — inviável em produto
fechado sem licença comercial paga."** Enquanto essa linha estiver lá, ela é uma instrução para
o próximo agente ou para o próprio dono às duas da manhã.

Alternativas de licença segura, se um dia essa porta for fiada, estão na §3.4.

---

## 2. CONFERIDO NO CÓDIGO (grep, não memória)

**Existe e está em produção** — não proponho nada disso como novo:
CNPJ (BrasilAPI via `worker/src/index.js:847`) · CEP (`worker/src/brasil.js` + `src/services/cep.ts`) ·
feriados calculados sem rede (`/feriados/:ano`) · ETA com trânsito e geocodificação (Google Routes,
`/eta`, `/eta/saida`, `/geocodificar`) · IA Gemini (diagnóstico, voz→orçamento, chat, transcrição —
`worker/src/gemini.js`, `voz.js`) · Stripe (`worker/src/stripe.js`) · Mercado Pago Pix
(`worker/src/mercadopago.js`) · Pix BR Code offline (`src/utils/pixBrCode.ts`) · Sentry ·
Supabase · deep-link `wa.me` (**9 arquivos**, custo zero) · catálogo de serviços do próprio
prestador com preço, já alimentando a IA (`src/services/olliAssistente.ts:104`, `vozNuvem.ts:106`).

**Existe mas está DESLIGADO:** e-mail transacional Resend (`worker/src/email.js`) — inerte sem
`RESEND_API_KEY`, por desenho. Volta na §3.5.

**NÃO existe, conferido:**
- **Endpoint de clima.** O brief diz *"Há um endpoint de clima no worker (confira)"*. **Não há.**
  `grep -riE "clima|weather|open-meteo|openweather" worker/src` → **zero linhas.** As únicas
  ocorrências de "clima" no repo são a NBR 7229 da fossa séptica (`calculosOficio.ts:757`) e o
  placeholder "Clima Frio Refrigeração" do onboarding. O que existe é a **decisão escrita** de
  não escrever esse endpoint enquanto dependesse de assinatura (`APIS_E_INTEGRACOES.md` §11.5).
  Com a §1.2 acima, essa dependência acabou.
- Emissão fiscal: `FiscalProvider.ts` é **interface pura, sem implementação**. Nada a desfazer.
- Cobrança recorrente automática: o `/mp/plano/pix` é **Pix avulso de N meses**. O `preapproval`
  do Mercado Pago está no código **só para cancelar assinaturas legadas**
  (`worker/src/mercadopago.js:277-287`). **Hoje o prestador tem que lembrar de pagar o OLLI todo
  mês, na mão.** Isso volta, e é sério, na §3.5.
- Boleto: uma menção em comentário no `stripe.js`. Não existe.

---

## 3. ITEM POR ITEM

### 3.1. NFS-e — a única coisa deste documento com **data marcada em lei**

**A dor, sem romantizar:** o prestador termina o serviço, recebe, marca como pago no OLLI — e
depois abre o navegador e redigita no gov.br o nome, o CPF, o endereço, o valor e a descrição
que **já estão no OLLI**. Em 1º de setembro isso deixa de ser chatice e vira obrigação legal
para praticamente toda a base (MEI, ME e EPP do Simples).

**O bloqueio técnico real, confirmado:** a API do Emissor Nacional exige **certificado ICP-Brasil
A1 ou A3, com assinatura do XML e mTLS (TLS mútuo) na conexão**. Não há login e senha.
https://www.notaas.com.br/blog/post/api-nfse-nacional-guia-integracao-tech ·
manual oficial: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf

**E o detalhe que salva o MEI:** pelo **portal web**, o MEI entra com **conta gov.br nível prata
ou ouro, sem certificado nenhum**. O certificado só é exigido no caminho de API.
https://www.notaas.com.br/blog/post/emitir-nota-fiscal-de-servico-gratuitamente-passo-a-passo-nfs-e-mei-portal-nacional
· https://waygo.com.br/blog/nfse/nfse-mei-2026-guia-completo/

Ou seja: **o caminho que não exige certificado é exatamente o caminho que o OLLI pode usar hoje.**

#### Provedores de API — preços que eu li na página deles, hoje

| Provedor | Preço | CNPJs | Notas | Extra | Serve de base pro OLLI? |
|---|---|---|---|---|---|
| **Focus NFe — Solo** | **R$ 89,90/mês** | 1 | 100 | R$ 0,10 | ❌ é plano do prestador, não do SaaS |
| **Focus NFe — Start** | **R$ 113,90/mês** | 3 (+R$37,90 cada) | 100/CNPJ | R$ 0,10 | ❌ não escala |
| **Focus NFe — Growth** | **R$ 548,00/mês** | **ilimitados** | 4.000 | **R$ 0,12** | ✅ **único modelo multi-tenant com preço público** |
| **NFE.io — Base/Escala** | R$ 190 a R$ 375/mês | ilimitados | 250 a 1.000 | não publicado | 🟡 teto de 1.000 notas |
| **eNotas — Básico/Plus/Pro** | R$ 137 / 247 / 347 | **1 por assinatura** | 50 / 500 / ilim. | — | ❌ **um CNPJ por assinatura mata a ideia** |
| **PlugNotas** | **não publica preço** | — | — | — | ❌ preço sob consulta = não dá pra decidir |
| **Nuvem Fiscal** | — | — | — | — | ☠️ **SERVIÇO DESATIVADO EM 31/07/2026** |

Fontes: https://focusnfe.com.br/precos/ · https://nfe.io/precos/emissao-nfse/ ·
https://enotass.com.br/notas · https://plugnotas.com.br/ (todas lidas em 20/07/2026) ·
desativação da Nuvem Fiscal: https://www.nuvemfiscal.com.br/

**A conta do Focus Growth**, que é a única que faz sentido discutir:

| Cenário | Notas/mês | Custo | Por prestador |
|---|---|---|---|
| **HOJE** (zero pagantes) | ~0 | **R$ 548/mês** | **infinito** |
| 100 prestadores × 6 notas | 600 | R$ 548/mês | R$ 5,48 |
| 1.000 prestadores × 6 notas | 6.000 | R$ 548 + 2.000×0,12 = **R$ 788** | **R$ 0,79** |

Em escala é barato. **Hoje é R$ 548/mês de prejuízo puro, todo mês, com zero receita entrando.**
Para uma pessoa sem aporte, isso é a diferença entre continuar e parar.

#### As duas versões, e qual entra

**(a) OLLI PREPARA a nota e leva ao Emissor Nacional — 🟢 ENTRA JÁ**
O app monta tudo (tomador, CPF/CNPJ, endereço, discriminação, valor, código de tributação
sugerido a partir do CNAE que o `/cnpj` já devolve), copia para a área de transferência num
formato colável e abre o Emissor Nacional. Ele confere e assina.
- **Resolve:** o retrabalho e o esquecimento. E o app passa a **saber** quais serviços já viraram
  nota e quais não — que é metade do "meu contador me cobra isso todo mês".
- **Esforço: M.** O grosso é a tela de conferência, não a integração (não há integração).
- **Custo: R$ 0.** Nem provedor, nem certificado, nem responsabilidade fiscal.
- **Sem rede:** a nota fica marcada como **pendente**, o serviço fecha normal. Nota sempre foi
  etapa posterior. Travar o fechamento do serviço por causa da nota seria o pior desenho possível.
- ⚠️ Respeita a regra da casa (`docs/INTEGRATION_BACKLOG.md`): *proibido emitir nota antes de
  financeiro e status estarem sólidos*. **Preparar não é emitir.** Não viola.

**(b) OLLI EMITE pelo prestador via Focus NFe — 🔴 NÃO ENTRA (ainda)**
Três razões, em ordem de peso:
1. **R$ 548/mês fixos antes do primeiro pagante.** Sozinho já bastaria.
2. **Custódia de certificado.** Guardar o `.pfx` e a senha de milhares de empresas não é
   feature — é um negócio paralelo, com seguro e auditoria. O provedor guarda por você, mas a
   **responsabilidade contratual com o prestador continua sendo do OLLI**.
3. **Suporte fiscal é atendimento humano contínuo.** Nota rejeitada por código de tributação
   errado vira ligação de prestador irritado no sábado. **Uma pessoa só não sustenta isso.**

**Reabre quando:** houver ~150 pagantes E o financeiro da Onda 9 estiver fechado. Aí R$ 548
vira R$ 3,65 por cliente e existe alguém pagando pelo suporte.

---

### 3.2. WhatsApp Cloud API — 🔴 **NÃO ENTRA**, e agora com o motivo certo

**Preço real, 2026** (Meta cobra por mensagem desde 01/07/2025; a partir de 01/07/2026 há opção
de faturamento em BRL, com migração obrigatória até 30/06/2027):

| Categoria | Tarifa Meta (Brasil) | Em R$ |
|---|---|---|
| **Serviço** (resposta dentro de 24h da mensagem do cliente) | **US$ 0,00 — grátis, sem teto** | **R$ 0** |
| **Utilidade** (1as 1.000/mês) | US$ 0,0068 | ~R$ 0,035 |
| **Marketing** | US$ 0,0625 | ~R$ 0,32 |
| BSP (Twilio, Zenvia, 360dialog…) | +US$ 0,003 a 0,010 por mensagem | +R$ 0,02 a 0,05 |

Fontes: https://developers.facebook.com/docs/whatsapp/pricing/ ·
https://whautomate.com/whatsapp-business-api-pricing-brazil ·
https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil (lidas em 20/07/2026)

Corrige o `APIS_E_INTEGRACOES.md` §5.3 em dois pontos: **conversa de serviço é grátis** (não é
"R$0,04–0,05 tudo") e o modelo é **por mensagem** desde julho/2025, não por conversa. O ajuste
anunciado para **01/10/2026** existe e está no changelog da Meta como *"market-specific rate
adjustments"* — **não** como "acabou o grátis da janela de 24h", que é o que o inventário
supunha. Corrigir.

**Mesmo assim: NÃO ENTRA.** O motivo velho caiu (§1.3), o motivo novo é maior:

Para o **OLLI** mandar mensagem em nome de **cada prestador**, o OLLI precisa virar **Tech
Provider / Solution Partner da Meta**: verificação de negócio, implementar o **Embedded Signup**,
submeter e manter **templates aprovados por categoria**, absorver reprovação de template,
gerenciar linha de crédito e repasse, e responder por qualidade de número
(https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview).

**Isso não é uma integração. É um segundo produto, com operação própria e fila de aprovação de
terceiro.** Para uma pessoa só, sem equipe, é o item de manutenção mais caro que existe nesta
lista — e substitui algo que **hoje funciona de graça em 9 telas com dois toques**.

Há ainda uma pedra específica do Brasil: em 2026 a Meta mantém **restrição temporária de
mensagem entre países envolvendo o Brasil** — WABA fora do Brasil não fala com número
brasileiro. Não bloqueia (a operação é toda nacional), mas é uma peça móvel a mais numa
plataforma que já muda regra a cada seis meses.

**Reavaliar só quando** existir cliente Empresa com número comercial dedicado, volume de
notificação que o dono não consiga mandar na mão, e receita que pague um BSP. Aí é feature de
plano Empresa. **Não é infraestrutura do app.**

---

### 3.3. CLIMA — 🟢 **ENTRA JÁ**, e agora custa R$ 0,00

O endpoint **não existe** (§2). O que existe é a decisão de não escrevê-lo enquanto ele
dependesse do cartão do dono. **Essa dependência acabou** (§1.2).

**Provedor: Visual Crossing, plano gratuito — 1.000 registros/dia, licença comercial explícita.**

| Provedor | Free tier | Comercial no free? | Pago |
|---|---|---|---|
| **Visual Crossing** | **1.000 registros/dia** | ✅ **SIM, explícito** | metered, pay-as-you-go |
| Open-Meteo | 300k chamadas/mês | ❌ **NÃO** ("non-commercial") | US$ 29/mês (≈ R$ 149) fixo |
| OpenWeather One Call | 1.000 chamadas/dia | ⚠️ limitado, com atribuição | por chamada |
| INMET | grátis, oficial | — | **API não documentada, sem SLA** |

**Desenho que faz a conta fechar: uma consulta por CIDADE por dia, cacheada, não por prestador.**
Mil prestadores em São Paulo = **1 chamada**. Com 300 cidades distintas, são 300 dos 1.000
registros diários. Sobra folga de 3x.

**Duas features, mesma chamada:**
- **Defensiva (chuva):** previsão de chuva amanhã cruzada com agendamentos externos → aviso na
  véspera com botão "remarcar". Ele para de descobrir dirigindo debaixo d'água.
- **Ofensiva (calor), que é a que dá dinheiro:** 36 °C previstos por três dias → *"você tem 41
  clientes com ar-condicionado sem limpeza há mais de 8 meses — quer mandar mensagem hoje?"*.
  Onda de calor é quando o telefone do técnico de refrigeração toca sozinho. Quem avisa **antes**
  pega a agenda cheia.

**Esforço: M**, e menor do que parece — **a infraestrutura de varrer-e-sugerir já existe**:
`src/services/radarClientes.ts`, `radarFollowUp.ts`, `radarCobranca.ts` e `ritualDiario.ts` fazem
exatamente esse tipo de rotina. É **mais um radar na família**, não um sistema novo.

**Custo:** **R$ 0** hoje e em escala razoável. Se um dia estourar 1.000 cidades/dia, o degrau
seguinte é conhecido: Open-Meteo Standard, US$ 29/mês (≈ R$ 149) fixo, **para o produto inteiro**.

**Sem rede:** o aviso não aparece. Previsão é conselho, não trava nada. Cachear a previsão do dia
na primeira consulta cobre o caso "consultou no wi-fi, saiu para a rua".

⚠️ **Tem que passar pelo gate de `src/services/verticais.ts`.** Chuva importa para elétrica
externa, pintura, jardinagem, telhado, dedetização externa. Calor importa para refrigeração. Para
encanador de apartamento, chove ou faz sol, o serviço acontece igual — e alerta inútil é como se
mata a atenção do alerta que importa.

⚠️ **Atribuição:** o Visual Crossing pede crédito de fonte em uso público do dado. Uma linha
discreta na tela de previsão resolve. Ler os termos antes de publicar.

---

### 3.4. ASSINATURA COM VALIDADE JURÍDICA — 🟡 **ENTRA DEPOIS**, e a versão cara **NÃO ENTRA**

**O que o OLLI faz hoje**, lido no código (`src/components/assinatura/AssinaturaClienteModal.tsx`):
o cliente assina com o dedo, offline, e a tela diz com todas as letras que **não** é assinatura
certificada ICP-Brasil. O comentário do arquivo inclusive proíbe "melhorar" essa cópia para
sugerir o contrário. **Isso está certo e é raro.** Não mexer na honestidade.

**A pergunta do brief: quanto custaria ser certificada, e vale?**

**Os três níveis da Lei 14.063/2020:**

| Nível | O que é | O que custa | Serve pro OLLI? |
|---|---|---|---|
| **Simples** | dedo na tela + trilha de auditoria | R$ 0 | ✅ **é o que já existe** |
| **Avançada** | vínculo unívoco com o signatário, sem ICP | R$ 0 (gov.br) a ~R$ 50/mês (plataforma) | 🟡 talvez |
| **Qualificada** | certificado ICP-Brasil | **R$ 179 a R$ 275/ano por CNPJ** | 🔴 não |

Preço do e-CNPJ A1 verificado: R$ 179 na CertDigitais, R$ 219–275 em Certisign/Serasa/Valid.
https://certificadodigitais.com.br/artigos/quanto-custa-certificado-digital-2026/ ·
https://www.serasaexperian.com.br/conteudos/e-cnpj/ (lidas em 20/07/2026)

🔴 **Qualificada (ICP-Brasil) NÃO ENTRA, e é matemática simples:** para o aceite valer como
qualificado, **quem assina precisa do certificado — ou seja, o CLIENTE do prestador**. A dona de
casa que acabou de ter o ar-condicionado limpo não vai comprar um e-CPF de R$ 180/ano para
assinar uma ordem de serviço de R$ 250. **A ideia morre no lado do cliente, não no custo do OLLI.**

**E não é necessário.** Para contrato entre particulares, a **MP 2.200-2/2001, art. 10, §2º** e a
**Lei 14.063/2020, art. 4º, §2º** dizem que a assinatura eletrônica não-ICP vale **desde que
aceita pelas partes**. O OLLI já tem as duas partes concordando dentro do app.

🟢 **O que vale de verdade — e não é uma API (esforço P/M, custo R$ 0):**
O que ganha uma discussão no Juizado não é o selo. É a **trilha**. Guardar junto com a imagem da
assinatura:
- **hash SHA-256 do PDF exato que foi assinado** (calculado no aparelho, JS puro, **funciona
  offline**) — prova que o documento não mudou depois;
- data/hora, **coordenada GPS** (o OLLI já geocodifica), modelo do aparelho, e o nome digitado
  de quem assinou;
- o registro imutável de que o cliente **viu** o documento antes de assinar — que o
  `src/services/clienteLink.ts` **já faz** com `trilhaDoLink` (visualizado/aprovado/recusado).

**Custo R$ 0, esforço P/M, zero API, zero rede, zero dependência.** E o resultado é um documento
substancialmente mais defensável que uma imagem de rabisco. **É a melhor relação valor/esforço
desta seção.**

🟡 **Se um dia precisar de plataforma (contrato de PMOC anual, múltiplos signatários):**

| Plataforma | Preço de entrada | Nota |
|---|---|---|
| **ZapSign** | **R$ 29,90/mês** (Profissional) · R$ 99 ilimitado · **free 5 doc/mês** | API, link por WhatsApp, biometria GOV+ |
| **D4Sign** | R$ 39,90/mês | servidores no Brasil, trilha robusta |
| **Clicksign** | R$ 39,00/mês | API madura, operação local |
| **Autentique** | R$ 49,90/mês · free 5 doc/mês | — |

Fontes: https://supersign.com.br/blog/comparativo-supersign-vs-d4sign-zapsign-clicksign/ ·
https://www.signdocs.com.br/assinatura-digital-mais-barata-brasil.html (lidas em 20/07/2026).
⚠️ Preços de blog comparativo, **não** lidos na página oficial de cada uma — confirmar antes de
assinar qualquer coisa.

**Sem rede:** qualquer plataforma dessas exige rede no ato de assinar. **É por isso que ela não
pode substituir o modal atual** — o prestador assina na casa do cliente, no subsolo, sem sinal.
A plataforma seria um **caminho a mais** para contrato formal, nunca o caminho do aceite do
serviço. Trocar um por outro seria regressão.

🚨 **E o Documenso não é candidato** — AGPL-3.0, §1.4. Se a porta for fiada, o candidato é uma
plataforma brasileira paga (relação acima) ou biblioteca sob licença permissiva. **Nada de AGPL
dentro de produto fechado.**

---

### 3.5. O RESTO — cobrança recorrente, boleto, score, catálogo, tabela de preços

#### (a) **Pix Automático — 🟡 ENTRA DEPOIS, e é o maior desta seção**

Lançado pelo Banco Central em **junho de 2025**, completou um ano em junho/2026; **todas as
instituições que oferecem conta transacional a pagadores são obrigadas a disponibilizá-lo**. O
cliente autoriza **uma vez**, no app do banco dele, e o débito passa a acontecer sozinho.
https://blog.asaas.com/pix-automatico/ · https://www.pagbrasil.com/pt-br/blog/noticias/pix-automatic-2026/

**Resolve DUAS dores, e a segunda é do próprio dono:**
1. **Do prestador:** contrato de PMOC / manutenção mensal deixa de ser "mandar o Pix e cobrar
   todo mês". Esse é o produto de maior margem de um técnico de refrigeração e hoje ele o vende
   mal porque cobrar é um saco.
2. **Do OLLI:** conferido em `worker/src/mercadopago.js` — a assinatura por Pix é **avulsa**
   (`/mp/plano/pix`, N meses de uma vez) e o `preapproval` só existe para **cancelar** legado.
   **Quem paga o OLLI por Pix precisa lembrar de pagar de novo.** Isso é vazamento de receita
   por esquecimento, num produto que ainda não tem receita nenhuma.

**Custo:** o do gateway, não do BACEN. Asaas cobra **R$ 0,99 por Pix recebido nos 3 primeiros
meses, depois R$ 1,99**, e **2,99% sobre parcelamentos/assinaturas**; sem mensalidade.
https://www.asaas.com/precos-e-taxas (lida em 20/07/2026). O Mercado Pago divulga Pix Automático
comercialmente (https://www.mercadopago.com.br/blog/pix-automatico-gestao-assinaturas-receita-recorrente),
mas **eu não localizei a página de API dele** — a doc de recorrência que achei é a de
`subscriptions` por cartão (https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview).
⚠️ **Não codar nada antes de confirmar com o MP se existe API de Pix Automático liberada.** O
dono já escolheu o MP; trocar de gateway por causa disso seria a decisão errada pelo motivo certo.

**Esforço: G.** Fluxo de autorização, webhook de novo tipo, tratamento de autorização revogada.
Não é uma tarde. **ENTRA DEPOIS** — mas entra antes de WhatsApp e antes de emissão fiscal.

**Sem rede:** cobrança é servidor. O app mostra o estado que sincronizou por último e **nunca**
afirma "pago" sem confirmação. Aqui vale a regra da casa em dobro: `não sei` ≠ `não pagou`.

#### (b) **Boleto — 🔴 NÃO ENTRA**
Custa ~R$ 2–3 por boleto pago, compensa em D+1/D+2, e o cliente do prestador de serviço já paga
por Pix. Boleto resolve pagamento corporativo com prazo — que não é o caso de uso do OLLI.
Reabre **só** se aparecer cliente Empresa/condomínio exigindo boleto para pagar o prestador.

#### (c) **Consulta de score / cadastro (Serasa, SERPRO) — 🔴 NÃO ENTRA**
Três motivos, cada um suficiente:
1. **Não há autoatendimento.** SERPRO (Consulta CPF, Datavalid) exige **contratação
   institucional** (https://www.loja.serpro.gov.br/consulta-cpf/product/consultacpf ·
   https://loja.serpro.gov.br/datavalid). Serasa é venda corporativa. **Nenhum dos dois publica
   preço** — e API sem preço público é API que uma pessoa só não consegue orçar nem contratar.
2. **LGPD.** Consultar score de um terceiro (o cliente do prestador) exige base legal e
   finalidade declarada. É passivo jurídico com formato de feature.
3. **Não resolve a dor real.** A dor não é "esse cliente é caloteiro?" — é "esse cliente me
   deve e eu não lembro". Isso o `src/services/radarCobranca.ts` **já faz**, de graça, com o
   dado que é do próprio prestador.

#### (d) **Catálogo de peças/equipamentos por código de barras — 🔴 NÃO ENTRA**
O **Cosmos/Bluesoft** tem 18 milhões de itens e é ótimo — **para varejo**. É catálogo GTIN/EAN
com NCM e tributação: arroz, sabão, refrigerante. **Compressor Elgin, capacitor 45µF e gás R-410A
não estão lá com dado útil.** É o catálogo errado. E a página de API responde **HTTP 403 para
leitor automatizado** (https://cosmos.bluesoft.com.br/api), o que na prática quer dizer preço sob
consulta.

**O que resolve a mesma dor e já está pago:** foto da plaqueta → Gemini devolve
`{marca, modelo, série, BTU, tensão, gás}` a **~R$ 0,005 por foto**, usando o cano que
`worker/src/gemini.js` já tem para o `/transcrever`. Isso já está proposto no
`APIS_E_INTEGRACOES.md` §4.7 e **eu confirmo o veredito** — não é ideia nova, é a mesma ideia
sobrevivendo à comparação com a alternativa "de verdade".

#### (e) **Tabela de preços de serviço — 🔴 NÃO ENTRA como API** (mas tem um caminho)
O **SINAPI** (Caixa + IBGE) é gratuito, atualizado mensalmente, sem cadastro, ~15.330 composições
— e é **referencial de obra pública de construção civil**
(https://www.orcafascio.com/papodeengenheiro/tabela-sinapi-2026 · https://www.vobi.com.br/materiais/tabela-sinapi-2026-download).
Ele responde "quanto custa 1 m² de alvenaria em obra pública no Paraná". **Não responde "quanto
cobrar para limpar um split 12.000 numa casa em Curitiba."** Público errado, granularidade errada.
Existe API de terceiro por cima dele (https://orcamentador.com.br/api/docs) — mesma objeção,
agora com custo.

**O caminho certo, e é honesto dizer que ainda não dá:** a tabela de preço mais valiosa para
este público seria a **do próprio OLLI** — mediana anonimizada do que os prestadores da mesma
vertical, na mesma região, realmente cobram. O app **já tem** o catálogo de serviços com preço
por prestador (`src/services/olliAssistente.ts:104`), então o dado nasceria sozinho.
**Com zero usuários pagantes, essa mediana seria mentira estatística.** É a feature certa no ano
errado. Guardar, não construir.

*(E vale registrar: os posts "quanto cobrar por dedetização", "quanto cobrar limpeza de
ar-condicionado", "como calcular sua hora técnica" **já existem** em `web/src/content/blog/`.
O conteúdo que responde essa dor já está no ar — é a API que não precisa existir.)*

#### (f) **Resend — já está no código, desligado. 🟡 Ligar é P e quase de graça**
`worker/src/email.js` está escrito, com fallback correto (sem chave = no-op, e-mail nunca derruba
a operação). Falta só a `RESEND_API_KEY`.
**Free: 3.000 e-mails/mês, teto de 100/dia. Pro: US$ 20/mês (≈ R$ 103) por 50.000.**
https://resend.com/pricing (lida em 20/07/2026).
Com ~50 prestadores, 3.000/mês sobra. **O teto de 100/dia é a única pedra** — qualquer disparo
em lote bate nele. Para convite de equipe e recibo, cabe folgado. **Custo hoje: R$ 0.**

---

## 4. RANKING — valor pro prestador ÷ (esforço + custo)

| # | O quê | Valor | Esforço | Custo hoje | Custo em escala | Veredito |
|---|---|---|---|---|---|---|
| **1** | **Clima (Visual Crossing free)** | altíssimo — **gera receita** | M | **R$ 0** | R$ 0 → R$ 149 | 🟢 **ENTRA JÁ** |
| **2** | **NFS-e preparada + Emissor Nacional** | alto **e com prazo legal** | M | **R$ 0** | R$ 0 | 🟢 **ENTRA JÁ** |
| **3** | **Trilha forte na assinatura (hash+GPS+hora)** | alto — protege o prestador | P/M | **R$ 0** | R$ 0 | 🟢 **ENTRA JÁ** |
| **4** | **Corrigir o comentário AGPL no `SignatureProvider.ts`** | evita processo | **P (30 s)** | R$ 0 | R$ 0 | 🟢 **ENTRA JÁ** |
| **5** | **Pix Automático (recorrência)** | alto — pro prestador **e pro caixa do OLLI** | G | taxa/transação | ~R$ 2/cobrança | 🟡 **ENTRA DEPOIS** |
| 6 | Ligar o Resend (chave no cofre) | médio | P | R$ 0 | R$ 103/mês | 🟡 ENTRA DEPOIS |
| 7 | Emissão fiscal real (Focus Growth) | alto | G | **R$ 548/mês** | R$ 788/mês | 🔴 NÃO ENTRA (v1) |
| 8 | Plataforma de assinatura (ZapSign/D4Sign) | médio | M | R$ 29,90/mês | idem | 🔴 NÃO ENTRA (v1) |
| 9 | WhatsApp Cloud API | médio | **G+operação** | US$/msg + BSP | idem | 🔴 **NÃO ENTRA** |
| 10 | Score / catálogo GTIN / SINAPI / boleto | baixo a nulo | — | — | — | 🔴 **NÃO ENTRA** |

### Os 5 primeiros, com o porquê

**1. CLIMA — 🟢 ENTRA JÁ.** É a única coisa desta lista que faz o prestador **ganhar** dinheiro
em vez de economizar tempo, e a pesquisa acabou de derrubar o único obstáculo dela: o free tier
do Visual Crossing tem licença comercial. **Custo R$ 0, zero passo humano, zero espera pelo dono.**
A infra de radar já existe. Não há argumento contra.

**2. NFS-e PREPARADA — 🟢 ENTRA JÁ.** É a única com **data em lei**: 1º de setembro de 2026.
Custo R$ 0, sem certificado, sem provedor, sem responsabilidade fiscal — porque **prepara, não
emite**. O concorrente que não fizer nada até setembro vai ter que explicar ao cliente por que a
nota não sai. Isso é vantagem de calendário, e calendário não espera.

**3. TRILHA NA ASSINATURA — 🟢 ENTRA JÁ.** A resposta certa à pergunta "quanto custaria ser
juridicamente válida" é: **R$ 0, e não é uma API.** É hash + hora + GPS + registro de leitura,
tudo calculado no aparelho, funcionando offline, aproveitando o `trilhaDoLink` que já existe. A
alternativa cara (ICP-Brasil) morre porque quem precisaria do certificado é o **cliente** do
prestador, e ele nunca vai comprar um.

**4. O COMENTÁRIO AGPL — 🟢 ENTRA JÁ.** Trinta segundos de edição para desarmar uma armadilha
jurídica que está commitada no repositório apontando para software AGPL-3.0 como "provider
escolhido". É o melhor retorno por segundo do documento inteiro.

**5. PIX AUTOMÁTICO — 🟡 ENTRA DEPOIS.** Valor altíssimo dos dois lados (contrato recorrente do
prestador; e a assinatura do próprio OLLI, que hoje depende de o cliente **lembrar** de pagar).
Fica em DEPOIS por dois motivos honestos: esforço **G**, e eu **não confirmei** que o Mercado
Pago — o gateway que o dono já escolheu — expõe API de Pix Automático. **Primeiro perguntar ao
MP, depois codar.**

---

## 5. O QUE NÃO FAZER — a metade útil deste documento

1. **NÃO assinar Focus NFe (R$ 548/mês) antes de ter ~150 pagantes.** Mensalidade fixa antes de
   receita é como fecha uma empresa de uma pessoa só.
2. **NÃO assinar eNotas para embutir no produto.** Um CNPJ por assinatura: 1.000 prestadores =
   1.000 assinaturas. O modelo comercial deles é incompatível com o do OLLI.
3. **NÃO considerar a Nuvem Fiscal.** Serviço **desativado em 31/07/2026**. Ela ainda está
   escrita como candidata no `docs/INTEGRATION_BACKLOG.md`. **Apagar de lá.**
4. **NÃO usar Documenso.** AGPL-3.0 em produto comercial fechado. §1.4.
5. **NÃO virar Tech Provider do WhatsApp.** É um segundo produto, com fila de aprovação de
   terceiro, para substituir um `wa.me` que funciona de graça em 9 telas.
6. **NÃO usar Open-Meteo no plano grátis.** Licença **não-comercial** explícita e o OLLI cobra
   assinatura. Ou Visual Crossing (grátis, comercial ✅), ou Open-Meteo Standard pago.
7. **NÃO tentar assinatura ICP-Brasil no aceite do serviço.** Exigiria certificado do **cliente**
   do prestador. Morre na primeira dona de casa.
8. **NÃO trocar o modal de assinatura atual por plataforma de assinatura online.** O atual
   funciona **sem rede**, que é onde o prestador está. Plataforma seria caminho adicional para
   contrato formal — **nunca** substituição.
9. **NÃO integrar catálogo GTIN (Cosmos) para peças.** Catálogo de varejo. A foto→Gemini que já
   está proposta resolve melhor e mais barato.
10. **NÃO integrar SINAPI.** É preço de obra pública de construção civil. Público errado.
11. **NÃO integrar score/Serasa/SERPRO.** Sem autoatendimento, sem preço público, com passivo
    de LGPD, para resolver uma dor que o `radarCobranca.ts` já resolve de graça.
12. **NÃO fazer boleto.** Custo por boleto, compensação em D+1, e o cliente já paga por Pix.
13. **NÃO escrever endpoint que fica escuro esperando um secret.** Regra já estabelecida na
    onda K2 (`APIS_E_INTEGRACOES.md` §11.5) e ela continua certa. As propostas ENTRA JÁ deste
    documento **não dependem de nenhuma chave nova** — de propósito.

---

## 6. O QUE DEPENDE DO DONO (curto de propósito)

1. **Criar conta grátis no Visual Crossing** e guardar a chave no cofre do worker. ~3 minutos,
   **sem cartão**. Destrava o item nº 1 do ranking.
2. **Abrir a Resolução CGSN 189/2026 no navegador** e confirmar com os próprios olhos antes de
   qualquer copy pública prometer NFS-e. §1.1.
3. **Perguntar ao Mercado Pago se há API de Pix Automático liberada** para a conta dele. Uma
   mensagem ao suporte. Destrava o item nº 5.
4. *(edição de doc/comentário, não é decisão)* Tirar "Nuvem Fiscal" do `INTEGRATION_BACKLOG.md`
   e a linha "Documenso" do `SignatureProvider.ts`.

**Nada mais desta pesquisa espera por ele.** Os três primeiros do ranking custam R$ 0 e não
dependem de aprovação de terceiro — foi assim que foram escolhidos.

---

## 7. FONTES (todas lidas em 2026-07-20/21)

**Fiscal:**
https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/abril/nota-fiscal-de-servico-eletronica-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional ·
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional ·
https://www.crc-ce.org.br/2026/05/nota-tecnica-sobre-a-resolucao-cgsn-no-189-2026-e-a-obrigatoriedade-da-nfs-e-de-padrao-nacional-para-optantes-do-simples-nacional/ ·
https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf ·
https://www.notaas.com.br/blog/post/api-nfse-nacional-guia-integracao-tech ·
https://www.notaas.com.br/blog/post/emitir-nota-fiscal-de-servico-gratuitamente-passo-a-passo-nfs-e-mei-portal-nacional ·
https://waygo.com.br/blog/nfse/nfse-mei-2026-guia-completo/ ·
https://focusnfe.com.br/precos/ · https://focusnfe.com.br/nota-fiscal-servico-nfse/ ·
https://nfe.io/precos/emissao-nfse/ · https://enotass.com.br/notas · https://plugnotas.com.br/ ·
https://www.nuvemfiscal.com.br/

**WhatsApp:**
https://developers.facebook.com/docs/whatsapp/pricing/ ·
https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview ·
https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview ·
https://whautomate.com/whatsapp-business-api-pricing-brazil ·
https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil ·
https://www.ycloud.com/blog/whatsapp-business-app-coexistence-meta-update

**Clima:**
https://www.visualcrossing.com/resources/documentation/visual-crossing-weather-free-plan-free-weather-data-for-analysts-and-api-developers/ ·
https://www.visualcrossing.com/weather-data-pricing/ ·
https://www.visualcrossing.com/resources/blog/navigating-weather-api-licensing-commercial-use-rights-and-restrictions-explained/ ·
https://open-meteo.com/en/pricing · https://openweathermap.org/price

**Assinatura e certificado:**
https://docs.documenso.com/docs/policies/licenses ·
https://docs.documenso.com/users/licenses/community-edition ·
https://github.com/documenso/documenso/discussions/1415 ·
https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/latest/introducao.html ·
https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada ·
https://certificadodigitais.com.br/artigos/quanto-custa-certificado-digital-2026/ ·
https://www.serasaexperian.com.br/conteudos/e-cnpj/ ·
https://supersign.com.br/blog/comparativo-supersign-vs-d4sign-zapsign-clicksign/ ·
https://www.signdocs.com.br/assinatura-digital-mais-barata-brasil.html

**Pagamentos, dados e outros:**
https://www.asaas.com/precos-e-taxas · https://blog.asaas.com/pix-automatico/ ·
https://www.pagbrasil.com/pt-br/blog/noticias/pix-automatic-2026/ ·
https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview ·
https://www.mercadopago.com.br/blog/pix-automatico-gestao-assinaturas-receita-recorrente ·
https://www.loja.serpro.gov.br/consulta-cpf/product/consultacpf · https://loja.serpro.gov.br/datavalid ·
https://cosmos.bluesoft.com.br/api (403) · https://www.orcafascio.com/papodeengenheiro/tabela-sinapi-2026 ·
https://www.vobi.com.br/materiais/tabela-sinapi-2026-download · https://orcamentador.com.br/api/docs ·
https://resend.com/pricing · https://br.investing.com/currencies/usd-brl

**Código lido antes de propor:**
`worker/src/{index,brasil,gemini,voz,mercadopago,stripe,email,creditos}.js` ·
`src/services/{cnpj,cep,olliAssistente,vozNuvem,radarClientes,radarCobranca,clienteLink,verticais}.ts` ·
`src/services/ports/{FiscalProvider,SignatureProvider}.ts` ·
`src/components/assinatura/AssinaturaClienteModal.tsx` ·
`docs/ENXAME/APIS_E_INTEGRACOES.md` · `docs/INTEGRATION_BACKLOG.md`

---

## 8. Uma frase, se só der para ler uma

**Três coisas custam R$ 0,00, não dependem de ninguém e podem ser feitas esta semana** — clima
pelo free tier comercial do Visual Crossing, NFS-e preparada antes de 1º de setembro, e trilha
forte na assinatura que já existe. **Tudo o mais nesta pesquisa custa dinheiro fixo, tempo de
manutenção contínua ou aprovação de terceiro** — e nenhuma dessas três coisas um dono sozinho,
com zero usuários pagantes, pode se dar ao luxo de gastar agora.
