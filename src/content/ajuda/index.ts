/**
 * Conteúdo da CENTRAL DE AJUDA (Frente 3) — dados tipados, sem nenhuma
 * dependência de React/RN, para a AjudaScreen renderizar e a busca indexar.
 *
 * Cada artigo é real (nada de lorem ipsum): descreve o comportamento de VERDADE
 * do app hoje. Ao mexer numa feature descrita aqui, atualize o artigo junto —
 * senão a Central de Ajuda começa a mentir pro usuário.
 */

import {
  IA_USOS_GRATIS_MES,
  TRIAL_PRO_DIAS,
} from '../../services/entitlements.ts';
import { FRASE_GRATIS, FRASE_GRATIS_CURTA, planoBase } from '../../services/planosBase.ts';
import { PRECO_EMPRESA, PRECO_PRO, reais } from '../../services/precosPlanos.ts';
import {
  MODELOS_ORCAMENTO,
  MODELOS_RECIBO,
  TEXTO_LAYOUT_SO_VISUAL,
  TEXTO_PREVIA_EXEMPLO,
  TEXTO_RECIBO_SO_VISUAL,
} from '../modelosLayout.ts';

/** Os recursos que um plano pago acrescenta, lidos da tabela única (com "em breve"). */
function recursosDoPlano(id: 'pro' | 'empresa'): string {
  return planoBase(id)
    .bullets.filter((b) => b.recursos.length > 0)
    .map((b) => (b.emBreve ? `${b.texto} (em breve)` : b.texto))
    .join('; ');
}

/** Tipo de bloco do corpo de um artigo. */
export type AjudaBlocoTipo = 'paragrafo' | 'passos' | 'aviso';

/**
 * Um bloco de conteúdo. `paragrafo`/`aviso` usam uma única string; `passos`
 * usa um array (cada item é 1 passo — a tela numera ao renderizar).
 */
export interface AjudaBloco {
  tipo: AjudaBlocoTipo;
  conteudo: string | string[];
  /**
   * Bloco que ensina a PAGAR ou cita o meio de pagamento da web (Stripe, cartão,
   * 12x, portal de pagamento, Pix, AbacatePay, preço de tabela da web): só aparece
   * onde o OLLI pode vender — a web. Este conteúdo também roda no app das lojas
   * (iOS e Android da Google Play), que não pode mandar pagar por fora (política de
   * Pagamentos da Play, "anti-steering") — mesma regra de `lembreteAssinaturaLoja.ts`
   * e da AssinaturaScreen. Lá a tela de Planos NÃO mostra "Pagar com Pix", então o
   * texto também seria falso. Filtre com `corpoVisivel()`.
   */
  soNaWeb?: boolean;
  /**
   * Bloco que só aparece no app das LOJAS (o inverso de `soNaWeb`): o que vale lá no
   * lugar do texto da web — assinatura feita e gerenciada pela própria loja (Google
   * Play no Android), sem preço de tabela da web e sem meio de pagamento externo.
   */
  soNaLoja?: boolean;
  /**
   * Bloco que cita a GOOGLE PLAY: só no app Android. O iPhone também é "loja", mas
   * lá a assinatura não está disponível e citar outra loja é motivo de recusa na
   * App Store (diretriz 2.3.10). Na web também some.
   */
  soNoAndroid?: boolean;
}

export interface AjudaCategoria {
  id: string;
  titulo: string;
  /** Nome de ícone do MaterialCommunityIcons (string pura — sem import de RN aqui). */
  icone: string;
}

export interface AjudaArtigo {
  id: string;
  categoriaId: string;
  titulo: string;
  /** Frase curta exibida na lista, antes de abrir o artigo. */
  resumo: string;
  corpo: AjudaBloco[];
  /** Sinônimos/termos extras só para a busca achar (não aparecem na tela). */
  tags?: string[];
}

// ─── Categorias ──────────────────────────────────────────────────────────────

export const CATEGORIAS_AJUDA: AjudaCategoria[] = [
  { id: 'comecar', titulo: 'Primeiros passos', icone: 'rocket-launch-outline' },
  { id: 'orcamentos', titulo: 'Orçamentos e clientes', icone: 'file-document-edit-outline' },
  { id: 'rotina', titulo: 'Quadro, agenda e carteira', icone: 'calendar-check-outline' },
  { id: 'campo', titulo: 'Campo: OS e equipamentos', icone: 'toolbox-outline' },
  { id: 'governo', titulo: 'Documentos e fontes oficiais', icone: 'bank-outline' },
  { id: 'ia', titulo: 'IA e ferramentas', icone: 'robot-outline' },
  { id: 'conta', titulo: 'Equipe, planos e conta', icone: 'account-group-outline' },
  { id: 'dados', titulo: 'Backup, offline e privacidade', icone: 'shield-lock-outline' },
  { id: 'suporte', titulo: 'Suporte', icone: 'lifebuoy' },
];

// ─── Artigos ─────────────────────────────────────────────────────────────────

export const ARTIGOS_AJUDA: AjudaArtigo[] = [
  // ── Primeiros passos ─────────────────────────────────────────────────────
  {
    id: 'o-que-e-a-olli',
    categoriaId: 'comecar',
    titulo: 'O que é a OLLI e o que ela não faz',
    resumo: 'Quem responde pela empresa, o que o produto entrega hoje e os limites para ninguém prometer o que não existe.',
    tags: ['empresa', 'cnpj', 'sobre', 'olli', 'nota fiscal', 'whatsapp'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A OLLI é o sistema da OLLI INTELIGENCIA DIGITAL SISTEMAS LTDA (CNPJ 65.361.266/0001-05) para o prestador organizar o próprio serviço: orçamento, link para o cliente aprovar, ordem de serviço, agenda, recibo e as ferramentas do ofício. Quem recebe o orçamento não precisa criar conta para ler e responder.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Você monta o orçamento com cliente, itens, condições e, se quiser, fotos.',
          'O cliente abre o link no celular, lê o documento e aprova ou recusa. Se você pediu assinatura, ele assina na tela.',
          'O serviço aprovado pode virar ordem de serviço, visita na agenda e, quando o dinheiro entra, recibo numerado.',
          'Dúvida que esta Central não resolve: WhatsApp (11) 94172-7487 ou contato@olliorcamentos.online, em dias úteis.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'A OLLI não emite nota fiscal, não lê conversa de WhatsApp e não fica com o pagamento do seu cliente. A nota, quando você emite, é no portal oficial. O dinheiro do serviço cai na sua chave. A assinatura desenhada no orçamento é um aceite entre as partes, não um certificado ICP-Brasil. A OLLI não pede senha do gov.br, código de banco nem token de pagamento no texto da ajuda ou da IA.',
      },
      {
        tipo: 'passos',
        soNaWeb: true,
        conteudo: [
          `Plano Grátis: ${reais(0)}. ${FRASE_GRATIS_CURTA}.`,
          `Plano Pro: ${reais(PRECO_PRO.mensalCentavos)} por mês.`,
          `Plano Empresa: ${reais(PRECO_EMPRESA.mensalCentavos)} por mês.`,
          'O que cada plano inclui, o anual e como cancelar está no artigo Planos e assinatura. O número do cartão não fica guardado na OLLI.',
        ],
      },
    ],
  },
  {
    id: 'busca-do-painel',
    categoriaId: 'comecar',
    titulo: 'Achar uma tela ou um ajuste',
    resumo: 'No painel, Ctrl+K abre a busca. No aplicativo, a busca da Conta acha o ajuste pelo nome.',
    tags: ['busca', 'atalho', 'ctrl+k', 'cmd+k', 'comando'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'No painel do navegador, Ctrl+K abre a busca (no Mac, Cmd+K). Você encontra telas e ajustes sem percorrer o menu. Esc fecha. Enter abre o item escolhido. No aplicativo, a busca no topo da Conta encontra o ajuste pelo nome.',
      },
      {
        tipo: 'aviso',
        conteudo: 'A busca só leva até a tela. Ela não muda orçamento, cliente nem cobrança sozinha.',
      },
    ],
  },
  {
    id: 'primeiros-passos',
    categoriaId: 'comecar',
    titulo: 'Primeiros passos no OLLI',
    resumo: 'O que preencher primeiro pra sair usando de verdade, sem travar em nenhuma etapa.',
    tags: ['comecar', 'inicio', 'cadastro', 'tutorial'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O OLLI acompanha o ciclo inteiro do seu serviço: você monta o orçamento, o cliente aprova pelo próprio celular (sem instalar nada), você organiza a execução em campo e fecha com o recibo. No aplicativo Android, o essencial funciona offline e sincroniza sozinho quando a internet volta; pelo navegador, o OLLI precisa de conexão.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Complete o cadastro do seu negócio em Conta → Meu Negócio: nome, logo, WhatsApp e chave PIX aparecem em todo PDF que você gerar.',
          'Cadastre 1 ou 2 serviços/produtos em Serviços e Produtos — assim você monta orçamentos escolhendo da lista, sem digitar tudo de novo toda vez.',
          'Cadastre seu primeiro cliente (ou cadastre na hora, direto ao criar o orçamento).',
          'Toque no botão "+ Orçamento", monte a proposta e envie o link — o cliente aprova ou recusa direto no celular dele.',
          'Acompanhe tudo pela Home e pela aba Hoje: o que venceu, o que foi visto e o que está aguardando resposta.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Se você chegou aqui pela tela de boas-vindas (onboarding) e pulou alguma etapa, não tem problema: tudo o que faltar pode ser preenchido depois em Conta → Meu Negócio.',
      },
    ],
  },

  // ── Orçamentos e clientes ────────────────────────────────────────────────
  {
    id: 'criar-enviar-orcamento',
    categoriaId: 'orcamentos',
    titulo: 'Criar e enviar um orçamento',
    resumo: 'Do zero ao link pronto pra mandar pro cliente, em poucos toques.',
    tags: ['proposta', 'orcar', 'novo orcamento', 'pdf'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Um orçamento no OLLI junta cliente + itens (serviços/produtos) + condições (pagamento, garantia, validade) e gera um PDF profissional e um link que o cliente abre no celular dele.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Toque no botão central "+ Orçar" (ou em "Novo orçamento" na lista de Orçamentos).',
          'Escolha um cliente já cadastrado ou cadastre um novo sem sair do fluxo.',
          'Adicione itens do seu catálogo de Serviços/Produtos, ou digite um item novo na hora — dá pra ditar por voz também.',
          'Ajuste desconto, condições de pagamento, garantia e validade da proposta.',
          'Revise a prévia do PDF e toque em Enviar: o OLLI gera o link do cliente e abre o WhatsApp com a mensagem pronta.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Um orçamento pode nascer de um Diagnóstico de código de erro (a IA já sugere o item de reparo) — economiza digitação em visitas técnicas.',
      },
    ],
  },
  {
    id: 'modelos-layout-documento',
    categoriaId: 'orcamentos',
    titulo: 'Modelos de documento: o que cada layout muda',
    resumo: 'Cada modelo muda só o visual do PDF. Cliente, itens e preço ficam iguais. A prévia não envia nada.',
    tags: ['layout', 'modelo', 'pdf', 'previa', 'prévia', 'recibo', 'faixa lateral', 'editorial', 'configuracao de layout', 'configurações de layout'],
    corpo: [
      { tipo: 'paragrafo', conteudo: TEXTO_LAYOUT_SO_VISUAL },
      { tipo: 'paragrafo', conteudo: TEXTO_PREVIA_EXEMPLO },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Conta → Modelos de documento.',
          'Leia o resumo e o "quando usar" de cada modelo. A miniatura ao lado é um esquema, não o PDF.',
          'Toque em "Ver como fica" para abrir a prévia com dados de exemplo. Nada é enviado ao cliente.',
          'Toque no modelo para torná-lo o padrão dos orçamentos novos. O que já foi enviado não muda.',
        ],
      },
      {
        tipo: 'paragrafo',
        conteudo: `Orçamento — ${MODELOS_ORCAMENTO.map((m) => `${m.nome}: ${m.resumo} ${m.quandoUsar}`).join(' ')}`,
      },
      {
        tipo: 'paragrafo',
        conteudo: `${TEXTO_RECIBO_SO_VISUAL} ${MODELOS_RECIBO.map((m) => `${m.nome}: ${m.resumo} ${m.quandoUsar}`).join(' ')}`,
      },
      {
        tipo: 'aviso',
        conteudo:
          'Se o seu ofício estiver cadastrado, um modelo de orçamento pode aparecer como sugestão. É uma dica de visual. Você pode escolher outro. O preço não muda.',
      },
      {
        tipo: 'paragrafo',
        conteudo:
          'No painel aberto no navegador, a engrenagem Configurações tem a seção Layout. Menu completo deixa a lista de telas à esquerda, com nome. Menu de ícones deixa essa coluna estreita. Menu no topo tira a coluna da esquerda e põe as telas numa faixa em cima. Esticar, ligado, usa a largura livre; desligado, em telas maiores que 1280px o conteúdo fica centralizado e sobra espaço dos dois lados. Abaixo de 1280px os dois ficam iguais. A miniatura no botão é a prévia do menu, e a página muda na hora, só neste navegador. Orçamento, cliente, preço e PDF não mudam.',
      },
    ],
  },
  {
    id: 'link-cliente',
    categoriaId: 'orcamentos',
    titulo: 'O link do cliente: aprovar e recusar',
    resumo: 'Como o cliente vê, aprova ou recusa o orçamento pelo próprio celular — sem baixar app nenhum.',
    tags: ['aprovacao', 'recusa', 'link publico', 'assinatura', 'cliente'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Ao enviar, o OLLI gera um link público (sem login) com o PDF do orçamento. O cliente abre pelo WhatsApp ou e-mail, lê tudo e toca em "Aprovar" ou "Recusar" na própria página — se você pediu assinatura, ele assina com o dedo na tela.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Assim que o cliente abre o link, o status do orçamento vira "Visualizado" automaticamente — você fica sabendo sem precisar perguntar.',
          'Se ele aprovar, o status vira "Aprovado" (e, se pediu assinatura, você vê a assinatura dele no orçamento).',
          'Se ele recusar, o status vira "Recusado" — dá pra conversar e reabrir com um ajuste depois.',
          'Você acompanha essa trilha inteira (enviado → visualizado → aprovado/recusado) na tela do próprio orçamento.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Depois que o cliente já viu o link, editar o orçamento NUNCA sobrescreve silenciosamente o que ele viu — o OLLI guarda uma versão anterior. Veja o artigo "Versões do orçamento".',
      },
    ],
  },
  {
    id: 'versoes-orcamento',
    categoriaId: 'orcamentos',
    titulo: 'Versões do orçamento',
    resumo: 'Por que o OLLI guarda um histórico quando você edita uma proposta que já foi enviada.',
    tags: ['historico', 'editar orcamento', 'status'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O orçamento passa por vários status ao longo do funil: Rascunho, Enviado, Visualizado, Em negociação, Aguardando assinatura, Aprovado, Recusado, Expirado, Cancelado e Convertido (quando já virou serviço fechado/recibo).',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Enquanto o orçamento está em Rascunho, você edita livremente — nada foi mostrado ao cliente ainda.',
          'Depois que ele foi Enviado (ou Visualizado/Em negociação/Aguardando assinatura), qualquer edição sua congela o estado ANTERIOR como uma versão antes de aplicar a mudança.',
          'Você pode conferir as versões anteriores dentro do próprio orçamento, sem perder o que o cliente já tinha visto.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Isso é o que garante que você nunca "sumiu" com uma condição que o cliente já aprovou — cada versão fica registrada.',
      },
    ],
  },
  {
    id: 'recibos-pagamentos',
    categoriaId: 'orcamentos',
    titulo: 'Recibos e pagamentos',
    resumo: 'Como emitir o recibo de um orçamento aprovado e registrar a forma de pagamento.',
    tags: ['recibo', 'pagamento', 'pix', 'cobranca'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Depois que o serviço foi pago, você emite um recibo numerado automaticamente (a numeração é sequencial e nunca se repete), com a forma de pagamento usada — crédito, débito, dinheiro ou PIX (com sua chave já preenchida a partir de Meu Negócio). Se houver sinal ou parcelas, registre cada recebimento: o OLLI mostra Pagamento parcial até o saldo zerar.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra o orçamento aprovado e toque em "Emitir recibo" (ou vá em Recibos, na lista).',
          'Confira o valor e marque a(s) forma(s) de pagamento usadas.',
          'Toque em Emitir: o OLLI gera o PDF do recibo com o número sequencial e permite compartilhar na hora.',
          'Precisou corrigir? Ao invés de duplicar, use "Registrar pagamento" no mesmo orçamento — ele reaproveita o recibo já criado.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'O número do recibo só é gerado (e avança) no momento em que você realmente emite — abrir a tela não consome número.',
      },
    ],
  },
  {
    id: 'central-precificacao',
    categoriaId: 'orcamentos',
    titulo: 'Como formar o preço de um serviço ou produto',
    resumo: 'Use custos, taxas, risco e margem para encontrar o preço mínimo e o preço sugerido.',
    tags: ['precificacao', 'preco', 'margem', 'markup', 'custo', 'mao de obra', 'peca', 'produto'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A Central de Precificação funciona para qualquer ofício. Serviço considera materiais, horas, valor da hora, deslocamento e despesas. Produto ou peça considera compra, frete, embalagem e custos por unidade. Nos dois casos, impostos, taxa de pagamento, reserva de risco e margem entram de forma visível.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Comercial → Precificação e escolha Serviço ou Produto, peça ou material.',
          'Preencha os custos reais. Campo em zero fica fora da conta.',
          'Informe impostos, taxa do meio de pagamento, reserva para risco/garantia e a margem desejada.',
          'Confira o custo total, o preço mínimo sem lucro, o preço sugerido, o lucro estimado e o espaço máximo de desconto sem prejuízo.',
          'Dê um nome e salve no catálogo. O preço continua editável quando você usar o item em um orçamento.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'O cálculo é uma referência baseada no que você informou, não uma tabela obrigatória de mercado. Compare com região, prazo, qualidade, capacidade e concorrência. Custo e margem são privados e não aparecem para o cliente.',
      },
    ],
  },

  // ── Quadro, agenda e carteira ────────────────────────────────────────────
  {
    id: 'quadro-do-dia',
    categoriaId: 'rotina',
    titulo: 'Quadro: acompanhar o funil sem depender só de arrastar',
    resumo: 'As colunas do funil e o menu Mover para, que grava o mesmo status do arraste.',
    tags: ['quadro', 'kanban', 'funil', 'finalizados', 'mover'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O Quadro mostra os orçamentos em colunas: Rascunho, Enviado, Em negociação, Aprovado, Finalizados e Perdido. A coluna Outros só aparece se existir um orçamento que não cabe nessas. Finalizados não é um status solto: é o orçamento cuja ordem de serviço foi concluída.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Arrastar o card para outra coluna grava o novo status.',
          'Se arrastar atrapalhar, abra o menu do card e use Mover para. A gravação é a mesma.',
          'Soltar em Finalizados, ou escolher finalizar no menu, pede confirmação antes de concluir o serviço.',
          'Enquanto você arrasta no painel, as setas do teclado também mudam a coluna.',
          'Clicar no card abre o orçamento quando o documento completo existe.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Card sem o documento completo continua visível, mas não abre para edição. Assim a tela não grava um orçamento vazio por cima do que já existia.',
      },
    ],
  },
  {
    id: 'clientes-carteira',
    categoriaId: 'rotina',
    titulo: 'Cadastrar e achar um cliente',
    resumo: 'Só o nome é obrigatório. Documento e endereço podem ficar para depois.',
    tags: ['cliente', 'cadastro', 'telefone', 'cpf', 'cnpj', 'cep', 'carteira'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A carteira guarda a história de cada cliente: orçamentos, visitas e equipamentos. Na lista, a busca é por nome ou telefone. O selo de meses sem serviço mostra quem faz tempo que não chama — pode ser hora de lembrar.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Toque em novo cliente. O nome é o único campo obrigatório.',
          'Telefone, CPF, CNPJ e endereço podem ficar em branco. Se você preencher o documento, o OLLI confere o dígito. Se preencher o CEP, tenta completar o endereço.',
          'Se o telefone ou o documento já existir em outro cadastro, o OLLI avisa quem é e deixa você decidir. Dois clientes podem dividir o mesmo telefone.',
          'Se a consulta de duplicidade falhar, a tela diz que não conseguiu verificar. Ela não finge que está tudo limpo.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'O telefone e o documento saem no orçamento e no PDF. O que você salvar aqui é o que o cliente vê no documento.',
      },
    ],
  },
  {
    id: 'catalogo-servicos-produtos',
    categoriaId: 'rotina',
    titulo: 'Serviços e produtos do catálogo',
    resumo: 'Cadastre uma vez e reutilize no orçamento, sem digitar o item de novo.',
    tags: ['servico', 'produto', 'catalogo', 'item', 'preco'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Serviços e produtos ficam em listas separadas. No orçamento você escolhe da lista ou digita um item na hora. O preço que veio do catálogo continua editável naquela proposta.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Serviços ou Produtos e cadastre nome e preço do que você mais faz.',
          'Se quiser chegar no preço pela conta de custo e margem, use a Central de Precificação e salve o item no catálogo.',
          'Na proposta, ajuste o valor daquele cliente sem alterar o cadastro, se for o caso.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Custo e margem não aparecem para o cliente. O PDF mostra o preço que você colocou no item.',
      },
    ],
  },
  {
    id: 'agenda-visitas',
    categoriaId: 'rotina',
    titulo: 'Agenda: marcar, remarcar e levar para o calendário',
    resumo: 'A visita muda de horário pelo menu Reagendar. O arraste é só um atalho.',
    tags: ['agenda', 'visita', 'reagendar', 'google agenda', 'ics', 'calendario'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A agenda guarda as visitas do dia. No celular, o uso é o roteiro: o que fazer agora e o que vem depois. No painel largo, também dá para ver a grade. Arrastar um compromisso muda o horário, mas não é o único caminho: todo evento tem Reagendar, e os dois usam a mesma gravação.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Crie a visita com cliente, dia e horário. Dá para marcar sem cadastrar o cliente: o nome fica só naquele compromisso.',
          'Para mudar o horário, use Reagendar. No painel, arrastar é um atalho para a mesma ação.',
          'Se a gravação falhar, o compromisso volta para o horário anterior e a tela avisa. Ela não deixa você achar que remarcou.',
          'Adicionar no Google Agenda abre o evento na sua agenda. Baixar o arquivo .ics faz o mesmo em outro calendário. Isso não é uma sincronização de mão dupla: o que você mudar lá não volta sozinho para o OLLI.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'No aplicativo, visita externa com chuva prevista pode ganhar um aviso para você remarcar. Serviço que se repete pode virar uma série, por exemplo todo mês. Uma consulta que falhou não vira calendário vazio: a tela mostra o erro e Tentar de novo.',
      },
    ],
  },
  {
    id: 'contratos-recorrentes',
    categoriaId: 'rotina',
    titulo: 'Contratos recorrentes',
    resumo: 'A receita que se repete todo mês, com as próximas visitas e a cobrança no seu WhatsApp.',
    tags: ['contrato', 'recorrente', 'mensalidade', 'pmoc', 'cobrar'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Um contrato recorrente registra o serviço que volta: valor, periodicidade, técnico e as próximas visitas. O topo da tela soma o que está em vigor no mês. O papel Técnico não vê esta tela. Gerenciar contrato recorrente é um recurso do plano Empresa. Se o recurso estiver desligado no servidor, a tela diz que está desligado — ela não inventa a lista.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Crie o contrato com cliente, valor, periodicidade e situação (rascunho, vigente, suspenso, encerrado ou cancelado).',
          'Gere as visitas quando quiser colocá-las na agenda.',
          'Cobrar abre o WhatsApp com a mensagem pronta, usando a chave de pagamento do seu próprio negócio. O OLLI não recebe esse valor e não fica no meio da transação.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Excluir o contrato pede confirmação. O histórico de orçamento e de recibo não mora nesta tela.',
      },
    ],
  },
  {
    id: 'documentos-biblioteca',
    categoriaId: 'rotina',
    titulo: 'Central de documentos: ver, editar e imprimir',
    resumo: 'A biblioteca do que já foi gerado e o editor de blocos para revisar o texto antes de imprimir.',
    tags: ['documento', 'contrato', 'clausula', 'pdf', 'imprimir', 'biblioteca'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A Central de documentos lista o que ficou registrado: orçamento, contrato, garantia, conclusão, recibo, ordem de serviço, PMOC, laudo, checklist e certificado. O estado é o que está salvo — rascunho, pronto, enviado, assinado ou arquivado. A tela não inventa que um arquivo foi emitido.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Filtre por tipo ou por estado, ou busque pelo texto.',
          'Para um documento novo, comece por um modelo do seu ofício, revise os blocos e só então gere o arquivo.',
          'No editor, cada bloco é um título ou um parágrafo. Você altera o texto, adiciona bloco, salva e imprime.',
          'Modelo de ofício com exigência técnica traz aviso de revisão. Leia com o responsável antes de entregar ao cliente.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Editar o texto aqui não substitui o portal da nota fiscal nem uma assinatura certificada. O que o cliente já recebeu em um orçamento enviado continua versionado naquele orçamento.',
      },
    ],
  },

  // ── Campo: OS e equipamentos ─────────────────────────────────────────────
  {
    id: 'ordens-servico-app-tecnico',
    categoriaId: 'campo',
    titulo: 'Ordens de serviço e o app do técnico',
    resumo: 'Como transformar um orçamento aprovado em execução de campo, com checklist e fotos.',
    tags: ['os', 'tecnico', 'execucao', 'checklist'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Uma Ordem de Serviço (OS) organiza a EXECUÇÃO do que foi vendido: quem vai, quando, o checklist do que precisa ser feito e as fotos do serviço. Ela pode nascer de um orçamento aprovado ou ser criada manualmente.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'No orçamento aprovado, toque em "Criar ordem de serviço" (ou crie uma manual em Ordens de serviço).',
          'Atribua um técnico da equipe — ele passa a ver essa OS no aparelho dele.',
          'A OS caminha pelos status Aberta → Agendada → Em execução → Concluída (ou Pausada/Cancelada quando necessário).',
          'O técnico marca o checklist item a item e anexa fotos direto pelo celular — no aplicativo Android, mesmo sem internet no local.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Papel Técnico só enxerga as próprias OS. Dono, Administrador e Gestor veem as de toda a equipe.',
      },
    ],
  },
  {
    id: 'equipamentos-qr',
    categoriaId: 'campo',
    titulo: 'Equipamentos e etiqueta QR',
    resumo: 'Cadastre o inventário do cliente (ex.: os splits instalados) e gere a etiqueta QR pra colar na peça.',
    tags: ['pmoc', 'ar condicionado', 'inventario', 'qrcode', 'etiqueta'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Cada equipamento fica vinculado a um cliente e guarda fabricante, modelo, número de série, capacidade (BTU), tensão, refrigerante e local de instalação — a base do controle de manutenção (PMOC) desse cliente.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Cadastre o equipamento a partir do cadastro do cliente (ou pela tela de Equipamentos).',
          'Sincronize com a nuvem pelo menos uma vez (é o banco que gera o código do QR, por segurança) — depois disso a etiqueta fica disponível.',
          'Toque em "Ver etiqueta / QR". A etiqueta ideal é 99,1 × 38,1 mm: em casa, folha A4 Pimaco A4363 ou Colacril CA4363 (14 adesivos), impressão em 100% sem ajustar à página; na gráfica, vinil branco fosco com laminação fosca, no mesmo tamanho.',
          'Ao escanear, qualquer pessoa (você, o cliente, um outro técnico) abre a página pública daquele equipamento — sem precisar login.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Se um QR for extraviado ou comprometido, dá pra revogá-lo (a página pública passa a negar o scan). Hoje a revogação é definitiva — reemissão de um novo código é uma etapa futura.',
      },
    ],
  },

  // ── Documentos e fontes oficiais ────────────────────────────────────────
  {
    id: 'nfse-padrao-nacional',
    categoriaId: 'governo',
    titulo: 'Emitir NFS-e pelo portal oficial',
    resumo: 'Passo a passo seguro para abrir o emissor nacional sem o OLLI fingir que emitiu a nota.',
    tags: ['nfs-e', 'nota fiscal', 'nota fiscal de serviço', 'gov.br', 'imposto', 'governo'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A NFS-e é emitida no ambiente oficial do governo. O OLLI pode organizar os dados do cliente e do serviço, mas não deve pedir sua senha gov.br nem declarar que uma nota foi emitida sem protocolo do portal.',
      },
      {
        // Datas conferidas na fonte oficial em 30/09/2026 (ver docs/ENXAME/ALERTA_NFSE_DATA.md).
        tipo: 'paragrafo',
        conteudo:
          'Quem precisa usar o Emissor Nacional: o MEI desde 01/09/2023 (Resolução CGSN nº 169/2022) e as ME e EPP do Simples Nacional a partir de 01/11/2026 (Resolução CGSN nº 191/2026). Para empresas fora do Simples, vale a regra do seu município. Confirme no portal oficial, porque a regra fiscal muda.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'No OLLI, abra o recibo do pagamento e toque em "Preparar nota fiscal": cliente, descrição, código de serviço sugerido pelo seu ofício, valor e município já vêm prontos para copiar, com um checklist do que conferir.',
          'Abra o Emissor Nacional: https://www.nfse.gov.br/EmissorNacional (orientações em https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica).',
          'Entre com sua conta gov.br ou certificado, conforme o município e o perfil do prestador.',
          'Confira cliente, serviço, retenções e valores antes de transmitir.',
          'Depois de emitir, volte ao OLLI e anote o número da NFS-e na nota preparada.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'O emissor, as regras e a disponibilidade dependem do município. Para integração por API, o governo exige credenciamento e os layouts técnicos vigentes; o OLLI não raspa o portal nem guarda credenciais.',
      },
    ],
  },
  {
    id: 'pmoc-fontes-atualizadas',
    categoriaId: 'governo',
    titulo: 'PMOC: documento técnico e fontes atualizadas',
    resumo: 'O que o OLLI organiza e o que precisa ser validado pelo responsável técnico.',
    tags: ['pmoc', 'anvisa', 'ar condicionado', 'responsavel tecnico', 'rdc'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A Lei 13.589/2018 exige PMOC para edifícios de uso público e coletivo climatizados artificialmente. O OLLI organiza equipamentos, planos, ordens, checklists e evidências; isso não substitui a responsabilidade técnica nem transforma um rascunho em certificado legal.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Cadastre o local, os equipamentos e o responsável técnico real.',
          'Defina periodicidade, procedimento e evidência esperada para cada ativo.',
          'Gere as ordens recorrentes e registre execução, fotos e observações.',
          'Revise a versão vigente com o responsável antes de entregar ao cliente.',
          'Consulte a legislação em https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm e as normas sanitárias atuais.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Normas sanitárias mudam. A antiga RE 9/2003 foi revogada pela RDC 886/2024; por isso o OLLI deve exibir fonte e data de conferência, nunca congelar um limite regulatório sem revisão humana.',
      },
    ],
  },
  {
    id: 'assinatura-eletronica-govbr',
    categoriaId: 'governo',
    titulo: 'Assinatura eletrônica gov.br',
    resumo: 'Diferença entre aceite desenhado no OLLI e assinatura avançada validada pelo ITI.',
    tags: ['assinatura', 'gov.br', 'iti', 'certificado', 'contrato'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A assinatura desenhada no OLLI registra o aceite no documento e deixa uma trilha de data e versão. Ela é apresentada honestamente como comprovação entre as partes, não como assinatura digital certificada ICP-Brasil.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Para uma assinatura avançada, consulte https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica.',
          'Verifique se a conta gov.br tem o nível exigido e se o documento precisa de validação no ITI.',
          'Guarde o arquivo assinado e o comprovante de validação junto ao documento do cliente.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Nunca informe senha, código de segundo fator ou certificado privado ao OLLI ou a uma IA. A futura integração oficial deverá usar fluxo OAuth/homologação e confirmação do usuário.',
      },
    ],
  },

  // ── IA e ferramentas ─────────────────────────────────────────────────────
  {
    id: 'assistente-ia',
    categoriaId: 'ia',
    titulo: 'Assistente de IA',
    resumo: 'Um espaço para organizar o atendimento e preparar o item do orçamento. Nada é enviado ao cliente sem você.',
    tags: ['assistente', 'ia', 'chat', 'voz', 'autopilot'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O Assistente ajuda a pensar o atendimento: organizar o que confirmar antes de enviar, responder um cliente que achou o preço alto ou transformar uma descrição em item claro de orçamento. A conversa usa a cota de IA da sua conta. Se a cota acabar ou a IA estiver fora, a tela diz isso e não inventa uma resposta.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Assistente IA e escreva o que você precisa. No navegador que tiver reconhecimento de fala, dá para ditar.',
          'Leia a resposta antes de usar. Ela é um rascunho seu, não uma mensagem já enviada ao cliente.',
          'Quando a IA propõe gravar ou criar alguma coisa, aparece uma prévia. Só entra na sua base depois que você confirma.',
          'Dá para desfazer a ação confirmada por ali, quando a tela oferecer reverter.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'A OLLI não lê o áudio do WhatsApp do cliente e não muda o código do sistema por este chat. Não cole senha, código de banco nem documento de terceiro que você não queira guardar na conversa. No painel, o histórico recente fica neste navegador, nesta sessão.',
      },
    ],
  },
  {
    id: 'diagnostico-climatizacao',
    categoriaId: 'ia',
    titulo: 'Diagnóstico de ar-condicionado',
    resumo: 'Código de erro sai da base oficial, sem IA. Sintoma conversa com a IA e, se ela cair, volta para o código.',
    tags: ['diagnostico', 'codigo de erro', 'ar condicionado', 'hvac', 'sintoma'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O Diagnóstico de hoje é de climatização e refrigeração. Quem tem outro ofício não vê esta ferramenta no menu. A base de códigos de ar-condicionado responde sem IA: causa, ação, severidade e a fonte. A aba por sintoma conversa com a IA e sugere a ordem dos testes. Se a IA estiver fora, a tela diz e empurra de volta para o código.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Diagnóstico e busque o código do aparelho. Essa consulta não gasta a conversa com a IA.',
          'Se quiser aprofundar, leve marca e código para a aba por sintoma. A pergunta já vem preenchida para você revisar.',
          'Use a sugestão como roteiro de teste. Não troque peça só porque o texto sugeriu.',
          'No aplicativo Android, a base de códigos também funciona sem internet. A conversa com a IA precisa de conexão.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Ainda não há base de diagnóstico para geladeira, TV ou outros equipamentos. Alta tensão e circuito frigorígeno pedem profissional habilitado, manual do fabricante e as normas. A IA não manda furar proteção nem dispensar o teste.',
      },
    ],
  },
  {
    id: 'ferramentas-oficio',
    categoriaId: 'ia',
    titulo: 'Ferramentas de ofício',
    resumo: 'Calculadoras de campo, no navegador, com a mesma conta do aplicativo.',
    tags: ['ferramenta', 'calculadora', 'btu', 'disjuntor', 'tinta', 'oficio'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A aba Ferramentas de ofício reúne as calculadoras de campo (BTU, carga de gás, disjuntor, caixa d\'água, tinta, adubação e as outras que a lista mostra). A conta roda no seu aparelho ou no navegador. Não depende de rede para o número sair.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Busque pelo nome ou filtre pelo ofício. Nada fica escondido: o que existe aparece na lista.',
          'Abra a calculadora e preencha as entradas. O resultado recalcula enquanto você digita.',
          'Campo obrigatório vazio mostra o que falta. A tela não completa com zero falso.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'O número é uma referência da fórmula e do que você informou, não um laudo nem uma obrigação legal. Confira unidade, norma citada na própria calculadora e a condição real do serviço antes de passar o valor ao cliente.',
      },
    ],
  },

  // ── Equipe, planos e conta ───────────────────────────────────────────────
  {
    id: 'equipe-permissoes',
    categoriaId: 'conta',
    titulo: 'Equipe e permissões',
    resumo: 'Convide técnicos e gestores, e entenda o que cada papel pode ver e fazer.',
    tags: ['convite', 'papel', 'tecnico', 'gestor', 'admin', 'multiempresa'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Uma conta pode ser Pessoal (só você, dono de tudo) ou Empresa (uma organização com vários membros). Dentro de uma empresa, cada pessoa tem um papel:',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Dono — acesso completo, incluindo cobrança e exclusão da empresa.',
          'Administrador — gerencia tudo, menos cobrança e excluir a empresa.',
          'Gestor — vê relatórios, metas e a agenda de todos, mas não mexe na equipe.',
          'Técnico — cria orçamentos e vê a própria agenda/OS, sem acesso a relatórios ou valores agregados.',
        ],
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → Equipe.',
          'Toque em "Convidar" e escolha o papel (Administrador, Gestor ou Técnico).',
          'Compartilhe o link de convite gerado — a pessoa aceita e já entra na sua organização.',
          'Você pode ativar/desativar um membro a qualquer momento, sem excluir o histórico dele.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Gerenciar equipe (convidar, trocar papel, desativar) é um recurso do plano Empresa.',
      },
    ],
  },
  {
    id: 'planos-assinatura',
    categoriaId: 'conta',
    titulo: 'Planos e assinatura',
    resumo: 'O que muda entre Grátis, Pro e Empresa — e como assinar, trocar ou cancelar.',
    tags: ['plano', 'assinar', 'preco', 'upgrade', 'cancelar'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          `O Grátis tem ${FRASE_GRATIS}; rascunhos, recibos, clientes, agenda e histórico também ficam sem limite. Depois do primeiro envio, o dono pode ativar ${TRIAL_PRO_DIAS} dias de Pro sem pagar nada e sem cobrança automática. Os planos pagos liberam recursos extras:`,
      },
      {
        // Preço de tabela da web: some nas lojas (a Play mostra só o preço da própria
        // loja, na tela de compra). Logo abaixo, a versão das lojas, sem preço.
        tipo: 'passos',
        soNaWeb: true,
        conteudo: [
          // Preços vêm de precosPlanos; recursos e "em breve" da tabela única planosBase.
          `Grátis (${reais(0)}) — ${FRASE_GRATIS_CURTA} e tudo do essencial, mais ${IA_USOS_GRATIS_MES} usos de IA por mês.`,
          `Pro (${reais(PRECO_PRO.mensalCentavos)}/mês) — ${recursosDoPlano('pro')}.`,
          `Empresa (${reais(PRECO_EMPRESA.mensalCentavos)}/mês) — tudo do Pro, mais: ${recursosDoPlano('empresa')}.`,
        ],
      },
      {
        tipo: 'passos',
        soNaLoja: true,
        conteudo: [
          `Grátis — ${FRASE_GRATIS_CURTA} e tudo do essencial, mais ${IA_USOS_GRATIS_MES} usos de IA por mês.`,
          `Pro — ${recursosDoPlano('pro')}.`,
          `Empresa — tudo do Pro, mais: ${recursosDoPlano('empresa')}.`,
        ],
      },
      {
        tipo: 'passos',
        soNaWeb: true,
        conteudo: [
          'Vá em Conta → Planos para comparar e assinar (mensal, anual com desconto, ou parcelado em até 12x sem juros).',
          'Para trocar de plano ou cancelar, use "Gerenciar assinatura" — abre o portal seguro de pagamento.',
        ],
      },
      {
        // No Android a assinatura é feita e gerenciada só pela Google Play.
        tipo: 'passos',
        soNaLoja: true,
        soNoAndroid: true,
        conteudo: [
          'No aplicativo Android, a assinatura de um plano pago é feita e gerenciada pela Google Play. Em Conta → Planos você compara os planos e vê o que cada um libera.',
          'Para ver, trocar ou cancelar a assinatura, abra a Google Play, toque na sua foto, vá em Pagamentos e assinaturas → Assinaturas e escolha o OLLI.',
        ],
      },
      {
        // Só na web: no app das lojas não há Pix nem pode haver texto mandando pagar.
        tipo: 'paragrafo',
        soNaWeb: true,
        conteudo:
          'Prefere Pix? Quando o Pix estiver disponível, a tela de Planos mostra "Pagar com Pix": você paga 1 mês ou 1 ano, pelo mesmo preço, e ele não renova sozinho — perto do vencimento o OLLI avisa para renovar. O Pix é processado pela AbacatePay.',
      },
      {
        tipo: 'aviso',
        soNaWeb: true,
        conteudo: 'O cartão é cobrado pela Stripe. O OLLI nunca guarda o número do seu cartão nem os seus dados bancários.',
      },
      {
        tipo: 'aviso',
        soNaLoja: true,
        soNoAndroid: true,
        conteudo: 'A cobrança da assinatura é feita pela Google Play. O OLLI nunca guarda os seus dados de pagamento.',
      },
    ],
  },
  {
    id: 'meu-negocio-documentos',
    categoriaId: 'conta',
    titulo: 'Meu negócio: o que sai no documento do cliente',
    resumo: 'Nome, logo, contato e chave de pagamento que aparecem no PDF.',
    tags: ['meu negocio', 'logo', 'empresa', 'pdf', 'identidade'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Meu negócio é o cadastro que sai em todo documento que o cliente recebe: nome, contato, logo e a chave de pagamento. CNPJ e CPF são opcionais. Se você digitar, o número tem de ser válido. Cor da marca é uma paleta fechada, porque ela pinta o cabeçalho do PDF com texto claro por cima — uma cor livre pode deixar o orçamento ilegível.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Meu negócio, em Configurações ou no menu.',
          'Preencha o que deve aparecer para o cliente e envie o logo por ali, se quiser vê-lo também no painel.',
          'Salve. Só o dono grava esta ficha. Quem é da equipe vê em leitura.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'A tela não apaga o que foi cadastrado no celular e que ela não mostra, como a assinatura digitalizada. Se outro aparelho salvou no meio do caminho, o OLLI recusa gravar por cima e pede para reabrir.',
      },
    ],
  },
  {
    id: 'aparencia-configuracoes',
    categoriaId: 'conta',
    titulo: 'Configurações e a aparência da sua tela',
    resumo: 'Tema claro ou escuro e a cor de destaque ficam neste navegador. O PDF do cliente não muda com isso.',
    tags: ['configuracoes', 'aparencia', 'tema', 'escuro', 'layout', 'cor'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Configurações junta os atalhos de Meu negócio, Central de dados, aparência, privacidade e a cobrança da sua assinatura da OLLI. A aparência é o tema claro ou escuro e a cor de destaque do painel. Essa preferência fica salva neste navegador. Ela não troca a cor do PDF: essa continua a do Meu negócio.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra Configurações.',
          'Em Aparência, escolha Claro ou Escuro e uma cor de destaque. Dá para fazer pelo teclado.',
          'Nome e e-mail da sua conta de acesso ficam no mesmo lugar. Se o e-mail mudar, confira a caixa: pode haver uma confirmação.',
          'Privacidade e o caminho para excluir a conta estão linkados ali, ao lado do texto da política.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Tema e cor de destaque não acompanham outro computador até você escolher de novo nele. Quem não é o dono não gerencia a cobrança da assinatura.',
      },
    ],
  },
  {
    id: 'lixeira-restaurar',
    categoriaId: 'dados',
    titulo: 'Apagou algo por engano? Lixeira e backups',
    resumo: 'A Lixeira guarda o que você excluiu por 30 dias e restaura em 1 toque. Perdeu muita coisa de uma vez? Aí é caso de backup completo.',
    tags: ['lixeira', 'excluir', 'apagar', 'desfazer', 'restaurar', 'expurgo', 'backup'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O OLLI tem uma Lixeira de verdade: ao excluir um cliente, orçamento, recibo, serviço, produto, modelo, depoimento, agendamento, ordem de serviço ou equipamento, o item não some na hora — ele fica guardado ali por 30 dias, pronto pra voltar com um toque.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → Lixeira (Dono, Administrador e Gestor têm acesso; o papel Técnico não vê essa opção).',
          'A lista mostra os itens excluídos agrupados por tipo, com a data da exclusão e um selo de quantos dias faltam até o expurgo automático.',
          'Achou o que precisa? Toque em "Restaurar" — o item volta a aparecer normalmente na tela de origem, do jeito que estava.',
          'Tem certeza que quer descartar? Toque em "Excluir de vez" no item, ou em "Esvaziar lixeira" (no topo da tela) pra remover tudo de uma vez.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          '"Excluir de vez" e "Esvaziar lixeira" são imediatos e definitivos — não tem uma segunda lixeira depois deles. Passados os 30 dias, o item também é apagado sozinho (expurgo automático), mesmo que você nunca tenha aberto a tela.',
      },
      {
        tipo: 'paragrafo',
        conteudo:
          'Perdeu muita coisa de uma vez, ou o item já passou dos 30 dias e não está mais na Lixeira? Aí o caminho é restaurar uma cópia de segurança de antes do problema.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → "Ver cópias de segurança".',
          'Escolha uma cópia com data anterior ao que você perdeu.',
          'Toque em restaurar e confirme.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Restaurar uma cópia de segurança troca TODOS os dados atuais pelos daquela cópia — o que foi criado depois dela (inclusive o que ainda estiver na Lixeira) também é perdido. Por isso, prefira sempre a Lixeira; deixe o backup completo como último recurso.',
      },
    ],
  },
  {
    id: 'backup-sincronizacao',
    categoriaId: 'dados',
    titulo: 'Backup e sincronização',
    resumo: 'Como o OLLI guarda uma cópia dos seus dados na nuvem e mantém vários aparelhos atualizados.',
    tags: ['nuvem', 'backup automatico', 'trocar de aparelho'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O aparelho é sempre a fonte de verdade (seus dados existem localmente mesmo sem internet). Quando você faz login, o OLLI passa a manter uma cópia protegida na nuvem — isso permite trocar de aparelho sem perder nada e liga o backup automático diário.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Faça login em Conta (uma vez só — o app lembra depois).',
          'Em Conta, o toggle "Backup automático diário" liga (padrão) ou desliga o backup sem precisar apertar nada todo dia.',
          'Toque em "Ver cópias de segurança" para ver o histórico de backups diários, semanais e manuais.',
          'Quer forçar uma cópia agora? Use o backup manual, direto nessa mesma tela.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Trocando de aparelho: instale o OLLI, faça login com a mesma conta e os dados chegam sozinhos.',
      },
    ],
  },
  {
    id: 'offline-como-funciona',
    categoriaId: 'dados',
    titulo: 'Offline: como funciona',
    resumo: 'Por que o aplicativo Android funciona sem internet — e o que realmente precisa de conexão.',
    tags: ['sem internet', 'sem sinal', 'campo'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O aplicativo Android do OLLI foi pensado pra quem trabalha em campo, muitas vezes sem sinal. Todo o essencial roda 100% local, no banco de dados do próprio aparelho — nada trava por falta de internet. Pelo navegador (no celular ou no computador), o OLLI precisa de internet.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Funciona sem internet: criar/editar orçamentos, clientes, serviços, produtos, agenda, ordens de serviço, checklist e o diagnóstico de códigos de erro (a base offline tem centenas de códigos).',
          'Precisa de internet: enviar o link do orçamento pro cliente (é uma página pública na nuvem), IA (diagnóstico avançado, voz, chat), sincronizar/fazer backup, gerar a etiqueta QR de um equipamento pela 1ª vez, e consultar o seu plano.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Assim que a internet voltar, o que você fez offline sincroniza sozinho — sem precisar reenviar nada manualmente.',
      },
    ],
  },
  {
    id: 'privacidade-dados',
    categoriaId: 'dados',
    titulo: 'Privacidade e seus dados',
    resumo: 'Onde ficam os seus dados e os do seu cliente, e como excluir a conta.',
    tags: ['lgpd', 'privacidade', 'dados pessoais', 'excluir conta', 'apagar conta'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Seus dados (e os dos seus clientes) ficam salvos primeiro no seu aparelho. Se você faz login, uma cópia protegida vai para a nuvem — separada por conta: só você (e a sua equipe, se for conta Empresa) consegue acessar os seus dados. Quem abre o link de um orçamento vê só aquele orçamento, sem precisar criar conta e sem acessar o resto da sua base.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Para apagar os dados só deste aparelho: saia da conta em Conta → "Sair da conta" e desinstale o app.',
          'Para excluir sua conta por completo (incluindo os dados na nuvem), vá em Conta → role até o fim → "Excluir minha conta". Digite EXCLUIR para confirmar e toque de novo no alerta final.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Excluir a conta é diferente de excluir um item na Lixeira: aqui não tem prazo de 30 dias nem como voltar atrás — assim que você confirma, login, orçamentos, clientes, agenda, recibos e backups somem para sempre.',
      },
      {
        tipo: 'aviso',
        conteudo: 'O OLLI nunca vende ou compartilha dados de clientes com terceiros para fins de marketing.',
      },
    ],
  },
  {
    id: 'central-de-dados',
    categoriaId: 'dados',
    titulo: 'Trazer e levar dados pela Central de dados',
    resumo: 'Importar e exportar com mapa de colunas, prévia e a sua confirmação. Esta tela não apaga.',
    tags: ['importar', 'exportar', 'planilha', 'csv', 'central de dados', 'autopilot'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'A Central de dados é a porta para tirar ou colocar planilha: clientes, produtos, serviços, orçamentos e tabela de preço de fornecedor. Toda escrita mostra o mapa das colunas, uma prévia do que entra, atualiza ou fica de fora, e só grava quando você confirma. Não existe apagar nesta tela.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Escolha o tipo de dado e o arquivo, ou baixe o que já está na conta.',
          'Confira a prévia linha a linha. O que estiver ambíguo ou com erro não entra calado.',
          'Confirme. Aí sim os dados entram na sua conta.',
          'Se usar o auxílio de IA para ler um texto ou um arquivo, a prévia aparece antes. Item duplicado ou sem evidência fica para você revisar. Nada é gravado sem a sua confirmação.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'A Central de dados não lê a conversa do WhatsApp sozinha. Quem cola um texto é você. Não coloque senha nem lista de contatos de terceiro que você não queira armazenar na sua conta.',
      },
    ],
  },

  // ── Suporte ───────────────────────────────────────────────────────────────
  {
    id: 'falar-com-suporte',
    categoriaId: 'suporte',
    titulo: 'Falar com o suporte',
    // P1 (auditoria): este artigo prometia "o card Suporte, logo abaixo da busca" +
    // e-mail + "formulário dentro do app" — nenhum dos três existe na Central de Ajuda
    // nem no app. Prometer canal que não há é pior que não citar canal. Agora aponta o
    // único que funciona hoje: o WhatsApp de vendas/suporte (o mesmo da landing).
    resumo: 'Fale com a gente no WhatsApp — é o canal mais rápido.',
    tags: ['contato', 'whatsapp', 'duvida', 'problema', 'bug'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Ficou com dúvida que este artigo não resolveu, ou achou algo que parece um erro? Fale com a gente no WhatsApp: (11) 94172-7487. É o canal mais rápido — mande sua mensagem que a gente responde por lá.',
      },
      {
        tipo: 'aviso',
        conteudo: 'Pra agilizar, diga o que você estava tentando fazer e em qual tela — não precisa mandar print com dados sensíveis do cliente.',
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * O bloco aparece NESTA plataforma (`Platform.OS`: 'web' | 'android' | 'ios')?
 * Só a web vende por fora (mesma regra de `plataformaPodeVender`, em
 * `services/lembreteAssinaturaLoja.ts`). Nas lojas somem os blocos `soNaWeb`
 * (Stripe, cartão, 12x, portal, Pix e preço de tabela da web) e entram os
 * `soNaLoja`; na web é o contrário. `soNoAndroid` (Google Play) só no Android.
 */
function blocoVisivel(b: AjudaBloco, plataforma: string): boolean {
  if (plataforma === 'web') return !b.soNaLoja && !b.soNoAndroid;
  return !b.soNaWeb && (plataforma === 'android' || !b.soNoAndroid);
}

/** Os blocos que ESTA plataforma pode mostrar (ver `blocoVisivel`). */
export function corpoVisivel(artigo: AjudaArtigo, plataforma: string): AjudaBloco[] {
  return artigo.corpo.filter((b) => blocoVisivel(b, plataforma));
}

export function getCategoria(id: string): AjudaCategoria | undefined {
  return CATEGORIAS_AJUDA.find(c => c.id === id);
}

export function getArtigo(id: string): AjudaArtigo | undefined {
  return ARTIGOS_AJUDA.find(a => a.id === id);
}

export function getArtigosDaCategoria(categoriaId: string): AjudaArtigo[] {
  return ARTIGOS_AJUDA.filter(a => a.categoriaId === categoriaId);
}

/** Remove acentos e baixa a caixa — busca em PT-BR não deve exigir acento certo. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàãâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòõôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .trim();
}

function textoDoBloco(b: AjudaBloco): string {
  return Array.isArray(b.conteudo) ? b.conteudo.join(' ') : b.conteudo;
}

/** Índice de busca (título + resumo + tags + corpo VISÍVEL na plataforma) — 1x por plataforma. */
const INDICES = new Map<string, { artigo: AjudaArtigo; texto: string }[]>();

function indiceDa(plataforma: string): { artigo: AjudaArtigo; texto: string }[] {
  let indice = INDICES.get(plataforma);
  if (!indice) {
    indice = ARTIGOS_AJUDA.map(a => ({
      artigo: a,
      texto: normalizar(
        [a.titulo, a.resumo, ...(a.tags ?? []), ...corpoVisivel(a, plataforma).map(textoDoBloco)].join(' '),
      ),
    }));
    INDICES.set(plataforma, indice);
  }
  return indice;
}

/**
 * Busca simples por substring (sem acento, sem caixa) em título/resumo/tags e no
 * corpo que ESTA plataforma mostra — no Android, "pix" ou "stripe" não acham o
 * artigo pelo texto que só a web exibe.
 */
export function buscarArtigos(query: string, plataforma: string): AjudaArtigo[] {
  const q = normalizar(query);
  if (!q) return [];
  return indiceDa(plataforma).filter(e => e.texto.includes(q)).map(e => e.artigo);
}

/** Uma pergunta da Central, já filtrada para a plataforma. A resposta é texto puro. */
export interface PerguntaAjuda {
  id: string;
  categoriaId: string;
  categoria: string;
  pergunta: string;
  resposta: string;
}

function respostaDoArtigo(artigo: AjudaArtigo, plataforma: string): string {
  const blocos = corpoVisivel(artigo, plataforma).map((bloco) => {
    if (bloco.tipo === 'passos' && Array.isArray(bloco.conteudo)) {
      return bloco.conteudo.map((passo, i) => `${i + 1}. ${passo}`).join('\n');
    }
    return textoDoBloco(bloco);
  });
  return [artigo.resumo, ...blocos].filter((parte) => parte.trim().length > 0).join('\n\n');
}

/**
 * FAQ derivado dos artigos. A ordem segue as categorias e, dentro delas, a ordem
 * do array. Preço de tabela da web só entra quando a plataforma é a web.
 */
export function perguntasEstruturadas(plataforma: string): PerguntaAjuda[] {
  const ordem = new Map(CATEGORIAS_AJUDA.map((categoria, indice) => [categoria.id, indice]));
  return ARTIGOS_AJUDA
    .map((artigo, indice) => ({ artigo, indice }))
    .sort((a, b) => (ordem.get(a.artigo.categoriaId) ?? 99) - (ordem.get(b.artigo.categoriaId) ?? 99) || a.indice - b.indice)
    .map(({ artigo }) => ({
      id: artigo.id,
      categoriaId: artigo.categoriaId,
      categoria: getCategoria(artigo.categoriaId)?.titulo ?? artigo.categoriaId,
      pergunta: artigo.titulo,
      resposta: respostaDoArtigo(artigo, plataforma),
    }))
    .filter((pergunta) => pergunta.resposta.trim().length > 0);
}

/** FAQPage do schema.org, o mesmo array que a tela mostra. */
export function faqSchemaOrg(plataforma: string): {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{ '@type': 'Question'; name: string; acceptedAnswer: { '@type': 'Answer'; text: string } }>;
} {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: perguntasEstruturadas(plataforma).map((pergunta) => ({
      '@type': 'Question',
      name: pergunta.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: pergunta.resposta },
    })),
  };
}

/**
 * O mesmo FAQ em markdown puro, no jeito de um llms.txt: título = assunto,
 * corpo = o que o produto faz hoje naquela plataforma. Nada escrito à mão aqui.
 */
export function markdownAjudaLlms(plataforma: string, origem = 'https://olliorcamentos.online'): string {
  const linhas = [
    '# OLLI — Central de Ajuda',
    '',
    '> Respostas do produto para pessoas e assistentes. Cada título é um assunto. O texto descreve o que a OLLI faz hoje.',
    `> Página: ${origem}/ajuda/`,
    `> Este arquivo: ${origem}/ajuda/llms.txt`,
    `> Índice geral do produto: ${origem}/llms.txt`,
    '',
    '## Como usar este arquivo',
    '',
    'Procure o assunto pelo título. Os passos numerados são a ordem da tela. O que não está escrito aqui não está prometido.',
    '',
  ];
  let categoriaAtual = '';
  for (const pergunta of perguntasEstruturadas(plataforma)) {
    if (pergunta.categoria !== categoriaAtual) {
      categoriaAtual = pergunta.categoria;
      linhas.push(`## ${categoriaAtual}`, '');
    }
    linhas.push(`### ${pergunta.pergunta}`, '', pergunta.resposta, '');
  }
  return `${linhas.join('\n').trim()}\n`;
}
