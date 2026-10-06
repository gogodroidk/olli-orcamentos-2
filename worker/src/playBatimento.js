/**
 * BATIMENTO do cron da Play (3,23,43 * * * *): duas linhas por execução em
 * `webhook_events` (origem 'play_cron'), consultáveis por SQL sem acesso aos logs
 * do Cloudflare:
 *   `ini|<AAAA-MM-DDTHH:MM>`  gravada ANTES de trabalhar  → "o cron rodou";
 *   `fim|<AAAA-MM-DDTHH:MM>`  gravada DEPOIS, com o resultado (contagens e rótulo).
 * Início sem fim = a invocação morreu no meio (CPU/tempo). Nenhuma linha = o cron
 * nem disparou. Nunca grava token, e-mail nem id de compra: só números e rótulos.
 * Melhor esforço: falha de gravação não derruba nem atrasa o trabalho real.
 */
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

export const ORIGEM_BATIMENTO = 'play_cron';

const ROTULO = /^[a-z0-9_:-]{1,40}$/i;

export function chaveDoBatimento(fase, quando) {
  const d = quando instanceof Date ? quando : new Date(quando);
  return `${fase}|${d.toISOString().slice(0, 16)}`;
}

export function resumoSeguro(r) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  const rotulo = (v) => (typeof v === 'string' && ROTULO.test(v) ? v : null);
  return {
    tarefa: rotulo(r?.tarefa),
    estado: rotulo(r?.estado),
    recebidas: n(r?.recebidas),
    confirmadas: n(r?.confirmadas),
    mantidas: n(r?.mantidas),
    motivo: rotulo(r?.motivo),
  };
}

export async function cronPlayComBatimento(env, quando, executar) {
  try {
    await reivindicarEvento(env, {
      origem: ORIGEM_BATIMENTO,
      eventId: chaveDoBatimento('ini', quando),
      tipo: 'cron',
      payload: null,
    });
  } catch {
    /* melhor esforço */
  }
  const resultado = await executar();
  try {
    const resumo = resumoSeguro(resultado);
    const eventId = chaveDoBatimento('fim', quando);
    await reivindicarEvento(env, { origem: ORIGEM_BATIMENTO, eventId, tipo: resumo.tarefa || 'cron', payload: resumo });
    const falhou = resumo.estado === 'erro' || resumo.estado === 'excecao';
    await marcarEvento(env, {
      origem: ORIGEM_BATIMENTO,
      eventId,
      status: falhou ? 'falhou' : 'processado',
      erro: falhou ? resumo.motivo || resumo.estado : undefined,
    });
  } catch {
    /* melhor esforço */
  }
  return resultado;
}
