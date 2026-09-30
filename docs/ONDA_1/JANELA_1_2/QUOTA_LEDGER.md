# Ledger de cota — Onda 1, Janela 1.2

Criado em: 2026-08-26

## 1. Envelope planejado

| Campo | Valor |
|---|---|
| Janela | 1.2 — mercado, campo, documentos e regulação |
| Duração planejada | até 3h30 de trabalho ativo + 30 min de fechamento + 1h de reserva |
| Envelope de contexto | 65k–110k tokens estimados |
| Cota semanal acumulada alvo | até 32% |
| Alterações funcionais | 0 |
| Operações de produção | 0 |
| Deploy/publicação | 0 |

O envelope é estimativa de input + output para planejamento. Ele não equivale à cota cobrada pelo produto.

## 2. Observabilidade

| Medida | Estado |
|---|---|
| tokens exatos desta tarefa | não expostos ao agente |
| percentual restante da janela de 5h | não exposto ao agente |
| renovação exata | não exposta ao agente |
| percentual semanal | não exposto ao agente |
| autoridade sobre a cota real | painel Settings/Usage da conta do usuário |

Nenhum percentual foi inventado. O código do projeto não remove o limite de cinco horas e nenhum reset/crédito foi consumido.

## 3. Roteamento econômico usado

| Papel | Modelo/esforço | Escopo | Escrita |
|---|---|---|---|
| agente central | modelo atual, raciocínio alto | síntese, decisões, edição e validação | somente documentos novos da Janela 1.2 |
| regulação | gpt-5.6-terra, alto | PMOC, ART, assinatura, LGPD, IA e CDC | nenhuma |
| concorrência | gpt-5.6-luna, alto | 10 produtos por jornada e fontes oficiais | nenhuma |
| documentos/comunidade | gpt-5.6-luna, alto | dores exploratórias, 20 modelos e licenças | nenhuma |

O fan-out ficou limitado a três frentes realmente independentes. Os auxiliares não receberam segredos, `.env`, dados de clientes, banco real nem configuração de produção.

## 4. Custo relativo e resultado

| Atividade | Custo relativo | Saída |
|---|---|---|
| fontes regulatórias oficiais | alto | conflito RE 9/RDC 886 resolvido e gates de produto |
| concorrentes por jornada | médio | matriz de 10 produtos e lacunas públicas |
| comunidade e documentos | médio | 8 sinais exploratórios e catálogo de 20 modelos |
| síntese JTBD/jornada | médio | tese HVAC-first e ranking qualitativo |
| protocolo de campo | baixo | amostra, consentimento, tarefas e baseline |
| relatório portátil | médio | artifact JSON, HTML e validação |

## 5. Economia aplicada

- pesquisa concorrente separada de decisão regulatória;
- preferência por páginas oficiais e help centers, evitando busca ampla repetida;
- nenhuma tentativa de obter ou reproduzir norma paga;
- ausência de trials/instalações nesta janela, pois pertencem aos spikes;
- tabelas no relatório em vez de gráficos com falsa precisão qualitativa;
- baseline deixado como “não medido” até sessões reais;
- apenas o agente central editou e validou o repositório.

## 6. Fechamento da cota

Preencher manualmente, se o usuário quiser reconciliar com o painel:

| Campo | Valor |
|---|---|
| percentual de 5h final | não informado |
| percentual semanal final | não informado |
| horário de renovação | não informado |
| gate documental | concluído |
| gate de campo | pendente |
| gate ABNT/RT/jurídico | pendente |

