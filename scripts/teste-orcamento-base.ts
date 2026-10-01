/**
 * Base comum do orçamento novo (src/utils/orcamentoBase.ts) — wizard e OLLI Voz.
 * Garante: padrões da empresa, número vazio até salvar, totais com round2,
 * vínculo conservador do nome falado ao cliente cadastrado e o catálogo da voz
 * levando PRODUTOS (não só serviços). Confere também que as duas telas usam a
 * MESMA base (sem cópia local voltando a divergir).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Cliente, Empresa, ItemOrcamento } from '../src/types';
import {
  CATALOGO_VOZ_MAX,
  CATALOGO_VOZ_MAX_SERVICOS,
  FORMAS_PAGAMENTO_VAZIAS,
  calcTotais,
  casarClientePorNome,
  catalogoParaVoz,
  clienteParaOrc,
  emptyOrcamento,
  normalizarNome,
  round2,
  validadeEmDias,
} from '../src/utils/orcamentoBase.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
let seq = 0;
const novoId = () => `id-${++seq}`;

// ─── 1. Padrões da empresa ────────────────────────────────────────────────────
const empresa = {
  validadeDiasPadrao: 30,
  garantiaPadrao: '90 dias',
  condicoesPagamentoPadrao: '50% na aprovação',
  observacoesPadrao: 'Valores sujeitos a vistoria.',
  corMarca: '#123456',
  modeloPdfPadrao: 'minimalista',
} as unknown as Empresa;

const comEmpresa = emptyOrcamento('', empresa, novoId);
assert.equal(comEmpresa.numero, '', 'número fica vazio até salvar (não queima sequência ao abrir)');
assert.equal(comEmpresa.validadeOrcamento, validadeEmDias(30));
assert.equal(comEmpresa.garantia, '90 dias');
assert.equal(comEmpresa.condicoesPagamento, '50% na aprovação');
assert.equal(comEmpresa.informacoesAdicionais, 'Valores sujeitos a vistoria.');
assert.equal(comEmpresa.corMarca, '#123456');
assert.equal(comEmpresa.modeloPdf, 'minimalista');
assert.deepEqual(comEmpresa.formasPagamento, FORMAS_PAGAMENTO_VAZIAS);
assert.equal(comEmpresa.status, 'rascunho');

const semEmpresa = emptyOrcamento('00126', null, novoId);
assert.equal(semEmpresa.numero, '00126');
assert.equal(semEmpresa.validadeOrcamento, validadeEmDias(15), 'sem padrão: 15 dias');
assert.equal(semEmpresa.garantia, undefined);
assert.notEqual(emptyOrcamento('', null, novoId).id, semEmpresa.id, 'cada orçamento ganha id próprio');

assert.equal(validadeEmDias(10, new Date(2026, 0, 25)), '04/02/2026');

// ─── 2. Totais com round2 ────────────────────────────────────────────────────
const item = (tipo: 'servico' | 'produto', preco: number, quantidade: number): ItemOrcamento => ({
  id: `${tipo}-${preco}-${quantidade}`, tipo, catalogoId: '', nome: 'x', preco, quantidade, unidade: 'un',
  subtotal: round2(preco * quantidade),
});
const totais = calcTotais({ ...semEmpresa, itens: [item('servico', 0.1, 3), item('produto', 19.99, 3)] });
assert.equal(totais.subtotalServicos, 0.3, '0.1 × 3 não vira 0.30000000000000004');
assert.equal(totais.subtotalProdutos, 59.97);
assert.equal(totais.subtotal, 60.27);
assert.equal(totais.valorTotal, 60.27);

const descontoPreso = calcTotais({ ...semEmpresa, desconto: 500, descontoTipo: 'valor', itens: [item('servico', 50, 1)] });
assert.equal(descontoPreso.desconto, 50, 'desconto em R$ não passa do subtotal');
assert.equal(descontoPreso.valorTotal, 0);

const percentual = calcTotais({ ...semEmpresa, desconto: 10, descontoTipo: 'percentual', itens: [item('servico', 99.99, 1)] });
assert.equal(percentual.valorTotal, 89.99);

const sinal = calcTotais({ ...semEmpresa, sinalValor: 1000, itens: [item('servico', 200, 1)] });
assert.equal(sinal.sinalValor, 200, 'sinal em R$ nunca fica acima do total');
assert.equal(sinal.sinalPercentual, 100);

// ─── 3. Cliente: mapeamento e vínculo pelo nome falado ───────────────────────
const cli = (id: string, nome: string, extra: Partial<Cliente> = {}): Cliente => ({
  id, nome, telefone: `(11) 9999-000${id}`, criadoEm: '2026-01-01T00:00:00.000Z', ...extra,
});
const joao = cli('1', 'João da Silva', { endereco: 'Rua A, 10', cidade: 'Santos', estado: 'SP', cpf: '123' });
const maria1 = cli('2', 'Maria Souza');
const maria2 = cli('3', 'Maria Oliveira');
const jose = cli('4', 'José');
const clientes = [joao, maria1, maria2, jose];

assert.deepEqual(clienteParaOrc(joao), {
  clienteId: '1',
  clienteNome: 'João da Silva',
  clienteTelefone: '(11) 9999-0001',
  clienteCpfCnpj: '123',
  clienteEndereco: 'Rua A, 10, Santos, SP',
});

assert.equal(normalizarNome('  JOÃO   da  Silva. '), 'joao da silva');
assert.equal(casarClientePorNome('joao da silva', clientes)?.id, '1', 'igual sem acento/maiúscula');
assert.equal(casarClientePorNome('João', clientes)?.id, '1', 'começo único do nome');
assert.equal(casarClientePorNome('jose', clientes)?.id, '4');
assert.equal(casarClientePorNome('Maria', clientes), null, 'duas Marias = ambíguo, não liga');
assert.equal(casarClientePorNome('Jo', clientes), null, 'pedaço de palavra não liga');
assert.equal(casarClientePorNome('Pedro', clientes), null);
assert.equal(casarClientePorNome('', clientes), null);
assert.equal(casarClientePorNome(undefined, clientes), null);
assert.equal(
  casarClientePorNome('Ana', [cli('5', 'Ana'), cli('6', 'ANA')]),
  null,
  'dois cadastros com o mesmo nome = ambíguo',
);

// ─── 4. Catálogo da voz leva produtos ────────────────────────────────────────
const cat = catalogoParaVoz(
  [{ nome: 'Limpeza de split', preco: 180 }, { nome: 'Visita', preco: 0 }],
  [{ nome: 'Capacitor 35uF', preco: 45.5 }, { nome: '  ', preco: 10 }],
);
assert.deepEqual(cat, [
  { nome: 'Limpeza de split', preco: 180 },
  { nome: 'Visita' },
  { nome: 'Capacitor 35uF', preco: 45.5 },
]);
const muitos = (n: number, prefixo: string) => Array.from({ length: n }, (_, i) => ({ nome: `${prefixo}${i}`, preco: 1 }));
const cheio = catalogoParaVoz(muitos(80, 's'), muitos(80, 'p'));
assert.equal(cheio.length, CATALOGO_VOZ_MAX, 'respeita o teto do worker');
assert.equal(cheio.filter(c => c.nome.startsWith('s')).length, CATALOGO_VOZ_MAX_SERVICOS);
assert.equal(catalogoParaVoz(muitos(5, 's'), muitos(200, 'p')).length, CATALOGO_VOZ_MAX, 'poucos serviços: produtos ocupam o resto');
assert.match(ler('../worker/src/voz.js'), new RegExp(`catalogoItens:\\s*${CATALOGO_VOZ_MAX}\\b`), 'teto igual ao do worker');

// ─── 5. As telas usam a base comum (nada de cópia local) ─────────────────────
const wizard = ler('../src/screens/NovoOrcamentoScreen.tsx');
const voz = ler('../src/screens/OlliVozScreen.tsx');
const assistente = ler('../src/services/olliAssistente.ts');
for (const [nome, fonte] of [['wizard', wizard], ['voz', voz]] as const) {
  assert.match(fonte, /from '\.\.\/utils\/orcamentoBase'/, `${nome} importa a base comum`);
  assert.doesNotMatch(fonte, /function (emptyOrcamento|calcTotais)\(/, `${nome} não tem cópia local`);
  assert.match(fonte, /usePreventRemove\(/, `${nome} pergunta antes de descartar`);
}
assert.doesNotMatch(wizard, /emptyOrcamento\(numero/, 'wizard não reserva número ao abrir');
assert.match(wizard, /garantirNumero\(/, 'wizard reserva o número no salvar');
assert.doesNotMatch(voz, /getServicos\(\)/, 'voz usa o catálogo comum (serviços + produtos)');
assert.match(assistente, /getProdutos\(\)/, 'catálogo da IA inclui produtos');

console.log('teste-orcamento-base: ok');
