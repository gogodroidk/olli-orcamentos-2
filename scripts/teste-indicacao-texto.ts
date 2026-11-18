/**
 * Textos da indicação (src/utils/indicacaoTexto.ts): a promessa só existe com a
 * recompensa LIGADA; resumo "não sei" não vira zero.   node scripts/teste-indicacao-texto.ts
 */
import { INDICACAO_MESES_PRO, INDICACAO_TETO_PREMIADAS } from '../src/services/limitesComerciais.ts';
import { mensagemWhatsApp, rotuloMeses, textoPromessa, textoResumo, TETO_INDICACOES } from '../src/utils/indicacaoTexto.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

checar('rótulo singular/plural', rotuloMeses(1) === '1 mês de Pro' && rotuloMeses(2) === '2 meses de Pro');
checar('desligada (0): sem promessa nem número', !/ganh|Pro|\d/.test(textoPromessa(0)), textoPromessa(0));
checar('valor inválido (NaN/negativo) também não promete', !/ganh/.test(textoPromessa(Number.NaN)) && !/ganh/.test(textoPromessa(-3)));
checar('ligada: cita o valor, o teto e que não vale dinheiro', textoPromessa(INDICACAO_MESES_PRO).includes(rotuloMeses(INDICACAO_MESES_PRO)) && textoPromessa(INDICACAO_MESES_PRO).includes(`até ${TETO_INDICACOES} indicações`) && /não vale dinheiro/.test(textoPromessa(INDICACAO_MESES_PRO)));
checar('ligada: só premia depois de enviar orçamento de verdade', /enviar o 1º orçamento de verdade/.test(textoPromessa(1)));
checar('sem "crédito de IA" em lugar nenhum', !/crédito/i.test(textoPromessa(1) + mensagemWhatsApp('l', 1)));
checar('teto da copy = constante única', TETO_INDICACOES === INDICACAO_TETO_PREMIADAS);
checar('mensagem desligada leva o link e nenhuma promessa', mensagemWhatsApp('https://x/?ref=ABC234', 0).includes('https://x/?ref=ABC234') && !/ganhamos/.test(mensagemWhatsApp('l', 0)));
checar('mensagem ligada cita o ganho', mensagemWhatsApp('l', 1).includes('1 mês de Pro'));
checar('indicador que paga: copy diz só que o colega ganha e que não soma', /ele ganha/.test(textoPromessa(1, 3, true)) && !/vocês dois/.test(textoPromessa(1, 3, true)) && /já paga/.test(textoPromessa(1, 3, true)) && !/nós dois/.test(mensagemWhatsApp('l', 1, true)));
checar('resumo null (não sei) = null, não "0 colegas"', textoResumo(null) === null);
checar('resumo sem recompensados = null', textoResumo({ recompensadas: 0 }) === null);
checar('resumo 1 colega', textoResumo({ recompensadas: 1 }) === '1 colega já orçou');
checar('resumo plural', textoResumo({ recompensadas: 3 }) === '3 colegas já orçaram');

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
