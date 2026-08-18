// Validação de duração do áudio antes de chamar o Workers AI.
//
// O aplicativo grava MP4/M4A com expo-audio. Confiar apenas no cronômetro do
// cliente não protege o custo: qualquer cliente autenticado poderia forjar o
// campo ou mandar um arquivo muito mais longo. Por isso o Worker lê a duração
// gravada no próprio contêiner ISO-BMFF (mvhd/mdhd) e rejeita o que não consegue
// verificar. Nenhum áudio é enviado ao provedor antes desta checagem.

const DURACAO_MAX_SEGUNDOS = 125; // gravação do app corta em 120s; 5s de tolerância de mux.
const NEURONIOS_POR_MINUTO = 46.63;
const MARGEM_NEURONIOS = 1.05;

function lerU32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, false);
}

function lerU64(view, offset) {
  if (offset < 0 || offset + 8 > view.byteLength) return null;
  const alto = BigInt(view.getUint32(offset, false));
  const baixo = BigInt(view.getUint32(offset + 4, false));
  const valor = (alto << 32n) | baixo;
  if (valor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(valor);
}

function corresponde(bytes, offset, texto) {
  if (offset < 0 || offset + texto.length > bytes.length) return false;
  for (let i = 0; i < texto.length; i += 1) {
    if (bytes[offset + i] !== texto.charCodeAt(i)) return false;
  }
  return true;
}

function tipoDaCaixa(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return '';
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function listarCaixas(bytes, inicio, fim) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const caixas = [];
  let cursor = inicio;
  while (cursor < fim) {
    if (cursor + 8 > fim) return null;
    const tamanho32 = lerU32(view, cursor);
    if (tamanho32 === null) return null;
    let cabecalho = 8;
    let tamanho = tamanho32;
    if (tamanho32 === 1) {
      tamanho = lerU64(view, cursor + 8);
      cabecalho = 16;
    } else if (tamanho32 === 0) {
      tamanho = fim - cursor;
    }
    if (!Number.isFinite(tamanho) || tamanho < cabecalho || cursor + tamanho > fim) {
      return null;
    }
    const tipo = tipoDaCaixa(bytes, cursor + 4);
    if (!tipo) return null;
    caixas.push({ tipo, inicio: cursor, payload: cursor + cabecalho, fim: cursor + tamanho });
    cursor += tamanho;
  }
  return cursor === fim ? caixas : null;
}

function relogioFullBox(bytes, caixa) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payload = caixa.payload;
  const versao = bytes[payload];
  let timescale;
  let duracao;
  if (versao === 0) {
    timescale = lerU32(view, payload + 12);
    duracao = lerU32(view, payload + 16);
  } else if (versao === 1) {
    timescale = lerU32(view, payload + 20);
    duracao = lerU64(view, payload + 24);
  } else {
    return null;
  }
  if (!timescale || !duracao) return null;
  const segundos = duracao / timescale;
  return Number.isFinite(segundos) && segundos > 0 && segundos <= 24 * 60 * 60
    ? { timescale, duracao, segundos }
    : null;
}

function duracaoStts(bytes, caixa, timescale) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = lerU32(view, caixa.payload + 4);
  if (!entryCount || entryCount > 100_000) return null;
  const inicioEntradas = caixa.payload + 8;
  if (inicioEntradas + entryCount * 8 > caixa.fim) return null;

  let ticks = 0n;
  for (let i = 0; i < entryCount; i += 1) {
    const offset = inicioEntradas + i * 8;
    const quantidade = lerU32(view, offset);
    const delta = lerU32(view, offset + 4);
    if (!quantidade || !delta) return null;
    ticks += BigInt(quantidade) * BigInt(delta);
    if (ticks > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  }
  const segundos = Number(ticks) / timescale;
  return Number.isFinite(segundos) && segundos > 0 && segundos <= 24 * 60 * 60
    ? segundos
    : null;
}

function duracoesDasTrilhasDeAudio(bytes, moov) {
  const filhosMoov = listarCaixas(bytes, moov.payload, moov.fim);
  if (!filhosMoov) return null;
  const duracoes = [];

  for (const trak of filhosMoov.filter((caixa) => caixa.tipo === 'trak')) {
    const filhosTrak = listarCaixas(bytes, trak.payload, trak.fim);
    if (!filhosTrak) return null;
    const mdias = filhosTrak.filter((caixa) => caixa.tipo === 'mdia');
    // Um decoder pode escolher uma caixa diferente daquela medida pelo parser.
    // Estrutura ausente ou ambígua falha fechada em vez de confiar na primeira.
    if (mdias.length !== 1) return null;
    const mdia = mdias[0];
    const filhosMdia = listarCaixas(bytes, mdia.payload, mdia.fim);
    if (!filhosMdia) return null;
    const hdlrs = filhosMdia.filter((caixa) => caixa.tipo === 'hdlr');
    const mdhds = filhosMdia.filter((caixa) => caixa.tipo === 'mdhd');
    const minfs = filhosMdia.filter((caixa) => caixa.tipo === 'minf');
    if (hdlrs.length !== 1 || mdhds.length !== 1 || minfs.length !== 1) return null;
    const [hdlr] = hdlrs;
    const [mdhd] = mdhds;
    const [minf] = minfs;
    if (hdlr.payload + 12 > hdlr.fim) return null;

    // hdlr é FullBox: version/flags (4), pre_defined (4), handler_type (4).
    if (!corresponde(bytes, hdlr.payload + 8, 'soun')) continue;
    const relogio = relogioFullBox(bytes, mdhd);
    if (!relogio) return null;

    const filhosMinf = listarCaixas(bytes, minf.payload, minf.fim);
    if (!filhosMinf) return null;
    const stbls = filhosMinf.filter((caixa) => caixa.tipo === 'stbl');
    if (stbls.length !== 1) return null;
    const [stbl] = stbls;
    const filhosStbl = listarCaixas(bytes, stbl.payload, stbl.fim);
    if (!filhosStbl) return null;
    const sttss = filhosStbl.filter((caixa) => caixa.tipo === 'stts');
    if (sttss.length !== 1) return null;
    const [stts] = sttss;
    const segundosAmostras = duracaoStts(bytes, stts, relogio.timescale);
    if (!segundosAmostras) return null;

    // `mdhd` é declarativo; `stts` soma a duração das amostras que o decoder
    // realmente percorrerá. Usar o maior impede subdeclarar qualquer um deles.
    duracoes.push(Math.max(relogio.segundos, segundosAmostras));
  }

  return duracoes.length ? duracoes : null;
}

function decodificarBase64(base64) {
  try {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function planejarAudioSeguro(audioBase64, mimeType) {
  // É o formato efetivamente enviado pelo app em Android e iOS. Formatos sem
  // duração verificável ficam fechados até terem um parser próprio.
  if (mimeType !== 'audio/mp4') return { ok: false, erro: 'mime_invalido' };
  if (typeof audioBase64 !== 'string' || !audioBase64) {
    return { ok: false, erro: 'sem_audio' };
  }

  const bytes = decodificarBase64(audioBase64);
  if (!bytes || bytes.length < 32) {
    return { ok: false, erro: 'audio_invalido' };
  }

  // Percorre somente caixas reais pela árvore ISO-BMFF. Nunca procura a string
  // "mdhd" dentro de mdat/free/metadados, portanto uma sequência forjada no
  // payload não pode esconder a duração da trilha de áudio verdadeira.
  const raiz = listarCaixas(bytes, 0, bytes.length);
  const ftyps = raiz && raiz.filter((caixa) => caixa.tipo === 'ftyp');
  if (!raiz || !ftyps || ftyps.length !== 1) {
    return { ok: false, erro: 'audio_invalido' };
  }
  const moovs = raiz.filter((caixa) => caixa.tipo === 'moov');
  if (moovs.length !== 1) return { ok: false, erro: 'duracao_nao_verificavel' };
  const [moov] = moovs;
  const duracoes = duracoesDasTrilhasDeAudio(bytes, moov);
  if (!duracoes) return { ok: false, erro: 'duracao_nao_verificavel' };

  // Se houver mais de uma trilha de áudio, vale a maior. Aceitar só a primeira
  // permitiria ocultar uma trilha longa depois de uma curta.
  const duracaoSegundos = Math.max(...duracoes);
  if (duracaoSegundos > DURACAO_MAX_SEGUNDOS) {
    return { ok: false, erro: 'audio_longo' };
  }

  // Reserva pessimista com 5% de margem para arredondamento do medidor. A cota
  // é consumida antes do dispatch e, por segurança financeira, não é devolvida
  // quando o provedor já pode ter recebido a tentativa.
  const unidadesWhisper = Math.max(
    1,
    Math.ceil((duracaoSegundos / 60) * NEURONIOS_POR_MINUTO * MARGEM_NEURONIOS),
  );
  return { ok: true, duracaoSegundos, unidadesWhisper };
}

export const AUDIO_SEGURO_LIMITES = Object.freeze({
  duracaoMaxSegundos: DURACAO_MAX_SEGUNDOS,
  neuroniosPorMinuto: NEURONIOS_POR_MINUTO,
  margemNeuronios: MARGEM_NEURONIOS,
});
