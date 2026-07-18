import { Empresa, Orcamento } from '../types';
import { formatCurrency } from './currency';
import { formatDateBR } from './date';

function primeiroNome(nome?: string): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
}

function resumoItens(orc: Orcamento): string {
  const nomes = orc.itens.slice(0, 3).map(i => i.nome.trim()).filter(Boolean);
  if (nomes.length === 0) return '';
  const restantes = orc.itens.length - nomes.length;
  const extra = restantes > 0 ? ` + mais ${restantes} ${restantes === 1 ? 'item' : 'itens'}` : '';
  return `${nomes.join(', ')}${extra}`;
}

function dadosComerciais(orc: Orcamento): string[] {
  const linhas = [
    `Total: ${formatCurrency(orc.valorTotal)}`,
    orc.validadeOrcamento ? `Validade: até ${formatDateBR(orc.validadeOrcamento)}` : '',
    orc.garantia ? `Garantia: ${orc.garantia}` : '',
    orc.condicoesPagamento ? `Pagamento: ${orc.condicoesPagamento}` : '',
  ];
  return linhas.filter(Boolean);
}

export function montarMensagemEnvioOrcamento(orc: Orcamento, empresa?: Empresa | null): string {
  const itens = resumoItens(orc);
  const contato = empresa?.telefone || empresa?.whatsapp;
  const linhas = [
    `Olá, ${primeiroNome(orc.clienteNome)}!`,
    '',
    `Preparei o orçamento nº ${orc.numero}${empresa?.nome ? ` da ${empresa.nome}` : ''}.`,
    itens ? `Inclui: ${itens}.` : '',
    ...dadosComerciais(orc),
    '',
    'Para aprovar, é só responder "aprovado" por aqui. Se quiser ajustar algum item, me chama que eu reviso rapidinho.',
    contato ? `Contato: ${contato}` : '',
  ];
  return linhas.filter((linha, index, arr) => linha || arr[index - 1]).join('\n').trim();
}

export function montarMensagemLinkOrcamento(orc: Orcamento, empresa: Empresa | null, url: string): string {
  const linhas = [
    `Olá, ${primeiroNome(orc.clienteNome)}!`,
    '',
    `Segue o orçamento nº ${orc.numero}${empresa?.nome ? ` da ${empresa.nome}` : ''}:`,
    url,
    '',
    ...dadosComerciais(orc),
    '',
    'Você pode abrir o link, conferir tudo e aprovar com um toque.',
  ];
  return linhas.filter((linha, index, arr) => linha || arr[index - 1]).join('\n').trim();
}

export function montarMensagemFollowUpOrcamento(orc: Orcamento, empresa?: Empresa | null): string {
  const linhas = [
    `Olá, ${primeiroNome(orc.clienteNome)}! Passando para saber se posso te ajudar com o orçamento nº ${orc.numero}.`,
    `Ele está em ${formatCurrency(orc.valorTotal)}${orc.validadeOrcamento ? ` e vale até ${formatDateBR(orc.validadeOrcamento)}` : ''}.`,
    'Se estiver tudo certo, posso deixar aprovado e combinar o próximo passo.',
    empresa?.telefone || empresa?.whatsapp ? `Contato: ${empresa.telefone || empresa.whatsapp}` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}

/**
 * Mensagem de WhatsApp para reconquistar um cliente sem contato há muito
 * tempo (Radar de clientes). Calorosa e profissional — nunca soa a cobrança.
 * `nomePrestador` é o nome do prestador/empresa (getEmpresa), se disponível.
 */
export function montarMensagemReconquista(nome: string, meses: number, nomePrestador?: string | null): string {
  const quem = (nomePrestador ?? '').trim();
  const linhas = [
    `Oi, ${primeiroNome(nome)}! ${quem ? `Aqui é ${quem}.` : 'Como vai?'}`,
    `Já faz ${meses} ${meses === 1 ? 'mês' : 'meses'} desde a nossa última manutenção e lembrei de você — passando pra saber se está tudo funcionando bem por aí.`,
    'Se quiser, posso passar para dar uma olhada geral e evitar problema maior lá na frente. Me chama por aqui quando puder!',
  ];
  return linhas.filter(Boolean).join('\n');
}

/**
 * Mensagem de WhatsApp para cobrar um orçamento APROVADO que ainda não tem
 * recibo (Radar de cobrança). O cliente já disse sim — só falta fechar o
 * pagamento — então o tom é direto mas cordial, nunca de pressão. Só menciona
 * "N dias" quando isso ajuda (>= 3 dias parado); orçamento aprovado ontem não
 * precisa soar como cobrança atrasada.
 */
export function montarMensagemCobranca(orc: Orcamento, diasParado: number, pixCopiaECola?: string): string {
  // Tom escalonado por tempo parado (dunning cordial): recém-aprovado é leve;
  // quanto mais dias, mais direto — sem nunca soar a cobrança agressiva.
  const corpo =
    diasParado >= 7
      ? `Já faz ${diasParado} dias e o pagamento ainda não caiu — consigo te ajudar a resolver isso hoje?`
      : diasParado >= 3
        ? `Já faz ${diasParado} dias e ainda não recebi o pagamento — posso te ajudar a fechar isso?`
        : 'Posso te ajudar a fechar o pagamento?';

  const linhas = [
    `Olá, ${primeiroNome(orc.clienteNome)}! Tudo certo com o orçamento nº ${orc.numero}, aprovado no valor de ${formatCurrency(orc.valorTotal)}.`,
    corpo,
  ];
  // Pix Copia e Cola PRONTO (valor já embutido): o cliente copia e paga na hora.
  // Fica na ÚLTIMA linha, sozinho, para ser fácil de selecionar/copiar no WhatsApp.
  if (pixCopiaECola) {
    linhas.push('Se preferir, dá pra pagar por Pix copiando o código abaixo (já vem com o valor):');
    linhas.push(pixCopiaECola);
  } else {
    linhas.push('Qualquer dúvida sobre forma de pagamento, é só me chamar por aqui.');
  }
  return linhas.filter(Boolean).join('\n');
}

/**
 * Mensagem de WhatsApp pedindo avaliação no Google, disparada pós-serviço
 * (mestre 1.4) — no recibo. Só é chamada quando `Empresa.linkGoogleAvaliacoes`
 * está preenchido (ver MeuNegocioScreen); o link vem PRONTO do cadastro, sem
 * nenhuma chamada à API do Google Business.
 */
export function montarMensagemPedidoAvaliacao(nomeCliente: string, linkGoogle: string, empresa?: Empresa | null): string {
  const quem = (empresa?.nomePrestador || empresa?.nome || '').trim();
  const linhas = [
    `Oi, ${primeiroNome(nomeCliente)}! ${quem ? `Aqui é ${quem}.` : ''}`.trim(),
    'Muito obrigado pela confiança no nosso serviço!',
    'Se puder, deixa uma avaliação rapidinha pra gente no Google — ajuda muito:',
    linkGoogle.trim(),
  ];
  return linhas.filter(Boolean).join('\n');
}

/**
 * Mensagem de WhatsApp para agradecer o cliente logo após emitir o recibo
 * (EmitirReciboScreen) — o pagamento acabou de cair, é o melhor momento para
 * um agradecimento caloroso. Sempre opcional/editável (abre pré-preenchida
 * no WhatsApp, quem envia é o prestador) e nunca disparada sozinha. `orc` é
 * o orçamento de origem do recibo, quando houver — usado só para citar o
 * serviço prestado; sem ele a mensagem sai igualmente calorosa, só sem essa linha.
 */
export function montarMensagemAgradecimento(nomeCliente: string, orc?: Orcamento | null, empresa?: Empresa | null): string {
  const quem = (empresa?.nomePrestador || empresa?.nome || '').trim();
  const itens = orc ? resumoItens(orc) : '';
  const linhas = [
    `Oi, ${primeiroNome(nomeCliente)}! ${quem ? `Aqui é ${quem}.` : ''}`.trim(),
    `Muito obrigado pela confiança${itens ? ` no serviço de ${itens}` : ''}!`,
    'Foi um prazer te atender. Qualquer coisa, é só me chamar por aqui.',
  ];
  return linhas.filter(Boolean).join('\n');
}

/**
 * Mensagem de WhatsApp pedindo indicação, disparada logo após o recibo ser
 * emitido (motor de boca-a-boca) — o cliente acabou de pagar satisfeito, é o
 * melhor momento para pedir que ele indique o prestador a conhecidos. Sempre
 * opcional/editável e nunca disparada sozinha; `orc` é opcional, só para
 * manter o mesmo padrão de assinatura de `montarMensagemAgradecimento`.
 */
export function montarMensagemPedidoIndicacao(nomeCliente: string, orc?: Orcamento | null, empresa?: Empresa | null): string {
  const quem = (empresa?.nomePrestador || empresa?.nome || '').trim();
  const contato = empresa?.telefone || empresa?.whatsapp;
  const linhas = [
    `Oi, ${primeiroNome(nomeCliente)}! ${quem ? `Aqui é ${quem}.` : ''}`.trim(),
    'Fico muito feliz em saber que posso contar com você.',
    'Se conhecer alguém que também precise desse tipo de serviço, pode passar meu contato — toda indicação ajuda demais o meu trabalho!',
    contato ? `Contato: ${contato}` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}
