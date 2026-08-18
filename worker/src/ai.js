// Adaptador único de IA do Worker.
//
// Produção usa OpenRouter apenas para TEXTO, sempre limitada a modelos
// gratuitos. Áudio é transcrito no binding Workers AI antes de qualquer
// geração textual. O Gemini permanece somente como rollback explícito
// (`AI_PROVIDER=gemini`), sem failover silencioso entre fornecedores.

import { gemini } from './gemini.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
const AUDIO_BASE64_MAX_CHARS = 4_000_000;

export const OPENROUTER_MODELOS_PADRAO = Object.freeze([
  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-nano-9b-v2:free',
]);

function erroSeguro(codigo, { overloaded = false, status } = {}) {
  const err = new Error(codigo);
  err.overloaded = overloaded;
  if (Number.isInteger(status)) err.status = status;
  return err;
}

function textoConfig(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function textoCabecalhoAscii(valor, fallback) {
  const limpo = (textoConfig(valor) || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 120)
    .trim();
  return limpo || fallback;
}

/**
 * Resolve o provedor sem misturar credenciais ou tentar outro fornecedor após
 * uma falha. A seleção é sempre explícita: secret ausente nunca muda o OLLI de
 * OpenRouter para Gemini silenciosamente.
 */
export function provedorIA(env = {}) {
  const configurado = textoConfig(env.AI_PROVIDER).toLowerCase();
  if (configurado) {
    if (configurado === 'openrouter' || configurado === 'gemini') return configurado;
    return null;
  }
  return null;
}

export function aiConfigurada(env = {}) {
  const provedor = provedorIA(env);
  if (provedor === 'openrouter') return Boolean(textoConfig(env.OPENROUTER_API_KEY));
  if (provedor === 'gemini') return Boolean(textoConfig(env.GEMINI_API_KEY));
  return false;
}

function modeloGratuito(modelo) {
  // O router `openrouter/free` é deliberadamente excluído: ele escolhe um
  // modelo aleatório. Produção usa apenas IDs explícitos e auditados.
  return modelo.endsWith(':free');
}

function modelosOpenRouter(env) {
  const configuracao = textoConfig(
    env.OPENROUTER_TEXT_MODELS || env.OPENROUTER_MODELS || env.OPENROUTER_MODEL,
  );
  const candidatos = configuracao
    ? configuracao.split(',').map((modelo) => modelo.trim()).filter(Boolean)
    : [...OPENROUTER_MODELOS_PADRAO];

  // Nunca deixa uma configuração acidental ativar cobrança. Limita também o
  // tamanho da cadeia de fallback e remove duplicatas preservando a ordem.
  const gratuitos = [...new Set(candidatos.filter(modeloGratuito))].slice(0, 5);
  if (!gratuitos.length) throw erroSeguro('modelos_gratuitos_ausentes');
  return gratuitos;
}

function textoPartes(parts) {
  if (!Array.isArray(parts)) return '';
  if (parts.some((part) => part && (part.inline_data || part.inlineData))) {
    throw erroSeguro('audio_requer_transcricao');
  }
  return parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function mensagensOpenRouter({ system, user, userParts }) {
  const messages = [];
  if (typeof system === 'string' && system.trim()) {
    messages.push({ role: 'system', content: system.trim() });
  }

  if (Array.isArray(userParts)) {
    const content = textoPartes(userParts);
    if (content) messages.push({ role: 'user', content });
  } else if (Array.isArray(user)) {
    for (const turno of user) {
      if (!turno || typeof turno !== 'object') continue;
      const content = textoPartes(turno.parts);
      if (!content) continue;
      const role = turno.role === 'model' || turno.role === 'assistant'
        ? 'assistant'
        : turno.role === 'system'
          ? 'system'
          : 'user';
      messages.push({ role, content });
    }
  } else if (typeof user === 'string' && user.trim()) {
    messages.push({ role: 'user', content: user.trim() });
  }

  if (!messages.some((message) => message.role !== 'system')) {
    throw erroSeguro('mensagem_ia_ausente');
  }
  return messages;
}

function numeroLimitado(valor, padrao, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(maximo, Math.max(minimo, numero));
}

function conteudoResposta(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('')
    .trim();
}

async function gerarOpenRouter(
  env,
  {
    system,
    user,
    userParts,
    wantJson = false,
    jsonSchema,
    temperature = 0.4,
    timeoutMs = 25_000,
    maxTokens,
    beforeAttempt,
  } = {},
) {
  const apiKey = textoConfig(env.OPENROUTER_API_KEY);
  if (!apiKey) throw erroSeguro('openrouter_nao_configurado');

  const modelos = modelosOpenRouter(env);
  const schemaValido = jsonSchema && typeof jsonSchema === 'object' && !Array.isArray(jsonSchema)
    ? jsonSchema
    : null;
  const respostaEstruturada = schemaValido
    ? {
        type: 'json_schema',
        json_schema: {
          name: 'olli_resposta',
          strict: true,
          schema: schemaValido,
        },
      }
    : { type: 'json_object' };

  const bodyBase = {
    messages: mensagensOpenRouter({ system, user, userParts }),
    temperature: numeroLimitado(temperature, 0.4, 0, 2),
    max_tokens: Math.round(numeroLimitado(maxTokens, wantJson ? 1_800 : 1_200, 64, 4_096)),
    provider: {
      data_collection: 'deny',
      // O Worker controla o fallback por modelo e contabiliza cada tentativa.
      // Desliga também o failover interno de endpoint/provedor do OpenRouter.
      allow_fallbacks: false,
      ...(wantJson ? { require_parameters: true } : {}),
    },
    ...(wantJson ? { response_format: respostaEstruturada } : {}),
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': textoConfig(env.OPENROUTER_SITE_URL) || 'https://olliorcamentos.online',
    'X-OpenRouter-Title': textoCabecalhoAscii(env.OPENROUTER_APP_NAME, 'OLLI Orcamentos'),
  };

  const prazoMs = Math.round(numeroLimitado(timeoutMs, 25_000, 10, 120_000));
  // Prazo TOTAL da geração, não por modelo. Um fallback rápido cabe no que
  // restar; duas tentativas nunca somam 2 × 25s depois que o app já desistiu.
  const deadline = Date.now() + prazoMs;
  const contabilizaTentativas = typeof beforeAttempt === 'function';
  // Sem callback, o chamador já reservou uma única unidade: uma segunda chamada
  // seria consumo não contabilizado. Com callback, cada modelo pode ter sua
  // reserva imediatamente antes do fetch correspondente.
  const modelosDaChamada = contabilizaTentativas ? modelos : modelos.slice(0, 1);

  for (let indice = 0; indice < modelosDaChamada.length; indice++) {
    const model = modelosDaChamada[indice];
    if (contabilizaTentativas) {
      await beforeAttempt({ model, tentativa: indice + 1, total: modelosDaChamada.length });
    }

    const restanteMs = deadline - Date.now();
    if (restanteMs <= 0) throw erroSeguro('timeout', { overloaded: true });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), restanteMs);
    let response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        // Um modelo explícito por request. Nunca delega fallback de modelo ou
        // escolha aleatória ao OpenRouter: o Worker controla e contabiliza tudo.
        body: JSON.stringify({ ...bodyBase, model }),
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = cause && cause.name === 'AbortError';
      const error = erroSeguro(timedOut ? 'timeout' : 'falha_rede', { overloaded: timedOut });
      if (indice + 1 < modelosDaChamada.length) continue;
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Não lê, devolve nem registra o corpo do provedor: ele pode repetir
      // prompt, transcrição ou conteúdo de cliente.
      if (response.body && typeof response.body.cancel === 'function') {
        await response.body.cancel().catch(() => {});
      }
      const retryable = response.status === 404
        || response.status === 408
        || response.status === 429
        || (response.status >= 500 && response.status <= 599);
      const codigoErro = response.status === 404
        ? 'modelo_indisponivel'
        : retryable
          ? 'sobrecarregado'
          : `openrouter_${response.status}`;
      const error = erroSeguro(codigoErro, {
        // 404 autoriza outro modelo volátil, mas não significa sobrecarga.
        overloaded: retryable && response.status !== 404,
        status: response.status,
      });
      if (retryable && indice + 1 < modelosDaChamada.length) continue;
      throw error;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      // Resposta inválida e moderação não disparam outra chamada: não são uma
      // falha transitória comprovada e poderiam multiplicar consumo.
      throw erroSeguro('resposta_invalida');
    }
    const text = conteudoResposta(data);
    if (!text) throw erroSeguro('resposta_invalida');
    return text;
  }

  // Inalcançável com a validação de modelos acima; mantém falha fechada caso o
  // contrato mude no futuro.
  throw erroSeguro('modelos_gratuitos_ausentes');
}

/**
 * Interface compatível com gemini(): retorna apenas o texto gerado.
 * O rollback só ocorre quando AI_PROVIDER=gemini; nunca após erro do
 * OpenRouter e nunca por ausência de configuração.
 */
export async function gerarIA(env = {}, opcoes = {}) {
  const provedor = provedorIA(env);
  if (provedor === 'gemini') {
    if (!textoConfig(env.GEMINI_API_KEY)) throw erroSeguro('gemini_nao_configurado');
    // Rollback explícito continua passando pelo mesmo gate diário. Sem isto,
    // trocar AI_PROVIDER para Gemini também desligaria a proteção de custo.
    if (typeof opcoes.beforeAttempt === 'function') {
      await opcoes.beforeAttempt({
        model: textoConfig(env.GEMINI_MODEL) || 'gemini-2.5-flash',
        tentativa: 1,
        total: 1,
      });
    }
    return gemini(env, opcoes);
  }
  if (provedor === 'openrouter') return gerarOpenRouter(env, opcoes);
  throw erroSeguro(textoConfig(env?.AI_PROVIDER) ? 'provedor_ia_invalido' : 'ia_nao_configurada');
}

/**
 * Transcreve áudio no binding nativo Workers AI. O áudio não passa pelo
 * OpenRouter; somente a transcrição pode ser usada depois em gerarIA().
 */
export async function transcreverAudio(
  env,
  { audioBase64, language = 'pt', initialPrompt, prompt } = {},
) {
  if (!env?.AI || typeof env.AI.run !== 'function') {
    throw erroSeguro('transcricao_nao_configurada');
  }
  if (typeof audioBase64 !== 'string' || !audioBase64.length) {
    throw erroSeguro('audio_ausente');
  }
  if (audioBase64.length > AUDIO_BASE64_MAX_CHARS) {
    throw erroSeguro('audio_grande_demais');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)) {
    throw erroSeguro('audio_base64_invalido');
  }

  const idioma = typeof language === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)
    ? language
    : 'pt';
  const contexto = textoConfig(initialPrompt || prompt).slice(0, 500);

  let result;
  try {
    result = await env.AI.run(WHISPER_MODEL, {
      audio: audioBase64,
      task: 'transcribe',
      language: idioma,
      vad_filter: true,
      ...(contexto ? { initial_prompt: contexto } : {}),
    });
  } catch (cause) {
    const detail = typeof cause?.message === 'string' ? cause.message : '';
    const overloaded = /(?:429|quota|rate|overload|unavailable)/i.test(detail);
    throw erroSeguro(overloaded ? 'transcricao_sobrecarregada' : 'falha_transcricao', { overloaded });
  }

  const text = typeof result === 'string' ? result.trim() : textoConfig(result?.text);
  if (!text) throw erroSeguro('transcricao_vazia');
  return text;
}
