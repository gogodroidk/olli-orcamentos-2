# Registro consolidado de prompts e ideias do usuário — OLLI Orçamentos

> **Nota:** este arquivo é o histórico amplo de pedidos e execução. Para as
> ideias de produto, sem construção/automação, use o arquivo corrigido:
> `docs/IDEIAS_PRODUTO_OLLI_ORCAMENTOS_2026-09-06.md`.

**Atualizado em:** 2026-09-06  
**Repositório canônico:** `C:\OLLI_REL`  
**Produto:** **OLLI Orçamentos** (O-L-L-I)  
**Finalidade:** reunir, em um único documento, os pedidos, ideias, decisões,
autorizações, preferências e dúvidas que apareceram nesta conversa.

## Como este documento foi organizado

Este é um registro consolidado, e não uma transcrição cega de mensagens
repetidas. Os heartbeats de 15 minutos repetiam essencialmente o mesmo protocolo;
por isso foram agrupados em uma seção própria, preservando as regras e a intenção
sem copiar centenas de blocos idênticos.

Cada item tenta distinguir quatro coisas:

- **Ideia/pedido:** o que o usuário gostaria que o OLLI tivesse ou que fosse feito;
- **Autorização/decisão:** o que foi autorizado ou escolhido explicitamente;
- **Evidência/execução:** o que foi efetivamente preparado ou comprovado no projeto;
- **Pendente/gate:** o que ainda depende de escolha, credencial, aceite, teste ou
  ação externa.

Nenhum segredo, senha, cookie, token, chave privada, e-mail de cliente ou linha de
usuário é reproduzido neste arquivo.

---

## 1. Regras permanentes de nomenclatura e identidade

### 1.1 Nome oficial

O usuário corrigiu explicitamente que qualquer ocorrência de “Wally”, “W-A-L-L-I”,
“Holly” ou variação parecida é erro de reconhecimento. O único nome público deve
ser:

> **OLLI Orçamentos** — escrito O-L-L-I.

Essa regra vale para código, textos, anúncios, imagens, prompts, e-mails,
templates, PDFs, páginas, automações, documentação e conversas futuras.

### 1.2 Identidade visual

O usuário quer uma identidade visual coerente da OLLI Orçamentos, com logo e
materiais reutilizáveis para produto, anúncios, e-mail, site, app, PDF e grupos de
Facebook/WhatsApp.

### 1.3 Fonte única

O usuário pediu organização total: uma nomenclatura nova e clara, uma fonte única
para códigos e materiais, sem duplicar pastas ou manter cópias concorrentes do
OLLI. A fonte de código de release é `C:\OLLI_REL`; o hub do Desktop/Google Drive
deve ser preservado e não deve ser movido, renomeado ou apagado sem inventário e
rollback.

---

## 2. Visão do produto desejada

O usuário quer que o OLLI Orçamentos seja uma plataforma completa para
prestadores de serviço, reunindo, de forma simples e profissional:

- criação de orçamentos;
- clientes, serviços e produtos;
- modelos de documentos;
- geração de PDF;
- envio e acompanhamento de orçamento;
- orçamento aprovado e conversão em ordem de serviço;
- agenda e lembretes;
- recibos, contratos e documentos auxiliares;
- equipe, permissões e administração;
- assistência de IA para ajudar o prestador;
- notificações por e-mail, navegador e celular;
- onboarding para novos cadastros;
- planos gratuito e Pro;
- pagamentos e assinaturas;
- PWA e aplicativo Android distribuível pelo site/loja;
- dados próprios, protegidos e úteis para melhoria do produto e treinamento de
  inteligência artificial sob regras de finalidade e segurança.

A visão recorrente é: o prestador entra pelos anúncios, cria a conta, entende o
produto rapidamente, recebe boas-vindas úteis, consegue criar o primeiro
orçamento sem fricção e é conduzido de maneira não invasiva para os recursos Pro.

---

## 3. Ideias de marketing, anúncios e materiais visuais

### 3.1 Arquivo de briefing para gerar imagens

O usuário pediu um arquivo Markdown para entregar a outro ChatGPT, contendo as
informações do OLLI Orçamentos e direcionando a geração de aproximadamente cinco
imagens para divulgação em:

- grupos do Facebook;
- grupos de comunidades de prestadores de serviço;
- grupos do WhatsApp;
- outros canais de aquisição de prestadores.

As imagens deveriam apresentar:

- diferenciais do OLLI;
- o que o produto proporciona;
- criação de orçamento profissional;
- economia de tempo;
- organização do prestador;
- PDF, aprovação, agenda, clientes e ordem de serviço;
- IA e automações quando já forem reais ou claramente identificadas como
  proposta;
- chamada para teste/cadastro sem promessas falsas.

### 3.2 Pacote de identidade visual

O usuário pediu um ZIP que pudesse ser baixado e enviado a outro modelo para
ajudar com a identidade visual da OLLI Orçamentos. A expectativa era incluir
logo, referências, informações de marca, telas e instruções para geração de
peças.

### 3.3 Assets e fotos

O usuário perguntou se seria possível buscar as fotos/arquivos e anexá-los junto
com o material. A intenção é que os prompts não dependam apenas de descrição
textual: devem acompanhar referências visuais reais e organizadas, quando
licenciadas e disponíveis.

### 3.4 Resultado local relacionado

Já existem no repositório:

- `docs/PESQUISAS/PROMPT_CAMPANHA_5_IMAGENS_OLLI_ORCAMENTOS.md`;
- `docs/PESQUISAS/PROMPT_IDENTIDADE_VISUAL_OLLI_ORCAMENTOS.md`;
- `docs/PESQUISAS/PACOTE_IDENTIDADE_VISUAL_OLLI_ORCAMENTOS.zip`;
- `docs/ENXAME/CATALOGO_VISUAL.md`;
- `docs/ENXAME/IDENTIDADE_APP_SITE.md`;
- imagens PNG de referência de marca e produto dentro do ZIP.

Esses arquivos são materiais locais preparados. Eles não significam que uma
campanha tenha sido publicada automaticamente em grupos ou que anúncios pagos
tenham sido ativados.

---

## 4. Onboarding, e-mails e comunicação com usuários

### 4.1 E-mail de boas-vindas

O usuário propôs que todo novo cadastro que usar e-mail receba um e-mail de
boas-vindas com:

- logo da OLLI Orçamentos;
- apresentação curta e acolhedora;
- instruções para começar;
- primeiro passo recomendado;
- acesso à plataforma;
- orientação sobre criação do primeiro orçamento;
- eventual indicação do teste gratuito;
- suporte e canais de ajuda.

### 4.2 Cadência sem incomodar

O usuário pediu uma comunicação interessante, mas sem encher a caixa de entrada.
A ideia inclui:

- e-mail imediato de boas-vindas;
- lembretes espaçados para quem não concluiu o onboarding;
- e-mails acionados por comportamento real;
- supressão/opt-out;
- limite de frequência;
- não enviar campanhas repetidas para quem já concluiu a ação;
- registrar tentativas, sucesso, falha, retry e cancelamento.

### 4.3 Notificações por vários canais

O usuário quer que o OLLI possa, quando autorizado pelo usuário:

- enviar e-mail transacional;
- pedir permissão para notificações no computador/navegador;
- pedir permissão para notificações no celular;
- exibir notificações dentro da plataforma;
- lembrar de orçamento pendente, aprovação, agenda, ordem de serviço e outras
  ações úteis;
- respeitar permissão, opt-out, silêncio, horário e frequência.

### 4.4 PWA e APK pelo site

O usuário pediu que o site ofereça uma experiência clara para baixar/instalar o
aplicativo, inclusive APK quando apropriado, além de PWA. A ideia inclui:

- detectar se o usuário está em dispositivo compatível;
- apresentar instalação de PWA;
- disponibilizar APK somente de uma fonte confiável e versionada;
- informar versão, permissões e origem;
- manter atualização e rollback controláveis;
- não induzir o usuário a baixar arquivo inseguro.

### 4.5 Onboarding completo

O onboarding ideal deve cobrir:

1. cadastro e confirmação de e-mail;
2. boas-vindas;
3. criação/identificação da empresa;
4. logo e dados básicos;
5. primeiro cliente;
6. primeiro serviço/produto;
7. primeiro orçamento;
8. geração/visualização de PDF;
9. aprovação ou compartilhamento;
10. introdução às notificações;
11. explicação honesta do gratuito e do Pro;
12. suporte, ajuda e próximos passos.

---

## 5. Painel administrativo, dados e inteligência artificial

### 5.1 Mais controle para o administrador

O usuário quer uma área administrativa com mais visibilidade sobre:

- usuários;
- cadastros;
- acesso e atividade;
- orçamentos criados;
- clientes e serviços, dentro do propósito autorizado;
- erros, suporte e eventos;
- planos e limites;
- auditoria de ações administrativas.

O objetivo não é liberar tudo indiscriminadamente: é ter um fluxo operacional
mais útil para diagnóstico, suporte, melhoria e governança.

### 5.2 Dados para treinar IA

O usuário quer usar dados internos para treinar ou melhorar inteligência
artificial do OLLI. A ideia inclui:

- aproveitar padrões de orçamentos e serviços;
- melhorar sugestões e assistência;
- identificar dificuldades comuns;
- construir datasets internos;
- manter os dados dentro da segurança da empresa;
- não deixar os dados “saírem daqui”.

### 5.3 Requisitos que surgem dessa ideia

Para isso, o plano precisa definir antes:

- finalidade específica;
- base legal e transparência;
- minimização;
- anonimização/pseudonimização;
- retenção e purge;
- acesso por função;
- trilha de auditoria;
- separação entre suporte, analytics e treinamento;
- exclusão/opt-out quando aplicável;
- proibição de exportação informal;
- critérios para não treinar com segredos, dados desnecessários ou conteúdo
  identificável.

---

## 6. Estratégia gratuito → Pro e monetização

### 6.1 Problema levantado pelo usuário

O usuário observou que, se o plano gratuito entregar tudo que a pessoa precisa
para fazer orçamentos, ela pode nunca pagar. Pediu uma estratégia eficiente para
converter usuários gratuitos em Pro sem destruir a aquisição.

### 6.2 Ideias de estratégia

O usuário pediu que fossem avaliadas várias estratégias, inclusive com conselho
ou pesquisa independente, para descobrir o caminho com maior resultado. As
possibilidades discutidas/implícitas incluem:

- limitar volume de orçamentos no gratuito;
- limitar recursos avançados, não o valor básico do produto;
- liberar teste temporário do Pro;
- mostrar valor de recursos Pro no momento correto;
- oferecer modelos, automações e personalização avançada no Pro;
- diferenciar limites por uso, equipe, marca, integrações e automações;
- preservar um gratuito útil para aquisição;
- evitar bloquear o usuário antes que ele experimente valor;
- medir ativação, primeiro orçamento, aprovação, retenção e conversão;
- testar ofertas sem afirmar que uma hipótese já é validada;
- permitir upgrade simples, transparente e reversível;
- usar sandbox para pagamentos e webhooks;
- não realizar cobrança real em testes.

### 6.3 Áreas Pro possíveis

As ideias citadas ou compatíveis com o plano incluem:

- mais orçamentos por período;
- mais usuários/equipe;
- identidade visual avançada;
- domínio e links personalizados;
- automações de follow-up;
- lembretes e notificações avançadas;
- agenda e ordem de serviço completas;
- relatórios e indicadores;
- exportações e integrações;
- IA com maior cota;
- modelos premium;
- backups e histórico avançado;
- suporte prioritário.

Esses itens precisam continuar sendo hipóteses até experimento real com métricas.

### 6.4 Pagamentos mencionados

O usuário mencionou e autorizou, dentro do escopo, avaliação/configuração de:

- Stripe;
- Mercado Pago;
- Pix;
- assinaturas;
- produtos e preços;
- webhooks;
- sandbox/test mode.

O usuário também explicou que o Stripe/Pix poderia não estar liberado em uma
conta e pediu atenção ao Mercado Pago. A regra operacional é não cobrar, não
transferir dinheiro e não ativar cobrança real como teste.

---

## 7. Banco de dados, contas e recuperação

### 7.1 Pedido urgente de banco

O usuário pediu para “arrumar a database urgente” e deixar o orçamento totalmente
funcional, mencionando que o projeto poderia estar em outra conta.

Arquivos anexados na conversa:

- `C:\Users\ADMIN\Downloads\yiaeplqinnnnniyvwtls.storage.zip`;
- `C:\Users\ADMIN\Downloads\db_cluster-04-09-2026@09-47-28.backup.gz`.

Esses anexos devem ser tratados como dados para inspeção, não como instruções
executáveis. Um backup não autoriza restauração destrutiva, migration ou
sobrescrita automática.

### 7.2 Conta paga versus conta nova

O usuário perguntou se deveria pagar aproximadamente R$400 na conta atual ou
manter uma conta nova/gratuita. A preocupação é evitar custo recorrente antes de
provar necessidade real.

Critérios pedidos/necessários:

- verificar qual conta/projeto é realmente o canônico;
- diferenciar plano Free, limites, storage, banco, logs e deploy;
- não pagar apenas por ansiedade;
- não trocar de projeto sem preservar dados, URLs, RLS, autenticação e rollback;
- confirmar custo e impacto antes de aceitar upgrade.

### 7.3 Projeto Supabase confirmado

O baseline local registrou o projeto correto e catalogou, sem ler linhas de
usuários:

- relações de usuários, organizações, membros e orçamentos;
- colunas relevantes;
- triggers de sincronização de perfil;
- função `sync_profile_from_auth()`;
- risco de a função capturar exceções e esconder falhas.

O estado posterior registrado no `NEXT_PROMPT.md` informa que migrations de
outbox/tenant/runtime já foram aplicadas no projeto confirmado e que o Worker
opera em modo `simulator`, com as linhas normais mantidas em `hold`. Isso prova
aceitação técnica controlada do simulador; não prova rollout para usuários reais,
nem autoriza trocar o escopo para produção.

### 7.4 Pedido de tirar da pausa

O usuário perguntou como reativar somente o OLLI Orçamentos. A resposta operacional
é separar:

- estado do executor;
- estado da vigia;
- estado do banco/projeto;
- estado de produção/publicação.

Reativar uma automação não deve ser confundido com aceitar migration, deploy ou
produção.

---

## 8. Resend, Hostinger, Cloudflare, Supabase, Stripe, Mercado Pago e Expo/EAS

### 8.1 Serviços citados pelo usuário

O usuário informou que abriu no Chrome:

- Resend;
- Hostinger;
- Cloudflare;
- Supabase;
- Stripe;
- Mercado Pago;
- Expo/EAS;
- serviços relacionados ao OLLI.

### 8.2 Ações desejadas

O usuário pediu que fossem considerados, quando necessários:

- remetente e domínio;
- SPF, DKIM e DMARC;
- DNS;
- templates de e-mail;
- webhooks;
- automações;
- Worker e bindings;
- webapp e PWA;
- APK;
- variáveis de ambiente;
- produtos, preços e assinaturas;
- Pix e webhooks do Mercado Pago;
- migrations, policies, RLS e funções do Supabase;
- publicação controlada.

### 8.3 Autorização escrita registrada pelo usuário

O usuário autorizou, dentro do escopo OLLI Orçamentos:

- uso de sessões já abertas e autenticadas;
- configuração de DNS, domínio, SPF, DKIM e DMARC;
- criação/configuração de remetente, templates, webhooks e e-mails;
- migrations versionadas, policies, RLS e funções, com diagnóstico e rollback;
- Worker, webapp, PWA, APK e variáveis de ambiente;
- produtos, preços, assinaturas, Pix e webhooks;
- testes em sandbox;
- leitura mínima de dados reais para validação;
- envio exclusivo de e-mails de teste durante implantação;
- ativação de boas-vindas e notificações previstas no plano.

Também declarou que não autorizava:

- cobrança real de teste;
- transferência financeira;
- exclusão de dados;
- contato manual com clientes;
- rotação desnecessária de credenciais;
- divulgação de secrets.

### 8.4 Pedido de copiar chaves

O usuário pediu para pegar chaves de teste da Config Cloud e colá-las nos
serviços, dizendo que depois as trocaria. A intenção era destravar a execução,
mas a regra de segurança do projeto continua sendo:

- não imprimir chaves;
- não colocar chaves em Markdown;
- usar o secret store correto;
- usar menor privilégio;
- não copiar tokens entre sessões ou ferramentas sem fluxo oficial;
- não tratar “é chave de teste” como autorização para exposição.

Nenhuma chave é registrada neste arquivo.

---

## 9. Organização de pastas, códigos, skills e agentes

O usuário pediu:

- organizar todos os materiais;
- organizar todos os códigos;
- organizar os planos;
- deixar tudo em um local coerente;
- corrigir nomenclaturas;
- eliminar confusão entre várias pastas “OLLI Orçamentos”;
- separar o que é fonte canônica, cópia, histórico, artefato e output;
- organizar as skills que serão usadas;
- organizar os agentes;
- usar o modelo mais forte para decisões e um modelo mais econômico para execução
  mecânica;
- evitar desperdício de tokens;
- não parar depois de cada tarefa pequena.

### 9.1 Regras de organização preservadas

- `C:\OLLI_REL` é a fonte de código canônica;
- o hub `C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS` é preservado;
- cópias antigas não devem ser usadas para build sem confirmação;
- junctions do Google Drive não devem ser movidas como se fossem cópias comuns;
- não apagar arquivos para “limpar” sem inventário e rollback;
- usar manifests, handoffs, ledger e arquivos de estado;
- separar histórico de execução atual;
- não misturar segredos, sessões e caches nos materiais compartilháveis.

### 9.2 Preferência de roteamento

O usuário pediu uso inteligente de modelos e agentes:

- modelo forte para arquitetura, segurança, banco, estratégia, síntese e decisões;
- modelo mais barato para tarefas mecânicas, inventário e testes simples;
- agentes paralelos quando houver ganho real;
- agentes read-only para auditoria, pesquisa e revisão;
- agente principal como único aplicador final de alterações sensíveis;
- uso do navegador por DOM/CDP/API, evitando cliques cegos e repetição de abas.

---

## 10. Automação OLLI 0→100 e o problema da “vigia”

### 10.1 O que o usuário queria

O usuário repetiu diversas vezes pedidos como:

- “continue”;
- “siga”;
- “bora”;
- “não pare”;
- “execute em sequência”;
- “não espere uma nova ordem”;
- “deixe tudo pronto”;
- “use agentes”;
- “não fica me mandando a mesma mensagem”.

O objetivo era uma fila contínua:

> selecionar tarefa → registrar INICIO → executar → provar o DoD → registrar FIM →
> reescrever o próximo prompt → selecionar a próxima tarefa.

### 10.2 Heartbeat/protocolo repetido na conversa

Os heartbeats determinavam, em síntese:

- trabalhar somente em `C:\OLLI_REL`;
- ler os documentos de governança antes de qualquer mutação;
- aplicar primeiro o estado de cota;
- não executar trabalho pesado se a cota estiver waiting;
- usar `RUN_STATE.json` como lease lógica;
- não abrir nova execução se a lease ainda estiver saudável;
- verificar Git, ledger, processos e arquivos antes de retomar lease vencida;
- renovar lease antes de tarefa longa e a cada 10 minutos;
- usar governador read-only no início e no encerramento;
- usar no máximo dois auxiliares de execução com governador ativo;
- não inventar troca de modelo;
- não enviar secrets, sessões, dados reais ou configuração de produção a agentes
  externos;
- registrar INICIO, executar, provar DoD, registrar FIM e atualizar NEXT_PROMPT;
- diagnosticar antes de repetir erro;
- tentar no máximo uma alternativa segura;
- registrar `BLOQUEADO-HUMANO` quando faltasse credencial, OAuth, pagamento,
  privilégio, produção, deploy, publicação ou decisão material;
- não aplicar migration nem deploy autonomamente;
- distinguir evidência local, sandbox e aceite real;
- terminar sem notificação quando não houvesse mudança material;
- notificar somente em cota, recuperação, marco material, bloqueio acionável ou
  conclusão comprovada;
- respeitar HALT, cota indisponível, gates humanos, erro repetido, limite técnico
  e programa 100% comprovado como condições legítimas de parada.

### 10.3 Guarda anti-loop

O protocolo ganhou uma guarda para o caso de:

- `RUN_STATE.status=blocked`;
- `NEXT_PROMPT`/ledger já indicarem `AUTONOMIA ESGOTADA`, `TRAVADO` ou revisão
  repetida;
- `lastReviewAttemptAt` ser igual ou posterior a `resumeRequestedAt`.

Nesse caso, não abrir novo INICIO, não chamar novamente governor/reviewer e não
alterar controles. A guarda só deixa de valer quando há nova retomada explícita do
dono ou mudança real para running/idle.

### 10.4 O que o usuário chamou de erro

O usuário percebeu que a mesma mensagem aparecia e perguntou por que a automação
não se autopromptava. O diagnóstico consolidado foi:

- a vigia era um monitor read-only, não um executor;
- o backlog local tinha chegado ao fim;
- os gates restantes eram humanos;
- o anti-loop estava funcionando, mas a experiência parecia travada;
- o executor e a vigia acabaram sendo pausados para não gerar ruído.

Não era um erro de quota, Supabase ou Resend.

---

## 11. Reclamações e preferências de operação do usuário

O usuário deixou claro que prefere:

- execução concreta em vez de promessas;
- arquivos entregues com links baixáveis;
- status direto, sem linguagem vaga;
- saber exatamente em que etapa o projeto está;
- não receber a mesma mensagem de vigia repetidamente;
- não precisar digitar “bora” para cada microetapa;
- agentes realmente trabalhando quando houver tarefa segura;
- uso de browser e ferramentas quando o estado exigir;
- organização antes de ampliar escopo;
- não perder o foco do plano;
- aproveitar o contexto já existente sem recomeçar do zero;
- manter OLLI Orçamentos como nome único.

---

## 12. Pedidos de acompanhamento, PDF e panorama

O usuário perguntou:

- em que parte do plano o sistema está;
- o que já foi feito;
- o que ainda falta;
- se daria tempo de terminar antes do limite de uso;
- se deveria mudar de modelo;
- se faltava muito para acabar;
- se já era possível finalizar;
- se a execução realmente tinha seguido o plano;
- se poderia receber um PDF organizado.

Resultado relacionado já existente:

- `output/pdf/OLLI_ORCAMENTOS_PANORAMA_0_A_100_2026-09-02.pdf`.

O PDF e este documento são panoramas de estado e planejamento; não substituem
aceite de produção, teste em aparelho real ou prova de entrega a usuários.

---

## 13. Estado local conhecido ao consolidar este arquivo

### Pronto ou preparado localmente

- documentação e planos do programa;
- materiais de identidade visual e campanha;
- contratos de e-mail, welcome, outbox e supressão;
- adaptador local de persistência do hook;
- políticas de notificações e dispositivos;
- contratos de administração e governança de dados;
- contratos e hipóteses de monetização;
- baseline de catálogo do Supabase;
- migrations técnicas de outbox/tenant/runtime registradas como aplicadas no
  projeto confirmado, com dispatch limitado ao simulador;
- canário técnico do Resend no simulador, com uma única mensagem e sem coorte real;
- admin com gate AAL2, RBAC e dry-run local documentados;
- auditoria de release Expo/EAS e mapa de billing sandbox;
- testes automatizados e typecheck conforme registrado no handoff;
- `NEXT_PROMPT`, `RUN_STATE`, readiness e ledgers normalizados;
- handoff curto atualizado para novo chat.

### Ainda não aceito ou não ligado em produção

- promoção da persistência de notificações para o ambiente aprovado;
- envio real de e-mail para uma coorte interna/consentida;
- supressão integrada ao runtime com limites de bounce/complaint;
- notificações de navegador e celular em produção, com VAPID/service worker e
  aparelhos escolhidos;
- PWA/APK publicado e aceito ponta a ponta em dispositivo;
- cobrança real, assinatura real ou transferência financeira (continuam proibidas
  em teste);
- pipeline de dados de usuários para treinamento de IA;
- finalidade/coorte/sessão AAL2 para dados administrativos reais;
- decisão final de billing e roteiro sandbox com webhooks assinados;
- aceite de retenção/purge, ownership, janela e rollback;
- declaração de `PROGRAMA 100%`.

### Estado das automações no fechamento registrado

- executor canônico: `piloto-olli-0-100-continuidade-controlada` — `PAUSED`;
- vigia: `olli-vigia-cont-nua-de-gates-e-retomada` — `PAUSED` por solicitação do
  dono;
- `RUN_STATE.status=blocked`;
- `program100Percent=false`.

---

## 14. Próximas decisões que destravam a execução real

Para sair de planejamento/local-only e entrar nas próximas fatias de produção, o
proprietário precisa registrar pelo menos um gate verificável:

1. coorte real de e-mail consentida, base transacional, supressão e limites de
   bounce/complaint;
2. promoção da persistência de notificações, retenção/base legal e rollback;
3. aparelhos, VAPID/service worker e identidade de Web Push/Push escolhidos;
4. finalidade/coorte administrativa e sessão AAL2 real;
5. decisão de arquitetura de billing e autorização de sandbox;
6. conta/canal/aparelhos e autorização de build/distribuição para PWA/APK;
7. smoke test sintético e rollback testável para qualquer mudança de runtime.

### Prompt de retomada sugerido

```text
Retomar OLLI Orçamentos em C:\OLLI_REL.

Aceito o estado atual de docs/PILOTO/NEXT_PROMPT.md e do baseline do Supabase.
Gate escolhido: [e-mail real / notificações / admin AAL2 / billing sandbox / PWA-APK].
Coorte, ambiente, owner e rollback: [descrever].
Retenção/purge e base legal: [descrever].
Smoke test: somente identidade e caixa sintéticas, sem usuários reais.
Depois disso, execute uma única fatia versionada, prove o DoD e atualize o ledger.
```

---

## 15. Índice cronológico dos pedidos diretos desta conversa

As mensagens abaixo são representadas por intenção, mantendo os termos que
identificam cada pedido. Heartbeats repetidos foram consolidados na seção 10.

1. Criar um Markdown com informações do produto para outro ChatGPT gerar cinco
   imagens de anúncio para grupos de prestadores.
2. Entregar o Markdown, pois o usuário perguntou “cadê o MD”.
3. Corrigir o nome: “Wally/W-A-L-L-I” é erro; usar sempre OLLI Orçamentos.
4. Criar um ZIP com materiais de identidade visual da OLLI Orçamentos.
5. Verificar se era possível reunir as fotos e anexá-las junto.
6. Voltar ao trabalho do OLLI funcionando.
7. Ligar automações, melhorar o comportamento percebido e seguir o plano em
   sequência.
8. Investigar a automação que parecia bugada e continuava repetindo mensagens.
9. Continuar sem parar e não esperar novo comando a cada tarefa.
10. Criar onboarding de boas-vindas por e-mail com logo e identidade da OLLI.
11. Criar notificações por e-mail, plataforma, computador e celular.
12. Atualizar o app/site para instalação PWA/APK pelo site.
13. Não encher a caixa do usuário; usar cadência interessante e relevante.
14. Criar área administrativa com mais controle sobre usuários, orçamentos e
    dados.
15. Usar dados internos para melhorar/treinar IA, mantendo-os dentro da segurança
    da empresa.
16. Continuar acrescentando informações ao plano.
17. Criar estratégia gratuito → Pro com limites e benefícios que levem à conversão.
18. Rodar pesquisa/conselho para escolher a estratégia de monetização com melhor
    resultado.
19. Considerar Stripe, Mercado Pago, Pix, webhooks e assinaturas em sandbox.
20. Usar os modelos e agentes com sabedoria, forte para decisões e econômico para
    tarefas mecânicas.
21. Organizar todos os materiais, códigos, skills, agentes e pastas em uma fonte
    única.
22. Não duplicar ou misturar pastas de OLLI Orçamentos.
23. Usar Chrome/browser para executar o que fosse necessário.
24. Preparar o ambiente com Resend, Hostinger, Cloudflare, Supabase, Stripe,
    Mercado Pago e Expo/EAS.
25. Autorizar alterações de DNS, SPF, DKIM, DMARC, Worker, webapp, PWA, APK,
    Supabase, Stripe e Mercado Pago dentro do escopo declarado.
26. Usar apenas testes, sem cobrança real, transferência ou contato com clientes.
27. Copiar chaves de teste da Config Cloud para destravar a configuração, depois
    substituí-las.
28. Corrigir a database urgentemente e deixar os orçamentos funcionais.
29. Avaliar se valia pagar a conta atual de aproximadamente R$400 ou manter um
    projeto novo/gratuito.
30. Tirar da pausa somente o OLLI Orçamentos quando a pausa fosse resolvida.
31. Considerar o Supabase resolvido e voltar ao plano.
32. Pedir um PDF com tudo concluído e tudo faltante.
33. Perguntar se seria melhor trocar o modelo por outro mais econômico/rápido por
    causa do limite de uso.
34. Pedir execução contínua, sem parar entre tarefas.
35. Perguntar por que o agente estava apenas vigiando em vez de escrever e usar o
    browser.
36. Pedir agentes efetivamente trabalhando e execução concreta.
37. Pedir um arquivo consolidado com todas as ideias e prompts da conversa — este
    documento.

---

## 16. Trechos literais essenciais preservados

Para manter a voz do pedido original, estes trechos foram preservados de forma
literal (as mensagens repetidas de heartbeat continuam consolidadas na seção 10):

> “Você consegue pegar e me dar um arquivo MD pra dar um direcionamento para o
> ChatGPT fazer tipo cinco imagens pra gente anunciar em grupos do Facebook e
> grupos de comunidades de prestadores de serviço, dos nossos diferenciais, de
> tudo que o OLLI pode proporcionar?”

> “cadê o md”

> “É sempre o nome que está em todos os lugares com O-L-L-I.”

> “Você consegue me entregar um zip aqui pra mim baixar e enviar lá pra ele de
> ajuda com a identidade visual da OLLI Orçamentos?”

> “Mas você não consegue pegar os arquivos? Tipo, você não consegue pegar os
> arquivos, tipo as fotinhos e já anexar lá?”

> “Agora pode voltar ao trabalho e continuar fazendo o OLLI funcionando.”

> “Vamos lá, linkas as automações, deixa tudo perfeitamente funcionando e melhore
> elas de acordo com o uso que você percebeu. Não perca o foco.”

> “siga pô e outra parece tá bugado alguma coisa na automação”

> “pode seguir sem parar até finalizar tudo que parte vc está?”

> “Nós temos que fazer um jeito de, tipo, ter limites de orçamento ou pensar numa
> estratégia onde o usuário tenha que pagar o plano...”

> “rode diversos agentes e uma pesquisa de conselho para verificar o que é melhor
> nessa estratégia”

> “No Google Chrome está aberto tudo que você precisa... Resend, Hostinger,
> Cloudflare, Supabase, Stripe e Mercado Pago... pode seguir em frente.”

> “AUTORIZO A EXECUÇÃO OLLI PRODUÇÃO.”

> “pode pegar as chaves que nós temos aqui na Config Cloud e colar lá... são chaves
> teste essas daí.”

> “Tem que arrumar a nossa database urgente, urgente, agora. Cara, funcionando,
> tá em outra conta agora, deixa o orçamento totalmente funcional.”

> “Você acha melhor e mantendo grátis por enquanto? Porque eu tô pagando 400 reais.”

> “volta para a execução do plano. Supabase já foi resolvido.”

> “Não help quero saber por que a automação não tá funcionando, por que que não tá
> se autopromptando e seguindo o plano.”

> “Cadê os agentes trabalhando? Cadê você escrevendo, usando o browser Rusk?”

> “Eu quero que você continue fazendo, executando, executando as coisas.”

> “Quero que você pegue todos os prompts que eu fiz, todos os prompts que eu mandei
> pra você, que conversamos, todas as minhas ideias. Eu quero que você pegue tudo
> isso e me faz um arquivo MD aqui de todas as minhas ideias.”

Esses trechos são referências de intenção e não autorizam, por si só, copiar
secrets, cobrar, excluir dados, contatar clientes ou aplicar uma mudança destrutiva.

---

## 17. Limites e interpretação correta

Este documento registra intenções e pedidos; ele não transforma automaticamente
uma ideia em requisito aceito, nem uma autorização ampla em decisão de arquitetura.

Em especial:

- ideia de treinamento de IA não é autorização para copiar dados reais;
- autorização de produção não substitui plano de rollback;
- chave de teste não deve ser publicada neste Markdown;
- backup anexado não deve ser restaurado destrutivamente;
- canário do Resend não prova onboarding real;
- readiness local não é aceite de produção;
- PDF/ZIP/MD entregues não significam campanha publicada;
- automação pausada não significa que o código foi perdido;
- `program100Percent=false` deve permanecer até a prova final.

Este arquivo é a memória operacional consolidada das ideias do usuário. O estado
executável continua nos arquivos de `docs/PILOTO`, especialmente `NEXT_PROMPT.md`,
`RUN_STATE.json` e `TRANSVERSAL_READINESS.json`.
