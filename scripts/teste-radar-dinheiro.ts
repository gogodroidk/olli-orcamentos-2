/**
 * Teste da regra PURA dos radares de dinheiro (`src/services/radarDinheiro.ts`).
 *
 *     node scripts/teste-radar-dinheiro.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * É a regra que o painel (tela Início), o resumo diário por e-mail (worker) e os
 * limiares do app leem. Protege: saldo por orçamento com trava-piso, pagamento
 * parcial continua parado, OS concluída sai, "sem valor" nunca vira zero, data
 * ilegível nunca vira "hoje", proposta parada só com >= 3 dias, cliente sumido só
 * com interação antiga (lead frio nunca entra), adiamento do celular respeitado,
 * e "acionável" só quando há o que fazer.
 */
import {
  LIMIAR_CLIENTE_SUMIDO_DIAS,
  LIMIAR_PROPOSTA_PARADA_DIAS,
  STATUS_EM_JOGO,
  STATUS_INTERACAO_CLIENTE,
  listarClientesSumidos,
  listarDinheiroParado,
  listarPropostasParadas,
  resumirDinheiroParado,
  valorOrcamento,
  type EntradaResumoDinheiro,
} from '../src/services/radarDinheiro.ts';
import { STATUS_PROPOSTA_ENVIADA } from '../src/types/index.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const AGORA = new Date('2026-09-30T10:00:00.000Z');
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 864e5).toISOString();

function vazio(): EntradaResumoDinheiro {
  return { orcamentos: [], recibos: [], clientes: [], agendamentos: [], adiados: {}, orcamentosFinalizados: new Set() };
}

console.log('\nRadar de dinheiro — constantes compartilhadas');
checar('em jogo = STATUS_PROPOSTA_ENVIADA do app', [...STATUS_EM_JOGO], [...STATUS_PROPOSTA_ENVIADA]);
checar('limiar de proposta parada = 3 dias', LIMIAR_PROPOSTA_PARADA_DIAS, 3);
checar('limiar de cliente sumido = 150 dias', LIMIAR_CLIENTE_SUMIDO_DIAS, 150);
checar('interação = aprovado/enviado/aguardando_assinatura', [...STATUS_INTERACAO_CLIENTE], ['aprovado', 'enviado', 'aguardando_assinatura']);

console.log('\nDinheiro parado');
{
  const r = listarDinheiroParado(
    [
      { id: 'a', status: 'aprovado', valor_total: 1000, atualizado_em: diasAtras(12) },
      { id: 'b', status: ' Convertido ', valor_total: 500, atualizado_em: diasAtras(2) },
      { id: 'c', status: 'aprovado', valor_total: 300, atualizado_em: diasAtras(40) }, // quitado
      { id: 'd', status: 'aprovado', atualizado_em: diasAtras(5) }, // sem valor
      { id: 'e', status: 'enviado', valor_total: 9999, atualizado_em: diasAtras(50) },
      { id: 'f', status: 'aprovado', valor_total: 700, atualizado_em: diasAtras(90) }, // OS concluída
      { id: 'g', status: 'aprovado', dados: { valorTotal: 200, atualizadoEm: 'lixo' } }, // sem data
    ],
    [
      { orcamento_id: 'a', valor_recebido: 400 },
      { orcamento_id: 'c', valor_recebido: 350 }, // pagou a mais: não abate ninguém mais
      { dados: { orcamentoId: 'b', valorRecebido: 0 } },
      { valor_recebido: 10_000 }, // avulso: não abate nada
    ],
    AGORA,
    new Set(['f']),
  );
  checar('total = saldos (600 + 500 + 200)', r.total, 1300);
  checar('itens = orçamentos com saldo', r.itens, 3);
  checar('sem valor fica de fora e é contado', r.semValor, 1);
  checar('quitado não entra (trava-piso por orçamento)', r.quitados, 1);
  checar('ordem: mais parado primeiro, sem data por último', r.linhas.map((l) => [l.id, l.dias]), [['a', 12], ['b', 2], ['g', null]]);
  checar('dias do mais antigo', r.diasMaisAntigo, 12);
  checar('já recebido limitado ao valor de cada orçamento', r.jaRecebido, 400 + 300);
}
checar('valor: coluna → blob → subtotal', [
  valorOrcamento({ valor_total: 10, dados: { valorTotal: 20 } }),
  valorOrcamento({ dados: { valorTotal: 20 } }),
  valorOrcamento({ subtotal: 30 }),
  valorOrcamento({ dados: { valorTotal: '40' } }),
], [10, 20, 30, null]);

console.log('\nPropostas paradas');
{
  const p = listarPropostasParadas([
    { id: '1', status: 'enviado', atualizado_em: diasAtras(3) },
    { id: '2', status: 'visualizado', atualizado_em: diasAtras(2) }, // ainda não
    { id: '3', status: 'em_negociacao', criado_em: diasAtras(9) },
    { id: '4', status: 'aguardando_assinatura', atualizado_em: 'sem data' }, // fora
    { id: '5', status: 'rascunho', atualizado_em: diasAtras(30) }, // nunca foi ao cliente
    { id: '6', status: 'aprovado', atualizado_em: diasAtras(30) }, // já respondeu
  ], LIMIAR_PROPOSTA_PARADA_DIAS, AGORA);
  checar('só enviadas com >= 3 dias, mais parada primeiro', p.map((x) => [x.id, x.dias]), [['3', 9], ['1', 3]]);
}

console.log('\nClientes sumidos');
{
  const s = listarClientesSumidos({
    clientes: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }, { id: 'c6' }],
    orcamentos: [
      { cliente_id: 'c1', status: 'aprovado', criado_em: diasAtras(200) },
      { cliente_id: 'c2', status: 'visualizado', criado_em: diasAtras(200) }, // não conta como interação
      { cliente_id: 'c3', status: 'enviado', criado_em: diasAtras(400) },
      { cliente_id: 'c5', status: 'aprovado', criado_em: diasAtras(300) },
      { cliente_id: 'c6', status: 'aprovado', criado_em: diasAtras(300) },
    ],
    agendamentos: [{ cliente_id: 'c3', status: 'concluido', inicio: diasAtras(10), fim: diasAtras(10) }], // voltou
    recibos: [{ cliente_id: 'c5', dados: { dataRecebimento: '01/09/2026' } }], // 1º de setembro, não 9 de janeiro
    adiados: { c6: new Date(AGORA.getTime() + 864e5).toISOString() },
  }, AGORA);
  checar('lead frio fora, quem voltou fora, adiado fora', s.map((x) => x.id), ['c1']);
  checar('recibo em DD/MM/AAAA lido como dia/mês', s.some((x) => x.id === 'c5'), false);
  checar('meses arredondados', s[0]?.meses, 7);
}

console.log('\nResumo (o número do e-mail)');
{
  const nada = resumirDinheiroParado(vazio(), AGORA);
  checar('conta vazia não é acionável', nada.acionavel, false);

  const soSemValor = resumirDinheiroParado({ ...vazio(), orcamentos: [{ id: 'x', status: 'aprovado' }] }, AGORA);
  checar('aprovado sem valor sozinho não é acionável', [soSemValor.acionavel, soSemValor.aReceber.semValor], [false, 1]);

  const r = resumirDinheiroParado({
    ...vazio(),
    orcamentos: [
      { id: 'a', status: 'aprovado', valor_total: 1234.565, atualizado_em: diasAtras(4) },
      { id: 'b', status: 'enviado', atualizado_em: diasAtras(6), cliente_id: 'k' },
    ],
    clientes: [{ id: 'k' }],
  }, AGORA);
  checar('centavos inteiros', r.aReceber.centavos, 123457);
  checar('contagens', [r.aReceber.itens, r.propostasParadas, r.clientesSumidos, r.acionavel], [1, 1, 0, true]);
  const soSumido = resumirDinheiroParado({
    ...vazio(),
    orcamentos: [{ id: 'z', status: 'recusado', valor_total: 50 }],
    clientes: [{ id: 'k' }],
    recibos: [{ cliente_id: 'k', criado_em: diasAtras(151) }],
  }, AGORA);
  checar('só cliente sumido também é acionável', [soSumido.acionavel, soSumido.clientesSumidos, soSumido.aReceber.centavos], [true, 1, 0]);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s) — radar de dinheiro`);
process.exit(falhas === 0 ? 0 : 1);
