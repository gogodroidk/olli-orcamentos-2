# Sucesso do usuário e ajuda progressiva

Data: 30/08/2026  
Produto: OLLI Orçamentos  
Superfícies: aplicativo, dashboard web, página pública do cliente e suporte

## Decisão de produto

O OLLI não deve apenas disponibilizar ferramentas. Ele deve habilitar o prestador a usá-las bem, no momento em que elas passam a ser úteis.

A metáfora da Ferrari é correta: entregar muitos recursos sem ensinar gera baixa adoção, insegurança e dependência de suporte. A solução, porém, não é obrigar a pessoa a assistir a um curso antes de começar. O caminho recomendado é uma camada permanente de sucesso do usuário, chamada provisoriamente de **OLLI Guia**, que ensina dentro do trabalho real e desaparece gradualmente à medida que a pessoa aprende.

Nome final, tom de voz e identidade visual ainda são decisão de produto. `OLLI Guia` é apenas um nome de trabalho; a Central de Ajuda atual continua sendo a base funcional.

## O que já existe e deve ser reaproveitado

Verificação estática realizada no repositório canônico em 30/08/2026:

- `src/content/ajuda/index.ts`: catálogo tipado de categorias, artigos, tags, passos e avisos;
- `src/screens/AjudaScreen.tsx`: Central de Ajuda no app, com busca, artigos, deep link e suporte;
- `src/screens/desktop/AjudaDesktopScreen.tsx`: experiência desktop baseada no mesmo catálogo;
- `src/components/DicaContextual.tsx`: explicação inline, não bloqueante, exibida uma vez e dispensável;
- seis telas já usam dica contextual: Home, Orçamentos, Agenda, Clientes, Equipamento e início do técnico;
- `src/services/onboarding.ts`: preferência de mostrar dicas, registro das dicas vistas e opção de rever a apresentação;
- `src/screens/OnboardingScreen.tsx`: onboarding configurável que pode terminar no fluxo real do primeiro orçamento;
- `src/screens/OlliChatScreen.tsx` e o assistente global web: canais já existentes para evoluir a orientação conversacional;
- `src/services/analytics.ts`: eventos de artigo aberto, busca e contato com suporte;
- Conta e Conta Desktop: acesso à ajuda, controle das dicas e ação para rever apresentação e dicas;
- suporte por WhatsApp, e-mail e formulário já aparece dentro da Central de Ajuda.

Portanto, não é necessário criar outro sistema paralelo. A evolução deve consolidar a base existente e eliminar divergências entre app, desktop e conteúdo.

## Problemas ainda não resolvidos

1. As peças existentes não formam uma jornada única de aprendizado.
2. A dica atual sabe apenas se foi dispensada naquele aparelho; ela não sabe se a tarefa foi concluída nem representa progresso da conta.
3. Só seis telas têm ajuda contextual, e a dica explica um trecho de interface, não uma habilidade completa.
4. A Central de Ajuda abre artigos, mas ainda não leva a pessoa diretamente para executar a tarefa descrita.
5. Os eventos medem busca, abertura e contato, mas não comprovam que a pessoa resolveu o problema.
6. O assistente ainda não está formalmente preso a uma fonte oficial e versionada de instruções do produto.
7. Conteúdo de ajuda pode ficar desatualizado quando a interface muda; isso exige responsabilidade e teste de versão.
8. A experiência de aprendizado não está organizada por maturidade: iniciante, ativado, recorrente e avançado.
9. Vídeos, notificações e mensagens futuras ainda não possuem regra de consentimento, frequência ou relevância.

## Princípios obrigatórios

### 1. A interface vem antes da ajuda

Se um botão, rótulo ou fluxo puder ficar mais claro, ele deve ser corrigido. Ajuda não deve mascarar um desenho ruim.

### 2. Ensinar fazendo

O usuário aprende ao cadastrar um cliente real, criar um orçamento real, revisar e enviar. Não deve completar uma simulação longa para só depois usar o produto.

### 3. Explicar três coisas

Cada orientação importante responde, em linguagem curta:

- **o que é**;
- **por que isso ajuda**;
- **o que acontece quando eu tocar**.

Exemplo: `Validade do orçamento — define até quando o cliente pode aprovar estas condições. Depois da data, você decide se atualiza e reenvia.`

### 4. Revelação progressiva

Iniciantes veem o essencial. Recursos avançados aparecem quando o comportamento indica necessidade. O OLLI não apresenta tudo no primeiro acesso.

### 5. Uma orientação por vez

Não empilhar balões, modais, badges e notificações. A ajuda nunca deve cobrir a ação principal, impedir o toque, competir com um alerta crítico ou reaparecer depois de dispensada sem solicitação do usuário.

### 6. Sempre permitir sair e voltar

Toda orientação deve oferecer `Pular`, `Entendi`, `Agora não` ou equivalente. A área de Conta mantém `Rever apresentação e dicas`.

### 7. Acessível por toque, teclado e leitor de tela

Tooltip não pode depender somente de hover. Explicações precisam funcionar com toque, foco, teclado e tecnologia assistiva. Vídeos futuros exigem legenda e transcrição.

### 8. Ajuda oficial e verificável

O assistente deve responder a partir do catálogo oficial da versão em uso, apontar o artigo ou passos usados e admitir quando não souber. Nunca inventar uma função ou prometer uma ação que a tela não executa.

## Arquitetura da experiência

### Camada A — produto autoexplicativo

É a primeira defesa contra dúvida:

- uma ação principal por tela;
- rótulos textuais em ações importantes;
- mensagem de consequência antes de ações sensíveis;
- confirmação visual de salvo, enviado, atualizado e reenviado;
- estados vazios que ensinam o próximo passo;
- erros que explicam como corrigir;
- exemplos reais e linguagem sem jargão técnico.

### Camada B — primeira conquista guiada

Em vez de um tour por menus, oferecer um checklist curto e descartável:

1. confirme os dados do negócio;
2. cadastre ou escolha um serviço;
3. adicione o primeiro cliente;
4. crie e revise o primeiro orçamento;
5. envie ou compartilhe a versão correta.

O progresso deve representar ações concluídas no produto. O checklist não bloqueia o uso, pode ser minimizado e comemora de forma discreta a primeira conquista.

Resultado desejado: a pessoa entende o ciclo principal e vê valor antes de receber uma oferta de upgrade.

### Camada C — ajuda contextual

Usar três formatos, conforme a necessidade:

- **texto auxiliar persistente** para campos que geram dúvida frequente;
- **ícone de informação** para conceitos como validade, margem, versão e status;
- **dica de primeira utilização** para ações novas e importantes.

A dica pode oferecer `Ver exemplo` ou `Saiba mais`, abrindo o artigo exato por deep link. Quando fizer sentido, o artigo oferece `Fazer agora` e retorna à tela correta.

Não adicionar dica em todo botão comum. `Salvar`, `Voltar`, `Buscar` e ações universais devem ser claras por si mesmas.

### Camada D — Central de Ajuda por tarefa

Preservar a Central existente e organizar o conteúdo por intenção, não pela estrutura interna do software:

- começar a usar;
- criar, editar, versionar e reenviar orçamento;
- saber se o cliente viu, aprovou ou recusou;
- organizar agenda e execução;
- personalizar empresa e modelo;
- recuperar acesso e proteger a conta;
- entender plano, limites e cobrança;
- resolver erros e falar com suporte.

Cada artigo deve conter:

- objetivo;
- quando usar;
- passos curtos;
- resultado esperado;
- aviso de consequência, quando necessário;
- ação `Fazer agora`, quando houver rota segura;
- versão/revisão do conteúdo.

A busca precisa aceitar linguagem do usuário, incluindo sinônimos e erros comuns. Buscas sem resultado alimentam a fila de melhoria do conteúdo.

### Camada E — assistente contextual

O Chat com a OLLI e o assistente global podem se tornar a porta conversacional da ajuda. Evolução recomendada:

- receber somente o contexto mínimo da tela atual, função do usuário e versão do aplicativo;
- consultar o catálogo oficial de ajuda antes de responder sobre o produto;
- mostrar a fonte interna: `Baseado em: Editar e reenviar orçamento`;
- oferecer deep link seguro para a tela ou artigo;
- perguntar antes de preencher qualquer coisa;
- nunca enviar orçamento, alterar preço, cobrar, apagar ou publicar;
- encaminhar para suporte quando não houver resposta confiável.

Essa camada é posterior à consolidação do catálogo. IA não substitui informação correta nem suporte humano.

### Camada F — educação progressiva

Após a ativação, ensinar de acordo com acontecimentos reais:

- depois do primeiro orçamento: duplicar, usar catálogo e modelo padrão;
- depois da primeira aprovação: agenda, ordem de serviço e acompanhamento;
- após repetição de itens: atalhos e automações relevantes;
- após edição de orçamento enviado: versionamento e reenvio;
- após busca sem resultado ou erro repetido: ajuda específica e suporte;
- após longo período sem uso: convite discreto para retomar, sem culpa.

Canal padrão: dentro do produto. Push, e-mail e WhatsApp ficam para uma fase futura, com consentimento, preferência de canal, limite de frequência, opt-out e benefício claro. Não usar WhatsApp como spam de adoção.

### Camada G — vídeos e materiais futuros

Vídeos podem ajudar em tarefas visuais, mas nunca podem ser obrigatórios para operar o sistema.

Padrão proposto:

- um vídeo por tarefa;
- 30 a 90 segundos;
- legenda, transcrição e velocidade controlável;
- capa leve e reprodução somente após toque;
- mesma nomenclatura da interface atual;
- revisão quando o fluxo mudar;
- alternativa textual completa.

## Como o usuário verá isso

### No aplicativo

- cartão minimizável `Seus primeiros passos` na Home;
- progresso como `3 de 5 concluídos`, sem infantilizar;
- pequenas explicações abaixo de campos complexos;
- ícone `i` tocável ao lado de termos pouco familiares;
- dica inline perto de um recurso novo, uma de cada vez;
- `Saiba mais` abrindo o artigo exato;
- `Fazer agora` retornando à tarefa;
- botão de ajuda em posição consistente, sem cobrir o CTA;
- opção `Rever apresentação e dicas` na Conta;
- ao final de uma ajuda: `Conseguiu resolver? Sim / Ainda preciso de ajuda`.

### No dashboard web

- item `Ajuda` preservado na navegação;
- busca rápida acessível por teclado;
- painel lateral contextual opcional, sem tirar a pessoa da tarefa;
- links de ajuda junto a configurações complexas;
- checklist de ativação sincronizado com o app;
- artigos com índice e ação para abrir a tela correspondente;
- assistente global apontando documentação oficial.

### No painel administrador

Somente dados agregados e necessários para melhorar o produto:

- buscas mais frequentes;
- buscas sem resultado;
- artigos úteis ou não úteis;
- etapa em que o onboarding é abandonado;
- dicas dispensadas e tarefas concluídas depois da ajuda;
- temas que viram contato de suporte;
- versão do conteúdo e do aplicativo.

Não gravar texto sensível de cliente, orçamento, conversa privada, senha, token ou sessão em eventos de ajuda.

## O que evitar

- tour longo e obrigatório no primeiro login;
- overlay que bloqueia a tela inteira;
- tooltip em todos os botões;
- ajuda que reaparece após `Entendi`;
- notificação por qualquer recurso não usado;
- badges, pontos ou linguagem infantil para público profissional;
- vídeo com autoplay;
- IA que inventa caminhos ou executa ações sem confirmação;
- exigir vídeo ou chat para completar uma tarefa;
- usar ajuda para esconder erro de arquitetura, texto ou navegação;
- transformar o botão flutuante em obstáculo sobre a ação principal.

## Métricas de sucesso

Medir comportamento atual antes de definir metas numéricas. Não inventar baseline.

- tempo até criar, revisar e enviar o primeiro orçamento;
- taxa de conclusão do checklist;
- conclusão da tarefa depois de abrir uma dica ou artigo;
- busca sem resultado;
- reabertura do mesmo tema;
- contato com suporte após consumir ajuda;
- adoção de recurso após orientação contextual;
- abandono por etapa do onboarding;
- resposta `Conseguiu resolver?`;
- erros de fluxo e acessibilidade encontrados em teste moderado.

O principal indicador não é `artigo aberto`; é `a pessoa concluiu a tarefa correta sem erro e sem precisar repetir o pedido de ajuda`.

## Fases de implantação

### Fase 0 — fundação e consistência

- auditar artigos contra o comportamento real do app e web;
- definir proprietário e revisão de cada artigo;
- criar contrato único para deep link, origem, versão e ação `Fazer agora`;
- ampliar eventos para medir resolução e busca sem resultado;
- separar preferência da conta de preferência do aparelho com migração compatível;
- documentar quais dados de contexto o assistente pode receber.

### Fase 1 — primeira conquista

- checklist de cinco ações reais;
- estados vazios educativos;
- progresso minimizável;
- entrada consistente para ajuda;
- teste com prestadores de baixa familiaridade digital.

### Fase 2 — ajuda contextual completa

- priorizar orçamento, edição/versionamento, envio, agenda, Conta e personalização;
- `Saiba mais` e `Fazer agora` por deep link;
- `Conseguiu resolver?`;
- painel administrativo com sinais agregados.

### Fase 3 — assistente baseado na ajuda oficial

- respostas presas ao catálogo versionado;
- contexto mínimo da tela;
- fonte e nível de confiança visíveis;
- fallback para artigo, formulário ou suporte humano;
- testes contra instruções inexistentes e ações sensíveis.

### Fase 4 — conteúdo multimídia e ciclo de vida

- vídeos curtos e acessíveis;
- notificações in-app orientadas por comportamento;
- e-mail e, somente depois, WhatsApp com consentimento e limite de frequência;
- experimentos controlados de adoção e retenção.

## Critérios de aceite da primeira entrega

1. Usuário novo pode concluir a primeira conquista ou pular sem bloqueio.
2. Ajuda nunca cobre a ação principal nem impede toque, teclado ou leitor de tela.
3. Uma dica dispensada não reaparece sem pedido para rever.
4. Artigo aberto por contexto corresponde à tela e à versão atual.
5. `Fazer agora` leva à rota correta e preserva dados em andamento.
6. Busca sem resultado oferece suporte e gera evento sem conteúdo sensível.
7. É possível medir se a tarefa foi concluída após a ajuda.
8. App e web usam o mesmo catálogo conceitual e não se contradizem.
9. Assistente não afirma recurso inexistente nem realiza ação sensível.
10. Conteúdo, acessibilidade e comportamento são testados em aparelho e navegador reais antes de aceite.

## Hipóteses que exigem validação

- checklist de cinco passos é curto o bastante para não cansar;
- `OLLI Guia` é um nome compreensível e profissional;
- usuários preferem ajuda inline antes de vídeo ou chat;
- o botão de ajuda ideal pode permanecer na navegação/Conta sem precisar ser flutuante;
- educação baseada em acontecimentos aumenta adoção sem elevar desativação de notificações;
- sincronizar progresso por conta melhora uso em app e web sem confundir aparelhos compartilhados.

Essas afirmações não são resultados de campo. Devem ser testadas com tarefas reais e usuários do público-alvo antes de se tornarem metas comerciais.
