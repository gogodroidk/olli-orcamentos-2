#!/usr/bin/env node
// Ferramenta de linha de comando dos agentes para operar o Chatwoot por código.
//   node cwc.mjs sem-resposta [caixa] [--horas N]   conversas abertas cuja última mensagem é do cliente
//   node cwc.mjs ler       <conversa> [n=15]          últimas mensagens (inclui notas privadas)
//   node cwc.mjs responder <conversa> "texto" [--simular]   manda ao cliente (passa pelas travas)
//   node cwc.mjs etiquetar <conversa> <etiqueta> [...]       acrescenta etiquetas
//   node cwc.mjs atribuir  <conversa> <id|email>             atribui a um agente
//   node cwc.mjs nota      <conversa> "texto"                nota privada (cliente não vê)
//   node cwc.mjs gasto                                        gasto do dia e por conversa
// Token: variável CHATWOOT_TOKEN_CLAUDE. Caixa pessoal (5) e GR Tech (2): recusadas em tudo.
import { CFG, carregarVariaveis, caixaPermitida, caixaProibida, motivosDeBarrar, gastoDoDia, gastoPorConversa, lerParar } from './nucleo.mjs';
import * as cw from './chatwoot.mjs';

carregarVariaveis(['CHATWOOT_TOKEN_CLAUDE', 'CHATWOOT_URL', 'CHATWOOT_CONTA']);
const args = process.argv.slice(2);
const posicionais = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--horas');
const [cmd, ...resto] = posicionais;
const flag = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const sair = (m, c = 1) => { console.error(m); process.exit(c); };
const hora = (t) => new Date(t * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function pegar(idArg) {
  const id = Number(idArg); if (!id) sair('falta o número da conversa');
  let c;
  try { c = await cw.conversa(id); } catch (e) { sair(e.message); }
  if (!caixaPermitida(c.inbox_id)) sair(`conversa #${id} é da caixa ${c.inbox_id}: fora da lista (${CFG.caixas_permitidas.join(',')})`); // P2-3
  return c;
}

if (cmd === 'sem-resposta') {
  const so = resto[0] ? Number(resto[0]) : null;
  if (so && caixaProibida(so)) sair(`caixa ${so} proibida`);
  if (so && !caixaPermitida(so)) sair(`caixa ${so} fora da lista (${CFG.caixas_permitidas.join(',')})`);
  const minHoras = Number(flag('horas') || 0);
  const lista = [];
  for (const caixa of so ? [so] : CFG.caixas_permitidas) {
    for (let p = 1; p <= 8; p++) {
      const r = await cw.api(`/conversations?status=open&assignee_type=all&inbox_id=${caixa}&page=${p}`);
      const pg = r.data?.payload || [];
      lista.push(...pg);
      if (pg.length < 25) break;
    }
  }
  const agora = Date.now() / 1000;
  const sem = lista.filter((c) => !caixaProibida(c.inbox_id) && (c.last_non_activity_message?.message_type === 0) && (agora - (c.last_non_activity_message.created_at || 0)) / 3600 >= minHoras)
    .sort((a, b) => (a.last_non_activity_message.created_at) - (b.last_non_activity_message.created_at));
  console.log(`${sem.length} conversa(s) sem resposta`);
  for (const c of sem) {
    const m = c.last_non_activity_message;
    console.log(`#${c.id} [caixa ${c.inbox_id}] ${c.meta?.sender?.name || '?'} | espera desde ${hora(m.created_at)} | dono: ${c.meta?.assignee?.name || '-'} | "${String(m.content || '').replace(/\s+/g, ' ').slice(0, 80)}" | ${(c.labels || []).join(',')}`);
  }
} else if (cmd === 'ler') {
  const c = await pegar(resto[0]);
  console.log(`#${c.id} caixa ${c.inbox_id} ${c.status} | ${c.meta?.sender?.name || '?'} | dono: ${c.meta?.assignee?.name || '-'} | etiquetas: ${(c.labels || []).join(',')}`);
  for (const m of (await cw.mensagens(c.id)).slice(-Number(resto[1] || 15))) {
    const quem = m.private ? 'NOTA' : m.message_type === 0 ? 'CLIENTE' : m.message_type === 1 ? 'NÓS' : 'atividade';
    console.log(`${hora(m.created_at)} ${quem}: ${String(m.content || '').slice(0, 500)}`);
  }
} else if (cmd === 'responder') {
  const c = await pegar(resto[0]);
  const texto = resto.slice(1).join(' ').trim();
  const m = motivosDeBarrar(texto);
  if (lerParar().has(String(c.meta?.sender?.id))) m.push('contato pediu para parar');
  if ((c.labels || []).includes(CFG.etiquetas.parar)) m.push('conversa marcada parar-contato');
  if ((c.labels || []).includes(CFG.preco_combinado_etiqueta) && /R\$/.test(texto)) m.push('conversa com preço combinado: só humano cita preço');
  if (!cw.clienteJaFalou(await cw.mensagens(c.id))) m.push('contato frio: o cliente ainda não escreveu; nada sai');
  if (m.length) sair(`BARRADO: ${m.join('; ')}`);
  if (flag('simular')) console.log(`[simulação] sairia na #${c.id}: ${texto}`);
  else { await cw.enviar(c.id, texto); console.log(`enviado na #${c.id}`); }
} else if (cmd === 'etiquetar') {
  const c = await pegar(resto[0]);
  if (resto.length < 2) sair('falta a etiqueta');
  console.log(`etiquetas da #${c.id}: ${(await cw.etiquetar(c.id, resto.slice(1))).join(', ')}`);
} else if (cmd === 'atribuir') {
  const c = await pegar(resto[0]);
  let alvo = resto[1]; if (!alvo) sair('falta o id ou e-mail do agente');
  if (!/^\d+$/.test(alvo)) {
    const a = (await cw.agentes()).find((x) => x.email === alvo);
    if (!a) sair(`agente ${alvo} não encontrado`);
    alvo = a.id;
  }
  await cw.atribuir(c.id, alvo);
  console.log(`#${c.id} atribuída ao agente ${alvo}`);
} else if (cmd === 'nota') {
  const c = await pegar(resto[0]);
  const texto = resto.slice(1).join(' ').trim(); if (!texto) sair('falta o texto');
  await cw.nota(c.id, texto);
  console.log(`nota privada gravada na #${c.id}`);
} else if (cmd === 'gasto') {
  console.log(`hoje: R$ ${gastoDoDia().toFixed(4)} de R$ ${CFG.teto_diario_reais} (teto)`);
  for (const [k, v] of Object.entries(gastoPorConversa())) console.log(`  conversa #${k}: R$ ${v.toFixed(4)}`);
} else sair('uso: node cwc.mjs <sem-resposta|ler|responder|etiquetar|atribuir|nota|gasto> ...');
