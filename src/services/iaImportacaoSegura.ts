export type TipoItemImportacao = 'servico' | 'produto';
export type PapelImportacaoIa = 'pessoal' | 'owner' | 'admin' | 'gestor' | 'tecnico';
export type EstadoImportacaoIa = 'aguardando_confirmacao' | 'confirmada' | 'cancelada';

export type FontePesquisaIa = {
  nome: string;
  url: string;
  consultadaEm: string;
};

export type ItemImportacaoIa = {
  id: string;
  tipo: TipoItemImportacao;
  nome: string;
  descricao?: string;
  unidade: string;
  precoSugerido: number;
  cidadeUf?: string;
  fontes: readonly FontePesquisaIa[];
  confianca: number;
};

export type PreviaImportacaoIa = {
  id: string;
  tenantId: string;
  atorId: string;
  pedidoOriginal: string;
  estado: EstadoImportacaoIa;
  itens: readonly ItemImportacaoIa[];
  criadaEm: string;
  fingerprint: string;
};

export type ContextoImportacaoIa = {
  atorId: string;
  tenantId: string;
  papel: PapelImportacaoIa;
  confirmacaoId: string;
};

export type PlanoImportacaoIa = {
  previaId: string;
  tenantId: string;
  atorId: string;
  itens: readonly ItemImportacaoIa[];
  requiresReview: true;
};

const MAX_ITENS = 50;
const MAX_TEXTO = 500;
const PAPEIS_CATALOGOS = new Set<PapelImportacaoIa>(['pessoal', 'owner']);

function texto(value: unknown, max = MAX_TEXTO): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalizado = value.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return normalizado && normalizado.length <= max ? normalizado : undefined;
}

function urlHttps(value: unknown): string | undefined {
  const v = texto(value, 2048);
  if (!v) return undefined;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function dataValida(value: unknown, agora: string): string | undefined {
  const v = texto(value, 40);
  if (!v) return undefined;
  const data = new Date(v);
  const limite = new Date(agora);
  if (Number.isNaN(data.getTime()) || Number.isNaN(limite.getTime()) || data.getTime() > limite.getTime()) return undefined;
  return data.toISOString();
}

function itemNormalizado(raw: Partial<ItemImportacaoIa>, agora: string): ItemImportacaoIa {
  const id = texto(raw.id, 120);
  const nome = texto(raw.nome, 160);
  const unidade = texto(raw.unidade, 30);
  const tipo = raw.tipo;
  const preco = raw.precoSugerido;
  const cidadeUf = raw.cidadeUf === undefined ? undefined : texto(raw.cidadeUf, 80);
  if (!id || !nome || !unidade || (tipo !== 'servico' && tipo !== 'produto')) throw new Error('item_invalido');
  if (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0 || preco > 100_000_000) throw new Error('preco_invalido');
  if (!Array.isArray(raw.fontes) || raw.fontes.length < 1 || raw.fontes.length > 5) throw new Error('fonte_obrigatoria');
  const fontes = raw.fontes.map((fonte) => {
    const nomeFonte = texto(fonte?.nome, 160);
    const url = urlHttps(fonte?.url);
    const consultadaEm = dataValida(fonte?.consultadaEm, agora);
    if (!nomeFonte || !url || !consultadaEm) throw new Error('fonte_invalida');
    return Object.freeze({ nome: nomeFonte, url, consultadaEm });
  });
  if (typeof raw.confianca !== 'number' || !Number.isFinite(raw.confianca) || raw.confianca < 0 || raw.confianca > 1) {
    throw new Error('confianca_invalida');
  }
  return Object.freeze({
    id,
    tipo,
    nome,
    descricao: raw.descricao === undefined ? undefined : texto(raw.descricao),
    unidade,
    precoSugerido: Math.round(preco * 100) / 100,
    cidadeUf,
    fontes: Object.freeze(fontes),
    confianca: Math.round(raw.confianca * 1000) / 1000,
  });
}

/**
 * Cria somente uma prévia. Nenhum banco, catálogo ou API é tocado aqui.
 * A origem da pesquisa é obrigatória para impedir que um palpite do modelo vire
 * preço publicado sem contexto.
 */
export function criarPreviaImportacaoIa(input: {
  id: string;
  tenantId: string;
  atorId: string;
  pedidoOriginal: string;
  itens: readonly Partial<ItemImportacaoIa>[];
  agora?: string;
}): PreviaImportacaoIa {
  const id = texto(input.id, 160);
  const tenantId = texto(input.tenantId, 160);
  const atorId = texto(input.atorId, 160);
  const pedidoOriginal = texto(input.pedidoOriginal, 2000);
  const agora = input.agora ?? new Date().toISOString();
  if (!id || !tenantId || !atorId || !pedidoOriginal) throw new Error('contexto_obrigatorio');
  if (!Array.isArray(input.itens) || input.itens.length < 1 || input.itens.length > MAX_ITENS) throw new Error('limite_itens');
  const itens = input.itens.map((item) => itemNormalizado(item, agora));
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const item of itens) {
    if (ids.has(item.id)) throw new Error('item_duplicado');
    const nome = item.nome.toLocaleLowerCase('pt-BR');
    if (nomes.has(nome)) throw new Error('nome_duplicado');
    ids.add(item.id);
    nomes.add(nome);
  }
  const fingerprint = JSON.stringify({ tenantId, atorId, pedidoOriginal, itens });
  return Object.freeze({
    id,
    tenantId,
    atorId,
    pedidoOriginal,
    estado: 'aguardando_confirmacao',
    itens: Object.freeze(itens),
    criadaEm: new Date(agora).toISOString(),
    fingerprint,
  });
}

/** Só dono/conta pessoal pode publicar itens de catálogo; o adapter ainda precisa
 * mostrar o diff e executar uma operação allowlisted por item. */
export function confirmarImportacaoIa(
  previa: PreviaImportacaoIa,
  contexto: ContextoImportacaoIa,
): { autorizado: true; plano: PlanoImportacaoIa } | { autorizado: false; motivo: string } {
  if (previa.estado !== 'aguardando_confirmacao') return { autorizado: false, motivo: 'previa_ja_decidida' };
  if (!PAPEIS_CATALOGOS.has(contexto.papel)) return { autorizado: false, motivo: 'papel_sem_permissao' };
  if (contexto.confirmacaoId !== previa.id) return { autorizado: false, motivo: 'confirmacao_divergente' };
  if (contexto.atorId !== previa.atorId || contexto.tenantId !== previa.tenantId) return { autorizado: false, motivo: 'tenant_ou_ator_divergente' };
  return {
    autorizado: true,
    plano: Object.freeze({ previaId: previa.id, tenantId: previa.tenantId, atorId: previa.atorId, itens: previa.itens, requiresReview: true }),
  };
}

export function decidirImportacaoIa(previa: PreviaImportacaoIa, decisao: 'confirmar' | 'cancelar'): PreviaImportacaoIa {
  if (previa.estado !== 'aguardando_confirmacao') throw new Error('previa_ja_decidida');
  return Object.freeze({ ...previa, estado: decisao === 'confirmar' ? 'confirmada' : 'cancelada' });
}
