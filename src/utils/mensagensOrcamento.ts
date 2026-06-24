import { Empresa, Orcamento } from '../types';
import { formatCurrency } from './currency';

function primeiroNome(nome?: string): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
}

function resumoItens(orc: Orcamento): string {
  const nomes = orc.itens.slice(0, 3).map(i => i.nome.trim()).filter(Boolean);
  if (nomes.length === 0) return '';
  const extra = orc.itens.length > nomes.length ? ` + ${orc.itens.length - nomes.length} item(ns)` : '';
  return `${nomes.join(', ')}${extra}`;
}

function dadosComerciais(orc: Orcamento): string[] {
  const linhas = [
    `Total: ${formatCurrency(orc.valorTotal)}`,
    orc.validadeOrcamento ? `Validade: até ${orc.validadeOrcamento}` : '',
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
    `Ele está em ${formatCurrency(orc.valorTotal)}${orc.validadeOrcamento ? ` e vale até ${orc.validadeOrcamento}` : ''}.`,
    'Se estiver tudo certo, posso deixar aprovado e combinar o próximo passo.',
    empresa?.telefone || empresa?.whatsapp ? `Contato: ${empresa.telefone || empresa.whatsapp}` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}
