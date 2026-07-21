/**
 * ROTEIRO — quais telas entram, em que ordem, e o que dizer sobre cada uma.
 *
 * ─── O RECORTE, e por que não são "todas" ──────────────────────────────────
 *
 * O app tem 40 telas mobile, 21 desktop e o painel tem mais 39. "Todas" são
 * ~100 imagens. Cem telas numa landing não é prova, é ruído, e tem três efeitos
 * — todos ruins: ninguém olha nada porque não sabe onde olhar; quem olha acha a
 * tela mais feia do produto e é dela que lembra; e pôr a Lixeira na mesma
 * esteira do orçamento aprovado diz que nem nós sabemos qual é o melhor
 * argumento. Vitrine de joalheria não bota o estoque na janela: bota seis peças,
 * e o resto está lá dentro para quem entrar.
 *
 * As ~90 restantes não estão proibidas — elas cabem numa página /telas/ linkada
 * do rodapé, que custa quase nada porque o pipeline é o mesmo comando. O que
 * não pode é elas dividirem a atenção da página que converte.
 *
 * Cada tela daqui responde a uma objeção concreta do prestador. Se uma tela não
 * responde a nenhuma, ela não entra.
 *
 * ─── Regra de âncora ───────────────────────────────────────────────────────
 * Toda tela espera um TEXTO que só existe quando ela terminou de montar.
 * `waitForTimeout` está proibido aqui: é ele que faz o pipeline "funcionar na
 * minha máquina" e produzir imagens diferentes a cada rodada.
 */

/** Telas de CELULAR — 393×852, o aparelho do prestador. */
export const TELAS_CELULAR = [
  {
    id: 'orcamento-aprovado',
    rota: (ctx) => ctx.orcamentoHeroi,
    esperar: 'Aprovado',
    titulo: 'Orçamento aprovado',
    legenda: 'O momento em que o serviço vira dinheiro: proposta de R$ 2.480 aprovada, com link, PDF e WhatsApp a um toque.',
    alt: 'Tela do OLLI mostrando o orçamento nº 00126 da Clínica Vida & Saúde com status Aprovado e os botões de enviar por WhatsApp, gerar link e gerar PDF.',
    destaque: true,
  },
  {
    id: 'novo-orcamento-itens',
    rota: 'ESPECIAL:novo-orcamento-itens',
    esperar: 'Adicionar manual',
    titulo: 'Montar o orçamento',
    legenda: 'Três serviços, R$ 2.480 somados na hora. Sem planilha, sem calculadora, sem voltar em casa para digitar.',
    alt: 'Passo de itens do orçamento no OLLI, com três serviços de ar-condicionado listados e o valor total de R$ 2.480,00.',
  },
  {
    id: 'lista-orcamentos',
    rota: '/orcamentos',
    // Âncora de CONTEÚDO, não de moldura: o título "Orçamentos" aparece antes de
    // a lista carregar, e a foto saía com a tela ainda vazia.
    esperar: 'Clínica Vida & Saúde',
    titulo: 'Todos os orçamentos',
    legenda: 'O que está em aberto, o que foi aprovado e o que virou dinheiro — numa tela só.',
    // Derivado da imagem, não de memória: são quatro cartões (o 4º entrou para
    // fechar o rodapé vazio da captura — ver `ORCAMENTOS_EXTRA` em elenco.mjs) e
    // os quatro estados são os que a tela imprime.
    alt: 'Lista de orçamentos do OLLI com quatro propostas em status diferentes: em negociação, rascunho, enviado e aprovado.',
  },
  {
    id: 'agenda',
    rota: '/agenda',
    esperar: 'Instalação de 2 splits',
    titulo: 'A semana no lugar',
    // Esta legenda prometia "endereço" quando o cartão não mostrava endereço
    // nenhum — copy escrita de memória, não derivada da tela. Ela virou verdade
    // pelo lado certo: o elenco passou a semear `endereco`, e o cartão agora
    // desenha o marcador de mapa e o botão de rota. NÃO desfaça um sem o outro.
    legenda: 'As visitas do dia com cliente, horário e endereço. O que ia ficar no papel do bolso.',
    // Derivado da imagem: quatro visitas, cada uma com hora própria, cliente,
    // etiqueta do tipo e endereço.
    alt: 'Tela de agenda do OLLI mostrando quatro visitas do dia, cada uma com horário, nome do cliente, tipo do serviço e endereço, e um botão de traçar rota.',
  },
  {
    id: 'clientes',
    rota: '/clientes',
    esperar: 'Clínica Vida & Saúde',
    titulo: 'A carteira de clientes',
    legenda: 'Quem já é cliente, o que já foi feito e como falar com ele. Sem depender da memória.',
    // Derivado da imagem: seis clientes, em ordem alfabética, com telefone e
    // cidade. Eram quatro — e dois eram o MESMO cliente duplicado pela
    // semeadura (ver `CLIENTES_EXTRA` em elenco.mjs).
    alt: 'Lista de clientes cadastrados no OLLI com seis clientes em ordem alfabética, cada um com telefone e cidade.',
  },
  {
    id: 'ordem-servico',
    rota: '/ordens',
    esperar: 'Clínica Vida & Saúde',
    titulo: 'Do orçamento à ordem de serviço',
    legenda: 'O sim do cliente vira ordem de serviço com um toque — mesmo cliente, mesmo valor, sem redigitar nada.',
    // Derivado da imagem: a tela deixou de ter UMA ordem (67% de fundo vazio na
    // vitrine da Play) e passou a ter seis, em cinco estados. A OS do topo é a
    // que nasceu do orçamento aprovado — que é o que a legenda promete.
    alt: 'Lista de ordens de serviço do OLLI com seis ordens em estados diferentes — aberta, agendada, em execução, pausada e concluída —, cada uma com o cliente e o andamento do checklist. No topo, a ordem gerada a partir do orçamento 00126 da Clínica Vida & Saúde.',
  },
  {
    id: 'diagnostico-ia',
    rota: '/diagnostico-ia',
    esperar: 'Pedir diagnóstico',
    // A tela vazia mostra a ferramenta; a tela PREENCHIDA mostra o trabalho. É
    // a diferença entre "temos um campo de sintoma" e "olha o meu caso aqui".
    preparar: async (page, { preencher }) => {
      await preencher(page, 'Ex: Fujitsu', 'Springer Midea');
      await preencher(page, 'Ex: ASBG12', '42MACA12S5');
      await preencher(page, 'Ex: "EE:04" ou "3 piscadas"', 'E5');
      await preencher(page, 'O que a máquina está fazendo?', 'Liga e o ventilador roda, mas não gela. A condensadora desliga sozinha depois de 2 minutos.');
    },
    titulo: 'Diagnóstico assistido',
    legenda: 'Código no display e sintoma na mão: a OLLI ajuda a achar o defeito e a peça antes de você abrir o equipamento.',
    alt: 'Tela de diagnóstico guiado do OLLI preenchida com marca Springer Midea, modelo 42MACA12S5, código E5 e a descrição do sintoma do equipamento.',
  },
];

/**
 * Telas de COMPUTADOR — 1440×900. "Também tenho computador" é objeção real, e
 * o app responde a ela: acima de 1024 px ele troca as abas por uma barra
 * lateral e usa telas próprias, não o celular esticado.
 *
 * Duas telas que a gente QUERIA aqui ficaram de fora, e por motivos diferentes:
 *
 *  • O PAINEL DE INÍCIO (KPIs + gráfico) não monta neste build. Ele espera
 *    saber o PAPEL do usuário antes de desenhar qualquer coisa, e o papel vem
 *    de uma consulta ao Supabase; sem nuvem, esse "não sei" nunca termina e a
 *    tela fica em esqueleto para sempre. É defeito do app, não da captura — e
 *    fotografar um esqueleto seria pior do que não ter a tela.
 *
 *  • A LISTA EM TABELA sai desfigurada em tela larga: as colunas somam ~810 px
 *    dentro de um cartão de ~1160 px, então o cartão fica com um bloco branco
 *    vazio à direita, cortando a coluna de ações. Vale como screenshot de bug,
 *    não como argumento de venda.
 *
 * Sobra a agenda — que, por sorte, é a que melhor vende a tela grande: a semana
 * inteira de uma vez é exatamente o que o celular não consegue mostrar.
 */
export const TELAS_DESKTOP = [
  {
    id: 'agenda-computador',
    rota: '/agenda',
    esperar: 'Instalação de 2 sp',
    titulo: 'A semana inteira na tela grande',
    legenda: 'No computador o OLLI abre a semana toda: dá para ver os buracos da agenda antes de prometer prazo ao cliente.',
    alt: 'Agenda semanal do OLLI na versão para computador, com barra lateral de navegação e as visitas distribuídas pelos dias da semana.',
  },
];
