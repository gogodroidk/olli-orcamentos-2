// Retenção do rastreio de uso (parecer LEGAL 22/10/2026): evento detalhado por no máximo 90 dias.
// Roda no mesmo minuto diário da limpeza do termômetro (06:17 UTC). Só service_role chega aqui (RLS bloqueia o resto).
// Falha NUNCA é silenciosa (P2 da LIVRE no #214): cada tentativa deixa uma linha de log com o resultado (sem dado pessoal).
import { horaDeLimparSinais } from './link.js';

export const DIAS_RETENCAO_RASTREIO = 90;

export async function limparRastreioUso(env, agora = new Date(), fetchImpl = fetch, log = console.log) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return false;
  if (!horaDeLimparSinais(agora)) return false;
  const linha = (o) => log(JSON.stringify({ evento: 'rastreio_retencao', dias: DIAS_RETENCAO_RASTREIO, ...o }));
  try {
    const limite = new Date(agora.getTime() - DIAS_RETENCAO_RASTREIO * 86_400_000).toISOString();
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/user_tela_log?criado_em=lt.${encodeURIComponent(limite)}`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal,count=exact',
      },
    });
    const faixa = r.headers?.get?.('content-range') || ''; // "*/123" = linhas apagadas
    const apagadas = Number(faixa.split('/')[1]);
    linha({ ok: !!r.ok, http: r.status ?? 0, apagadas: Number.isFinite(apagadas) ? apagadas : null });
    return !!r.ok;
  } catch {
    linha({ ok: false, http: 0, erro: 'rede' });
    return false;
  }
}
