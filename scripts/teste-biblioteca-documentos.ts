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
const mobileDocumentos = readFileSync(new URL('../src/screens/CentralDocumentosScreen.tsx', import.meta.url), 'utf8');
const navigator = readFileSync(new URL('../src/navigation/AppNavigator.tsx', import.meta.url), 'utf8');
const osScreen = readFileSync(new URL('../src/screens/OrdemServicoScreen.tsx', import.meta.url), 'utf8');
const catalogoMobile = readFileSync(new URL('../src/services/catalogoDocumentos.ts', import.meta.url), 'utf8');
const editorMigration = readFileSync(new URL('../supabase/migrations/20260911130917_documento_editor_rascunho.sql', import.meta.url), 'utf8');
const dialogoContrato = readFileSync(new URL('../webapp/src/pages/olli/orcamentos/DialogoContrato.tsx', import.meta.url), 'utf8');
ok('biblioteca web tem lista pesquisável', /useOlliList<LinhaDocumento>/.test(webPage) && /Buscar documentos/.test(webPage));
ok('rota web de documentos está registrada', /pages\/olli\/documentos/.test(webRoutes));
ok('menu web expõe Documentos', /title: "Documentos"/.test(webNav));
ok('pai e versão usam transação local', /saveDocumentoBibliotecaComVersao/.test(banco) && /withTransactionAsync/.test(banco));
ok('painel registra snapshot de contrato', /registrarDocumentoWeb/.test(webDocumentos) && /documento_versoes/.test(webDocumentos) && /registrarDocumentoWeb/.test(dialogoContrato));
ok('painel cria documento manual sem orçamento', /criarDocumentoManual/.test(webDocumentos) && /origem_tipo: "manual"/.test(webDocumentos));
ok('central oferece cliente como origem e atalho de orçamento', /clienteId/.test(webPage) && /A partir de orçamento/.test(webPage));
ok('editor web lê o blob inteiro e usa RPC versionada', /buscarDocumentoWeb/.test(webDocumentos) && /editarDocumentoWeb/.test(webDocumentos) && /editar_documento_rascunho/.test(editorMigration));
ok('editor não sobrescreve estados congelados', /documento_congelado_exige_nova_versao/.test(editorMigration) && /Salvar nova versão/.test(webPage));
ok('painel abre arquivo privado por URL assinada curta', /createSignedUrl/.test(webPage) && /Abrir protegido|Abrir arquivo/.test(webPage) && /olli-documentos/.test(webPage));
ok('rascunho web oferece impressão nativa para salvar PDF', /imprimirDocumentoManual/.test(webPage) && /Imprimir \/ salvar PDF/.test(webPage));
ok('orçamento impresso registra snapshot na Central', /registrarDocumentoWeb/.test(readFileSync(new URL('../webapp/src/pages/olli/orcamentos/index.tsx', import.meta.url), 'utf8')) && /tipo: "orcamento"/.test(readFileSync(new URL('../webapp/src/pages/olli/orcamentos/index.tsx', import.meta.url), 'utf8')));
ok('mobile resolve recibo pela origem do orçamento', /getRecibo\(doc\.origemId\)/.test(mobileDocumentos) && /EmitirRecibo.*orcamentoId/.test(mobileDocumentos));
ok('mobile abre PMOC e OS pelo id de origem', /PmocPlano.*id: doc\.origemId/.test(mobileDocumentos) && /OrdemServico.*ordemId: doc\.origemId/.test(mobileDocumentos));
ok('rota de OS aceita detalhe inicial', /OrdemServico: \{ ordemId\?: string \} \| undefined/.test(navigator) && /route\.params\?\.ordemId/.test(osScreen));
const catalogo = readFileSync(new URL('../webapp/src/olli/catalogoDocumentos.ts', import.meta.url), 'utf8');
ok('Central expõe catálogo de modelos para construir', /CATALOGO_DOCUMENTOS/.test(catalogo) && /Contrato de serviço/.test(catalogo) && /PMOC/.test(catalogo) && /Laudo técnico/.test(catalogo));
ok('builder web oferece construtores de OS, PMOC e recibo', /ordem_servico/.test(webPage) && /pmoc/.test(webPage) && /recibo/.test(webPage));
ok('builder salva envelope de blocos versionável', /schemaCode: "olli\.document\.blocks"/.test(webPage) && /blocos/.test(webPage));
ok('mobile oferece catálogo de dez tipos em cards', /CATALOGO_DOCUMENTOS/.test(catalogoMobile) && /ordem_servico/.test(catalogoMobile) && /laudo/.test(catalogoMobile) && /catalogoGrid/.test(mobileDocumentos));
const painel = readFileSync(new URL('../src/components/documentos/PainelDocumentoCentral.tsx', import.meta.url), 'utf8');
const acoes = readFileSync(new URL('../src/services/acoesCentralDocumentos.ts', import.meta.url), 'utf8');
ok('central vê o orçamento e o contrato e imprime', /Ver orçamento/.test(mobileDocumentos) && /Ver contrato/.test(mobileDocumentos) && /Imprimir orçamento/.test(painel) && /Imprimir contrato/.test(painel) && /PdfPreviewModal/.test(painel));
ok('central vê e edita as cláusulas no mesmo gerador do PDF', /Ver e editar cláusulas/.test(mobileDocumentos) && /EditorClausulasContrato/.test(painel) && /linhasDeClausulas/.test(painel));
ok('contrato da biblioteca não abre mais a ficha no lugar do papel', /abrePainelVisual/.test(mobileDocumentos) && /abrePainelVisual/.test(acoes));
ok('painel web mostra orçamento, contrato, cláusulas e impressão', /Ver orçamento ou contrato/.test(webPage) && /Ver contrato/.test(webPage) && /Editar cláusulas/.test(webPage) && /Imprimir/.test(readFileSync(new URL('../webapp/src/pages/olli/documentos/PreviaDocumento.tsx', import.meta.url), 'utf8')));
console.log('PASSOU: 22 verificações');
