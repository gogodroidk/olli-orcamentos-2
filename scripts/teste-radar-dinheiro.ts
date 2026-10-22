/**
 * Teste da regra PURA dos radares de dinheiro (`src/services/radarDinheiro.ts`).
 *
 *     node scripts/teste-radar-dinheiro.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * É a regra que o painel (tela Início), o resumo diário por e-mail (worker) e os
 * limiares do app leem. Protege: saldo por orçamento com trava-piso, pagamento
 * parcial continua parado, OS concluída sai, "sem valor" nunca vira zero, data
 * ilegível nunca vira "hoje", proposta parada só com >= 3 dias, "clientes para
 * lembrar" (pós-venda) só com SERVIÇO CONCLUÍDO e no intervalo do ofício — a MESMA
 * lista que `utils/posVenda.ts` dá ao app (lead frio nunca entra, recibo estornado não
 * conta, adiamento e lembrete recente respeitados) — e "acionável" só quando há o que
 * fazer.
 */
import * as radar from '../src/services/radarDinheiro.ts';
import {
  LIMIAR_PROPOSTA_PARADA_DIAS,
  STATUS_EM_JOGO,
  STATUS_SERVICO_FECHADO,
  listarClientesParaLembrarDasLinhas,
  servicosConcluidosDasLinhas,
  listarDinheiroParado,
  listarPropostasParadas,
  contarRascunhosEsquecidos,
  textoEstadoCalmo,
  resumirDinheiroParado,
  valorOrcamento,
  type EntradaResumoDinheiro,
} from '../src/services/radarDinheiro.ts';
import { STATUS_PROPOSTA_ENVIADA } from '../src/types/index.ts';
import { listarClientesParaLembrar, retornoDoOficio } from '../src/utils/posVenda.ts';

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
  return { orcamentos: [], recibos: [], clientes: [], agendamentos: [], adiados: {}, lembrados: {}, verticais: null, orcamentosFinalizados: new Set() };
}

console.log('\nRadar de dinheiro — constantes compartilhadas');
checar('em jogo = STATUS_PROPOSTA_ENVIADA do app', [...STATUS_EM_JOGO], [...STATUS_PROPOSTA_ENVIADA]);
checar('limiar de proposta parada = 3 dias', LIMIAR_PROPOSTA_PARADA_DIAS, 3);
checar('serviço fechado (pós-venda) = aprovado/convertido', [...STATUS_SERVICO_FECHADO], ['aprovado', 'convertido']);
// Um conceito, um nome: o antigo "cliente sumido" (150 dias fixos) não existe mais.
checar('sem regra paralela de "cliente sumido"', Object.keys(radar).filter((k) => /sumid|interacao/i.test(k)), []);

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

console.log('\nRascunhos esquecidos (gaveta que "Nada parado" escondia)');
{
  // Mede desde a CRIAÇÃO: editar um rascunho velho não o enviou.
  const linhas = [
    { id: 'r1', status: 'rascunho', criado_em: diasAtras(10), atualizado_em: diasAtras(10) },
    { id: 'r2', status: 'Rascunho', criado_em: diasAtras(3), atualizado_em: diasAtras(3) },
    { id: 'r3', status: 'rascunho', criado_em: diasAtras(1), atualizado_em: diasAtras(1) },
    { id: 'r4', status: 'rascunho', criado_em: 'lixo', atualizado_em: diasAtras(30) },
    { id: 'e1', status: 'enviado', criado_em: diasAtras(30), atualizado_em: diasAtras(30) },
    { id: 'a1', status: 'aprovado', criado_em: diasAtras(30), atualizado_em: diasAtras(30) },
    { id: 'r5', status: 'rascunho', criado_em: diasAtras(20), atualizado_em: diasAtras(1) },
    { id: 'r6', status: 'rascunho', criado_em: null, dados: { criadoEm: diasAtras(8) }, atualizado_em: diasAtras(0) },
  ];
  checar('conta rascunho criado há >= 3 dias (maiúscula, blob e editado ontem incluídos)', contarRascunhosEsquecidos(linhas, 3, AGORA), 4);
  checar('rascunho velho EDITADO ontem continua contando (o bug do P2)', contarRascunhosEsquecidos([linhas[6]], 3, AGORA), 1);
  checar('rascunho criado ontem não conta', contarRascunhosEsquecidos([linhas[2]], 3, AGORA), 0);
  checar('criação ilegível não vira 0 dias nem entra (mesmo com edição antiga)', contarRascunhosEsquecidos([linhas[3]], 3, AGORA), 0);
  checar('enviado/aprovado nunca contam como rascunho', contarRascunhosEsquecidos([linhas[4], linhas[5]], 3, AGORA), 0);
  checar('30 de 39 em rascunho antigos => 30 (cenário do bug)',
    contarRascunhosEsquecidos([
      ...Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, status: 'rascunho', criado_em: diasAtras(5), atualizado_em: diasAtras(0) })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, status: 'enviado', criado_em: diasAtras(1), atualizado_em: diasAtras(1) })),
    ], 3, AGORA), 30);
  checar('propostas paradas segue ignorando rascunho (regra compartilhada intacta)',
    listarPropostasParadas(linhas, 3, AGORA).length, 1);
}

console.log('\nTexto do estado calmo (paridade app/painel)');
checar('zero rascunho apurado => "Nada parado"', textoEstadoCalmo(0).startsWith('Nada parado'), true);
checar('com rascunho => NÃO diz "Nada parado" e conta no plural', [textoEstadoCalmo(30).includes('Nada parado'), textoEstadoCalmo(30).includes('30 rascunhos criados há mais de 3 dias e ainda sem enviar')], [false, true]);
checar('1 rascunho => singular', textoEstadoCalmo(1).includes('1 rascunho criado há mais de 3 dias'), true);
checar('não sei (null/undefined) => nunca afirma "Nada parado"', [textoEstadoCalmo(null).includes('Nada parado'), textoEstadoCalmo(undefined).includes('Nada parado')], [false, false]);

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

console.log('\nClientes para lembrar (pós-venda, linhas do Supabase)');
{
  const entrada = {
    clientes: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }, { id: 'c6' }, { id: 'c7' }, { id: 'c8' }],
    orcamentos: [
      { cliente_id: 'c1', status: 'aprovado', atualizado_em: diasAtras(200) },
      { cliente_id: 'c2', status: 'enviado', atualizado_em: diasAtras(400) }, // proposta só enviada: lead, não pós-venda
      { cliente_id: 'c3', status: 'convertido', atualizado_em: diasAtras(400) },
      { cliente_id: 'c5', status: 'aprovado', atualizado_em: diasAtras(300) },
      { cliente_id: 'c6', status: ' Aprovado ', atualizado_em: diasAtras(300) },
      { cliente_id: 'c7', status: 'aprovado', atualizado_em: diasAtras(300) },
    ],
    agendamentos: [{ cliente_id: 'c3', status: 'concluido', inicio: diasAtras(10), fim: diasAtras(10) }], // voltou
    recibos: [
      { cliente_id: 'c5', dados: { dataRecebimento: '01/09/2026' } }, // 1º de setembro, não 9 de janeiro
      { cliente_id: 'c8', criado_em: diasAtras(300), dados: { estornadoEm: diasAtras(290) } }, // estornado: não prova serviço
    ],
    adiados: { c6: new Date(AGORA.getTime() + 864e5).toISOString() },
    lembrados: { c7: diasAtras(5) },
    verticais: null,
  };
  const s = listarClientesParaLembrarDasLinhas(entrada, AGORA);
  checar('lead fora, quem voltou fora, adiado fora, lembrado há 5 dias fora, estornado fora', s.map((x) => x.id), ['c1']);
  checar('recibo em DD/MM/AAAA lido como dia/mês', s.some((x) => x.id === 'c5'), false);
  checar('meses arredondados', s[0]?.meses, 7);
  // É a regra do app, não uma cópia: mesma saída que `listarClientesParaLembrar` direto.
  checar('mesma lista que utils/posVenda (a regra do app)', s, listarClientesParaLembrar({
    clientes: entrada.clientes, servicos: servicosConcluidosDasLinhas(entrada),
    mesesIntervalo: retornoDoOficio(null).meses, lembrados: entrada.lembrados, adiados: entrada.adiados, agora: AGORA,
  }));
  // O ofício muda o intervalo: jardim (3 meses) lembra quem o genérico (6 meses) ainda não.
  const recente = { ...entrada, orcamentos: [{ cliente_id: 'c1', status: 'aprovado', atualizado_em: diasAtras(120) }], recibos: [], agendamentos: [] };
  checar('jardinagem (3 meses) lembra aos 4 meses', listarClientesParaLembrarDasLinhas({ ...recente, verticais: ['jardinagem'] }, AGORA).map((x) => x.id), ['c1']);
  checar('sem ofício (6 meses) ainda não', listarClientesParaLembrarDasLinhas(recente, AGORA).length, 0);
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
  checar('contagens', [r.aReceber.itens, r.propostasParadas, r.clientesParaLembrar, r.acionavel], [1, 1, 0, true]);
  const soLembrar = resumirDinheiroParado({
    ...vazio(),
    orcamentos: [{ id: 'z', status: 'recusado', valor_total: 50 }],
    clientes: [{ id: 'k' }],
    recibos: [{ cliente_id: 'k', criado_em: diasAtras(200) }],
  }, AGORA);
  checar('só cliente para lembrar também é acionável', [soLembrar.acionavel, soLembrar.clientesParaLembrar, soLembrar.aReceber.centavos], [true, 1, 0]);
  const lembradoOntem = resumirDinheiroParado({
    ...vazio(),
    clientes: [{ id: 'k' }],
    recibos: [{ cliente_id: 'k', criado_em: diasAtras(200) }],
    lembrados: { k: diasAtras(1) },
  }, AGORA);
  checar('lembrado ontem não conta no e-mail (igual à tela)', [lembradoOntem.acionavel, lembradoOntem.clientesParaLembrar], [false, 0]);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s) — radar de dinheiro`);
process.exit(falhas === 0 ? 0 : 1);
