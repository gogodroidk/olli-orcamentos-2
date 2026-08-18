// @ts-nocheck
import { AUDIO_SEGURO_LIMITES, planejarAudioSeguro } from '../src/audioSeguro.js';

let ok = 0;
let falhas = 0;

function checar(nome, atual, esperado) {
  const passou = JSON.stringify(atual) === JSON.stringify(esperado);
  if (passou) ok += 1;
  else {
    falhas += 1;
    console.error(`FALHOU: ${nome}`, { atual, esperado });
  }
}

function u32(valor) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(valor >>> 0);
  return b;
}

function caixa(tipo, payload) {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(tipo, 'ascii'), payload]);
}

function fullBoxDuracao(tipo, segundos) {
  const payload = Buffer.alloc(32);
  payload[0] = 0; // FullBox version 0
  payload.writeUInt32BE(1_000, 12);
  payload.writeUInt32BE(Math.round(segundos * 1_000), 16);
  return caixa(tipo, payload);
}

function stts(segundos) {
  const payload = Buffer.alloc(16);
  payload.writeUInt32BE(1, 4); // entry_count
  payload.writeUInt32BE(Math.round(segundos * 1_000), 8); // sample_count
  payload.writeUInt32BE(1, 12); // sample_delta; timescale do mdhd = 1000
  return caixa('stts', payload);
}

function trilhaAudio(segundosMdhd, segundosStts = segundosMdhd) {
  const hdlrPayload = Buffer.alloc(24);
  Buffer.from('soun', 'ascii').copy(hdlrPayload, 8);
  return caixa('trak', caixa('mdia', Buffer.concat([
    fullBoxDuracao('mdhd', segundosMdhd),
    caixa('hdlr', hdlrPayload),
    caixa('minf', caixa('stbl', stts(segundosStts))),
  ])));
}

function mp4ComDuracao(segundos, { mdatBytes = 0, prefixo = [] } = {}) {
  const ftyp = caixa('ftyp', Buffer.from('M4A \0\0\0\0M4A isom', 'binary'));
  const mdat = mdatBytes ? caixa('mdat', Buffer.alloc(mdatBytes, 0x41)) : Buffer.alloc(0);
  const moov = caixa('moov', Buffer.concat([
    fullBoxDuracao('mvhd', segundos),
    trilhaAudio(segundos),
  ]));
  return Buffer.concat([ftyp, ...prefixo, mdat, moov]).toString('base64');
}

const doisMinutos = planejarAudioSeguro(mp4ComDuracao(120), 'audio/mp4');
checar('MP4 de 120s é aceito', doisMinutos.ok, true);
checar('duração vem do contêiner', doisMinutos.duracaoSegundos, 120);
checar(
  'reserva inclui margem e arredondamento',
  doisMinutos.unidadesWhisper,
  Math.ceil(2 * 46.63 * 1.05),
);

const trinta = planejarAudioSeguro(mp4ComDuracao(30), 'audio/mp4');
checar('trilha hdlr=soun é reconhecida', trinta.ok, true);
checar('mdhd da trilha preserva a duração', trinta.duracaoSegundos, 30);

checar(
  'arquivo acima de 125s é rejeitado antes do provedor',
  planejarAudioSeguro(mp4ComDuracao(126), 'audio/mp4'),
  { ok: false, erro: 'audio_longo' },
);
checar(
  'base64 que não é MP4 é rejeitado',
  planejarAudioSeguro(Buffer.from('não é áudio').toString('base64'), 'audio/mp4'),
  { ok: false, erro: 'audio_invalido' },
);
checar(
  'formato sem parser falha fechado',
  planejarAudioSeguro(mp4ComDuracao(10), 'audio/ogg'),
  { ok: false, erro: 'mime_invalido' },
);

// Um payload `free` carrega uma árvore falsa curta antes do moov real longo.
// O parser antigo varria bytes e aceitava o primeiro mdhd plausível; o parser
// hierárquico deve ignorar completamente o conteúdo de `free`.
const arvoreFalsa = caixa('moov', trilhaAudio(10));
const forjado = mp4ComDuracao(126, { prefixo: [caixa('free', arvoreFalsa)] });
checar(
  'mdhd falso dentro de free não esconde trilha real longa',
  planejarAudioSeguro(forjado, 'audio/mp4'),
  { ok: false, erro: 'audio_longo' },
);

const ftyp = caixa('ftyp', Buffer.from('M4A \0\0\0\0M4A isom', 'binary'));
const moovSubdeclarado = caixa('moov', Buffer.concat([
  fullBoxDuracao('mvhd', 1),
  trilhaAudio(1, 126),
]));
const subdeclarado = Buffer.concat([ftyp, moovSubdeclarado]).toString('base64');
checar(
  'mdhd curto não esconde amostras stts longas',
  planejarAudioSeguro(subdeclarado, 'audio/mp4'),
  { ok: false, erro: 'audio_longo' },
);

const moovCurto = caixa('moov', Buffer.concat([fullBoxDuracao('mvhd', 1), trilhaAudio(1)]));
const moovLongo = caixa('moov', Buffer.concat([fullBoxDuracao('mvhd', 126), trilhaAudio(126)]));
checar(
  'dois moov são ambíguos e falham fechado',
  planejarAudioSeguro(Buffer.concat([ftyp, moovCurto, moovLongo]).toString('base64'), 'audio/mp4'),
  { ok: false, erro: 'duracao_nao_verificavel' },
);

const hdlrPayloadDuplicado = Buffer.alloc(24);
Buffer.from('soun', 'ascii').copy(hdlrPayloadDuplicado, 8);
const mdiaSttsDuplicado = caixa('mdia', Buffer.concat([
  fullBoxDuracao('mdhd', 1),
  caixa('hdlr', hdlrPayloadDuplicado),
  caixa('minf', caixa('stbl', Buffer.concat([stts(1), stts(126)]))),
]));
const moovSttsDuplicado = caixa('moov', Buffer.concat([
  fullBoxDuracao('mvhd', 1),
  caixa('trak', mdiaSttsDuplicado),
]));
checar(
  'duas stts na mesma trilha não deixam o decoder escolher a longa',
  planejarAudioSeguro(Buffer.concat([ftyp, moovSttsDuplicado]).toString('base64'), 'audio/mp4'),
  { ok: false, erro: 'duracao_nao_verificavel' },
);

const mdiaCurta = caixa('mdia', Buffer.concat([
  fullBoxDuracao('mdhd', 1),
  caixa('hdlr', hdlrPayloadDuplicado),
  caixa('minf', caixa('stbl', stts(1))),
]));
const mdiaLonga = caixa('mdia', Buffer.concat([
  fullBoxDuracao('mdhd', 126),
  caixa('hdlr', hdlrPayloadDuplicado),
  caixa('minf', caixa('stbl', stts(126))),
]));
const moovMdiaDuplicado = caixa('moov', Buffer.concat([
  fullBoxDuracao('mvhd', 1),
  caixa('trak', Buffer.concat([mdiaCurta, mdiaLonga])),
]));
checar(
  'duas mdia na mesma trilha são rejeitadas',
  planejarAudioSeguro(Buffer.concat([ftyp, moovMdiaDuplicado]).toString('base64'), 'audio/mp4'),
  { ok: false, erro: 'duracao_nao_verificavel' },
);

const inicioCpu = performance.now();
const grandeValido = planejarAudioSeguro(mp4ComDuracao(120, { mdatBytes: 2_000_000 }), 'audio/mp4');
const cpuMs = performance.now() - inicioCpu;
checar('MP4 com mdat grande continua válido', grandeValido.ok, true);
checar('parser local de 2 MB fica abaixo de 250 ms', cpuMs < 250, true);
checar('limite documentado é 125s', AUDIO_SEGURO_LIMITES.duracaoMaxSegundos, 125);

console.log(`\nÁudio seguro: ${ok} ok, ${falhas} falha(s).`);
if (falhas) process.exit(1);
