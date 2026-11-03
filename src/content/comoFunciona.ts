/**
 * Central "COMO FUNCIONA" — um verbete curto por tela principal (Onda I5).
 *
 * O ícone "?" no cabeçalho de cada tela abre uma folha com: o que a tela faz em
 * uma frase, 3 ou 4 passos com ícone (a ilustração) e, quando existir, o guia
 * completo da Central de Ajuda (`artigoId`, de `content/ajuda`).
 *
 * Dados puros (sem React/RN): a folha desenha, a Central de Ajuda lista e o teste
 * (`scripts/teste-dicas-roteiro.ts`) confere tamanho e coerência.
 *
 * HONESTIDADE: cada passo descreve o que a tela faz HOJE. Mudou a tela, muda o
 * verbete junto. Vídeo é OPCIONAL e só entra com uma URL real gravada — sem vídeo
 * o campo fica de fora (nunca um player vazio ou "em breve" fingindo conteúdo).
 */

export type TelaComoFunciona =
  | 'inicio'
  | 'hoje'
  | 'orcamentos'
  | 'novo_orcamento'
  | 'detalhe_orcamento'
  | 'clientes'
  | 'agenda'
  | 'os'
  | 'recibo'
  | 'equipamento'
  | 'importar'
  | 'conta';

export interface PassoComoFunciona {
  /** Ícone do MaterialCommunityIcons (string pura). */
  icone: string;
  texto: string;
}

export interface VerbeteComoFunciona {
  tela: TelaComoFunciona;
  /** Nome da tela como aparece no app. */
  titulo: string;
  /** O que a tela faz, em uma frase. */
  resumo: string;
  passos: readonly PassoComoFunciona[];
  /** Guia completo na Central de Ajuda (id de `ARTIGOS_AJUDA`). */
  artigoId?: string;
  /** Vídeo curto real (https). Sem vídeo gravado, fica de fora. */
  videoUrl?: string;
}

export const VERBETES_COMO_FUNCIONA: Readonly<Record<TelaComoFunciona, VerbeteComoFunciona>> = {
  inicio: {
    tela: 'inicio',
    titulo: 'Início',
    resumo: 'Em poucos segundos você vê para onde ir, se vai chover e quanto dinheiro está parado.',
    passos: [
      { icone: 'map-marker-radius-outline', texto: 'A Próxima parada traz o cliente, o horário e o botão Estou a caminho.' },
      { icone: 'map-marker-path', texto: 'A Rota de hoje lista as visitas na ordem do relógio e abre o caminho no Maps.' },
      { icone: 'cash-clock', texto: 'O quadro de dinheiro parado mostra quem cobrar e quem lembrar, com a mensagem pronta.' },
      { icone: 'plus-circle-outline', texto: 'O botão Orçar, no meio da barra de baixo, cria um orçamento de qualquer tela.' },
    ],
    artigoId: 'primeiros-passos',
  },
  hoje: {
    tela: 'hoje',
    titulo: 'Hoje',
    resumo: 'A linha do tempo do seu dia, visita por visita.',
    passos: [
      { icone: 'clock-outline', texto: 'Cada visita mostra em que pé está: agora, próxima, mais tarde ou feita.' },
      { icone: 'whatsapp', texto: 'Na próxima, Estou a caminho abre o WhatsApp do cliente com a mensagem pronta.' },
      { icone: 'weather-partly-rainy', texto: 'O aviso de clima diz se a previsão indica chuva no lugar e na hora da visita.' },
      { icone: 'check-circle-outline', texto: 'Visita que passou sem baixa pede um toque: concluir, remarcar ou cancelar.' },
    ],
  },
  orcamentos: {
    tela: 'orcamentos',
    titulo: 'Orçamentos',
    resumo: 'Todos os seus orçamentos, do rascunho ao aprovado.',
    passos: [
      { icone: 'filter-variant', texto: 'Filtre pelo status para achar o que precisa de você agora.' },
      { icone: 'eye-check-outline', texto: 'Visualizado quer dizer que o cliente abriu o link.' },
      { icone: 'gesture-tap', texto: 'Toque num orçamento para ver o próximo passo, compartilhar ou cobrar.' },
    ],
    artigoId: 'criar-enviar-orcamento',
  },
  novo_orcamento: {
    tela: 'novo_orcamento',
    titulo: 'Novo orçamento',
    resumo: 'Cliente, itens e condições. No fim, você manda o link ou o PDF.',
    passos: [
      { icone: 'account-outline', texto: 'Escolha o cliente ou cadastre na hora, sem sair daqui.' },
      { icone: 'format-list-bulleted', texto: 'Adicione itens do seu catálogo ou digite um novo. Dá para ditar por voz.' },
      { icone: 'tune-variant', texto: 'Ajuste desconto, pagamento, garantia e validade.' },
      { icone: 'send-outline', texto: 'Revise e envie: o cliente aprova pelo celular, sem instalar nada.' },
    ],
    artigoId: 'criar-enviar-orcamento',
  },
  detalhe_orcamento: {
    tela: 'detalhe_orcamento',
    titulo: 'Detalhe do orçamento',
    resumo: 'Tudo o que aconteceu com este orçamento e o próximo passo certo.',
    passos: [
      { icone: 'timeline-text-outline', texto: 'A linha do tempo mostra quando foi enviado, aberto e respondido.' },
      { icone: 'gesture-tap-button', texto: 'O botão de cima é sempre o próximo passo: enviar, cobrar ou marcar a visita.' },
      { icone: 'history', texto: 'Editar depois do envio guarda a versão que o cliente já viu.' },
      { icone: 'receipt', texto: 'Quando o dinheiro cair, registre o pagamento e mande o recibo.' },
    ],
    artigoId: 'link-cliente',
  },
  clientes: {
    tela: 'clientes',
    titulo: 'Clientes',
    resumo: 'Sua carteira de clientes, com a história de cada um.',
    passos: [
      { icone: 'magnify', texto: 'Busque pelo nome ou telefone.' },
      { icone: 'account-details-outline', texto: 'Toque no cliente para ver orçamentos, visitas e equipamentos dele.' },
      { icone: 'account-clock-outline', texto: 'O selo de meses (ex.: "6+ meses") mostra quem está há tempo sem serviço: pode ser hora de lembrar.' },
    ],
  },
  agenda: {
    tela: 'agenda',
    titulo: 'Agenda',
    resumo: 'Suas visitas por dia, semana ou mês.',
    passos: [
      { icone: 'calendar-range', texto: 'Troque entre Dia, Semana e Mês no topo.' },
      { icone: 'gesture-swipe-vertical', texto: 'No Dia, segure uma visita e arraste para mudar o horário.' },
      { icone: 'weather-pouring', texto: 'Visita externa com chuva prevista ganha um aviso para remarcar.' },
      { icone: 'repeat', texto: 'Serviço que se repete pode virar uma série (ex.: todo mês).' },
    ],
  },
  os: {
    tela: 'os',
    titulo: 'Ordens de serviço',
    resumo: 'A execução do que foi vendido: quem vai, quando, checklist e fotos.',
    passos: [
      { icone: 'clipboard-list-outline', texto: 'A OS nasce de um orçamento aprovado ou é criada aqui.' },
      { icone: 'account-hard-hat', texto: 'Atribua um técnico: ele vê a OS no celular dele.' },
      { icone: 'camera-outline', texto: 'Fotos funcionam sem internet e mostram se já foram enviadas.' },
      { icone: 'check-all', texto: 'Marque o checklist e conclua quando terminar.' },
    ],
    artigoId: 'ordens-servico-app-tecnico',
  },
  recibo: {
    tela: 'recibo',
    titulo: 'Recibo',
    resumo: 'O comprovante numerado do que o cliente pagou.',
    passos: [
      { icone: 'cash-check', texto: 'Confira o valor e a forma de pagamento.' },
      { icone: 'numeric', texto: 'O número só é gerado quando você emite: abrir a tela não gasta número.' },
      { icone: 'share-variant-outline', texto: 'Mande o PDF pelo WhatsApp e, se quiser, peça a avaliação no Google.' },
    ],
    artigoId: 'recibos-pagamentos',
  },
  equipamento: {
    tela: 'equipamento',
    titulo: 'Equipamentos',
    resumo: 'Os aparelhos de cada cliente, com a história de manutenção.',
    passos: [
      { icone: 'air-conditioner', texto: 'Cadastre marca, modelo, série e onde está instalado.' },
      { icone: 'qrcode', texto: 'Gere a etiqueta de 99×38 mm e cole no aparelho.' },
      { icone: 'cellphone-nfc', texto: 'Quem escanear vê a última manutenção e pode pedir orçamento a você, sem login.' },
    ],
    artigoId: 'equipamentos-qr',
  },
  importar: {
    tela: 'importar',
    titulo: 'Trazer meus dados',
    resumo: 'Traga clientes, serviços e produtos do app antigo, da planilha ou dos contatos.',
    passos: [
      { icone: 'file-upload-outline', texto: 'Escolha de onde: contatos do celular, planilha (CSV ou XLSX) ou foto da lista.' },
      { icone: 'table-eye', texto: 'Confira a prévia: cada linha diz se entra ou por que ficou de fora.' },
      { icone: 'database-import-outline', texto: 'Confirme e os dados entram na sua conta.' },
    ],
  },
  conta: {
    tela: 'conta',
    titulo: 'Conta',
    resumo: 'Seu negócio, plano, avisos, dados e ajuda num lugar só.',
    passos: [
      { icone: 'magnify', texto: 'Use a busca no topo para achar qualquer ajuste.' },
      { icone: 'store-outline', texto: 'Meu Negócio guarda logo, Pix e endereço que saem nos documentos.' },
      { icone: 'cloud-check-outline', texto: 'Em Dados, ligue o backup automático diário.' },
      { icone: 'lightbulb-on-outline', texto: 'Em Ajuda, ligue ou desligue as dicas e reveja a apresentação.' },
    ],
    artigoId: 'backup-sincronizacao',
  },
};

/** Lista na ordem em que a Central mostra. */
export const ORDEM_COMO_FUNCIONA: readonly TelaComoFunciona[] = [
  'inicio', 'hoje', 'orcamentos', 'novo_orcamento', 'detalhe_orcamento', 'clientes',
  'agenda', 'os', 'recibo', 'equipamento', 'importar', 'conta',
];

export function verbeteDaTela(tela: TelaComoFunciona): VerbeteComoFunciona {
  return VERBETES_COMO_FUNCIONA[tela];
}
