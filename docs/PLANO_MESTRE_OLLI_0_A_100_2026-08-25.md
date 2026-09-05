# Plano Mestre OLLI — do estado atual a 100%

**Data-base:** 25 de agosto de 2026

**Repositório canônico auditado:** `C:\OLLI_REL`

**Referência técnica:** branch `main`, commit `df63a25`

**Natureza deste documento:** plano de produto, arquitetura, pesquisa, segurança, execução e aceite. Nenhuma fase de implementação foi iniciada por este documento.
**Objetivo:** transformar o OLLI em uma plataforma completa, web e móvel, para o ciclo de vida de empresas prestadoras de serviço, começando por ar-condicionado/refrigeração e PMOC, com inteligência artificial assistiva, dados íntegros, operação offline e expansão controlada para outros ofícios.

---

## 1. Como ler este plano

Este documento separa quatro tipos de afirmação:

- **VERIFICADO:** existe no código ou foi confirmado na pesquisa atual.
- **PARCIAL:** existe, mas ainda não cumpre o critério de confiabilidade ou conclusão.
- **PLANEJADO:** deverá ser construído durante a execução.
- **GATE:** condição que bloqueia avanço, publicação ou promessa comercial até ser comprovada.

“100%” não significa que o produto nunca mais receberá melhorias. Significa que o escopo definido aqui está implementado, migrado, testado, documentado, monitorado e validado com usuários reais, sem pendências críticas escondidas.

As porcentagens do roadmap representam **maturidade acumulada e gates de entrega**, não estimativas lineares de tempo.

---

## 2. Síntese executiva

### 2.1 O produto que estamos construindo

O OLLI será o sistema operacional de uma empresa prestadora de serviços:

```text
Pedido ou oportunidade
  → cliente, local e equipamento
  → orçamento personalizado e precificado
  → aprovação e contrato
  → agenda, equipe e ordem de serviço
  → execução offline, checklist e evidências
  → relatório, laudo, assinatura e pacote documental
  → cobrança, recibo e acompanhamento
  → manutenção recorrente, renovação e nova venda
  → inteligência baseada no histórico real da empresa
```

O núcleo será horizontal. Cada vertical acrescentará somente aquilo que é realmente específico: documentos, campos, cálculos, checklists, regras, fontes técnicas e indicadores.

### 2.2 Posição recomendada

> **OLLI é a plataforma simples, offline-first e assistida por IA que transforma serviço de campo em orçamento, execução comprovada, documento, recebimento e recorrência — começando por HVAC/PMOC e crescendo com a empresa sem obrigá-la a trocar de sistema.**

Não devemos vender o OLLI como “a primeira IA para prestadores”, “o único sistema com PMOC” ou “o primeiro orçamento por voz”. Concorrentes como Auvo, Produttivo, Jobber e plataformas de field service já oferecem partes importantes desse conjunto. A diferenciação defensável será a combinação de:

1. entrada simples para o profissional autônomo;
2. continuidade para equipes e múltiplas unidades;
3. operação de campo confiável mesmo sem sinal;
4. orçamento, documentos, execução, recebimento e renovação no mesmo histórico;
5. profundidade real em HVAC/PMOC;
6. personalização completa da empresa;
7. IA incorporada nos pontos de decisão, com explicação e revisão humana;
8. inteligência de preço baseada primeiro nos custos e resultados da própria empresa;
9. expansão por pacotes verticais governados, e não por telas genéricas renomeadas.

### 2.3 Dez decisões que governam todo o projeto

1. **HVAC primeiro, plataforma horizontal por baixo.** OLLI resolve profundamente o trabalho de ar-condicionado antes de abrir várias verticais incompletas.
2. **IA assistiva, não autoridade autônoma.** Valores, diagnósticos, contratos, laudos, PMOC, pagamentos e comunicações externas exigem regra determinística e/ou confirmação humana.
3. **Dados da empresa pertencem à empresa.** O aprendizado entre empresas não é automático; dependerá de consentimento, finalidade, anonimização baseada em risco e revisão concorrencial/LGPD.
4. **Preço começa no custo.** Benchmark de mercado jamais substitui custo, margem, capacidade, risco e histórico do próprio prestador.
5. **Servidor confirma; dispositivo não perde trabalho.** O servidor é a verdade canônica do estado compartilhado aceito; a base local é a verdade temporária das operações offline ainda não sincronizadas.
6. **Documentos enviados são imutáveis.** Alterações criam nova versão; PDF, conteúdo, fonte, hash, autor, data e eventos de assinatura permanecem recuperáveis.
7. **Administrador controla acesso, não senhas.** A empresa convida, suspende, redefine acesso e revoga sessões; ninguém vê a senha de outra pessoa.
8. **Normas e modelos têm procedência.** Toda fonte técnica ou legal possui versão, URL oficial, licença, data de coleta, responsável por revisão e estado de vigência.
9. **Integrações entram por adaptadores e eventos idempotentes.** Agenda, WhatsApp, pagamentos, e-mail e provedores de IA podem ser substituídos sem reescrever o domínio.
10. **Nenhuma promessa de produção sem prova.** Build, dispositivo físico, RLS, restore, webhooks, sincronização, assinatura e fluxo crítico precisam de evidência atual.

---

## 3. Estado atual verificado

O projeto não parte do zero. Há uma base considerável e útil. O primeiro trabalho é estabilizá-la e reconciliar documentação, código e ambiente.

### 3.1 Já existe no repositório

- autenticação e cadastro de empresa;
- clientes, produtos e serviços;
- orçamento em etapas, itens, descontos, modelos visuais, PDF, compartilhamento e link público de aprovação;
- sete modelos permitidos de orçamento e três modelos de recibo;
- recibos, termos de garantia, conclusão de serviço, contratos e cláusulas editáveis;
- assinatura desenhada e aceite do cliente em partes do fluxo;
- ordens de serviço, agenda, equipe, organizações, membros e convites;
- equipamentos, histórico e QR;
- PMOC, contratos e versões em estágio parcial;
- dashboard, planos, créditos e cotas;
- doze calculadoras técnicas por ofício;
- diagnóstico assistido para HVAC;
- SQLite local, sincronização com Supabase, tombstones e importação/exportação básica;
- Worker para IA, transcrição de áudio, OpenRouter e controle de cota no servidor;
- painel administrativo, funções privilegiadas e trilha de auditoria em partes da plataforma;
- aplicativo Expo/React Native e painel web.

### 3.2 Existe, mas está parcial ou precisa de prova

| Área | Estado atual | Condição para considerar concluída |
|---|---|---|
| IA no Android | URL pública ausente no build de produção descrito no handoff | diagnóstico real, áudio e chat comprovados no APK atual em aparelho físico |
| Google no Android | configuração de OAuth incompleta | login e renovação de sessão comprovados em build assinado |
| Modelos gratuitos | lista inclui IDs possivelmente removidos | suíte autenticada PT-BR/JSON/latência/429 por modelo antes de alterar fallback |
| Logo e foto | URI local não acompanha outro aparelho/web/PDF | objeto em storage privado, RLS, cache e URL assinada comprovados |
| Cotas de IA | confirmação e autoridade variam por fluxo | servidor como autoridade, idempotência e mesma regra no web/mobile |
| Sync offline | LWW e iteração por tabela, sem outbox formal completa | matriz de conflito por domínio e testes adversariais em dois aparelhos |
| Escrita mobile/web | mobile espelha SQLite no cloud em best-effort; web grava diretamente no Supabase com mapeamentos próprios | contratos de domínio e protocolo de comando/versionamento compartilhados |
| Partição local | SQLite é separado por usuário, não por organização | partição por `(user_id, organization_id)`, seleção explícita e cursores independentes |
| Schema Supabase | migrations incrementais não recompõem integralmente as tabelas legadas | baseline schema-only versionado e banco limpo reproduzível em CI |
| Tipos de dados | há dinheiro em `REAL`, JSON consultável e conversão divergente de data de recibo | centavos inteiros + moeda, campos críticos normalizados e contrato de data ISO |
| Numeração | migration de unicidade pendente | migration versionada, tratamento de `23505` e concorrência comprovada |
| Equipe/RBAC | papéis básicos e owner-overlay | `organization_id`, capacidades granulares, revogação de sessão e testes RLS |
| PMOC/documentos | módulos existem, referências e UX estão incompletas | fontes atualizadas, RT, pacotes versionados, templates revisados e piloto HVAC |
| PDF/WhatsApp/OCR | suporte parcial | renderização reproduzível, integração oficial e confirmação humana de OCR |
| Pagamentos/admin | caminhos privilegiados sem prova completa ao vivo | sandbox, webhook, idempotência, ledger, auditoria e publicação autorizada |
| Webhooks | eventos são persistidos, mas parte do efeito ainda ocorre na requisição | validar, persistir e responder; processar por fila com lease, retry, DLQ e replay |
| Android público | release técnica separada de aceitação pública | trilha Alpha/testadores, aparelho físico da versão atual e gates da loja |
| Documentação | vários documentos refletem estados antigos | manifesto automatizado de capacidades e documentos reconciliados com o código |

### 3.3 Gap importante: ainda não existe uma calculadora econômica completa

As calculadoras atuais são técnicas — BTU, carga de refrigerante, diluição, tubulação, pintura, jardinagem e outras. Falta a calculadora que responde:

- quanto o serviço realmente custa;
- qual é o preço mínimo sustentável;
- qual preço alcança a margem desejada;
- quanto o desconto consome da margem;
- qual foi o custo e a margem reais depois da execução;
- como esse orçamento se compara ao histórico semelhante da própria empresa;
- com salvaguardas, como se posiciona em uma faixa agregada de mercado.

Esse motor é um dos pilares do novo produto.

### 3.4 Correção regulatória imediata

A **RE Anvisa nº 9/2003 foi revogada pela RDC nº 886/2024**. Qualquer texto, template, checklist ou promessa do OLLI que trate os antigos parâmetros da RE-9 como automaticamente vigentes deve ser congelado para revisão. A Lei nº 13.589/2018 e a Portaria GM/MS nº 3.523/1998 continuam referências estruturantes, mas o produto não poderá afirmar “conformidade automática”.

**Gate PMOC-LEGAL-01:** nenhum pack PMOC será comercializado como “conforme Anvisa” antes da revisão de fontes, do responsável técnico e da linguagem pública.

---

## 4. Público, papéis e trabalhos a resolver

### 4.1 Segmentos iniciais

1. técnico HVAC solo ou MEI;
2. pequena empresa HVAC com 2 a 10 técnicos;
3. empresa HVAC com contratos B2B e PMOC;
4. cliente final residencial;
5. síndico, facilities ou gestor de contrato;
6. responsável técnico;
7. prestadores adjacentes de elétrica, hidráulica, dedetização, jardinagem e pintura.

### 4.2 Jobs-to-be-done

| Pessoa | Trabalho que precisa concluir | Resultado esperado |
|---|---|---|
| Técnico solo | registrar um pedido e enviar orçamento sem interromper o serviço | rascunho revisável em menos de 2 minutos; envio no mesmo dia |
| Técnico em campo | registrar o que fez sem produzir relatório à noite | checklist, fotos, materiais, assinatura e resumo antes de sair do local |
| Dono | enxergar o que precisa decidir hoje | painel com atrasos, propostas sem retorno, pagamentos e contratos a vencer |
| Comercial | criar proposta clara, acompanhar e recuperar oportunidades | versões, opções, follow-up e motivo de ganho/perda |
| Despachante/gestor | colocar a pessoa certa no serviço certo | agenda, disponibilidade, habilidade, localização e SLA |
| Financeiro | receber e saber a margem do que foi executado | recebível, baixa, custo real, conciliação e recibo |
| Cliente | aprovar, acompanhar e reencontrar documentos | portal simples e seguro, sem criar conta obrigatória para cada ação |
| Gestor HVAC | controlar locais, equipamentos, contratos e visitas | ativo → plano → OS → evidência → relatório → renovação |
| Responsável técnico | revisar e congelar conteúdo técnico | versão, fonte, autoria, assinatura, hash e trilha completa |
| Administrador | controlar pessoas sem conhecer suas senhas | convite, papel, escopo, suspensão, revogação e auditoria |

---

## 5. Arquitetura de produto e navegação

### 5.1 Núcleo funcional comum

O núcleo horizontal será composto por treze domínios:

1. **Identidade e empresa:** organização, unidades, marca, equipe, funções e preferências.
2. **CRM operacional:** leads, clientes, contatos, locais e histórico.
3. **Catálogo e custos:** produtos, serviços, composições, fornecedores e listas de preço.
4. **Comercial:** orçamento, opções, aprovação, contrato, follow-up e motivo de perda.
5. **Operação:** agenda, despacho, OS, visitas, evidências, tempo, materiais e despesas.
6. **Ativos:** equipamentos, QR, localização, condição, garantia e histórico.
7. **Documentos:** modelos, contratos, laudos, relatórios, assinaturas e arquivo.
8. **Preço e finanças:** calculadora, margem, recebíveis, pagamentos, recibos e resultado simples.
9. **Recorrência:** planos, contratos, visitas futuras, reajustes e renovações.
10. **Inteligência:** recomendações, alertas, explicações e automações assistidas.
11. **Integrações e governança:** agenda externa, comunicação, pagamentos, exportação, privacidade e auditoria.
12. **Estoque e compras leves:** materiais, reservas por OS, veículos/depósitos, ferramentas, fornecedores e custo de reposição.
13. **Conhecimento e dicas:** orientação prática por ofício, fonte, versão, cursos curtos e ajuda contextual.

### 5.2 Navegação web proposta

```text
Visão geral

Comercial
├─ Caixa de oportunidades
├─ Clientes e contatos
├─ Locais de atendimento
├─ Orçamentos
├─ Follow-ups
└─ Catálogo

Operação
├─ Agenda e despacho
├─ Ordens de serviço
├─ Visitas
├─ Equipamentos e QR
├─ Estoque e ferramentas
├─ Checklists e evidências
└─ Recorrências

Documentos
├─ Central de documentos
├─ Modelos da empresa
├─ Contratos
├─ Relatórios e laudos
├─ Assinaturas
├─ Enviados/assinados
└─ Fontes e versões

Preços e finanças
├─ Calculadora de preço
├─ Composições e custos
├─ Livro de preços
├─ Recebíveis e pagamentos
├─ Recibos
└─ Margem e resultado

HVAC e PMOC
├─ Carteira PMOC
├─ Planos e periodicidades
├─ Equipamentos por ambiente
├─ Visitas e não conformidades
├─ Responsável técnico
└─ Pacotes documentais

Equipe
├─ Pessoas e convites
├─ Papéis e permissões
├─ Unidades/equipes
├─ Disponibilidade
└─ Auditoria operacional

Inteligência
├─ Assistente
├─ Recomendações
├─ Automações
├─ Conhecimento e dicas
├─ Indicadores
└─ Histórico de decisões da IA

Configurações
├─ Empresa e marca
├─ Numeração e documentos
├─ Verticais
├─ Integrações
├─ Dados e privacidade
├─ Plano e consumo
└─ Segurança
```

### 5.3 Navegação móvel por papel

O celular não deve reproduzir toda a barra lateral web. Ele deve privilegiar o trabalho do momento.

**Dono/gestor:** Hoje · Comercial · Criar · Agenda · Mais

**Técnico:** Hoje · Minhas OS · Escanear/Criar · Agenda · Mais

**Comercial:** Funil · Orçamentos · Criar · Clientes · Mais

O botão **Criar** será contextual: cliente, orçamento por voz/texto, OS, foto/evidência, equipamento por QR ou despesa. O papel e a permissão determinam as opções.

### 5.4 Central “Hoje”

Será a tela operacional mais importante. Deve mostrar ações, não somente gráficos:

- visitas e deslocamentos do dia;
- serviços atrasados ou sem conclusão;
- orçamentos visualizados sem resposta;
- contratos e PMOCs próximos do vencimento;
- cobranças vencidas;
- sincronização pendente ou conflito;
- documento aguardando revisão/assinatura;
- recomendação explicada da IA;
- botão para resolver cada item no contexto certo.

### 5.5 Personalização completa da empresa

Cada organização poderá configurar:

- nome, CNPJ/CPF quando aplicável, contatos e endereços;
- logo, cores, tipografia permitida, cabeçalho, rodapé, marca d'água e assinatura visual;
- dados bancários/Pix e condições de pagamento;
- numeração e prefixos por documento/unidade;
- modelos favoritos por tipo de cliente e serviço;
- cláusulas, garantias, validade, reajuste e textos padrão;
- campos adicionais controlados;
- catálogo, custos, impostos e margem desejada;
- papéis, unidades, equipes e responsáveis;
- canais e integrações;
- pacote vertical e ferramentas visíveis;
- idioma, fuso e formatos regionais quando a expansão exigir.

Personalização não permitirá remover avisos obrigatórios, falsificar tipo de assinatura ou sobrescrever evidências/auditoria.

---

## 6. Escopo funcional completo

### 6.1 Onboarding e configuração

- criação da organização e da unidade principal;
- consulta opcional de CNPJ por fonte autorizada, com entrada manual sempre disponível;
- escolha orientada do ofício principal e dos serviços;
- importação de clientes e catálogo por CSV/XLSX com prévia, validação e relatório de erros;
- configuração da marca e primeiro modelo;
- assistente para custos, hora produtiva, margem, impostos e condições;
- convite de equipe;
- checklist de ativação até o primeiro orçamento enviado;
- dados de demonstração isolados, removíveis e nunca misturados ao negócio real.

### 6.2 CRM e relacionamento

- lead/oportunidade separado de cliente confirmado;
- pessoa física/jurídica, contatos, local de cobrança e locais de serviço;
- equipamentos e contratos ligados ao local correto;
- origem do lead, necessidade, urgência, responsável e próxima ação;
- histórico único de orçamentos, OS, documentos, mensagens e pagamentos;
- campos personalizados com governança;
- deduplicação assistida;
- consentimentos e preferências de canal;
- motivos padronizados de ganho, perda e cancelamento.

### 6.3 Orçamentos e propostas

- seleção do tipo: visita técnica, instalação, manutenção avulsa, manutenção recorrente, contrato, corretiva, obra/projeto ou modelo da empresa;
- composição por serviços, produtos, kits, horas, deslocamento, equipamentos e opcionais;
- opções comparáveis: essencial, recomendada e premium, com escopo real diferente;
- modelos visuais com prévia web/mobile/PDF;
- editor controlado de seções, sem quebrar impressão e acessibilidade;
- identidade visual por empresa;
- validade, condições, cronograma, exclusões, garantia, impostos, sinal e parcelas;
- versão imutável a cada envio;
- aprovação, recusa, comentário, seleção de opção e trilha de visualização;
- conversão idempotente em contrato, OS e recebível;
- follow-up com data, consentimento e opt-out;
- motivo de perda e aprendizado posterior;
- comparação entre previsto e realizado após a execução.

### 6.4 Operação de campo

- OS originada de orçamento, contrato, chamado ou criação manual;
- visitas múltiplas por OS;
- agenda, responsável, equipe, habilidade, janela, SLA e prioridade;
- check-in/out com política clara e consentimento de localização;
- checklist versionado e adaptado ao equipamento/serviço;
- funcionamento offline para dados essenciais;
- fotos, vídeos curtos, áudio, anexos, leituras e assinatura;
- materiais, horas, despesas, deslocamento e observações;
- não conformidade e recomendação corretiva;
- aprovação do técnico e, quando exigido, do responsável técnico;
- resumo assistido pela IA, sempre revisável;
- conclusão que gera relatório e atualiza custo real, ativo e recorrência.

### 6.5 Agenda e despacho

- agenda dia/semana/mês e quadro de equipe;
- recorrência por regra e exceções;
- capacidade por técnico, unidade e habilidade;
- conflitos visíveis;
- janelas do cliente e tempo de deslocamento;
- arrastar/reagendar com auditoria;
- notificações configuráveis;
- sincronização com Google Calendar na primeira integração externa;
- Outlook/Microsoft 365 na onda seguinte;
- calendário do aparelho como conveniência, não como fonte canônica;
- recomendação de rota apenas após regras determinísticas e disponibilidade.

### 6.6 Portal do cliente

- link opaco, curto, revogável e com expiração configurável;
- aprovar/recusar orçamento, escolher opção e comentar;
- pagar sinal ou fatura quando pagamentos estiverem habilitados;
- acompanhar data/janela e estado da visita sem expor localização indevida;
- baixar documento, recibo e relatório autorizados;
- consultar equipamentos/contratos permitidos;
- solicitar novo serviço;
- confirmar execução e responder pesquisa curta;
- indicar a empresa;
- autenticação opcional para histórico persistente; ações simples continuam possíveis com link seguro.

### 6.7 Financeiro operacional

O OLLI não tentará substituir uma contabilidade completa na primeira entrega. Ele deverá fechar o ciclo operacional:

- sinal, parcelas e recebíveis;
- status de vencimento, baixa manual e conciliação por webhook;
- múltiplos meios de pagamento configuráveis;
- recibo claramente diferente de nota fiscal;
- contas a pagar simples originadas de compra/despesa, com aprovação e anexos;
- custos previstos e realizados;
- margem prevista e realizada;
- despesas por OS/contrato;
- visão de caixa operacional e resultado simples;
- exportação para contador;
- integração fiscal/municipal somente por adaptadores posteriores e por jurisdição.

### 6.8 Estoque, compras e ferramentas

Este será um controle operacional leve, integrado ao serviço, não um ERP industrial:

- materiais por depósito, veículo e técnico;
- saldo, mínimo, reserva para OS, consumo, devolução, ajuste e inventário;
- lote/série/validade quando o produto exigir;
- fornecedor, último custo, custo médio configurado e data da referência;
- solicitação e ordem de compra simples;
- recebimento que atualiza custo e estoque com auditoria;
- ferramenta/equipamento da empresa, responsável e check-in/out;
- sugestão de reposição baseada em agenda, contratos e histórico;
- consumo offline registrado na OS e conciliado pelo protocolo de sync;
- permissões para visualizar custo, ajustar saldo e aprovar compra;
- exportação para contabilidade/ERP quando necessário.

Não incluir contabilidade de estoque, fiscal ou MRP avançado sem demanda e integração validadas.

### 6.9 Equipe, contas e administração

Papéis iniciais:

- proprietário;
- administrador da organização;
- gestor;
- comercial;
- despachante/agenda;
- técnico;
- financeiro;
- responsável técnico;
- contador ou leitura;
- papel personalizado em fase posterior.

Escopos possíveis: toda a organização, unidade, equipe, atribuídos ao usuário ou somente próprios.

Capacidades serão explícitas, por exemplo:

```text
customer.read / customer.write
quote.create / quote.view_cost / quote.view_margin / quote.send
schedule.assign
workorder.execute / workorder.approve
document.create / document.send / document.sign_technical
payment.read / payment.manage
team.invite / team.change_role / team.suspend
integration.manage
audit.read
```

O administrador poderá convidar, reenviar convite, mudar função, suspender, reativar, revogar sessões e iniciar redefinição de senha. **Não poderá ver, escolher ou recuperar a senha existente de um funcionário.** O próprio usuário define a senha pelo fluxo seguro de autenticação.

Transferência de propriedade será um procedimento separado, reautenticado, auditado e protegido contra a remoção acidental do último proprietário.

Também haverá disponibilidade, apontamento de tempo, habilidades/certificações com validade, despesas para aprovação e produtividade operacional. Comissão poderá ser calculada por regra transparente e auditável. O OLLI não substituirá folha de pagamento nem fará vigilância invasiva; localização e produtividade terão finalidade, visibilidade e política claras.

### 6.10 Central de conhecimento e dicas

- conteúdo organizado por ofício, tarefa e nível de experiência;
- dicas de orçamento, preço, atendimento, execução, documentação, segurança e gestão;
- fontes oficiais/licenciadas, data, versão e revisor quando a orientação for técnica;
- cursos curtos, checklists e exemplos próprios do OLLI;
- pesquisa e favoritos offline para conteúdo essencial;
- ajuda contextual dentro de orçamento, OS, PMOC e documentos;
- assistente que responde citando a fonte e diferenciando regra, recomendação e opinião;
- alerta quando uma orientação foi substituída ou precisa de revisão;
- canal de sugestão da comunidade com moderação e revisão antes de publicar;
- nenhuma dica de IA substitui fabricante, profissional habilitado ou norma vigente.

### 6.11 Planos, cobrança do SaaS e direitos de uso

A embalagem comercial será validada, não definida por chute. A hipótese inicial é:

- entrada individual para alcançar o primeiro orçamento e provar valor;
- plano profissional para documentos, preço, recorrência e IA ampliada;
- plano equipe por organização, com membros, agenda, RBAC e auditoria;
- plano negócio para unidades, integrações, governança e volume;
- packs verticais/add-ons quando entregarem valor específico comprovado;
- créditos/limites de IA transparentes, com confirmação e proteção contra surpresa;
- armazenamento e retenção explicados;
- exportação dos dados da empresa independentemente do plano ativo, respeitando segurança;
- entitlement calculado no servidor, separado de papel/permissão e separado do financeiro do cliente final;
- mudança, cancelamento e inadimplência com estados seguros, grace period e recuperação, sem apagar silenciosamente dados.

Preço, limite e trial serão decididos depois de pesquisa de disposição a pagar, custo real de IA/storage/suporte e comportamento de coortes. Testes de cobrança permanecem em sandbox até autorização específica.

---

## 7. Pack HVAC e PMOC

### 7.1 Objetivo

Ser o pack mais completo do OLLI e resolver o ciclo B2C e B2B de climatização:

```text
local/ambiente
  → equipamento e QR
  → condição e histórico
  → plano/periodicidade
  → contrato e agenda
  → visita/checklist/medição/evidência
  → não conformidade e orçamento corretivo
  → relatório/pacote documental
  → recebimento, reajuste e renovação
```

### 7.2 Cadastro técnico de ativos

- cliente, local, prédio, setor e ambiente;
- tipo, marca, modelo, número de série e patrimônio;
- capacidade, tensão, fase, fluido refrigerante e carga quando conhecidos;
- datas de instalação, garantia e última intervenção;
- criticidade, operação e condição;
- documentos, manual/fonte e fotos;
- QR com token opaco e revogável, sem PII embutida;
- histórico de OS, peças, leituras, não conformidades e custos.

### 7.3 Contrato e carteira PMOC

- modalidade comercial, vigência, reajuste, escopo, SLA e exclusões;
- unidades, ambientes e ativos cobertos;
- periodicidades e exceções;
- responsável técnico, conselho, registro e documentos associados;
- geração controlada das visitas futuras;
- calendário de vencimentos, renovações e pendências;
- rentabilidade prevista/realizada por contrato;
- alertas de ativo sem plano, visita atrasada, evidência ausente e documento vencido;
- vínculo de não conformidade a orçamento corretivo.

### 7.4 Visita técnica e checklist

- checklist versionado por tipo de ativo/serviço;
- condição encontrada, tarefa executada e tarefa não aplicável com justificativa;
- leituras com unidade, método, equipamento de medição e horário;
- fotos antes/depois e anexos;
- material e tempo consumidos;
- risco, não conformidade, recomendação e prioridade;
- assinatura do técnico, cliente e RT conforme o documento;
- operação offline;
- bloqueio de conclusão quando evidência obrigatória estiver ausente;
- geração de relatório somente a partir de dados confirmados.

### 7.5 Pacote documental PMOC

O pacote será selecionável e poderá reunir:

- identificação do estabelecimento, ambientes e proprietário/responsável;
- inventário de equipamentos;
- plano e periodicidades vigentes;
- versão do contrato;
- responsável técnico e referências informadas;
- relatórios de visita;
- checklists, leituras e evidências;
- não conformidades e ações corretivas;
- anexos laboratoriais ou de terceiros;
- histórico de versões e assinaturas;
- fontes normativas e data de revisão.

O OLLI ajudará a organizar e verificar completude. Não emitirá ART, não substituirá profissional habilitado e não certificará automaticamente conformidade sanitária ou técnica.

### 7.6 IA em HVAC

- voz/texto/foto para rascunho de ativo, OS e orçamento;
- recuperação de códigos de erro a partir de base curada e versionada;
- perguntas de triagem e hipóteses ordenadas, nunca condenação automática de peça;
- alerta de inconsistência entre capacidade, ambiente e cadastro;
- resumo de visita e não conformidade;
- sugestão de próxima ação com fonte e nível de confiança;
- verificação de campos/evidências faltantes em documento;
- previsão de vencimento e risco de renovação;
- comparação do previsto com tempo/material real;
- recomendação de preço baseada primeiro no histórico da própria organização.

### 7.7 Fontes e revisão técnica do pack

- Lei nº 13.589/2018;
- Portaria GM/MS nº 3.523/1998;
- RDC nº 886/2024 e orientação atual da Anvisa;
- resoluções e orientações dos conselhos profissionais aplicáveis;
- normas ABNT apenas por acesso/licença e mapeamento autorizado;
- manuais e tabelas oficiais de fabricantes;
- responsável técnico identificado por template e versão.

O material técnico deverá ser revisado antes do piloto e periodicamente depois dele.

---

## 8. Packs dos demais ofícios

Um pack novo só entra quando cumprir todos os gates:

1. dor recorrente e comprador identificados;
2. ferramenta ou documento específico que gere valor real;
3. fonte oficial/licenciada e especialista para revisão;
4. canal de aquisição ou parceiros acessíveis;
5. pelo menos 70% de reuso do núcleo;
6. hipótese de retenção/receita mensurável;
7. capacidade de suporte sem prejudicar HVAC.

| Ordem proposta | Pack | Ferramenta-assinatura | Observação |
|---:|---|---|---|
| 1 | HVAC/Refrigeração | ativo/QR, PMOC, recorrência e pacote documental | foco e referência de qualidade |
| 2 | Elétrica | checklist/registro NR-10, APR e campo para RT/ART | não emitir ART nem afirmar habilitação |
| 3 | Hidráulica | ensaio de estanqueidade temporizado e laudo com evidência | regras editáveis pelo profissional |
| 4 | Dedetização | comprovante, produtos/registro/FDS, validade e recorrência | revisar exigências sanitárias aplicáveis |
| 5 | Jardinagem | contrato recorrente, rota e checklist por visita | regras municipais não serão generalizadas |
| 6 | Pintura | medição, consumo, memorial e termo de garantia | rendimento vinculado à ficha do fabricante |

Solar, marcenaria, TI, estética e outros permanecem em pesquisa até os gates serem cumpridos.

---

## 9. Central de documentos, contratos e assinaturas

### 9.1 Tipos iniciais

**Horizontais:** orçamento, proposta, contrato de serviço, OS, relatório de visita, termo de conclusão, termo de garantia, recibo, checklist, notificação, aditivo e distrato.

**HVAC:** inventário, ficha de ativo, plano PMOC, relatório por equipamento, não conformidade, corretiva, contrato de manutenção, renovação/reajuste e pacote PMOC.

**Verticais seguintes:** somente após revisão técnica e jurídica própria.

### 9.2 Editor de modelos

- blocos controlados em vez de HTML livre;
- cabeçalho, capa, cores, logo, rodapé e paginação;
- campos de empresa, cliente, local, ativo, orçamento, contrato e OS;
- tabelas, repetidores, condições e cláusulas;
- seções condicionais por tipo de serviço;
- prévia responsiva e prévia de impressão;
- histórico de versão, rascunho, revisão, aprovado, substituído e arquivado;
- permissão separada para editar, aprovar e publicar modelo;
- compatibilidade garantida pelo renderizador web/mobile/PDF;
- teste de snapshot visual e de quebra de página.

### 9.3 Registro obrigatório de fonte

```text
id
vertical
tipo_de_artefato
jurisdicao
url_oficial
identificador_e_versao
data_de_coleta
titular_e_licenca
status: vigente | revisar | substituida
responsavel_tecnico_ou_juridico
ultima_revisao
proxima_revisao
campos_obrigatorios
disclaimer
hash_do_template
```

### 9.4 Política para PDFs e modelos encontrados

- priorizar fontes governamentais, conselhos, fabricantes e material com licença explícita;
- pesquisar modelos de mercado para entender estrutura, nunca copiar texto proprietário;
- não redistribuir conteúdo pago de ABNT/NBR;
- preservar URL, data, licença e hash do arquivo coletado;
- modelos oficiais com licença “sem derivações” podem ser referenciados/armazenados conforme a licença, mas não adaptados e revendidos livremente;
- texto final do OLLI será próprio e revisado;
- não prometer validade universal de contrato ou laudo;
- usuário escolhe jurisdição e profissional responsável quando aplicável.

### 9.5 Documento gerado e enviado

Cada emissão terá:

- ID e número legível;
- organização e versão do template;
- snapshot dos dados usados;
- arquivo/objeto imutável;
- hash criptográfico;
- autor e aprovadores;
- horário confiável;
- destinatário e canal;
- eventos de entrega/visualização;
- aceite/assinatura e evidências;
- relação com orçamento, contrato, OS, ativo e pagamento;
- retenção e controle de acesso;
- correção somente por nova versão/aditivo/estorno.

### 9.6 Níveis de assinatura

1. **Aceite simples:** identidade declarada, evento, data e evidências do fluxo.
2. **Assinatura eletrônica avançada:** identidade e integridade verificáveis por provedor/fluxo adequado.
3. **Assinatura qualificada ICP-Brasil:** integração específica quando exigida.

Assinatura desenhada na tela não será chamada de ICP-Brasil. A interface explicará o nível utilizado e suas evidências.

---

## 10. Motor de precificação e inteligência comercial

### 10.1 Princípio

O sistema não deve responder apenas “quanto os outros cobram”. Ele deve responder, de forma explicável:

1. quanto custa executar este serviço;
2. abaixo de qual preço a empresa perde sustentabilidade;
3. qual preço alcança a margem escolhida;
4. como risco, garantia, prazo, urgência e condição de pagamento alteram o preço;
5. como serviços semelhantes da própria empresa foram orçados e realizados;
6. qual foi a taxa de aprovação em faixas comparáveis;
7. somente depois, e com fortes salvaguardas, em qual faixa agregada de mercado o valor está.

### 10.2 Entradas da calculadora

**Mão de obra**

- remuneração mensal ou custo por hora;
- encargos e benefícios configuráveis;
- horas disponíveis e horas realmente faturáveis;
- quantidade de pessoas e tempo estimado;
- adicional de urgência, noturno ou risco quando aplicável.

**Materiais e equipamentos**

- custo de compra;
- frete, imposto, perda/quebra e margem de segurança;
- consumo por serviço;
- aluguel, depreciação ou custo de uso de ferramenta/equipamento;
- fornecedor e data do custo.

**Operação**

- deslocamento, combustível, pedágio e estacionamento;
- terceiros/subcontratados;
- descarte e logística reversa;
- reserva de garantia e retrabalho;
- custo de aquisição/comissão;
- despesas fixas rateadas;
- taxas de pagamento e impostos configurados com contador.

**Comercial**

- margem-alvo;
- desconto;
- prazo de pagamento e custo financeiro;
- risco/complexidade;
- escopo, exclusões, garantia e SLA;
- valor percebido e criticidade, registrados como decisão humana e não como fórmula oculta.

### 10.3 Fórmulas mínimas

```text
custo_hora_produtiva =
  (remuneracao + encargos + beneficios + rateio_fixo_mensal)
  / horas_produtivas_faturaveis

custo_total =
  mao_de_obra
  + materiais_com_frete_e_perdas
  + deslocamento
  + terceiros
  + uso_de_equipamentos
  + despesas_variaveis
  + rateio_fixo
  + reserva_de_garantia_e_retrabalho

preco_alvo =
  custo_total
  / (1 - impostos - taxas - comissao - margem_alvo)

margem_real =
  (receita_liquida - custo_real) / receita_liquida
```

O sistema bloqueará denominador menor ou igual a zero, percentuais impossíveis, custo ausente crítico e moeda/unidade incompatível. Impostos, encargos e tratamento contábil nunca serão presumidos como iguais para todas as empresas.

### 10.4 Saídas para o prestador

- custo estimado total e por componente;
- preço mínimo operacional;
- preço-alvo;
- preço com contingência;
- margem em reais e percentual;
- impacto de cada desconto;
- cenários essencial, recomendado e premium;
- comparação com histórico próprio semelhante;
- confiança da comparação e quantidade de casos;
- alerta de dado ausente ou custo desatualizado;
- explicação simples: “o que puxou este valor para cima ou para baixo”;
- comparação posterior entre previsto e realizado.

O usuário poderá simular livremente, mas o valor final só entrará no orçamento quando for confirmado.

### 10.5 Evolução da inteligência de preço

**Nível 1 — cálculo determinístico:** custo, margem, imposto, desconto e cenários.

**Nível 2 — histórico próprio:** propostas semelhantes, aceitas/recusadas, tempo/material real, retrabalho e margem.

**Nível 3 — previsão própria:** probabilidade de aprovação e risco de margem, sempre com explicação e intervalo.

**Nível 4 — referência coletiva protegida:** faixa estatística agregada, somente após os gates legais e técnicos abaixo.

### 10.6 Salvaguardas para comparação entre empresas

Dados de preço recentes, individualizados ou desagregados entre concorrentes são comercialmente sensíveis. Portanto, a plataforma não deverá trocar nem induzir alinhamento de preços. O benchmark coletivo, se aprovado, obedecerá a todos estes requisitos:

- participação separada e informada; não usar dados entre organizações por padrão;
- processamento independente e isolado dos bancos operacionais;
- finalidade específica e documentada;
- ausência de nome de empresa, cliente, endereço detalhado ou concorrente;
- atraso temporal suficiente; nada “em tempo real”;
- agrupamento por serviço normalizado, região ampla, porte e contexto;
- número mínimo de observações **e** de organizações independentes;
- supressão de grupos esparsos e combinações reidentificáveis;
- percentis/medianas robustos e proteção contra outliers/manipulação;
- exibição descritiva de faixa, amostra, recência e confiança;
- jamais recomendar “iguale/cobre o mesmo que os demais”;
- custos e histórico próprio continuam primários;
- opt-out e eliminação conforme a finalidade;
- revisão formal por especialista em LGPD e direito concorrencial;
- logs e monitoramento contra tentativa de inferir um concorrente específico.

Parâmetros técnicos iniciais para desenhar o piloto — sujeitos a parecer jurídico, LGPD e validação estatística — serão: pelo menos **90 dias de defasagem**, **20 organizações independentes**, **100 observações válidas** e nenhuma organização com mais de **10% do peso efetivo** da coorte. Não retornar `mínimo`, `máximo`, ranking, exemplo de empresa, texto livre ou contagem que permita reconstruir um participante. Esses números são piso de engenharia para estudo, não autorização de lançamento.

**Gate PRICE-BENCH-01:** sem parecer concorrencial e de proteção de dados, o OLLI entrega apenas cálculo e inteligência da própria organização.

**Gate PRICE-BENCH-02:** um grupo que não alcance os limiares de privacidade retorna “dados insuficientes”, nunca uma estimativa inventada.

**Gate PRICE-BENCH-03:** nenhuma informação bruta de preço de uma empresa é acessível por outra, por administradores comuns ou por modelos de IA.

### 10.7 Livro de preços e composição

- serviço base + variantes por equipamento/capacidade/complexidade;
- kit de materiais e tempo padrão;
- custo vigente e histórico de custo;
- preço por unidade/unidade de medida;
- fornecedor e validade da referência;
- margem por canal/cliente quando autorizada;
- ajuste em massa com prévia;
- importação/exportação auditável;
- publicação por unidade/equipe;
- versionamento para que um orçamento antigo mantenha seus custos e preços originais.

### 10.8 Dataset próprio, cold start e vieses

`price_observations` será derivado de eventos comerciais com lineage até a linha original. Guardará valores em centavos, moeda, taxonomia do serviço, contexto do ativo, complexidade, urgência, região em bucket amplo, data, preço ofertado, desconto, estado aprovado/recusado/pago, margem e versão do orçamento.

Sem histórico suficiente, a orientação usa custo + margem-alvo, catálogo da própria empresa e referências públicas permitidas, sempre com confiança baixa. Não haverá falsa afirmação de “preço de mercado”.

O motor medirá vieses de sobrevivência dos aprovados, motivos ausentes nos recusados, mistura de peça/mão de obra, urgência, deslocamento, garantia, sazonalidade, inflação, regime tributário, promoções e concentração de uma empresa/região. Recomendação estruturada de preço usa SQL/views versionadas e estatística explicável; embeddings não são ferramenta de cálculo.

---

## 11. Inteligência artificial em toda a plataforma

### 11.1 O significado de “IA em tudo”

Não significa chamar um modelo em toda tela. Significa que, em cada decisão repetitiva, o OLLI escolhe a tecnologia mais confiável nesta ordem:

```text
regra determinística
  → recuperação de dado autorizado e fonte curada
  → recomendação estatística explicável
  → geração por modelo
  → revisão/decisão humana
```

Uma soma, imposto, permissão, vencimento ou máquina de estados não será delegado a LLM. Modelos servem para entender linguagem, extrair, resumir, classificar, explicar e rascunhar.

### 11.2 Mapa de IA por fluxo

| Fluxo | Uso da IA | Fonte/regra | Gate humano |
|---|---|---|---|
| Onboarding | explicar configuração e sugerir vertical | CNPJ/CNAE autorizado + regras | usuário confirma |
| Pedido | converter texto/áudio em lead/OS | mensagem fornecida + schema | prévia antes de salvar/enviar |
| Orçamento | rascunhar itens, resumo e escopo | catálogo/custos da empresa | valor e envio confirmados |
| Preço | explicar custo, anomalia e histórico | motor determinístico + fatos próprios | prestador escolhe preço |
| Diagnóstico HVAC | triagem e hipóteses | base técnica versionada | técnico testa e decide |
| Foto/placa | OCR de campos candidatos | visão + validação de formato | usuário confirma campos críticos |
| Agenda | priorização e sugestão | SLA, disponibilidade, mapa | gestor atribui/reagenda |
| OS | resumo e checklist sugerido | serviço, ativo e modelo curado | técnico revisa |
| PMOC | completude, pendência e rascunho | fonte versionada | RT aprova conteúdo técnico |
| Contrato | rascunho de cláusula/opção | biblioteca aprovada | revisão humana/jurídica |
| Cobrança | priorizar e sugerir texto | vencimento, consentimento e canal | aprovação inicial e opt-out |
| Suporte | resposta citada | base de ajuda do OLLI | escalonamento humano |
| Gestão | narrativa e anomalias | KPIs determinísticos | gestor decide ação |

### 11.3 Registro de tarefas de IA

Cada capacidade terá configuração independente:

```text
task_id e versao
risco: baixo | medio | alto | proibido
dados_permitidos
fontes_permitidas
schema_de_entrada_e_saida
modelo_e_fallbacks
timeout
limite_de_tokens_e_creditos
regra_de_redacao
validadores_do_dominio
exigencia_de_confirmacao
metrica_de_qualidade
kill_switch
```

Isso permite trocar OpenRouter, Workers AI, OpenAI direto, Cloudflare AI Gateway ou outro provedor sem alterar a regra de negócio.

### 11.4 Estratégia de modelos gratuitos

Modelos gratuitos do OpenRouter serão tratados como **beta e baixo volume**, não como SLA de produção. A disponibilidade, a fila e os limites mudam. Antes de habilitar um modelo:

**Nomenclatura:** a rota gratuita atual é do agregador OpenRouter. Ela não deve ser anunciada como “API gratuita oficial da OpenAI”, mesmo que algum modelo tenha nome de outra empresa. Uma futura API direta da OpenAI, Cloudflare ou outro fornecedor entrará pelo mesmo adaptador e terá orçamento/política próprios.

1. confirmar que o ID existe;
2. testar PT-BR e domínio;
3. testar JSON/schema e validação;
4. medir p50/p95, 429, 5xx e timeout;
5. medir taxa de correção humana;
6. revisar política do provedor e coleta de dados;
7. promover por feature flag;
8. manter formulário/manual e base offline como fallback.

O fallback será usado para erros transitórios definidos, não para “tentar modelos até algum inventar uma resposta”. Áudio continuará separado do texto quando isso reduzir exposição e custo. Modelos mortos no código atual só serão substituídos após teste autenticado não produtivo.

### 11.5 Aprendizado com os dados

O ciclo será:

```text
evento operacional confiável
  → fato canônico por organização
  → atributos e indicadores versionados
  → recomendação
  → usuário aceita, altera ou rejeita
  → resultado real do serviço/venda
  → avaliação de qualidade e melhoria da regra/modelo
```

Dados úteis incluem tempo real, material consumido, custo, preço, margem, aprovação, motivo de perda, retrabalho, equipamento, região ampla e tipo de serviço. Só entram no aprendizado quando tiverem definição, origem, qualidade e permissão conhecidas.

O OLLI **não treinará indiscriminadamente um modelo com todos os documentos e clientes**. Por padrão:

- personalização usa somente o tenant atual;
- RAG usa conteúdo autorizado e filtrado por RLS;
- dados brutos não atravessam organizações;
- prompts completos com PII não ficam em logs analíticos;
- telemetria registra tarefa, versão, modelo, latência, tokens, código de resultado, fontes e feedback, de forma minimizada;
- qualquer aprendizado coletivo usa pipeline separado e aprovado;
- conteúdo externo, PDF e mensagem são dados não confiáveis e nunca instruções do sistema.

### 11.6 Qualidade e avaliação de IA

- conjunto dourado em português por fluxo e vertical;
- casos comuns, adversariais e ambíguos;
- validade do schema = 100% no caminho publicado;
- valores/IDs inexistentes = bloqueio, não autocorreção silenciosa;
- taxa de aceitação sem edição por tarefa;
- severidade das correções;
- citação/recuperação correta para conteúdo técnico;
- custo, latência e disponibilidade;
- testes de prompt injection e exfiltração;
- comparação com fluxo manual;
- canário e rollback por tarefa/tenant;
- revisão periódica de modelos gratuitos que podem desaparecer.

**Gate AI-HIGH-01:** IA de alto risco não envia contrato, laudo, diagnóstico definitivo, preço final, pagamento ou mensagem externa sem aprovação humana.

**Gate AI-PRIV-01:** nenhuma tarefa é publicada sem lista explícita de dados permitidos e política de retenção.

**Gate AI-OPS-01:** todo fluxo assistido mantém alternativa manual funcional.

### 11.7 Recuperação, memória e cache

- recuperação estruturada por SQL deve ser preferida para preço, equipamento, cliente e histórico;
- FTS/trigram devem ser medidos antes de introduzir embeddings;
- embeddings só entram quando demonstrarem ganho de recall, com modelo/versão, hash, ACL e reindexação idempotente;
- corpus global HVAC e corpus da organização são fisicamente/logicamente distinguíveis;
- `organization_id` vem da sessão validada, nunca é aceito como autoridade do prompt;
- exclusão/alteração de uma fonte invalida chunks, vetores e cache relacionados;
- contexto de conversa é curto e descartável;
- preferência durável é explícita, editável e removível;
- fato derivado guarda fonte, confiança, versão e expiração;
- conversa bruta não vira memória permanente implícita;
- chave de cache inclui organização, tarefa, hash normalizado, versões de prompt/schema/conhecimento e política de roteamento;
- toda resposta em cache informa proveniência e validade.

---

## 12. Arquitetura de dados e multiempresa

### 12.1 Modelo de domínio alvo

**Identidade e tenancy**

```text
organizations
branches
memberships
roles
permissions
role_permissions
member_scopes
devices
sessions/revocations
```

**Comercial**

```text
leads
customers
contacts
service_locations
catalog_items
cost_snapshots
price_books
quotes
quote_versions
quote_options
quote_items
quote_events
public_links
```

**Operação e ativos**

```text
assets
asset_events
work_orders
visits
assignments
checklist_templates
checklist_versions
checklist_answers
evidence
time_entries
material_usages
expenses
nonconformities
schedules
recurrence_rules
```

**Documentos e contratos**

```text
document_templates
template_versions
source_registry
generated_documents
document_events
signatures
contracts
contract_versions
contract_renewals
```

**Financeiro**

```text
receivables
payables
payment_attempts
payments
refunds
ledger_entries
receipts
webhook_events
```

**PMOC**

```text
pmoc_plans
pmoc_plan_versions
pmoc_assets
pmoc_rules
pmoc_visits
technical_responsibilities
lab_attachments
technical_approvals
```

**Dados, IA e integrações**

```text
domain_events
outbox_events
sync_cursors
analytics_facts
ai_executions
ai_feedback
ai_evaluations
integration_accounts
integration_mappings
integration_webhook_events
consents
privacy_requests
```

**Estoque, fornecedores e conhecimento**

```text
stock_locations
stock_items
stock_movements
stock_reservations
suppliers
purchase_orders
company_tools
tool_assignments
knowledge_sources
knowledge_articles
knowledge_versions
knowledge_reviews
```

Assinatura/cobrança do SaaS, créditos de IA e pagamentos feitos pelo cliente final pertencem a ledgers e responsabilidades diferentes; nunca serão misturados no mesmo saldo.

### 12.2 Arquitetura técnica convergente

O problema central a resolver não é apenas “sincronizar mais tabelas”. Hoje o mobile trata SQLite como verdade operacional e espelha alterações no cloud; a web trata Supabase como verdade imediata. Os dois clientes não passam necessariamente pela mesma unidade transacional, validação ou versão. O alvo é:

```text
Mobile Expo                         Web React
    │                                  │
    ├── contratos de domínio comuns ───┤
    │                                  │
SQLite por usuário+organização         cache de interface
+ outbox + cursor                      │
    │                                  │
    └──── API/RPC de comandos e sync ──┘
                       │
                Supabase/Postgres
         organization_id + RLS + version
         change_log + idempotency + outbox
             │                         │
       filas de integração          gateway de IA
```

Mutações de web, mobile e integrações devem obedecer à mesma máquina de estados e às mesmas precondições. Leituras podem ser otimizadas por plataforma, mas autorização e invariantes continuam no servidor.

| Classe de dado | Verdade durável | Réplica/cache | Regra |
|---|---|---|---|
| identidade, organização e permissão | Postgres/Auth | sessão/cache curto | cliente nunca decide autorização sozinho |
| cliente, orçamento, OS, ativo e PMOC | Postgres após ACK | SQLite operacional | distinguir pendente, sincronizado, conflito e falha |
| documento/assinatura/comprovante | Postgres + storage privado | cache local | imutável; correção cria versão |
| arquivo, foto, logo e PDF | storage privado + metadata/hash | cache/upload local | upload possui outbox própria |
| integração e webhook | Postgres/inbox/outbox | nenhuma verdade no cliente | segredo somente backend; efeito assíncrono |
| conhecimento HVAC | corpus global versionado | FTS/cache | proveniência e vigência |
| conhecimento da empresa | Postgres/storage com tenant | índice tenant-scoped | nunca recuperável por outro tenant |
| analytics | fatos derivados/warehouse controlado | fila temporária | nunca substitui o registro operacional |
| benchmark coletivo | zona agregada isolada | somente agregado elegível | app comum não lê contribuições brutas |

Antes de migrations estruturais, será criado um **baseline schema-only** das tabelas legadas. Um banco vazio deve ser recriável exclusivamente pelo repositório e a CI deve detectar drift.

Convenções obrigatórias por entidade, quando aplicáveis:

- UUID/ULID técnico estável, separado de número legível;
- `organization_id`, `created_by`, `updated_by` e `version bigint`;
- `created_at/updated_at` definidos pelo servidor;
- `deleted_at` e evento de exclusão quando houver soft delete;
- `schema_version` em payloads versionados;
- dinheiro em centavos inteiros e `currency`, não ponto flutuante;
- status validado por máquina de estados;
- `source/external_id` em integração;
- unicidade iniciando por `organization_id`;
- JSON apenas para conteúdo realmente documental; campos filtrados, protegidos ou medidos devem ser normalizados.

### 12.3 Organização como chave real

O desenho atual utiliza, em partes, um overlay no qual dados da organização são associados ao `user_id` do proprietário. Isso foi útil na evolução inicial, mas não é uma base suficiente para equipe, transferência de propriedade, unidade, auditoria e colaboração madura.

O alvo é `organization_id` de primeira classe em toda entidade compartilhada, com `created_by`, `updated_by` e escopo separados.

Todo usuário atual receberá uma organização pessoal quando necessário. O usuário escolherá explicitamente a organização ativa; escolher silenciosamente a associação mais antiga fica proibido. No mobile, a partição local e seus cursores passam a ser `(user_id, organization_id)`. Trocar de organização encerra a conexão/worker anterior, limpa caches relacionados e abre somente a partição correta.

### 12.4 Migração sem big bang

1. **Baseline e inventário:** mapear tabelas, views, funções, RLS, RPCs, storage e código que dependem de `user_id/owner_user_id`; comprovar que um banco limpo sobe por migrations.
2. **Organização pessoal:** criar/reconciliar uma organização para cada proprietário atual e preservar o mapeamento.
3. **Introdução aditiva:** criar `organization_id` anulável, `created_by/updated_by/version`, índices parciais e FKs inicialmente `NOT VALID`, sem remover colunas antigas.
4. **Backfill determinístico:** converter owner/membership atual em organização, com relatório de órfãos/ambiguidade; nada é atribuído por aproximação.
5. **Dupla leitura controlada:** feature flag prefere o campo novo, com fallback antigo instrumentado e contado.
6. **Dupla escrita idempotente:** novas alterações preenchem ambos os caminhos durante a transição.
7. **RLS dupla temporária:** políticas aceitam linhas migradas e legadas sem ampliar acesso.
8. **Organização ativa nos clientes:** web/mobile tornam a seleção explícita e isolam caches/SQLite.
9. **Validação:** zero órfão, zero fallback na janela, contagens, hashes/amostras, invariantes e testes cross-tenant.
10. **Corte:** validar FKs, criar unicidade por tenant e tornar `organization_id` obrigatório.
11. **Retirada:** remover overlay e funções antigas somente após duas versões de clientes compatíveis, janela de observação e restore/rollback testado.

Cada etapa terá migration versionada, plano de rollback e prova em ambiente não produtivo. Até o corte, uma flag poderá restaurar a leitura legada sem apagar o backfill. Depois do corte, rollback é uma nova migration forward de compatibilidade, nunca um desfazer destrutivo. Nunca editar a base de produção diretamente para “ajustar dados”.

### 12.5 Regras de RLS

- RLS habilitada em toda tabela exposta;
- acesso baseado em membership ativa, organização e capacidade;
- escopo de unidade/equipe/atribuição no servidor, não somente na interface;
- `service_role` somente em ambiente de servidor;
- funções `SECURITY DEFINER` mínimas, com `search_path` seguro e testes específicos;
- storage usa a mesma identidade/organização e paths não adivinháveis;
- public link acessa somente uma projeção específica, nunca a tabela bruta;
- revogação de membership prevalece sobre estado offline;
- plataforma/admin global separado de papel administrativo do tenant;
- toda função privilegiada gera auditoria imutável.

### 12.6 Classificação dos dados

| Classe | Exemplos | Regra mínima |
|---|---|---|
| Pública | página comercial, ajuda publicada | cache e integridade |
| Interna | catálogo genérico, configurações não sensíveis | autenticação e organização |
| Confidencial | custos, margens, clientes, contratos, agenda | RLS, minimização, criptografia e auditoria |
| Restrita | assinatura, documentos pessoais, tokens, localização precisa, chaves | acesso mínimo, retenção curta/definida, alerta e revisão |

Custos e margens merecem capacidade própria: um técnico pode executar a OS sem visualizar margem ou custo de compra.

### 12.7 Qualidade, retenção e portabilidade

- dicionário de dados e owner por domínio;
- validações de formato e invariantes no banco;
- timestamps e fuso consistentes;
- soft delete/tombstone com política de retenção;
- exportação legível da organização;
- fluxo de correção, anonimização e eliminação quando aplicável;
- backup automatizado e restore testado;
- anexos com checksum, tipo real, antivírus/varredura e limites;
- dados de analytics derivados nunca substituem o fato operacional;
- retenção distinta para negócio, auditoria, segurança e IA.

---

## 13. Sincronização offline-first

### 13.1 Semântica de verdade

- **Servidor:** canônico para estado compartilhado já aceito e visível à organização.
- **Dispositivo:** autoridade temporária para comandos e evidências criados offline e ainda pendentes.
- **Outbox:** fila durável que representa intenção; a sincronização é “pelo menos uma vez” com idempotência, não uma promessa irreal de transporte exatamente uma vez.
- **UI:** sempre exibe sincronizado, pendente, falhou, bloqueado ou em conflito.

### 13.2 Evento mínimo da outbox

```text
operation_id
organization_id
actor_id
device_id
aggregate_type
aggregate_id
command_type
base_server_version
payload_schema_version
payload_minimizado_ou_referencia
created_at_device
attempt_count
next_attempt_at
last_error_code
idempotency_key
correlation_id
status: pending | sending | acked | conflict | failed
```

A operação de negócio e sua outbox são gravadas na mesma transação SQLite. O agregado local mantém `sync_state`, `base_server_version`, `local_revision` e `last_operation_id`. O servidor autentica, resolve membership/capacidade, valida schema e versão, confere idempotência, aplica a máquina de estados, incrementa `version`, grava `change_log/domain_outbox` na mesma transação e devolve ACK com `server_version/server_seq`. Repetir o mesmo `operation_id` não repete o efeito.

### 13.3 Matriz de conflitos

| Tipo de dado | Estratégia |
|---|---|
| evento aditivo, foto, apontamento | anexar/idempotência |
| campo simples de cliente | merge por campo e conflito visível quando ambos alteraram |
| status de OS/orçamento | máquina de estados + versão esperada/precondição |
| orçamento enviado | append-only; alteração cria nova versão |
| contrato/documento assinado | imutável; somente aditivo/correção formal |
| financeiro/ledger | evento compensatório/estorno; nunca LWW |
| permissão/membership | servidor vence; usuário revogado não envia novos dados |
| exclusão | tombstone versionado e retenção definida |
| numeração legível | reserva/atribuição no servidor; ID técnico permanece independente |

LWW poderá ser usado apenas em campos de baixo risco deliberadamente classificados; não será regra universal.

### 13.4 Testes obrigatórios

- dois aparelhos editando o mesmo registro offline;
- mais de 90 dias sem sincronizar;
- login/logout e troca de organização com fila pendente;
- membership revogada enquanto aparelho está offline;
- upload interrompido e retomado;
- clock incorreto no dispositivo;
- evento repetido, fora de ordem e parcialmente processado;
- documento criado em conflito;
- exclusão versus edição;
- migração de schema com outbox antiga;
- reinstalação/restauração do aparelho;
- conflito recuperável pelo usuário sem suporte técnico;
- ausência de perda após crash durante commit.

**Gate SYNC-01:** nenhuma expansão de equipe será considerada pronta sem teste E2E de dois dispositivos.

**Gate SYNC-02:** documentos e transações financeiras não usam LWW.

**Gate SYNC-03:** a tela “Central de sincronização” permite entender e resolver falhas.

### 13.5 Pull incremental, tombstones e numeração

`change_log` terá sequência monotônica por organização. Cada partição local guarda `last_server_seq`; páginas são aplicadas em transação e o cursor só avança depois do commit. Realtime pode acordar o pull, mas não substitui o cursor. Se o cursor ficar mais antigo que a retenção, o servidor retorna `cursor_too_old` e exige full resync seguro.

Tombstone mantém `deleted_at`, `deleted_by` e `version`. Só pode ser compactado depois que dispositivos ativos avançaram e a janela de segurança terminou; aparelho abandonado além da janela perde o delta e executa full resync. Arquivo físico só é removido após retenção e ausência de referência.

O ID técnico é UUID/ULID e nunca depende do número mostrado. A numeração terá estados `provisional`, `reserved` e `final`. Draft offline pode receber número final no servidor ou de um bloco reservado; documento enviado, assinado, cobrado ou fiscal jamais é renumerado silenciosamente. A migration de unicidade pendente só entra após esse protocolo.

### 13.6 Migração domínio a domínio

O novo sync entra em shadow mode e substitui o legado nesta ordem: clientes → produtos/serviços → agenda → orçamentos/versões → OS/checklists → equipamentos → PMOC → recibos/pagamentos → anexos. Um domínio só avança quando tiver contract tests, conflito tipado, pull incremental, idempotência, compatibilidade web/mobile e rollback. O full-scan atual permanece como compatibilidade temporária e é removido ao final, não reescrito de uma vez.

---

## 14. Segurança, privacidade e modelo de ameaças

### 14.1 Ativos críticos

- dados e contatos de clientes;
- custos, margens e estratégias comerciais;
- documentos, contratos e assinaturas;
- fotos, localização, equipamentos e histórico técnico;
- dados de funcionários e permissões;
- pagamentos e eventos financeiros;
- tokens de sessão, integrações e webhooks;
- base técnica e fontes;
- agregados de mercado e avaliações de IA;
- trilha de auditoria, backups e arquivos exportados.

### 14.2 Fronteiras de confiança

```text
Aplicativo + SQLite
        ↕ internet instável
Web/browser ↔ API/Worker ↔ Supabase/Postgres/Storage
                         ↔ provedores de IA
                         ↔ agenda/e-mail/WhatsApp/mapas
                         ↔ pagamentos/assinatura
                         ↔ observabilidade e analytics
```

Toda fronteira exige autenticação, autorização, minimização e validação própria. A interface nunca é autoridade de segurança.

### 14.3 Ameaças prioritárias e controles

| Ameaça | Cenário | Controles principais |
|---|---|---|
| vazamento entre empresas | ID trocado, RLS incompleta ou função privilegiada ampla | `organization_id`, membership, deny-by-default, testes cross-tenant, revisão de RPC |
| escalada de privilégio | técnico chama endpoint de admin | capacidade no servidor, reautenticação, auditoria e testes negativos |
| sessão revogada offline | ex-funcionário mantém dados ou envia mudanças | expiração, revogação server-wins, bloqueio da outbox e limpeza segura do cache |
| link/QR enumerável | terceiros acessam cliente/documento | token opaco de alta entropia, escopo, expiração, revogação, rate limit |
| storage exposto | URL pública ou path previsível | bucket privado, RLS, URL assinada, checksum e autorização por objeto |
| adulteração documental | PDF muda após aceite | snapshot, hash, versão imutável, evento de correção/aditivo |
| replay de webhook | pagamento ou assinatura duplicados | assinatura do provedor, timestamp, idempotência e ledger |
| prompt injection | PDF/manual/mensagem tenta comandar a IA | conteúdo como dado, delimitação, ferramentas autorizadas, schema e revisão |
| exfiltração para IA | PII/custos enviados sem necessidade | redaction, allowlist de campos, provider policy, sem prompt bruto em log |
| reidentificação de benchmark | grupo pequeno revela concorrente | limiar, atraso, supressão, agregação, análise de risco contínua |
| coordenação de preço | algoritmo conduz empresas a preço comum | benchmark descritivo, custo próprio primário, revisão concorrencial e monitoramento |
| conflito offline | documento/financeiro sobrescrito | outbox, versões e regras específicas por domínio |
| upload malicioso | arquivo disfarçado ou enorme | tipo real, tamanho, scanning, isolamento e renderização segura |
| segredo no cliente/log | chave de IA/service role exposta | secrets server-side, rotação e redaction de logs |
| supply chain | dependência comprometida | lockfile, revisão, scanner, provenance e atualização controlada |

### 14.4 Requisitos de autenticação

- e-mail/senha e provedores autorizados;
- MFA para proprietário, administrador e ações críticas quando disponível;
- recuperação de conta segura;
- sessões listáveis e revogáveis;
- reautenticação para transferência de propriedade, integração, exportação total e ações financeiras;
- rate limit, proteção contra abuso e alertas;
- senha nunca armazenada ou exibida pelo OLLI;
- convites gerados no servidor;
- política para aparelhos compartilhados e limpeza de dados locais.

### 14.5 LGPD por design

- mapa de dados, agentes de tratamento, finalidade e base legal por processo;
- minimização desde formulário e prompt;
- transparência sobre IA, provedores e decisões assistidas;
- consentimento quando ele for a base adequada, sem usá-lo como solução universal;
- canal para acesso, correção, portabilidade e eliminação conforme aplicabilidade;
- contratos e avaliação de operadores/suboperadores;
- retenção e descarte definidos;
- processo de incidente e notificação;
- privacy impact assessment para localização, IA, benchmark e integrações;
- anonimização tratada como processo de risco, não como garantia absoluta;
- separar telemetria de produto de dados operacionais e comerciais.

### 14.6 Gates de segurança

- **SEC-01:** zero acesso cross-tenant em suíte automatizada e revisão independente.
- **SEC-02:** RLS em toda tabela/storage exposto; `service_role` nunca no cliente.
- **SEC-03:** ações privilegiadas e financeiras auditadas e idempotentes.
- **SEC-04:** restore comprovado, não somente backup configurado.
- **SEC-05:** ameaça e privacidade revisadas antes de nova integração ou novo pack.
- **SEC-06:** nenhum P0/P1 de segurança aberto no lançamento geral.
- **SEC-07:** pentest focado antes de benchmark coletivo, pagamentos em produção e assinatura avançada.

---

## 15. Integrações e automações

### 15.1 Arquitetura

Cada integração terá porta/adaptador, conta vinculada à organização, escopos mínimos, estado de saúde, cursor, mappings externos, webhooks persistidos, idempotência, retentativa limitada, dead-letter/reconciliação e botão de desconectar.

Fluxo padrão de webhook: validar assinatura e timestamp → persistir `webhook_inbox` com unicidade → responder ao provedor → processar assincronamente com lease/lock → gravar efeito e outbox na mesma transação → retentar com `next_attempt_at` → mover para DLQ quando terminal → permitir replay auditado. O caminho HTTP não executa silenciosamente toda a regra de negócio.

### 15.2 Ordem recomendada

| Ordem | Integração | Primeira entrega | Gate |
|---:|---|---|---|
| 1 | Google Calendar | conexão, escolha de calendário, OLLI→Google e leitura incremental | token seguro, 410/full resync, reconciliação periódica |
| 2 | E-mail transacional | convites, orçamento, agenda, documento e recuperação | domínio, DKIM/SPF/DMARC, bounce e opt-out onde aplicável |
| 3 | WhatsApp | compartilhamento/manual com prévia; depois API oficial | consentimento, template, opt-out, sem automação em massa |
| 4 | Pagamentos | Pix/link/sinal em sandbox; webhook/ledger | autorização para produção, assinatura e idempotência |
| 5 | Assinatura avançada | provedor atrás de adaptador | nível jurídico claro, evidência e custo |
| 6 | Microsoft 365 | calendário e e-mail | mesma semântica e reconciliação |
| 7 | Mapas/rotas | geocoding, distância e ETA | política de localização, cache e custo |
| 8 | Contabilidade/fiscal | exportação primeiro; provedores depois | jurisdição, contador e reconciliação |
| 9 | Fabricantes/dados técnicos | base curada, manual e catálogo | licença, versão e atualização |

### 15.3 Google Calendar

- OLLI continua fonte canônica da OS/visita;
- mapping estável entre visita e evento;
- sync incremental com token;
- erro `410` inicia ressincronização completa controlada;
- notificações push aceleram, mas não substituem reconciliação periódica;
- alterações externas entram como proposta ou atualização conforme política;
- loop prevention e idempotência;
- conflitos e calendário removido aparecem na Central de sincronização.

### 15.4 WhatsApp

Primeiro estágio: botão oficial de compartilhar orçamento/documento e captura manual assistida, sempre com prévia.

Segundo estágio: WhatsApp Business Platform, opt-in, templates aprovados, janela de atendimento, status de entrega e custos visíveis.

Terceiro estágio: triagem e automação controlada, com regras de horário, canal, cancelamento e aprovação.

Não usar automação não oficial, sessão pessoal copiada ou disparo em massa.

### 15.5 Pagamentos

- teste/sandbox por padrão;
- recebível criado de operação confirmada;
- webhook verificado e armazenado antes de processamento;
- idempotency key por operação;
- ledger append-only;
- estorno como evento compensatório;
- conciliação e divergência visíveis;
- nenhuma cobrança real em teste;
- ativação de produção exige autorização explícita e rollback.

### 15.6 Automações úteis

- lembrete de orçamento visualizado sem resposta;
- confirmação de visita;
- aviso “a caminho” confirmado pelo técnico;
- contrato/PMOC próximo do vencimento;
- visita recorrente ainda não agendada;
- recebível vencido com política de canal;
- solicitação de avaliação após conclusão;
- proposta corretiva a partir de não conformidade;
- alerta de custo desatualizado ou margem abaixo do piso;
- resumo semanal para o dono.

Toda automação terá dono, gatilho, ação, limite, consentimento, log, modo de teste e botão de desativar. A IA pode redigir ou priorizar; a regra determina se e quando a ação é permitida.

---

## 16. Pesquisa de campo e validação de mercado

Pesquisa web e análise de concorrentes ajudam a formular hipóteses; não substituem observar o trabalho real. A pesquisa de campo será uma trilha contínua e terá repositório de evidências, decisões e mudanças geradas.

### 16.1 Sinais externos já observados

Concorrentes e discussões públicas convergem em pedidos perdidos no WhatsApp, demora para montar orçamento/relatório, documentos dispersos, dificuldade de preço e excesso de complexidade nos sistemas. Postagens comunitárias brasileiras sobre ferramentas gratuitas para autônomos reforçam o interesse em orçamento rápido, PDF e simplicidade, mas são relatos anedóticos e podem refletir autopromoção. Elas servem para perguntas de pesquisa, não para declarar demanda comprovada.

Por isso, nenhuma votação de fórum ou claim de concorrente será convertida diretamente em backlog. A validação observará o último serviço real e os artefatos usados.

### 16.2 Amostra inicial

| Grupo | Quantidade | Método | Decisão que deve informar |
|---|---:|---|---|
| técnicos HVAC solo/MEI | 12 | entrevista de 30 min + protótipo | ativação, voz, orçamento e offline |
| empresas HVAC com 2–10 técnicos | 10 | walkthrough do fluxo real | equipe, agenda, contrato, custo e controle |
| clientes B2B/síndicos/facilities | 8 | entrevista e teste do portal | aprovação, confiança e pacote documental |
| responsáveis técnicos | 5 | revisão de artefatos | PMOC, responsabilidades, evidências e linguagem |
| usuários que abandonaram | 10 | funil + conversa curta | ponto de desistência e alternativa usada |
| elétrica, hidráulica e pragas | 5 por vertical | entrevista exploratória | próximo pack e ferramenta-assinatura |
| concorrentes | 3 testes por produto | mystery shopping ético | preço real, onboarding, offline, exportação e limites |

### 16.3 Roteiro baseado em comportamento

- “Mostre o último pedido que chegou.”
- “Mostre como fez e enviou o último orçamento.”
- “Mostre a última visita que virou relatório ou ficou sem relatório.”
- “Qual documento um cliente ou fiscal pediu nos últimos 90 dias?”
- “Onde você perde dinheiro sem perceber?”
- “O que você preenche à noite porque não conseguiu em campo?”
- “Qual serviço foi recusado e por quê?”
- “Como você calcula hora, deslocamento, risco e garantia?”
- “O que acontece quando fica sem internet ou troca de aparelho?”
- “Mostre como cobra, renova e reencontra os documentos.”

Não perguntar somente “você usaria IA?”. Demonstrar uma tarefa e medir tempo, correção e confiança.

### 16.4 Artefatos a coletar com autorização

- modelos de orçamento usados de verdade;
- planilhas de cálculo sem dados pessoais;
- checklists e relatórios próprios/licenciados;
- estrutura de contrato e renovação;
- fotos de fluxos e telas, não credenciais;
- categorias de mensagens recebidas;
- razões de perda e retrabalho;
- lista de documentos pedidos por cliente/fiscal;
- comparação anonimizada do antes/depois do piloto.

Nada entra no repositório bruto sem consentimento, sanitização e licença. Documentos de clientes reais não serão entregues a agentes/modelos externos por conveniência.

### 16.5 Experimentos baratos antes de módulos caros

1. onboarding concierge com 10 técnicos HVAC;
2. áudio/texto → rascunho de orçamento com revisão manual;
3. três alternativas de orçamento e follow-up para uma coorte pequena;
4. calculadora de preço determinística e comparação com a planilha atual;
5. inventário + QR + visita recorrente para contratos reais de teste;
6. portal de aprovação/documento para clientes convidados;
7. pack documental revisado por RT antes de automação avançada;
8. pré-venda ou piloto pago somente depois de demonstrar o fluxo.

### 16.6 Critério para promover uma hipótese

Uma hipótese vira requisito quando possui:

- problema observado em mais de um usuário;
- impacto quantificável;
- segmento e pessoa decisora;
- evidência/artefato;
- alternativa atual e motivo de insuficiência;
- risco regulatório e de suporte entendido;
- métrica de sucesso;
- solução testada com protótipo ou concierge.

---

## 17. Métricas e sistema de decisão

### 17.1 Métrica norte

**Organizações com ciclo de serviço confiável concluído por semana:** organização que, nos últimos 7 dias, levou pelo menos um trabalho por um fluxo relevante — orçamento aprovado ou contrato → execução documentada → recebimento/recorrência — sem erro de dados.

Ela evita premiar login, tela visitada ou documento gerado sem valor.

### 17.2 Árvore de métricas

| Dimensão | Métricas principais |
|---|---|
| Aquisição | origem, custo por lead quando aplicável, cadastro iniciado/concluído |
| Ativação | tempo até primeiro cliente, orçamento e envio; orçamento visualizado em 24h |
| Comercial | taxa de envio, visualização, aprovação, tempo de resposta, motivo de perda |
| Operação | tempo fim da visita→relatório, cumprimento de agenda, retrabalho, OS concluída offline |
| Documentos | completude, tempo de geração, falha de PDF, documento recuperável, assinatura concluída |
| Preço | margem prevista/real, desvio de custo, descontos, custo desatualizado, taxa de aprovação por faixa própria |
| Financeiro | aprovado→recebido, atraso, conciliação, divergência, receita recorrente |
| HVAC/PMOC | ativos cobertos, visitas no prazo, evidências completas, NC resolvidas, renovações |
| Retenção | WAU/MAU por organização, D7/D30/D90, contratos ativos, churn e razão |
| IA | sucesso/schema, correção humana, aceitação, latência, custo, fallback e incidente |
| Sync | pendências, conflito, tempo até sincronizar, perda de dado = zero |
| Segurança | acessos negados esperados, incidentes, cobertura RLS, tempo de revogação, restore |
| Suporte | tickets por fluxo, tempo de solução, falhas reabertas e satisfação |

### 17.3 Definições obrigatórias

Cada KPI terá nome, fórmula, unidade, população, janela, exclusões, evento fonte, owner, frequência, meta, guardrail e data de alteração. Mudança de definição cria versão; não reescreve silenciosamente o passado.

### 17.4 Metas iniciais de produto — a calibrar no piloto

Estas são metas de projeto, não fatos atuais:

- primeiro orçamento enviado em até 5 minutos após catálogo mínimo configurado;
- pelo menos 70% dos novos tenants qualificados enviam orçamento em 24 horas;
- pelo menos 90% dos documentos de campo são concluídos antes do fim do dia;
- 100% dos documentos enviados podem ser recuperados com a versão original;
- zero perda de operação offline nos cenários suportados;
- zero vazamento cross-tenant;
- 100% das recomendações de preço mostram origem e componentes;
- pelo menos 80% dos rascunhos de baixo risco passam sem correção severa antes de promoção ampla;
- nenhum fluxo crítico depende exclusivamente de modelo gratuito.

As metas serão recalibradas após uma linha de base real; nunca ajustadas retroativamente para esconder resultado ruim.

---

## 18. Engenharia, qualidade e operação

### 18.1 Ambientes

- **local/dev:** dados sintéticos, chaves locais e mocks quando possível;
- **preview:** por mudança relevante, sem indexação pública quando aplicável;
- **staging:** espelho estrutural com dados de teste e integrações sandbox;
- **produção:** somente após gate, migration, backup, observabilidade e rollback.

Configuração obrigatória será validada no build e no startup. Variável ausente não poderá resultar em um recurso anunciado que falha silenciosamente.

### 18.2 Entrega contínua

- branch protegida e revisão;
- lint/typecheck/testes relevantes;
- análise de dependências e segredos;
- migrations verificadas em banco vazio e upgrade;
- build web e Android reproduzíveis;
- feature flags para capacidades arriscadas;
- release notes e matriz de capacidade;
- deploy gradual/canário quando possível;
- rollback técnico e de configuração;
- publicação externa somente com autorização.

### 18.3 Pirâmide de testes

**Unidade:** cálculo de preço, impostos configurados, state machines, permissões, schemas e formatadores.

**Contrato:** portas/adaptadores, IA estruturada, calendário, pagamento, storage e assinatura.

**Integração:** banco/RLS, migrations, outbox, webhooks, documento e versões.

**E2E web:** onboarding→orçamento→aprovação→OS→documento→recebível.

**E2E móvel:** criação offline, evidência, conflito, retomada e sincronização.

**Segurança:** cross-tenant, privilégio, links, QR, upload, rate limit e prompts adversariais.

**Visual/PDF:** modelos, paginação, marca, acessibilidade e navegadores.

**Campo:** aparelhos reais de diferentes faixas, internet ruim e retorno após longo período.

### 18.4 Qualidade de UX

- mobile-first para execução;
- desktop eficiente para gestão e edição;
- acessibilidade WCAG aplicável, teclado, foco, contraste e leitor de tela;
- mensagens claras e ação de recuperação;
- estados vazio, carregando, offline, conflito, erro e sucesso;
- salvamento automático controlado;
- ações perigosas com confirmação e consequência explícita;
- dados sensíveis ocultos conforme permissão;
- performance medida em aparelho intermediário;
- nenhuma tela “bonita” aprovada sem o fluxo completo funcionar.

### 18.5 Observabilidade e suporte

- logs estruturados sem segredos/PII desnecessária;
- trace/correlation ID entre app, Worker, banco e integração;
- métricas de erro, latência, sync, webhook, PDF e IA;
- alertas acionáveis com runbook;
- status de integração por tenant;
- auditoria de ações críticas;
- central de ajuda por papel/vertical;
- diagnóstico exportável e sanitizado;
- processo de incidente e post-mortem sem culpa;
- feedback no contexto do erro.

### 18.6 Documentação como código

Criar e manter:

- `CAPABILITY_MANIFEST` gerado/verificado contra rotas, flags e migrations;
- matriz de status por web/mobile/backend;
- ADRs para tenancy, sync, IA, documentos, preço e integrações;
- dicionário de dados;
- matriz RLS e permissões;
- catálogo de fontes e licenças;
- runbooks de release, rollback, restore e incidente;
- changelog e decisões de produto;
- handoff que aponte para fontes canônicas, sem duplicar estados antigos.

Documentos históricos permanecem identificados como históricos. Afirmações antigas incompatíveis com o código não continuam rotuladas como estado atual.

---

## 19. Roadmap mestre 0–100

### Visão de dependências

```text
0–5 Verdade e governança
  → 5–15 Estabilização atual
    → 15–25 Identidade, dados, sync e segurança
      → 25–35 Núcleo comercial e UX unificada
        ├→ 35–47 Precificação e financeiro V1
        └→ 47–57 Documentos, contratos e assinaturas
              → 57–72 HVAC/PMOC completo
                → 72–82 Portal, integrações e automações
                  → 82–90 Inteligência de dados e IA madura
                    → 90–97 Packs adjacentes
                      → 97–100 Hardening, lançamento e escala
```

Pesquisa, segurança, métricas, documentação e IA são trilhas contínuas. O diagrama mostra o caminho crítico, não equipes isoladas.

### Fase 0 — 0% a 5%: verdade, governança e congelamento de risco

**Objetivo:** estabelecer uma única visão real do projeto antes de acrescentar superfície.

**Entregáveis**

- declarar `C:\OLLI_REL` como fonte canônica e catalogar snapshots antigos;
- reconciliar handoff, matriz de funcionalidades e documentação;
- inventariar rotas, tabelas, migrations, flags, integrações e ambientes;
- gerar baseline schema-only do Supabase, tipos/contratos e prova de banco limpo reproduzível;
- registrar divergências mobile/web, incluindo datas, dinheiro, JSON consultável e mutações diretas;
- registrar baselines de testes/builds sem alterar produção;
- abrir ADRs de tenancy, sync, IA, documentos e preço;
- criar registro de riscos, dependências e decisões;
- congelar claims/templates PMOC que usem RE-9 como vigente;
- definir catálogo de fontes/licenças;
- preparar roteiro e consentimento da pesquisa de campo;
- transformar este plano em backlog rastreável.

**Gate 5%**

- nenhuma funcionalidade “pronta” sem evidência;
- fonte canônica, matriz e owners definidos;
- riscos P0 identificados;
- material regulatório perigoso congelado;
- backlog e critérios de aceite aprovados pelo dono do produto.

### Fase 1 — 5% a 15%: estabilizar o que já existe

**Objetivo:** fazer a promessa atual funcionar de ponta a ponta antes da expansão.

**Entregáveis**

- corrigir configuração pública da IA e Google no Android;
- testar e atualizar cadeia de modelos gratuitos por ambiente;
- unificar cota/crédito e confirmação de consumo no servidor;
- migrar logo/avatar para storage seguro e portável;
- aplicar estratégia de numeração única e colisão;
- resolver divergências relevantes do Expo Doctor sem downgrade acidental;
- completar importação/exportação básica e relatório de erro;
- revisar flags e remover menu enganoso;
- provar orçamento/PDF/link/aceite/OS/agenda/equipe/equipamento/PMOC básico;
- build Android atual em aparelho físico e E2E web;
- atualizar documentação da release.

**Gate 15%**

- nenhum P0 funcional aberto no fluxo atual;
- contrato de recibo/data passa em mobile e web, com valor monetário sem ponto flutuante nos novos contratos;
- IA anunciada funciona ou fica explicitamente desabilitada;
- PDF e logo consistentes entre aparelho e web;
- contagem de crédito idempotente;
- build reproduzível e evidência em aparelho da versão atual;
- nenhum deploy/publicação feito sem autorização.

### Fase 2 — 15% a 25%: identidade, dados, offline e segurança

**Objetivo:** criar a fundação multiempresa que suporta funcionário, unidade, dados e escala.

**Entregáveis**

- `organization_id` de primeira classe e migration aditiva;
- organização pessoal para usuários atuais, seleção explícita e SQLite por usuário+organização;
- memberships, papéis, capacidades e escopos;
- convite, suspensão, revogação e transferência de propriedade;
- RLS/storage deny-by-default e suíte cross-tenant;
- outbox durável, cursores, idempotência e central de sincronização;
- matriz de conflitos por domínio;
- auditoria imutável e separação tenant/admin da plataforma;
- classificação, retenção, exportação e eliminação de dados;
- backup e restore testado;
- telemetria mínima e sanitizada;
- threat model e teste de dois aparelhos.

**Gate 25%**

- zero falha cross-tenant na suíte;
- zero linha órfã e zero seleção silenciosa da associação mais antiga;
- troca de organização não mistura cache, cursor ou arquivo SQLite;
- usuário revogado não consegue agir com cache offline;
- nenhum documento/ledger usa LWW;
- restore comprovado;
- migração e rollback ensaiados;
- custo/margem protegidos por capacidade própria.

### Fase 3 — 25% a 35%: UX unificada e motor comercial

**Objetivo:** fazer o prestador chegar ao primeiro valor rapidamente no web e no celular.

**Entregáveis**

- nova arquitetura de navegação por domínio e papel;
- onboarding guiado e importação com prévia;
- lead/oportunidade, local e histórico unificados;
- escolha de tipo/modelo de orçamento;
- personalização completa e segura da marca;
- opções essencial/recomendada/premium;
- orçamento versionado e eventos de aprovação;
- Caixa “Hoje” e próximas ações;
- follow-up e motivos de ganho/perda;
- primeira versão contínua do portal do cliente;
- analytics de ativação/funil com definições versionadas.

**Gate 35%**

- novo usuário qualificado envia orçamento em até 5 minutos no teste moderado;
- proposta é idêntica no preview, PDF e portal dentro das tolerâncias definidas;
- edição após envio cria nova versão;
- conversão em OS é idempotente;
- web/mobile respeitam as mesmas permissões.

### Fase 4 — 35% a 47%: precificação e financeiro V1

**Objetivo:** impedir preço no escuro e fechar o aprendizado previsto versus realizado.

**Entregáveis**

- hora produtiva e custo carregado;
- composição de materiais, deslocamento, terceiros, overhead e garantia;
- fórmula configurável, validações e cenários;
- livro de preços e snapshots de custo;
- preço mínimo, alvo, margem e impacto do desconto;
- capacidades separadas para custo/margem;
- realizado por OS: tempo, material, despesa e retrabalho;
- recebíveis, baixa, recibo e resultado operacional simples;
- dashboard previsto versus realizado;
- inteligência somente do histórico próprio nesta fase.

**Gate 47%**

- suíte determinística com casos de borda;
- cálculo reproduzível por versão;
- nenhum imposto/regime presumido como universal;
- ledger e baixa idempotentes;
- comparação explica amostra, período e critérios;
- piloto mostra melhoria mensurável na segurança da margem.

### Fase 5 — 47% a 57%: documentos, contratos e assinaturas

**Objetivo:** tornar documentos um produto central, confiável e personalizável.

**Entregáveis**

- Central de Documentos;
- editor por blocos e modelos versionados;
- registro de fontes/licenças/revisões;
- orçamento, contrato, OS, relatório, garantia, conclusão e recibo;
- snapshot, objeto imutável, hash e eventos;
- níveis de assinatura nomeados corretamente;
- fluxo de aprovação técnico/jurídico;
- PDF reproduzível e testes de paginação;
- pasta do cliente/ativo/contrato;
- portal para baixar/assinar documentos autorizados.

**Gate 57%**

- 100% dos documentos enviados recuperáveis na versão original;
- nova edição nunca muda documento assinado;
- fonte/licença registrada para template regulado;
- assinatura simples não é anunciada como qualificada;
- testes visuais e de acesso aprovados.

### Fase 6 — 57% a 72%: HVAC e PMOC completo

**Objetivo:** entregar profundidade vertical capaz de sustentar aquisição e retenção.

**Entregáveis**

- locais/ambientes/equipamentos e QR seguro;
- importação de inventário;
- contrato, plano, periodicidade e geração de visitas;
- checklist offline por tipo de ativo;
- leituras, fotos, materiais e não conformidades;
- NC → orçamento corretivo;
- RT, aprovação e fontes versionadas;
- relatório por visita/equipamento;
- pacote documental PMOC;
- reajuste, renovação e rentabilidade;
- alertas e IA assistiva baseada em fonte;
- piloto com solo, equipe pequena, cliente B2B e RT.

**Gate 72%**

- revisão técnica/regulatória concluída;
- nenhuma referência revogada apresentada como vigente;
- fluxo ativo→visita→evidência→pacote funciona offline/online;
- QR não expõe PII/histórico;
- RT controla a aprovação técnica;
- usuários do piloto concluem tarefas sem planilha paralela no escopo testado.

### Fase 7 — 72% a 82%: portal, integrações e automações

**Objetivo:** conectar agenda, cliente, comunicação e recebimento sem perder controle.

**Entregáveis**

- portal com aprovação, agenda, documentos, pagamento e novo pedido;
- estoque leve, reservas por OS, consumo/devolução e ferramentas por responsável;
- Central de Conhecimento e Dicas com fontes, versões e ajuda contextual;
- Google Calendar incremental e reconciliação;
- e-mail transacional;
- WhatsApp manual/oficial por etapas;
- pagamentos em sandbox, webhook e ledger;
- automações consentidas de follow-up, visita, cobrança e renovação;
- observabilidade/saúde por integração;
- dead-letter, retentativa e reconciliação;
- integração de assinatura avançada somente se validada.

**Gate 82%**

- webhooks assinados e idempotentes;
- `410`/resync e notificações perdidas testados no calendário;
- nenhum disparo sem consentimento/política;
- cobrança real continua bloqueada até autorização específica;
- desconectar integração não perde o histórico interno.
- ajuste de estoque, custo e compra respeita capacidade e auditoria; consumo offline reconcilia sem duplicar.

### Fase 8 — 82% a 90%: inteligência madura e aprendizado

**Objetivo:** transformar os fatos acumulados em ajuda confiável e mensurável.

**Entregáveis**

- registro de tarefas/modelos/schemas e feature flags;
- RAG tenant-aware e biblioteca técnica curada;
- conjunto dourado e avaliações contínuas;
- recomendação de preço, renovação, follow-up e risco por dados próprios;
- feedback aceitar/editar/rejeitar e resultado real;
- painéis explicáveis e narrativa gerencial;
- redaction, política de provedores e kill switch;
- POC isolada de benchmark coletivo somente após pareceres;
- monitoramento de drift, custo e modelos gratuitos.

**Gate 90%**

- toda recomendação relevante informa origem/confiança;
- alternativa manual existe;
- nenhuma saída de alto risco é autônoma;
- modelo pode ser trocado por configuração/adaptador;
- benchmark coletivo, se houver, passa SEC/LGPD/CADE e teste de reidentificação;
- qualidade supera a baseline manual definida por tarefa.

### Fase 9 — 90% a 97%: expansão vertical comprovada

**Objetivo:** provar que o motor se repete sem diluir o foco.

**Entregáveis**

- playbook e kit de criação de pack;
- elétrica como candidato inicial, após pesquisa e especialista;
- um segundo pack escolhido por evidência — hidráulica ou dedetização;
- ferramentas-assinatura completas;
- documentos/fontes/versionamento por vertical;
- métricas e onboarding segmentados;
- suporte e conteúdo preparados;
- nenhuma lógica copiada de forma inconsistente entre plataformas.

**Gate 97%**

- cada pack cumpre os sete gates de entrada;
- usuários reais completam o fluxo específico;
- pelo menos 70% do núcleo é reutilizado;
- fonte, especialista, suporte e métrica existem;
- HVAC não regride.

### Fase 10 — 97% a 100%: hardening, lançamento e escala

**Objetivo:** concluir o escopo com prova operacional, comercial e de segurança.

**Entregáveis**

- regressão completa web/Android e iOS quando conta/dispositivo estiver disponível;
- performance, acessibilidade e compatibilidade;
- chaos/offline/sync e restauração;
- security review independente e correção;
- testes de carga/capacidade e limites de custo;
- observabilidade, alertas e runbooks;
- suporte, onboarding, ajuda e operação de incidentes;
- pricing/planos comerciais baseados em valor validado;
- migração dos usuários existentes;
- piloto pago/controle de churn e coortes;
- checklist de loja, privacidade, termos e publicação;
- lançamento gradual com rollback.

**Gate 100%**

- todos os critérios da Seção 23 atendidos;
- nenhum P0/P1 aberto;
- aceite formal de produto, técnico, segurança e operação;
- produção e publicação somente após autorização explícita do dono.

---

## 20. Backlog transversal por prioridade

### P0 — antes de expandir

- IA e OAuth Android no build real;
- modelos gratuitos vivos/testados;
- cota unificada;
- logo/storage;
- referência RE-9 corrigida;
- numeração concorrente;
- sync de dois aparelhos;
- baseline RLS e links/QR;
- documentos enviados imutáveis;
- documentação atual versus histórica.

### P1 — fundação da plataforma

- `organization_id` e RBAC por capacidades;
- outbox e conflitos;
- central “Hoje”;
- calculadora econômica;
- documentos/modelos/fontes;
- portal contínuo;
- PMOC/contratos/recorrência;
- observabilidade, backup/restore e privacidade.

### P2 — crescimento

- calendário externo;
- pagamento em sandbox→produção autorizada;
- WhatsApp oficial;
- assinatura avançada;
- estoque/compras leves e central de conhecimento;
- recomendações por dados próprios;
- pack elétrica e segundo pack por pesquisa.

### P3 — somente depois da tração

- benchmark coletivo de preço;
- fiscal multi-município;
- roteirização avançada;
- marketplace;
- estoque/ERP profundo;
- agente autônomo;
- muitos packs simultâneos;
- qualidade do ar/laboratório automatizada sem parceiros e responsabilidades definidas.

---

## 21. Equipe, responsabilidades e estimativa

### 21.1 Responsabilidades mínimas

| Papel | Responsabilidade |
|---|---|
| Dono do produto/especialista HVAC | prioridade, problema real, aceites de campo e linguagem comercial |
| Product/UX | pesquisa, fluxo, protótipo, acessibilidade e métricas |
| Tech lead | arquitetura, decisões, integração, migração e qualidade |
| Frontend/mobile | experiência web/app e offline |
| Backend/dados | domínio, Supabase, RLS, sync, filas e integrações |
| QA | estratégia, E2E, aparelhos, regressão e evidências |
| Segurança/privacidade | threat model, RLS, LGPD, pentest e incidente |
| Responsável técnico | revisão HVAC/PMOC e documentos técnicos |
| Jurídico concorrencial/contratual | assinatura, templates e benchmark coletivo |
| Contador | custos, impostos, exportação e linguagem financeira |
| Suporte/operação | onboarding, ajuda, incidentes e feedback |

Uma pessoa pode acumular papéis numa fase inicial, mas os gates de revisão independente não desaparecem.

### 21.2 Cenários direcionais

Estimativas dependem da disponibilidade, débitos encontrados e profundidade do piloto. Não são promessa de calendário:

- **fundador + desenvolvimento assistido por IA:** aproximadamente 10–14 meses, com maior risco de gargalo em QA, pesquisa e revisão externa;
- **equipe sênior compacta de 3 pessoas:** aproximadamente 5–8 meses;
- **equipe de 5–6 pessoas com papéis claros:** aproximadamente 4–6 meses, com maior custo e coordenação.

O caminho mais econômico é equipe compacta, fases curtas, gates reais e especialistas externos pontuais. Colocar mais agentes ou pessoas em todo problema não substitui arquitetura e aceite.

### 21.3 Cadência recomendada

- ciclos de 1–2 semanas;
- demo real no web/aparelho;
- pesquisa semanal durante fases de produto;
- revisão de risco e métrica a cada ciclo;
- release interna contínua;
- piloto por coorte;
- decisão continuar/ajustar/parar por gate;
- documentação e evidência no mesmo pull request da mudança.

---

## 22. Registro de riscos

| Risco | Probabilidade/impacto | Resposta |
|---|---|---|
| ampliar verticais cedo demais | alta/alta | gates e uma vertical por vez |
| IA gratuita instável | alta/alta | adaptador, avaliação, cache seguro e fallback manual |
| owner-overlay causar vazamento | média/alta | migração aditiva, RLS e suíte cross-tenant |
| sync perder ou sobrescrever dado | média/alta | outbox, versões, conflitos por domínio e chaos tests |
| conteúdo PMOC desatualizado | alta/alta | registro de fontes, RT e revisão de vigência |
| benchmark de preço gerar risco concorrencial | média/alta | própria empresa primeiro; parecer e agregação forte |
| template/PDF infringir licença | média/alta | procedência, licença e conteúdo próprio |
| assinatura vendida com nome errado | média/alta | níveis explícitos e provedor adequado |
| pagamento duplicado | média/alta | webhook assinado, idempotência e ledger |
| custo de integrações/IA fugir do plano | média/média | orçamento por tarefa/tenant, limites e alertas |
| navegação ficar pesada | alta/média | experiência por papel e vertical, mobile contextual |
| documentação divergir novamente | alta/média | manifestos e verificação automatizada |
| produção ser usada como teste | média/alta | ambientes, sandbox e gates de autorização |
| dados coletivos serem reidentificados | média/alta | análise iterativa, supressão e monitoramento |
| equipe acreditar que “admin vê senha” | média/média | UX correta, reset/revogação e educação |

---

## 23. Definição objetiva de 100% concluído

O projeto deste plano estará em 100% quando **todos** os itens abaixo forem verdadeiros:

### Produto e experiência

- fluxo completo funciona em web e Android: onboarding → cliente/local → orçamento → aprovação → OS/agenda → evidência → documento → recebimento/recorrência;
- experiência móvel é adequada ao técnico e a web ao gestor;
- portal do cliente fecha aprovação, acompanhamento e documentos;
- personalização da empresa aparece de forma consistente;
- calculadora de preço e previsto versus realizado estão operacionais;
- estoque/compras leves e conhecimento por ofício funcionam quando habilitados;
- HVAC/PMOC cumpre o pack definido e foi validado no campo;
- packs adjacentes entregues cumprem seus próprios gates.

### Dados e operação

- `organization_id` é a chave canônica;
- RLS/capacidades cobrem tabelas, funções, storage e links;
- outbox, conflitos e idempotência estão comprovados;
- dois aparelhos offline não causam perda;
- backup e restore foram executados com sucesso;
- exportação e solicitações de privacidade funcionam;
- documentação de dados e runbooks está atualizada.

### Documentos e conformidade

- cada documento enviado é reproduzível, versionado e protegido por hash;
- assinatura é rotulada pelo nível correto;
- fontes, licenças e revisões existem para material regulado;
- RE-9 revogada não é tratada como vigente;
- RT controla aprovação técnica;
- nenhuma promessa diz que o software substitui profissional, conselho, ART ou revisão jurídica.

### IA e inteligência

- tarefas, schemas, modelos, limites e dados permitidos estão registrados;
- avaliações PT-BR passam os limiares definidos;
- alto risco exige humano;
- fallback manual existe;
- prompts/telemetria minimizam dados pessoais;
- recomendações mostram fundamento e confiança;
- histórico próprio é a base da precificação;
- benchmark coletivo inexiste ou passou todos os gates LGPD/concorrenciais.

### Segurança e confiabilidade

- zero vazamento cross-tenant nos testes;
- nenhum P0/P1 aberto;
- revisão independente realizada;
- sessões, convites, revogações e ações críticas funcionam;
- secrets permanecem no servidor;
- webhooks são verificados e idempotentes;
- observabilidade e incident response funcionam;
- performance e acessibilidade atendem os alvos definidos.

### Negócio e validação

- métricas têm baseline, definição e owner;
- ativação, uso recorrente e confiança foram provados em coorte piloto;
- existe evidência de valor para solo e equipe HVAC;
- preço/plano comercial foi validado, não apenas imaginado;
- suporte e onboarding estão prontos;
- lançamento é gradual, monitorado e reversível;
- publicação em produção/lojas ocorreu somente após autorização explícita.

---

## 24. Primeira sequência de execução após aprovação do plano

Quando o usuário autorizar a implementação, a primeira onda deverá ser curta e reversível:

1. transformar este documento em backlog com IDs, dependências e owners;
2. criar o manifesto de capacidades atual;
3. corrigir e testar a referência regulatória PMOC;
4. fechar P0 da release: IA Android, OAuth, modelos, cota, logo e numeração;
5. executar E2E atual e aparelho físico;
6. produzir ADR da migração `organization_id` e ADR da outbox;
7. iniciar pesquisa de campo com roteiro e protótipos;
8. apresentar evidências e pedir aceite do gate de 15% antes de ampliar.

Isso entrega confiança cedo e impede que novos módulos sejam construídos sobre uma base ambígua.

---

## 25. Fontes externas principais

### PMOC, normas e documentos

- [Lei nº 13.589/2018 — manutenção de sistemas de climatização](https://www.presidencia.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm)
- [Portaria GM/MS nº 3.523/1998](https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html)
- [RDC nº 886/2024 no Diário Oficial](https://pesquisa.in.gov.br/imprensa/servlet/INPDFViewer?captchafield=firstAccess&data=12%2F07%2F2024&jornal=515&pagina=123)
- [Anvisa — resultados da avaliação e consolidação do estoque regulatório](https://www.gov.br/anvisa/pt-br/assuntos/regulamentacao/gestao-do-estoque/consolidacao/resultados-da-avaliacao-e-consolidacao)
- [Modelo oficial de planilha PMOC do INSS e licença indicada](https://www.gov.br/inss/pt-br/centrais-de-conteudo/publicacoes/contratos-e-licitacoes/apendice-vii-modelo-de-plano-de-manutencao-operacao-e-controle-pmoc-xls/view)
- [ABNT — acesso comercial a normas](https://abnt.org.br/comercial/)
- [NR-10 oficial](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10)

### Assinatura, privacidade e concorrência

- [Lei nº 14.063/2020 — assinaturas eletrônicas](https://www.presidencia.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm)
- [ITI — assinatura eletrônica avançada](https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada)
- [ANPD — perguntas frequentes e conceitos da LGPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes)
- [ANPD — estudo jurídico sobre anonimização](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos/estudo_tecnico_sobre_anonimizacao_de_dados_na_lgpd___analise_juridica.pdf/%40%40download/file)
- [ANPD — processo de anonimização baseado em risco](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos/estudo_tecnico_sobre_anonimizacao_de_dados_na_lgpd_uma_visao_de_processo_baseado_em_risco_e_tecnicas_computacionais.pdf)
- [CADE — informações comercialmente sensíveis](https://www.gov.br/cade/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-sobre-infracoes-a-ordem-economica)
- [CADE — investigação sobre algoritmo de precificação](https://www.gov.br/cade/pt-br/assuntos/noticias/cade-celebra-acordo-em-investigacao-sobre-uso-de-algoritmo-de-precificacao/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)

### Precificação, IA e infraestrutura

- [Sebrae — cálculo de preço de produto e serviço](https://meuatendimento.sebrae.com.br/sites/PortalSebrae/ufs/ba/videos/v%C3%ADdeos/como-calcular-o-preco-de-venda-do-produto-e-servico-rapido-e-facil-aprenda-com-o-sebrae%2Cd9b08ece9269f810VgnVCM1000001b00320aRCRD)
- [OpenRouter — FAQ e limitações de modelos gratuitos](https://openrouter.ai/docs/faq)
- [OpenRouter — privacidade e logging de provedores](https://openrouter.ai/docs/guides/privacy/provider-logging)
- [OpenRouter — seleção e políticas de provedores](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter — fallback de modelos](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare Workers AI — preços e cota](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [OpenAI API — controles de dados](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — usuários e convites](https://supabase.com/docs/guides/auth/users)
- [Supabase — sessões](https://supabase.com/docs/guides/auth/sessions)

### Agenda e mercado

- [Google Calendar — sincronização incremental](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google Calendar — push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Auvo — gestão de serviços](https://www.auvo.com/gestao-servicos)
- [Auvo — climatização e refrigeração](https://www.auvo.com/software-climatizacao-refrigeracao)
- [Produttivo — OS por áudio](https://www.produttivo.com.br/blog/gerador-de-ordem-de-servico/)
- [Jobber — recursos de field service](https://www.getjobber.com/features/)
- [Jobber — visão do cliente no portal](https://help.getjobber.com/en/articles/what-do-your-clients-see-in-client-hub/)
- [Housecall Pro — recursos](https://www.housecallpro.com/features/)
- [Discussão comunitária — sistema gratuito para autônomos enviarem orçamento](https://www.reddit.com/r/empreendedorismo/comments/1s546fz/sistema_gratuito_pra_aut%C3%B4nomos_mandarem/)
- [Discussão comunitária — como autônomos organizam clientes e orçamentos](https://www.reddit.com/r/MicroSaaSBR/comments/1vqaixg/quem_aqui_trabalha_por_conta_pr%C3%B3pria_como_voc%C3%AAs/)

---

## 26. Aprovações externas que o software não substitui

Antes dos respectivos lançamentos, serão necessários:

- responsável técnico HVAC/PMOC;
- revisão jurídica de contratos e níveis de assinatura;
- revisão concorrencial e LGPD para benchmark entre empresas;
- contador para fórmulas e exportações tributárias;
- termos/licenças de fontes, fabricantes e templates;
- contas oficiais e autorização do usuário para Google, WhatsApp, pagamentos, assinatura, lojas e produção.

O uso de IA, pesquisa web ou automação não remove essas responsabilidades.

---

## 27. Decisão recomendada

Aprovar este plano como direção, mas executar imediatamente apenas as Fases 0 e 1. Ao atingir 15% com evidência, revisar dados da pesquisa de campo, confirmar o desenho de tenancy/sync e liberar a Fase 2. Esse modelo preserva a ambição de plataforma completa sem confundir velocidade com acúmulo de telas.

---

## Apêndice A — mapa técnico para iniciar a implementação

### Hotspots existentes

```text
src/database/database.ts
src/database/particao.ts
src/services/cloudSync.ts
src/services/contextoEquipe.ts
src/services/equipe.ts
src/services/supabase.ts
src/services/olliIA.ts
src/services/olliAssistente.ts
src/services/analytics.ts
src/services/analyticsRemoto.ts
src/services/ports/*
webapp/src/olli/contrato.ts
webapp/src/olli/data.ts
webapp/src/olli/mutacoes.ts
worker/src/index.js
worker/src/ai.js
worker/src/webhookEvents.js
worker/src/stripe.js
worker/src/mercadopago.js
worker/src/equipe.js
supabase/migrations/*
```

### Módulos prováveis

```text
packages/domain-contracts/
  entities/ commands/ events/ schemas/ generated-db-types/

src/sync/
  outbox.ts push.ts pull.ts conflicts.ts device.ts repositories/

worker/src/sync/
  applyOperations.js pullChanges.js idempotency.js

worker/src/ai/
  gateway.js taskRegistry.js modelCatalog.js providers/ retrieval/ evaluations/

worker/src/integrations/
  ports/ adapters/ webhooks/ jobs/ deadLetters/

worker/src/pricing/
  observations.js ownData.js benchmarkAggregate.js privacyGate.js

supabase/migrations/
  baseline/
  organization-ownership/
  sync-protocol/
  domain-outbox/
  storage/
  ai-governance/
  pricing-own-data/
  pricing-benchmark-isolated/
```

Um pacote compartilhado deve gerar schemas/contratos consumíveis pelo Worker, mobile e web. Não manter três mapeamentos manuais incompatíveis.

### ADRs que devem ser formalizados

| ADR | Decisão |
|---|---|
| ADR-01 | `organizations`/`organizacoes` é a fronteira real de tenant por `organization_id` |
| ADR-02 | Postgres é verdade durável; SQLite é réplica operacional com comandos pendentes |
| ADR-03 | sincronização usa outbox, idempotência, versão e cursor |
| ADR-04 | web e mobile obedecem aos mesmos contratos e máquinas de estados |
| ADR-05 | relógio do cliente não decide conflito |
| ADR-06 | exclusão é versionada e retenção depende dos cursores de dispositivos |
| ADR-07 | ID técnico e número humano são separados; emissão final é explícita |
| ADR-08 | integrações usam ports/adapters + inbox/outbox/DLQ |
| ADR-09 | gateway de IA próprio evolui no Worker antes de novo control plane |
| ADR-10 | SQL/FTS antes de embeddings |
| ADR-11 | memória de IA é explícita, versionada, inspecionável e removível |
| ADR-12 | precificação usa dados próprios primeiro |
| ADR-13 | benchmark coletivo é isolado, tardio e condicionado a LGPD/CADE |
| ADR-14 | eventos servem a integração/observabilidade; não substituem estado do agregado |
| ADR-15 | não colocar PowerSync, LiteLLM ou n8n no caminho crítico sem prova de necessidade |

### Decisões ainda abertas para a execução

- padrão final de nomes de banco em inglês ou português;
- documentos que exigem numeração estritamente sequencial e regra offline;
- duração de autorização offline após revogação de funcionário;
- granularidade de unidade/equipe/atribuição no RLS;
- moeda única inicial ou suporte multicurrency desde o schema;
- retenção de conversas, invocações e memórias;
- dados permitidos por tarefa/provedor de IA;
- provedor de pagamento do cliente final;
- provedor de assinatura avançada/qualificada;
- política de consentimento e automação do WhatsApp;
- SLOs de sync, documento, IA e integrações;
- parâmetros finais de coorte/defasagem do benchmark, se um dia aprovado.

Essas decisões são gates técnicos ou externos; não devem ser “resolvidas” silenciosamente durante a codificação.
