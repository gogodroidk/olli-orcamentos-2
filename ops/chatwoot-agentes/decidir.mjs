// Regra pura do acordador: dado um evento de webhook do Chatwoot, quem acorda? (testável sem rede)
import { CFG, ehNumeroInterno } from './lib.mjs';
import { ehTeste } from './travas.mjs';

const CAIXAS = new Set(Object.values(CFG.caixas));
const ehBot = (a, tipoConv) => /bot/i.test(String(a?.type || tipoConv || ''));

/**
 * @param ev     corpo do webhook (message_created)
 * @param porId  Map userId -> agente (de agentes.json) dos usuários-agente
 * @returns {{acao:'ignorar'|'acordar', motivo:string, agente?:object, atribuirIris?:boolean, conversa?:number}}
 */
export function decidir(ev, porId) {
  if (!ev || ev.event !== 'message_created') return { acao: 'ignorar', motivo: 'evento' };
  if (ev.private) return { acao: 'ignorar', motivo: 'nota interna' };
  const tipoMsg = ev.message_type;
  if (tipoMsg !== 'incoming' && tipoMsg !== 0) return { acao: 'ignorar', motivo: 'não é do cliente' };
  const conv = ev.conversation || {};
  const inbox = ev.inbox?.id ?? conv.inbox_id;
  if (!CAIXAS.has(inbox)) return { acao: 'ignorar', motivo: 'caixa fora do item (GR Tech/Pessoal)' };
  const tel = ev.sender?.phone_number || conv.meta?.sender?.phone_number;
  // Entre números nossos só acorda o gatilho explícito "TESTE — ACORDAR". A resposta do agente chega no outro número
  // como "TESTE — ..." e NÃO pode acordar de novo (18/11: o teste 2 fez eco #150 → #145; laço cortado aqui).
  if (ehNumeroInterno(tel) && !/^\s*TESTE\s*[—-]\s*ACORDAR\b/i.test(String(ev.content || ''))) return { acao: 'ignorar', motivo: 'número nosso (só "TESTE — ACORDAR" acorda)' };
  const dono = conv.meta?.assignee;
  const tipoConv = conv.meta?.assignee_type;
  const id = conv.id;
  if (dono?.id && !ehBot(dono, tipoConv)) {
    const ag = porId.get(dono.id);
    if (ag) return { acao: 'acordar', motivo: 'dono da conversa', agente: ag, conversa: id };
    return { acao: 'ignorar', motivo: `dono humano (${dono.name || dono.id})`, conversa: id };
  }
  const etq = conv.labels || [];
  const campanha = etq.some((e) => CFG.etiquetasCampanha.includes(e));
  if (conv.status === 'pending' && campanha && !ehTeste(ev.content)) return { acao: 'ignorar', motivo: 'campanha com o robô (pendente)', conversa: id };
  const iris = CFG.agentes.find((a) => a.chave === 'IRIS');
  if (!iris.caixas.map((c) => CFG.caixas[c]).includes(inbox)) return { acao: 'ignorar', motivo: 'Íris fora da caixa' };
  return { acao: 'acordar', motivo: 'conversa sem dono: vai para a Íris', agente: iris, atribuirIris: true, conversa: id };
}
