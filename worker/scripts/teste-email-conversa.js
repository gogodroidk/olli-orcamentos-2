/**
 * Teste do e-mail de CONVERSA (D-2233): template `conversa` + modelo `conversa` do ofertaPro.js.
 *
 *     node scripts/teste-email-conversa.js   (de dentro de worker/)
 *
 * Protege: sem botão de plano e sem título grande; descadastro em HTML e texto; renderer falha fechado;
 * frases que o Igor proibiu não passam; usa as RPCs próprias (nunca as do oferta_pro); opt-out e repetição
 * barram; ensaio não enfileira; `oferta_pro` segue igual (com botão); migration sem grant público.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidirOferta, executarOfertaPro, FRASES_PROIBIDAS, validarOfertas } from '../src/ofertaPro.js';
import { renderizarEmailLembrete } from '../src/emailLembretesTemplate.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-11-18T20:00:00.000Z');
const UNSUB = 'https://diagnostico.olliorcamentos.online/email/descadastrar?u=00000000-0000-4000-8000-000000000001&e=lembretes&a=abc';

// Os 2 textos de e-mail do G2/G1 (TEXTO-EMAIL-V2-D-2233.md), com {nome} já preenchido.
const G2 = {
  assunto: 'Ana, seu orçamento ficou pela metade',
  paragrafos: [
    'Oi, Ana! Aqui é da OLLI.',
    'Vi que você montou um orçamento no app e ele não chegou no cliente. O que aconteceu na hora de mandar?',
    'Me conta que eu te ajudo a mandar agora, com a sua marca.',
  ],
};
const G1 = {
  assunto: 'Ana, que tipo de serviço você faz?',
  paragrafos: [
    'Oi, Ana! Aqui é da OLLI.',
    'Vi que você criou sua conta esses dias. Que tipo de serviço você faz?',
    'Pergunto pra te mostrar o jeito mais rápido de montar o primeiro orçamento e mandar pro seu cliente.',
  ],
};
const INPUT = (dados, extra = {}) => ({
  eventId: `conversa:${ID(1)}:2026-11-18`, template: 'conversa', templateVersion: 'conversa.v1', purpose: 'conversa',
  dados, appUrl: 'https://app.olliorcamentos.online', supportUrl: 'https://olliorcamentos.online/ajuda/',
  logoUrl: 'https://olliorcamentos.online/icon-192.png', unsubscribeUrl: UNSUB, ...extra,
});

let ok = 0;
async function caso(nome, fn) { await fn(); ok += 1; console.log(`  ok   ${nome}`); }

await caso('template: sem botão, sem link de plano, sem título grande; só 1 imagem (logo)', () => {
  for (const d of [G1, G2]) {
    const e = renderizarEmailLembrete(INPUT(d));
    assert.equal(e.purpose, 'conversa');
    assert.equal(e.subject, d.assunto);
    assert.ok(!e.html.includes('<h1'), 'sem título grande');
    assert.ok(!/Ver o plano Pro|Assinar o Pro|Ver planos|\/planos/.test(e.html + e.text), 'sem botão nem link de plano');
    assert.ok(!e.html.includes('min-height:44px'), 'sem botão');
    assert.ok(e.text.startsWith('Oi, Ana! Aqui é da OLLI.'), 'o texto abre como mensagem de pessoa');
    assert.ok(!/R\$|desconto|ilimitad|limite|cota/i.test(e.html + e.text), 'sem preço, desconto ou limite');
    assert.equal((e.html.match(/<img\b/g) || []).length, 1, 'só o logo');
    assert.ok(!/utm_|pixel|track/i.test(e.html), 'sem rastreio');
  }
});

await caso('template: descadastro visível no HTML e no texto, com o link assinado', () => {
  const e = renderizarEmailLembrete(INPUT(G2));
  assert.equal(e.unsubscribeUrl, UNSUB);
  assert.ok(e.html.includes(UNSUB.replaceAll('&', '&amp;')) && e.html.includes('Parar de receber e-mails da OLLI</a>'));
  assert.ok(e.text.includes(UNSUB) && e.text.includes('Parar de receber e-mails da OLLI'));
  assert.ok(e.text.includes('Você recebe este e-mail porque tem uma conta na OLLI.'));
});

await caso('template falha fechado: chave extra, HTML, versão/propósito errados, sem descadastro, muito parágrafo', () => {
  assert.throws(() => renderizarEmailLembrete(INPUT({ ...G1, extra: 1 })), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ ...G1, paragrafos: ['<b>x</b>'] })), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete(INPUT({ ...G1, paragrafos: Array.from({ length: 6 }, () => 'oi') })), /dados_invalidos/);
  assert.throws(() => renderizarEmailLembrete(INPUT(G1, { templateVersion: 'conversa.v9' })), /template_version_divergente/);
  assert.throws(() => renderizarEmailLembrete(INPUT(G1, { purpose: 'oferta_pro' })), /purpose_invalido/);
  assert.throws(() => renderizarEmailLembrete(INPUT(G1, { unsubscribeUrl: 'http://x' })), /unsubscribe_url_invalida/);
});

await caso('oferta_pro NÃO mudou: segue com título e o botão "Ver o plano Pro"', () => {
  const e = renderizarEmailLembrete({ ...INPUT(G1), template: 'oferta_pro', templateVersion: 'oferta_pro.v1', purpose: 'oferta_pro' });
  assert.ok(e.html.includes('<h1') && e.html.includes('Ver o plano Pro</a>'));
  assert.ok(e.text.includes('Ver o plano Pro: https://app.olliorcamentos.online/planos'));
});

await caso('lista: os textos G1/G2 passam; frase proibida, texto grande e modelo torto não', () => {
  assert.equal(validarOfertas([{ userId: ID(1), ...G1 }, { userId: ID(2), ...G2 }], 'conversa').length, 2);
  for (const f of FRASES_PROIBIDAS) {
    assert.throws(() => validarOfertas([{ userId: ID(1), ...G1, paragrafos: [`Oi! ${f.toUpperCase()} hoje.`] }], 'conversa'), /frase_proibida/, f);
  }
  // acento e caixa não escapam
  assert.throws(() => validarOfertas([{ userId: ID(1), ...G1, paragrafos: ['Preço da tabela, sem desconto.'] }], 'conversa'), /frase_proibida/);
  assert.throws(() => validarOfertas([{ userId: ID(1), ...G1, paragrafos: ['Quer continuar?'] }], 'conversa'), /frase_proibida/);
  assert.throws(() => validarOfertas([{ userId: ID(1), ...G1, paragrafos: ['ã'.repeat(400), 'ã'.repeat(400)] }], 'conversa'), /texto_grande_demais/);
  assert.throws(() => validarOfertas([{ userId: ID(1), ...G1 }], 'outro'), /modelo_invalido/);
  // o modelo antigo não ganhou a regra (comportamento de sempre)
  assert.equal(validarOfertas([{ userId: ID(1), ...G1, paragrafos: ['O Pro é ilimitado.'] }]).length, 1);
});

const BOM = { existe: true, plano: 'gratis', suprimido: false, excluido: false, membroEquipe: false, jaAssinou: false, ofertaRecenteEm: null, conversaRecenteEm: null };
const FATOS = {
  [ID(1)]: BOM,
  [ID(2)]: { ...BOM, suprimido: true }, // e-mail OU pediu para parar no WhatsApp (o banco junta os dois)
  [ID(3)]: { ...BOM, plano: 'pro' },
  [ID(4)]: { ...BOM, conversaRecenteEm: '2026-11-10T12:00:00.000Z' },
  [ID(5)]: { ...BOM, conversaRecenteEm: '2026-09-01T12:00:00.000Z' }, // fora dos 30 dias
  [ID(6)]: { ...BOM, ofertaRecenteEm: '2026-11-15T12:00:00.000Z' }, // oferta do Pro não barra conversa (o teto de 24 h cuida do resto)
  [ID(7)]: { existe: false },
};
await caso('política do modelo conversa: usa conversaRecenteEm; oferta_pro continua usando ofertaRecenteEm', () => {
  const dec = (id, modelo) => decidirOferta(FATOS[id], { agora: AGORA, modelo });
  assert.equal(dec(ID(1), 'conversa'), 'sairia');
  assert.equal(dec(ID(2), 'conversa'), 'suprimido');
  assert.equal(dec(ID(3), 'conversa'), 'nao_e_gratis');
  assert.equal(dec(ID(4), 'conversa'), 'conversa_recente');
  assert.equal(dec(ID(5), 'conversa'), 'sairia');
  assert.equal(dec(ID(6), 'conversa'), 'sairia');
  assert.equal(dec(ID(6), 'oferta_pro'), 'oferta_recente');
  assert.equal(dec(ID(7), 'conversa'), 'conta_indisponivel');
  assert.throws(() => decidirOferta(FATOS[ID(1)], { agora: AGORA, modelo: 'inexistente' }), /modelo_invalido/);
});

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40) };
function fakeFetch() {
  const chamadas = [];
  const fn = async (url, init) => {
    const rpc = url.split('/rpc/')[1];
    const body = JSON.parse(init.body);
    chamadas.push({ rpc, body });
    const json = rpc.startsWith('fatos_')
      ? body.p_user_ids.map((id) => ({ fato: { userId: id, ...FATOS[id] } }))
      : { enfileirado: true, motivo: 'enfileirado' };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fn, chamadas };
}
const LISTA = Object.keys(FATOS).map((userId) => ({ userId, ...G2 }));

await caso('ensaio (conversa): chama só fatos_conversa, não enfileira, mostra quem sairia e quem não', async () => {
  const { fn, chamadas } = fakeFetch();
  const r = await executarOfertaPro(ENV, LISTA, { fetchImpl: fn, now: () => AGORA, modelo: 'conversa' });
  assert.equal(r.modo, 'ensaio');
  assert.equal(r.modelo, 'conversa');
  assert.deepEqual(chamadas.map((c) => c.rpc), ['fatos_conversa']);
  assert.deepEqual(r.contagens, { sairia: 3, suprimido: 1, nao_e_gratis: 1, conversa_recente: 1, conta_indisponivel: 1 });
});

await caso('envio (conversa): enfileira só quem passou, pela RPC enqueue_conversa com o texto da conta', async () => {
  const { fn, chamadas } = fakeFetch();
  const r = await executarOfertaPro(ENV, LISTA, { fetchImpl: fn, now: () => AGORA, enviar: true, modelo: 'conversa' });
  const enq = chamadas.filter((c) => c.rpc === 'enqueue_conversa');
  assert.equal(enq.length, 3);
  assert.ok(enq.every((c) => c.body.p_template_dados.assunto === G2.assunto && c.body.p_template_dados.paragrafos.length === 3));
  assert.equal(chamadas.filter((c) => /oferta_pro/.test(c.rpc)).length, 0, 'nunca toca as RPCs do oferta_pro');
  assert.deepEqual(r.contagens.enfileirado, 3);
});

await caso('padrão (sem modelo) segue chamando as RPCs do oferta_pro', async () => {
  const { fn, chamadas } = fakeFetch();
  await executarOfertaPro(ENV, [{ userId: ID(1), assunto: 'Assunto de teste', paragrafos: ['Oi.'] }], { fetchImpl: fn, now: () => AGORA, enviar: true });
  assert.deepEqual(chamadas.map((c) => c.rpc), ['fatos_oferta_pro', 'enqueue_oferta_pro']);
});

await caso('migration: sem grant público, `conversa` no catálogo, opt-out do WhatsApp e teto de 24 h', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261118140000_email_conversa.sql', import.meta.url), 'utf8').replaceAll('\r', '');
  assert.ok(/revoke all on function public\.enqueue_conversa\(uuid, jsonb, integer, timestamptz\) from public, anon, authenticated/.test(sql));
  assert.ok(/grant execute on function public\.enqueue_conversa\(uuid, jsonb, integer, timestamptz\) to service_role/.test(sql));
  assert.ok(!/grant execute on function [^;]* to (anon|authenticated|public)/i.test(sql));
  assert.ok(sql.includes("template = ''conversa'' and template_version = ''conversa.v1'' and purpose = ''conversa''"));
  assert.ok(sql.includes('whatsapp_nao_contatar') && sql.includes('email_recebeu_ultimas_24h'));
  assert.ok(sql.includes('n.telefone = ('), 'opt-out do WhatsApp também pelo telefone do cadastro');
  assert.ok(!/drop table|delete from|truncate/i.test(sql));
});

console.log(`teste-email-conversa: ${ok} casos ok`);
