import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const dominio = ler('../src/types/index.ts');
const lista = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
const quadro = ler('../webapp/src/features/kanban/utils/colunas.ts');
const financeiro = ler('../webapp/src/pages/olli/inicio/financeiro.ts');
const pagamentos = ler('../src/services/pagamentos.ts');
const inicio = ler('../webapp/src/pages/olli/inicio/index.tsx');
const radar = ler('../webapp/src/pages/olli/inicio/RadarDinheiroCard.tsx');
const tabelaDesktop = ler('../src/screens/desktop/OrcamentosDesktopScreen.tsx');
const telaMobile = ler('../src/screens/OrcamentosScreen.tsx');
const badgeFinanceiro = ler('../src/components/FinanceiroBadge.tsx');
const inicioDesktop = ler('../src/screens/desktop/InicioDesktopScreen.tsx');
const navigator = ler('../src/navigation/AppNavigator.tsx');
const pdfGenerator = ler('../src/utils/pdfGenerator.ts');

for (const status of ['aprovado', 'convertido', 'recusado', 'cancelado']) {
  assert.match(dominio, new RegExp(`\\| '${status}'`), `status ${status} precisa existir no domínio`);
}
assert.match(quadro, /convertido:\s*"aprovado"/, 'orçamento convertido precisa continuar visível no quadro aprovado');
assert.match(quadro, /finalizados/, 'quadro precisa expor a coluna de serviços finalizados');
assert.match(ler('../webapp/src/features/kanban/hooks/useQuadro.ts'), /ordens_servico/, 'quadro precisa cruzar OS concluída com o orçamento');
assert.match(quadro, /id: ColunaId[\s\S]*outros/, 'status desconhecido precisa cair em Outros e não sumir');
assert.match(lista, /criarRevisaoComoRascunho/, 'orçamento enviado deve gerar revisão sem sobrescrever histórico');
assert.match(lista, /duplicarComoRascunho/, 'duplicação precisa partir do blob completo');
assert.match(lista, /useExcluir/, 'remoção precisa ser soft delete');
assert.match(financeiro, /calcularRecebidoNoMes/, 'recebido do mês precisa usar recibos e data confiável');
assert.match(financeiro, /calcularTaxaAprovacao/, 'taxa de aprovação precisa ter denominador explicável');
assert.match(financeiro, /listarDinheiroParado/, 'contas a receber precisam descontar recibos');
assert.match(financeiro, /orcamentosFinalizados/, 'dinheiro parado precisa excluir serviços já finalizados');
assert.match(radar, /Não foi possível ler o dinheiro parado/, 'erro financeiro não pode virar saldo zero silencioso');
assert.match(inicio, /A RECEBER/, 'a tela inicial precisa expor contas a receber');
assert.match(tabelaDesktop, /getRecibos/, 'a tabela desktop precisa carregar recibos para o estado financeiro');
assert.match(tabelaDesktop, /FinanceiroBadge/, 'a tabela desktop precisa exibir o estado financeiro');
assert.match(telaMobile, /FinanceiroBadge/, 'a lista mobile precisa exibir o estado financeiro');
assert.match(telaMobile, /recarregarRecibos/, 'a lista mobile precisa atualizar recibos ao voltar para a tela');
assert.match(badgeFinanceiro, /getBadgeFinanceiro/, 'o badge financeiro precisa reutilizar o contrato de estados');
assert.match(pagamentos, /Aguardando pagamento/, 'o contrato financeiro precisa explicar o estado pendente');
assert.match(pagamentos, /Recibo emitido/, 'o contrato financeiro precisa distinguir recibo formal');
assert.match(pagamentos, /comercialRecebivel/, 'o estado financeiro deve sobreviver a uma mudança comercial posterior');
assert.match(telaMobile, /usePermissao/, 'ações financeiras mobile precisam de gate de papel');
assert.match(telaMobile, /podeFinanceiro/, 'recibo e pagamento não podem aparecer para técnico sem permissão');
assert.match(ler('../webapp/src/pages/olli/recibos/FormRecibo.tsx'), /ultrapassa\)/, 'painel web precisa bloquear recebimento acima do saldo');
assert.match(inicioDesktop, /irParaOrcamentos\('em_aberto'\)/, 'KPI em aberto precisa abrir seu recorte');
assert.match(inicioDesktop, /irParaOrcamentos\('a_receber'\)/, 'KPI a receber precisa abrir seu recorte');
assert.match(navigator, /recorteInicial\?: 'em_aberto' \| 'a_receber'/, 'o recorte inicial precisa ser tipado na aba desktop');
assert.match(tabelaDesktop, /recorteInicial === 'a_receber'/, 'a lista precisa aplicar o recorte a receber');
assert.match(pdfGenerator, /MODELOS_PDF_VALIDOS/, 'modeloPdf precisa passar por whitelist antes de virar classe HTML');
assert.match(pdfGenerator, /modeloPdfSeguro/, 'o PDF precisa usar o modelo sanitizado');
assert.match(pdfGenerator, /function renderSinal/, 'o PDF precisa renderizar o sinal configurado');
assert.match(pdfGenerator, /Saldo restante/, 'o PDF precisa informar o saldo após a entrada');

// ─── Duplicar e Criar revisão: base única que zera o que não pertence ao novo ───
// (achado B67: o duplicado para OUTRO cliente saía com a assinatura de contrato do
// cliente anterior, a validade vencida e a trilha de renumeração do original).
const { baseParaNovoDocumento, validadeAPartirDe, diasDeValidade, VALIDADE_DIAS_PADRAO } = await import('../src/utils/novoDocumento.ts');
const { formatarDataBR } = await import('../src/utils/formatarData.ts');
const { montarMensagemCobrancaLink, montarMensagemLinkOrcamento } = await import('../src/utils/mensagensOrcamento.ts');

const original = {
  id: 'orig-1', numero: '011/26', clienteId: 'cli-a', clienteNome: 'Maria Souza', clienteTelefone: '11999990000',
  itens: [{ id: 'item-1', nome: 'Limpeza split', quantidade: 1, unidade: 'un', preco: 250, subtotal: 250, tipo: 'servico' }],
  subtotalServicos: 250, subtotalProdutos: 0, subtotal: 250, desconto: 0, descontoTipo: 'valor', valorTotal: 250,
  status: 'aprovado', dataEmissao: '2026-05-01', dataVisitaTecnica: '02/05/2026', dataPrestacaoServico: '03/05/2026',
  agendamentoServico: '04/05/2026', formasPagamento: {}, sinalPercentual: 30, sinalData: '05/05/2026',
  exibirAssinatura: true, solicitarAssinaturaCliente: true,
  assinaturaPrestadorUri: 'data:prestador', assinaturaClienteUri: 'data:cliente', dataAssinaturaCliente: '2026-05-02T10:00:00.000Z',
  assinaturaContratoUri: 'data:contrato', dataAssinaturaContrato: '2026-05-02T10:05:00.000Z',
  validadeOrcamento: '2026-05-12T16:14:14.684482+00:00', exibirAprovacao: true, exibirRecusa: true,
  criadoDeModeloId: 'modelo-x', criadoEm: '2026-05-01T12:00:00.000Z', atualizadoEm: '2026-05-02T12:00:00.000Z',
  editadoEm: '2026-05-01T13:00:00.000Z', numeroAnterior: '010/26', renumeradoEm: '2026-05-01T12:30:00.000Z',
  excluidoEm: '2026-05-03T00:00:00.000Z',
} as unknown as import('../src/types/index.ts').Orcamento;

let seq = 0;
const gerarId = () => `novo-item-${++seq}`;
const agora = new Date(2026, 8, 30, 21, 0, 0); // 30/09/2026 21h local
const dup = baseParaNovoDocumento({ origem: original, modo: 'duplicar', id: 'dup-1', numero: '012/26', gerarId, empresa: { validadeDiasPadrao: 10 }, agora });

assert.equal(dup.id, 'dup-1');
assert.equal(dup.numero, '012/26');
assert.equal(dup.status, 'rascunho');
assert.equal(dup.dataEmissao, '2026-09-30', 'emissão é hoje no fuso local');
assert.equal(dup.validadeOrcamento, '10/10/2026', 'validade recalculada a partir de hoje pelo padrão da empresa');
for (const campo of [
  'assinaturaClienteUri', 'dataAssinaturaCliente', 'assinaturaContratoUri', 'dataAssinaturaContrato', 'assinaturaPrestadorUri',
  'dataVisitaTecnica', 'dataPrestacaoServico', 'agendamentoServico', 'sinalData',
  'numeroAnterior', 'renumeradoEm', 'editadoEm', 'excluidoEm', 'criadoDeModeloId',
  'revisaoDeId', 'revisaoDeNumero', 'revisaoCriadaEm',
] as const) {
  assert.equal(dup[campo], undefined, `duplicar precisa zerar ${campo}`);
}
assert.equal(dup.itens[0].id, 'novo-item-1', 'itens ganham ids novos');
assert.equal(original.itens[0].id, 'item-1', 'o original não é alterado');
assert.equal(dup.sinalPercentual, 30, 'condições comerciais (sinal %) continuam');
assert.equal(dup.criadoEm, agora.toISOString());

const rev = baseParaNovoDocumento({ origem: original, modo: 'revisao', id: 'rev-1', numero: '013/26', gerarId, agora });
assert.equal(rev.revisaoDeId, 'orig-1');
assert.equal(rev.revisaoDeNumero, '011/26');
assert.equal(rev.revisaoCriadaEm, agora.toISOString());
assert.equal(rev.assinaturaContratoUri, undefined, 'revisão também não herda assinatura de contrato');
assert.equal(rev.numeroAnterior, undefined, 'revisão não herda a renumeração do original');
assert.equal(rev.validadeOrcamento, validadeAPartirDe(agora, VALIDADE_DIAS_PADRAO), 'sem empresa, 15 dias');
const revDaRev = baseParaNovoDocumento({ origem: rev, modo: 'revisao', id: 'rev-2', numero: '014/26', gerarId, agora });
assert.equal(revDaRev.revisaoDeId, 'orig-1', 'a cadeia de revisões aponta sempre para o original');
const semValidade = baseParaNovoDocumento({ origem: { ...original, validadeOrcamento: '' }, modo: 'duplicar', id: 'x', numero: '1', gerarId, agora });
assert.equal(semValidade.validadeOrcamento, undefined, 'quem tirou a validade de propósito continua sem');
assert.equal(diasDeValidade({ validadeDiasPadrao: 0 }), 15, 'padrão inválido cai em 15 dias');
assert.equal(validadeAPartirDe(new Date(2026, 11, 25), 10), '04/01/2027', 'virada de ano');

// As duas telas usam a base única (nada de cópia manual que esquece campo).
const telaDetalhe = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
assert.match(telaMobile, /baseParaNovoDocumento/, 'a lista precisa duplicar/revisar pela base única');
assert.match(telaDetalhe, /baseParaNovoDocumento/, 'o detalhe precisa duplicar/revisar pela base única');
assert.doesNotMatch(telaMobile, /assinaturaClienteUri: undefined/, 'a lista não pode voltar a montar a cópia à mão');
assert.doesNotMatch(telaDetalhe, /assinaturaClienteUri: undefined/, 'o detalhe não pode voltar a montar a cópia à mão');

// Lista: ações por status e Excluir no menu ⋯.
assert.match(telaMobile, /function acoesDaLinha/, 'a lista precisa decidir as ações pelo status');
assert.match(telaMobile, /'Cobrar resposta'/, 'proposta com o cliente oferece "Cobrar resposta"');
assert.match(telaMobile, /escolherNoMenu\('excluir'\)/, 'Excluir mora no menu ⋯');
assert.doesNotMatch(telaMobile, /onPress=\{\(\) => onExcluir\(o\)\}/, 'Excluir não pode voltar a ficar em todo card');

// ─── Detalhe do orçamento (item 1.10) ───
// Datas: validade aparecia crua ("2026-05-12T16:14:14.684482+00:00", achado B06).
assert.equal(formatarDataBR('12/05/2026'), '12/05/2026');
assert.equal(formatarDataBR('2/5/2026'), '02/05/2026');
assert.equal(formatarDataBR('2026-05-12'), '12/05/2026');
assert.match(formatarDataBR('2026-05-12T16:14:14.684482+00:00'), /^1[12]\/05\/2026$/, 'timestamp do Postgres vira dia legível');
assert.equal(formatarDataBR('2026-05-12 15:00:00'), '12/05/2026');
assert.equal(formatarDataBR('em 30 dias'), 'em 30 dias', 'texto livre não some');
assert.equal(formatarDataBR('31/02/2026'), '31/02/2026', 'data impossível fica como veio, sem inventar');
assert.equal(formatarDataBR(undefined), '');
assert.match(telaDetalhe, /formatarDataBR\(orc\.validadeOrcamento\)/, 'a validade aparece formatada no detalhe');

// Cobrança vai com o LINK #pagar, nunca com o BR Code no meio do texto (B22).
const cobranca = montarMensagemCobrancaLink(original, 1, 'https://link.exemplo/o/abc#pagar', { comPix: true });
assert.match(cobranca, /https:\/\/link\.exemplo\/o\/abc#pagar$/, 'o link de pagamento fecha a mensagem');
assert.doesNotMatch(cobranca, /000201/, 'nenhum BR Code no texto');
assert.match(cobranca, /paga por Pix/);
const cobrancaParcial = montarMensagemCobrancaLink(original, 8, 'https://l/o/x#pagar', { comPix: false, valorEmAberto: 100 });
assert.match(cobrancaParcial, /Falta R\$\s?100,00/, 'pagamento parcial cita o saldo');
assert.doesNotMatch(cobrancaParcial, /paga por Pix/, 'sem chave Pix a mensagem não promete Pix');
assert.match(telaDetalhe, /#pagar/, 'o detalhe cobra com o link #pagar');
// A página pública só mostra o Pix (do TOTAL) quando o cliente aprovou pelo link:
// o link só vai na cobrança nesse caso e nunca com pagamento parcial + Pix.
assert.match(telaDetalhe, /link\?\.status !== 'aprovado' \|\| \(comPix && saldo !== undefined\)/, 'cobrança só manda o link quando a página mostra o Pix certo');
// Republicar o link de um orçamento que o cliente já aprovou não pode voltar o
// status público para 'enviado' (a página pediria "Aprovar" de novo e sumiria o Pix).
const clienteLinkSrc = ler('../src/services/clienteLink.ts');
// (o reenvio atualiza SÓ o snapshot, sem status: o status é a resposta do cliente).
assert.match(clienteLinkSrc, /\.update\(conteudo\)\s*\.eq\('token', reusado\)/, 'reenvio atualiza só o snapshot do link existente');
// O conteúdo agora nasce em `conteudoDoLink` (clienteLinkSnapshot.ts, compartilhado com o painel).
const snapshotLinkSrc = ler('../src/services/clienteLinkSnapshot.ts');
assert.match(clienteLinkSrc, /const conteudo = conteudoDoLink\(orc, empresa, cobranca\);\s*const baseRow/, 'o app monta o conteúdo do link por conteudoDoLink');
assert.doesNotMatch(snapshotLinkSrc.slice(snapshotLinkSrc.indexOf('export function conteudoDoLink')), /status:/, 'o snapshot republicado não leva status (preserva o aprovado do link)');
// Lista: "Criar revisão" do card (recusado/expirado/cancelado) cria a revisão de fato.
assert.match(telaMobile, /label: 'Criar revisão', cor: cores\.primary, onPress: \(\) => onRevisar\(o\)/, 'Criar revisão do card não pode abrir o original no editor');
assert.match(telaDetalhe, /montarMensagemCobrancaLink/, 'o detalhe usa a mensagem com link');

// Envio: WhatsApp no número do cliente com o link de aprovação, e "Conseguiu enviar?".
const envio = montarMensagemLinkOrcamento(original, null, 'https://link.exemplo/o/abc');
assert.match(envio, /https:\/\/link\.exemplo\/o\/abc/);
assert.match(envio, /Validade: até 1[12]\/05\/2026/, 'a validade da mensagem também sai formatada');
assert.match(telaDetalhe, /gerarLinkOrcamento\(orc, empresa\)[\s\S]*montarMensagemLinkOrcamento/, 'WhatsApp manda o link de aprovação');
assert.match(telaDetalhe, /Conseguiu enviar/, 'abrir o WhatsApp não marca enviado sem confirmação');
assert.match(telaDetalhe, /cardAcao/, 'o card do topo muda com o status');
assert.match(telaDetalhe, /PixCobrancaModal/, '"Mostrar QR" liga o modal de Pix');
assert.match(telaDetalhe, /navigate\('OrdemServico', \{ ordemId: os\.id \}\)/, 'Criar OS abre a OS criada');
const modalPix = ler('../src/components/PixCobrancaModal.tsx');
assert.match(modalPix, /Share\.share\(\{ message: brcode \}\)/, 'o modal manda o código Pix sozinho');

console.log('OK — revisão/duplicação, quadro de estados e financeiro operacional validados.');
