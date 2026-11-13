// Robô local de atendimento (SDR) — Central OLLI. Node 22, sem dependências.
// Cérebro = atendenteSdr.js (idêntico ao do PR #350). Aqui só fica a ponte com o Chatwoot,
// o estado por conversa e o aviso ao Igor. Ordem: SAIR → "é robô?" → dado sensível → humano/reclamação/
// reembolso/LGPD → playbook → modelo (só se nada cobre) → senão humano ("deixei registrado e sinalizado").
import { createHash } from 'node:crypto';
import { responderAtendente } from './atendenteSdr.js';
import { responderAtivacao } from './ativacaoModo.js';

// 13/11 (ordem do Igor): na caixa com "soNovos" o robô só fala com contato NOVO; quem já conversou com a empresa
// no WhatsApp antes da Central fica para a pessoa. A lista vem só em hash (data/historico-antes-central.json).
const hash24 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);
export function chavesDoContato(sender) {
  const k = new Set(); if (!sender) return [];
  if (sender.identifier) k.add(String(sender.identifier));
  const d = String(sender.phone_number || '').replace(/\D/g, '');
  const variantes = [d];
  if (/^55\d{2}9\d{8}$/.test(d)) variantes.push(d.slice(0, 4) + d.slice(5)); // celular BR com e sem o 9
  if (/^55\d{10}$/.test(d)) variantes.push(d.slice(0, 4) + '9' + d.slice(4));
  for (const v of variantes) if (v) { k.add(v); k.add(`${v}@s.whatsapp.net`); }
  return [...k];
}
export function ehClienteAntigo(antigos, instancia, sender) {
  const set = antigos?.[instancia]; if (!set || !set.size) return false;
  return chavesDoContato(sender).some((c) => set.has(hash24(c)));
}

const ETIQUETA_MOTIVO = {
  reclamacao: 'reclamacao', reembolso_cobranca: 'cobranca', lgpd: 'lgpd', humano: 'pediu-humano',
  fora_tabela: 'fora-da-tabela', venda_grande: 'venda-grande', incerteza: 'sem-fonte',
};

/** Só registro (painel "Agentes"): nunca altera o que o robô responde. */
export function cidadeCitada(texto) {
  const m = String(texto || '').match(/\b(?:moro|fico|estou|atuo|sou)\s+(?:em|de|na|no)\s+([A-Za-zÀ-ú][A-Za-zÀ-ú' -]{2,28}?)(?=[,.!?\n]|\s+(?:e|mas|preciso|quero|pra|para)\b|$)/i);
  return m ? m[1].trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : '';
}
export function etapaDoRoteiro(r, histLen) {
  if (r.acao === 'suprimir') return 'parou';
  if (r.acao === 'humano') return 'humano';
  if (histLen <= 1) return 'saudacao';
  if (!r.qualificacao || !r.qualificacao.oque) return 'entender';
  return 'qualificando';
}

export function criarRobo({ companies, api, estado, salvar, aviso, antigos = {}, llm = null, esperar = async () => {}, agora = () => new Date(), log = () => {}, registrarParada = async () => {} }) {
  const vistos = new Set();
  const filas = new Map();

  const post = (id, corpo) => api(`/conversations/${id}/messages`, 'POST', { message_type: 'outgoing', ...corpo });
  const falar = async (id, content) => { await esperar(content); return post(id, { content, private: false }); };
  const nota = (id, content) => post(id, { content, private: true });
  let timeId;
  async function timeVendas() {
    if (timeId) return timeId;
    const t = await api('/teams', 'GET', null, 'user');
    timeId = (Array.isArray(t) ? t : t?.payload || []).find((x) => /vendas/i.test(x.name))?.id;
    return timeId;
  }

  function resumo(r, s) {
    const q = r.qualificacao ? Object.entries(r.qualificacao).map(([k, v]) => `${k}=${v ? 'sim' : 'falta'}`).join(', ') : '-';
    return `[Atendente ${r.atendente}] Motivo: ${r.motivo ?? r.intencao} | Prioridade: ${r.prioridade ?? 'normal'} | Lead: ${r.lead} | Qualificação: ${q} | Nome: ${s.nome || '-'} | Última mensagem (sem dados sensíveis): ${r.registro.textoRedigido}${r.foraHorario ? ' | Chegou fora do horário do time.' : ''}`;
  }

  async function fechar(id, c, s, r, ev, falhou, extras = []) {
    const humano = r.acao === 'humano';
    const etiquetas = [`empresa-${c.empresa}`, c.label, ...extras];
    if (r.lead === 'quente') etiquetas.push('lead-quente');
    if (humano) etiquetas.push(ETIQUETA_MOTIVO[r.motivo] || 'humano');
    if (r.acao === 'enviar_e_sinalizar') etiquetas.push('sinalizar');
    if (r.foraHorario) etiquetas.push('fora-do-horario');
    await api(`/conversations/${id}/labels`, 'POST', { labels: etiquetas }, 'user');
    await nota(id, falhou ? '[Atendente] O cérebro falhou nesta mensagem; o cliente recebeu "deixei registrado". Ver conversa.' : resumo(r, s));
    if (humano) {
      const tid = await timeVendas();
      if (tid) await api(`/conversations/${id}/assignments`, 'POST', { team_id: tid }, 'user');
      await api(`/conversations/${id}/toggle_status`, 'POST', { status: 'open' });
      s.done = true;
    }
    if (!s.avisado) { // no máximo 1 aviso ao Igor por conversa
      s.avisado = true;
      const quer = (r.registro?.textoRedigido || '').replace(/\s+/g, ' ').slice(0, 90);
      await aviso({ empresa: c.empresa, nome: s.nome || 'sem nome', cidade: s.cidade || 'cidade n/d', quer: `${r.motivo ?? r.intencao}: ${quer}`, numero: ev.sender?.phone_number || ev.sender?.identifier || 'sem número', conversa: id });
    }
  }

  async function tratar(ev) {
    if (ev.event !== 'message_created' || ev.message_type !== 'incoming' || ev.private) return { ignorado: 'evento' };
    const conv = ev.conversation; if (!conv) return { ignorado: 'sem_conversa' };
    const chave = `${conv.id}:${ev.id}`; if (vistos.has(chave)) return { ignorado: 'duplicado' };
    vistos.add(chave); if (vistos.size > 5000) vistos.clear();
    const id = conv.id;
    const c = companies[ev.inbox?.name || conv.inbox?.name]; if (!c) return { ignorado: 'caixa_sem_robo' };
    const s = estado[id] || { hist: [] };
    if (!Array.isArray(s.hist)) s.hist = [];
    const tipo = conv.meta?.assignee_type || conv.meta?.assignee?.type;
    if (s.done || s.stopped || conv.status === 'resolved' || (conv.meta?.assignee?.id && tipo && tipo !== 'AgentBot')) return { ignorado: 'humano_ou_parado' };
    if ((conv.labels || []).some((l) => l === 'sair' || l === 'parar-contato')) { s.stopped = true; estado[id] = s; salvar(); return { ignorado: 'suprimido' }; }
    if ((conv.labels || []).includes('ativacao') && c.empresa === 'olli') {
      return tratarAtivacao(ev, id, c, s);
    }
    if (c.soNovos && ehClienteAntigo(antigos, c.instancia, ev.sender || conv.meta?.sender)) {
      s.antigo = true; s.done = true; estado[id] = s; salvar();
      await api(`/conversations/${id}/labels`, 'POST', { labels: ['cliente-antigo', `empresa-${c.empresa}`, c.label] }, 'user');
      await nota(id, '[Atendente] Cliente que já conversava com a empresa antes da Central: o robô não responde (regra do Igor, 13/11). Quem atende é a pessoa.');
      return { ignorado: 'cliente_antigo' };
    }

    const texto = String(ev.content || '').trim();
    const audioSemTexto = !texto && (ev.attachments || []).some((a) => a.file_type === 'audio');
    s.nome = s.nome || (ev.sender?.name && !/^\+?\d/.test(ev.sender.name) ? ev.sender.name : '');

    let r = null;
    try {
      r = await responderAtendente({ empresa: c.empresa, texto, audioSemTexto, historico: s.hist, agora: agora(), llm });
    } catch (e) {
      log('erro cérebro', e.message);
    }
    if (!r) { // cérebro quebrou: nunca deixa o cliente no vácuo nem inventa
      await falar(id, 'Deixei registrado e sinalizado pro nosso time. Eles respondem assim que possível.');
      await fechar(id, c, s, { acao: 'humano', motivo: 'incerteza', prioridade: 'normal', lead: 'indefinido', intencao: 'erro', atendente: '-', registro: { textoRedigido: '(falha do cérebro)' } }, ev, true);
      estado[id] = s; salvar();
      return { ok: true, acao: 'humano', intencao: 'erro' };
    }
    if (texto) s.hist = [...s.hist, texto].slice(-10);
    try { // registro para o painel (somente leitura de quem consome)
      const ts = Math.floor(agora().getTime() / 1000);
      s.empresa = c.empresa; s.t0 = s.t0 || ts; s.tu = ts; s.etapa = etapaDoRoteiro(r, s.hist.length);
      if (r.qualificacao) s.q = r.qualificacao;
      if (r.lead === 'quente') s.quente = true;
      s.cidade = cidadeCitada(texto) || s.cidade || '';
    } catch { /* registro nunca derruba o atendimento */ }
    if (r.resposta) await falar(id, r.resposta);

    if (r.acao === 'suprimir') {
      s.stopped = true;
      await api(`/conversations/${id}/labels`, 'POST', { labels: ['parar-contato', `empresa-${c.empresa}`] }, 'user');
      await nota(id, 'Contato pediu para parar. NÃO enviar mais mensagens (LGPD).');
      await api(`/conversations/${id}/toggle_status`, 'POST', { status: 'resolved' });
    } else if (r.acao === 'humano' || r.acao === 'enviar_e_sinalizar' || r.lead === 'quente') {
      await fechar(id, c, s, r, ev, false);
    }
    estado[id] = s; salvar();
    return { ok: true, acao: r.acao, intencao: r.intencao, lead: r.lead };
  }

  async function tratarAtivacao(ev, id, c, s) {
    const texto = String(ev.content || '').trim();
    const audioSemTexto = !texto && (ev.attachments || []).some((a) => a.file_type === 'audio');
    s.nome = s.nome || (ev.sender?.name && !/^\+?\d/.test(ev.sender.name) ? ev.sender.name : '');
    let r;
    try {
      r = responderAtivacao({ texto, audioSemTexto, historico: s.hist, nome: s.nome });
    } catch (e) {
      log('erro ativacao', e.message);
      r = { acao: 'humano', motivo: 'incerteza', resposta: 'Deixei registrado e sinalizado pro nosso time. Eles respondem assim que possível.', nota: '[Ativação] Falha ao responder. Ver conversa.' };
    }
    if (texto) s.hist = [...s.hist, texto].slice(-10);
    try {
      const ts = Math.floor(agora().getTime() / 1000);
      s.empresa = c.empresa; s.t0 = s.t0 || ts; s.tu = ts; s.etapa = `ativacao:${r.motivo || r.acao}`;
    } catch { /* registro nunca derruba o atendimento */ }
    if (r.resposta) await falar(id, r.resposta);
    if (r.acao === 'suprimir') {
      s.stopped = true;
      await api(`/conversations/${id}/labels`, 'POST', { labels: ['parar-contato', 'ativacao', `empresa-${c.empresa}`] }, 'user');
      await nota(id, r.nota || 'Contato pediu para parar. NÃO enviar mais mensagens (LGPD).');
      await api(`/conversations/${id}/toggle_status`, 'POST', { status: 'resolved' });
      await registrarParada({ conversa: id });
    } else if (r.acao === 'humano') {
      await fechar(id, c, s, {
        acao: 'humano',
        motivo: r.motivo === 'reclamacao' ? 'reclamacao' : r.motivo === 'fora_tabela' ? 'fora_tabela' : r.motivo === 'incerteza' ? 'incerteza' : 'humano',
        prioridade: r.motivo === 'reclamacao' || r.motivo === 'fora_tabela' ? 'alta' : 'normal',
        lead: 'quente',
        intencao: r.motivo,
        atendente: 'Lívia',
        registro: { textoRedigido: r.nota || r.motivo || '' },
      }, ev, false, ['ativacao']);
    }
    estado[id] = s; salvar();
    return { ok: true, acao: r.acao, intencao: r.motivo, modo: 'ativacao' };
  }

  /** Enfileira por conversa para não responder fora de ordem. */
  function receber(ev) {
    const cid = ev.conversation?.id ?? 0;
    const p = (filas.get(cid) || Promise.resolve()).then(() => tratar(ev)).catch((e) => log('erro', e.message));
    filas.set(cid, p);
    return p;
  }
  return { tratar, receber };
}
