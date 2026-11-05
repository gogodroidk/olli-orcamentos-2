/**
 * Uma classificação real de lead sintético.
 * Não roda no `npm test` (a chamada é paga: US$ 0,042 por milhão de tokens de entrada).
 *
 *     TYPESAFE_API_KEY no ambiente
 *     node scripts/jev-classificar-uma.ts --confirmo-uma
 *
 * Imprime o veredito e o uso. Não imprime a chave.
 */
import { classificarLead } from './jev-verificador/classificar.ts';
import { TEXTO_SINTETICO_LEAD } from './jev-verificador/perguntas.ts';
import { prepararTexto } from './jev-verificador/limpar.ts';

const chave = (process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || '').trim();

if (!process.argv.includes('--confirmo-uma')) {
  console.error('parado: passe --confirmo-uma para gastar uma chamada no saldo da TypeSafe');
  process.exit(2);
}
if (!chave) {
  console.error('parado: TYPESAFE_API_KEY ausente no ambiente');
  process.exit(2);
}
const prep = prepararTexto(TEXTO_SINTETICO_LEAD);
if (prep.optOut || prep.sensivel || prep.mascarou) {
  console.error('parado: o texto sintético não passou na limpeza local');
  process.exit(2);
}

const resultado = await classificarLead(TEXTO_SINTETICO_LEAD, { chave, tentativas: 2 });
const publico = {
  modelo: resultado.modelo,
  textoEnviado: resultado.textoEnviado,
  decisao: resultado.decisao,
  usage: resultado.usage,
  custoUsd: Number(resultado.custoUsd.toFixed(8)),
};
console.log(JSON.stringify(publico));
