/**
 * Retenção dos pedidos de diagnóstico da página /servicos/ (LGPD, texto da página e da Política:
 * no máximo 180 dias quando ainda não há proposta).
 *
 * O cron de minuto já existe. Este job só age com SERVICOS_RETENCAO_MODE=production e no minuto
 * 06:21 UTC, e só depois da migration 20261103190000 aplicada. Sem o mode, não chama o banco —
 * publicar o worker não apaga nem grava nada.
 *
 * Apaga só status sem proposta (novo, em_pesquisa, pausado, descartado). proposta_enviada fica
 * até existir status de contrato (prazo legal), como o texto da Política descreve.
 */

/** Minuto único do dia (06:21 UTC). 06:17 é o termômetro; 06:19 é o WhatsApp. */
export function horaDeLimparPedidos(agora) {
  return agora.getUTCHours() === 6 && agora.getUTCMinutes() === 21;
}

export async function limparPedidosDiagnostico(env, agora = new Date(), fetchImpl = fetch) {
  if (env?.SERVICOS_RETENCAO_MODE !== 'production') return { ok: false, motivo: 'desligado', pulou: true };
  if (!horaDeLimparPedidos(agora)) return { ok: false, motivo: 'fora_da_hora', pulou: true };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, motivo: 'sem_config' };
  try {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/servicos_pedidos_retencao_limpar`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_agora: agora.toISOString() }),
    });
    if (!r.ok) {
      console.error(`[servicos_retencao] falhou: HTTP ${r.status}`);
      return { ok: false, motivo: `http_${r.status}` };
    }
    const corpo = await r.json();
    if (!corpo || corpo.ok !== true || typeof corpo.apagados !== 'number') {
      console.error('[servicos_retencao] resposta inesperada');
      return { ok: false, motivo: 'resposta_invalida' };
    }
    console.log(`[servicos_retencao] ok: apagados=${corpo.apagados}`);
    return { ok: true, apagados: corpo.apagados };
  } catch {
    console.error('[servicos_retencao] erro de rede');
    return { ok: false, motivo: 'rede' };
  }
}
