/**
 * Retenção dos dados do WhatsApp (PARECER LEGAL 07/10/2026, item 2; LGPD art. 6º III e art. 16).
 *
 * Uma vez por dia (06:19 UTC) chama `public.wa_retencao_limpar()`, que apaga:
 *   wa_entrada resolvido/saiu > 180 dias · wa_entrada novo/em_atendimento parado > 12 meses ·
 *   wa_envios > 12 meses · wa_contatos > 12 meses sem entrada nem envio.
 * A lista de supressão (SAIR) não é tocada. Prazos e porquês: docs/WHATSAPP_CLOUD_API.md e o SQL da migration.
 *
 * LOG sem dado pessoal: só contagens. Falha NUNCA vira "limpou": devolve { ok: false, motivo } e o próximo dia tenta de
 * novo (a função é idempotente). Sem esta rotina o número não liga (`ativo=true`).
 */

/** Minuto único do dia (06:19 UTC): fora dele o cron de minuto não faz nada. 06:17 é o do termômetro do orçamento. */
export function horaDeLimparWhatsapp(agora) {
  return agora.getUTCHours() === 6 && agora.getUTCMinutes() === 19;
}

export async function limparWhatsappAntigo(env, agora = new Date(), fetchImpl = fetch) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, motivo: 'sem_config' };
  if (!horaDeLimparWhatsapp(agora)) return { ok: false, motivo: 'fora_da_hora', pulou: true };
  try {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/wa_retencao_limpar`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_agora: agora.toISOString() }),
    });
    if (!r.ok) {
      console.error(`[wa_retencao] falhou: HTTP ${r.status}`);
      return { ok: false, motivo: `http_${r.status}` };
    }
    const corpo = await r.json();
    if (!corpo || corpo.ok !== true) {
      console.error('[wa_retencao] resposta inesperada');
      return { ok: false, motivo: 'resposta_invalida' };
    }
    console.log(
      `[wa_retencao] ok: entrada_resolvida=${corpo.entrada_resolvida_180d} entrada_parada=${corpo.entrada_parada_12m} envios=${corpo.envios_12m} contatos=${corpo.contatos_12m}`,
    );
    return {
      ok: true,
      entrada_resolvida_180d: corpo.entrada_resolvida_180d,
      entrada_parada_12m: corpo.entrada_parada_12m,
      envios_12m: corpo.envios_12m,
      contatos_12m: corpo.contatos_12m,
    };
  } catch {
    console.error('[wa_retencao] erro de rede');
    return { ok: false, motivo: 'rede' };
  }
}
