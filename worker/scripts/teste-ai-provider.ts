// @ts-nocheck — teste Node de um módulo JS do runtime Workers; os mocks de
// Response/fetch são deliberadamente parciais e validados em execução.
/**
 * Teste isolado do adaptador de IA do Worker.
 *
 *     node worker/scripts/teste-ai-provider.ts
 *
 * Não usa rede, credencial, banco nem áudio real. Os mocks verificam o contrato
 * que mais importa para produção: modelos gratuitos, pago só por allowlist +
 * flag + teto de preço, privacidade, histórico, timeout, rollback explícito,
 * saúde/alerta sem PII e transcrição pelo binding Workers AI.
 */
import {
  IA_FALHAS_PARA_DEGRADAR,
  OPENROUTER_MODELOS_PADRAO,
  OPENROUTER_MODELOS_PAGOS_PERMITIDOS,
  aiConfigurada,
  definirAlertaFalhaIA,
  gerarIA,
  pagamentoOpenRouterPermitido,
  reiniciarSaudeIA,
  saudeIA,
  tetoPrecoOpenRouter,
  transcreverAudio,
} from '../src/ai.js';
import { ORCAMENTO_SCHEMA } from '../src/voz.js';
import { IA_IMPORTACAO_SCHEMA } from '../src/iaImportacao.js';
import { IA_AUTOPILOT_SCHEMA } from '../src/iaAutopilot.js';

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
checar('fallback interno fica limitado ao mesmo modelo gratuito', body.provider.allow_fallbacks, true);
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

console.log('\n7) modelo pago: só com OPENROUTER_PERMITIR_PAGO=true E na allowlist em código');
function respostaOk(texto = 'ok pago') {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: texto } }] }) };
}
const avisos = [];
const warnReal = console.warn;
console.warn = (...args) => avisos.push(args);

checar('allowlist tem exatamente a cadeia de produção', OPENROUTER_MODELOS_PADRAO, [
  'openai/gpt-4.1-nano',
  'openai/gpt-4o-mini',
  'mistralai/mistral-small-24b-instruct-2501',
]);
checar('allowlist é imutável', Object.isFrozen(OPENROUTER_MODELOS_PAGOS_PERMITIDOS), true);
// Sai do catálogo do OpenRouter em 20/10/2026: não pode voltar para a
// allowlist por engano (um ID removido vira 404 em toda request).
checar('gemini-2.5-flash-lite fora da allowlist', tetoPrecoOpenRouter('google/gemini-2.5-flash-lite'), null);
checar('flag ausente = pago desligado', pagamentoOpenRouterPermitido({}), false);
checar('flag "1" não liga pago', pagamentoOpenRouterPermitido({ OPENROUTER_PERMITIR_PAGO: '1' }), false);
checar('flag "yes" não liga pago', pagamentoOpenRouterPermitido({ OPENROUTER_PERMITIR_PAGO: 'yes' }), false);
checar('flag "true" liga pago', pagamentoOpenRouterPermitido({ OPENROUTER_PERMITIR_PAGO: ' TRUE ' }), true);

const cadeiaMista = [
  'openai/gpt-4o-mini',
  'x-ai/grok-4', // pago FORA da allowlist (ainda não avisado neste isolate)
  'openai/gpt-4.1-nano',
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
].join(',');

// Sem a flag: allowlisted pago também é ignorado; só o :free sobra.
const corposSemFlag = [];
globalThis.fetch = async (_url, init) => {
  corposSemFlag.push(JSON.parse(init.body));
  return respostaOk();
};
await gerarIA({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'falsa', OPENROUTER_TEXT_MODELS: cadeiaMista }, {
  user: 'sem flag',
  beforeAttempt: async () => {},
});
checar('sem flag: só o :free foi chamado', corposSemFlag.map((c) => c.model), ['google/gemma-4-26b-a4b-it:free']);
checar('sem flag: :free não recebe max_price', corposSemFlag[0].provider.max_price, undefined);
checar('sem flag: pago da allowlist gera aviso', avisos.some(([tag, info]) =>
  tag === '[olli-worker] openrouter_modelo_ignorado'
  && info.model === 'openai/gpt-4o-mini'
  && info.motivo === 'pago_nao_liberado'), true);

// Com a flag: allowlist passa (com teto), fora da allowlist continua fora.
const envPago = {
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'falsa',
  OPENROUTER_PERMITIR_PAGO: 'true',
  OPENROUTER_TEXT_MODELS: cadeiaMista,
};
const corposPago = [];
globalThis.fetch = async (_url, init) => {
  const corpo = JSON.parse(init.body);
  corposPago.push(corpo);
  return corposPago.length < 3 ? respostaErro(404) : respostaOk('resposta paga');
};
const callbacksPago = [];
const respostaPaga = await gerarIA(envPago, {
  user: 'com flag',
  wantJson: true,
  jsonSchema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
  beforeAttempt: async (info) => callbacksPago.push(info),
});
checar('com flag: resposta do terceiro elo', respostaPaga, 'resposta paga');
checar('com flag: ordem preservada, fora da allowlist e router removidos', corposPago.map((c) => c.model), [
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-nano',
  'google/gemma-4-26b-a4b-it:free',
]);
checar('com flag: cada tentativa reservou cota', callbacksPago.map((c) => [c.tentativa, c.total]), [[1, 3], [2, 3], [3, 3]]);
checar('com flag: 4o-mini leva teto de preço da allowlist', corposPago[0].provider.max_price, { prompt: 0.18, completion: 0.72 });
checar('com flag: nano leva teto de preço da allowlist', corposPago[1].provider.max_price, { prompt: 0.12, completion: 0.48 });
checar('com flag: :free não leva max_price', corposPago[2].provider.max_price, undefined);
checar('com flag: data_collection continua deny em todas', corposPago.map((c) => c.provider.data_collection), ['deny', 'deny', 'deny']);
checar('com flag: require_parameters continua em todas', corposPago.map((c) => c.provider.require_parameters), [true, true, true]);
checar('com flag: json_schema strict mantido', corposPago[0].response_format.json_schema.strict, true);
checar('com flag: pago fora da allowlist gera aviso', avisos.some(([, info]) =>
  info?.model === 'x-ai/grok-4' && info?.motivo === 'fora_da_allowlist'), true);
await gerarIA(envPago, { user: 'de novo', beforeAttempt: async () => {} });
checar('aviso sai uma vez por isolate, não a cada request', avisos.filter(([, info]) =>
  info?.model === 'x-ai/grok-4').length, 1);
checar('nenhum aviso carrega chave ou prompt', JSON.stringify(avisos).includes('falsa') || JSON.stringify(avisos).includes('com flag'), false);

const corposPadrao = [];
globalThis.fetch = async (_url, init) => {
  corposPadrao.push(JSON.parse(init.body).model);
  return respostaOk();
};
await gerarIA({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'falsa', OPENROUTER_PERMITIR_PAGO: 'true' }, { user: 'padrão' });
checar('com flag e sem lista: usa o primeiro da cadeia padrão paga', corposPadrao, ['openai/gpt-4.1-nano']);

// 400 com json_schema: o modelo não serve aquele schema; o próximo pode servir.
const modelos400 = [];
globalThis.fetch = async (_url, init) => {
  const corpo = JSON.parse(init.body);
  modelos400.push(corpo.model);
  return modelos400.length === 1 ? respostaErro(400) : respostaOk('{"ok":true}');
};
const callbacks400 = [];
const resposta400 = await gerarIA({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'falsa', OPENROUTER_PERMITIR_PAGO: 'true' }, {
  user: 'schema',
  wantJson: true,
  jsonSchema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
  beforeAttempt: async (info) => callbacks400.push(info.model),
});
checar('400 com json_schema passa ao próximo modelo', resposta400, '{"ok":true}');
checar('400 com json_schema: cada modelo reservou a sua cota', callbacks400, [
  'openai/gpt-4.1-nano',
  'openai/gpt-4o-mini',
]);
let chamadas400SemSchema = 0;
globalThis.fetch = async () => {
  chamadas400SemSchema++;
  return respostaErro(400);
};
const erro400SemSchema = await erroDe(() => gerarIA({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'falsa', OPENROUTER_PERMITIR_PAGO: 'true' }, {
  user: 'json_object',
  wantJson: true,
  beforeAttempt: async () => {},
}));
checar('400 sem json_schema continua definitivo', [chamadas400SemSchema, erro400SemSchema?.message], [1, 'openrouter_400']);

let redeSoForaDaAllowlist = 0;
globalThis.fetch = async () => {
  redeSoForaDaAllowlist++;
  return respostaOk();
};
const erroForaAllowlist = await erroDe(() => gerarIA({
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'falsa',
  OPENROUTER_PERMITIR_PAGO: 'true',
  OPENROUTER_TEXT_MODELS: 'openai/gpt-5,anthropic/claude-sonnet-4',
}, { user: 'caro' }));
checar('com flag: só modelos fora da allowlist falha fechado', erroForaAllowlist?.message, 'modelos_permitidos_ausentes');
checar('com flag: e sem chamar a rede', redeSoForaDaAllowlist, 0);
console.warn = warnReal;

console.log('\n8) saúde honesta e alerta da cadeia sem PII');
reiniciarSaudeIA();
const alertas = [];
definirAlertaFalhaIA((info) => alertas.push(info));
const envSaude = { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'falsa', OPENROUTER_PERMITIR_PAGO: 'true' };
checar('sem chave: off', saudeIA({ AI_PROVIDER: 'openrouter' }).ia, 'off');
checar('configurada e sem amostra: on com amostra 0', [saudeIA(envSaude).ia, saudeIA(envSaude).amostra], ['on', 0]);

const PROMPT_SENSIVEL = 'Cliente Dona Helena CPF 123.456.789-00';
globalThis.fetch = async () => respostaErro(503);
for (let i = 0; i < IA_FALHAS_PARA_DEGRADAR; i++) {
  await erroDe(() => gerarIA(envSaude, { user: PROMPT_SENSIVEL, beforeAttempt: async () => {} }));
}
const saudeRuim = saudeIA(envSaude);
checar(`${IA_FALHAS_PARA_DEGRADAR} falhas seguidas: degradada`, saudeRuim.ia, 'degradada');
checar('falhas seguidas contadas', saudeRuim.falhasSeguidas, IA_FALHAS_PARA_DEGRADAR);
checar('última falha registrada', typeof saudeRuim.ultimaFalhaEm, 'string');
checar('alerta disparou uma vez (limitado por intervalo)', alertas.length, 1);
checar('alerta só com metadado operacional', alertas[0], {
  provedor: 'openrouter',
  codigo: 'sobrecarregado',
  status: 503,
  tentativas: 3,
  modelos: 3,
  falhasSeguidas: 1,
});
checar('alerta não contém o prompt', JSON.stringify(alertas).includes('Helena'), false);
checar('alerta não contém a chave', JSON.stringify(alertas).includes('falsa'), false);

// Cota negada NÃO é falha do provedor.
const erroCota = new Error('cota_ia_negada');
erroCota.name = 'CotaIAError';
const antesCota = saudeIA(envSaude).falhasSeguidas;
const recebidoCota = await erroDe(() => gerarIA(envSaude, {
  user: 'x',
  beforeAttempt: async () => {
    throw erroCota;
  },
}));
checar('cota negada propaga o mesmo erro', recebidoCota === erroCota, true);
checar('cota negada não conta como falha da IA', saudeIA(envSaude).falhasSeguidas, antesCota);

// Entrada vazia também não.
await erroDe(() => gerarIA(envSaude, { user: '   ' }));
checar('mensagem ausente não conta como falha da IA', saudeIA(envSaude).falhasSeguidas, antesCota);

globalThis.fetch = async () => respostaOk();
await gerarIA(envSaude, { user: 'volta', beforeAttempt: async () => {} });
const saudeBoa = saudeIA(envSaude);
checar('um sucesso real volta para on', saudeBoa.ia, 'on');
checar('sucesso zera falhas seguidas', saudeBoa.falhasSeguidas, 0);
checar('último sucesso registrado', typeof saudeBoa.ultimoSucessoEm, 'string');
checar('amostra soma sucessos e falhas', saudeBoa.amostra, IA_FALHAS_PARA_DEGRADAR + 1);

reiniciarSaudeIA();
definirAlertaFalhaIA(() => {
  throw new Error('sentry fora');
});
globalThis.fetch = async () => respostaErro(400);
const erroComAlertaQuebrado = await erroDe(() => gerarIA(envSaude, { user: 'x' }));
checar('alerta quebrado não troca o erro devolvido', erroComAlertaQuebrado?.message, 'openrouter_400');
definirAlertaFalhaIA(null);
reiniciarSaudeIA();

console.log('\n9) schemas reais cumprem o modo strict da OpenAI (sem rede)');
// O gpt-4.1-nano é o 1º elo e a OpenAI recusa com 400 o schema INTEIRO quando
// um objeto tem propriedade fora de `required` ou não fecha
// `additionalProperties`. O ORCAMENTO_SCHEMA quebrou assim e só apareceu ao
// vivo; este check pega a regressão offline. (DIAG_SCHEMA e
// IA_ACTION_DRAFT_SCHEMA vivem em index.js e são cobertos pelo check:ai-models.)
function violacoesStrict(schema, caminho = '$') {
  if (!schema || typeof schema !== 'object') return [];
  const saida = [];
  const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (tipos.includes('object')) {
    const props = Object.keys(schema.properties || {});
    const obrigatorios = new Set(schema.required || []);
    const fora = props.filter((prop) => !obrigatorios.has(prop));
    if (fora.length) saida.push(`${caminho}: fora de required: ${fora.join(',')}`);
    if (schema.additionalProperties !== false) saida.push(`${caminho}: additionalProperties != false`);
    for (const prop of props) saida.push(...violacoesStrict(schema.properties[prop], `${caminho}.${prop}`));
  }
  if (schema.items) saida.push(...violacoesStrict(schema.items, `${caminho}[]`));
  return saida;
}
checar('ORCAMENTO_SCHEMA (voz) é strict-compatível', violacoesStrict(ORCAMENTO_SCHEMA), []);
checar('IA_IMPORTACAO_SCHEMA é strict-compatível', violacoesStrict(IA_IMPORTACAO_SCHEMA), []);
checar('IA_AUTOPILOT_SCHEMA é strict-compatível', violacoesStrict(IA_AUTOPILOT_SCHEMA), []);
checar('detector pega o bug antigo do orçamento', violacoesStrict({
  type: 'object',
  additionalProperties: false,
  required: ['itens'],
  properties: { titulo: { type: ['string', 'null'] }, itens: { type: 'array' } },
}), ['$: fora de required: titulo']);

globalThis.fetch = fetchReal;

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
