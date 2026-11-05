/**
 * Estúdio de marca vendido à parte (D-1438 G25).
 *
 * Nem todo prestador tem logo, identidade ou arte de camiseta. O fluxo anota o
 * pedido. Não cobra, não gera arquivo e não mostra preço: o valor novo só entra
 * quando o Igor publicar. Até lá, `precoIdentidadePublicado` fica falso e
 * `tentarCobrar` recusa.
 *
 * O que se vende, quando o preço existir, é desenho (arquivo). Não é camiseta
 * pronta, não é frete e não é registro de marca.
 */

export const PECAS_IDENTIDADE = [
  {
    id: 'logo',
    nome: 'Logo',
    entrega: 'Arquivo da logo para o orçamento, o WhatsApp e outros materiais seus.',
    limite: 'Não registra a marca e não entra no plano.',
  },
  {
    id: 'identidade',
    nome: 'Identidade visual',
    entrega: 'Logo, cores e um guia curto de como usar a marca nos seus documentos.',
    limite: 'Não entra no plano Pro nem no plano Empresa.',
  },
  {
    id: 'camiseta',
    nome: 'Arte da camiseta',
    entrega: 'Desenho para você mandar na gráfica.',
    limite: 'Não é camiseta pronta. Não inclui costura, tecido nem frete.',
  },
] as const;

export type PecaId = (typeof PECAS_IDENTIDADE)[number]['id'];

export const BRIEFING_MIN = 20;
export const BRIEFING_MAX = 800;

/** Chave da cópia no navegador. A do celular mora em storageKeys. */
export const CHAVE_SESSAO_WEB = 'olli.identidadeUpsell.sessao';

export const FRASES_REVISAO = [
  'Nada é cobrado nesta tela.',
  'O valor deste serviço ainda não está publicado. Sem preço combinado, o desenho não começa e não há cobrança.',
  'Não há pagamento aqui.',
  'Este pedido não gera a logo, a identidade nem o arquivo. A prévia com marca d\'água, só depois do pagamento, ainda não sai daqui.',
  'Não escreva CPF, CNPJ nem dado de cliente ou de outra pessoa.',
] as const;

export type AvisoEquipe = 'pendente' | 'enviado' | 'nao_enviado';

export interface PedidoIdentidade {
  id: string;
  pecas: PecaId[];
  briefing: string;
  criadoEm: string;
  avisoEquipe: AvisoEquipe;
}

export type ResultadoMontagem =
  | { ok: true; pedido: PedidoIdentidade }
  | { ok: false; motivo: string };

const AVISOS = new Set<AvisoEquipe>(['pendente', 'enviado', 'nao_enviado']);

/** Porta única do preço. Fica fechada até o Igor publicar o valor. */
export function precoIdentidadePublicado(): false {
  return false;
}

export function tentarCobrar(): { ok: false; motivo: 'preco_nao_publicado' } {
  return { ok: false, motivo: 'preco_nao_publicado' };
}

export function textoOferta(temLogo: boolean): { titulo: string; corpo: string } {
  return {
    titulo: 'Identidade visual à parte',
    corpo: temLogo
      ? 'Sua logo já está no cadastro. A identidade visual completa e a arte da camiseta são um serviço extra, fora do plano. Quem ainda não tem logo também pede a logo por aqui.'
      : 'Nem todo prestador tem logo, camiseta ou identidade. A OLLI desenha isso à parte, fora do plano. O cadastro não trava se você seguir sem logo.',
  };
}

export function ordenarPecas(ids: readonly string[]): PecaId[] {
  const escolhidos = new Set(ids);
  return PECAS_IDENTIDADE.map((peca) => peca.id).filter((id) => escolhidos.has(id));
}

export function nomeDaPeca(id: PecaId): string {
  return PECAS_IDENTIDADE.find((peca) => peca.id === id)?.nome ?? id;
}

function contemDocumento(texto: string): string | null {
  if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(texto)) return 'Não coloque CPF neste pedido.';
  if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(texto)) return 'Não coloque CNPJ neste pedido.';
  const soDigitos = texto.replace(/\D/g, '');
  const semNumero = texto.replace(/[\d\s.\-/]/g, '');
  if (semNumero.length === 0 && (soDigitos.length === 11 || soDigitos.length === 14)) {
    return 'Não coloque CPF nem CNPJ neste pedido.';
  }
  return null;
}

export function montarPedido(
  entrada: { pecas: readonly string[]; briefing: string },
  ctx: { id: string; agoraIso: string },
): ResultadoMontagem {
  const id = ctx.id.trim();
  if (!id || id.length > 80 || /[\r\n]/.test(id)) {
    return { ok: false, motivo: 'Não consegui abrir o pedido. Tente de novo.' };
  }
  const criado = new Date(ctx.agoraIso);
  if (Number.isNaN(criado.getTime()) || ctx.agoraIso.trim().length > 40) {
    return { ok: false, motivo: 'Não consegui marcar a data do pedido. Tente de novo.' };
  }
  const pecas = ordenarPecas(entrada.pecas);
  if (pecas.length === 0) return { ok: false, motivo: 'Escolha ao menos uma peça.' };
  const briefing = entrada.briefing.replace(/\s+/g, ' ').trim();
  if (briefing.length < BRIEFING_MIN) {
    return { ok: false, motivo: 'Conte o ofício e o que a marca precisa passar. Mínimo de 20 caracteres.' };
  }
  if (briefing.length > BRIEFING_MAX) {
    return { ok: false, motivo: 'Encurte o texto para 800 caracteres.' };
  }
  const documento = contemDocumento(briefing);
  if (documento) return { ok: false, motivo: documento };
  return {
    ok: true,
    pedido: {
      id,
      pecas,
      briefing,
      criadoEm: criado.toISOString(),
      avisoEquipe: 'pendente',
    },
  };
}

export function serializarPedido(pedido: PedidoIdentidade): string {
  return JSON.stringify({
    id: pedido.id,
    pecas: pedido.pecas,
    briefing: pedido.briefing,
    criadoEm: pedido.criadoEm,
    avisoEquipe: pedido.avisoEquipe,
  });
}

export function lerPedido(raw: string | null | undefined): PedidoIdentidade | null {
  if (!raw) return null;
  try {
    const objeto = JSON.parse(raw) as Record<string, unknown>;
    if (!objeto || typeof objeto !== 'object') return null;
    const pecas = Array.isArray(objeto.pecas)
      ? ordenarPecas(objeto.pecas.filter((item): item is string => typeof item === 'string'))
      : [];
    const briefing = typeof objeto.briefing === 'string' ? objeto.briefing : '';
    const id = typeof objeto.id === 'string' ? objeto.id : '';
    const criadoEm = typeof objeto.criadoEm === 'string' ? objeto.criadoEm : '';
    const aviso = objeto.avisoEquipe;
    if (!id || !criadoEm || pecas.length === 0 || briefing.length < 1 || briefing.length > BRIEFING_MAX) return null;
    if (typeof aviso !== 'string' || !AVISOS.has(aviso as AvisoEquipe)) return null;
    if (Number.isNaN(new Date(criadoEm).getTime())) return null;
    return { id, pecas, briefing, criadoEm, avisoEquipe: aviso as AvisoEquipe };
  } catch {
    return null;
  }
}

export function mensagemPedido(pedido: PedidoIdentidade): string {
  const nomes = pedido.pecas.map((id) => nomeDaPeca(id)).join(', ');
  return [
    'Pedido de identidade visual à parte. Sem cobrança e sem preço publicado.',
    `Peças: ${nomes}.`,
    'Briefing:',
    pedido.briefing.trim(),
  ].join('\n').slice(0, 4000);
}

export function rotuloQuando(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function textoResultado(
  aviso: 'ok' | 'sem_sessao' | 'erro',
  gravou: boolean,
  onde: 'aparelho' | 'navegador',
): string {
  const lugar = onde === 'aparelho' ? 'neste aparelho' : 'neste navegador';
  if (aviso === 'ok' && gravou) {
    return `Pedido anotado. Entrou na caixa da equipe e ficou a cópia ${lugar}. Nada foi cobrado. Ainda não há arquivo.`;
  }
  if (aviso === 'ok') {
    return `O pedido entrou na caixa da equipe. ${onde === 'aparelho' ? 'Este aparelho' : 'Este navegador'} não guardou a cópia. Nada foi cobrado. Ainda não há arquivo.`;
  }
  if (aviso === 'sem_sessao' && gravou) {
    return `A cópia ficou ${lugar}. A equipe não recebeu porque a conta não está aberta. Nada foi cobrado.`;
  }
  if (gravou) {
    return `A cópia ficou ${lugar}. A equipe não recebeu agora. Nada foi cobrado. Você pode tentar de novo.`;
  }
  return 'Não consegui guardar nem avisar a equipe. Nada foi cobrado. Tente de novo.';
}
