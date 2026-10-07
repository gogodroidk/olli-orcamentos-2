/**
 * Teste do ALARME DO PIX (worker/src/alarmePix.js).
 *     node worker/scripts/teste-alarme-pix.js
 * Exit 0 = passou; 1 = falhou.
 * Tranca: (1) três estados — provedor/banco fora = `indisponivel`, nunca "sem Pix" nem "ok";
 * (2) sem Pix pago real na janela = alerta; (3) cobrança devMode não conta; (4) PAID sem consumo
 * (madura) = `pago_sem_credito`, mas folga de 15 min antes de acusar; (5) ok só quando tudo bate;
 * (6) a linha do dia vai para webhook_events sem id de cobrança; (7) hora do cron.
 */
import { avaliarAlarmePix, dataBrasilia, horaDoAlarmePix, rodarAlarmePix } from '../src/alarmePix.js';

let ok = 0;
let falhas = 0;
function checar(nome, atual, esperado) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHA ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  atual:    ${JSON.stringify(atual)}`);
  }
}

const agora = new Date('2026-10-06T11:23:00Z');
const velho = '2026-10-05T10:00:00Z';
const recente = '2026-10-06T11:15:00Z';
const bancoOk = (...ids) => ({ estado: 'ok', consumidos: new Set(ids) });

// 1) três estados
checar('provedor fora', avaliarAlarmePix({ agora, provedor: { estado: 'indisponivel', pagas: [] }, banco: bancoOk() }).estado, 'indisponivel');
checar(
  'banco fora com pagas',
  avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [{ id: 'pix_char_1', criadoEm: velho }] }, banco: { estado: 'indisponivel', consumidos: new Set() } }).estado,
  'indisponivel',
);

// 2) sem Pix real
checar('sem pagas', avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [] }, banco: bancoOk() }).codigos, ['sem_pix_na_janela']);
checar(
  'so devMode nao conta',
  avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [{ id: 'pix_char_d', devMode: true, criadoEm: velho }] }, banco: bancoOk() }).codigos,
  ['sem_pix_na_janela'],
);

// 3) divergência provedor x tabela
const div = avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [{ id: 'pix_char_1', criadoEm: velho }] }, banco: bancoOk() });
checar('pago sem credito', [div.estado, div.codigos, div.semCredito], ['alerta', ['pago_sem_credito'], 1]);
const folga = avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [{ id: 'pix_char_2', criadoEm: recente }] }, banco: bancoOk() });
checar('folga de 15 min', [folga.estado, folga.semCredito], ['ok', 0]);
const semData = avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [{ id: 'pix_char_3', criadoEm: null }] }, banco: bancoOk() });
checar('sem data = madura', semData.codigos, ['pago_sem_credito']);

// 4) tudo certo
const bom = avaliarAlarmePix({ agora, provedor: { estado: 'ok', pagas: [{ id: 'pix_char_1', criadoEm: velho }] }, banco: bancoOk('pix_char_1') });
checar('tudo certo', [bom.estado, bom.codigos, bom.pagasReais], ['ok', [], 1]);

// 5) datas e hora do cron
checar('data BRT', dataBrasilia(new Date('2026-10-06T01:00:00Z')), '2026-10-05');
checar('hora do alarme', horaDoAlarmePix(new Date('2026-10-06T11:23:40Z')), true);
checar('fora da hora', horaDoAlarmePix(new Date('2026-10-06T11:43:00Z')), false);

// 6) rodarAlarmePix de ponta a ponta com fetch falso
const fetchOriginal = globalThis.fetch;
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k', ABACATEPAY_API_KEY: 'abc_prod_x' };
function falso({ provedorFora = false, pagas = [], consumidos = [] }) {
  const linhas = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const metodo = init.method || 'GET';
    if (u.startsWith('https://api.abacatepay.com')) {
      if (provedorFora) throw new Error('rede fora');
      return new Response(JSON.stringify({ success: true, error: null, data: pagas }), { status: 200 });
    }
    if (metodo === 'GET' && u.includes('origem=eq.abacate')) {
      return new Response(JSON.stringify(consumidos.map((event_id) => ({ event_id }))), { status: 200 });
    }
    if (metodo === 'POST') {
      const b = JSON.parse(init.body);
      linhas.set(`${b.origem}/${b.event_id}`, { ...b });
      return new Response('', { status: 201 });
    }
    if (metodo === 'PATCH') {
      const q = new URL(u).searchParams;
      const k = `${q.get('origem').slice(3)}/${q.get('event_id').slice(3)}`;
      linhas.set(k, { ...(linhas.get(k) || {}), ...JSON.parse(init.body) });
      return new Response('', { status: 204 });
    }
    return new Response('[]', { status: 200 });
  };
  return linhas;
}

try {
  let linhas = falso({ pagas: [{ id: 'pix_char_9', devMode: false, createdAt: velho }], consumidos: [] });
  let r = await rodarAlarmePix(env, { agora });
  const linha = linhas.get('alarme_pix/2026-10-06');
  checar('e2e alerta', [r.estado, linha?.status, linha?.erro], ['alerta', 'falhou', 'pago_sem_credito']);
  checar('linha sem id de cobranca', JSON.stringify(linha).includes('pix_char_9'), false);

  linhas = falso({ pagas: [{ id: 'pix_char_9', devMode: false, createdAt: velho }], consumidos: ['pix_char_9'] });
  r = await rodarAlarmePix(env, { agora });
  checar('e2e ok', [r.estado, linhas.get('alarme_pix/2026-10-06')?.status], ['ok', 'processado']);

  linhas = falso({ provedorFora: true });
  r = await rodarAlarmePix(env, { agora });
  checar('e2e provedor fora', [r.estado, linhas.get('alarme_pix/2026-10-06')?.status], ['indisponivel', 'falhou']);

  linhas = falso({ pagas: [] });
  r = await rodarAlarmePix(env, { agora });
  checar('e2e sem pix', r.codigos, ['sem_pix_na_janela']);

  r = await rodarAlarmePix({ ...env, ABACATEPAY_API_KEY: '' }, { agora });
  checar('sem chave = indisponivel', r.estado, 'indisponivel');
} finally {
  globalThis.fetch = fetchOriginal;
}

if (falhas) {
  console.error(`\n${falhas} falha(s), ${ok} ok`);
  process.exit(1);
}
console.log(`teste-alarme-pix: ${ok} verificações ok`);
