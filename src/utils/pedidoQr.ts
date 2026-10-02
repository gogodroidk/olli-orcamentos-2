/**
 * pedidoQr.ts — regras PURAS do pedido de orçamento vindo da etiqueta QR
 * (sem Supabase/React Native: testadas em scripts/teste-qr-equipamento.ts).
 */
import { linkWaMe } from './telefoneWhatsapp.ts';
import type { PedidoOrcamentoQr } from '../types';

/** Linha da nuvem (public.pedidos_orcamento_qr) → objeto do app; null se torta. */
export function rowParaPedido(r: Record<string, unknown>): PedidoOrcamentoQr | null {
  if (typeof r.id !== 'string' || typeof r.asset_id !== 'string') return null;
  return {
    id: r.id,
    equipamentoId: r.asset_id,
    nome: typeof r.nome === 'string' ? r.nome : '',
    telefone: typeof r.telefone === 'string' ? r.telefone : '',
    mensagem: typeof r.mensagem === 'string' && r.mensagem ? r.mensagem : undefined,
    criadoEm: typeof r.criado_em === 'string' ? r.criado_em : '',
    atendidoEm: typeof r.atendido_em === 'string' && r.atendido_em ? r.atendido_em : undefined,
    ...(r.motivo === 'garantia' ? { motivo: 'garantia' as const } : {}),
  };
}

/** Mensagem pronta (editável no WhatsApp) para o prestador responder o pedido. */
export function mensagemRespostaPedidoQr(pedido: PedidoOrcamentoQr, nomeEquipamento: string, nomeEmpresa?: string): string {
  const primeiroNome = pedido.nome.trim().split(/\s+/)[0] || '';
  const quem = nomeEmpresa ? ` Aqui é da ${nomeEmpresa}.` : '';
  if (pedido.motivo === 'garantia') {
    return `Olá${primeiroNome ? `, ${primeiroNome}` : ''}!${quem} Recebemos seu chamado de garantia pela etiqueta do equipamento ${nomeEquipamento}. Vamos combinar a visita por aqui?`;
  }
  return `Olá${primeiroNome ? `, ${primeiroNome}` : ''}!${quem} Recebemos seu pedido de orçamento pela etiqueta do equipamento ${nomeEquipamento}. Podemos combinar os detalhes por aqui?`;
}

/** Link wa.me da resposta (o app usa abrirWhatsApp; o link serve ao painel/teste). */
export function linkResponderPedidoQr(pedido: PedidoOrcamentoQr, nomeEquipamento: string, nomeEmpresa?: string): string {
  return linkWaMe(pedido.telefone, mensagemRespostaPedidoQr(pedido, nomeEquipamento, nomeEmpresa));
}
