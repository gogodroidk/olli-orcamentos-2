/**
 * CQ-ATENDENTE-SDR — ponte Chatwoot (Agent Bot) ↔ atendenteSdr.js.
 *
 * NÃO está ligado em index.js de propósito (sem deploy): o passo de ligar está
 * no HANDOFF. Tudo que toca rede entra por `deps` (fetch, transcrição, modelo,
 * dedupe), então o teste roda sem rede e sem segredo.
 *
 * Variáveis (nomes apenas; valores ficam em secret do Worker, nunca no código):
 *   CHATWOOT_URL              base da instância, ex.: https://chat.exemplo.com
 *   CHATWOOT_BOT_TOKEN        access token do Agent Bot
 *   ATENDENTE_SDR_SEGREDO     segredo do webhook (vai em ?s= na URL do Agent Bot)
 *   ATENDENTE_SDR_INBOXES     JSON {"<inbox_id>":"olli|grtech|segundoandar"}
 *   ATENDENTE_SDR_JANELA      opcional, JSON {"inicio":9,"fim":18} (horas BRT) — só se o Igor confirmar
 *
 * Fluxo: message_created (incoming) em conversa "pending" → responderAtendente →
 *   enviar  : posta a resposta (mensagem pública)
 *   humano  : posta a resposta + nota privada com resumo + status "open" + etiquetas
 *   suprimir: posta a despedida + etiqueta "sair" + resolve a conversa
 * Conversas já "open" (humano assumiu) ou com etiqueta "sair" são ignoradas.
 */

import { responderAtendente } from './atendenteSdr.js';

const ETIQUETAS_HUMANO = {
  reclamacao: 'reclamacao',
  reembolso_cobranca: 'cobranca',
  lgpd: 'lgpd',
  humano: 'pediu-humano',
  fora_tabela: 'fora-da-tabela',
  venda_grande: 'venda-grande',
  incerteza: 'sem-fonte',
};

async function igual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))]);
  const A = new Uint8Array(x);
  const B = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < A.length; i += 1) d |= A[i] ^ B[i];
  return d === 0;
}

function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

function mapaInboxes(env) {
  try {
    return JSON.parse(env.ATENDENTE_SDR_INBOXES || '{}');
  } catch {
    return {};
  }
}

function resumo(r) {
  const partes = [
    `Motivo: ${r.motivo ?? r.intencao}`,
    `Prioridade: ${r.prioridade ?? 'normal'}`,
    `Lead: ${r.lead}`,
    r.qualificacao ? `Qualificação: ${Object.entries(r.qualificacao).map(([k, v]) => `${k}=${v ? 'sim' : 'falta'}`).join(', ')}` : null,
    `Última mensagem (sem dados sensíveis): ${r.registro.textoRedigido}`,
    r.foraHorario ? 'Chegou fora do horário do time.' : null,
  ];
  return `[Atendente ${r.atendente}] ${partes.filter(Boolean).join(' | ')}`;
}

export async function tratarEventoChatwoot(payload, env, deps = {}) {
  const f = deps.fetch ?? fetch;
  if (payload?.event !== 'message_created' || payload?.message_type !== 'incoming') return { ignorado: 'evento' };
  const conv = payload.conversation ?? {};
  const contaId = payload.account?.id;
  if (!conv.id || !contaId) return { ignorado: 'sem_conversa' };
  if (conv.status && conv.status !== 'pending') return { ignorado: 'humano_assumiu' };
  if ((conv.labels ?? []).includes('sair')) return { ignorado: 'suprimido' };
  const empresa = mapaInboxes(env)[String(conv.inbox_id ?? payload.inbox?.id)];
  if (!empresa) return { ignorado: 'inbox_sem_empresa' };
  if (deps.jaProcessado && (await deps.jaProcessado(payload.id))) return { ignorado: 'duplicado' };

  let texto = String(payload.content ?? '');
  let audioSemTexto = false;
  const anexoAudio = (payload.attachments ?? []).find((a) => a.file_type === 'audio');
  if (anexoAudio && !texto.trim()) {
    if (typeof deps.transcrever === 'function') {
      try {
        texto = String((await deps.transcrever(anexoAudio.data_url)) ?? '');
      } catch {
        texto = '';
      }
    }
    if (!texto.trim()) audioSemTexto = true;
  }

  let janela = null;
  try {
    janela = env.ATENDENTE_SDR_JANELA ? JSON.parse(env.ATENDENTE_SDR_JANELA) : null;
  } catch {
    janela = null;
  }

  const r = await responderAtendente({
    empresa,
    texto,
    audioSemTexto,
    historico: deps.historico ? await deps.historico(contaId, conv.id) : [],
    agora: deps.agora?.() ?? new Date(),
    llm: deps.llm,
    janelaHumana: janela,
  });

  const base = `${String(env.CHATWOOT_URL).replace(/\/$/, '')}/api/v1/accounts/${contaId}/conversations/${conv.id}`;
  const cab = { 'content-type': 'application/json', api_access_token: env.CHATWOOT_BOT_TOKEN };
  const post = (caminho, corpo) => f(`${base}${caminho}`, { method: 'POST', headers: cab, body: JSON.stringify(corpo) });

  if (r.resposta) await post('/messages', { content: r.resposta, message_type: 'outgoing', private: false });

  const etiquetas = [`empresa-${empresa}`];
  if (r.lead === 'quente') etiquetas.push('lead-quente');
  if (r.acao === 'humano') etiquetas.push(ETIQUETAS_HUMANO[r.motivo] ?? 'humano');
  if (r.acao === 'suprimir') etiquetas.push('sair');
  if (r.acao === 'enviar_e_sinalizar') etiquetas.push('sinalizar');
  await post('/labels', { labels: etiquetas });

  if (r.acao === 'humano' || r.acao === 'enviar_e_sinalizar') {
    await post('/messages', { content: resumo(r), message_type: 'outgoing', private: true });
    if (r.acao === 'humano') await post('/toggle_status', { status: 'open' });
    if (deps.avisarIgor) await deps.avisarIgor({ empresa, conversa: conv.id, motivo: r.motivo ?? r.intencao, prioridade: r.prioridade ?? 'normal' });
  }
  if (r.acao === 'suprimir') {
    await post('/toggle_status', { status: 'resolved' });
    if (deps.suprimir) await deps.suprimir({ empresa, conversa: conv.id, contato: payload.sender?.id });
  }
  return { ok: true, acao: r.acao, intencao: r.intencao, lead: r.lead };
}

/** Rota POST /atendente/chatwoot?s=<segredo> — monte no index.js quando o Igor mandar ligar. */
export async function handleAtendenteChatwoot(request, env, deps = {}) {
  if (request.method !== 'POST') return json({ erro: 'metodo' }, 405);
  if (!env.ATENDENTE_SDR_SEGREDO || !env.CHATWOOT_URL || !env.CHATWOOT_BOT_TOKEN) return json({ erro: 'nao_configurado' }, 503);
  const s = new URL(request.url).searchParams.get('s') ?? '';
  if (!(await igual(s, env.ATENDENTE_SDR_SEGREDO))) return json({ erro: 'nao_autorizado' }, 401);
  const bruto = await request.text();
  if (bruto.length > 256 * 1024) return json({ erro: 'grande' }, 413);
  let payload;
  try {
    payload = JSON.parse(bruto);
  } catch {
    return json({ erro: 'json' }, 400);
  }
  try {
    return json(await tratarEventoChatwoot(payload, env, deps));
  } catch {
    // Falha aqui nunca pode deixar o cliente sem resposta: o Chatwoot reentrega.
    return json({ erro: 'interno' }, 500);
  }
}
