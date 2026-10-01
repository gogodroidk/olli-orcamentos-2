/**
 * PÁGINA DO CLIENTE (item 2.15) — KPIs e linha do tempo.
 *
 *     node scripts/teste-cliente-detalhe.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Trava as regras puras de `src/utils/clienteDetalhe.ts`:
 *  1) gasto total pago = soma dos recibos NÃO estornados, só deste cliente (por id,
 *     nunca por nome), arredondada em centavos;
 *  2) último serviço = mesma regra do pós-venda (recibo, visita concluída, orçamento
 *     aprovado/convertido); proposta só enviada e data no futuro não contam;
 *  3) próxima visita = primeira ocorrência AGENDADA que ainda não começou, abrindo a
 *     linha-base quando é repetição de série;
 *  4) próximo lembrete = último serviço + intervalo do ofício, com "vencido";
 *  5) timeline unificada, mais recente primeiro, lixeira fora, data ilegível no fim;
 *  6) coordenada só quando gravada (0,0 e lixo = ausente) e mapa só com chave.
 * E checa, no fonte, que a tela usa o helper de WhatsApp e o deep link de rota.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  calcularKpisCliente,
  coordenadasDoCliente,
  enderecoCompletoCliente,
  montarTimelineCliente,
  urlMapaEstatico,
} from '../src/utils/clienteDetalhe.ts';
import type { Agendamento, Orcamento, OrdemServico, Recibo } from '../src/types/index.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

const AGORA = new Date('2026-10-01T12:00:00.000Z');
const ID = 'cli-1';

function orc(p: Partial<Orcamento>): Orcamento {
  return {
    id: 'o', numero: '1', clienteId: ID, clienteNome: 'Ana', clienteTelefone: '', itens: [],
    subtotalServicos: 0, subtotalProdutos: 0, subtotal: 0, desconto: 0, descontoTipo: 'valor',
    valorTotal: 100, status: 'enviado', dataEmissao: '01/01/2026',
    formasPagamento: {} as Orcamento['formasPagamento'],
    exibirAssinatura: false, solicitarAssinaturaCliente: false, exibirAprovacao: false, exibirRecusa: false,
    criadoEm: '2026-01-01T10:00:00.000Z', atualizadoEm: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}

function rec(p: Partial<Recibo>): Recibo {
  return {
    id: 'r', numero: 'R1', clienteId: ID, clienteNome: 'Ana', clienteTelefone: '', itens: [],
    valorRecebido: 0, formaPagamento: 'Pix', dataRecebimento: '10/03/2026', exibirAssinatura: false,
    criadoEm: '2026-03-10T15:00:00.000Z',
    ...p,
  };
}

function ag(p: Partial<Agendamento>): Agendamento {
  return {
    id: 'a', clienteId: ID, clienteNome: 'Ana', titulo: '', tipo: 'visita',
    inicio: '2026-02-01T13:00:00.000Z', status: 'agendado',
    criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

function os(p: Partial<OrdemServico>): OrdemServico {
  return {
    id: 'os', numero: 'OS-1', clienteId: ID, clienteNome: 'Ana', titulo: 'Limpeza split',
    status: 'aberta', checklist: [], fotos: [],
    criadoEm: '2026-04-01T10:00:00.000Z', atualizadoEm: '2026-04-01T10:00:00.000Z',
    ...p,
  };
}

const vazio = { orcamentos: [], ordens: [], recibos: [], agendamentos: [] };

// ─── 1. Gasto total pago ─────────────────────────────────────────────────────
caso('gasto soma só recibos deste cliente, sem estornados nem lixeira, em centavos', () => {
  const k = calcularKpisCliente({
    ...vazio,
    clienteId: ID,
    recibos: [
      rec({ id: 'r1', valorRecebido: 0.1 }),
      rec({ id: 'r2', valorRecebido: 0.2 }),
      rec({ id: 'r3', valorRecebido: 500, estornadoEm: '2026-03-11T00:00:00.000Z' }),
      rec({ id: 'r4', valorRecebido: 700, excluidoEm: '2026-03-12T00:00:00.000Z' }),
      rec({ id: 'r5', valorRecebido: 900, clienteId: 'outro', clienteNome: 'Ana' }), // homônimo
      rec({ id: 'r6', valorRecebido: Number.NaN }),
    ],
    mesesIntervalo: 6,
    agora: AGORA,
  });
  assert.equal(k.gastoTotalPago, 0.3);
  assert.equal(k.pagamentos, 3); // r1, r2, r6 (valor ilegível conta o recibo, soma 0)
});

caso('cliente sem nada: zero pago e KPIs nulos (nunca "hoje" inventado)', () => {
  const k = calcularKpisCliente({ ...vazio, clienteId: ID, mesesIntervalo: 6, agora: AGORA });
  assert.deepEqual(k, { gastoTotalPago: 0, pagamentos: 0, ultimoServico: null, proximaVisita: null, proximoLembrete: null });
});

caso('clienteId vazio não casa com documento sem cliente', () => {
  const k = calcularKpisCliente({ ...vazio, clienteId: '  ', recibos: [rec({ clienteId: '', valorRecebido: 50 })], mesesIntervalo: 6, agora: AGORA });
  assert.equal(k.gastoTotalPago, 0);
});

// ─── 2. Último serviço ───────────────────────────────────────────────────────
caso('último serviço = maior entre recibo, visita concluída e orçamento aprovado', () => {
  const k = calcularKpisCliente({
    clienteId: ID,
    orcamentos: [
      orc({ id: 'o1', status: 'aprovado', atualizadoEm: '2026-05-20T10:00:00.000Z' }),
      orc({ id: 'o2', status: 'enviado', atualizadoEm: '2026-09-01T10:00:00.000Z' }), // proposta não conta
    ],
    ordens: [],
    recibos: [rec({ id: 'r1', dataRecebimento: '10/03/2026', valorRecebido: 10 })],
    agendamentos: [
      ag({ id: 'a1', status: 'concluido', inicio: '2026-06-15T13:00:00.000Z' }),
      ag({ id: 'a2', status: 'cancelado', inicio: '2026-08-15T13:00:00.000Z' }),
    ],
    mesesIntervalo: 6,
    agora: AGORA,
  });
  assert.equal(k.ultimoServico, '2026-06-15T13:00:00.000Z');
});

caso('recibo com data BR é lido como DD/MM (10/07 é julho, não outubro)', () => {
  const k = calcularKpisCliente({ ...vazio, clienteId: ID, recibos: [rec({ dataRecebimento: '10/07/2026', valorRecebido: 1 })], mesesIntervalo: 6, agora: AGORA });
  assert.equal(k.ultimoServico, '2026-07-10T12:00:00.000Z');
});

caso('serviço com data no futuro e recibo estornado não viram "último serviço"', () => {
  const k = calcularKpisCliente({
    ...vazio,
    clienteId: ID,
    recibos: [rec({ dataRecebimento: '10/12/2026', valorRecebido: 1 }), rec({ id: 'r2', valorRecebido: 1, estornadoEm: 'x' })],
    mesesIntervalo: 6,
    agora: AGORA,
  });
  assert.equal(k.ultimoServico, null);
  assert.equal(k.proximoLembrete, null);
});

// ─── 3. Próxima visita ───────────────────────────────────────────────────────
caso('próxima visita = 1ª agendada que ainda não começou; repetição abre a base', () => {
  const k = calcularKpisCliente({
    ...vazio,
    clienteId: ID,
    agendamentos: [ag({ id: 'base', inicio: '2026-01-05T13:00:00.000Z', recorrencia: 'mensal' })],
    ocorrenciasFuturas: [
      ag({ id: 'passada', inicio: '2026-09-30T13:00:00.000Z' }),
      ag({ id: 'cancelada', inicio: '2026-10-02T13:00:00.000Z', status: 'cancelado' }),
      ag({ id: 'base@2026-11-05', ocorrenciaDe: 'base', inicio: '2026-11-05T13:00:00.000Z', titulo: 'Manutenção mensal' } as Partial<Agendamento>),
      ag({ id: 'base@2026-10-05', ocorrenciaDe: 'base', inicio: '2026-10-05T13:00:00.000Z', titulo: 'Manutenção mensal' } as Partial<Agendamento>),
      ag({ id: 'outro', clienteId: 'x', inicio: '2026-10-01T13:00:00.000Z' }),
    ],
    mesesIntervalo: 6,
    agora: AGORA,
  });
  assert.deepEqual(k.proximaVisita, { inicio: '2026-10-05T13:00:00.000Z', titulo: 'Manutenção mensal', agendamentoId: 'base' });
});

caso('sem título, a visita usa o rótulo do tipo; sem ocorrências expandidas, usa a agenda', () => {
  const k = calcularKpisCliente({
    ...vazio,
    clienteId: ID,
    agendamentos: [ag({ id: 'v1', tipo: 'limpeza', inicio: '2026-10-10T13:00:00.000Z' })],
    mesesIntervalo: 6,
    agora: AGORA,
  });
  assert.deepEqual(k.proximaVisita, { inicio: '2026-10-10T13:00:00.000Z', titulo: 'Limpeza', agendamentoId: 'v1' });
});

// ─── 4. Próximo lembrete ─────────────────────────────────────────────────────
caso('lembrete = último serviço + intervalo; vencido quando a data já passou', () => {
  const base = { ...vazio, clienteId: ID, recibos: [rec({ dataRecebimento: '10/03/2026', valorRecebido: 1 })], agora: AGORA };
  const seis = calcularKpisCliente({ ...base, mesesIntervalo: 6 });
  assert.equal(seis.proximoLembrete?.quando.slice(0, 10), '2026-09-10');
  assert.equal(seis.proximoLembrete?.vencido, true);
  const doze = calcularKpisCliente({ ...base, mesesIntervalo: 12 });
  assert.equal(doze.proximoLembrete?.quando.slice(0, 10), '2027-03-10');
  assert.equal(doze.proximoLembrete?.vencido, false);
  const zero = calcularKpisCliente({ ...base, mesesIntervalo: 0 }); // intervalo inválido → piso 1 mês
  assert.equal(zero.proximoLembrete?.quando.slice(0, 10), '2026-04-10');
});

// ─── 5. Timeline ─────────────────────────────────────────────────────────────
caso('timeline une os 4 tipos, mais recente primeiro, e data ilegível vai para o fim', () => {
  const t = montarTimelineCliente({
    clienteId: ID,
    orcamentos: [
      orc({ id: 'o1', numero: '0007', status: 'aprovado', criadoEm: '2026-02-01T10:00:00.000Z', valorTotal: 450 }),
      orc({ id: 'o-lixo', criadoEm: '2026-09-01T10:00:00.000Z', excluidoEm: '2026-09-02T00:00:00.000Z' }),
      orc({ id: 'o-outro', clienteId: 'x', criadoEm: '2026-09-01T10:00:00.000Z' }),
      orc({ id: 'o-sem-data', criadoEm: 'lixo' }),
    ],
    ordens: [os({ id: 'os1', numero: '12', concluidoEm: '2026-04-05T10:00:00.000Z', status: 'concluida', valor: 450 })],
    recibos: [rec({ id: 'r1', numero: '3', dataRecebimento: '06/04/2026', valorRecebido: 450 })],
    agendamentos: [ag({ id: 'v1', inicio: '2026-10-20T13:00:00.000Z', titulo: 'Retorno' })],
  });
  assert.deepEqual(t.map((i) => i.chave), ['visita:v1', 'recibo:r1', 'os:os1', 'orcamento:o1', 'orcamento:o-sem-data']);
  assert.equal(t[3].titulo, 'Orçamento nº 0007');
  assert.equal(t[3].status, 'Aprovado');
  assert.equal(t[3].valor, 450);
  assert.equal(t[2].titulo, 'OS nº 12 · Limpeza split');
  assert.equal(t[2].status, 'Concluída');
  assert.equal(t[1].status, 'Pago');
  assert.equal(t[0].status, 'Agendado');
  assert.equal(t[4].quando, null);
});

caso('OS antiga sem cliente entra pelo orçamento DESTE cliente; a de outro, não', () => {
  const t = montarTimelineCliente({
    clienteId: ID,
    orcamentos: [orc({ id: 'o1' })],
    ordens: [
      os({ id: 'os-legada', clienteId: undefined, orcamentoId: 'o1' }),
      os({ id: 'os-alheia', clienteId: undefined, orcamentoId: 'o-de-outro' }),
      os({ id: 'os-avulsa', clienteId: undefined }),
      os({ id: 'os-de-outro', clienteId: 'x', orcamentoId: 'o1' }),
    ],
    recibos: [],
    agendamentos: [],
  });
  assert.deepEqual(t.filter((i) => i.tipo === 'os').map((i) => i.id), ['os-legada']);
});

caso('estornado, cancelada e recusado ficam marcados como inativos', () => {
  const t = montarTimelineCliente({
    clienteId: ID,
    orcamentos: [orc({ id: 'o1', status: 'recusado' })],
    ordens: [os({ id: 'os1', status: 'cancelada' })],
    recibos: [rec({ id: 'r1', estornadoEm: '2026-03-11T00:00:00.000Z', valorRecebido: 10 })],
    agendamentos: [ag({ id: 'v1', status: 'cancelado' })],
  });
  assert.ok(t.every((i) => i.inativo));
  assert.equal(t.find((i) => i.tipo === 'recibo')?.status, 'Estornado');
});

// ─── 6. Endereço, coordenada e mapa ──────────────────────────────────────────
caso('endereço completo ignora partes vazias', () => {
  assert.equal(enderecoCompletoCliente({ endereco: 'Rua A, 10', complemento: ' ', cidade: 'Campinas', estado: 'SP', cep: '13000-000' }), 'Rua A, 10, Campinas, SP, 13000-000');
  assert.equal(enderecoCompletoCliente({}), '');
});

caso('coordenada só quando gravada e plausível', () => {
  assert.deepEqual(coordenadasDoCliente({ lat: -22.9, lng: -47.06 }), { lat: -22.9, lng: -47.06 });
  assert.deepEqual(coordenadasDoCliente({ latitude: '-23.5', longitude: '-46.6' }), { lat: -23.5, lng: -46.6 });
  assert.equal(coordenadasDoCliente({ nome: 'sem coordenada' }), null);
  assert.equal(coordenadasDoCliente({ lat: 0, lng: 0 }), null);
  assert.equal(coordenadasDoCliente({ lat: 120, lng: 10 }), null);
  assert.equal(coordenadasDoCliente({ lat: '', lng: '' }), null);
  assert.equal(coordenadasDoCliente(null), null);
});

caso('mapa estático só com coordenada E com a chave que já existe', () => {
  const c = { lat: -22.9, lng: -47.06 };
  assert.equal(urlMapaEstatico(c, ''), null);
  assert.equal(urlMapaEstatico(null, 'k'), null);
  const url = urlMapaEstatico(c, 'chave-x') ?? '';
  assert.ok(url.startsWith('https://maps.googleapis.com/maps/api/staticmap?center=-22.900000,-47.060000'));
  assert.ok(url.endsWith('&key=chave-x'));
});

// ─── 7. A tela usa os helpers certos ─────────────────────────────────────────
caso('a tela usa numeroWhatsAppBR, abrirRotaGoogleMaps e a rota está registrada', () => {
  const tela = readFileSync(new URL('../src/screens/ClienteDetalheScreen.tsx', import.meta.url), 'utf8');
  assert.ok(tela.includes('numeroWhatsAppBR('), 'WhatsApp tem de passar pelo helper único');
  assert.ok(tela.includes('abrirRotaGoogleMaps('), 'rota tem de usar o deep link existente');
  assert.ok(tela.includes('calcularKpisCliente(') && tela.includes('montarTimelineCliente('));
  const nav = readFileSync(new URL('../src/navigation/AppNavigator.tsx', import.meta.url), 'utf8');
  assert.ok(/ClienteDetalhe:\s*\{\s*clienteId:\s*string\s*\}/.test(nav), 'param tipado');
  assert.ok(nav.includes('name="ClienteDetalhe"'), 'rota registrada no stack');
  const lista = readFileSync(new URL('../src/screens/ClientesScreen.tsx', import.meta.url), 'utf8');
  assert.ok(lista.includes("navigate('ClienteDetalhe'"), 'tocar na lista abre a página do cliente');
});

// ─── 8. Técnico não vê agenda/OS da equipe nem dinheiro ─────────────────────
caso('a tela aplica o escopo do papel: técnico só vê o dele e nada de valores', () => {
  const tela = readFileSync(new URL('../src/screens/ClienteDetalheScreen.tsx', import.meta.url), 'utf8');
  assert.ok(tela.includes('resolverEscopoAgenda(') && tela.includes('aplicarEscopo('), 'visitas passam pelo escopo da Agenda');
  assert.ok(/os\.tecnicoId === escopo\.userId/.test(tela), 'OS do técnico = só as atribuídas a ele');
  assert.ok(tela.includes("pode('ver_valores_agregados')"), 'gasto/recibos dependem de ver_valores_agregados');
  assert.ok(/podeFinanceiro \? recibos : \[\]/.test(tela), 'recibos não chegam à timeline de quem não vê dinheiro');
  assert.ok(/escopo\.status === 'erro'/.test(tela), 'papel ilegível vira aviso, não visão de gestão');
  const lista = readFileSync(new URL('../src/screens/ClientesScreen.tsx', import.meta.url), 'utf8');
  assert.ok(/carregandoPermissao \? null :/.test(lista), '"acesso restrito" não aparece enquanto o papel carrega');
});

console.log(`\nPASSOU: ${passos} casos`);
