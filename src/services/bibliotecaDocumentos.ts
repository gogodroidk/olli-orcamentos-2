import type { Orcamento, OrdemServico, PmocPlano, Recibo } from '../types';

export type DocumentoBibliotecaTipo =
  | 'orcamento'
  | 'contrato'
  | 'garantia'
  | 'conclusao'
  | 'recibo'
  | 'ordem_servico'
  | 'pmoc';

export type DocumentoBibliotecaStatus = 'rascunho' | 'pronto' | 'enviado' | 'assinado' | 'arquivado';

export type DocumentoBiblioteca = {
  id: string;
  tipo: DocumentoBibliotecaTipo;
  status: DocumentoBibliotecaStatus;
  titulo: string;
  clienteId?: string;
  clienteNome: string;
  origemTipo: 'orcamento' | 'recibo' | 'ordem_servico' | 'pmoc' | 'manual';
  origemId: string;
  origemNumero?: string;
  atualizadoEm: string;
};

export type BibliotecaEntrada = {
  orcamentos: Orcamento[];
  recibos: Recibo[];
  ordensServico: OrdemServico[];
  pmocPlanos: PmocPlano[];
};

function statusDoOrcamento(o: Orcamento): DocumentoBibliotecaStatus {
  if (o.assinaturaClienteUri) return 'assinado';
  if (o.status === 'rascunho') return 'rascunho';
  if (['enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura'].includes(o.status)) return 'enviado';
  return 'pronto';
}

function statusDoPmoc(situacao: PmocPlano['situacao']): DocumentoBibliotecaStatus {
  if (situacao === 'rascunho' || situacao === 'em_revisao') return 'rascunho';
  if (situacao === 'aprovado' || situacao === 'vigente') return 'assinado';
  if (situacao === 'encerrado') return 'arquivado';
  return 'pronto';
}

function docBase(
  id: string,
  tipo: DocumentoBibliotecaTipo,
  status: DocumentoBibliotecaStatus,
  titulo: string,
  clienteNome: string,
  origemTipo: DocumentoBiblioteca['origemTipo'],
  origemId: string,
  atualizadoEm: string,
  extras: Partial<DocumentoBiblioteca> = {},
): DocumentoBiblioteca {
  return { id, tipo, status, titulo, clienteNome, origemTipo, origemId, atualizadoEm, ...extras };
}

/**
 * Projeção read-only da biblioteca atual. Ela cruza fontes já existentes e não
 * inventa PDF/assinatura: o status deriva do registro real. A futura tabela de
 * documentos poderá substituir esta projeção sem mudar o contrato visual.
 */
export function construirBibliotecaDocumentos(entrada: BibliotecaEntrada): DocumentoBiblioteca[] {
  const documentos: DocumentoBiblioteca[] = [];
  for (const o of entrada.orcamentos) {
    const status = statusDoOrcamento(o);
    const origem = { origemTipo: 'orcamento' as const, origemId: o.id, origemNumero: o.numero, clienteId: o.clienteId, clienteNome: o.clienteNome, atualizadoEm: o.atualizadoEm };
    documentos.push(docBase(`orcamento:${o.id}`, 'orcamento', status, `Orçamento nº ${o.numero}`, o.clienteNome, 'orcamento', o.id, o.atualizadoEm, origem));
    documentos.push(docBase(`contrato:${o.id}`, 'contrato', o.assinaturaContratoUri ? 'assinado' : 'rascunho', `Contrato · orçamento nº ${o.numero}`, o.clienteNome, 'orcamento', o.id, o.atualizadoEm, origem));
    documentos.push(docBase(`garantia:${o.id}`, 'garantia', status === 'assinado' ? 'pronto' : 'rascunho', `Termo de garantia · orçamento nº ${o.numero}`, o.clienteNome, 'orcamento', o.id, o.atualizadoEm, origem));
    documentos.push(docBase(`conclusao:${o.id}`, 'conclusao', 'rascunho', `Termo de conclusão · orçamento nº ${o.numero}`, o.clienteNome, 'orcamento', o.id, o.atualizadoEm, origem));
  }
  for (const r of entrada.recibos) {
    documentos.push(docBase(
      `recibo:${r.id}`,
      'recibo',
      r.pdfEmitido === false ? 'pronto' : 'enviado',
      `Recibo nº ${r.numero}`,
      r.clienteNome,
      'recibo',
      r.id,
      r.atualizadoEm ?? r.criadoEm,
      { clienteId: r.clienteId, origemNumero: r.numero },
    ));
  }
  for (const o of entrada.ordensServico) {
    documentos.push(docBase(
      `os:${o.id}`,
      'ordem_servico',
      o.status === 'concluida' ? 'pronto' : 'rascunho',
      `Relatório da OS ${o.numero}`,
      o.clienteNome,
      'ordem_servico',
      o.id,
      o.atualizadoEm,
      { clienteId: o.clienteId, origemNumero: o.numero },
    ));
  }
  for (const p of entrada.pmocPlanos) {
    documentos.push(docBase(
      `pmoc:${p.id}`,
      'pmoc',
      statusDoPmoc(p.situacao),
      p.numero ? `PMOC ${p.numero} · ${p.titulo}` : `PMOC · ${p.titulo}`,
      '',
      'pmoc',
      p.id,
      p.atualizadoEm ?? p.criadoEm,
      { clienteId: p.clienteId, origemNumero: p.numero },
    ));
  }
  return documentos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export function buscarBibliotecaDocumentos(
  documentos: readonly DocumentoBiblioteca[],
  busca: string,
  status?: DocumentoBibliotecaStatus | 'todos',
): DocumentoBiblioteca[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return documentos.filter((doc) => {
    if (status && status !== 'todos' && doc.status !== status) return false;
    if (!termo) return true;
    return `${doc.titulo} ${doc.clienteNome} ${doc.origemNumero ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo);
  });
}

export function labelTipoDocumento(tipo: DocumentoBibliotecaTipo): string {
  return {
    orcamento: 'Orçamento', contrato: 'Contrato', garantia: 'Garantia', conclusao: 'Conclusão',
    recibo: 'Recibo', ordem_servico: 'OS', pmoc: 'PMOC',
  }[tipo];
}

export function labelStatusDocumento(status: DocumentoBibliotecaStatus): string {
  return {
    rascunho: 'Rascunho', pronto: 'Pronto', enviado: 'Enviado', assinado: 'Assinado', arquivado: 'Arquivado',
  }[status];
}
