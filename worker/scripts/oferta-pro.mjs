/**
 * Enfileira (ou ensaia) a oferta do plano Pro para uma lista explícita de contas.
 *
 *   ENSAIO (padrão, não grava nada):
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/oferta-pro.mjs <ofertas.json>
 *   ENVIO REAL (só enfileira; quem envia é o consumer da outbox):
 *     ... node scripts/oferta-pro.mjs <ofertas.json> --enviar
 *   MODELO (padrão: oferta_pro, com botão "Ver o plano Pro"):
 *     ... node scripts/oferta-pro.mjs <ofertas.json> --modelo conversa    (D-2233: sem botão de plano, G1/G2)
 *
 * <ofertas.json> (fora do repositório!): [{ "userId": "<uuid>", "assunto": "...", "paragrafos": ["...", "..."] }]
 * Imprime só contagens e user_id por motivo (nunca e-mail ou texto).
 */
import { readFileSync } from 'node:fs';
import { executarOfertaPro } from '../src/ofertaPro.js';

const args = process.argv.slice(2);
const enviar = args.includes('--enviar');
const iModelo = args.indexOf('--modelo');
const modelo = iModelo >= 0 ? args[iModelo + 1] : 'oferta_pro';
const arquivo = args.find((a, i) => !a.startsWith('--') && i !== iModelo + 1);
if (!arquivo) {
  console.error('uso: node scripts/oferta-pro.mjs <ofertas.json> [--enviar] [--modelo oferta_pro|conversa]');
  process.exit(2);
}
try {
  const ofertas = JSON.parse(readFileSync(arquivo, 'utf8'));
  const r = await executarOfertaPro(process.env, ofertas, { enviar, modelo });
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error(JSON.stringify({ erro: e.codigo || e.message }));
  process.exit(1);
}
