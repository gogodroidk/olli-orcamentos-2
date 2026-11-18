/**
 * /admin conta "fechado" = aprovado OU convertido, e ignora orçamento excluído (excluido_em).
 * Dados sintéticos que imitam a FORMA de um caso real (12 ativos + 12 excluídos, 5 fechados);
 * nenhum nome, e-mail ou valor de cliente real.
 */
import assert from 'node:assert/strict';
import { orcamentoAtivo, orcamentoFechado } from '../src/orcamentoFechado.js';
import { handleAdmin } from '../src/admin.js';

const U_CASO = '11111111-1111-4111-8111-111111111111';
const U_ANTIGO = '22222222-2222-4222-8222-222222222222';
const EXC = '2026-11-01T00:00:00Z';

const mk = (user_id, status, valor_total, excluido_em = null) => ({ user_id, status, valor_total, criado_em: '2026-10-01T00:00:00Z', excluido_em });
// 12 ativos: 2 aprovado (100+200) + 3 convertido (300+400+500) = 5 fechados, soma 1500; 7 em outros status com valor (não contam).
const ATIVOS = [
  mk(U_CASO, 'aprovado', 100), mk(U_CASO, 'aprovado', 200),
  mk(U_CASO, 'convertido', 300), mk(U_CASO, 'convertido', 400), mk(U_CASO, 'convertido', 500),
  ...['rascunho', 'enviado', 'enviado', 'recusado', 'expirado', 'rascunho', 'enviado'].map((s) => mk(U_CASO, s, 999)),
];
// 12 excluídos, inclusive aprovado/convertido com valor alto: nada disso pode aparecer.
const EXCLUIDOS = [
  ...Array.from({ length: 6 }, () => mk(U_CASO, 'aprovado', 7000, EXC)),
  ...Array.from({ length: 6 }, () => mk(U_CASO, 'convertido', 7000, EXC)),
];
// Caso antigo: só aprovado, sem coluna de exclusão preenchida (continua igual).
const ANTIGO = [mk(U_ANTIGO, 'aprovado', 250), mk(U_ANTIGO, 'enviado', 90)];

// unidade
assert.equal(orcamentoFechado({ status: 'aprovado' }), true);
assert.equal(orcamentoFechado({ status: 'convertido' }), true);
for (const s of ['rascunho', 'enviado', 'recusado', 'expirado', 'cancelado', undefined]) assert.equal(orcamentoFechado({ status: s }), false, String(s));
assert.equal(orcamentoFechado(null), false);
assert.equal(orcamentoAtivo({ excluido_em: null }), true);
assert.equal(orcamentoAtivo({}), true, 'linha sem a coluna (consulta antiga) = ativa');
assert.equal(orcamentoAtivo({ excluido_em: EXC }), false);
assert.equal(orcamentoAtivo(null), false);

// integração com handleAdmin (mesmo desenho dos outros testes admin)
const ADMIN = '11111111-1111-4111-8111-111111111111';
const env = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: 'dono@exemplo.test',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = `${enc({ alg: 'none' })}.${enc({ aal: 'aal2', sub: ADMIN })}.x`;
const usuarios = [U_CASO, U_ANTIGO].map((id, i) => ({
  id, email: `c${i}@exemplo.test`, created_at: '2026-09-01T00:00:00Z', last_sign_in_at: '2026-10-02T00:00:00Z',
  app_metadata: { provider: 'email' }, user_metadata: {},
}));
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: ADMIN, email: 'dono@exemplo.test' }), { status: 200 });
  if (url.includes('/auth/v1/admin/users')) return Response.json({ users: usuarios });
  if (url.includes('/rest/v1/orcamentos')) return Response.json([...ATIVOS, ...EXCLUIDOS, ...ANTIGO]);
  return Response.json([]);
};
async function get(caminho) {
  const url = new URL(`https://api.exemplo/admin/api/${caminho}`);
  const r = await handleAdmin(new Request(url, { headers: { Authorization: `Bearer ${token}` } }), env, url);
  assert.equal(r.status, 200);
  return r.json();
}

const u = (await get('users')).users;
const caso = u.find((x) => x.id === U_CASO);
assert.deepEqual([caso.orcamentos, caso.aprovados, caso.faturamento], [12, 5, 1500], 'conta por usuário: 12 ativos, 5 fechados, soma 1500');
const antigo = u.find((x) => x.id === U_ANTIGO);
assert.deepEqual([antigo.orcamentos, antigo.aprovados, antigo.faturamento], [2, 1, 250], 'caso antigo (só aprovado) não muda');

const m = await get('metrics');
assert.deepEqual([m.orcamentos, m.aprovados, m.faturamento], [14, 6, 1750], 'totais do painel');
console.log('ok: fechado = aprovado + convertido, excluídos fora');
