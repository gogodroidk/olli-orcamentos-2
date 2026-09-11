# Jobs-to-be-done, dores e mapa de jornada

Data de corte: 2026-08-26.  
Estado: síntese de pesquisa documental + hipóteses; campo ainda pendente.  
Regra: ranking qualitativo provisório, sem falso score numérico.

## 1. Tese de produto

O problema central não é “fazer PDF”. É preservar contexto, decisão, responsabilidade, execução e dinheiro durante toda a jornada do serviço.

O prestador perde margem e confiança quando dados se separam entre WhatsApp, memória, agenda, orçamento, OS, fotos, planilha, cobrança e documento técnico. A OLLI deve fazer cada evento alimentar o seguinte, mantendo o registro original e permitindo correção versionada.

## 2. Personas prioritárias

| Persona | Contexto | Resultado desejado | Risco que mais dói |
|---|---|---|---|
| Prestador solo HVAC | vende, agenda, executa, cobra e responde ao cliente | concluir o ciclo sem secretária nem retrabalho | esquecer, subprecificar, atrasar ou não cobrar |
| Dono de pequena equipe | coordena 2–15 técnicos e administrativo | saber quem faz o quê, no prazo e com margem | perder controle, dados e padrão quando a equipe cresce |
| Técnico de campo | trabalha com pressa, luva, sinal ruim e informação incompleta | receber contexto, registrar evidência e fechar a visita rapidamente | formulário longo, retrabalho, culpa por informação perdida |
| Administrativo/comercial | atende, monta proposta, agenda, compra e cobra | transformar diagnóstico em proposta/agenda/cobrança sem digitar duas vezes | divergência entre escritório e campo |
| Cliente aprovador B2B | compara escopo, risco, prazo, SLA e evidência | aprovar com confiança e acompanhar sem perseguir o prestador | surpresa de preço, atraso, documento incompleto e pouca comunicação |
| Responsável técnico/laboratório | assume escopo técnico e prova documental | revisar dados rastreáveis e assinar apenas o que pode assumir | dado inventado, norma errada, versão perdida e assinatura indevida |

## 3. Jobs-to-be-done

### Prestador solo

1. Quando um pedido chega por mensagem ou ligação, quero transformá-lo em chamado organizado sem interromper o atendimento, para não perder o cliente nem esquecer promessa.
2. Quando visito o local, quero registrar ativo, sintoma, medição, foto, risco e tempo uma vez, mesmo sem internet, para que orçamento e histórico nasçam do trabalho real.
3. Quando monto o preço, quero ver custo, hora, deslocamento, imposto, margem e alternativas, para defender o valor sem chutar.
4. Quando o cliente aprova, quero congelar versão, escopo e evidência, para executar e cobrar sem discussão sobre o combinado.
5. Quando termino, quero gerar OS/relatório/garantia e cobrar a partir do mesmo registro, para não deixar trabalho sem faturar.

### Dono/administrativo

1. Quando a equipe cresce, quero permissões, agenda, status e padrões por função, para delegar sem perder controle dos clientes e preços.
2. Quando despacho um técnico, quero que ele receba todo o contexto e que suas evidências retornem com sincronização confiável, para evitar ligações e retrabalho.
3. Quando analiso o mês, quero medir conversão, margem, atraso, retorno, produtividade e recorrência com definições explicáveis, para decidir com dados.

### Técnico de campo

1. Quando chego ao equipamento, quero identificar por QR e ver histórico/escopo, para trabalhar certo na primeira visita.
2. Quando o sinal falha, quero continuar capturando checklist, foto, peça, tempo e assinatura, para sincronizar depois sem duplicar.
3. Quando encontro algo fora do escopo, quero registrar e pedir autorização, para não executar trabalho não aprovado nem ser responsabilizado por omissão.

### Cliente B2B

1. Quando recebo proposta, quero comparar opções, escopo, exclusões, prazo e prova técnica, para aprovar com segurança.
2. Quando o serviço está em andamento, quero acompanhar agenda, conclusão, pendências e documentos, para não depender de cobranças por WhatsApp.
3. Quando sou auditado, quero recuperar PMOC, ART, OS, laudos e histórico por ativo, para demonstrar o que foi planejado e executado.

### RT/laboratório

1. Quando reviso um plano ou laudo, quero saber origem, versão, medição, instrumento, executor e alteração, para não assinar material sem rastreabilidade.
2. Quando a norma ou exigência muda, quero versionar a base aplicada sem reescrever o passado, para manter o histórico defensável.

## 4. Ranking provisório de dores

| Ordem | Dor | Quem sofre | Evidência atual | Confiança | Risco/impacto | O que precisa confirmar em campo |
|---:|---|---|---|---|---|---|
| 1 | jornada fragmentada entre mensagem, agenda, planilha, OS e cobrança | solo, dono, admin, técnico | concorrentes centralizam o fluxo; relatos de perda com crescimento | média | tarefa perdida, atraso, dupla digitação e caixa | ferramentas reais usadas e pontos de troca |
| 2 | escopo/preço se perde entre visita, escritório, aprovação e execução | solo, admin, técnico, cliente | relatos públicos + features de orçamento/OS dos concorrentes | média | disputa, margem ruim e retorno | em que tela/documento ocorre a divergência |
| 3 | trabalho/tempo/material não registrado deixa de ser faturado | solo, dono | relato exploratório e lógica operacional | média-baixa | perda direta de receita | frequência, valor e causas em casos sanitizados |
| 4 | PMOC recorrente e histórico por ativo exigem disciplina difícil em planilha | dono HVAC, técnico, RT, cliente B2B | obrigação oficial + produtos verticais/generalistas | alta para necessidade documental; campo pendente para intensidade | risco sanitário, contratual e de renovação | volume por ativo, periodicidade e inspeção real |
| 5 | orçamento é lento, inconsistente e difícil de defender | solo, comercial, cliente | ferramentas de quote são núcleo de vários concorrentes; sinais públicos | média | baixa conversão ou subpreço | tempo real, taxa de abandono e cálculo usado |
| 6 | prestador solo acumula atendimento, venda, campo, documento e cobrança | solo | relatos públicos de sobrecarga | média-baixa | atraso, exaustão e crescimento travado | tarefas mais frequentes e disposição de delegar/automatizar |
| 7 | comunicação de prazo, chegada, alteração e conclusão é reativa | cliente, admin, técnico | reclamação pública e capacidades de portal/dispatch | média-baixa | confiança, NPS e cancelamento | quais notificações ajudam sem virar spam |
| 8 | permissões e responsabilização ficam frágeis quando há equipe | dono, técnico, admin | RBAC aparece em produtos maduros; risco interno do OLLI já mapeado | média como requisito, baixa como dor medida | vazamento, fraude, edição indevida e dependência do dono | papéis, dados sensíveis e ações proibidas por função |
| 9 | obrigação PMOC/RT/ART e norma aplicável são mal compreendidas | dono HVAC, cliente, RT | conflito oficial RE 9/RDC 886 + relatos históricos | alta para complexidade normativa | alegação falsa, documento inválido e exposição do RT | exigências do município, setor e CREA dos pilotos |
| 10 | precificação carece de referência confiável | solo, dono | pedido do proprietário e sinais sobre cobrança de visita; benchmark ainda não medido | baixa-média | preço abaixo do custo ou proposta fora do mercado | custos, margem, segmento e vontade de compartilhar agregado |

## 5. Jornada e oportunidades

| Etapa | Job crítico | Falha provável hoje | Oportunidade OLLI | Resultado a medir |
|---|---|---|---|---|
| 1. Entrada/triagem | capturar pedido e urgência | áudio/texto sem cadastro, promessa perdida | inbox assistido → chamado revisável, sem envio automático | tempo até chamado completo; campos corrigidos |
| 2. Visita/diagnóstico | entender ativo, causa, risco e escopo | técnico chega sem histórico; evidência dispersa | QR/ativo, histórico e captura offline mínima | tempo de diagnóstico; retorno por informação faltante |
| 3. Precificação | cobrir custo e defender valor | preço por memória, sem margem/alternativa | calculadora por custo/hora/deslocamento/imposto/margem + faixas próprias | tempo de orçamento; margem prevista; edição da sugestão |
| 4. Proposta | comunicar escopo e opções | PDF genérico e inconsistência | modelos por serviço, opções bom/melhor/ideal e explicação | tempo de envio; pedidos de esclarecimento |
| 5. Aceite/contrato | congelar decisão | “ok no WhatsApp” sem versão/prova | link seguro, resumo, ação afirmativa, hash e cópia | tempo até aceite; disputas de versão |
| 6. Agenda/dispatch | colocar a pessoa certa no lugar certo | planilha/mensagem e conflito de agenda | agenda integrada, habilidade, rota, SLA e notificações | reagendamentos; atraso; deslocamento |
| 7. Execução | executar e registrar uma vez | sinal ruim, formulário longo, foto solta | OS offline, checklist adaptativo, foto/voz, material e tempo | conclusão sem retrabalho; sync; preenchimento |
| 8. Fechamento | provar, ressalvar e entregar | aceite genérico ou ausente | termo/OS versionado, assinatura por papel e anexos imutáveis | tempo de fechamento; contestação |
| 9. Fiscal/recebimento | faturar e conciliar | cobrança tardia, serviço invisível | cobrança originada na versão aceita; Pix/boleto/NFS-e via integração | dias até faturar/receber; conciliação |
| 10. Recorrência/PMOC | gerar próxima obrigação por ativo | planilha e calendário manual | plano versionado → OS idempotente → não conformidade → renovação | preventivas no prazo; cobertura de ativos; renovação |
| 11. Inteligência | aprender sem vazar dados | dashboard sem definição ou IA opaca | métricas próprias + benchmark agregado opt-in, com explicação | adoção, precisão, contestação e impacto em margem |

## 6. Arquitetura de produto derivada da jornada

```text
Chamado
  → Cliente / local / ativo
  → Diagnóstico e evidências
  → Orçamento versionado e preço explicado
  → Aprovação + contrato + assinatura por risco
  → Agenda / responsável / SLA
  → OS offline + materiais + tempo + fotos
  → Fechamento / laudo / garantia / não conformidade
  → Cobrança / NFS-e externa / conciliação
  → Recorrência PMOC por ativo
  → Métricas e IA com revisão humana
```

Cada seta deve preservar o ID e a versão de origem. A informação pode ser derivada; não deve ser copiada sem vínculo nem sobrescrever o registro aprovado.

## 7. Baseline: estado honesto

Nenhum tempo real foi medido nesta janela. O baseline abaixo é o contrato de medição para as sessões, não um resultado.

| Métrica | Definição | Valor atual | Como será medido |
|---|---|---|---|
| tempo pedido → chamado completo | do primeiro contato até dados mínimos revisados | não medido | duas sessões do proprietário + amostra externa |
| tempo visita → orçamento enviado | fim da visita até envio da versão | não medido | timestamp e observação contextual |
| retrabalho de digitação | minutos repetindo dado já existente | não medido | marcação por evento e ferramenta |
| retorno por informação faltante | visita/contato adicional evitável | não medido | classificação do motivo |
| trabalho não faturado | tempo/material executado e ausente da cobrança | não medido | reconciliação OS × cobrança em caso sanitizado |
| taxa de aceite | propostas aceitas ÷ propostas decididas | não medida | período e denominador explícitos |
| margem prevista × realizada | receita líquida menos custos diretos/receita | não medida | serviço concluído com custos revisados |
| preventivas no prazo | ordens PMOC concluídas no prazo ÷ devidas | não medida | plano e ordens do período |
| tempo para pacote de auditoria | pedido do cliente/fiscal até pacote completo | não medido | tarefa observada e lista de faltas |

## 8. Hipóteses de IA a testar

| Hipótese | Assistência | Métrica de valor | Falha segura |
|---|---|---|---|
| captura reduz trabalho administrativo | áudio/foto/texto → rascunho de chamado/OS | minutos poupados e correções | nada é salvo/enviado sem revisão |
| precificação explicada melhora margem | custos próprios + regras + alternativas | margem prevista/realizada e taxa de edição | exibir premissas; prestador decide |
| resumo por ativo reduz retorno | histórico → resumo de riscos/últimas ações | tempo de diagnóstico e visitas repetidas | linkar evidência; sinalizar incerteza |
| checklist adaptativo aumenta conclusão | tipo de serviço/ativo/risco → campos relevantes | preenchimento e NC detectada | nunca ocultar gate obrigatório |
| follow-up assistido aumenta decisão | proposta parada → rascunho de mensagem | tempo de decisão, opt-out e reclamação | envio sempre autorizado e limitado |

## 9. Critérios para expansão horizontal

Só abrir um novo ofício quando:

1. o fluxo comum HVAC estiver validado em uso real;
2. pelo menos dois prestadores daquele ofício confirmarem o mesmo job central;
3. checklist, segurança, RT, documento e preço específicos forem mapeados;
4. a vertical puder compartilhar o kernel sem campos genéricos perigosos;
5. houver proprietário/revisor da taxonomia e das regras.

Até lá, “todos os prestadores” é direção estratégica, não promessa de produto concluído.

