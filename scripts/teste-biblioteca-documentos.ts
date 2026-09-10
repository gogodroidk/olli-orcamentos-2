import { construirBibliotecaDocumentos, buscarBibliotecaDocumentos } from '../src/services/bibliotecaDocumentos.ts';

const ok = (nome: string, condicao: boolean) => {
  if (!condicao) throw new Error(`FALHA: ${nome}`);
  console.log(`  ok   ${nome}`);
};

const base = {
  clienteId: 'c1', clienteNome: 'Ana Souza', numero: '000126', status: 'aprovado',
  assinaturaClienteUri: undefined, assinaturaContratoUri: undefined,
  atualizadoEm: '2026-09-10T10:00:00.000Z', criadoEm: '2026-09-10T09:00:00.000Z',
} as any;

const docs = construirBibliotecaDocumentos({
  orcamentos: [{ ...base, id: 'o1' }],
  recibos: [{ id: 'r1', numero: 'REC-0001', orcamentoId: 'o1', clienteId: 'c1', clienteNome: 'Ana Souza', valorRecebido: 100, pdfEmitido: false, criadoEm: '2026-09-10T11:00:00.000Z', dataRecebimento: '10/09/2026' } as any],
  ordensServico: [{ id: 'os1', numero: 'OS-0001', clienteId: 'c1', clienteNome: 'Ana Souza', titulo: 'Instalação', status: 'concluida', atualizadoEm: '2026-09-10T12:00:00.000Z' } as any],
  pmocPlanos: [{ id: 'p1', titulo: 'PMOC Loja', situacao: 'vigente', clienteId: 'c1', criadoEm: '2026-09-10T08:00:00.000Z' } as any],
});

console.log('\nBiblioteca de documentos — projeção por origem');
ok('gera orçamento + contrato + garantia + conclusão', docs.filter(d => d.origemId === 'o1').length === 4);
ok('recibo preserva estado pronto quando PDF ainda não saiu', docs.find(d => d.id === 'recibo:r1')?.status === 'pronto');
ok('OS concluída vira documento pronto', docs.find(d => d.id === 'os:os1')?.status === 'pronto');
ok('PMOC vigente vira documento assinado', docs.find(d => d.id === 'pmoc:p1')?.status === 'assinado');
ok('busca por cliente cruza origens', buscarBibliotecaDocumentos(docs, 'ana souza').length >= 6);
ok('filtro por rascunho é fechado', buscarBibliotecaDocumentos(docs, '', 'rascunho').every(d => d.status === 'rascunho'));
ok('lista sai ordenada pelo último evento', docs[0].id === 'os:os1');
console.log('PASSOU: 7 verificações');
