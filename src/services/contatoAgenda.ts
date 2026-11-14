/**
 * Seletor NATIVO de contato (I-0045): o usuário toca em "Escolher da agenda", o
 * sistema abre a lista de contatos DELE e devolve UM contato.
 *
 * PRIVACIDADE / PLAY (ver docs/contato-agenda-politica-play.md):
 *  - só o seletor do sistema (`Contact.presentPicker`): o app NUNCA lista nem varre
 *    a agenda, e NÃO declara READ_CONTACTS/WRITE_CONTACTS (bloqueadas no app.json);
 *  - lê só nome, telefone e e-mail do contato escolhido; nada é enviado a servidor
 *    por aqui — só vai à nuvem o que o usuário SALVAR no cadastro do cliente.
 */
import { Platform } from 'react-native';
import { contatoParaCadastro, type ContatoEscolhido } from '../utils/contatoAgenda';

export type ResultadoContatoAgenda =
  | { tipo: 'ok'; contato: ContatoEscolhido }
  | { tipo: 'cancelado' }
  /** Contato escolhido sem nome ou sem telefone brasileiro: o usuário completa à mão. */
  | { tipo: 'sem_dados'; contato: ContatoEscolhido | null }
  /** O sistema não deixou o app ler o contato escolhido (permissão negada/indisponível). */
  | { tipo: 'negado' }
  | { tipo: 'indisponivel' }
  | { tipo: 'erro' };

function erroDePermissao(e: unknown): boolean {
  const txt = `${(e as { code?: string })?.code ?? ''} ${(e as { message?: string })?.message ?? ''}`.toLowerCase();
  return /permission|permiss|denied|negad|security|not authorized/.test(txt);
}

export function seletorDeContatoDisponivel(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export async function escolherContatoDaAgenda(): Promise<ResultadoContatoAgenda> {
  if (!seletorDeContatoDisponivel()) return { tipo: 'indisponivel' };
  try {
    // Import dinâmico: o módulo nativo só carrega quando o usuário toca no botão.
    const { Contact, ContactField } = await import('expo-contacts');
    const escolhido = await Contact.presentPicker();
    if (!escolhido) return { tipo: 'cancelado' };
    const det = await escolhido.getDetails([ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS]);
    const contato = contatoParaCadastro(det);
    if (!contato || !contato.telefone) return { tipo: 'sem_dados', contato };
    return { tipo: 'ok', contato };
  } catch (e) {
    return { tipo: erroDePermissao(e) ? 'negado' : 'erro' };
  }
}
