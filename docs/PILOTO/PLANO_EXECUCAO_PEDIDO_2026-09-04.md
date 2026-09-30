# Plano executável — pedido completo de 04/09/2026

## 1. Resultado de produto

A OLLI deixa de ser apresentada como uma coleção de telas e passa a funcionar
como o sistema operacional de quem vende por orçamento: captar o pedido, montar a
proposta, obter aprovação, executar, receber, comprovar, acompanhar a equipe e
repetir o ciclo. O foco comercial continua em prestadores de serviço, mas o núcleo
serve a qualquer profissional ou empresa que precise criar e acompanhar
orçamentos.

Este documento reconcilia o pedido do dono com o código existente e com o Plano
Mestre. `DONE_LOCAL` significa código e prova local; não significa integração
externa, publicação, cobrança, dispositivo real ou validação comercial.

## 2. Decisões agora adotadas

### Oferta e trial

- **Grátis permanente:** rascunhos, clientes, histórico e edição continuam
  disponíveis; até **5 orçamentos enviados ou PDFs emitidos por mês**, uma
  identidade padrão com marca discreta OLLI e 3 usos de IA por mês.
- **Pro:** orçamentos enviados/PDFs sem limite, remoção da marca OLLI, modelos e
  identidade avançados, automações, anexos, relatórios e IA ampliada.
- **Empresa:** tudo do Pro mais equipe conectada, papéis, auditoria e recursos de
  operação multiusuário. Só será anunciado como disponível quando essas
  permissões passarem pelo aceite.
- **Trial Pro:** 14 dias, uma vez por organização, sem cartão e sem cobrança
  automática. É opt-in e aparece depois do primeiro PDF/link ou ao atingir o
  limite do Grátis; ao terminar, a conta volta ao Grátis e nenhum dado é apagado.
- **Preço de trabalho:** R$ 39/mês no Pro e R$ 99/mês no Empresa, preservando o
  anual já cadastrado. Esses valores não serão chamados de “validados” antes de
  uma coorte real.
- O direito de arrependimento de 7 dias do CDC é comunicado separadamente; não é
  a duração do trial nem deve ser vendido como favor da OLLI.

O limite de cinco documentos enviados é uma decisão de experimento solicitada
pelo dono, não uma verdade de mercado. O experimento mede ativação, primeiro PDF,
retenção na terceira semana, limite atingido, trial iniciado, conversão e suporte.
Se a criação/envio cair ou a volta à planilha subir, o limite é desligado sem
apagar dados.

### Cadastro e onboarding

O cadastro pede e verifica telefone, mas consentimento de marketing permanece
separado. Antes de entrar nas áreas operacionais, a pessoa conclui um onboarding
retomável com:

1. nome da pessoa e telefone;
2. nome público do negócio;
3. autônomo ou empresa;
4. atividade principal e atividades secundárias;
5. cidade e UF;
6. identidade visual mínima;
7. primeiro serviço ou produto;
8. escolha entre guia passo a passo e exploração livre.

CPF/CNPJ e endereço fiscal tornam-se obrigatórios somente para recursos/documentos
que realmente dependem deles. Se a pessoa declarar empresa, o CNPJ passa a ser
obrigatório. Essa segmentação atende o requisito de negócio completo sem coletar
dado sensível desnecessário de todo autônomo.

### Permissões do aparelho

Não será pedido “tudo ao instalar”. Câmera, fotos, microfone, localização,
calendário e notificações são explicados e solicitados no momento em que o usuário
aciona a função. Negar uma permissão mantém alternativa manual e uma tela clara
para habilitá-la depois. Isso reduz abandono e respeita as políticas do Android e
iOS.

### IA operacional

A IA nunca recebe SQL, CRUD genérico ou uma ferramenta `delete_all`. Ela só pode
propor comandos tipados, por exemplo `orcamento.duplicar`,
`orcamento.atualizar_rascunho`, `status.transicionar`, `comprovante.anexar` e
`perfil.atualizar`. O servidor deriva organização e papel da sessão, valida campos,
mostra preview/diff, pede confirmação para qualquer efeito externo ou destrutivo,
usa chave de idempotência, grava antes/depois e oferece desfazer quando possível.
Cobrar, excluir em massa, mudar plano e enviar WhatsApp nunca são executados sem
confirmação humana específica.

## 3. Matriz de rastreabilidade

| Frente | Estado encontrado | Entrega local exigida | Gate externo |
| --- | --- | --- | --- |
| Landing principal | base forte, narrativa ainda estreita | promessa de ciclo completo, segmentos, público amplo, oferta coerente e imagens reais rotuladas | publicar e medir |
| Páginas por ofício | 7 rotas já geradas | conteúdo realmente distinto, prova específica e cross-links sem duplicação rasa | indexar e medir busca |
| Mobile + web reais | capturas reais do app, com dados demonstrativos | mais telas do painel e legendas “o que você vê/o que o cliente vê” | dados reais só com consentimento |
| Aquisição | estratégia dispersa | funil por origem/vertical, eventos e conteúdo útil | campanhas, contato e mídia paga |
| Grátis/Pro/Empresa | copy diz ilimitado; trial local parcial | fonte única de limites/oferta, 5 envios/mês, 14 dias Pro opt-in e downgrade preservando dados | sandbox billing e coorte |
| Cadastro/onboarding | mobile parcial; painel só e-mail/senha | telefone no cadastro e bloqueio operacional até perfil mínimo | OTP/SMS e políticas das lojas |
| Orçamentos | editar/revisar/clonar já existem | explicar regras, manter original e completar estados | nenhuma para domínio local |
| Pago/finalizado | ausente no orçamento | máquina de estados e indicadores coerentes | reconciliação automática futura |
| Comprovantes | recibo existe; anexo não | modelo, upload local seguro e ligação ao recebimento | Supabase Storage e antivírus |
| Dashboard financeiro | KPIs e “dinheiro parado” existem | renomear para “Oportunidades de receber”, explicar cálculo e separar pago/aberto | conciliação bancária futura |
| Equipe | convite/papel base | permissões por módulo/ação, proprietário irremovível e auditoria | envio real de convite |
| Configurações | tema/avatar parciais | nome, foto, e-mail, senha, telefone, tema e identidade em rotas óbvias | reautenticação/OAuth |
| IA | conversa/geração sem ações | executor por intenção com preview, confirmação, RBAC, log e undo | provedor pago e avaliação real |
| Agenda/alarme | agenda e notificação local parciais | calendário local, política de lembretes e fila idempotente | OAuth Google/push remoto |
| WhatsApp | `wa.me` manual | envio assistido e consentimento registrados | Meta Cloud API, template e cobrança |
| Fiscal/Sebrae/INSS | backlog | central de links oficiais com fonte, data e alerta de atualização | credenciamento NFS-e/Conecta |
| Open source | pesquisa concluída | ADR por integração e adaptadores atrás de portas | licença/infra de cada projeto |
| Agentes web | live 54/100 Ora, 49/100 Is Agentic | redirects/404/markdown/trust/JSON-LD/crawlers e instruções | deploy e rescan público |
| PWA | concluída | `DONE_LOCAL` em C1 | instalação em aparelho + deploy |
| Segurança | testes locais existentes | revisão independente final e correção dos achados | pentest/produção |

## 4. Arquitetura da landing

### O que será construído

A home será um mapa visual do ciclo de trabalho, não uma grade de features. O
visitante deve sentir em poucos segundos: “isso substitui meu improviso e acompanha
o serviço inteiro”. A peça memorável será a passagem contínua entre uma tela real
do painel, o celular do prestador e a página real que o cliente recebe.

### Direção visual

- **Cores:** azul OLLI `#0B6FCE`, azul profundo `#0A2547`, ciano `#3FD8EA`, fundo
  `#F0F4F8`, papel `#E5EAF2` e cartão `#FDFDFE`.
- **Tipo:** Rubik Variable em interface e narrativa; sem adicionar fonte externa.
- **Layout:** esquerda alinhada para promessa/copy; produto em uma composição
  contínua à direita; seções densas usam faixas, linhas e estados do trabalho em
  vez de cartões repetidos.
- **Motion:** manter a deriva já implementada e usar movimento apenas para indicar
  a passagem orçamento → aprovação → execução → pagamento. Movimento reduzido
  continua obrigatório.

```text
┌ promessa ampla + CTA ───────┬ painel real + celular real ┐
│ “todo orçamento, até receber”│ o cliente vê / você vê     │
└─────────────────────────────┴────────────────────────────┘
       pedido → orçamento → aprovação → serviço → pagamento
┌ escolha seu tipo de trabalho / outro negócio que orça ───┐
├ prova mobile + painel + link do cliente, cada um rotulado ┤
├ Grátis 5 envios | 14 dias Pro | Pro 39 | Empresa 99       ┤
├ integrações disponíveis agora / próximas, sem prometer    ┤
└ confiança, FAQ, contato, privacidade e CTA                ┘
```

### Arquivos

- **EDIT** `web/src/pages/index.astro`: narrativa, ciclo, oferta, FAQ e CTAs.
- **EDIT** `web/src/pages/para/[oficio].astro`: dor, fluxo e prova por profissão.
- **EDIT** `web/src/data/oficios.ts`: ampliar a porta “qualquer negócio que orça”
  sem inventar ferramenta indisponível.
- **EDIT** `web/src/components/HeroDevices.tsx`: rótulos semânticos e combinação
  real de painel/app.
- **EDIT** `web/src/components/EsteiraTelas.astro`: separar claramente prestador,
  equipe e cliente.
- **EDIT** `web/src/components/PlanosPrecos.astro`: limites e trial derivados de
  uma fonte única.
- **CREATE** `web/src/data/oferta.ts`: limites, trial, preços de exibição e textos
  compartilhados.
- **EDIT** `web/src/pages/planos.astro` e `web/src/pages/llms.txt.ts`: eliminar a
  contradição comercial.
- **EDIT** `web/src/layouts/Layout.astro`: trust/Organization/agent discovery sem
  publicar endereço residencial.
- **CREATE/EDIT** páginas de confiança e respostas markdown/404 conforme o
  diagnóstico agentic.
- **EDIT** `web/src/styles/global.css`: somente estilos específicos que reutilizem
  os tokens existentes.

Não há dependência, CDN, fonte ou pacote novo.

### Ordem

1. Criar fonte única da oferta e testes de coerência.
2. Corrigir planos, FAQ, `llms.txt` e todas as páginas por ofício.
3. Reestruturar a narrativa e os rótulos das telas reais.
4. Completar trust pages, JSON-LD, markdown, redirects e 404.
5. Executar build, checagem Astro, auditoria estática, QA desktop/mobile, teclado,
   reduced-motion e screenshots.
6. Só após publicação autorizada, repetir Ora e Is Agentic e comparar resultados.

### Riscos

- Copy divergir dos entitlements: mitigado por `oferta.ts` e testes.
- Landing anunciar integração futura: todas as promessas vêm da matriz de
  readiness, não do backlog.
- Páginas verticais duplicadas: cada rota precisa de dor, exemplo e ferramenta
  própria; páginas genéricas continuam canônicas quando não há vertical real.
- Captura “real” ser interpretada como dados de cliente: toda imagem usa ambiente
  demonstrativo e será rotulada como demonstração do produto real.
- Bloqueio de crawlers ser WAF externo: o código local documenta e prepara, mas o
  aceite depende do deploy/configuração autorizada.

## 5. Integrações priorizadas

| Prioridade | Capacidade | Escolha | Motivo/limite |
| --- | --- | --- | --- |
| P0 | Storage | Supabase Storage já contratado | menos fornecedores; RLS, tamanho/MIME e URL assinada |
| P0 | Notificações locais | Expo Notifications | stack existente; permissão contextual |
| P0 | Agenda do aparelho | Expo Calendar | funciona no dispositivo; alternativa manual |
| P1 | Google Agenda | Google Calendar API | OAuth granular; nunca pedir escopo amplo sem uso |
| P1 | WhatsApp | Meta Cloud API | única rota oficial para produção; exige consentimento/templates |
| P1 | Automação | Activepieces self-host | MIT/open source; sempre atrás de adaptador |
| P1 | PDF | gerador atual; avaliar Gotenberg | Gotenberg só se conversão server-side justificar operação e SSRF hardening |
| P2 | Assinatura | Documenso | AGPL exige análise de obrigação antes de embutir no SaaS |
| P2 | Notificações multicanal | Novu ou ntfy | piloto isolado; não substituir o outbox existente sem migration |
| P2 | Fiscal | NFS-e Nacional/Conecta APIs | depende de credenciamento, certificado e cobertura oficial |
| P2 | IA externa | OpenAI Responses/remote MCP opcional | paid API, minimização de dados, allowlist e confirmação |

Não adotar em produção bridges não oficiais de WhatsApp. n8n e Windmill não são
tratados como OSS permissivo para backend multi-tenant sem revisão de licença.

## 6. Evidência externa incorporada

- CDC art. 49 e Decreto do comércio eletrônico: comunicação clara, confirmação,
  cancelamento simples e devolução no prazo legal.
- ANPD: telefone é dado pessoal; finalidade operacional e marketing são tratadas
  separadamente.
- Mercado Pago: trial configurável e assinatura pendente existem, mas o fluxo OLLI
  precisa ser provado em sandbox com assinatura HMAC, idempotência e reconciliação.
- Expo: permissões são progressivas e contextuais.
- Ora/Is Agentic: o live atual permanece **54/100** e **49/100** até novo deploy e
  rescan; WebMCP é experimental e não antecede correções básicas de acesso,
  conteúdo e confiança.

Fontes principais: [CDC](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm),
[Decreto 7.962/2013](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm),
[ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-lanca-guia-orientativo-sobre-legitimo-interesse),
[Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscription-plans/create-subscription-plan),
[Expo permissions](https://docs.expo.dev/guides/permissions/),
[NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual),
[MCP Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization),
[Ora methodology](https://ora.ai/methodology) e
[Is Agentic](https://is-agentic.com/scan/olliorcamentos.online).

## 7. Critério de 100%

O plano só pode ser declarado 100% quando todos os pacotes C0–C11 estiverem
`DONE_LOCAL` e os gates externos aplicáveis tiverem evidência própria. Segurança,
produção, billing, OAuth, publicação, dispositivo e validação comercial nunca são
substituídos por mock, contrato local ou texto de landing.
