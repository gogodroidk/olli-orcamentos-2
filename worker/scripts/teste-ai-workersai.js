// Provedor 'workersai' (hotfix D-1527): contrato com o binding AI, JSON Mode e falhas.
//     node scripts/teste-ai-workersai.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
console.log('teste-ai-workersai: OK');
