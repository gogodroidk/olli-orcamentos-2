/**
 * P0-34 — passagem para humano. Este módulo não chama a Meta.
 * SAIR continua em private.wa_texto_pede_sair: quem chama passa pediuSair.
 * A frase do gatilho 5 é a única. Os outros cinco devolvem corpo vazio.
 * O webhook só envia a frase se o banco devolver o telefone em respostas
 * (migration 20261103200000) e o guarda wa_autorizar_envio liberar.
 */

export const FRASE_IA =
  'Sim. Eu sou o assistente virtual da OLLI e sou uma IA. A equipe da OLLI assume daqui. Se não quiser mais mensagens, fala SAIR.';

const ACENTO = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c',
};

export function normalizarPassagem(texto) {
  const base = String(texto ?? '').toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüç]/g, (c) => ACENTO[c]);
  return base.replace(/[^a-z0-9 ]/g, '');
}

function motivoDoTexto(n) {
  if (/(^| )(senha|password|cvv)( |$)/.test(n)) return 'dado';
  if (/(^| )(robo|bot)( |$)/.test(n) || n.includes('inteligencia artificial')) return 'ia';
  if (/(^| )contrato( |$)/.test(n) || n.includes('nota fiscal')) return 'contrato';
  if (/(^| )(procon|reclamacao|absurdo)( |$)/.test(n) || n.includes('vou processar')) return 'reclamacao';
  if (/[0-9]+ reais/.test(n) && /(por mes|consegue fazer por|mais barato|desconto)/.test(n)) return 'preco';
  return null;
}

export function passagemHumano(texto, { pediuSair = false, segundaSemResposta = false } = {}) {
  if (pediuSair) return { estado: 'saiu', motivo: null, resposta: '' };
  const motivo = motivoDoTexto(normalizarPassagem(texto));
  if (motivo === 'ia') return { estado: 'humano', motivo, resposta: FRASE_IA };
  if (motivo) return { estado: 'humano', motivo, resposta: '' };
  if (segundaSemResposta) return { estado: 'humano', motivo: 'incerteza', resposta: '' };
  return { estado: 'novo', motivo: null, resposta: '' };
}
