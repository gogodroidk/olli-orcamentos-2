/**
 * Número de WhatsApp brasileiro no worker — a MESMA regra do app e do painel.
 *
 * Não é cópia: reexporta `src/utils/telefoneWhatsapp.ts` (TypeScript puro, sem
 * import nenhum), do mesmo jeito que `link.js` já usa `src/utils/pixBrCode.ts`. Uma
 * regra só = a página do cliente (`/o/<token>`) e a etiqueta do PMOC abrem o
 * WhatsApp no mesmo número que o celular do prestador abriria. O teste
 * `scripts/teste-numero-whatsapp.ts` cobre DDD 55, "0 + DDD", "+55", fixo e vazio.
 */
export { linkApiWhatsApp, linkWaMe, numeroWhatsAppBR } from '../../src/utils/telefoneWhatsapp.ts';
