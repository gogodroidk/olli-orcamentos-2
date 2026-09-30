# OLLI V2 — plano executivo em três ondas

> Data-base: 26 de agosto de 2026
>
> Horizonte deste ciclo: três semanas
>
> Ondas: Pesquisa → Criação → Execução
> Status: plano para aceite do proprietário; nenhuma alteração de produção está autorizada por este documento

## 1. Decisão executiva

**Veredito: FAZER COM AJUSTES — estratégia C+.**

A OLLI deve criar um **núcleo modular V2 novo dentro do repositório canônico atual**, protegido por feature flags, e migrar o produto por fatias verticais pequenas e reversíveis. A V1 continua funcionando como fallback até cada fatia provar isolamento entre empresas, integridade, funcionamento offline, sincronização, compatibilidade de versões e rollback.

Isso responde à pergunta “não é mais fácil criar tudo novo e depois implementar aos poucos?” da seguinte forma:

- **Sim** para criar do zero a arquitetura-alvo, os contratos de domínio, o motor de documentos, o protocolo de sincronização e as regras de segurança.
- **Não** para duplicar de uma vez todas as telas, bancos, integrações e regras do produto em um segundo aplicativo. Isso criaria duas fontes de verdade, duplicaria testes e aumentaria o risco de perder dados.
- A solução é um **strangler interno**: o núcleo novo cresce dentro da aplicação existente; cada fluxo antigo só é substituído depois de passar pelos gates.

O diferencial não será “ter mais menus”. Concorrentes já oferecem agenda, OS, checklist, assinatura, portal, PMOC, cobranças e relatórios. A tese de diferenciação da OLLI será:

> **evidência coletada em campo → documento técnico confiável → preço explicado → aprovação simples → execução e pagamento → recorrência → inteligência útil**

O foco inicial continua sendo climatização e PMOC. A generalização para outros prestadores será feita por um **kernel comum + pacotes setoriais**, sem diluir o produto antes de resolver profundamente o trabalho de HVAC.

## 2. O que as três semanas entregam — e o que não prometem

### Entregas realistas deste ciclo

1. Pesquisa documental e de mercado consolidada, plano de pesquisa de campo e mapa de necessidades.
2. Decisões arquiteturais registradas: multiempresa, sincronização, convivência V1/V2, documentos, IA e organização do repositório.
3. Contratos compartilhados e fundações locais do núcleo V2.
4. RLS/testes de isolamento, outbox idempotente e rollback desenhados e ensaiados em ambiente seguro.
5. Uma primeira fatia vertical em modo controlado, idealmente:
   `empresa ativa → cliente → local → equipamento HVAC → visita/evidência → laudo/orçamento corretivo`.
6. Evidências de teste, critérios de aceite e backlog ordenado para as próximas fatias.

### O que não cabe honestamente em três semanas

- concluir toda a plataforma para todos os setores;
- migrar todos os dados e módulos para produção;
- validar juridicamente todos os contratos e laudos sem profissionais habilitados;
- provar sincronização adversarial em todos os aparelhos e redes;
- treinar uma IA própria com dados reais de múltiplas empresas;
- publicar, cobrar, enviar mensagens ou alterar produção sem gates separados.

Ao final da semana 3, a meta é **fundação comprovada + primeira fatia utilizável em sandbox/staging ou shadow mode**, não uma declaração falsa de produto 100% concluído.

## 3. Evidências usadas para decidir

### 3.1 Estado verificado do projeto

O repositório canônico em `C:\OLLI_REL` contém quatro superfícies principais e uma base compartilhada:

- aplicativo móvel Expo/React Native com persistência SQLite;
- aplicação web Vite;
- site/landing Astro;
- Cloudflare Worker;
- Supabase/Postgres com migrations e RLS.

No levantamento de 26/08/2026 foram observados:

- 254 arquivos sob `src` e 373 sob `webapp/src`;
- 34 migrations e 62 arquivos sob `scripts`;
- npm no núcleo/site/worker e pnpm na aplicação web;
- ausência de `workspaces` e `packageManager` no `package.json` raiz;
- 43 entradas modificadas ou não rastreadas no checkout atual.

Consequência: não é prudente mover toda a árvore para `apps/` e `packages/` imediatamente. Primeiro será feito um spike descartável em worktree. O Expo oferece suporte de primeira classe a monorepos, mas também alerta para aumento de complexidade, incompatibilidades de ferramentas e duplicação de React/React Native. Fonte: [Expo — Work with monorepos](https://docs.expo.dev/guides/monorepos/).

### 3.2 Arquitetura e sincronização

- Modernização incremental de aplicações móveis reduz o risco de um big-bang e permite medir valor por subconjunto de domínio. Fonte: [Thoughtworks/Martin Fowler — Strangler Fig em aplicações móveis](https://martinfowler.com/articles/strangler-fig-mobile-apps.html).
- O modelo local-first é adequado ao técnico em campo: leitura e escrita continuam sem internet, e a sincronização acontece depois. O próprio Expo ressalta que permissões multiusuário e sync ainda exigem trabalho cuidadoso. Fonte: [Expo — Local-first architecture](https://docs.expo.dev/guides/local-first/).
- `expo-sqlite` persiste entre reinicializações, mas é persistência, não uma solução completa de sincronização. Fonte: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- Supabase Realtime é útil para eventos conectados, mas não substitui uma fila durável offline. Fonte: [Supabase Realtime](https://supabase.com/docs/guides/realtime).
- PowerSync é uma opção tecnicamente viável para Expo/Supabase, mas adiciona serviço, adaptador nativo, custo e lock-in. Deve ser comparado em spike descartável antes de qualquer adoção. Fonte: [PowerSync Setup Guide](https://docs.powersync.com/intro/setup-guide).
- No Supabase, grants e RLS devem trabalhar juntos; políticas precisam ser testadas com a mesma mudança e falhar fechadas. Fonte: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) e [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

### 3.3 Mercado e comunidade

A pesquisa secundária encontrou um padrão claro:

| Expectativa já comum no mercado | Evidência | Implicação para a OLLI |
|---|---|---|
| Agenda, despacho, OS, checklist, fotos, assinatura, equipamento, recorrência, financeiro e portal | [Auvo](https://www.auvo.com/) | São requisitos básicos, não diferencial isolado. |
| Jornada integrada orçamento → trabalho → agenda → cobrança e área do cliente | [Jobber](https://www.getjobber.com/features/) | A OLLI precisa fechar fluxos; telas soltas não bastam. |
| Catálogo/price book e orçamento padronizado | [Housecall Pro](https://www.housecallpro.com/features/price-book/) | Precificação precisa unir custo real, catálogo e contexto. |
| Operação HVAC, despacho, price book e orçamento móvel | [ServiceTitan](https://www.servicetitan.com/pricing) | A profundidade HVAC precisa aparecer desde a primeira fatia. |
| PMOC, QR/equipamentos, histórico e documentos de campo | [Auvo PMOC e climatização](https://www.auvo.com/) | OLLI não deve copiar recursos; deve tornar o fluxo mais simples, explicável e conectado à IA. |

Conclusão: construir um clone horizontal de FSM seria caro e pouco defensável. A oportunidade é combinar contexto brasileiro, trabalho offline, HVAC/PMOC, documentos rastreáveis, precificação explicável e IA supervisionada.

### 3.4 PMOC, contratos, assinatura e proteção de dados

- A [Lei nº 13.589/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm) exige PMOC em edifícios de uso público e coletivo com ambientes climatizados artificialmente e remete a parâmetros de qualidade do ar e normas técnicas.
- A [Portaria GM/MS nº 3.523/1998](https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html) define procedimentos, registros e deveres específicos; contém exigências adicionais para sistemas acima de 5 TR. O produto não deve resumir toda a obrigação legal a um único limiar de capacidade.
- A Anvisa continua referenciando a RE nº 9/2003 na fiscalização de qualidade do ar. Fonte: [Anvisa — Fiscalização](https://www.gov.br/anvisa/pt-br/assuntos/paf/fiscalizacao).
- Assinaturas eletrônicas têm níveis e requisitos diferentes. A implementação deve registrar identidade, intenção, integridade, versão do documento e evidências; o tipo adequado depende do ato. Fontes: [Lei nº 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) e [MP nº 2.200-2/2001](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm).
- Dados de clientes, funcionários, localização, fotos e assinaturas exigem base legal, finalidade, minimização, retenção e segurança. Fontes: [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) e [Guia de segurança da ANPD para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/processo-guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte.pdf).

Regras para o catálogo documental:

1. Não copiar PDFs aleatórios da internet para produção.
2. Registrar origem, licença, versão, jurisdição, setor e responsável pela validação de cada modelo.
3. Converter modelos aprovados em templates estruturados, não em arquivos opacos.
4. Preservar o snapshot exato enviado/assinado e o histórico de alterações.
5. Exibir aviso de revisão técnica/jurídica e exigir aceite humano para documentos regulados.
6. Normas ABNT devem ser referenciadas/licenciadas; seu conteúdo não será reproduzido sem autorização.

## 4. Resultado do Conselho LLM

Foi aplicado um conselho com cinco perspectivas independentes e uma segunda rodada de revisão cruzada anônima.

### 4.1 Cinco perspectivas

| Perspectiva | Parecer essencial |
|---|---|
| Contrarian | Fazer C somente de modo aditivo. Exigir baseline, inventário de `user_id`, tenancy/outbox, flags, métricas, restore e critérios de corte. |
| First Principles | Adotar invariantes: `organization_id`, autorização no servidor, Postgres como verdade, SQLite como réplica operacional, comandos idempotentes e documentos versionados. |
| Expansionist | Usar HVAC/PMOC como primeiro pacote do kernel e diferenciar no fluxo evidência → documento → preço → recorrência → inteligência. |
| Operator | Trabalhar em quatro blocos por semana, reservar quota, manter V1 como fallback e parar diante de falha de isolamento, perda ou consumo excessivo. |
| Customer/Outsider | Medir valor cotidiano: orçamento em minutos, visita offline sem perda, laudo rápido, aprovação sem conta e compreensão do preço/próximo passo. |

### 4.2 Revisão cruzada anônima

Os três revisores escolheram a proposta arquitetural baseada em invariantes e strangler interno como a mais forte. Eles também concordaram que:

- três semanas não equivalem a prontidão de produção;
- tenancy e sync precisam ser provados antes de ampliar a fatia HVAC;
- coexistência de versões V1/V2 é um risco próprio e precisa de protocolo versionado;
- faltavam responsáveis humanos, dados sintéticos, pesquisa de campo consentida e gates externos;
- o orçamento deve reservar capacidade para diagnóstico, teste e correção.

### 4.3 Síntese final do conselho

**Concordância real:** núcleo V2 modular, mesmo repositório, migração vertical, V1 preservada, RLS/outbox/idempotência antes de expansão, HVAC como farol e métricas de usuário como aceite.

**Divergência real:** quão longe ir na semana 3. Uma posição defendia apenas `organization + cliente` em shadow mode; outra defendia o fluxo HVAC completo. A decisão combinada é: primeiro provar organização/isolamento/outbox e, somente se o gate ficar verde, adicionar uma trilha HVAC fina que reutilize telas e componentes existentes.

**Ponto cego corrigido:** V1 e V2 não podem escrever simultaneamente no mesmo agregado sem protocolo. Cada entidade migrada terá versão de schema/protocolo, owner da escrita, política de compatibilidade, telemetria de fallback e caminho para bloquear uma versão antiga insegura.

**Primeira ação recomendada:** congelar o baseline reproduzível, registrar a cota disponível e abrir os ADRs de tenancy, sync e convivência de versões antes de alterar a estrutura do repositório.

### 4.4 Registro de lentes e modelos

- síntese e decisão: agente central, raciocínio alto;
- First Principles, Expansionist e Customer/Outsider: GPT-5.6 Sol, reutilizado sequencialmente;
- Contrarian: GPT-5.6 Terra;
- Operator: GPT-5.6 Luna;
- revisão cruzada: Terra, Sol e Luna;
- tentativas econômicas com modelos gratuitos externos: uma recebeu `429` e outra não concluiu em tempo útil; não foram usadas como evidência final.

Esse registro evita afirmar economia que não foi comprovada. Modelos gratuitos continuam adequados para pesquisa sanitizada e não crítica, mas não ficam no caminho obrigatório da entrega.

## 5. Arquitetura-alvo C+

### 5.1 Princípios não negociáveis

1. `organization_id` em toda entidade de negócio multiempresa.
2. Autorização efetiva no servidor e RLS fail-closed; esconder botão não é segurança. O servidor deriva a organização da sessão/membership — um `organization_id` enviado pelo cliente nunca concede acesso.
3. Postgres/Supabase como verdade sincronizada; SQLite como réplica operacional local.
4. Escritas offline entram em outbox durável, idempotente e observável.
5. Conflitos têm política explícita por agregado; “última gravação vence” não é padrão universal.
6. Dinheiro usa unidade inteira ou decimal controlado, nunca float implícito.
7. Documento enviado ou assinado vira snapshot imutável e verificável.
8. Contratos compartilhados entre mobile, web, portal e Worker são versionados.
9. IA sugere, explica e detecta; ações sensíveis exigem confirmação humana.
10. Toda fatia nova é ativável/desativável e possui rollback ensaiado.

A base atual ainda usa, em diferentes pontos, isolamento por `user_id`/owner e funções auxiliares de visibilidade. A transição não será uma troca nominal de coluna. Cada tabela terá um ADR de ponte com chave atual, chave-alvo, fonte de verdade, mapeamento `owner_user_id ↔ organization_id`, backfill, corte, compatibilidade e critério de rejeição.

### 5.2 Fluxo lógico

```text
Mobile Expo ─┐
Web Vite ────┼──> contratos e núcleo de domínio compartilhados
Portal ──────┘                 │
                               ├──> adaptadores locais → SQLite + outbox
                               ├──> adaptadores remotos → Worker/Supabase + RLS
                               ├──> motor de documentos → template → snapshot → PDF/assinatura
                               ├──> motor de preço → custos → margem → contexto → recomendação
                               └──> gateway de IA → provedor gratuito/local/pago + avaliação

V1 ── feature flag/adapter ──> fallback temporário, sem dual-write invisível
```

### 5.3 Kernel comum e pacotes setoriais

**Kernel comum:** empresa, filial, usuários/papéis, clientes, locais, ativos, catálogo, orçamento, aprovação, OS, agenda, documentos, financeiro básico, portal, auditoria, integrações e gateway de IA.

**Pacote HVAC/PMOC inicial:** equipamentos e capacidade, ambientes, rotinas, periodicidades, checklists técnicos, fotos/medições, não conformidades, histórico, PMOC, laudos, manutenção preventiva/corretiva e alertas regulatórios.

**Pacotes posteriores:** elétrica, solar, segurança eletrônica, assistência técnica, limpeza/facilities, construção/reformas e outros. Um pacote poderá adicionar campos, checklists, cálculos e modelos sem duplicar o kernel.

### 5.4 Motor de documentos

O motor não será uma pasta de PDFs. Ele terá:

- catálogo de templates com setor, finalidade, origem/licença e status de validação;
- editor por blocos e variáveis da empresa, cliente, local, ativo, orçamento e OS;
- temas/branding da empresa parceira;
- regras condicionais e tabelas;
- preview web/mobile e geração determinística de PDF;
- versão do template e snapshot do conteúdo;
- trilha de envio, visualização, aceite e assinatura;
- exportação e portabilidade;
- revisão técnica/jurídica para modelos regulados.

Pacote inicial de modelos a pesquisar e estruturar:

1. orçamento simples, detalhado, por opção e recorrente;
2. proposta comercial e escopo técnico;
3. ordem de serviço, checklist e termo de conclusão;
4. contrato de prestação, manutenção preventiva/corretiva e SLA;
5. recibo, relatório fotográfico e laudo de visita;
6. ficha de equipamento, inventário e histórico;
7. PMOC, cronograma, registro de execução e não conformidade;
8. termo de aceite, autorização de serviço e evidências de assinatura.

#### Link público, aceite e assinatura

- token aleatório de pelo menos 128 bits, armazenado apenas como hash quando tecnicamente possível;
- expiração, revogação e reemissão explícitas;
- rate limit fail-closed e nenhum token em log, analytics ou cabeçalho de referência;
- `GET` nunca altera estado; mutações exigem ação explícita e proteção própria;
- testes após expiração/revogação para leitura e escrita;
- aprovação por link não será chamada de assinatura eletrônica qualificada;
- assinatura registra hash do PDF canônico, versão, identidade/método de autenticação, intenção, carimbo de tempo e evento imutável;
- o nível de assinatura aplicável será validado juridicamente por caso de uso.

### 5.5 IA transversal, não decorativa

A IA será plugável por provedor. O produto não dependerá de uma suposta API gratuita permanente.

Camadas obrigatórias:

- interface `AIProvider` para trocar modelo/provedor sem reescrever módulos;
- prompts, schemas e avaliações versionados;
- minimização e mascaramento antes de enviar dados a terceiros;
- isolamento por organização e proibição de misturar dados crus entre empresas;
- consentimento/finalidade para uso analítico;
- retenção por classe de dado, exportação/exclusão e registro de subprocessadores/transferência internacional;
- proibição padrão de usar dados de clientes para treino de terceiros sem base legal e autorização específica;
- defesa contra prompt injection em fotos, PDFs, comentários e templates não confiáveis;
- saída estruturada, limites de ferramentas e logs sem conteúdo sensível;
- confirmação humana para preço final, contrato, laudo, agenda, cobrança e comunicação;
- nenhuma ação externa ou compartilhamento é executado somente por sugestão do modelo;
- registro da sugestão, modelo, versão, evidência e decisão do usuário;
- fallback determinístico quando a IA falhar ou estiver indisponível;
- avaliação de vazamento cross-tenant e de aderência aos fatos antes de ativar um caso de uso.

Primeiros usos com retorno claro:

1. transformar evidências da visita em rascunho de laudo;
2. sugerir itens faltantes em orçamento/checklist;
3. explicar preço, margem e risco ao prestador;
4. resumir histórico do cliente/equipamento;
5. detectar anomalias e recorrências;
6. gerar linguagem clara para o cliente sem alterar fatos técnicos.

**Inteligência de precificação:** dados de outras empresas só entram como agregados protegidos. A recomendação deve mostrar amostra, região/setor comparável, faixa, confiança e razões. Não haverá exposição de orçamento individual, cliente, empresa ou técnico. Antes de benchmarking real serão definidos coorte mínima, anonimização, retenção, opt-out e revisão LGPD.

### 5.6 Decisão de monorepo/workspaces

Não será feita mudança estrutural ampla na primeira janela. Em worktree descartável, comparar:

- opção A: npm workspaces, migrando gradualmente o lock da webapp;
- opção B: pnpm workspace, com teste de linker isolado/hoisted e migração controlada do núcleo;
- opção C: manter layout físico atual e introduzir apenas pacote compartilhado de contratos com aliases/local dependency.

Só adotar workspaces se mobile, webapp, site e Worker instalarem, compilarem e testarem sem duplicação de React/React Native. Se o spike não ficar verde dentro da janela, usar C temporariamente. Arquitetura modular não depende de uma reorganização cosmética de pastas.

## 6. Política de cota e tokens

### 6.1 O que pode e não pode ser medido

A documentação atual da OpenAI informa que o consumo do Codex depende de plano, modelo, contexto, complexidade, raciocínio, velocidade e ferramentas; portanto, tarefas não podem ser convertidas com precisão em um número fixo de tokens. A conta possui janelas de cinco horas e semanal, e o estado exato deve ser lido em Settings/Usage. Fonte: [OpenAI — Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540).

Este plano usa duas métricas distintas:

1. **Cota real:** porcentagem mostrada no painel da conta. Essa é a autoridade.
2. **Envelope de tokens processados:** estimativa de input + output do agente central e auxiliares. Serve para controlar contexto, não representa cobrança nem garante equivalência com a cota.

Não há como este projeto remover o limite da conta. Reset, créditos ou upgrade dependem das opções exibidas pela OpenAI para o usuário. Nenhum reset será consumido automaticamente.

### 6.2 Regra de operação

Planejamento-base por semana:

- quatro janelas de consumo planejadas, cada uma com até 3h30 de trabalho ativo;
- 30 minutos para teste, checkpoint e handoff e 1 hora de reserva/encerramento em cada janela;
- máximo de 70% da janela de cinco horas consumido por trabalho planejado;
- reserva semanal de 25% a 35% para diagnóstico, correção e imprevistos;
- nenhuma janela reserva será usada para abrir escopo novo.

A janela de cinco horas é uma janela de consumo da conta, não uma exigência de trabalhar cinco horas contínuas. Se o painel semanal não comportar as quatro janelas dentro do teto, a onda para no último gate verde e continua após o reset; créditos ou resets nunca serão usados sem pedido explícito do proprietário.

Fórmula de teto por janela:

```text
orçamento_da_janela = menor(18% da cota semanal, 70% da cota de 5 horas)
```

No início e no fim de cada janela registrar:

| Campo | Início | Fim |
|---|---:|---:|
| restante da janela de 5h | preencher no painel | preencher no painel |
| restante semanal | preencher no painel | preencher no painel |
| modelo/raciocínio | registrar | registrar alterações |
| envelope bruto estimado | 0 | total da janela |
| gates concluídos | — | listar evidências |

### 6.3 Estimativa de tokens por onda

| Onda | Janelas | Envelope por janela | Total estimado | Teto da cota semanal | Reserva |
|---|---|---:|---:|---:|---:|
| 1 — Pesquisa | 4 | 50k–120k | **240k–400k** | 65% | 35% |
| 2 — Criação | 4 | 70k–140k | **320k–480k** | 70% | 30% |
| 3 — Execução | 4 | 90k–170k | **400k–600k** | 72% | 28% |
| **Total de três semanas** | **12** | — | **960k–1,48M** | não somar como se fosse uma única cota | — |

As faixas incluem leitura de contexto, raciocínio, agentes, comandos e resposta. Devem ser recalibradas a partir do consumo real do primeiro bloco; não são promessa de cobrança ou capacidade.

### 6.4 Gatilhos de economia e parada

- Ao atingir **50% da cota semanal antes de concluir metade dos gates**, parar fan-out, reduzir contexto e usar Luna/Terra em tarefas mecânicas.
- Ao atingir **70%–72% da cota semanal**, não abrir escopo; somente testar, corrigir, documentar e entregar handoff.
- Se restar **menos de 20% da janela de cinco horas**, criar checkpoint e encerrar o turno.
- Em **80% da cota semanal**, parada obrigatória, salvo correção necessária para deixar o repositório em estado seguro.
- Nunca cortar testes de isolamento, integridade, idempotência ou rollback para economizar tokens; cortar pesquisa adicional e amplitude funcional primeiro.

### 6.5 Roteamento econômico de modelos

| Trabalho | Modelo recomendado | Raciocínio |
|---|---|---|
| arquitetura, segurança, migrations difíceis e síntese final | GPT-5.6 Sol | alto |
| implementação normal, revisão e debugging | GPT-5.6 Terra | médio/alto |
| inventário mecânico, testes simples, organização e documentação | GPT-5.6 Luna | médio |
| pesquisa externa sanitizada e não crítica | modelo gratuito já provado, quando disponível | suficiente |

Limites por auxiliar:

- contexto sanitizado de 15k–25k tokens;
- saída de 150–600 palavras, salvo necessidade justificada;
- no máximo dois auxiliares simultâneos em criação/execução;
- logs de comandos limitados a 5k–10k tokens;
- agente central é o único que edita, decide e valida.

## 7. Onda 1 — Pesquisa — Semana 1

**Objetivo:** sair de opiniões e chegar a decisões verificáveis, sem alterar produção.

### Janela 1.1 — baseline, perguntas e cota

- Duração: janela de 5h; até 3h30 de trabalho ativo, 30 min de fechamento e 1h de reserva.
- Envelope: **55k–80k tokens**.
- Cota semanal alvo: até 16%.

Atividades:

1. registrar branch, HEAD, dirty tree, versões e comandos de teste;
2. preservar mudanças existentes; não reorganizar arquivos ainda;
3. consolidar fluxos atuais mobile/web/Worker/Supabase;
4. inventariar entidades dependentes de `user_id`, `owner_user_id` e pontos de tenancy;
5. inventariar `SECURITY DEFINER`, grants, `search_path`, políticas `USING`/`WITH CHECK`, RPCs e Storage;
6. abrir o ADR de ponte por tabela entre owner/usuário e organização;
7. criar ledger de cota e matriz de hipóteses;
8. definir dados sintéticos para testes.

Entregas:

- baseline reproduzível;
- mapa de dados e superfícies;
- matriz de autorização negativa para `SELECT`, `INSERT`, `UPDATE`, `DELETE`, RPC e Storage;
- lista de gates externos pendentes;
- perguntas de pesquisa priorizadas.

### Janela 1.2 — mercado, campo, documentos e regulação

- Duração: janela de 5h; até 3h30 de trabalho ativo, 30 min de fechamento e 1h de reserva.
- Envelope: **65k–110k tokens**.
- Cota semanal acumulada alvo: até 32%.

Atividades:

1. aprofundar concorrentes por jornada, não por quantidade de recursos;
2. catalogar os 20 documentos mais valiosos e suas fontes/licenças;
3. mapear requisitos PMOC, assinatura, LGPD e responsabilidade técnica;
4. preparar pesquisa de campo, roteiro, consentimento e baseline de tempo;
5. analisar dores de prestador solo, pequena equipe, técnico e cliente.

Pesquisa de campo mínima proposta — **amostra exploratória/de conveniência, não prova estatística da comunidade**:

- 2 sessões contextuais com o proprietário usando casos reais sanitizados;
- 5 prestadores/técnicos de climatização;
- 3 responsáveis por equipes pequenas/administrativo;
- 2 clientes que aprovam serviços B2B;
- 1 responsável técnico ou revisor jurídico/regulatório;
- opcional: 2 prestadores de outros setores para testar generalização.

O contato com terceiros exige lista/consentimento e autorização de comunicação específica. A pesquisa documental pode continuar sem esse gate. Os 13–15 encontros possíveis formam um baseline qualitativo de piloto; resultados não serão generalizados como representativos de todo o mercado.

Entregas:

- jobs-to-be-done e ranking de dores;
- baseline de tempo/retrabalho;
- mapa de jornada e oportunidades;
- ledger de origem/licença/validação documental.

### Janela 1.3 — spikes técnicos descartáveis

- Duração: janela de 5h; até 3h30 de trabalho ativo, 30 min de fechamento e 1h de reserva.
- Envelope: **70k–120k tokens**.
- Cota semanal acumulada alvo: até 48%.

Spikes em worktree/sandbox:

1. npm workspaces versus pnpm workspace versus layout atual modular;
2. outbox própria versus PowerSync para um agregado sintético;
3. políticas RLS por `organization_id` e testes cross-tenant;
4. convivência de protocolo V1/V2;
5. geração determinística de um documento versionado;
6. threat model de tenant, funcionário, link público e IA.

Critério: spike é descartável. Nenhuma dependência é adotada apenas porque a demonstração abriu.

Entregas:

- relatório de build/teste de cada opção;
- ADRs propostos;
- riscos, custos, lock-in e rollback;
- recomendação de arquitetura baseada em evidência.

### Janela 1.4 — conselho, síntese e go/no-go

- Duração: janela de 5h; até 3h30 de trabalho ativo, 30 min de fechamento e 1h de reserva.
- Envelope: **50k–90k tokens**.
- Cota semanal total máxima: **65%**.

Atividades:

1. confrontar pesquisa de campo/documental com os spikes;
2. fechar ADRs de tenancy, sync, versionamento, documentos e IA;
3. definir a fatia farol e a fatia mínima de segurança;
4. transformar o plano em backlog com dependências e responsáveis;
5. decidir continuar, ajustar ou parar.

**Gate de saída da Onda 1:**

- baseline e inventário reproduzíveis;
- arquitetura C+ justificada;
- fontes/licenças documentais rastreadas;
- protocolo V1/V2 e estratégia de rollback definidos;
- plano de pesquisa de campo e critérios quantitativos aprovados;
- cota dentro do teto;
- nenhuma escrita de produção.

Se o gate falhar, a semana 2 não começa com implementação ampla; usa-se a reserva para corrigir a decisão.

## 8. Onda 2 — Criação — Semana 2

**Objetivo:** criar o esqueleto real do núcleo V2 e seus harnesses, sem trocar a fonte de verdade em produção.

### Janela 2.1 — isolamento do trabalho e decisão de workspace

- Envelope: **70k–100k tokens**.
- Cota semanal alvo: até 17%.

Atividades:

1. criar snapshot/commit controlado da Etapa 1 ou worktree isolada, sem reset destrutivo;
2. executar o spike escolhido de workspace;
3. provar instalação/build/testes das quatro superfícies;
4. checar duplicações de React, React Native e módulos nativos;
5. adotar a estrutura somente se o gate ficar verde.

### Janela 2.2 — contratos e kernel de domínio

- Envelope: **80k–120k tokens**.
- Cota semanal acumulada alvo: até 35%.

Criar:

- IDs e contexto de organização;
- papéis/permissões e matriz de capacidades;
- contratos de cliente, local, ativo/equipamento e visita;
- tipos de dinheiro, data, documento, comando, evento e erro;
- schema/versionamento de protocolo;
- feature flags e telemetria mínima;
- testes de arquitetura impedindo imports indevidos.

### Janela 2.3 — dados, segurança e sincronização

- Envelope: **90k–140k tokens**.
- Cota semanal acumulada alvo: até 53%.

Criar em ambiente local/sandbox:

- migrations somente aditivas e compatíveis; correções de schema seguem por migration forward;
- políticas RLS deny-by-default;
- suite cross-tenant cobrindo CRUD, RPC, Storage, troca de empresa e revogação de membro;
- outbox/inbox idempotentes, com autorização revalidada no servidor quando cada comando é drenado;
- comando com `command_id`, ator, tenant derivado da sessão, versão esperada do agregado/protocolo e idempotency key;
- rejeição auditável, sem reparenting, para sessão revogada, membership inativo, tenant trocado ou protocolo bloqueado;
- política de conflito por agregado;
- tombstones, retries, backoff e dead-letter observável;
- ensaio de backup/restore;
- política de compatibilidade mínima de clientes V1/V2.

### Janela 2.4 — UX da fatia, documentos e IA em modo seguro

- Envelope: **80k–120k tokens**.
- Cota semanal total máxima: **70%**.

Criar:

- navegação mínima da fatia farol, sem menu de recursos inexistentes;
- componentes mobile-first e acessíveis;
- fixtures sintéticas e cenários E2E;
- pipeline template → snapshot → PDF para um documento simples;
- adapter de IA mock/gratuito, schema de saída e confirmação humana;
- dashboard técnico de flags, sync e fallback.

**Gate de saída da Onda 2:**

- builds/testes existentes continuam verdes;
- nenhum dado real cru usado em teste;
- RLS falha fechada e cross-tenant é negativo por padrão;
- migrations são aditivas e compatíveis; rollback do aplicativo ocorre por flag, correção de schema por migration forward e restore parte de backup válido testado;
- contratos são consumíveis por mobile/web/Worker;
- V1 não recebeu dual-write invisível;
- a fatia está atrás de flag e não foi publicada em produção.

## 9. Onda 3 — Execução — Semana 3

**Objetivo:** provar primeiro a fatia mínima de segurança (`organização + cliente/local + outbox/idempotência + testes`) e, somente com os gates verdes e capacidade disponível, ampliar para a fatia farol HVAC em ambiente controlado.

### Janela 3.1 — organização, cliente, local e equipamento em shadow mode

- Envelope: **90k–130k tokens**.
- Cota semanal alvo: até 18%.

Atividades:

1. integrar contexto de empresa ativa;
2. migrar um agregado não financeiro de cliente/local/equipamento;
3. medir leituras V1/V2 e divergências sem trocar produção;
4. validar permissões de administrador, funcionário e técnico;
5. provar criação/edição/exclusão lógica com dados sintéticos.

### Janela 3.2 — offline, outbox e dois dispositivos

- Envelope: **100k–160k tokens**.
- Cota semanal acumulada alvo: até 36%.

Atividades:

1. operar sem rede e reiniciar o app sem perder fila;
2. reconectar, repetir comando e provar idempotência;
3. simular conflito em dois dispositivos;
4. revogar o membro ou trocar a empresa enquanto há comando offline pendente e provar rejeição no servidor;
5. testar exclusão/tombstone, clock skew e retries;
6. medir tempo de sync, erro, fallback e recuperação.

Se não houver dois aparelhos reais autorizados/disponíveis, a simulação fica marcada como evidência parcial; não será chamada de aceite físico.

### Janela 3.3 — fatia farol HVAC, condicional

- Envelope: **110k–170k tokens**.
- Cota semanal acumulada alvo: até 54%.

Somente depois de 3.1 e 3.2 verdes e com pelo menos uma sessão planejada de capacidade restante:

1. abrir visita de um equipamento HVAC;
2. coletar checklist, fotos e observações offline;
3. registrar não conformidade;
4. gerar rascunho assistido de laudo;
5. criar orçamento corretivo com preço explicado;
6. gerar link/preview de cliente sem conta, com expiração, revogação, rate limit e token protegido;
7. preservar snapshot do documento e trilha de aceite.

Se tenancy/outbox não estiver verde, toda esta janela corrige a fundação. Não se corta segurança para demonstrar uma tela.

### Janela 3.4 — prova final, revisão e handoff

- Envelope: **100k–140k tokens**.
- Cota semanal total máxima: **72%**.

Executar:

- testes E2E da fatia;
- cross-tenant, autorização, link público e abuso;
- offline/restore/reinstalação conforme ambiente disponível;
- compatibilidade V1/V2 e rollback;
- revisão independente de segurança e QA;
- métricas de produto com usuários consentidos, se o gate humano existir;
- inventário de evidências, pendências e próxima fatia.

**Gate de saída da Onda 3:**

- a fatia mínima de segurança completa, demonstrável e reversível; a fatia HVAC é bônus condicionado aos gates;
- nenhuma leitura/escrita cross-tenant;
- nenhuma perda no cenário offline testado;
- comandos repetidos não duplicam efeitos;
- documento reproduzível e auditável;
- V1 permanece funcional;
- rollback acionável;
- métricas e limitações declaradas;
- produção continua bloqueada até autorização específica.

### Cadeia formal de gates

| Gate verde exigido | Libera | Se falhar |
|---|---|---|
| 1.4 — pesquisa, ADRs e baseline | 2.1 | usar reserva para corrigir decisão; não criar kernel amplo |
| 2.1 + 2.2 — workspace/contratos | 2.3 | manter layout atual e corrigir contratos/builds |
| 2.3 — RLS, tenancy, outbox, restore | 3.1 e 3.2 | bloquear execução funcional |
| 3.1 + 3.2 — isolamento e offline | 3.3 | converter 3.3 em correção da fundação |
| todos os anteriores | 3.4 | não declarar piloto concluído |

## 10. Critérios de valor para o piloto

Metas iniciais a validar, não números já comprovados:

| Jornada | Meta de experiência |
|---|---:|
| primeiro orçamento com cadastro mínimo | menos de 5 minutos |
| visita offline | zero perda e zero redigitação obrigatória |
| laudo após concluir visita | menos de 2 minutos para gerar rascunho |
| aprovação do cliente sem conta | menos de 1 minuto |
| compreensão do orçamento | cliente identifica preço, escopo, exclusões e próximo passo |
| retorno do prestador | uso semanal em tarefa real |
| recomendação de preço | faixa, amostra, confiança e razões visíveis |

Métrica bonita não substitui entrevista. Para cada tarefa será registrado tempo, erro, hesitação, retrabalho, confiança e decisão de continuar/abandonar.

## 11. Responsáveis e gates humanos

| Responsabilidade | Dono |
|---|---|
| prioridade de negócio e aceite das ondas | proprietário da OLLI |
| síntese, alterações locais, testes e evidências | agente central Codex |
| pesquisa/inventário/revisão sanitizada | auxiliares aprovados, somente leitura quando externos |
| PMOC, laudos e responsabilidade técnica | profissional habilitado indicado pelo proprietário |
| contratos, termos, assinatura e LGPD | revisão jurídica/privacidade indicada pelo proprietário |
| entrevistas e piloto | participantes consentidos + proprietário |
| produção, banco real, deploy, domínio, cobrança e mensagens | autorização específica do proprietário |

“Autorização total” para planejar e implementar localmente não substitui consentimento de terceiros, credenciais, responsabilidade técnica, publicação, cobrança ou alteração de produção.

## 12. Cinco riscos prioritários e suas travas

### Risco 1 — big-bang disfarçado de “núcleo V2”

**Sinal:** muitos pacotes/telas criados antes da primeira fatia completa.

**Trava:** limite de uma fatia, feature flags, backlog posterior e gate por valor.

### Risco 2 — vazamento entre empresas ou perda offline

**Sinal:** consulta sem `organization_id`, cache global, retry duplicando escrita ou conflito silencioso.

**Trava:** RLS fail-closed, testes negativos, outbox idempotente, dados sintéticos e parada imediata.

### Risco 3 — corrupção pela convivência V1/V2

**Sinal:** duas versões escrevendo o mesmo agregado com contratos diferentes.

**Trava:** owner de escrita, protocolo versionado, compatibilidade mínima, telemetria e rollback.

### Risco 4 — quota consumida sem evidência

**Sinal:** re-leitura ampla, agentes repetindo trabalho, logs gigantes ou pesquisa sem pergunta.

**Trava:** ledger de uso, contexto mínimo, output limitado, gates e reserva de 25%–35%.

### Risco 5 — IA ou template aparentar autoridade técnica/jurídica

**Sinal:** documento automático sem fonte, revisão ou rastreabilidade; preço “mágico”.

**Trava:** proveniência, versões, explicação, confiança, confirmação humana e validação profissional.

## 13. Critérios de parada, rollback e retomada

Parada imediata diante de:

- qualquer falha cross-tenant;
- perda ou duplicação de dados;
- migration sem rollback/restore verificável;
- uso de dados reais fora da finalidade/consentimento;
- dependência que quebre build mobile/web;
- consumo de 80% da cota semanal;
- gate técnico, jurídico ou de participante tratado como aprovado sem evidência.

Rollback mínimo:

- branch/worktree e checkpoint por onda;
- migrations aditivas, nunca destrutivas neste ciclo;
- feature flags desligáveis;
- V1 preservada;
- snapshots de schema e dados sintéticos;
- runbook de restauração testado;
- relatório do que foi ativado, desativado e como retomar.

## 14. Sequência 0–100 depois deste ciclo

As três semanas são a primeira célula de execução. Depois delas, o padrão Pesquisa → Criação → Execução é repetido por fatia, nesta ordem:

1. **Fundação:** multiempresa, RBAC, auditoria, sync e contratos compartilhados.
2. **Comercial:** cliente/local, catálogo, orçamento, opções, aprovação, OS e recorrência.
3. **Campo HVAC:** ativos, agenda, visita offline, checklist, evidência e histórico.
4. **Documentos:** editor, PDFs, contratos, laudos, PMOC, assinatura e portal.
5. **Precificação:** custos, hora produtiva, margem, impostos, risco, região e benchmarking protegido.
6. **Equipe:** login individual, papéis, permissões, metas, agenda e supervisão administrativa.
7. **Integrações:** calendário, WhatsApp/e-mail autorizados, pagamentos sandbox, contabilidade e webhooks.
8. **IA transversal:** assistentes avaliados em cada módulo, memória organizacional consentida e aprendizado com feedback.
9. **Pacotes setoriais:** elétrica, solar, segurança, facilities, assistência e outros.
10. **Prontidão de produção:** dispositivo real, RLS publicado, restore, observabilidade, segurança, jurídico, piloto e release gradual.

Nenhum item será chamado de concluído só porque a interface existe. Conclusão exige fluxo, dados, teste, segurança, evidência e aceite.

## 15. Próximo passo após o aceite deste plano

Iniciar a **Janela 1.1 da Onda 1** com três ações, nesta ordem:

1. registrar a cota real de cinco horas e semanal mostrada no painel;
2. congelar o baseline reproduzível sem apagar nem sobrescrever mudanças existentes;
3. abrir os ADRs e o inventário de tenancy/versionamento que governarão todo o restante.

O primeiro checkpoint deve terminar com artefatos verificáveis, consumo registrado e uma decisão explícita: continuar, ajustar ou parar.

## 16. Validação independente deste plano

Uma revisão de consistência confirmou as somas dos envelopes e apontou duas contradições, já corrigidas neste texto:

- trabalho ativo por janela reduzido para 3h30, mantendo 30 minutos de fechamento e 1 hora de reserva;
- Onda 3 limitada a 72% da cota semanal, em quatro blocos de até 18%, com 28% de reserva;
- gates encadeados formalmente;
- fatia HVAC transformada em expansão condicional, não obrigação que sacrifica segurança.

Uma revisão independente de segurança não confirmou achado crítico no plano, mas identificou quatro lacunas altas, também incorporadas:

- ponte explícita entre tenancy atual por owner/usuário e `organization_id`;
- autorização revalidada pelo servidor ao drenar cada comando offline;
- requisitos para token público, aceite e assinatura;
- retenção, subprocessadores, prompt injection, cross-tenant e migration forward para IA/LGPD/rollback.

Validação local final exigida antes do aceite: ausência de segredos no documento, ausência de whitespace inválido, totais matemáticos corretos e estado Git preservado. Como a alteração é exclusivamente documental, builds do aplicativo não fazem parte do gate desta entrega; serão executados nos spikes e ondas de criação.
