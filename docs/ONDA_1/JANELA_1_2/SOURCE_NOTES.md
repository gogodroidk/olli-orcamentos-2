# Notas de fonte e composição do relatório

## 1. Audiência e pergunta

- **Audiência:** proprietário, produto, arquitetura, segurança, jurídico/RT e futuros executores.
- **Pergunta:** qual recorte transforma a visão de plataforma completa em uma criação segura, diferenciada e testável?
- **Resposta editorial:** HVAC-first, jornada única, dados por ativo, documentos originais, offline e IA assistiva com gates.

## 2. Modalidade

Foi escolhida entrega **HTML portátil autocontida** porque:

- pode ser aberta localmente e compartilhada como arquivo;
- preserva tabelas, fontes e estado parcial;
- não exige publicação, conta externa ou deploy;
- permite verificação estrutural e, quando disponível, em navegador.

`artifact.json` é a fonte canônica. `report.html` é gerado pelo empacotador oficial da skill de relatório. Os Markdown são evidência e apoio; não competem como segundo relatório executivo.

## 3. Estrutura obrigatória mapeada

| Papel requerido | Seção visível no relatório |
|---|---|
| título | OLLI V2 — evidência para decidir a plataforma |
| Executive Summary | `Executive Summary` |
| achados/evidência | aposta recomendada, jornada, concorrentes, documentos e gates |
| interpretação | por que o espaço existe e onde não prometer |
| próximos passos | Janela 1.3 + pesquisa de campo |
| perguntas abertas | perguntas que decidem criação |
| caveats/premissas | pesquisa exploratória, fontes públicas e licença ABNT |

## 4. Estado dos dados

O snapshot é `partial` por duas ausências materiais:

1. as 13–15 sessões de campo planejadas ainda não foram executadas;
2. a edição integral aplicável da ABNT NBR 17037 não foi adquirida/licenciada e, portanto, parâmetros/checklists exatos não foram avaliados.

Essas lacunas aparecem no topo do relatório. Nenhum valor de baseline foi preenchido com estimativa.

## 5. Proveniência dos blocos

| Bloco/tabela | Fonte canônica local | Fontes materiais subjacentes |
|---|---|---|
| jornada/JTBD/dores | `JTBD_JOURNEY_AND_PAIN_RANKING.md` | `SOURCE_LEDGER.md`, IDs P01–P08, C01–C10, R01–R25 |
| concorrentes | `COMPETITOR_JOURNEY_MATRIX.md` | páginas oficiais por produto, IDs C01–C10 |
| 20 documentos | `DOCUMENT_CATALOG.md` | IDs R01–R25 e F01–F10 |
| gates regulatórios | `REGULATORY_GATES.md` | IDs R01–R25, especialmente R01–R19 |
| campo/baseline | `FIELD_RESEARCH_PROTOCOL.md` | desenho desta janela; nenhum dado de participante |
| status e limitações | `README.md` e `SOURCE_LEDGER.md` | checagem central em 2026-08-26 |

## 6. Decisão de visualização

Foi usado um único gráfico quantitativo: a contagem exata dos 20 documentos por prioridade interna de construção (P0 = 11, P1 = 7, P2 = 2). Ele comunica faseamento de produto e não prevalência de mercado.

A evidência de mercado permanece qualitativa: os relatos públicos são amostra de conveniência e as capacidades dos concorrentes vêm de páginas com cobertura desigual. Contar “features encontradas” ou atribuir score criaria precisão enganosa. Para essas análises foram escolhidas tabelas exatas, com rótulos `confirmado`, `parcial`, `não localizado` e caveats.

### Mapa de visuais

| Segmento | Pergunta | Tipo | Campos | Claim suportado |
|---|---|---|---|---|
| jornada | onde está o valor e a falha? | tabela | etapa, job, dor, oportunidade, medida | fluxo único reduz perda de contexto |
| concorrência | que partes já são validadas? | tabela | produto, foco, offline, PMOC, contrato, financeiro, IA | mercado tem peças maduras, mas integração BR/SMB é oportunidade |
| prioridade documental | como fasear os 20 modelos? | barra | prioridade, quantidade | o núcleo P0 concentra a primeira fatia |
| documentos | o que construir primeiro? | tabela | documento, prioridade, assinatura, revisão | biblioteca deve ser original e faseada |
| regulação | que automações são proibidas/condicionadas? | tabela | tema, estado, gate, responsável | compliance precisa entrar no kernel |

## 7. Afirmações deliberadamente omitidas

- tamanho de mercado/TAM sem estudo próprio;
- prevalência das dores na comunidade;
- taxa de conversão, margem ou tempo poupado sem baseline;
- “melhor”, “mais completo” ou ranking numérico de concorrentes;
- vigência de números da RE 9/2003;
- reprodução de parâmetros da NBR 17037;
- validade universal de assinatura desenhada/avançada;
- conformidade automática com PMOC, ABNT, LGPD ou CDC;
- preço recomendado por dados cross-tenant antes de governança e amostra.

## 8. Atualização

Antes da Onda 2, atualizar o artefato se ocorrer qualquer um:

- mudança normativa relevante;
- revisão/licença ABNT;
- cinco ou mais sessões de campo concluídas;
- teste controlado de concorrente contradizer a pesquisa pública;
- decisão de fatia farol mudar;
- definição do fornecedor de assinatura, pagamento, IA ou NFS-e.
