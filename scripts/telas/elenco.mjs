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

/** Instante fictício em que TODA captura acontece. Congelar o relógio é o que
 *  impede "Boa tarde" virar "Boa noite" e "há 2 dias" andar sozinho entre uma
 *  rodada e a seguinte. Sexta-feira, 18/07/2026, 10h35 (horário de Brasília).
 *  Sexta de manhã é de propósito: é quando a agenda da semana ainda tem coisa. */
export const AGORA = '2026-07-18T13:35:00.000Z';

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
 * `dias` é o deslocamento em relação a AGORA. Duas visitas ficam HOJE (é a
 * visão de "Dia" do celular que precisa ter o que mostrar) e uma fica ontem —
 * senão a agenda semanal do computador aparece com seis colunas vazias e uma
 * cheia, o que vende exatamente o contrário do que se quer vender.
 */
export const AGENDAMENTOS = [
  { cliente: CLIENTES[0].nome, titulo: 'Instalação de 2 splits — sala de espera', dias: 0 },
  { cliente: CLIENTES[2].nome, titulo: 'Limpeza do split da produção', dias: 0 },
  { cliente: CLIENTES[1].nome, titulo: 'Manutenção preventiva — 3 splits da loja', dias: -1 },
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

/** Todo nome próprio que TEM permissão de aparecer numa tela publicada. */
export const NOMES_PERMITIDOS = [
  EMPRESA.nome,
  ...CLIENTES.map((c) => c.nome),
];

/** Todo telefone/e-mail que TEM permissão de aparecer numa tela publicada. */
export const CONTATOS_PERMITIDOS = [
  EMPRESA.telefone,
  EMPRESA.email,
  ...CLIENTES.map((c) => c.telefone),
];
