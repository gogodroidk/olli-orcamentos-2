import { handleAdmin } from '../worker/src/admin.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ALVO = '22222222-2222-4222-8222-222222222222';
const ORIGEM = 'https://api.exemplo';

function token(aal: 'aal1' | 'aal2') {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal, sub: ADMIN_ID })}.x`;
}

const env: any = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: 'admin@exemplo.com',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};

// Estado do "Supabase" falso.
let refreshResposta: { status: number; body: any } = { status: 200, body: {} };
let aparelhoValido = false;
let aparelhosFalham = false;
let saldo = 10;
const inserts: Array<{ url: string; body: any }> = [];
const ledger: any[] = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const metodo = (init?.method || 'GET').toUpperCase();
  if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
    return new Response(JSON.stringify(refreshResposta.body), { status: refreshResposta.status });
  }
  if (url.endsWith('/auth/v1/user')) {
    return new Response(JSON.stringify({ id: ADMIN_ID, email: 'admin@exemplo.com' }), { status: 200 });
  }
  if (url.includes('/rest/v1/admin_trusted_devices')) {
    if (aparelhosFalham) return new Response('{}', { status: 500 });
    if (metodo === 'POST') {
      inserts.push({ url, body: JSON.parse(String(init?.body || '{}')) });
      return new Response(JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333' }]), { status: 201 });
    }
    if (metodo === 'PATCH') return new Response(null, { status: 204 });
    return new Response(JSON.stringify(aparelhoValido ? [{ id: '33333333-3333-4333-8333-333333333333', expira_em: '2099-01-01T00:00:00Z' }] : []), { status: 200 });
  }
  if (url.endsWith('/rest/v1/rpc/saldo_creditos')) return new Response(JSON.stringify(saldo), { status: 200 });
  if (url.endsWith('/rest/v1/credit_ledger')) {
    ledger.push(JSON.parse(String(init?.body || '{}')));
    return new Response(null, { status: 201 });
  }
  if (url.includes('/rest/v1/admin_audit_log')) return new Response(null, { status: 201 });
  if (url.includes('/auth/v1/admin/users?')) return new Response(JSON.stringify({ users: [] }), { status: 200 });
  return new Response(JSON.stringify([]), { status: 200 });
}) as typeof fetch;

function req(path: string, { method = 'GET', aal, cookie, origem = true, body }: { method?: string; aal?: 'aal1' | 'aal2'; cookie?: string; origem?: boolean; body?: any } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (aal) headers.Authorization = `Bearer ${token(aal)}`;
  if (cookie) headers.Cookie = cookie;
  if (origem) headers.Origin = ORIGEM;
  const url = new URL(`${ORIGEM}/admin/api/${path}`);
  return handleAdmin(new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, url);
}

console.log('\nAdmin OLLI — sessão por cookie, aparelho confiável e ferramentas');

try {
  // ── sessão ──
  const semOrigem = await req('sessao', { method: 'POST', origem: false, body: { refresh_token: 'r1' } });
  checar('iniciar sessão sem Origin do painel é recusado', semOrigem.status === 403);

  refreshResposta = { status: 200, body: { access_token: token('aal2'), refresh_token: 'r2-novo', expires_in: 3600 } };
  const inicio = await req('sessao', { method: 'POST', body: { refresh_token: 'r1' } });
  const ck = inicio.headers.get('set-cookie') || '';
  const corpo: any = await inicio.json();
  checar('iniciar sessão devolve access token', inicio.status === 200 && typeof corpo.access_token === 'string');
  checar('refresh token NÃO vai no corpo', !JSON.stringify(corpo).includes('r2-novo'));
  checar('cookie de sessão é HttpOnly, Secure, Strict, Path=/admin', /__Secure-olli_adm_s=r2-novo/.test(ck) && /HttpOnly/.test(ck) && /Secure/.test(ck) && /SameSite=Strict/.test(ck) && /Path=\/admin/.test(ck));

  const semCookie = await req('sessao/renovar', { method: 'POST' });
  checar('renovar sem cookie = 401', semCookie.status === 401);

  refreshResposta = { status: 400, body: { error: 'invalid_grant' } };
  const morto = await req('sessao/renovar', { method: 'POST', cookie: '__Secure-olli_adm_s=velho' });
  checar('refresh morto = 401 e apaga o cookie', morto.status === 401 && /Max-Age=0/.test(morto.headers.get('set-cookie') || ''));

  refreshResposta = { status: 500, body: {} };
  const fora = await req('sessao/renovar', { method: 'POST', cookie: '__Secure-olli_adm_s=bom' });
  checar('Supabase fora = 503 e NÃO apaga o cookie (não sei ≠ sessão morta)', fora.status === 503 && !fora.headers.get('set-cookie'));

  refreshResposta = { status: 200, body: { access_token: token('aal2'), refresh_token: 'r3', expires_in: 3600 } };
  const renovou = await req('sessao/renovar', { method: 'POST', cookie: '__Secure-olli_adm_s=bom' });
  checar('renovar com cookie válido gira o refresh', renovou.status === 200 && /__Secure-olli_adm_s=r3/.test(renovou.headers.get('set-cookie') || ''));

  const saida = await req('sessao/sair', { method: 'POST', aal: 'aal2', body: { esquecerAparelho: true }, cookie: '__Secure-olli_adm_d=' + 'x'.repeat(43) });
  const ckSaida = saida.headers.get('set-cookie') || '';
  checar('sair apaga sessão e, se pedido, o aparelho', saida.status === 200 && /olli_adm_s=;/.test(ckSaida) && /olli_adm_d=;/.test(ckSaida));

  // ── aparelho confiável ──
  const semAparelho = await req('metrics', { aal: 'aal1' });
  const semAparelhoBody: any = await semAparelho.json();
  checar('senha sem aparelho confiável continua pedindo código', semAparelho.status === 403 && semAparelhoBody.erro === 'mfa_necessario');

  aparelhoValido = true;
  const comAparelho = await req('metrics', { aal: 'aal1', cookie: '__Secure-olli_adm_d=' + 'a'.repeat(43) });
  checar('senha + aparelho confiável abre o painel', comAparelho.status === 200);

  const me: any = await (await req('me', { aal: 'aal1', cookie: '__Secure-olli_adm_d=' + 'a'.repeat(43) })).json();
  checar('/me informa que entrou por aparelho', me.user && me.user.aalVia === 'aparelho' && me.user.aal === 'aal2');

  const excluir = await req(`user/delete?id=${ALVO}`, { method: 'POST', aal: 'aal1', cookie: '__Secure-olli_adm_d=' + 'a'.repeat(43), body: { motivo: 'teste', confirmacao: 'EXCLUIR' } });
  const excluirBody: any = await excluir.json();
  checar('excluir conta exige código desta sessão (não aceita só o aparelho)', excluir.status === 403 && excluirBody.erro === 'mfa_recente_necessario');

  const confiarComAparelho = await req('aparelho/confiar', { method: 'POST', aal: 'aal1', cookie: '__Secure-olli_adm_d=' + 'a'.repeat(43) });
  checar('não dá para lembrar aparelho novo usando só outro aparelho', confiarComAparelho.status === 403);

  aparelhoValido = false;
  aparelhosFalham = true;
  const bancoFora = await req('metrics', { aal: 'aal1', cookie: '__Secure-olli_adm_d=' + 'a'.repeat(43) });
  checar('tabela de aparelhos fora = pede código (falha fechado)', bancoFora.status === 403);
  aparelhosFalham = false;

  const confiar = await req('aparelho/confiar', { method: 'POST', aal: 'aal2' });
  const ckAp = confiar.headers.get('set-cookie') || '';
  const valorCookie = (ckAp.match(/__Secure-olli_adm_d=([^;]+)/) || [])[1] || '';
  checar('código confirmado lembra o aparelho com cookie HttpOnly de 30 dias', confiar.status === 200 && /HttpOnly/.test(ckAp) && /Max-Age=2592000/.test(ckAp) && valorCookie.length >= 40);
  checar('banco guarda só o hash do token, nunca o token', inserts.length === 1 && /^[0-9a-f]{64}$/.test(inserts[0].body.token_hash) && !JSON.stringify(inserts[0].body).includes(valorCookie));

  // ── créditos ──
  saldo = 10;
  const remover = await req(`user/creditos?id=${ALVO}`, { method: 'POST', aal: 'aal2', body: { delta: -50, motivo: 'estorno de teste', requestId: 'request-credito-0001' } });
  checar('remover além do saldo é recusado', remover.status === 409 && ledger.length === 0);

  const adicionar = await req(`user/creditos?id=${ALVO}`, { method: 'POST', aal: 'aal2', body: { delta: 25, motivo: 'cortesia de teste', requestId: 'request-credito-0002' } });
  const adicionarBody: any = await adicionar.json();
  checar('adicionar créditos lança ajuste idempotente no livro-razão', adicionar.status === 200 && adicionarBody.saldo === 35 && ledger[0]?.origem === 'ajuste' && ledger[0]?.ref === 'admin:request-credito-0002' && ledger[0]?.delta === 25);

  const semMotivo = await req(`user/creditos?id=${ALVO}`, { method: 'POST', aal: 'aal2', body: { delta: 5 } });
  checar('créditos sem motivo = 400', semMotivo.status === 400);

  const creditosAal1 = await req(`user/creditos?id=${ALVO}`, { method: 'POST', aal: 'aal1', body: { delta: 5, motivo: 'teste' } });
  checar('créditos com só senha (sem aparelho) = 403', creditosAal1.status === 403);

  const cnpj = await req('cnpj?cnpj=123', { aal: 'aal2' });
  checar('CNPJ inválido = 400 sem consultar fora', cnpj.status === 400);
} finally {
  globalThis.fetch = originalFetch;
}

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
