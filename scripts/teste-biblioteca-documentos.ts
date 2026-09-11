import { construirBibliotecaDocumentos, buscarBibliotecaDocumentos } from '../src/services/bibliotecaDocumentos.ts';
import { readFileSync } from 'node:fs';

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
const webPage = readFileSync(new URL('../webapp/src/pages/olli/documentos/index.tsx', import.meta.url), 'utf8');
const webRoutes = readFileSync(new URL('../webapp/src/routes/sections/dashboard/frontend.tsx', import.meta.url), 'utf8');
const webNav = readFileSync(new URL('../webapp/src/layouts/dashboard/nav/nav-data/nav-data-frontend.tsx', import.meta.url), 'utf8');
const banco = readFileSync(new URL('../src/database/database.ts', import.meta.url), 'utf8');
const webDocumentos = readFileSync(new URL('../webapp/src/olli/documentos.ts', import.meta.url), 'utf8');
const editorMigration = readFileSync(new URL('../supabase/migrations/20260911130917_documento_editor_rascunho.sql', import.meta.url), 'utf8');
const dialogoContrato = readFileSync(new URL('../webapp/src/pages/olli/orcamentos/DialogoContrato.tsx', import.meta.url), 'utf8');
ok('biblioteca web tem lista pesquisável', /useOlliList<LinhaDocumento>/.test(webPage) && /Buscar documentos/.test(webPage));
ok('rota web de documentos está registrada', /pages\/olli\/documentos/.test(webRoutes));
ok('menu web expõe Documentos', /title: "Documentos"/.test(webNav));
ok('pai e versão usam transação local', /saveDocumentoBibliotecaComVersao/.test(banco) && /withTransactionAsync/.test(banco));
ok('painel registra snapshot de contrato', /registrarDocumentoWeb/.test(webDocumentos) && /documento_versoes/.test(webDocumentos) && /registrarDocumentoWeb/.test(dialogoContrato));
ok('editor web lê o blob inteiro e usa RPC versionada', /buscarDocumentoWeb/.test(webDocumentos) && /editarDocumentoWeb/.test(webDocumentos) && /editar_documento_rascunho/.test(editorMigration));
ok('editor não sobrescreve estados congelados', /documento_congelado_exige_nova_versao/.test(editorMigration) && /Salvar nova versão/.test(webPage));
console.log('PASSOU: 14 verificações');
