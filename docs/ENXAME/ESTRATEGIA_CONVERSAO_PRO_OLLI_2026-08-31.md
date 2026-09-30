# Estratégia de conversão para o Pro — OLLI Orçamentos

**Data:** 2026-08-31  
**Status:** TESTAR ANTES / FAZER COM AJUSTES  
**Escopo:** OLLI Orçamentos (prestadores de serviço; primeiro recorte HVAC/refrigeração)  
**Natureza:** decisão de produto e experimento controlado; não é prova de receita  
**Fonte da decisão:** cinco lentes independentes + três revisões cruzadas + documentação local

> Regra de marca: o nome público é somente **OLLI Orçamentos**. Nenhuma variante
> pode aparecer em produto, campanha, e-mail, arquivo, prompt ou material público.

## 1. Veredito executivo

**Não limitar o direito de trabalhar. Converter por valor profissional recorrente.**

Manter o núcleo gratuito funcional e sem limite de volume:

- criar e editar orçamentos;
- criar recibos e clientes;
- usar agenda;
- gerar e compartilhar PDF/link;
- enviar pelo canal já disponível ao prestador, inclusive WhatsApp quando o fluxo
  estiver habilitado;
- manter documentos acessíveis depois de qualquer downgrade.

O Pro deve ser a evolução que o prestador enxerga no momento em que quer parecer
mais profissional, economizar tempo ou recuperar receita:

- remover o selo discreto “Feito com OLLI Orçamentos” do material enviado ao cliente;
- liberar todos os modelos de documento;
- liberar IA além dos 3 usos mensais do grátis;
- liberar relatórios, metas e radar completo;
- oferecer relatório diário, backup/armazenamento maiores e suporte prioritário
  somente quando cada item estiver realmente pronto e medido.

**Não adotar agora:** limite duro de orçamentos, recibos, clientes, agenda, PDF,
link, WhatsApp ou histórico; cobrança automática sem consentimento; urgência falsa;
desconto agressivo; referral em escala; e-mail de marketing amplo; ou expansão do
Empresa antes de o Pro ter pagantes e renovação observável.

Os preços de trabalho permanecem **R$ 0 / R$ 39 / R$ 99** durante a coleta inicial
de caixa. O preço de fundador pode ser travado para uma coorte pequena, mas só
depois de existir checkout e cobrança verificáveis. Nenhum número desta página é
uma promessa de receita enquanto os gates financeiros não forem aceitos.

## 2. O problema que estamos resolvendo

O usuário não precisa comprar permissão para gerar um orçamento: esse é o hábito
que traz o cliente, o PDF e a oportunidade de pagamento. Se o primeiro orçamento
for bloqueado, o OLLI perde ativação antes de demonstrar valor.

O ponto de cobrança deve aparecer quando o usuário já entregou algo ao cliente ou
tentou uma capacidade claramente profissional. A hipótese é:

> Depois de enviar um primeiro PDF/link ou criar uma terceira proposta, o prestador
> entende melhor o valor de marca, velocidade e gestão. Um CTA contextual e um
> trial opcional podem converter melhor que um limite arbitrário de volume, sem
> reduzir a conclusão do trabalho gratuito.

A hipótese ainda precisa de dados próprios. Não chamar opinião de mercado,
download ou clique de validação de disposição a pagar.

## 3. Matriz de alternativas

| Estratégia | Benefício | Risco | Decisão |
| --- | --- | --- | --- |
| Limite duro de orçamentos | cria pressão imediata | interrompe o aha, gera abandono e incentiva planilha/concorrente | **rejeitar por enquanto** |
| Free capado no fluxo | torna o Pro artificialmente necessário | destrói confiança e reduz hábito | **rejeitar** |
| Pro por valor visível | preserva ativação e conecta preço a resultado | valor estético isolado pode parecer cosmético | **adotar como base** |
| Trial genérico no cadastro | aumenta exposição | termina antes de surgir necessidade; atrai curiosos | **não usar** |
| Trial pós-ativação, opt-in | demonstra Pro no momento certo | exige elegibilidade server-side e lifecycle confiável | **testar** |
| Coorte fundadora manual | aprende com pessoas reais e dá feedback | gratuidade eterna mascara conversão | **usar como coorte de aprendizado** |
| Híbrido valor + trial + fundador | combina prova e urgência honesta | mais eventos, consentimento e suporte | **veredito** |

## 4. Arquitetura de planos a preservar

### 4.1 Grátis: ferramenta de trabalho, não amostra quebrada

Contrato atual documentado em PLAN_ENTITLEMENTS:

- orçamentos, recibos, clientes e agenda sem limite;
- um modelo editorial;
- foto de capa;
- 3 usos de IA por mês;
- marca OLLI discreta no material público;
- radar com um cliente visível;
- backup de 7 dias e armazenamento menor, quando estes módulos existirem;
- mensagens calorosas quando uma capacidade Pro for atingida.

O gratuito precisa deixar o usuário completar e enviar seu trabalho. Recurso Pro
deve aparecer como preview real, benefício de uma linha e CTA; nunca como tela
quebrada, erro seco ou “em breve” enganoso.

### 4.2 Pro: resultado que o cliente final também percebe

O Pro vende três ganhos combinados:

1. **Imagem:** marca própria no PDF/link e modelos completos.
2. **Velocidade:** IA ilimitada e fluxos que reduzem retrabalho.
3. **Gestão:** relatórios, metas, radar completo, relatório diário, backup e
   suporte prioritário quando entregues.

Cada cartão de benefício deve apontar para uma ação concreta. “IA ilimitada”
somente pode ser exibido quando a cota e o entitlement tiverem enforcement
server-side; não anunciar capacidade fail-open.

### 4.3 Empresa: âncora, não frente de construção imediata

O Empresa continua separado do Pro. O paywall de equipe, grandfathering e
entitlements precisam ser aceitos no ambiente correto antes de qualquer promessa
pública. Não construir novos recursos Empresa para resolver a conversão do Pro.

O limite de 10 membros deve permanecer soft, com CTA de contato, até haver
capacidade de suporte e decisão comercial. Não expulsar organizações existentes.

## 5. Oferta e linguagem de confiança

### 5.1 CTA contextual recomendado

Usar linguagem direta, sem ameaça:

> **Seu trabalho continua gratuito e sem limite.**  
> O Pro deixa sua proposta com a sua marca, libera os modelos completos e ajuda
> você a ganhar tempo com IA, radar e relatórios.

Para o trial:

> **Experimente o Pro por 14 dias, sem cartão e sem cobrança automática.**  
> Começa hoje, termina em DD/MM/AAAA e depois você volta ao Grátis se não confirmar.
> Seus orçamentos, recibos, clientes e agenda continuam disponíveis.

O texto real deve trocar DD/MM/AAAA por data calculada pelo servidor. A tela deve
mostrar itens que retornam ao grátis, botão visível “continuar no gratuito” e
link para cancelar/encerrar a experiência.

### 5.2 O que não dizer

- “Última chance” sem uma mudança real e datada.
- “Grátis” em destaque e cobrança recorrente escondida.
- “IA ilimitada” antes de cota e entitlement confiáveis.
- “Você perderá seus orçamentos” ou qualquer ameaça de remoção de dados.
- “Plano Empresa disponível” se o enforcement não estiver funcionando.
- Comparações com concorrentes sem fonte e sem data.

### 5.3 Selo no material do prestador

O selo “Feito com OLLI Orçamentos” deve ser discreto, legível, acessível e
removível no Pro. Ele não pode:

- poluir o PDF;
- esconder a marca do prestador;
- impedir leitura em celular;
- bloquear PDF, link ou compartilhamento;
- conter urgência, publicidade invasiva ou captura indevida do cliente final.

Um eventual convite ao OLLI para o cliente final é um experimento posterior,
separado do CTA de pagamento e só após satisfação e retenção observáveis.

## 6. Gatilhos de valor e elegibilidade

### 6.1 Gatilhos candidatos

Disparar um CTA contextual, não um bloqueio, quando ocorrer pelo menos um destes
eventos:

1. primeiro PDF ou link compartilhado;
2. terceiro orçamento criado;
3. tentativa de escolher um modelo Pro;
4. tentativa de remover a marca;
5. terceiro uso de IA no mês;
6. retorno recorrente ao radar, metas ou relatórios.

Não interromper cadastro, primeiro orçamento, primeiro envio ou compartilhamento
essencial. O primeiro evento de valor deve ser livre.

### 6.2 Trial pós-ativação

Hipótese inicial: trial opt-in de 14 dias após primeiro PDF/link ou terceiro
documento, o que ocorrer por último dentro da janela de elegibilidade. A data é
uma variável de teste, não uma verdade universal: segmentos de uso esporádico
podem responder melhor a um gatilho de uso; segmentos intensos podem precisar
de limite de consumo para evitar trial sem intenção.

Regras obrigatórias:

- uma elegibilidade por tenant/conta, registrada no servidor;
- consentimento explícito; sem cartão e sem cobrança automática no experimento;
- data de início e fim visíveis;
- nenhum trial empilhado por reinstalação, troca de aparelho ou troca de tenant;
- downgrade preserva documentos e fluxo grátis;
- plano desconhecido ou evento inconsistente nega o benefício adicional;
- ações repetidas são idempotentes;
- suporte consegue explicar a data de retorno ao grátis.

### 6.3 Coorte Fundadores

A coorte Fundadores não é desconto de aquisição em escala. É uma amostra manual
de prestadores já ativados, preferencialmente no mesmo vertical/região:

- primeiro mês Pro oferecido pelo fundador, com data escrita;
- a partir do mês 2, R$ 39/mês se a pessoa confirmar;
- preço travado só depois de pagamento real e regra de cancelamento definida;
- feedback estruturado e autorização separada para depoimento;
- nenhum participante é contado como pagante enquanto não houver cobrança aprovada
  e segunda mensalidade observável.

Não usar os fundadores para mascarar uma conversão baixa. Registrar motivo de
cancelamento, frequência de uso e valor percebido em tempo/dinheiro.

## 7. Experimento mínimo recomendado

### 7.1 Fase 0 — instrumentar antes de persuadir

Primeiro, manter a experiência atual como controle durante um período fechado e
registrar, por tenant e por canal de aquisição:

- cadastro concluído;
- primeiro orçamento criado;
- primeiro PDF/link gerado;
- primeiro PDF/link aberto ou compartilhado;
- terceiro orçamento;
- exposição a preview/CTA Pro;
- clique no CTA;
- trial elegível, iniciado, concluído e encerrado;
- checkout iniciado, pagamento aprovado, cancelamento e segunda mensalidade;
- suporte relacionado a cobrança, trial ou acesso.

Os eventos precisam ter versão, tenant, usuário pseudonimizado, timestamp
autoritativo e chave idempotente. Não enviar conteúdo de orçamento ou dado real
para ferramentas externas de análise.

### 7.2 Fase 1 — dois braços, não uma reforma geral

**Controle A:** preview Pro passivo e CTA atual, sem trial automático.  
**Variante B:** preview Pro real + CTA contextual no primeiro marco de valor +
trial opt-in de 14 dias.

Randomizar por tenant para evitar que o mesmo prestador veja duas políticas.
Separar a coorte Fundadores como observacional; não misturar seus números com o
teste de autoatendimento.

Manter R$ 39 e R$ 99 durante o teste. Não adicionar limite de orçamento, novo
desconto, referral ou automação de e-mail ao mesmo tempo; caso contrário não será
possível saber o que causou o resultado.

### 7.3 Denominadores e janelas

Não usar “conversão sobre downloads” como métrica principal. Usar:

- ativação 48h = ativados / cadastros concluídos;
- primeiro PDF = tenants com primeiro PDF / tenants ativados;
- hábito semana 3 = tenants com 3+ documentos / tenants ativados;
- CTA→trial = trials iniciados / elegíveis expostos;
- trial→pagante = pagamentos aprovados / trials concluídos;
- segunda mensalidade = pagantes com segunda cobrança / pagantes que chegaram ao
  segundo ciclo;
- suporte = tickets de cobrança/trial / 100 elegíveis;
- abuso = trials repetidos bloqueados / tentativas de elegibilidade.

Medir por vertical, canal, região e frequência de uso. Fixar as janelas antes de
olhar o resultado: 48 horas, semana 3, encerramento do trial e ciclo seguinte.
Se a coorte for pequena demais para uma conclusão, registrar “inconclusivo” em
vez de declarar vencedor.

### 7.4 Critério go/no-go sem baseline inventado

1. Só abrir Variante B depois de ter um período de controle fechado.
2. **Go:** B mantém ou melhora primeiro PDF e hábito de semana 3, não aumenta
   suporte/confusão por elegível e produz pagamentos e segundas mensalidades
   observáveis.
3. **No-go:** cai a criação/envio, aumenta abandono ou suporte, há trials
   repetidos, ou o ganho pago não compensa a perda do fluxo.
4. **Inconclusivo:** poucos casos, webhook incompleto, fonte de plano incerta ou
   resultado sem tempo de segunda mensalidade. Continuar medindo, sem aumentar
   pressão.

## 8. Pré-requisitos técnicos e gates humanos

Nenhum trial ou promessa de receita deve ser ligado antes de:

1. decidir uma única fonte de verdade de cobrança e plano;
2. validar checkout e webhook assinado em sandbox;
3. atualizar entitlements de forma idempotente;
4. registrar elegibilidade e data de trial no servidor;
5. testar pagamento aprovado, recusado, cancelado, estornado, renovado e
   downgrade;
6. reconciliar cache/offline, troca de aparelho, restauração de conta e troca de
   tenant;
7. garantir que desconhecido/falha negue somente o recurso Pro, nunca apague
   trabalho do usuário;
8. observar eventos sem expor texto de orçamento, e-mail, telefone ou conteúdo
   real;
9. executar canário humano e aceitar o ambiente correto antes de produção.

Há uma pendência de arquitetura que deve ser resolvida no próximo checkpoint:
PLAN_ENTITLEMENTS descreve o webhook Stripe como fonte do plano, enquanto os
documentos de negócio e bloqueios citam Mercado Pago como gate de caixa. Isso não
é detalhe de copy. É necessário escolher o provedor da release, documentar a
fonte única e remover qualquer caminho concorrente antes de habilitar cobrança.

Documentação oficial do Mercado Pago confirma que assinaturas recorrentes têm
ciclo de vida próprio (criar, buscar, pausar, cancelar e reativar) e que tópicos
de assinatura/pagamento precisam ser tratados por notificações:

- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks

Essas páginas confirmam requisitos de integração; não provam que a integração do
OLLI esteja pronta, autenticada ou autorizada para produção.

Gates que continuam humanos:

- credencial/segredo do provedor;
- registro e configuração do webhook;
- aplicação de migrations;
- deploy do worker/app;
- teste com dinheiro real ou publicação;
- consentimento para contato e depoimento;
- decisão final de preço, política de cancelamento e texto público.

## 9. Sequência 0–30 / 31–60 / 61–90 dias

### 0–30: confiança e medição

- fechar a fonte de plano (Stripe ou Mercado Pago);
- concluir sandbox de checkout/webhook/entitlements;
- criar os eventos do funil e a deduplicação;
- validar downgrade sem perda de dados;
- coletar controle com CTA atual;
- escrever a copy e a ajuda do trial, mas não prometer receita;
- entrevistar/observar alguns prestadores ativados.

### 31–60: coorte pequena

- convidar prestadores já ativados;
- rodar Variante B apenas com consentimento;
- liberar a coorte Fundadores manualmente;
- revisar semanalmente primeiro PDF, hábito, suporte e abuso;
- manter preços e escopo Empresa congelados.

### 61–90: decidir com comportamento

- esperar o tempo necessário para a segunda mensalidade;
- comparar por canal/vertical, não só total;
- manter, ajustar ou desligar o trial;
- só então considerar escala, referral leve ou uma mudança de preço para novos
  assinantes, com aviso transparente e preço antigo protegido.

## 10. Riscos e travas

| Risco | Prevenção | Resposta |
| --- | --- | --- |
| limite derruba ativação | núcleo grátis ilimitado | desligar paywall de volume |
| trial empilhado | ledger server-side + tenant estável | revogar benefício extra, preservar dados |
| cobrança surpresa | opt-in, data explícita, sem cartão no teste | reembolsar/ajustar por gate humano |
| entitlement fail-open | fonte única, negação segura, reconciliação | pausar CTA/trial |
| selo vira poluição | selo discreto, acessível e removível | voltar ao preview passivo |
| IA prometida sem cota | contador e limite server-side | retirar texto “ilimitada” até corrigir |
| fundador mascara conversão | separar coorte e exigir segundo ciclo | não declarar validação |
| WhatsApp/PDF bloqueado | manter fluxo básico livre | rollback imediato do gate |
| e-mail demais | preferência por canal, caps e eventos operacionais | desligar campanhas, manter transacionais |
| dois provedores de plano | decisão arquitetural antes do live | congelar cobrança até unificar |

## 11. Conselho: opiniões e revisão cruzada

### 11.1 Cinco opiniões anônimas

- **A:** rejeitar limite duro; testar CTA após valor e trial único; maior risco é
  trial gerar cliques sem hábito e contas repetidas.
- **B:** a unidade de valor é fechar serviço e parecer profissional; manter free
  ilimitado e Pro por imagem, velocidade e gestão; trial só após PDF/terceiro
  documento.
- **C:** o PDF/link também pode ser canal de descoberta; usar selo discreto e
  testar em coorte segmentada, sem referral antes de retenção.
- **D:** ordem operacional é caixa em sandbox, webhook assinado, entitlements,
  eventos e downgrade; depois coorte; não construir Empresa, IAP ou e-mail amplo.
- **E:** o prestador não paga para recuperar o direito de orçar; paga para
  economizar tempo, não perder venda e apresentar marca própria; CTA não deve
  interromper cadastro, primeiro orçamento ou WhatsApp.

### 11.2 Três revisões

1. A opinião operacional foi a mais forte porque trial sem caixa, entitlement e
   eventos é apenas uma tela, não experimento de receita.
2. Faltam distribuição de frequência por vertical, valor financeiro percebido e
   denominadores; 14 dias não são universais.
3. O maior risco técnico é estado distribuído: cache offline, troca de tenant e
   eventos duplicados podem conceder trial repetido ou bloquear pagante.
4. O maior risco de confiança é dark pattern: urgência falsa, trial implícito,
   selo invasivo, “IA ilimitada” fail-open e downgrade que esconde dados.

### 11.3 Decisão resultante

**FAZER COM AJUSTES / TESTAR ANTES:** núcleo grátis ilimitado + Pro por valor
visível + CTA pós-ativação + trial opt-in controlado, depois de caixa e medição
confiáveis. O preço não muda no primeiro teste.

## 12. Primeiro próximo passo seguro

Sem tocar em produção:

1. escolher e registrar a fonte única de cobrança;
2. transformar os eventos da seção 7 em um contrato versionado e testável;
3. montar uma tela/local fixture para Controle A e Variante B;
4. revisar os textos com um prestador real, sem enviar mensagens automáticas;
5. só após os gates humanos, executar sandbox e decidir a coorte.

**Não executar neste documento:** migrations, deploy, alteração de preço live,
cobrança, disparo de e-mail, push, contato externo, coleta de dado real,
publicação, ou alteração de entitlements em produção.

## 13. Evidência local usada

- docs/PLAN_ENTITLEMENTS.md — matriz de entitlements e preços de trabalho.
- docs/ENXAME/NEGOCIO_PRECO.md — manutenção de R$ 0/39/99, 90 dias de caixa e
  preço fundador.
- docs/ENXAME/NEGOCIO_PRIMEIROS_PAGANTES.md — coorte dos primeiros pagantes,
  primeiro mês manual e segundo mês pago.
- docs/ENXAME/NEGOCIO_DECISAO.md — prioridade de caixa, paywall Empresa e
  disciplina de não expandir escopo antes de prova.
- README.md — fluxo e público do produto.

Esses documentos são evidência local datada, não substituem aceite real nem
pesquisa de campo. As opiniões do conselho são recomendações e não foram
apresentadas como validação estatística.

## 14. Contratos locais implementados — 2026-09-01

Como primeira fatia reversível do plano, foi criado
worker/src/monetizationEvents.js com:

- catálogo fechado de eventos do funil;
- variantes control e contextual_trial;
- allow-list de metadata sem e-mail, nome, telefone ou conteúdo de orçamento;
- idempotencyKey determinística e vinculada ao tenant;
- estado de trial unstarted → eligible → active → ended/converted;
- elegibilidade única por tenant, início idempotente e término idempotente;
- cálculo de 14 dias sem provider ou banco.

A prova inicial está em scripts/teste-monetization-events.ts: **27 verificações
aprovadas**. Três contratos adicionais fecharam o recorte local:

- `worker/src/monetizationEntitlementReconciliation.js` — **43/43**: snapshot
  servidor e trial autoritativo são as únicas fontes de acesso; checkout,
  pagamento ou cache isolados nunca concedem Pro;
- `worker/src/monetizationOfferExperiment.js` — **36/36**: Controle A e Variante
  B, estágios críticos protegidos, seis gates sintéticos, 14 dias opt-in, sem
  cartão/renovação automática e fallback gratuito com dados preservados;
- `worker/src/monetizationExperimentJournal.js` — **36/36**: assignment fixo,
  revisão/hash/idempotência, denominadores e anomalias, sem metadata/provider e
  sem transformar sinal financeiro em entitlement.

Todos foram ligados ao gate meta; depois dos contratos complementares de
onboarding, notificação, e-mail e auditoria, `npm test` encerrou com exit 0 e a
meta-suíte alcançou **136/136**. O readiness transversal alcançou **32/32** e
agora rejeita também roteamento de próximo item para outra frente.

Essas implementações são somente locais/offline/sintéticas. Elas não fazem
checkout, não enviam evento, não leem segredo, não aplicam migration, não
escolhem entre Stripe e Mercado Pago e não provam receita. O próximo passo
continua sendo resolver a fonte única e validar o lifecycle em sandbox antes de
qualquer CTA ou trial visível.
