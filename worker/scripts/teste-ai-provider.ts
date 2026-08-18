// @ts-nocheck — teste Node de um módulo JS do runtime Workers; os mocks de
// Response/fetch são deliberadamente parciais e validados em execução.
/**
 * Teste isolado do adaptador de IA do Worker.
 *
 *     node worker/scripts/teste-ai-provider.ts
 *
 * Não usa rede, credencial, banco nem áudio real. Os mocks verificam o contrato
 * que mais importa para produção: modelos gratuitos, privacidade, histórico,
 * timeout, rollback explícito e transcrição pelo binding Workers AI.
 */
import { aiConfigurada, gerarIA, transcreverAudio } from '../src/ai.js';

let falhas = 0;
let passes = 0;

function checar(nome, real, esperado) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

async function erroDe(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

function respostaErro(status) {
  return { ok: false, status, body: null };
}

const fetchReal = globalThis.fetch;

console.log('\n1) OpenRouter: modelo singular, JSON, privacidade e histórico Gemini');
let requisicao;
globalThis.fetch = async (url, init) => {
  requisicao = { url: String(url), init };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: 'google/gemma-4-26b-a4b-it:free',
      choices: [{ message: { content: '{"ok":true}' } }],
    }),
  };
};

const envOpenRouter = {
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'chave-falsa-nao-imprimir',
  // O primeiro e o último são pagos e precisam desaparecer antes do fetch.
  OPENROUTER_TEXT_MODELS: [
    'anthropic/claude-sonnet-4',
    'google/gemma-4-26b-a4b-it:free',
    'openai/gpt-oss-20b:free',
    'openrouter/free', // router aleatório também precisa desaparecer
    'google/gemma-4-26b-a4b-it:free',
    'openai/gpt-5',
  ].join(','),
};

const gerado = await gerarIA(envOpenRouter, {
  system: 'Responda em pt-BR.',
  user: [
    { role: 'user', parts: [{ text: 'Primeiro turno' }] },
    { role: 'model', parts: [{ text: 'Resposta anterior' }] },
    { role: 'user', parts: [{ text: 'Segundo turno' }] },
  ],
  wantJson: true,
  temperature: 0.3,
});
const body = JSON.parse(requisicao.init.body);
checar('retorna apenas o texto, compatível com gemini()', gerado, '{"ok":true}');
checar('endpoint oficial', requisicao.url, 'https://openrouter.ai/api/v1/chat/completions');
checar('autorização enviada sem expor seu valor no teste', requisicao.init.headers.Authorization.startsWith('Bearer '), true);
checar('titulo HTTP permanece ASCII para compatibilidade Fetch', requisicao.init.headers['X-OpenRouter-Title'], 'OLLI Orcamentos');
checar('usa o primeiro modelo gratuito explícito', body.model, 'google/gemma-4-26b-a4b-it:free');
checar('nunca delega fallback via models plural', body.models, undefined);
checar('router aleatório não entrou no request', JSON.stringify(body).includes('openrouter/free'), false);
checar('coleta de dados negada', body.provider.data_collection, 'deny');
checar('fallback interno do provedor desligado', body.provider.allow_fallbacks, false);
checar('JSON exige provedor compatível', body.provider.require_parameters, true);
checar('modo JSON ativado', body.response_format, { type: 'json_object' });
checar('ZDR não é forçado sem um endpoint estruturado saudável validado', body.zdr, undefined);
checar('papéis Gemini model/user viram assistant/user', body.messages, [
  { role: 'system', content: 'Responda em pt-BR.' },
  { role: 'user', content: 'Primeiro turno' },
  { role: 'assistant', content: 'Resposta anterior' },
  { role: 'user', content: 'Segundo turno' },
]);
checar('aiConfigurada reconhece OpenRouter', aiConfigurada(envOpenRouter), true);

await gerarIA(envOpenRouter, {
  user: 'Retorne um objeto sintético.',
  wantJson: true,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  },
});
const bodySchema = JSON.parse(requisicao.init.body);
checar('JSON Schema estrito é enviado quando fornecido', bodySchema.response_format, {
  type: 'json_schema',
  json_schema: {
    name: 'olli_resposta',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean' } },
    },
  },
});

console.log('\n2) configuração somente paga falha fechada antes da rede');
let chamadasRede = 0;
globalThis.fetch = async () => {
  chamadasRede++;
  throw new Error('não deveria chamar');
};
const erroPago = await erroDe(() => gerarIA({
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'falsa',
  OPENROUTER_TEXT_MODELS: 'openai/gpt-5,anthropic/claude-sonnet-4',
}, { user: 'teste' }));
checar('erro seguro', erroPago?.message, 'modelos_gratuitos_ausentes');
checar('não chamou fetch', chamadasRede, 0);

console.log('\n3) fallback manual respeita contabilização e classe do erro');
for (const status of [400, 403]) {
  const callbacks = [];
  const modelosEnviados = [];
  globalThis.fetch = async (_url, init) => {
    modelosEnviados.push(JSON.parse(init.body).model);
    return respostaErro(status);
  };
  const error = await erroDe(() => gerarIA(envOpenRouter, {
    user: 'teste sem retry em erro definitivo',
    beforeAttempt: async (info) => callbacks.push(info),
  }));
  checar(`${status}: não faz fallback`, modelosEnviados, ['google/gemma-4-26b-a4b-it:free']);
  checar(`${status}: callback ocorreu só para a tentativa real`, callbacks, [{
    model: 'google/gemma-4-26b-a4b-it:free',
    tentativa: 1,
    total: 2,
  }]);
  checar(`${status}: erro preservado`, error?.message, `openrouter_${status}`);
  checar(`${status}: não é overloaded`, error?.overloaded, false);
}

let chamadas404 = 0;
globalThis.fetch = async () => {
  chamadas404 += 1;
  if (chamadas404 === 1) return respostaErro(404);
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'fallback de modelo removido' } }] }),
  };
};
const fallback404 = await gerarIA(envOpenRouter, {
  user: 'modelo gratuito removido',
  beforeAttempt: async () => {},
});
checar('404 de modelo volátil usa fallback explícito', fallback404, 'fallback de modelo removido');
checar('404 contabilizou duas tentativas', chamadas404, 2);

const eventosFallback = [];
const callbacksFallback = [];
const corposFallback = [];
globalThis.fetch = async (_url, init) => {
  const corpo = JSON.parse(init.body);
  corposFallback.push(corpo);
  eventosFallback.push(`fetch:${corpo.model}`);
  if (corposFallback.length === 1) return respostaErro(429);
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'fallback contabilizado ok' } }] }),
  };
};
const resultadoFallback = await gerarIA(envOpenRouter, {
  user: 'teste com retry contabilizado',
  beforeAttempt: async (info) => {
    callbacksFallback.push(info);
    eventosFallback.push(`before:${info.model}`);
  },
});
checar('429 + callback usa o segundo modelo explícito', resultadoFallback, 'fallback contabilizado ok');
checar('callback ocorre imediatamente antes de cada fetch', eventosFallback, [
  'before:google/gemma-4-26b-a4b-it:free',
  'fetch:google/gemma-4-26b-a4b-it:free',
  'before:openai/gpt-oss-20b:free',
  'fetch:openai/gpt-oss-20b:free',
]);
checar('tentativas são numeradas e conhecem o total', callbacksFallback, [
  { model: 'google/gemma-4-26b-a4b-it:free', tentativa: 1, total: 2 },
  { model: 'openai/gpt-oss-20b:free', tentativa: 2, total: 2 },
]);
checar('cada request contém somente model singular', corposFallback.map((corpo) => ({
  model: corpo.model,
  models: corpo.models,
})), [
  { model: 'google/gemma-4-26b-a4b-it:free' },
  { model: 'openai/gpt-oss-20b:free' },
]);

const modelosSemCallback = [];
globalThis.fetch = async (_url, init) => {
  modelosSemCallback.push(JSON.parse(init.body).model);
  return respostaErro(429);
};
const erro429SemCallback = await erroDe(() => gerarIA(envOpenRouter, { user: 'uma unidade reservada' }));
checar('429 sem callback não consome segunda tentativa', modelosSemCallback, [
  'google/gemma-4-26b-a4b-it:free',
]);
checar('429 sem callback continua retryable', erro429SemCallback?.overloaded, true);

for (const status of [500, 599]) {
  globalThis.fetch = async () => respostaErro(status);
  const error = await erroDe(() => gerarIA(envOpenRouter, { user: 'teste 5xx sem callback' }));
  checar(`${status}: todo 5xx é overloaded`, error?.overloaded, true);
  checar(`${status}: usa erro seguro de sobrecarga`, error?.message, 'sobrecarregado');
}

let chamadasRespostaInvalida = 0;
globalThis.fetch = async () => {
  chamadasRespostaInvalida++;
  return { ok: true, status: 200, json: async () => ({ choices: [] }) };
};
const erroRespostaInvalida = await erroDe(() => gerarIA(envOpenRouter, {
  user: 'não repetir resposta inválida',
  beforeAttempt: async () => {},
}));
checar('resposta inválida não faz fallback', chamadasRespostaInvalida, 1);
checar('resposta inválida falha explicitamente', erroRespostaInvalida?.message, 'resposta_invalida');

console.log('\n4) timeout aborta a chamada, sinaliza retry e não repete sem callback');
let chamadasTimeout = 0;
globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
  chamadasTimeout++;
  init.signal.addEventListener('abort', () => {
    const error = new Error('abortado pelo teste');
    error.name = 'AbortError';
    reject(error);
  }, { once: true });
});
const erroTimeout = await erroDe(() => gerarIA({
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'falsa',
}, { user: 'teste', timeoutMs: 10 }));
checar('erro de timeout sem conteúdo do provedor', erroTimeout?.message, 'timeout');
checar('timeout é retryable', erroTimeout?.overloaded, true);
checar('sem callback houve só uma tentativa', chamadasTimeout, 1);

let fetchDepoisDoDeadline = 0;
globalThis.fetch = async () => {
  fetchDepoisDoDeadline += 1;
  return respostaErro(429);
};
const erroDeadline = await erroDe(() => gerarIA(envOpenRouter, {
  user: 'deadline total',
  timeoutMs: 10,
  beforeAttempt: async () => new Promise((resolve) => setTimeout(resolve, 15)),
}));
checar('deadline inclui o tempo de reserva da cota', erroDeadline?.message, 'timeout');
checar('não envia upstream depois do deadline', fetchDepoisDoDeadline, 0);

console.log('\n5) rollback Gemini é explícito e preserva o contrato antigo');
let urlGemini = '';
globalThis.fetch = async (url) => {
  urlGemini = String(url);
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'rollback ok' }] } }] }),
  };
};
const rollback = await gerarIA({
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'gemini-falsa',
}, { user: 'teste de rollback' });
checar('resposta Gemini preservada', rollback, 'rollback ok');
checar('usou endpoint Gemini', urlGemini.includes('generativelanguage.googleapis.com'), true);
checar('Gemini explícito configurado', aiConfigurada({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'x' }), true);
let gateGemini = 0;
await gerarIA({
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'gemini-falsa',
  GEMINI_MODEL: 'gemini-2.5-flash',
}, {
  user: 'rollback com cota',
  beforeAttempt: async ({ model, tentativa, total }) => {
    gateGemini += 1;
    checar('rollback informa o modelo ao gate', model, 'gemini-2.5-flash');
    checar('rollback tem uma única tentativa', [tentativa, total], [1, 1]);
  },
});
checar('rollback também reserva antes do upstream', gateGemini, 1);
checar('provedor inválido não é aceito', aiConfigurada({ AI_PROVIDER: 'outro', OPENROUTER_API_KEY: 'x' }), false);
checar('provedor ausente falha fechado mesmo com chave antiga', aiConfigurada({ GEMINI_API_KEY: 'x' }), false);

console.log('\n6) áudio fica no Cloudflare Whisper e retorna só a transcrição');
let chamadaAI;
const envAudio = {
  AI: {
    run: async (model, input) => {
      chamadaAI = { model, input };
      return { text: 'Troca de disjuntor para a Dona Helena.' };
    },
  },
};
const transcricao = await transcreverAudio(envAudio, {
  audioBase64: 'UklGRg==',
  language: 'pt',
  initialPrompt: 'Orçamento de serviços no Brasil.',
});
checar('modelo Whisper correto', chamadaAI.model, '@cf/openai/whisper-large-v3-turbo');
checar('payload do binding', chamadaAI.input, {
  audio: 'UklGRg==',
  task: 'transcribe',
  language: 'pt',
  vad_filter: true,
  initial_prompt: 'Orçamento de serviços no Brasil.',
});
checar('texto transcrito', transcricao, 'Troca de disjuntor para a Dona Helena.');

const erroAudio = await erroDe(() => transcreverAudio(envAudio, { audioBase64: 'não-é-base64' }));
checar('base64 inválido é recusado antes do binding', erroAudio?.message, 'audio_base64_invalido');

globalThis.fetch = fetchReal;

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
