/**
 * Gerador de QR code em TypeScript puro — SEM biblioteca nativa nem npm.
 *
 * PORTADO de `worker/src/pmoc.js`, onde já gera as etiquetas dos equipamentos há
 * semanas. Duas cópias da mesma lógica é dívida; a alternativa era o app baixar o
 * QR do worker, e o PDF precisa funcionar OFFLINE — o técnico gera o orçamento no
 * meio da rua e compartilha por WhatsApp sem sinal de dados.
 *
 * O SVG sai INLINE (não como `<img src="data:...">`) porque o motor de impressão
 * do iOS (UIMarkupTextPrintFormatter) costuma ignorar data-URI de SVG, enquanto o
 * do Android (Chromium) as renderiza. Um QR que aparece num celular e some no
 * outro entrega ao cliente um retângulo branco. SVG inline os dois rasterizam.
 */

/* eslint-disable no-bitwise */

// §QR — GERADOR DE QR CODE PURO EM JS (sem lib nativa/npm)
// ----------------------------------------------------------------------------
// Modo BYTE (ISO-8859-1/UTF-8), nível de correção de erro M (médio), versão
// escolhida automaticamente pelo tamanho do dado (o link /q/<token> cabe com
// folga até a v6, ~134 chars em M). Implementa: campo de Galois GF(256),
// Reed-Solomon (ECC), colocação da matriz (finders, timing, alinhamento, dados
// em zigue-zague), aplicação de máscara e info de formato. Sem dependências.
//
// LIÇÃO HERMES: só ES puro (arrays, Uint8Array, bitwise). Nada de TextDecoder
// latin1, WASM ou API exótica. Roda idêntico no workerd e em qualquer runtime.
// ============================================================================

// GF(256) com polinômio gerador 0x11D (padrão QR). Tabelas de exp/log.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Polinômio gerador de Reed-Solomon para `n` símbolos de correção.
function rsGeneratorPoly(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Divisão polinomial: resto = símbolos de ECC de `data` (Uint8Array) com `n` graus.
function rsEncode(data: ArrayLike<number>, n: number): Uint8Array {
  const gen = rsGeneratorPoly(n);
  const res = new Uint8Array(data.length + n);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Tabela de capacidade (nível M, modo byte) e parâmetros de bloco por versão.
// [version] = { size, totalCodewords, ecPerBlock, [group1Blocks, g1Data, group2Blocks, g2Data] }
// Fonte: tabelas ISO/IEC 18004 (nível M). Versões 1..10 cobrem folgadamente um
// link de ~50 chars; incluímos até a 10 por robustez.
const QR_M: Record<number, { ec: number; g1: number[]; g2: number[] }> = {
  1: { ec: 10, g1: [1, 16], g2: [0, 0] },
  2: { ec: 16, g1: [1, 28], g2: [0, 0] },
  3: { ec: 26, g1: [1, 44], g2: [0, 0] },
  4: { ec: 18, g1: [2, 32], g2: [0, 0] },
  5: { ec: 24, g1: [2, 43], g2: [0, 0] },
  6: { ec: 16, g1: [4, 27], g2: [0, 0] },
  7: { ec: 18, g1: [4, 31], g2: [0, 0] },
  8: { ec: 22, g1: [2, 38], g2: [2, 39] },
  9: { ec: 22, g1: [3, 36], g2: [2, 37] },
  10: { ec: 26, g1: [4, 43], g2: [1, 44] },
};

// Total de codewords de DADOS (sem ECC) por versão no nível M — soma dos blocos.
function dataCapacity(v: number): number {
  const p = QR_M[v];
  return p.g1[0] * p.g1[1] + p.g2[0] * p.g2[1];
}

// Padrões de alinhamento (posições centrais) por versão. v1 não tem.
const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// UTF-8 encode puro (sem TextEncoder por clareza; equivalente e ES puro).
function utf8Bytes(str: string): number[] {
  // TextEncoder existe no workerd, mas manter puro evita qualquer surpresa de
  // runtime e é trivial para a faixa que nos interessa (o link é ASCII, mas
  // suportamos multibyte por completude).
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      i++;
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

// Monta o fluxo de bits de DADOS (modo byte) para a versão dada e completa com
// padding até a capacidade. Retorna Uint8Array de codewords de dados.
function buildDataCodewords(bytes: number[], version: number): Uint8Array {
  const capacityBits = dataCapacity(version) * 8;
  const bits = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  // Indicador de modo byte = 0100.
  push(0b0100, 4);
  // Contador de caracteres: 8 bits (v1..9) ou 16 bits (v10..26) no modo byte.
  const countBits = version <= 9 ? 8 : 16;
  push(bytes.length, countBits);
  for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);
  // Terminador (até 4 bits) se couber.
  const remaining = capacityBits - bits.length;
  push(0, Math.min(4, remaining));
  // Alinha a byte.
  while (bits.length % 8 !== 0) bits.push(0);
  // Bytes de preenchimento alternados 0xEC / 0x11 até a capacidade.
  const pad = [0xec, 0x11];
  let pi = 0;
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  while (cw.length < dataCapacity(version)) {
    cw.push(pad[pi & 1]);
    pi++;
  }
  return Uint8Array.from(cw);
}

// Intercala blocos de dados + ECC conforme o padrão (grupo1/grupo2) e produz a
// sequência final de codewords a colocar na matriz.
function interleave(dataCw: Uint8Array, version: number): Uint8Array {
  const p = QR_M[version];
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let idx = 0;
  const addBlocks = (count: number, dataLen: number) => {
    for (let b = 0; b < count; b++) {
      const d = dataCw.slice(idx, idx + dataLen);
      idx += dataLen;
      const ec = rsEncode(d, p.ec);
      blocks.push({ data: d, ec });
    }
  };
  addBlocks(p.g1[0], p.g1[1]);
  if (p.g2[0]) addBlocks(p.g2[0], p.g2[1]);

  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const out = [];
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < p.ec; i++) {
    for (const b of blocks) out.push(b.ec[i]);
  }
  return Uint8Array.from(out);
}

// Escolhe a menor versão (1..10, nível M) que comporta os bytes no modo byte.
function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const needBits = 4 + countBits + byteLen * 8;
    if (needBits <= dataCapacity(v) * 8) return v;
  }
  throw new Error('dado_grande_demais_para_qr');
}

// Máscara 0 do QR: (row + col) % 2 === 0. Simples e determinística — evitamos a
// escolha por penalidade (8 máscaras) porque para um link fixo qualquer máscara
// válida decodifica; a 0 é a canônica e mantém o gerador enxuto.
function maskBit(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

// Info de formato (nível M + máscara 0) já calculada com BCH e XOR do padrão.
// EC level M = bits 00; máscara 0 = 000 → 5 bits '00000'. O valor final é a
// constante padronizada para (M, máscara 0).
const FORMAT_INFO_M0 = 0b101010000010010; // (M, mask 0) — 15 bits com BCH e máscara aplicada.

/**
 * Gera a matriz booleana do QR para `text` e devolve { size, modules }.
 * modules[r][c] = true → módulo escuro.
 */
function buildMatrix(text: string): { size: number; modules: boolean[][] } {
  const bytes = utf8Bytes(text);
  const version = chooseVersion(bytes.length);
  const size = 17 + version * 4;
  const dataCw = buildDataCodewords(bytes, version);
  const finalCw = interleave(dataCw, version);

  // matriz e mapa de "função" (reservado: não recebe dado nem máscara).
  const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1)); // -1 = vazio
  const fn = Array.from({ length: size }, () => new Uint8Array(size)); // 1 = função

  const setF = (r: number, c: number, dark: boolean) => {
    m[r][c] = dark ? 1 : 0;
    fn[r][c] = 1;
  };

  // Finder pattern 7x7 + separador, nas 3 quinas.
  const placeFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setF(rr, cc, inRing || inCore);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns (linha/coluna 6, alternado).
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!fn[6][i]) setF(6, i, dark);
    if (!fn[i][6]) setF(i, 6, dark);
  }

  // Módulo escuro fixo.
  setF(size - 8, 8, true);

  // Padrões de alinhamento (não sobre finders).
  const aligns = ALIGN_POS[version] || [];
  for (const ar of aligns) {
    for (const ac of aligns) {
      // pula os que colidem com finders
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setF(ar + r, ac + c, dark);
        }
      }
    }
  }

  // Reserva as áreas de info de formato (serão preenchidas depois).
  const reserveFormat = () => {
    for (let i = 0; i < 9; i++) {
      if (!fn[8][i]) { fn[8][i] = 1; if (m[8][i] === -1) m[8][i] = 0; }
      if (!fn[i][8]) { fn[i][8] = 1; if (m[i][8] === -1) m[i][8] = 0; }
    }
    for (let i = 0; i < 8; i++) {
      const r = size - 1 - i;
      if (!fn[r][8]) { fn[r][8] = 1; if (m[r][8] === -1) m[r][8] = 0; }
      const c = size - 1 - i;
      if (!fn[8][c]) { fn[8][c] = 1; if (m[8][c] === -1) m[8][c] = 0; }
    }
  };
  reserveFormat();

  // Coloca os bits de dado em zigue-zague (de baixo p/ cima, 2 colunas por vez),
  // pulando a coluna 6 (timing) e módulos de função. Aplica a máscara 0 já aqui.
  let bitIdx = 0;
  const totalBits = finalCw.length * 8;
  const getBit = (i: number) => (i < totalBits ? (finalCw[i >> 3] >> (7 - (i & 7))) & 1 : 0);

  let col = size - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col--; // pula coluna de timing
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (fn[row][c]) continue;
        let dark = getBit(bitIdx) === 1;
        bitIdx++;
        if (maskBit(row, c)) dark = !dark;
        m[row][c] = dark ? 1 : 0;
      }
    }
    col -= 2;
    upward = !upward;
  }

  // Escreve a info de formato (M + máscara 0) nas duas cópias padronizadas.
  const fmt = FORMAT_INFO_M0;
  const fbit = (i: number) => (fmt >> i) & 1;
  // Cópia 1: em volta do finder superior-esquerdo.
  for (let i = 0; i <= 5; i++) m[8][i] = fbit(i);
  m[8][7] = fbit(6);
  m[8][8] = fbit(7);
  m[7][8] = fbit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = fbit(i);
  // Cópia 2: parte inferior-esquerda + direita.
  for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = fbit(i);
  for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = fbit(i);

  // Converte para booleano (dark = 1).
  const modules = m.map((rowArr) => Array.from(rowArr, (v) => v === 1));
  return { size, modules };
}

/**
 * QR como SVG compacto: uma quiet zone de 4 módulos, fundo branco, módulos
 * escuros agrupados por linha em um único <path> (menor payload). viewBox em
 * unidades de módulo → escala perfeita em qualquer tamanho no <img>.
 */
export function qrSvg(text: string): string {
  const { size, modules } = buildMatrix(text);
  const quiet = 4;
  const dim = size + quiet * 2;

  // Um único path com todos os módulos escuros (retângulos 1x1). Agrupa runs
  // horizontais contíguos para reduzir o tamanho do path.
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (modules[r][c]) {
        let len = 1;
        while (c + len < size && modules[r][c + len]) len++;
        d += `M${c + quiet} ${r + quiet}h${len}v1h-${len}z`;
        c += len;
      } else {
        c++;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim * 8}" height="${dim * 8}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR code do equipamento"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${d}" fill="#0A2540"/></svg>`;
}
