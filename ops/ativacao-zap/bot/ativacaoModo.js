// Modo ativação da Lívia. Só conversa com a etiqueta `ativacao` na caixa OLLI.
// Ajuda a montar o primeiro orçamento, manda o link do app e passa para o Igor
// se pedirem pessoa, falarem de preço fora da tabela ou reclamarem.
// Não anuncia que é IA. Se perguntarem, diz que é a assistente virtual. Não pede SAIR;
// se pedirem para parar, para na hora.

export const LINK_APP = 'https://olliorcamentos.online';

const SAIR_EXATO = new Set([
  'sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'remover', 'sair da lista',
  'pode parar', 'quero sair', 'me remove', 'me remova',
]);

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pediuParaParar(texto) {
  const n = normalizar(texto);
  if (!n) return false;
  if (SAIR_EXATO.has(n)) return true;
  return /(nao (quero|preciso) mais (receber|mensagem|contato)|para de (me )?(mandar|enviar|chamar)|nao me (mande|envie|chame)|me tira (da lista|dai)|descadastr|nao entre mais em contato|pare de me)/.test(n);
}

function perguntouSeRobo(n) {
  if (/(voce|vc|tu|ce|isso|ai) (e|eh|ta) (um |uma )?(robo|bot|ia|inteligencia artificial|maquina|automatico|pessoa|humano|gente|de verdade)/.test(n)) return true;
  if (/(e|eh) (um |uma )?(robo|bot|ia|inteligencia artificial|chatgpt)( |$)/.test(n)) return true;
  if (/(falando|conversando) com (um |uma )?(robo|bot|ia|maquina|pessoa|humano|gente)/.test(n)) return true;
  if (/(pessoa|gente|humano) de verdade/.test(n)) return true;
  if (/(^| )(robo|bot)( |$)/.test(n) && n.split(' ').length <= 5) return true;
  return false;
}

function temDadoSensivel(texto) {
  const t = String(texto ?? '');
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) return true;
  if (/\b(?:\d[ -]?){13,19}\b/.test(t)) return true;
  return /(minha senha (e|eh|é)|senha\s*[:=]|cvv\s*[:=]?\s*\d)/i.test(t);
}

function pediuHumano(n) {
  return /(falar|conversar|chamar|passar|transferir|encaminhar)( \w+)? (com |pra |para )?(um |uma |o |a )?(atendente|humano|pessoa|alguem|gerente|dono|responsavel|vendedor|consultor|igor)/.test(n)
    || /(atendente|atendimento) humano/.test(n)
    || /(quero|preciso) (de )?(um )?(humano|atendente)/.test(n);
}

function reclamou(n) {
  return /(reclam|absurdo|procon|pessimo|golpe|processar|vergonha|enganad|fraude|palhacada|horrivel|lixo|ninguem responde|descaso|desrespeito|justica)/.test(n);
}

function precosCitados(texto) {
  const achados = [];
  const t = String(texto ?? '');
  for (const m of t.matchAll(/r\$\s*([\d.]+(?:,\d{1,2})?)/gi)) {
    achados.push(Number(m[1].replace(/\./g, '').replace(',', '.')));
  }
  for (const m of t.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*reais/gi)) {
    achados.push(Number(m[1].replace(/\./g, '').replace(',', '.')));
  }
  return achados.filter((n) => Number.isFinite(n));
}

function foraDaTabela(texto, n) {
  if (/(desconto|mais barato|promocao|cupom|cobra menos|faz por menos)/.test(n)) return true;
  const precos = precosCitados(texto);
  const fora = precos.some((v) => v !== 0 && v !== 39 && v !== 99);
  if (!fora) return false;
  return /(plano|assin|pro\b|empresa|voces cobram|olli)/.test(n);
}

function perguntouPrecoTabela(n) {
  return /(quanto (custa|fica|sai)|qual (o |e )?(preco|valor)|preco do (pro|plano|empresa)|valor do (pro|plano|empresa))/.test(n)
    || (/(plano|assinar|assinatura)/.test(n) && /(preco|valor|custa|quanto)/.test(n));
}

function rascunho(texto, n) {
  if (foraDaTabela(texto, n) || perguntouPrecoTabela(n)) return null;
  const m = String(texto).match(/r\$\s*([\d.]+(?:,\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s*reais/i);
  if (!m) return null;
  const bruto = m[1] || m[2];
  const valor = Number(bruto.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0 || valor > 1000000) return null;
  const servico = String(texto).replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  const letras = servico.replace(/[^A-Za-zÀ-ú]/g, '');
  if (letras.length < 3) return null;
  return { servico: servico.slice(0, 140), valor };
}

function formatarValor(valor) {
  const n = Number(valor);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace('.', ',');
}

function faq(n) {
  if (/(nao consigo (entrar|logar|acessar)|esqueci (a |minha )?(senha|conta)|login|recuperar (a )?(senha|conta)|trocar (a )?senha)/.test(n)) {
    return 'Na tela de entrar, toca em "Esqueci a senha" e usa o e-mail do cadastro. Se a conta foi criada com o Google, entra de novo por "Continuar com Google". Não me manda a senha. Se não chegar o e-mail, olha o spam e me diz.';
  }
  if (/(como (faco|fazer|crio|criar|monto|montar) (um |o |meu )?orcamento|novo orcamento|onde (fico|fica|acho) o orcamento)/.test(n)) {
    return `No app, abre Novo orçamento, escolhe ou cadastra o cliente, coloca o serviço e o valor e envia. ${LINK_APP} Me fala o serviço e o valor que eu monto com você agora.`;
  }
  if (/(\bpdf\b|nao acho|nao achei o botao|whatsapp do cliente|link do orcamento)/.test(n)) {
    return `O PDF e o link saem na tela do orçamento, em enviar. O WhatsApp do seu cliente é escolhido ali, não neste número. ${LINK_APP} Se travou, me diz em qual tela você está.`;
  }
  return '';
}

function saudacao(n) {
  return /^(oi|ola|bom dia|boa tarde|boa noite|ok|blz|beleza|sim|obrigado|obrigada|valeu)$/.test(n);
}

const FRASE_PARAR = 'Pronto, parei. Você não recebe mais mensagem nossa por aqui.';
const FRASE_ROBO = 'Sou a assistente virtual da OLLI. Posso montar o orçamento com você por aqui, ou chamo uma pessoa da equipe se preferir.';
const FRASE_HUMANO = 'Vou chamar uma pessoa da equipe pra continuar. Deixei registrado e sinalizado.';
const FRASE_RECLAMACAO = 'Sinto muito por isso. Vou passar pra uma pessoa da equipe agora, com prioridade. Deixei registrado.';
const FRASE_FORA = 'Esse valor eu não fecho por aqui. Na tabela de hoje o Pro é R$ 39 e o Empresa é R$ 99. Vou chamar uma pessoa da equipe pra te responder com certeza. Deixei registrado.';
const FRASE_PRECO = `O plano Grátis continua no app. O Pro é R$ 39 e o Empresa é R$ 99, em Planos, e dá para pagar por Pix. ${LINK_APP}`;
const FRASE_SENSIVEL = 'Por segurança não me manda senha, CPF nem número de cartão por aqui. Me conta o que travou, sem esses dados, que eu te ajudo.';
const FRASE_AUDIO = 'Recebi o áudio e não consigo ouvir daqui. Me escreve o serviço e o valor que eu monto com você agora.';
const FRASE_PEDE = `Me fala o serviço e o valor que eu monto com você agora. O app está em ${LINK_APP}`;
const FRASE_INCERTEZA = 'Essa eu prefiro não responder no chute. Vou pedir pra uma pessoa da equipe te responder. Deixei registrado.';

function enviar(motivo, resposta) {
  return { acao: 'enviar', motivo, resposta, nota: '' };
}
function humano(motivo, resposta, nota) {
  return { acao: 'humano', motivo, resposta, nota };
}

/**
 * @param {{ texto?: string, audioSemTexto?: boolean, historico?: string[], nome?: string }} p
 */
export function responderAtivacao(p = {}) {
  if (p.audioSemTexto) return enviar('audio', FRASE_AUDIO);
  const texto = String(p.texto ?? '').trim();
  const n = normalizar(texto);
  const hist = Array.isArray(p.historico) ? p.historico : [];

  if (pediuParaParar(texto) || pediuParaParar(n)) {
    return { acao: 'suprimir', motivo: 'sair', resposta: FRASE_PARAR, nota: 'Pediu para parar. LGPD: não enviar mais.' };
  }
  if (perguntouSeRobo(n)) return enviar('robo', FRASE_ROBO);
  if (temDadoSensivel(texto)) return enviar('dado_sensivel', FRASE_SENSIVEL);
  if (reclamou(n)) return humano('reclamacao', FRASE_RECLAMACAO, '[Ativação] Reclamação. Passar para o Igor.');
  if (pediuHumano(n)) return humano('humano', FRASE_HUMANO, '[Ativação] Pediu para falar com uma pessoa.');
  if (foraDaTabela(texto, n)) return humano('fora_tabela', FRASE_FORA, '[Ativação] Preço fora da tabela (só Pro R$ 39 e Empresa R$ 99).');
  if (perguntouPrecoTabela(n)) return enviar('preco', FRASE_PRECO);

  const item = rascunho(texto, n);
  if (item) {
    return enviar(
      'orcamento',
      `Anotei: ${item.servico} por R$ ${formatarValor(item.valor)}. No app, abre Novo orçamento, coloca esse serviço com esse valor e envia. ${LINK_APP} Se travar, me diz em qual tela você está.`,
    );
  }

  const ajuda = faq(n);
  if (ajuda) return enviar('duvida_app', ajuda);
  if (hist.length >= 2 && n && !saudacao(n)) {
    return humano('incerteza', FRASE_INCERTEZA, '[Ativação] Não entendi o bastante para responder sem chute.');
  }
  return enviar('pedir_servico', FRASE_PEDE);
}
