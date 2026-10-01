/**
 * NÚMERO DE WHATSAPP BRASILEIRO — a regra ÚNICA do OLLI (app, painel e worker).
 *
 * TypeScript PURO, sem import nenhum: o app (`exportarDocumento.ts`), o painel
 * (`webapp/.../financeiro.ts` e o shim web) e o worker (`worker/src/telefoneWhatsapp.js`,
 * que reexporta este arquivo) usam ESTA função. Antes havia quatro cópias com regras
 * diferentes, e a pior delas (`numero.startsWith('55') ? numero : '55' + numero`)
 * mandava a mensagem para o número ERRADO de quem tem DDD 55 (RS): "55 99876-5432"
 * começa com 55, então saía sem o código do país e o WhatsApp abria uma conversa
 * com um desconhecido (ou com ninguém).
 *
 * Regra (pela quantidade de dígitos, não pelo prefixo):
 *  - 12 ou 13 dígitos começando em 55 → já veio com o país: mantém;
 *  - 10 ou 11 dígitos (DDD + fixo/celular) → recebe o 55 na frente;
 *  - "0" na frente (discagem nacional "0 11 ...", ou "0 21 11 ..." com operadora) é tirado;
 *  - DDD com zero ou celular de 11 dígitos sem o 9 → não é número brasileiro: `null`;
 *  - qualquer outra coisa (vazio, curto, longo demais) → `null`.
 *
 * `null` é obrigatório no lugar de "o melhor palpite": um link com número torto abre
 * conversa com um DESCONHECIDO. Sem número válido, quem chama abre o WhatsApp no
 * seletor de contato (`wa.me/?text=`) — o prestador escolhe a pessoa, a mensagem vai
 * pronta.
 */

/** DDD brasileiro plausível: dois dígitos de 1 a 9 (não existe DDD com zero). */
function dddValido(ddd: string): boolean {
  return /^[1-9]{2}$/.test(ddd);
}

/** Número nacional (DDD + assinante) com cara de telefone brasileiro. */
function nacionalValido(nacional: string): boolean {
  if (!dddValido(nacional.slice(0, 2))) return false;
  const assinante = nacional.slice(2);
  if (assinante.length === 9) return assinante.startsWith('9'); // celular: sempre 9 na frente
  if (assinante.length === 8) return assinante[0] !== '0' && assinante[0] !== '1';
  return false;
}

/**
 * Telefone em qualquer formato → dígitos do wa.me (55 + DDD + número), ou `null`
 * quando não dá para um telefone brasileiro plausível. Nunca lança.
 */
export function numeroWhatsAppBR(telefone: unknown): string | null {
  let d = String(telefone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) {
    d = d.replace(/^0+/, '');
    // "0 + operadora (2 dígitos) + DDD + número" (ex.: 0 21 11 98765-4321). O "00 55"
    // internacional já começa em 55 depois de tirar os zeros e não entra aqui.
    if ((d.length === 12 || d.length === 13) && !d.startsWith('55')) d = d.slice(2);
  }
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    return nacionalValido(d.slice(2)) ? d : null;
  }
  if (d.length === 10 || d.length === 11) {
    return nacionalValido(d) ? `55${d}` : null;
  }
  return null;
}

/**
 * Link `wa.me` pronto. Com número válido abre a conversa daquela pessoa; sem número
 * (ou número que não é brasileiro), abre o WhatsApp no SELETOR DE CONTATO com a
 * mensagem já escrita — nunca `wa.me/55` (número inválido) nem um chute.
 */
export function linkWaMe(telefone: unknown, mensagem: string): string {
  const numero = numeroWhatsAppBR(telefone);
  const texto = encodeURIComponent(mensagem ?? '');
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}

/**
 * Link `api.whatsapp.com/send` — o que o Android abre direto no app (é o destino do
 * App Link do WhatsApp e do WhatsApp Business), sem depender de `canOpenURL`, que no
 * Android 11+ devolve `false` para `whatsapp://` quando o pacote não está declarado
 * no `<queries>` do manifesto. Sem número válido, cai no `wa.me/?text=` (seletor).
 */
export function linkApiWhatsApp(telefone: unknown, mensagem: string): string {
  const numero = numeroWhatsAppBR(telefone);
  if (!numero) return linkWaMe(null, mensagem);
  return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensagem ?? '')}`;
}
