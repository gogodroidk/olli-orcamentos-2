// Valida AO VIVO a cadeia de modelos de texto do Worker antes de publicar.
//
//     OPENROUTER_API_KEY=... npm run check:ai-models
//     npm run check:ai-models -- --so-catalogo   (sem chave: só o catálogo)
//
// Três camadas, porque cada uma já quebrou sozinha em produção:
//   1. Config: a lista do wrangler (produção E staging) é igual à cadeia do
//      código, o pago está ligado explicitamente e todo ID pago está na
//      allowlist de worker/src/ai.js.
//   2. Catálogo público: o modelo existe, gera texto, anuncia response_format +
//      structured_outputs, o preço do catálogo cabe no teto da allowlist e não
//      está para expirar.
//   3. Chamada real pelo PRÓPRIO gerarIA (mesmo corpo do Worker: json_schema
//      strict, require_parameters, data_collection:'deny', max_price). É a
//      única forma de provar a política de dados: o catálogo não diz se algum
//      endpoint aceita `deny` — os :free morreram exatamente assim (404 "No
//      endpoints found matching your data policy"). Depois, a cadeia inteira
//      contra os schemas reais de orçamento/importação/autopilot. Custa
//      ~US$ 0,0005 no total.
//
// A chave vem só do ambiente e nunca é impressa.
import { readFile } from 'node:fs/promises';
import {
  OPENROUTER_MODELOS_PADRAO,
  OPENROUTER_MODELOS_PAGOS_PERMITIDOS,
  gerarIA,
  tetoPrecoOpenRouter,
} from '../worker/src/ai.js';
import { parseJsonLoose } from '../worker/src/util.js';
import { ORCAMENTO_SCHEMA } from '../worker/src/voz.js';
import { IA_IMPORTACAO_SCHEMA } from '../worker/src/iaImportacao.js';
import { IA_AUTOPILOT_SCHEMA } from '../worker/src/iaAutopilot.js';

const soCatalogo = process.argv.includes('--so-catalogo');
const DIA_MS = 24 * 60 * 60 * 1000;
// Expira em menos de 14 dias = falha (trocar JÁ). Entre 14 e 45 = aviso: a
// cadeia sobrevive (404 passa ao próximo elo), mas cada pedido gastaria uma
// tentativa de cota a mais até a troca.
const EXPIRACAO_FALHA_DIAS = 14;
const EXPIRACAO_AVISO_DIAS = 45;

const problemas = [];
const avisos = [];
const falhar = (msg) => problemas.push(msg);
const avisar = (msg) => avisos.push(msg);

// ─── 1. Configuração ─────────────────────────────────────────
const wrangler = await readFile(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8');
const listas = [...wrangler.matchAll(/"OPENROUTER_TEXT_MODELS"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
const flags = [...wrangler.matchAll(/"OPENROUTER_PERMITIR_PAGO"\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
if (!listas.length) throw new Error('OPENROUTER_TEXT_MODELS ausente em worker/wrangler.jsonc');

const cadeiaCodigo = [...OPENROUTER_MODELOS_PADRAO];
for (const [i, lista] of listas.entries()) {
  const ids = lista.split(',').map((id) => id.trim()).filter(Boolean);
  if (JSON.stringify(ids) !== JSON.stringify(cadeiaCodigo)) {
    falhar(`wrangler (ocorrência ${i + 1}): OPENROUTER_TEXT_MODELS diverge de OPENROUTER_MODELOS_PADRAO`);
  }
}
const cadeiaTemPago = cadeiaCodigo.some((id) => !id.endsWith(':free'));
if (cadeiaTemPago && (flags.length !== listas.length || flags.some((f) => f !== 'true'))) {
  falhar('cadeia paga exige OPENROUTER_PERMITIR_PAGO="true" em cada ambiente que define OPENROUTER_TEXT_MODELS');
}
if (!cadeiaCodigo.length || cadeiaCodigo.length > 5) falhar('cadeia de modelos fora do limite 1..5');
if (new Set(cadeiaCodigo).size !== cadeiaCodigo.length) falhar('há modelo duplicado na cadeia');

// ─── 2. Catálogo público ─────────────────────────────────────
const resposta = await fetch('https://openrouter.ai/api/v1/models', {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(20_000),
});
if (!resposta.ok) throw new Error(`Catálogo OpenRouter respondeu HTTP ${resposta.status}`);
const payload = await resposta.json();
const catalogo = new Map((payload?.data ?? []).map((m) => [m.id, m]));
const agora = Date.now();
// Catálogo vem em US$/token (string); allowlist e max_price são US$/milhão.
const porMilhao = (valor) => Math.round(Number(valor) * 1e6 * 1e6) / 1e6;

for (const id of cadeiaCodigo) {
  if (id === 'openrouter/free') {
    falhar(`${id}: router aleatório nunca entra na cadeia`);
    continue;
  }
  const modelo = catalogo.get(id);
  if (!modelo) {
    falhar(`${id}: removido ou ausente do catálogo oficial`);
    continue;
  }
  const precoPrompt = porMilhao(modelo?.pricing?.prompt);
  const precoCompletion = porMilhao(modelo?.pricing?.completion);
  if (id.endsWith(':free')) {
    if (precoPrompt !== 0 || precoCompletion !== 0) falhar(`${id}: preço deixou de ser zero`);
  } else {
    const teto = tetoPrecoOpenRouter(id);
    if (!teto) {
      falhar(`${id}: pago e fora de OPENROUTER_MODELOS_PAGOS_PERMITIDOS`);
    } else if (!(precoPrompt <= teto.prompt) || !(precoCompletion <= teto.completion)) {
      falhar(`${id}: catálogo ${precoPrompt}/${precoCompletion} US$/M acima do teto ${teto.prompt}/${teto.completion}`);
    }
  }
  const saidas = modelo?.architecture?.output_modalities ?? [];
  if (!saidas.includes('text')) falhar(`${id}: não anuncia saída textual`);
  const parametros = new Set(modelo?.supported_parameters ?? []);
  // A mesma cadeia atende JSON Schema com require_parameters:true: sem estes
  // dois, voz/diagnóstico/orçamento quebram mesmo que o chat pareça ok.
  for (const obrigatorio of ['response_format', 'structured_outputs']) {
    if (!parametros.has(obrigatorio)) falhar(`${id}: não suporta ${obrigatorio}`);
  }
  // Tool calling é para a evolução para agentes; hoje nenhuma rota usa.
  if (!parametros.has('tools')) avisar(`${id}: não anuncia tools (ok hoje; bloqueia agentes no futuro)`);
  if (modelo?.expiration_date) {
    const expiracao = Date.parse(modelo.expiration_date);
    const dias = Math.floor((expiracao - agora) / DIA_MS);
    if (Number.isFinite(expiracao) && dias < EXPIRACAO_FALHA_DIAS) {
      falhar(`${id}: expira em ${modelo.expiration_date} (${dias} dias) — trocar agora`);
    } else if (Number.isFinite(expiracao) && dias < EXPIRACAO_AVISO_DIAS) {
      avisar(`${id}: expira em ${modelo.expiration_date} (${dias} dias) — planejar a troca`);
    }
  }
  console.log(`catálogo ok  ${id}  (${precoPrompt}/${precoCompletion} US$/M)`);
}

// ─── 3. Chamada real com a política de produção ──────────────
const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
if (!apiKey && !soCatalogo) {
  falhar('OPENROUTER_API_KEY ausente: a política de dados (data_collection=deny) NÃO foi verificada. '
    + 'Rode com a chave no ambiente, ou use --so-catalogo sabendo que isso não prova que a IA responde.');
} else if (!apiKey) {
  avisar('--so-catalogo: política de dados e resposta real NÃO verificadas');
} else {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'palavra'],
    properties: { ok: { type: 'boolean' }, palavra: { type: 'string', maxLength: 20 } },
  };
  for (const id of cadeiaCodigo) {
    const inicio = Date.now();
    try {
      const texto = await gerarIA({
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: apiKey,
        OPENROUTER_PERMITIR_PAGO: id.endsWith(':free') ? '' : 'true',
        OPENROUTER_TEXT_MODELS: id,
        OPENROUTER_SITE_URL: 'https://olliorcamentos.online',
        OPENROUTER_APP_NAME: 'OLLI Orcamentos check',
      }, {
        system: 'Responda somente com o JSON do schema.',
        user: 'Teste sintético de saúde: devolva ok=true e palavra="orcamento".',
        wantJson: true,
        jsonSchema: schema,
        temperature: 0,
        maxTokens: 64,
        timeoutMs: 30_000,
      });
      const ms = Date.now() - inicio;
      // Mesmo parser tolerante das rotas (cerca ```json etc.): o check mede o
      // que o usuário receberia, não um formato mais rígido que produção.
      const objeto = parseJsonLoose(texto);
      if (!objeto || objeto.ok !== true || typeof objeto.palavra !== 'string') {
        // Prompt sintético: mostrar o começo da resposta não expõe ninguém.
        const trecho = JSON.stringify(String(texto).slice(0, 80));
        falhar(`${id}: respondeu (${ms} ms), mas fora do JSON Schema: ${trecho}`);
      } else {
        console.log(`chamada ok   ${id}  ${ms} ms  (data_collection=deny, json_schema strict)`);
      }
    } catch (erro) {
      const ms = Date.now() - inicio;
      const status = Number.isInteger(erro?.status) ? ` HTTP ${erro.status}` : '';
      falhar(`${id}: chamada real falhou em ${ms} ms — ${erro?.message || 'erro'}${status}`);
    }
  }

  // Cada modelo aceita o schema mínimo acima, mas NÃO necessariamente os
  // schemas reais: em 29/09/2026 a OpenAI recusou o de orçamento (campo fora
  // de `required`) e o Gemini recusa os grandes ("too many states"). O que
  // importa para o usuário é a CADEIA servir cada schema — então roda a cadeia
  // inteira, como produção, uma vez por schema real importável sem o Sentry.
  const schemasReais = {
    orcamento_voz: ORCAMENTO_SCHEMA,
    importacao: IA_IMPORTACAO_SCHEMA,
    autopilot: IA_AUTOPILOT_SCHEMA,
  };
  for (const [nome, jsonSchema] of Object.entries(schemasReais)) {
    const inicio = Date.now();
    const tentados = [];
    try {
      const texto = await gerarIA({
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: apiKey,
        OPENROUTER_PERMITIR_PAGO: 'true',
        OPENROUTER_TEXT_MODELS: cadeiaCodigo.join(','),
        OPENROUTER_SITE_URL: 'https://olliorcamentos.online',
        OPENROUTER_APP_NAME: 'OLLI Orcamentos check',
      }, {
        system: 'Responda somente com o JSON do schema, em pt-BR.',
        user: 'Dados sintéticos: cliente Maria Teste, limpeza de split 12 mil BTUs R$ 180, troca de capacitor R$ 90.',
        wantJson: true,
        jsonSchema,
        temperature: 0,
        maxTokens: 1_200,
        timeoutMs: 45_000,
        beforeAttempt: async ({ model }) => {
          tentados.push(model);
        },
      });
      if (!parseJsonLoose(texto)) throw new Error('json_invalido');
      console.log(`schema ok    ${nome}  ${Date.now() - inicio} ms  servido por ${tentados.at(-1)}`
        + `${tentados.length > 1 ? ` (após ${tentados.length - 1} recusa(s))` : ''}`);
      if (tentados.length > 1) avisar(`${nome}: ${tentados.slice(0, -1).join(', ')} recusou o schema; a cadeia gasta 1 tentativa de cota a mais`);
    } catch (erro) {
      const status = Number.isInteger(erro?.status) ? ` HTTP ${erro.status}` : '';
      falhar(`schema ${nome}: nenhum modelo da cadeia serviu (${erro?.message || 'JSON inválido'}${status})`);
    }
  }
}

for (const aviso of avisos) console.warn(`AVISO  ${aviso}`);
if (problemas.length) {
  for (const problema of problemas) console.error(`FALHA  ${problema}`);
  process.exitCode = 1;
} else {
  const pagos = cadeiaCodigo.filter((id) => OPENROUTER_MODELOS_PAGOS_PERMITIDOS[id]).length;
  console.log(`OpenRouter: ${cadeiaCodigo.length} modelos validados (${pagos} pagos em allowlist)`
    + `${apiKey ? ', com chamada real sob a política de produção' : ', SÓ catálogo'}.`);
}
