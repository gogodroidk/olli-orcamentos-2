/**
 * O que a página pública do convite mostra (D1438-G23).
 * Espelha src/services/conviteGoogle.ts — o teste compara os dois.
 * Convite com e-mail: botão do Google no painel, sem abrir o app sozinho.
 * Convite sem e-mail: o link do app continua como hoje.
 */

const PAINEL_LOGIN = 'https://app.olliorcamentos.online/auth/login';
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function tokenConviteValido(bruto) {
  const s = String(bruto ?? '').trim();
  return TOKEN_RE.test(s) ? s : '';
}

export function normalizarEmailConvite(bruto) {
  const s = String(bruto ?? '').trim().toLowerCase().slice(0, 160);
  return EMAIL_RE.test(s) ? s : '';
}

export function mascararEmailConvite(bruto) {
  const email = normalizarEmailConvite(bruto);
  if (!email) return '';
  const separador = email.indexOf('@');
  const local = email.slice(0, separador);
  const dominio = email.slice(separador + 1);
  return `${local.slice(0, 1)}•••@${dominio}`;
}

export function urlPainelLoginConvite(tokenBruto) {
  const token = tokenConviteValido(tokenBruto);
  if (!token) return '';
  return `${PAINEL_LOGIN}?convite=${encodeURIComponent(token)}`;
}

export function decidirPaginaConvite(email, token) {
  const normalizado = normalizarEmailConvite(email);
  const urlGoogle = normalizado ? urlPainelLoginConvite(token) : '';
  return {
    emailMascarado: mascararEmailConvite(normalizado),
    urlGoogle,
    abrirAppSozinho: urlGoogle === '',
  };
}
