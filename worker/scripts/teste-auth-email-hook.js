import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  AUTH_EMAIL_TIPOS_SUPORTADOS,
  NEXT_RECUPERACAO,
  chaveIdempotencia,
  configAuthEmail,
  handleAuthEmailHook,
  montarLinkConfirmacao,
  nextDoRedirect,
  planejarEnvios,
} from '../src/authEmailHook.js';
import { AUTH_EMAIL_TEMPLATES, renderizarEmailAuth } from '../src/authEmailTemplate.js';
import { STANDARD_WEBHOOK_CLOCK_SKEW_SECONDS, verificarStandardWebhook } from '../src/standardWebhooks.js';

// ── Fixtures (valores de teste; nenhum segredo real) ────────────────────────
const SECRET_BYTES = Buffer.from('send-email-hook-secret-test-only');
const SECRET = `v1,whsec_${SECRET_BYTES.toString('base64')}`;
const OUTRO_SECRET = `v1,whsec_${Buffer.from('outro-segredo-de-teste').toString('base64')}`;
const NOW_MS = Date.UTC(2026, 8, 30, 15, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const CONFIRM = 'https://app.olliorcamentos.online/auth/confirm';
const USER_ID = '6f1c2a0e-8a4b-4c1d-9e2f-0a1b2c3d4e5f';
const EMAIL = 'cliente.teste@example.com';
const NOVO_EMAIL = 'novo.teste@example.com';
const CODIGO = '482915';
const CODIGO_NOVO = '730264';
const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c';
const HASH_NOVO = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa998877665544';

function assinar(rawBody, { id = 'msg_auth_01', ts = String(NOW_S), bytes = SECRET_BYTES } = {}) {
  const sig = createHmac('sha256', bytes).update(`${id}.${ts}.${rawBody}`).digest('base64');
  return new Headers({ 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` });
}

function envBase(extra = {}) {
  return {
    SEND_EMAIL_HOOK_SECRET: SECRET,
    RESEND_API_KEY: 're_teste_nao_real_123456',
    WELCOME_FROM: 'OLLI Orçamentos <nao-responda@olliorcamentos.online>',
    WELCOME_REPLY_TO: 'contato@olliorcamentos.online',
    WELCOME_LOGO_URL: 'https://olliorcamentos.online/icon-192.png',
    WELCOME_SUPPORT_URL: 'https://olliorcamentos.online/ajuda/',
    AUTH_EMAIL_CONFIRM_URL: CONFIRM,
    AUTH_OTP_VALIDADE_MINUTOS: '10',
    AUTH_EMAIL_RL: { limit: async () => ({ success: true }) },
    ...extra,
  };
}

function payload(acao, dados = {}, user = {}) {
  return {
    user: { id: USER_ID, email: EMAIL, aud: 'authenticated', ...user },
    email_data: {
      token: CODIGO,
      token_hash: HASH,
      redirect_to: 'https://app.olliorcamentos.online/painel',
      email_action_type: acao,
      site_url: 'https://app.olliorcamentos.online',
      token_new: '',
      token_hash_new: '',
      ...dados,
    },
  };
}

function criarLog() {
  const linhas = [];
  return {
    linhas,
    log: {
      log: (...a) => linhas.push(a.map(String).join(' ')),
      error: (...a) => linhas.push(a.map(String).join(' ')),
    },
  };
}

function criarFetch(respostas = []) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init, body: JSON.parse(init.body) });
    const r = respostas.shift() || { status: 200, body: { id: `re_${chamadas.length}` } };
    return new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status });
  };
  return { chamadas, fetchImpl };
}

async function chamar(corpo, { env = envBase(), headers, respostas, metodo = 'POST' } = {}) {
  const raw = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  const req = new Request('https://diagnostico.olliorcamentos.online/auth/email-hook', {
    method: metodo,
    headers: headers || assinar(raw),
    body: metodo === 'POST' ? raw : undefined,
  });
  const { linhas, log } = criarLog();
  const { chamadas, fetchImpl } = criarFetch(respostas);
  const res = await handleAuthEmailHook(req, env, { fetchImpl, nowMs: NOW_MS, log });
  const json = await res.json();
  return { res, json, chamadas, linhas };
}

function semSegredosNoLog(linhas, extras = []) {
  const proibidos = [CODIGO, CODIGO_NOVO, HASH, HASH_NOVO, EMAIL, NOVO_EMAIL, 'token_hash=', 're_teste_nao_real', ...extras];
  for (const linha of linhas) {
    for (const p of proibidos) assert.equal(linha.includes(p), false, `log vazou "${p}": ${linha}`);
  }
}

// ── 1. Assinatura Standard Webhooks ─────────────────────────────────────────
{
  const raw = JSON.stringify(payload('signup'));
  assert.equal(await verificarStandardWebhook(raw, assinar(raw), SECRET, { nowMs: NOW_MS }), true, 'assinatura válida');
  assert.equal(
    await verificarStandardWebhook(raw, assinar(raw, { bytes: Buffer.from('errado') }), SECRET, { nowMs: NOW_MS }),
    false,
    'assinatura com outra chave',
  );
  assert.equal(await verificarStandardWebhook(`${raw} `, assinar(raw), SECRET, { nowMs: NOW_MS }), false, 'corpo adulterado');
  assert.equal(
    await verificarStandardWebhook(raw, assinar(raw), SECRET, { nowMs: NOW_MS + (STANDARD_WEBHOOK_CLOCK_SKEW_SECONDS + 1) * 1000 }),
    false,
    'expirada (replay)',
  );
  assert.equal(
    await verificarStandardWebhook(raw, assinar(raw, { ts: String(NOW_S + STANDARD_WEBHOOK_CLOCK_SKEW_SECONDS + 5) }), SECRET, { nowMs: NOW_MS }),
    false,
    'timestamp no futuro',
  );
  assert.equal(await verificarStandardWebhook(raw, new Headers(), SECRET, { nowMs: NOW_MS }), false, 'sem cabeçalhos');
  assert.equal(await verificarStandardWebhook(raw, assinar(raw), '', { nowMs: NOW_MS }), false, 'sem segredo');
  assert.equal(await verificarStandardWebhook(raw, assinar(raw), 'v1,whsec_%%%', { nowMs: NOW_MS }), false, 'segredo malformado');
  // Rotação: vários segredos separados por "|" (formato do hook_send_email_secrets).
  assert.equal(
    await verificarStandardWebhook(raw, assinar(raw), `${OUTRO_SECRET}|${SECRET}`, { nowMs: NOW_MS }),
    true,
    'rotação de segredo',
  );
  // Cabeçalhos svix-* não valem para o prefixo webhook-*.
  const svix = new Headers();
  for (const [k, v] of assinar(raw)) svix.set(k.replace('webhook-', 'svix-'), v);
  assert.equal(await verificarStandardWebhook(raw, svix, SECRET, { nowMs: NOW_MS }), false, 'prefixo errado');
  assert.equal(await verificarStandardWebhook(raw, svix, SECRET, { prefixo: 'svix', nowMs: NOW_MS }), true, 'prefixo svix');
}

// ── 2. Links do contrato e `next` ───────────────────────────────────────────
{
  assert.equal(
    montarLinkConfirmacao(CONFIRM, { tokenHash: HASH, tipoLink: 'recovery', next: NEXT_RECUPERACAO }),
    `${CONFIRM}?token_hash=${HASH}&type=recovery&next=%2Fauth%2Fnova-senha`,
  );
  assert.equal(montarLinkConfirmacao(CONFIRM, { tokenHash: HASH, tipoLink: 'signup', next: null }), `${CONFIRM}?token_hash=${HASH}&type=signup`);
  assert.equal(nextDoRedirect('https://app.olliorcamentos.online/painel?aba=1', CONFIRM), '/painel?aba=1');
  assert.equal(nextDoRedirect('https://evil.example.com/painel', CONFIRM), null, 'outra origem não vira next');
  assert.equal(nextDoRedirect('olli://login', CONFIRM), null, 'deep link não vira next');
  assert.equal(nextDoRedirect('http://app.olliorcamentos.online/painel', CONFIRM), null, 'http não vira next');
  assert.equal(nextDoRedirect(`${CONFIRM}?x=1`, CONFIRM), null, 'não aponta para o próprio confirm');
  assert.equal(nextDoRedirect('', CONFIRM), null);
}

// ── 3. Cada email_action_type gera assunto/HTML/texto certos ────────────────
const config = configAuthEmail(envBase());
assert.equal(config.ok, true);

const esperados = {
  signup: { template: 'auth_signup', assunto: 'Confirme seu e-mail na OLLI Orçamentos', type: 'signup', botao: 'Confirmar meu e-mail' },
  invite: { template: 'auth_invite', assunto: 'Você foi convidado para a OLLI Orçamentos', type: 'invite', botao: 'Aceitar convite' },
  magiclink: { template: 'auth_magiclink', assunto: 'Seu código de acesso à OLLI Orçamentos', type: 'magiclink', botao: 'Entrar na OLLI' },
  email: { template: 'auth_magiclink', assunto: 'Seu código de acesso à OLLI Orçamentos', type: 'email', botao: 'Entrar na OLLI' },
  recovery: { template: 'auth_recovery', assunto: 'Redefina sua senha da OLLI Orçamentos', type: 'recovery', botao: 'Criar senha nova' },
};

for (const [acao, e] of Object.entries(esperados)) {
  const envios = planejarEnvios(payload(acao), config);
  assert.equal(envios.length, 1, acao);
  const [envio] = envios;
  assert.equal(envio.template, e.template, acao);
  assert.equal(envio.destinatario, EMAIL, acao);
  const link = new URL(envio.link);
  assert.equal(`${link.origin}${link.pathname}`, CONFIRM, `${acao}: link do contrato`);
  assert.equal(link.searchParams.get('token_hash'), HASH, acao);
  assert.equal(link.searchParams.get('type'), e.type, acao);
  assert.equal(link.searchParams.get('next'), acao === 'recovery' ? '/auth/nova-senha' : '/painel', `${acao}: next`);

  const { res, json, chamadas, linhas } = await chamar(payload(acao));
  assert.equal(res.status, 200, `${acao}: status`);
  assert.deepEqual(json, {}, `${acao}: corpo {}`);
  assert.equal(chamadas.length, 1, `${acao}: 1 envio`);
  const body = chamadas[0].body;
  assert.equal(chamadas[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(body.to, [EMAIL]);
  assert.equal(body.subject, e.assunto, `${acao}: assunto`);
  assert.equal(body.from, 'OLLI Orçamentos <nao-responda@olliorcamentos.online>');
  assert.equal(body.reply_to, 'contato@olliorcamentos.online');
  assert.ok(body.html.includes(`>${CODIGO}</div>`), `${acao}: código em destaque no HTML`);
  assert.ok(body.html.includes(e.botao), `${acao}: botão`);
  assert.ok(body.html.includes(envio.link.replaceAll('&', '&amp;')), `${acao}: link no HTML (escapado)`);
  assert.ok(body.html.includes('lang="pt-BR"'), `${acao}: pt-BR`);
  assert.ok(body.html.includes('10 minutos'), `${acao}: validade derivada da config`);
  assert.ok(body.text.includes(CODIGO), `${acao}: código no texto`);
  assert.ok(body.text.includes(envio.link), `${acao}: link no texto`);
  assert.equal(body.html.includes(EMAIL), false, `${acao}: e-mail do destinatário fora do corpo`);
  assert.equal(body.headers, undefined, `${acao}: sem List-Unsubscribe (e-mail essencial)`);
  const idem = chamadas[0].init.headers['Idempotency-Key'];
  assert.match(idem, /^auth-email:[0-9a-f]{48}$/, `${acao}: idempotency key`);
  assert.equal(idem.includes(CODIGO) || idem.includes(HASH), false, `${acao}: chave não expõe token`);
  semSegredosNoLog(linhas);
  assert.ok(linhas.some((l) => l.includes(`enviado tipo=${acao}`)), `${acao}: log de sucesso sem PII`);
}

// Reautenticação: só código, sem botão nem link.
{
  const d = payload('reauthentication', { token_hash: '' });
  const [envio] = planejarEnvios(d, config);
  assert.equal(envio.template, 'auth_reauthentication');
  assert.equal(envio.link, null);
  const { res, chamadas, linhas } = await chamar(d);
  assert.equal(res.status, 200);
  const body = chamadas[0].body;
  assert.equal(body.subject, 'Código para confirmar que é você');
  assert.ok(body.html.includes(`>${CODIGO}</div>`));
  assert.equal(body.html.includes('/auth/confirm'), false, 'reauth sem link');
  assert.equal(body.text.includes('http') && body.text.includes('/auth/confirm'), false);
  assert.ok(body.text.includes('O código vale por 10 minutos'));
  semSegredosNoLog(linhas);
}

// Troca de e-mail segura: duas pontas com o mapeamento cruzado da doc do Supabase.
{
  const d = payload(
    'email_change',
    { token: CODIGO, token_hash: HASH_NOVO, token_new: CODIGO_NOVO, token_hash_new: HASH },
    { new_email: NOVO_EMAIL },
  );
  const envios = planejarEnvios(d, config);
  assert.equal(envios.length, 2);
  const [atual, novo] = envios;
  assert.equal(atual.template, 'auth_email_change_atual');
  assert.equal(atual.destinatario, EMAIL);
  assert.equal(atual.codigo, CODIGO, 'ponta atual usa token');
  assert.equal(new URL(atual.link).searchParams.get('token_hash'), HASH, 'ponta atual usa token_hash_new');
  assert.equal(new URL(atual.link).searchParams.get('type'), 'email_change');
  assert.equal(novo.template, 'auth_email_change_novo');
  assert.equal(novo.destinatario, NOVO_EMAIL);
  assert.equal(novo.codigo, CODIGO_NOVO, 'ponta nova usa token_new');
  assert.equal(new URL(novo.link).searchParams.get('token_hash'), HASH_NOVO, 'ponta nova usa token_hash');

  const { res, chamadas, linhas } = await chamar(d);
  assert.equal(res.status, 200);
  assert.equal(chamadas.length, 2);
  // As pontas saem em paralelo: a ordem das chamadas não é contrato.
  const paraAtual = chamadas.find((c) => c.body.to[0] === EMAIL);
  const paraNovo = chamadas.find((c) => c.body.to[0] === NOVO_EMAIL);
  assert.ok(paraAtual && paraNovo, 'uma chamada para cada ponta');
  assert.equal(paraAtual.body.subject, 'Confirme a troca de e-mail da sua conta');
  assert.ok(paraAtual.body.html.includes(`>${CODIGO}</div>`));
  assert.equal(paraAtual.body.html.includes(CODIGO_NOVO), false, 'código da ponta nova não vai para o endereço atual');
  assert.equal(paraNovo.body.subject, 'Confirme seu novo e-mail na OLLI Orçamentos');
  assert.ok(paraNovo.body.html.includes(`>${CODIGO_NOVO}</div>`));
  assert.equal(paraNovo.body.html.includes(CODIGO), false, 'código da ponta atual não vai para o endereço novo');
  assert.notEqual(
    paraAtual.init.headers['Idempotency-Key'],
    paraNovo.init.headers['Idempotency-Key'],
    'cada ponta tem sua chave',
  );
  semSegredosNoLog(linhas);
}

// Troca de e-mail sem "troca segura": só a ponta nova (token_new + token_hash).
{
  const d = payload('email_change', { token: '', token_hash: HASH_NOVO, token_new: CODIGO_NOVO, token_hash_new: '' }, { new_email: NOVO_EMAIL });
  const envios = planejarEnvios(d, config);
  assert.equal(envios.length, 1);
  assert.equal(envios[0].destinatario, NOVO_EMAIL);
  assert.equal(envios[0].codigo, CODIGO_NOVO);
  // Variante da doc: sem troca segura o código pode vir em `token` (token_new vazio).
  const v = planejarEnvios(payload('email_change', { token: CODIGO_NOVO, token_hash: HASH_NOVO, token_new: '', token_hash_new: '' }, { new_email: NOVO_EMAIL }), config);
  assert.equal(v.length, 1);
  assert.equal(v[0].destinatario, NOVO_EMAIL);
  assert.equal(v[0].codigo, CODIGO_NOVO, 'sem troca segura, token vale para a ponta nova');
  assert.equal(new URL(v[0].link).searchParams.get('token_hash'), HASH_NOVO);
  // Troca segura com token_new faltando: NÃO reaproveita o token da ponta atual.
  assert.throws(
    () => planejarEnvios(payload('email_change', { token: CODIGO, token_hash: HASH_NOVO, token_new: '', token_hash_new: HASH }, { new_email: NOVO_EMAIL }), config),
    { codigo: 'codigo_invalido' },
  );
  // Sem new_email = payload fora do contrato.
  assert.throws(() => planejarEnvios(payload('email_change', { token_new: CODIGO_NOVO }), config), { codigo: 'destinatario_invalido' });
}

// Todos os templates renderizam; o renderer é estrito.
{
  for (const template of AUTH_EMAIL_TEMPLATES) {
    const semLink = template === 'auth_reauthentication';
    const r = renderizarEmailAuth({
      template,
      codigo: CODIGO,
      link: semLink ? null : `${CONFIRM}?token_hash=${HASH}&type=signup`,
      validadeMinutos: 1,
      logoUrl: 'https://olliorcamentos.online/icon-192.png',
      supportUrl: 'https://olliorcamentos.online/ajuda/',
    });
    assert.ok(r.subject.length > 0 && r.subject.length <= 180, template);
    assert.ok(r.html.includes('1 minuto '), `${template}: singular`);
  }
  const base = { template: 'auth_signup', codigo: CODIGO, link: CONFIRM, validadeMinutos: 10, logoUrl: CONFIRM, supportUrl: CONFIRM };
  assert.throws(() => renderizarEmailAuth({ ...base, codigo: '12ab56' }), { codigo: 'codigo_invalido' });
  assert.throws(() => renderizarEmailAuth({ ...base, link: 'http://x.example.com' }), { codigo: 'link_invalido' });
  assert.throws(() => renderizarEmailAuth({ ...base, template: 'auth_reauthentication' }), { codigo: 'link_invalido' });
  assert.throws(() => renderizarEmailAuth({ ...base, template: 'inexistente' }), { codigo: 'template_invalido' });
  assert.throws(() => renderizarEmailAuth({ ...base, extra: 1 }), { codigo: 'input_template_invalido' });
}

assert.deepEqual(
  [...AUTH_EMAIL_TIPOS_SUPORTADOS].sort(),
  ['email', 'email_change', 'invite', 'magiclink', 'reauthentication', 'recovery', 'signup'],
);

// ── 4. Idempotência: mesmo token → mesma chave; token novo → chave nova ──────
{
  const [a] = planejarEnvios(payload('magiclink'), config);
  const [b] = planejarEnvios(payload('magiclink'), config);
  const [c] = planejarEnvios(payload('magiclink', { token: '111222', token_hash: HASH_NOVO }), config);
  assert.equal((await chaveIdempotencia(a)).idempotencyKey, (await chaveIdempotencia(b)).idempotencyKey);
  assert.notEqual((await chaveIdempotencia(a)).idempotencyKey, (await chaveIdempotencia(c)).idempotencyKey);
  // Reenvio do Supabase (outro webhook-id) manda o MESMO corpo e a MESMA chave à Resend.
  const r1 = await chamar(payload('magiclink'));
  const raw = JSON.stringify(payload('magiclink'));
  const r2 = await chamar(raw, { headers: assinar(raw, { id: 'msg_auth_retry' }) });
  assert.equal(r1.chamadas[0].init.headers['Idempotency-Key'], r2.chamadas[0].init.headers['Idempotency-Key']);
  assert.equal(r1.chamadas[0].init.body, r2.chamadas[0].init.body, 'render determinístico');
}

// ── 5. Rota fail-closed ─────────────────────────────────────────────────────
{
  // Sem o segredo do hook: 503 sem chamar a Resend, log com o NOME da variável.
  const { SEND_EMAIL_HOOK_SECRET: _s, ...semSegredo } = envBase();
  let r = await chamar(payload('signup'), { env: semSegredo });
  assert.equal(r.res.status, 503);
  assert.equal(r.json.error.http_code, 503);
  assert.equal(typeof r.json.error.message, 'string');
  assert.equal(r.chamadas.length, 0);
  assert.ok(r.linhas.some((l) => l.includes('SEND_EMAIL_HOOK_SECRET')));
  semSegredosNoLog(r.linhas);

  // Sem a chave da Resend: idem.
  const { RESEND_API_KEY: _k, ...semResend } = envBase();
  r = await chamar(payload('signup'), { env: semResend });
  assert.equal(r.res.status, 503);
  assert.equal(r.chamadas.length, 0);
  assert.ok(r.linhas.some((l) => l.includes('RESEND_API_KEY')));

  // Validade ausente/inválida também desliga (o e-mail não pode prometer errado).
  r = await chamar(payload('signup'), { env: envBase({ AUTH_OTP_VALIDADE_MINUTOS: 'dez' }) });
  assert.equal(r.res.status, 503);

  // Assinatura inválida: 401, nada enviado.
  const raw = JSON.stringify(payload('signup'));
  r = await chamar(raw, { headers: assinar(raw, { bytes: Buffer.from('forjado') }) });
  assert.equal(r.res.status, 401);
  assert.equal(r.chamadas.length, 0);
  semSegredosNoLog(r.linhas);

  // Assinatura expirada: 401.
  r = await chamar(raw, { headers: assinar(raw, { ts: String(NOW_S - STANDARD_WEBHOOK_CLOCK_SKEW_SECONDS - 10) }) });
  assert.equal(r.res.status, 401);
  assert.equal(r.chamadas.length, 0);

  // Método errado: 405.
  r = await chamar('', { metodo: 'GET', headers: new Headers() });
  assert.equal(r.res.status, 405);
  assert.equal(r.res.headers.get('Allow'), 'POST');

  // JSON quebrado mas assinado: 400.
  r = await chamar('{nao-e-json');
  assert.equal(r.res.status, 400);

  // Tipo não suportado: 400 e nada enviado.
  r = await chamar(payload('password_changed_notification'));
  assert.equal(r.res.status, 400);
  assert.equal(r.chamadas.length, 0);
  assert.ok(r.linhas.some((l) => l.includes('tipo_nao_suportado')));

  // Código fora do formato: 400.
  r = await chamar(payload('signup', { token: 'abc' }));
  assert.equal(r.res.status, 400);
  semSegredosNoLog(r.linhas, ['abc']);

  // Payload grande demais: 413 antes de verificar.
  r = await chamar(JSON.stringify({ x: 'a'.repeat(200 * 1024) }));
  assert.equal(r.res.status, 413);

  // Limite por destinatário estourado: 429, nada enviado.
  r = await chamar(payload('recovery'), { env: envBase({ AUTH_EMAIL_RL: { limit: async () => ({ success: false }) } }) });
  assert.equal(r.res.status, 429);
  assert.equal(r.chamadas.length, 0);
  semSegredosNoLog(r.linhas);

  // Limitador ausente ou quebrado: 503 (fail-closed), nada enviado.
  r = await chamar(payload('recovery'), { env: envBase({ AUTH_EMAIL_RL: undefined }) });
  assert.equal(r.res.status, 503);
  assert.equal(r.chamadas.length, 0);
  r = await chamar(payload('recovery'), { env: envBase({ AUTH_EMAIL_RL: { limit: async () => { throw new Error('x'); } } }) });
  assert.equal(r.res.status, 503);

  // A chave do limitador é hash, nunca o endereço.
  const chaves = [];
  await chamar(payload('recovery'), { env: envBase({ AUTH_EMAIL_RL: { limit: async ({ key }) => { chaves.push(key); return { success: true }; } } }) });
  assert.equal(chaves.length, 1);
  assert.match(chaves[0], /^auth-email:[0-9a-f]{40}$/);

  // Troca de e-mail: se UMA ponta estoura o limite, NENHUMA sai.
  let n = 0;
  const d = payload('email_change', { token: CODIGO, token_hash: HASH_NOVO, token_new: CODIGO_NOVO, token_hash_new: HASH }, { new_email: NOVO_EMAIL });
  r = await chamar(d, { env: envBase({ AUTH_EMAIL_RL: { limit: async () => ({ success: (n += 1) === 1 }) } }) });
  assert.equal(r.res.status, 429);
  assert.equal(r.chamadas.length, 0);

  // Resend fora (5xx/429): 503 retentável; recusa definitiva (4xx): 502. Sem vazar nada.
  r = await chamar(payload('signup'), { respostas: [{ status: 500, body: { message: `erro com ${EMAIL}` } }] });
  assert.equal(r.res.status, 503);
  assert.ok(r.linhas.some((l) => l.includes('resend_provider_unavailable')));
  semSegredosNoLog(r.linhas);
  r = await chamar(payload('signup'), { respostas: [{ status: 429, body: {} }] });
  assert.equal(r.res.status, 503);
  r = await chamar(payload('signup'), { respostas: [{ status: 422, body: { message: 'x' } }] });
  assert.equal(r.res.status, 502);
  r = await chamar(payload('signup'), { respostas: [{ status: 200, body: null }] });
  assert.equal(r.res.status, 503, 'resposta 200 sem id não conta como enviado');

  // A resposta de erro não devolve nada do provedor nem do usuário.
  r = await chamar(payload('signup'), { respostas: [{ status: 500, body: { message: `erro com ${EMAIL}` } }] });
  assert.deepEqual(Object.keys(r.json.error).sort(), ['http_code', 'message']);
  assert.equal(JSON.stringify(r.json).includes(EMAIL), false);
}

console.log('PASSOU: Send Email Hook — Standard Webhooks, templates pt-BR por tipo, links do contrato, troca de e-mail nas duas pontas, limite por destinatário, idempotência e logs sem PII');
