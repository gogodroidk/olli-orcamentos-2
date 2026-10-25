/**
 * POST /servicos/pedido — pedido de diagnóstico grátis da página /servicos/.
 *
 * Público, sem login. Grava UMA linha em `servicos_pedidos` (service-role) para o
 * agente de serviços pesquisar, diagnosticar e propor. Preço NUNCA vem daqui: a
 * proposta é calculada depois, por regra (decisão do Igor, 22/10).
 *
 * Honestidade: só responde `ok` se a linha foi gravada. Banco fora = 503, a página
 * mostra o erro e o visitante sabe que não foi (nunca "enviado" de mentira).
 * LGPD: guarda o mínimo (negócio, cidade, dor, WhatsApp), exige o aceite e
 * grava quando e com qual texto de aviso foi dado.
 */
import { lerCorpoLimitado } from './bodyLimit.js';
import { cabeNoTeto } from './rateLimit.js';
import { numeroWhatsAppBR } from './telefoneWhatsapp.js';

export const AVISO_VERSAO = 'diagnostico-v2';
const MAX_BYTES = 4096;
const LIM = { negocio: 120, cidade: 80, dor: 600 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

const limpa = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Valida o corpo. Devolve `{ ok:true, linha }` ou `{ ok:false, erro }` (nunca lança). */
export function lerPedido(body) {
  if (!body || typeof body !== 'object') return { ok: false, erro: 'corpo_invalido' };
  // Isca anti-robô: campo invisível que humano não preenche.
  if (typeof body.site_web === 'string' && body.site_web.trim() !== '') return { ok: false, erro: 'corpo_invalido' };
  const negocio = limpa(body.negocio, LIM.negocio);
  const cidade = limpa(body.cidade, LIM.cidade);
  const dor = limpa(body.dor, LIM.dor);
  const numero = numeroWhatsAppBR(typeof body.whatsapp === 'string' ? body.whatsapp : '');
  if (!negocio) return { ok: false, erro: 'negocio_obrigatorio' };
  if (!cidade) return { ok: false, erro: 'cidade_obrigatoria' };
  if (!dor) return { ok: false, erro: 'dor_obrigatoria' };
  if (!numero) return { ok: false, erro: 'whatsapp_invalido' };
  if (body.aceite !== true) return { ok: false, erro: 'aceite_obrigatorio' };
  return { ok: true, linha: { negocio, cidade, dor, whatsapp: numero, aviso_versao: AVISO_VERSAO } };
}

export async function handlePedidoDiagnostico(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, erro: 'metodo_nao_suportado' }, 405);

  if (env.SINAL_RL) {
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    try {
      const { success } = await env.SINAL_RL.limit({ key: `pedido:${ip}` });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch {
      // limiter fora: segue (o corpo é pequeno e validado)
    }
  }

  // Limite ANTES de bufferizar: Content-Length mentiroso ou chunked não enchem a memória do Worker.
  if (!cabeNoTeto(request, MAX_BYTES).ok) return json({ ok: false, erro: 'payload_grande' }, 413);
  const lido0 = await lerCorpoLimitado(request, MAX_BYTES);
  if (lido0.grande) return json({ ok: false, erro: 'payload_grande' }, 413);
  let body = null;
  try {
    body = lido0.raw ? JSON.parse(lido0.raw) : null;
  } catch {
    body = null;
  }
  const lido = lerPedido(body);
  if (!lido.ok) return json({ ok: false, erro: lido.erro }, 400);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, erro: 'indisponivel' }, 503);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/servicos_pedidos`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(lido.linha),
    });
    if (!r.ok) return json({ ok: false, erro: 'indisponivel' }, 503);
  } catch {
    return json({ ok: false, erro: 'indisponivel' }, 503);
  }
  return json({ ok: true }, 201);
}
