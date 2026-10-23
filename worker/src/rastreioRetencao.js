// Retenção do rastreio de uso (parecer LEGAL 22/10/2026): evento detalhado por no máximo 90 dias.
// Roda no mesmo minuto diário da limpeza do termômetro (06:17 UTC). Best-effort: tabela ausente ou backend
// fora = tenta no dia seguinte. Só service_role chega aqui (RLS bloqueia o resto).
import { horaDeLimparSinais } from './link.js';

export const DIAS_RETENCAO_RASTREIO = 90;

export async function limparRastreioUso(env, agora = new Date(), fetchImpl = fetch) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return false;
  if (!horaDeLimparSinais(agora)) return false;
  try {
    const limite = new Date(agora.getTime() - DIAS_RETENCAO_RASTREIO * 86_400_000).toISOString();
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/user_tela_log?criado_em=lt.${encodeURIComponent(limite)}`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
    });
    return r.ok;
  } catch {
    return false;
  }
}
