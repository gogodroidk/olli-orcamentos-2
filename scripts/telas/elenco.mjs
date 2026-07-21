/**
 * ELENCO FICTÍCIO — a única fonte de todo nome próprio, telefone, endereço e
 * valor que aparece nas telas publicadas em web/public/telas/.
 *
 * REGRA DA CASA: se um nome aparece numa imagem da landing, ele TEM de estar
 * neste arquivo. `gate-privacidade.mjs` confere isso automaticamente e FALHA a
 * captura se encontrar na tela um telefone, CPF, CNPJ, CEP ou e-mail que não
 * saia daqui. Não é conselho, é portão: screenshot publicado não se despublica.
 *
 * ─── Por que estes valores e não outros ────────────────────────────────────
 *
 * TELEFONES. Não existe no Brasil uma faixa "reservada para ficção" como o
 * 555-01xx americano. O que existe é uma faixa que a numeração nacional não
 * aloca: celular brasileiro é 9 + 8 dígitos e o primeiro desses 8 é 6, 7, 8 ou
 * 9 (herança dos antigos números de 8 dígitos). Por isso todo telefone daqui é
 * `9 0000-xxxx`: tem o formato certo, passa na máscara do app, e não pode tocar
 * no aparelho de ninguém.
 *
 * CPF / CNPJ. Ausentes de propósito — nenhum cliente do elenco tem documento.
 * Um CPF "inventado" tem chance real de ser o de alguém, e um CNPJ com dígito
 * verificador válido é um CNPJ de verdade de alguma empresa. O app funciona sem
 * documento (o campo é opcional), então a escolha mais segura é não ter nenhum.
 *
 * ENDEREÇOS. Rua genérica + cidade real, nunca um par rua+número+CEP que exista.
 * CEP também fica de fora: CEP é dado de localização real.
 *
 * NOMES DE CLIENTE. São os três que a landing JÁ publica hoje, desenhados à mão
 * em `web/src/components/HeroDevices.tsx` (linhas 235-247). Reaproveitá-los
 * mantém a continuidade visual da troca de desenho por foto e não amplia a
 * superfície de nomes publicados.
 *
 * NOME DA EMPRESA. "Ramalho Climatização" é o negócio do próprio dono do
 * produto (as iniciais "IR" já estão no hero de hoje). Se ele preferir um nome
 * inventado, é UMA linha aqui e uma recaptura — nada mais no pipeline muda.
 */

/**
 * Instante fictício em que TODA captura acontece. Congelar o relógio é o que
 * impede "Boa tarde" virar "Boa noite" e "há 2 dias" andar sozinho entre uma
 * rodada e a seguinte.
 *
 * **Quarta-feira, 15/07/2026, 10h35 (horário de Brasília).**
 *
 * ─── Por que quarta, e por que este comentário existe ──────────────────────
 *
 * A versão anterior era `2026-07-18T13:35:00.000Z` e este comentário jurava
 * "sexta-feira". **18/07/2026 é SÁBADO** — e o app imprimia isso na imagem
 * publicada: `05-agenda.png` saiu com "Sábado, 18 de julho" na vitrine da Play,
 * e os quatro cartões de `03-lista-orcamentos` saíram datados de um sábado.
 * Toda tela com data vendia um prestador trabalhando no fim de semana.
 *
 * O dia da semana não se confere de cabeça. Confere-se assim:
 *
 *   node -e "console.log(new Date('2026-07-15T13:35:00.000Z').toLocaleString(
 *     'pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',
 *     month:'2-digit',hour:'2-digit',minute:'2-digit'}))"
 *   -> quarta-feira, 15/07, 10:35
 *
 * Quarta de manhã é o meio da semana: sobram dias para trás E para a frente, o
 * que deixa `AGENDAMENTOS` espalhar a agenda em torno de "hoje" sem empilhar
 * tudo na borda do fim de semana. Com o sábado, os deslocamentos negativos
 * caíam todos em sexta e a semana da tela de computador saía com 5 das 7
 * colunas vazias — exatamente o contrário do que a legenda promete.
 *
 * Quem mexer neste valor: rode o comando acima ANTES de commitar.
 */
export const AGORA = '2026-07-15T13:35:00.000Z';

export const EMPRESA = {
  nome: 'Ramalho Climatização',
  especialidade: 'Instalação e manutenção de ar-condicionado',
  slogan: 'Serviço limpo, prazo cumprido',
  telefone: '(11) 90000-1010',
  email: 'contato@ramalhoclima.com.br',
  cidade: 'São Paulo',
  estado: 'SP',
  endereco: 'Rua das Acácias, 240',
};

export const CLIENTES = [
  {
    nome: 'Clínica Vida & Saúde',
    telefone: '(11) 90000-2020',
    endereco: 'Rua das Acácias, 240',
    cidade: 'São Paulo',
    estado: 'SP',
  },
  {
    nome: 'Ar Frio Refrigeração',
    telefone: '(11) 90000-3030',
    endereco: 'Rua dos Ipês, 87',
    cidade: 'São Paulo',
    estado: 'SP',
  },
  {
    nome: 'Padaria Pão Quente',
    telefone: '(11) 90000-4040',
    endereco: 'Avenida das Palmeiras, 1520',
    cidade: 'São Paulo',
    estado: 'SP',
  },
];

/**
 * CLIENTES QUE SÓ EXISTEM NA CARTEIRA — não têm orçamento, OS nem visita.
 *
 * ─── O que estava errado, medido ───────────────────────────────────────────
 *
 * `08-clientes.png` saía com QUATRO cartões, e dois deles eram
 * "Clínica Vida & Saúde" — o mesmo nome, o mesmo telefone, a mesma cidade,
 * duplicados. Não era defeito do app: `semearTudo` cadastrava o cliente do
 * orçamento-herói e depois cadastrava DE NOVO o mesmo cliente ao criar o 3º
 * orçamento extra, porque nenhum dos dois passava `clienteJaExiste`. A tela da
 * loja mostrava o produto criando cliente repetido — que é justamente o
 * problema que um cadastro de clientes existe para resolver.
 *
 * Corrigido o duplicado, sobravam TRÊS cartões numa tela de 1517 px: 25,6% de
 * faixa vazia contínua no meio da tela (medido com
 * `node scripts/telas/medir-ocupacao.mjs`). O rodapé não acusava nada porque o
 * botão flutuante "+" fica colado embaixo e conta como conteúdo — ver a
 * limitação do medidor no cabeçalho dele.
 *
 * ─── Por que clientes SEM trabalho vinculado ───────────────────────────────
 *
 * Porque é o que a carteira de um prestador de verdade é: muito mais gente
 * cadastrada do que serviço em aberto. Encher a tela criando mais orçamentos
 * mudaria `03-lista-orcamentos`, a lista de elegíveis da Nova OS e o funil —
 * três telas para resolver uma. Estes seis existem só no cadastro, e são
 * semeados por último, pela tela de Clientes (botão "+"), que é o caminho real.
 *
 * Mesmas regras de segurança dos outros: telefone na faixa `9 0000-xxxx` que a
 * numeração brasileira não aloca, endereço genérico, sem CPF, sem CNPJ, sem CEP.
 */
export const CLIENTES_EXTRA = [
  {
    nome: 'Academia Corpo em Forma',
    telefone: '(11) 90000-5050',
    endereco: 'Rua dos Jacarandás, 512',
    cidade: 'São Paulo',
    estado: 'SP',
  },
  {
    nome: 'Mercado São Jorge',
    telefone: '(11) 90000-6060',
    endereco: 'Avenida dos Flamboyants, 77',
    cidade: 'São Paulo',
    estado: 'SP',
  },
  {
    nome: 'Studio Bela Imagem',
    telefone: '(11) 90000-7070',
    endereco: 'Rua das Cerejeiras, 33',
    cidade: 'São Paulo',
    estado: 'SP',
  },
];

/**
 * Itens do orçamento-herói. Os preços saem de serviço de HVAC residencial/
 * comercial em São Paulo — a ordem de grandeza importa: um prestador que olhar
 * a landing e vir R$ 20 numa instalação sabe na hora que é maquete.
 * Total: 890×2 + 180×2 + 340 = R$ 2.480,00.
 */
export const ITENS_ORCAMENTO = [
  { nome: 'Instalação de split 12.000 BTUs', descricao: 'Com tubulação de até 3 metros', preco: 89000, quantidade: 2 },
  { nome: 'Limpeza completa com higienização', descricao: 'Evaporadora e condensadora', preco: 18000, quantidade: 2 },
  { nome: 'Carga de gás R-410A', descricao: 'Com teste de estanqueidade', preco: 34000, quantidade: 1 },
];

/**
 * Os outros orçamentos existem só para as TELAS DE LISTA não aparecerem com um
 * item só — uma lista de um item não mostra que o produto organiza trabalho,
 * mostra que ele está vazio. Status diferentes de propósito: é o que dá sentido
 * ao filtro e ao funil na captura.
 *
 * A QUANTIDADE é medida, não estimada. Com três (o herói + dois), a captura
 * `03-lista-orcamentos` saía com 23% da altura vazia no rodapé
 * (`node scripts/telas/medir-ocupacao.mjs`). O quarto fecha a tela.
 *
 * O quarto é 'Em negociação' de propósito, e não 'Aprovado': aprovado a mais
 * mudaria a lista de "orçamentos elegíveis" da tela de Nova OS, que é semeada
 * escolhendo o cliente pelo nome. 'Em negociação' acrescenta um card e um
 * estado novo ao funil sem tocar em nenhum outro fluxo.
 *
 * Não é 'Visualizado', que seria a escolha óbvia: o app EXCLUI 'visualizado' do
 * menu de status à mão de propósito (`VisualizarOrcamentoScreen.tsx:42-49` —
 * "é um estado que o CLIENTE dispara pelo link, não algo que o dono marca"). A
 * primeira versão desta lista pediu 'Visualizado' e a semeadura quebrou alto,
 * que é o comportamento certo: semear pela interface real impede a screenshot
 * de mostrar um estado que o produto não produz sozinho.
 */
export const ORCAMENTOS_EXTRA = [
  {
    cliente: CLIENTES[1],
    status: 'Enviado',
    itens: [
      { nome: 'Manutenção preventiva de split', descricao: 'Contrato trimestral', preco: 26000, quantidade: 3 },
    ],
  },
  {
    cliente: CLIENTES[2],
    status: 'Rascunho',
    itens: [
      { nome: 'Troca de capacitor da condensadora', descricao: 'Peça inclusa', preco: 14500, quantidade: 1 },
      { nome: 'Visita técnica', descricao: '', preco: 12000, quantidade: 1 },
    ],
  },
  {
    cliente: CLIENTES[0],
    status: 'Em negociação',
    itens: [
      { nome: 'Instalação de split 9.000 BTUs', descricao: 'Consultório 2, com suporte de parede', preco: 74000, quantidade: 1 },
      { nome: 'Ponto elétrico dedicado', descricao: 'Disjuntor e cabeamento', preco: 22000, quantidade: 1 },
    ],
  },
];

/**
 * AGENDA — `dias` é o deslocamento em relação a AGORA (quarta-feira).
 *
 * ─── Os três defeitos que esta lista corrige, todos medidos na imagem ──────
 *
 * 1. HORA REPETIDA. A versão anterior não definia hora nenhuma, e o app cai no
 *    padrão `09:00` (`AgendaScreen.tsx:270`). Resultado publicado em
 *    `05-agenda.png`: as duas visitas do dia com **09:00** na frente. Para
 *    quem vive de encaixar visita, duas às 09:00 não lê como organização, lê
 *    como conflito — e o próprio app concorda: `encontrarConflitoDeHorario`
 *    existe para avisar exatamente isso. Agora cada visita tem hora própria, e
 *    a coluna de horários passa a contar a história de um dia de trabalho.
 *
 * 2. TELA OCA NO MEIO. Com duas visitas sobravam 382 px de fundo chapado entre
 *    o último cartão e o botão — 25,2% da altura, medido. O rodapé não acusava
 *    (1,5%) porque a barra de abas fica embaixo e conta como conteúdo. Quatro
 *    visitas hoje fecham o vão.
 *
 * 3. ENDEREÇO QUE A LEGENDA PROMETIA E A IMAGEM NÃO TINHA. A legenda da landing
 *    (`roteiro.mjs`) diz "As visitas do dia com cliente, horário **e
 *    endereço**" e o cartão não mostrava endereço nenhum — o campo existe no
 *    formulário e ninguém preenchia. Com `endereco`, o cartão ganha o
 *    marcador de mapa E o botão de traçar rota (`AgendaScreen.tsx:701-717`),
 *    que é feature real do produto. A copy deixa de ser promessa e passa a ser
 *    descrição.
 *
 * ─── Por que espalhados assim ──────────────────────────────────────────────
 *
 * Quatro HOJE porque a tela do celular abre na visão de "Dia" e é ela que a
 * vitrine da Play fotografa. Uma ontem, uma amanhã e uma depois de amanhã
 * porque a tela de computador (landing) abre a SEMANA: com tudo em um dia só
 * ela sai com seis colunas vazias e uma cheia, que vende o contrário do que se
 * quer vender. Assim são quatro dos sete dias com trabalho — agenda de gente
 * ocupada, não de agenda vazia nem de agenda impossível.
 *
 * Os endereços são os do próprio cliente, copiados de `CLIENTES` de propósito:
 * cliente que muda de endereço a cada visita é ficção mal feita, e o app de
 * verdade preenche o endereço a partir do cadastro (`AgendaScreen.tsx:859`).
 */
export const AGENDAMENTOS = [
  {
    cliente: CLIENTES[0].nome,
    titulo: 'Instalação de 2 splits — sala de espera',
    dias: 0,
    hora: '08:00',
    endereco: CLIENTES[0].endereco,
  },
  {
    cliente: CLIENTES[2].nome,
    titulo: 'Limpeza do split da produção',
    dias: 0,
    hora: '10:30',
    endereco: CLIENTES[2].endereco,
  },
  {
    cliente: CLIENTES[1].nome,
    titulo: 'Troca do capacitor da condensadora',
    dias: 0,
    hora: '14:00',
    endereco: CLIENTES[1].endereco,
  },
  {
    cliente: CLIENTES[0].nome,
    titulo: 'Vistoria pós-instalação',
    dias: 0,
    hora: '16:30',
    endereco: CLIENTES[0].endereco,
  },
  {
    cliente: CLIENTES[1].nome,
    titulo: 'Manutenção preventiva — 3 splits da loja',
    dias: -1,
    hora: '09:00',
    endereco: CLIENTES[1].endereco,
  },
  {
    cliente: CLIENTES[2].nome,
    titulo: 'Carga de gás R-410A',
    dias: 1,
    hora: '08:30',
    endereco: CLIENTES[2].endereco,
  },
  {
    cliente: CLIENTES[0].nome,
    titulo: 'Instalação de split 9.000 — consultório 2',
    dias: 2,
    hora: '13:00',
    endereco: CLIENTES[0].endereco,
  },
];

/**
 * ORDENS DE SERVIÇO — a mesma regra dos orçamentos, aplicada onde ela tinha
 * sido esquecida.
 *
 * ─── O que estava errado, medido ───────────────────────────────────────────
 *
 * `semearTudo` criava UMA ordem de serviço. Resultado na 4ª screenshot da
 * vitrine da Play: um cartão no topo e o resto fundo chapado —
 * `node scripts/telas/medir-ocupacao.mjs` mediu **69,7% da altura vazia no
 * rodapé**, contra 1% da tela de orçamento aprovado. A legenda promete "O 'sim'
 * do cliente vira ordem de serviço" e a imagem entregava um app sem nada
 * dentro, a dois deslizes da primeira imagem da listagem.
 *
 * ─── Por que estes seis, nesta ordem ───────────────────────────────────────
 *
 * ORDEM. A lista ordena por `atualizadoEm` desc (`OrdemServicoScreen.tsx:139`),
 * então quem é semeado por ÚLTIMO aparece em cima. A lista abaixo está na ordem
 * de EXIBIÇÃO e `semearOrdens` a percorre de trás para frente. A primeira é a
 * OS nascida do orçamento aprovado — que é literalmente a promessa da legenda.
 *
 * STATUS. Cinco estados diferentes, e não por variedade: os filtros "Todas /
 * Aberta / Agendada / Em execução / Pausada" já estão desenhados no topo da
 * tela e apareciam todos zerados, o que faz o filtro parecer enfeite.
 *
 * CHECKLIST. `feitos` e `total` viram o chip "3/5" no cartão
 * (`OrdemServicoScreen.tsx:205-210`) — é o que mostra serviço ANDANDO, não
 * serviço cadastrado. `feitos` é quantos itens do começo da lista ficam
 * marcados; casa com o status (concluída = tudo marcado, aberta = nada).
 *
 * TÉCNICO NÃO ENTRA, e o motivo é honesto: `tecnicoNome` só aparece no cartão
 * quando há um técnico atribuído, e atribuir exige a lista de membros da
 * organização, que vem do Supabase. Este build roda SEM NUVEM de propósito
 * (ver o cabeçalho de `loja.mjs`), então a única forma de pôr um nome de
 * técnico na imagem seria inventar um estado que o produto não produz sozinho.
 * Fica de fora — a mesma decisão que já tirou a Home e o "Meu negócio".
 */
export const ORDENS_SERVICO = [
  {
    // A ÚNICA que nasce do orçamento aprovado (as outras são "Nova OS > Manual").
    // O título é escrito pelo app: `criarOSDeOrcamento` usa "Orçamento <nº>"
    // (`src/services/ordemServico.ts:93`) — não é copy nossa e não deve ser.
    deOrcamento: true,
    cliente: CLIENTES[0],
    checklist: [
      'Conferir ponto elétrico e disjuntor',
      'Fixar suportes das duas evaporadoras',
      'Passar tubulação e vácuo na linha',
      'Carga de gás e teste de estanqueidade',
      'Ligar, medir temperatura e entregar ao cliente',
    ],
    feitos: 0,
  },
  {
    cliente: CLIENTES[1],
    titulo: 'Manutenção preventiva',
    descricao: 'Limpeza de filtros, medição de pressão e teste de dreno nos três splits da loja.',
    status: 'Em execução',
    checklist: [
      'Lavar filtros das três evaporadoras',
      'Higienizar serpentina e bandeja',
      'Testar escoamento do dreno',
      'Medir pressão de alta e baixa',
      'Registrar leituras no relatório',
    ],
    feitos: 3,
  },
  {
    cliente: CLIENTES[2],
    titulo: 'Limpeza do split da produção',
    descricao: 'Higienização completa da evaporadora e da condensadora da área de produção.',
    status: 'Agendada',
    checklist: [
      'Levar bomba de higienização',
      'Isolar a área com a produção parada',
      'Lavar evaporadora e condensadora',
      'Conferir vazão do dreno',
    ],
    feitos: 0,
  },
  {
    cliente: CLIENTES[0],
    titulo: 'Troca da placa eletrônica',
    descricao: 'Placa da condensadora queimada. Parado aguardando a peça chegar do fornecedor.',
    status: 'Pausada',
    checklist: [
      'Confirmar o código da placa com o fabricante',
      'Pedir a peça ao fornecedor',
      'Instalar e testar o equipamento',
    ],
    feitos: 2,
  },
  {
    cliente: CLIENTES[1],
    titulo: 'Instalação de cortina de ar',
    descricao: 'Cortina de ar sobre a porta de entrada, com acionamento junto da porta.',
    status: 'Aberta',
    checklist: [
      'Medir o vão da porta',
      'Conferir a altura livre do batente',
      'Instalar o suporte e a cortina',
      'Ligar o acionamento automático',
    ],
    feitos: 0,
  },
  {
    cliente: CLIENTES[2],
    titulo: 'Carga de gás R-410A',
    descricao: 'Complemento de carga com teste de estanqueidade no split da frente da loja.',
    status: 'Concluída',
    checklist: [
      'Testar estanqueidade com nitrogênio',
      'Fazer vácuo na linha',
      'Completar a carga de R-410A',
      'Medir superaquecimento',
      'Colher assinatura do cliente',
    ],
    feitos: 5,
  },
];

/**
 * SINAIS DE CONFIANÇA do orçamento-herói (passo 3 — "Detalhes").
 *
 * A tela de orçamento aprovado desenha um painel "Envie uma proposta pronta
 * para aprovação — N/5 sinais de confiança configurados"
 * (`VisualizarOrcamentoScreen.tsx:462-465,535`). Sem estes dois campos ele saía
 * **2/5**, com três fichas âmbar de alerta — e esse painel é o maior bloco da
 * SEGUNDA screenshot da vitrine, a que a Play mostra na busca. O produto estava
 * usando o espaço mais caro da listagem para avisar que a proposta está
 * incompleta.
 *
 * Preencher garantia e condições de pagamento leva o painel a **4/5**: só
 * "Logo da empresa" continua em alerta, e continua de propósito — a logo vem da
 * tela "Meu negócio", que não monta neste build sem nuvem (ver `semear.mjs`).
 * Não vou forjar o quinto sinal; 4/5 é o estado REAL que este build alcança.
 *
 * Os textos não são enfeite: são as condições que um prestador de HVAC escreve
 * mesmo, e a garantia repete o prazo legal do art. 26 do CDC que o próprio app
 * sugere em "Meu negócio" (`MeuNegocioScreen.tsx:63-73`).
 */
export const DETALHES_ORCAMENTO_HEROI = {
  garantia: '90 dias para a mão de obra e 12 meses para as peças instaladas, conforme o art. 26 do CDC.',
  condicoesPagamento: '50% na aprovação e 50% na entrega do serviço. Pix, cartão em até 3x ou dinheiro.',
};

/** Todo nome próprio que TEM permissão de aparecer numa tela publicada. */
export const NOMES_PERMITIDOS = [
  EMPRESA.nome,
  ...CLIENTES.map((c) => c.nome),
  ...CLIENTES_EXTRA.map((c) => c.nome),
];

/** Todo telefone/e-mail que TEM permissão de aparecer numa tela publicada. */
export const CONTATOS_PERMITIDOS = [
  EMPRESA.telefone,
  EMPRESA.email,
  ...CLIENTES.map((c) => c.telefone),
  ...CLIENTES_EXTRA.map((c) => c.telefone),
];
