// Textos do 1º toque e do único retorno. Sem preço, sem promessa, sem "SAIR" na mensagem.
// Fonte site: o telefone está no site público. Fonte receita: a 1ª mensagem só diz quem somos.
// A origem da Receita se responde se perguntarem (prospeccaoModo), não no 1º toque.
// Se o diagnóstico leu o site, a 1ª mensagem cita a lacuna. Senão, fica o texto padrão.
import { fraseSeLimpa } from '../diagnostico/frase.mjs';

export const TEXTO_TESTE_CASA = 'Oi, Igor. Aqui é o Rafa, da OLLI. Teste interno da prospecção de serviços. Pode ignorar.';

const PERGUNTA = {
  refrigeracao: 'Posso te mostrar em 2 minutos como uma refrigeração aqui de São Paulo passou a organizar o WhatsApp numa central com agente de IA?',
  eletrica: 'Posso te mostrar em 2 minutos como o WhatsApp de emergência fica numa central com agente de IA, respondendo na hora?',
  predial: 'Posso te mostrar em 2 minutos como o chamado fica numa central de WhatsApp com agente de IA, organizado e respondido na hora?',
};

export function nichoDe(nome, motivo = '') {
  const tag = String(motivo || '').match(/nicho:(refrigeracao|eletrica|predial)/i);
  if (tag) return tag[1].toLowerCase();
  const t = `${nome} ${motivo}`.toLowerCase();
  if (/el[eé]tric|electrik|eletricista/.test(t)) return 'eletrica';
  if (/refrigera|ar condicionado|climat|clima|cold/.test(t)) return 'refrigeracao';
  return 'predial';
}

export function textoPrimeiroToque(lead) {
  if (lead?.id === 'teste-casa') return TEXTO_TESTE_CASA;
  const personalizada = lead?.fonte === 'receita' ? '' : fraseSeLimpa(lead, textoProibido);
  if (personalizada) return personalizada;
  const nome = String(lead?.nome || 'aí').trim();
  const pergunta = PERGUNTA[lead?.nicho] || PERGUNTA.predial;
  if (lead?.fonte === 'receita') return `Oi, equipe da ${nome}. Aqui é o Rafa, da OLLI. ${pergunta}`;
  return `Oi, equipe da ${nome}. Aqui é o Rafa, da OLLI. Vi o telefone de vocês no site. ${pergunta}`;
}

export function textoRetorno(lead) {
  const nome = String(lead?.nome || 'aí').trim();
  return `Oi, equipe da ${nome}. Rafa, da OLLI, de novo. Se olhar o atendimento do WhatsApp não for prioridade agora, sem problema. Se for, me responde com um sim.`;
}

export function textoDaVez(lead, toque) {
  return toque === 2 ? textoRetorno(lead) : textoPrimeiroToque(lead);
}

const PROIBIDO = [
  /R\$\s*\d/,
  /\bgaranto\b/i,
  /100\s*%/,
  /todo cliente na hora/i,
  /OLLI Orçamentos/i,
  /responda SAIR/i,
  /fala SAIR/i,
  /dados públicos de CNPJ/i,
  /Receita Federal/i,
];

export function textoProibido(texto) {
  return PROIBIDO.some((re) => re.test(String(texto ?? '')));
}
