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
checar('resumo sem cadastros = null', textoResumo({ cadastraram: 0, recompensadas: 0 }) === null);
checar('resumo 1 colega', textoResumo({ cadastraram: 1, recompensadas: 0 }) === '1 colega entrou');
checar('resumo plural com orçaram', textoResumo({ cadastraram: 3, recompensadas: 2 }) === '3 colegas entraram · 2 já orçaram');
checar('resumo singular orçou', textoResumo({ cadastraram: 2, recompensadas: 1 }) === '2 colegas entraram · 1 já orçou');

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
