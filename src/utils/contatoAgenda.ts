/**
 * CONTATO DA AGENDA EM 1 TOQUE (I-0045) — regras puras, sem dependência nativa.
 *
 * O seletor do sistema devolve UM contato escolhido pelo usuário. Daqui sai só
 * o que o cadastro de cliente usa: NOME, TELEFONE e E-MAIL (opcional). Nenhum
 * outro dado do contato (endereço, aniversário, foto, notas…) é lido nem guardado.
 */
import { maskPhone } from './masks.ts';

/** Formato mínimo do que o seletor devolve (subconjunto de `getDetails` do expo-contacts). */
export interface DetalhesContatoAgenda {
  fullName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  phones?: ReadonlyArray<{ number?: string | null }> | null;
  emails?: ReadonlyArray<{ address?: string | null }> | null;
}

export interface ContatoEscolhido {
  nome: string;
  /** Já com máscara `(11) 99999-9999`; vazio quando o contato não tem telefone aproveitável. */
  telefone: string;
  /** Vazio quando o contato não tem e-mail válido. */
  email: string;
}

/** E-mail "razoável": algo@dominio.tld, sem espaço. Não tenta ser RFC completa. */
export function isValidEmail(valor: string | undefined | null): boolean {
  const v = (valor ?? '').trim();
  if (v.length === 0 || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/**
 * Telefone do contato → só DDD + número (10 ou 11 dígitos), com máscara.
 * Tira o +55/0055 e o 0 de operadora; recusa o que não cabe num número brasileiro
 * (internacional, curto demais) devolvendo '' — melhor o prestador digitar do que
 * gravar um número que o WhatsApp não abre.
 */
export function telefoneDoContato(bruto: string | undefined | null): string {
  const texto = (bruto ?? '').trim();
  // `+` com outro país (ex.: +1 415…) tem 11 dígitos e se passaria por celular BR: recusa antes.
  if (texto.startsWith('+') && !/^\+\s*55/.test(texto)) return '';
  let d = texto.replace(/\D/g, '');
  if (d.startsWith('0055')) d = d.slice(4);
  else if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length !== 10 && d.length !== 11) return '';
  return maskPhone(d);
}

function nomeDoContato(det: DetalhesContatoAgenda): string {
  const cheio = (det.fullName ?? '').trim();
  if (cheio) return cheio;
  return [det.givenName, det.familyName].map(p => (p ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * Normaliza o contato escolhido. Devolve null se não há nome (nada a preencher).
 * Pega o PRIMEIRO telefone brasileiro aproveitável e o PRIMEIRO e-mail válido.
 */
export function contatoParaCadastro(det: DetalhesContatoAgenda | null | undefined): ContatoEscolhido | null {
  if (!det) return null;
  const nome = nomeDoContato(det);
  if (!nome) return null;
  let telefone = '';
  for (const p of det.phones ?? []) {
    telefone = telefoneDoContato(p?.number);
    if (telefone) break;
  }
  const email = (det.emails ?? []).map(e => (e?.address ?? '').trim()).find(isValidEmail) ?? '';
  return { nome, telefone, email };
}
