// Adaptador único de IA do Worker.
//
// Produção usa OpenRouter apenas para TEXTO. Por padrão só aceita modelos
// gratuitos (`:free`); modelos pagos exigem DUAS chaves ao mesmo tempo: a var
// `OPENROUTER_PERMITIR_PAGO="true"` e o ID estar na allowlist em código abaixo,
// com teto de preço enviado ao OpenRouter em cada request. Áudio é transcrito
// no binding Workers AI antes de qualquer geração textual. O Gemini permanece
// somente como rollback explícito (`AI_PROVIDER=gemini`), sem failover
// silencioso entre fornecedores.

import { gemini } from './gemini.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
const AUDIO_BASE64_MAX_CHARS = 4_000_000;

// Cadeia gratuita legada: é o padrão quando OPENROUTER_TEXT_MODELS está vazio
// e o pago NÃO foi liberado. Mantida só para não mudar o comportamento de quem
// não ligou a flag. Em 29/09/2026, com `data_collection:'deny'`, estes :free
// respondiam 404 ("unavailable for free" / "No endpoints found matching your
// data policy") — por isso produção passou para a cadeia paga abaixo.
export const OPENROUTER_MODELOS_GRATUITOS_PADRAO = Object.freeze([
  'nex-agi/nex-n2.5-mini:free',
  'nex-agi/nex-n2.5-pro:free',
  'liquid/lfm-2.5-2.6b:free',
]);

// Allowlist PAGA, em código de propósito: uma var do painel nunca consegue
// sozinha apontar o OLLI para um modelo caro. Tetos em US$ por MILHÃO de
// tokens, no formato do `provider.max_price` do OpenRouter — enviados em cada
// request, então um endpoint mais caro (tier "priority", região cara, aumento
// de preço do catálogo) é recusado pelo próprio OpenRouter em vez de cobrado.
// Todos anunciam `response_format` + `structured_outputs` e foram testados em
// 29/09/2026 com o MESMO corpo do Worker (json_schema strict,
// require_parameters, data_collection:'deny') contra os 5 schemas reais:
//   gpt-4.1-nano           aceita os 5; 1–5 s   (catálogo US$ 0,10/0,40 por M)
//   gemini-2.5-flash-lite  400 "too many states" em orçamento, importação e
//                          autopilot (maxLength/maxItems longos); ok em chat,
//                          diagnóstico e rascunho; ~1 s. EXPIRA 20/10/2026.
//   mistral-small-2501     aceita os 5, mas 9–68 s nos schemas grandes (cabe
//                          no prazo de 25 s só nos pequenos) (US$ 0,05/0,08)
// Por isso a ORDEM é nano → gemini → mistral, e um 400 em request com
// json_schema passa ao próximo modelo (incompatibilidade é do modelo, não do
// pedido). Os tetos dão ~20% de folga sobre o catálogo. Mudar um preço aqui é
// decisão de custo: rode `npm run check:ai-models` antes (catálogo ao vivo).
export const OPENROUTER_MODELOS_PAGOS_PERMITIDOS = Object.freeze({
  'openai/gpt-4.1-nano': Object.freeze({ prompt: 0.12, completion: 0.48 }),
  'google/gemini-2.5-flash-lite': Object.freeze({ prompt: 0.12, completion: 0.48 }),
  'mistralai/mistral-small-24b-instruct-2501': Object.freeze({ prompt: 0.06, completion: 0.1 }),
});

// Cadeia de produção (mesma ordem de `OPENROUTER_TEXT_MODELS` no
// wrangler.jsonc — o `check:ai-models` exige igualdade). Um 404/408/429/5xx
// (ou 400 com json_schema) passa ao próximo com reserva de cota própria.
export const OPENROUTER_MODELOS_PADRAO = Object.freeze(
  Object.keys(OPENROUTER_MODELOS_PAGOS_PERMITIDOS),
);

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

/** Pago só liga com o texto exato "true" — qualquer outra coisa é desligado. */
export function pagamentoOpenRouterPermitido(env = {}) {
  return textoConfig(env.OPENROUTER_PERMITIR_PAGO).toLowerCase() === 'true';
}

/**
 * Teto de preço (US$/milhão de tokens) do modelo, ou null quando ele é
 * gratuito. Só existe para IDs da allowlist — é o que vai em `max_price`.
 */
export function tetoPrecoOpenRouter(modelo) {
  if (!Object.prototype.hasOwnProperty.call(OPENROUTER_MODELOS_PAGOS_PERMITIDOS, modelo)) return null;
  const teto = OPENROUTER_MODELOS_PAGOS_PERMITIDOS[modelo];
  return { prompt: teto.prompt, completion: teto.completion };
}

// Um aviso por modelo ignorado por isolate: a config é a mesma em toda
// request, então repetir o log a cada chamada só geraria ruído.
const modelosIgnoradosAvisados = new Set();

function avisarModeloIgnorado(model, motivo) {
  const chave = `${motivo}:${model}`;
  if (modelosIgnoradosAvisados.has(chave)) return;
  modelosIgnoradosAvisados.add(chave);
  console.warn('[olli-worker] openrouter_modelo_ignorado', { model, motivo });
}

function modelosOpenRouter(env) {
  const pagoPermitido = pagamentoOpenRouterPermitido(env);
  const configuracao = textoConfig(
    env.OPENROUTER_TEXT_MODELS || env.OPENROUTER_MODELS || env.OPENROUTER_MODEL,
  );
  const candidatos = configuracao
    ? configuracao.split(',').map((modelo) => modelo.trim()).filter(Boolean)
    : [...(pagoPermitido ? OPENROUTER_MODELOS_PADRAO : OPENROUTER_MODELOS_GRATUITOS_PADRAO)];

  // Configuração acidental nunca ativa cobrança: sem a flag só passa `:free`;
  // com a flag passa `:free` OU um ID da allowlist em código. Qualquer outro
  // (inclusive `openrouter/free`, que sorteia modelo) é ignorado com log.
  // Limita também o tamanho da cadeia e remove duplicatas preservando a ordem.
  const aceitos = candidatos.filter((modelo) => {
    if (modelo === 'openrouter/free') {
      avisarModeloIgnorado(modelo, 'router_aleatorio');
      return false;
    }
    if (modeloGratuito(modelo)) return true;
    if (!tetoPrecoOpenRouter(modelo)) {
      avisarModeloIgnorado(modelo, 'fora_da_allowlist');
      return false;
    }
    if (!pagoPermitido) {
      avisarModeloIgnorado(modelo, 'pago_nao_liberado');
      return false;
    }
    return true;
  });
  const modelos = [...new Set(aceitos)].slice(0, 5);
  if (!modelos.length) {
    throw erroSeguro(pagoPermitido ? 'modelos_permitidos_ausentes' : 'modelos_gratuitos_ausentes');
  }
  return modelos;
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
      // LGPD: nunca relaxar. Endpoint que declara treinar com o prompt é
      // recusado pelo OpenRouter (404 "No endpoints found matching your data
      // policy"), mesmo que isso derrube um modelo da cadeia.
      data_collection: 'deny',
      // O Worker continua controlando a cadeia de MODELOS e contabilizando cada
      // tentativa. Dentro do modelo escolhido, o OpenRouter pode usar outro
      // endpoint equivalente quando o primeiro estiver cheio; isso não troca o
      // modelo e evita transformar uma indisponibilidade transitória de um
      // provedor em erro 503 para o usuário. Em modelo pago, o `max_price` da
      // tentativa (abaixo) impede que esse fallback caia num endpoint mais caro.
      allow_fallbacks: true,
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

  // Metadado saneado para a saúde/alerta: quantos fetches saíram de fato e o
  // tamanho da cadeia. Nunca carrega prompt, resposta nem usuário.
  const falhar = (error, tentativas) => {
    error.tentativas = tentativas;
    error.modelos = modelosDaChamada.length;
    return error;
  };

  for (let indice = 0; indice < modelosDaChamada.length; indice++) {
    const model = modelosDaChamada[indice];
    if (contabilizaTentativas) {
      try {
        await beforeAttempt({ model, tentativa: indice + 1, total: modelosDaChamada.length });
      } catch (erroReserva) {
        // Cota negada/indisponível não é falha do provedor: não pode marcar a
        // IA como degradada nem acordar o Sentry.
        marcarErroForaDoProvedor(erroReserva);
        throw erroReserva;
      }
    }

    const restanteMs = deadline - Date.now();
    if (restanteMs <= 0) throw falhar(erroSeguro('timeout', { overloaded: true }), indice);

    // Teto por tentativa: só modelos pagos da allowlist têm; `:free` segue com
    // o corpo de sempre.
    const tetoPreco = tetoPrecoOpenRouter(model);
    const bodyTentativa = tetoPreco
      ? { ...bodyBase, provider: { ...bodyBase.provider, max_price: tetoPreco }, model }
      : { ...bodyBase, model };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), restanteMs);
    let response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        // Um modelo explícito por request. Nunca delega fallback de modelo ou
        // escolha aleatória ao OpenRouter: o Worker controla e contabiliza tudo.
        body: JSON.stringify(bodyTentativa),
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = cause && cause.name === 'AbortError';
      const error = erroSeguro(timedOut ? 'timeout' : 'falha_rede', { overloaded: timedOut });
      if (indice + 1 < modelosDaChamada.length) continue;
      throw falhar(error, indice + 1);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Não lê, devolve nem registra o corpo do provedor: ele pode repetir
      // prompt, transcrição ou conteúdo de cliente.
      // O status e o modelo são metadados operacionais seguros e permitem
      // distinguir rate-limit/capacidade de erro de configuração sem guardar
      // a mensagem enviada pelo usuário.
      console.warn('[olli-worker] openrouter_provider_status', {
        model,
        status: response.status,
        tentativa: indice + 1,
      });
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
      // 400 com json_schema = este modelo não serve ESTE schema (a OpenAI exige
      // todo campo em `required`; o Gemini recusa schema com "too many
      // states"). O próximo modelo pode servir — o Worker não guarda o corpo,
      // então não distingue isso de outro 400, mas o provedor não cobra 400 e
      // cada tentativa já tem sua própria reserva de cota. Sem schema, 400
      // continua definitivo: é o pedido que está errado.
      const schemaIncompativel = response.status === 400 && wantJson && Boolean(schemaValido);
      if ((retryable || schemaIncompativel) && indice + 1 < modelosDaChamada.length) continue;
      throw falhar(error, indice + 1);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      // Resposta inválida e moderação não disparam outra chamada: não são uma
      // falha transitória comprovada e poderiam multiplicar consumo.
      throw falhar(erroSeguro('resposta_invalida'), indice + 1);
    }
    const text = conteudoResposta(data);
    if (!text) throw falhar(erroSeguro('resposta_invalida'), indice + 1);
    return text;
  }

  // Inalcançável com a validação de modelos acima; mantém falha fechada caso o
  // contrato mude no futuro.
  throw erroSeguro('modelos_permitidos_ausentes');
}

// ─── Saúde e alerta da IA ────────────────────────────────────
// O health (`GET /`) dizia `ia:"on"` só porque a chave existia — e a IA ficou
// fora do ar por dias sem ninguém saber. Agora cada geração REAL registra o
// resultado aqui, sem chamar o provedor a mais: o health lê este estado.
//
// Limite honesto: o estado vive na memória do isolate (não há KV/D1 neste
// Worker). Um isolate recém-criado não viu nenhuma chamada e reporta
// `amostra:0`, o que é diferente de "saudável" — por isso o health expõe a
// amostra junto do veredito.
export const IA_FALHAS_PARA_DEGRADAR = 3;
// Um alerta por isolate a cada 10 min: o plano grátis do Sentry tem 5k
// eventos/mês e a mesma queda repetiria o mesmo evento a cada request.
const IA_ALERTA_INTERVALO_MS = 10 * 60 * 1000;
// Erros de ENTRADA (request mal formado) não dizem nada sobre o provedor.
const CODIGOS_FORA_DO_PROVEDOR = new Set(['mensagem_ia_ausente', 'audio_requer_transcricao']);

const errosForaDoProvedor = new WeakSet();
function marcarErroForaDoProvedor(erro) {
  if (erro && typeof erro === 'object') errosForaDoProvedor.add(erro);
}

function saudeInicial() {
  return {
    sucessos: 0,
    falhas: 0,
    falhasSeguidas: 0,
    ultimoSucessoEm: null,
    ultimaFalhaEm: null,
    ultimoAlertaEm: 0,
  };
}

let saudeIsolate = saudeInicial();
let alertaFalhaIA = null;

/**
 * Registra quem é avisado quando a cadeia inteira falha (produção: Sentry,
 * ligado em index.js). Fica fora deste módulo para os testes Node rodarem sem
 * `@sentry/cloudflare`. `null` desliga.
 */
export function definirAlertaFalhaIA(fn) {
  alertaFalhaIA = typeof fn === 'function' ? fn : null;
}

/** Só para testes: zera o estado do isolate. */
export function reiniciarSaudeIA() {
  saudeIsolate = saudeInicial();
}

function registrarSucessoIA() {
  saudeIsolate.sucessos += 1;
  saudeIsolate.falhasSeguidas = 0;
  saudeIsolate.ultimoSucessoEm = new Date().toISOString();
}

function registrarFalhaIA(provedor, erro) {
  const agora = Date.now();
  saudeIsolate.falhas += 1;
  saudeIsolate.falhasSeguidas += 1;
  saudeIsolate.ultimaFalhaEm = new Date(agora).toISOString();
  if (!alertaFalhaIA || agora - saudeIsolate.ultimoAlertaEm < IA_ALERTA_INTERVALO_MS) return;
  saudeIsolate.ultimoAlertaEm = agora;
  // Somente metadado operacional: código saneado, status HTTP, contagens.
  // Nada de prompt, resposta, usuário, chave ou corpo do provedor.
  const info = {
    provedor,
    codigo: typeof erro?.message === 'string' ? erro.message.slice(0, 60) : 'erro_desconhecido',
    status: Number.isInteger(erro?.status) ? erro.status : null,
    tentativas: Number.isInteger(erro?.tentativas) ? erro.tentativas : null,
    modelos: Number.isInteger(erro?.modelos) ? erro.modelos : null,
    falhasSeguidas: saudeIsolate.falhasSeguidas,
  };
  try {
    alertaFalhaIA(info);
  } catch {
    // Alerta nunca derruba a resposta ao usuário.
  }
}

/**
 * Estado para o health. `ia` continua 'on'/'off' para compatibilidade e ganha
 * 'degradada' quando as últimas N gerações reais falharam em sequência.
 */
export function saudeIA(env = {}) {
  const configurada = aiConfigurada(env);
  const s = saudeIsolate;
  const degradada = configurada && s.falhasSeguidas >= IA_FALHAS_PARA_DEGRADAR;
  return {
    ia: !configurada ? 'off' : degradada ? 'degradada' : 'on',
    amostra: s.sucessos + s.falhas,
    falhasSeguidas: s.falhasSeguidas,
    ultimoSucessoEm: s.ultimoSucessoEm,
    ultimaFalhaEm: s.ultimaFalhaEm,
  };
}

async function gerarComRegistro(provedor, gerar) {
  try {
    const texto = await gerar();
    registrarSucessoIA();
    return texto;
  } catch (erro) {
    const foraDoProvedor = errosForaDoProvedor.has(erro)
      || CODIGOS_FORA_DO_PROVEDOR.has(erro?.message);
    if (!foraDoProvedor) registrarFalhaIA(provedor, erro);
    throw erro;
  }
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
    return gerarComRegistro('gemini', () => gemini(env, opcoes));
  }
  if (provedor === 'openrouter') return gerarComRegistro('openrouter', () => gerarOpenRouter(env, opcoes));
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
