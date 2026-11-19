/**
 * "Puxar dos contatos" (D-2245): o prestador tem um orçamento SEM telefone, toca, o seletor
 * NATIVO do celular abre, ele escolhe UM contato e só o TELEFONE volta (formatado, BR, com DDD).
 * Usado pelo passo do cliente (Step1Cliente) e pelo envio por WhatsApp (VisualizarOrcamentoScreen).
 *
 * Reaproveita `escolherContatoDaAgenda` (#358) — sem listar nem varrer a agenda aqui.
 * 3 estados: `ok` (telefone) | `cancelado` (nada a dizer) | `erro` (mensagem que diz o que fazer) — ver utils/telefonePuxado.ts.
 */
import { escolherContatoDaAgenda } from './contatoAgenda';
import { telefonePuxadoDe, type PuxarTelefone } from '../utils/telefonePuxado';

export type { PuxarTelefone } from '../utils/telefonePuxado';

export async function puxarTelefoneDosContatos(): Promise<PuxarTelefone> {
  return telefonePuxadoDe(await escolherContatoDaAgenda());
}
