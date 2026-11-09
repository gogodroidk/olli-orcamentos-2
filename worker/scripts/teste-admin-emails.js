/**
 * Teste da aba "E-mails" do painel ADM (src/adminEmails.js + rotas em admin.js + tela em adminPagina.js).
 *
 *     node scripts/teste-admin-emails.js   (de dentro de worker/)
 *
 * Protege: texto da oferta só com fatos da conta (sem e-mail, preço da fonte, limite da fonte); ensaio não audita
 * nem enfileira; envio exige motivo, confirmação igual à seleção e auditoria ANTES de enfileirar; só 'sairia'
 * entra na fila; rotas só para admin com aal2; RPCs só para service_role; a tela compila.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  candidatasOfertaPro,
  enviarOfertaPro,
  primeiroNome,
  resumoEmails,
  textoOfertaPro,
} from '../src/adminEmails.js';
import { validarOfertas } from '../src/ofertaPro.js';
import { PRECO_PRO, reais } from '../../src/services/precosPlanos.ts';
import { LIMITE_ENVIOS_GRATIS_MES } from '../../src/services/planosBase.ts';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-11-10T12:00:00.000Z');
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40) };
const BOM = { existe: true, plano: 'gratis', suprimido: false, excluido: false, membroEquipe: false, jaAssinou: false, ofertaRecenteEm: null };
const CANDIDATAS = {
  [ID(1)]: { userId: ID(1), orcamentos: 11, enviosTotal: 2, enviosMes: 1, nome: 'MARCOS antonio', empresa: 'Bayit climatização', fatos: BOM },
  [ID(2)]: { userId: ID(2), orcamentos: 1, enviosTotal: 0, enviosMes: 0, nome: '123', empresa: null, fatos: BOM },
  [ID(3)]: { userId: ID(3), orcamentos: 9, enviosTotal: 5, enviosMes: 0, nome: 'Ana', empresa: 'X', fatos: { ...BOM, plano: 'pro' } },
  [ID(4)]: { userId: ID(4), orcamentos: 4, enviosTotal: 1, enviosMes: 1, nome: 'Luiz', empresa: 'LH <b>Elétrica</b>', fatos: { ...BOM, suprimido: true } },
};

function fakeFetch({ falhaEnqueue = false } = {}) {
  const chamadas = [];
  const fn = async (url, init) => {
    const rpc = url.split('/rpc/')[1];
    const body = JSON.parse(init.body);
    chamadas.push({ rpc, body });
    let json;
    if (rpc === 'admin_emails_resumo') {
      json = {
        dias: body.p_dias,
        porTemplate: [
          { template: 'boas_vindas', status: 'sent', n: 10 },
          { template: 'boas_vindas', status: 'dead_letter', n: 1 },
          { template: 'oferta_pro', status: 'pending', n: 3 },
        ],
        supressoes: [{ motivo: 'descadastro', n: 2 }, { motivo: 'hard_bounce', n: 1 }],
      };
    } else if (rpc === 'admin_oferta_pro_candidatas') {
      const ids = body.p_user_ids ?? Object.keys(CANDIDATAS);
      json = ids.filter((id) => CANDIDATAS[id]).map((id) => ({ candidata: { ...CANDIDATAS[id], email: 'NAO@DEVE.SAIR' } }));
    } else if (rpc === 'fatos_oferta_pro') {
      json = body.p_user_ids.map((id) => ({ fato: { userId: id, ...CANDIDATAS[id].fatos } }));
    } else if (rpc === 'enqueue_oferta_pro') {
      if (falhaEnqueue) return new Response('{}', { status: 500 });
      json = { enfileirado: true, motivo: 'enfileirado' };
    }
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fn, chamadas };
}

let ok = 0;
async function caso(nome, fn) { await fn(); ok += 1; console.log(`  ok   ${nome}`); }
const corpo = async (r) => ({ status: r.status, j: await r.json() });

await caso('primeiroNome: capitaliza, ignora o que não parece nome', () => {
  assert.equal(primeiroNome('MARCOS antonio'), 'Marcos');
  assert.equal(primeiroNome('joão'), 'João');
  assert.equal(primeiroNome('123'), '');
  assert.equal(primeiroNome('a'), '');
  assert.equal(primeiroNome('x@y.com'), '');
  assert.equal(primeiroNome(null), '');
});

await caso('texto: só fatos da conta, preço e limite da fonte, passa no validador da oferta', () => {
  const t = textoOfertaPro(CANDIDATAS[ID(1)]);
  assert.equal(t.assunto, 'Bayit climatização: o plano Pro do OLLI não tem limite de envios');
  assert.equal(t.paragrafos[0], 'Olá, Marcos!');
  assert.ok(t.paragrafos[1].startsWith('Você já criou 11 orçamentos no OLLI e enviou 2 ao cliente.'));
  assert.ok(t.paragrafos[1].includes(`até ${LIMITE_ENVIOS_GRATIS_MES} envios por mês`));
  assert.ok(t.paragrafos[1].includes(`(${reais(PRECO_PRO.mensalCentavos)}/mês)`));
  assert.ok(!/novembro|este mês você/i.test(JSON.stringify(t)), 'sem contagem do mês');
  const sem = textoOfertaPro(CANDIDATAS[ID(2)]);
  assert.equal(sem.paragrafos[0], 'Olá!');
  assert.equal(sem.assunto, 'O plano Pro do OLLI não tem limite de envios');
  assert.ok(sem.paragrafos[1].startsWith('Você já criou 1 orçamento no OLLI.'));
  const html = textoOfertaPro(CANDIDATAS[ID(4)]);
  assert.ok(!/[<>]/.test(html.assunto), 'empresa sem HTML');
  assert.equal(validarOfertas([{ userId: ID(1), ...t }, { userId: ID(2), ...sem }, { userId: ID(4), ...html }]).length, 3);
});

await caso('resumo: sent=enviado, dead_letter=falhou, resto=na fila; supressões por motivo', async () => {
  const { fn } = fakeFetch();
  const r = await resumoEmails(ENV, { dias: 7, fetchImpl: fn });
  const bv = r.tipos.find((x) => x.template === 'boas_vindas');
  assert.deepEqual([bv.enviados, bv.falhos, bv.naFila, bv.total], [10, 1, 0, 11]);
  assert.equal(r.tipos.find((x) => x.template === 'oferta_pro').naFila, 3);
  assert.deepEqual(r.supressoes, { descadastro: 2, hard_bounce: 1, complaint: 0 });
  await assert.rejects(resumoEmails(ENV, { dias: 0, fetchImpl: fn }), /dias_invalido/);
});

await caso('candidatas: motivo pela política da oferta e nunca o e-mail', async () => {
  const { fn } = fakeFetch();
  const r = await candidatasOfertaPro(ENV, { fetchImpl: fn, now: () => AGORA });
  const m = Object.fromEntries(r.map((c) => [c.userId, c.motivo]));
  assert.deepEqual(m, { [ID(1)]: 'sairia', [ID(2)]: 'sairia', [ID(3)]: 'nao_e_gratis', [ID(4)]: 'suprimido' });
  assert.ok(!JSON.stringify(r).includes('@'), 'sem e-mail na resposta');
});

await caso('ensaio: não audita, não enfileira, devolve o texto de quem sairia', async () => {
  const { fn, chamadas } = fakeFetch();
  let auditou = 0;
  const auditar = async () => { auditou += 1; return true; };
  const { status, j } = await corpo(await enviarOfertaPro(ENV, { id: 'adm' }, { userIds: [ID(1), ID(3)], enviar: false }, { auditar, fetchImpl: fn, now: () => AGORA }));
  assert.equal(status, 200);
  assert.equal(j.modo, 'ensaio');
  assert.deepEqual(j.contagens, { sairia: 1, nao_e_gratis: 1 });
  assert.equal(auditou, 0);
  assert.equal(chamadas.filter((c) => c.rpc === 'enqueue_oferta_pro').length, 0);
  assert.equal(j.textos[ID(1)].paragrafos[0], 'Olá, Marcos!');
});

await caso('envio: exige motivo e confirmação igual à seleção; lista torta = 400', async () => {
  const { fn } = fakeFetch();
  const auditar = async () => true;
  const base = { userIds: [ID(1), ID(2)], enviar: true };
  assert.equal((await enviarOfertaPro(ENV, {}, { ...base, confirmar: 2 }, { auditar, fetchImpl: fn })).status, 400);
  assert.equal((await enviarOfertaPro(ENV, {}, { ...base, motivo: 'oferta de segunda', confirmar: 1 }, { auditar, fetchImpl: fn })).status, 409);
  assert.equal((await enviarOfertaPro(ENV, {}, { userIds: [ID(1), ID(1)], enviar: false }, { auditar, fetchImpl: fn })).status, 400);
  assert.equal((await enviarOfertaPro(ENV, {}, { userIds: ['x'], enviar: false }, { auditar, fetchImpl: fn })).status, 400);
  assert.equal((await enviarOfertaPro(ENV, {}, { userIds: Array.from({ length: 51 }, (_, i) => ID(100 + i)), enviar: false }, { auditar, fetchImpl: fn })).status, 400);
});

await caso('envio: sem auditoria nada sai; com auditoria só "sairia" vai para a fila', async () => {
  const semAud = fakeFetch();
  const r1 = await enviarOfertaPro(ENV, {}, { userIds: [ID(1)], enviar: true, motivo: 'oferta de segunda', confirmar: 1 }, { auditar: async () => null, fetchImpl: semAud.fn, now: () => AGORA });
  assert.equal(r1.status, 503);
  assert.equal(semAud.chamadas.filter((c) => c.rpc === 'enqueue_oferta_pro').length, 0);

  const { fn, chamadas } = fakeFetch();
  const auditorias = [];
  const ids = [ID(1), ID(2), ID(3), ID(4), ID(9)]; // ID(9) não tem orçamento: sem_uso
  const { status, j } = await corpo(await enviarOfertaPro(ENV, { id: 'adm' }, { userIds: ids, enviar: true, motivo: 'oferta de segunda', confirmar: 5 }, { auditar: async (_e, _a, x) => { auditorias.push(x); return true; }, fetchImpl: fn, now: () => AGORA }));
  assert.equal(status, 200);
  assert.equal(auditorias.length, 1);
  assert.equal(auditorias[0].acao, 'email_oferta_pro_enviar');
  assert.deepEqual(chamadas.filter((c) => c.rpc === 'enqueue_oferta_pro').map((c) => c.body.p_user_id), [ID(1), ID(2)]);
  assert.deepEqual(j.contagens, { enfileirado: 2, nao_e_gratis: 1, suprimido: 1, sem_uso: 1 });
  assert.equal(j.textos, undefined, 'envio não devolve texto');
});

await caso('rotas: as três exigem admin com aal2; envio passa a auditoria', () => {
  const src = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
  for (const rota of ['/admin/api/emails/resumo', '/admin/api/emails/oferta-pro/candidatas', '/admin/api/emails/oferta-pro/enviar']) {
    const i = src.indexOf(`p === '${rota}'`);
    assert.ok(i > 0, rota);
    assert.match(src.slice(i, i + 220), /exigir\(user, 'admin', \{ aal2: true \}\)/, rota);
  }
  assert.match(src, /enviarOfertaPro\(env, user, body, \{ auditar \}\)/);
});

await caso('migration: RPCs só para service_role', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261109090000_admin_emails.sql', import.meta.url), 'utf8');
  for (const f of ['admin_emails_resumo\\(integer\\)', 'admin_oferta_pro_candidatas\\(uuid\\[\\], integer\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${f} from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${f} to service_role;`));
  }
  assert.ok(!/grant[^;]*\bto\s+(anon|authenticated|public)\b/i.test(sql));
  assert.ok(!/u\.email|auth\.users/.test(sql.split('admin_oferta_pro_candidatas')[1]), 'candidatas não lê e-mail');
});

await caso('tela: aba E-mails na navegação, no roteamento, e o script do painel compila', async () => {
  const { adminHtml } = await import('../src/adminPagina.js');
  const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }, 'n');
  const script = html.split('<script nonce="n">')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("{id:'emails',rot:'E-mails'") && script.includes('emails:carregarEmails'));
  assert.ok(html.includes('id="v-emails"'));
  assert.ok(script.includes("digitar:String(ids.length)"), 'envio pede para digitar a quantidade');
});

console.log(`\n${ok} casos ok`);
