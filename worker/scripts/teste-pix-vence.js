/**
 * Teste do lembrete "Pix do plano vence em ~3 h" (P0-08):  node scripts/teste-pix-vence.js  (de dentro de worker/)
 *
 * Protege a decisão pura (janela 1 h–4 h, pago/substituído/suprimido/avisado não recebem, lixo falha
 * fechado), o texto do e-mail (hora real do vencimento, sem preço inventado) e a rodada do job (só com
 * `pix_vence` listado no MODE, antes dos outros tipos, no mesmo teto, e falha do Pix não derruba a régua).
 */
import assert from 'node:assert/strict';
import { decidirPixVence, limiteDoAviso, PIX_VENCE_PLANOS, selecionarPixVence } from '../src/pixVencePolicy.js';
import { renderizarEmailLembrete } from '../src/emailLembretesTemplate.js';
import { processarLembretesEmail } from '../src/emailLembretesJob.js';
import { PLANO_PIX } from '../src/mercadopago.js';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-10-26T15:00:00.000Z'); // 12:00 BRT, hora cheia
const H = 3600e3;
const depois = (ms) => new Date(AGORA.getTime() + ms).toISOString();
const cand = (x = {}) => ({
  userId: U(1), cobrancaId: 'pix_char_fixture1', plano: 'pro_mensal', expiraEm: depois(3.5 * H),
  pago: false, superada: false, suprimido: false, avisadoEm: null, ...x,
});
const mot = (x, agora = AGORA) => decidirPixVence(cand(x), { agora }).motivo;

const originalLog = console.log;
const logs = [];
console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  originalLog(`  ok   ${nome}`);
}

await caso('planos do lembrete = planos vendidos por Pix (PLANO_PIX)', () => {
  assert.deepEqual([...PIX_VENCE_PLANOS].sort(), Object.keys(PLANO_PIX).sort());
});
await caso('vence em 3h30: avisa 1x por cobrança, chave com conta e cobrança', () => {
  const d = decidirPixVence(cand(), { agora: AGORA });
  assert.equal(d.avisar, true);
  assert.equal(d.pedido.idempotencyKey, `reengajamento:${U(1)}:pix_vence:pix_char_fixture1`);
  assert.deepEqual(d.pedido.dados, { tipo: 'pix_vence', cobrancaId: 'pix_char_fixture1', plano: 'pro_mensal', expiraEm: depois(3.5 * H) });
  assert.equal(d.pedido.template, 'lembrete_reengajamento');
});
await caso('janela: >4h = cedo; <=1h = perto demais; 4h exato ainda avisa', () => {
  assert.equal(mot({ expiraEm: depois(4 * H + 1000) }), 'cedo');
  assert.equal(mot({ expiraEm: depois(H) }), 'perto_demais');
  assert.equal(mot({ expiraEm: depois(-H) }), 'perto_demais');
  assert.equal(mot({ expiraEm: depois(4 * H) }), 'pix_vence');
});
await caso('limite igual ao do banco (valores conferidos no Postgres de produção, SELECT puro)', () => {
  const pares = [
    ['2026-10-26T15:00:00Z', '2026-10-26T19:00:00.000Z'],
    ['2026-10-26T21:00:00Z', '2026-10-27T01:00:00.000Z'],
    ['2026-10-26T22:00:00Z', '2026-10-27T12:00:00.000Z'], // 19h BRT: até 09:00 de amanhã
    ['2026-10-27T02:30:00Z', '2026-10-27T12:00:00.000Z'],
    ['2026-12-31T22:00:00Z', '2027-01-01T12:00:00.000Z'], // virada de ano
  ];
  for (const [agora, limite] of pares) assert.equal(limiteDoAviso(new Date(agora)).toISOString(), limite, agora);
});
await caso('cobertura: todo vencimento do dia é avisado por alguma rodada (8h–19h BRT), inclusive madrugada', () => {
  const rodadas = [];
  for (let d = 0; d < 3; d += 1) for (let h = 8; h <= 19; h += 1) rodadas.push(new Date(Date.UTC(2026, 9, 26 + d, h + 3)));
  for (let m = 0; m < 24 * 60; m += 5) {
    const expira = new Date(Date.UTC(2026, 9, 27, 0, m)).toISOString(); // um dia inteiro, de 5 em 5 min
    const avisa = rodadas.some((r) => decidirPixVence(cand({ expiraEm: expira }), { agora: r }).avisar);
    assert.ok(avisa, `sem aviso para ${expira}`);
  }
});
await caso('pago, substituído por Pix mais novo, SAIR e já avisado não recebem', () => {
  assert.equal(mot({ pago: true }), 'pago');
  assert.equal(mot({ superada: true }), 'superada');
  assert.equal(mot({ suprimido: true }), 'suprimido');
  assert.equal(mot({ avisadoEm: depois(-H) }), 'ja_avisado');
});
await caso('lixo falha fechado', () => {
  assert.equal(mot({ expiraEm: 'amanhã' }), 'data_ilegivel');
  assert.equal(mot({ userId: 'x' }), 'candidato_invalido');
  assert.equal(mot({ cobrancaId: 'a b' }), 'candidato_invalido');
  assert.equal(mot({ plano: 'pro' }), 'plano_invalido');
  assert.equal(mot({ pago: undefined }), 'candidato_invalido');
  assert.equal(decidirPixVence(null, { agora: AGORA }).motivo, 'candidato_invalido');
  assert.equal(decidirPixVence(cand(), {}).motivo, 'agora_invalido');
});
await caso('lote: vence primeiro sai primeiro, 1 por conta, teto', () => {
  const r = selecionarPixVence([
    cand({ cobrancaId: 'pix_char_tarde', expiraEm: depois(3.9 * H) }),
    cand({ cobrancaId: 'pix_char_cedo', expiraEm: depois(1.5 * H) }),
    cand({ userId: U(2), cobrancaId: 'pix_char_dois' }),
    cand({ userId: U(3), cobrancaId: 'pix_char_tres' }),
  ], { agora: AGORA, teto: 2 });
  assert.equal(r.pedidos.length, 2);
  assert.equal(r.pedidos[0].dados.cobrancaId, 'pix_char_cedo');
  assert.equal(r.motivos.uma_por_conta, 1);
  assert.equal(r.motivos.teto_da_rodada, 1);
});

const BASE_RENDER = {
  eventId: `reengajamento:${U(1)}:pix_vence:pix_char_fixture1`,
  template: 'lembrete_reengajamento',
  templateVersion: 'lembrete_reengajamento.v1',
  purpose: 'reengagement_reminder',
  appUrl: 'https://app.olliorcamentos.online',
  supportUrl: 'https://olliorcamentos.online/ajuda/',
  logoUrl: 'https://olliorcamentos.online/icon-192.png',
  unsubscribeUrl: 'https://diagnostico.olliorcamentos.online/email/descadastrar?t=abc',
};
await caso('e-mail: hora de Brasília, nome do plano, CTA para planos, sem preço', () => {
  const dados = decidirPixVence(cand({ expiraEm: '2026-10-26T18:30:00.000Z' }), { agora: AGORA }).pedido.dados;
  const r = renderizarEmailLembrete({ ...BASE_RENDER, dados: dados });
  assert.match(r.subject, /Pro \(1 mês\) vence às 15:30/);
  assert.match(r.text, /15:30 de 26\/10 \(segunda\)/);
  assert.match(r.text, /\/planos/);
  assert.doesNotMatch(r.text, /R\$/);
  assert.doesNotMatch(r.html, /pix_char_/); // id da cobrança não aparece para a pessoa
});
await caso('e-mail recusa dados tortos', () => {
  const ruim = { tipo: 'pix_vence', cobrancaId: 'pix_char_x', plano: 'pro_mensal', expiraEm: '2026-10-26T18:30:00Z' };
  assert.throws(() => renderizarEmailLembrete({ ...BASE_RENDER, dados: ruim }));
  assert.throws(() => renderizarEmailLembrete({ ...BASE_RENDER, dados: { ...ruim, expiraEm: '2026-10-26T18:30:00.000Z', plano: 'gold' } }));
  assert.throws(() => renderizarEmailLembrete({ ...BASE_RENDER, dados: { ...ruim, expiraEm: '2026-10-26T18:30:00.000Z', extra: 1 } }));
});

const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
  WELCOME_DISPATCH_MODE: 'production',
  EMAIL_LEMBRETES_MODE: 'production:pix_vence,ativacao',
  EMAIL_LEMBRETES_MAX_POR_RODADA: '2',
  EMAIL_LEMBRETES_TETO_DIARIO: '40',
  EMAIL_DESCADASTRO_URL: 'https://diagnostico.olliorcamentos.online/email/descadastrar',
});
function contaNova(n) {
  return {
    candidato: {
      userId: U(n),
      confirmadoEm: new Date(AGORA.getTime() - 80 * H).toISOString(),
      orcamentos: 0, membroDeEquipe: false, donoDoTenant: true, assinatura: null,
      oferta: { plano_efetivo: 'gratis', limite_envios: null, envios_usados: 0, envios_restantes: null, trial_estado: 'available', trial_termina_em: null, trial_dias: 14 },
      historico: { ativacao: [], cobranca: [] },
    },
  };
}
function fetchFalso({ base = [], pix = [], pixFalha = false }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ rpc: url.split('/rpc/')[1], body });
    if (url.endsWith('/rpc/listar_candidatos_lembrete_email')) return Response.json(base);
    if (url.endsWith('/rpc/listar_pix_vence_email')) return pixFalha ? new Response('x', { status: 500 }) : Response.json(pix);
    if (url.endsWith('/rpc/enqueue_lembrete_email')) return Response.json({ enfileirado: true, motivo: 'enfileirado' });
    if (url.includes('/rest/v1/webhook_events')) return Response.json([]);
    throw new Error(`url_inesperada:${url}`);
  };
  return { calls, fetchImpl };
}
const enfileirados = (f) => f.calls.filter((c) => c.rpc === 'enqueue_lembrete_email').map((c) => c.body.p_idempotency_key);

await caso('job: Pix vai antes dos outros e divide o teto da rodada (2)', async () => {
  const f = fetchFalso({ base: [contaNova(5), contaNova(6)], pix: [{ candidato: cand() }] });
  const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
  assert.equal(r.motivo, 'ok');
  assert.equal(r.enfileirados, 2);
  assert.equal(r.pixVence, 1);
  const chaves = enfileirados(f);
  assert.equal(chaves.length, 2);
  assert.match(chaves[0], /:pix_vence:pix_char_fixture1$/);
});
await caso('job: "production" sem sufixo NÃO liga o Pix (não chama a lista)', async () => {
  const f = fetchFalso({ base: [], pix: [{ candidato: cand() }] });
  await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'production' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
  assert.equal(f.calls.some((c) => c.rpc === 'listar_pix_vence_email'), false);
});
await caso('job: sufixo sem pix_vence não chama a lista', async () => {
  const f = fetchFalso({ base: [], pix: [{ candidato: cand() }] });
  await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'production:ativacao' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
  assert.equal(f.calls.some((c) => c.rpc === 'listar_pix_vence_email'), false);
});
await caso('job: lista do Pix falhando não derruba os outros tipos', async () => {
  const f = fetchFalso({ base: [contaNova(5)], pixFalha: true });
  const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
  assert.equal(r.motivo, 'ok');
  assert.equal(r.decisoes.pix_vence_falhou, 1);
  assert.equal(r.enfileirados, 1);
});
await caso('log da rodada sem id de conta nem de cobrança', () => {
  const texto = logs.join('\n');
  assert.doesNotMatch(texto, /00000000-0000-4000-8000/);
  assert.doesNotMatch(texto, /pix_char_/);
});
originalLog(`${ok} casos ok`);
