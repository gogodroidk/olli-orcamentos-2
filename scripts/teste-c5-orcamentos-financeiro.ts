import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const dominio = ler('../src/types/index.ts');
const lista = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
const quadro = ler('../webapp/src/features/kanban/utils/colunas.ts');
const financeiro = ler('../webapp/src/pages/olli/inicio/financeiro.ts');
const inicio = ler('../webapp/src/pages/olli/inicio/index.tsx');
const radar = ler('../webapp/src/pages/olli/inicio/RadarDinheiroCard.tsx');

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

console.log('OK — revisão/duplicação, quadro de estados e financeiro operacional validados.');
