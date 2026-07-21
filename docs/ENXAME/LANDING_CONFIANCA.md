# LANDING — CONFIANÇA, ÍCONE E RAIO

Documento de especificação da onda de confiança da landing (`web/`, Astro 7 + Tailwind 4,
servida na raiz `olliorcamentos.online` pelo worker de assets `site/`).

**Este documento não edita código.** Outra onda está mexendo em `web/src/styles/global.css`
e `web/package.json` agora (troca de fonte: Plus Jakarta Sans + Spectral → **Rubik Variable**).
Tudo aqui foi lido do código no estado atual do worktree e é escrito para ser executado depois
que aquela onda fechar.

Data da leitura: 18/07/2026 · branch `claude/app-complete-analysis-optimization-9a1912`

---

## 0. O resumo em um minuto

Três achados que valem mais que o resto do documento:

1. **O ícone que o dono chamou de "borrão" não é a marca da OLLI.** Abri o arquivo:
   `web/public/favicon.ico` **não é um arquivo ICO** — é um PNG de 32×32 renomeado, em
   **escala de cinza** (84 tons, 71% dos pixels pretos, zero pixel azul), com uma forma de "A".
   É o favicon do **template do Astro**, que nunca foi trocado. O dono está vendo a marca do
   *framework* esticada 8× na barra de tarefas. Ele não está reclamando de resolução — está
   reclamando, com razão, de estar vendo **outra marca**. → §2.

2. **A página de Privacidade em produção diz, no topo, que não deveria estar publicada.**
   `web/src/pages/legal/privacidade.astro:23` renderiza `doc.aviso`, e o texto de
   `src/content/legal/privacidade.ts:52` é: *"Este é um MODELO … deve ser revisado e adaptado
   por um(a) advogado(a) **antes de ser publicado** ou usado com clientes reais."* Pior: a seção
   1 do mesmo documento, também visível, instrui *"Antes de publicar, complete aqui a razão
   social, o CNPJ, o endereço"*. Quem clica em "Privacidade" é exatamente a pessoa que está
   decidindo se confia. Ela lê que a empresa publicou um rascunho e não tem razão social. Isso
   destrói mais confiança do que o CNPJ ausente. → §1.4.

3. **O instinto do dono sobre o CNPJ está certo e é um diferencial mensurável.** Conferi os
   rodapés dos concorrentes diretos: **Field Control não mostra CNPJ**, **Auvo não mostra CNPJ**
   — os dois compensam com número que a OLLI não tem ("+5.000 clientes", "+8.000 empresas").
   Já a **Bling** (empresa do grupo LWSA) mostra: *"LWSA – Filial Bling. CNPJ: 02.351.877/0011-24."*
   O padrão de "empresa grande" que ele descreveu existe de verdade — e o Decreto 7.962/2013
   art. 2º **obriga** CNPJ e endereço "em local de destaque e de fácil visualização" em site que
   oferta contrato de consumo. A OLLI vende assinatura na página; está no escopo. → §1.1.

Ordem de execução recomendada: **§1.4 (aviso legal) → §2 (ícone) → §1.3 (rodapé + CNPJ) →
§1.6 (JSON-LD) → §3 (raio) → §1.5 (/empresa)**. O primeiro item é o mais barato e o de maior
dano evitado.

---

## 1. CNPJ E A CAMADA DE CONFIANÇA

### 1.0 O que JÁ existe (para não propor o que está pronto)

Antes de qualquer proposta, o inventário do que a landing já faz bem — propor isso como novo
seria queimar o documento:

| Já existe | Onde | Estado |
|---|---|---|
| Política de Privacidade completa, com tabela LGPD (dado × finalidade × base legal) | `src/content/legal/privacidade.ts` (293 linhas) → `web/src/pages/legal/privacidade.astro` | **No ar**, boa qualidade técnica |
| Termos de Uso | `src/content/legal/termos.ts` (181 linhas) → `web/src/pages/legal/termos.astro` | **No ar** |
| Redirect 301 `/privacidade` → `/legal/privacidade/` (URL das lojas) | `web/astro.config.mjs` | **Feito** |
| Central de Ajuda com artigos reais | `web/src/pages/ajuda/index.astro` | **No ar** |
| JSON-LD `Organization` + `WebSite` + `SoftwareApplication` em toda página | `web/src/layouts/Layout.astro` | **No ar** |
| Recusa explícita de `aggregateRating` falso, comentada no código | `Layout.astro:38-42` | **Correto — manter** |
| FAQPage serializado do MESMO array que a tela renderiza | `index.astro:215` e `para/[oficio].astro` | **Correto — manter** |
| Seção "Feita por quem vive de campo" (origem GR Tech) | `index.astro:438-457` | **No ar**, é a prova social honesta que já existe |
| WhatsApp real de vendas/suporte, com mensagem pré-preenchida por ofício | `index.astro:22`, `para/[oficio].astro` | **No ar** |
| Cabeçalhos de segurança + CSP por hash de script inline | `web/scripts/gerar-headers.mjs` | **Feito**, bem acima da média |
| Sem service worker em produção (o MSW do painel é `import.meta.env.DEV`) | `webapp/src/main.tsx:39` | **Verificado** — importa para §2.3 |

A landing **não é um site fraco**. O que falta é identidade jurídica verificável.

### 1.1 O que a lei brasileira exige (e a landing não cumpre)

O **Decreto nº 7.962/2013** (regulamenta o CDC para o comércio eletrônico), art. 2º, exige que
sites que ofertam ou concluem contrato de consumo disponibilizem **em local de destaque e de
fácil visualização**:

- **I** — nome empresarial e número de inscrição no CPF ou **CNPJ**;
- **II** — **endereço físico e eletrônico** e demais informações para localização e contato.

A landing oferece assinatura (R$ 39 e R$ 99/mês) com CTA de cadastro em toda página. Está no
escopo. Hoje o rodapé traz apenas `© 2026 OLLI Orçamentos` (`web/src/components/Footer.astro:44`).
Não há razão social, CNPJ, endereço nem e-mail em lugar nenhum do site.

Some-se a LGPD: a Política de Privacidade **precisa** identificar o controlador e o canal do
Encarregado. O texto atual admite a lacuna em voz alta (§1.4).

**Conclusão:** o CNPJ no rodapé não é preferência estética do dono. É requisito legal que hoje
está descumprido, e ele acertou o instinto sem saber o número do decreto.

### 1.2 O que o mercado brasileiro realmente faz (dado, não palpite)

Fui aos rodapés dos concorrentes e de um SaaS grande:

| Empresa | CNPJ no rodapé? | Endereço? | O que usa como prova |
|---|---|---|---|
| **Field Control** (concorrente direto, field service) | **Não** | Não | "MAIS DE 5.000 CLIENTES AO REDOR DO MUNDO"; e-mail + (11) 2050-2540 + ouvidoria |
| **Auvo** (concorrente direto) | **Não** | Não | "+8.000 empresas", "+70M ordens de serviço", "+20 países"; 0800 |
| **Bling** (ERP, grupo LWSA) | **Sim** — `LWSA – Filial Bling. CNPJ: 02.351.877/0011-24.` | Não | Escala + marca conhecida |

Leitura estratégica: os dois concorrentes diretos jogam o jogo do **número de clientes** — jogo
que a OLLI perde por definição hoje (zero pagantes). O **CNPJ visível é o jogo que a OLLI pode
ganhar de graça**, porque o concorrente grande simplesmente não joga. "Somos uma empresa
identificada, com endereço, e o Field Control não te diz nem o CNPJ dele" é uma frase que a
OLLI pode dizer e é verdadeira.

Contexto do público: 77% dos consumidores brasileiros já abandonaram compra online por falta de
confiança (Akamai, via CNDL/Varejo S.A., jun/2025), e 81,9% consideram selo de verificação
decisivo (Instituto Reclame AQUI). A desconfiança é o estado default do comprador brasileiro
online — e o comprador aqui é um prestador que já foi passado para trás.

### 1.3 Onde o CNPJ entra — especificação

**Princípio de engenharia:** um único arquivo-fonte. Esta casa já tem a regra
("copy derivada da fonte", `olli-copy-derivada-da-fonte`) e ela vale aqui: dado jurídico
duplicado em quatro lugares diverge na primeira atualização.

**Criar `web/src/data/empresa.ts`** — a fonte de verdade institucional:

```ts
/**
 * Identidade jurídica da OLLI. FONTE ÚNICA: rodapé, /empresa/, JSON-LD e os
 * documentos legais leem daqui. Não repita nenhum destes valores à mão.
 */
export const EMPRESA = {
  razaoSocial: "PREENCHER LTDA",          // ← DONO: razão social do cartão CNPJ
  nomeFantasia: "OLLI",
  cnpj: "00.000.000/0001-00",             // ← DONO: CNPJ formatado
  endereco: {
    logradouro: "PREENCHER, nº PREENCHER", // ← DONO
    bairro: "PREENCHER",                   // ← DONO
    cidade: "São Paulo",
    uf: "SP",
    cep: "00000-000",                      // ← DONO
    pais: "BR",
  },
  emailContato: "contato@olliorcamentos.online",   // ← DONO: criar a caixa
  emailPrivacidade: "privacidade@olliorcamentos.online", // ← DONO: criar a caixa
  whatsapp: "5511941727487",              // já existe (index.astro:22)
  responsavel: "PREENCHER",               // ← DONO: quem assina/responde
} as const;
```

São **8 marcadores** para o dono preencher, todos em um arquivo. **Não inventei o CNPJ** e o
documento não sugere nenhum número.

Onde o dado aparece, em ordem de prioridade:

| # | Onde | Arquivo | Esforço | Por quê |
|---|---|---|---|---|
| 1 | **Bloco institucional no rodapé `completo`** — razão social · CNPJ · endereço · e-mail, abaixo da linha de links | `web/src/components/Footer.astro:31-49` | **P** (~30 min) | Cumpre o Decreto 7.962; é o lugar que o dono descreveu; cobre `/`, `/ajuda/`, `/legal/*` |
| 2 | **Rodapé `minimal` ganha razão social + CNPJ + Privacidade/Termos** | `Footer.astro:47-55` | **P** (~15 min) | Ver §1.5 — é o furo maior |
| 3 | **JSON-LD `Organization` com `legalName`, `taxID`, `address`, `contactPoint`** | `web/src/layouts/Layout.astro:47-56` | **P** (~30 min) | Confiança + SEO no mesmo movimento (§1.6) |
| 4 | **Seção 1 da Privacidade recebe o dado real** (o texto já pede) | `src/content/legal/privacidade.ts:71-76` | **P** (~15 min) | Fecha a lacuna que hoje está escrita em voz alta |
| 5 | **Página `/empresa/`** — institucional dedicada | rota nova `web/src/pages/empresa/index.astro` | **M** (~3 h com copy) | O padrão "about us" que o Google recomenda para o markup de Organization e que o cético procura |
| 6 | `llms.txt` cita razão social + CNPJ | `web/src/pages/llms.txt.ts` | **P** (~10 min) | Buscador de IA cita a entidade correta |

**Detalhe de acessibilidade (regra 9), medido nos tokens reais:** o rodapé usa `text-muted`
(`#64748b`) sobre `bg-paper` (`#f6f9fc`) = **≈4,5:1** — passa AA raspando, sem margem nenhuma.
Dado jurídico não pode ficar no fio. Use **`text-slate` (`#475569`) ≈ 7,2:1** na linha
institucional. E o CNPJ tem que ser **texto selecionável**, nunca imagem — gente copia e cola
para conferir na Receita.

### 1.4 P0 — O aviso de "MODELO" está no ar (conserte isto primeiro)

Cadeia exata do defeito:

- `web/src/pages/legal/privacidade.astro:23-25` e `web/src/pages/legal/termos.astro:23-25`
  renderizam `{doc.aviso}` numa caixa `bg-tint`, logo abaixo do `<h1>`.
- `src/content/legal/privacidade.ts:52-56` — *"Este é um MODELO de política de privacidade …
  **deve ser revisado e adaptado por um(a) advogado(a) antes de ser publicado** ou usado com
  clientes reais."*
- `src/content/legal/termos.ts:17-20` — *"Este é um MODELO de termos de uso … deve ser revisado
  … **incluindo razão social, CNPJ, foro e valores** — antes de ser publicado."*
- `src/content/legal/privacidade.ts:74-76` (seção 1, corpo do documento) — *"**Antes de
  publicar, complete aqui a razão social, o CNPJ, o endereço** e um e-mail de privacidade da
  empresa."*

Esses textos foram escritos como nota **para o time**, e viraram texto **para o cliente**.
Estão em produção nas duas páginas — e provavelmente também na `LegalScreen` do app, que
renderiza o mesmo objeto (o cabeçalho de `privacidade.ts:2-3` diz isso).

Impacto: quem clica em "Privacidade" está no momento exato da avaliação de risco. Ele lê que
(a) o documento não foi revisado por advogado, (b) a empresa não preencheu a própria razão
social, (c) não deveria ter sido publicado. Nenhum CNPJ no rodapé compensa isso.

**Correção (esforço P no código, dependência externa real):**

1. Preencher o dado institucional (§1.3) — mata a instrução visível na seção 1.
2. **Tirar da tela o aviso de "modelo"**. Ele é honesto e correto *como nota interna* — mova-o
   para o comentário JSDoc do arquivo (onde já existe, em `privacidade.ts:5-8`) e substitua o
   campo `aviso` renderizado por algo verdadeiro e útil, do tipo: *"Documento vigente desde
   {data}. Dúvidas sobre os seus dados: privacidade@… ou WhatsApp (11) 94172-7487."*
3. **A dependência externa continua real:** o texto precisa mesmo de leitura de advogado antes
   de a OLLI cobrar de gente. Não estou dizendo para fingir revisão — estou dizendo para não
   *anunciar ao cliente* que ela não aconteceu. As duas coisas são independentes: tirar o
   aviso da tela hoje, agendar a revisão jurídica em paralelo.

> **Cuidado de escopo:** `src/content/legal/*` é compartilhado com o app Expo (`LegalScreen`).
> Mexer ali muda o app também. É desejável — mas quem for executar precisa saber que o blast
> radius não é só a landing.

### 1.5 P1 — Sete páginas sem link para Privacidade/Termos

`web/src/components/Footer.astro` tem duas variantes. A `minimal`
(`Footer.astro:47-55`) contém **apenas** "← Voltar para o início" e o copyright.

Quem usa `minimal`:
- as **6 páginas `/para/[oficio]/`** — climatização, elétrica, hidráulica, pintura, dedetização,
  jardinagem (`para/[oficio].astro:348`);
- a **404** (verificar `404.astro`).

Ou seja: as **páginas de conversão**, para as quais o SEO por ofício está mandando tráfego frio,
são justamente as que não oferecem Privacidade, Termos, Ajuda nem identidade da empresa. O
visitante que chegou por "app de orçamento para eletricista" não tem como descobrir quem é a
OLLI sem voltar para a home.

O comentário no código justifica a variante ("a navegação completa seria só distração antes do
CTA") e o raciocínio é bom para *Planos/Recursos*. Não vale para **Privacidade, Termos e
identidade**: link legal em rodapé não compete com CTA, e é um dos "quatro fatores de
credibilidade" clássicos do NN/g (*upfront disclosure* + *connection to the rest of the web*).

**Correção (P, ~15 min):** a variante `minimal` mantém a economia visual e ganha uma segunda
linha: `Razão Social · CNPJ 00.000.000/0001-00 · Privacidade · Termos`. Três links, uma linha,
`text-xs text-slate`.

### 1.6 JSON-LD — o que acrescentar e o que **não** acrescentar

O que já está certo em `Layout.astro` e deve ser preservado: `@id` nomeando o nó da
Organization, o `WebSite` referenciando por `@id`, a ausência deliberada de `aggregateRating` e
de `SearchAction`. Os comentários dali são bons; não os apague ao editar.

**Acrescentar** ao `schemaOrganizacao` (Google documenta suporte a todos estes):

```jsonc
{
  "legalName": "<EMPRESA.razaoSocial>",
  "taxID": "<EMPRESA.cnpj>",          // Google: taxID deve casar com o país do address
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "…", "addressLocality": "São Paulo",
    "addressRegion": "SP", "postalCode": "…", "addressCountry": "BR"
  },
  "email": "contato@…",
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "telephone": "+55-11-94172-7487",
    "availableLanguage": "Portuguese",
    "areaServed": "BR"
  },
  "foundingDate": "AAAA-MM-DD",        // ← DONO: data de abertura do CNPJ. Só se real.
  "sameAs": ["…"]                       // ← DONO: perfis oficiais que EXISTEM (Instagram, LinkedIn)
}
```

**Dois defeitos a corrigir de passagem:**

1. **`logo` está errado.** `Layout.astro:52` aponta `logo: /og-image.png` — que é o banner
   **1200×630** do Open Graph, não um logotipo. Google exige logo rastreável, indexável e de no
   mínimo 112×112; um banner 1,9:1 é recortado ou descartado. A correção sai de graça da §2:
   aponte para o **`/icone-512.png`** que a onda do ícone vai gerar. (Bônus: o `og-image.png`
   tem 239 KB — pesado para um asset que também não é logo.)
2. **`sameAs` não existe hoje.** É o fator "connection to the rest of the web" do NN/g e o que
   permite ao Google ligar o site a perfis reais. Só entra com perfil que existe de verdade.

**NÃO usar `LocalBusiness`.** O dono citou "Organization/LocalBusiness" — e `LocalBusiness` está
errado aqui. Ele descreve negócio com ponto físico onde o cliente comparece, e puxa expectativa
de `openingHoursSpecification`, `geo`, avaliação local. A OLLI é SaaS nacional: o cliente nunca
vai ao endereço. Declarar `LocalBusiness` seria schema mentindo sobre o conteúdo — exatamente a
classe de erro que esta base já recusou duas vezes (o `aggregateRating` fake e o `SearchAction`
inexistente). **`Organization` só.**

Colocação: o Google recomenda o markup de Organization na home **ou** numa única página que
descreva a organização. Hoje o `Layout.astro` emite em **todas** as páginas. Não é erro, mas se
a `/empresa/` (§1.3, item 5) nascer, ela é o lar canônico.

### 1.7 O problema real: prova social honesta com ZERO pagantes

Esta é a parte difícil do pedido, e merece ser tratada como estratégia, não como copy.

**A regra:** todo elemento de prova tem que sobreviver à pergunta *"me mostra"*. Depoimento
inventado morre na primeira pergunta; número inflado morre quando o prestador pergunta "quem?".
Com zero pagantes, restam **seis provas verdadeiras** — e elas somadas são mais fortes que
"+5.000 clientes", porque nenhuma delas é auditável no concorrente.

**Prova 1 — Existência verificável.** É a que o dono intuiu. Razão social + CNPJ + endereço +
canal com pessoa. Frase honesta e forte: *"Somos uma empresa registrada, com CNPJ e endereço.
Você consegue nos achar."* Repare que ela é **impossível** para o Field Control e a Auvo dizerem
com a mesma clareza hoje. Custo: só o preenchimento.

**Prova 2 — Origem (existe, subaproveitada).** A seção "Feita por quem vive de campo"
(`index.astro:438`) já é a melhor peça de confiança da página. O que falta e é verdadeiro:
- **rosto e nome** de quem faz — o próprio comentário do código diz "o slot está pronto pra foto
  real do Igor/equipe entrar". Foto real, de campo, sem banco de imagens. NN/g e a prática de SaaS
  brasileiro convergem: suporte com rosto converte porque prova que existe gente atrás;
- **um número da GR Tech que seja real** (anos de operação, equipamentos atendidos, quantas
  ordens por mês). É prova de *domínio do ofício*, não de base de clientes — e é honesta desde
  que rotulada como "na GR Tech", nunca como "clientes OLLI".

**Prova 3 — Artefato.** A prova mais subestimada: **mostrar o documento que sai**. O commit
`1f38cd3` já implementou a geração do PDF real do orçamento no painel. Publicar
**`/exemplo/`** com um PDF de orçamento real (dados fictícios, marca da OLLI) e o link de
aprovação do cliente funcionando é prova sem depender de cliente nenhum. Quem vende fumaça não
mostra o entregável. **Esforço M** (~3 h), retorno alto: é o "me mostra" respondido antes de ser
feito.

**Prova 4 — Profundidade (já está no ar e é a melhor).** Os 698 códigos de erro, as 21
calculadoras **com a norma citada em cada card** (`para/[oficio].astro` renderiza `c.base`).
Quem finge não lista NBR. Manter e não diluir.

**Prova 5 — Risco assumido.** Cada garantia verificável no produto vira prova:
"sem cartão para testar", "grátis sem prazo", "exporta e sai quando quiser", "cancela sozinho".
As três primeiras já estão na página (`index.astro:284-286`, `491`). A que falta e vale muito
para este público: **"seus dados saem com você"** — link direto para o artigo de exportação na
Ajuda. E quando o Mercado Pago entrar, **exibir as formas de pagamento** (Pix + cartão) na
seção de planos: bandeira/Pix visível é sinal de operação real, e o Pix é o meio que este
público confia.

**Prova 6 — Resposta.** Canal com nome, horário e prazo: *"Quem responde é o {responsável}.
Segunda a sexta, 8h–18h. Resposta em até X horas úteis."* Só publique o X que você vai cumprir.
É melhor "até 1 dia útil" cumprido do que "na hora" quebrado.

**A moldura que transforma a ausência em vantagem:** um **"Programa Fundador"** — *"A OLLI é
nova. As 20 primeiras empresas entram como fundadoras: preço travado, canal direto com quem
constrói e voz no que entra primeiro."* Isso é literalmente verdade, converte a fraqueza
("ninguém usa ainda") em escassez legítima, e cria a base para a Prova 7 no futuro:
**contador honesto** — *"X prestadores criaram conta esta semana"* — mas **só quando o número
vier do banco**, nunca digitado à mão.

### 1.8 O que NÃO fazer (lista fechada)

- **Selo inventado.** Nada de arte de "Site Seguro", "Empresa Verificada", "Compra Protegida".
  O RA Verificada, por exemplo, é pago, auditado **mensalmente** e removido automaticamente se
  a reputação cair — desenhar um selo parecido é uso indevido de marca alheia, não é "design".
- **Depoimento inventado, mesmo "ilustrativo".** Sem cliente, sem depoimento. Nem com aviso em
  letra miúda.
- **"Milhares de clientes", "+X empresas", "líder de mercado".** É o jogo do concorrente. Jogar
  sem as fichas é mentir, e quebra na primeira ligação de vendas.
- **`aggregateRating` no JSON-LD.** Já está barrado no código com comentário
  (`Layout.astro:38-42`). **Manter barrado.** É penalidade do Google e é mentira.
- **Logo de terceiro como "cliente".** A **GR Tech é a origem**, não cliente pagante. Rotular
  como "nossos clientes" seria falso; "nascemos aqui" é verdadeiro e mais interessante.
- **`LocalBusiness` no schema.** §1.6.
- **Endereço virtual apresentado como sede, com foto de prédio.** Endereço de contabilidade é
  normal e legítimo — desde que não venha acompanhado de foto de escritório que não é seu.
- **"Desde 2015" / data de fundação inflada.** `foundingDate` é verificável no cartão CNPJ.
- **Publicar um CNPJ que não existe.** Se ainda não há CNPJ, a seção institucional **não sai** —
  o marcador fica em `empresa.ts` e o bloco não é renderizado. Não substitua por CPF pessoal
  (expor CPF em página pública é risco de fraude para o próprio dono). A própria copy da página
  já fala com público MEI-literato ("os dois abaixo do DAS do MEI", `index.astro:188`); abrir o
  MEI/ME é o caminho, e destrava também o gateway de pagamento como PJ.

### 1.9 Como medir (regra 10, adaptada ao que dá para medir)

Confiança não tem métrica de laboratório. O que dá para medir:

- **Antes/depois no Cloudflare Web Analytics** (já ativo — está liberado no CSP): taxa de clique
  no CTA de cadastro na home e nas `/para/*`; visitas a `/legal/*` e (quando existir) `/empresa/`.
- **Teste do cético, 5 pessoas, 30 segundos:** dê a home a 5 prestadores e peça: *"descubra quem
  é a empresa dona disto"*. Hoje a resposta é "não dá". Meta: 5/5 acham em menos de 30 s.
- **Regressão zero de performance:** o bloco institucional é texto. Se o LCP ou o INP mexerem,
  algo além do texto entrou junto.

---

## 2. O ÍCONE — DIAGNÓSTICO E CORREÇÃO

### 2.1 Diagnóstico confirmado, e maior do que o esperado

O que foi passado no briefing está correto e eu confirmo, arquivo por arquivo:

```
web/public/
  favicon.ico    655 bytes
  favicon.svg    917 bytes
  og-image.png   239.577 bytes  (1200×630)
  robots.txt
```

Não existe `manifest.webmanifest`, não existe `apple-touch-icon.png`, não existem PNG 192/512.
Confirmado. `web/src/layouts/Layout.astro:89-90` declara só dois ícones:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" href="/favicon.ico" sizes="any" />
```

**Mas o achado maior é o conteúdo do `favicon.ico`.** Abri os bytes:

- Assinatura do arquivo: `89 50 4E 47` — **é um PNG**, não um ICO. O nome mente.
- `IHDR`: **32×32**, bit depth 8, **color type 3** (paleta indexada de 84 cores).
- Histograma dos pixels: `#000000` = 727 px (71%), `#FFFFFF` = 134 px, e o resto são **cinzas**
  (`#878787`, `#454545`, `#232323`, `#E2E2E2`, `#C4C4C4`). **Zero pixel azul.** Nenhum
  `#0B6FCE`, nenhum `#3FD8EA`.
- Renderizado, é um quadrado escuro com uma forma branca de "A".

Isso é o **favicon padrão do template do Astro** (a marca do framework: forma "A", preto/branco,
sem cor de marca), que nunca foi substituído quando a landing foi construída. Independente da
origem, o fato mensurável é: **o arquivo que a barra de tarefas do Chrome está usando não é a
marca da OLLI.**

Por isso o dono descreve "**nada a ver**" e não "pequeno demais". Ele está vendo:
1. **outra marca** — e o cérebro registra isso antes de registrar a nitidez;
2. **esticada 8×** — o maior raster disponível no site inteiro é 32×32; o Windows quer 44×44 na
   barra de tarefas e até 256×256 no atalho/menu Iniciar. Upscale de 32→256 é o "borrão";
3. **em escala de cinza**, num sistema onde os outros ícones da barra são coloridos.

Por que a aba parece menos errada que a barra de tarefas: na aba o Chrome tende a usar o
`favicon.svg` (que **é** a marca da OLLI). Para o atalho/pin, ele procura um **raster grande** —
e o único que existe é o `.ico` cinza. Daí a inconsistência que o dono percebeu.

### 2.2 Como o Chrome escolhe o ícone (o mecanismo)

- Para **app instalado (PWA)**, o Chrome usa os ícones do **manifest** — daí a exigência de
  192 e 512 px na documentação.
- Para **site sem manifest**, a engenharia do Chromium descreveu o fallback: *no desktop, o
  Chrome pega o manifest **e também todos os favicons (incluindo os touch icons)**, porque
  muitos sites de desktop não têm manifest, e tenta escolher o mais próximo do tamanho correto
  para o balão e para o atalho da área de trabalho* (chromium-discuss). **Ou seja: dá para ter
  ícone grande e nítido no atalho sem manifest nenhum — basta existir raster grande declarado.**
- No Windows, o ícone é exibido a ~44×44 na barra de tarefas e ~150×150 no menu Iniciar; o
  Chrome escala o que tiver.
- O Google, para o favicon do resultado de busca, recomenda **quadrado e maior que 48×48**
  (mínimo técnico 8×8). O `.ico` de 32×32 atual fica abaixo da recomendação.

### 2.3 A tensão com "não pode virar PWA" — e por que ela some

Restrição do projeto: a landing **não pode** virar PWA (a web antiga era RN-web, "virava PWA",
foi motivo de reclamação e da reconstrução — memória `olli-web-rebuild-decisao`).

O que de fato liga o comportamento de app instalável, segundo os critérios do Chrome:

| Ingrediente | Liga PWA? | Estado hoje |
|---|---|---|
| `<link rel="manifest">` com `name`/`icons` 192+512/`start_url`/`display: standalone` | **Sim** — é o gatilho | ausente |
| `display: "standalone" \| "fullscreen" \| "minimal-ui" \| "window-controls-overlay"` | **Sim** | — |
| `display: "browser"` | **Não** — fora da lista de instaláveis | — |
| Service worker | **Não é mais requisito** (removido: Chrome 108 mobile / 112 desktop) | **nenhum em produção** — verificado: o único SW do repo é o MSW em `webapp/src/main.tsx:39`, dentro de `if (import.meta.env.DEV)` |
| `<link rel="icon" sizes="192x192">` e afins | **Não** | ausente |

**Decisão recomendada: NÃO gerar manifest.** Rasters grandes declarados como `rel="icon"` +
`apple-touch-icon` resolvem o atalho **sem tocar em nenhum dos ingredientes de instalabilidade**.
A tensão que o briefing antecipou simplesmente não se materializa: ela só existiria se o manifest
fosse o único caminho, e não é.

> **Plano B, se após o deploy o atalho ainda pegar um ícone pequeno** (o fallback por favicon é
> comportamento documentado, mas não é contrato de API e varia por versão): adicionar um manifest
> **mínimo e deliberadamente não-instalável** — `name`, `icons` (192/512) e **`"display": "browser"`**,
> **sem** `start_url` apontando para fora, **sem** service worker, **sem** `beforeinstallprompt`.
> Com `display: "browser"` o site fica fora dos critérios de instalação e o Chrome abre em aba
> normal. Isto é o Plano B — não faça junto com o Plano A "por garantia": manifest existindo é
> superfície que alguém no futuro promove a `standalone` sem entender o histórico.

### 2.4 Os arquivos a gerar (tamanhos e origem exatos)

**A fonte NÃO pode ser `assets/icon.png`.** Abri a imagem: é 1024×1024, mas o mascote ocupa só
~40% da largura — o resto é margem azul-escura. Essa margem é **correta** para ícone de app
(iOS/Android aplicam máscara e alinham numa grade), e **errada** para favicon: a 32 px, o
mascote ficaria com ~13 px úteis dentro de um quadrado azul. Redimensionar `icon.png` é a
armadilha que produz "marca minúscula flutuando num quadrado".

**Fonte correta: o vetor.** O `favicon.svg` atual (`web/public/favicon.svg`) tem a proporção
certa — o corpo do balão ocupa 46/64 = **72%** da largura. Rasterizar a partir dele (ou de uma
versão dele com a margem ajustada) dá borda limpa em qualquer tamanho.

| Arquivo | Tamanho | Variante | Fundo | Para quê |
|---|---|---|---|---|
| `favicon.ico` | **ICO de verdade**, com 16, 32 e **48** | **simplificada** (§2.6) | navy `#0A2547` sólido | aba, legado, `/favicon.ico` que RSS e crawlers pedem direto; os 48 px atendem a recomendação do Google |
| `favicon.svg` | vetor | **simplificada** (§2.6) | navy sólido | aba em telas de alto DPI; é onde ele é visto a 16–20 px |
| `apple-touch-icon.png` | **180×180** | completa | **sólido, sem alpha** (iOS não respeita transparência) | atalho de iPhone/iPad; o Chrome desktop também considera touch icons no atalho |
| `icone-192.png` | 192×192 | completa | sólido | raster médio para o atalho |
| `icone-512.png` | 512×512 | completa | sólido | maior raster do atalho **e** `logo` do JSON-LD (§1.6) |

**Não gerar** `icone-maskable-512.png`: máscara adaptativa só é lida a partir do manifest
(`purpose: "maskable"`), e não vamos ter manifest. Gerar seria peso morto.

Peso estimado: ~40–60 KB somados, todos otimizados. Impacto em LCP: praticamente nulo — o
navegador busca o favicon fora do caminho crítico de renderização, e os rasters grandes só são
pedidos quando o SO precisa deles. **Verificar na aba Network** depois do deploy que a home em
4G não está baixando o 512 no boot; se estiver, é sinal para reavaliar quantos `rel="icon"`
declarar (público de rede ruim — regra do briefing).

### 2.5 As tags no `<head>` (substituem `Layout.astro:89-90`)

```html
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" type="image/png" sizes="192x192" href="/icone-192.png" />
<link rel="icon" type="image/png" sizes="512x512" href="/icone-512.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<!-- SEM <link rel="manifest">: a landing não é PWA por decisão de produto. -->
```

Detalhe fino que já está errado hoje: a linha atual usa `sizes="any"` no `.ico`. A recomendação
corrente é **`sizes="32x32"`**, que corrige um comportamento do Chrome de preferir o ICO ao SVG.
`sizes="any"` declara que o arquivo é escalável — e ele é um PNG de 32 px, ou seja, a declaração
é falsa.

**Infra — três coisas para não tropeçar:**

1. `web/public/` é copiado direto para `dist/` pelo Astro. Basta colocar os arquivos ali.
2. **CSP:** `img-src 'self' data:` (gerado por `web/scripts/gerar-headers.mjs`) já cobre ícones
   do próprio domínio. **Nada a mudar** — e se um dia o Plano B entrar, note que `manifest-src`
   não está declarado e cai no `default-src 'self'`, que também permite.
3. **`X-Content-Type-Options: nosniff` está ativo.** Servir um PNG com extensão `.ico` (o estado
   atual) é frágil por definição: o worker de assets rotula pelo nome, e o conteúdo não bate.
   Navegador tolera para favicon; ferramenta que faz parse estrito de ICO (shell do Windows,
   leitor de RSS, alguns crawlers de preview) pode não tolerar. Gerar um ICO de verdade resolve
   e some com a categoria inteira de problema.

**Operação — avise o dono disto ou ele vai dizer que não mudou nada:** o Chrome guarda favicon
em cache local agressivo, e um atalho já fixado **não é atualizado** quando o site muda de
ícone. Depois do deploy é preciso **remover o atalho fixado, recarregar a página com cache
limpo e fixar de novo**. Teste de aceite: o ícone da barra de tarefas está **azul**, com o
balão da OLLI, e continua legível a 100% de zoom.

**Medição antes/depois (regra 10):**
- **Antes:** maior raster da marca disponível no site = **32×32**, escala de cinza, marca errada.
- **Depois:** maior raster = **512×512**, cor de marca, marca certa. Fator de escala do upscale
  no atalho de 256 px cai de **8×** para **0,5×** (downscale, que é sempre nítido).
- Conferir também o `dist/`: os cinco arquivos presentes, `favicon.ico` com assinatura `00 00 01 00`
  (ICO real) e três entradas de tamanho.

### 2.6 O ícone simplificado para 16–32 px

O mascote tem, em `favicon.svg`, seis elementos. A conta do que sobra a 16 px (cada unidade do
viewBox 64 vale **0,25 px** na tela):

| # | Elemento | Geometria | A 16 px | Veredito |
|---|---|---|---|---|
| 1 | Placa de fundo navy, `rx 16` | 60×60 | 15×15 px | **Manter** |
| 2 | **Rabinha do balão** | ~18×10 unidades, diagonal fina | ~4,5×2,5 px, com ponta de ~0,5 px | **REMOVER** — é o primeiro a virar mancha; ponta fina em diagonal é o pior caso de rasterização |
| 3 | Corpo do balão, gradiente, `rx 14.5` | 46×44 | 11,5×11 px | **Manter** (é a silhueta que identifica) |
| 4 | **Faixa branca de brilho** `fill-opacity 0.1` | 38×15 | invisível | **REMOVER** — some no downsample e ainda suja o resultado com uma franja cinza no topo |
| 5 | **Dois olhos** | 8,5×11 cada, vão de 7 unidades entre eles | ~2,1×2,75 px cada, ~1,75 px de vão | **REMOVER** — dois blocos de 2 px separados por 1,75 px viram um borrão único, e competem com o check pelo mesmo espaço |
| 6 | **Check**, traço 6 | 22×15, traço 1,5 px a 16 px | legível | **Manter e ENGROSSAR** |

**Especificação da variante pequena (viewBox 0 0 64 64):**

1. Remover elementos 2, 4 e 5.
2. **Aumentar a área útil:** com a rabinha fora, o corpo pode crescer da caixa `9,8 46×44` para
   algo em torno de `6,6 52×52`, mantendo `rx` proporcional (~16). Margem de ~6 unidades em vez
   de 8–12 — a 16 px isso é a diferença entre 11 px e 13 px de marca útil (**+38% de área**).
3. **Centralizar o check** no corpo (hoje ele mora no terço inferior porque divide espaço com os
   olhos). Sem os olhos, ele é o único elemento e deve ocupar o centro óptico.
4. **Engrossar o traço** do check de `6` para **`8–9`** e manter `stroke-linecap="round"`.
5. **Achatar o gradiente para cor sólida.** Um gradiente a 45° sobre 16 px atravessa ~22 pixels
   totais e vira barro. Use **`#0B6FCE` sólido** (o azul de marca) no corpo, com o check em
   `#EAFEFF`. O gradiente ciano→azul continua vivo nos tamanhos 180/192/512 e no logotipo do
   cabeçalho (`OlliLogo.astro`), onde ele é visível de verdade.

**Se o dono não quiser abrir mão dos olhos:** aí remove-se o **check** e ficam os olhos — mas
recomendo o contrário. O check é uma diagonal grossa e única, a forma mais robusta a 16 px, e
carrega o significado do produto ("aprovado / fechado"). Os olhos são a personalidade da marca,
e personalidade tem espaço a partir de 48 px. Manter os dois é o que produz a mancha.

**Onde cada variante vive, para não haver confusão:**

| Variante | Onde |
|---|---|
| **Simplificada** (sem rabinha, sem olhos, sem brilho, check grosso) | `favicon.svg`, `favicon.ico` (16/32/48) |
| **Completa** (mascote inteiro, gradiente) | `apple-touch-icon.png` 180, `icone-192.png`, `icone-512.png`, `OlliLogo.astro` (cabeçalho/rodapé), `og-image.png` |

### 2.7 O que NÃO fazer no ícone

- **Não redimensionar `assets/icon.png`.** §2.4 — a margem do ícone de app produz marca minúscula.
- **Não adicionar manifest "só para garantir".** §2.3.
- **Não registrar service worker.** Nem para cache, nem para offline, nem "só na landing".
  Hoje há zero em produção e essa é a condição que mantém a promessa ao dono.
- **Não usar o `og-image.png` (1200×630) como ícone nem como `logo` do schema.** §1.6.
- **Não gerar 20 tamanhos** (`favicon-16`, `-24`, `-48`, `mstile-*`, `android-chrome-*`…). Os
  geradores online cospem isso por padrão. Cinco arquivos cobrem o caso; o resto é peso e
  manutenção.
- **Não animar o favicon.** (Existe. Não faça.)

---

## 3. "TUDO REDONDINHO" — A ESCALA DE RAIO

### 3.1 O que a landing usa hoje (inventário medido, não estimado)

Contei todas as ocorrências de `rounded-*` em `web/src` (85 no total). Tailwind 4 traduz assim:
`rounded-lg` = 8 px, `xl` = 12 px, `2xl` = 16 px, `3xl` = 24 px, `4xl` = 32 px, `full` = pílula.

| Classe | px | Ocorrências | Onde |
|---|---|---|---|
| `rounded-full` | pílula | ~24 | chips de ofício, badge "Recomendado", bolinhas de lista, barra de confiança da IA, numeração da Ajuda |
| `rounded-2xl` | **16** | ~22 | **todos os cartões**: ofícios, passos, recursos, planos, artigos da Ajuda, container do FAQ, cards de `/para/*` |
| `rounded-xl` | **12** | ~14 | **CTAs principais**, botão dos planos, chip de ícone 44×44, caixa de aviso legal, wrapper de tabela |
| `rounded-lg` | **8** | ~8 | botões do cabeçalho ("Entrar", "Teste grátis"), botões da 404, skip-link |
| `rounded-3xl` | **24** | 4 | bloco da IA, bloco "Quem faz a OLLI", CTA final |
| `rounded-md` / `-sm` / `-[2.65rem]` etc. | 6 / 4 / 42 | ~13 | **só dentro do `HeroDevices.tsx`** — mockups de aparelho |

**Diagnóstico:** a landing hoje tem **quatro degraus** (8 · 12 · 16 · 24) mas os degraus estão
**baixos e comprimidos**. O botão principal (12 px, numa altura de ~52 px) é o elemento mais
"duro" da página — e é justamente o que o dono clica e olha mais.

### 3.2 O que o app e o painel usam (a incoerência real)

**App Expo** — `src/theme/index.ts:147`:

```ts
export const BorderRadius = { sm: 12, md: 18, lg: 24, xl: 30, xxl: 36, full: 999, chip: 14 };
```

Uso medido no código do app: `md`(18) **176×** · `full` **154×** · `lg`(24) **129×** ·
`sm`(12) 44× · `xl`(30) 38× · `chip`(14) 30×.

**Painel web** — `webapp/src/global.css:68`: `--radius: 0.5rem` (**8 px**, default do shadcn);
uso dominante `rounded-full`(90) · `rounded-lg`(58) · `rounded-xl`(45) · `rounded-md`(37).

**Conclusão que muda a conversa:** o pedido "quero tudo redondinho" **não é capricho — é
coerência**. Hoje:

| | Botão | Cartão | Bloco |
|---|---|---|---|
| **App (o produto)** | **24 px** (pílula em botão de 48) | **18 px** | 24–30 px |
| **Landing (a promessa)** | **12 px** | 16 px | 24 px |
| **Painel** | 8 px | 8–12 px | — |

A landing é **mais dura que o produto que ela vende**, e o painel é mais duro que os dois. Subir
o raio da landing não é enfeite: é fazer a promessa parecer com a entrega. (O painel é área de
outra onda; ver §3.6.)

**Cuidado de composição:** a outra onda está trocando a fonte para **Rubik**, que já tem cantos
de haste arredondados. Fonte redonda + raio alto **somam**. Por isso a escala abaixo é
deliberadamente *contida* — subir os dois no talo ao mesmo tempo é o caminho mais curto para o
"infantil" que o dono não quer.

### 3.3 A escala proposta — token a token

Tokens semânticos em `@theme` no `global.css` (no Tailwind 4, o namespace `--radius-*` gera as
classes automaticamente: `--radius-cartao: 20px` → `rounded-cartao`). Semântico, e não `sm/md/lg`,
porque a hierarquia fica legível na revisão: quem lê `rounded-cartao` num bloco-herói sabe que
errou.

```css
@theme {
  /* Escala de raio — 6 degraus. Sobe com o TAMANHO do elemento, não com a vontade. */
  --radius-fio:    4px;   /* barras de 4–8px de altura */
  --radius-campo: 12px;   /* input, select, botão pequeno, badge retangular */
  --radius-acao:  16px;   /* botão de ação dentro de cartão/cabeçalho */
  --radius-cartao: 20px;  /* cartão de conteúdo */
  --radius-caixa: 28px;   /* superfície que AGRUPA cartões/linhas */
  --radius-bloco: 36px;   /* bloco-seção de largura total */
  /* pílula = rounded-full, já existe */
}
```

Mapeamento completo — de → para:

| Elemento | Hoje | Proposto | Token | Por quê |
|---|---|---|---|---|
| Barra de confiança da IA (`h-1.5`) | `full` | `full` | — | 6 px de altura: pílula é o correto |
| Bolinha de lista, dot | `full` | `full` | — | — |
| Input / select (não existe ainda na landing) | — | 12 px | `campo` | reserva o degrau para quando houver formulário |
| Botão "Entrar" / "Teste grátis" (cabeçalho) | **8** | **12** | `campo` | botão pequeno (~40 px de altura); 12 é o teto antes de virar pastilha |
| Botão dentro de cartão (CTA dos planos) | **12** | **16** | `acao` | ~44 px de altura |
| Chip de ícone 44×44 (`h-11 w-11`) | **12** | **16** | `acao` | quadrado pequeno; acima de 16 vira círculo com sobras |
| **CTA principal** (hero, `/para/*`, CTA final) | **12** | **pílula** | `full` | §3.4 — o argumento está lá |
| Chip de ofício (pílula com borda) | `full` | `full` | — | manter |
| Badge "Recomendado" | `full` | `full` | — | manter |
| **Cartão**: ofício, recurso, passo, plano, artigo da Ajuda, card de `/para/*` | **16** | **20** | `cartao` | o degrau que mais aparece na página; +4 px é perceptível sem ser fantasia |
| **Caixa que agrupa**: container do FAQ, wrapper de tabela, caixa de aviso legal | **16 / 12** | **28** | `caixa` | precisa ser visivelmente maior que o cartão que ela contém, senão a hierarquia some |
| **Bloco-seção**: IA, "Quem faz a OLLI", CTA final | **24** | **36** | `bloco` | superfícies de 400 px+; 36 é ~9% do lado menor (§3.4) |
| Mockups de aparelho no `HeroDevices.tsx` | 42 / 40 / 34 | **não tocar** | — | são cantos de **celular físico**; mexer quebra a ilusão de aparelho real |

**Resultado:** seis degraus com espaçamento crescente (4 · 12 · 16 · 20 · 28 · 36 + pílula).
A hierarquia **aumenta** em vez de achatar — que é o risco que o briefing levantou corretamente.
Hoje cartão(16) e caixa(16) são idênticos e bloco(24) está a um passo só; depois, cada nível se
distingue.

### 3.4 O teto: onde vira infantil

O erro comum é procurar um número absoluto. **O que faz parecer brinquedo é a razão entre o raio
e o lado menor do elemento**, não o raio.

**Regra prática: raio ≤ ~12% do lado menor.** Acima de ~20% a forma lê como adesivo/brinquedo.

Conferindo a proposta contra os elementos reais:

| Elemento | Lado menor | Raio | Razão | Leitura |
|---|---|---|---|---|
| Bloco "Quem faz a OLLI" (`p-12`, ~260 px de altura) | ~260 px | 36 | **14%** | limite — ok num bloco de largura total |
| Bloco da IA (~400 px) | ~400 px | 36 | **9%** | confortável |
| Cartão de recurso (~180 px de altura) | ~180 px | 20 | **11%** | ok |
| Chip de ícone 44×44 | 44 px | 16 | **36%** | proposital: é quase-círculo, e a intenção é essa |
| CTA principal (~52 px de altura) | 52 px | 26 (pílula) | **50%** | pílula plena — decisão consciente, §abaixo |

**Teto declarado: 36 px, e só em superfície com ≥ 320 px no lado menor.** Nunca use `bloco`
(36) num cartão; é ali que a coisa vira desenho animado.

**A pílula no CTA principal — a decisão mais discutível deste documento, com o argumento:**

A favor: (a) é o formato **mais redondo possível**, que é literalmente o pedido; (b) **casa com
o app**, onde o botão já é pílula (`BorderRadius.lg` = 24 em botão de 48) — quem clica em "Criar
minha conta" na landing e cai no produto vê a **mesma forma de botão**, e continuidade de forma
é o que faz parecer um sistema só; (c) diferencia sem esforço o CTA primário do botão secundário
(16 px) e do botão de cabeçalho (12 px).

Contra: pílula é o clichê de SaaS 2020–2026 e, num produto que fala com profissional que quer
parecer sério para o cliente dele, pode ler como "app de consumidor".

**Mitigação, e é ela que segura a seriedade:** a pílula fica **restrita aos CTAs de decisão** —
hero, CTA de bloco e CTA final. Botão de plano, de cabeçalho e qualquer botão dentro de cartão
**não** são pílula. Assim a página tem dois botões-pílula por tela, não doze, e a forma vira
sinal de "aqui é a ação principal" em vez de tique visual.

**Se o dono achar demais:** o fallback é `--radius-acao: 16px` também no CTA principal — ainda é
+33% de arredondamento em relação a hoje, ainda parece "redondinho", e zero risco de infantil.
Trocar depois custa **uma linha** (é a vantagem de token semântico).

### 3.5 A regra do raio aninhado (o detalhe que faz parecer caro)

Quando um elemento arredondado mora dentro de outro, os cantos precisam ser **concêntricos**:

```
raio_interno = raio_externo − padding
```

Cartão com `rounded-cartao` (20) e `p-6` (24 px) → o filho encostado na borda deveria ter
20 − 24 = **negativo**, ou seja, **não há filho encostado na borda**; qualquer filho ali usa o
próprio token (`acao`, 16) e o resultado fica correto porque há folga.

Onde isso importa de verdade na landing hoje:

- **Container do FAQ** (`index.astro:501`): `rounded-2xl` com `divide-y` e `<details>` **sem
  padding lateral no container**. O primeiro e o último item **encostam** na borda arredondada.
  Com `caixa` = 28, o cabeçalho do primeiro item precisa de `rounded-t-[28px]` (ou o container
  precisa de `overflow-hidden`) — senão o fundo do `<summary>` no `:hover` vaza pelo canto.
  **Isto já é um bug latente hoje**, com 16 px; a 28 px fica visível.
- **Wrapper de tabela** nas páginas legais (`privacidade.astro:57`): `rounded-xl` +
  `overflow-x-auto`. A primeira célula do cabeçalho encosta no canto. Mesmo tratamento.
- **Cartão de plano em destaque** (`index.astro:469`): tem borda + sombra; ao subir o raio,
  confirme que a `shadow-xl shadow-brand/10` acompanha o novo raio (o Tailwind cuida, mas vale o
  olho, porque sombra com raio errado é o efeito "papel recortado").

### 3.6 Custo, risco e o que NÃO fazer

**Esforço:** tokens = **P** (~20 min, 7 linhas no `@theme`). Aplicação nas ~85 ocorrências =
**M** (~2–3 h, mecânico e revisável em diff). **Custo de bytes: zero** — são as mesmas classes
utilitárias, e o CSS gerado troca um valor por outro. Se o CSS crescer mais de ~0,5 KB, é sinal
de que alguém criou classe arbitrária (`rounded-[27px]`) em vez de usar token — é o teste de
regressão da onda.

**Risco de performance: nenhum.** `border-radius` é resolvido no layout/paint uma vez.

**O que NÃO fazer:**

- **Não animar `border-radius`.** Não é propriedade de composição — cada frame força repaint.
  Regra 6. Se quiser movimento no hover do cartão, continue com `transform`/`opacity`
  (é o que a página já faz: `hover:-translate-y-1`, `index.astro:348`).
- **Não mexer nos raios do `HeroDevices.tsx`** (42/40/34 px). São cantos de aparelho físico.
- **Não arredondar linha de tabela nem célula.** Dado denso lê melhor em canto reto; o
  arredondamento fica no **wrapper**. Regra 14: em tela densa, funcional vence cinematográfico.
- **Não arredondar o cabeçalho sticky nem seções full-bleed** (`bg-paper` com `border-y`). São
  edge-to-edge; raio ali não aparece e ainda cria artefato de hairline no zoom.
- **Não usar `rounded-full` em elemento com texto longo.** Pílula com 4+ palavras vira comprimido.
- **Não estender esta escala ao painel nesta onda.** O painel é shadcn com `--radius: 0.5rem`
  derivando `sm/md/lg/xl` por `calc()`. Mudar aquela linha move **todo** o painel de uma vez —
  é barato (uma linha), mas é **decisão separada, com QA separado**, e há outra onda mexendo em
  `webapp/` agora. Registre como P2: *"alinhar `--radius` do painel a 0.75rem e reavaliar"*.

---

## 4. Ordem de execução, esforço e o que depende do dono

| # | Item | § | Esforço | Depende do dono? |
|---|---|---|---|---|
| 1 | Tirar da tela o aviso "MODELO — não publicar" | 1.4 | **P** | Não (mas a revisão jurídica em paralelo sim) |
| 2 | Gerar os 5 arquivos de ícone + trocar as tags | 2.4–2.5 | **M** | Não |
| 3 | Desenhar a variante simplificada 16–32 px | 2.6 | **P–M** | Aprovação estética |
| 4 | `web/src/data/empresa.ts` + bloco institucional nos 2 rodapés | 1.3 | **P** | **SIM — 8 campos** |
| 5 | Rodapé `minimal` ganha Privacidade/Termos (7 páginas) | 1.5 | **P** | Não |
| 6 | JSON-LD: `legalName`/`taxID`/`address`/`contactPoint` + corrigir `logo` | 1.6 | **P** | **SIM** (mesmos campos) |
| 7 | Escala de raio: tokens + aplicação | 3.3 | **M** | Decisão sobre a pílula do CTA |
| 8 | Página `/empresa/` | 1.3 | **M** | **SIM** (+ foto real) |
| 9 | Página `/exemplo/` com PDF real gerado | 1.7 | **M** | Não |
| 10 | Formas de pagamento visíveis nos planos (Pix) | 1.7 | **P** | Depende do Mercado Pago entrar |

**O que só o dono pode destravar (lista curta, para ele responder de uma vez):**

1. Razão social · 2. CNPJ · 3. Endereço completo com CEP · 4. E-mail de contato ·
5. E-mail de privacidade/DPO · 6. Nome de quem responde · 7. Data de abertura do CNPJ ·
8. Perfis oficiais que existem (para `sameAs`) · 9. Foto real dele/da equipe em campo ·
10. Decisão: CTA principal vira pílula (sim/não).

Sem os itens 1–3 o bloco institucional **não é renderizado** — o marcador fica em `empresa.ts`
e nada falso vai ao ar.

---

## 5. Fontes

Fatos do mundo, verificados na web (o resto do documento é leitura do código deste repositório):

- [Decreto nº 7.962/2013, art. 2º — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm) — CNPJ e endereço em local de destaque
- [Organization structured data — Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/organization) — `legalName`, `taxID`, `address`, `contactPoint`, logo ≥112×112, colocação na home ou página "sobre"
- [Define Website Favicon for Search Results — Google Search Central](https://developers.google.com/search/docs/appearance/favicon-in-search) — quadrado, recomendado > 48×48
- [Making PWAs installable — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) — manifest, ícones 192/512, service worker não é requisito
- [What does it take to be installable? — web.dev](https://web.dev/articles/install-criteria) — `display` deve ser `fullscreen`/`standalone`/`minimal-ui`/`window-controls-overlay`
- [Revisiting Chrome's installability criteria — Chrome for Developers](https://developer.chrome.com/blog/update-install-criteria) — fetch handler deixou de ser exigido: Chrome 108 (mobile) / 112 (desktop)
- [Web app manifest with SVG icon — chromium-discuss](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/qfDNVGXcH0M) — no desktop o Chrome usa manifest **e** favicons/touch icons, escolhendo o mais próximo do tamanho para o atalho
- [Windows PWA integration — Chromium docs](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/windows_pwa_integration.md) — atalho de área de trabalho com o ícone do app
- [How to Favicon in 2026 — Evil Martians](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) — conjunto mínimo, `sizes="32x32"` no `.ico`, apple-touch-icon 180 com padding e fundo sólido
- [border-radius — Tailwind CSS](https://tailwindcss.com/docs/border-radius) — escala do Tailwind 4 (`lg` 8 · `xl` 12 · `2xl` 16 · `3xl` 24 · `4xl` 32)
- [Trustworthiness in Web Design: 4 Credibility Factors — NN/g](https://www.nngroup.com/articles/trustworthy-design/) — design, divulgação antecipada, conteúdo atual, conexão com o resto da web
- [Selo RA Verificada — Reclame AQUI](https://produtos.reclameaqui.com.br/ra-verificada) — verificação mensal; 81,9% consideram o selo decisivo
- [A falta de confiança … abandona compras online — Varejo S.A./CNDL, jun/2025](https://cndl.org.br/varejosa/a-falta-de-confianca-e-a-razao-pela-qual-metade-dos-consumidores-abandona-compras-online/) — 77% já abandonaram compra por falta de confiança (Akamai)
- Rodapés conferidos em 18/07/2026: [Field Control](https://fieldcontrol.com.br/) (sem CNPJ), [Auvo](https://auvo.com/) (sem CNPJ), [Bling](https://www.bling.com.br/) (com CNPJ)
