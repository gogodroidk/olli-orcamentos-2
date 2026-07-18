/**
 * Teste da exclusão de conta (worker/src/conta.js). Duas metades:
 *
 * A) x assinatura recorrente do MERCADO PAGO:
 *    "conta apagada com assinatura viva = cartão cobrado sem ninguém para cancelar.
 *    Se não deu para cancelar, NÃO apaga — e não apaga calado."
 *
 * B) x REVOGAÇÃO DO SIGN IN WITH APPLE (App Store 5.1.1(v)) — seção no fim do
 *    arquivo. Cobre a regra oposta à do MP: falhar a revogação NÃO pode travar a
 *    exclusão, porque a mesma guideline exige que excluir funcione. E assina um
 *    `client_secret` ES256 de VERDADE (chave P-256 gerada no próprio teste), para
 *    que o caminho que hoje não roda em produção — faltam os secrets APPLE_* —
 *    não seja código nunca executado.
 *
 * (O nome do arquivo ficou de quando ele só tinha a metade A; está no `npm test`
 * com esse nome, e renomeá-lo exigiria mexer no package.json da raiz.)
 *
 *     node scripts/teste-conta-excluir-mp.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `handleContaExcluir` REAL (worker/src/conta.js) contra um Supabase e um
 * Mercado Pago FALSOS (fetch trocado) — mesmo padrão dos outros testes do worker.
 *
 * O bloco da Stripe já era fail-closed; o do Mercado Pago não existia — e o MP é o
 * gateway do OLLI hoje (docs/MERCADOPAGO.md). Quem assinasse pelo cartão e
 * excluísse a conta seguia sendo cobrado, sem conta pela qual cancelar. Cobrança
 * indevida contra alguém que nem tem mais como reclamar.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { handleContaExcluir } from '../worker/src/conta.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const USER = 'user-conta-1';

const env: any = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  SUPABASE_ANON_KEY: 'anon-falso',
  MP_ACCESS_TOKEN: 'mp-token-falso',
  // Limiter que sempre deixa passar (a rota é fail-closed: sem binding daria 429 e
  // o teste nem chegaria no que interessa). Ver worker/src/rateLimit.js.
  CONTA_RL: { limit: async () => ({ success: true }) },
};

// ── estado dos falsos ────────────────────────────────────────────────────
let preapprovalGravado: any = null;
let colunaExiste = true; // false = migration 20260728 não aplicada
let leituraFalha = false; // PostgREST fora ao ler mp_preapproval_id
let mpCancelStatus = 200; // resposta do PUT /preapproval/{id}
let mpStatusFinal = 'authorized'; // o que o GET de conferência diz depois
let usuarioApagado = false;
// ── Apple (metade B) ─────────────────────────────────────────────────────
let provedores: string[] | null = null; // app_metadata.providers do /auth/v1/user
let appleTokenStatus = 200; // resposta de POST /auth/token
let appleRevokeStatus = 200; // resposta de POST /auth/revoke
let appleChamadas: string[] = []; // caminhos batidos em appleid.apple.com
let clientSecretVisto = ''; // o JWT que o worker mandou (conferido de verdade)

function reset(opts: {
  gravado?: any;
  colunaExiste?: boolean;
  leituraFalha?: boolean;
  mpCancelStatus?: number;
  mpStatusFinal?: string;
  token?: string | undefined;
  provedores?: string[] | null;
  appleTokenStatus?: number;
  appleRevokeStatus?: number;
} = {}) {
  preapprovalGravado = opts.gravado ?? null;
  colunaExiste = opts.colunaExiste !== false;
  leituraFalha = !!opts.leituraFalha;
  mpCancelStatus = opts.mpCancelStatus ?? 200;
  mpStatusFinal = opts.mpStatusFinal ?? 'authorized';
  usuarioApagado = false;
  env.MP_ACCESS_TOKEN = 'token' in opts ? opts.token : 'mp-token-falso';
  provedores = 'provedores' in opts ? opts.provedores! : null;
  appleTokenStatus = opts.appleTokenStatus ?? 200;
  appleRevokeStatus = opts.appleRevokeStatus ?? 200;
  appleChamadas = [];
  clientSecretVisto = '';
}

(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const metodo = init?.method ?? 'GET';

  if (u.startsWith('https://appleid.apple.com/auth/')) {
    const caminho = u.slice('https://appleid.apple.com/auth/'.length);
    appleChamadas.push(caminho);
    const campos = new URLSearchParams(init?.body ?? '');
    clientSecretVisto = campos.get('client_secret') ?? '';
    if (caminho === 'token') {
      return {
        ok: appleTokenStatus < 300,
        status: appleTokenStatus,
        json: async () => ({ refresh_token: 'refresh-apple-falso' }),
        text: async () => '{}',
      } as unknown as Response;
    }
    return {
      ok: appleRevokeStatus < 300,
      status: appleRevokeStatus,
      text: async () => '',
    } as unknown as Response;
  }
  if (u.includes('/auth/v1/admin/users/')) {
    usuarioApagado = true;
    return { ok: true, status: 204 } as Response;
  }
  if (u.includes('/auth/v1/user')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: USER,
        email: 'x@y.z',
        ...(provedores ? { app_metadata: { provider: provedores[0], providers: provedores } } : {}),
      }),
    } as unknown as Response;
  }
  if (u.includes('/rest/v1/assinaturas')) {
    if (u.includes('select=mp_preapproval_id')) {
      if (!colunaExiste) return { ok: false, status: 400, json: async () => ({}) } as unknown as Response;
      if (leituraFalha) return { ok: false, status: 500 } as Response;
      return { ok: true, status: 200, json: async () => [{ mp_preapproval_id: preapprovalGravado }] } as unknown as Response;
    }
    // getAssinatura do conta.js: sem Stripe neste teste (é o caminho do MP).
    return { ok: true, status: 200, json: async () => [{ stripe_subscription_id: null, stripe_customer_id: null }] } as unknown as Response;
  }
  if (u.includes('api.mercadopago.com/preapproval/')) {
    if (metodo === 'PUT') return { ok: mpCancelStatus < 300, status: mpCancelStatus, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ status: mpStatusFinal }) } as unknown as Response;
  }
  throw new Error(`fetch fake não sabe responder por: ${u}`);
};

async function excluir(corpo?: unknown) {
  const request = new Request('https://diagnostico.olliorcamentos.online/conta/excluir', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt-falso' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const resp = await handleContaExcluir(request, env);
  return { status: resp.status, body: await resp.json() };
}

console.log('\n1) assinatura MP cancelada com sucesso: aí sim apaga a conta');
reset({ gravado: 'pre-1' });
{
  const r = await excluir();
  checar('200 ok', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

console.log('\n2) O BUG: cancelamento do MP FALHA → NÃO apaga (senão o cartão seguia sendo cobrado)');
reset({ gravado: 'pre-1', mpCancelStatus: 500, mpStatusFinal: 'authorized' });
{
  const r = await excluir();
  checar('502 falha_cancelamento (retryável)', `${r.status}/${r.body.erro}`, '502/falha_cancelamento');
  checar('conta INTACTA — não apaga calado', usuarioApagado, false);
}

console.log('\n3) "já estava cancelada no MP" não trava a exclusão para sempre');
reset({ gravado: 'pre-1', mpCancelStatus: 400, mpStatusFinal: 'cancelled' });
{
  const r = await excluir();
  checar('ok (o GET de conferência provou que está cancelada)', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

console.log('\n4) preapproval que nem existe mais no MP (404 no PUT): segue');
reset({ gravado: 'pre-sumida', mpCancelStatus: 404 });
{
  const r = await excluir();
  checar('ok', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

console.log('\n5) há id para cancelar mas o worker está sem MP_ACCESS_TOKEN: fail-closed');
reset({ gravado: 'pre-1', token: undefined });
{
  const r = await excluir();
  checar('502 falha_cancelamento', `${r.status}/${r.body.erro}`, '502/falha_cancelamento');
  checar('conta intacta', usuarioApagado, false);
}

console.log('\n6) não SABER se há assinatura (PostgREST fora) ≠ não ter: 502, não apaga');
reset({ gravado: 'pre-1', leituraFalha: true });
{
  const r = await excluir();
  checar('502 falha_cancelamento', `${r.status}/${r.body.erro}`, '502/falha_cancelamento');
  checar('conta intacta', usuarioApagado, false);
}

console.log('\n7) coluna ainda não existe (migration 20260728 pendente): exclui, como hoje, com log');
reset({ colunaExiste: false });
{
  const r = await excluir();
  checar('ok (travar a exclusão de todo mundo seria pior — Apple exige o caminho)', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

console.log('\n8) usuário sem assinatura nenhuma no MP: exclui normalmente');
reset({ gravado: null });
{
  const r = await excluir();
  checar('ok', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

// ═══════════════════════════════════════════════════════════════════════════
// METADE B — REVOGAÇÃO DO SIGN IN WITH APPLE (App Store 5.1.1(v))
// ═══════════════════════════════════════════════════════════════════════════
// A regra aqui é o OPOSTO da do MP e é de propósito: assinatura viva cobra o
// cartão todo mês (fail-CLOSED), token não revogado é uma linha a mais na tela
// do Apple ID (best-effort). Travar a exclusão por causa da revogação
// reprovaria na review pelo item mais grave dos dois.

/** Par ES256 de verdade, para o worker assinar um client_secret real. */
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
const pemB64 = Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g)!.join('\n');
const P8_PEM = `-----BEGIN PRIVATE KEY-----\n${pemB64}\n-----END PRIVATE KEY-----\n`;

function ligarSecretsApple(pem: string = P8_PEM) {
  env.APPLE_TEAM_ID = 'TEAM123456';
  env.APPLE_KEY_ID = 'KEY1234567';
  env.APPLE_CLIENT_ID = 'online.olliorcamentos.app';
  env.APPLE_PRIVATE_KEY = pem;
}
function desligarSecretsApple() {
  delete env.APPLE_TEAM_ID; delete env.APPLE_KEY_ID;
  delete env.APPLE_CLIENT_ID; delete env.APPLE_PRIVATE_KEY;
}
const b64urlParaBytes = (s: string) =>
  new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

console.log('\n── Apple ──');
console.log('\n9) usuário Apple + código + secrets: troca o código e REVOGA de verdade');
desligarSecretsApple();
ligarSecretsApple();
reset({ provedores: ['apple'] });
{
  const r = await excluir({ appleAuthorizationCode: 'cod-apple-123' });
  checar('ok', r.body.ok, true);
  checar('chamou /auth/token e depois /auth/revoke', appleChamadas, ['token', 'revoke']);
  checar('usuário apagado', usuarioApagado, true);

  // O client_secret não é conferido "por parecer um JWT": a assinatura ES256 é
  // VERIFICADA com a chave pública do par. Sem isto, um erro de formato (DER em
  // vez de r||s, base64 padrão em vez de base64url) só apareceria em produção,
  // no dia em que o dono colocasse os secrets — e apareceria como um
  // `invalid_client` mudo da Apple.
  const [cab, corpoJwt, assin] = clientSecretVisto.split('.');
  const cabecalho = JSON.parse(Buffer.from(cab, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(corpoJwt, 'base64url').toString());
  checar('header ES256 + kid', `${cabecalho.alg}/${cabecalho.kid}`, 'ES256/KEY1234567');
  checar('iss=Team, sub=bundle id, aud=Apple', `${claims.iss}/${claims.sub}/${claims.aud}`,
    'TEAM123456/online.olliorcamentos.app/https://appleid.apple.com');
  checar('exp no futuro', claims.exp > Math.floor(Date.now() / 1000), true);
  const assinaturaOk = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, par.publicKey,
    b64urlParaBytes(assin), new TextEncoder().encode(`${cab}.${corpoJwt}`),
  );
  checar('assinatura ES256 confere com a chave .p8', assinaturaOk, true);
}

console.log('\n10) .p8 colado com "\\n" LITERAL (o jeito que sobrevive ao wrangler secret put)');
reset({ provedores: ['apple'] });
ligarSecretsApple(P8_PEM.replace(/\n/g, '\\n'));
{
  const r = await excluir({ appleAuthorizationCode: 'cod-apple-123' });
  checar('ok', r.body.ok, true);
  checar('revogou mesmo assim', appleChamadas, ['token', 'revoke']);
}
ligarSecretsApple();

console.log('\n11) a Apple RECUSA a revogação: a conta é apagada assim mesmo (5.1.1(v))');
reset({ provedores: ['apple'], appleRevokeStatus: 400 });
{
  const r = await excluir({ appleAuthorizationCode: 'cod-apple-123' });
  checar('ok — revogação NÃO bloqueia exclusão', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

console.log('\n12) /auth/token recusa (código expirado): não revoga, mas exclui');
reset({ provedores: ['apple'], appleTokenStatus: 400 });
{
  const r = await excluir({ appleAuthorizationCode: 'cod-velho' });
  checar('ok', r.body.ok, true);
  checar('nem tentou revogar sem refresh_token', appleChamadas, ['token']);
  checar('usuário apagado', usuarioApagado, true);
}

console.log('\n13) ESTADO DE HOJE: secrets APPLE_* ausentes → não chama a Apple, e exclui');
reset({ provedores: ['apple'] });
desligarSecretsApple();
{
  const r = await excluir({ appleAuthorizationCode: 'cod-apple-123' });
  checar('ok', r.body.ok, true);
  checar('nenhuma chamada a appleid.apple.com', appleChamadas, []);
  checar('usuário apagado', usuarioApagado, true);
}
ligarSecretsApple();

console.log('\n14) ESTADO DE HOJE: app ainda não manda o código → exclui, sem chamar a Apple');
reset({ provedores: ['apple'] });
{
  const r = await excluir({});
  checar('ok', r.body.ok, true);
  checar('nenhuma chamada a appleid.apple.com', appleChamadas, []);
}

console.log('\n15) quem NÃO entrou com a Apple não paga round-trip nenhum');
reset({ provedores: ['email'] });
{
  const r = await excluir({ appleAuthorizationCode: 'cod-apple-123' });
  checar('ok', r.body.ok, true);
  checar('nenhuma chamada a appleid.apple.com', appleChamadas, []);
}

console.log('\n16) provedor DESCONHECIDO ≠ "não é Apple": tenta revogar (erro nunca vira vazio)');
reset({ provedores: null }); // /auth/v1/user sem app_metadata
{
  const r = await excluir({ appleAuthorizationCode: 'cod-apple-123' });
  checar('ok', r.body.ok, true);
  checar('tentou revogar mesmo sem saber o provedor', appleChamadas, ['token', 'revoke']);
}

console.log('\n17) corpo gigante é barrado ANTES de qualquer trabalho (413)');
reset({ provedores: ['apple'] });
{
  const r = await excluir({ appleAuthorizationCode: 'x'.repeat(40 * 1024) });
  checar('413 payload_grande', `${r.status}/${r.body.erro}`, '413/payload_grande');
  checar('conta intacta', usuarioApagado, false);
}

console.log('\n18) corpo ausente (o app de hoje manda `{}`; aqui, NADA) não quebra a rota');
reset({ provedores: ['email'] });
{
  const r = await excluir();
  checar('ok', r.body.ok, true);
  checar('usuário apagado', usuarioApagado, true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`) — mesma razão do teste-creditos-voz.ts.
process.exitCode = falhas === 0 ? 0 : 1;
