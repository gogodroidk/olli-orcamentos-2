/**
 * Teste da NFS-e (Fase 1).   node worker/scripts/teste-nfse.js     Exit 0 = passou.
 * Roteador REAL (`handleNfse`) contra Supabase FALSO em memória e provedores (mock e Focus com fetch falso).
 * Trancado: flag desligada (nada toca banco/provedor), plano Empresa, validação, perfil incompleto, idempotência,
 * erro e retry, "processando" → consulta, Focus só homologação e sem token no código, resposta sem documento do tomador.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { handleNfse } from '../src/nfse.js';
import { criarProvedor } from '../src/nfse/provedor.js';
import { criarProvedorFocus, montarPayload, traduzirResposta } from '../src/nfse/provedorFocus.js';
import { cnpjValido, cpfValido, faltaNoPerfil, referencia, validarPedido } from '../src/nfse/validacao.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const CNPJ = '11222333000181';
const CPF = '52998224725';
ok(cnpjValido(CNPJ) && !cnpjValido('11222333000182') && !cnpjValido('11111111111111'), 'cnpj');
ok(cpfValido(CPF) && !cpfValido('52998224724') && !cpfValido('11111111111'), 'cpf');

// ── Supabase falso ──
function criarMundo({ plano = 'empresa', perfil = true, bancoOff = false } = {}) {
  const m = { chamadas: [], notas: [], perfil: perfil ? { user_id: 'u1', cnpj: CNPJ, inscricao_municipal: '123', codigo_municipio_ibge: '3550308', regime: 'simples', codigo_servico: '14.01', aliquota_iss: 2 } : null };
  m.fetch = async (url, init = {}) => {
    const u = new URL(url);
    m.chamadas.push(`${init.method || 'GET'} ${u.pathname}`);
    const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
    if (u.pathname === '/auth/v1/user') return (init.headers.Authorization || '').includes('bom') ? j({ id: 'u1' }) : j({}, 401);
    if (bancoOff && u.pathname.startsWith('/rest/v1/') && !u.pathname.endsWith('assinaturas')) return j({}, 404);
    if (u.pathname === '/rest/v1/assinaturas') return j([{ user_id: 'u1', plano, status: 'active', current_period_end: '2099-01-01T00:00:00Z' }]);
    if (u.pathname === '/rest/v1/perfil_fiscal') return j(m.perfil ? [m.perfil] : []);
    if (u.pathname === '/rest/v1/nota_fiscal') {
      const orc = (u.searchParams.get('orcamento_id') || '').replace('eq.', '');
      if (init.method === 'POST') { const l = JSON.parse(init.body); if (m.notas.some((x) => x.orcamento_id === l.orcamento_id)) return j({}, 409); m.notas.push(l); return j(null, 201); }
      if (init.method === 'PATCH') { Object.assign(m.notas.find((x) => x.orcamento_id === orc), JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      return j(m.notas.filter((x) => x.orcamento_id === orc));
    }
    return j({}, 404);
  };
  return m;
}
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', NFSE_ENABLED: '1' };
const req = (path, { metodo = 'GET', corpo, auth = 'bom' } = {}) =>
  new Request(`https://w.test${path}`, { method: metodo, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
const chamar = async (env, r) => { const x = await handleNfse(r, env, new URL(r.url)); return { s: x.status, b: await x.json().catch(() => null) }; };
const PEDIDO = { orcamentoId: 'orc-1', tomador: { documento: CPF, nome: 'Maria Souza' }, servico: { descricao: 'Instalação split 12k', valorCentavos: 85000, issRetido: false } };
const original = globalThis.fetch;

try {
  // 1. FLAG DESLIGADA: config diz false; emitir/status 503; ZERO chamada de rede.
  let w = criarMundo(); globalThis.fetch = w.fetch;
  for (const env of [{ ...ENV, NFSE_ENABLED: '0' }, { ...ENV, NFSE_ENABLED: undefined }, { ...ENV, NFSE_ENABLED: 'true' }]) {
    eq((await chamar(env, req('/nfse/config'))).b, { ok: true, nfse: false });
    eq((await chamar(env, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }))).s, 503);
    eq((await chamar(env, req('/nfse/status?orcamento=orc-1'))).s, 503);
  }
  eq(w.chamadas, [], 'flag off não toca rede');
  eq((await chamar(ENV, req('/nfse/config'))).b, { ok: true, nfse: true });

  // 2. AUTH e PLANO
  w = criarMundo(); globalThis.fetch = w.fetch;
  eq((await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO, auth: 'ruim' }))).s, 401);
  for (const plano of ['pro', 'gratis']) {
    w = criarMundo({ plano }); globalThis.fetch = w.fetch;
    const r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }));
    eq([r.s, r.b.erro], [403, 'plano_insuficiente'], `plano ${plano}`);
    eq(w.notas.length, 0);
  }

  // 3. VALIDAÇÃO (400) e PERFIL INCOMPLETO (409)
  w = criarMundo(); globalThis.fetch = w.fetch;
  let r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: { ...PEDIDO, tomador: { documento: '123', nome: 'X' } } }));
  eq([r.s, r.b.erro], [400, 'pedido_invalido']); ok(r.b.campos.includes('tomador_documento_invalido'));
  eq(validarPedido({ ...PEDIDO, servico: { ...PEDIDO.servico, valorCentavos: 10.5 } }).ok, false, 'centavos inteiros');
  eq(validarPedido({ ...PEDIDO, orcamentoId: '../x' }).ok, false, 'id com caractere perigoso');
  w = criarMundo({ perfil: false }); globalThis.fetch = w.fetch;
  r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }));
  eq([r.s, r.b.erro], [409, 'perfil_fiscal_incompleto']); eq(w.notas.length, 0);
  eq(faltaNoPerfil({ cnpj: CNPJ }).includes('inscricao_municipal'), true);

  // 4. EMISSÃO (mock) + IDEMPOTÊNCIA + sem documento do tomador na resposta
  w = criarMundo(); globalThis.fetch = w.fetch;
  r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }));
  eq([r.s, r.b.ok, r.b.nota.status, r.b.nota.ambiente], [200, true, 'autorizada', 'simulado']);
  ok(r.b.nota.numero && r.b.nota.pdfUrl.startsWith('https://') && r.b.nota.xmlUrl.startsWith('https://'));
  ok(!JSON.stringify(r.b).includes(CPF) && !JSON.stringify(w.notas).includes(CPF), 'documento do tomador não volta nem é gravado');
  const r2 = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }));
  eq([r2.b.repetida, r2.b.nota.numero], [true, r.b.nota.numero], 'repetir não emite outra');
  eq(w.notas.length, 1);

  // 5. ERRO do provedor → grava 'erro' e deixa tentar de novo
  w = criarMundo(); globalThis.fetch = w.fetch;
  const ruim = { ...PEDIDO, orcamentoId: 'orc-2', servico: { ...PEDIDO.servico, descricao: 'Reparo [erro]' } };
  r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: ruim }));
  eq([r.b.nota.status, w.notas[0].status], ['erro', 'erro']); ok(r.b.nota.erro);
  r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: { ...ruim, servico: { ...ruim.servico, descricao: 'Reparo corrigido' } } }));
  ok(r.b.ok && !r.b.repetida, 'erro permite nova tentativa');

  // 6. PROCESSANDO → status consulta e atualiza
  w = criarMundo(); globalThis.fetch = w.fetch;
  const lento = { ...PEDIDO, orcamentoId: 'orc-3', servico: { ...PEDIDO.servico, descricao: 'Carga de gás [processando]' } };
  r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: lento }));
  eq(r.b.nota.status, 'processando');
  r = await chamar(ENV, req('/nfse/status?orcamento=orc-3'));
  eq([r.b.nota.status, w.notas[0].status], ['autorizada', 'autorizada']);
  eq((await chamar(ENV, req('/nfse/status?orcamento=nada'))).b, { ok: true, nota: null });
  eq((await chamar(ENV, req('/nfse/status?orcamento=../x'))).s, 400);

  // 7. BANCO SEM A MIGRATION → 503, nada inventado
  w = criarMundo({ bancoOff: true }); globalThis.fetch = w.fetch;
  r = await chamar(ENV, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }));
  eq([r.s, r.b.erro], [503, 'banco_indisponivel']);

  // 8. PROVEDOR: padrão é mock; valor estranho cai no mock; Focus exige homologação e token
  eq(criarProvedor({}).nome, 'mock'); eq(criarProvedor({ NFSE_PROVEDOR: 'producao' }).nome, 'mock');
  assert.throws(() => criarProvedorFocus({ FOCUS_NFE_TOKEN: 't' }), /focus_somente_homologacao/); n++;
  assert.throws(() => criarProvedorFocus({ FOCUS_NFE_AMBIENTE: 'producao', FOCUS_NFE_TOKEN: 't' }), /focus_somente_homologacao/); n++;
  assert.throws(() => criarProvedorFocus({ FOCUS_NFE_AMBIENTE: 'homologacao' }), /focus_sem_token/); n++;
  w = criarMundo(); globalThis.fetch = w.fetch;
  r = await chamar({ ...ENV, NFSE_PROVEDOR: 'focus' }, req('/nfse/emitir', { metodo: 'POST', corpo: PEDIDO }));
  eq([r.s, r.b.erro], [503, 'provedor_indisponivel'], 'focus sem config = 503 e não emite');

  // 9. FOCUS com fetch falso: só homologação, Basic com token, ref idempotente, tradução
  const vistos = [];
  const focus = criarProvedorFocus({ FOCUS_NFE_AMBIENTE: 'homologacao', FOCUS_NFE_TOKEN: 'TOKEN-DE-TESTE' }, async (url, init) => {
    vistos.push({ url, auth: init.headers.Authorization, body: init.body });
    return new Response(JSON.stringify({ status: 'autorizado', numero: 7, codigo_verificacao: 'ABC', url_danfse: 'https://f/d.pdf', caminho_xml_nota_fiscal: 'https://f/n.xml' }), { status: 200 });
  });
  const perfil = criarMundo().perfil;
  const res = await focus.emitir({ ref: referencia('u1', 'orc-1'), prestador: perfil, tomador: { documento: CPF, nome: 'Maria', email: null }, servico: PEDIDO.servico });
  eq([res.status, res.numero, res.ambiente], ['autorizada', '7', 'homologacao']);
  ok(vistos[0].url.startsWith('https://homologacao.focusnfe.com.br/v2/nfsen?ref=olli-'), 'só homologação');
  eq(vistos[0].auth, `Basic ${btoa('TOKEN-DE-TESTE:')}`);
  const p = JSON.parse(vistos[0].body);
  eq([p.valor_servico, p.cpf_tomador, p.cnpj_prestador, p.tipo_retencao_iss], ['850.00', CPF, CNPJ, 1]);
  eq(montarPayload({ prestador: perfil, tomador: { documento: '11222333000181', nome: 'Emp' }, servico: { ...PEDIDO.servico, issRetido: true } }).cnpj_tomador, '11222333000181');
  eq(traduzirResposta({ status: 'coisa_nova' }).status, 'processando', 'desconhecido nunca vira autorizada');
  eq(traduzirResposta({ status: 'erro_autorizacao', erros: [{ mensagem: 'IM inválida' }] }), { status: 'erro', mensagem: 'IM inválida', ambiente: 'homologacao' });
  const caiu = criarProvedorFocus({ FOCUS_NFE_AMBIENTE: 'homologacao', FOCUS_NFE_TOKEN: 't' }, async () => new Response('{}', { status: 503 }));
  await assert.rejects(caiu.emitir({ ref: 'r', prestador: perfil, tomador: PEDIDO.tomador, servico: PEDIDO.servico }), /focus_indisponivel/); n++;

  // 10. Nenhum segredo/URL de produção no código do módulo
  for (const f of ['nfse.js', 'nfse/provedor.js', 'nfse/provedorFocus.js', 'nfse/provedorMock.js', 'nfse/validacao.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    ok(!/api\.focusnfe\.com\.br/.test(src), `${f}: sem URL de produção`);
    ok(!/FOCUS_NFE_TOKEN\s*[:=]\s*['"][^'"]/.test(src), `${f}: sem token literal`);
  }
  const wr = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  ok(/"NFSE_ENABLED":\s*"0"/.test(wr), 'wrangler: flag desligada');
} finally {
  globalThis.fetch = original;
}
console.log(`teste-nfse: ${n} verificações passaram`);
