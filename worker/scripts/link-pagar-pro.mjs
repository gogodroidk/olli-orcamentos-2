/**
 * Gera o LINK DE PAGAMENTO DO PRO de uma conta (CQ-LINK-PAGAR-PRO).
 *
 *   LINK_PAGAMENTO_SECRET=<segredo> node worker/scripts/link-pagar-pro.mjs <user_id> [--anual]
 *
 * Opcional: LINK_PAGAMENTO_BASE (padrão https://diagnostico.olliorcamentos.online; em staging, a URL
 * workers.dev do olli-diagnostico-staging). O segredo tem de ser O MESMO posto no worker daquele ambiente.
 *
 * Imprime só o endereço e a data em que ele vence. Nunca imprime o segredo. Não consulta banco nem
 * envia nada: quem manda o link para o cliente é a pessoa da equipe.
 * O link vale 14 dias e só permite PAGAR o Pro mensal (preço da tela Planos) por aquela conta.
 */
import { assinarLinkPro, LINK_PRO_VALIDADE_S, segredoLinkPro } from '../src/linkProToken.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uid = String(process.argv[2] || '').trim().toLowerCase();
if (!UUID_RE.test(uid)) {
  console.error('uso: LINK_PAGAMENTO_SECRET=... node worker/scripts/link-pagar-pro.mjs <user_id (uuid)>');
  process.exit(2);
}
const segredo = segredoLinkPro(process.env.LINK_PAGAMENTO_SECRET);
if (!segredo) {
  console.error('LINK_PAGAMENTO_SECRET ausente ou curto (mínimo 32 caracteres). Peça ao CTO; não cole o segredo em chat.');
  process.exit(2);
}
let base;
try {
  base = new URL(process.env.LINK_PAGAMENTO_BASE || 'https://diagnostico.olliorcamentos.online');
} catch {
  base = null;
}
if (!base || base.protocol !== 'https:' || base.username || base.password) {
  console.error('LINK_PAGAMENTO_BASE inválida (precisa ser https).');
  process.exit(2);
}

const agoraS = Math.floor(Date.now() / 1000);
const periodo = process.argv.includes('--anual') ? 'anual' : 'mensal';
const token = await assinarLinkPro(segredo, { uid, periodo, agoraS });
console.log(`Pro ${periodo}`);
const vence = new Date((agoraS + LINK_PRO_VALIDADE_S) * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
console.log(`${base.origin}/pagar/pro/${token}`);
console.log(`vence em ${vence} (horário de Brasília)`);
