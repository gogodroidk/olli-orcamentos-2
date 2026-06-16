# OLLI — Pesquisa de Dores dos Prestadores de Serviço e Ideias de Produto

**Data:** 15/06/2026  
**Produto:** OLLI — plataforma para prestadores de serviço, com foco inicial em ar-condicionado/refrigeração  
**Objetivo:** transformar dores reais de técnicos, empresas pequenas e clientes finais em funcionalidades úteis, baratas, viciantes e virais.

---

# 1. Resumo direto

O OLLI não deve ser só um app de orçamento.

Ele deve virar o **sistema operacional do prestador de serviço pequeno**.

Na prática, o prestador não sofre porque falta mais uma tela bonita. Ele sofre porque:

- esquece de retornar cliente;
- demora para mandar orçamento;
- perde orçamento parado;
- não sabe quanto lucrou de verdade;
- não sabe onde está o funcionário;
- não sabe se a visita foi bem feita;
- perde histórico da máquina;
- não registra foto, assinatura, antes/depois;
- trabalha no WhatsApp, papel, memória e caderninho;
- cobra mal;
- não sabe fazer follow-up;
- não sabe explicar o defeito para cliente;
- chega no atendimento sem peça, sem ferramenta ou sem informação;
- troca peça cedo demais;
- toma prejuízo em garantia/callback;
- perde controle quando passa de 1 pessoa para 2, 3 ou 5 técnicos;
- precisa parecer profissional sem ter escritório, secretária ou gerente.

O OLLI deve resolver isso com uma ideia simples:

> **Do primeiro contato ao dinheiro na conta, o OLLI guia, lembra, registra, cobra e melhora a operação.**

---

# 2. O que as telas atuais já acertam

Pelo material enviado, a direção está boa.

O protótipo principal já tem:

- Início;
- Agenda;
- Orçamento;
- Hoje;
- Conta;
- OLLI Voz;
- Novo Orçamento;
- Equipe;
- Catálogo de serviços;
- Clientes/CRM;
- Códigos de erro;
- Recibos;
- Modelos de orçamento;
- Agenda com Dia/Semana/Mês;
- Tema escuro;
- animações;
- painel web do dono.

Isso já coloca o produto acima de um “gerador de orçamento”.

O README posiciona o OLLI como plataforma completa de operação para prestadores, com organização de clientes, agenda com rotas/trânsito, equipe, estoque, processos/checklists, orçamentos manuais ou por voz, envio por link/PDF e painel web do dono.

Essa é a direção certa.

---

# 3. O que a pesquisa externa reforçou

A busca em comunidades, páginas de softwares de field service, fóruns de prestadores, Reddit, páginas brasileiras de gestão e Reclame Aqui mostrou padrões bem claros.

## 3.1 Dor 1 — Orçamento demora demais

Muitos clientes reclamam que prestadores vão até o local, prometem orçamento e somem.  
Do lado do prestador, a dor é inversa: ele atende, mede, explica, monta proposta e o cliente desaparece.

Produto:

- orçamento por voz;
- orçamento em 2 minutos;
- orçamento com modelo bonito;
- link rastreável;
- status: visualizado, aprovado, recusado, parado;
- lembrete automático;
- follow-up automático;
- motivo de perda.

Função matadora:

> **“Orçamentos parados”**  
> A OLLI mostra: “Você tem R$ 6.100 parados há mais de 5 dias. Quer que eu cobre?”

Já existe nas telas. Deve virar funcionalidade central, não detalhe.

---

## 3.2 Dor 2 — Cliente some depois da proposta

Prestador gasta gasolina, tempo, visita, diagnóstico e não recebe resposta.

Produto:

- follow-up automático por WhatsApp;
- botão “cobrar retorno”;
- mensagens prontas por tom;
- funil de orçamento;
- “cliente quente/frio”;
- lembrete se o cliente abriu o link e não aprovou;
- reativação de orçamento antigo;
- perguntar motivo da recusa.

Mensagens automáticas:

- “Oi, passando para confirmar se ficou alguma dúvida sobre o orçamento.”
- “Consigo manter esse valor até amanhã.”
- “Quer que eu ajuste o orçamento em duas opções: básico e completo?”
- “Posso reservar horário para execução?”

Isso gera dinheiro sem o técnico lembrar.

---

## 3.3 Dor 3 — Cliente pede orçamento detalhado demais

Em comunidades de empreiteiros e HVAC, aparece muito conflito sobre cliente pedindo separação de material, mão de obra e recibos de tudo.

Risco:

- cliente pega lista de material e compra por fora;
- cliente compara só preço;
- técnico perde margem;
- orçamento vira planilha de concorrente.

Produto:

Criar modos de orçamento:

### Modo simples

- Serviço;
- descrição;
- valor total;
- garantia;
- forma de pagamento.

### Modo profissional

- diagnóstico;
- escopo;
- material incluso;
- mão de obra inclusa;
- deslocamento;
- garantia;
- exclusões.

### Modo blindado

- não entrega lista granular de peças;
- explica que o valor inclui técnica, deslocamento, garantia, ferramentas, risco e responsabilidade;
- protege margem.

Frase útil:

> “O orçamento contempla fornecimento, mão de obra, deslocamento, testes, garantia e responsabilidade técnica. Não trabalhamos com abertura item a item de custo interno, mas descrevemos claramente o que está incluso no serviço.”

Isso ajuda o prestador a não se sabotar.

---

## 3.4 Dor 4 — No-show e cancelamento

Prestadores perdem tempo quando cliente marca visita e não está em casa. Clientes também reclamam quando técnico atrasa ou não aparece.

Produto:

- confirmação automática;
- botão “confirmar presença”;
- política de visita;
- cobrança de sinal/visita;
- lembrete 24h antes;
- lembrete 2h antes;
- “estou a caminho”;
- link de rota;
- aviso de atraso;
- reagendamento em 1 toque.

Funcionalidade forte:

> **Confirmação obrigatória:** a visita só fica verde quando o cliente responde “confirmado”.

Para plano pago, pode ter:

- cobrança de taxa de visita via PIX;
- política de cancelamento;
- taxa abatida se fechar serviço.

---

## 3.5 Dor 5 — Pagamento demora

Vários pequenos negócios sofrem com cliente atrasando pagamento. Em campo, a dor é: terminou o serviço, mas o dinheiro fica para depois.

Produto:

- cobrança via PIX/link;
- recibo automático;
- cobrança amigável;
- lembretes automáticos;
- status: pendente, vencido, pago;
- bloqueio de nova visita para cliente inadimplente;
- histórico financeiro por cliente.

Função matadora:

> **“Receber agora”**  
> Ao concluir OS, o app já mostra: “Enviar cobrança PIX + recibo?”

O técnico precisa sair do local com dinheiro ou promessa registrada.

---

## 3.6 Dor 6 — Falta de histórico

HVAC e manutenção têm uma dor enorme: o técnico volta no mesmo lugar e não sabe o que foi feito antes.

Produto:

Ficha da máquina:

- cliente;
- endereço;
- ambiente;
- marca;
- modelo evaporadora;
- modelo condensadora;
- número de série;
- gás;
- BTUs;
- tensão;
- instalação;
- fotos;
- códigos de erro anteriores;
- peças trocadas;
- garantia;
- últimas visitas;
- observações do técnico.

Isso vira o “prontuário do ar-condicionado”.

Frase interna:

> **Cada máquina é um paciente. OLLI guarda o prontuário.**

---

## 3.7 Dor 7 — Callback e garantia

Callback é quando o técnico precisa voltar porque serviço deu problema. Isso mata lucro, reputação e agenda.

Produto:

- registrar garantia por serviço;
- registrar peça trocada;
- registrar foto antes/depois;
- checklist obrigatório;
- assinatura do cliente;
- motivo do retorno;
- identificar técnico responsável;
- dashboard de callback por técnico, serviço e marca;
- alertas de serviços que mais dão retorno.

Admin precisa ver:

- callback por técnico;
- callback por tipo de serviço;
- callback por marca;
- callback por cliente;
- prejuízo estimado;
- causa raiz.

Função forte:

> **“Radar de retrabalho”**  
> A OLLI mostra: “Instalações de 12k inverter estão gerando mais retorno que o normal. Revise checklist de vácuo, flange e dreno.”

---

## 3.8 Dor 8 — Técnico esquece coisa básica

O protótipo já tem “Processos & lembretes — não esquecer nada”. Isso é excelente.

Produto:

Checklists por tipo de serviço:

### Instalação split

- conferir tensão;
- conferir distância;
- conferir suporte;
- conferir desnível;
- passagem de tubulação;
- dreno;
- vácuo;
- estanqueidade;
- teste de funcionamento;
- foto final;
- assinatura.

### Manutenção preventiva

- foto antes;
- limpeza filtros;
- limpeza evaporadora;
- limpeza condensadora;
- medição temperatura;
- teste dreno;
- teste controle;
- foto depois.

### Diagnóstico

- sintomas;
- código de erro;
- testes feitos;
- medições;
- conclusão;
- peça suspeita;
- próximo passo.

A IA deve montar checklist do dia:

> “Hoje você tem manutenção, instalação e diagnóstico. Leve bomba de vácuo, manifold, fluido, sensor universal, escada, lavadora e saco de limpeza.”

Isso é dor real.

---

## 3.9 Dor 9 — Dono não sabe o que a equipe está fazendo

Quando o negócio tem 2+ funcionários, o caos começa.

Produto:

Painel web do dono:

- agenda de todos;
- mapa dos técnicos;
- status: livre, em rota, atendendo, atrasado;
- OS aberta;
- OS travada;
- fotos enviadas;
- checklist completo/incompleto;
- faturamento do dia;
- orçamento por técnico;
- conversão por técnico;
- callback por técnico;
- estoque usado por técnico.

Login:

- Administrador vê tudo;
- Funcionário vê só o dele.

Isso já aparece nas telas de painel web. Deve ser prioridade para plano empresa.

---

## 3.10 Dor 10 — Estoque invisível

Prestador perde venda porque não sabe se tem peça, gás, capacitor, controle, sensor, placa, suporte, tubulação.

Produto:

- estoque simples;
- itens por caminhão/técnico;
- alerta baixo estoque;
- baixa automática quando usa no orçamento/OS;
- custo médio;
- margem por peça;
- preço de venda sugerido;
- alerta de preço de mercado;
- lista de compra.

Não começar como ERP gigante. Começar com:

- item;
- quantidade;
- custo;
- preço sugerido;
- mínimo;
- localização;
- técnico responsável.

Função boa:

> “Você tem 2 capacitores de 35µF e amanhã tem 3 preventivas. Repor?”

---

## 3.11 Dor 11 — Precificação ruim

Muitos prestadores cobram errado. Não calculam deslocamento, tempo, risco, garantia, impostos, peça, retrabalho.

Produto:

Criar **calculadora de preço inteligente**:

- custo da peça;
- tempo estimado;
- deslocamento;
- urgência;
- dificuldade;
- margem desejada;
- garantia;
- risco;
- comissão;
- taxa cartão;
- imposto;
- preço mínimo.

A IA deve avisar:

> “Esse valor parece baixo para esse serviço. Com deslocamento, tempo e garantia, sua margem pode ficar negativa.”

Isso é dinheiro no bolso.

---

## 3.12 Dor 12 — Cliente quer preço antes de diagnóstico

Cliente manda WhatsApp:

> “Quanto fica para arrumar ar que não gela?”

O prestador responde qualquer coisa ou perde o lead.

Produto:

Respostas inteligentes:

- faixa de preço;
- visita técnica;
- taxa abatida;
- perguntas de triagem;
- foto/vídeo;
- marca/modelo;
- urgência;
- bairro;
- melhor horário.

Exemplo:

> “Para ar que não gela, preciso confirmar se é limpeza, falta de gás, vazamento, sensor ou placa. A visita técnica custa R$ X e é abatida se fechar o serviço.”

Isso vende diagnóstico, não chute.

---

## 3.13 Dor 13 — Comunicação ruim com cliente

Reclamações públicas sobre ar-condicionado e assistência técnica aparecem muito em torno de:

- serviço mal feito;
- falta de retorno;
- atraso;
- quebra de peça;
- técnico não levou material;
- prestador não explicou;
- cliente sem prova;
- promessa não cumprida;
- imóvel sem solução por semanas/meses.

Produto:

Cada atendimento precisa gerar prova:

- antes/depois;
- diagnóstico;
- fotos;
- assinatura;
- status;
- prazo;
- observações;
- termos aceitos;
- garantia;
- próximo passo.

Para o cliente:

- link do orçamento;
- link da OS;
- link de acompanhamento;
- aprovação;
- recusa;
- pagamento;
- comprovante.

Isso reduz briga.

---

# 4. Segmentos de usuário

## 4.1 Usuário solo

Esse é o cara que paga barato e usa muito.

Ele precisa de:

- orçamento rápido;
- agenda;
- cliente/CRM;
- cobrança;
- recibo;
- diagnóstico por IA;
- códigos de erro;
- modelos de mensagem;
- histórico simples;
- checklist.

Ele não quer:

- ERP gigante;
- configuração longa;
- financeiro complexo;
- 50 telas;
- treinamento.

Produto para ele:

> “Em 10 minutos você sai do caderninho e vira empresa.”

---

## 4.2 Dupla ou microempresa

Tem dono + ajudante/técnico.

Precisa de:

- agenda compartilhada;
- atribuir serviço;
- ver status;
- OS guiada;
- fotos obrigatórias;
- estoque simples;
- comissão;
- checklist;
- painel web.

Produto para ele:

> “Seu funcionário segue o padrão da empresa mesmo quando você não está junto.”

---

## 4.3 Empresa pequena com equipe

Tem 3 a 15 técnicos.

Precisa de:

- painel web;
- mapa;
- produtividade;
- callbacks;
- faturamento;
- ordens em andamento;
- processos;
- estoque por técnico;
- permissões;
- relatórios;
- clientes recorrentes;
- PMOC/contratos.

Produto para ele:

> “Controle sua operação sem virar refém de grupo de WhatsApp.”

---

## 4.4 Prestador de outro segmento

O OLLI começa no ar-condicionado, mas pode expandir para:

- elétrica;
- hidráulica;
- pintura;
- marcenaria;
- assistência técnica;
- instalação de câmeras;
- manutenção predial;
- limpeza técnica;
- pequenos reparos.

Cuidado:

Não abrir geral cedo demais.  
Primeiro dominar HVAC. Depois criar templates por segmento.

---

# 5. Funções que fazem sentido colocar no sistema

## 5.1 OLLI Voz — prioridade altíssima

O prestador não quer digitar tudo.

O fluxo ideal:

1. Técnico aperta microfone.
2. Fala:
   > “Cliente Maria, manutenção em dois splits de 12 mil, limpeza completa, deslocamento 80, desconto 50.”
3. IA extrai:
   - cliente;
   - serviço;
   - quantidade;
   - valor;
   - deslocamento;
   - observação;
   - total.
4. Mostra orçamento editável.
5. Gera link/PDF/WhatsApp.

Isso é viral porque o técnico mostra para outro técnico.

Frase:

> “Fala o serviço. OLLI monta o orçamento.”

---

## 5.2 Link do cliente viral

Cada orçamento enviado é propaganda do OLLI.

O link precisa mostrar:

- logo do prestador;
- orçamento bonito;
- botão Aprovar;
- botão Tirar dúvida no WhatsApp;
- botão Recusar;
- motivo da recusa;
- assinatura;
- pagamento/sinal;
- “feito com OLLI” discreto.

Viralidade:

- no plano barato/free, deixar “Feito com OLLI” no rodapé;
- no pago, permitir remover marca ou personalizar;
- cliente recebe uma experiência boa e pergunta: “que app é esse?”

---

## 5.3 Botão “Cobrar orçamento parado”

Fluxo:

1. OLLI detecta orçamento parado.
2. Sugere mensagem.
3. Técnico aprova.
4. Envia pelo WhatsApp.
5. Registra follow-up.

Mensagens por estágio:

- 1 dia: suave;
- 3 dias: dúvida;
- 5 dias: urgência;
- 7 dias: última chamada;
- 15 dias: reativação com condição.

---

## 5.4 Botão “me ajuda com esse caso”

Campo livre:

> “LG inverter não gela, CH05, condensadora não parte.”

A IA responde:

- provável causa;
- testes;
- o que não fazer;
- peça suspeita;
- mensagem para cliente;
- orçamento sugerido;
- fontes/manual.

Esse botão deve estar sempre acessível.

---

## 5.5 Modo “não sei cobrar”

Prestador escreve:

> “Limpeza de 3 ar-condicionado em apartamento no Tatuapé, dois 12k e um 18k.”

IA responde:

- preço mínimo sugerido;
- preço ideal;
- preço premium;
- justificativa;
- texto para cliente.

Isso resolve uma dor gigantesca: o técnico cobra pouco por medo.

---

## 5.6 Garantia inteligente

Depois de cada serviço:

- tipo de serviço;
- prazo de garantia;
- peça incluída;
- mão de obra incluída;
- exclusões.

A IA gera:

> “Garantia de 90 dias para mão de obra executada. Não cobre mau uso, queda de energia, intervenção de terceiros, falta de manutenção, entupimento externo ou falha em peça não substituída.”

Isso evita treta.

---

## 5.7 OS com prova

Cada OS deve ter:

- fotos antes;
- fotos depois;
- checklist;
- assinatura;
- localização;
- horário de início;
- horário de fim;
- observações;
- peças usadas;
- status;
- pagamento.

Isso protege o técnico e profissionaliza.

---

## 5.8 Central de modelos prontos

Modelos para:

- orçamento de instalação;
- orçamento de limpeza;
- orçamento de diagnóstico;
- orçamento de troca de capacitor;
- orçamento de troca de sensor;
- orçamento de manutenção preventiva;
- proposta de PMOC;
- cobrança de orçamento parado;
- cobrança de pagamento;
- agradecimento pós-serviço;
- pedido de avaliação;
- aviso de atraso;
- aviso “estou a caminho”.

Usuário solo ama isso.

---

## 5.9 Pedido de avaliação automático

Depois de concluir e receber:

> “Cliente satisfeito? Enviar pedido de avaliação?”

Texto:

> “Oi, tudo bem? Se gostou do atendimento, sua avaliação ajuda muito meu trabalho. Pode deixar uma nota aqui?”

No futuro, integrar com Google Meu Negócio.

---

## 5.10 PMOC e contratos recorrentes

Para ar-condicionado, PMOC é ouro.

Produto:

- cadastro de contrato;
- cliente;
- equipamentos;
- frequência;
- checklist;
- relatório;
- próxima visita;
- vencimento;
- alerta;
- assinatura;
- PDF.

Não precisa começar completo, mas já deixar espaço.

---

# 6. Painel administrador para você, Igor

Você pediu um painel para cuidar de todos os dados e entender melhor o usuário. Isso é obrigatório.

Esse painel não é o painel do dono da empresa usuária. É o **painel master do OLLI**.

## 6.1 Visão geral

Indicadores:

- total de usuários;
- usuários ativos hoje;
- usuários ativos 7 dias;
- usuários ativos 30 dias;
- novos cadastros;
- empresas criadas;
- usuários solo;
- empresas com equipe;
- churn;
- planos pagos;
- receita mensal recorrente;
- uso da IA;
- orçamentos criados;
- orçamentos enviados;
- orçamentos aprovados;
- valor total orçado;
- valor aprovado;
- taxa de conversão;
- tickets de suporte;
- erros não encontrados;
- códigos mais buscados;
- segmentos mais usados.

---

## 6.2 Funil do produto

Ver:

1. Usuário cadastrou.
2. Criou empresa.
3. Criou primeiro cliente.
4. Criou primeiro serviço.
5. Criou primeiro orçamento.
6. Enviou link.
7. Cliente abriu.
8. Cliente aprovou.
9. Usuário gerou PDF.
10. Usuário voltou no dia seguinte.
11. Usuário assinou plano.

Isso mostra onde o app está vazando.

Se muita gente cadastra e não cria orçamento, onboarding ruim.

---

## 6.3 Mapa de ativação

Ação que indica valor real:

- criou 1 orçamento;
- enviou link;
- orçamento foi visualizado;
- orçamento foi aprovado;
- voltou em até 7 dias.

Meta:

> Fazer o usuário criar e enviar um orçamento nos primeiros 5 minutos.

---

## 6.4 Painel de uso da IA

Ver:

- quantas chamadas de IA por usuário;
- tipo de pergunta;
- orçamento por voz;
- diagnóstico;
- código de erro;
- mensagem para cliente;
- cobrança;
- precificação;
- falhas da IA;
- custo por usuário;
- custo por plano;
- abuso;
- prompts com erro;
- respostas avaliadas como úteis/não úteis.

Regra:

> IA precisa vender, economizar tempo ou reduzir erro. Se for só brinquedo, corta.

---

## 6.5 Painel de base técnica

Para códigos de erro e diagnósticos:

- códigos mais buscados;
- marcas mais buscadas;
- modelos sem resultado;
- erros sem fonte;
- termos digitados errado;
- fotos enviadas;
- soluções sugeridas;
- feedback do técnico;
- casos resolvidos;
- casos marcados como incorretos.

Isso alimenta a base.

---

## 6.6 Painel de suporte

Ver:

- usuário travado;
- erro recorrente;
- tela com mais abandono;
- reclamação;
- bug;
- pedido de funcionalidade;
- plano;
- empresa;
- histórico.

A IA pode resumir:

> “Usuários solo estão reclamando que cadastro de serviço é longo. Simplificar catálogo inicial.”

---

## 6.7 Painel de empresas

Para cada empresa:

- dono;
- plano;
- técnicos;
- orçamentos;
- faturamento orçado;
- conversão;
- uso de IA;
- estoque;
- equipe;
- OS;
- últimas atividades;
- risco de cancelamento;
- mensagens enviadas;
- limite do plano.

---

## 6.8 Painel de risco de churn

OLLI deve detectar quem vai cancelar.

Sinais:

- não criou orçamento em 7 dias;
- caiu uso;
- não enviou link;
- não concluiu onboarding;
- usou IA e não retornou;
- teve erro;
- plano venceu;
- pagamento falhou.

Ação:

- mensagem automática;
- tutorial;
- oferta;
- suporte;
- “quer que eu configure para você?”

---

## 6.9 Painel de viralidade

Medir:

- quantos links de orçamento foram enviados;
- quantos clientes abriram;
- quantos clicaram no rodapé OLLI;
- quantos criaram conta a partir de link;
- indicação por usuário;
- convites de equipe;
- compartilhamentos.

Loop viral principal:

> Usuário envia orçamento bonito → cliente vê “feito com OLLI” → outro prestador/cliente descobre → cadastro.

---

# 7. Ideias de viralidade barata

## 7.1 Rodapé “Feito com OLLI”

No link e PDF:

> Orçamento profissional criado com OLLI

No plano pago, permitir remover ou deixar personalizado.

---

## 7.2 Indique e ganhe

Prestador indica outro:

- ganha 1 mês;
- ganha créditos de IA;
- ganha modelos premium;
- ganha remoção de marca por 30 dias.

---

## 7.3 Templates compartilháveis

Criar biblioteca:

- “Modelo de orçamento de instalação split”
- “Modelo de limpeza”
- “Modelo de PMOC”
- “Modelo de cobrança”
- “Modelo de garantia”

Usuário pode compartilhar template com link.

---

## 7.4 Ranking/insights

Mostrar cards compartilháveis:

> “Esse mês você enviou R$ 18.400 em orçamentos.”

> “Sua conversão subiu 12%.”

> “Você recuperou R$ 2.300 em orçamentos parados.”

Isso vira print.

---

## 7.5 Antes/depois bonito

Relatório com fotos antes/depois pode virar peça de marketing.

Botão:

> “Gerar post para Instagram/WhatsApp”

Com cuidado para não expor cliente sem autorização.

---

# 8. Modelo de preço recomendado

Você quer barato e viral. Então eu faria assim:

## Plano Isca / Grátis controlado

Não é para dar tudo. É para espalhar.

- 5 orçamentos/mês;
- link com marca OLLI;
- 1 usuário;
- catálogo simples;
- sem IA ilimitada;
- sem painel web;
- sem equipe.

Objetivo:

> Fazer o cara sentir o gosto e divulgar o link.

---

## Plano Solo — R$ 39 a R$ 59/mês

Para autônomo.

- orçamentos ilimitados;
- PDF/link com logo;
- agenda;
- clientes;
- recibos;
- OLLI Voz limitada/justa;
- códigos de erro;
- follow-up;
- cobrança manual;
- histórico básico.

Esse plano precisa ser irresistível.

---

## Plano Pro — R$ 79 a R$ 99/mês

Para solo mais sério.

- IA mais forte;
- mensagens automáticas;
- modelos premium;
- garantia;
- OS com fotos;
- relatórios;
- diagnóstico guiado;
- mais armazenamento;
- remoção parcial da marca OLLI.

---

## Plano Empresa — R$ 149 a R$ 229/mês

Para equipe.

- funcionários;
- painel web;
- mapa;
- processos/checklists;
- estoque;
- permissões;
- relatórios;
- callbacks;
- uso por técnico.

---

## Add-on funcionário

- R$ 29 a R$ 39/mês por técnico extra.

---

## Créditos de IA

Evitar IA ilimitada sem controle.

- cada plano tem franquia;
- extra via pacote;
- admin vê custo;
- IA de orçamento e diagnóstico conta de formas diferentes.

---

# 9. O que NÃO fazer agora

Não fazer:

- ERP gigante;
- marketplace de peças no MVP;
- financeiro contábil completo;
- emissão fiscal complexa;
- WhatsApp API oficial logo no começo se travar velocidade;
- PMOC completo antes de validar orçamento/OS;
- gestão de frota;
- chat interno;
- rede social dentro do app;
- IA tentando fazer tudo;
- multi-segmento amplo antes de dominar HVAC.

Foco:

1. orçamento;
2. agenda;
3. link do cliente;
4. IA por voz;
5. follow-up;
6. OS/checklist;
7. histórico;
8. painel admin;
9. códigos de erro.

---

# 10. Onboarding ideal

O onboarding precisa ser violento de simples.

## Passo 1

Nome da empresa, WhatsApp, logo opcional.

## Passo 2

Escolha segmento:

- ar-condicionado;
- elétrica;
- hidráulica;
- pintura;
- outro.

## Passo 3

Escolha serviços prontos:

- instalação split;
- limpeza;
- manutenção preventiva;
- diagnóstico;
- troca capacitor;
- carga de gás;
- PMOC.

## Passo 4

Criar primeiro orçamento.

A tela deve dizer:

> “Vamos criar seu primeiro orçamento agora.”

Nunca jogar o usuário para dashboard vazio.

---

# 11. Primeira experiência mágica

A experiência que faz o usuário gostar:

1. Ele fala um serviço por voz.
2. A IA monta orçamento.
3. Ele envia link.
4. Cliente abre bonito.
5. Ele vê “cliente visualizou”.
6. OLLI lembra de cobrar.
7. Cliente aprova.
8. OLLI gera OS/checklist.
9. Finaliza com foto/assinatura.
10. Recebe e gera recibo.

Isso é o caminho do “ual”.

---

# 12. Funcionalidades prioritárias por impacto

## Prioridade 1 — Dinheiro imediato

- orçamento rápido;
- link;
- aprovação;
- follow-up;
- cobrança;
- recibo.

## Prioridade 2 — Organização

- agenda;
- clientes;
- histórico;
- OS;
- checklist.

## Prioridade 3 — Diferencial técnico

- códigos de erro;
- diagnóstico guiado;
- IA técnica;
- histórico da máquina.

## Prioridade 4 — Empresa/equipe

- painel web;
- funcionários;
- mapa;
- permissões;
- produtividade;
- callbacks.

## Prioridade 5 — Expansão

- PMOC;
- estoque avançado;
- marketplace;
- WhatsApp oficial;
- Google avaliações;
- relatórios premium.

---

# 13. OLLI como IA do prestador

A IA precisa ter papéis claros.

## 13.1 OLLI Orçamentista

- monta orçamento;
- ajusta linguagem;
- cria versão simples/formal;
- protege margem;
- sugere preço.

## 13.2 OLLI Técnica

- interpreta erro;
- faz diagnóstico guiado;
- sugere teste;
- alerta antes de trocar peça.

## 13.3 OLLI Secretária

- lembra retorno;
- cobra orçamento;
- confirma visita;
- envia aviso de atraso;
- manda agradecimento.

## 13.4 OLLI Gerente

- mostra números;
- alerta equipe atrasada;
- mostra orçamento parado;
- mostra técnico com muito callback;
- aponta estoque baixo.

## 13.5 OLLI Professora de Campo

- explica como medir sensor;
- explica superaquecimento;
- explica sub-resfriamento;
- explica erro de comunicação;
- ensina sem humilhar.

---

# 14. Admin master — eventos que precisam ser rastreados

Eventos:

- signup_started
- signup_completed
- company_created
- first_client_created
- first_quote_started
- first_quote_created
- quote_sent
- quote_link_opened
- quote_approved
- quote_rejected
- quote_followup_sent
- quote_payment_requested
- payment_marked_paid
- work_order_created
- checklist_started
- checklist_completed
- photo_added
- signature_added
- ai_voice_used
- ai_diagnosis_used
- error_code_searched
- error_code_not_found
- employee_invited
- employee_active
- app_opened
- churn_risk_detected
- subscription_started
- subscription_cancelled
- support_requested

Sem esses eventos, você fica cego.

---

# 15. Métricas que importam

## Produto

- tempo até primeiro orçamento;
- % que envia primeiro orçamento;
- % que volta em 7 dias;
- número médio de orçamentos por usuário;
- taxa de aprovação;
- taxa de follow-up;
- uso de IA por usuário;
- uso de link por usuário.

## Negócio do usuário

- valor orçado;
- valor aprovado;
- conversão;
- orçamentos parados;
- pagamentos pendentes;
- visitas realizadas;
- callbacks;
- garantia;
- ticket médio;
- tempo médio de fechamento.

## OLLI SaaS

- MRR;
- churn;
- CAC;
- LTV;
- conversão trial/pago;
- uso por plano;
- custo IA por plano;
- suporte por usuário;
- features mais usadas.

---

# 16. Ideias para deixar barato sem matar margem

- IA com limite por plano;
- cache de respostas técnicas comuns;
- modelos locais sem IA para mensagens simples;
- base de códigos estruturada para não chamar IA sempre;
- gerar orçamento por regra antes de usar IA;
- usar IA só para texto, diagnóstico e voz;
- usar prompts curtos;
- diferenciar IA “rápida” e IA “profunda”;
- cobrar créditos extras.

---

# 17. O que o Cloud Code deve entender

O pedido não é “criar mais telas”.

O pedido é:

> **Transformar o OLLI em uma ferramenta diária que o prestador abre de manhã, usa no atendimento e consulta à noite para saber se ganhou dinheiro.**

Prioridade de produto:

1. Menos digitação.
2. Mais dinheiro recuperado.
3. Menos esquecimento.
4. Mais profissionalismo.
5. Menos retrabalho.
6. Mais controle para o dono.
7. Mais viralidade pelo cliente final.

---

# 18. Prompt para o Cloud Code

```text
Você vai evoluir o OLLI com base em dores reais de prestadores de serviço, especialmente ar-condicionado/refrigeração.

Não trate o OLLI como apenas um app de orçamento. Trate como um sistema operacional simples para o prestador pequeno.

O produto precisa resolver estas dores:
- demora para criar orçamento;
- orçamento parado sem follow-up;
- cliente que some;
- no-show;
- cobrança e pagamento atrasado;
- falta de histórico de cliente/equipamento;
- serviço sem foto, assinatura e prova;
- funcionário sem padrão;
- dono sem visão da equipe;
- estoque invisível;
- preço mal calculado;
- códigos de erro difíceis;
- diagnóstico técnico inseguro;
- retrabalho/callback;
- falta de profissionalismo no WhatsApp.

Mantenha a experiência rápida e simples. O usuário solo não quer ERP. Ele quer ganhar tempo, parecer profissional, cobrar melhor e não esquecer nada.

Módulos que devem ser tratados como centrais:
1. Orçamento rápido manual e por voz.
2. Link do cliente com aprovação/recusa.
3. Follow-up automático de orçamento parado.
4. Agenda com rota e confirmação.
5. OS com checklist, fotos e assinatura.
6. Histórico do cliente e da máquina.
7. Códigos de erro e diagnóstico por IA.
8. Recibo e cobrança.
9. Painel web do dono.
10. Painel master/admin do OLLI para Igor analisar uso, dados, custos, churn, erros e comportamento.

A IA OLLI deve atuar como:
- orçamentista;
- técnica;
- secretária;
- gerente;
- professora de campo.

Sempre que possível, transformar ações em dinheiro:
- recuperar orçamento parado;
- enviar cobrança;
- gerar link;
- pedir avaliação;
- agendar retorno;
- criar orçamento a partir de voz;
- sugerir preço mínimo;
- evitar serviço com margem negativa.

O painel master do Igor precisa mostrar:
- usuários;
- empresas;
- planos;
- MRR;
- uso da IA;
- custo da IA;
- orçamentos criados/enviados/aprovados;
- valor orçado/aprovado;
- códigos de erro buscados;
- erros não encontrados;
- funil de ativação;
- retenção;
- churn;
- empresas com risco de cancelamento;
- features mais usadas;
- feedbacks;
- tickets;
- pedidos de funcionalidade.

O MVP precisa fazer o usuário criar e enviar o primeiro orçamento em menos de 5 minutos.
```

---

# 19. Roadmap sugerido

## Fase 1 — Valor imediato

- orçamento manual;
- orçamento por voz;
- PDF/link;
- cliente aprova;
- recibo;
- clientes;
- catálogo;
- follow-up manual/assistido;
- admin básico.

## Fase 2 — Operação

- agenda;
- OS;
- checklist;
- fotos;
- assinatura;
- histórico;
- mensagens prontas;
- confirmação de visita.

## Fase 3 — IA técnica HVAC

- códigos de erro;
- diagnóstico por sintoma;
- guia de LED;
- histórico da máquina;
- mensagem técnica para cliente;
- orçamento com base no diagnóstico.

## Fase 4 — Empresa

- funcionários;
- painel web;
- mapa;
- status;
- processos;
- callbacks;
- estoque simples;
- permissões.

## Fase 5 — Crescimento

- PMOC;
- contratos recorrentes;
- WhatsApp oficial;
- avaliações Google;
- indicações;
- templates compartilháveis;
- marketplace futuro.

---

# 20. Conclusão

Na lata:

O OLLI ganha se for **mais simples que um ERP**, **mais inteligente que uma planilha** e **mais profissional que mandar orçamento no WhatsApp escrito à mão**.

O produto precisa virar hábito.

O técnico deve abrir o OLLI porque:

- o próximo cliente está ali;
- a rota está ali;
- o orçamento está ali;
- a cobrança está ali;
- o diagnóstico está ali;
- o histórico está ali;
- o dinheiro parado está ali.

A frase que resume:

> **OLLI é o copiloto do prestador: organiza o dia, monta orçamento, cobra cliente, guia o serviço e mostra onde o dinheiro está escapando.**

---

# 21. Fontes públicas consultadas

## Comunidades e discussões

- Reddit — r/HVAC: uso de Housecall Pro, ServiceTitan, preço por técnico, orçamento, cobrança em campo.
- Reddit — r/smallbusiness: software simples para HVAC solo, no-show, pagamento atrasado, scheduling.
- Reddit — r/Contractor, r/HomeImprovement, r/Homeowners: clientes reclamando de orçamento atrasado, ghosting, pedidos de detalhamento e depósitos.
- Facebook Groups públicos indexados: dores de software em service business, CRM para HVAC, problemas com ServiceTitan e custo.

## Softwares e mercado

- Jobber pricing e review 2026.
- Housecall Pro pricing e HVAC software.
- ServiceTitan pricing.
- Auvo climatização/refrigeração e PMOC.
- GestãoClick programa para empresa de ar-condicionado.
- Workiz HVAC billing/invoicing.
- FieldEdge callback/service management.
- Dataforma service history/callback tracking.
- Field Ascend job management.
- Salesforce Field Service small business.

## Brasil / contexto de mercado

- Agência Brasil / IBGE: trabalhadores por conta própria e informalidade.
- Sebrae: dificuldades de gestão, clientes, vendas, organização financeira e planejamento.
- Reclame Aqui: reclamações públicas envolvendo assistência, atraso, falta de retorno e serviço mal feito em ar-condicionado.
- WebArCondicionado: contexto de apps/pedidos para técnicos de ar-condicionado.

