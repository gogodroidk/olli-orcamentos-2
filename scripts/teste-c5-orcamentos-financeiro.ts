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
assert.match(quadro, /id: ColunaId[\s\S]*outros/, 'status desconhecido precisa cair em Outros e não sumir');
assert.match(lista, /criarRevisaoComoRascunho/, 'orçamento enviado deve gerar revisão sem sobrescrever histórico');
assert.match(lista, /duplicarComoRascunho/, 'duplicação precisa partir do blob completo');
assert.match(lista, /useExcluir/, 'remoção precisa ser soft delete');
assert.match(financeiro, /calcularRecebidoNoMes/, 'recebido do mês precisa usar recibos e data confiável');
assert.match(financeiro, /calcularTaxaAprovacao/, 'taxa de aprovação precisa ter denominador explicável');
assert.match(financeiro, /listarDinheiroParado/, 'contas a receber precisam descontar recibos');
assert.match(radar, /Não foi possível ler o dinheiro parado/, 'erro financeiro não pode virar saldo zero silencioso');
assert.match(inicio, /A RECEBER/, 'a tela inicial precisa expor contas a receber');
assert.match(tabelaDesktop, /getRecibos/, 'a tabela desktop precisa carregar recibos para o estado financeiro');
assert.match(tabelaDesktop, /FinanceiroBadge/, 'a tabela desktop precisa exibir o estado financeiro');
assert.match(telaMobile, /FinanceiroBadge/, 'a lista mobile precisa exibir o estado financeiro');
assert.match(telaMobile, /recarregarRecibos/, 'a lista mobile precisa atualizar recibos ao voltar para a tela');
assert.match(badgeFinanceiro, /getBadgeFinanceiro/, 'o badge financeiro precisa reutilizar o contrato de estados');
assert.match(pagamentos, /Aguardando pagamento/, 'o contrato financeiro precisa explicar o estado pendente');
assert.match(pagamentos, /Recibo emitido/, 'o contrato financeiro precisa distinguir recibo formal');
assert.match(inicioDesktop, /irParaOrcamentos\('em_aberto'\)/, 'KPI em aberto precisa abrir seu recorte');
assert.match(inicioDesktop, /irParaOrcamentos\('a_receber'\)/, 'KPI a receber precisa abrir seu recorte');
assert.match(navigator, /recorteInicial\?: 'em_aberto' \| 'a_receber'/, 'o recorte inicial precisa ser tipado na aba desktop');
assert.match(tabelaDesktop, /recorteInicial === 'a_receber'/, 'a lista precisa aplicar o recorte a receber');
assert.match(pdfGenerator, /MODELOS_PDF_VALIDOS/, 'modeloPdf precisa passar por whitelist antes de virar classe HTML');
assert.match(pdfGenerator, /modeloPdfSeguro/, 'o PDF precisa usar o modelo sanitizado');
assert.match(pdfGenerator, /function renderSinal/, 'o PDF precisa renderizar o sinal configurado');
assert.match(pdfGenerator, /Saldo restante/, 'o PDF precisa informar o saldo após a entrada');

console.log('OK — revisão/duplicação, quadro de estados e financeiro operacional validados.');
