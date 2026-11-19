/**
 * Grava no CADASTRO do cliente o telefone que o prestador acabou de puxar dos contatos
 * (D-2245), para o próximo orçamento já sair com número. Nunca sobrescreve: se o cliente
 * já tem telefone, não mexe. Nunca lança — devolve o que aconteceu (3 estados + erro).
 */
import { getClientes, saveCliente } from '../database/database';
import { nowISO } from '../utils/date';

export type GravacaoTelefoneCliente = 'gravado' | 'ja_tinha' | 'sem_cliente' | 'erro';

export async function gravarTelefoneNoCliente(clienteId: string | undefined, telefone: string): Promise<GravacaoTelefoneCliente> {
  if (!clienteId || !telefone.trim()) return 'sem_cliente';
  try {
    const atual = (await getClientes()).find((c) => c.id === clienteId);
    if (!atual) return 'sem_cliente';
    if ((atual.telefone ?? '').trim()) return 'ja_tinha';
    await saveCliente({ ...atual, telefone, atualizadoEm: nowISO() });
    return 'gravado';
  } catch {
    return 'erro';
  }
}
