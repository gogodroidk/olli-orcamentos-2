# ⚠ ANTES DE ESCREVER QUALQUER COPY SOBRE NFS-e, LEIA ISTO

**Reverificado em 30/09/2026 na fonte oficial** (a versão de 21/07/2026 deste alerta
já estava desatualizada). A data de **01/09/2026** para ME/EPP **caiu**: a Resolução
CGSN nº 191, de 4 de agosto de 2026, adiou a obrigatoriedade para **1º de novembro de 2026**.

| Quem | Desde quando é obrigado a emitir pelo Emissor Nacional | Fonte |
|---|---|---|
| **MEI** | **01/09/2023** — Resolução CGSN nº 169/2022 | [gov.br/nfse — MEI obrigado](https://www.gov.br/nfse/pt-br/mei-prestadores-de-servico-de-todo-o-pais-estao-obrigados-a-emitir-nfs-e) |
| **ME e EPP do Simples Nacional** | **01/11/2026** — Resolução CGSN nº 191/2026 (de 04/08/2026) | [Receita Federal, ago/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026) |
| Empresas fora do Simples (Lucro Presumido/Real) | Seguem no emissor do município | — |

Histórico, para quem encontrar a data antiga em outro documento: a Resolução CGSN
nº 189/2026 (publicada em 28/04/2026) tinha fixado 01/09/2026 para ME/EPP; a CGSN
nº 191/2026 substituiu essa data por 01/11/2026. Na mesma notícia, a Receita avisa
que as regras de CBS e IBS para o Simples só começam em 01/01/2027. A emissão é
"por meio do Emissor Nacional da NFS-e, seja pela aplicação web, seja por
integração via API" (Receita Federal).

O prestador de serviço sozinho, cliente-alvo do OLLI, é **MEI na grande
maioria**, e portanto já é obrigado desde 2023. O dono de ME/EPP (dedetizadora com
funcionários, empresa de climatização) entra em **01/11/2026**.

## Por que isso importa comercialmente

Uma copy que diga a um MEI *"você será obrigado em novembro"* está errada **e** perde
a venda: ele já é obrigado e já sente a dor hoje. O argumento certo para o MEI é
*"você já é obrigado desde 2023; o OLLI prepara os dados da nota"*. Para ME/EPP é
*"a partir de 01/11/2026 a nota sai pelo Emissor Nacional"*. Prestador que percebe
erro factual na página de vendas desconfia do resto do produto.

## Estado hoje (30/09/2026)

A data errada **não chegou a nenhuma copy pública**: a landing (`web/src`), o app
(`src/`), o painel (`webapp/src`) e os e-mails do worker não citam data de NFS-e
(conferido por grep em 30/09/2026). O que citava a data antiga foi corrigido nesta
data: comentários em `worker/src/index.js` e `worker/src/util.js`, e os documentos
internos `docs/BOM-DIA.md`, `docs/ENXAME/APIS_E_INTEGRACOES.md`, `NEGOCIO_FOSSO.md`,
`NEGOCIO_PRECO.md`, `NEGOCIO_PREMORTEM.md`, `NEGOCIO_PRIMEIROS_PAGANTES.md`,
`OPORTUNIDADES.md`, `PESQUISA_APIS_2026.md` e `VISAO_FABLE.md`.

## O que fazer

1. Ao escrever a copy de NFS-e, use as **duas** datas e diga a qual regime cada uma
   se aplica. Nunca uma data só.
2. Confirme na fonte antes de publicar: gov.br/nfse e as Resoluções CGSN 169/2022 e
   191/2026. Regra fiscal muda (a 189/2026 já foi alterada uma vez) e este documento
   também envelhece.
3. O OLLI **não emite** nota: ele organiza os dados e o prestador emite no Emissor
   Nacional com o gov.br dele (ver `src/content/ajuda/index.ts`, artigo
   `nfse-padrao-nacional`).
