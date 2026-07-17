/**
 * Teste do entitlement D-07 — "sem marca OLLI no documento" (P15 do plano).
 *
 *     node scripts/teste-marca-olli.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A marca no PDF é o motor de conversão do grátis: é ela que dá um MOTIVO para
 * pagar. Só funciona se as duas pontas forem verdade —
 *   - o grátis LEVA a marca (senão não há motivo para assinar);
 *   - quem paga NÃO leva, em NENHUM documento (senão o benefício é mentira).
 * O bug que este teste tranca: o entitlement era honrado só no orçamento, e o
 * cliente pagante continuava mandando recibo com a marca de outra empresa.
 */
import { RECURSOS_POR_PLANO, RECURSO_REMOVE_MARCA, temAcessoRecurso } from '../src/services/entitlements.ts';

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

console.log('\n1) a economia do freemium: o grátis LEVA a marca, quem paga não');
checar('grátis NÃO tem o entitlement (leva a marca)', temAcessoRecurso('gratis', RECURSO_REMOVE_MARCA), false);
checar('pro remove', temAcessoRecurso('pro', RECURSO_REMOVE_MARCA), true);
checar('empresa remove', temAcessoRecurso('empresa', RECURSO_REMOVE_MARCA), true);

console.log('\n2) a chave é a da FONTE (não um `as Recurso` redigitado)');
// O bug que isto tranca: as telas redeclaravam `'remove_olli_brand' as Recurso`.
// O cast engoliria `remove_oli_brand` sem erro e o cliente pagante voltaria a ver
// a marca — sem exceção, sem log, sem ninguém perceber.
checar('a constante vale a string canônica', RECURSO_REMOVE_MARCA, 'remove_olli_brand');
checar('e ela existe de fato no plano pro', RECURSOS_POR_PLANO.pro.has(RECURSO_REMOVE_MARCA), true);
checar('e no empresa', RECURSOS_POR_PLANO.empresa.has(RECURSO_REMOVE_MARCA), true);
checar('e NÃO no grátis', RECURSOS_POR_PLANO.gratis.has(RECURSO_REMOVE_MARCA), false);

console.log('\n3) plano desconhecido não vira "pode remover"');
// Não existe plano "trial"/"" — se aparecer, o piso é o mais restritivo: leva a
// marca. Errar aqui para o lado permissivo daria o benefício pago de graça.
checar('plano inválido => leva a marca', temAcessoRecurso('trial' as never, RECURSO_REMOVE_MARCA), false);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
