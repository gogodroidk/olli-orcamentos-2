/**
 * dicasRoteiro.ts — "explicação por explicação" (Onda I5 do plano OLLI Inteligente).
 *
 * Em vez de um tour de 10 telas no primeiro dia (que ninguém lê), cada dica
 * aparece NA HORA em que o recurso fica útil: o primeiro envio, o cliente que
 * abriu o link, a primeira visita, o primeiro QR… São 18 dicas, cada uma presa a
 * um EVENTO real do uso.
 *
 * TypeScript PURO (sem React, sem AsyncStorage): a regra mora aqui e é testada em
 * `scripts/teste-dicas-roteiro.ts`. O armazenamento fica em `dicasRoteiroStore.ts`
 * e o desenho em `components/ajuda/DicaDoRoteiro.tsx`.
 *
 * REGRAS (seção 4 do plano):
 *  • Cada dica tem um id ESTÁVEL e nunca repete: "Entendi" esconde para sempre
 *    (o mesmo conjunto de "dicas vistas" do `DicaContextual`).
 *  • No máximo UMA dica NOVA por dia. Uma dica já apresentada e ainda não
 *    dispensada continua no lugar dela (não conta como nova de novo).
 *  • "Não mostrar mais dicas" desliga o roteiro inteiro (o mesmo interruptor
 *    "Mostrar dicas contextuais" da Conta). "Rever apresentação e dicas" zera tudo.
 *  • Copy HONESTA: cada texto descreve o que o app faz HOJE. Recurso que ainda não
 *    existe no app não ganha dica (a dica "dossiê de cobrança" do plano, por
 *    exemplo, virou a do botão Cobrar, que existe).
 */

/** Os eventos que destravam dicas. Cada um é registrado UMA vez (a primeira). */
export type EventoDica =
  | 'onboarding_primeiro_orcamento'
  | 'primeiro_envio'
  | 'cliente_abriu_link'
  | 'primeira_aprovacao'
  | 'primeira_visita_agendada'
  | 'primeira_chuva_prevista'
  | 'dia_com_varias_visitas'
  | 'primeiro_a_caminho'
  | 'primeira_os_aberta'
  | 'primeira_os_concluida'
  | 'primeiro_recibo'
  | 'primeiro_orcamento_parado'
  | 'primeira_cobranca_atrasada'
  | 'primeiro_cliente_para_lembrar'
  | 'primeiro_qr'
  | 'primeiro_convite_equipe'
  | 'primeira_importacao'
  | 'uso_30_dias';

/** Onde a dica aparece (cada tela desenha `<DicaDoRoteiro local=… />`). */
export type LocalDica =
  | 'onboarding'
  | 'detalhe'
  | 'agenda'
  | 'inicio'
  | 'hoje'
  | 'os'
  | 'recibo'
  | 'clientes'
  | 'equipamento'
  | 'equipe'
  | 'conta';

export interface DicaDoRoteiro {
  /** Id estável (nunca renomear: é o que guarda "já vi"). Prefixo `roteiro.`. */
  id: string;
  /** Posição no roteiro (1–18): desempate quando duas dicas cabem no mesmo lugar. */
  numero: number;
  evento: EventoDica;
  local: LocalDica;
  /** Título curto (3–5 palavras). */
  titulo: string;
  /** Uma ou duas frases, voz da OLLI, pt-BR. */
  texto: string;
  /** Ícone do MaterialCommunityIcons (string pura, sem import de RN aqui). */
  icone: string;
}

/** O roteiro completo, na ordem em que um prestador típico vive cada momento. */
export const ROTEIRO_DICAS: readonly DicaDoRoteiro[] = [
  {
    id: 'roteiro.onboarding.primeiro-orcamento',
    numero: 1,
    evento: 'onboarding_primeiro_orcamento',
    local: 'onboarding',
    titulo: 'Vamos juntos',
    texto: 'Vamos fazer seu primeiro orçamento juntos. Os itens do seu ofício já vêm prontos: você só troca o que quiser.',
    icone: 'hand-wave-outline',
  },
  {
    id: 'roteiro.orcamento.primeiro-envio',
    numero: 2,
    evento: 'primeiro_envio',
    local: 'detalhe',
    titulo: 'Agora é com o cliente',
    texto: 'Quando ele abrir o link, o status muda para Visualizado aqui. Você fica sabendo sem precisar perguntar.',
    icone: 'send-check-outline',
  },
  {
    id: 'roteiro.orcamento.cliente-abriu',
    numero: 3,
    evento: 'cliente_abriu_link',
    local: 'detalhe',
    titulo: 'O cliente abriu',
    texto: 'Ele já viu o seu orçamento. Responder enquanto o assunto está fresco ajuda a fechar.',
    icone: 'eye-check-outline',
  },
  {
    id: 'roteiro.orcamento.primeira-aprovacao',
    numero: 4,
    evento: 'primeira_aprovacao',
    local: 'detalhe',
    titulo: 'Aprovado!',
    texto: 'Agora marque a visita na Agenda. Se combinou entrada, registre o pagamento aqui mesmo quando cair na conta.',
    icone: 'check-decagram-outline',
  },
  {
    id: 'roteiro.agenda.primeira-visita',
    numero: 5,
    evento: 'primeira_visita_agendada',
    local: 'agenda',
    titulo: 'Visita marcada',
    texto: 'No dia, ela aparece na aba Hoje com Traçar rota e Estou a caminho, prontos para usar.',
    icone: 'calendar-check-outline',
  },
  {
    id: 'roteiro.rua.chuva-primeira',
    numero: 6,
    evento: 'primeira_chuva_prevista',
    local: 'hoje',
    titulo: 'Chuva no caminho',
    texto: 'A previsão indica chuva forte (ou há alerta oficial) no lugar e na hora desta visita externa. Toque no aviso de clima para avisar o cliente e remarcar.',
    icone: 'weather-pouring',
  },
  {
    id: 'roteiro.rua.dia-cheio',
    numero: 7,
    evento: 'dia_com_varias_visitas',
    local: 'inicio',
    titulo: 'Dia cheio',
    texto: 'A Rota de hoje mostra as paradas na ordem do relógio. Rota no Maps abre o caminho com todas as que faltam.',
    icone: 'map-marker-path',
  },
  {
    id: 'roteiro.rua.a-caminho',
    numero: 8,
    evento: 'primeiro_a_caminho',
    local: 'hoje',
    titulo: 'Cliente avisado',
    texto: 'O aviso sai do seu WhatsApp, com a mensagem pronta. Você confere antes de mandar e não precisa ligar o GPS.',
    icone: 'whatsapp',
  },
  {
    id: 'roteiro.os.primeira',
    numero: 9,
    evento: 'primeira_os_aberta',
    local: 'os',
    titulo: 'Foto sem sinal',
    texto: 'Pode tirar foto sem internet. Cada foto mostra se está só no aparelho ou se já foi enviada.',
    icone: 'camera-outline',
  },
  {
    id: 'roteiro.os.primeira-concluida',
    numero: 10,
    evento: 'primeira_os_concluida',
    local: 'os',
    titulo: 'Serviço concluído',
    texto: 'Próximo passo: quando o dinheiro cair, registre o pagamento e mande o recibo pelo WhatsApp.',
    icone: 'clipboard-check-outline',
  },
  {
    id: 'roteiro.recibo.primeiro',
    numero: 11,
    evento: 'primeiro_recibo',
    local: 'recibo',
    titulo: 'Primeiro recibo',
    texto: 'Só marque como pago quando o dinheiro aparecer no banco: comprovante pode ser falso. Com o link de avaliações em Meu Negócio, dá para pedir a avaliação no Google daqui.',
    icone: 'receipt',
  },
  {
    id: 'roteiro.inicio.orcamento-parado',
    numero: 12,
    evento: 'primeiro_orcamento_parado',
    local: 'inicio',
    titulo: 'Proposta esfriando',
    texto: 'Tem orçamento sem resposta há dias. O quadro de dinheiro parado mostra quem lembrar, com a mensagem pronta.',
    icone: 'timer-sand',
  },
  {
    id: 'roteiro.inicio.primeira-cobranca',
    numero: 13,
    evento: 'primeira_cobranca_atrasada',
    local: 'inicio',
    titulo: 'Pagamento pendente',
    texto: 'Toque em Cobrar: a mensagem sai educada e, com a sua chave Pix válida, já leva o Pix com o valor.',
    icone: 'cash-clock',
  },
  {
    id: 'roteiro.clientes.para-lembrar',
    numero: 14,
    evento: 'primeiro_cliente_para_lembrar',
    local: 'inicio',
    titulo: 'Hora de lembrar',
    texto: 'A OLLI avisa quando chega a hora do próximo serviço de um cliente. Você decide se manda a mensagem.',
    icone: 'account-clock-outline',
  },
  {
    id: 'roteiro.equipamento.primeiro-qr',
    numero: 15,
    evento: 'primeiro_qr',
    local: 'equipamento',
    titulo: 'Etiqueta pronta',
    texto: 'Cole a etiqueta no aparelho. Quem escanear vê a última manutenção e pode pedir orçamento a você, sem login.',
    icone: 'qrcode',
  },
  {
    id: 'roteiro.equipe.primeiro-convite',
    numero: 16,
    evento: 'primeiro_convite_equipe',
    local: 'equipe',
    titulo: 'Convite criado',
    texto: 'Quem entra como Técnico vê as ordens de serviço dele e a própria agenda, sem relatórios nem os números da equipe. Se alguém sair, você desativa por aqui.',
    icone: 'account-plus-outline',
  },
  {
    id: 'roteiro.clientes.primeira-importacao',
    numero: 17,
    evento: 'primeira_importacao',
    local: 'clientes',
    titulo: 'Seus dados chegaram',
    texto: 'Confira o que veio do app antigo: clientes aqui, serviços e produtos no catálogo. O que faltar, você completa no cadastro.',
    icone: 'database-import-outline',
  },
  {
    id: 'roteiro.conta.30-dias',
    numero: 18,
    evento: 'uso_30_dias',
    local: 'conta',
    titulo: 'Seus dados são seus',
    texto: 'Já são 30 dias de OLLI. Deixe o backup automático diário ligado: uma cópia por dia fica guardada na nuvem.',
    icone: 'shield-check-outline',
  },
];

/** Estado do roteiro neste aparelho (o `vistas` vem do conjunto do `DicaContextual`). */
export interface EstadoRoteiro {
  /** Evento → data (AAAA-MM-DD) da PRIMEIRA vez que aconteceu. */
  eventos: Partial<Record<EventoDica, string>>;
  /** Dica → data em que foi apresentada pela primeira vez. */
  apresentadas: Record<string, string>;
  /** Data (AAAA-MM-DD) do primeiro uso registrado, para a dica dos 30 dias. */
  primeiroUso: string | null;
}

export function estadoInicial(): EstadoRoteiro {
  return { eventos: {}, apresentadas: {}, primeiroUso: null };
}

/** Data local AAAA-MM-DD (o "dia" do limite de 1 dica nova por dia). */
export function diaLocal(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** Registra o evento (só a primeira ocorrência conta). Devolve o MESMO objeto se nada mudou. */
export function registrarEvento(estado: EstadoRoteiro, evento: EventoDica, hoje: string): EstadoRoteiro {
  if (estado.eventos[evento]) return estado;
  return { ...estado, eventos: { ...estado.eventos, [evento]: hoje } };
}

/** Marca o primeiro uso (idempotente). */
export function registrarPrimeiroUso(estado: EstadoRoteiro, hoje: string): EstadoRoteiro {
  if (estado.primeiroUso) return estado;
  return { ...estado, primeiroUso: hoje };
}

/** Dias inteiros entre duas datas AAAA-MM-DD (b − a). Data inválida → 0. */
export function diasEntre(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86_400_000);
}

/** 30 dias desde o primeiro uso registrado (sem registro: ainda não). */
export function completouTrintaDias(estado: EstadoRoteiro, hoje: string): boolean {
  return !!estado.primeiroUso && diasEntre(estado.primeiroUso, hoje) >= 30;
}

/** Houve uma dica NOVA apresentada hoje? (o limite é 1 por dia). */
export function jaApresentouNovaHoje(estado: EstadoRoteiro, hoje: string): boolean {
  return Object.values(estado.apresentadas).some((d) => d === hoje);
}

export interface EntradaEscolha {
  estado: EstadoRoteiro;
  local: LocalDica;
  hoje: string;
  /** Ids já dispensados ("Entendi"), do conjunto compartilhado com o `DicaContextual`. */
  vistas: ReadonlySet<string>;
  /** Interruptor "Mostrar dicas contextuais" (Conta). Desligado = nada. */
  ajudaAtiva: boolean;
  /**
   * Só as dicas destes eventos cabem AGORA (ex.: o detalhe de um orçamento
   * aprovado não mostra "agora é com o cliente"). Ausente = todas do lugar.
   */
  contexto?: readonly EventoDica[];
}

export interface Escolha {
  dica: DicaDoRoteiro;
  /** `true` quando é a dica nova do dia: quem chama grava a apresentação. */
  nova: boolean;
}

/**
 * Qual dica (no máximo uma) aparece agora neste lugar.
 *  1. Ajuda desligada → nenhuma.
 *  2. Candidatas: deste lugar, com o evento já acontecido e ainda não dispensadas.
 *  3. Uma candidata JÁ apresentada (num dia anterior ou hoje) volta sem custo.
 *  4. Senão, a primeira candidata (ordem do roteiro) entra como NOVA — só se
 *     nenhuma dica nova foi apresentada hoje.
 */
export function escolherDica({ estado, local, hoje, vistas, ajudaAtiva, contexto }: EntradaEscolha): Escolha | null {
  if (!ajudaAtiva) return null;
  const candidatas = ROTEIRO_DICAS
    .filter((d) => d.local === local && !!estado.eventos[d.evento] && !vistas.has(d.id))
    .filter((d) => !contexto || contexto.includes(d.evento))
    .sort((a, b) => a.numero - b.numero);
  if (candidatas.length === 0) return null;
  const jaApresentada = candidatas.find((d) => !!estado.apresentadas[d.id]);
  if (jaApresentada) return { dica: jaApresentada, nova: false };
  if (jaApresentouNovaHoje(estado, hoje)) return null;
  return { dica: candidatas[0], nova: true };
}

/** Grava que a dica foi apresentada hoje (idempotente: mantém a primeira data). */
export function marcarApresentada(estado: EstadoRoteiro, id: string, hoje: string): EstadoRoteiro {
  if (estado.apresentadas[id]) return estado;
  return { ...estado, apresentadas: { ...estado.apresentadas, [id]: hoje } };
}

/** Lê um JSON salvo sem confiar nele: campo estranho vira estado limpo, nunca exceção. */
export function estadoDeJson(raw: string | null | undefined): EstadoRoteiro {
  if (!raw) return estadoInicial();
  try {
    const obj = JSON.parse(raw) as Partial<EstadoRoteiro> | null;
    if (!obj || typeof obj !== 'object') return estadoInicial();
    const validos = new Set<string>(ROTEIRO_DICAS.map((d) => d.evento));
    const eventos: Partial<Record<EventoDica, string>> = {};
    for (const [k, v] of Object.entries(obj.eventos ?? {})) {
      if (validos.has(k) && typeof v === 'string') eventos[k as EventoDica] = v;
    }
    const apresentadas: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.apresentadas ?? {})) {
      if (typeof v === 'string') apresentadas[k] = v;
    }
    const primeiroUso = typeof obj.primeiroUso === 'string' ? obj.primeiroUso : null;
    return { eventos, apresentadas, primeiroUso };
  } catch {
    return estadoInicial();
  }
}

/**
 * O evento que o STATUS de um orçamento representa (só o mais avançado: um
 * orçamento aprovado não é "acabou de ser enviado"). Rascunho, recusado,
 * expirado e cancelado não destravam dica.
 */
export function eventoDoStatusOrcamento(status: string | null | undefined): EventoDica | null {
  switch (status) {
    case 'enviado':
      return 'primeiro_envio';
    case 'visualizado':
    case 'em_negociacao':
    case 'aguardando_assinatura':
      return 'cliente_abriu_link';
    case 'aprovado':
    case 'convertido':
      return 'primeira_aprovacao';
    default:
      return null;
  }
}

/** Uma dica pelo id (para o painel de "Rever dicas" e para os testes). */
export function dicaPorId(id: string): DicaDoRoteiro | undefined {
  return ROTEIRO_DICAS.find((d) => d.id === id);
}
