/**
 * Teste do parser de número do painel (DoD do item O3-25 da FILA):
 * "Digitar 2.5 permanece 2.5; teste colado no log."
 *
 *     node scripts/teste-numero-web.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Este é o código que decide a QUANTIDADE e o DESCONTO que vão para o PDF do
 * cliente final. O bug original ("2.5" virar 25) não dava erro nenhum: emitia um
 * documento com o valor 10x errado, calado, com cara de certo. Daí o teste.
 */
import { qtdParaTexto, textoParaNumero } from '../webapp/src/olli/numero.ts';

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

console.log('\n1) O BUG DO DoD: o ponto do teclado numérico é DECIMAL');
checar('"2.5" => 2.5 (NÃO 25)', textoParaNumero('2.5'), 2.5);
checar('"0.5" => 0.5', textoParaNumero('0.5'), 0.5);
checar('"10.25" => 10.25', textoParaNumero('10.25'), 10.25);

console.log('\n2) pt-BR de verdade: a vírgula é o decimal e o ponto é milhar');
checar('"2,5" => 2.5', textoParaNumero('2,5'), 2.5);
checar('"1.234,56" => 1234.56', textoParaNumero('1.234,56'), 1234.56);
checar('"1.234.567,89" => 1234567.89', textoParaNumero('1.234.567,89'), 1234567.89);

console.log('\n3) inteiros e milhar sem vírgula');
checar('"1234" => 1234', textoParaNumero('1234'), 1234);
checar('"1.234.567" (2+ pontos, sem vírgula) => 1234567', textoParaNumero('1.234.567'), 1234567);

console.log('\n4) entrada ilegível vira NaN — quem chama decide (nunca vira 0 calado)');
checar('"" => NaN', Number.isNaN(textoParaNumero('')), true);
checar('"abc" => NaN', Number.isNaN(textoParaNumero('abc')), true);

console.log('\n5) ida e volta: o que a tela mostra volta no mesmo número');
for (const n of [2.5, 0.5, 1, 1234, 10.25]) {
  checar(`${n} -> "${qtdParaTexto(n)}" -> ${n}`, textoParaNumero(qtdParaTexto(n)), n);
}

console.log('\n6) o dano que o bug causava, medido');
// Antes: replace(/\./g,"") em "2.5" => "25". Uma diária de 2,5h vira 25h no PDF.
const antesBugado = Number('2.5'.replace(/\./g, '').replace(',', '.'));
checar('a regressão daria 25', antesBugado, 25);
checar('e hoje dá 2.5', textoParaNumero('2.5'), 2.5);
checar('ou seja: 10x de erro no documento do cliente', antesBugado / textoParaNumero('2.5'), 10);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
