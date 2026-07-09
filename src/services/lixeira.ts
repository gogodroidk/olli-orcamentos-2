/**
 * LIXEIRA (Frente 1) — camada de serviço unificada sobre o soft-delete.
 *
 * O EXCLUIR do usuário virou SOFT DELETE em database.ts (seta `excluidoEm`, mantém a
 * linha). Este módulo junta as 10 entidades numa lista única para a LixeiraScreen,
 * e concentra as ações da lixeira: RESTAURAR, EXCLUIR DEFINITIVAMENTE (hard delete
 * real + tombstone), ESVAZIAR e o EXPURGO (hard delete do que passou de 30 dias).
 *
 * Local-first: tudo opera no SQLite (as funções de database.ts já espelham na nuvem).
 * Nada aqui lança para a UI sem tratamento — a tela decide o feedback.
 */
import {
  // clientes
  getLixeiraClientes, restaurarCliente, excluirClienteDefinitivo,
  // servicos
  getLixeiraServicos, restaurarServico, excluirServicoDefinitivo,
  // produtos
  getLixeiraProdutos, restaurarProduto, excluirProdutoDefinitivo,
  // orcamentos
  getLixeiraOrcamentos, restaurarOrcamento, excluirOrcamentoDefinitivo,
  // recibos
  getLixeiraRecibos, restaurarRecibo, excluirReciboDefinitivo,
  // modelos
  getLixeiraModelos, restaurarModelo, excluirModeloDefinitivo,
  // depoimentos
  getLixeiraDepoimentos, restaurarDepoimento, excluirDepoimentoDefinitivo,
  // agendamentos
  getLixeiraAgendamentos, restaurarAgendamento, excluirAgendamentoDefinitivo,
  // ordens de servico
  getLixeiraOrdensServico, restaurarOrdemServico, excluirOrdemServicoDefinitivo,
  // equipamentos
  getLixeiraEquipamentos, restaurarEquipamento, excluirEquipamentoDefinitivo,
} from '../database/database';
import { formatCurrency } from '../utils/currency';

/** Dias que um item fica na lixeira antes do expurgo (hard delete automático). */
export const DIAS_RETENCAO_LIXEIRA = 30;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** As 10 famílias de item que a lixeira reúne. */
export type TipoLixeira =
  | 'cliente'
  | 'servico'
  | 'produto'
  | 'orcamento'
  | 'recibo'
  | 'modelo'
  | 'depoimento'
  | 'agendamento'
  | 'ordem_servico'
  | 'equipamento';

/** Metadados de apresentação por tipo (rótulo no singular/plural + ícone MCI). */
export const TIPO_LIXEIRA_META: Record<
  TipoLixeira,
  { singular: string; plural: string; icone: string }
> = {
  cliente: { singular: 'Cliente', plural: 'Clientes', icone: 'account-outline' },
  servico: { singular: 'Serviço', plural: 'Serviços', icone: 'hammer-screwdriver' },
  produto: { singular: 'Produto', plural: 'Produtos', icone: 'package-variant-closed' },
  orcamento: { singular: 'Orçamento', plural: 'Orçamentos', icone: 'file-document-outline' },
  recibo: { singular: 'Recibo', plural: 'Recibos', icone: 'receipt' },
  modelo: { singular: 'Modelo', plural: 'Modelos', icone: 'file-star-outline' },
  depoimento: { singular: 'Depoimento', plural: 'Depoimentos', icone: 'star-outline' },
  agendamento: { singular: 'Agendamento', plural: 'Agendamentos', icone: 'calendar-blank-outline' },
  ordem_servico: { singular: 'Ordem de serviço', plural: 'Ordens de serviço', icone: 'clipboard-check-outline' },
  equipamento: { singular: 'Equipamento', plural: 'Equipamentos', icone: 'air-conditioner' },
};

/** Um item genérico na lixeira, pronto para a UI (agnóstico de entidade). */
export interface ItemLixeira {
  tipo: TipoLixeira;
  id: string;
  titulo: string;
  subtitulo?: string;
  /** ISO do momento em que foi excluído (soft delete). */
  excluidoEm: string;
}

/** Data-hora ISO em ms, tolerante a valor ausente/ inválido (→ NaN vira 0/agora). */
function ms(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Dias que FALTAM até o expurgo de um item (com base em `excluidoEm`). 0 = já
 * venceu (será expurgado no próximo purgarLixeiraAntiga). Sempre >= 0.
 */
export function diasRestantes(excluidoEm: string, dias: number = DIAS_RETENCAO_LIXEIRA): number {
  const decorridoMs = Date.now() - ms(excluidoEm);
  const restanteDias = dias - Math.floor(decorridoMs / UM_DIA_MS);
  return restanteDias > 0 ? restanteDias : 0;
}

/**
 * Lista UNIFICADA da lixeira (todas as entidades), do excluído mais recente ao mais
 * antigo. Cada entidade é lida em paralelo e normalizada para ItemLixeira. Uma falha
 * numa família não derruba as demais (Promise.allSettled + fallback [] por tipo).
 */
export async function getItensNaLixeira(): Promise<ItemLixeira[]> {
  const [
    clientes, servicos, produtos, orcamentos, recibos,
    modelos, depoimentos, agendamentos, ordens, equipamentos,
  ] = await Promise.all([
    getLixeiraClientes().catch(() => []),
    getLixeiraServicos().catch(() => []),
    getLixeiraProdutos().catch(() => []),
    getLixeiraOrcamentos().catch(() => []),
    getLixeiraRecibos().catch(() => []),
    getLixeiraModelos().catch(() => []),
    getLixeiraDepoimentos().catch(() => []),
    getLixeiraAgendamentos().catch(() => []),
    getLixeiraOrdensServico().catch(() => []),
    getLixeiraEquipamentos().catch(() => []),
  ]);

  const itens: ItemLixeira[] = [];

  for (const c of clientes) {
    itens.push({
      tipo: 'cliente', id: c.id, titulo: c.nome,
      subtitulo: c.telefone || c.cidade || undefined,
      excluidoEm: c.excluidoEm ?? '',
    });
  }
  for (const s of servicos) {
    itens.push({
      tipo: 'servico', id: s.id, titulo: s.nome,
      subtitulo: formatCurrency(s.preco),
      excluidoEm: s.excluidoEm ?? '',
    });
  }
  for (const p of produtos) {
    const marcaModelo = [p.marca, p.modelo].filter(Boolean).join(' ');
    itens.push({
      tipo: 'produto', id: p.id, titulo: p.nome,
      subtitulo: marcaModelo || formatCurrency(p.preco),
      excluidoEm: p.excluidoEm ?? '',
    });
  }
  for (const o of orcamentos) {
    itens.push({
      tipo: 'orcamento', id: o.id, titulo: `Nº ${o.numero} · ${o.clienteNome}`,
      subtitulo: formatCurrency(o.valorTotal),
      excluidoEm: o.excluidoEm ?? '',
    });
  }
  for (const r of recibos) {
    itens.push({
      tipo: 'recibo', id: r.id, titulo: `Recibo Nº ${r.numero}`,
      subtitulo: r.clienteNome || undefined,
      excluidoEm: r.excluidoEm ?? '',
    });
  }
  for (const m of modelos) {
    itens.push({
      tipo: 'modelo', id: m.id, titulo: m.nome,
      subtitulo: m.descricao || undefined,
      excluidoEm: m.excluidoEm ?? '',
    });
  }
  for (const d of depoimentos) {
    itens.push({
      tipo: 'depoimento', id: d.id, titulo: d.nomeCliente,
      subtitulo: `${d.estrelas} estrela${d.estrelas === 1 ? '' : 's'}`,
      excluidoEm: d.excluidoEm ?? '',
    });
  }
  for (const a of agendamentos) {
    itens.push({
      tipo: 'agendamento', id: a.id, titulo: a.titulo,
      subtitulo: a.clienteNome || undefined,
      excluidoEm: a.excluidoEm ?? '',
    });
  }
  for (const os of ordens) {
    itens.push({
      tipo: 'ordem_servico', id: os.id,
      titulo: os.numero ? `OS Nº ${os.numero}` : (os.titulo || 'Ordem de serviço'),
      subtitulo: os.clienteNome || os.titulo || undefined,
      excluidoEm: os.excluidoEm ?? '',
    });
  }
  for (const e of equipamentos) {
    const nome = [e.fabricante, e.modelo].filter(Boolean).join(' ') || e.codigoInterno || 'Equipamento';
    itens.push({
      tipo: 'equipamento', id: e.id, titulo: nome,
      subtitulo: e.localizacao || e.categoria || undefined,
      excluidoEm: e.excluidoEm ?? '',
    });
  }

  // Mais recentemente excluído primeiro.
  itens.sort((a, b) => ms(b.excluidoEm) - ms(a.excluidoEm));
  return itens;
}

// ─── Despacho por tipo ───────────────────────────────────────────────────────
const RESTAURAR: Record<TipoLixeira, (id: string) => Promise<void>> = {
  cliente: restaurarCliente,
  servico: restaurarServico,
  produto: restaurarProduto,
  orcamento: restaurarOrcamento,
  recibo: restaurarRecibo,
  modelo: restaurarModelo,
  depoimento: restaurarDepoimento,
  agendamento: restaurarAgendamento,
  ordem_servico: restaurarOrdemServico,
  equipamento: restaurarEquipamento,
};

const EXCLUIR_DEFINITIVO: Record<TipoLixeira, (id: string) => Promise<void>> = {
  cliente: excluirClienteDefinitivo,
  servico: excluirServicoDefinitivo,
  produto: excluirProdutoDefinitivo,
  orcamento: excluirOrcamentoDefinitivo,
  recibo: excluirReciboDefinitivo,
  modelo: excluirModeloDefinitivo,
  depoimento: excluirDepoimentoDefinitivo,
  agendamento: excluirAgendamentoDefinitivo,
  ordem_servico: excluirOrdemServicoDefinitivo,
  equipamento: excluirEquipamentoDefinitivo,
};

/** RESTAURAR um item da lixeira (volta a ativo). */
export function restaurarItem(tipo: TipoLixeira, id: string): Promise<void> {
  return RESTAURAR[tipo](id);
}

/** EXCLUIR DEFINITIVAMENTE um item (hard delete + tombstone). Irreversível. */
export function excluirDefinitivo(tipo: TipoLixeira, id: string): Promise<void> {
  return EXCLUIR_DEFINITIVO[tipo](id);
}

/**
 * ESVAZIAR a lixeira: exclui DEFINITIVAMENTE todos os itens soft-deletados. Cada
 * item é tratado isoladamente (uma falha não impede os demais). Retorna quantos
 * foram efetivamente removidos.
 */
export async function esvaziarLixeira(): Promise<number> {
  const itens = await getItensNaLixeira();
  let removidos = 0;
  for (const item of itens) {
    try {
      await excluirDefinitivo(item.tipo, item.id);
      removidos += 1;
    } catch {
      // pula item problemático, segue o resto
    }
  }
  return removidos;
}

/**
 * EXPURGO: hard-deleta os itens que estão na lixeira há mais de `dias` (padrão 30).
 * Idempotente e best-effort — o INTEGRADOR chama no boot/sync. Retorna quantos foram
 * expurgados. Um item recém-excluído (dentro da janela) é preservado.
 */
export async function purgarLixeiraAntiga(dias: number = DIAS_RETENCAO_LIXEIRA): Promise<number> {
  const itens = await getItensNaLixeira();
  const corteMs = Date.now() - dias * UM_DIA_MS;
  let expurgados = 0;
  for (const item of itens) {
    // Sem excluidoEm confiável → não expurga (segurança: nunca apaga por engano).
    const em = ms(item.excluidoEm);
    if (!em || em > corteMs) continue;
    try {
      await excluirDefinitivo(item.tipo, item.id);
      expurgados += 1;
    } catch {
      // pula item problemático, segue o resto
    }
  }
  return expurgados;
}
