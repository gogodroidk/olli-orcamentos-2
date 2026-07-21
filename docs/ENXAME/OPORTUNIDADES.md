# OPORTUNIDADES — a síntese das três pesquisas

> Escrito em **21/07/2026**. Lê e concilia `PESQUISA_APIS_2026.md`,
> `PESQUISA_OPENSOURCE.md`, `PESQUISA_CONCORRENCIA_2026.md`, `NEGOCIO_DECISAO.md`
> e `VISAO_FABLE.md`.
> Sou **read-only**: não editei uma linha de código. Tudo que digo que o OLLI "tem"
> ou "não tem" está conferido por `grep`/leitura, com o arquivo citado.
> **Refiz na fonte primária** os quatro números que decidem alguma coisa aqui —
> preço de API, licença e data de lei mudam, e três dos documentos que li se
> contradizem em pelo menos um ponto cada.
> Câmbio: **US$ 1 = R$ 5,15** (arredondado para cima de R$ 5,11 —
> [Investing, 20/07/2026](https://br.investing.com/currencies/usd-brl)).

---

> **Com pressa?** Pule para **"Se você só ler seis linhas"**, no fim. As seções 2 e 3
> (o que **não** fazer, e as armadilhas) valem mais tempo que a seção 1.

---

## O filtro, em uma linha

Uma pessoa. Zero pagantes. R$ 0 de aporte. **Tudo que custa mensalidade fixa,
exige aprovação de terceiro ou pede manutenção contínua está morto antes da
análise** — e isso mata a maior parte das ideias boas deste repositório.

---

## 1. AS 3 COISAS QUE MAIS VALEM A PENA ENTRAR NO PRODUTO

Em ordem. Só três. As três custam **R$ 0,00** em API e **nenhuma** depende de
aprovação de ninguém — foi assim que foram escolhidas.

---

### 1º — Publicar na web os 698 códigos de erro e as calculadoras de ofício

**Isto não é uma feature nova. É publicar um ativo que já está pronto e trancado
dentro do APK.**

Conferido: `assets/codigos_erro.json` tem **698 registros, 23 marcas, 365 KB**, e
**100% dos registros têm URL de fonte** (campo `url`). `src/services/calculosOficio.ts`
tem **12 calculadoras de ofício** em 65 KB (BTU, carga de gás, superaquecimento,
disjuntor/bitola, queda de tensão, eletroduto, água fria por pesos, perda de carga,
fossa séptica, diluição de tinta, grama, adubação). A landing Astro já tem rota
dinâmica funcionando em três lugares (`web/src/pages/blog/[slug].astro`,
`blog/categoria/[categoria]/[...page].astro`, `para/[oficio].astro`) — o caminho
está trilhado.

**O que resolve PARA O PRESTADOR:** ele acha o OLLI às 21h, de luva, digitando
*"erro E5 Gree ar condicionado"* — e não digitando *"software de ordem de serviço"*,
que é uma busca que ele nunca fez na vida. Hoje, quem responde essa busca é o
concorrente: o Auvo publica **dez** ferramentas grátis, entre elas o "Auvo Busca
Erro" ([auvo.com/ferramentas-gratuitas](https://www.auvo.com/ferramentas-gratuitas),
21/07/2026). O OLLI tem a mesma munição e não atirou.

| | |
|---|---|
| **Esforço** | **P** para os códigos de erro (o dado existe, o padrão de rota existe) · **M** para as calculadoras (precisam de interatividade no cliente) |
| **Custo hoje** | **R$ 0,00** — Astro estático no Cloudflare Pages que já está pago |
| **Custo em escala** | **R$ 0,00**. Nenhuma chamada de API, nenhuma IA, nenhum banco |
| **Sem rede** | Não se aplica — é página pública de aquisição, não é o app |

**⚠️ A armadilha embutida, e ela é séria: NÃO faça 698 páginas.** 698 páginas com
três linhas cada é o padrão que o Google chama de *thin content* e penaliza. A forma
certa é **~15 páginas por marca** — as 8 maiores (Gree 136, Fujitsu 124, Samsung 70,
Philco 50, Midea/Springer 41, LG 38, Carrier 33, Consul 28) já cobrem **520 dos 698
códigos (75%)** — cada uma com a tabela completa daquela marca e busca no cliente.
E **cite a URL de fonte que cada registro já carrega**: os campos `causa` e `acao`
parecem ser texto próprio do OLLI, mas reproduzir a tabela do manual do fabricante
palavra por palavra numa página pública com intenção de SEO é convite para
notificação. Fato não tem dono; o texto do manual tem.

**Por que é o nº 1:** é a única coisa das três que **traz gente nova sem gastar
dinheiro e sem exigir equipe**. As outras duas melhoram o produto para quem já
chegou. Esta cria quem chega. A `PESQUISA_CONCORRENCIA` fecha com a mesma
conclusão, e eu concordo sem ressalva.

---

### 2º — NFS-e **preparada** (não emitida) + a página que responde a obrigação

**Conferido no código:** `src/services/ports/FiscalProvider.ts` é interface pura,
sem implementação. Não há nada a desfazer. E `grep -riE "nfs-e|nfse"` em `web/src`
volta só **menções de passagem** no `index.astro` — **não existe página sobre nota
fiscal na landing.**

O app monta tomador, CPF/CNPJ, endereço, discriminação, valor e código de tributação
sugerido pelo CNAE que o `/cnpj` já devolve — copia num formato colável e leva o
prestador ao Emissor Nacional. **Ele confere e assina.** Zero certificado guardado,
zero provedor, zero responsabilidade fiscal.

| | |
|---|---|
| **Esforço** | **M** — o grosso é a tela de conferência, porque **não há integração** |
| **Custo hoje / em escala** | **R$ 0,00 / R$ 0,00** |
| **Sem rede** | A nota fica **pendente**, o serviço fecha normal. Travar o fechamento por causa da nota seria o pior desenho possível |

**🚨 Aqui eu corrijo os dois documentos de estratégia, e a correção muda a copy.**

O `VISAO_FABLE.md` §3 diz: *"Em 01/09/2026, MEI, ME e EPP do Simples — ou seja, o
público inteiro do OLLI — passam a ser obrigados"*. O `NEGOCIO_DECISAO.md` §3 repete
(*"em 01/09 todo o seu público vira obrigado"*).

**Para MEI, isso está errado. O MEI prestador de serviço já é obrigado ao Emissor
Nacional desde 1º de setembro de 2023**, pela Resolução CGSN nº 169/2022
([Portal da NFS-e / gov.br](https://www.gov.br/nfse/pt-br/mei-prestadores-de-servico-de-todo-o-pais-estao-obrigados-a-emitir-nfs-e),
lido em 21/07/2026). A Resolução CGSN nº 189/2026, publicada em **28/04/2026**, é
a que estende a obrigação a **ME e EPP a partir de 01/09/2026**
([Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional) ·
[Portal NFS-e](https://www.gov.br/nfse/pt-br/noticias/nfs-e-e-simples-nacional-obrigatoriedade-de-emissao-atraves-do-emissor-nacional),
ambos lidos em 21/07/2026). **Não achei nenhuma notícia de adiamento.**

**O que isso muda, e é para melhor:**

1. **A dor é HOJE, não em setembro.** O MEI — o público-alvo declarado do OLLI —
   já está obrigado há três anos e já redigita tudo no gov.br toda semana. A feature
   ficou mais urgente, não menos.
2. **A onda de busca de agosto é de ME/EPP e de contador**, não de MEI. É outra
   intenção de busca e outro texto de página.
3. **Se a landing disser a um MEI "a partir de setembro você será obrigado", está
   mentindo para ele.** O projeto já tem uma entrada de memória inteira chamada
   *"copy tem que ser derivada da fonte"*, e este é exatamente o mesmo defeito, com
   agravante: o primeiro contador que ler derruba a credibilidade da página inteira.

**Regra da casa respeitada:** `docs/INTEGRATION_BACKLOG.md` proíbe emitir nota antes
de financeiro e status estarem sólidos. **Preparar não é emitir.** Não viola.

---

### 3º — A fila de saída (outbox) do sync — 200 linhas, zero dependência

**Este é o item que faz a landing parar de prometer o que o código não entrega.**

Conferido, linha por linha:

- `src/services/cloudSync.ts` (2.255 linhas) declara no cabeçalho: *"NUNCA lança —
  offline / deslogado / sem-config = **no-op silencioso**"*. São **70 blocos `catch`**
  e nenhum reenfileiramento. `grep -niE "fila_sync|outbox|reenfileira"` no arquivo →
  **zero linhas**.
- A única reconciliação completa é `syncOnLogin()`, e o **único** chamador é
  `App.tsx:303`, na mudança de estado de autenticação.
- **Não existe `AppState` listener que re-sincronize.** O único `AppState` do fluxo
  é o de `BarraOffline.tsx:126`, que só controla a sonda visual.
- E a landing que está **no ar** promete, em `web/src/pages/index.astro:148`:
  *"O app guarda tudo no próprio celular e **sincroniza quando a rede volta**"*.

**Traduzindo para o campo:** o técnico edita a OS no subsolo, sem sinal. O push falha
em silêncio. **Nada reenfileira.** O dado sobe quando o app for **reaberto** com
sessão — e o comportamento normal de quem trabalha na rua é deixar o app aberto o dia
inteiro. Não é perda de dado (o SQLite é a fonte da verdade e ele está lá), mas é o
painel desatualizado, é o sócio no escritório não vendo o serviço, e é a promessa da
landing sendo falsa exatamente no cenário que ela cita.

**A solução, e é escrever, não instalar:** uma tabela `fila_sync` no SQLite que já
existe — `(tabela, item_id, operacao, atualizado_em, tentativas)`. `pushRow`/`removeRow`
gravam nela **antes** de tentar a rede; sucesso apaga a linha; o flush roda quando a
rede volta e no `AppState` voltando a `active`. Mesma semântica LWW/tombstone que o
arquivo já implementa — só que durável.

| | |
|---|---|
| **Esforço** | **M** — 150 a 250 linhas, dentro de um arquivo cujo autor já entendeu o problema |
| **Custo hoje / em escala** | **R$ 0,00 / R$ 0,00**. Dependência nova: **zero**. Bundle: **zero** |
| **Sem rede** | É exatamente o caso que passa a funcionar. Bônus: a `BarraOffline` para de estimar pendências e passa a ler `SELECT count(*) FROM fila_sync` |

**Por que agora e não depois:** os próximos 30 dias são os 10 primeiros técnicos
instalados na mão. É a única janela da história do produto em que um bug de sync
acontece **na frente do dono**, e não num silêncio que ninguém reporta.

---

## 2. AS 3 QUE PARECEM BOAS E NÃO SÃO

**Esta seção vale mais que a de cima.** Cada uma destas três está recomendada, com
argumento bom, em algum documento que você acabou de encomendar. Todas as três
custam meses.

---

### ❌ 1. Clima (Visual Crossing) — a `PESQUISA_APIS_2026` põe em **1º lugar**. É julho.

**O que está certo na pesquisa, e eu confirmei na fonte:** o plano gratuito do Visual
Crossing dá **1.000 registros por dia** e **permite uso comercial explicitamente** —
*"Yes! Developers and businesses can begin building applications using the free plan"*
([documentação do plano grátis](https://www.visualcrossing.com/resources/documentation/visual-crossing-weather-free-plan-free-weather-data-for-analysts-and-api-developers/),
lida em 21/07/2026); depois do teto é **US$ 0,0001 por registro** em pay-as-you-go.
O endpoint de clima **realmente não existe** (`grep -riE "clima|weather|open-meteo"`
em `worker/src` → **0 linhas**). Tudo isso é verdade.

**Onde a pesquisa erra: no calendário e no esforço.**

1. **A metade que gera receita é a onda de calor** — *"36 °C por três dias → você
   tem 41 clientes com ar sem limpeza há 8 meses"*. **Hoje é 21 de julho. É inverno.**
   Construir agora é entregar em agosto uma feature cuja primeira prova real acontece
   em **dezembro**. Quatro meses de nada.
2. **"Custo R$ 0, zero passo humano" tem um passo escondido.** O desenho que faz a
   conta fechar é *uma consulta por cidade por dia, cacheada* — e conferi
   `worker/wrangler.jsonc`: o worker **não tem binding de KV, nem R2, nem D1**, só
   `vars`. Os caches de hoje são `Map` em memória (`brasil.js:135`, `:495`), que
   morrem a cada troca de isolate. O único cache durável do worker é uma **tabela no
   Supabase** (`eta_cache`, via `lerCacheTrajeto` em `etaSaida.js:304`). Ou seja:
   clima cacheado = **mais uma tabela + mais uma migration**, num projeto que acabou
   de sair de um ciclo doloroso de migrations. Não é P. É M com cauda.
3. **Precisa passar pelo gate de `src/services/verticais.ts`**, senão vira ruído:
   chuva importa para elétrica externa, telhado e jardinagem; para encanador de
   apartamento, chove ou faz sol, o serviço acontece igual. Alerta inútil mata a
   atenção do alerta que importa.

**Veredito: ideia certa, mês errado. Reabrir em outubro** — chega pronta no verão,
com três meses a menos de manutenção e com os 10 pagantes já instalados para dizer
se querem. O `VISAO_FABLE.md` §5.2 já dizia isso; a `PESQUISA_APIS` discordou; **eu
fico com o FABLE, e acrescento o argumento do KV que nenhum dos dois deu.**

---

### ❌ 2. Trocar a camada de sync por uma engine pronta

O achado do outbox (item 3 da seção anterior) vai produzir exatamente este impulso:
*"o sync tem buraco, vamos usar uma coisa séria."* **É o erro mais caro disponível
neste documento.**

`cloudSync.ts` tem **2.255 linhas** e `database.ts` tem **2.960**. Elas carregam
partição por usuário (`particao.ts` existe por causa de um **vazamento real entre
contas**), contexto de equipe, tombstones e guarda de conflito por `atualizado_em`.
**Se a migração der errado, o sintoma não é "o app está lento" — é dado de cliente
sumindo ou vazando entre contas, num app que já está em produção, sem rollback bonito
depois que aparelhos rodaram o schema novo.**

E o preço de cada candidato, conferido:

| Candidato | Licença | Por que não |
|---|---|---|
| **WatermelonDB** | MIT | Último commit **11/08/2025**; última estável `0.28.0` de **07/04/2025**. **~11 meses dormente**, e a última publicação é **anterior** ao RN 0.82 (primeira só-New-Architecture). O OLLI está no **RN 0.85.3**. Ninguém testou essa combinação |
| **RxDB** | core Apache-2.0 | **O storage de SQLite/React Native é PAGO** — tier Pro, **US$ 99/mês ≈ R$ 510/mês**, cobrado anualmente. O core grátis não entrega o que o OLLI precisa |
| **PowerSync** | SDK Apache/MIT, **serviço sob FSL** | O plano Free **desativa o projeto após uma semana sem atividade**. Um produto com zero usuários fica inativo o tempo todo: você acorda com o sync desligado. Degrau seguinte: **US$ 49/mês ≈ R$ 250/mês** |
| **ElectricSQL** | Apache-2.0 | Licença ótima, projeto sério — e **resolve a metade errada**: a própria doc se define como *"a read-path sync engine"*. O OLLI tem o **pull** funcionando; o buraco é o **push** |

**Você trocaria 5.200 linhas de regra de negócio testada por um buraco que cabe em
200.** Reabrir só se um dia houver 500 pagantes e o sync virar o gargalo de verdade.

---

### ❌ 3. Emitir a nota fiscal **de verdade** (Focus NFe e afins)

É o pensamento seguinte inevitável ao item 2 da seção 1: *"se preparar é bom, emitir
é melhor."* Não é — ainda.

**Três razões, em ordem de peso:**

1. **R$ 548,00 por mês, fixos, antes do primeiro real.** O único provedor com modelo
   multi-tenant e preço público é o **Focus NFe Growth** (CNPJs ilimitados, 4.000
   notas, R$ 0,12 por nota extra — [focusnfe.com.br/precos](https://focusnfe.com.br/precos/)).
   Com 1.000 prestadores isso vira R$ 0,79 por cliente e é barato. **Hoje é R$ 548/mês
   de prejuízo puro, todo mês, com R$ 0,00 entrando.** Isso sozinho já basta.
2. **Custódia de certificado digital.** A API do Emissor Nacional exige certificado
   **ICP-Brasil A1/A3 com assinatura de XML e mTLS**. Guardar o `.pfx` e a senha de
   milhares de empresas não é feature — é um negócio paralelo, com seguro e auditoria.
   O provedor guarda por você, mas **a responsabilidade contratual com o prestador
   continua sendo do OLLI**.
3. **Suporte fiscal é atendimento humano contínuo.** Nota rejeitada por código de
   tributação errado vira ligação de prestador irritado no sábado. **Uma pessoa só
   não sustenta isso** — e é por isso que a `PESQUISA_CONCORRENCIA` §7.5 diz
   secamente *"integre ou não faça"*.

**E o caminho barato não exige nada disso:** pelo **portal web**, o MEI emite com
**conta gov.br nível prata ou ouro, sem certificado nenhum**. É exatamente o caminho
que o item 2 da seção 1 usa.

**Reabre quando:** ~150 pagantes. Aí R$ 548 vira R$ 3,65 por cliente e existe alguém
pagando pelo suporte.

---

### E mais quatro que já foram julgadas e continuam com "não" (uma linha cada)

- **WhatsApp Cloud API.** Para mandar em nome de cada prestador, o OLLI precisa virar
  **Tech Provider da Meta**: verificação, Embedded Signup, templates aprovados por
  categoria, linha de crédito, qualidade de número. **É um segundo produto**, para
  substituir um `wa.me` que funciona **de graça em 9 arquivos**.
- **Roteirização.** Custa por chamada, **quebra sem rede**, e só paga acima de ~6
  paradas/dia. O alvo do OLLI faz 3–5.
- **Assinatura ICP-Brasil no aceite do serviço.** Morre no lado errado: quem
  precisaria do certificado é o **cliente** do prestador. A dona de casa não compra
  um e-CPF de R$ 180/ano para assinar uma OS de R$ 250.
- **Trocar o modal de assinatura por plataforma online (ZapSign/D4Sign).** Toda
  plataforma exige rede **no ato de assinar**. O `AssinaturaClienteModal.tsx` funciona
  no subsolo. Trocar é regressão; somar é opção para contrato formal.

---

## 3. O QUE É ARMADILHA JURÍDICA OU DE CUSTO

### 🚨 A1 — O `SignatureProvider.ts` aponta, commitado, para software **AGPL-3.0**

Conferido agora, `src/services/ports/SignatureProvider.ts`, **linha 10**, no HEAD
(e a **linha 20** reforça: *"Documenso NÃO deve ser usado para o botão aprovar
orçamento — só quando houver contrato/termo formal"*, ou seja, confirma que ele é o
escolhido para o caso formal):

> *"Provider escolhido: **Documenso** (open-source, campos de assinatura, webhooks,
> certificado) para documentos juridicamente relevantes / múltiplos signatários"*

**O Documenso Community Edition é AGPL-3.0.** A cláusula de rede (§13) diz: se você
**modifica** o software e o disponibiliza **por rede** aos usuários, deve oferecer a
eles o **código-fonte completo da sua versão modificada, sob AGPL**. Não basta não
distribuir binário — **servir por HTTP já dispara**. A própria Documenso vende licença
comercial exatamente para quem quer *"offer SaaS with modifications, or keep
modifications private"*
([docs.documenso.com/docs/policies/licenses](https://docs.documenso.com/docs/policies/licenses)).

**O OLLI é SaaS pago e fechado.** A leitura mais provável é que, ao subir um Documenso
adaptado dentro da infra, o OLLI passa a dever o fonte dessa parte a quem usar.
**A decisão errada não dá erro de compilação — dá processo três anos depois.**

**Conserto: 30 segundos de edição de comentário.** Trocar por
*"Provider: A DECIDIR. ⚠️ Documenso é AGPL-3.0 — inviável em produto fechado sem
licença comercial paga."* Enquanto essa linha estiver lá, **ela é uma instrução para
o próximo agente**, ou para você mesmo às duas da manhã.

### 🚨 A2 — O repositório é **PÚBLICO**, e não há nenhuma varredura de segredo

Conferido: `gh repo view` → `"isPrivate": false`, `"visibility": "PUBLIC"` —
`github.com/gogodroidk/olli-orcamentos-2`.

**A notícia boa, e eu fui checar antes de assustar você:** o único `.env` **real**
já commitado na história foi `web/.env`, no commit `9b5ccc8`. Li o conteúdo: ele tem
**apenas** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — que são **públicas por
desenho** (a anon key é protegida por RLS, e o próprio arquivo tem um comentário
dizendo isso). **Não há vazamento hoje.** O `.gitignore` cobre `.env` desde então.

**A notícia ruim:** não existe **nada** impedindo o próximo. O `package.json` da raiz
não tem lint; o worker tem só `check`/`deploy`; o único gate do repositório é o Biome
do `webapp/lefthook.yml`. E este projeto tem histórico de secrets do worker,
`service_role` e um `CLOUDFLARE_API_TOKEN` fraco documentado na memória.

**Conserto: `gitleaks`, esforço P, R$ 0,00, licença MIT, binário Go que não entra em
`package.json` nem no APK.**

> ⚠️ **Pegadinha de licença que ninguém dos três documentos pegou:** o **binário**
> gitleaks é MIT e livre. Mas a **`gitleaks-action` mudou de MIT para licença
> proprietária a partir da v2.0.0**, e exige uma `GITLEAKS_LICENSE` — *"required for
> organizations, not required for user accounts"*
> ([github.com/gitleaks/gitleaks-action](https://github.com/gitleaks/gitleaks-action),
> lido em 21/07/2026). A chave é grátis, mas exige cadastro. **Hoje o repo está numa
> conta pessoal e funciona sem chave; no dia em que migrar para uma org da GR Tech,
> o CI quebra.** Rodar o binário direto no runner evita isso e continua MIT.

### 💸 A3 — Áudio na IA custa **3,3 vezes** o texto, e o teto é o que protege

A `PESQUISA_CONCORRENCIA` §3.1 deixou isto explicitamente em aberto
(*"não confirmei a tarifa de token de ÁUDIO"*). **Confirmei na fonte oficial.**

`worker/src/gemini.js:15` usa `gemini-2.5-flash`. Tabela oficial
([ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing),
lida em 21/07/2026):

| Entrada texto/imagem/vídeo | **Entrada ÁUDIO** | Saída (inclui thinking) |
|---|---|---|
| US$ 0,30 / 1M | **US$ 1,00 / 1M** | US$ 2,50 / 1M |

E áudio tokeniza a **32 tokens por segundo — 1 minuto = 1.920 tokens**
([docs de áudio](https://ai.google.dev/gemini-api/docs/audio), 21/07/2026).

**A conta de um orçamento falado de 2 minutos:**

| Parcela | Tokens | US$ | R$ |
|---|---|---|---|
| Áudio (2 min) | 3.840 | 0,00384 | 0,020 |
| Prompt de texto (catálogo + instruções) | ~2.000 | 0,00060 | 0,003 |
| Saída (itens do orçamento) | ~800 | 0,00200 | 0,010 |
| **Total** | | **≈ 0,0064** | **≈ R$ 0,033** |

**Ou seja: ~3 centavos por orçamento falado. Não é caro.** O plano Pro de R$ 39
aguenta **~100 usos/mês por R$ 3,30 (8,5% do preço)**. A armadilha aparece no
usuário pesado: **500 usos/mês = R$ 16,50 = 42% da mensalidade dele**. Não é
ruína — é margem evaporando em silêncio.

**A conclusão prática:** o número não pede feature nova, pede que **a cota
server-side esteja de fato aplicada**. Enquanto a IA for fail-open, um usuário
sozinho decide seu custo. E **nunca escreva "IA ilimitada"** na página de planos.

### 💀 A4 — Dependências mortas ou que morrem em cima de você

| O quê | Estado | O que fazer |
|---|---|---|
| **Nuvem Fiscal** | **Serviço desativado em 31/07/2026** — e ainda está escrita como candidata no `docs/INTEGRATION_BACKLOG.md` | Apagar de lá |
| **pdf-lib** | Último push **17/07/2024** (dois anos), 317 issues abertas | Não adotar |
| **lost-pixel** | **Repositório ARQUIVADO** (push final 22/04/2026) | Não adotar. Use o `toHaveScreenshot()` do Playwright que já está em `devDependencies` |
| **WatermelonDB** | ~11 meses sem commit, incompatível com RN 0.85 não testada | Não adotar |
| **Open-Meteo free** | **Licença explicitamente NÃO-COMERCIAL**, e o OLLI cobra assinatura | Usar seria violação. Ou Visual Crossing (comercial ✅) ou Open-Meteo Standard pago (US$ 29/mês ≈ R$ 149) |

### 🪦 A5 — Duas dependências instaladas e não usadas (achado gratuito)

- `react-native-signature-canvas` está no `package.json:53` e **`grep -rl` em `src/`,
  `App.tsx` e `index.ts` retorna zero arquivos.** A assinatura real é
  `src/components/assinatura/AssinaturaClienteModal.tsx` (PanResponder + SVG, escrita
  à mão, offline), e ela **está fiada** — `GerarDocumentoModal.tsx:288` a chama.
  **Desinstalar.** (`react-native-webview` continua necessário: `PdfPreviewModal.tsx`.)
- `react-native-uuid` (68 KiB) faz o que o `expo-crypto` — já em `dependencies` —
  faz com `Crypto.randomUUID()`. E o `expo-crypto` já é usado no projeto para
  SHA-256 em três lugares (`analyticsRemoto.ts:71`, `appleAuth.ts:59`,
  `googleAgenda.ts:88`). **Trocar o corpo de `src/utils/id.ts` e desinstalar.**

---

## 4. O QUE MUDA SE ELE CONSEGUIR OS 10 PRIMEIROS PAGANTES

**10 × R$ 39 = R$ 390 por mês.** Esse é o orçamento inteiro. É o número contra o qual
tudo abaixo tem que ser medido — e ele explica por que quase nada da lista longa
cabe hoje.

### O que os 10 pagantes DESTRAVAM

| O quê | Por que só depois |
|---|---|
| **Preço sugerido pelo histórico** ("você cobrou isso 14 vezes, mais comum R$ 180") | Exige **5+ registros do próprio usuário** para abrir a boca. Usuário novo tem zero. Construir antes é construir uma tela muda |
| **Mediana de preço da vertical/região** (a tabela que ninguém no Brasil tem) | Com 10 usuários, a mediana é **mentira estatística**. É a feature certa no ano errado |
| **Pix Automático** (contrato de PMOC do prestador **e** a assinatura do próprio OLLI) | Esforço **G**. E hoje, conferido em `worker/src/mercadopago.js:277-287`, o `preapproval` só existe para **cancelar** legado: **quem paga o OLLI por Pix precisa lembrar de pagar de novo todo mês.** Vazamento de receita por esquecimento — que só importa quando existe receita |
| **`expo-updates` / EAS Update** (consertar bug de campo sem passar pela loja) | Conferido: `app.json` **não tem** bloco `updates` nem `runtimeVersion`. **Grátis até 1.000 MAU**, depois US$ 19/mês (≈ R$ 98) até 3.000 ([expo.dev/pricing](https://expo.dev/pricing), 21/07/2026). Com 10 usuários instalados na mão, você entrega APK pelo WhatsApp. A partir de ~30 na loja, isso deixa de ser possível |
| **Clima** | Aí já é outubro, e você pergunta a eles se querem em vez de adivinhar |
| **Estoque de gás/peça por OS** | O Conectar vende isso; mas é o **11º ao 100º** cliente que pede, não os 10 primeiros |

### O que **continua** não fazendo sentido, mesmo com 10 pagantes

- **Focus NFe (R$ 548/mês).** Com R$ 390 entrando, essa linha sozinha te deixa
  **R$ 158 no vermelho**. Precisa de ~150 pagantes, não de 10.
- **WhatsApp Cloud API.** O custo não é a mensagem — é virar Tech Provider. Não muda
  com 10 clientes.
- **RxDB Pro (US$ 99/mês ≈ R$ 510).** Mais caro que a receita inteira.
- **iOS.** 21% do mercado brasileiro, ~0% do seu público, semanas de trabalho.

### E o que os 10 pagantes compram que **nada nesta pasta consegue produzir**

**A resposta para "por que eles pagaram".** O `VISAO_FABLE.md` §6 já disse a frase
mais importante do repositório inteiro: *67 agentes de auditoria, cinco especialistas,
medições de ΔL\* e APCA — e **zero minutos de observação de campo**.* Este documento
é o 68º agente. Ele também não viu um prestador usar o app.

**Se em 8 semanas ninguém topar pagar R$ 39 nem com você instalando na mão, isso não
é fracasso — é a informação mais barata que existe sobre preço, público ou produto,
comprada com R$ 0 de mídia.** E a resposta certa a ela será mexer em mensagem,
público ou no que é grátis vs. pago. **Nunca "mais uma onda de features".**

---

## 5. ONDE EU DISCORDO DA ESTRATÉGIA JÁ ESCRITA

**Concordo com o núcleo do `NEGOCIO_DECISAO.md`:** declarar o produto pronto por
decreto, trocar o gate para "um técnico de verdade usando", e a régua colável na
parede — **hora com técnico > hora com código**. Nada aqui contradiz isso. Discordo
em cinco pontos.

**1. Da data da NFS-e, nos dois documentos de estratégia.** `VISAO_FABLE` §3 e
`NEGOCIO_DECISAO` §3 dizem que "o público inteiro" vira obrigado em 01/09/2026. **O
MEI está obrigado desde 01/09/2023** (Res. CGSN 169/2022 — fonte na seção 1). Não é
detalhe: se a página de agosto disser a um MEI que ele "será obrigado em setembro",
ela está errada para a maior parte do público-alvo. **O texto certo é mais forte:**
*"Se você é MEI, isso já vale para você desde 2023 — e o OLLI deixa a nota pronta."*

**2. Da `PESQUISA_APIS_2026`, que põe clima em 1º lugar dizendo "não há argumento
contra".** Há três, e estão na seção 2: é inverno, o cache exige uma tabela nova
(o worker não tem KV — conferido em `wrangler.jsonc`), e o alerta precisa passar pelo
gate de verticais para não virar ruído. **Fico com o `VISAO_FABLE`: outubro.**

**3. Do `NEGOCIO_DECISAO` §5.2, que manda "congelar o ETA: não anunciar, não
evoluir".** Concordo com **não evoluir** — é a única feature com custo por uso.
**Discordo de "não anunciar".** A `PESQUISA_CONCORRENCIA` §3.1 (D3) conferiu que o
ETA com trânsito é o **único diferencial do OLLI sem equivalente em nenhum concorrente
brasileiro**, e ele resolve a dor nº 1 de quem trabalha em cidade grande: chegar
atrasado. Não evoluir custa R$ 0. **Não anunciar joga fora o único fosso verificado
do produto por uma frase que já está pronta.** Anuncie; só não invista mais nele.

**4. Da `PESQUISA_OPENSOURCE`, que chama gitleaks de "o único item cuja ausência pode
acabar com o produto".** Concordo com a ferramenta, discordo da urgência — e eu fui
verificar em vez de repetir: **o único `.env` real da história do repositório continha
apenas URL e anon key do Supabase, que são públicas por desenho.** Não há vazamento.
gitleaks é **P**, custa R$ 0 e deve entrar; **não é emergência**, e a `gitleaks-action`
v2+ tem a pegadinha de licença descrita em A2.

**5. Da leitura de que "o Empresa a R$ 99 é caro porque o Conectar cobra R$ 79,90".**
O fato está certo — confirmei hoje em [conectarplay.com](https://conectarplay.com/):
**"R$ 79,90/mês — usuários ilimitados"**, com PMOC automático, QR, assinatura
ICP-Brasil, estoque de gases, app do cliente e boleto+Pix. **Mas a conclusão certa não
é baixar preço nem construir estoque de gás.** É parar de disputar o refrigerista puro
no Empresa — nesse nicho o Conectar entrega mais — e vender o Empresa para quem tem
**2 a 8 técnicos e mais de um ofício**, onde o comparável é o **Field Control a
R$ 525/mês + R$ 89 por licença extra + R$ 899 de implantação**. Contra ele, R$ 99 por
empresa com técnicos ilimitados não é caro: é **um oitavo do preço**. A ação é de
posicionamento (esforço **P**, custo **R$ 0**), não de produto.

---

## Se você só ler seis linhas

1. **Publique os 698 códigos de erro e as calculadoras na landing.** O ativo já está
   pronto no repositório, custa R$ 0, e é a única coisa da lista que **traz gente nova**.
   Faça ~15 páginas por marca, **não** 698 páginas finas.
2. **Faça a NFS-e preparada** — e corrija a copy: **o MEI já é obrigado desde 2023**,
   a onda de setembro é de ME/EPP.
3. **Escreva a fila de saída do sync** antes dos 10 técnicos instalarem, para a
   landing parar de prometer o que o código não cumpre.
4. **Não faça clima agora** (é inverno), **não troque a engine de sync** (5.200 linhas
   testadas por um buraco de 200), **não assine provedor fiscal** (R$ 548/mês contra
   R$ 0 de receita).
5. **Corrija o comentário do Documenso** (AGPL-3.0 apontada como "provider escolhido"
   dentro de um SaaS fechado). 30 segundos.
6. **Áudio na IA custa 3,3× o texto** (US$ 1,00 vs US$ 0,30 por 1M) — dá ~3 centavos
   por orçamento falado. Barato, desde que a cota esteja ligada. **Nunca escreva
   "IA ilimitada".**

---

### Fontes conferidas por mim em 21/07/2026 (as demais estão nos três documentos de origem)

- NFS-e / MEI desde 2023 — https://www.gov.br/nfse/pt-br/mei-prestadores-de-servico-de-todo-o-pais-estao-obrigados-a-emitir-nfs-e
- NFS-e / ME e EPP em 01/09/2026 — https://www.gov.br/nfse/pt-br/noticias/nfs-e-e-simples-nacional-obrigatoriedade-de-emissao-atraves-do-emissor-nacional · https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional
- Gemini — preços por 1M de tokens — https://ai.google.dev/gemini-api/docs/pricing · tokenização de áudio (32 tokens/s) — https://ai.google.dev/gemini-api/docs/audio
- Visual Crossing — plano grátis, 1.000 registros/dia, uso comercial permitido — https://www.visualcrossing.com/resources/documentation/visual-crossing-weather-free-plan-free-weather-data-for-analysts-and-api-developers/
- gitleaks-action — licença proprietária desde a v2.0.0, chave grátis exigida para organizações — https://github.com/gitleaks/gitleaks-action
- Expo — Free 1.000 MAU / Starter US$ 19 por 3.000 MAU — https://expo.dev/pricing
- Conectar Play — R$ 79,90/mês, usuários ilimitados — https://conectarplay.com/
- Focus NFe — plano Growth R$ 548/mês — https://focusnfe.com.br/precos/
- Documenso — licenças (AGPL-3.0 na Community) — https://docs.documenso.com/docs/policies/licenses
- Auvo — dez ferramentas grátis como isca — https://www.auvo.com/ferramentas-gratuitas

### Código lido antes de propor (caminho absoluto na raiz do worktree)

`src/services/ports/{SignatureProvider,FiscalProvider}.ts` · `src/services/cloudSync.ts` ·
`src/services/{entitlements,precosPlanos,calculosOficio,clienteLink,verticais}.ts` ·
`src/components/tecnico/BarraOffline.tsx` · `src/components/assinatura/AssinaturaClienteModal.tsx` ·
`src/components/documentos/GerarDocumentoModal.tsx` · `src/database/database.ts` ·
`src/utils/pdfGenerator.ts` · `App.tsx` · `app.json` · `package.json` ·
`assets/codigos_erro.json` · `worker/src/{gemini,brasil,etaSaida,mercadopago}.js` ·
`worker/wrangler.jsonc` · `web/src/pages/index.astro` · `web/src/data/planos.ts` ·
`.github/workflows/ci.yml` · `.gitignore` · histórico git (`9b5ccc8`, `web/.env`)
