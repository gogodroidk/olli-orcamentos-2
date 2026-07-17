/**
 * Teste do rate limit fail-closed + teto de payload (DoD do item O2-18):
 * "Rotas sensíveis negam quando o limiter falha."
 *
 *     node scripts/teste-rate-limit.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita o módulo REAL do worker (worker/src/rateLimit.js).
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import {
  cabeNoTeto,
  checarLimite,
  deixaPassar,
  rateOkSensivel,
  TETO,
  textoCabeNoTeto,
  // @ts-expect-error
} from '../worker/src/rateLimit.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

const rlOk = { limit: async () => ({ success: true }) };
const rlEstourado = { limit: async () => ({ success: false }) };
const rlQuebrado = { limit: async () => { throw new Error('limiter fora'); } };
const rlEstranho = { limit: async () => ({}) }; // resposta que não entendemos

console.log('\n1) checarLimite — 3 estados, nunca 2');
checar('limiter diz sim => permitido', await checarLimite(rlOk, 'k'), 'permitido');
checar('limiter diz não => negado', await checarLimite(rlEstourado, 'k'), 'negado');
checar('limiter lançou => indisponivel (NÃO "permitido")', await checarLimite(rlQuebrado, 'k'), 'indisponivel');
checar('binding ausente => indisponivel', await checarLimite(null, 'k'), 'indisponivel');
checar('binding sem .limit => indisponivel', await checarLimite({} as any, 'k'), 'indisponivel');
checar('resposta sem success => indisponivel', await checarLimite(rlEstranho, 'k'), 'indisponivel');
checar('sem chave => indisponivel (não finge que limitou)', await checarLimite(rlOk, ''), 'indisponivel');

console.log('\n2) O DoD: rota sensível NEGA quando o limiter falha');
checar('sensível + indisponivel => NEGA', deixaPassar('indisponivel', { sensivel: true }), false);
checar('sensível + negado => nega', deixaPassar('negado', { sensivel: true }), false);
checar('sensível + permitido => passa', deixaPassar('permitido', { sensivel: true }), true);

console.log('\n3) rota comum: derrubar leitura por causa do limiter seria pior');
checar('comum + indisponivel => passa', deixaPassar('indisponivel', { sensivel: false }), true);
checar('comum + negado => nega (limiter FALOU não)', deixaPassar('negado', { sensivel: false }), false);

console.log('\n4) rateOkSensivel — o que as 5 rotas de dinheiro chamam');
checar('limiter ok => true', await rateOkSensivel({}, rlOk, 'k'), true);
checar('limiter estourado => false', await rateOkSensivel({}, rlEstourado, 'k'), false);
checar('limiter quebrado => FALSE (era `true` antes: fail-open)', await rateOkSensivel({}, rlQuebrado, 'k'), false);
checar('binding sumiu => FALSE (o incidente real de produção)', await rateOkSensivel({}, null, 'k'), false);

console.log('\n5) teto de payload, em BYTES');
const req = (len: string | null) =>
  ({ headers: { get: (h: string) => (h === 'content-length' ? len : null) } }) as any;
checar('dentro do teto => ok', cabeNoTeto(req('1000'), TETO.WEBHOOK).ok, true);
checar('acima do teto => rejeita ANTES de ler o corpo', cabeNoTeto(req('999999'), TETO.WEBHOOK).ok, false);
checar('content-length lixo => rejeita', cabeNoTeto(req('abc'), TETO.WEBHOOK).ok, false);
checar('sem content-length => segue (confere depois de ler)', cabeNoTeto(req(null), TETO.WEBHOOK).ok, true);
checar('texto pequeno passa', textoCabeNoTeto('oi', TETO.WEBHOOK), true);
checar('texto acima do teto é pego (quem mentiu no header)', textoCabeNoTeto('x'.repeat(TETO.WEBHOOK + 1), TETO.WEBHOOK), false);
// "ção" = 3 caracteres, 5 bytes em UTF-8. Medir em .length deixaria passar ~2x o teto.
checar('mede BYTES e não caracteres (acentos)', textoCabeNoTeto('ção'.repeat(2), 5), false);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
