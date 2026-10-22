/**
 * Textos da indicação (src/utils/indicacaoTexto.ts): a promessa só existe com a
 * recompensa LIGADA; resumo "não sei" não vira zero.   node scripts/teste-indicacao-texto.ts
 */
import { mensagemWhatsApp, rotuloCreditos, textoPromessa, textoResumo, TETO_INDICACOES } from '../src/utils/indicacaoTexto.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

checar('rótulo singular/plural', rotuloCreditos(1) === '1 crédito de IA' && rotuloCreditos(10) === '10 créditos de IA');
checar('desligada (0): sem promessa nem número', !/ganh|crédito|\d/.test(textoPromessa(0)), textoPromessa(0));
checar('valor inválido (NaN/negativo) também não promete', !/ganh/.test(textoPromessa(Number.NaN)) && !/ganh/.test(textoPromessa(-3)));
checar('ligada: cita o valor e o teto', textoPromessa(10).includes('10 créditos de IA') && textoPromessa(10).includes(`${TETO_INDICACOES} colegas`));
checar('mensagem desligada leva o link e nenhuma promessa', mensagemWhatsApp('https://x/?ref=ABC234', 0).includes('https://x/?ref=ABC234') && !/ganhamos/.test(mensagemWhatsApp('l', 0)));
checar('mensagem ligada cita o ganho', mensagemWhatsApp('l', 5).includes('5 créditos de IA'));
checar('resumo null (não sei) = null, não "0 colegas"', textoResumo(null) === null);
checar('resumo sem recompensados = null', textoResumo({ recompensadas: 0 }) === null);
checar('resumo 1 colega', textoResumo({ recompensadas: 1 }) === '1 colega já orçou');
checar('resumo plural', textoResumo({ recompensadas: 3 }) === '3 colegas já orçaram');

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
