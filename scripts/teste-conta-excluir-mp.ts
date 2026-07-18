/**
 * Teste da exclusão de conta x assinatura recorrente do MERCADO PAGO:
 * "conta apagada com assinatura viva = cartão cobrado sem ninguém para cancelar.
 * Se não deu para cancelar, NÃO apaga — e não apaga calado."
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

function reset(opts: {
  gravado?: any;
  colunaExiste?: boolean;
  leituraFalha?: boolean;
  mpCancelStatus?: number;
  mpStatusFinal?: string;
  token?: string | undefined;
} = {}) {
  preapprovalGravado = opts.gravado ?? null;
  colunaExiste = opts.colunaExiste !== false;
  leituraFalha = !!opts.leituraFalha;
  mpCancelStatus = opts.mpCancelStatus ?? 200;
  mpStatusFinal = opts.mpStatusFinal ?? 'authorized';
  usuarioApagado = false;
  env.MP_ACCESS_TOKEN = 'token' in opts ? opts.token : 'mp-token-falso';
}

(globalThis as any).fetch = async (url: string, init?: { method?: string }) => {
  const u = String(url);
  const metodo = init?.method ?? 'GET';

  if (u.includes('/auth/v1/admin/users/')) {
    usuarioApagado = true;
    return { ok: true, status: 204 } as Response;
  }
  if (u.includes('/auth/v1/user')) {
    return { ok: true, status: 200, json: async () => ({ id: USER, email: 'x@y.z' }) } as unknown as Response;
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

async function excluir() {
  const request = new Request('https://diagnostico.olliorcamentos.online/conta/excluir', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt-falso' },
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

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`) — mesma razão do teste-creditos-voz.ts.
process.exitCode = falhas === 0 ? 0 : 1;
