/** Prova de que replay do mesmo pagamento 12x não estende a vigência. */
// @ts-expect-error worker é JS puro, executado pelo Node com type stripping.
import { isoMesesAposEpoch } from '../worker/src/stripe.js';

let falhas = 0;
let passes = 0;
function checar(nome: string, real: unknown, esperado: unknown): void {
  if (JSON.stringify(real) === JSON.stringify(esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${JSON.stringify(esperado)}\n        recebido: ${JSON.stringify(real)}`);
  }
}

console.log('\nStripe 12x — vigência determinística por evento');
const evento = Date.UTC(2026, 0, 31, 14, 30, 0) / 1000;
const primeira = isoMesesAposEpoch(evento, 12);
const replayDiasDepois = isoMesesAposEpoch(evento, 12);
checar('mesmo evento, mesmo resultado em qualquer tentativa', replayDiasDepois, primeira);
checar('31/jan + 12 meses preserva o dia', primeira, '2027-01-31T14:30:00.000Z');

const bissexto = Date.UTC(2024, 1, 29, 8, 0, 0) / 1000;
checar('29/fev + 12 meses grampeia em 28/fev',
  isoMesesAposEpoch(bissexto, 12), '2025-02-28T08:00:00.000Z');
checar('epoch ausente falha fechado', isoMesesAposEpoch(Number.NaN, 12), null);
checar('prazo absurdo falha fechado', isoMesesAposEpoch(evento, 121), null);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
