import fs from 'node:fs';
import { handleAdmin } from '../worker/src/admin.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

function token(aal: 'aal1' | 'aal2') {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal, sub: '11111111-1111-4111-8111-111111111111' })}.x`;
}

const baseEnv: any = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: 'admin@exemplo.com',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};

console.log('\nAdmin OLLI — governança e fail-closed');

const html = await handleAdmin(new Request('https://api.exemplo/admin'), baseEnv, new URL('https://api.exemplo/admin'));
const pagina = await html.text();
const csp = html.headers.get('content-security-policy') || '';
checar('painel usa nonce no script', /<script nonce="[a-f0-9]{36}">/.test(pagina));
checar('CSP não libera script unsafe-inline', !/script-src[^;]*unsafe-inline/.test(csp));
checar('token fica em sessionStorage', pagina.includes("sessionStorage.getItem('olli_admin_tok')"));
checar('token não fica em localStorage', !pagina.includes("localStorage.getItem('olli_admin_tok')"));

const semLimiter = await handleAdmin(
  new Request('https://api.exemplo/admin/api/metrics'),
  { ...baseEnv, ADMIN_RL: undefined },
  new URL('https://api.exemplo/admin/api/metrics'),
);
checar('ADMIN_RL ausente falha fechado (503)', semLimiter.status === 503);

const limiterFalha = await handleAdmin(
  new Request('https://api.exemplo/admin/api/metrics'),
  { ...baseEnv, ADMIN_RL: { limit: async () => { throw new Error('fora'); } } },
  new URL('https://api.exemplo/admin/api/metrics'),
);
checar('ADMIN_RL com erro falha fechado (503)', limiterFalha.status === 503);

const originalFetch = globalThis.fetch;
const chamadas: Array<{ url: string; body?: any }> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) {
    return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'admin@exemplo.com' }), { status: 200 });
  }
  if (url.includes('/auth/v1/admin/users?')) {
    return new Response(JSON.stringify({ users: [
      { id: '22222222-2222-4222-8222-222222222222', email: 'suporte@exemplo.com' },
    ] }), { status: 200 });
  }
  if (url.endsWith('/rest/v1/rpc/admin_set_plano_override')) {
    chamadas.push({ url, body: JSON.parse(String(init?.body || '{}')) });
    return new Response(JSON.stringify({
      user_id: '22222222-2222-4222-8222-222222222222',
      plano: 'pro', status: 'canceled', current_period_end: null,
      admin_plano_override: 'empresa', admin_override_ativo: true, admin_override_ate: null,
    }), { status: 200 });
  }
  if (url.endsWith('/rest/v1/rpc/admin_set_membership')) {
    chamadas.push({ url, body: JSON.parse(String(init?.body || '{}')) });
    return new Response(JSON.stringify({
      user_id: '22222222-2222-4222-8222-222222222222', papel: 'suporte', ativo: true,
    }), { status: 200 });
  }
  return new Response(JSON.stringify([]), { status: 200 });
}) as typeof fetch;

try {
  const alvo = '22222222-2222-4222-8222-222222222222';
  const fazer = (aal: 'aal1' | 'aal2') => {
    const url = new URL(`https://api.exemplo/admin/api/user/plan?id=${alvo}`);
    return handleAdmin(new Request(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(aal)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plano: 'empresa', ativo: true, motivo: 'Cortesia comercial', requestId: 'request-admin-000001' }),
    }), baseEnv, url);
  };

  const aal1 = await fazer('aal1');
  checar('plano manual exige AAL2', aal1.status === 403);
  checar('AAL1 não alcança a RPC', chamadas.length === 0);

  const aal2 = await fazer('aal2');
  checar('AAL2 owner concede plano', aal2.status === 200);
  checar('RPC recebe ator autenticado', chamadas[0]?.body?.p_actor === '11111111-1111-4111-8111-111111111111');
  checar('RPC recebe alvo separado', chamadas[0]?.body?.p_target === alvo);

  const adminUrl = new URL('https://api.exemplo/admin/api/admins');
  const membro = await handleAdmin(new Request(adminUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token('aal2')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'suporte@exemplo.com', papel: 'suporte', ativo: true,
      motivo: 'Acesso operacional', requestId: 'request-admin-000002',
    }),
  }), baseEnv, adminUrl);
  checar('membership administrativa usa transação RPC', membro.status === 200 && chamadas[1]?.url.endsWith('/rpc/admin_set_membership'));
  checar('RPC de membership recebe motivo e request id', chamadas[1]?.body?.p_motivo === 'Acesso operacional' && chamadas[1]?.body?.p_request_id === 'request-admin-000002');
} finally {
  globalThis.fetch = originalFetch;
}

const migration = fs.readFileSync('supabase/migrations/20260820163046_admin_governanca_entitlements.sql', 'utf8');
checar('membership tem FORCE RLS', /alter table public\.admin_memberships force row level security/i.test(migration));
checar('auditoria tem FORCE RLS', /alter table public\.admin_audit_log force row level security/i.test(migration));
checar('RPC de plano é só service_role', /revoke all on function public\.admin_set_plano_override[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role;/i.test(migration));
checar('RPC de membership é só service_role', /revoke all on function public\.admin_set_membership[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role;/i.test(migration));
checar('trilha impede UPDATE e DELETE', /before update on public\.admin_audit_log/i.test(migration) && /before delete on public\.admin_audit_log/i.test(migration));
checar('helpers de trigger perdem EXECUTE público', ['credit_ledger_append_only','sincronizar_revogacao_publico','sync_profile_from_auth','bloquear_troca_membro','bloquear_troca_user_id','pmoc_bloquear_versao_congelada'].every((f) => migration.includes(`revoke all on function public.${f}`)));
checar('helper da RLS preserva authenticated', /grant execute on function public\.perfil_visivel\(uuid\) to authenticated, service_role;/i.test(migration));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
