/**
 * Funil de receita no painel ADMIN — formato da resposta e rotas.
 *
 *     node worker/scripts/teste-funil-receita.js   (da raiz ou de worker/)
 * Exit 0 = passou; 1 = falhou.
 *
 * A lógica de coorte (SQL) é testada de verdade em scripts/teste-funil-receita-sql.ts
 * (PGlite). Aqui se prende o que o worker faz com ela:
 *  - "não sei" nunca vira zero: degrau sem linha = null; RPC fora = 503 com o
 *    motivo (sem migration / indisponível); formato estranho = 502;
 *  - taxa de conversão = com_anterior / no_anterior, sem divisão por zero;
 *  - o e-mail do dono (ADMIN_EMAIL) vai como exclusão; nenhum e-mail sai na resposta;
 *  - rotas exigem papel admin + MFA (AAL2) antes de qualquer consulta service-role;
 *  - marcar conta interna exige motivo, grava por user_id e deixa auditoria.
 */
import {
  DEGRAUS_FUNIL,
  FUNIL_SEMANAS_MAX,
  FUNIL_SEMANAS_PADRAO,
  montarFunil,
  semanasFunil,
  taxaConversao,
} from '../src/funilReceita.js';
import { handleAdmin } from '../src/admin.js';

let ok = 0;
let falhas = 0;
function checar(nome, condicao, detalhe = '') {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}
function lanca(fn) {
  try { fn(); return false; } catch { return true; }
}

// Linhas como a RPC devolve (PostgREST: numeric vem como número).
function linha(semana, degrau, contas, noAnterior, comAnterior, medAnt = null, medCad = null) {
  return {
    semana, degrau_ordem: DEGRAUS_FUNIL.find((d) => d.chave === degrau).ordem, degrau, contas,
    contas_no_anterior: noAnterior, contas_com_anterior: comAnterior,
    mediana_horas_desde_anterior: medAnt, mediana_horas_desde_cadastro: medCad,
  };
}
const CHAVES = DEGRAUS_FUNIL.map((d) => d.chave);
function coorte(semana, contas) {
  return CHAVES.map((c, i) => linha(semana, c, contas[i], i ? contas[i - 1] : null, i ? Math.min(contas[i], contas[i - 1]) : null, i ? 1.5 : null, i ? 10 : 0));
}

console.log('\nFunil de receita — forma da resposta');
const linhas = [
  ...coorte(null, [5, 4, 2, 2, 3, 2, 2, 1, 1]),
  ...coorte('2026-09-07', [3, 2, 1, 2, 2, 1, 1, 1, 1]),
  ...coorte('2026-09-14', [2, 2, 1, 0, 1, 1, 1, 0, 0]),
];
const f = montarFunil(linhas, [{ regra: 'dono', contas: 1 }, { regra: 'lista_interna', contas: 2 }], 12);
checar('9 degraus na ordem canônica', f.degraus.map((d) => d.chave).join() === CHAVES.join());
checar('total com 9 células', f.total.length === 9 && f.total[0].contas === 5);
checar('coortes da mais recente para a mais antiga', f.coortes.map((c) => c.semana).join() === '2026-09-14,2026-09-07');
checar('cadastro não tem taxa', f.total[0].taxa === null);
checar('taxa = com_anterior / no_anterior (entrou 4 de 5 = 80%)', f.total[1].taxa === 80);
checar('degrau com denominador 0 não tem taxa (sem divisão por zero)', f.coortes[0].degraus[4].taxa === null, JSON.stringify(f.coortes[0].degraus[4]));
checar('mediana chega como número', f.total[1].medianaHorasAnterior === 1.5 && f.total[1].medianaHorasCadastro === 10);
checar('exclusões com rótulo e total', f.contasExcluidas === 3 && f.exclusoes[1].rotulo === 'Lista de contas internas');
checar('não é vazio', f.vazio === false);

const faltando = montarFunil(linhas.filter((l) => !(l.semana === '2026-09-14' && l.degrau === 'pagou')), [], 12);
checar('degrau sem linha = null (não sei), nunca 0', faltando.coortes[0].degraus[8] === null);
const vazio = montarFunil([], [], 12);
checar('janela sem cadastro = vazio, total null', vazio.vazio === true && vazio.total.every((c) => c === null) && vazio.coortes.length === 0);

checar('formato não-lista lança', lanca(() => montarFunil(null, [])) && lanca(() => montarFunil([], {})));
checar('degrau desconhecido lança', lanca(() => montarFunil([{ ...linhas[0], degrau: 'inventado' }], [])));
checar('contagem negativa lança', lanca(() => montarFunil([{ ...linhas[0], contas: -1 }], [])));
checar('contagem ausente lança (não vira 0)', lanca(() => montarFunil([{ ...linhas[0], contas: null }], [])));
checar('semana malformada lança', lanca(() => montarFunil([{ ...linhas[9], semana: '07/09/2026' }], [])));
checar('linha duplicada lança', lanca(() => montarFunil([linhas[0], linhas[0]], [])));
checar('regra de exclusão desconhecida lança', lanca(() => montarFunil([], [{ regra: 'x', contas: 1 }])));
checar('taxaConversao(0, 0) = null', taxaConversao(0, 0) === null && taxaConversao(1, 3) === 33);

checar('semanas: padrão 12', semanasFunil(null) === FUNIL_SEMANAS_PADRAO && semanasFunil('abc') === 12 && semanasFunil('0') === 12);
checar('semanas: teto 104', semanasFunil('500') === FUNIL_SEMANAS_MAX && semanasFunil('8') === 8);

// ── Rotas ────────────────────────────────────────────────────────────────
console.log('\nFunil de receita — rotas do painel');
function token(aal) {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal, sub: '11111111-1111-4111-8111-111111111111' })}.x`;
}
const env = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: '  Dono@Exemplo.com ',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};

const originalFetch = globalThis.fetch;
let modo = 'ok';
let chamadas = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) {
    return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'dono@exemplo.com' }), { status: 200 });
  }
  if (url.includes('/rest/v1/')) chamadas.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
  if (url.endsWith('/rest/v1/rpc/admin_funil_coortes')) {
    if (modo === 'sem_migration') return new Response('{"code":"PGRST202"}', { status: 404 });
    if (modo === 'fora') return new Response('{}', { status: 500 });
    if (modo === 'estranho') return new Response(JSON.stringify([{ degrau: 'inventado', contas: 1 }]), { status: 200 });
    return new Response(JSON.stringify(linhas), { status: 200 });
  }
  if (url.endsWith('/rest/v1/rpc/admin_funil_exclusoes')) {
    return new Response(JSON.stringify([{ regra: 'dono', contas: 1 }]), { status: 200 });
  }
  if (url.includes('/rest/v1/funil_exclusoes')) {
    if (modo === 'tabela_fora') return new Response('{}', { status: 404 });
    if (modo === 'ja_interna' && (init.method || 'GET') === 'POST') return new Response('{}', { status: 409 });
    if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify(modo === 'interna' ? [{ motivo: 'conta de teste' }] : []), { status: 200 });
    return new Response(null, { status: 201 });
  }
  if (url.includes('/rest/v1/admin_audit_log')) return new Response(null, { status: 201 });
  return new Response(JSON.stringify([]), { status: 200 });
};

async function get(path, aal = 'aal2') {
  const url = new URL(`https://api.exemplo/admin/api/${path}`);
  const r = await handleAdmin(new Request(url, { headers: { Authorization: `Bearer ${token(aal)}` } }), env, url);
  return { status: r.status, body: await r.json() };
}
async function post(path, body, aal = 'aal2') {
  const url = new URL(`https://api.exemplo/admin/api/${path}`);
  const r = await handleAdmin(new Request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(aal)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env, url);
  return { status: r.status, body: await r.json() };
}
const ALVO = '22222222-2222-4222-8222-222222222222';

try {
  chamadas = [];
  const aal1 = await get('funil', 'aal1');
  checar('funil exige MFA (AAL2)', aal1.status === 403 && aal1.body.erro === 'mfa_necessario');
  checar('AAL1 não chega ao banco', chamadas.length === 0);

  chamadas = [];
  const r = await get('funil');
  checar('AAL2 recebe o funil', r.status === 200 && r.body.ok === true && r.body.total.length === 9);
  const rpc = chamadas.find((c) => c.url.endsWith('/rpc/admin_funil_coortes'));
  checar('e-mail do dono vai normalizado como exclusão', JSON.stringify(rpc?.body?.p_emails_excluidos) === '["dono@exemplo.com"]', JSON.stringify(rpc?.body));
  checar('janela padrão de 12 semanas', rpc?.body?.p_semanas === 12);
  checar('resposta sem e-mail nem id de usuário', !JSON.stringify(r.body).includes('@') && !JSON.stringify(r.body).includes('1111-4111'));

  chamadas = [];
  await get('funil?semanas=999');
  checar('?semanas é limitado a 104', chamadas.find((c) => c.url.endsWith('/rpc/admin_funil_coortes'))?.body?.p_semanas === 104);

  modo = 'sem_migration';
  const semMig = await get('funil');
  checar('sem migration: 503 dizendo o motivo (não uma tabela de zeros)', semMig.status === 503 && semMig.body.erro === 'funil_sem_migration' && !('total' in semMig.body));
  modo = 'fora';
  const fora = await get('funil');
  checar('banco fora: 503 indisponível', fora.status === 503 && fora.body.erro === 'funil_indisponivel');
  modo = 'estranho';
  const estranho = await get('funil');
  checar('formato inesperado: 502', estranho.status === 502 && estranho.body.erro === 'funil_invalido');
  modo = 'ok';

  chamadas = [];
  const semMotivo = await post(`funil/exclusao?id=${ALVO}`, { excluir: true, motivo: 'x' });
  checar('marcar interna exige motivo', semMotivo.status === 400 && chamadas.length === 0);
  const idRuim = await post('funil/exclusao?id=abc', { excluir: true, motivo: 'conta de teste' });
  checar('id malformado é recusado', idRuim.status === 400);
  const semMfa = await post(`funil/exclusao?id=${ALVO}`, { excluir: true, motivo: 'conta de teste' }, 'aal1');
  checar('marcar interna exige MFA', semMfa.status === 403);

  chamadas = [];
  const marca = await post(`funil/exclusao?id=${ALVO}`, { excluir: true, motivo: 'conta de teste do dono', requestId: 'req-funil-0000001' });
  const insert = chamadas.find((c) => c.url.endsWith('/rest/v1/funil_exclusoes') && c.method === 'POST');
  const audit = chamadas.find((c) => c.url.endsWith('/rest/v1/admin_audit_log'));
  checar('marca por user_id com motivo e autor', marca.status === 200 && insert?.body?.user_id === ALVO && insert?.body?.motivo === 'conta de teste do dono' && insert?.body?.criado_por === '11111111-1111-4111-8111-111111111111');
  checar('marcar deixa auditoria', audit?.body?.acao === 'funil_conta_interna_marcada' && audit?.body?.target_user_id === ALVO && marca.body.auditoria === true);

  modo = 'ja_interna';
  const denovo = await post(`funil/exclusao?id=${ALVO}`, { excluir: true, motivo: 'conta de teste do dono' });
  checar('marcar de novo (409) é idempotente', denovo.status === 200);
  modo = 'ok';

  chamadas = [];
  const volta = await post(`funil/exclusao?id=${ALVO}`, { excluir: false, motivo: 'era cliente real' });
  const del = chamadas.find((c) => c.method === 'DELETE');
  checar('devolver ao funil apaga só daquele user_id', volta.status === 200 && del?.url.endsWith(`/rest/v1/funil_exclusoes?user_id=eq.${ALVO}`));
  checar('devolver também audita', chamadas.some((c) => c.url.endsWith('/admin_audit_log') && c.body?.acao === 'funil_conta_interna_desmarcada'));

  modo = 'interna';
  const detInterna = await get(`user?id=${ALVO}`);
  checar('detalhe diz que a conta é interna', detInterna.body.funil?.estado === 'interna');
  modo = 'ok';
  const detFunil = await get(`user?id=${ALVO}`);
  checar('detalhe diz que a conta está no funil', detFunil.body.funil?.estado === 'no_funil');
  modo = 'tabela_fora';
  const detFora = await get(`user?id=${ALVO}`);
  checar('tabela ilegível = indisponível (não "está no funil")', detFora.body.funil?.estado === 'indisponivel');
  modo = 'ok';

  const htmlUrl = new URL('https://api.exemplo/admin');
  const html = await (await handleAdmin(new Request(htmlUrl), env, htmlUrl)).text();
  checar('painel tem a seção Funil', html.includes("id:'funil',rot:'Funil'") && html.includes('id="v-funil"'));
  checar('painel diz que não sabe quando o funil falha', html.includes('Nenhum número foi zerado'));
  checar('botão de conta interna fica desabilitado quando o estado é desconhecido', html.includes("fe==='indisponivel'?fc(") && html.includes("disabled:!!desligado") && html.includes("()=>{},'',true)"));
} finally {
  globalThis.fetch = originalFetch;
}

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
