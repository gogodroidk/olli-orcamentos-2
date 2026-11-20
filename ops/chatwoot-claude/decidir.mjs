// Regra pura: dado o webhook do Chatwoot, processa ou ignora? (sem rede; testável)
import { CFG, caixaProibida, caixaPermitida } from './nucleo.mjs';

const tipoNorm = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
const digitos = (s) => String(s || '').split('@')[0].replace(/\D/g, '');
const canon = (t) => { let d = digitos(t); if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2); if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3); return d; };

export function ehInterno(tels, lista) {
  return tels.map(canon).filter((c) => c.length >= 10).some((c) => lista.some((n) => canon(n) === c));
}

/** @param lista  números internos (array) ou null se ilegível → fecha a porta */
export function decidir(ev, lista, cfg = CFG) {
  if (!ev || ev.event !== 'message_created') return { acao: 'ignorar', motivo: 'evento' };
  const conv = ev.conversation || {};
  const id = conv.id;
  const caixa = conv.inbox_id ?? ev.inbox?.id;
  if (caixaProibida(caixa, cfg)) return { acao: 'ignorar', motivo: `caixa ${caixa} proibida`, conversa: id };
  if (!caixaPermitida(caixa, cfg)) return { acao: 'ignorar', motivo: `caixa ${caixa} fora da lista`, conversa: id };
  if (ev.private) return { acao: 'ignorar', motivo: 'nota interna', conversa: id };
  if (ev.message_type !== 'incoming' && ev.message_type !== 0) return { acao: 'ignorar', motivo: 'não é do cliente', conversa: id };
  const rem = tipoNorm(ev.sender_type || ev.sender?.type);
  if (rem && rem !== 'contact') return { acao: 'ignorar', motivo: `remetente ${rem}`, conversa: id };
  if (!Array.isArray(lista)) return { acao: 'ignorar', motivo: 'lista de números internos ilegível', conversa: id };
  const s = ev.sender || {}; const m = conv.meta?.sender || {};
  if (ehInterno([s.phone_number, s.identifier, m.phone_number, m.identifier].filter(Boolean), lista)) return { acao: 'ignorar', motivo: 'número da casa', conversa: id };
  return { acao: 'processar', motivo: 'mensagem de cliente', conversa: id, caixa, mensagem: ev.id, texto: String(ev.content || '') };
}
