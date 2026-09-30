/**
 * Cron do MOTOR DE CONTRATO RECORRENTE (worker/src/contratosJob.js).
 *
 *     node worker/scripts/teste-contratos-job.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Prende: desligado por padrão (e sem nenhuma requisição); só roda no minuto 5 de
 * 06h/12h/18h de Brasília; sem service_role não roda; a rodada gera as visitas com o
 * user_id do PRÓPRIO contrato (service_role ignora RLS — o tenant vem da linha),
 * `criado_por` nulo e cabeçalhos de service_role; rodar de novo não duplica; o teto de
 * visitas por rodada adia o resto; contrato sem user_id é descartado; erro do banco não
 * derruba o cron; o log não carrega id de conta.
 */
import { strict as assert } from 'node:assert';
import {
  configContratos,
  ehHoraDaRodada,
  processarContratos,
} from '../src/contratosJob.js';

let ok = 0;
let falhas = 0;
async function caso(nome, fn) {
  try {
    await fn();
    console.log(`  ok   ${nome}`);
    ok++;
  } catch (e) {
    console.error(`  FALHA ${nome}\n        ${e.message}`);
    falhas++;
  }
}

const DONO = '00000000-0000-4000-8000-000000000001';
const URL_SB = 'https://exemplo.supabase.co';
const CHAVE = 'service_role_sintetica_com_mais_de_20_chars';
const ENV = { CONTRATOS_MOTOR_MODE: 'production', SUPABASE_URL: URL_SB, SUPABASE_SERVICE_ROLE_KEY: CHAVE };
const RODADA = new Date('2026-09-12T09:05:00Z'); // 06:05 de Brasília

function contratoLinha(p = {}) {
  return {
    id: 'ct1', user_id: DONO, titulo: 'Piscina mensal', cliente_id: 'cli1', cliente_nome: 'Condomínio',
    situacao: 'vigente', periodicidade: 'mensal', data_inicio: '2026-09-10', data_fim: null,
    horario_visita: '08:00', ativos: [{ id: 'a1', nome: 'Piscina' }], atividades: ['Medir pH'],
    modo_cobranca: 'mensal', valor: 450, responsavel_id: null, responsavel_nome: null,
    criado_em: '2026-09-01T12:00:00Z', atualizado_em: '2026-09-01T12:00:00Z', excluido_em: null, ...p,
  };
}

/** PostgREST falso: o suficiente das rotas que o job usa, com "insert se não existir". */
function bancoFalso(contratos, opcoes = {}) {
  const tabelas = { contrato_visitas: new Map(), ordens_servico: new Map(), agendamentos: new Map() };
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const caminho = u.pathname.replace('/rest/v1/', '');
    chamadas.push({ metodo: init.method || 'GET', caminho, headers: init.headers, body: init.body });
    // 204 exige corpo nulo (o Response do Node recusa '' com 204).
    const resp = (status, corpo) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status });
    if (opcoes.falharLista && caminho === 'service_contracts') return resp(500, { message: 'boom' });
    if (caminho === 'service_contracts') return resp(200, contratos);
    const tabela = tabelas[caminho];
    if (!tabela) return resp(404, {});
    if ((init.method || 'GET') === 'GET') {
      if (caminho === 'contrato_visitas') {
        const filtro = decodeURIComponent(u.searchParams.get('contrato_id') || '');
        const ids = [...filtro.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        return resp(200, [...tabela.values()].filter((r) => ids.includes(r.contrato_id)));
      }
      return resp(200, [...tabela.values()]);
    }
    if (init.method === 'POST') {
      const [linha] = JSON.parse(init.body);
      if (tabela.has(linha.id)) return resp(201, []);
      tabela.set(linha.id, { ...linha });
      return resp(201, [linha]);
    }
    if (init.method === 'PATCH') {
      const id = decodeURIComponent(u.searchParams.get('id') || '').replace(/^eq\./, '');
      const r = tabela.get(id);
      if (r) Object.assign(r, JSON.parse(init.body));
      return resp(204);
    }
    return resp(405, {});
  };
  return { tabelas, chamadas, fetchImpl };
}

console.log('\nCron do contrato recorrente');

await caso('desligado por padrão e sem nenhuma requisição', async () => {
  const b = bancoFalso([contratoLinha()]);
  const r = await processarContratos({ SUPABASE_URL: URL_SB, SUPABASE_SERVICE_ROLE_KEY: CHAVE }, { now: () => RODADA, fetchImpl: b.fetchImpl });
  assert.equal(r.motivo, 'desligado');
  assert.equal(b.chamadas.length, 0);
  const r2 = await processarContratos({ ...ENV, CONTRATOS_MOTOR_MODE: 'Production?' }, { now: () => RODADA, fetchImpl: b.fetchImpl });
  assert.equal(r2.motivo, 'desligado');
});

await caso('janela: minuto 5 de 06h, 12h e 18h de Brasília', () => {
  assert.equal(ehHoraDaRodada(new Date('2026-09-12T09:05:00Z')), true); // 06:05
  assert.equal(ehHoraDaRodada(new Date('2026-09-12T15:05:30Z')), true); // 12:05
  assert.equal(ehHoraDaRodada(new Date('2026-09-12T21:05:00Z')), true); // 18:05
  assert.equal(ehHoraDaRodada(new Date('2026-09-12T09:06:00Z')), false);
  assert.equal(ehHoraDaRodada(new Date('2026-09-13T02:05:00Z')), false); // 23:05
  assert.equal(ehHoraDaRodada(new Date('2026-09-12T06:05:00Z')), false); // 03:05 (06:05 UTC não é Brasília)
});

await caso('fora da janela não chama o banco', async () => {
  const b = bancoFalso([contratoLinha()]);
  const r = await processarContratos(ENV, { now: () => new Date('2026-09-12T10:05:00Z'), fetchImpl: b.fetchImpl });
  assert.equal(r.motivo, 'fora_da_rodada');
  assert.equal(b.chamadas.length, 0);
});

await caso('sem service_role não roda', async () => {
  const b = bancoFalso([contratoLinha()]);
  const r = await processarContratos({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' }, { now: () => RODADA, fetchImpl: b.fetchImpl });
  assert.equal(r.motivo, 'supabase_nao_configurado');
  assert.equal(b.chamadas.length, 0);
});

await caso('gera as visitas no tenant do contrato, com service_role e criado_por nulo', async () => {
  const b = bancoFalso([contratoLinha(), contratoLinha({ id: 'sem-dono', user_id: null })]);
  const logs = [];
  const log = console.log;
  console.log = (m) => logs.push(String(m));
  let r;
  try {
    r = await processarContratos(ENV, { now: () => RODADA, fetchImpl: b.fetchImpl });
  } finally {
    console.log = log;
  }
  assert.equal(r.motivo, 'ok');
  assert.equal(r.contratos, 1); // o sem user_id foi descartado
  assert.equal(r.criadas, 2); // 10/09 (atrasada) e 10/10 (horizonte)
  assert.equal(b.tabelas.ordens_servico.size, 2);
  assert.equal(b.tabelas.agendamentos.size, 2);
  for (const os of b.tabelas.ordens_servico.values()) {
    assert.equal(os.user_id, DONO);
    assert.equal(os.criado_por, null);
  }
  for (const v of b.tabelas.contrato_visitas.values()) assert.ok(v.ordem_criada_em, 'reserva confirmada');
  const post = b.chamadas.find((c) => c.metodo === 'POST');
  assert.equal(post.headers.Authorization, `Bearer ${CHAVE}`);
  assert.match(post.headers.Prefer, /resolution=ignore-duplicates/);
  assert.ok(!logs.join('\n').includes(DONO), 'log sem id de conta');
  assert.ok(!logs.join('\n').includes('Condomínio'), 'log sem nome de cliente');
});

await caso('rodar de novo não duplica', async () => {
  const b = bancoFalso([contratoLinha()]);
  const silencio = console.log;
  console.log = () => {};
  try {
    await processarContratos(ENV, { now: () => RODADA, fetchImpl: b.fetchImpl });
    const r2 = await processarContratos(ENV, { now: () => RODADA, fetchImpl: b.fetchImpl });
    assert.equal(r2.criadas, 0);
    assert.equal(r2.jaExistiam, 2);
  } finally {
    console.log = silencio;
  }
  assert.equal(b.tabelas.ordens_servico.size, 2);
});

await caso('teto de visitas por rodada adia o resto para a próxima', async () => {
  const b = bancoFalso([contratoLinha()]);
  const silencio = console.log;
  console.log = () => {};
  try {
    const r = await processarContratos({ ...ENV, CONTRATOS_MOTOR_MAX_VISITAS: '1' }, { now: () => RODADA, fetchImpl: b.fetchImpl });
    assert.deepEqual([r.criadas, r.adiadas], [1, 1]);
    const r2 = await processarContratos({ ...ENV, CONTRATOS_MOTOR_MAX_VISITAS: '1' }, { now: () => RODADA, fetchImpl: b.fetchImpl });
    assert.deepEqual([r2.criadas, r2.adiadas], [1, 0]);
  } finally {
    console.log = silencio;
  }
  assert.equal(b.tabelas.ordens_servico.size, 2);
});

await caso('erro do banco não derruba o cron (motivo falhou, sem exceção)', async () => {
  const b = bancoFalso([], { falharLista: true });
  const erro = console.error;
  console.error = () => {};
  try {
    const r = await processarContratos(ENV, { now: () => RODADA, fetchImpl: b.fetchImpl });
    assert.equal(r.motivo, 'falhou');
    assert.equal(r.codigo, 'supabase_500');
  } finally {
    console.error = erro;
  }
});

await caso('configuração: padrões e limites', () => {
  assert.deepEqual({ ...configContratos({}) }, { maxContratos: 200, maxVisitas: 10 });
  assert.deepEqual({ ...configContratos({ CONTRATOS_MOTOR_MAX_VISITAS: '999', CONTRATOS_MOTOR_MAX_CONTRATOS: '0' }) }, { maxContratos: 200, maxVisitas: 10 });
  assert.equal(configContratos({ CONTRATOS_MOTOR_MAX_VISITAS: '25' }).maxVisitas, 25);
});

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
