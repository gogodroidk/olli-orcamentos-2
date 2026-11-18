import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { cnpjValido, cpfValido, descricaoDoServico, montarPedidoNfse, podeMostrarEmitirNota } from '../src/services/nfseRegras.ts';
import type { Orcamento } from '../src/types';

// Botão: os TRÊS precisam valer (flag do servidor, plano Empresa, orçamento aprovado).
const status = ['rascunho', 'enviado', 'aprovado', 'convertido', 'recusado'] as const;
for (const flagServidor of [false, true]) for (const plano of ['gratis', 'pro', 'empresa'] as const) for (const s of status) {
  const esperado = flagServidor && plano === 'empresa' && (s === 'aprovado' || s === 'convertido');
  assert.equal(podeMostrarEmitirNota({ flagServidor, plano, status: s }), esperado, `${flagServidor}/${plano}/${s}`);
}

assert.ok(cpfValido('529.982.247-25') && !cpfValido('529.982.247-24') && !cpfValido('111.111.111-11'));
assert.ok(cnpjValido('11.222.333/0001-81') && !cnpjValido('11.222.333/0001-82'));

const orc = {
  id: 'o1', clienteNome: 'Maria Souza', clienteCpfCnpj: '529.982.247-25', valorTotal: 850.5,
  itens: [
    { tipo: 'servico', nome: 'Instalação split 12k', quantidade: 1, unidade: 'un' },
    { tipo: 'produto', nome: 'Suporte', quantidade: 2, unidade: 'un' },
    { tipo: 'servico', nome: 'Carga de gás', quantidade: 2, unidade: 'kg' },
  ],
} as unknown as Orcamento;
assert.equal(descricaoDoServico(orc), 'Instalação split 12k; Carga de gás (2 kg)', 'só serviço; produto fica de fora');
const ok = montarPedidoNfse(orc, true);
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.pedido.servico.valorCentavos, 85050);
  assert.equal(ok.pedido.tomador.documento, '52998224725');
  assert.equal(ok.pedido.servico.issRetido, true);
}
const sem = montarPedidoNfse({ ...orc, clienteCpfCnpj: '123', valorTotal: 0, itens: [] } as unknown as Orcamento);
assert.deepEqual(sem.ok ? [] : sem.faltando, ['cpf_cnpj_cliente', 'descricao_servico', 'valor']);

// Flag desligada = app idêntico: a tela só ganha UMA linha e o componente não chama rede antes de plano+status.
const tela = readFileSync(new URL('../src/screens/VisualizarOrcamentoScreen.tsx', import.meta.url), 'utf8');
assert.equal((tela.match(/<EmitirNotaBotao/g) || []).length, 1);
const comp = readFileSync(new URL('../src/components/EmitirNotaBotao.tsx', import.meta.url), 'utf8');
assert.match(comp, /if \(!elegivel\) return;/, 'sem plano Empresa + aprovado não há chamada de rede');
assert.match(comp, /if \(!podeMostrarEmitirNota\(/);
const cli = readFileSync(new URL('../src/services/nfse.ts', import.meta.url), 'utf8');
assert.doesNotMatch(cli, /focusnfe|FOCUS_NFE/i, 'o app nunca fala com o provedor nem vê token');

console.log('teste-nfse (app): verificações passaram');
