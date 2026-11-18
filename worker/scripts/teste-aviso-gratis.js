/**
 * Teste do AVISO aos Grátis (D-2267): template `aviso_gratis` + src/avisoGratis.js.
 *
 *     node scripts/teste-aviso-gratis.js   (de dentro de worker/)
 *
 * Protege: o texto vem EXATAMENTE de avisoMudancaGratis(PRECO_PRO) (nada digitado); descadastro visível em HTML e
 * texto; sem "responda SAIR"; renderer falha fechado; só Grátis ativos saem; suprimido/excluído/pago/já avisado não;
 * ensaio não enfileira; envio em lotes pequenos; saída sem dado pessoal; migration sem grant público.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisoMudancaGratis } from '../../src/services/planosBase.ts';
import { PRECO_PRO, reais } from '../../src/services/precosPlanos.ts';
import { renderizarEmailLembrete } from '../src/emailLembretesTemplate.js';
import { AVISO_GRATIS_DADOS, decidirAviso, executarAvisoGratis } from '../src/avisoGratis.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-11-18T20:00:00.000Z');
const UNSUB = 'https://diagnostico.olliorcamentos.online/email/descadastrar?u=00000000-0000-4000-8000-000000000001&e=lembretes&a=abc';
const INPUT = (extra = {}) => ({
  eventId: `aviso_gratis:${ID(1)}:2026-11-18`, template: 'aviso_gratis', templateVersion: 'aviso_gratis.v1', purpose: 'plan_change_notice',
  dados: { ...AVISO_GRATIS_DADOS }, appUrl: 'https://app.olliorcamentos.online', supportUrl: 'https://olliorcamentos.online/ajuda/',
  logoUrl: 'https://olliorcamentos.online/icon-192.png', unsubscribeUrl: UNSUB, ...extra,
});
const FONTE = avisoMudancaGratis(reais(PRECO_PRO.mensalCentavos));
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let ok = 0;
async function caso(nome, fn) { await fn(); ok += 1; console.log(`  ok   ${nome}`); }

await caso('texto = a fonte: título, assunto e corpo vêm de avisoMudancaGratis(PRECO_PRO), nada digitado', () => {
  const e = renderizarEmailLembrete(INPUT());
  assert.equal(e.purpose, 'plan_change_notice');
  assert.equal(e.subject, FONTE.titulo);
  assert.ok(/^A partir de \d{2}\/\d{2}\/\d{4}, o plano Grátis muda$/.test(FONTE.titulo));
  assert.ok(e.text.includes(FONTE.titulo) && e.text.includes(FONTE.texto), 'texto literal da fonte');
  assert.ok(e.html.includes(esc(FONTE.titulo)) && e.html.includes(esc(FONTE.texto)), 'HTML com o texto da fonte');
  assert.ok(FONTE.texto.includes(`${reais(PRECO_PRO.mensalCentavos)} por mês`), 'preço da fonte de preço');
  assert.ok(/Criar e enviar orçamentos continua grátis/.test(FONTE.texto) && /continua na sua conta/.test(FONTE.texto), 'o que continua grátis e o que fica');
});

await caso('descadastro visível em HTML e texto; sem frase de saída; sem rastreio; só o logo', () => {
  const e = renderizarEmailLembrete(INPUT());
  assert.equal(e.unsubscribeUrl, UNSUB);
  assert.ok(e.html.includes(UNSUB.replaceAll('&', '&amp;')) && e.html.includes('Parar de receber e-mails da OLLI</a>'));
  assert.ok(e.text.includes(UNSUB) && e.text.includes('Você recebe este aviso porque tem uma conta no plano Grátis'));
  assert.ok(!/responda sair|digite sair|quer continuar|sem desconto/i.test(e.html + e.text));
  assert.ok(!/utm_|pixel|track/i.test(e.html));
  assert.equal((e.html.match(/<img\b/g) || []).length, 1);
  assert.ok(e.html.includes('Ver os planos</a>') && e.text.includes('Ver os planos: https://app.olliorcamentos.online/planos'));
});

await caso('renderer falha fechado: dados fora do exato, versão/propósito errados, sem descadastro', () => {
  assert.throws(() => renderizarEmailLembrete(INPUT({ dados: { tipo: 'outro' } })), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ dados: { tipo: 'tranca_gratis_d2267', texto: 'x' } })), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ dados: {} })), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ templateVersion: 'aviso_gratis.v9' })), /template_version_divergente/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ purpose: 'oferta_pro' })), /purpose_invalido/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ unsubscribeUrl: 'http://x' })), /unsubscribe_url_invalida/);
});

const BOM = { existe: true, plano: 'gratis', suprimido: false, excluido: false, avisoEnviadoEm: null };
await caso('política: só Grátis ativo sai; cada portão barra pelo motivo certo', () => {
  assert.equal(decidirAviso(BOM), 'sairia');
  assert.equal(decidirAviso({ existe: false }), 'conta_indisponivel');
  assert.equal(decidirAviso(undefined), 'conta_indisponivel');
  assert.equal(decidirAviso({ ...BOM, suprimido: true }), 'suprimido');
  assert.equal(decidirAviso({ ...BOM, suprimido: null }), 'suprimido', 'dúvida = não sai');
  assert.equal(decidirAviso({ ...BOM, excluido: true }), 'excluido');
  assert.equal(decidirAviso({ ...BOM, plano: 'pro' }), 'nao_e_gratis');
  assert.equal(decidirAviso({ ...BOM, plano: null }), 'nao_e_gratis');
  assert.equal(decidirAviso({ ...BOM, avisoEnviadoEm: '2026-11-18T10:00:00Z' }), 'ja_avisado');
});

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40) };
function mundo(total) {
  // 1..total: a cada 10ª conta é suprimida, a cada 7ª é Pro, a cada 13ª já foi avisada; resto Grátis ativo.
  const fatos = {};
  for (let n = 1; n <= total; n += 1) {
    fatos[ID(n)] = { ...BOM, suprimido: n % 10 === 0, plano: n % 7 === 0 ? 'pro' : 'gratis', avisoEnviadoEm: n % 13 === 0 ? '2026-11-18T10:00:00Z' : null };
  }
  return fatos;
}
function fakeFetch(fatos) {
  const chamadas = [];
  const fn = async (url, init) => {
    const rpc = url.split('/rpc/')[1];
    const body = JSON.parse(init.body);
    chamadas.push({ rpc, body });
    let json;
    if (rpc === 'contas_para_aviso_gratis') json = Object.keys(fatos).map((user_id) => ({ user_id }));
    else if (rpc === 'fatos_aviso_gratis') json = body.p_user_ids.map((id) => ({ fato: { userId: id, ...fatos[id] } }));
    else json = { enfileirado: true, motivo: 'enfileirado' };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fn, chamadas };
}
const esperado = (total) => {
  const c = {};
  for (let n = 1; n <= total; n += 1) {
    const m = n % 10 === 0 ? 'suprimido' : n % 7 === 0 ? 'nao_e_gratis' : n % 13 === 0 ? 'ja_avisado' : 'sairia';
    c[m] = (c[m] || 0) + 1;
  }
  return c;
};

await caso('ensaio: lê em blocos de 100, não enfileira, conta quem sairia e quem não', async () => {
  const f = mundo(230);
  const { fn, chamadas } = fakeFetch(f);
  const r = await executarAvisoGratis(ENV, { fetchImpl: fn, now: () => AGORA });
  assert.equal(r.modo, 'ensaio');
  assert.equal(r.total, 230);
  assert.deepEqual(r.contagens, esperado(230));
  assert.deepEqual(chamadas.map((c) => c.rpc), ['contas_para_aviso_gratis', 'fatos_aviso_gratis', 'fatos_aviso_gratis', 'fatos_aviso_gratis']);
  assert.ok(chamadas.filter((c) => c.rpc === 'fatos_aviso_gratis').every((c) => c.body.p_user_ids.length <= 100));
});

await caso('envio em lote pequeno: no máximo `lote` por execução, o resto fica para o próximo', async () => {
  const f = mundo(60);
  const { fn, chamadas } = fakeFetch(f);
  const r = await executarAvisoGratis(ENV, { fetchImpl: fn, now: () => AGORA, enviar: true, lote: 5 });
  const enq = chamadas.filter((c) => c.rpc === 'enqueue_aviso_gratis');
  assert.equal(enq.length, 5);
  assert.ok(enq.every((c) => JSON.stringify(c.body.p_template_dados) === JSON.stringify({ tipo: 'tranca_gratis_d2267' })), 'só o tipo, nenhum texto');
  assert.equal(r.contagens.enfileirado, 5);
  assert.equal(r.contagens.fica_para_o_proximo_lote, esperado(60).sairia - 5);
  assert.equal(r.lote, 5);
  // quem foi barrado nunca chega no enqueue
  const ids = new Set(enq.map((c) => c.body.p_user_id));
  for (const [id, fato] of Object.entries(f)) if (decidirAviso(fato) !== 'sairia') assert.equal(ids.has(id), false);
});

await caso('saída e log sem dado pessoal; erro numa conta não derruba as outras; lote inválido falha', async () => {
  const f = mundo(5);
  const fn = async (url, init) => {
    const rpc = url.split('/rpc/')[1];
    const body = JSON.parse(init.body);
    if (rpc === 'enqueue_aviso_gratis' && body.p_user_id === ID(1)) return new Response('boom', { status: 500 });
    const json = rpc === 'contas_para_aviso_gratis' ? Object.keys(f).map((user_id) => ({ user_id }))
      : rpc === 'fatos_aviso_gratis' ? body.p_user_ids.map((id) => ({ fato: { userId: id, ...f[id] } })) : { enfileirado: true, motivo: 'enfileirado' };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const r = await executarAvisoGratis(ENV, { fetchImpl: fn, now: () => AGORA, enviar: true, lote: 50 });
  assert.equal(r.contagens.erro_rpc, 1);
  assert.ok(r.contagens.enfileirado >= 3);
  const saida = JSON.stringify(r);
  assert.ok(!/@|00000000-0000|x@x/.test(saida), 'sem e-mail nem id');
  await assert.rejects(() => executarAvisoGratis(ENV, { fetchImpl: fn, lote: 0 }), /lote_invalido/);
  await assert.rejects(() => executarAvisoGratis(ENV, { fetchImpl: fn, lote: 51 }), /lote_invalido/);
  await assert.rejects(() => executarAvisoGratis({}, { fetchImpl: fn }), /supabase_nao_configurado/);
});

await caso('migration: só service_role, catálogo com `aviso_gratis`, texto fora do banco, opt-out por telefone, teto 24 h', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261118150000_email_aviso_gratis.sql', import.meta.url), 'utf8').replaceAll('\r', '');
  for (const fn of ['enqueue_aviso_gratis(uuid, jsonb, integer, timestamptz)', 'fatos_aviso_gratis(uuid[], timestamptz)', 'contas_para_aviso_gratis(integer)']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to service_role`), fn);
  }
  assert.ok(!/grant execute on function [^;]* to (anon|authenticated|public)/i.test(sql));
  assert.ok(sql.includes("template = ''aviso_gratis'' and template_version = ''aviso_gratis.v1'' and purpose = ''plan_change_notice''"));
  assert.ok(sql.includes('{"tipo": "tranca_gratis_d2267"}') && !/A partir de|passam a ser do Pro/.test(sql), 'o texto não mora no banco');
  assert.ok(sql.includes('n.telefone = (') && sql.includes('email_recebeu_ultimas_24h') && sql.includes('whatsapp_nao_contatar'));
  assert.ok(!/drop table|delete from|truncate/i.test(sql));
});

console.log(`teste-aviso-gratis: ${ok} casos ok`);
