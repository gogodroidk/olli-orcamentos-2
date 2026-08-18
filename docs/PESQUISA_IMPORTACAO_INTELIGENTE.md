# Pesquisa de Produto — Importação Inteligente e Portabilidade de Dados

> Data da consolidação: 18/08/2026
>
> Status: **decisão de produto e arquitetura; ainda não implementado**
>
> Escopo: clientes, catálogo, orçamentos, conversas exportadas do WhatsApp,
> documentos, deduplicação, exportação e IA assistiva.

## 1. Veredito executivo

A ideia é útil, vendável e muito alinhada ao público do OLLI. Prestadores de
serviço acumulam clientes, preços, pedidos, endereços e histórico em WhatsApp,
planilhas, PDFs, fotos e anotações. A barreira para adotar um sistema novo não é
apenas aprender uma tela: é o medo de perder a história da empresa, duplicar
clientes ou passar dias digitando tudo novamente.

O produto certo não é uma IA que grava tudo sozinha. É uma **Central de
Migração e Caixa de Decisões** que:

1. recebe arquivos e conversas escolhidos pelo usuário;
2. faz a leitura determinística antes de chamar IA;
3. normaliza telefone, CPF/CNPJ, e-mail, endereço, datas e valores;
4. mostra o que encontrou, de onde veio e o grau de confiança;
5. cria rascunhos e aponta duplicidades;
6. exige aprovação humana antes de alterar os dados oficiais;
7. grava o lote de forma atômica, auditável e reversível;
8. permite exportar todos os dados em formatos abertos.

Proposta de valor:

> **Traga a bagunça. O OLLI organiza, explica e só grava quando você aprova.
> Seus dados entram e saem fácil.**

## 2. O problema real que estamos resolvendo

### Jobs-to-be-done

| Quando... | Eu quero... | Para que... |
|---|---|---|
| saio de uma planilha ou outro sistema | importar clientes, catálogo e orçamentos | começar a usar o OLLI sem perder meu histórico |
| recebo um pedido no WhatsApp | transformar a conversa em um orçamento rascunho | responder rápido sem esquecer valor, material, endereço ou prazo |
| recebo PDF, foto ou texto | extrair os campos e apontar o que falta | não redigitar tudo e não confiar cegamente na IA |
| tenho cadastros repetidos | entender os possíveis duplicados | evitar cobrança, agenda ou orçamento no cliente errado |
| tenho bons orçamentos antigos | usá-los como referências privadas | manter o padrão da empresa nos próximos rascunhos |
| tenho vendas paradas | encontrar conversas e orçamentos sem retorno | recuperar oportunidades esquecidas |
| quero trocar de sistema no futuro | exportar tudo de forma simples e documentada | não ficar preso ao OLLI |

### Evidência de mercado

Produtos maduros de gestão de serviços tratam migração como funcionalidade de
produto. Jobber documenta importação de clientes e orçamentos com mapeamento,
revisão, erros e processamento em segundo plano. ServiceTitan exige preparação
formal dos dados para migração. HubSpot mantém histórico de importações,
relatórios de erro e distinção entre registros criados e atualizados.

Essas evidências confirmam a necessidade, mas também mostram a oportunidade do
OLLI: concorrentes normalmente exigem CSV rígido; o OLLI pode aceitar a planilha
real do prestador, explicar o resultado em linguagem simples e usar IA apenas
para a parte ambígua.

Relatos de comunidades brasileiras reforçam a dor qualitativa: o orçamento
nasce no WhatsApp, às vezes em áudio, e depois é perdido entre bloco de notas,
planilha e memória. Isso não prova sozinho o tamanho do mercado, mas corresponde
diretamente ao usuário-alvo do OLLI.

## 3. O produto recomendado

### 3.1 Central de Migração

O chat deve continuar existindo, mas não pode ser a única interface. Revisar
centenas de linhas em uma conversa seria lento e confuso. A tela principal deve
resumir decisões de negócio:

```text
Arquivo: clientes_e_orcamentos_2025.xlsx

Encontramos:
  248 clientes
   96 orçamentos
  173 itens de serviço
   21 possíveis duplicados
    8 telefones inválidos
   14 valores que exigem revisão

Ações propostas:
  Criar 202 clientes
  Vincular 32 orçamentos a clientes existentes
  Revisar 21 possíveis duplicados
  Manter todos os orçamentos como rascunho
```

Ações por grupo:

- aprovar;
- editar;
- ignorar;
- usar cliente existente;
- criar como novo;
- aplicar a mesma decisão a casos semelhantes;
- ver a origem e o trecho de evidência;
- desfazer o lote após a importação.

O chat funciona como camada de comando, por exemplo:

- “Importe somente os clientes novos.”
- “Deixe os orçamentos como rascunho.”
- “Não crie cliente sem telefone, e-mail ou CPF/CNPJ.”
- “Considere instalação de split e instalar ar-condicionado como o mesmo
  serviço.”

### 3.2 Caixa de Decisões

Depois da migração, a mesma estrutura pode virar uma caixa inteligente de
trabalho:

- novos clientes encontrados;
- possíveis duplicados;
- orçamentos em rascunho;
- conversas aguardando retorno;
- possível aprovação mencionada;
- endereço incompleto;
- pagamento prometido;
- orçamento vencido sem resposta;
- serviço recorrente próximo de vencer.

A IA sugere; o usuário decide. Preço, pagamento, agendamento, aprovação e envio
de mensagem nunca devem mudar silenciosamente.

### 3.3 Radar de vendas perdidas

Uma evolução de alto valor é mostrar:

- orçamento enviado há vários dias sem resposta;
- cliente que pediu retorno e foi esquecido;
- cliente que demonstrou aprovação mas ainda não agendou;
- validade vencida;
- pagamento prometido e não registrado;
- conversa que menciona urgência;
- manutenção recorrente próxima.

Esse radar tende a produzir mais valor diário do que um gerador genérico de
texto, pois conecta IA diretamente a dinheiro e follow-up.

### 3.4 Referências privadas da empresa

Não prometer “treinar uma IA com todos os seus dados”. Na primeira versão:

1. o usuário seleciona de três a dez orçamentos considerados bons;
2. o OLLI extrai nomes de serviços, descrições, unidade, observações, validade,
   forma de pagamento e faixa de valor;
3. os padrões viram referências revisáveis da empresa;
4. novos rascunhos recebem sugestões baseadas nessas referências;
5. nada de uma empresa entra no contexto de outra.

Busca vetorial e RAG só entram depois que o uso real provar que regras e busca
textual não resolvem.

## 4. Fluxos de importação

### 4.1 CSV/XLSX

```text
Escolher arquivo
  → detectar abas, delimitadores e cabeçalhos
  → sugerir mapeamento de colunas
  → normalizar e validar localmente
  → mostrar erros por linha
  → procurar duplicidades
  → preparar plano de mutações
  → revisão humana
  → commit atômico
  → recibo da operação + opção de desfazer
```

Regras obrigatórias:

- limites de bytes, linhas, colunas e tamanho de célula;
- fórmulas nunca são executadas;
- macros são recusadas;
- CSV exportado neutraliza células iniciadas por `=`, `+`, `-` ou `@`;
- uma linha ruim não invalida silenciosamente todas as linhas boas;
- o usuário pode baixar apenas as linhas com erro, corrigir e reenviar;
- registro existente só é atualizado quando isso estiver explícito na revisão.

### 4.2 PDF e documentos

PDF com texto selecionável:

1. extração determinística de texto por página;
2. limites de arquivo, páginas, tempo e caracteres;
3. seleção apenas dos trechos relevantes;
4. extração estruturada via OpenRouter com JSON Schema;
5. validação server-side;
6. evidência por campo;
7. orçamento criado sempre como rascunho.

PDF escaneado ou fotografia deve ser marcado como “OCR necessário”. OCR visual
é uma fase posterior, processada em serviço/fila isolada e nunca dentro do APK.

### 4.3 Conversas exportadas do WhatsApp

O caminho inicial correto é a exportação manual `.txt` ou `.zip` escolhida pelo
dono. Não copiar cookies, sessões ou perfil do WhatsApp Web.

```text
Arquivo exportado pelo usuário
  → parser próprio por formato e localidade
  → separar data, remetente, texto, mídia e mensagens de sistema
  → agrupar janelas comerciais relevantes
  → remover ruído e minimizar dados enviados à IA
  → extrair cliente, pedido, itens, endereço, prazo e intenção
  → mostrar fonte e confiança
  → criar cliente/orçamento/tarefa somente após aprovação
```

Integração contínua com novas mensagens pertence a uma fase diferente e deve
usar a API oficial do WhatsApp Business, com opt-in, templates, janela de
atendimento e custos visíveis. O produto não deve prometer importar todo o
histórico de qualquer conta nem usar automação não oficial.

## 5. Duplicidade e mesclagem

Ordem recomendada para identificar o mesmo cliente:

1. identificador externo da fonte, quando existir;
2. CPF/CNPJ normalizado;
3. telefone em formato E.164;
4. e-mail normalizado;
5. nome combinado com endereço;
6. similaridade textual apenas como sugestão.

Exemplo de decisão explicável:

```text
Possível duplicidade: confiança alta

Novo registro: João Silva, (11) 99999-0000, Rua das Flores 32
Existente:     João da Silva, +55 11 99999-0000, R. das Flores, 32

Motivos:
  telefone igual após normalização
  nome muito semelhante
  endereço muito semelhante
```

Nunca mesclar automaticamente por nome parecido. A tela deve mostrar conflitos,
qual valor será preservado e permitir criar como novo. A decisão pode ser
reutilizada em casos semelhantes, mas continua auditada.

## 6. Exportação e portabilidade

O OLLI deve ganhar uma área **Meus dados**. A exportação não deve ser escondida
nem usada como punição comercial.

Formato principal: pacote ZIP versionado com:

- `clientes.csv`;
- `enderecos.csv`;
- `servicos.csv`;
- `produtos.csv`;
- `orcamentos.csv`;
- `itens_orcamento.csv`;
- `agenda.csv`;
- `ordens_servico.csv`;
- `recibos_pagamentos.csv`;
- `importacoes.csv`;
- arquivos e anexos permitidos;
- `dados.json` preservando relações completas;
- `LEIA-ME.md` explicando tabelas e colunas;
- `manifest.json` com versão do esquema, período, contagens e hashes.

Opções:

- período e status;
- dados ativos e, opcionalmente, lixeira;
- exportação imediata para conjuntos pequenos;
- processamento assíncrono para conjuntos grandes;
- histórico e expiração segura dos pacotes;
- restauração validada por versão de esquema.

## 7. Estado atual do OLLI

### O que já existe e pode ser reaproveitado

- `BackupSnapshot` versão 2 reúne empresa, clientes, serviços, produtos,
  orçamentos, recibos, modelos, depoimentos, agenda, contadores, relatórios,
  versões de orçamento, ordens de serviço e equipamentos.
- `exportAllData()` e `importAllData()` já fornecem uma base de serialização e
  restauração transacional para backup interno.
- restauração protege membros e tombstones, e os backups automáticos já têm
  política diário/semanal/manual.
- clientes usam exclusão lógica e já existe um aviso simples de possível
  duplicidade por telefone ou CPF/CNPJ.
- a IA atual já interpreta voz/texto em itens e mantém conversa de orçamento.
- o compartilhamento por WhatsApp já existe como saída por deep-link.
- o sync já tem regras de tenant, dono, membro e proteção contra ressurreição de
  registros apagados.

### O que ainda não existe

- importação portátil CSV/XLSX;
- exportação estruturada para o titular/LGPD;
- importação de conversa do WhatsApp;
- importação de PDF/documento;
- tabelas de lote, staging, item, decisão, evidência e auditoria;
- origem/proveniência por campo;
- revisão humana de lote e rollback de importação;
- deduplicação explicável e mesclagem assistida;
- fila/inbox de decisões;
- paridade de importação/exportação no painel web;
- testes de round-trip, CSV irregular, duplicidade e rollback de lote.

O backup interno não deve ser exposto diretamente como formato público de
importação. Ele substitui dados relacionais e não traz o envelope de origem,
proveniência, decisão por linha e reversão exigidos por uma migração de cliente.

### Atenções arquiteturais já conhecidas

- somente proprietário/admin deve importar, exportar, mesclar ou desfazer;
- não renumerar orçamentos que já foram enviados;
- criação offline em dois aparelhos ainda pode colidir na numeração e precisa
  da decisão/migração já registrada no projeto;
- restauração de membro tem borda de tenant registrada e não deve ser reutilizada
  como fluxo de importação;
- os arquivos brutos precisam ficar em armazenamento privado, com retenção
  curta e exclusão controlada;
- logs não podem conter conversas, documentos, telefone, CPF/CNPJ ou conteúdo de
  orçamento.

## 8. Arquitetura proposta

### Modelo mínimo

`import_jobs`

- tenant/dono;
- usuário criador;
- tipo de fonte;
- nome seguro, hash e metadados do artefato;
- versão do parser e do esquema;
- estados `recebido`, `processando`, `revisao`, `aprovado`, `confirmado`,
  `desfeito` e `falhou`;
- contagens, datas e política de retenção.

`import_items`

- lote;
- linha/trecho/página de origem;
- tipo de entidade candidata;
- payload normalizado;
- validação e mensagens de erro;
- confiança;
- ação proposta e decisão humana;
- chave idempotente;
- referência à entidade criada ou atualizada.

`import_evidence`

- item e campo;
- origem exata;
- trecho minimizado;
- página/linha/horário;
- método de extração;
- sem conteúdo desnecessário em telemetria.

`import_changes`

- lote;
- entidade;
- estado anterior e posterior necessário ao rollback;
- quem aprovou;
- data e resultado da reversão.

### Execução

```text
Expo / painel web
  ├─ seleção de arquivo
  ├─ leitura CSV/XLSX e prévia local quando possível
  ├─ mapeamento e revisão em linguagem de negócio
  └─ envio somente do necessário

Cloudflare Worker
  ├─ autenticação e autorização
  ├─ limites e validação de conteúdo
  ├─ PDF textual
  ├─ OpenRouter com JSON Schema e cota
  ├─ filas para tarefas grandes
  └─ nenhuma gravação definitiva sem confirmação

R2 privado / armazenamento privado
  ├─ artefatos temporários
  ├─ hash e expiração
  └─ downloads assinados e auditados

Supabase / Postgres
  ├─ staging e decisões
  ├─ RPCs transacionais e idempotentes
  ├─ RLS fail-closed por tenant
  ├─ auditoria e rollback
  └─ pg_trgm para sugestões de duplicidade
```

## 9. Open source e Hugging Face

Nenhuma dependência foi instalada por esta pesquisa. Os candidatos aprovados
precisam passar pelo preflight de licença, manutenção, vulnerabilidades,
dependências transitivas, pinagem e compatibilidade antes de entrar no projeto.

| Candidato | Uso | Decisão | Risco/observação |
|---|---|---|---|
| SheetJS CE (`xlsx`) | ler XLSX/CSV | candidato para usar após preflight | limitar planilhas, recusar macros e pinar fonte/versão |
| `csv-parse` | CSV robusto e streaming | usar | proteger contra fórmula na exportação e limitar células |
| Zod | schemas de linha e resposta de IA | usar | valida forma e regra; não substitui revisão humana |
| `unpdf` | extrair PDF textual no Worker | usar com limites/fila | PDF é entrada não confiável e pode consumir CPU/memória |
| `pg_trgm` | similaridade explicável | usar primeiro | sugestão apenas; não fazer merge automático |
| OpenRouter Structured Outputs | JSON Schema estrito | usar no adaptador atual | modelo precisa suportar parâmetros; aplicar cota e validação |
| `react-spreadsheet-import` | referência de UX do painel web | estudar/adaptar padrões | biblioteca React/Chakra, não React Native; auditar antes de instalar |
| `pgvector` | busca semântica privada | postergar | usar somente se RAG provar valor real |
| Presidio | detecção/mascaramento de PII | postergar para serviço isolado | Python, reconhecedores BR adicionais e custo operacional |
| Qwen2.5-VL | extração visual | avaliar como lane futura | modelo grande; exige backend/GPU e governança de dados |
| PaddleOCR-VL | OCR/layout | avaliar no futuro | Python/GPU; não cabe no Worker atual |
| BGE-M3 | embeddings multilíngues | postergar | sem necessidade no MVP |

### Projetos rejeitados para a primeira versão

- `whatstk`: referência útil de formatos, mas Python/GPL-3.0 não é uma boa
  dependência para o produto comercial atual;
- WhatsApp Chat Exporter: acessa/decripta backups de aparelhos, invasivo demais
  para o produto; não usar;
- Tesseract.js: a própria documentação não oferece suporte a React Native e o
  custo WASM/memória é inadequado ao APK/Worker;
- Unstructured, Docling e MarkItDown: pipelines Python pesados e excesso de
  infraestrutura para o MVP;
- dedupeio/dedupe: treinamento e serviço Python antes de esgotar regras
  determinísticas e `pg_trgm`;
- LangChain/LlamaIndex completos: complexidade e dependências sem vantagem sobre
  funções próprias, JSON Schema e Zod neste estágio;
- banco vetorial separado, Redis e BullMQ: duplicam a infraestrutura já coberta
  por Supabase e Cloudflare Queues.

## 10. Requisitos não negociáveis

1. A IA nunca grava cliente, preço, orçamento, pagamento, aprovação ou agenda
   sem revisão explícita.
2. Todo dado importado passa por staging separado do dado oficial.
3. Cada campo relevante mostra fonte, método e confiança.
4. Orçamento importado nasce como `rascunho`.
5. Commit do lote é transacional, idempotente e auditado.
6. O usuário pode desfazer o lote sem apagar dados anteriores.
7. Similaridade sugere duplicidade, mas nunca mescla automaticamente.
8. Somente dono/admin importa, exporta, mescla e desfaz.
9. Arquivo bruto tem limite, armazenamento privado e retenção definida.
10. Telemetria mede resultado sem registrar conteúdo pessoal/comercial.
11. WhatsApp contínuo usa somente API oficial; nenhuma sessão/cookie é copiado.
12. Exportação completa e documentada permanece acessível.

## 11. Roadmap recomendado

### Fase 0 — validação com clientes

- entrevistar de cinco a oito prestadores de segmentos diferentes;
- usar planilhas e conversas reais previamente anonimizadas/autorizadas;
- prototipar mapeamento, resumo do lote e decisão de duplicidade;
- medir tempo, correções, confiança e intenção de pagamento;
- fechar formato de exportação antes da migration.

### Fase 1 — migração que destrava adoção

- clientes e catálogo por CSV/XLSX;
- mapeamento de colunas;
- normalização brasileira;
- staging, prévia, erro por linha, auditoria e rollback;
- deduplicação determinística + `pg_trgm` como sugestão;
- exportação de clientes, catálogo e orçamentos em CSV/JSON/ZIP.

### Fase 2 — orçamentos históricos

- orçamento e itens por CSV/XLSX;
- status sempre rascunho na entrada;
- PDF textual com limites e fila;
- OpenRouter com JSON Schema;
- evidência, confiança e chat de revisão;
- referências privadas escolhidas pelo usuário.

### Fase 3 — WhatsApp exportado

- `.txt`/`.zip` exportado manualmente pelo usuário;
- parser próprio por formato/localidade;
- cliente, pedido, itens, endereço e follow-up como candidatos;
- Caixa de Decisões e Radar de Vendas Perdidas;
- nenhuma leitura de WhatsApp Web ou envio automático.

### Fase 4 — OCR e operação contínua

- foto/PDF escaneado em serviço visual isolado;
- integração oficial WhatsApp Business para novas mensagens;
- templates, opt-in, custos e escalonamento humano;
- RAG/embeddings apenas se métricas provarem necessidade.

## 12. Plano de validação

Hipótese:

> Prestadores que controlam clientes e orçamentos por WhatsApp e planilhas
> adotam o OLLI se conseguirem importar sua base sem medo, transformar conversas
> selecionadas em rascunhos revisáveis e exportar tudo quando quiserem.

Métricas:

- tempo para concluir a primeira importação;
- percentual de usuários que concluem sem suporte;
- correções humanas por campo crítico;
- precisão das sugestões de duplicidade;
- quantidade de rascunhos que viram orçamento enviado;
- follow-ups recuperados;
- lotes desfeitos;
- falhas por formato/arquivo;
- intenção e disposição de pagar;
- uso espontâneo uma semana depois.

Critérios propostos para o piloto — hipóteses, não dados de mercado:

- pelo menos 60% concluem uma importação simples sem ajuda;
- menos de 15% dos campos críticos exigem correção;
- nenhum dado oficial muda sem aprovação;
- rollback reproduz o estado anterior nos testes;
- pelo menos metade dos participantes afirma que a migração reduziria a barreira
  de adoção;
- a funcionalidade economiza tempo real, não apenas transfere a digitação para
  outra tela.

Se os campos críticos ultrapassarem a taxa proposta, reduzir fontes e tipos
aceitos antes de aumentar a autonomia da IA.

## 13. Decisão final

Construir a fundação nesta ordem:

1. portabilidade e exportação completa;
2. CSV/XLSX com staging, revisão e rollback;
3. deduplicação explicável;
4. orçamentos/PDF como rascunho;
5. conversa exportada do WhatsApp;
6. radar de follow-up;
7. API oficial do WhatsApp e OCR somente depois da validação.

Não iniciar pelo agente autônomo, RAG, OCR pesado ou sincronização não oficial do
WhatsApp. A vantagem competitiva será a confiança: **o OLLI consegue organizar a
bagunça sem criar uma bagunça nova**.

## 14. Fontes

### Mercado, comunidade e concorrentes

- [Jobber — importar clientes](https://help.getjobber.com/hc/en-us/articles/360034980534-Import-Clients)
- [Jobber — importar orçamentos](https://help.getjobber.com/hc/en-us/articles/39138301239575-Import-Quotes)
- [Jobber — exportar clientes](https://help.getjobber.com/hc/en-us/articles/115009619328-Export-Client-Information)
- [Jobber — relatório/exportação de orçamentos](https://help.getjobber.com/hc/en-us/articles/18551924609815-Quotes-Report)
- [ServiceTitan — preparar dados para importação](https://help.servicetitan.com/v1/docs/prepare-your-data-for-import-into-servicetitan)
- [HubSpot — resolver erros de importação](https://knowledge.hubspot.com/import-and-export/troubleshoot-import-errors?is_listing=false&web=1)
- [HubSpot — analisar importações anteriores](https://knowledge.hubspot.com/import-and-export/view-and-analyze-previous-imports?gn=1)
- [Comunidade brasileira — orçamento de autônomos pelo WhatsApp](https://www.reddit.com/r/empreendedorismo/comments/1s546fz/sistema_gratuito_pra_aut%C3%B4nomos_mandarem/)
- [Comunidade brasileira — CRM e WhatsApp](https://www.reddit.com/r/empreendedorismo/comments/1v18ou1/ideias_para_crm_novo/)
- [Comunidade de PMEs — IA que permanece útil](https://www.reddit.com/r/AiForSmallBusiness/comments/1rqw37o/small_business_owners_using_ai_whats_actually/)
- [Comunidade CRM — qualidade e integração de dados](https://www.reddit.com/r/CRM/comments/1vf3xst/is_bad_data_integration_the_real_reason_most/)
- [Política do WhatsApp Business](https://whatsappbusiness.com/policy/)
- [Preços da plataforma WhatsApp Business](https://whatsappbusiness.com/pt-br/products/platform-pricing/)
- [Developer Hub do WhatsApp Business](https://whatsappbusiness.com/developers/developer-hub/)
- [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)

### Tecnologia

- [SheetJS — importação em React Native](https://docs.sheetjs.com/docs/getting-started/examples/import/)
- [CSV Parse](https://csv.js.org/parse/)
- [Zod](https://github.com/colinhacks/zod)
- [unpdf](https://github.com/unjs/unpdf)
- [OpenRouter — Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [Supabase — vector columns](https://supabase.com/docs/guides/ai/vector-columns)
- [Supabase — RAG com permissões](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [React Spreadsheet Import](https://github.com/UgnisSoftware/react-spreadsheet-import)
- [Microsoft Presidio](https://github.com/microsoft/presidio)
- [Tesseract.js — FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md)
- [Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
- [PaddleOCR-VL](https://huggingface.co/PaddlePaddle/PaddleOCR-VL)
- [BAAI bge-m3](https://huggingface.co/BAAI/bge-m3)
