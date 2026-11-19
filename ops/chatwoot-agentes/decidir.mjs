// Regra pura do acordador: dado um evento de webhook do Chatwoot, quem acorda? (testável sem rede)
//
// SEM LAÇO (CQ-CHATWOOT-100-FIX, 18/11): uma resposta de teste da #150 saiu do 7487 e voltou pelo 3507 como conversa
// nova #145. Por isso, ANTES de qualquer outra regra:
//   - só message_type 'incoming' passa ('outgoing', 'activity', 'template' e nota interna ficam fora);
//   - remetente do tipo 'agent_bot' ou 'user' fica fora (robô Lívia/Rafa, agente, Igor);
//   - remetente cujo phone_number OU identifier (só os dígitos) esteja em data/numeros-internos.json fica fora,
//     sem exceção — nem "TESTE". A lista é lida do arquivo a cada evento (nada de número copiado no código);
//   - se a lista não puder ser lida, NADA acorda (fecha a porta em vez de arriscar laço).
import { CFG, ehNumeroInterno, numerosInternos } from './lib.mjs';

const CAIXAS = new Set(Object.values(CFG.caixas));
const ehBot = (a, tipoConv) => /bot/i.test(String(a?.type || tipoConv || ''));
/** 'AgentBot' | 'agent_bot' | 'User' | 'user' | 'Contact' → 'agentbot' | 'user' | 'contact' */
const tipoNorm = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');

/** Telefones/identificadores do remetente (do evento e do contato da conversa). */
export function contatosDoRemetente(ev) {
  const s = ev?.sender || {};
  const m = ev?.conversation?.meta?.sender || {};
  return [s.phone_number, s.identifier, m.phone_number, m.identifier].filter(Boolean);
}

/**
 * @param ev     corpo do webhook (message_created)
 * @param porId  Map userId -> agente (de agentes.json) dos usuários-agente
 * @returns {{acao:'ignorar'|'acordar', motivo:string, agente?:object, atribuirIris?:boolean, conversa?:number}}
 */
export function decidir(ev, porId) {
  if (!ev || ev.event !== 'message_created') return { acao: 'ignorar', motivo: 'evento' };
  const conv = ev.conversation || {};
  const id = conv.id;
  if (ev.private) return { acao: 'ignorar', motivo: 'nota interna', conversa: id };
  const tipoMsg = ev.message_type;
  if (tipoMsg !== 'incoming' && tipoMsg !== 0) return { acao: 'ignorar', motivo: `mensagem ${tipoMsg} (não é do cliente)`, conversa: id };
  const tipoRem = tipoNorm(ev.sender_type || ev.sender?.type);
  if (tipoRem === 'agentbot' || tipoRem === 'user') return { acao: 'ignorar', motivo: `remetente ${tipoRem}`, conversa: id };

  let lista;
  try { lista = numerosInternos(); } catch (e) { return { acao: 'ignorar', motivo: `lista de números internos ilegível: ${e.message}`, conversa: id }; }
  if (contatosDoRemetente(ev).some((t) => ehNumeroInterno(t, lista))) return { acao: 'ignorar', motivo: 'remetente é número nosso', conversa: id };

  const inbox = ev.inbox?.id ?? conv.inbox_id;
  if (!CAIXAS.has(inbox)) return { acao: 'ignorar', motivo: 'caixa fora do item (GR Tech/Pessoal)', conversa: id };
  const dono = conv.meta?.assignee;
  const tipoConv = conv.meta?.assignee_type;
  if (dono?.id && !ehBot(dono, tipoConv)) {
    const ag = porId.get(dono.id);
    if (ag) return { acao: 'acordar', motivo: 'dono da conversa', agente: ag, conversa: id };
    return { acao: 'ignorar', motivo: `dono humano (${dono.name || dono.id})`, conversa: id };
  }
  const etq = conv.labels || [];
  const campanha = etq.some((e) => CFG.etiquetasCampanha.includes(e));
  if (conv.status === 'pending' && campanha) return { acao: 'ignorar', motivo: 'campanha com o robô (pendente)', conversa: id };
  const iris = CFG.agentes.find((a) => a.chave === 'IRIS');
  if (!iris.caixas.map((c) => CFG.caixas[c]).includes(inbox)) return { acao: 'ignorar', motivo: 'Íris fora da caixa', conversa: id };
  return { acao: 'acordar', motivo: 'conversa sem dono: vai para a Íris', agente: iris, atribuirIris: true, conversa: id };
}
