/**
 * Teste da aba "Lojas" do painel ADM (src/lojasParceiras.js + rota em admin.js + tela em adminPagina.js).
 *
 *     node scripts/teste-admin-lojas.js   (de dentro de worker/)
 *
 * Protege: o código da loja sai do utm do cadastro (primeiro toque, senão o último); só contagens saem (nenhum id);
 * contas internas ficam fora e são contadas à parte; código fora da lista aparece como desconhecido (nunca some);
 * orçamentos ilegíveis viram `null` (nunca zero); rota só para admin com aal2; a tela compila.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codigoLojaDoCadastro, contarPorLoja, FORMATO_CODIGO_LOJA, LOJAS_PARCEIRAS } from '../src/lojasParceiras.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log('ok', nome);
}

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = Date.parse('2026-11-21T12:00:00Z');
const dias = (n) => new Date(AGORA - n * 86400000).toISOString();
const loja = (campanha, extra = {}) => ({ origem_utm: { primeiro_toque: { utm_source: 'loja', utm_medium: 'balcao', utm_campaign: campanha, ts: 1 }, ...extra } });
const LOJAS = [{ codigo: 'lj-vpr-01', nome: 'Loja A' }, { codigo: 'lj-tst-00', nome: 'Teste', teste: true }];

await caso('código da loja: primeiro toque; senão último; utm de outra fonte não conta', () => {
  assert.equal(codigoLojaDoCadastro(loja('LJ-VPR-01 ')), 'lj-vpr-01');
  assert.equal(codigoLojaDoCadastro({ origem_utm: { primeiro_toque: { utm_source: 'google', utm_campaign: 'g1' }, ultimo_toque: { utm_source: 'loja', utm_campaign: 'lj-vpr-01' } } }), 'lj-vpr-01');
  assert.equal(codigoLojaDoCadastro({ origem_utm: { primeiro_toque: { utm_source: 'google', utm_campaign: 'lj-vpr-01' } } }), null);
  assert.equal(codigoLojaDoCadastro({ origem_utm: { primeiro_toque: { utm_source: 'loja' } } }), '(sem código)');
  for (const vazio of [undefined, null, {}, { origem_utm: 'x' }, { origem_utm: { primeiro_toque: null } }]) assert.equal(codigoLojaDoCadastro(vazio), null);
});

await caso('contagem: cadastros, últimos 7 dias, já orçaram; internas fora e contadas à parte; sem id na saída', () => {
  const usuarios = [
    { id: ID(1), created_at: dias(1), user_metadata: loja('lj-vpr-01') },
    { id: ID(2), created_at: dias(10), user_metadata: loja('lj-vpr-01') },
    { id: ID(3), created_at: dias(2), user_metadata: loja('lj-tst-00') }, // conta interna (cadastro TESTE)
    { id: ID(4), created_at: dias(1), user_metadata: loja('lj-vpr-1') }, // erro de digitação no cartaz
    { id: ID(5), created_at: dias(1), user_metadata: loja('lj-zzz-09') }, // formato certo, fora da lista
    { id: ID(6), created_at: dias(1), user_metadata: {} }, // sem origem
    { id: ID(7), created_at: dias(1) },
  ];
  const r = contarPorLoja({ usuarios, idsInternas: new Set([ID(3)]), idsComOrcamento: new Set([ID(2), ID(3)]), lojas: LOJAS, agoraMs: AGORA });
  const a = r.lojas.find((l) => l.codigo === 'lj-vpr-01');
  assert.deepEqual([a.cadastros, a.cadastros7, a.orcaram, a.internas], [2, 1, 1, 0]);
  const t = r.lojas.find((l) => l.codigo === 'lj-tst-00');
  assert.deepEqual([t.cadastros, t.internas, t.teste], [0, 1, true]);
  assert.equal(r.internasFora, 1);
  assert.deepEqual(r.desconhecidos, [{ codigo: '(fora do formato)', cadastros: 1 }, { codigo: 'lj-zzz-09', cadastros: 1 }]);
  assert.equal(r.orcamentosEstado, 'ok');
  assert.ok(!JSON.stringify(r).includes('00000000-0000-4000'), 'nenhum user_id sai na resposta');
});

await caso('orçamentos ilegíveis: "Já orçaram" vira null (nunca zero); loja sem cadastro aparece com 0', () => {
  const r = contarPorLoja({ usuarios: [], idsInternas: new Set(), idsComOrcamento: null, lojas: LOJAS, agoraMs: AGORA });
  assert.equal(r.orcamentosEstado, 'indisponivel');
  assert.ok(r.lojas.every((l) => l.orcaram === null && l.cadastros === 0));
});

await caso('lista fixa: códigos no formato lj-<região>-<2 dígitos>, sem repetição, sem nome de pessoa no código', () => {
  const codigos = LOJAS_PARCEIRAS.map((l) => l.codigo);
  assert.equal(new Set(codigos).size, codigos.length);
  for (const c of codigos) assert.match(c, FORMATO_CODIGO_LOJA);
  assert.ok(Object.isFrozen(LOJAS_PARCEIRAS));
});

await caso('rota: só admin com aal2; contas ilegíveis e internas ilegíveis viram 503 (nunca zero)', () => {
  const src = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
  const rota = src.split("p === '/admin/api/lojas'")[1].split('lojasParceiras(env)')[0];
  assert.match(rota, /return exigir\(user, 'admin', \{ aal2: true \}\) \|\| /);
  const fn = src.split('async function lojasParceiras(env)')[1].split('\nasync function ')[0];
  assert.match(fn, /usuarios_ilegiveis' \}, 503\)/);
  assert.match(fn, /contas_internas_ilegiveis' \}, 503\)/);
  assert.match(fn, /orcs\.ok \? new Set/);
});

await caso('tela: aba "Lojas" na navegação, no roteamento, e o script do painel compila', async () => {
  const { adminHtml } = await import('../src/adminPagina.js');
  const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }, 'n');
  const script = html.split('<script nonce="n">')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("{id:'lojas',rot:'Lojas'") && script.includes('lojas:carregarLojas'));
  assert.ok(html.includes('id="v-lojas"'));
  assert.ok(script.includes("api('lojas')"));
  assert.ok(script.includes("x.orcaram===null?'—'"), 'orçamento ilegível aparece como —, nunca 0');
});

console.log(`\n${ok} casos ok`);
