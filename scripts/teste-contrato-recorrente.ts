/**
 * Contrato recorrente por ativo — o MOTOR (regras puras + geração idempotente).
 *
 *     node scripts/teste-contrato-recorrente.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - cronograma por periodicidade (mensal, bimestral, trimestral, semestral, anual)
 *    ancorado no dia combinado, com dia 31/29-fev cortado no fim do mês SEM escorregar;
 *  - fuso do Brasil: 23h30 de Brasília ainda é "hoje" mesmo já sendo amanhã em UTC,
 *    e o horário da visita vira o instante UTC certo;
 *  - fim de contrato (inclusive), contrato pausado/rascunho/na lixeira, cadastro
 *    posterior ao início (visita antiga não nasce) e janela de atraso;
 *  - geração IDEMPOTENTE: rodar de novo, rodar em paralelo, cron diário por um ano
 *    inteiro → exatamente uma OS por visita; reserva órfã é reconstruída; reserva
 *    confirmada cuja OS foi apagada NÃO ressuscita; falha numa visita não derruba as
 *    outras;
 *  - dinheiro: receita mensal equivalente e a cobrança com o Pix do prestador
 *    (fail-closed: sem chave válida, sem Pix);
 *  - recorrência de agendamento projetada (semanal, mensal com dia 31, até, cancelada)
 *    e o filtro por técnico.
 */
import { strict as assert } from 'node:assert';
import {
  HORIZONTE_DIAS,
  JANELA_ATRASO_DIAS,
  checklistDaVisita,
  contratoParaLinha,
  datasDoCronograma,
  dataAncorada,
  expandirRecorrencia,
  filtrarPorResponsavel,
  fraseReceitaMensal,
  hojeNoBrasil,
  idBaseDaOcorrencia,
  idsDaVisita,
  instanteNoBrasil,
  linhaParaContrato,
  linhasDaVisita,
  prepararCobrancaContrato,
  proximasVisitas,
  resumirContratos,
  situacaoEfetiva,
  somarDias,
  validarContrato,
  valorMensalEquivalente,
  visitasParaGerar,
} from '../src/utils/contratoRecorrente.ts';
import {
  gerarVisitasDosContratos,
  numeroOs,
  resumoDaGeracao,
  type PortaGeracaoContratos,
  type ReservaExistente,
} from '../src/utils/contratoRecorrenteGeracao.ts';
import { pixCopiaEColaValido } from '../src/utils/pixBrCode.ts';
import type { Agendamento, ContratoRecorrente } from '../src/types/index.ts';

let ok = 0;
let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${nome}`);
    ok++;
  } catch (e) {
    console.error(`  FALHA ${nome}\n        ${(e as Error).message}`);
    falhas++;
  }
}

const DONO = '00000000-0000-4000-8000-000000000001';

function contrato(p: Partial<ContratoRecorrente> = {}): ContratoRecorrente {
  return {
    id: 'ct1',
    userId: DONO,
    numero: '7',
    titulo: 'Manutenção da piscina',
    clienteId: 'cli1',
    clienteNome: 'Condomínio Solar',
    endereco: 'Rua A, 10',
    situacao: 'vigente',
    periodicidade: 'mensal',
    dataInicio: '2026-01-10',
    horarioVisita: '08:00',
    ativos: [{ id: 'a1', nome: 'Piscina adulto' }, { id: 'a2', nome: "Caixa d'água 5.000 L" }],
    atividades: ['Medir pH', 'Aspirar fundo'],
    modoCobranca: 'mensal',
    valor: 450,
    responsavelId: '00000000-0000-4000-8000-0000000000aa',
    responsavelNome: 'Joana',
    criadoEm: '2026-01-01T12:00:00.000Z',
    atualizadoEm: '2026-01-01T12:00:00.000Z',
    ...p,
  };
}

/** "Agora" no fuso de Brasília, escrito como o relógio da parede mostra. */
const emBrasilia = (dia: string, hora = '12:00') => new Date(instanteNoBrasil(dia, hora));

// ─── Porta em memória: o banco com a chave única e o "insert se não existir" ────
interface Banco {
  reservas: Map<string, { id: string; contrato_id: string; periodo: string; user_id: string; ordem_criada_em: string | null }>;
  chaves: Set<string>;
  ordens: Map<string, Record<string, unknown>>;
  agendamentos: Map<string, Record<string, unknown>>;
  seq: number;
}
function novoBanco(): Banco {
  return { reservas: new Map(), chaves: new Set(), ordens: new Map(), agendamentos: new Map(), seq: 0 };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
function porta(b: Banco, opcoes: { falharOrdemVezes?: number } = {}): PortaGeracaoContratos {
  let falharOrdem = opcoes.falharOrdemVezes ?? 0;
  return {
    async reservas(ids): Promise<ReservaExistente[]> {
      await tick();
      return [...b.reservas.values()]
        .filter((r) => ids.includes(r.contrato_id))
        .map((r) => ({ id: r.id, contratoId: r.contrato_id, periodo: r.periodo, ordemCriadaEm: r.ordem_criada_em }));
    },
    async reservar(l) {
      await tick();
      const chave = `${l.user_id}|${l.contrato_id}|${l.periodo}`;
      if (b.reservas.has(String(l.id)) || b.chaves.has(chave)) return false;
      b.chaves.add(chave);
      b.reservas.set(String(l.id), {
        id: String(l.id), contrato_id: String(l.contrato_id), periodo: String(l.periodo), user_id: String(l.user_id), ordem_criada_em: null,
      });
      return true;
    },
    async inserirOrdem(l) {
      await tick();
      if (falharOrdem > 0) {
        falharOrdem -= 1;
        throw new Error('rede caiu');
      }
      if (!b.ordens.has(String(l.id))) b.ordens.set(String(l.id), l);
    },
    async inserirAgendamento(l) {
      await tick();
      if (!b.agendamentos.has(String(l.id))) b.agendamentos.set(String(l.id), l);
    },
    async confirmar(id, quando) {
      await tick();
      const r = b.reservas.get(id);
      if (r) r.ordem_criada_em = quando;
    },
    async proximoSequencialOs() {
      await tick();
      return b.seq + 1;
    },
  };
}

console.log('\nContrato recorrente — cronograma por periodicidade');

await caso('mensal ancorado no dia 31: corta no fim do mês e VOLTA ao 31 (sem escorregar)', () => {
  const datas = datasDoCronograma({ dataInicio: '2026-01-31', periodicidade: 'mensal' }, '2026-01-01', '2026-06-30');
  assert.deepEqual(datas, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
});

await caso('bimestral: a cada 2 meses a partir do início', () => {
  assert.deepEqual(
    datasDoCronograma({ dataInicio: '2026-01-15', periodicidade: 'bimestral' }, '2026-01-01', '2026-12-31'),
    ['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15', '2026-09-15', '2026-11-15'],
  );
});

await caso('trimestral: 4 visitas no ano, atravessando a virada', () => {
  assert.deepEqual(
    datasDoCronograma({ dataInicio: '2026-11-30', periodicidade: 'trimestral' }, '2026-11-01', '2027-11-30'),
    ['2026-11-30', '2027-02-28', '2027-05-30', '2027-08-30', '2027-11-30'],
  );
});

await caso('semestral: 2 por ano', () => {
  assert.deepEqual(
    datasDoCronograma({ dataInicio: '2026-03-05', periodicidade: 'semestral' }, '2026-01-01', '2027-12-31'),
    ['2026-03-05', '2026-09-05', '2027-03-05', '2027-09-05'],
  );
});

await caso('anual em 29/02: 28/02 nos anos comuns e 29/02 no bissexto', () => {
  assert.deepEqual(
    datasDoCronograma({ dataInicio: '2024-02-29', periodicidade: 'anual' }, '2024-01-01', '2028-12-31'),
    ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'],
  );
});

await caso('dataAncorada com k grande não caminha a série (contrato antigo)', () => {
  assert.equal(dataAncorada('2019-01-31', 1, 12 * 7 + 1), '2026-02-28');
  const datas = datasDoCronograma({ dataInicio: '2019-01-10', periodicidade: 'mensal' }, '2026-09-01', '2026-10-31');
  assert.deepEqual(datas, ['2026-09-10', '2026-10-10']);
});

await caso('periodicidade desconhecida ou data inválida → nada (não lança)', () => {
  assert.deepEqual(datasDoCronograma({ dataInicio: '2026-01-10', periodicidade: 'semanal' }, '2026-01-01', '2026-12-31'), []);
  assert.deepEqual(datasDoCronograma({ dataInicio: '2026-02-30', periodicidade: 'mensal' }, '2026-01-01', '2026-12-31'), []);
  assert.deepEqual(visitasParaGerar(contrato({ periodicidade: 'quinzenal' }), emBrasilia('2026-05-01')), []);
});

console.log('\nFuso do Brasil');

await caso('23h30 de Brasília ainda é o mesmo dia (já é o dia seguinte em UTC)', () => {
  assert.equal(hojeNoBrasil(new Date('2026-10-01T02:30:00Z')), '2026-09-30');
  assert.equal(hojeNoBrasil(new Date('2026-10-01T03:00:00Z')), '2026-10-01');
  // Virada de ano.
  assert.equal(hojeNoBrasil(new Date('2027-01-01T02:59:59Z')), '2026-12-31');
});

await caso('horário da visita vira o instante UTC certo (08:00 BRT = 11:00Z)', () => {
  assert.equal(instanteNoBrasil('2026-10-10', '08:00'), '2026-10-10T11:00:00.000Z');
  assert.equal(instanteNoBrasil('2026-12-31', '22:30'), '2027-01-01T01:30:00.000Z');
});

await caso('horizonte conta em dias de Brasília: a visita do dia 31 entra às 23h30 de 30/09, não às 23h30 de 29/09', () => {
  const c = contrato({ dataInicio: '2026-10-31', criadoEm: '2026-09-01T12:00:00Z' });
  // 30/09 23:30 BRT (01/10 02:30Z): hoje=30/09 → horizonte até 31/10 → entra.
  assert.deepEqual(visitasParaGerar(c, new Date('2026-10-01T02:30:00Z')).map((v) => v.data), ['2026-10-31']);
  // 29/09 23:30 BRT (30/09 02:30Z): hoje=29/09 → horizonte até 30/10 → ainda não.
  assert.deepEqual(visitasParaGerar(c, new Date('2026-09-30T02:30:00Z')), []);
  assert.equal(HORIZONTE_DIAS, 31);
});

await caso('a OS e o agendamento nascem com o instante e o mês do Brasil', () => {
  const c = contrato({ dataInicio: '2026-10-31', horarioVisita: '22:30' });
  const l = linhasDaVisita(c, { periodo: '2026-10', data: '2026-10-31' }, { userId: DONO, numeroOs: 'OS-0001', agora: new Date('2026-10-01T00:00Z') });
  assert.equal(l.agendamento.inicio, '2026-11-01T01:30:00.000Z');
  assert.equal(l.ordem.data_agendada, '2026-11-01T01:30:00.000Z');
  assert.equal(l.reserva.periodo, '2026-10'); // o mês é o de Brasília, não o de UTC
  assert.equal(l.reserva.data_prevista, '2026-10-31');
});

console.log('\nQuais visitas nascem');

await caso('fim do contrato é inclusive e nada nasce depois dele', () => {
  const c = contrato({ dataInicio: '2026-01-10', dataFim: '2026-12-10', criadoEm: '2026-01-01T12:00Z' });
  // 10/10 ainda está na janela de atraso; 12/10 é a última (o fim é inclusive).
  assert.deepEqual(visitasParaGerar(c, emBrasilia('2026-11-20')).map((v) => v.data), ['2026-10-10', '2026-11-10', '2026-12-10']);
  assert.deepEqual(proximasVisitas(c, emBrasilia('2026-11-20'), 5), ['2026-12-10']);
  // Dia seguinte ao fim: fora de vigor, aparece como encerrado, não gera.
  assert.deepEqual(visitasParaGerar(c, emBrasilia('2026-12-11')), []);
  assert.equal(situacaoEfetiva(c, '2026-12-11'), 'encerrado');
  assert.equal(situacaoEfetiva(c, '2026-12-10'), 'vigente');
});

await caso('pausado, rascunho, cancelado e lixeira não geram', () => {
  for (const situacao of ['suspenso', 'rascunho', 'cancelado', 'encerrado'] as const) {
    assert.deepEqual(visitasParaGerar(contrato({ situacao }), emBrasilia('2026-05-01')), [], situacao);
  }
  assert.deepEqual(visitasParaGerar(contrato({ excluidoEm: '2026-04-01T00:00Z' }), emBrasilia('2026-05-01')), []);
});

await caso('visita anterior ao CADASTRO no OLLI não nasce (aconteceu fora do app)', () => {
  const c = contrato({ dataInicio: '2026-01-10', criadoEm: '2026-09-20T12:00Z' });
  assert.deepEqual(visitasParaGerar(c, emBrasilia('2026-09-20')).map((v) => v.data), ['2026-10-10']);
});

await caso(`janela de atraso: contrato reativado não despeja meses vencidos (${JANELA_ATRASO_DIAS} dias)`, () => {
  const c = contrato({ dataInicio: '2026-01-10', criadoEm: '2026-01-01T12:00Z' });
  // 24/09 − 45 dias = 10/08: a visita de agosto ainda entra (atrasada).
  assert.equal(somarDias('2026-09-24', -JANELA_ATRASO_DIAS), '2026-08-10');
  assert.deepEqual(visitasParaGerar(c, emBrasilia('2026-09-24')).map((v) => v.data), ['2026-08-10', '2026-09-10', '2026-10-10']);
  // Um dia depois ela sai da janela; o contrato de janeiro não despeja jan–jul.
  assert.deepEqual(visitasParaGerar(c, emBrasilia('2026-09-25')).map((v) => v.periodo), ['2026-09', '2026-10']);
});

console.log('\nGeração idempotente');

await caso('rodar duas vezes: a segunda não cria nada', async () => {
  const b = novoBanco();
  const c = contrato({ criadoEm: '2026-09-01T12:00Z' });
  const r1 = await gerarVisitasDosContratos(porta(b), [c], { agora: emBrasilia('2026-09-12') });
  assert.equal(r1.criadas, 2); // 10/09 (atrasada 2 dias) e 10/10 (dentro do horizonte)
  const r2 = await gerarVisitasDosContratos(porta(b), [c], { agora: emBrasilia('2026-09-12') });
  assert.deepEqual([r2.criadas, r2.jaExistiam], [0, 2]);
  assert.equal(b.ordens.size, 2);
  assert.equal(b.agendamentos.size, 2);
  assert.ok(b.ordens.has(idsDaVisita('ct1', '2026-10').ordem));
});

await caso('celular, painel e cron ao MESMO tempo: uma OS por visita', async () => {
  const b = novoBanco();
  const c = contrato({ criadoEm: '2026-09-01T12:00Z' });
  const agora = emBrasilia('2026-09-12');
  const rs = await Promise.all([porta(b), porta(b), porta(b)].map((p) => gerarVisitasDosContratos(p, [c], { agora })));
  assert.equal(rs.reduce((s, r) => s + r.criadas, 0), 2);
  assert.equal(b.ordens.size, 2);
  assert.equal(b.reservas.size, 2);
});

for (const [periodicidade, esperado] of [['mensal', 12], ['bimestral', 6], ['trimestral', 4], ['semestral', 2], ['anual', 1]] as const) {
  await caso(`cron diário por 1 ano (${periodicidade}): exatamente ${esperado} OS, uma por mês de visita`, async () => {
    const b = novoBanco();
    const c = contrato({ periodicidade, dataInicio: '2026-01-31', dataFim: '2026-12-31', criadoEm: '2026-01-01T12:00Z' });
    for (let d = 0; d < 400; d++) {
      await gerarVisitasDosContratos(porta(b), [c], { agora: emBrasilia(somarDias('2026-01-01', d), '06:00') });
    }
    assert.equal(b.ordens.size, esperado);
    const periodos = [...b.reservas.values()].map((r) => r.periodo);
    assert.equal(new Set(periodos).size, periodos.length);
  });
}

await caso('reserva órfã (app caiu entre reservar e criar a OS) é reconstruída com os mesmos ids', async () => {
  const b = novoBanco();
  const c = contrato({ criadoEm: '2026-09-01T12:00Z', dataInicio: '2026-09-10' });
  const agora = emBrasilia('2026-09-01');
  const r1 = await gerarVisitasDosContratos(porta(b, { falharOrdemVezes: 1 }), [c], { agora });
  assert.deepEqual([r1.criadas, r1.falhas], [0, 1]);
  assert.equal(b.ordens.size, 0);
  assert.equal(b.reservas.size, 1); // a reserva ficou, sem confirmação
  const r2 = await gerarVisitasDosContratos(porta(b), [c], { agora });
  assert.deepEqual([r2.recuperadas, r2.criadas], [1, 0]);
  assert.ok(b.ordens.has(idsDaVisita('ct1', '2026-09').ordem));
  assert.match(resumoDaGeracao(r2), /1 visita nova/);
  assert.match(resumoDaGeracao(r1), /não foi gerada/);
});

await caso('OS apagada pelo prestador NÃO ressuscita (a reserva confirmada vale)', async () => {
  const b = novoBanco();
  const c = contrato({ criadoEm: '2026-09-01T12:00Z', dataInicio: '2026-09-10' });
  const agora = emBrasilia('2026-09-01');
  await gerarVisitasDosContratos(porta(b), [c], { agora });
  b.ordens.clear(); // exclusão definitiva
  b.agendamentos.clear();
  const r = await gerarVisitasDosContratos(porta(b), [c], { agora });
  assert.deepEqual([r.criadas, r.recuperadas, r.jaExistiam], [0, 0, 1]);
  assert.equal(b.ordens.size, 0);
});

await caso('falha numa visita não derruba as outras nem o outro contrato', async () => {
  const b = novoBanco();
  const agora = emBrasilia('2026-09-12');
  const cs = [contrato({ id: 'x', criadoEm: '2026-09-01T12:00Z' }), contrato({ id: 'y', criadoEm: '2026-09-01T12:00Z' })];
  const r = await gerarVisitasDosContratos(porta(b, { falharOrdemVezes: 1 }), cs, { agora });
  assert.deepEqual([r.criadas, r.falhas], [3, 1]);
});

await caso('teto de escritas por execução adia o resto (e a próxima execução completa)', async () => {
  const b = novoBanco();
  const cs = [contrato({ id: 'x', criadoEm: '2026-09-01T12:00Z' }), contrato({ id: 'y', criadoEm: '2026-09-01T12:00Z' })];
  const agora = emBrasilia('2026-09-12');
  const r1 = await gerarVisitasDosContratos(porta(b), cs, { agora, limite: 3 });
  assert.deepEqual([r1.criadas, r1.adiadas], [3, 1]);
  assert.match(resumoDaGeracao(r1), /1 visita fica para a próxima rodada/);
  const r2 = await gerarVisitasDosContratos(porta(b), cs, { agora, limite: 3 });
  assert.deepEqual([r2.criadas, r2.adiadas, r2.jaExistiam], [1, 0, 3]);
});

await caso('sem saber quais reservas existem, não gera nada (fail-closed)', async () => {
  const b = novoBanco();
  const p = { ...porta(b), reservas: async () => { throw new Error('offline'); } };
  await assert.rejects(gerarVisitasDosContratos(p, [contrato({ criadoEm: '2026-09-01T12:00Z' })], { agora: emBrasilia('2026-09-12') }));
  assert.equal(b.ordens.size, 0);
});

await caso('contrato sem dono conhecido é ignorado (tenant desconhecido não grava)', async () => {
  const b = novoBanco();
  const r = await gerarVisitasDosContratos(porta(b), [contrato({ userId: undefined, criadoEm: '2026-09-01T12:00Z' })], { agora: emBrasilia('2026-09-12') });
  assert.deepEqual([r.ignorados, b.ordens.size], [1, 0]);
});

await caso('a OS nasce no tenant do DONO, com técnico, checklist por ativo e número sequencial', async () => {
  const b = novoBanco();
  b.seq = 41;
  await gerarVisitasDosContratos(porta(b), [contrato({ criadoEm: '2026-09-01T12:00Z', dataInicio: '2026-09-10' })], { agora: emBrasilia('2026-09-01') });
  const os = b.ordens.get(idsDaVisita('ct1', '2026-09').ordem) as Record<string, unknown>;
  assert.equal(os.user_id, DONO);
  assert.equal(os.numero, 'OS-0042');
  assert.equal(os.status, 'agendada');
  assert.equal(os.tecnico_nome, 'Joana');
  assert.equal(os.valor, null); // contrato mensal: a cobrança é do mês, não da OS
  assert.equal((os.checklist as unknown[]).length, 4);
  const ag = b.agendamentos.get(idsDaVisita('ct1', '2026-09').agendamento) as Record<string, unknown>;
  assert.equal(ag.contrato_id, 'ct1');
  assert.equal(ag.responsavel_id, '00000000-0000-4000-8000-0000000000aa');
  assert.equal(numeroOs(7), 'OS-0007');
});

await caso('checklist: atividade × ativo, ou "Atender <ativo>" sem atividades', () => {
  const ck = checklistDaVisita('os1', [{ id: 'a', nome: 'Split sala' }], []);
  assert.deepEqual(ck.map((i) => i.texto), ['Atender Split sala']);
  assert.equal(checklistDaVisita('os1', [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }], ['x', ' ', 'y']).length, 4);
});

console.log('\nDinheiro');

await caso('receita mensal equivalente e "R$ X/mês em contratos"', () => {
  assert.equal(valorMensalEquivalente({ valor: 300, modoCobranca: 'por_visita', periodicidade: 'trimestral' }), 100);
  assert.equal(valorMensalEquivalente({ valor: 450, modoCobranca: 'mensal', periodicidade: 'anual' }), 450);
  assert.equal(valorMensalEquivalente({ valor: -5, modoCobranca: 'mensal', periodicidade: 'mensal' }), 0);
  const resumo = resumirContratos(
    [
      contrato({ id: '1', valor: 450 }),
      contrato({ id: '2', valor: 300, modoCobranca: 'por_visita', periodicidade: 'trimestral', dataFim: '2026-10-20' }),
      contrato({ id: '3', valor: 999, situacao: 'suspenso' }),
      contrato({ id: '4', valor: 999, dataFim: '2026-09-01' }),
      contrato({ id: '5', valor: 999, excluidoEm: '2026-09-01T00:00Z' }),
    ],
    emBrasilia('2026-09-30'),
  );
  assert.deepEqual(resumo, { ativos: 2, receitaMensal: 550, terminandoEm30Dias: 1 });
  assert.match(fraseReceitaMensal(resumo), /^R\$\s550,00\/mês em contratos$/);
});

await caso('cobrança do contrato: Pix do prestador válido, com valor e referência do mês', () => {
  const emp = { nome: 'Piscinas Azul', nomePrestador: 'Rui', cidade: 'Campinas', chavePix: '529.982.247-25' };
  const c = prepararCobrancaContrato({ contrato: contrato(), empresa: emp, periodo: '2026-10' });
  assert.equal(c.situacaoPix, 'com_pix');
  assert.ok(pixCopiaEColaValido(c.pixCopiaECola));
  assert.ok(c.pixCopiaECola.includes('5406450.00'));
  assert.match(c.texto, /mensalidade de out\/2026/);
  assert.match(c.texto, /Olá, Condomínio!/);
  assert.equal(c.texto.split('\n').at(-1), c.pixCopiaECola); // o código fica sozinho na última linha
});

await caso('cobrança fail-closed: sem chave, chave inválida ou valor zero → sem Pix', () => {
  const base = { nome: 'X', nomePrestador: 'X', cidade: 'X' };
  assert.equal(prepararCobrancaContrato({ contrato: contrato(), empresa: { ...base, chavePix: '' } }).situacaoPix, 'sem_chave');
  assert.equal(prepararCobrancaContrato({ contrato: contrato(), empresa: { ...base, chavePix: '123.456.789-00' } }).situacaoPix, 'chave_invalida');
  const zero = prepararCobrancaContrato({ contrato: contrato({ valor: 0 }), empresa: { ...base, chavePix: '529.982.247-25' } });
  assert.equal(zero.situacaoPix, 'sem_valor');
  assert.equal(zero.pixCopiaECola, '');
  assert.ok(!/000201/.test(zero.texto));
});

console.log('\nCadastro');

await caso('validação: cliente, ativo, periodicidade, datas, horário', () => {
  assert.deepEqual(validarContrato(contrato()), []);
  assert.ok(validarContrato(contrato({ ativos: [] })).some((e) => /ativo/.test(e)));
  assert.ok(validarContrato(contrato({ periodicidade: 'semanal' })).some((e) => /periodicidade/.test(e)));
  assert.ok(validarContrato(contrato({ dataFim: '2025-01-01' })).some((e) => /antes/.test(e)));
  assert.ok(validarContrato(contrato({ horarioVisita: '25:00' })).some((e) => /horário/.test(e)));
  assert.ok(validarContrato(contrato({ clienteId: undefined, clienteNome: ' ' })).some((e) => /cliente/.test(e)));
});

await caso('linha do banco ⇄ domínio sem perder campo; lixo vira default seguro', () => {
  const c = contrato({ dataFim: '2027-01-09', observacoes: 'Chave com o zelador', renovacao: 'automatica' });
  const ida = contratoParaLinha(c);
  const volta = linhaParaContrato({ ...ida, user_id: DONO });
  // JSON tira as chaves `undefined` (campo ausente dos dois lados).
  assert.deepEqual(JSON.parse(JSON.stringify(volta)), JSON.parse(JSON.stringify(c)));
  const estranho = linhaParaContrato({ id: 'z', situacao: 'aguardando_assinatura', valor: 'abc', ativos: [{ nome: '' }, 5], horario_visita: '99:99' });
  assert.equal(estranho.situacao, 'rascunho');
  assert.equal(estranho.valor, 0);
  assert.deepEqual(estranho.ativos, []);
  assert.equal(estranho.horarioVisita, '08:00');
});

console.log('\nAgenda: recorrência e visão por técnico');

function ag(p: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'ag1', clienteNome: 'Ana', titulo: 'Limpeza', tipo: 'limpeza', status: 'agendado',
    inicio: instanteNoBrasil('2026-09-07', '09:00'), fim: instanteNoBrasil('2026-09-07', '10:30'),
    criadoEm: '2026-09-01T00:00Z', atualizadoEm: '2026-09-01T00:00Z', ...p,
  };
}

await caso('semanal: projeta as ocorrências do mês mantendo hora e duração', () => {
  const oc = expandirRecorrencia(ag({ recorrencia: 'semanal' }), instanteNoBrasil('2026-09-01', '00:00'), instanteNoBrasil('2026-10-01', '00:00'));
  assert.deepEqual(oc.map((o) => o.inicio.slice(0, 10)), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  assert.equal(oc[0].id, 'ag1'); // a primeira é a própria linha
  assert.equal(oc[1].id, 'ag1@2026-09-14');
  assert.equal(oc[1].ocorrenciaDe, 'ag1');
  assert.equal(idBaseDaOcorrencia(oc[1].id), 'ag1');
  assert.equal(new Date(oc[3].fim as string).getTime() - new Date(oc[3].inicio).getTime(), 90 * 60_000);
});

await caso('mensal no dia 31 e limite "até": corta no fim do mês e para na data', () => {
  const base = ag({ inicio: instanteNoBrasil('2026-01-31', '08:00'), fim: undefined, recorrencia: 'mensal', recorrenciaAte: '2026-04-30' });
  const oc = expandirRecorrencia(base, instanteNoBrasil('2026-02-01', '00:00'), instanteNoBrasil('2026-12-01', '00:00'));
  assert.deepEqual(oc.map((o) => hojeNoBrasil(new Date(o.inicio))), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

await caso('série cancelada ou na lixeira não projeta; sem recorrência = só a própria', () => {
  const faixa = [instanteNoBrasil('2026-09-01', '00:00'), instanteNoBrasil('2026-12-01', '00:00')] as const;
  assert.equal(expandirRecorrencia(ag({ recorrencia: 'semanal', status: 'cancelado' }), ...faixa).length, 1);
  assert.equal(expandirRecorrencia(ag({ recorrencia: 'semanal', excluidoEm: '2026-09-02T00:00Z' }), ...faixa).length, 0);
  assert.equal(expandirRecorrencia(ag(), ...faixa).length, 1);
  // série de 2024 consultada em 2026: não caminha do começo e acerta o dia
  const velha = ag({ inicio: instanteNoBrasil('2024-01-01', '09:00'), fim: undefined, recorrencia: 'quinzenal' });
  const oc = expandirRecorrencia(velha, instanteNoBrasil('2026-09-01', '00:00'), instanteNoBrasil('2026-09-30', '00:00'));
  assert.ok(oc.length === 2 || oc.length === 3);
  for (const o of oc) assert.equal((new Date(o.inicio).getTime() - new Date(velha.inicio).getTime()) % (14 * 86_400_000), 0);
});

await caso('filtro por técnico: todos, sem responsável, e um técnico', () => {
  const itens = [ag({ id: '1', responsavelId: 'T1' }), ag({ id: '2', responsavelId: 'T2' }), ag({ id: '3' })];
  assert.equal(filtrarPorResponsavel(itens, 'todos').length, 3);
  assert.deepEqual(filtrarPorResponsavel(itens, 'sem').map((i) => i.id), ['3']);
  assert.deepEqual(filtrarPorResponsavel(itens, 'T2').map((i) => i.id), ['2']);
});

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
