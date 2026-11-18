import { pediuParaVer } from './interesse.mjs';

// Modo OLLI Serviços do Rafa. Só conversa com a etiqueta `prospeccao`.
// Vende atendimento no WhatsApp com agente de IA + central, no modelo que a GR Tech usa.
// Sem preço (não há tabela aprovada), sem promessa, sem "OLLI Orçamentos".
// Não anuncia que é IA. Se perguntarem, diz. Quem disser não ou pedir para parar, para na hora.
// CNPJ: web/src/data/empresa.ts. A GR Tech usa a Central (caixa e robô em chatwoot-central); sem métrica publicada.

export const CNPJ = '65.361.266/0001-05';

const PROIBIDO = [
  /R\$\s*\d/,
  /\bgaranto\b/i,
  /100\s*%/,
  /todo cliente na hora/i,
  /OLLI Orçamentos/i,
  /responda SAIR/i,
  /fala SAIR/i,
];

export function respostaProibida(texto) {
  return PROIBIDO.some((re) => re.test(String(texto ?? '')));
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SAIR = new Set(['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'remover', 'sai', 'sai fora']);

export function pediuParaParar(texto) {
  const n = normalizar(texto);
  if (!n) return false;
  if (SAIR.has(n)) return true;
  return /(para de (me )?(mandar|enviar|chamar|escrever)|nao me (mande|envie|chame|escreva)|me tira|descadastr|nao entre mais|pare de me|pode parar|quero sair|me remove)/.test(n);
}

function pediuNao(n) {
  const t = n.trim();
  if (/^(nao|nop|nao obrigado|sem interesse|dispenso|deixa|deixa quieto)$/.test(t)) return true;
  return /(nao tenho interesse|sem interesse|nao quero|nao preciso|nao me interessa|pode deixar|dispenso)/.test(t);
}

function perguntouRobo(n) {
  if (/(voce|vc|tu|ce|isso|ai) (e|eh|ta) (um |uma )?(robo|bot|ia|inteligencia artificial|maquina|automatico|pessoa|humano|gente|de verdade)/.test(n)) return true;
  if (/(e|eh) (um |uma )?(robo|bot|ia|inteligencia artificial|chatgpt)( |$)/.test(n)) return true;
  if (/(falando|conversando) com (um |uma )?(robo|bot|ia|maquina|pessoa|humano)/.test(n)) return true;
  return false;
}

function desconfia(n) {
  return /(nao confio|desconfio|nao gosto de robo|nao quero robo|robo nao)/.test(n);
}

function golpe(n) {
  return /(golpe|fraude|scam|piramide)/.test(n);
}

function reclamou(n) {
  return /(reclam|absurdo|procon|pessimo|processar|vergonha|palhacada|horrivel|lixo|descaso|desrespeito)/.test(n);
}

function temDadoSensivel(texto) {
  const t = String(texto ?? '');
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) return true;
  if (/\b(?:\d[ -]?){13,19}\b/.test(t)) return true;
  return /(minha senha (e|eh|é)|senha\s*[:=]|cvv\s*[:=]?\s*\d)/i.test(t);
}

function pediuPreco(n) {
  return /(quanto (custa|fica|sai|e)|qual (o |e o )?(preco|valor)|me passa o (preco|valor)|muito caro|caro demais|desconto|mais barato|faz por menos)/.test(n);
}

function pediuCondicao(n) {
  return /(contrato|fidelidade|nota fiscal|nfse|garantia|boleto|parcel)/.test(n);
}

function jaTemAlguem(n) {
  return /(ja tenho (alguem|quem|equipe|sistema|agencia|atendente|robo|secretaria)|ja (uso|contrat)|tenho (um |uma )?(atendente|agencia|sistema|pessoa)|outra agencia)/.test(n);
}

function semTempo(n) {
  return /(sem tempo|ocupado|agora nao da|nao tenho tempo|to na obra|estou na obra|depois eu vejo|me chama depois|correria)/.test(n);
}

function perguntouQuem(n) {
  return /(quem (e|fala|esta|escreveu)|qual (empresa|cnpj)|de onde (e|fala)|cnpj|como (conseguiu|achou) (meu |o )?(numero|telefone|contato))/.test(n);
}

function perguntouOrigem(n) {
  return /(como (voce |vc |ce )?(conseguiu|achou|pegou|tem)|de onde (voce |vc |ce )?(tirou|pegou|conseguiu|saiu|veio)|onde (conseguiu|achou|pegou) (meu |o )?(numero|telefone|contato)|cadastro da receita|dados abertos)/.test(n)
    || /como (conseguiu|achou|pegou|tem) (meu |o )?(numero|telefone|contato)/.test(n);
}

function fatoTecnicos(n) {
  return /(\d+\s*(tecnico|pessoa|funcionario)|tecnico|sozinho|eu mesmo|so eu|equipe de|nos somos|somos em \d)/.test(n);
}

function fatoCanal(n) {
  return /(whatsapp|zap|telefone|ligacao|indicacao|instagram|google|site|boca a boca|cliente liga|chamado chega|chega pelo|chega por)/.test(n);
}

function fatoResposta(n) {
  return /(sem resposta|nao respondo|nao da tempo de responder|fica sem|acumula|demora pra responder|perco cliente|perco chamado|respondo tudo|respondo na hora|nao fica|nenhuma fica)/.test(n);
}

export function lerNegocio(historico, texto) {
  const n = normalizar([...(historico || []), texto || ''].join(' '));
  return {
    tecnicos: fatoTecnicos(n),
    canal: fatoCanal(n),
    semResposta: fatoResposta(n),
  };
}

const PERGUNTA = {
  tecnicos: 'Quantos técnicos saem num dia comum?',
  canal: 'O chamado chega mais pelo WhatsApp, pelo telefone ou por indicação?',
  semResposta: 'Fica mensagem de WhatsApp sem resposta quando a equipe está em serviço?',
};

function proximaPergunta(q) {
  if (!q.tecnicos) return PERGUNTA.tecnicos;
  if (!q.canal) return PERGUNTA.canal;
  if (!q.semResposta) return PERGUNTA.semResposta;
  return '';
}

function aceitou(n, q) {
  if (/(pode (chamar|marcar|pedir)|chama o igor|quero falar com (o igor|ele)|manda o igor|agenda (ai|com))/.test(n)) return true;
  if (q.tecnicos && q.canal && q.semResposta && /^(pode ser|manha|tarde|de manha|de tarde|amanha|amanha de manha|amanha de tarde|fechado|bora|sim)$/.test(n.trim())) return true;
  return false;
}

function enviar(motivo, resposta, extra = {}) {
  return { acao: 'enviar', motivo, resposta, lead: extra.lead || 'morno', nota: extra.nota || '', qualificacao: extra.qualificacao || null, interesse: extra.interesse || null };
}

function humano(motivo, resposta, nota, qualificacao, interesse = null) {
  return { acao: 'humano', motivo, resposta, lead: 'quente', nota, qualificacao, interesse };
}

function suprimir(motivo, resposta) {
  return { acao: 'suprimir', motivo, resposta, lead: 'frio', nota: 'Pediu para parar ou disse não. LGPD: não enviar mais.', qualificacao: null };
}

const FRASE_PARAR = 'Pronto, parei. Você não recebe mais mensagem nossa por aqui.';
const FRASE_NAO = 'Sem problema. Não envio mais nada. Obrigado pela resposta.';
const FRASE_ROBO = `Sou o assistente virtual da OLLI, uma IA. Quem fecha é o Igor, pessoa. CNPJ ${CNPJ}. Quer que eu pare, ou prefere 15 minutos com ele?`;
const FRASE_PRECO = 'Não tenho um preço fechado para te passar por aqui. A proposta sai depois de entender o movimento, e quem passa o número é o Igor, em 15 minutos. Quer que eu peça para ele te chamar?';
const FRASE_CONDICAO = 'Contrato, nota e condição o Igor confirma por escrito. Eu não invento isso por aqui. Quer os 15 minutos com ele?';
const FRASE_JA_TEM = 'Que bom que vocês já têm alguém. Não vou pedir para trocar. Se o WhatsApp ainda fica sem resposta em algum horário, a central entra só nesse buraco. Quer ver em 2 minutos, ou prefere que eu pare?';
const FRASE_TEMPO = 'Sem problema. Um sim ou um não já resolve, e eu não insisto se for não.';
const FRASE_AUDIO = 'Recebi o áudio e não consigo ouvir daqui. Se puder, escreve em uma frase como chega o chamado hoje.';
const FRASE_SENSIVEL = 'Por segurança não me manda senha, CPF nem cartão por aqui. Pode me contar o movimento do WhatsApp sem esses dados.';
const FRASE_GOLPE = `Entendo a cautela. Sou o assistente virtual da OLLI, uma IA. CNPJ ${CNPJ}. Vou pedir para o Igor, que é a pessoa, falar com você.`;
const FRASE_RECLAMACAO = 'Sinto muito. Parei a oferta e vou passar isso para o Igor agora.';
const FRASE_15 = 'O próximo passo é uma conversa de 15 minutos com o Igor. Ele é quem monta a proposta. Quer que eu peça esse horário?';
const FRASE_ACEITE = 'Combinado. Vou chamar o Igor para os 15 minutos e deixo esta conversa com ele.';
const FRASE_DESCONFIA = `Faz sentido desconfiar. Eu sou o assistente virtual da OLLI, uma IA. Quem decide e assina é o Igor, pessoa. Posso parar agora, ou ele te explica em 15 minutos o que a GR Tech usa na central.`;
const FRASE_HORA = 'O agente de IA responde na central a qualquer hora. Proposta e visita ficam com o Igor, em dia útil. Não marco prazo daqui.';
const FRASE_INCERTEZA = 'Essa eu não respondo no chute. Vou pedir para o Igor te falar. Deixei registrado.';
const FRASE_MOSTRA = 'O cliente chama no WhatsApp, um agente de IA responde e a conversa fica numa central, no mesmo modelo que a GR Tech usa. Sem número mágico: o Igor mostra com o movimento de vocês.';

function blindar(r) {
  if (!respostaProibida(r.resposta)) return r;
  return humano('guarda', 'Essa eu não fecho por aqui para não te passar nada errado. Vou pedir para o Igor te responder.', 'Guarda tirou preço, promessa ou marca errada.', r.qualificacao, r.interesse || null);
}

/**
 * @param {{ texto?: string, audioSemTexto?: boolean, historico?: string[], nome?: string, empresa?: string, nicho?: string }} p
 */
export function responderProspeccao(p = {}) {
  if (p.audioSemTexto) return blindar(enviar('audio', FRASE_AUDIO, { lead: 'indefinido' }));
  const texto = String(p.texto ?? '').trim();
  const n = normalizar(texto);
  const hist = Array.isArray(p.historico) ? p.historico : [];
  const q = lerNegocio(hist, texto);
  const empresa = String(p.empresa || '').trim();
  const cumprimento = empresa ? `Sobre a ${empresa}: ` : '';

  if (!n) return blindar(enviar('abertura', `${cumprimento}${PERGUNTA.tecnicos}`, { lead: 'indefinido', qualificacao: q }));
  if (pediuParaParar(texto) || pediuParaParar(n)) return blindar(suprimir('sair', FRASE_PARAR));
  if (desconfia(n)) return blindar(enviar('desconfia', FRASE_DESCONFIA, { lead: 'morno', qualificacao: q }));
  if (semTempo(n)) return blindar(enviar('sem_tempo', FRASE_TEMPO, { lead: 'morno', qualificacao: q }));
  if (pediuNao(n)) return blindar(suprimir('nao', FRASE_NAO));
  if (perguntouRobo(n)) return blindar(enviar('robo', FRASE_ROBO, { lead: 'morno', qualificacao: q }));
  if (temDadoSensivel(texto)) return blindar(enviar('dado_sensivel', FRASE_SENSIVEL, { lead: 'indefinido', qualificacao: q }));
  if (reclamou(n)) return blindar(humano('reclamacao', FRASE_RECLAMACAO, '[Prospecção] Reclamação. Parar a venda.', q));
  if (golpe(n)) return blindar(humano('golpe', FRASE_GOLPE, '[Prospecção] Desconfiou de golpe. Igor assume.', q));
  if (pediuPreco(n)) return blindar(enviar('preco', FRASE_PRECO, { lead: 'quente', nota: '[Prospecção] Pediu preço. Sem tabela aprovada. Ofereci 15 min com o Igor.', qualificacao: q, interesse: 'preco' }));
  if (pediuCondicao(n)) return blindar(enviar('condicao', FRASE_CONDICAO, { lead: 'quente', nota: '[Prospecção] Pediu contrato ou nota. Igor confirma.', qualificacao: q }));
  if (perguntouQuem(n) || perguntouOrigem(n)) {
    const querOrigem = perguntouOrigem(n) || /como (conseguiu|achou|pegou|tem)/.test(n);
    let origem = `CNPJ ${CNPJ}.`;
    if (querOrigem) {
      origem = p.fonte === 'receita'
        ? 'Localizamos o contato nos dados abertos cadastrais da Receita Federal.'
        : 'O telefone está no site de vocês, público.';
    }
    return blindar(enviar('quem', `Aqui é o Rafa, assistente virtual da OLLI, uma IA. ${origem} Quem fecha é o Igor. ${proximaPergunta(q) || FRASE_15}`, { lead: 'morno', qualificacao: q }));
  }
  if (jaTemAlguem(n)) return blindar(enviar('ja_tem', FRASE_JA_TEM, { lead: 'morno', qualificacao: q }));
  if (/(funciona|atende|responde|fica ligado)/.test(n) && /(madrugada|de noite|24|fim de semana|domingo|hora)/.test(n)) {
    return blindar(enviar('horario', FRASE_HORA, { lead: 'morno', qualificacao: q }));
  }
  if (aceitou(n, q)) return blindar(humano('aceitou_15', FRASE_ACEITE, '[Prospecção] Aceitou conversa de 15 min com o Igor.', q, 'aceitou'));
  if (pediuParaVer(texto)) {
    const proxima = proximaPergunta(q);
    return blindar(enviar('ver', `${FRASE_MOSTRA} ${proxima || FRASE_15}`, { lead: 'quente', nota: '[Prospecção] Pediu para ver.', qualificacao: q, interesse: 'ver' }));
  }

  const falta = proximaPergunta(q);
  if (!falta) {
    return blindar(enviar('qualificado', `Anotei o movimento de vocês. ${FRASE_15}`, { lead: 'quente', nota: '[Prospecção] Qualificado (técnicos, canal, WhatsApp sem resposta). Ofereci 15 min.', qualificacao: q }));
  }
  if (/^(sim|pode|ok|quero)$/.test(n) && hist.length === 0) {
    return blindar(enviar('mostra', `${FRASE_MOSTRA} ${PERGUNTA.tecnicos}`, { lead: 'morno', qualificacao: q }));
  }
  if (fatoTecnicos(n) || fatoCanal(n) || fatoResposta(n)) {
    return blindar(enviar('descoberta', `Anotei. ${falta}`, { lead: 'morno', qualificacao: q }));
  }
  if (hist.length >= 2) return blindar(humano('incerteza', FRASE_INCERTEZA, '[Prospecção] Não entendi o bastante para responder sem chute.', q));
  return blindar(enviar('descoberta', `${cumprimento}${falta}`, { lead: 'morno', qualificacao: q }));
}
