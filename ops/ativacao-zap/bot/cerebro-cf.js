// Cérebro de reserva: Workers AI pela API REST da Cloudflare. Só roda quando NENHUM playbook cobre a mensagem.
// Sem CF_ACCOUNT_ID/CF_AI_TOKEN, ou se a Cloudflare negar (401/403), devolve null e o atendente passa para humano.
// O token nunca é logado. Falha de permissão desliga o cérebro por 1 hora (sem martelar a API).
const MODELO = process.env.CF_AI_MODELO || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export function criarLlm({ accountId, token, fetchImpl = fetch, agora = () => Date.now(), log = () => {} } = {}) {
  if (!accountId || !token) return null;
  let desligadoAte = 0;
  return async ({ system, user }) => {
    if (agora() < desligadoAte) throw new Error('cerebro_desligado');
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODELO}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 220 }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 401 || r.status === 403) {
      desligadoAte = agora() + 3600e3;
      log('cerebro: token sem permissão de Workers AI — desligado por 1h, só playbooks');
      throw new Error('sem_permissao');
    }
    if (!r.ok) throw new Error(`cf_${r.status}`);
    const j = await r.json();
    return String(j?.result?.response ?? '');
  };
}
