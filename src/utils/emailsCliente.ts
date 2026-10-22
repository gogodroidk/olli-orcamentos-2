/**
 * E-mails do cliente (principal + secundário). Fonte única da regra: tela, banco
 * local, sync e envio passam por aqui.
 *
 * Vazio = "não informado" (undefined). Texto que não parece e-mail NÃO é gravado
 * como válido: a tela mostra o erro, nunca descarta em silêncio.
 */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE = 254;

/** Trim + minúsculas. Vazio/ausente → undefined. */
export function normalizarEmail(bruto?: string | null): string | undefined {
  const t = (bruto ?? '').trim().toLowerCase();
  return t ? t : undefined;
}

export function emailValido(bruto?: string | null): boolean {
  const t = normalizarEmail(bruto);
  return !!t && t.length <= LIMITE && EMAIL_VALIDO.test(t);
}

export type ErroEmailsCliente = { campo: 'email' | 'email2'; mensagem: string };

/** Campo vazio é válido (opcional); preenchido precisa ser e-mail. Segundo ≠ primeiro. */
export function validarEmailsCliente(email?: string | null, email2?: string | null): ErroEmailsCliente | null {
  const a = normalizarEmail(email);
  const b = normalizarEmail(email2);
  if (a && !emailValido(a)) return { campo: 'email', mensagem: 'E-mail inválido. Confira o endereço.' };
  if (b && !emailValido(b)) return { campo: 'email2', mensagem: 'Segundo e-mail inválido. Confira o endereço.' };
  if (b && !a) return { campo: 'email', mensagem: 'Preencha o e-mail principal antes do segundo.' };
  if (a && b && a === b) return { campo: 'email2', mensagem: 'O segundo e-mail é igual ao principal.' };
  return null;
}

/** Destinatários de envio: só os válidos, sem repetir, principal primeiro. */
export function destinatariosEmail(c: { email?: string | null; email2?: string | null }): string[] {
  const out: string[] = [];
  for (const bruto of [c.email, c.email2]) {
    const e = normalizarEmail(bruto);
    if (e && emailValido(e) && !out.includes(e)) out.push(e);
  }
  return out;
}
