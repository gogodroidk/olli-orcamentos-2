/**
 * Teste da decisão do RESUMO DIÁRIO (`src/resumoDinheiroPolicy.js`).
 *
 *     node scripts/teste-resumo-dinheiro-policy.js   (de dentro de worker/)
 *
 * Protege:
 *   - a janela (7h00–7h50 de Brasília, de 10 em 10 min, nunca domingo) e o dia de
 *     Brasília na chave de idempotência;
 *   - PARIDADE painel × servidor: para contas geradas ao acaso, o resumo que o
 *     Worker calcula em cima da projeção mínima do banco (`dados_resumo_dinheiro`)
 *     é IGUAL ao que o painel calcula em cima das linhas completas que ele lê
 *     (`useOlliList`: todos os status, com nome, telefone e blob inteiro);
 *   - "não sei" nunca vira e-mail: resposta torta ou truncada = sem resumo;
 *   - nada acionável = sem resumo; `template_dados` pequeno e sem PII.
 */
import assert from 'node:assert/strict';
import {
  chaveResumo,
  decidirResumo,
  diaBrasilia,
  entradaDoBanco,
  rodadaDoResumo,
} from '../src/resumoDinheiroPolicy.js';
import { resumirDinheiroParado } from '../../src/services/radarDinheiro.ts';

const U1 = '00000000-0000-4000-8000-000000000001';
const AGORA = new Date('2026-09-30T10:00:00.000Z'); // quarta, 7h00 em Brasília
const D = 864e5;

let ok = 0;
function caso(nome, fn) {
  fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

// ─── Espelho, em JS, da projeção SQL de `dados_resumo_dinheiro` ──────────────
// (a MESMA projeção foi conferida contra o Postgres real com PGlite — ver o PR).
const STATUS_BANCO = new Set(['aprovado', 'convertido', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura']);
const campo = (d, k) => (d && Object.hasOwn(d, k) && d[k] !== undefined ? d[k] : null);
const slugSql = (s) => (typeof s === 'string' ? s.replace(/^ +| +$/g, '').toLowerCase() : null);

function comoBanco(conta, maxLinhas = 2000) {
  const vivos = (xs) => xs.filter((x) => !x.excluido_em);
  const orcamentos = vivos(conta.orcamentos)
    .filter((o) => STATUS_BANCO.has(slugSql(o.status)))
    .map((o) => ({
      id: o.id, status: o.status, cliente_id: o.cliente_id ?? null,
      valor_total: o.valor_total ?? null, subtotal: o.subtotal ?? null,
      criado_em: o.criado_em ?? null, atualizado_em: o.atualizado_em ?? null,
      dados: {
        valorTotal: campo(o.dados, 'valorTotal'), subtotal: campo(o.dados, 'subtotal'),
        atualizadoEm: campo(o.dados, 'atualizadoEm'), criadoEm: campo(o.dados, 'criadoEm'),
        clienteId: campo(o.dados, 'clienteId'),
      },
    }));
  const recibos = vivos(conta.recibos).map((r) => ({
    orcamento_id: r.orcamento_id ?? null, cliente_id: r.cliente_id ?? null,
    valor_recebido: r.valor_recebido ?? null, criado_em: r.criado_em ?? null,
    dados: {
      orcamentoId: campo(r.dados, 'orcamentoId'), valorRecebido: campo(r.dados, 'valorRecebido'),
      dataRecebimento: campo(r.dados, 'dataRecebimento'), clienteId: campo(r.dados, 'clienteId'),
      criadoEm: campo(r.dados, 'criadoEm'),
    },
  }));
  const clientes = vivos(conta.clientes).map((c) => c.id);
  const agendamentos = vivos(conta.agendamentos)
    .filter((a) => slugSql(a.status) === 'concluido')
    .map((a) => ({ cliente_id: a.cliente_id ?? null, status: a.status, inicio: a.inicio ?? null, fim: a.fim ?? null }));
  const osConcluidas = vivos(conta.os).filter((s) => s.status === 'concluida' && s.orcamento_id).map((s) => s.orcamento_id);
  const n = Math.max(orcamentos.length, recibos.length, clientes.length, agendamentos.length, osConcluidas.length);
  return JSON.parse(JSON.stringify({
    orcamentos, recibos, clientes, agendamentos, osConcluidas,
    adiados: conta.snooze && typeof conta.snooze === 'object' && !Array.isArray(conta.snooze) ? conta.snooze : {},
    truncado: n > maxLinhas,
  }));
}

/** O que o PAINEL faz com as linhas completas (index.tsx + useRadarSnooze + cards). */
function comoPainel(conta) {
  const vivos = (xs) => xs.filter((x) => !x.excluido_em);
  const adiados = {};
  if (conta.snooze && typeof conta.snooze === 'object' && !Array.isArray(conta.snooze)) {
    for (const [id, ate] of Object.entries(conta.snooze)) if (typeof ate === 'string' && ate) adiados[id] = ate;
  }
  return resumirDinheiroParado({
    orcamentos: vivos(conta.orcamentos),
    recibos: vivos(conta.recibos),
    clientes: vivos(conta.clientes),
    agendamentos: vivos(conta.agendamentos),
    adiados,
    orcamentosFinalizados: new Set(vivos(conta.os).filter((s) => s.status === 'concluida' && s.orcamento_id).map((s) => String(s.orcamento_id))),
  }, AGORA);
}

// ─── Gerador de contas (determinístico) ─────────────────────────────────────
function prng(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUS = ['aprovado', 'convertido', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura', 'rascunho', 'recusado', 'cancelado', ' Aprovado ', 'ENVIADO'];
function gerarConta(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const talvez = (v, p = 0.5) => (r() < p ? v : undefined);
  const dataIso = () => new Date(AGORA.getTime() - Math.floor(r() * 400) * D - Math.floor(r() * D)).toISOString();
  const dataBr = () => {
    const d = new Date(AGORA.getTime() - Math.floor(r() * 400) * D);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  };
  const nCli = Math.floor(r() * 8);
  const clientes = Array.from({ length: nCli }, (_, i) => ({ id: `c${i}`, nome: `Cliente ${i}`, telefone: '11999990000', excluido_em: talvez('2026-09-01T00:00:00Z', 0.1) }));
  const cid = () => (nCli > 0 && r() < 0.9 ? `c${Math.floor(r() * nCli)}` : undefined);
  const orcamentos = Array.from({ length: Math.floor(r() * 10) }, (_, i) => {
    const valor = r() < 0.8 ? Math.round(r() * 500000) / 100 : undefined;
    const noBlob = r() < 0.3;
    return {
      id: `o${i}`, numero: `ORC-${i}`, cliente_nome: 'Fulano', status: pick(STATUS), cliente_id: cid(),
      valor_total: noBlob ? undefined : valor, subtotal: talvez(valor, 0.2),
      criado_em: talvez(dataIso(), 0.9), atualizado_em: talvez(dataIso(), 0.7),
      excluido_em: talvez('2026-09-01T00:00:00Z', 0.1),
      dados: r() < 0.8 ? {
        numero: `ORC-${i}`, clienteNome: 'Fulano', clienteTelefone: '11999990000',
        valorTotal: noBlob ? valor : talvez(valor, 0.5), atualizadoEm: talvez(r() < 0.1 ? 'lixo' : dataIso(), 0.5),
        criadoEm: talvez(dataIso(), 0.5), clienteId: cid(),
      } : undefined,
    };
  });
  const recibos = Array.from({ length: Math.floor(r() * 6) }, () => ({
    orcamento_id: r() < 0.7 && orcamentos.length ? `o${Math.floor(r() * orcamentos.length)}` : undefined,
    cliente_id: cid(), valor_recebido: talvez(Math.round(r() * 300000) / 100, 0.7),
    criado_em: talvez(dataIso(), 0.8), excluido_em: talvez('2026-09-01T00:00:00Z', 0.1),
    dados: r() < 0.8 ? { valorRecebido: talvez(Math.round(r() * 300000) / 100), dataRecebimento: talvez(r() < 0.1 ? '31/02/xx' : dataBr(), 0.7), orcamentoId: talvez(orcamentos.length ? `o${Math.floor(r() * orcamentos.length)}` : undefined, 0.3), clienteId: cid(), criadoEm: talvez(dataIso()) } : undefined,
  }));
  const agendamentos = Array.from({ length: Math.floor(r() * 5) }, () => ({
    cliente_id: cid(), status: pick(['concluido', 'agendado', ' Concluido']), inicio: talvez(dataIso(), 0.9), fim: talvez(dataIso(), 0.6),
    excluido_em: talvez('2026-09-01T00:00:00Z', 0.1),
  }));
  const os = Array.from({ length: Math.floor(r() * 3) }, () => ({
    orcamento_id: orcamentos.length ? `o${Math.floor(r() * orcamentos.length)}` : null, status: pick(['concluida', 'aberta', 'agendada']),
  }));
  const snooze = r() < 0.3 && nCli ? { [`c${Math.floor(r() * nCli)}`]: new Date(AGORA.getTime() + 10 * D).toISOString(), lixo: 5 } : null;
  return { orcamentos, recibos, clientes, agendamentos, os, snooze };
}

// ─── Casos ───────────────────────────────────────────────────────────────────

caso('janela: 7h00–7h50 de Brasília, de 10 em 10 min', () => {
  assert.equal(rodadaDoResumo(new Date('2026-09-30T10:00:00Z')), 0);
  assert.equal(rodadaDoResumo(new Date('2026-09-30T10:50:00Z')), 5);
  assert.equal(rodadaDoResumo(new Date('2026-09-30T10:05:00Z')), null);
  assert.equal(rodadaDoResumo(new Date('2026-09-30T09:50:00Z')), null); // 6h50
  assert.equal(rodadaDoResumo(new Date('2026-09-30T11:00:00Z')), null); // 8h00
  assert.equal(rodadaDoResumo(new Date('2026-10-04T10:00:00Z')), null); // domingo
  assert.equal(rodadaDoResumo(new Date('2026-10-03T10:00:00Z')), 0); // sábado
  assert.equal(rodadaDoResumo(new Date('invalida')), null);
});

caso('dia e chave no calendário de Brasília', () => {
  assert.equal(diaBrasilia(new Date('2026-10-01T02:00:00Z')), '2026-09-30');
  assert.equal(chaveResumo(U1, '2026-09-30'), `resumo:dinheiro:${U1}:2026-09-30`);
});

caso('PARIDADE: 500 contas ao acaso — servidor (projeção do banco) = painel (linhas completas)', () => {
  const r = prng(20260930);
  let acionaveis = 0;
  for (let i = 0; i < 500; i++) {
    const conta = gerarConta(r);
    const painel = comoPainel(conta);
    const d = decidirResumo(U1, comoBanco(conta), { agora: AGORA });
    if (!painel.acionavel) {
      assert.equal(d.motivo, 'nada_acionavel', `conta ${i}`);
      continue;
    }
    acionaveis += 1;
    assert.equal(d.enfileirar, true, `conta ${i}`);
    assert.deepEqual({ ...d.pedido.dados }, {
      data: '2026-09-30',
      aReceberCentavos: painel.aReceber.itens > 0 ? painel.aReceber.centavos : 0,
      aReceberItens: painel.aReceber.itens,
      diasMaisAntigo: painel.aReceber.itens > 0 ? painel.aReceber.diasMaisAntigo : null,
      semValor: painel.aReceber.semValor,
      propostasParadas: painel.propostasParadas,
      clientesSumidos: painel.clientesSumidos,
    }, `conta ${i}`);
  }
  assert.ok(acionaveis > 100 && acionaveis < 500, `amostra pouco variada: ${acionaveis}`);
});

caso('pedido: chave por conta + dia, dados pequenos e sem PII', () => {
  const conta = {
    orcamentos: [{ id: 'a', status: 'aprovado', valor_total: 850, atualizado_em: new Date(AGORA - 12 * D).toISOString(), cliente_nome: 'Maria Silva', dados: { clienteTelefone: '11987654321', clienteNome: 'Maria Silva' } }],
    recibos: [], clientes: [], agendamentos: [], os: [], snooze: null,
  };
  const d = decidirResumo(U1, comoBanco(conta), { agora: AGORA });
  assert.equal(d.enfileirar, true);
  assert.equal(d.pedido.idempotencyKey, `resumo:dinheiro:${U1}:2026-09-30`);
  assert.deepEqual({ ...d.pedido.dados }, {
    data: '2026-09-30', aReceberCentavos: 85000, aReceberItens: 1, diasMaisAntigo: 12,
    semValor: 0, propostasParadas: 0, clientesSumidos: 0,
  });
  const json = JSON.stringify(d.pedido.dados);
  assert.ok(new TextEncoder().encode(json).length < 300);
  assert.equal(/Maria|1198765/.test(json), false);
  assert.ok(Object.isFrozen(d.pedido) && Object.isFrozen(d.pedido.dados));
});

caso('nada acionável = sem resumo (inclusive só "aprovado sem valor")', () => {
  const vazio = { orcamentos: [], recibos: [], clientes: [], agendamentos: [], osConcluidas: [], adiados: {}, truncado: false };
  assert.equal(decidirResumo(U1, vazio, { agora: AGORA }).motivo, 'nada_acionavel');
  const semValor = { ...vazio, orcamentos: [{ id: 'x', status: 'aprovado', dados: {} }] };
  assert.equal(decidirResumo(U1, semValor, { agora: AGORA }).motivo, 'nada_acionavel');
});

caso('"não sei" nunca vira e-mail: resposta torta ou truncada', () => {
  const base = { orcamentos: [{ id: 'a', status: 'aprovado', valor_total: 10, atualizado_em: AGORA.toISOString() }], recibos: [], clientes: [], agendamentos: [], osConcluidas: [], adiados: {}, truncado: false };
  assert.equal(decidirResumo(U1, base, { agora: AGORA }).enfileirar, true);
  assert.equal(decidirResumo(U1, { ...base, truncado: true }, { agora: AGORA }).motivo, 'dados_truncados');
  assert.equal(decidirResumo(U1, { ...base, recibos: null }, { agora: AGORA }).motivo, 'dados_invalidos');
  assert.equal(decidirResumo(U1, { ...base, truncado: 'nao' }, { agora: AGORA }).motivo, 'dados_invalidos');
  assert.equal(decidirResumo(U1, null, { agora: AGORA }).motivo, 'dados_invalidos');
  assert.equal(decidirResumo(U1, [], { agora: AGORA }).motivo, 'dados_invalidos');
  assert.equal(decidirResumo('nao-e-uuid', base, { agora: AGORA }).motivo, 'conta_invalida');
  assert.equal(decidirResumo(U1, base, { agora: new Date('x') }).motivo, 'agora_invalido');
});

caso('entrada do banco: adiamento só string→string; OS concluída tira do radar', () => {
  const e = entradaDoBanco({
    orcamentos: [{ id: 'a', status: 'aprovado', valor_total: 10 }], recibos: [], clientes: ['c1', 5], agendamentos: [],
    osConcluidas: ['a', null], adiados: { c1: '2026-12-01T00:00:00Z', c2: 7, c3: '' }, truncado: false,
  });
  assert.deepEqual(e.entrada.adiados, { c1: '2026-12-01T00:00:00Z' });
  assert.deepEqual(e.entrada.clientes, [{ id: 'c1' }]);
  assert.deepEqual([...e.entrada.orcamentosFinalizados], ['a']);
  assert.equal(resumirDinheiroParado(e.entrada, AGORA).aReceber.itens, 0);
});

console.log(`\nPASSOU: ${ok} casos — decisão do resumo diário do dinheiro parado`);
