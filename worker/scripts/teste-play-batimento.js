/**
 * Teste do BATIMENTO do cron da Play (worker/src/playBatimento.js).
 *     node worker/scripts/teste-play-batimento.js
 * Exit 0 = passou; 1 = falhou.
 * Tranca: (1) grava `ini` ANTES de executar e `fim` DEPOIS; (2) o resumo só carrega
 * números e rótulos (nada de token/e-mail); (3) estado erro/excecao vira status
 * 'falhou'; (4) falha de gravação não derruba nem muda o resultado do cron.
 */
import assert from 'node:assert/strict';
import { chaveDoBatimento, cronPlayComBatimento, resumoSeguro } from '../src/playBatimento.js';

let ok = 0;
let falhas = 0;
function checar(nome, atual, esperado) {
  const bom = JSON.stringify(atual) === JSON.stringify(esperado);
  if (bom) ok++;
  else {
    falhas++;
    console.error(`FALHA ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  atual:    ${JSON.stringify(atual)}`);
  }
}

const fetchOriginal = globalThis.fetch;
function falsoSupabase({ quebrar = false } = {}) {
  const linhas = new Map();
  const ordem = [];
  globalThis.fetch = async (url, init = {}) => {
    if (quebrar) throw new Error('rede fora');
    const metodo = init.method || 'GET';
    if (metodo === 'POST') {
      const b = JSON.parse(init.body);
      const k = `${b.origem}/${b.event_id}`;
      if (linhas.has(k)) return new Response('', { status: 409 });
      linhas.set(k, { ...b });
      ordem.push(`POST ${b.event_id}`);
      return new Response('', { status: 201 });
    }
    if (metodo === 'PATCH') {
      const u = new URL(url);
      const k = `${u.searchParams.get('origem').slice(3)}/${u.searchParams.get('event_id').slice(3)}`;
      const b = JSON.parse(init.body);
      linhas.set(k, { ...(linhas.get(k) || {}), ...b });
      ordem.push(`PATCH ${u.searchParams.get('event_id').slice(3)}`);
      return new Response('', { status: 204 });
    }
    return new Response('[]', { status: 200 });
  };
  return { linhas, ordem };
}

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const quando = new Date('2026-10-06T06:43:12Z');

checar('chave ini', chaveDoBatimento('ini', quando), 'ini|2026-10-06T06:43');
checar('chave fim', chaveDoBatimento('fim', quando), 'fim|2026-10-06T06:43');

// 1) ordem: ini antes de executar; fim depois
{
  const sb = falsoSupabase();
  let iniciouAntes = false;
  const r = await cronPlayComBatimento(env, quando, async () => {
    iniciouAntes = sb.linhas.has('play_cron/ini|2026-10-06T06:43');
    return { tarefa: 'rtdn', estado: 'ok', recebidas: 3, confirmadas: 2, mantidas: 1 };
  });
  checar('ini gravado antes de executar', iniciouAntes, true);
  checar('resultado devolvido intacto', r, { tarefa: 'rtdn', estado: 'ok', recebidas: 3, confirmadas: 2, mantidas: 1 });
  const fim = sb.linhas.get('play_cron/fim|2026-10-06T06:43');
  checar('fim com contagens', fim.payload, { tarefa: 'rtdn', estado: 'ok', recebidas: 3, confirmadas: 2, mantidas: 1, motivo: null });
  checar('fim processado', fim.status, 'processado');
  checar('ini também sai de "recebido" quando o trabalho terminou', sb.linhas.get('play_cron/ini|2026-10-06T06:43').status, 'processado');
}

// 1b) quem MORREU no meio (executar lança) deixa o ini em "recebido" e nenhum fim — é o sinal que o índice procura
{
  const sb = falsoSupabase();
  await assert.rejects(() => cronPlayComBatimento(env, quando, async () => { throw new Error('cpu'); }));
  checar('morreu: ini continua "recebido"', sb.linhas.get('play_cron/ini|2026-10-06T06:43').status, 'recebido');
  checar('morreu: não há fim', sb.linhas.has('play_cron/fim|2026-10-06T06:43'), false);
}

// 2) erro vira 'falhou' com rótulo
{
  const sb = falsoSupabase();
  await cronPlayComBatimento(env, quando, async () => ({ tarefa: 'rtdn', estado: 'erro', motivo: 'timeout' }));
  const fim = sb.linhas.get('play_cron/fim|2026-10-06T06:43');
  checar('erro → falhou', [fim.status, fim.erro], ['falhou', 'timeout']);
}

// 3) resumo seguro: texto livre (possível dado pessoal) é descartado
{
  const r = resumoSeguro({ tarefa: 'rtdn', estado: 'ok', motivo: 'pessoa@exemplo.com diz oi', recebidas: '7', mantidas: 2 });
  checar('motivo livre descartado', r.motivo, null);
  checar('número como texto descartado', r.recebidas, null);
  checar('número válido mantido', r.mantidas, 2);
}

// 4) gravação quebrada não muda nem derruba o cron
{
  falsoSupabase({ quebrar: true });
  const r = await cronPlayComBatimento(env, quando, async () => ({ tarefa: 'reconciliar', estado: 'ok' }));
  checar('rede fora: resultado preservado', r, { tarefa: 'reconciliar', estado: 'ok' });
}
{
  falsoSupabase();
  let chamou = false;
  const r = await cronPlayComBatimento({}, quando, async () => { chamou = true; return { estado: 'ok' }; });
  checar('sem credencial: ainda executa', [chamou, r.estado], [true, 'ok']);
}

globalThis.fetch = fetchOriginal;
if (falhas) {
  console.error(`FALHOU: ${falhas} falha(s), ${ok} ok`);
  process.exit(1);
}
console.log(`PASSOU: ${ok} ok, 0 falha(s)`);
