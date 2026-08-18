/**
 * Reserva diaria de cota de IA, persistida no Supabase.
 *
 * A chamada deve acontecer imediatamente ANTES do dispatch ao provedor. Somente
 * `permitido` autoriza um NOVO dispatch. `ja_reservado` informa um retry, mas nao
 * autoriza chamar o upstream outra vez: o chamador deve reutilizar uma resposta
 * ja cacheada ou encerrar o retry. Qualquer incerteza bloqueia (fail-closed).
 *
 * Este modulo nunca envia prompt/audio para o banco: somente UUID do usuario,
 * familia, limites, unidades e um request_id opaco. Tambem nao escreve logs.
 */

export const FAMILIAS_COTA_IA = Object.freeze({
  OPENROUTER: 'openrouter',
  WHISPER: 'whisper',
});

const FAMILIAS = new Set(Object.values(FAMILIAS_COTA_IA));
const ESTADOS = new Set(['permitido', 'ja_reservado', 'limite_global', 'limite_usuario']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{16,128}$/;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE_MAXIMO = 1_000_000;
const TIMEOUT_PADRAO_MS = 5_000;

function indisponivel() {
  return { permitido: false, estado: 'indisponivel' };
}

function inteiroNoIntervalo(valor, minimo, maximo) {
  return Number.isInteger(valor) && valor >= minimo && valor <= maximo;
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object';
}

/** Serializacao deterministica: a ordem das chaves nao muda o SHA-256. */
function serializarCanonico(valor, visitados = new WeakSet()) {
  if (valor === null) return 'null';

  const tipo = typeof valor;
  if (tipo === 'string' || tipo === 'boolean') return JSON.stringify(valor);
  if (tipo === 'number') return Number.isFinite(valor) ? JSON.stringify(valor) : 'null';
  if (tipo === 'bigint') return JSON.stringify(valor.toString());
  if (tipo === 'undefined' || tipo === 'function' || tipo === 'symbol') return 'null';

  if (!ehObjeto(valor)) return JSON.stringify(String(valor));
  if (visitados.has(valor)) throw new TypeError('corpo circular');
  visitados.add(valor);

  let resultado;
  if (valor instanceof Date) {
    resultado = JSON.stringify(valor.toISOString());
  } else if (valor instanceof Uint8Array) {
    resultado = `[${Array.from(valor).join(',')}]`;
  } else if (valor instanceof ArrayBuffer) {
    resultado = `[${Array.from(new Uint8Array(valor)).join(',')}]`;
  } else if (Array.isArray(valor)) {
    resultado = `[${valor.map((item) => serializarCanonico(item, visitados)).join(',')}]`;
  } else {
    const partes = [];
    for (const chave of Object.keys(valor).sort()) {
      const item = valor[chave];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      partes.push(`${JSON.stringify(chave)}:${serializarCanonico(item, visitados)}`);
    }
    resultado = `{${partes.join(',')}}`;
  }

  visitados.delete(valor);
  return resultado;
}

/**
 * Gera um identificador opaco e estavel para retries da mesma rota+corpo.
 * O retorno e SHA-256 hexadecimal (64 caracteres); o corpo nao sai do processo.
 *
 * Este e um fallback PESSIMISTA: dois trabalhos legitimos com rota+corpo iguais
 * no mesmo dia geram `ja_reservado`. Em producao, prefira `requestId` proprio,
 * unico por acao do usuario e reutilizado somente nos retries dessa acao.
 */
export async function gerarRequestIdIA(rota, corpo) {
  const rotaNormalizada = typeof rota === 'string' ? rota.trim() : '';
  if (!rotaNormalizada || rotaNormalizada.length > 512) throw new TypeError('rota invalida');

  const material = `olli-ia-quota:v1\n${rotaNormalizada}\n${serializarCanonico(corpo)}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function resolverRequestId({ requestId, rota, corpo }) {
  if (requestId !== undefined && requestId !== null && requestId !== '') {
    const normalizado = typeof requestId === 'string' ? requestId.trim() : '';
    if (!REQUEST_ID_RE.test(normalizado)) throw new TypeError('requestId invalido');
    return normalizado;
  }
  return gerarRequestIdIA(rota, corpo);
}

function linhaDaResposta(dados) {
  const linha = Array.isArray(dados) ? dados[0] : dados;
  if (!linha || typeof linha !== 'object') return null;

  const estado = linha.estado;
  const dia = linha.dia;
  const usadosGlobal = Number(linha.usados_global);
  const usadosUsuario = Number(linha.usados_usuario);
  const limiteGlobal = Number(linha.limite_global);
  const limiteUsuario = Number(linha.limite_usuario);
  const unidades = Number(linha.unidades);

  if (!ESTADOS.has(estado) || !DIA_RE.test(dia)) return null;
  if (!inteiroNoIntervalo(usadosGlobal, 0, LIMITE_MAXIMO)) return null;
  if (!inteiroNoIntervalo(usadosUsuario, 0, LIMITE_MAXIMO)) return null;
  if (!inteiroNoIntervalo(limiteGlobal, 1, LIMITE_MAXIMO)) return null;
  if (!inteiroNoIntervalo(limiteUsuario, 1, limiteGlobal)) return null;
  if (!inteiroNoIntervalo(unidades, 1, limiteUsuario)) return null;

  // Invariantes do contrato SQL. Uma resposta que diz "permitido" acima do
  // teto, ou "limite" antes de alcanca-lo, e malformada e deve fechar o gate.
  if (estado === 'permitido' && (
    usadosGlobal < unidades || usadosGlobal > limiteGlobal
    || usadosUsuario < unidades || usadosUsuario > limiteUsuario
  )) return null;
  if (estado === 'ja_reservado' && (usadosGlobal < unidades || usadosUsuario < unidades)) return null;
  if (estado === 'limite_global' && usadosGlobal <= limiteGlobal - unidades) return null;
  if (estado === 'limite_usuario' && usadosUsuario <= limiteUsuario - unidades) return null;

  return { estado, dia, usadosGlobal, usadosUsuario, limiteGlobal, limiteUsuario, unidades };
}

function urlRpc(supabaseUrl) {
  const base = new URL(supabaseUrl);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
    throw new TypeError('SUPABASE_URL insegura');
  }
  return new URL('/rest/v1/rpc/reservar_cota_ia_diaria', base).toString();
}

/**
 * Reserva 1 unidade da familia informada.
 *
 * Retorno:
 *   { permitido:true, estado:'permitido', ...telemetria }
 *   { permitido:false, estado:'ja_reservado'|'limite_global'|'limite_usuario', ... }
 *   { permitido:false, estado:'indisponivel' } para toda incerteza/entrada invalida
 */
export async function reservarCotaIA(env, opcoes) {
  const supabaseUrl = typeof env?.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
  const serviceRole = typeof env?.SUPABASE_SERVICE_ROLE_KEY === 'string'
    ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
    : '';
  if (!supabaseUrl || !serviceRole || !opcoes || typeof opcoes !== 'object') return indisponivel();

  const userId = typeof opcoes.userId === 'string' ? opcoes.userId.trim() : '';
  const familia = typeof opcoes.familia === 'string' ? opcoes.familia.trim().toLowerCase() : '';
  const limiteGlobal = opcoes.limiteGlobal;
  const limiteUsuario = opcoes.limiteUsuario;
  const unidades = opcoes.unidades ?? (familia === FAMILIAS_COTA_IA.OPENROUTER ? 1 : null);
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;

  if (!UUID_RE.test(userId) || !FAMILIAS.has(familia)) return indisponivel();
  if (!inteiroNoIntervalo(limiteGlobal, 1, LIMITE_MAXIMO)) return indisponivel();
  if (!inteiroNoIntervalo(limiteUsuario, 1, limiteGlobal)) return indisponivel();
  // Whisper e cobrado em neuronios, nao por quantidade de requests. Exigir a
  // unidade explicitamente impede que um audio longo conte acidentalmente como 1.
  if (!inteiroNoIntervalo(unidades, 1, limiteUsuario)) return indisponivel();
  if (!inteiroNoIntervalo(timeoutMs, 250, 15_000)) return indisponivel();

  let requestId;
  let endpoint;
  try {
    requestId = await resolverRequestId(opcoes);
    endpoint = urlRpc(supabaseUrl);
  } catch {
    return indisponivel();
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_user: userId,
        p_familia: familia,
        p_request_id: requestId,
        p_limite_global: limiteGlobal,
        p_limite_usuario: limiteUsuario,
        p_unidades: unidades,
      }),
      signal: controlador.signal,
    });

    if (!resposta.ok) return indisponivel();
    const dados = await resposta.json().catch(() => null);
    const linha = linhaDaResposta(dados);
    if (!linha) return indisponivel();

    // A resposta precisa ecoar os limites pedidos; divergencia sugere contrato
    // antigo/malformado e nao pode liberar uma chamada.
    if (linha.limiteGlobal !== limiteGlobal
      || linha.limiteUsuario !== limiteUsuario
      || linha.unidades !== unidades) {
      return indisponivel();
    }

    return {
      // `ja_reservado` NAO libera outro fetch. Sem cache de resposta, repetir o
      // upstream faria uma unica reserva financiar chamadas ilimitadas.
      permitido: linha.estado === 'permitido',
      ...linha,
      requestId,
      familia,
    };
  } catch {
    return indisponivel();
  } finally {
    clearTimeout(temporizador);
  }
}

function limiteConfigurado(valor, padrao) {
  const numero = Number(valor);
  return inteiroNoIntervalo(numero, 1, LIMITE_MAXIMO) ? numero : padrao;
}

/**
 * Wrapper de produção: traduz as vars do Worker para o contrato estrito acima.
 * Defaults deliberadamente conservadores enquanto a capacidade real da conta
 * gratuita não for comprovada. Os limites do Whisper são NEURÔNIOS estimados.
 */
export async function reservarCotaConfigurada(
  env,
  { userId, familia, requestId, unidades } = {},
) {
  const whisper = familia === FAMILIAS_COTA_IA.WHISPER;
  const limiteGlobal = limiteConfigurado(
    whisper ? env?.WHISPER_GLOBAL_DAILY_LIMIT : env?.OPENROUTER_GLOBAL_DAILY_LIMIT,
    whisper ? 8_000 : 40,
  );
  const limiteUsuarioBruto = limiteConfigurado(
    whisper ? env?.WHISPER_USER_DAILY_LIMIT : env?.OPENROUTER_USER_DAILY_LIMIT,
    whisper ? 940 : 10,
  );
  const limiteUsuario = Math.min(limiteUsuarioBruto, limiteGlobal);
  return reservarCotaIA(env, {
    userId,
    familia,
    requestId,
    limiteGlobal,
    limiteUsuario,
    ...(unidades === undefined ? {} : { unidades }),
  });
}

/**
 * Callback para `gerarIA({ beforeAttempt })`. Cada modelo realmente tentado
 * recebe uma reserva nova imediatamente antes do fetch; assim o fallback
 * manual nunca usa uma unidade reservada para outra chamada. O erro carrega
 * somente o resultado saneado da cota, sem prompt, modelo, usuario ou segredo.
 */
export function criarGateTentativasOpenRouter(env, userId) {
  return async function antesDaTentativa() {
    const reserva = await reservarCotaConfigurada(env, {
      userId,
      familia: FAMILIAS_COTA_IA.OPENROUTER,
      requestId: crypto.randomUUID(),
    });
    if (reserva.permitido === true && reserva.estado === 'permitido') return reserva;

    const erro = new Error('cota_ia_negada');
    erro.name = 'CotaIAError';
    erro.reservaCota = reserva;
    throw erro;
  };
}

export function reservaCotaDoErro(erro) {
  return erro && erro.name === 'CotaIAError' && erro.reservaCota
    ? erro.reservaCota
    : null;
}
