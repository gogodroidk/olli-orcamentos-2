/**
 * Teste da aba "Funil de uso" do painel ADM (src/funilUso.js + rota em admin.js + tela em adminPagina.js).
 *
 *     node scripts/teste-admin-funil-uso.js   (de dentro de worker/)
 *
 * Protege: só contagens e medianas saem (nenhum id); contas internas ficam fora; % sobre o passo anterior sem dividir
 * por zero; ordem dos passos igual às colunas da view; rota só para admin com aal2 e leitura em 3 estados; a tela compila.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUNIL_USO_MAX_LINHAS, PASSOS_FUNIL_USO, resumirFunilUso } from '../src/funilUso.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log('ok', nome);
}

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = (min) => new Date(Date.UTC(2026, 10, 19, 12, 0) + min * 60000).toISOString();

await caso('vazio: zero contas, passos todos zerados, % e tempos nulos', () => {
  const r = resumirFunilUso([], new Set());
  assert.equal(r.pessoas, 0);
  assert.equal(r.passos.length, PASSOS_FUNIL_USO.length);
  assert.ok(r.passos.every((p) => p.pessoas === 0 && p.pctAnterior === null));
  assert.deepEqual(r.tempos, { minAte1oOrcamento: null, minAte1oEnvio: null, minDoPixAoPagamento: null });
});

await caso('conta, porcentagem e mediana; internas fora; nenhum id na saída', () => {
  const linhas = [
    { user_id: ID(1), sessao_1: T(0), signup: T(1), orcamento_criado: T(11), orcamento_enviado: T(21) },
    { user_id: ID(2), sessao_1: T(0), signup: T(2), orcamento_criado: T(32) },
    { user_id: ID(3), sessao_1: T(0) },
    { user_id: ID(4), sessao_1: T(0), signup: T(0), orcamento_criado: T(5), pix_gerado: T(10), pix_pago: T(13) },
  ];
  const r = resumirFunilUso(linhas, new Set([ID(4)]));
  assert.equal(r.pessoas, 3);
  assert.equal(r.internasFora, 1);
  const por = Object.fromEntries(r.passos.map((p) => [p.chave, p]));
  assert.equal(por.sessao_1.pessoas, 3);
  assert.equal(por.sessao_1.pctAnterior, null);
  assert.equal(por.signup.pessoas, 2);
  assert.equal(por.signup.pctAnterior, 66.7);
  assert.equal(por.orcamento_criado.pessoas, 2);
  assert.equal(por.orcamento_enviado.pessoas, 1);
  assert.equal(por.pix_pago.pessoas, 0, 'a interna que pagou não conta');
  assert.equal(r.tempos.minAte1oOrcamento, 20, 'mediana de 10 e 30 min');
  assert.equal(r.tempos.minAte1oEnvio, 20);
  assert.equal(r.tempos.minDoPixAoPagamento, null);
  assert.ok(!JSON.stringify(r).includes('00000000-0000-4000'), 'nenhum user_id sai na resposta');
});

await caso('passo anterior zerado vira "—", não divisão por zero; data inválida não conta', () => {
  const r = resumirFunilUso([{ user_id: ID(1), sessao_1: 'lixo', signup: T(0) }], new Set());
  const por = Object.fromEntries(r.passos.map((p) => [p.chave, p]));
  assert.equal(por.sessao_1.pessoas, 0);
  assert.equal(por.signup.pessoas, 1);
  assert.equal(por.signup.pctAnterior, null);
});

await caso('passos na mesma ordem e com os mesmos nomes das colunas da view funil_uso', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261023160000_rastreio_funil.sql', import.meta.url), 'utf8');
  const view = sql.split(/create or replace view public\.funil_uso\r?\n/)[1].split('from public.user_tela_log')[0];
  const colunas = [...view.matchAll(/ as ([a-z_0-9]+)\s*,?\r?\n/g)].map((m) => m[1]);
  assert.deepEqual(colunas, PASSOS_FUNIL_USO.map(([c]) => c));
});

await caso('rota: só admin com aal2, teto de linhas, falha de leitura vira 503 (nunca zero)', () => {
  const src = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
  const rota = src.split("p === '/admin/api/funil-uso'")[1].split('funilUso(env)')[0];
  assert.match(rota, /return exigir\(user, 'admin', \{ aal2: true \}\) \|\| /);
  const fn = src.split('async function funilUso(env)')[1].split('\nasync function ')[0];
  assert.match(fn, /limit=\$\{FUNIL_USO_MAX_LINHAS\}/);
  assert.match(fn, /if \(!linhas\.ok\) return json\(\{ ok: false, erro: 'banco_indisponivel' \}, 503\)/);
  assert.match(fn, /contas_internas_ilegiveis' \}, 503\)/);
  assert.ok(FUNIL_USO_MAX_LINHAS >= 1000);
});

await caso('tela: aba "Funil de uso" na navegação, no roteamento, e o script do painel compila', async () => {
  const { adminHtml } = await import('../src/adminPagina.js');
  const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }, 'n');
  const script = html.split('<script nonce="n">')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("{id:'uso',rot:'Funil de uso'") && script.includes('uso:carregarUso'));
  assert.ok(html.includes('id="v-uso"'));
  assert.ok(script.includes("api('funil-uso')"));
});

console.log(`\n${ok} casos ok`);
