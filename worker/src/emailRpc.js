/**
 * Chamada de RPC do Supabase com service_role para o pipeline de e-mail.
 *
 * Compartilhado pelo consumer da outbox, pela seleção de lembretes e pelo
 * descadastro. Leitura de resposta limitada (32 KiB) e timeout de 10 s; o erro
 * carrega só o status HTTP — nunca corpo, destinatário ou chave.
 */

export const EMAIL_RPC_MAX_RESPONSE_BYTES = 32 * 1024;

export function sinalTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function lerJsonLimitado(response, limite = EMAIL_RPC_MAX_RESPONSE_BYTES) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await reader.cancel();
      throw Object.assign(new Error('resposta_grande'), { codigo: 'resposta_grande' });
    }
    chunks.push(value);
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** `config` = { supabaseUrl, serviceRoleKey }. Lança `supabase_rpc_<status>` em erro HTTP. */
export async function chamarRpcServico(config, fetchImpl, nome, body) {
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: sinalTimeout(10_000),
  });
  const payload = await lerJsonLimitado(response);
  if (!response.ok) {
    throw Object.assign(new Error(`supabase_rpc_${response.status}`), {
      codigo: `supabase_rpc_${response.status}`,
    });
  }
  return payload;
}
