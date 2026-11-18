#!/usr/bin/env node
// Receita do agente no Chatwoot (CQ-CHATWOOT-100). Cada agente usa o PRÓPRIO token (CHATWOOT_TOKEN_<NOME>),
// então a mensagem sai no Chatwoot com o nome dele. O WhatsApp sai pela Evolution por trás (D-2392).
//
//   node cw.mjs fila      <AGENTE>                       conversas atribuídas a você (abertas/pendentes)
//   node cw.mjs novas     <AGENTE>                       conversas das suas caixas sem dono
//   node cw.mjs ler       <AGENTE> <conversa> [n=15]     últimas mensagens
//   node cw.mjs responder <AGENTE> <conversa> "texto"    manda ao cliente (passa pelas travas)
//   node cw.mjs nota      <AGENTE> <conversa> "texto"    nota interna (cliente não vê)
//   node cw.mjs pegar     <AGENTE> <conversa>            atribui a você
//   node cw.mjs passar    <AGENTE> <conversa> <PARA> "motivo"   passa ao dono (nota + atribuição)
//   node cw.mjs etiqueta  <AGENTE> <conversa> <etiqueta> [...]  acrescenta etiquetas (não apaga as que já tem)
//   node cw.mjs resolver  <AGENTE> <conversa>
// AGENTE = IRIS | CARTEIRA | BRUNO | SDR | ACOLHE | DESTRAVA | FECHA
import { CFG, api, meuId, agentePorChave, tokenDe, carregarCredenciais, ehNumeroInterno, final4 } from './lib.mjs';
import { motivosDeBarrar, ehTeste } from './travas.mjs';

carregarCredenciais();
const [cmd, quem, convArg, ...resto] = process.argv.slice(2);
const sair = (msg, cod = 1) => { console.error(msg); process.exit(cod); };
const ag = agentePorChave(quem);
if (!cmd || !ag) sair(`uso: node cw.mjs <fila|novas|ler|responder|nota|pegar|passar|etiqueta|resolver> <AGENTE> [conversa] [...]\nAGENTE: ${CFG.agentes.map((a) => a.chave).join(' | ')}`);
const tok = tokenDe(ag.chave);
if (!tok) sair(`sem a variável CHATWOOT_TOKEN_${ag.chave}`);
const caixasPermitidas = new Set(ag.caixas.map((c) => CFG.caixas[c]));
const conv = convArg ? Number(convArg) : null;

const resumoConv = (c) => {
  const s = c.meta?.sender || {};
  const ult = c.last_non_activity_message || c.messages?.[c.messages.length - 1] || {};
  const quemFalou = ult.message_type === 0 ? 'CLIENTE' : ult.message_type === 1 ? 'NÓS' : '-';
  const hora = c.last_activity_at ? new Date(c.last_activity_at * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  return `#${c.id} [${c.inbox_id === CFG.caixas.olli ? 'OLLI' : c.inbox_id === CFG.caixas.servicos ? 'Serviços' : c.inbox_id}] ${c.status} | ${s.name || '?'} (final ${final4(s.phone_number) || '----'}) | ${hora} | último: ${quemFalou}: ${String(ult.content || '').replace(/\s+/g, ' ').slice(0, 90)} | etiquetas: ${(c.labels || []).join(',')}`;
};

async function pegarConversa() {
  if (!conv) sair('falta o número da conversa');
  const c = await api(tok, `/conversations/${conv}`);
  if (!caixasPermitidas.has(c.inbox_id)) sair(`conversa #${conv} é da caixa ${c.inbox_id}, fora das suas (${[...caixasPermitidas].join(',')}). GR Tech e Pessoal ficam fora.`);
  return c;
}

async function listar(filtroAtrib) {
  const out = [];
  for (const status of ['open', 'pending']) {
    for (let page = 1; page <= 5; page++) {
      const r = await api(tok, `/conversations?status=${status}&assignee_type=${filtroAtrib}&page=${page}`);
      const lista = r.data?.payload || [];
      out.push(...lista.filter((c) => caixasPermitidas.has(c.inbox_id)));
      if (lista.length < 25) break;
    }
  }
  return out.sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0));
}

if (cmd === 'fila') {
  const l = await listar('me');
  console.log(`${ag.nome}: ${l.length} conversa(s) suas`);
  for (const c of l) console.log(resumoConv(c));
} else if (cmd === 'novas') {
  const l = (await listar('unassigned')).concat((await listar('all')).filter((c) => c.meta?.assignee?.type === 'AgentBot' || c.meta?.assignee_type === 'AgentBot'));
  const vistos = new Set();
  const u = l.filter((c) => !vistos.has(c.id) && vistos.add(c.id));
  console.log(`sem dono humano nas suas caixas: ${u.length}`);
  for (const c of u) console.log(resumoConv(c));
} else if (cmd === 'ler') {
  const c = await pegarConversa();
  const n = Number(resto[0] || 15);
  const r = await api(tok, `/conversations/${conv}/messages`);
  console.log(resumoConv(c));
  console.log(`dono: ${c.meta?.assignee?.name || 'ninguém'}`);
  for (const m of (r.payload || []).slice(-n)) {
    const autor = m.private ? `NOTA ${m.sender?.name || ''}` : m.message_type === 0 ? 'CLIENTE' : m.message_type === 1 ? `NÓS (${m.sender?.name || m.sender?.type || 'sistema'})` : 'atividade';
    const hora = new Date(m.created_at * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const anexo = (m.attachments || []).length ? ` [${m.attachments.map((a) => a.file_type).join(',')}]` : '';
    console.log(`${hora} ${autor}: ${String(m.content || '').slice(0, 500)}${anexo}`);
  }
} else if (cmd === 'responder') {
  const forcar = resto.includes('--forcar');
  const texto = resto.filter((x) => x !== '--forcar').join(' ');
  const c = await pegarConversa();
  const tel = c.meta?.sender?.phone_number;
  const etq = c.labels || [];
  const bloqueio = etq.find((e) => CFG.etiquetasNaoContatar.includes(e));
  if (bloqueio) sair(`BARRADO: conversa com etiqueta "${bloqueio}" (pediu para parar / LGPD).`);
  const motivos = motivosDeBarrar(texto);
  if (motivos.length) sair(`BARRADO: ${motivos.join('; ')}. Reescreva.`);
  if (ehTeste(texto) && !ehNumeroInterno(tel)) sair('BARRADO: mensagem de TESTE só entre números nossos.');
  if (ehNumeroInterno(tel) && !ehTeste(texto)) sair('BARRADO: para número nosso só vai mensagem começando com "TESTE —".');
  const dono = c.meta?.assignee;
  const donoHumano = dono?.id && (c.meta?.assignee_type || dono.type) !== 'AgentBot';
  const meu = (await meuId(tok));
  if (donoHumano && dono.id !== meu && !forcar) sair(`BARRADO: a conversa é de ${dono.name}. Fale com o dono ou use "passar".`);
  // Sem dono humano: assume a conversa antes de falar (o robô Lívia/Rafa sai sozinho quando há pessoa atribuída).
  if (!donoHumano) await api(tok, `/conversations/${conv}/assignments`, 'POST', { assignee_id: meu });
  const m = await api(tok, `/conversations/${conv}/messages`, 'POST', { content: texto, message_type: 'outgoing', private: false });
  if (c.status !== 'open') await api(tok, `/conversations/${conv}/toggle_status`, 'POST', { status: 'open' }).catch(() => {});
  console.log(`ok: mensagem ${m.id} saiu como ${ag.nome} na conversa #${conv}`);
} else if (cmd === 'nota') {
  await pegarConversa();
  const m = await api(tok, `/conversations/${conv}/messages`, 'POST', { content: resto.join(' '), message_type: 'outgoing', private: true });
  console.log(`ok: nota ${m.id}`);
} else if (cmd === 'pegar') {
  await pegarConversa();
  const meu = (await meuId(tok));
  await api(tok, `/conversations/${conv}/assignments`, 'POST', { assignee_id: meu });
  console.log(`ok: #${conv} agora é de ${ag.nome}`);
} else if (cmd === 'passar') {
  const para = agentePorChave(resto[0]);
  if (!para) sair(`PARA inválido: ${CFG.agentes.map((a) => a.chave).join(' | ')}`);
  const c = await pegarConversa();
  if (!para.caixas.map((x) => CFG.caixas[x]).includes(c.inbox_id)) sair(`${para.nome} não atende a caixa desta conversa.`);
  const agentes = await api(tok, '/agents');
  const u = agentes.find((x) => x.email === para.email);
  if (!u) sair(`usuário de ${para.nome} não existe no Chatwoot`);
  await api(tok, `/conversations/${conv}/messages`, 'POST', { content: `[${ag.nome} → ${para.nome}] ${resto.slice(1).join(' ') || 'passando para o dono'}`, message_type: 'outgoing', private: true });
  await api(tok, `/conversations/${conv}/assignments`, 'POST', { assignee_id: u.id });
  console.log(`ok: #${conv} passada para ${para.nome}`);
} else if (cmd === 'etiqueta') {
  const c = await pegarConversa();
  const novas = [...new Set([...(c.labels || []), ...resto])];
  await api(tok, `/conversations/${conv}/labels`, 'POST', { labels: novas });
  console.log(`ok: etiquetas ${novas.join(',')}`);
} else if (cmd === 'resolver') {
  await pegarConversa();
  await api(tok, `/conversations/${conv}/toggle_status`, 'POST', { status: 'resolved' });
  console.log(`ok: #${conv} resolvida`);
} else sair(`comando desconhecido: ${cmd}`);
