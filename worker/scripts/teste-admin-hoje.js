/**
 * Teste de "O que fazer hoje" do painel ADM (src/adminHoje.js + rota em admin.js + tela em adminPagina.js + migration).
 *
 *     node scripts/teste-admin-hoje.js   (de dentro de worker/)
 *
 * Protege: número que não deu para ler é "indisponível", nunca zero; linha torta é descartada; nenhuma resposta leva
 * e-mail de cliente; a RPC só roda para service_role e é a única leitura; a rota exige admin com aal2; a tela compila,
 * mostra o aviso vermelho só com problema real e a paleta nova passa AA nos pares principais.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { lerHoje, normalizarHoje, rotaHoje } from '../src/adminHoje.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40) };
const lerArq = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const BRUTO = () => ({
  geradoEm: '2026-11-10T12:00:00Z',
  pixPendentes: { total: 2, itens: [
    { userId: ID(1), plano: 'pro', criadoEm: '2026-11-09T10:00:00Z', venceEm: '2026-11-10T10:00:00Z', vencido: false, nome: 'Ana <b>', empresa: 'Frio Bom', email: 'vazou@x.com' },
    { userId: 'nao-e-uuid', plano: 'pro', criadoEm: '2026-11-09T10:00:00Z' },
  ] },
  limiteGratis: { limite: 5, corteAtivo: false, total: 1, itens: [{ userId: ID(2), envios: 7, nome: 'Beto', empresa: '' }] },
  testesTerminando: { total: 1, itens: [{ userId: ID(3), terminaEm: '2026-11-12T10:00:00Z', nome: 'Caio', empresa: 'Clima' }] },
  mes: { entrouCentavos: 5990, pagantes: 3, testesViraramPagantes: 0 },
  saude: { emailsFalhos24h: { total: 2, porTemplate: [{ template: 'boas_vindas', n: 2 }] }, pixPagoSemPlano: { total: 0, itens: [] } },
});

function fakeFetch(resposta, status = 200) {
  const chamadas = [];
  const fn = async (url, init) => {
    chamadas.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify(resposta), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fn, chamadas };
}

await caso('normaliza: listas ok, linha sem uuid descartada, nome sem < >, e-mail nunca passa', () => {
  const h = normalizarHoje(BRUTO());
  assert.equal(h.pixPendentes.estado, 'ok');
  assert.equal(h.pixPendentes.total, 2);
  assert.equal(h.pixPendentes.itens.length, 1, 'uuid inválido descartado');
  assert.equal(h.pixPendentes.itens[0].nome, 'Ana b');
  assert.equal(h.limiteGratis.limite, 5);
  assert.equal(h.limiteGratis.corteAtivo, false);
  assert.equal(h.testesTerminando.itens[0].userId, ID(3));
  assert.equal(h.mes.entrouCentavos, 5990);
  assert.ok(!JSON.stringify(h).includes('@'), 'nenhum e-mail na resposta');
});

await caso('indisponível nunca vira zero: bloco nulo, total inválido e número nulo', () => {
  const b = BRUTO();
  b.pixPendentes = null;
  b.limiteGratis = { total: 'x', itens: [] };
  b.testesTerminando = { total: 0, itens: [] };
  b.mes = { entrouCentavos: null, pagantes: null, testesViraramPagantes: 0 };
  b.saude = { emailsFalhos24h: null, pixPagoSemPlano: null };
  const h = normalizarHoje(b);
  assert.equal(h.pixPendentes.estado, 'indisponivel');
  assert.equal(h.limiteGratis.estado, 'indisponivel');
  assert.equal(h.testesTerminando.estado, 'ok');
  assert.equal(h.testesTerminando.total, 0, 'zero real continua zero');
  assert.equal(h.mes.entrouCentavos, null);
  assert.equal(h.mes.pagantes, null);
  assert.equal(h.mes.testesViraramPagantes, 0);
  assert.equal(h.saude.emailsFalhos24h.estado, 'indisponivel');
  assert.equal(h.saude.pixPagoSemPlano.estado, 'indisponivel');
  assert.throws(() => normalizarHoje(null), /resposta_invalida/);
});

await caso('lerHoje chama só a RPC admin_hoje com os e-mails internos em minúsculo', async () => {
  const { fn, chamadas } = fakeFetch(BRUTO());
  const h = await lerHoje(ENV, { emailsExcluidos: [' DONO@Exemplo.com ', ''], fetchImpl: fn });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://x.supabase.co/rest/v1/rpc/admin_hoje');
  assert.deepEqual(chamadas[0].body, { p_emails_excluidos: ['dono@exemplo.com'] });
  assert.equal(h.pixPendentes.total, 2);
});

await caso('rota: ok devolve hoje; banco fora = 503 banco_indisponivel; 404 = hoje_sem_migration; sem config = 503', async () => {
  const r1 = await rotaHoje(ENV, { fetchImpl: fakeFetch(BRUTO()).fn });
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.equal(j1.ok, true);
  assert.equal(r1.headers.get('Cache-Control'), 'no-store');
  const r2 = await rotaHoje(ENV, { fetchImpl: fakeFetch({ message: 'x' }, 500).fn });
  assert.equal(r2.status, 503);
  assert.equal((await r2.json()).erro, 'banco_indisponivel');
  const r3 = await rotaHoje(ENV, { fetchImpl: fakeFetch({ message: 'x' }, 404).fn });
  assert.equal((await r3.json()).erro, 'hoje_sem_migration');
  const r4 = await rotaHoje({}, {});
  assert.equal((await r4.json()).erro, 'supabase_nao_configurado');
  const r5 = await rotaHoje(ENV, { fetchImpl: async () => { throw new Error('rede'); } });
  assert.equal(r5.status, 503);
});

await caso('rota GET /admin/api/hoje exige admin com aal2 e passa os e-mails internos', () => {
  const src = lerArq('../src/admin.js');
  const i = src.indexOf("p === '/admin/api/hoje'");
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 220), /exigir\(user, 'admin', \{ aal2: true \}\)/);
  assert.match(src.slice(i, i + 260), /rotaHoje\(env, \{ emailsExcluidos: emailsForaDoFunil\(env\) \}\)/);
});

await caso('migration: timestamp novo, SECURITY DEFINER, search_path vazio, só service_role, sem e-mail', () => {
  const nomes = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((n) => n.includes('admin_hoje'));
  assert.equal(nomes.length, 1);
  assert.ok(nomes[0].slice(0, 14) > '20261109090000');
  const sql = lerArq(`../../supabase/migrations/${nomes[0]}`);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.admin_hoje\(text\[\]\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.admin_hoje\(text\[\]\) to service_role;/);
  assert.ok(!/grant[^;]*\bto\s+(anon|authenticated|public)\b/i.test(sql));
  assert.ok(!/auth\.users|\.email\b|recipient/.test(sql), 'não lê e-mail de cliente');
  assert.match(sql, /date_trunc\('month', pg_catalog\.timezone\('UTC', pg_catalog\.now\(\)\)\)::date/, 'período do limite = mês UTC');
  assert.match(sql, /limite_gratis_config/);
  assert.match(sql, /e\.estado = 'confirmado'/);
  assert.match(sql, /tc\.estado = 'active'[^;]*interval '3 days'/);
  assert.match(sql, /descartado_antes_do_envio/, 'descarte intencional não é problema');
  // nomes de objeto sempre qualificados (search_path vazio): nenhum "from <tabela>" sem esquema
  const corpo = sql.replace(/--.*$/gm, '').replace(/revoke all[^;]*;/g, '');
  const semEsquema = [...corpo.matchAll(/\b(?:from|join)\s+([a-z_]+)\b(?!\.)/gi)].map((m) => m[1].toLowerCase())
    .filter((n) => !['pend', 'cobr', 'envios', 'bateu', 'f', 'f2', 't', 'x', 'v', 'pend', 'lateral', 'select', 'unnest'].includes(n));
  assert.deepEqual(semEsquema, []);
});

await caso('tela: compila, tem o bloco, o alerta só com problema real, e as cores novas', async () => {
  const { adminHtml } = await import('../src/adminPagina.js');
  const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }, 'n');
  const script = html.split('<script nonce="n">')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("api('hoje')") && script.includes('blocoHoje(box)'));
  assert.ok(script.includes("secTit('O que fazer hoje'") && script.includes("secTit('Números do mês'"));
  assert.ok(/if\(problemas\.length\)\{/.test(script), 'aviso vermelho só se houver problema');
  assert.ok(script.includes("'indisponível'"), 'número ilegível aparece como indisponível');
  assert.ok(script.includes('abrirConta(x.userId)'), 'linha abre a ficha');
  assert.ok(script.includes("location.hash='emails'"), 'atalho para a aba E-mails');
  assert.ok(!script.includes('${'), 'script do cliente sem interpolação');
});

await caso('paleta: tokens do PESQUISA-PAINEL nos dois temas e contraste AA nos pares principais', async () => {
  const { adminHtml } = await import('../src/adminPagina.js');
  const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }, 'n');
  const tokens = (trecho) => Object.fromEntries([...trecho.matchAll(/--([A-Za-z0-9]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2].toUpperCase()]));
  const claro = tokens(html.split(':root{')[1].split('color-scheme:light')[0]);
  const escuroAuto = tokens(html.split('prefers-color-scheme:dark){:root:not([data-theme="light"]){')[1].split('color-scheme:dark')[0]);
  const escuroManual = tokens(html.split(':root[data-theme="dark"]{')[1].split('color-scheme:dark')[0]);
  assert.deepEqual(escuroAuto, escuroManual, 'escuro automático = escuro manual');
  assert.equal(claro.brand, '#B84A0F');
  assert.equal(escuroAuto.brand, '#F28C4B');
  const lum = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pares = [['ink', 'bg'], ['ink', 'surf'], ['mut', 'surf'], ['mut2', 'surf'], ['mut2', 'surf2'], ['brand', 'surf'], ['brand', 'bg'], ['brandInk', 'brand'],
    ['brand', 'navAct'], ['ok', 'okbg'], ['warn', 'warnbg'], ['dng', 'dngbg'], ['info', 'infobg'], ['dng', 'surf']];
  for (const [nome, t] of [['claro', claro], ['escuro', escuroAuto]]) {
    for (const [a, b] of pares) assert.ok(razao(t[a], t[b]) >= 4.5, `${nome} ${a}/${b} = ${razao(t[a], t[b]).toFixed(2)}`);
    assert.ok(razao(t.line2, t.surf) >= 3, `${nome} borda de campo ${razao(t.line2, t.surf).toFixed(2)}`);
  }
});

console.log(`\n${ok} casos ok`);
