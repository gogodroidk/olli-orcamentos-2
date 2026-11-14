// Busca uma URL por vez, com robots.txt e teto. 404 de robots libera. Falha de robots barra o host.
import { urlPublica } from './fontes.mjs';
import { parseRobots, permitido } from './robots.mjs';
import { criarRitmo } from './ritmo.mjs';

export const UA = 'OLLILeadsAuto/1.0 (+https://olliorcamentos.online/contato; coleta semanal de telefone comercial publico; uma pagina por vez)';
const MAX_CORPO = 1_200_000;

async function lerCorpo(res) {
  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const partes = [];
    let total = 0;
    while (total < MAX_CORPO) {
      const { done, value } = await reader.read();
      if (done) break;
      partes.push(Buffer.from(value));
      total += value.byteLength;
    }
    try { await reader.cancel(); } catch { /* já fechado */ }
    return Buffer.concat(partes).subarray(0, MAX_CORPO).toString('utf8');
  }
  if (typeof res?.text === 'function') return String(await res.text()).slice(0, MAX_CORPO);
  return '';
}

export function criarCliente({
  fetchImpl = globalThis.fetch,
  intervaloMs = 2500,
  orcamento = 100,
  ua = UA,
  esperar,
  agora,
} = {}) {
  const ritmo = criarRitmo({ intervaloMs, esperar, agora });
  const cache = new Map();
  let usados = 0;

  async function cru(url, extraMs = 0) {
    if (usados >= orcamento) return { ok: false, motivo: 'orcamento', status: 0, body: '', finalUrl: url };
    await ritmo.vez(extraMs);
    if (usados >= orcamento) return { ok: false, motivo: 'orcamento', status: 0, body: '', finalUrl: url };
    usados += 1;
    let res;
    try {
      res = await fetchImpl(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return { ok: false, motivo: 'site_indisponivel', status: 0, body: '', finalUrl: url };
    }
    const body = await lerCorpo(res);
    const status = res.status;
    const finalUrl = res.url || url;
    const tipo = typeof res.headers?.get === 'function' ? (res.headers.get('content-type') || '') : '';
    if (status === 404) return { ok: false, motivo: 'nao_achou', status, body, finalUrl, tipo };
    if (status === 403 || status === 429) return { ok: false, motivo: 'site_bloqueou', status, body: '', finalUrl, tipo };
    if (status < 200 || status >= 300) return { ok: false, motivo: 'site_indisponivel', status, body: '', finalUrl, tipo };
    return { ok: true, motivo: '', status, body, finalUrl, tipo };
  }

  async function gruposDe(origin) {
    if (cache.has(origin)) return cache.get(origin);
    const resposta = await cru(`${origin}/robots.txt`);
    let registro;
    if (resposta.status === 404) registro = { grupos: [] };
    else if (!resposta.ok) registro = { negado: resposta.motivo || 'robots_indisponivel' };
    else registro = { grupos: parseRobots(resposta.body) };
    cache.set(origin, registro);
    return registro;
  }

  async function texto(url) {
    if (!urlPublica(url)) return { ok: false, motivo: 'url_proibida', status: 0, body: '', finalUrl: url };
    const u = new URL(url);
    const registro = await gruposDe(u.origin);
    if (registro.negado) return { ok: false, motivo: 'robots_indisponivel', status: 0, body: '', finalUrl: url };
    const regra = permitido(registro.grupos, u.pathname || '/', ua);
    if (!regra.ok) return { ok: false, motivo: 'robots', status: 0, body: '', finalUrl: url };
    if (regra.atrasoSeg > 15) return { ok: false, motivo: 'robots_lento', status: 0, body: '', finalUrl: url };
    const resposta = await cru(url, regra.atrasoSeg > 0 ? regra.atrasoSeg * 1000 : 0);
    if (!resposta.ok) return resposta;
    if (!urlPublica(resposta.finalUrl || url)) {
      return { ok: false, motivo: 'url_proibida', status: resposta.status, body: '', finalUrl: resposta.finalUrl || url };
    }
    let final;
    try { final = new URL(resposta.finalUrl); } catch { return resposta; }
    if (final.origin !== u.origin) {
      const outro = await gruposDe(final.origin);
      if (outro.negado) return { ok: false, motivo: 'robots_indisponivel', status: resposta.status, body: '', finalUrl: resposta.finalUrl };
      const regraFinal = permitido(outro.grupos, final.pathname || '/', ua);
      if (!regraFinal.ok) return { ok: false, motivo: 'robots', status: resposta.status, body: '', finalUrl: resposta.finalUrl };
    }
    const tipo = resposta.tipo || '';
    if (tipo && !/html|xml|text\/plain/i.test(tipo)) return { ok: false, motivo: 'nao_html', status: resposta.status, body: '', finalUrl: resposta.finalUrl };
    return resposta;
  }

  return {
    texto,
    usados: () => usados,
    restante: () => Math.max(0, orcamento - usados),
  };
}
