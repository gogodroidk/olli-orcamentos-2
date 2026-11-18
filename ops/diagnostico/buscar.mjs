// Uma página pública por empresa. Sem login, sem Google Maps, com pausa entre pedidos.

export const UA = 'OLLIDiagnostico/1.0 (+https://olliorcamentos.online/contato; confere uma pagina publica por empresa; sem login)';

export function normalizarSite(valor) {
  let s = String(valor || '').trim();
  if (!s || s === '-' || /^sem site$/i.test(s)) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

export function motivoUrl(valor) {
  let u;
  try { u = new URL(valor); } catch { return 'url_invalida'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'url_proibida';
  if (u.username || u.password) return 'url_proibida';
  const host = u.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'url_proibida';
  if (ipPrivado(host)) return 'url_proibida';
  if (host === 'maps.app.goo.gl' || host.endsWith('.g.page') || host === 'goo.gl' || host === 'g.page') return 'maps';
  if (/(^|\.)google\.[a-z.]+$/.test(host) && /\/maps/i.test(u.pathname + u.search)) return 'maps';
  if (/(^|\.)maps\.google\.[a-z.]+$/.test(host)) return 'maps';
  if (/(^|\.)(instagram|facebook|fb|tiktok|twitter|linkedin|youtube|youtu)\.com$/.test(host)) return 'rede_social';
  if (host === 'wa.me' || host.endsWith('.whatsapp.com')) return 'rede_social';
  return '';
}

export function robotsPermite(texto, caminho, ua) {
  const grupos = [];
  let atual = null;
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const linha = bruta.replace(/#.*$/, '').trim();
    if (!linha) continue;
    const m = linha.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const chave = m[1].trim().toLowerCase();
    const valor = m[2].trim();
    if (chave === 'user-agent') {
      if (!atual || atual.fechado) {
        atual = { agents: [], disallow: [], allow: [], atraso: 0, fechado: false };
        grupos.push(atual);
      }
      if (valor) atual.agents.push(valor.toLowerCase());
      continue;
    }
    if (!atual) continue;
    atual.fechado = true;
    if (chave === 'disallow' && valor) atual.disallow.push(valor);
    else if (chave === 'allow' && valor) atual.allow.push(valor);
    else if (chave === 'crawl-delay') {
      const n = Number(valor);
      if (Number.isFinite(n) && n > atual.atraso) atual.atraso = n;
    }
  }
  const uaL = String(ua || '').toLowerCase();
  const especifico = grupos.filter((g) => g.agents.some((a) => a !== '*' && uaL.includes(a)));
  const estrela = grupos.filter((g) => g.agents.includes('*'));
  const grupo = (especifico.length ? especifico : estrela).at(-1);
  if (!grupo) return { ok: true, atrasoSeg: 0 };
  if (grupo.atraso > 15) return { ok: false, atrasoSeg: grupo.atraso, lento: true };
  const path = caminho.startsWith('/') ? caminho : `/${caminho}`;
  let melhor = { tipo: 'permite', tam: -1 };
  const considerar = (regras, tipo) => {
    for (const regra of regras) {
      if (!path.startsWith(regra)) continue;
      if (regra.length > melhor.tam || (regra.length === melhor.tam && tipo === 'permite')) {
        melhor = { tipo, tam: regra.length };
      }
    }
  };
  considerar(grupo.allow, 'permite');
  considerar(grupo.disallow, 'nega');
  if (melhor.tipo === 'nega') return { ok: false, atrasoSeg: grupo.atraso };
  return { ok: true, atrasoSeg: grupo.atraso };
}

export function criarBusca({
  fetchImpl = globalThis.fetch,
  intervaloMs = 2500,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
  aleatorio = Math.random,
  orcamento = 80,
  ua = UA,
  maxCorpo = 400_000,
} = {}) {
  let usados = 0;
  let primeira = true;

  async function pausa(extraMs = 0) {
    if (primeira) {
      primeira = false;
      if (extraMs > 0) await esperar(extraMs);
      return;
    }
    const jitter = Math.floor(Math.max(0, aleatorio()) * 1500);
    await esperar(intervaloMs + jitter + extraMs);
  }

  async function cru(url, extraMs = 0) {
    if (usados >= orcamento) return { ok: false, motivo: 'orcamento', status: 0, body: '', finalUrl: url, tipo: '' };
    const bloqueio = motivoUrl(url);
    if (bloqueio) return { ok: false, motivo: bloqueio, status: 0, body: '', finalUrl: url, tipo: '' };
    await pausa(extraMs);
    if (usados >= orcamento) return { ok: false, motivo: 'orcamento', status: 0, body: '', finalUrl: url, tipo: '' };
    usados += 1;
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      return { ok: false, motivo: 'nao_abre', status: 0, body: '', finalUrl: url, tipo: '' };
    }
    const finalUrl = res.url || url;
    const depois = motivoUrl(finalUrl);
    const tipo = typeof res.headers?.get === 'function' ? (res.headers.get('content-type') || '') : '';
    const status = Number(res.status) || 0;
    if (depois === 'url_proibida' || depois === 'maps' || depois === 'rede_social') {
      await descartar(res);
      return { ok: false, motivo: depois, status, body: '', finalUrl, tipo };
    }
    const body = await lerCorpo(res, maxCorpo);
    if (status === 404) return { ok: false, motivo: 'nao_achou', status, body, finalUrl, tipo };
    if (status === 401 || status === 403 || status === 429) {
      return { ok: false, motivo: 'bloqueou', status, body: '', finalUrl, tipo };
    }
    if (status < 200 || status >= 400) return { ok: false, motivo: 'nao_abre', status, body: '', finalUrl, tipo };
    return { ok: true, motivo: '', status, body, finalUrl, tipo };
  }

  async function pagina(site) {
    const url = normalizarSite(site);
    if (!url) return { motivo: 'sem_site', status: 0, finalUrl: '', html: '', site: '' };
    const bloqueio = motivoUrl(url);
    if (bloqueio) return { motivo: bloqueio, status: 0, finalUrl: url, html: '', site: url };
    const origem = new URL(url);
    const robots = await cru(`${origem.origin}/robots.txt`);
    if (robots.motivo === 'orcamento') return { motivo: 'orcamento', status: 0, finalUrl: url, html: '', site: url };
    if (robots.motivo === 'bloqueou') {
      return { motivo: 'robots_indisponivel', status: robots.status, finalUrl: url, html: '', site: url };
    }
    let extra = 0;
    if (robots.ok) {
      const regra = robotsPermite(robots.body, `${origem.pathname || '/'}${origem.search || ''}`, ua);
      if (!regra.ok) {
        return { motivo: regra.lento ? 'robots_lento' : 'robots', status: robots.status, finalUrl: url, html: '', site: url };
      }
      if (regra.atrasoSeg > 0) extra = regra.atrasoSeg * 1000;
    }
    const resposta = await cru(url, extra);
    if (!resposta.ok) {
      const motivo = resposta.motivo === 'nao_achou' ? 'nao_achou' : (resposta.motivo || 'nao_abre');
      return { motivo, status: resposta.status, finalUrl: resposta.finalUrl || url, html: '', site: url };
    }
    const finalUrl = resposta.finalUrl || url;
    if (ehLogin(finalUrl)) {
      return { motivo: '', login: true, status: resposta.status, finalUrl, html: '', site: url };
    }
    const html = resposta.body || '';
    if (ehDesafio(html)) {
      return { motivo: 'bloqueou', status: resposta.status, finalUrl, html: '', site: url };
    }
    const tipo = resposta.tipo || '';
    const pareceHtml = !tipo || /html|xml|text\/plain/i.test(tipo) || /<!doctype|<html|<head|<body/i.test(html.slice(0, 800));
    if (!pareceHtml) {
      return { motivo: '', naoHtml: true, status: resposta.status, finalUrl, html: '', site: url };
    }
    return { motivo: '', status: resposta.status, finalUrl, html, site: url };
  }

  return { pagina, usados: () => usados };
}

function ehLogin(url) {
  try {
    const u = new URL(url);
    return /\/(wp-login\.php|wp-admin|login|signin|sign-in|auth)(\/|$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

function ehDesafio(html) {
  return /cf-browser-verification|cdn-cgi\/challenge|Attention Required! \| Cloudflare|Just a moment\.\.\./i.test(String(html).slice(0, 2500));
}

function ipPrivado(host) {
  const limpo = host.replace(/^\[|\]$/g, '');
  if (limpo === '::1' || limpo.startsWith('fe80:') || limpo.startsWith('fc') || limpo.startsWith('fd')) return true;
  const m = limpo.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const n = m.slice(1).map(Number);
  if (n.some((x) => x > 255)) return false;
  const [a, b] = n;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function descartar(res) {
  try {
    if (typeof res?.body?.cancel === 'function') await res.body.cancel();
  } catch { /* corpo já fechado */ }
}

async function lerCorpo(res, max) {
  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const partes = [];
    let total = 0;
    while (total < max) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      partes.push(buf);
      total += buf.length;
    }
    try { await reader.cancel(); } catch { /* já fechado */ }
    return Buffer.concat(partes).subarray(0, max).toString('utf8');
  }
  if (typeof res?.text === 'function') return String(await res.text()).slice(0, max);
  return '';
}
