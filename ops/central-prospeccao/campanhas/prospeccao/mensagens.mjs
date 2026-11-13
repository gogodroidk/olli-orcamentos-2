// Textos do 1º toque e do único retorno. Sem preço, sem promessa, sem "SAIR" na mensagem.
// A origem do telefone é o site público da empresa (lista de 07/11), não a Receita.

export const TEXTO_TESTE_CASA = 'Oi, Igor. Aqui é o Rafa, da OLLI. Teste interno da prospecção de serviços. Pode ignorar.';

const PERGUNTA = {
  refrigeracao: 'Posso te mostrar em 2 minutos como a GR Tech, a nossa refrigeração, organiza o WhatsApp numa central com agente de IA?',
  eletrica: 'Posso te mostrar em 2 minutos como o WhatsApp de emergência fica numa central com agente de IA, no mesmo modelo da GR Tech?',
  predial: 'Posso te mostrar em 2 minutos como o chamado fica numa central de WhatsApp com agente de IA, no mesmo modelo da GR Tech?',
};

export function nichoDe(nome, motivo = '') {
  const t = `${nome} ${motivo}`.toLowerCase();
  if (/el[eé]tric|electrik|eletricista/.test(t)) return 'eletrica';
  if (/refrigera|ar condicionado|climat|clima|cold/.test(t)) return 'refrigeracao';
  return 'predial';
}

export function textoPrimeiroToque(lead) {
  if (lead?.id === 'teste-casa') return TEXTO_TESTE_CASA;
  const nome = String(lead?.nome || 'aí').trim();
  const pergunta = PERGUNTA[lead?.nicho] || PERGUNTA.predial;
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
