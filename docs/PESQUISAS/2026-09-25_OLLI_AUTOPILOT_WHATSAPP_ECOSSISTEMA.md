# OLLI Autopilot WhatsApp e Ecossistema Operacional

Data da decisão: 25/09/2026  
Escopo: visão de produto, pesquisa de mercado, arquitetura-alvo, monetização e sequência de implementação.  
Status: direção proposta e primeira fatia especificada; integração WhatsApp oficial, envio externo, cobrança, compras e produção continuam não autorizados.

## 1. Decisão executiva

A oportunidade não é construir apenas um chatbot, uma caixa de entrada compartilhada ou um CRM genérico.

A direção recomendada é transformar a **OLLI Orçamentos** no sistema operacional de
`lead -> caixa -> pós-venda` para prestadores técnicos brasileiros, começando por climatização e
refrigeração:

`WhatsApp -> lead identificado -> cliente revisado -> diagnóstico -> orçamento -> agenda -> ordem de serviço -> pagamento -> garantia -> manutenção recorrente -> compra de peças`

O Autopilot deve funcionar como uma equipe administrativa digital supervisionada. Ele pode observar,
organizar, sugerir e executar ações reversíveis dentro de mandatos explícitos. Preço final, compra,
pagamento, compromisso contratual, envio de marketing, cancelamento e qualquer ação irreversível
continuam sujeitos a política e confirmação apropriadas.

A tese de riqueza não está em vender um bot. Ela está em ocupar progressivamente cinco camadas da
mesma operação:

1. software recorrente que organiza o trabalho diário;
2. automação de conversas e rotinas administrativas;
3. pagamentos e recorrência, por parceiros autorizados;
4. compras e fornecedores ligados a demandas reais;
5. rede de capacidade operacional verificada para oportunidades maiores.

## 2. O que já existe e o que ainda não existe

### Fatos verificados no checkout canônico

- O Autopilot atual recebe texto ou arquivo, extrai clientes, produtos, serviços, orçamento e
  documentos e devolve uma prévia com evidência, confiança e `requiresReview=true`.
- Web e aplicativo já exibem candidatos de cliente, mas ainda não possuem confirmação transacional
  de cadastro de cliente a partir da prévia.
- A única rota de Autopilot é `POST /ia/autopilot/preview`.
- O sistema já possui clientes, catálogo, orçamento, agenda, ordem de serviço, pagamentos,
  sincronização e regras multi-tenant que podem ser reutilizados.
- Há infraestrutura de ações de IA com confirmação, eventos, idempotência e reversão para alterações
  unitárias, mas ela ainda não suporta importação em lote de novos clientes.
- Os links `wa.me` existentes apenas abrem o WhatsApp. Eles não constituem uma integração com a
  WhatsApp Business Platform.

### O que não deve ser alegado como pronto

- leitura automática de conversas do WhatsApp;
- importação de histórico completo de uma conta;
- webhook oficial da Meta;
- caixa de entrada compartilhada;
- envio autônomo de mensagens;
- compra automática em fornecedores;
- split ou comissão de pagamentos;
- cadastro automático e irreversível de clientes;
- operação em produção.

## 3. Por que a oportunidade existe, mas o posicionamento precisa ser vertical

Em 24/09/2026, a Meta apresentou a Meta Business Agent Platform como uma plataforma para agentes que
capturam leads, vendem e atendem dentro das conversas. A própria Meta também descreve agentes capazes
de responder perguntas, recomendar produtos, qualificar leads e fechar vendas. Isso valida a direção
de mercado e, ao mesmo tempo, torna um agente conversacional genérico cada vez mais comoditizado.

Zenvia, Blip, WATI, respond.io e Kommo já oferecem combinações de WhatsApp oficial, caixa de entrada,
CRM, campanhas e agentes de IA. ServiceTitan, Jobber e Housecall Pro já automatizam grande parte do
field service, incluindo atendimento, agenda, despacho, orçamento, pricebook, pagamento e
recorrência.

A interseção que a OLLI deve dominar é mais específica:

> WhatsApp nativo no Brasil + operação técnica de campo + equipamento e diagnóstico + orçamento e OS
> + peças e fornecedores + garantia e manutenção + pagamentos locais.

O diferencial não é a conversa. É converter a conversa em um **grafo operacional auditável** e
executar o trabalho subsequente dentro do mesmo sistema.

## 4. Benchmark resumido

| Referência | O que prova | Lacuna relevante para a OLLI |
|---|---|---|
| Meta Business Agent Platform | agentes full-funnel no WhatsApp são uma direção oficial da plataforma | não substitui o sistema operacional vertical, regras de preço, OS, equipamento, peça e garantia do prestador |
| Zenvia / Blip | WhatsApp oficial, coexistência, CRM, funil e IA já são vendidos no Brasil | abordagem horizontal; integração operacional profunda com HVAC e fornecedores não é o produto principal |
| WATI / respond.io / Kommo | agentes, inbox, automações, CRM e preço por plano/uso estão maduros | exigem que o cliente conecte outros sistemas para concluir a operação de campo |
| ServiceTitan | automação de ponta a ponta para trades, incluindo agentes, agenda, despacho, pricebook e inteligência de campo | foco e estrutura de mercado diferentes; não é uma solução Brasil/WhatsApp-first para microprestadores |
| Jobber | recepcionista de IA pode atender, reconhecer clientes existentes e agendar | não resolve a camada brasileira de WhatsApp, fiscalidade, Pix e rede local de fornecedores |
| Housecall Pro | CRM HVAC, equipamento, recorrência, propostas, agenda, despacho e pagamento formam um pacote vendável | referência forte de produto vertical, mas não uma rede brasileira de peças, garantia e prestadores |

Conclusão honesta: cada componente isolado já existe. Nas fontes consultadas, não foi encontrada uma
plataforma brasileira que una de forma convincente a rotina de microprestadores, inteligência
técnica HVAC, WhatsApp, procurement multi-fornecedor, garantia multi-marca e capacidade operacional
verificada. Isso é uma hipótese de diferenciação a validar, não uma afirmação de inexistência global.

## 5. O produto: uma equipe digital supervisionada

O usuário não deve configurar uma coleção de bots. Ele deve ativar capacidades da OLLI, com nomes de
trabalho claros e uma única memória operacional do negócio.

### 5.1 Recepcionista

- responde recebimentos dentro das políticas do canal;
- identifica intenção, urgência, local e tipo de serviço;
- pede somente os dados mínimos que faltam;
- oferece transferência imediata para uma pessoa;
- nunca inventa disponibilidade, preço ou cobertura geográfica.

### 5.2 Assistente comercial

- cria um lead a partir da conversa;
- reconhece cliente existente sem duplicar;
- monta um rascunho de orçamento usando somente catálogo e regras aprovadas;
- acompanha orçamento não respondido com cadência e template aprovados;
- registra motivo de perda sem pressionar o cliente.

### 5.3 Secretária operacional

- sugere horários compatíveis com região, duração e habilidade;
- confirma, remarca ou cancela apenas dentro das regras do prestador;
- transforma aprovação em agenda e ordem de serviço;
- mantém técnico e cliente informados com eventos idempotentes.

### 5.4 Assistente técnico

- relaciona cliente, local, equipamento, modelo, sintoma e histórico;
- prepara briefing antes da visita;
- oferece códigos, manuais, checklists e diagnóstico assistido;
- registra fotos, medições, peças e evidências da execução;
- nunca se apresenta como responsável técnico ou substitui decisão profissional.

### 5.5 Comprador

- transforma uma peça necessária em solicitação estruturada;
- consulta fornecedores conectados e compara preço, prazo, frete, compatibilidade e garantia;
- produz uma recomendação explicável;
- somente envia RFQ, reserva estoque ou cria pedido sob mandato e limite aprovados;
- nunca favorece anúncio patrocinado no ranking técnico sem identificação explícita.

### 5.6 Cobrador e pós-venda

- gera ou compartilha link de pagamento por provedor autorizado;
- concilia retorno do PSP e atualiza o estado financeiro por webhook verificado;
- lembra pagamentos dentro de cadência aprovada;
- agenda manutenção preventiva e renovação de contrato;
- abre garantia ou retorno ligando a ocorrência à OS, ao equipamento e às evidências.

## 6. Catálogo automático de contatos e clientes

### 6.1 Não transformar contato em cliente silenciosamente

O sistema deve separar estados:

1. **contato observado**: identidade recebida do canal, ainda sem qualificação;
2. **lead identificado**: existe intenção comercial ou de atendimento;
3. **candidato de cliente**: campos extraídos com fonte e confiança;
4. **cliente confirmado**: registro aceito pelo prestador ou por uma política de baixo risco;
5. **cliente ativo**: possui orçamento, OS, pagamento ou relacionamento válido;
6. **cliente inativo/opt-out**: não pode receber campanhas e deve respeitar retenção aplicável.

Uma conversa de fornecedor, funcionário, grupo, spam ou número compartilhado não pode virar cliente
apenas porque contém nome e telefone.

### 6.2 Campos que a IA pode sugerir

- nome e forma preferida de tratamento;
- telefone/identificador do canal;
- e-mail, somente quando fornecido;
- endereço e local de atendimento;
- pessoa física ou empresa, sem inferir documento;
- equipamento, marca, modelo, capacidade, tensão e refrigerante;
- problema relatado e urgência;
- origem do lead;
- serviço provável;
- melhor próximo passo;
- consentimentos, opt-out e preferência de canal;
- estágio comercial;
- evidência de origem e confiança por campo.

CPF, CNPJ, dados financeiros, localização precisa, áudio, imagem e informações sensíveis não devem
ser inferidos nem retidos sem finalidade e base apropriadas.

### 6.3 Deduplicação

Deduplicação deve ser conservadora e explicável:

- identificador oficial do canal, quando disponível;
- telefone normalizado, sem assumir que todo telefone pertence a uma só pessoa;
- nome + telefone ou e-mail como sugestão, não como sobrescrita automática;
- endereços e equipamentos podem pertencer a mais de um contato;
- conflito produz revisão, nunca `INSERT OR REPLACE` silencioso;
- todo commit recebe chave de idempotência e devolve o mesmo resultado em retry legítimo.

### 6.4 Cadastro existente versus mensagens futuras

A API oficial não deve ser vendida como um leitor ilimitado de todo o histórico do WhatsApp. O plano
deve prever dois caminhos:

- **base existente**: conversa exportada, texto colado ou arquivo escolhido conscientemente pelo
  prestador, processado como prévia e revisado;
- **base futura**: somente mensagens recebidas após a conexão oficial, respeitando capacidades e
  limites vigentes da Meta e do provedor escolhido.

Qualquer sincronização de histórico oferecida por coexistência ou BSP deve ser comprovada em sandbox
antes de entrar na promessa comercial.

## 7. Fluxo completo do lead ao dinheiro

```text
Mensagem recebida
  -> assinatura do webhook validada
  -> evento deduplicado
  -> identidade e consentimento resolvidos
  -> conversa classificada
  -> lead ou contato existente
  -> dados faltantes solicitados
  -> candidato de cliente com evidências
  -> revisão ou política de baixo risco
  -> orçamento rascunho baseado no catálogo
  -> aprovação do prestador
  -> envio ao cliente
  -> aceite do cliente
  -> agenda e ordem de serviço
  -> execução e evidências
  -> cobrança por PSP
  -> conciliação
  -> garantia e manutenção recorrente
  -> necessidade de peça gera RFQ/pedido de fornecedor
```

Estados comerciais sugeridos:

`novo -> identificado -> qualificado -> visita_sugerida -> orcamento_rascunho -> aguardando_cliente -> aprovado -> agendado -> em_execucao -> concluido -> cobranca_pendente -> pago -> garantia -> recorrencia`

## 8. Arquitetura-alvo, sem criar um sistema concorrente

A implementação deve estender o Worker, Supabase, Autopilot e serviços existentes.

```text
WhatsApp Cloud API ou BSP oficial
        |
        v
adapter de canal + verificação de webhook
        |
        v
inbox_events -- idempotência, tenant, retenção, status
        |
        v
normalização de identidade e consentimento
        |
        v
Autopilot preview -- extração fechada, evidência e confiança
        |
        v
import_job + client_candidates
        |
        v
policy/mandate engine -> action draft -> confirmação
        |
        v
serviços existentes: clientes, orçamento, agenda, OS, pagamento e catálogo
        |
        v
outbox oficial + webhook de retorno + trilha de auditoria
```

### 8.1 Entidades mínimas novas

- `channel_connections`: conexão por tenant, provedor, número e capabilities, sem token no cliente;
- `channel_contacts`: identidade externa, telefone quando disponível, opt-in/opt-out e vínculo local;
- `channel_conversations`: conversa, janela de atendimento e estado de handoff;
- `channel_messages`: metadados mínimos, hash, direção, status e retenção;
- `inbox_events`: evento bruto redigido, deduplicação e processamento;
- `ia_import_jobs`: fonte, fingerprint, estado, TTL e ator;
- `ia_client_candidates`: payload mínimo, evidências, confiança e decisão;
- `autopilot_mandates`: capacidades, limites, horários, orçamento e escalonamento;
- `supplier_offers`: fornecedor, item, compatibilidade, preço, frete, prazo e validade;
- `action_outbox`: ações externas aprovadas, retry, dead-letter e resultado.

Essas entidades não devem duplicar clientes, orçamento, agenda, OS, pagamentos ou catálogo.

### 8.2 Controles obrigatórios

- tenant e ator derivados no servidor;
- `FORCE RLS` e fail-closed;
- service role somente em Worker/RPC controlado;
- verificação de assinatura dos webhooks;
- idempotência de evento, commit, envio, pagamento e pedido;
- outbox/claim/lease/retry/DLQ para efeitos externos;
- limite por tenant, número, ação e custo;
- texto de conversa omitido de logs;
- kill switch global, por tenant e por capability;
- trilha `proposto -> confirmado -> executado -> confirmado pelo provedor`;
- versão da política, prompt e modelo usada na decisão;
- revisão, correção, exportação e exclusão conforme obrigação aplicável.

## 9. Escada de autonomia

| Nível | Comportamento | Exemplos |
|---|---|---|
| A0 — observar | não cria nem envia nada | classificar conversa, detectar lead, sugerir campos |
| A1 — preparar | cria somente rascunhos | candidato de cliente, orçamento, resposta, agenda sugerida |
| A2 — executar reversível | executa regra previamente aprovada e auditável | confirmar recebimento, criar tarefa interna, reservar um horário provisório |
| A3 — operar por mandato | executa dentro de teto, janela e capability | follow-up aprovado, manutenção recorrente, RFQ a fornecedores permitidos |
| A4 — confirmação obrigatória | aguarda decisão humana | preço final, pedido, pagamento, desconto, cancelamento, compromisso de garantia |
| Bloqueado | nunca autônomo | senha, credencial, assinatura, decisão de crédito, alteração de documento assinado, transferência financeira fora de PSP |

Cada mandato deve informar: objetivo, capacidades, destinatários permitidos, horário, limite financeiro,
limite de mensagens, validade, risco, evidência exigida e gatilhos de escalonamento.

## 10. Integração com WhatsApp

### 10.1 Caminho permitido

- WhatsApp Business Platform / Cloud API oficial;
- onboarding por Embedded Signup ou BSP oficial;
- coexistência com WhatsApp Business App quando suportada e comprovada;
- conta, número e ativos pertencem ao prestador;
- adaptador de provedor para evitar dependência absoluta de um BSP;
- templates, janela de atendimento e custo exibidos ao usuário;
- handoff humano em um clique.

### 10.2 Caminho proibido para produção

- raspagem de WhatsApp Web;
- extensão de navegador que captura sessão;
- WPPConnect ou automação não oficial como fundamento do produto comercial;
- copiar cookies, QR, cache ou token entre máquinas;
- importar todos os contatos sem finalidade e revisão;
- enviar campanhas sem opt-in e regras do canal.

### 10.3 Decisão build versus partner

Fase de piloto: usar a rota oficial que reduzir mais o tempo de onboarding, mantendo o domínio dos
dados e uma interface de adapter. A decisão direta Meta versus BSP deve ser tomada após um spike de
Embedded Signup, coexistência, cobrança, suporte, histórico disponível, SLA e portabilidade.

Longo prazo: tornar a OLLI Tech Provider/partner somente se o volume e a margem justificarem a
complexidade. Não transformar credenciamento de parceiro em pré-requisito para provar o produto.

## 11. Fornecedores, peças e refrigeração

Não foi encontrada nas fontes consultadas uma API pública padronizada de estoque, preço e prazo para
distribuidores HVAC brasileiros. Portanto, a primeira integração realista é um adapter por fornecedor:

1. CSV ou planilha validada;
2. SFTP/feed periódico;
3. API ou webhook do ERP do distribuidor;
4. EDI para parceiros maiores;
5. portal de fornecedor para cotação manual assistida.

Mercado Livre pode ajudar em identificação por Part Number/Product ID e preço contextual, mas não deve
ser confundido com disponibilidade B2B, condição comercial de distribuidor ou compatibilidade técnica.

### 11.1 Grafo de peça e equipamento

O ativo defensável é ligar:

`equipamento -> modelo -> capacidade -> tensão -> refrigerante -> sintoma -> diagnóstico -> peça OEM/compatível -> fornecedor -> preço -> prazo -> garantia -> OS`

### 11.2 Primeiro produto de rede

Não abrir um marketplace vazio. Começar com um **pedido de cotação assistido**:

- técnico seleciona a necessidade a partir da OS;
- OLLI estrutura especificação e evidências;
- dois fornecedores-piloto recebem RFQ autorizado;
- ofertas voltam com validade, frete e prazo;
- prestador escolhe;
- pedido e pagamento continuam fora ou no PSP autorizado até a integração ser provada.

### 11.3 Rede de capacidade verificada

Programas de credenciamento, como o da Daikin, demonstram valor de certificações, linha de produto,
região e capacidade de instalação/manutenção. A OLLI pode formar uma rede multi-marca com:

- especialidade e região;
- equipe e disponibilidade;
- cursos e certificações verificadas;
- equipamentos e linhas atendidas;
- prazo, segurança, garantia e retrabalho;
- projetos executados e evidências;
- critérios de matching visíveis e contestáveis.

A comunicação deve usar “mais adequados para esta demanda”, nunca “melhores prestadores” sem critério.

## 12. Modelo de receita

### 12.1 Ordem recomendada

1. **SaaS base**: receita previsível pelo sistema operacional do prestador.
2. **Autopilot**: plano ou pacote por número/tenant, com franquia clara de conversa e IA.
3. **Equipe e automações**: assentos, permissões, agenda/dispatch, recorrência e relatórios.
4. **Pagamentos**: application fee ou receita contratada com PSP somente quando houver valor real.
5. **Compras**: comissão transparente por pedido atribuído e efetivamente concluído.
6. **Fornecedor**: assinatura por feed, analytics, SLA, portal e acesso a demanda qualificada.
7. **Manutenção**: taxa sobre plano recorrente administrado pelo prestador.
8. **Crédito/seguro**: comissão de parceiro regulado, sem a OLLI emprestar, custodiar ou decidir crédito.
9. **API/white-label**: distribuidores, redes técnicas e operações maiores.

### 12.2 O que não monetizar

- venda de conversa ou lista de clientes;
- ranking ocultamente patrocinado;
- percentual obrigatório sobre todo serviço, que pune ticket alto;
- cobrança por erro ou retry técnico da IA;
- crédito assumido no balanço da OLLI antes de capacidade regulatória e de risco;
- dependência de campanha agressiva para compensar baixa retenção do produto.

### 12.3 Pacotes como hipótese, não preço aprovado

| Pacote | Valor entregue | Receita principal |
|---|---|---|
| Core | clientes, orçamento, catálogo, agenda e OS | mensalidade |
| Autopilot | inbox, IA, cadastro assistido, respostas e follow-up | mensalidade + unidade de uso com teto |
| Growth | equipe, dispatch, recorrência, analytics e automações | mensalidade maior + assentos |
| Network | fornecedores, RFQ, pedidos e pagamentos | comissão atribuída + fee do fornecedor |
| Enterprise | integrações, API, SSO, white-label e SLA | contrato anual |

Preço precisa ser testado contra economia de tempo, conversão incremental e custo variável. Não deve
ser definido apenas copiando concorrentes em dólar.

### 12.4 Economia unitária mínima

```text
margem de contribuição por tenant =
  mensalidade
  + receita de uso
  + GMV de pagamento * take-rate líquido
  + GMV de fornecedor * comissão líquida
  - custo Meta/BSP
  - custo de modelo e processamento
  - custo PSP, estorno, fraude e chargeback
  - suporte e onboarding variáveis
```

Medir separadamente SaaS, IA/mensageria, pagamentos, fornecedor e crédito. Receita bruta misturada
pode esconder uma camada deficitária.

## 13. Flywheel defensável

```text
mais conversas consentidas
  -> mais leads estruturados
  -> mais orçamentos e OS
  -> mais histórico de equipamentos e peças
  -> melhor previsão de demanda, compatibilidade e recorrência
  -> melhor valor para prestadores e fornecedores
  -> menor tempo de resposta e maior taxa de fechamento
  -> maior retenção e mais conversas
```

O dado defensável é operacional e verificável, não uma lista de telefones. O uso cross-tenant deve ser
agregado, minimizado e legitimado; dados brutos de um cliente não treinam nem beneficiam outro tenant
por padrão.

## 14. Sequência de implementação

### Fase 0 — primeira fatia segura, sem conexão externa

Objetivo: conversa exportada ou colada gera candidatos de cliente e permite confirmação idempotente.

- persistir `ia_import_jobs` e `ia_client_candidates` com TTL;
- origem, hash, evidência, confiança e estado por candidato;
- deduplicação conservadora;
- commit transacional server-authoritative;
- botão “Revisar cadastros” na web e no aplicativo;
- criar somente os selecionados;
- mostrar criado, existente, conflito ou rejeitado;
- sem envio de mensagens e sem segunda cobrança de IA no commit.

### Fase 1 — inbox oficial, entrada somente

- spike Meta direto versus BSP;
- Embedded Signup/coexistência em sandbox;
- webhook assinado e idempotente;
- mensagens novas alimentam a mesma pipeline de candidatos;
- tela de conexão, estado e erro;
- sem resposta automática inicial.

### Fase 2 — recepcionista supervisionada

- confirmação de recebimento;
- perguntas mínimas de qualificação;
- knowledge base aprovada pelo tenant;
- horário, região e tipo de serviço;
- handoff e kill switch;
- templates e custos visíveis.

### Fase 3 — lead-to-cash

- orçamento rascunho baseado em catálogo;
- agenda/OS após aprovação;
- link de pagamento;
- follow-up de orçamento e cobrança;
- conciliação por webhook;
- painel de funil e margem.

### Fase 4 — manutenção e equipamento

- passaporte do equipamento;
- plano preventivo e PMOC quando aplicável;
- garantia, retorno e evidências;
- previsão de próxima manutenção;
- campanhas somente para base elegível e consentida.

### Fase 5 — procurement

- dois distribuidores-piloto;
- feed de catálogo/preço/prazo;
- RFQ assistido;
- compatibilidade e comparação explicáveis;
- comissão somente em pedido atribuído.

### Fase 6 — rede e finanças

- capacidade verificada e matching;
- oportunidades B2B e públicas;
- pagamentos/split por PSP;
- parcelamento/crédito/seguro por parceiro regulado;
- projetos maiores somente após provar operação diária e liquidez de rede.

## 15. Primeira fatia técnica proposta

### Banco

Criar migration versionada com:

- `ia_client_import_jobs`;
- `ia_client_candidates`;
- chave única de fingerprint por tenant;
- chave de idempotência por commit;
- estados `pending`, `accepted`, `rejected`, `expired`, `conflict`;
- `FORCE RLS`, sem grants de cliente e acesso controlado;
- TTL e purge separado, não silenciosamente agendado na mesma migration.

### Worker

Adicionar:

- `POST /ia/autopilot/clientes/commit`;
- JWT e contexto de equipe atuais;
- tenant derivado no servidor;
- autorização por papel;
- deduplicação e RPC transacional;
- retry idempotente;
- `409` para chave reutilizada com conteúdo divergente;
- eventos sem texto da conversa ou PII desnecessária.

### Web e aplicativo

- seleção de candidatos;
- edição de nome, telefone e endereço antes do commit;
- evidência e confiança por campo;
- indicação “novo”, “possível existente” ou “conflito”;
- carregando, sucesso, erro e recuperação;
- recarregar clientes somente após commit confirmado;
- acessibilidade e sem confirmação escondida.

### Testes

- rota e método;
- autenticação e tenant spoof;
- owner/membro e RLS;
- idempotência, replay e conflito;
- duplicidade de telefone compartilhado;
- transação sem inclusão parcial;
- redaction de logs;
- UI web/mobile para revisão, erro, sucesso e retry;
- regressão do preview atual.

## 16. Critérios de aceite do piloto

- zero mutação durante a prévia;
- 100% dos campos sugeridos mostram fonte ou ausência de evidência;
- 100% dos commits possuem ator, tenant, fingerprint e chave de idempotência;
- retry legítimo não cria duplicata;
- conflito nunca sobrescreve cadastro;
- mensagem, compra, pagamento e preço final nunca são executados sem capability autorizada;
- nenhum dado cru de conversa aparece em log operacional;
- nenhuma ação de um tenant aparece em outro;
- usuário consegue cancelar conexão e desligar Autopilot;
- handoff humano funciona antes de qualquer piloto de resposta automática;
- custo por conversa e por tenant é mensurável;
- produção continua bloqueada até canário autenticado e autorização explícita.

## 17. Métricas que provam negócio

### Produto e operação

- tempo até primeira resposta;
- percentual de mensagens classificadas corretamente;
- candidatos aceitos, corrigidos, rejeitados e duplicados;
- minutos administrativos poupados por lead/OS;
- lead -> visita -> orçamento -> aprovação -> pagamento;
- tempo entre aprovação e recebimento;
- no-show, retrabalho, garantia e retorno;
- manutenção recorrente anexada;
- prestadores ativos em 30/90 dias.

### IA e segurança

- precisão por campo;
- taxa de revisão humana;
- ação bloqueada por política;
- tentativas de prompt injection;
- custo de modelo por resultado aceito;
- retries, DLQ e falhas por provedor;
- opt-out, reclamação e handoff.

### Economia

- ARPU e margem por pacote;
- custo Meta/BSP por tenant;
- custo de IA por conversa resolvida;
- GMV e take-rate líquido;
- receita e margem de fornecedor;
- CAC, payback, retenção e expansão;
- receita incremental versus baseline do piloto.

## 18. Experimento comercial inicial

Coorte: 3 a 5 prestadores de climatização em uma cidade, com volumes reais pequenos e consentidos.

Promessa testável:

> “A OLLI transforma as conversas que chegam no WhatsApp em clientes organizados, orçamento e
> próximo passo, sem você precisar redigitar tudo.”

Não prometer “dispensar todos os funcionários”. Medir primeiro se a OLLI elimina tarefas
administrativas repetitivas com qualidade e permite que uma equipe pequena opere mais clientes.

Experimentos:

1. baseline de tempo de resposta e conversão por duas semanas;
2. importação revisada de conversas;
3. inbox oficial apenas de entrada;
4. resposta automática limitada a recebimento e qualificação;
5. orçamento rascunho;
6. follow-up e pagamento somente após aceites anteriores.

Hipóteses principais:

- o prestador paga porque economiza horas e perde menos leads;
- pelo menos uma parte relevante das conversas contém dados úteis sem pedir tudo novamente;
- manutenção recorrente aumenta retenção do prestador e do cliente final;
- dois fornecedores aceitam feed/RFQ em troca de demanda atribuída;
- capacidade e documentação verificadas melhoram matching sem ranking opaco.

## 19. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Meta commoditizar o agente genérico | construir vantagem no fluxo operacional, dados técnicos, fornecedor e garantia |
| bloqueio ou mudança de preço/capability | API oficial, adapter, coexistência/fallback, custos visíveis e feature flags |
| alucinação de preço ou peça | catálogo aprovado, regras determinísticas, compatibilidade explicável e confirmação |
| vazamento entre tenants | contexto server-authoritative, FORCE RLS, testes negativos e logs redigidos |
| duplicação ou sobrescrita de cliente | candidatos separados, idempotência e conflito revisável |
| spam e sanção de canal | opt-in, templates, frequência, opt-out e monitor de qualidade |
| conflito de interesse em fornecedores | separar anúncio de ranking técnico e explicar critérios |
| crédito ou custódia irregular | PSP/instituição regulada; OLLI apenas software e orquestração |
| suporte caro | piloto pequeno, onboarding guiado, observabilidade e capabilities graduais |
| margem negativa de IA/mensageria | franquia, teto, cache, modelos por tarefa e cobrança baseada em resultado válido |

## 20. Privacidade e governança

A ANPD orienta que legítimo interesse exige teste de finalidade, necessidade, balanceamento e
salvaguardas. A análise da ANPD sobre WhatsApp/Meta também registra risco elevado associado ao volume
e ao compartilhamento de dados. Portanto:

- documentar finalidade e base por fluxo;
- informar quando há agente de IA e oferecer pessoa humana;
- não treinar modelos globais com conversas por padrão;
- minimizar conteúdo e retenção;
- separar dado bruto, evidência e fato operacional confirmado;
- manter correção, exportação, exclusão e contestação;
- fazer RIPD/DPIA antes de escala se o risco justificar;
- impedir ranking ou decisão com efeito relevante sem explicação e revisão;
- fornecedores e modelos são operadores contratados somente dentro da finalidade declarada.

## 21. Fontes principais consultadas

- [Meta — Build AI agents with Meta Business Agent Platform](https://developers.meta.com/resources/videos/build-ai-agents-with-meta-business-agent-platform/)
- [Meta — Architecture of Meta Business Agent on WhatsApp](https://developers.meta.com/resources/videos/architecture-meta-business-agent-whatsapp/)
- [Meta — WhatsApp Business Platform pricing](https://whatsappbusiness.com/products/platform-pricing/)
- [Meta — WhatsApp Business Platform official Postman workspace](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta — WhatsApp Account Model Evolution](https://developers.meta.com/resources/videos/whatsapp-account-model-evolution/)
- [ServiceTitan — Pro Products](https://www.servicetitan.com/features/pro)
- [ServiceTitan — AI-powered agents for contractors](https://www.servicetitan.com/features/pro/marketing/ai-powered-agents)
- [Jobber — Receptionist powered by Jobber AI](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)
- [Housecall Pro — HVAC software](https://www.housecallpro.com/industries/hvac-software/)
- [Blip Go](https://www.blip.ai/blip-go/)
- [Zenvia — WhatsApp](https://zenvia.com/whatsapp/)
- [WATI — preços](https://www.wati.io/pt-br/pricing/)
- [Kommo — preços](https://www.kommo.com/buy/tariff/)
- [ANPD — compartilhamento de dados entre WhatsApp e Meta](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-conclui-a-analise-sobre-compartilhamento-de-dados-pessoais-entre-whatsapp-e-meta)
- [ANPD — guia de legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/legitimo_interesse___anonimizado_final_parte4.pdf)
- [Mercado Pago — Split Payments 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites)
- [Mercado Pago — OAuth](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/additional-content/security/oauth/introduction)
- [Mercado Pago — parcelamento sem cartão](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/installments-without-card)
- [Mercado Livre — catálogo por Part Number/Product ID](https://developers.mercadolivre.com.br/buscador-de-produtos)
- [Mercado Livre — API de preços](https://developers.mercadolivre.com.br/pt_br/api-de-precos)
- [Daikin — assistência e instaladores credenciados](https://www.daikin.com.br/assistencia)
- [Daikin — credenciamento residencial/comercial](https://www.daikin.com.br/profissionais/seja-um-credenciado/residencial)
- [BNDES — Cartão BNDES](https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/cartao-bndes)
- [Contrata+Brasil](https://www.gov.br/memp/pt-br/acesso-a-informacao/acoes-e-programas/contrata-brasil-1)

## 22. Pendências que exigem decisão ou prova

- Meta direto versus BSP para o piloto;
- disponibilidade real de Embedded Signup/coexistência para o perfil dos primeiros prestadores;
- comportamento e custo vigentes da mensageria no momento do piloto;
- retenção de mensagem bruta e base legal por caso de uso;
- provedor de pagamento inicial e contrato de split;
- fornecedores HVAC dispostos a fornecer preço, estoque e prazo;
- política de matching e patrocínio;
- limites financeiros e de mensagem por pacote;
- preço final, após entrevistas e teste de disposição a pagar;
- cidade e coorte inicial do piloto;
- critérios para promover uma capability de A1 para A2/A3.

Até essas decisões, a implementação deve permanecer em preview, candidatos, sandbox e staging.
