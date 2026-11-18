/**
 * Enfileira (ou ensaia) o aviso aos Grátis da mudança do plano (D-2267).
 *
 *   ENSAIO (padrão, não grava nada):
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/aviso-gratis.mjs
 *   ENVIO REAL (só enfileira; quem envia é o consumer da outbox), em lote pequeno:
 *     ... node scripts/aviso-gratis.mjs --enviar [--lote 20]
 *
 * O texto vem da fonte (planosBase.ts: avisoMudancaGratis) no momento do envio. Só rode o envio DEPOIS de o app e o
 * painel estarem publicados, e com ordem. Imprime só contagens (nunca e-mail, nome ou id).
 */
import { AVISO_GRATIS_LOTE_PADRAO, executarAvisoGratis } from '../src/avisoGratis.js';

const args = process.argv.slice(2);
const enviar = args.includes('--enviar');
const iLote = args.indexOf('--lote');
const lote = iLote >= 0 ? Number(args[iLote + 1]) : AVISO_GRATIS_LOTE_PADRAO;
try {
  const r = await executarAvisoGratis(process.env, { enviar, lote });
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error(JSON.stringify({ erro: e.codigo || e.message }));
  process.exit(1);
}
