/**
 * Template do RESUMO DIÁRIO "dinheiro parado" (e-mail das 7h).
 *
 * Mesma casca dos lembretes (`emailLembretesTemplate.js`: marca, tabela, botão de
 * 44 px, rodapé com descadastro), outro conteúdo. Só números — nenhum nome de
 * cliente, telefone ou valor por cliente sai do banco para o e-mail: o detalhe
 * (e o botão de cobrar pelo WhatsApp com a mensagem pronta) está no painel, para
 * onde o CTA leva.
 *
 * Copy DERIVADA da fonte, nunca de memória: o limiar de proposta parada ("3 dias")
 * vem de `src/services/radarDinheiro.ts`; "clientes para lembrar" é o NOME do cartão
 * do painel e da Home do app (mesma regra, `src/utils/posVenda.ts`: o intervalo do
 * ofício passou desde o último serviço); o valor em reais é formatado por `reais()` de
 * `src/services/precosPlanos.ts`. Sem urgência inventada, sem desconto, sem prazo.
 * O link do rodapé desliga SÓ o resumo (escopo `resumo` do descadastro).
 */

import { reais } from '../../src/services/precosPlanos.ts';
import { LIMIAR_PROPOSTA_PARADA_DIAS } from '../../src/services/radarDinheiro.ts';
import {
  atributoHtml,
  chavesExatas,
  congelarProfundo,
  EMAIL_LEMBRETES_BRAND,
  exigir,
  idSeguro,
  montarHtml,
  montarTexto,
  urlCom,
  urlHttps,
} from './emailLembretesTemplate.js';
import { RESUMO_DINHEIRO } from './resumoDinheiroPolicy.js';

export const RESUMO_DINHEIRO_RENDERER_VERSION = '2026-09-30.v2';

const INPUT_KEYS = Object.freeze([
  'eventId',
  'template',
  'templateVersion',
  'purpose',
  'dados',
  'appUrl',
  'supportUrl',
  'logoUrl',
  'unsubscribeUrl',
]);
const DADOS_KEYS = Object.freeze([
  'data',
  'aReceberCentavos',
  'aReceberItens',
  'diasMaisAntigo',
  'semValor',
  'propostasParadas',
  'clientesParaLembrar',
]);
/** Teto de sanidade: acima disso o dado está errado, não o prestador rico. */
const MAX_CENTAVOS = 100_000_000_000;
const MAX_CONTAGEM = 100_000;

function inteiroEntre(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function plural(n, singular, pluralForma) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralForma}`;
}

function validarDados(d) {
  chavesExatas(d, DADOS_KEYS, 'dados_invalidos');
  exigir(typeof d.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.data), 'dados_invalidos');
  exigir(inteiroEntre(d.aReceberCentavos, 0, MAX_CENTAVOS), 'dados_invalidos');
  for (const k of ['aReceberItens', 'semValor', 'propostasParadas', 'clientesParaLembrar']) {
    exigir(inteiroEntre(d[k], 0, MAX_CONTAGEM), 'dados_invalidos');
  }
  exigir(d.diasMaisAntigo === null || inteiroEntre(d.diasMaisAntigo, 0, 36_500), 'dados_invalidos');
  // Coerência: valor sem item (ou item sem valor) é dado torto — não vira e-mail.
  exigir((d.aReceberCentavos > 0) === (d.aReceberItens > 0), 'dados_invalidos');
  exigir(d.aReceberItens > 0 || d.diasMaisAntigo === null, 'dados_invalidos');
  // Nunca e-mail sem nada acionável (o banco e a policy já barram; aqui é a 3ª trava).
  exigir(d.aReceberItens > 0 || d.propostasParadas > 0 || d.clientesParaLembrar > 0, 'nada_acionavel');
}

function conteudo(d, appUrl) {
  const valor = d.aReceberItens > 0 ? reais(d.aReceberCentavos) : null;
  const itens = [];

  if (valor) {
    let linha = `${valor} a receber em ${plural(d.aReceberItens, 'orçamento aprovado', 'orçamentos aprovados')}`;
    if (d.diasMaisAntigo !== null && d.diasMaisAntigo > 0) {
      linha += ` — o mais antigo parado há ${plural(d.diasMaisAntigo, 'dia', 'dias')}`;
    }
    itens.push(`${linha}.`);
  }
  if (d.propostasParadas > 0) {
    itens.push(`${plural(d.propostasParadas, 'proposta enviada', 'propostas enviadas')} sem resposta há ${LIMIAR_PROPOSTA_PARADA_DIAS} dias ou mais.`);
  }
  if (d.clientesParaLembrar > 0) {
    itens.push(`${plural(d.clientesParaLembrar, 'cliente para lembrar', 'clientes para lembrar')}: já passou o tempo de repetir o serviço desde o último atendimento.`);
  }

  let subject;
  if (valor) subject = `Você tem ${valor} a receber`;
  else if (d.propostasParadas > 0) {
    subject = d.propostasParadas === 1
      ? '1 proposta esperando resposta do cliente'
      : `${plural(d.propostasParadas, 'proposta', 'propostas')} esperando resposta dos clientes`;
  } else {
    subject = d.clientesParaLembrar === 1
      ? '1 cliente para lembrar de repetir o serviço'
      : `${plural(d.clientesParaLembrar, 'cliente', 'clientes')} para lembrar de repetir o serviço`;
  }

  const depois = [];
  if (d.semValor > 0) {
    depois.push(d.semValor === 1
      ? '1 orçamento aprovado está sem valor no cadastro e ficou fora desta conta.'
      : `${plural(d.semValor, 'orçamento aprovado', 'orçamentos aprovados')} estão sem valor no cadastro e ficaram fora desta conta.`);
  }

  return {
    subject,
    preview: 'O que está parado hoje e o que dá para resolver agora.',
    titulo: 'Seu resumo de hoje',
    paragrafos: ['Bom dia! Isto está esperando por você na OLLI Orçamentos:'],
    passos: itens,
    cta: { rotulo: 'Abrir o painel', href: urlCom(appUrl, '/') },
    depois: [
      ...depois,
      'No painel, você cobra ou lembra o cliente pelo WhatsApp com a mensagem já pronta.',
    ],
    motivo: 'Você recebe este resumo porque usa a OLLI Orçamentos, e ele só chega nos dias em que há algo esperando por você. Também dá para desligar no app ou no painel.',
    rotuloDescadastro: 'Parar de receber o resumo',
  };
}

/**
 * Renderiza o resumo. Falha FECHADO em qualquer dado fora do esperado — vira
 * dead_letter no consumer, nunca e-mail torto nem e-mail "você tem R$ 0".
 */
export function renderizarEmailResumoDinheiro(input = {}) {
  chavesExatas(input, INPUT_KEYS, 'input_template_invalido');
  const eventId = idSeguro(input.eventId);
  exigir(eventId, 'event_id_invalido');
  exigir(input.template === RESUMO_DINHEIRO.template, 'template_invalido');
  exigir(input.templateVersion === RESUMO_DINHEIRO.templateVersion, 'template_version_divergente');
  exigir(input.purpose === RESUMO_DINHEIRO.purpose, 'purpose_invalido');

  const appUrl = urlHttps(input.appUrl, 'app_url_invalida');
  const supportUrl = urlHttps(input.supportUrl, 'support_url_invalida').toString();
  const logoUrl = urlHttps(input.logoUrl, 'logo_url_invalida').toString();
  const unsubscribeUrl = urlHttps(input.unsubscribeUrl, 'unsubscribe_url_invalida').toString();

  validarDados(input.dados);
  const c = conteudo(input.dados, appUrl);
  exigir(c.subject.length <= 180 && !/[\r\n]/.test(c.subject), 'subject_invalido');

  const html = montarHtml(c, {
    logoSrc: atributoHtml(logoUrl),
    supportHref: atributoHtml(supportUrl),
    unsubscribeHref: atributoHtml(unsubscribeUrl),
  });
  const text = montarTexto(c, { supportUrl, unsubscribeUrl });

  return congelarProfundo({
    rendererVersion: RESUMO_DINHEIRO_RENDERER_VERSION,
    template: RESUMO_DINHEIRO.template,
    templateVersion: RESUMO_DINHEIRO.templateVersion,
    purpose: RESUMO_DINHEIRO.purpose,
    kind: 'lembrete',
    brand: EMAIL_LEMBRETES_BRAND,
    locale: 'pt-BR',
    eventId,
    subject: c.subject,
    preview: c.preview,
    html,
    text,
    unsubscribeUrl,
  });
}
