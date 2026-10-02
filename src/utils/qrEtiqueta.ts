/**
 * qrEtiqueta.ts — leitura do conteúdo do QR colado no equipamento.
 *
 * Módulo PURO (sem React Native) para o scanner e o teste de linha de comando
 * usarem a MESMA regra. Morava dentro de EscanearQrScreen (que importa
 * expo-camera), o que impedia testar a regra fora do app.
 */

/** Base pública do link do QR — o worker resolve GET /q/<token> (página do cliente). */
export const BASE_ETIQUETA = 'https://link.olliorcamentos.online/q/';

/**
 * URL pública da etiqueta (vazia enquanto o token ainda não foi gerado/sincronizado).
 * Continua em /q/ de propósito: é o endereço já impresso nas etiquetas coladas em
 * campo; /e/<token> é só um apelido da mesma página no worker.
 */
export function urlEtiqueta(qrToken: string): string {
  return qrToken ? `${BASE_ETIQUETA}${encodeURIComponent(qrToken)}` : '';
}

/**
 * Extrai o token opaco do conteúdo do QR: só a etiqueta do OLLI ou um token cru.
 *
 * Casa as duas portas públicas do worker — `/q/<token>` (a que as etiquetas
 * impressas usam) e `/e/<token>` (apelido da mesma página) — e SÓ no nosso
 * domínio: um QR de outro site com caminho /q/ ou /e/ não casa.
 */
export function extrairTokenQr(data: string): string | null {
  const cru = (data ?? '').trim();
  if (!cru) return null;
  // Regex (sem depender do URL do Hermes, que é parcial) em vez de new URL().
  const m = cru.match(/^https?:\/\/(?:[a-z0-9-]+\.)*olliorcamentos\.(?:online|app)\/[qe]\/([^/?#\s]+)/i);
  if (m) {
    let token = m[1];
    try { token = decodeURIComponent(m[1]); } catch { /* mantém cru */ }
    return /^[A-Za-z0-9_-]{8,}$/.test(token) ? token : null;
  }
  // Não-URL: aceita um token cru (sem barras/esquema, tamanho plausível). Uma URL
  // alheia tem ':' e '/', então falha aqui também.
  if (/^[A-Za-z0-9_-]{8,}$/.test(cru)) return cru;
  return null;
}

/**
 * Telefone já normalizado (55 + DDD + número, ver numeroWhatsAppBR) em formato de
 * leitura humana para o adesivo: "(11) 98765-4321". Outra coisa → ''.
 */
export function telefoneLegivel(numero55: string | null | undefined): string {
  const d = String(numero55 ?? '').replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : '';
}
