// Backend FALSO em memória (Supabase GoTrue + PostgREST + worker de pagamentos) via context.route.
// Nada sai da máquina: o painel de teste é buildado com VITE_SUPABASE_URL=https://sb.e2e.test.
// PostgREST mínimo: eq/neq/is/in/gte/lte/gt/lt/not.*, order, limit, range, single, count/head.
export const SB = 'https://sb.e2e.test';
export const WORKER = 'https://worker.e2e.test';
export const LINK = 'https://link.e2e.test';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const uid = () => crypto.randomUUID();
function jwt(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.assinatura`;
}

export function criarBackend({ pixLigado = true, pixPagoDepois = 2 } = {}) {
  const db = { users: [], tabelas: {}, pixConsultas: 0, pixCriados: [], eventos: [] };
  const tab = (n) => (db.tabelas[n] ??= []);
  const naoMockados = [];

  const userJson = (u) => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.criado, phone: '', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: u.meta ?? {}, identities: [], created_at: u.criado, updated_at: u.criado,
  });
  const sessaoDe = (u) => ({
    access_token: jwt(u), refresh_token: uid(), token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: userJson(u),
  });
  const usuarioDoToken = (req) => {
    const t = (req.headers().authorization ?? '').replace(/^Bearer /i, '');
    try {
      const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
      return db.users.find((u) => u.id === p.sub) ?? null;
    } catch { return null; }
  };

  function filtrar(linhas, params) {
    let r = linhas;
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const m = /^(not\.)?([a-z]+)\.(.*)$/.exec(v);
      if (!m) continue;
      const [, neg, op, val] = m;
      const f = (x) => {
        const c = x[k];
        switch (op) {
          case 'eq': return String(c) === val;
          case 'neq': return String(c) !== val;
          case 'is': return val === 'null' ? c == null : String(c) === val;
          case 'in': return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(c));
          case 'gte': return c >= val;
          case 'lte': return c <= val;
          case 'gt': return c > val;
          case 'lt': return c < val;
          default: return true;
        }
      };
      r = r.filter((x) => (neg ? !f(x) : f(x)));
    }
    const ord = params.get('order');
    if (ord) {
      for (const p of ord.split(',').reverse()) {
        const [col, dir] = p.split('.');
        const s = dir === 'desc' ? -1 : 1;
        r = [...r].sort((a, b) => (a[col] > b[col] ? s : a[col] < b[col] ? -s : 0));
      }
    }
    return r;
  }

  const json = (route, status, body, headers = {}) => route.fulfill({
    status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  });

  function rpc(route, req, nome) {
    const args = JSON.parse(req.postData() || '{}');
    db.eventos.push({ tipo: 'rpc', nome, args });
    switch (nome) {
      case 'registrar_atividade_usuario': return json(route, 200, null);
      case 'reservar_envio_orcamento_gratis': return json(route, 200, { permitido: true, motivo: 'dentro_da_cota', plano_efetivo: 'gratis', contabilizado_agora: false, requer_confirmacao: true, reserva_token: uid(), trial_elegivel: false });
      case 'confirmar_envio_orcamento_gratis': return json(route, 200, true);
      case 'cancelar_reserva_envio_orcamento_gratis': return json(route, 200, { ok: true });
      case 'meu_estado_oferta_comercial': return json(route, 200, null);
      default: naoMockados.push(`RPC ${nome}`); return json(route, 200, null);
    }
  }

  function rest(route, req, url) {
    const nome = url.pathname.replace('/rest/v1/', '');
    const m = req.method();
    if (m === 'OPTIONS') return json(route, 204);
    if (nome.startsWith('rpc/')) return rpc(route, req, nome.slice(4));
    const user = usuarioDoToken(req);
    const unico = (req.headers().accept ?? '').includes('vnd.pgrst.object');
    const prefer = req.headers().prefer ?? '';
    const retorna = prefer.includes('return=representation');
    // O RLS real limita por user_id; o mock imita o essencial.
    const meus = (l) => (user ? l.filter((x) => !('user_id' in x) || x.user_id === user.id) : []);
    if (m === 'GET' || m === 'HEAD') {
      let linhas = filtrar(meus(tab(nome)), url.searchParams);
      const total = linhas.length;
      const rg = /(\d+)-(\d+)/.exec(req.headers().range ?? '');
      if (rg) linhas = linhas.slice(Number(rg[1]), Number(rg[2]) + 1);
      const lim = url.searchParams.get('limit');
      if (lim) linhas = linhas.slice(0, Number(lim));
      const h = { 'content-range': `0-${Math.max(0, linhas.length - 1)}/${total}` };
      if (m === 'HEAD') return json(route, 200, undefined, h);
      if (unico) {
        return linhas.length === 1 ? json(route, 200, linhas[0], h)
          : json(route, 406, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null });
      }
      return json(route, 200, linhas, h);
    }
    if (m === 'POST') {
      const corpo = JSON.parse(req.postData() || '[]');
      const arr = Array.isArray(corpo) ? corpo : [corpo];
      const novos = [];
      for (const l of arr) {
        const agora = new Date().toISOString();
        const linha = { id: l.id ?? uid(), criado_em: agora, atualizado_em: agora, ...(user && !('user_id' in l) && nome !== 'auth_funil_eventos' ? { user_id: user.id } : {}), ...l };
        if (nome === 'orcamentos_publicos' && tab(nome).some((x) => x.token === linha.token)) {
          return json(route, 409, { code: '23505', message: 'duplicate key', details: null, hint: null });
        }
        if (prefer.includes('resolution=merge-duplicates')) {
          const chave = url.searchParams.get('on_conflict') || 'id';
          const i = tab(nome).findIndex((x) => x[chave] !== undefined && x[chave] === linha[chave]);
          if (i >= 0) { tab(nome)[i] = { ...tab(nome)[i], ...linha }; novos.push(tab(nome)[i]); continue; }
        }
        tab(nome).push(linha);
        novos.push(linha);
      }
      db.eventos.push({ tipo: 'insert', tabela: nome, linhas: novos });
      return retorna ? json(route, 201, unico ? novos[0] : novos) : json(route, 201, undefined);
    }
    if (m === 'PATCH') {
      const alvo = filtrar(meus(tab(nome)), url.searchParams);
      const patch = JSON.parse(req.postData() || '{}');
      for (const l of alvo) Object.assign(l, patch, { atualizado_em: new Date().toISOString() });
      db.eventos.push({ tipo: 'update', tabela: nome, patch, n: alvo.length });
      return retorna ? json(route, 200, unico ? alvo[0] : alvo) : json(route, 204);
    }
    if (m === 'DELETE') {
      const alvo = new Set(filtrar(meus(tab(nome)), url.searchParams));
      db.tabelas[nome] = tab(nome).filter((x) => !alvo.has(x));
      return json(route, 204);
    }
    return json(route, 405, { message: 'metodo' });
  }

  function auth(route, req, url) {
    const caminho = url.pathname.replace('/auth/v1', '');
    const m = req.method();
    if (m === 'OPTIONS') return json(route, 204);
    const corpo = () => JSON.parse(req.postData() || '{}');
    if (caminho === '/signup' && m === 'POST') {
      const c = corpo();
      if (db.users.some((u) => u.email === c.email)) return json(route, 422, { code: 'user_already_exists', msg: 'User already registered' });
      const u = { id: uid(), email: c.email, senha: c.password, meta: c.data ?? {}, criado: new Date().toISOString() };
      db.users.push(u);
      db.eventos.push({ tipo: 'signup', email: u.email, meta: u.meta });
      return json(route, 200, sessaoDe(u));
    }
    if (caminho === '/token' && m === 'POST') {
      const c = corpo();
      const g = url.searchParams.get('grant_type');
      if (g === 'password') {
        const u = db.users.find((x) => x.email === c.email && x.senha === c.password);
        return u ? json(route, 200, sessaoDe(u))
          : json(route, 400, { code: 'invalid_credentials', msg: 'Invalid login credentials', error_description: 'Invalid login credentials' });
      }
      if (g === 'refresh_token') {
        const u = db.users[db.users.length - 1];
        return u ? json(route, 200, sessaoDe(u)) : json(route, 400, { code: 'refresh_token_not_found', msg: 'x' });
      }
    }
    if (caminho === '/user') {
      const u = usuarioDoToken(req);
      return u ? json(route, 200, userJson(u)) : json(route, 401, { code: 'bad_jwt', msg: 'invalid' });
    }
    if (caminho === '/logout') return json(route, 204);
    naoMockados.push(`AUTH ${m} ${caminho}`);
    return json(route, 404, { msg: 'nao mockado' });
  }

  function worker(route, req, url) {
    const p = url.pathname;
    const m = req.method();
    if (m === 'OPTIONS') return json(route, 204);
    if (p === '/abacate/config') return json(route, 200, { ok: true, pix: pixLigado, modo: 'dev' });
    if (p === '/abacate/plano/pix' && m === 'POST') {
      if (!usuarioDoToken(req)) return json(route, 401, { ok: false, erro: 'nao_autorizado' });
      const c = JSON.parse(req.postData() || '{}');
      const id = `pix_char_${uid().slice(0, 8)}`;
      db.pixCriados.push({ id, plano: c.plano });
      return json(route, 200, {
        ok: true, id, brCode: '00020126E2E-FALSO-NAO-PAGAVEL',
        brCodeBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        status: 'PENDING', expiresAt: new Date(Date.now() + 3600e3).toISOString(),
        plano: { id: c.plano, nome: 'Pro', meses: 1, valor: 4990 },
      });
    }
    if (p === '/abacate/status') {
      db.pixConsultas += 1;
      const pago = db.pixConsultas > pixPagoDepois;
      return json(route, 200, { ok: true, pago, liberado: pago });
    }
    naoMockados.push(`WORKER ${m} ${p}`);
    return json(route, 200, { ok: true });
  }

  async function instalar(context) {
    // Terceiros (analytics, Sentry, fontes, pixel): nada de rede externa em teste. Registrado PRIMEIRO,
    // o mock abaixo (registrado depois) tem prioridade nos hosts .e2e.test.
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
    await context.route(/^https:\/\/(sb|worker|link)\.e2e\.test\//, (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.host === 'sb.e2e.test') return url.pathname.startsWith('/auth/') ? auth(route, req, url) : rest(route, req, url);
      if (url.host === 'worker.e2e.test') return worker(route, req, url);
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>link do cliente (mock)</title>' });
    });
  }

  return { db, tab, instalar, naoMockados };
}
