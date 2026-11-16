/**
 * Teste da OFERTA do plano Pro (`src/ofertaPro.js` + template `oferta_pro`).
 *
 *     node scripts/teste-oferta-pro.js   (de dentro de worker/)
 *
 * Protege: suprimido, excluído, pago/teste ativo e repetido em 30 dias NÃO saem; ensaio não enfileira;
 * envio real só enfileira quem passou; link de descadastro no HTML e no texto; migration sem grant público.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidirOferta, executarOfertaPro, validarOfertas } from '../src/ofertaPro.js';
import { renderizarEmailLembrete } from '../src/emailLembretesTemplate.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-11-09T12:00:00.000Z');
const BOM = { existe: true, plano: 'gratis', suprimido: false, excluido: false, membroEquipe: false, jaAssinou: false, ofertaRecenteEm: null };
const FATOS = {
  [ID(1)]: BOM,
  [ID(2)]: { ...BOM, suprimido: true },
  [ID(3)]: { ...BOM, excluido: true },
  [ID(4)]: { ...BOM, plano: 'pro' }, // pago OU teste Pro ativo (o banco devolve 'pro' nos dois)
  [ID(5)]: { ...BOM, ofertaRecenteEm: '2026-10-20T12:00:00.000Z' },
  [ID(6)]: { ...BOM, ofertaRecenteEm: '2026-09-01T12:00:00.000Z' }, // fora dos 30 dias: pode
  [ID(7)]: { existe: false },
  [ID(8)]: { ...BOM, membroEquipe: true },
  [ID(9)]: { ...BOM, jaAssinou: true }, // cobrança atrasada/cancelada: plano efetivo diz Grátis
};
const OFERTAS = Object.keys(FATOS).map((userId) => ({
  userId,
  assunto: 'O plano Pro do OLLI não tem limite de envios',
  paragrafos: ['Você já criou 9 orçamentos no OLLI.', 'Para assinar com Pix: entre em app.olliorcamentos.online e abra Planos.'],
}));
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40) };

function fakeFetch() {
  const chamadas = [];
  const fn = async (url, init) => {
    const rpc = url.split('/rpc/')[1];
    const body = JSON.parse(init.body);
    chamadas.push({ rpc, body });
    const json = rpc === 'fatos_oferta_pro'
      ? body.p_user_ids.map((id) => ({ fato: { userId: id, ...FATOS[id] } }))
      : { enfileirado: true, motivo: 'enfileirado' };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fn, chamadas };
}

let ok = 0;
async function caso(nome, fn) { await fn(); ok += 1; console.log(`  ok   ${nome}`); }

await caso('política: cada portão barra pelo motivo certo', () => {
  assert.equal(decidirOferta(FATOS[ID(1)], { agora: AGORA }), 'sairia');
  assert.equal(decidirOferta(FATOS[ID(2)], { agora: AGORA }), 'suprimido');
  assert.equal(decidirOferta(FATOS[ID(3)], { agora: AGORA }), 'excluido');
  assert.equal(decidirOferta(FATOS[ID(4)], { agora: AGORA }), 'nao_e_gratis');
  assert.equal(decidirOferta(FATOS[ID(5)], { agora: AGORA }), 'oferta_recente');
  assert.equal(decidirOferta(FATOS[ID(6)], { agora: AGORA }), 'sairia');
  assert.equal(decidirOferta(FATOS[ID(7)], { agora: AGORA }), 'conta_indisponivel');
  assert.equal(decidirOferta(FATOS[ID(8)], { agora: AGORA }), 'membro_equipe');
  assert.equal(decidirOferta(FATOS[ID(9)], { agora: AGORA }), 'ja_assinou');
  assert.equal(decidirOferta({ ...BOM, jaAssinou: undefined }, { agora: AGORA }), 'ja_assinou', 'fato ausente = barra');
  assert.equal(decidirOferta({ ...BOM, suprimido: undefined }, { agora: AGORA }), 'suprimido', 'fato ausente = barra');
  assert.equal(decidirOferta({ ...BOM, plano: null }, { agora: AGORA }), 'nao_e_gratis');
});

await caso('ensaio (padrão) lista quem sairia e NÃO enfileira', async () => {
  const { fn, chamadas } = fakeFetch();
  const r = await executarOfertaPro(ENV, OFERTAS, { fetchImpl: fn, now: () => AGORA });
  assert.equal(r.modo, 'ensaio');
  assert.deepEqual(r.contagens, { sairia: 2, suprimido: 1, excluido: 1, nao_e_gratis: 1, oferta_recente: 1, conta_indisponivel: 1, membro_equipe: 1, ja_assinou: 1 });
  assert.equal(chamadas.filter((c) => c.rpc === 'enqueue_oferta_pro').length, 0);
});

await caso('envio real enfileira só quem passou; suprimido/excluído/pago/repetido não saem', async () => {
  const { fn, chamadas } = fakeFetch();
  const r = await executarOfertaPro(ENV, OFERTAS, { enviar: true, fetchImpl: fn, now: () => AGORA });
  assert.equal(r.modo, 'envio');
  const enfileirados = chamadas.filter((c) => c.rpc === 'enqueue_oferta_pro').map((c) => c.body.p_user_id);
  assert.deepEqual(enfileirados, [ID(1), ID(6)]);
  assert.equal(r.contagens.enfileirado, 2);
  assert.ok(!JSON.stringify(r).includes('@'), 'saída sem e-mail');
});

await caso('erro de RPC numa conta não derruba o relatório; as outras seguem', async () => {
  const { fn } = fakeFetch();
  const comFalha = async (url, init) => {
    if (url.includes('/rpc/enqueue_oferta_pro') && JSON.parse(init.body).p_user_id === ID(1)) {
      return new Response('{"message":"x"}', { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return fn(url, init);
  };
  const r = await executarOfertaPro(ENV, OFERTAS, { enviar: true, fetchImpl: comFalha, now: () => AGORA });
  assert.equal(r.contagens.erro_rpc, 1);
  assert.equal(r.contagens.enfileirado, 1);
});

await caso('lista torta falha fechado (repetido, id ruim, HTML, vazio, grande)', () => {
  const um = OFERTAS[0];
  for (const lista of [[], [um, um], [{ ...um, userId: 'x' }], [{ ...um, assunto: 'a<b>cdef' }], [{ ...um, paragrafos: [] }],
    [{ ...um, paragrafos: ['<script>'] }], Array.from({ length: 51 }, (_, i) => ({ ...um, userId: ID(100 + i) })),
    [{ ...um, paragrafos: Array.from({ length: 8 }, () => 'ã'.repeat(690)) }]]) {
    assert.throws(() => validarOfertas(lista));
  }
});

const UNSUB = 'https://diagnostico.olliorcamentos.online/email/descadastrar?u=00000000-0000-4000-8000-000000000001&e=lembretes&a=abc';
const INPUT = {
  eventId: `oferta_pro:${ID(1)}:2026-11-09`, template: 'oferta_pro', templateVersion: 'oferta_pro.v1', purpose: 'oferta_pro',
  dados: { assunto: OFERTAS[0].assunto, paragrafos: OFERTAS[0].paragrafos },
  appUrl: 'https://app.olliorcamentos.online', supportUrl: 'https://olliorcamentos.online/ajuda/',
  logoUrl: 'https://olliorcamentos.online/icon-192.png', unsubscribeUrl: UNSUB,
};

await caso('template: assunto/corpo vêm dos dados, link de descadastro em HTML e texto, sem rastreio', () => {
  const e = renderizarEmailLembrete(INPUT);
  assert.equal(e.subject, OFERTAS[0].assunto);
  assert.equal(e.purpose, 'oferta_pro');
  assert.equal(e.unsubscribeUrl, UNSUB);
  assert.ok(e.html.includes(UNSUB.replaceAll('&', '&amp;')) && e.html.includes('Parar de receber lembretes e ofertas</a>'));
  assert.ok(e.text.includes(UNSUB) && e.text.includes('Você já criou 9 orçamentos'));
  assert.ok(!/utm_|pixel|track|<img[^>]*1px/i.test(e.html), 'sem rastreio');
  assert.equal((e.html.match(/<img\b/g) || []).length, 1, 'só o logo');
});

await caso('template falha fechado: chave extra, HTML no texto, sem descadastro', () => {
  assert.throws(() => renderizarEmailLembrete({ ...INPUT, dados: { ...INPUT.dados, extra: 1 } }), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete({ ...INPUT, dados: { ...INPUT.dados, paragrafos: ['<b>x</b>'] } }), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete({ ...INPUT, unsubscribeUrl: 'http://x' }), /unsubscribe_url_invalida/);
  assert.throws(() => renderizarEmailLembrete({ ...INPUT, templateVersion: 'oferta_pro.v9' }), /template_version_divergente/);
});

await caso('migration: só service_role, reconfere portões e catálogo inclui oferta_pro', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261108120000_oferta_pro_email.sql', import.meta.url), 'utf8');
  assert.match(sql, /revoke all on function public\.enqueue_oferta_pro[^;]*from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.enqueue_oferta_pro[^;]*to service_role;/);
  assert.match(sql, /grant execute on function public\.fatos_oferta_pro[^;]*to service_role;/);
  for (const m of ['suprimido', 'excluido', 'membro_equipe', 'ja_assinou', 'nao_e_gratis', 'oferta_recente', 'recebeu_email_24h']) assert.ok(sql.includes(`'${m}'`), m);
  assert.ok(sql.includes("'oferta_pro', 'oferta_pro.v1', 'oferta_pro'") || sql.includes("template = 'oferta_pro' and template_version = 'oferta_pro.v1'"));
  assert.ok(!/grant[^;]*\bto\s+(anon|authenticated|public)\b/i.test(sql), 'nenhum grant a anon/authenticated');
});

console.log(`\n${ok} casos ok`);
