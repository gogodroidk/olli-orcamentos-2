// Chamada ao Claude por HTTP puro (sem SDK: o repo não tem o SDK e o item proíbe instalar ferramenta nova).
// Chave só por variável ANTHROPIC_API_KEY_RESERVA; nunca impressa. Haiku 5.5: sem temperature/top_p (400), sem prefill.
import { CFG } from './nucleo.mjs';

export const URL_API = () => process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages';

/** @returns {{texto:string, uso:{input_tokens:number,output_tokens:number}, parada:string}} */
export async function pedirAoClaude({ sistema, mensagens, cfg = CFG }) {
  const chave = process.env.ANTHROPIC_API_KEY_RESERVA;
  if (!chave) throw new Error('falta a variável ANTHROPIC_API_KEY_RESERVA');
  const r = await fetch(URL_API(), {
    method: 'POST',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.modelo,
      max_tokens: cfg.max_tokens_saida,
      system: sistema,
      messages: mensagens,
      thinking: { type: 'disabled' },          // Haiku 5.5: aceito só em effort high ou abaixo
      output_config: { effort: 'low' },        // resposta curta de WhatsApp: esforço baixo = mais barato
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}: ${String(corpo?.error?.message || '').slice(0, 160)}`), { status: r.status });
  const texto = (corpo.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { texto, uso: corpo.usage || {}, parada: corpo.stop_reason };
}

/** Extrai o JSON {tipo, resposta, humano, motivo} da resposta; null se torto. */
export function lerJson(texto) {
  const m = String(texto).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j !== 'object' || j === null) return null;
    return { tipo: String(j.tipo || 'outro'), resposta: String(j.resposta || '').trim(), humano: j.humano === true, motivo: String(j.motivo || '') };
  } catch { return null; }
}
