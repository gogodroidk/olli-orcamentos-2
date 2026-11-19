/**
 * Traduz o resultado do seletor de UM contato em ok | cancelado | erro (D-2245) — função PURA
 * (só tipos do seletor), por isso o teste roda em Node sem módulo nativo.
 */
import type { ResultadoContatoAgenda } from '../services/contatoAgenda.ts';

export type PuxarTelefone =
  | { estado: 'ok'; nome: string; telefone: string }
  | { estado: 'cancelado' }
  | { estado: 'erro'; mensagem: string };

/** Traduz o resultado do seletor — separado para o teste cobrir cada ramo sem módulo nativo. */
export function telefonePuxadoDe(r: ResultadoContatoAgenda): PuxarTelefone {
  switch (r.tipo) {
    case 'ok':
      return { estado: 'ok', nome: r.contato.nome, telefone: r.contato.telefone };
    case 'cancelado':
      return { estado: 'cancelado' };
    case 'sem_dados':
      return {
        estado: 'erro',
        mensagem: `${r.contato?.nome || 'Esse contato'} não tem um telefone com DDD que o WhatsApp aceite. Escolha outro contato.`,
      };
    case 'negado':
      return { estado: 'erro', mensagem: 'O celular não liberou a leitura desse contato. Digite o número no cadastro do cliente.' };
    case 'indisponivel':
      return { estado: 'erro', mensagem: 'Os contatos só abrem no app do celular. Digite o número no cadastro do cliente.' };
    default:
      return { estado: 'erro', mensagem: 'Não consegui abrir seus contatos agora. Nada foi alterado.' };
  }
}
