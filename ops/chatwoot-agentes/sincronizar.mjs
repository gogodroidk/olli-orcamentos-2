#!/usr/bin/env node
// Sincronia Evolution → Chatwoot (CQ-CHATWOOT-100, P0: nenhuma conversa fora do Chatwoot).
//
// Causa (18/11): a Evolution 2.3.7 só sabe o telefone de um contato "@lid" quando a mensagem traz `remoteJidAlt`.
//  1) Mensagem NOSSA mandada pela API da Evolution direto para o JID @lid (sem remoteJidAlt) vira um contato-FANTASMA
//     no Chatwoot, com o número do @lid como telefone (+170368551673900). A conversa racha: o cliente fala na conversa
//     do contato real, a nossa resposta cai na do fantasma.
//  2) Mensagem que a integração não sabe tratar (templateMessage de operadora/empresa) ou @lid sem telefone conhecido
//     nunca chega ao Chatwoot.
//  3) A Evolution não grava de volta o id do Chatwoot (CHATWOOT_IMPORT_DATABASE_CONNECTION_URI não configurada:
//     "getaddrinfo EAI_AGAIN host"), então o "chatwootConversationId" vazio não prova que faltou.
//
// O que este script faz (idempotente; NUNCA apaga conversa nem contato; NUNCA manda nada ao WhatsApp):
//  A) acha contato-fantasma (@lid com telefone = dígitos do @lid), descobre o telefone real pelo banco da Evolution,
//     copia as mensagens do fantasma como NOTA INTERNA na conversa do contato real (cria a conversa se faltar),
//     deixa nota "duplicada" no fantasma, renomeia o fantasma "(duplicado @lid) ..." e resolve a conversa dele;
//  B) importa como NOTA INTERNA as mensagens dos últimos N dias (caixas OLLI e Serviços) cujo texto não está no Chatwoot.
// Nota interna não sai para o WhatsApp (a Evolution ignora `private`) e não aciona o robô (ele só lê `incoming`).
//
//   node sincronizar.mjs            ensaio: só mostra o que faria
//   node sincronizar.mjs --aplicar  aplica      [--dias 7]
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { CFG, api, carregarCredenciais, evoSql, digitos, ehNumeroInterno } from './lib.mjs';

carregarCredenciais();
const APLICAR = process.argv.includes('--aplicar');
const iDias = process.argv.indexOf('--dias');
const DIAS = iDias > 0 ? Number(process.argv[iDias + 1]) : 7;
const TOK = process.env.CHATWOOT_TOKEN_ADMIN;
if (!TOK) { console.error('sem CHATWOOT_TOKEN_ADMIN'); process.exit(1); }
const INSTANCIA_CAIXA = { 'olli-orcamentos': CFG.caixas.olli, 'segundo-andar': CFG.caixas.servicos };
const CAIXAS = new Set(Object.values(INSTANCIA_CAIXA));
const ESTADO_DIR = process.env.CW_AGENTES_ESTADO || `${process.env.HOME}/.local/state/chatwoot-agentes`;
const ESTADO_ARQ = `${ESTADO_DIR}/sincronia.json`;
mkdirSync(ESTADO_DIR, { recursive: true });
let estado = { importadas: {}, fantasmas: {} };
try { estado = { ...estado, ...JSON.parse(readFileSync(ESTADO_ARQ, 'utf8')) }; } catch { /* primeiro uso */ }
const salvar = () => { if (!APLICAR) return; const t = `${ESTADO_ARQ}.tmp`; writeFileSync(t, JSON.stringify(estado)); renameSync(t, ESTADO_ARQ); };
const log = (...a) => console.log(APLICAR ? '' : '[ensaio]', ...a);
const hora = (ts) => new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Texto legível de uma mensagem crua da Evolution. */
export function textoDe(msg, tipo) {
  const m = msg || {};
  const t = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption
    || m.templateMessage?.hydratedTemplate?.hydratedContentText || m.templateMessage?.hydratedFourRowTemplate?.hydratedContentText
    || m.buttonsMessage?.contentText || m.listMessage?.description || m.interactiveMessage?.body?.text || '';
  if (t) return String(t);
  if (m.audioMessage) return `[áudio ${m.audioMessage.seconds || '?'}s]`;
  if (m.imageMessage) return '[imagem]';
  if (m.videoMessage) return '[vídeo]';
  if (m.documentMessage) return `[documento ${m.documentMessage.fileName || ''}]`;
  if (m.stickerMessage) return '[figurinha]';
  return `[${tipo || 'mensagem'}]`;
}
export const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase();

// ---------- mapa @lid → telefone (do próprio banco da Evolution) ----------
const mapa = new Map();
for (const r of evoSql(`select "key"->>'remoteJid' a, "key"->>'remoteJidAlt' b from "Message"
  where ("key"->>'remoteJid' like '%@lid' and "key"->>'remoteJidAlt' like '%@s.whatsapp.net')
     or ("key"->>'remoteJidAlt' like '%@lid' and "key"->>'remoteJid' like '%@s.whatsapp.net') group by 1,2`)) {
  const [lid, pn] = r.a.endsWith('@lid') ? [r.a, r.b] : [r.b, r.a];
  mapa.set(digitos(lid), digitos(pn));
}
const telDoLid = (jid) => mapa.get(digitos(jid)) || null;

// ---------- utilidades Chatwoot ----------
async function contatoPorTelefone(tel) {
  const r = await api(TOK, `/contacts/search?q=${encodeURIComponent(tel)}&include_contact_inboxes=true`);
  return (r.payload || []).find((c) => digitos(c.phone_number) === digitos(tel)) || null;
}
async function contatoPorIdentificador(jid) {
  const r = await api(TOK, `/contacts/search?q=${encodeURIComponent(digitos(jid))}&include_contact_inboxes=true`);
  return (r.payload || []).find((c) => c.identifier === jid) || null;
}
async function conversaDoContato(contatoId, inboxId) {
  const r = await api(TOK, `/contacts/${contatoId}/conversations`);
  const l = (r.payload || []).filter((c) => c.inbox_id === inboxId).sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0));
  return l.find((c) => c.status !== 'resolved') || l[0] || null;
}
async function garantirConversa(contato, inboxId, origem) {
  const c = await conversaDoContato(contato.id, inboxId);
  if (c) return c;
  if (!APLICAR) return { id: '(nova)' };
  // contact_inbox (source_id) para a caixa API, depois a conversa já aberta (aberta = não fica com o robô)
  let ci = (contato.contact_inboxes || []).find((x) => x.inbox?.id === inboxId);
  if (!ci) ci = await api(TOK, `/contacts/${contato.id}/contact_inboxes`, 'POST', { inbox_id: inboxId, source_id: origem });
  return api(TOK, '/conversations', 'POST', { source_id: ci.source_id, inbox_id: inboxId, contact_id: contato.id, status: 'open' });
}
async function textosDaConversa(convId) {
  const r = await api(TOK, `/conversations/${convId}/messages`);
  return new Set((r.payload || []).map((m) => norm(String(m.content || '').replace(/^\[[^\]]*\]\s*/, '').replace(/^(CLIENTE|NÓS)[^:]*:\s*/, ''))));
}
const nota = (convId, texto) => (APLICAR ? api(TOK, `/conversations/${convId}/messages`, 'POST', { content: texto, message_type: 'outgoing', private: true }) : null);

// ---------- A) contatos-fantasma ----------
let nFantasma = 0;
for (const inboxId of CAIXAS) {
  for (let page = 1; page <= 4; page++) {
    const r = await api(TOK, `/conversations?inbox_id=${inboxId}&status=all&page=${page}`);
    const lista = r.data?.payload || [];
    for (const conv of lista) {
      const s = conv.meta?.sender || {};
      const ehFantasma = String(s.identifier || '').endsWith('@lid') && digitos(s.phone_number) === digitos(s.identifier);
      if (!ehFantasma || estado.fantasmas[conv.id]) continue;
      const tel = telDoLid(s.identifier);
      if (!tel) { log(`fantasma #${conv.id} (${s.identifier}): telefone real desconhecido, fica como está`); continue; }
      const real = await contatoPorTelefone(`+${tel}`);
      let alvo;
      if (real) alvo = await garantirConversa(real, conv.inbox_id, `${tel}@s.whatsapp.net`);
      else if (APLICAR) {
        const novo = await api(TOK, '/contacts', 'POST', { name: s.name && !/^\d+$/.test(s.name) ? s.name : `WhatsApp final ${tel.slice(-4)}`, phone_number: `+${tel}`, identifier: `${tel}@s.whatsapp.net`, inbox_id: conv.inbox_id });
        alvo = await garantirConversa(novo.payload?.contact || novo.payload || novo, conv.inbox_id, `${tel}@s.whatsapp.net`);
      } else alvo = { id: '(contato novo)' };
      const msgs = (await api(TOK, `/conversations/${conv.id}/messages`)).payload || [];
      const ja = typeof alvo.id === 'number' ? await textosDaConversa(alvo.id) : new Set();
      const copiar = msgs.filter((m) => !m.private && (m.message_type === 0 || m.message_type === 1) && !ja.has(norm(m.content)));
      log(`fantasma #${conv.id} (${s.identifier} → +${tel}): ${copiar.length} msg para #${alvo.id}`);
      for (const m of copiar) {
        const quem = m.message_type === 0 ? 'CLIENTE' : `NÓS (enviado fora do Chatwoot, pela Evolution${m.sender?.name ? `, ${m.sender.name}` : ''})`;
        await nota(alvo.id, `[sincronia · conversa duplicada #${conv.id} · ${hora(m.created_at)}] ${quem}: ${m.content || '[anexo]'}`);
      }
      if (APLICAR) {
        await nota(conv.id, `[sincronia] Conversa duplicada: o contato real é +${tel}. O histórico foi copiado para a conversa #${alvo.id}. Responda lá.`);
        await api(TOK, `/contacts/${s.id}`, 'PUT', { name: `(duplicado @lid) ${s.name && !/^\d+$/.test(s.name) ? s.name : `final ${tel.slice(-4)}`}` }).catch(() => {});
        await api(TOK, `/conversations/${conv.id}/toggle_status`, 'POST', { status: 'resolved' }).catch(() => {});
        estado.fantasmas[conv.id] = { tel, alvo: alvo.id, quando: new Date().toISOString() };
        salvar();
      }
      nFantasma++;
    }
    if (lista.length < 25) break;
  }
}

// ---------- B) mensagens que nunca entraram ----------
const desde = Math.floor(Date.now() / 1000) - DIAS * 86400;
const linhas = evoSql(`select i.name inst, m.id, m."key"->>'remoteJid' jid, m."key"->>'remoteJidAlt' alt, (m."key"->>'fromMe')::bool nosso,
  m."messageTimestamp" ts, m."messageType" tipo, m.message msg, m."pushName" nome
  from "Message" m join "Instance" i on i.id = m."instanceId"
  where i.name in ('olli-orcamentos','segundo-andar') and m."messageTimestamp" > ${desde} and m."chatwootConversationId" is null
  and m."key"->>'remoteJid' not like '%@g.us' and m."key"->>'remoteJid' not like '%broadcast%' and m."key"->>'remoteJid' not like '%@newsletter'
  and m."messageType" not in ('reactionMessage','protocolMessage','pollUpdateMessage','editedMessage')
  order by m."messageTimestamp"`);
const grupos = new Map();
for (const l of linhas) {
  if (estado.importadas[l.id]) continue;
  const tel = l.jid.endsWith('@lid') ? (digitos(l.alt) || telDoLid(l.jid)) : digitos(l.jid);
  if (tel && ehNumeroInterno(tel)) continue; // conversa entre números nossos (testes): fica de fora
  if (l.jid.endsWith('@lid') && !tel && digitos(l.jid).length < 12) { log(`JID inválido ${l.jid} (${hora(l.ts)}): mensagem nossa para um @lid truncado, não há contato`); continue; }
  const k = `${l.inst}|${tel || l.jid}`;
  if (!grupos.has(k)) grupos.set(k, { inst: l.inst, tel, jid: l.jid, nome: l.nome, msgs: [] });
  const g = grupos.get(k);
  if (!g.nome || g.nome === 'Você') g.nome = l.nosso ? g.nome : l.nome;
  g.msgs.push(l);
}
let nImport = 0;
for (const g of grupos.values()) {
  const inboxId = INSTANCIA_CAIXA[g.inst];
  let contato = g.tel ? await contatoPorTelefone(`+${g.tel}`) : null;
  if (!contato) contato = await contatoPorIdentificador(g.jid);
  let conv = contato ? await conversaDoContato(contato.id, inboxId) : null;
  const ja = conv ? await textosDaConversa(conv.id) : new Set();
  const faltam = g.msgs.filter((m) => !ja.has(norm(textoDe(m.msg, m.tipo))));
  // as que já estão (texto igual) só entram no estado, para não reconsultar
  for (const m of g.msgs) if (!faltam.includes(m)) estado.importadas[m.id] = 'ja-estava';
  if (!faltam.length) continue;
  log(`${g.inst} ${g.tel ? `+${g.tel}` : g.jid} (${g.nome || 'sem nome'}): ${faltam.length} msg faltando → ${conv ? `#${conv.id}` : 'conversa nova'}`);
  if (!APLICAR) { nImport += faltam.length; continue; }
  if (!contato) {
    const nome = g.nome && g.nome !== 'Você' && !/^\d+$/.test(g.nome) ? g.nome : `WhatsApp ${g.tel ? `final ${g.tel.slice(-4)}` : digitos(g.jid).slice(-4)}`;
    const corpo = { name: nome, identifier: g.tel ? `${g.tel}@s.whatsapp.net` : g.jid, inbox_id: inboxId };
    if (g.tel && g.tel.length >= 10) corpo.phone_number = `+${g.tel}`;
    const novo = await api(TOK, '/contacts', 'POST', corpo);
    contato = novo.payload?.contact || novo.payload || novo;
  }
  if (!conv) conv = await garantirConversa(contato, inboxId, g.tel ? `${g.tel}@s.whatsapp.net` : g.jid);
  await nota(conv.id, `[sincronia] ${faltam.length} mensagem(ns) do WhatsApp que não tinham entrado no Chatwoot, importadas em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`);
  for (const m of faltam) {
    await nota(conv.id, `[sincronia · ${hora(m.ts)}] ${m.nosso ? 'NÓS (enviado fora do Chatwoot)' : 'CLIENTE'}: ${textoDe(m.msg, m.tipo)}`);
    estado.importadas[m.id] = conv.id;
    nImport++;
  }
  salvar();
}
salvar();
console.log(`${APLICAR ? 'aplicado' : 'ensaio'}: ${nFantasma} conversa(s) duplicada(s) juntada(s), ${nImport} mensagem(ns) importada(s); mapa @lid com ${mapa.size} telefones; janela ${DIAS} dias.`);
