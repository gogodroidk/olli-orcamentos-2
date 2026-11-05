/**
 * Z-117 — isca "comente MODELO" do Instagram, só pela API oficial. RASCUNHO.
 *
 * Não está importado em index.js. Não há rota, não há cron e esta função não
 * lê variável de ambiente. Sem `ligado`, sem conta autorizada e sem `fetchImpl`
 * injetado, nenhuma chamada sai. O pedido, quando um teste liga os três,
 * é o da doc da Meta de 30/06/2026: POST /{ig-id}/messages com
 * recipient.comment_id (Private Replies). Uma mensagem por comentário,
 * em até 7 dias; Live não responde; continuação só se a pessoa escrever,
 * e só em 24 h.
 *
 * Opt-out reusa a regra do WhatsApp (`private.wa_texto_pede_sair`): na
 * dúvida, sai. Não grava username, texto cru nem telefone. O id da pessoa
 * só entra no hash e, em memória, no pedido HTTP.
 */
import { GRAPH_VERSAO, igualConstante, verificarAssinaturaMeta } from './whatsappCloud.js';

export const IG_ISCA_VERSION = '2026-11-04.z117';
export const PALAVRA = 'MODELO';
export const URL_ENTREGA = 'https://olliorcamentos.online/blog/modelo-de-orcamento-de-prestacao-de-servico/';
export const JANELA_COMENTARIO_MS = 7 * 24 * 60 * 60 * 1000;
export const JANELA_RESPOSTA_MS = 24 * 60 * 60 * 1000;
export const TETO_POR_HORA = 30;
export const HOSTS_OFICIAIS = new Set(['https://graph.facebook.com', 'https://graph.instagram.com']);

export const TEXTO_RESPOSTA =
  'Oi! Sou o assistente virtual do OLLI Orçamentos, uma IA. Você comentou MODELO. ' +
  `Segue o texto com os 9 campos de um orçamento de serviço: ${URL_ENTREGA} ` +
  'Não é um arquivo para baixar. É a lista do que o orçamento precisa ter. ' +
  'O app serve para montar o orçamento e mandar o link para o seu cliente aprovar. ' +
  'Se quiser parar de receber mensagens, responda SAIR. Eu paro na hora e não chamo de novo.';

export const TEXTO_PERGUNTA =
  'Qual é o seu ofício? Responda com uma palavra, por exemplo elétrica, refrigeração ou pintura. ' +
  'Se quiser parar, responda SAIR.';

export const TEXTO_CONFIRMACAO = 'Pronto. Parei. Não mando mais mensagem por aqui.';

const OFICIOS = [
  'ar condicionado',
  'eletrica',
  'refrigeracao',
  'pintura',
  'hidraulica',
  'marcenaria',
  'reforma',
  'gesso',
  'serralheria',
  'dedetizacao',
  'limpeza',
  'jardinagem',
];

function exigirTexto(texto, { url = false, ia = false, sair = false } = {}) {
  if (typeof texto !== 'string' || texto.length < 10 || texto.length > 900) {
    throw new Error('ig_isca_texto_tamanho');
  }
  if (/r\$\s?\d|pix|checkout|stripe|wa\.me|garantia|24\s*h|ilimitad/i.test(texto)) {
    throw new Error('ig_isca_texto_proibido');
  }
  if (url && !texto.includes(URL_ENTREGA)) throw new Error('ig_isca_texto_url');
  if (ia && !texto.includes('IA')) throw new Error('ig_isca_texto_ia');
  if (sair && !texto.includes('SAIR')) throw new Error('ig_isca_texto_sair');
}

exigirTexto(TEXTO_RESPOSTA, { url: true, ia: true, sair: true });
exigirTexto(TEXTO_PERGUNTA, { sair: true });
exigirTexto(TEXTO_CONFIRMACAO);

export function configPadrao() {
  return {
    ligado: false,
    contaPermitida: false,
    igId: '',
    sal: '',
    host: 'https://graph.facebook.com',
    versao: GRAPH_VERSAO,
    urlEntrega: URL_ENTREGA,
    tetoPorHora: TETO_POR_HORA,
  };
}

export function estadoVazio() {
  return {
    optout: new Set(),
    respondidos: new Set(),
    conversas: new Map(),
    envios: [],
  };
}

export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/ +/g, ' ')
    .trim();
}

/** Famílias do `wa_texto_pede_sair` (migration do WhatsApp). Falso negativo custa mensagem; na dúvida, sai. */
export function textoPedeSair(texto) {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > 2000) return false;
  const n = normalizar(texto);
  if (!n) return false;
  if (/^ *(sair|sai|parar|pare|stop|descadastrar|nao quero)( [a-z0-9 ]{0,40})?$/.test(n)) return true;
  if (/^ *(cancelar|cancela|cancele|cancelem|remover|remova|removam)( [a-z0-9]+){0,5} (mensagens|msg|msgs|transmissao|notificacoes|grupo|lista(?! de ))( |$)/.test(n)) return true;
  if (/^ *((por favor|pf|pfv|favor|quero|queria|gostaria de|preciso|pode|podem|vou|vamos|ja) )*(me )?(cancelar|cancela|cancele|cancelem|remover|remova|removam)( [a-z0-9]+){0,5} (mensagens|msg|msgs|transmissao|notificacoes|grupo|lista(?! de ))( |$)/.test(n)) return true;
  if (/^ *((por favor|pf|pfv|favor|quero|queria|gostaria de|preciso|pode|podem|vou|vamos|ja) )*(me )?(cancelar|cancela|cancele|cancelem|remover|remova|removam)( [a-z0-9]+){0,2} (meu|minha|meus|minhas) (numero|contato|dados|cadastro|nome|email|telefone|whatsapp|zap)( |$)/.test(n)) return true;
  if (/^ *((por favor|pf|pfv|favor|quero|queria|gostaria de|preciso|pode|podem|vou|vamos|ja) )+(me )?(cancelar|cancela|cancele|cancelem|remover|remova|removam)$/.test(n)) return true;
  if (/^ *(me )?(cancelar|cancela|cancele|cancelem|remover|remova|removam) (tudo|isso|tudo isso|isso tudo)$/.test(n)) return true;
  if (/^ *((por favor|pf|pfv|favor|quero|queria|gostaria de|preciso|pode|podem|vou|vamos|ja) )+(me )?(sair|saia|saiam)( (da|do|de|dessa|desse|desta|deste) (lista|grupo|cadastro|mensagens|transmissao|contatos?))?$/.test(n)) return true;
  if (n.length > 160) return false;
  return (
    /(^| )(tira|tire|tirem|retira|retire|retirem|exclui|exclua|excluam|remove|remova|removam)( [a-z0-9]+){0,3} (da|dessa|desta|de|do|dos|das) (lista|cadastro|grupo|mensagens|contatos|transmissao)/.test(n) ||
    /(^| )(exclua|excluam|apague|apaguem|delete|deletem)( [a-z0-9]+){0,2} (meu|meus|minha|minhas) (cadastro|numero|contato|dados|nome)/.test(n) ||
    /(^| )(nao|n) (me )?(mande|manda|mandem|envie|envia|enviem|chame|chama|escreva|escreve|ligue|liga|perturbe|incomode) (mais|nada|msg|mensagem|mensagens)/.test(n) ||
    /(^| )(nao|n) me (mande|manda|mandem|envie|envia|enviem|chame|chama|escreva|escreve|ligue|liga|perturbe|incomode)/.test(n) ||
    /(^| )(pare|para|parem) de (me )?(mandar|enviar|chamar|escrever|ligar|incomodar|perturbar|mensagem|mensagens|msg)/.test(n) ||
    /^ *(ja )?chega( de [a-z0-9 ]{0,30})?$/.test(n) ||
    /(^| )chega de (mensagem|mensagens|msg|spam|ligacao|ligacoes|propaganda)/.test(n) ||
    /(^| )(bloqueei|vou bloquear|estou bloqueando|bloqueando voces|denunci)/.test(n) ||
    /(^| )(nao tenho|nao tem|sem|nao me) (interesse|interessa)/.test(n) ||
    /(^| )(nao|n) (quero|preciso) (mais )?(receber|mensagem|mensagens|msg|msgs|nada|isso)/.test(n) ||
    /descadastr|desinscrev/.test(n) ||
    /(^| )(isso|e|parece|sao|tudo) (e |um |so )?spam( |$)/.test(n)
  );
}

export function temPalavra(texto, palavra = PALAVRA) {
  const n = normalizar(texto);
  const p = normalizar(palavra);
  if (!n || !p) return false;
  return new RegExp(`(?:^| )${p}(?: |$)`).test(n);
}

export function classificarOficio(texto) {
  const n = normalizar(texto);
  if (!n || n.length > 80) return null;
  const achados = OFICIOS.filter((oficio) => new RegExp(`(?:^| )${oficio}(?: |$)`).test(n));
  if (achados.length !== 1) return null;
  return achados[0].replace(/ /g, '_');
}

export function urlPermitida(valor) {
  try {
    const url = new URL(valor);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'olliorcamentos.online' &&
      url.pathname === '/blog/modelo-de-orcamento-de-prestacao-de-servico/' &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export async function hashId(sal, valor) {
  if (typeof sal !== 'string' || sal.length < 16) return null;
  if (typeof valor !== 'string' || !/^[0-9]{5,40}$/.test(valor)) return null;
  const data = new TextEncoder().encode(`ig-isca.v1:${sal}:${valor}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function idMeta(valor) {
  return typeof valor === 'string' && /^[0-9]{5,40}$/.test(valor) ? valor : '';
}

function quandoMs(entry, value) {
  const bruto = value?.timestamp ?? entry?.time;
  const n = typeof bruto === 'number' ? bruto : Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 10_000_000_000 ? n : n * 1000;
}

export function lerEventos(payload) {
  if (!payload || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return [];
  const saida = [];
  for (const entry of payload.entry) {
    const contaId = idMeta(entry?.id);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const campo = change?.field === 'live_comments' || change?.field === 'comments' ? change.field : '';
      if (!campo) continue;
      saida.push({
        tipo: 'comentario',
        contaId,
        campo,
        autorId: idMeta(value?.from?.id),
        comentarioId: idMeta(value?.id),
        mediaId: idMeta(value?.media?.id),
        produto: typeof value?.media?.media_product_type === 'string' ? value.media.media_product_type : '',
        texto: typeof value?.text === 'string' ? value.text.slice(0, 1000) : '',
        quandoMs: quandoMs(entry, value),
      });
    }
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const mensagem of messaging) {
      const eco = mensagem?.message?.is_echo === true || idMeta(mensagem?.sender?.id) === contaId;
      saida.push({
        tipo: 'mensagem',
        contaId,
        autorId: idMeta(mensagem?.sender?.id),
        mensagemId: idMeta(mensagem?.message?.mid) || (typeof mensagem?.message?.mid === 'string' ? mensagem.message.mid.slice(0, 80) : ''),
        texto: typeof mensagem?.message?.text === 'string' ? mensagem.message.text.slice(0, 1000) : '',
        quandoMs: quandoMs(entry, mensagem),
        eco,
      });
    }
  }
  return saida.slice(0, 20);
}

function tetoCheio(estado, agora, teto) {
  const limite = agora - 60 * 60 * 1000;
  const recentes = estado.envios.filter((t) => t >= limite);
  return recentes.length >= teto;
}

function basesRecusa(config) {
  if (config.ligado !== true) return 'rascunho';
  if (config.contaPermitida !== true) return 'conta_nao_autorizada';
  if (!idMeta(config.igId)) return 'conta_errada';
  if (!urlPermitida(config.urlEntrega)) return 'url_recusada';
  if (typeof config.sal !== 'string' || config.sal.length < 16) return 'sem_sal';
  return '';
}

function recusa(motivo, extra = {}) {
  return { enviar: false, motivo, texto: null, destino: null, optout: false, oficio: null, efeito: 'ignorar', ...extra };
}

export async function avaliarComentario(evento, estado, config, agora) {
  const autorHash = await hashId(config.sal, evento.autorId);
  const comentarioHash = await hashId(config.sal, evento.comentarioId);
  const base = { autorHash, comentarioHash, mediaId: evento.mediaId, palavra: null };
  if (!evento.autorId || !evento.comentarioId || !evento.mediaId) return recusa('id_invalido', base);
  if (evento.autorId === config.igId) return recusa('comentario_proprio', base);
  if (evento.campo === 'live_comments' || /live/i.test(evento.produto)) return recusa('live', base);
  if (!evento.quandoMs) return recusa('sem_data', base);
  if (agora - evento.quandoMs > JANELA_COMENTARIO_MS || evento.quandoMs > agora + 5 * 60 * 1000) {
    return recusa('fora_da_janela', base);
  }
  if (autorHash && estado.optout.has(autorHash)) return recusa('optout', base);
  if (textoPedeSair(evento.texto)) {
    if (!autorHash) return recusa('sem_sal', base);
    return { ...recusa('optout', base), optout: true, efeito: 'optout' };
  }
  if (!temPalavra(evento.texto, PALAVRA)) return recusa('sem_palavra', base);
  const trava = basesRecusa(config);
  if (trava) return recusa(trava, { ...base, palavra: PALAVRA });
  if (!autorHash || !comentarioHash) return recusa('sem_sal', { ...base, palavra: PALAVRA });
  if (estado.respondidos.has(comentarioHash)) return recusa('ja_respondido', { ...base, palavra: PALAVRA });
  if (evento.contaId !== config.igId) return recusa('conta_errada', { ...base, palavra: PALAVRA });
  if (tetoCheio(estado, agora, config.tetoPorHora)) return recusa('teto', { ...base, palavra: PALAVRA });
  return {
    enviar: true,
    motivo: 'resposta_privada',
    texto: TEXTO_RESPOSTA,
    destino: { tipo: 'comentario', id: evento.comentarioId },
    optout: false,
    oficio: null,
    efeito: 'responder',
    ...base,
    palavra: PALAVRA,
  };
}

export async function avaliarMensagem(evento, estado, config, agora) {
  const autorHash = await hashId(config.sal, evento.autorId);
  const base = { autorHash, comentarioHash: null, mediaId: '', palavra: null };
  if (evento.eco || !evento.autorId || !evento.texto) return recusa('ignorar_mensagem', base);
  if (!evento.quandoMs || agora - evento.quandoMs > JANELA_RESPOSTA_MS || evento.quandoMs > agora + 5 * 60 * 1000) {
    if (textoPedeSair(evento.texto) && autorHash) return { ...recusa('optout_fora_da_janela', base), optout: true, efeito: 'optout' };
    return recusa('fora_da_janela', base);
  }
  if (!autorHash) return recusa('sem_sal', base);
  if (estado.optout.has(autorHash)) return recusa('optout', base);
  const conversa = estado.conversas.get(autorHash);
  if (!conversa?.aberta) return recusa('sem_conversa', base);
  if (textoPedeSair(evento.texto)) {
    const enviar = conversa.confirmouSair !== true && basesRecusa(config) === '' && evento.contaId === config.igId && !tetoCheio(estado, agora, config.tetoPorHora);
    return {
      enviar,
      motivo: enviar ? 'confirmacao_sair' : 'optout',
      texto: enviar ? TEXTO_CONFIRMACAO : null,
      destino: enviar ? { tipo: 'pessoa', id: evento.autorId } : null,
      optout: true,
      oficio: null,
      efeito: 'confirmar',
      ...base,
    };
  }
  const oficio = classificarOficio(evento.texto);
  if (!conversa.perguntaFeita && !oficio) {
    const enviar = basesRecusa(config) === '' && evento.contaId === config.igId && !tetoCheio(estado, agora, config.tetoPorHora);
    return {
      enviar,
      motivo: enviar ? 'pergunta_oficio' : basesRecusa(config) || 'teto',
      texto: enviar ? TEXTO_PERGUNTA : null,
      destino: enviar ? { tipo: 'pessoa', id: evento.autorId } : null,
      optout: false,
      oficio: null,
      efeito: 'perguntar',
      ...base,
    };
  }
  return {
    enviar: false,
    motivo: 'oficio_guardado',
    texto: null,
    destino: null,
    optout: false,
    oficio: oficio ?? 'outro',
    efeito: 'oficio',
    ...base,
  };
}

export function montarPedido({ host, versao, igId, destino, texto, token }) {
  if (!HOSTS_OFICIAIS.has(host)) return null;
  if (!/^v\d+\.\d+$/.test(versao)) return null;
  if (!idMeta(igId) || !destino || typeof destino.id !== 'string') return null;
  if (destino.tipo !== 'comentario' && destino.tipo !== 'pessoa') return null;
  if (destino.tipo === 'comentario' && !idMeta(destino.id)) return null;
  if (destino.tipo === 'pessoa' && !/^[0-9]{5,40}$/.test(destino.id)) return null;
  if (typeof texto !== 'string' || texto.length < 10 || texto.length > 900) return null;
  if (typeof token !== 'string' || token.length < 20 || token.length > 400 || /[\s&?]/.test(token)) return null;
  const recipient = destino.tipo === 'comentario' ? { comment_id: destino.id } : { id: destino.id };
  return {
    url: `${host}/${versao}/${igId}/messages`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient, message: { text: texto } }),
    },
  };
}

function aplicarEstado(estado, decisao, agora) {
  if (decisao.optout && decisao.autorHash) estado.optout.add(decisao.autorHash);
  if (decisao.efeito === 'oficio' && decisao.autorHash && decisao.oficio) {
    const conversa = estado.conversas.get(decisao.autorHash) ?? {};
    conversa.oficio = decisao.oficio;
    estado.conversas.set(decisao.autorHash, conversa);
  }
  if (!decisao.enviar) return;
  if (decisao.efeito === 'responder' && decisao.comentarioHash && decisao.autorHash) {
    estado.respondidos.add(decisao.comentarioHash);
    estado.envios.push(agora);
    const conversa = estado.conversas.get(decisao.autorHash) ?? {};
    conversa.aberta = true;
    estado.conversas.set(decisao.autorHash, conversa);
  }
  if (decisao.efeito === 'perguntar' && decisao.autorHash) {
    estado.envios.push(agora);
    const conversa = estado.conversas.get(decisao.autorHash) ?? {};
    conversa.perguntaFeita = true;
    estado.conversas.set(decisao.autorHash, conversa);
  }
  if (decisao.efeito === 'confirmar' && decisao.autorHash) {
    estado.envios.push(agora);
    const conversa = estado.conversas.get(decisao.autorHash) ?? {};
    conversa.confirmouSair = true;
    estado.conversas.set(decisao.autorHash, conversa);
  }
}

function resposta(corpo, status) {
  return { status, corpo };
}

export async function tratarWebhook({
  method = 'POST',
  rawBody = '',
  assinatura = '',
  appSecret = '',
  verifyToken = '',
  query = {},
  config: configIn,
  estado = estadoVazio(),
  agoraMs = Date.now(),
  fetchImpl = null,
  token = '',
} = {}) {
  const config = { ...configPadrao(), ...configIn };
  if (method === 'GET') {
    const modo = query['hub.mode'];
    const desafio = query['hub.challenge'];
    const tokenQuery = query['hub.verify_token'];
    const desafioOk = typeof desafio === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(desafio);
    const confere = await igualConstante(typeof tokenQuery === 'string' ? tokenQuery : '', verifyToken);
    if (modo === 'subscribe' && desafioOk && verifyToken && confere) {
      return { status: 200, corpo: desafio, texto: true };
    }
    return resposta({ ok: false, motivo: 'verificacao_recusada' }, 403);
  }
  if (method !== 'POST') return resposta({ ok: false, motivo: 'metodo' }, 405);
  if (typeof rawBody !== 'string' || rawBody.length === 0 || rawBody.length > 256_000) {
    return resposta({ ok: false, motivo: 'corpo' }, 413);
  }
  const assinaturaOk = await verificarAssinaturaMeta(rawBody, assinatura, appSecret);
  if (!assinaturaOk) return resposta({ ok: false, motivo: 'assinatura' }, 403);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return resposta({ ok: false, motivo: 'json' }, 400);
  }
  const eventos = lerEventos(payload);
  const motivos = {};
  let enviou = 0;
  let status = 200;
  for (const evento of eventos) {
    const decisao = evento.tipo === 'comentario'
      ? await avaliarComentario(evento, estado, config, agoraMs)
      : await avaliarMensagem(evento, estado, config, agoraMs);
    if (decisao.optout && decisao.autorHash) estado.optout.add(decisao.autorHash);
    if (decisao.efeito === 'oficio' && decisao.autorHash && decisao.oficio) {
      const conversa = estado.conversas.get(decisao.autorHash) ?? {};
      conversa.oficio = decisao.oficio;
      estado.conversas.set(decisao.autorHash, conversa);
    }
    if (!decisao.enviar) {
      motivos[decisao.motivo] = (motivos[decisao.motivo] ?? 0) + 1;
      continue;
    }
    if (typeof fetchImpl !== 'function') {
      motivos.sem_transporte = (motivos.sem_transporte ?? 0) + 1;
      status = 503;
      continue;
    }
    const pedido = montarPedido({
      host: config.host,
      versao: config.versao,
      igId: config.igId,
      destino: decisao.destino,
      texto: decisao.texto,
      token,
    });
    if (!pedido || pedido.url.includes(token)) {
      motivos.pedido_invalido = (motivos.pedido_invalido ?? 0) + 1;
      status = 503;
      continue;
    }
    let http;
    try {
      http = await fetchImpl(pedido.url, pedido.init);
    } catch {
      motivos.falha_rede = (motivos.falha_rede ?? 0) + 1;
      status = 500;
      continue;
    }
    if (!http || http.status < 200 || http.status >= 300) {
      motivos.recusa_meta = (motivos.recusa_meta ?? 0) + 1;
      status = 500;
      continue;
    }
    aplicarEstado(estado, decisao, agoraMs);
    enviou += 1;
    motivos[decisao.motivo] = (motivos[decisao.motivo] ?? 0) + 1;
  }
  if (eventos.length === 0) motivos.sem_evento = 1;
  return resposta({ ok: status === 200, enviou, lidos: eventos.length, motivos }, status);
}
