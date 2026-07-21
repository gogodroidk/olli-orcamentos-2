# "A que horas eu preciso sair" — ETA com trânsito

Documento de projeto da ideia do dono. Escrito depois de ler o código, não de memória.
Preços de API conferidos na web em 17/07/2026 e **reconferidos em 18/07/2026** (URLs no fim).

> **ATUALIZAÇÃO 18/07/2026 — a Fase 0 FOI CONSTRUÍDA.** A fundação no worker está
> no repo, testada e verde. O que mudou desde a primeira redação está na
> **[seção 12](#12-o-que-foi-construído-em-1807)**, no fim — inclusive **duas
> discordâncias explícitas** com o que este documento recomendava (o corte por
> haversine e o papel do cache). Leia a 12 antes de agir sobre as seções 4 e 9.
>
> **Nada foi ligado no app.** `src/` não foi tocado. O contrato para a próxima
> leva está na seção 12.

---

## 0. A primeira coisa que você precisa saber

**Metade dessa feature já está construída e no ar. A outra metade — a que você
pediu — não existe.**

Isso muda o veredito inteiro, então vem antes de tudo:

| Peça | Estado real no repo |
|---|---|
| Worker `POST /eta` chamando `computeRoutes` com `TRAFFIC_AWARE` | **EXISTE**, em produção (`worker/src/index.js:354`) |
| Worker `POST /geocodificar` (endereço texto → lat/lng) | **EXISTE** (`worker/src/index.js:518`) |
| Serviço de app com 3 estados honestos (`ok` / `sem_localizacao` / `indisponivel`) | **EXISTE** (`src/services/eta.ts`) |
| Chip de ETA na tela | **EXISTE** (`src/components/EtaChip.tsx`, usado em `HomeScreen.tsx:492` e `InicioDesktopScreen.tsx:798`) |
| "Estou a caminho" no WhatsApp com os minutos reais | **EXISTE** (`mensagemEstouACaminho`, `eta.ts:60`) |
| Chave `OLLI_ROUTES_API_KEY` + billing Google | **LIGADOS** desde 2026-07-10 (`docs/KNOWN_BLOCKERS.md` B4) |
| **Aviso proativo "saia às 14h20 pra chegar 15h"** | **NÃO EXISTE** |
| **`departureTime` (trânsito previsto para o horário da saída)** | **NÃO EXISTE** — e sem isso o número da manhã está errado |
| **Recálculo quando o trânsito piora** | **NÃO EXISTE** |
| **Qualquer coisa disso funcionando no APK** | **NÃO FUNCIONA** — ver abaixo |

### O achado que provavelmente te surpreende

`src/services/eta.ts:276`:

```ts
export function temDestinoEta(a: DestinoAgendamento | null | undefined): boolean {
  if (Platform.OS !== 'web' && !LOCALIZACAO_DISPONIVEL) return false;
```

E `src/services/localizacaoEquipe.ts:62`: `export const LOCALIZACAO_DISPONIVEL = false;`

**Tradução: o ETA hoje só aparece na web. No APK, o chip nunca é renderizado.**
O gate está certo (evita um beco sem saída de "ative a localização" sem módulo
de localização instalado), mas o efeito prático é que a feature que o
`KNOWN_BLOCKERS.md` chama de "em produção" está em produção só no navegador —
justamente onde o prestador com luva suja *não* está.

Isso não é um bug a corrigir com um `if`. É a evidência de que o desenho atual
(origem = GPS do aparelho) foi o desenho errado. O que segue é o desenho certo,
e ele **remove** essa dependência em vez de instalar `expo-location`.

---

## 1. VEREDITO

**VALE — mas não do jeito que está encaminhado, e não pelo motivo óbvio.**

Três afirmações que sustentam o veredito:

**(a) Para responder "a que horas eu saio", a localização atual do prestador é a
origem ERRADA.**

Se são 7h da manhã e a visita é às 15h, onde o celular dele está agora não diz
nada sobre de onde ele vai sair às 14h20. Ele vai sair da **visita anterior** —
ou de **casa**, se for a primeira do dia. Os dois endereços o OLLI já tem:
`Agendamento.endereco` (a visita anterior na agenda) e `Empresa.endereco`
(`src/types/index.ts:101`).

Ou seja: a feature que você pediu **não precisa de GPS**. O ETA "ao vivo" que já
existe precisa (é outra pergunta: "quanto falta daqui"). Mas o aviso da manhã, não.

**(b) Isso derruba o custo humano e regulatório para perto de zero.** Sem
`ACCESS_FINE_LOCATION` no manifest, sem texto de propósito novo, sem seção nova
de Data safety na Play Store, sem `expo-location`, sem prebuild. E funciona no
APK **hoje**.

**(c) O que sobra é um problema de dinheiro, e o problema de dinheiro é real.**
O código hoje usa `routingPreference: 'TRAFFIC_AWARE'`, que cai no SKU **Compute
Routes Pro**: 5.000 chamadas grátis/mês **na conta inteira** (não por usuário) e
**US$ 10,00 por 1.000** depois disso. Um desenho ingênuo (2 chamadas por visita)
custa ~R$ 13,50/mês por prestador num plano de R$ 39 — **35% da receita bruta em
API**. Com os cortes da seção 4, cai para ~R$ 3,70. Esse é o trabalho de
engenharia que essa feature realmente exige.

---

## 2. O MOMENTO — quando a Olli fala

### Onde isso encaixa no que já existe

O ritual diário (`src/services/ritualDiario.ts`) já acorda o app de manhã e monta
o "Bom dia da OLLI", e `montarBomDia` (linha 157) **já lê a próxima parada e já
mostra o endereço**:

```
Hoje às 15:00: João Silva · Rua X, 123
```

Falta a única frase que importa: **quando sair**.

O lembrete de agenda (`src/services/agenda.ts:106`) já agenda notificação local
com `SchedulableTriggerInputTypes.DATE` e mantém o mapa
agendamento→notificação em AsyncStorage para poder cancelar/reagendar. A infra
está pronta. `MINUTOS_ANTECEDENCIA_LEMBRETE = 60` — fixo, cego a trânsito.

### Desenho dos três toques

**Toque 1 — "Bom dia da OLLI" (~07h, canal que já existe)**
Enriquecer `montarBomDia` com a linha de saída:

> Bom dia. Hoje: 4 visitas.
> A primeira é às 09h, João Silva — **saia 08h25** (32 min, trânsito comum).

Uma notificação. Não uma por visita — o dia inteiro numa frase e o resto na Home.

**Toque 2 — "Hora de sair" (substitui o lembrete fixo de 60 min)**
Notificação local agendada para **o horário de saída menos 10 min**:

> **Saia agora** para o João Silva (15h).
> 32 min com o trânsito de agora. Chega ~14h57.

Regra dura: esse toque só existe se o cálculo deu certo. Se falhou, o app cai
**no lembrete fixo de hoje** ("Visita em 1h") — que é honesto e é o
comportamento atual. Nunca sai um "saia agora" com número inventado.

**Toque 3 — "O trânsito mudou" (condicional, raro)**
Um recálculo ~40 min antes do horário de saída previsto. Só notifica se o novo
tempo for **≥ 12 min pior** que o da manhã:

> O trânsito piorou. Melhor sair **14h05**, não 14h20 (+18 min).

Por que 12 min e não 5: notificação que dispara por ±5 min vira ruído, e ruído
vira notificação desligada. Um único falso alarme por semana já mata o canal.

### A galinha e o ovo (detalhe de implementação que morde)

Para saber a que horas sair você precisa da duração; para pedir a duração com
trânsito previsto você precisa informar a hora da saída (`departureTime`).
Resolve-se com **uma iteração, não um loop**:

1. `departureTime` = horário da visita − duração em cache (ou − 45 min se não há cache).
2. Chama a API, recebe `duration`.
3. `horário_de_saída = horário_da_visita − duration − folga`.

O erro residual (o trânsito das 14h05 vs. o das 14h20) é de poucos minutos e a
folga cobre. **Não iterar duas vezes** — dobra o custo para ganhar 3 minutos.

**Isso exige mudar o worker**: `handleEta` hoje não manda `departureTime`
(`worker/src/index.js:390-397`). Sem esse campo, o Google devolve o trânsito de
**agora**. Calcular às 7h da manhã o trânsito de uma saída às 14h20 usando o
trânsito das 7h é simplesmente errado — e o app não teria como saber que errou.
Essa é a correção técnica mais importante do documento.

### Folga

Sugestão: `folga = max(5 min, 12% da duração)`. Uma viagem de 40 min ganha 5 min
de folga; uma de 90 min ganha 11. Chegar 5 min antes é profissional; chegar
10 min atrasado é uma reclamação. A assimetria do custo justifica a folga.

---

## 3. DE ONDE SAI O ENDEREÇO

### O que existe hoje

```ts
// src/types/index.ts:407
export interface Agendamento {
  clienteNome: string;
  inicio: string;
  endereco?: string;   // ← texto livre, opcional. Sem lat/lng.
}

// src/types/index.ts:152
export interface Cliente {
  endereco?: string; complemento?: string; cidade?: string;
  estado?: string; cep?: string;   // ← também sem lat/lng
}
```

Texto livre, opcional, **sem coordenada em lugar nenhum do schema**. Então sim,
precisa geocodificar. E já geocodifica (`geocodificarEndereco`, `eta.ts:217`).

### O buraco de custo que está aberto agora

`src/services/eta.ts:205`:

```ts
const cacheGeocode = new Map<string, Coordenada>();
```

**Cache em memória.** Morre quando o app fecha. O mesmo cliente, visitado toda
semana, é re-geocodificado toda vez que o app reinicia. O mesmo vale para o cache
de ETA (`eta.ts:88`, TTL 5 min).

Isso é dinheiro escapando por um furo que não precisa existir. **Correção
obrigatória antes de qualquer coisa nova:**

- Coluna `lat`/`lng` em `clientes` (e opcionalmente em `agendamentos`, para
  endereço avulso que não é de cliente cadastrado).
- Geocodifica **uma vez**, no momento em que o endereço é salvo/editado — não na
  hora do ETA. Grava. Nunca mais chama.
- Endereço mudou → limpa lat/lng → re-geocodifica no próximo save.

Com isso, Geocoding vira ~1 chamada por **cliente novo**, não por visita. Um
prestador que cadastra 20 clientes novos/mês gasta 20 chamadas. O free tier de
10.000/mês cobre **500 prestadores** nesse ritmo. Custo efetivo de geocoding: **R$ 0,00**.

Sem essa correção, geocoding vira 132 chamadas/mês por prestador e some com o
free tier em 75 prestadores. É a diferença entre grátis e não-grátis.

### Qualidade do endereço

Endereço de prestador brasileiro é sujo ("rua x, 123 fundos", "prox. ao mercado").
O worker já enviesa para o Brasil (`&region=br&language=pt-BR`) — certo.
Duas defesas a mais, baratas:

- Se o `Cliente` tem CEP, montar a string de geocoding como
  `logradouro, numero - CEP, cidade/UF`. CEP é o desambiguador mais forte que
  existe no Brasil, e `src/services/cep.ts` (ViaCEP, grátis, sem chave) já
  preenche isso no cadastro.
- Guardar o `formatado` que o Google devolve (o worker já retorna, linha 554) e
  mostrar ao prestador na primeira vez: *"Entendi este endereço: … Está certo?"*.
  Um toque, uma vez por cliente, elimina a categoria inteira de "a Olli me mandou
  sair no horário errado porque geocodificou o endereço errado".

---

## 4. CUSTO REAL

### Preços conferidos (Google Maps Platform, 17/07/2026)

| SKU | Grátis/mês (conta toda) | Preço por 1.000 (faixa 1) |
|---|---|---|
| **Compute Routes Essentials** | 10.000 | US$ 5,00 |
| **Compute Routes Pro** | 5.000 | US$ 10,00 |
| Compute Routes Enterprise | 1.000 | US$ 15,00 |
| **Geocoding** | 10.000 | US$ 5,00 |

**A regra de SKU que decide tudo:** o Pro é cobrado em requisições que usam
"advanced features, such as the `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL` route
modifiers". `TRAFFIC_UNAWARE` fica no Essentials.

**O worker hoje manda `TRAFFIC_AWARE` (`worker/src/index.js:394`) — logo, todo
ETA do OLLI já é Pro: metade do free tier e o dobro do preço.**

Câmbio usado: US$ 1 = R$ 5,11 (17/07/2026). Google cobra em USD — some IOF/spread
do cartão por cima (~4-6% na prática). Os números abaixo são o piso.

### Cenário: prestador com 6 visitas/dia × 22 dias = 132 visitas/mês

**Desenho ingênuo** (1 cálculo de manhã + 1 confirmação, tudo `TRAFFIC_AWARE`):

| | Chamadas/mês | SKU | Custo |
|---|---|---|---|
| Planejamento | 132 | Pro | US$ 1,32 |
| Confirmação | 132 | Pro | US$ 1,32 |
| **Total** | **264** | | **US$ 2,64 → R$ 13,49/mês/prestador** |

**Num plano de R$ 39/mês, isso é 35% da receita bruta em API de mapa.** Antes de
Supabase, Cloudflare, Gemini e imposto. Inviável.

*(Planos: R$ 0 / 39 / 99 — fonte: `src/services/entitlements.ts:16`.)*

### Desenho recomendado — os quatro cortes

**Corte 1 — filtro de haversine (grátis, offline).**
Com lat/lng já em cache, calcular a distância em linha reta **no aparelho**, sem
rede e sem custo. Se for < 3 km, não chama a API: mostra "~10 min, pertinho" e
usa o lembrete fixo. A maior parte da agenda de um prestador é no próprio bairro
ou cidade. Corte estimado: **40-45% das chamadas.**

**Corte 2 — uma chamada Pro por visita, não duas.**
O planejamento da manhã usa `TRAFFIC_UNAWARE` (Essentials, metade do preço, o
dobro do free tier) e é rotulado honestamente na UI como *"sem trânsito"*. A
única chamada `TRAFFIC_AWARE` é a **confirmação**, perto da hora — que é onde o
trânsito de fato existe e importa.

Contra-argumento legítimo: `TRAFFIC_AWARE` com `departureTime` futuro dá trânsito
*previsto*, que é melhor de manhã. Verdade. É uma escolha de R$/qualidade, e ela
é sua — mas comece barato, porque o corte 1 já entrega a maior parte do valor.

**Corte 3 — cache persistente de trajeto.**
Guardar `(origem_arredondada, destino_arredondado, faixa_de_hora, dia_útil) →
duração` no Supabase. Prestador roda os mesmos trajetos. Depois de 3-4 semanas,
boa parte do planejamento matinal sai do histórico e a API vira só confirmação.
Não estimo o corte porque não tenho dado real — mas é o corte que cresce sozinho
com o tempo, e é o único que melhora à medida que a base cresce.

**Corte 4 — só em plano pago.** Nunca no grátis.

**Custo com os cortes 1, 2 e 4** (sem contar o 3, que só melhora):

| | Chamadas/mês | SKU | Custo |
|---|---|---|---|
| Planejamento (55% das visitas) | 73 | Essentials | US$ 0,37 |
| Confirmação (55%) | 73 | Pro | US$ 0,73 |
| Geocoding (clientes novos) | ~20 | Geocoding | US$ 0,10 |
| **Total** | **166** | | **US$ 1,20 → R$ 6,13/mês/prestador** |

Se abrir mão do planejamento com API e usar só o cache histórico + a confirmação:
**73 chamadas Pro = US$ 0,73 = R$ 3,73/mês/prestador** (~9,5% de um plano de R$ 39).

### Cabe no free tier?

Free tier Pro = 5.000/mês **na conta**. A 73 chamadas Pro/prestador/mês:
**≈ 68 prestadores ativos de graça.** Para a fase de validação, custo zero. O
primeiro prestador nº 69 começa a custar US$ 0,0073/mês… e o nº 200 custa
US$ 0,73. Não é um abismo, é uma rampa — dá pra medir antes de doer.

### RISCO DE CONTA: não existe teto de gasto

`worker/wrangler.jsonc:47`:

```jsonc
{ "name": "ETA_RL", "namespace_id": "1005", "simple": { "limit": 20, "period": 60 } }
```

Isso é um limite de **rajada** (20 por minuto por usuário), não um orçamento.
Um único usuário no talo, um mês: 20 × 60 × 24 × 30 = **864.000 chamadas Pro ≈
US$ 8.600**. Não precisa de má-fé — basta um `useEffect` em loop numa tela nova.

**Antes de aumentar o volume dessa feature, duas travas:**

1. **Budget + alerta no Google Cloud Console** (passo humano seu, 5 min) com
   corte automático da chave no teto. Isso não é opcional.
2. Contador mensal por conta no worker (KV ou tabela Supabase). Passou do teto
   → devolve `{ ok: false, motivo: 'cota_mensal' }`, e a UI mostra "estimativa
   indisponível hoje" — que o `eta.ts` já sabe tratar como `'indisponivel'`.

---

## 5. PRIVACIDADE E PERMISSÃO — os dois desenhos

### Desenho A — origem cadastrada (RECOMENDADO)

Origem = endereço da visita anterior na agenda; se for a primeira do dia,
`Empresa.endereco`. Zero acesso à localização do aparelho.

| | |
|---|---|
| Permissão nova no manifest | **Nenhuma** |
| Texto de propósito / Data safety novo | **Nenhum** |
| Política de privacidade | **Sem alteração** (endereço de cliente já é dado tratado) |
| `expo-location` / prebuild | **Não precisa** |
| Funciona no APK hoje | **Sim** |
| Funciona com o celular no bolso, tela apagada | **Sim** (notificação local já agendada) |
| Precisão | Boa para "a que horas sair". Erra se ele estiver num lugar não previsto |

### Desenho B — GPS do aparelho (o que o código tenta hoje)

| | |
|---|---|
| Permissão | `ACCESS_FINE_LOCATION` — hoje o `app.json:27` só declara `CAMERA`, `READ_MEDIA_IMAGES`, `RECORD_AUDIO` |
| Passos de loja | Data safety (Play) + `NSLocationWhenInUseUsageDescription` (iOS) + revisão da política de privacidade |
| Dependência | `expo-location` + prebuild (`LOCALIZACAO_DISPONIVEL` hoje é `false`) |
| Funciona no APK hoje | **Não** |
| Risco de rejeição na loja | Real. Pedir localização e usar mal é motivo clássico de rejeição no review |
| Custo humano | Ele precisa **conceder** e **manter** a permissão. Cada negação é um beco sem saída |
| Ganho para "a que horas sair" | **Marginal.** Onde ele está às 7h não prevê de onde sai às 14h20 |

### A comparação em uma linha

**O Desenho B custa uma permissão de loja, um prebuild e uma rodada de review
para responder pior a pergunta que o dono fez.** O Desenho A responde melhor,
com dado que o app já tem.

**Onde B ainda vale:** para o ETA "ao vivo" que já existe (o chip "quanto falta
daqui" e o "Estou a caminho"). Essa é outra pergunta, e para ela a posição atual
é a origem certa. Mas isso é um **item separado**, que entra junto com a Onda 8
(quando `expo-location` chegar por outros motivos, como equipe ao vivo) — não é
pré-requisito de nada aqui.

**Nota de privacidade que vale a pena registrar:** no Desenho A, nenhuma
coordenada do prestador sai do aparelho. O que vai ao worker são endereços de
clientes, que já trafegam. Se um dia a equipe entrar em cena (gestor vendo
técnico), aí sim há um dado novo e sensível — e ele já tem RLS desenhada em
`localizacoes_equipe`. Não misture as duas coisas: rastrear técnico é uma
decisão de produto e de relação de trabalho, não um efeito colateral de um ETA.

---

## 6. OFFLINE E FALHA

Regra da casa: **erro nunca vira vazio, e nunca vira otimismo.** O `eta.ts` já
implementa os 3 estados corretamente e o comentário do arquivo (linhas 15-26)
documenta a lição. O que segue é como estender isso para o aviso proativo.

### A arquitetura já é offline-resiliente (e isso é sorte de projeto)

A notificação local com trigger `DATE` **dispara sem rede** — inclusive em modo
avião. Então:

- **Calcula quando tem rede** (de manhã, geralmente no Wi-Fi de casa).
- **Agenda a notificação local** com o horário de saída resultante.
- Ela dispara no horário, offline, dentro do túnel, no subsolo do prédio.
- A confirmação (toque 3) é **best-effort**: sem rede, o aviso da manhã vale e
  ninguém é avisado de nada errado.

Isso é melhor do que a maioria dos apps de campo entrega.

### O que a tela mostra quando não dá pra calcular

| Situação | O que mostra | O que NUNCA faz |
|---|---|---|
| Sem rede na hora do cálculo matinal | "Não deu pra checar o trânsito. Lembrete normal: 1h antes." | Estimar por linha reta e chamar de ETA |
| Endereço não geocodificável | "Não reconheci este endereço." + botão "Corrigir endereço" | Sumir com o card |
| Worker fora / cota estourada | Silêncio + lembrete fixo | Notificar "saia agora" sem base |
| Cálculo velho (>3h) e sem rede pra confirmar | Mostra o horário **com o carimbo**: "calculado às 07h12" | Apresentar número velho como atual |

O último é o mais importante e o mais fácil de errar: **um ETA sem carimbo de
hora é uma mentira em potência.** Se o número tem 6 horas, o prestador merece
saber que tem 6 horas.

### O caso que o desenho não cobre (e precisa ser dito)

Se o prestador estiver **num lugar diferente do previsto** (o serviço anterior
atrasou, ele foi almoçar longe), o Desenho A calcula da origem errada e o aviso
sai errado — sem o app ter como saber. Mitigação honesta, sem GPS: o toque 2 abre
com uma pergunta de um toque:

> Saia agora para o João Silva (15h).
> *Está em outro lugar? **Recalcular daqui**.*

"Recalcular daqui" é o único ponto que pede localização — **uma vez, sob toque
explícito**, e só quando `expo-location` existir. Sem ele, o botão simplesmente
não aparece (mesmo padrão de gate que o `temDestinoEta` já usa). Nada quebra.

---

## 7. O PULO DO GATO — o que isso destrava

Ordenados por (valor ÷ esforço). Custo de API já contado na seção 4 salvo nota.

### 7.1 — Agenda impossível (o maior de todos)

Hoje `agenda.ts` detecta **sobreposição de horário** (linha 189+). Não detecta
**sobreposição de deslocamento**: 14h no centro e 15h no bairro a 50 min dali não
se sobrepõem no relógio, e são fisicamente impossíveis.

No momento de salvar o agendamento:

> ⚠ Da visita das 14h até essa dá **50 min de trânsito**. Você marcou 1h de
> diferença e a primeira dura 45 min. **Não cabe.**
> [Marcar 15h30] [Salvar assim mesmo]

- **Pro prestador:** deixa de vender um horário que ele vai furar. Furar horário
  é a forma nº 1 de perder cliente no serviço de campo. Isso não economiza tempo
  dele — **protege a reputação dele**, que vale mais.
- **Esforço:** M. Reusa `getEta` + a lógica de sobreposição que já existe.
- **Custo:** 1 chamada Pro por agendamento salvo com endereço distante (~US$ 0,01
  por 1 agendamento). Volume baixíssimo — é evento de cadastro, não de loop.
- **Se a rede cair:** não avisa nada e salva normal. Um aviso a menos nunca
  bloqueia salvar. (Regra: nunca transformar "não sei" em "não pode".)
- **Nenhum concorrente de PME brasileira faz isso.** ERPs grandes de field service
  fazem; ferramenta de prestador sozinho, não.

### 7.2 — Avisar o CLIENTE com janela de chegada

Já existe "Estou a caminho" com os minutos (`mensagemEstouACaminho`), disparado
manualmente pelo prestador. Duas evoluções:

**(a) Janela em vez de ponto.** "Chego ~15h" vira uma promessa exata que o
trânsito quebra. Melhor: *"Chego entre 14h50 e 15h10"*. Mais honesto e mais fácil
de cumprir. Esforço: **P** (é string), custo zero — reusa o ETA já calculado.

**(b) Sugerir o envio no toque 2.** Quando a Olli avisa "saia agora", a mesma
notificação oferece *"Avisar o João"*. Um toque, WhatsApp já preenchido. Custo
zero (reusa o mesmo ETA). Esforço: **P**.

Isso não é firula: "o técnico não avisou que ia atrasar" é a reclamação nº 1 de
serviço de campo no Brasil, e ela é resolvida por uma mensagem de 8 palavras.

### 7.3 — Deslocamento no orçamento

O `/eta` já devolve `distanciaKm` (`worker/src/index.js:406`) e o app já carrega
(`eta.ts:190`). Ninguém usa esse número.

Ao montar um orçamento com endereço fora de um raio configurável:

> Esse cliente fica a **23 km**. Sua taxa é R$ 2,50/km → **R$ 57,50**.
> [Incluir "Deslocamento — 23 km"]

- **Pro prestador:** dinheiro que ele hoje come calado. Prestador brasileiro
  sistematicamente não cobra deslocamento porque dá vergonha estimar na hora.
  Com o número na tela, ele cobra.
- **Esforço:** M (precisa de config de taxa/km + raio livre por prestador).
- **Custo:** ~1 chamada por orçamento com endereço distante. Baixo volume.
- **Se a rede cair:** o campo simplesmente não é sugerido. Nada quebra.
- Combina com `verticais.ts` — dedetizador e HVAC têm raios e taxas diferentes.

### 7.4 — Ordem das visitas do dia

`RoutingProvider.otimizarRoteiro` já está **desenhado** na porta
(`src/services/ports/RoutingProvider.ts:33`) e **não implementado**.

**RECOMENDO NÃO FAZER AGORA.** Justificativa na seção 8.

---

## 8. O QUE **NÃO** FAZER (e por quê)

Um documento que só diz "vamos fazer tudo" não serve pra decidir nada.

**Não instalar `expo-location` para essa feature.**
O Desenho A não precisa. Instalar arrasta prebuild, permissão nova, Data safety,
revisão de política e um risco de review — para responder pior a pergunta.
Quando `expo-location` entrar (Onda 8, por causa da equipe ao vivo), o ETA "ao
vivo" volta sozinho: `temDestinoEta` já tem o gate pronto e comentado.

**Não fazer o `<MapView>` embutido agora.**
`docs/KNOWN_BLOCKERS.md` B4 já diz que só falta código. Mas: prebuild + chave
client-side (`EXPO_PUBLIC_MAPS_KEY`) + SKU de Maps SDK + peso no APK — e **zero**
contribuição para "a que horas eu saio". O deep-link do `rotas.ts` já leva ele
pro Google Maps de verdade, que é onde ele quer navegar mesmo. Mapa bonito dentro
do app é vaidade de produto; o prestador vai usar o Waze/Maps de qualquer jeito.

**Não implementar roteirização (`otimizarRoteiro`) na v1.**
Três motivos: (1) usa Route Matrix — o custo escala com **N²**, não com N;
6 paradas = 36 pares; (2) prestador brasileiro raramente tem liberdade de reordenar
o dia (o cliente marcou hora); (3) resolve um problema que ele não tem. Fica pra
quando existir cliente com 12+ visitas/dia e horário flexível. Se um dia entrar,
entra atrás da porta que já está desenhada — o desenho está certo, o timing é que não é agora.

**Não usar `TRAFFIC_AWARE_OPTIMAL`.**
Mesmo SKU Pro, latência maior, ganho de precisão irrelevante numa janela de folga
de 5-10 min.

**Não ligar essa feature no plano grátis.**
É a única feature do OLLI com custo marginal por uso vindo de terceiro caro. Se
entrar no grátis, o pior usuário define a conta.

**Não notificar por variação pequena.**
Já dito, mas repetindo porque é o erro que mata canais de notificação: abaixo de
12 min, silêncio. O prestador não desliga a notificação — ele desinstala o app.

**Não mostrar ETA sem carimbo de hora do cálculo.**
Número velho apresentado como atual é a versão sofisticada de "erro vira vazio".

---

## 9. FASES DE IMPLEMENTAÇÃO

### Fase 0 — Consertar o que já existe (nada de novo pro usuário)
**Esforço: M. Sem isso, o resto é caro e errado.**

1. `departureTime` no `handleEta` do worker — sem isso o cálculo matinal está
   errado e ninguém percebe. **É o item mais importante do documento.**
2. Aceitar `routingPreference` no corpo (`TRAFFIC_UNAWARE` para planejamento) —
   metade do preço, dobro do free tier.
3. Coluna `lat`/`lng` em `clientes`; geocodificar no **save**, não no ETA;
   migração + cache persistente. Mata o furo de custo do `Map` em memória.
4. Budget + alerta no Google Cloud **(passo humano — seção 10)**.
5. Contador mensal por conta no worker, com `motivo: 'cota_mensal'`.

**Risco:** baixo. Nada disso muda tela. Item 3 mexe em schema — migração
aditiva, `lat`/`lng` nulos são tratados como "geocodificar na próxima".

### Fase 1 — O aviso que o dono pediu
**Esforço: M.**

6. `origemParaVisita(agendamento)` — visita anterior do dia ou `Empresa.endereco`.
7. Haversine local como filtro de < 3 km (corte 1). Sem rede, sem custo.
8. `montarBomDia` ganha a linha "saia às HH:MM".
9. Toque 2: substitui o lembrete fixo pelo lembrete calculado, com fallback
   explícito para os 60 min fixos quando o cálculo falha.
10. Carimbo de hora do cálculo em toda exibição de ETA.

**Resultado:** funciona no APK, sem permissão nova, sem prebuild.

### Fase 2 — Trânsito que muda
**Esforço: P.**

11. Recálculo de confirmação ~40 min antes, com limiar de 12 min.
12. Cache persistente de trajeto (corte 3) — começa a render depois de semanas.

### Fase 3 — O pulo do gato
**Esforço: M cada, independentes entre si.**

13. Agenda impossível (7.1) — **faça esse primeiro dos três**.
14. Janela de chegada + "Avisar o João" no toque 2 (7.2).
15. Deslocamento no orçamento (7.3).

### Fase 4 — Provavelmente nunca
16. `<MapView>` embutido. 17. Roteirização. Ver seção 8.

---

## 10. PASSOS QUE DEPENDEM DO DONO

Nenhum é longo. Três são bloqueantes.

| # | Passo | Bloqueia | Tempo |
|---|---|---|---|
| 1 | **Budget + alerta de gasto no Google Cloud** (projeto `olli-orcamentos`), com corte no teto. Sugestão inicial: US$ 25/mês. | **Fase 0 item 4 — bloqueante.** Hoje não há teto nenhum. | 5 min |
| 2 | **Decidir em que plano a feature entra.** Recomendação: R$ 39 e R$ 99; nunca no grátis. | Fase 1 | decisão |
| 3 | **Aprovar o Desenho A** (origem cadastrada, sem GPS) — ou dizer que quer o B e aceitar prebuild + permissão + review de loja. | Fase 1 — **bloqueante** | decisão |
| 4 | Confirmar na chave `OLLI_ROUTES_API_KEY` que **Geocoding e Routes** estão habilitados e que a restrição de API continua fechada. Já estava OK em 10/07; vale reconferir antes de aumentar volume. | Fase 0 | 3 min |
| 5 | **Ler os textos das 3 notificações** antes de irem ao ar. Elas falam em nome dele, para o cliente dele. | Fase 1 | 10 min |
| 6 | Definir a taxa padrão de deslocamento (R$/km) e o raio livre sugeridos. | Fase 3 item 15 | decisão |

---

## 11. RESUMO EM SEIS LINHAS

1. O ETA já existe e está no ar — mas **só na web**; no APK o gate o desliga.
2. O que você pediu (o aviso "saia às 14h20") **não existe** e é o que falta.
3. Ele **não precisa de GPS** — a origem certa é a visita anterior ou a empresa,
   dado que o app já tem. Sem permissão nova, sem prebuild, sem passo de loja.
4. O worker não manda `departureTime`: o número da manhã está errado hoje e
   ninguém percebe. **Consertar isso antes de qualquer feature nova.**
5. Custo com os cortes: **~R$ 3,70 a R$ 6,10 por prestador/mês**; grátis até
   ~68 prestadores. Sem os cortes, R$ 13,50 — 35% de um plano de R$ 39.
6. Não existe teto de gasto na conta hoje. **Botar o budget antes de escalar.**

---

## 12. O QUE FOI CONSTRUÍDO EM 18/07

A síntese de longo prazo (`VISAO_FABLE.md`) discordou deste documento quanto ao
timing e recomendou **só a Fase 0 agora**. Foi o que se fez: a **fundação no
worker**, que é a metade que não depende de permissão de localização no
aparelho — logo, sem passo de loja, sem política de privacidade nova, sem
prebuild, sem revisão.

### 12.1. O que existe agora

| Peça | Arquivo | Estado |
|---|---|---|
| `POST /eta/saida` — origem + destino + horário de chegada → **hora de sair** | `worker/src/etaSaida.js` (novo, ~570 linhas) | **pronto, não deployado** |
| `departureTime` (trânsito **previsto** para a hora da saída) | `etaSaida.js` → `chamarRotas` | **resolvido** — era "o item mais importante do documento" (seção 9, item 1) |
| Escolha de SKU por chamada (`modo`) | `etaSaida.js` → `MODOS` | **resolvido** (seção 9, item 2) |
| Cache persistente de trajeto + de geocodificação | `etaSaida.js` → `lerCacheTrajeto` / `lerCacheGeocode` | **código pronto; tabelas NÃO criadas** (ver 12.5) |
| Rate limit fail-closed antes do fetch pago | `etaSaida.js`, binding `ETA_RL` que já existia | **pronto** |
| Rota registrada | `worker/src/index.js` (`/eta/saida`) | **pronto** |
| Teste + mutation check | `scripts/teste-eta-saida.ts`, na cadeia do `npm test` | **137 asserções, verde** |
| Contador mensal de cota por conta | — | **NÃO feito** (ver 12.5) |
| Qualquer coisa ligada no app | — | **NÃO feito de propósito** — `src/` é de outro agente nesta onda |

**Gates:** `node --check` verde nos dois `.js`; `npm run typecheck` exit 0;
`npm test` exit 0 com as 17 suítes (a nova soma 137 asserções).

### 12.2. O contrato (para a próxima leva ligar no app)

```
POST /eta/saida            Authorization: Bearer <jwt do Supabase>
{
  "origem":   "Rua X, 123, São Paulo/SP"  |  { "lat": -23.55, "lng": -46.63 },
  "destino":  "Rua Y, 456, Santo André"   |  { "lat": -23.66, "lng": -46.54 },
  "chegarEm": "2026-07-18T15:00:00-03:00",    // ISO 8601 COM fuso. Obrigatório.
  "modo":     "planejamento" | "confirmacao", // Obrigatório. Decide o SKU.
  "folgaMin": 8                                // Opcional, 0..120.
}
```

**Sucesso**

```jsonc
{ "ok": true, "estado": "ok",
  "minutos": 32, "minutosSemTransito": 27, "distanciaKm": 18.4,
  "sairEm": "2026-07-18T17:22:48.000Z",        // a resposta à pergunta do dono
  "chegarEm": "2026-07-18T18:00:00.000Z",
  "sairAgoraChegaEm": "2026-07-18T13:32:00.000Z",
  "folgaMin": 5, "atrasado": false, "comTransito": true,
  "modo": "confirmacao", "sku": "pro", "cache": false,
  "calculadoEm": "2026-07-18T13:00:00.000Z" }   // carimbo — ver 12.4
```

**Os três estados** (a regra dura do brief; nunca dois):

| `estado` | Quando | O que a UI faz | O que NUNCA vem junto |
|---|---|---|---|
| `ok` | deu certo | mostra a hora de sair **com o carimbo** | — |
| `indisponivel` | rede/API/cota/limite/config (`erro` nomeia qual) | "Não deu pra checar o trânsito" + **lembrete fixo de 1h que já existe** | qualquer número |
| `endereco_insuficiente` | endereço não geocodifica (`qual`: origem/destino/ambos) | "Não reconheci este endereço" + botão **Corrigir endereço** | qualquer número |

`atrasado: true` **não é um quarto estado** — é sucesso com uma verdade
desconfortável ("a hora de sair já passou"). Junto vem `sairAgoraChegaEm`, para
a UI dizer *"saindo agora você chega 15h07 — avisar o João?"* em vez de esconder
o atraso. Isso alimenta direto o item 7.2 (avisar o cliente).

**Duas exigências do contrato que parecem chatice e não são:**

1. **`chegarEm` precisa de fuso.** `"2026-07-18T15:00:00"` é recusado
   (`chegar_em_sem_fuso`). Sem designador, "15h" pode ser 15h em qualquer fuso do
   planeta — e um horário de chegada ambíguo erra a hora de sair por horas.
   Recusar é melhor que adivinhar.
2. **`modo` não tem default.** Um default esconderia no worker uma decisão de
   custo que é do call site (Essentials vs Pro = metade do preço e o dobro da
   franquia). Sem `modo` a resposta é `modo_invalido` e **nenhuma chamada paga
   acontece**.

### 12.3. CUSTO — medido, não estimado

Preços reconferidos na página oficial em **18/07/2026** (idênticos aos de 17/07):
Essentials **10.000 grátis/mês · US$ 5,00/1.000** · Pro **5.000 grátis/mês ·
US$ 10,00/1.000** · Geocoding **10.000 grátis/mês · US$ 5,00/1.000**. A regra de
SKU foi reconfirmada na página de billing da Routes API: o Pro é cobrado em
requisições que usam "advanced features, such as the `TRAFFIC_AWARE` or
`TRAFFIC_AWARE_OPTIMAL` route modifiers". Câmbio **US$ 1 = R$ 5,11** (18/07/2026).

Cenário do brief: **6 visitas/dia × 22 dias = 132 visitas/mês**, plano de R$ 39.

| Desenho | Chamadas/mês | US$ | R$/prestador/mês | % do plano |
|---|---|---|---|---|
| **A** — ingênuo (2× `TRAFFIC_AWARE` por visita) | 264 Pro | 2,64 | **13,49** | 34,6% |
| **B** — `/eta/saida` sem cache (1 plan + 1 confirm) | 132 Ess + 132 Pro | 1,98 | **10,12** | 25,9% |
| **C** — B + cache de planejamento a 60% | 53 Ess + 132 Pro | 1,58 | **8,10** | 20,8% |
| **D** — C + confirmar **só a próxima parada** (2/dia) | 53 Ess + 44 Pro | 0,71 | **3,60** | 9,2% |
| **E** — D + geocoding de 20 clientes novos/mês | 53 Ess + 44 Pro + 20 Geo | 0,81 | **4,11** | 10,5% |

**Economia medida sobre o desenho ingênuo: 69,5% (R$ 13,49 → R$ 4,11).**
Decomposta:

- **split de SKU** (planejamento vira Essentials): **25,0%** — R$ 3,37
- **cache de trajeto sozinho**, a 60% de acerto: **19,9%** — R$ 2,02
- **chamar menos** (confirmar só a próxima parada): o resto, e é a maior fatia

Franquia grátis (é da **conta**, não por usuário) — gargalo sempre no Pro:

| Desenho | Prestadores de graça |
|---|---|
| A (ingênuo) | **18** |
| B (sem cache) | **37** |
| E (recomendado) | **113** |

> ⚠️ A taxa de acerto de 60% é **hipótese**, não medida — não há dado real de
> repetição de trajeto ainda. A tabela do script varre 30/50/60/80% e a
> conclusão não muda de sinal em nenhuma faixa. Medir de verdade é possível hoje:
> o campo `cache` vem em toda resposta.

### 12.4. Duas DISCORDÂNCIAS com este documento (leia antes de seguir a seção 4)

**(a) O "corte 1 — filtro de haversine" NÃO foi implementado, e não deve ser.**

A seção 4 propõe: se a distância em linha reta for < 3 km, não chamar a API e
mostrar *"~10 min, pertinho"*. **Isso é um ETA otimista chutado**, e o brief
desta onda proíbe explicitamente: *"NUNCA devolva um ETA otimista chutado —
errar a hora de sair faz o prestador chegar atrasado no cliente, que é pior que
não ter a função."* Dois quilômetros e meio em Copacabana às 18h não são 10
minutos. O número seria apresentado com a mesma cara de certeza do número real, e
o prestador não teria como distinguir.

O que foi feito no lugar: a haversine existe (`haversineKm`), mas **só como
sanidade offline** — acima de 600 km entre duas visitas do mesmo dia, a resposta
é `endereco_insuficiente` (quase certamente geocodificação no estado errado), e
isso **antes** de gastar a chamada paga. Ela nunca vira duração.

Consequência honesta: **o desenho aqui é mais caro em baixa escala do que o que a
seção 4 projetava** (37 prestadores grátis em vez de ~68 no desenho B). A
diferença é o preço de não mentir. E a tabela 12.3 mostra que a alavanca perdida
é recuperada com folga pelo item (b).

**(b) O "corte 3 — cache" foi implementado, mas o documento superestima o que
ele pode fazer.**

Cache corta o lado **barato**. O lado **caro** (Pro / `TRAFFIC_AWARE`) é
incomprimível por cache **sem mentir**: o valor de `TRAFFIC_AWARE` é o trânsito
de *agora*: servi-lo de um cache de horas é apresentar número velho como atual.
Por isso os TTLs são deliberadamente assimétricos:

- `planejamento` (TRAFFIC_UNAWARE): **30 dias.** É a via em fluxo livre; só muda
  com obra. Trinta e não sete porque o padrão de ouro do público é o cliente
  **semanal** — com TTL de 7 dias a visita semanal cai exatamente na borda e o
  cache erra justo o caso que ele existe para pegar.
- `confirmacao` (TRAFFIC_AWARE): **10 minutos.**

**A alavanca de verdade do lado caro não é cache, é chamar menos:** confirmar só
a **próxima** parada (~2/dia), não as 6 do dia. Isso cai direto do desenho do
produto — o "Toque 2" da seção 2 é sobre a próxima visita — e sozinho leva de
R$ 8,10 para R$ 3,60. **Este é o parágrafo que a próxima leva precisa ler antes
de escrever o cliente no app.**

### 12.5. O QUE FALTA (ordenado; nada disso está feito)

1. **Migration das duas tabelas de cache — bloqueia a economia de 12.3.**
   O código já lê e grava; enquanto as tabelas não existirem, toda leitura
   devolve `null` e toda escrita é engolida (padrão do `cnpj_cache`: cache que
   derruba a rota é pior que cache nenhum). **A rota funciona hoje sem elas — só
   mais cara.** DDL a aplicar (não apliquei: migration não é desta onda):

   ```sql
   create table if not exists public.eta_cache (
     chave         text primary key,
     duracao_seg   integer not null,
     distancia_m   integer,
     atualizado_em timestamptz not null default now()
   );
   create table if not exists public.geocode_cache (
     endereco_norm text primary key,
     lat           double precision not null,
     lng           double precision not null,
     formatado     text,
     atualizado_em timestamptz not null default now()
   );
   -- Sem RLS de usuário de propósito: são caches de dado público (tempo de via,
   -- coordenada de endereço), escritos e lidos SÓ pelo worker com service_role.
   -- Nenhuma linha identifica prestador ou cliente — a chave é coordenada
   -- arredondada + faixa de hora. Nada de PII entra aqui.
   ```

2. **Contador mensal de cota por conta** (Fase 0, item 5 da seção 9). **Não
   fiz de propósito:** um contador que falha aberto porque a tabela não existe é
   o bug `olli-gate-erro-vira-vazio` na camada de dinheiro — pior que a ausência
   dele, porque dá a impressão de que há teto. Entra junto com a migration
   acima, e o `estado:'indisponivel'` + `erro:'cota_mensal'` já cabe no contrato
   sem mudar nada no app.

3. **Budget + alerta no Google Cloud com corte no teto — passo humano, 5 min,
   BLOQUEANTE.** Continua valendo, e agora com o número medido: o `ETA_RL` é
   teto de **rajada** (20/min/usuário), não orçamento. Uma conta no talo por um
   mês = 864.000 chamadas Pro = **US$ 8.640 ≈ R$ 44.150**. Rate limit não
   substitui budget; são coisas diferentes.

4. **Ligar no app** (`src/`) — fora do escopo desta onda. Ordem sugerida, já
   com o contrato de 12.2: `origemParaVisita()` → linha "saia às HH:MM" no
   `montarBomDia` → toque 2 substituindo o lembrete fixo (com fallback explícito
   para os 60 min quando `estado !== 'ok'`) → carimbo `calculadoEm` visível em
   toda exibição.

5. **Decisão do dono (seção 10, itens 2 e 3):** em que plano entra, e aprovar o
   Desenho A. Nada do que foi construído depende disso, mas ligar no app depende.

### 12.6. Sobre o teste — e o buraco que o mutation check achou

`scripts/teste-eta-saida.ts`, **137 asserções**, na cadeia do `npm test`. Roda
offline: a resposta do Google é mockada, nenhuma chamada paga, nenhuma chave.

**Mutation check: 15 mutações, 15 pegas, 0 sobreviventes.** Quantas asserções
caem por mutação:

| Mutação (bug plantado de propósito) | Asserções que caem |
|---|---|
| falha da Routes API vira ETA chutado de 15 min | **20** |
| folga zerada (chegar exatamente na hora) | 7 |
| rate limit vira fail-open (o incidente real de produção) | 6 |
| geocoding fora do ar vira "endereço não existe" | 4 |
| não manda `departureTime` (o bug do `/eta` atual) | 3 |
| TTL do cache ignorado / sanidade de distância removida / `modo` ganha default | 3 cada |
| duração ilegível vira 0 / horário sem fuso aceito / chave vaza na resposta | 2 cada |
| SKU errado / `departureTime` no passado / cache velho com hora de agora / `minutosSemTransito` copiado | 1 cada |

**A primeira rodada teve 1 sobrevivente, e ele valia a rodada inteira:** a
Geocoding API responde **HTTP 200** com `OVER_QUERY_LIMIT`, `REQUEST_DENIED` ou
`UNKNOWN_ERROR` no corpo. O código tratava certo, mas **nenhum teste cobria** —
então nada impedia alguém de "simplificar" para `status !== 'OK' →
nao_encontrado`. Isso é exatamente `olli-gate-erro-vira-vazio` na sua forma mais
provável: no dia em que a cota estourar, o app mandaria **todo mundo ao mesmo
tempo** reescrever endereços que estavam certos. Hoje há 8 asserções prendendo os
quatro status.

---

## Fontes

- [Google Maps Platform core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) — **reconferido 18/07/2026**: Compute Routes Essentials 10.000 grátis · US$ 5,00/1.000; Pro 5.000 grátis · US$ 10,00/1.000; Enterprise 1.000 grátis · US$ 15,00/1.000; Geocoding 10.000 grátis · US$ 5,00/1.000
- [Routes API Usage and Billing — Google for Developers](https://developers.google.com/maps/documentation/routes/usage-and-billing) — **reconferido 18/07/2026**: Pro é cobrado em requisições com `TRAFFIC_AWARE`/`TRAFFIC_AWARE_OPTIMAL`
- [Method: computeRoutes — referência REST](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) — **reconferido 18/07/2026**: `departureTime` no passado **só** é aceito quando `travelMode` é `TRANSIT` (daí o piso em "agora + 30s" no `departureTimeMs`); `duration` (com trânsito) vs `staticDuration` (sem)
- [Google Maps Platform pricing overview](https://developers.google.com/maps/billing-and-pricing/overview) — fim do crédito recorrente de US$ 200 em 01/03/2025, substituído por franquia mensal grátis por SKU

*(As quatro primeiras fontes foram consultadas em 17/07 e **reconferidas em
18/07/2026**: nenhum preço, franquia ou regra de SKU mudou entre as duas datas.)*

### Fontes internas (código lido, não presumido)

`worker/src/index.js` (`handleEta` 354, `handleGeocode` 518) · `worker/wrangler.jsonc:47`
(ETA_RL) · `src/services/eta.ts` · `src/services/localizacaoEquipe.ts:62` ·
`src/services/agenda.ts` (`agendarLembrete` 106, `MINUTOS_ANTECEDENCIA_LEMBRETE` 22) ·
`src/services/ritualDiario.ts` (`montarBomDia` 157) · `src/services/rotas.ts` ·
`src/services/ports/RoutingProvider.ts` · `src/services/cep.ts` ·
`src/types/index.ts` (Empresa 93, Cliente 152, Agendamento 407) ·
`src/components/EtaChip.tsx` · `src/screens/HomeScreen.tsx` ·
`src/screens/desktop/InicioDesktopScreen.tsx` · `app.json:27` ·
`src/services/entitlements.ts:16` · `docs/KNOWN_BLOCKERS.md` (B4)

**Escrito nesta onda (18/07):** `worker/src/etaSaida.js` (novo) ·
`worker/src/index.js` (rota `/eta/saida`) · `scripts/teste-eta-saida.ts` (novo) ·
`package.json` (`test:eta-saida` na cadeia do `npm test`).
