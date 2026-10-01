/**
 * OS completa a partir do orçamento (B70 / item 1.18) e numeração sem colisão.
 *
 *     node scripts/teste-os-do-orcamento.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - a OS leva itens e endereço (na descrição, sem preço), a data do agendamento (ou
 *    da prestação), o checklist do ofício desmarcado e as fotos do orçamento;
 *  - data em DD/MM/AAAA, AAAA-MM-DD ou ISO; data inválida não vira data inventada;
 *  - número = maior entre local e nuvem + 1, lixeira incluída; fonte ilegível (`null`)
 *    não é "zero OS"; nenhuma fonte legível = sem número (nunca OS-0001 no chute).
 */
import { strict as assert } from 'node:assert';
import type { Orcamento } from '../src/types/index.ts';
import {
  checklistDoModelo,
  dataAgendadaDoOrcamento,
  descricaoDaOSDoOrcamento,
  ehDiaSemHora,
  formatarNumeroOS,
  maiorSequencialOS,
  montarOSDoOrcamento,
  proximoNumeroOSDasFontes,
} from '../src/utils/ordemServicoDoOrcamento.ts';

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

const orcamentoBase = {
  id: 'orc-1',
  numero: '01226',
  clienteId: 'cli-1',
  clienteNome: 'Maria Souza',
  clienteTelefone: '11999990000',
  clienteEndereco: 'Rua das Flores, 120 — Centro, Campinas/SP',
  itens: [
    { id: 'i1', tipo: 'servico', catalogoId: 'c1', nome: 'Limpeza de split 12k', descricao: 'Higienização completa', preco: 250, quantidade: 2, unidade: 'un', subtotal: 500 },
    { id: 'i2', tipo: 'produto', catalogoId: 'c2', nome: 'Gás R410A', preco: 90, quantidade: 1.5, unidade: 'kg', subtotal: 135 },
    { id: 'i3', tipo: 'servico', catalogoId: 'c3', nome: '   ', preco: 0, quantidade: 1, unidade: '', subtotal: 0 },
  ],
  subtotalServicos: 500,
  subtotalProdutos: 135,
  subtotal: 635,
  desconto: 0,
  descontoTipo: 'valor',
  valorTotal: 635,
  status: 'aprovado',
  dataEmissao: '2026-09-30',
  agendamentoServico: '05/10/2026',
  dataPrestacaoServico: '07/10/2026',
  formasPagamento: { credito: false, debito: false, dinheiro: true, pix: true },
  fotosServico: ['file:///a.jpg', 'file:///b.jpg', 'file:///a.jpg', ''],
  exibirAssinatura: false,
  solicitarAssinaturaCliente: false,
  exibirAprovacao: true,
  exibirRecusa: true,
  criadoEm: '2026-09-30T10:00:00.000Z',
  atualizadoEm: '2026-09-30T10:00:00.000Z',
} as Orcamento;

console.log('\nOS a partir do orçamento — conteúdo');

ok('descrição traz os itens (qtd, unidade, nome, detalhe) sem preço e o endereço', () => {
  const d = descricaoDaOSDoOrcamento(orcamentoBase) ?? '';
  assert.match(d, /O que fazer:/);
  assert.match(d, /• 2 un — Limpeza de split 12k \(Higienização completa\)/);
  assert.match(d, /• 1,5 kg — Gás R410A/);
  assert.match(d, /Endereço do serviço: Rua das Flores, 120/);
  assert.doesNotMatch(d, /R\$|250|635/);
  assert.equal(d.split('•').length - 1, 2, 'item sem nome não entra');
});

ok('sem itens e sem endereço = sem descrição', () => {
  assert.equal(descricaoDaOSDoOrcamento({ itens: [], clienteEndereco: '  ' }), undefined);
});

ok('data: agendamento do serviço tem prioridade, como dia civil (sentinela meio-dia UTC + 1 s)', () => {
  const iso = dataAgendadaDoOrcamento(orcamentoBase);
  assert.equal(iso, '2026-10-05T12:00:01.000Z');
  assert.equal(ehDiaSemHora(iso), true);
});

ok('data: sem agendamento, cai na data de prestação', () => {
  assert.equal(dataAgendadaDoOrcamento({ agendamentoServico: '', dataPrestacaoServico: '07/10/2026' }), '2026-10-07T12:00:01.000Z');
});

ok('data: AAAA-MM-DD e ISO com hora são aceitos; hora real é preservada', () => {
  assert.equal(dataAgendadaDoOrcamento({ agendamentoServico: '2026-10-09' }), '2026-10-09T12:00:01.000Z');
  const comHora = dataAgendadaDoOrcamento({ agendamentoServico: '2026-10-09T17:30:00.000Z' });
  assert.equal(comHora, '2026-10-09T17:30:00.000Z');
  assert.equal(ehDiaSemHora(comHora), false);
});

ok('OS agendada de verdade às 09:00 de Brasília (12:00Z) NÃO perde a hora', () => {
  // contrato com horarioVisita 09:00, agenda do painel, form do webapp: todos gravam 12:00:00Z.
  assert.equal(ehDiaSemHora('2026-10-05T12:00:00.000Z'), false);
  assert.equal(ehDiaSemHora('2026-10-05T12:00:00Z'), false);
  assert.equal(ehDiaSemHora('2026-10-05T12:00:00+00:00'), false);
});

ok('dia sem hora sobrevive à volta da nuvem (+00:00, sem milissegundos)', () => {
  assert.equal(ehDiaSemHora('2026-10-05T12:00:01+00:00'), true);
  assert.equal(ehDiaSemHora('2026-10-05T09:00:01-03:00'), true);
  assert.equal(ehDiaSemHora(undefined), false);
  assert.equal(ehDiaSemHora('lixo'), false);
});

ok('data inválida não vira data inventada', () => {
  assert.equal(dataAgendadaDoOrcamento({ agendamentoServico: '31/02/2026' }), undefined);
  assert.equal(dataAgendadaDoOrcamento({ agendamentoServico: 'amanhã cedo' }), undefined);
  assert.equal(dataAgendadaDoOrcamento({}), undefined);
});

ok('checklist do ofício nasce desmarcado, sem linha vazia', () => {
  let n = 0;
  const lista = checklistDoModelo(['Desligar o disjuntor', '  ', 'Testar'], () => `id-${++n}`);
  assert.deepEqual(lista, [
    { id: 'id-1', texto: 'Desligar o disjuntor', feito: false },
    { id: 'id-2', texto: 'Testar', feito: false },
  ]);
  assert.deepEqual(checklistDoModelo([], () => 'x'), []);
});

ok('montarOSDoOrcamento junta tudo e mantém cliente/título/valor', () => {
  let n = 0;
  const os = montarOSDoOrcamento(orcamentoBase, {
    id: 'os-1',
    numero: 'OS-0007',
    agora: '2026-09-30T12:00:00.000Z',
    modeloChecklist: ['Desligar o equipamento da tomada', 'Limpar os filtros'],
    novoId: () => `ck-${++n}`,
  });
  assert.equal(os.numero, 'OS-0007');
  assert.equal(os.orcamentoId, 'orc-1');
  assert.equal(os.clienteId, 'cli-1');
  assert.equal(os.clienteNome, 'Maria Souza');
  assert.equal(os.titulo, 'Orçamento 01226');
  assert.equal(os.valor, 635);
  assert.equal(os.status, 'aberta');
  assert.equal(os.dataAgendada, '2026-10-05T12:00:01.000Z');
  assert.equal(os.checklist.length, 2);
  assert.deepEqual(os.fotos, ['file:///a.jpg', 'file:///b.jpg']);
  assert.match(os.descricao ?? '', /Limpeza de split/);
  assert.equal(os.criadoEm, os.atualizadoEm);
});

console.log('\nNumeração de OS sem colisão');

ok('formato OS-0001', () => {
  assert.equal(formatarNumeroOS(1), 'OS-0001');
  assert.equal(formatarNumeroOS(12345), 'OS-12345');
});

ok('maior sequencial ignora lixo e número torto', () => {
  assert.equal(maiorSequencialOS(['OS-0003', 'OS-0010 ', 'abc', null, undefined, '']), 10);
  assert.equal(maiorSequencialOS([]), 0);
});

ok('OS criada fora do aparelho (nuvem) não tem o número reemitido', () => {
  assert.equal(proximoNumeroOSDasFontes(['OS-0001', 'OS-0002'], ['OS-0001', 'OS-0002', 'OS-0003']), 'OS-0004');
});

ok('offline (nuvem ilegível) segue com o que o aparelho sabe', () => {
  assert.equal(proximoNumeroOSDasFontes(['OS-0005'], null), 'OS-0006');
});

ok('banco local ilegível mas nuvem ok: usa a nuvem', () => {
  assert.equal(proximoNumeroOSDasFontes(null, ['OS-0041']), 'OS-0042');
});

ok('fontes lidas e vazias = primeira OS', () => {
  assert.equal(proximoNumeroOSDasFontes([], []), 'OS-0001');
});

ok('nenhuma fonte legível = sem número (nunca OS-0001 no chute)', () => {
  assert.equal(proximoNumeroOSDasFontes(null, null), null);
});

console.log(`PASSOU: ${verificacoes} verificações`);
