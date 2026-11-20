// Cliente mínimo da API do Chatwoot. Token SÓ por variável (CHATWOOT_TOKEN_CLAUDE); nada é impresso.
import { caixaProibida } from './nucleo.mjs';

export const BASE = () => process.env.CHATWOOT_URL || 'http://127.0.0.1:3010';
export const CONTA = () => Number(process.env.CHATWOOT_CONTA || 2);
export const tokenClaude = () => process.env.CHATWOOT_TOKEN_CLAUDE || '';

export async function api(caminho, metodo = 'GET', corpo, token = tokenClaude()) {
  if (!token) throw new Error('falta a variável CHATWOOT_TOKEN_CLAUDE');
  const r = await fetch(`${BASE()}/api/v1/accounts/${CONTA()}${caminho}`, {
    method: metodo, headers: { api_access_token: token, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  let d = null; try { d = txt ? JSON.parse(txt) : null; } catch { d = txt; }
  if (!r.ok) { const e = new Error(`${metodo} ${caminho} -> ${r.status} ${String(txt).slice(0, 160)}`); e.status = r.status; throw e; }
  return d;
}

/** Conversa, SEMPRE barrando a caixa pessoal (5) e as proibidas: nem lê o conteúdo. */
export async function conversa(id) {
  const c = await api(`/conversations/${id}`);
  if (caixaProibida(c.inbox_id)) throw Object.assign(new Error(`conversa #${id} é da caixa ${c.inbox_id}: proibida (pessoal/GR Tech)`), { proibida: true });
  return c;
}
export async function mensagens(id) {
  const r = await api(`/conversations/${id}/messages`);
  return r.payload || [];
}
export const enviar = (id, texto) => api(`/conversations/${id}/messages`, 'POST', { content: texto, message_type: 'outgoing', private: false });
export const nota = (id, texto) => api(`/conversations/${id}/messages`, 'POST', { content: texto, message_type: 'outgoing', private: true });
export async function etiquetar(id, novas) {
  const atuais = (await api(`/conversations/${id}/labels`)).payload || [];
  const todas = [...new Set([...atuais, ...novas])];
  await api(`/conversations/${id}/labels`, 'POST', { labels: todas });
  return todas;
}
export const atribuir = (id, agenteId) => api(`/conversations/${id}/assignments`, 'POST', { assignee_id: Number(agenteId) });
export async function agentes() { return api('/agents'); }

/** Houve mensagem do cliente (incoming) na conversa? Sem isso é contato frio e NADA sai. */
export const clienteJaFalou = (msgs) => msgs.some((m) => m.message_type === 0 && !m.private);
