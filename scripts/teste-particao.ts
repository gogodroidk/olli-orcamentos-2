/**
 * Teste da partição do banco por usuário (DoD do item O0-2 da FILA):
 * "Teste A → logout → B: 'sair e manter dados' não mistura tenants."
 *
 *     node scripts/teste-particao.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * Exercita as funções REAIS de src/database/particao.ts (puras de propósito).
 */
import {
  DB_LEGADO,
  donoDoBanco,
  type MapaParticoes,
  nomeParticao,
  podeSincronizar,
  resolverParticao,
} from '../src/database/particao.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

console.log('\n1) adoção: quem já usa o app NÃO perde nada ao atualizar');
const r1 = resolverParticao(A, {});
checar('A (1º login pós-update) adota o banco legado', r1.db, DB_LEGADO);
checar('e o adota de fato (sem copiar arquivo)', r1.adotou, true);

console.log('\n2) idempotência: reabrir o app não troca a partição de ninguém');
checar('A resolve de novo => MESMO arquivo', resolverParticao(A, r1.mapa).db, DB_LEGADO);
checar('e não "adota" outra vez', resolverParticao(A, r1.mapa).adotou, false);

console.log('\n3) O CENÁRIO DO DoD: A sai "mantendo dados" → B entra no mesmo aparelho');
const r2 = resolverParticao(B, r1.mapa);
checar('B NÃO recebe o banco do A', r2.db !== DB_LEGADO, true);
checar('B ganha arquivo próprio', r2.db, nomeParticao(B));
checar('B não adota nada', r2.adotou, false);
checar('o banco do A continua sendo do A (promessa de "manter dados")', r2.mapa[A], DB_LEGADO);
checar('A e B em arquivos DIFERENTES => não misturam', r2.mapa[A] !== r2.mapa[B], true);

console.log('\n4) A volta: os dados dele continuam lá');
checar('A reloga => banco original', resolverParticao(A, r2.mapa).db, DB_LEGADO);

console.log('\n5) trava de sync — o vazamento A→B só acontece se sincronizar o banco errado');
const mapa: MapaParticoes = r2.mapa;
checar('B logado com o banco do A aberto => "de-outro"', donoDoBanco(B, DB_LEGADO, mapa), 'de-outro');
checar('e NÃO pode sincronizar (senão empurra dados de A p/ tenant de B)',
  podeSincronizar(donoDoBanco(B, DB_LEGADO, mapa)), false);
checar('B com o banco DELE => "meu"', donoDoBanco(B, nomeParticao(B), mapa), 'meu');
checar('e pode sincronizar', podeSincronizar(donoDoBanco(B, nomeParticao(B), mapa)), true);

console.log('\n6) 3 estados: não saber NÃO pode virar "é meu"');
checar('sem usuário => indeterminado', donoDoBanco(null, DB_LEGADO, mapa), 'indeterminado');
checar('sem banco aberto => indeterminado', donoDoBanco(A, null, mapa), 'indeterminado');
checar('usuário sem partição resolvida => indeterminado', donoDoBanco('desconhecido-999', DB_LEGADO, mapa), 'indeterminado');
checar('indeterminado NÃO sincroniza (fail-closed)', podeSincronizar('indeterminado'), false);

console.log('\n7) nome de arquivo nunca sai de entrada crua');
checar('sanitiza caminho/injeção', nomeParticao('../../etc/passwd; DROP'), 'olli_u_etcpasswddrop.db');
checar('UUID normal vira nome estável', nomeParticao(A), `olli_u_${A}.db`);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
