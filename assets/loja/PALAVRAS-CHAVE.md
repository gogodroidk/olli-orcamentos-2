# PALAVRAS-CHAVE — como esse público procura na Play

> **A Play não tem campo de palavras-chave.** Diferente da App Store (que tem um campo `Keywords`
> de 100 caracteres, oculto), a Play indexa o **título**, a **descrição breve** e a **descrição
> completa**. Isso muda a tática inteira: não existe lugar escondido para despejar termo — o que
> ranqueia é o texto que o usuário lê. Amontoar palavra na descrição é, ao mesmo tempo, pior para o
> leitor e violação da política de metadados ("avoid using repetitive or unrelated keywords").

## 1. O que a concorrência real ensina

Não inventei esses termos: puxei dos apps que já ocupam a busca brasileira desta categoria hoje.
Repare que **todos** abrem o título com a função, não com a marca:

| App concorrente na Play | O que o título revela |
| --- | --- |
| Orçamento Eletricista / Orçamento Eletricista Pro | "orçamento" + ofício é a fórmula dominante |
| Orçamento de Serviços e Vendas | "orçamento de serviços" é termo de cauda longa real |
| Orçamento de Serviços Fácil | idem, com modificador "fácil" |
| Orçamento Perfeito | "orçamento" sozinho como cabeça de busca |
| Gerador de Orçamentos PRO | "gerador de orçamento" é uma formulação de busca de verdade |
| SOMEI: Controle vendas pra MEI | "MEI" é termo de identidade, não de função |

**Leitura:** `orçamento` é o termo-cabeça inegociável. Quem lidera com a marca desaparece —
e o OLLI, com zero usuários, não tem uma única busca por marca para colher. Por isso o título
recomendado em `FICHA.md` é `OLLI: Orçamento, OS e Recibo`, e não `OLLI Orçamentos`.

## 2. Os termos, em três camadas

### Camada 1 — cabeça (alta busca, alta concorrência). Precisam estar no TÍTULO ou na 1ª linha.
`orçamento` · `orçamento de serviço` · `ordem de serviço` · `OS` · `recibo`

> `OS` merece nota: é como o prestador brasileiro fala e digita ("fechei a OS"), mas sozinho é
> ambíguo demais para a busca. Por isso ele aparece no título junto de "Orçamento" e "Recibo", que
> desambiguam, e a forma por extenso — "ordem de serviço" — aparece na descrição breve e na completa.

### Camada 2 — ofício (é onde o OLLI ganha, porque o app é multi-ofício de verdade)
`eletricista` · `refrigeração` · `ar-condicionado` · `climatização` · `hidráulica` · `encanador` ·
`pintor` · `dedetização` · `jardinagem` · `técnico` · `assistência técnica` · `manutenção`

Cada um desses tem busca própria e concorrência muito menor que "orçamento". A descrição completa
já os cobre no bloco "AS FERRAMENTAS DO SEU OFÍCIO" — **de forma natural, como lista de features
reais**, que é exatamente o formato que a política aceita e que o leitor entende.

### Camada 3 — identidade e intenção
`MEI` · `autônomo` · `prestador de serviço` · `pequena empresa` · `PDF` · `WhatsApp` ·
`offline` · `sem internet` · `assinatura do cliente` · `PMOC` · `orçamento em PDF`

`PMOC` é um termo pequeno mas cirúrgico: quem procura PMOC sabe o que quer, tem obrigação legal e
converte muito melhor que quem procura "orçamento".

## 3. Onde cada termo caiu na ficha (a cobertura, conferida)

Rode `node assets/loja/palavras.js` para reconferir depois de qualquer edição — ele lê o `FICHA.md`
e diz quais termos ficaram de fora. Estado atual está no fim deste documento.

| Campo | Termos que ele carrega |
| --- | --- |
| Título (30) | orçamento, OS, recibo |
| Descrição breve (80) | orçamento, ordem de serviço, recibo, PDF, campo |
| Descrição completa | todos os de ofício + MEI-adjacentes + PDF/WhatsApp/offline/PMOC/assinatura |

## 4. O que NÃO fazer (cada item já reprovou app de gente)

- **Não** repetir "orçamento" 15 vezes na descrição. A política barra "repetitive keywords", e a
  Play sabe contar. A densidade atual da descrição é natural porque o texto descreve o produto.
- **Não** listar concorrente pelo nome ("melhor que o app X") — é violação e é processo.
- **Não** colar um bloco de termos separados por vírgula no fim da descrição. É o erro clássico de
  quem trouxe hábito de App Store para a Play; lá existe campo oculto, aqui não.
- **Não** usar emoji nem CAIXA ALTA no título/ícone/nome do desenvolvedor — barrado explicitamente.
- **Não** escrever "grátis", "promoção", "nº 1" ou preço no título ou no ícone — a política proíbe
  informação de preço/promoção e alegação de ranking nesses campos. (Explicar os planos **dentro da
  descrição completa** é permitido, e é o que a ficha faz.)

## 5. Depois de publicar (isto é ASO de verdade, o resto é chute)

Palavra-chave sem dado é opinião. Assim que a ficha estiver no ar, o dado real aparece de graça:

1. **Play Console → Crescimento → Aquisição de usuários → Pesquisa da Play Store.** Mostra os termos
   pelos quais as pessoas *de fato* chegaram no app, com conversão por termo.
2. **Experimentos na loja (A/B da própria Console).** Testar o título `OLLI: Orçamento, OS e Recibo`
   contra `OLLI Orçamentos` é um teste de um clique, com significância calculada pelo Google.
   É o único jeito honesto de resolver a dúvida do título — não por gosto, por número.
3. Reler esta página quando houver 100+ instalações e trocar as suposições da seção 2 pelos termos
   que a Console mostrar.

Até lá, tudo aqui é hipótese fundamentada na concorrência observada — e está escrito como hipótese
de propósito.

---

## 6. Cobertura medida (saída real de `node assets/loja/palavras.js`)

Rodado contra o `FICHA.md` desta entrega — **28 de 29 termos cobertos**:

```
── cabeça ──
  orçamento              TÍT BRE COM
  orçamento de serviço   COM
  ordem de serviço       BRE COM
  OS                     TÍT COM
  recibo                 TÍT BRE COM

── ofício ──
  eletricista            COM
  refrigeração           COM
  ar-condicionado        COM
  climatização           COM
  hidráulica             COM
  pintura                COM
  dedetização            COM
  jardinagem             COM
  técnico                COM
  manutenção             COM
  elétrica               — AUSENTE

── identidade/intenção ──
  autônomo   COM      prestador  COM      PDF        BRE COM
  WhatsApp   COM      offline    COM      assinatura COM
  PMOC       COM      QR         COM      ANVISA     COM
  campo      BRE      equipe     COM      agenda     COM
  cliente    COM
```

### O único ausente é uma decisão, não um esquecimento

`elétrica` saiu quando trocamos "Elétrica, jardinagem e serviços em geral" por
"Eletricista, jardinagem e serviços em geral" na descrição. Foi de propósito:

- `eletricista` é o termo mais forte dos dois — quem busca se identifica pela profissão
  ("sou eletricista"), e é a formulação que os concorrentes usam no título (seção 1);
- os dois compartilham o radical `eletric-`, e a busca da Play faz stemming em português — então
  o ganho marginal de repetir a outra forma é próximo de zero;
- enfiar "elétrica" de novo só para o script fechar em 29/29 seria **exatamente** a repetição de
  palavra-chave que a seção 4 manda evitar. Otimizar para o próprio medidor é o jeito mais fácil de
  piorar o texto de verdade.

Se um dia a Console mostrar busca real por "instalação elétrica" com volume relevante, aí sim vale
reescrever aquela linha — com dado, não com vontade de zerar a lista.
