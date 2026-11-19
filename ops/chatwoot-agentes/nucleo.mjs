// Núcleo do acordador, sem rede e sem servidor (testável): decide, junta rajada e acorda UMA vez.
//   - mesmo evento entregue de novo (o Chatwoot reenvia webhook) → ignorado pelo id da mensagem;
//   - várias mensagens seguidas da mesma conversa dentro de esperaMs → um único recado ao dono;
//   - conversa sem dono → atribui à Íris (atribuir) e acorda a Íris.
import { CFG, DIR, final4 } from './lib.mjs';
import { decidir } from './decidir.mjs';

export function textoAsk(agente, convId, caixa, contato, msgs) {
  const trechos = msgs.map((m) => String(m || '').replace(/\s+/g, ' ').slice(0, 220)).join(' / ');
  return `[Chatwoot #${convId} · ${caixa}] ${contato} escreveu: "${trechos}". A conversa é sua (${agente.nome}). `
    + `Leia: node ${DIR}cw.mjs ler ${agente.chave} ${convId} — Responda: node ${DIR}cw.mjs responder ${agente.chave} ${convId} "texto". `
    + 'Regras D-2233/D-2333/D-2392 na Receita: Entregas Claude/OLLI/ZAP-ATENDIMENTO/CHATWOOT-AGENTES.md';
}

/**
 * @param o.porId     Map userId -> agente
 * @param o.acordar   (agente, texto, convId) => void   — quem de fato acorda o terminal
 * @param o.atribuir  async (convId, ev) => void          — atribui a conversa à Íris (pode lançar; é registrado)
 * @param o.log       (obj) => void
 * @param o.esperaMs  janela para juntar rajada
 */
export function criarNucleo({ porId, acordar, atribuir = async () => {}, log = () => {}, esperaMs = 15000, decidirFn = decidir }) {
  const pendentes = new Map(); // conversa -> { agente, caixa, contato, msgs[], timer }
  const vistos = new Set();    // ids de mensagem já tratados (dedupe de reenvio do webhook)
  const MAX_VISTOS = 5000;

  function marcarVisto(id) {
    if (id === undefined || id === null) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    if (vistos.size > MAX_VISTOS) vistos.delete(vistos.values().next().value);
    return true;
  }

  async function tratar(ev) {
    const d = decidirFn(ev, porId);
    if (d.acao !== 'acordar') { if (d.conversa) log({ ignorado: d.motivo, conversa: d.conversa }); return d; }
    if (!marcarVisto(ev.id)) { log({ ignorado: 'evento repetido', conversa: d.conversa, mensagem: ev.id }); return { ...d, acao: 'ignorar', motivo: 'evento repetido' }; }
    const iris = [...porId.values()].find((a) => a.chave === 'IRIS');
    let agente = d.agente;
    if (d.atribuirIris) {
      if (!iris) { log({ erro: 'Íris sem usuário no Chatwoot', conversa: d.conversa }); return { ...d, acao: 'ignorar', motivo: 'Íris sem usuário' }; }
      try { await atribuir(d.conversa, ev); log({ atribuida: 'Íris', conversa: d.conversa }); } catch (e) { log({ erro: 'atribuir Íris', conversa: d.conversa, msg: e.message }); }
      agente = iris;
    }
    const conv = ev.conversation || {};
    const caixa = (ev.inbox?.id ?? conv.inbox_id) === CFG.caixas.olli ? 'OLLI Orçamentos 7487' : 'OLLI Serviços 3507';
    const s = ev.sender || conv.meta?.sender || {};
    const contato = `${s.name || 'cliente'} (final ${final4(s.phone_number) || '----'})`;
    const conteudo = ev.content || ((ev.attachments || []).length ? `[${ev.attachments.map((a) => a.file_type).join(',')}]` : '[mensagem]');
    const p = pendentes.get(d.conversa) || { msgs: [] };
    p.agente = agente; p.caixa = caixa; p.contato = contato; p.msgs.push(conteudo);
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      pendentes.delete(d.conversa);
      acordar(p.agente, textoAsk(p.agente, d.conversa, p.caixa, p.contato, p.msgs.slice(-4)), d.conversa);
    }, esperaMs);
    pendentes.set(d.conversa, p);
    return { ...d, agente };
  }

  return { tratar, pendentes, vistos };
}
