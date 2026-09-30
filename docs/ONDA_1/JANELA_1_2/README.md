# OLLI V2 — Onda 1, Janela 1.2

Data do checkpoint: 2026-08-26  
Escopo: mercado, campo, documentos e regulação  
Estado: **pesquisa documental concluída; pesquisa de campo preparada e ainda não executada**

## Resultado

A Janela 1.2 transformou a ideia de “IA em tudo para qualquer prestador” em uma tese de produto verificável e com limites claros:

> A OLLI deve começar como a plataforma operacional brasileira do prestador de climatização, unindo atendimento, orçamento parametrizado, aprovação e contrato, agenda, execução offline por ativo, PMOC, evidências, cobrança e portal do cliente em uma única trilha auditável. A expansão horizontal vem depois da validação do núcleo HVAC.

A pesquisa encontrou concorrentes fortes em partes da jornada, mas não confirmou um produto que combine, para o pequeno prestador brasileiro, toda a cadeia acima com PMOC/ART, operação offline, precificação explicável, controle de equipe e IA governada.

Esse espaço é uma **oportunidade a validar**, não uma afirmação de superioridade. A profundidade real dos concorrentes precisa ser testada em avaliações controladas antes de qualquer comparação comercial pública.

## Decisões tomadas

1. **HVAC primeiro; horizontal depois.** O núcleo comum será reutilizável, mas checklists, regras, documentos e modelos de preço permanecem especializados por ofício.
2. **Fluxo único, não coleção de telas.** O objeto central percorre chamado → diagnóstico → orçamento → aceite/contrato → agenda → OS → evidência → cobrança → recorrência.
3. **Biblioteca original de documentos.** Os 20 modelos priorizados serão redigidos pela OLLI a partir de requisitos e campos públicos; PDFs de terceiros e normas protegidas não serão copiados.
4. **PMOC é dado estruturado e versionado.** PDF é saída. Ativos, ambientes, periodicidades, execução, RT/ART, não conformidades e evidências precisam existir como dados auditáveis.
5. **RE 9/2003 é histórica, não regra vigente.** Ela foi revogada pela RDC 886/2024. A base técnica adotada deve ser versionada e confirmada pelo RT/Vigilância local; a OLLI não codificará limites universais por conta própria.
6. **ART é externa.** A plataforma registra e anexa a ART emitida no CREA; nunca gera “ART OLLI” nem certifica atribuição profissional.
7. **Assinatura por risco e destinatário.** Aceite simples, assinatura avançada e ICP-Brasil são trilhas distintas. Uma rubrica desenhada na tela não será chamada de assinatura digital qualificada.
8. **IA assiste; pessoa decide.** IA pode extrair, resumir, sugerir preço, redigir e detectar lacunas. Não assina, declara conformidade, pune funcionário, fixa preço discriminatório nem aprova laudo sem revisão humana.
9. **Inteligência de preço só com governança.** Benchmarks futuros exigem opt-in/base legal revisada, agregação, limiar mínimo de amostra, segmentação comparável e proteção contra reidentificação; nunca haverá leitura cruzada de dados brutos entre empresas.

## O que foi realizado

- pesquisa oficial de PMOC, ART, assinatura eletrônica, LGPD, CDC e contratação digital;
- resolução documental do conflito RE 9/2003 × RDC 886/2024;
- comparação por jornada de 10 produtos relevantes;
- levantamento exploratório de dores públicas, com nível de confiança e sem generalização;
- catálogo de 20 documentos com campos, prioridade, assinatura, revisão e licença;
- jobs-to-be-done, ranking de dores e mapa de jornada/oportunidades;
- protocolo de 13–15 sessões de campo, consentimento e instrumento de baseline;
- relatório executivo HTML portátil, com fontes e estado parcial explícito;
- ledger de fontes, licença, cota e validação.

Nenhum participante foi contatado, nenhum PDF de terceiro foi incorporado ao produto, nenhuma norma protegida foi copiada, nenhuma migration foi aplicada, nenhum deploy foi feito e nenhum dado de produção foi consultado.

## O que continua pendente

- duas sessões contextuais com o proprietário usando casos reais sanitizados;
- 5 prestadores/técnicos HVAC, 3 responsáveis por equipe/administrativo, 2 clientes B2B e 1 RT ou revisor jurídico/regulatório;
- baseline real de tempo, retrabalho, abandono e perda de faturamento;
- aquisição/licença da edição aplicável da ABNT NBR 17037 e validação por RT;
- revisão jurídica das cláusulas, níveis de assinatura, LGPD, retenção, CDC e contratos;
- testes controlados dos concorrentes para confirmar profundidade, UX, offline, permissões, exportação e preços;
- correção do conteúdo existente que reproduz parâmetros atribuídos à NBR 17037 antes de qualquer publicação.

## Artefatos

- `report.html` — relatório executivo principal, portátil e navegável.
- `artifact.json` — fonte estruturada do relatório.
- `build-report.mjs` — empacotamento reproduzível e correção de compatibilidade do cabeçalho no Chromium/Windows.
- `queries/` — seis consultas SQL que reproduzem as tabelas e o gráfico.
- `SOURCE_LEDGER.md` — proveniência, licença, data e uso permitido.
- `DOCUMENT_CATALOG.md` — biblioteca inicial de 20 modelos.
- `COMPETITOR_JOURNEY_MATRIX.md` — concorrentes por jornada e lacunas observadas.
- `JTBD_JOURNEY_AND_PAIN_RANKING.md` — personas, jobs, dores e oportunidade.
- `FIELD_RESEARCH_PROTOCOL.md` — roteiro, consentimento e baseline de tempo.
- `REGULATORY_GATES.md` — gates de PMOC, ART, assinatura, LGPD, IA e CDC.
- `QUOTA_LEDGER.md` — orçamento e observabilidade da janela.
- `SOURCE_NOTES.md` — decisões editoriais e mapa do relatório.
- `DESIGN.md` — contrato visual do artefato.
- `VALIDATION_REPORT.md` — verificações reproduzíveis e limitações.

## Gate de saída

A Janela 1.2 está aceita como **checkpoint de pesquisa documental**, não como validação de mercado completa.

A Janela 1.3 pode iniciar spikes descartáveis desde que:

- nenhum spike codifique como vigente a RE 9/2003;
- nenhum template copie NBR, PDF, layout ou marca de terceiro;
- IA opere com dados fictícios/sanitizados e revisão humana;
- assinatura, ART, conclusão de conformidade e benchmark cross-tenant permaneçam fora do caminho automático;
- o baseline de campo continue marcado como pendente até ser medido.

## Participação dos agentes

- agente de regulação: PMOC, RT/ART, assinatura, LGPD, IA e CDC;
- agente de concorrência: jornada e fontes oficiais de 10 produtos;
- agente de documentos/comunidade: dores públicas, 20 documentos e licenças;
- agente central: checagem cruzada, decisões, edição, relatório e validação.
