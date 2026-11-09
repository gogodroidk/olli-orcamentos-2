// Provedor 'workersai' (hotfix D-1527): contrato com o binding AI, JSON Mode e falhas.
//     node scripts/teste-ai-workersai.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORCAMENTO_SCHEMA } from '../src/voz.js';
import { IA_IMPORTACAO_SCHEMA } from '../src/iaImportacao.js';
import { IA_AUTOPILOT_SCHEMA } from '../src/iaAutopilot.js';
import { DIAG_CAMPOS_COMPLETOS, DIAG_CAMPOS_COMPLETOS_CHAVES } from '../src/diagnosticoEquipamento.js';
import { aiConfigurada, gerarIA, provedorIA, reiniciarSaudeIA, saudeIA, WORKERSAI_MODELO_PADRAO } from '../src/ai.js';

const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };
function binding(resposta) {
  const chamadas = [];
  return { chamadas, run: async (modelo, entrada) => { chamadas.push({ modelo, entrada }); if (resposta instanceof Error) throw resposta; return typeof resposta === 'function' ? resposta() : resposta; } };
}

// seleção e saúde
assert.equal(provedorIA({ AI_PROVIDER: 'workersai' }), 'workersai');
assert.equal(aiConfigurada({ AI_PROVIDER: 'workersai' }), false, 'sem binding AI: desligada');
assert.equal(aiConfigurada({ AI_PROVIDER: 'workersai', AI: binding({}) }), true);
reiniciarSaudeIA();
assert.equal(saudeIA({ AI_PROVIDER: 'workersai', AI: binding({}) }).ia, 'on');

// JSON Mode: schema PURO em json_schema; resposta-objeto vira texto JSON
{
  const AI = binding({ response: { ok: true } });
  let reservas = 0;
  const texto = await gerarIA({ AI_PROVIDER: 'workersai', AI }, {
    system: 'sys', user: 'oi', wantJson: true, jsonSchema: schema, beforeAttempt: async (t) => { reservas++; assert.equal(t.model, WORKERSAI_MODELO_PADRAO); },
  });
  assert.deepEqual(JSON.parse(texto), { ok: true });
  assert.equal(reservas, 1, 'cota reservada 1 vez (gate diário continua valendo)');
  const { modelo, entrada } = AI.chamadas[0];
  assert.equal(modelo, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.deepEqual(entrada.response_format, { type: 'json_schema', json_schema: schema }, 'sem envelope name/strict do OpenAI');
  assert.deepEqual(entrada.messages.map((m) => m.role), ['system', 'user']);
}
// modelo trocável por var; texto livre sem response_format
{
  const AI = binding({ response: ' olá ' });
  assert.equal(await gerarIA({ AI_PROVIDER: 'workersai', AI, WORKERSAI_MODEL: '@cf/x/y' }, { user: 'oi' }), 'olá');
  assert.equal(AI.chamadas[0].modelo, '@cf/x/y');
  assert.equal('response_format' in AI.chamadas[0].entrada, false);
}
// falhas: cota grátis / capacidade / JSON Mode = sobrecarga (503 amigável); resto = falha
for (const msg of ['4006: daily free allocation of neurons exceeded', 'AiError: 3040 capacity', "JSON Mode couldn't be met"]) {
  const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: binding(new Error(msg)) }, { user: 'oi' }).catch((x) => x);
  assert.equal(e.overloaded, true, `${msg} = sobrecarga`);
}
{
  const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: binding(new Error('boom')) }, { user: 'oi' }).catch((x) => x);
  assert.equal(e.message, 'falha_workersai');
  assert.equal(e.overloaded, false);
}
{
  const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: binding({ response: '' }) }, { user: 'oi' }).catch((x) => x);
  assert.equal(e.overloaded, true, 'resposta vazia nunca vira dado');
}
{
  const lento = { run: () => new Promise(() => {}) };
  const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: lento }, { user: 'oi', timeoutMs: 20 }).catch((x) => x);
  assert.equal(e.message, 'workersai_prazo');
  assert.equal(e.overloaded, true);
}
// produção aponta para o Workers AI e o erro tem mensagem amigável
const wr = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
assert.equal((wr.match(/"AI_PROVIDER": "workersai"/g) || []).length, 2, 'produção e staging no workersai');
const idx = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
assert.match(idx, /mensagem: 'IA indisponível no momento\./);
// LIVRE P3: palavra comum com 'rate' não vira sobrecarga
{
  const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: binding(new Error('generated output was inaccurate')) }, { user: 'oi' }).catch((x) => x);
  assert.equal(e.overloaded, false, 'generated/inaccurate é falha real (vai ao Sentry)');
}
// LIVRE P2: teto global diário (família da cota) cabe na cota grátis de neurônios
assert.equal((wr.match(/"OPENROUTER_GLOBAL_DAILY_LIMIT": "30"/g) || []).length, 2, 'teto global 30/dia em prod e staging');
// CPO (D-1527): provedor fora (402/sem saldo, cota grátis, prazo) nos 6 schemas reais:
// erro de sobrecarga (503 amigável), 1 reserva da cota diária por pedido (nunca 2) e nenhum texto.
{
  const lit = (nome) => {
    const i = idx.indexOf(`const ${nome} =`);
    const a = idx.indexOf('{', i);
    let d = 0;
    let j = a;
    for (; j < idx.length; j++) {
      if (idx[j] === '{') d++;
      if (idx[j] === '}' && !--d) break;
    }
    // DIAG_SCHEMA espalha estas constantes. O Function avalia o texto do
    // index.js e, sem elas no escopo, estoura ReferenceError.
    return Function(
      'DIAG_CAMPOS_COMPLETOS',
      'DIAG_CAMPOS_COMPLETOS_CHAVES',
      `return (${idx.slice(a, j + 1)})`,
    )(DIAG_CAMPOS_COMPLETOS, DIAG_CAMPOS_COMPLETOS_CHAVES);
  };
  const seis = { minimo: schema, diagnostico: lit('DIAG_SCHEMA'), acao: lit('IA_ACTION_DRAFT_SCHEMA'), voz: ORCAMENTO_SCHEMA, importacao: IA_IMPORTACAO_SCHEMA, autopilot: IA_AUTOPILOT_SCHEMA };
  for (const falha of ['402 Payment Required: insufficient credits', '4006: daily free allocation of neurons exceeded']) {
    for (const [nome, sc] of Object.entries(seis)) {
      let reservas = 0;
      const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: binding(new Error(falha)) }, { user: 'x', wantJson: true, jsonSchema: sc, beforeAttempt: async () => { reservas++; } }).catch((x) => x);
      assert.ok(e instanceof Error, `${nome}: falha vira erro, nunca texto`);
      assert.equal(reservas, 1, `${nome}: cota diária reservada 1 vez só (sem 2ª tentativa)`);
      if (falha.startsWith('4006')) assert.equal(e.overloaded, true, `${nome}: cota grátis esgotada = 503 amigável`);
    }
  }
}
// Uso do Grátis (3/mês) só é cobrado DEPOIS da IA dar certo, em toda rota de texto.
{
  const voz = readFileSync(new URL('../src/voz.js', import.meta.url), 'utf8');
  const depois = (txt, a, b, de = 0) => { const i = txt.indexOf(a, de); const j = txt.indexOf(b, i); return i >= 0 && j > i ? j : -1; };
  let k = 0;
  for (let n = 0; n < 3; n++) { k = depois(idx, 'await gerarIA(', 'cobrarCreditoVoz(', k); assert.ok(k > 0, `index.js rota ${n + 1}: cobrança depois da IA`); }
  let v = 0;
  for (let n = 0; n < 2; n++) { v = depois(voz, 'await gerarIA(', 'cobrarCreditoVoz(', v); assert.ok(v > 0, `voz.js rota ${n + 1}: cobrança depois da IA`); }
}
// CPO 1 (migration 20261106054000): provedor falhou depois de reservar = devolve a unidade 1 vez; sucesso não devolve
{
  const gate = (reg) => { const f = async () => { reg.reservas++; }; f.devolverUltima = async () => { reg.devolvidas++; return true; }; return f; };
  for (const AI of [binding(new Error('4006 neurons')), binding({ response: '' })]) {
    const reg = { reservas: 0, devolvidas: 0 };
    await gerarIA({ AI_PROVIDER: 'workersai', AI }, { user: 'x', timeoutMs: 20, beforeAttempt: gate(reg) }).catch(() => {});
    assert.deepEqual(reg, { reservas: 1, devolvidas: 1 }, 'provedor recusou: devolve a reserva');
  }
  {
    const reg = { reservas: 0, devolvidas: 0 };
    await gerarIA({ AI_PROVIDER: 'workersai', AI: { run: () => new Promise(() => {}) } }, { user: 'x', timeoutMs: 20, beforeAttempt: gate(reg) }).catch(() => {});
    assert.deepEqual(reg, { reservas: 1, devolvidas: 0 }, 'prazo NÃO devolve (o provedor segue gastando)');
  }
  const ok = { reservas: 0, devolvidas: 0 };
  await gerarIA({ AI_PROVIDER: 'workersai', AI: binding({ response: { ok: true } }) }, { user: 'x', wantJson: true, jsonSchema: schema, beforeAttempt: gate(ok) });
  assert.deepEqual(ok, { reservas: 1, devolvidas: 0 }, 'sucesso não devolve');
  const quebra = async () => {}; quebra.devolverUltima = async () => { throw new Error('rede'); };
  const e = await gerarIA({ AI_PROVIDER: 'workersai', AI: binding(new Error('boom')) }, { user: 'x', beforeAttempt: quebra }).catch((x) => x);
  assert.equal(e.message, 'falha_workersai', 'devolução que falha não troca o erro original');
}
console.log('teste-ai-workersai: OK');
