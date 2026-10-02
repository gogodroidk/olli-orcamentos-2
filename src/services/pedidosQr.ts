/**
 * PEDIDOS DE ORÇAMENTO PELA ETIQUETA QR — o lead que a etiqueta gera.
 *
 * Quem escaneia o QR colado no equipamento (síndico, zelador, o próprio cliente)
 * cai na página pública /q/<token> e pode tocar em "Pedir orçamento". O worker
 * grava o pedido em `public.pedidos_orcamento_qr` (service_role); aqui o app do
 * prestador LÊ (RLS: dono + equipe) e marca como atendido. O primeiro contato
 * continua humano: o app mostra o pedido e abre o WhatsApp com a mensagem pronta.
 *
 * Só na nuvem (não há espelho no SQLite): é uma caixa de entrada, não cadastro.
 *
 * TRÊS ESTADOS, sempre (erro nunca vira vazio):
 *  - `ok` com a lista (pode ser vazia de verdade);
 *  - `indisponivel` — sem sessão/cliente, ou o servidor ainda sem a migration
 *    20261002153217 (a tela diz "ainda não disponível", nunca "nenhum pedido");
 *  - `erro` — a leitura falhou (rede, RLS…): a tela diz que não conseguiu ler.
 */
import { supabase } from './supabase';
import { rowParaPedido } from '../utils/pedidoQr';

export { mensagemRespostaPedidoQr, linkResponderPedidoQr } from '../utils/pedidoQr';
import type { PedidoOrcamentoQr } from '../types';

export type LeituraPedidosQr =
  | { estado: 'ok'; pedidos: PedidoOrcamentoQr[] }
  | { estado: 'indisponivel' }
  | { estado: 'erro' };

const COLUNAS = 'id,asset_id,nome,telefone,mensagem,criado_em,atendido_em';

/** Tabela/coluna inexistente no servidor = migration ainda não aplicada. */
function semMigration(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Pedidos recentes (mais novos primeiro). `equipamentoId` restringe à ficha de um
 * equipamento; `soNovos` traz só os ainda não atendidos.
 */
export async function listarPedidosQr(
  opcoes: { equipamentoId?: string; soNovos?: boolean; limite?: number } = {},
): Promise<LeituraPedidosQr> {
  if (!supabase) return { estado: 'indisponivel' };
  try {
    let q = supabase
      .from('pedidos_orcamento_qr')
      .select(COLUNAS)
      .order('criado_em', { ascending: false })
      .limit(Math.max(1, Math.min(100, opcoes.limite ?? 30)));
    if (opcoes.equipamentoId) q = q.eq('asset_id', opcoes.equipamentoId);
    if (opcoes.soNovos) q = q.is('atendido_em', null);
    const { data, error } = await q;
    if (error) return semMigration(error) ? { estado: 'indisponivel' } : { estado: 'erro' };
    if (!Array.isArray(data)) return { estado: 'erro' };
    const pedidos = (data as Record<string, unknown>[])
      .map(rowParaPedido)
      .filter((p): p is PedidoOrcamentoQr => p !== null);
    return { estado: 'ok', pedidos };
  } catch {
    return { estado: 'erro' };
  }
}

/** Marca o pedido como atendido (só a coluna `atendido_em` é gravável). Lança em falha. */
export async function marcarPedidoQrAtendido(id: string): Promise<string> {
  if (!supabase) throw new Error('Sem conexão com a nuvem agora. Tente de novo em instantes.');
  const agora = new Date().toISOString();
  // `.select('id')`: um UPDATE barrado pela RLS não dá erro, só afeta 0 linhas —
  // sem conferir, a tela diria "atendido" sem nada ter mudado na nuvem.
  const { data, error } = await supabase
    .from('pedidos_orcamento_qr')
    .update({ atendido_em: agora })
    .eq('id', id)
    .select('id');
  if (error || !Array.isArray(data) || data.length === 0) {
    throw new Error('Não consegui marcar o pedido como atendido. Tente de novo.');
  }
  return agora;
}
