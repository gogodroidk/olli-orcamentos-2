# Catálogo priorizado — 20 documentos da OLLI

Versão: 1.0  
Data: 2026-08-26  
Estado: arquitetura de conteúdo; templates finais ainda exigem redação própria, teste com usuários e revisão aplicável.

## 1. Princípios da biblioteca

1. O modelo é um esquema versionado; PDF/HTML/DOCX é uma renderização.
2. Cada documento nasce de dados do fluxo e preserva a versão de origem.
3. Campos comuns pertencem ao kernel; campos técnicos pertencem ao pacote do ofício.
4. Assinaturas são independentes por papel e documento.
5. IA preenche rascunho e aponta lacuna; pessoa revisa e assume.
6. Documento aprovado/assinado é imutável; correção gera nova versão e vínculo.
7. Cada template registra fonte, licença, versão, revisor e jurisdição.
8. A OLLI não copia PDF, texto, tabela ou identidade de terceiros.

### Prioridade

- **P0:** primeira fatia HVAC e confiança mínima.
- **P1:** fechamento financeiro, B2B e expansão operacional.
- **P2:** contexto técnico/de risco condicionado a RT, setor ou tarefa.

### Assinatura

- **ACEITE:** ação afirmativa e dossiê eletrônico; nível definido por contrato/risco.
- **AVANÇADA:** associação unívoca, controle e detecção de alteração.
- **QUALIFICADA/ICP:** certificado ICP-Brasil quando exigido ou escolhido.
- **EXTERNA:** documento emitido em sistema oficial e apenas anexado/referenciado.
- **CONDICIONAL:** depende do serviço, contrato, RT ou destinatário.

## 2. Catálogo completo

### 1. Intake e qualificação de chamado — P0

- **Momento/persona:** lead → triagem; recepção, prestador solo.
- **Campos:** cliente/contato; local; canal/origem; equipamento ou classe; sintoma; urgência; risco; janela; anexos; quem registrou; aviso de privacidade; próximo passo.
- **Assinatura:** não; consentimento/aceite separado quando essa for a base aplicável.
- **IA:** extrair rascunho de mensagem/áudio e pedir confirmação dos campos críticos.
- **Gate:** não enviar resposta, agendar ou classificar emergência sem revisão.
- **Fonte-base:** modelo original; CDC (R20), Decreto 7.962 (R21) e LGPD (R15).

### 2. Cadastro de cliente e aviso/base LGPD — P0

- **Momento/persona:** antes de tratar dados; dono, administrativo, cliente.
- **Campos:** PF/PJ; dados mínimos; contatos; endereço; finalidades; base legal por operação; compartilhamentos; canal do titular; versão do aviso; aceite quando aplicável; retenção e restrições.
- **Assinatura:** ACEITE somente quando consentimento for a base; outras bases precisam de registro, não consentimento fictício.
- **IA:** nenhuma inferência de base legal; apenas checklist de lacunas.
- **Gate:** jurídico/privacidade define papéis, bases e texto.
- **Fonte-base:** LGPD/ANPD (R15–R19).

### 3. Ficha de ativo/equipamento — P0

- **Momento/persona:** cadastro → histórico; técnico, gestor, RT.
- **Campos:** cliente/local/ambiente; fabricante; modelo; série/patrimônio; tipo; capacidade e unidade; fluido; tensão; instalação; garantia; criticidade; fotos; QR; sistema/zona; status; fonte de cada dado.
- **Assinatura:** não; confirmação do técnico/RT é evento auditável.
- **IA:** OCR de plaqueta com confiança e revisão campo a campo.
- **Gate:** impedir inferência silenciosa de capacidade/fluido; origem obrigatória.
- **Fonte-base:** Portaria/Anexo I (R02–R03) e F04.

### 4. Checklist de visita e diagnóstico — P0

- **Momento/persona:** chegada → diagnóstico; técnico.
- **Campos:** chegada/localização proporcional; segurança/acesso; ativo; reclamação; condição; medições/unidades; instrumento; causa provável; severidade; fotos; peças; tempo; recomendação; escopo adicional; recusa/impedimento.
- **Assinatura:** CONDICIONAL para autorização diagnóstica/registro de visita.
- **IA:** voz/foto → rascunho; detectar inconsistência e campo obrigatório.
- **Gate:** checklist adaptativo nunca oculta item obrigatório de segurança.
- **Fonte-base:** R02–R03, R22–R23 e F05–F06 como referências, sem cópia.

### 5. Orçamento/proposta técnico-comercial — P0

- **Momento/persona:** diagnóstico → decisão; solo, comercial, cliente.
- **Campos:** versão; problema; escopo; inclusões/exclusões; itens/quantidades/unidades; mão de obra; deslocamento; terceiros; impostos; custos; margem; preço; opções; validade; prazo; garantia; pagamento; premissas; anexos; responsável.
- **Assinatura:** ACEITE/AVANÇADA antes da execução, conforme risco/contrato.
- **IA:** sugerir descrição, alternativa e preço com premissas visíveis; prestador decide.
- **Gate:** nunca usar benchmark oculto ou preço discriminatório; preservar custo e versão.
- **Fonte-base:** CDC/contratação digital (R20–R21), F01–F03 e pesquisa de jornada.

### 6. Aceite e ordem de autorização — P0

- **Momento/persona:** proposta → execução; cliente aprovador, dono.
- **Campos:** orçamento/versão/hash; opção escolhida; limites de alteração; sinal; agenda; cancelamento; identidade/autenticação; ação afirmativa; data/fuso; cópia entregue; ressalvas.
- **Assinatura:** ACEITE ou AVANÇADA; qualificada quando destinatário/regra exigir.
- **IA:** resumir condições sem alterar texto; destacar divergência.
- **Gate:** `GET` não aceita; link expira/revoga; prova separada por signatário.
- **Fonte-base:** MP/Lei de assinatura (R12–R14), CDC/Decreto (R20–R21).

### 7. Contrato de prestação/manutenção/PMOC — P0

- **Momento/persona:** contratação avulsa/recorrente; empresa, cliente, RT/jurídico.
- **Campos:** partes/representação; objeto; locais/ativos; escopo/exclusões; periodicidade; SLA; materiais; acesso; preço/reajuste; faturamento; vigência/renovação; rescisão; garantia; responsabilidades; RT/ART; dados/operadores; assinatura; anexos e ordem de precedência.
- **Assinatura:** AVANÇADA por padrão prudente; QUALIFICADA quando exigida.
- **IA:** montar rascunho a partir de cláusulas aprovadas, nunca inventar cláusula.
- **Gate:** jurídico aprova famílias B2B/B2C/PMOC; contrato não substitui ART.
- **Fonte-base:** R09, R12–R15, R20–R21 e F03–F04; redação integral própria.

### 8. Ordem de serviço — P0

- **Momento/persona:** despacho → execução → fechamento; gestor, técnico, cliente.
- **Campos:** número/status; cliente/local/ativo; escopo autorizado; prioridade/SLA; técnico; datas; tempo/quilometragem; checklist; peças; fotos; mudanças; pendências; aceite; vínculo orçamento/contrato.
- **Assinatura:** técnico + cliente no fechamento, de acordo com contrato.
- **IA:** resumo/relato a partir de eventos confirmados; nunca inventar execução.
- **Gate:** offline idempotente, conflitos e anexos protegidos.
- **Fonte-base:** F01–F02 e pesquisa competitiva; template original.

### 9. Checklist de instalação e comissionamento — P1

- **Momento/persona:** instalação → entrega; técnico, RT, cliente.
- **Campos:** ativo/capacidade; carga/linhas; vácuo; estanqueidade; elétrica; drenagem; fixação; fluxo; testes; configuração; fotos; descarte; manual; anomalias; liberação/limitações.
- **Assinatura:** CONDICIONAL; técnico, cliente e RT conforme escopo.
- **IA:** organizar evidência e sinalizar ausência, sem concluir conformidade.
- **Gate:** conteúdo técnico somente após RT e normas licenciadas aplicáveis.
- **Fonte-base:** R22–R23, F05, ACCA/ABNT apenas bibliográficos (F08/F10).

### 10. PMOC mestre versionado — P0

- **Momento/persona:** contrato recorrente → operação/auditoria; gestor predial, RT.
- **Campos:** estabelecimento; uso; responsável legal; RT/CREA/ART; ambientes; sistemas/ativos; capacidades; tarefas; procedimentos; periodicidades; responsáveis; emergência; base técnica/edição; vigência; anexos/projeto; divulgação; versões.
- **Assinatura:** RT; QUALIFICADA/ICP quando destinatário exigir ou como padrão alto.
- **IA:** auxiliar inventário/texto e detectar lacunas; não aprovar nem certificar.
- **Gate:** RE 9 histórica; norma/versão confirmada; OLLI não emite ART.
- **Fonte-base:** R01–R11, especialmente R03; ABNT somente sob licença.

### 11. Registro preventivo por equipamento — P0

- **Momento/persona:** cada visita PMOC; técnico, gestor, RT.
- **Campos:** plano/OS/ativo; data/hora; tarefa; condição antes/depois; medição/unidade/instrumento; limpeza/troca; material/fluido; foto; não conformidade; ação; próxima data; executor.
- **Assinatura:** técnico; cliente/gestor/RT conforme contrato.
- **IA:** ditado estruturado e resumo do histórico, com vínculo à evidência.
- **Gate:** nenhuma atividade marcada como executada por sugestão da IA.
- **Fonte-base:** R02–R03, F04 e F06 como referência.

### 12. Laudo/relatório diagnóstico corretivo — P1

- **Momento/persona:** falha → decisão/reparo/recusa; técnico, RT, cliente.
- **Campos:** objeto/limite; sintomas; testes; instrumento; medidas; causa/hipótese; severidade; opções; risco; peças; fotos; conclusão; limitação; recomendação; revisão.
- **Assinatura:** técnico; RT/QUALIFICADA quando a atividade/documento exigir.
- **IA:** rascunho com citações internas de evidência e incerteza.
- **Gate:** título “laudo” e conclusão técnica dependem de competência/ART.
- **Fonte-base:** R09–R11, R20 e documento original.

### 13. Relatório de qualidade do ar interior — P2

- **Momento/persona:** plano/inspeção → medição/laudo; laboratório, RT, gestor.
- **Campos:** ambiente/ponto; data/hora; condições; método; norma/versão; instrumento/calibração; laboratório; coleta/análise; parâmetro/unidade; resultado; referência; incerteza; conclusão; ação; reteste.
- **Assinatura:** RT/laboratório; QUALIFICADA prudente quando apresentado a órgão.
- **IA:** importar/organizar resultado e preparar rascunho; sem conclusão automática.
- **Gate:** norma licenciada/atual, método e atribuição confirmados; RE 9 só histórica.
- **Fonte-base:** R01, R04–R08 e F08; revisão obrigatória.

### 14. Registro e checklist de ART/RT — P1

- **Momento/persona:** contratação técnica → início/auditoria; RT, contratante.
- **Campos:** ART externa; CREA/UF; profissional/empresa; contratante; objeto; atividades; local; prazo/valor; situação; data de consulta; escopo; documento anexo; responsáveis vinculados.
- **Assinatura:** EXTERNA no CREA; OLLI apenas registra referência/anexo.
- **IA:** conferir completude e divergência textual, sem validar autenticidade/atribuição.
- **Gate:** não simular número, quitação ou selo; confirmar no CREA competente.
- **Fonte-base:** R09–R11.

### 15. Dossiê de segurança: APR, PT, NR-35 e controle de energia — P2

- **Momento/persona:** preparação → execução/liberação; supervisor, técnico.
- **Campos:** tarefa/local; riscos; clima/entorno; fontes de energia; isolamento/bloqueio/teste; queda/ancoragem; EPI/EPC; impeditivas; comunicação; emergência/resgate; envolvidos; autorização; validade; liberação.
- **Assinatura:** responsáveis e equipe conforme procedimento.
- **IA:** sugerir perigos de catálogo aprovado; nunca liberar atividade.
- **Gate:** SST/RT define quando aplicar, conteúdo e responsável; versão de NR por data.
- **Fonte-base:** R22–R23; procedimento próprio revisado.

### 16. Termo de entrega, aceite e evidências — P0

- **Momento/persona:** fechamento; técnico, cliente/gestor.
- **Campos:** OS/escopo; serviços; testes; materiais; pendências; instruções; fotos/anexos; data; ressalvas; aceite/recusa; cópia entregue.
- **Assinatura:** ACEITE/AVANÇADA conforme contrato.
- **IA:** resumir eventos confirmados e listar pendências.
- **Gate:** não reutilizar assinatura da OS/contrato; documento final imutável.
- **Fonte-base:** R12–R14, R20–R21 e F03.

### 17. Termo de garantia e retorno — P1

- **Momento/persona:** entrega → pós-venda; prestador, cliente.
- **Campos:** serviço/item; cobertura; prazo; início/fim; exclusões; manutenção exigida; canal; prazo de resposta; OS; acionamento; transferência; ressalvas.
- **Assinatura:** ACEITE quando parte do contrato; cópia entregue.
- **IA:** explicar em linguagem simples sem reduzir direito legal.
- **Gate:** jurídico/CDC revisa garantia legal × contratual e cláusulas limitativas.
- **Fonte-base:** R20–R21; texto próprio.

### 18. NFS-e e recibo fiscal — P1

- **Momento/persona:** conclusão → fiscal; financeiro, prestador, cliente.
- **Campos:** tomador; CPF/CNPJ; município; competência; código/descrição; valor; retenções; impostos; forma; vínculo OS/contrato; identificador/URL oficial.
- **Assinatura:** EXTERNA conforme emissor oficial.
- **IA:** sugerir descrição/código para revisão; nunca emitir sem ação/integração autorizada.
- **Gate:** contador e município; documento fiscal vem do sistema competente.
- **Fonte-base:** R24.

### 19. Fatura, cobrança e conciliação — P1

- **Momento/persona:** fiscal → recebimento; financeiro, dono.
- **Campos:** orçamento/contrato/OS/NFS-e; vencimento; parcela/sinal; Pix/boleto/cartão; status; juros/multa contratual; comprovante; taxa; líquido; conciliação; estorno/disputa.
- **Assinatura:** condições aceitas no contrato; cobrança não precisa nova assinatura em cada evento.
- **IA:** prever atraso e rascunhar lembrete; envio/cobrança sempre governados.
- **Gate:** sandbox, webhook assinado, idempotência, consentimento/canal e nenhuma cobrança real em teste.
- **Fonte-base:** R20–R21, R24 e termos do provedor escolhido.

### 20. Relatório mensal B2B, SLA e PMOC — P1

- **Momento/persona:** contrato recorrente → revisão/renovação; gestor, cliente, RT.
- **Campos:** período; OS abertas/fechadas; SLA; preventivas devidas/concluídas/atrasadas; indisponibilidade; ativos; custos; não conformidades; ações; ART/laudos; próximos prazos; fontes e definições.
- **Assinatura:** gestor/RT conforme contrato; cópia ao cliente.
- **IA:** narrar métricas calculadas e apontar anomalias, com fonte.
- **Gate:** definições/denominadores fixos; sem inventar dado ausente ou declarar conformidade.
- **Fonte-base:** R01–R11 e F03–F04; relatório original.

## 3. Ordem sugerida de construção

### Pacote A — núcleo comercial-operacional

1, 2, 3, 4, 5, 6, 8 e 16.

### Pacote B — contrato e recorrência HVAC

7, 10, 11, 14 e 20.

### Pacote C — fechamento financeiro

17, 18 e 19.

### Pacote D — técnico condicionado

9, 12, 13 e 15, somente após RT/jurídico e fontes licenciadas aplicáveis.

## 4. Critério de aceite de cada template

- schema e versão registrados;
- campos aplicáveis e `não aplicável` definidos;
- origem/licença para cada bloco normativo;
- linguagem própria e sem marca/layout de terceiro;
- revisão de produto e usuário-alvo;
- revisão jurídica, RT ou SST quando indicada;
- testes de preenchimento mobile/offline;
- visualização e PDF acessíveis, com quebra de página verificada;
- assinatura por papel, hash, cópia e retificação;
- exportação/importação e retenção definidas;
- IA limitada a rascunho com confirmação;
- fixture sintética e teste negativo antes de dados reais.

