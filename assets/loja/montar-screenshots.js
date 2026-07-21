/**
 * montar-screenshots.js — transforma as capturas CRUAS do app nas screenshots
 * finais da Google Play (1080x1920), com legenda e fundo de marca.
 *
 *     node assets/loja/montar-screenshots.js
 *
 * Entrada:  assets/loja/screenshots/brutas/01-*.png ... 08-*.png
 * Saída:    assets/loja/screenshots/01-*.png ...      (1080x1920, 24-bit, sem alpha)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE SCRIPT PRECISA EXISTIR (não é enfeite — é conformidade):
 *
 * O emulador `olli_phone` deste projeto é 1080x2400 (medido em
 * ~/.android/avd/olli_phone.avd/config.ini). Subir esse PNG cru na Play
 * REPROVA, por DOIS motivos independentes, e a Console recusa o upload:
 *
 *   1. Proporção. A Play aceita entre 16:9 e 9:16. 1080x2400 dá 0,4500 —
 *      mais alto que 9:16 (0,5625). Fora da faixa.
 *   2. Regra do dobro. "Max dimension cannot be more than twice the minimum":
 *      2400 > 2 x 1080 = 2160. Estoura.
 *
 * 1080x1920 resolve os dois de uma vez: é 9:16 exato e 1920 <= 2160.
 *
 * A saída NÃO é um corte da captura (cortar comeria a barra de status ou a
 * navegação e o print deixaria de ser o app real). A captura inteira é
 * REDUZIDA e montada sobre uma tela de marca, com a legenda em cima — que é o
 * formato que a própria Play recomenda para as capturas de destaque, e o único
 * jeito de ter texto legível na miniatura da listagem.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * As legendas ficam em LEGENDAS, abaixo, casadas pelo PREFIXO NUMÉRICO do
 * arquivo — assim quem captura não precisa acertar o nome inteiro, só começar
 * com "01-", "02-"... A ordem dos números é a ordem da loja (ver SCREENSHOTS.md).
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const sharp = require(path.join(RAIZ, 'web', 'node_modules', 'sharp'));

const DIR_BRUTAS = path.join(__dirname, 'screenshots', 'brutas');
const DIR_SAIDA = path.join(__dirname, 'screenshots');

const LARGURA = 1080;
const ALTURA = 1920;

const MARCA = { navy: '#0A2547', ciano: '#3FD8EA', azul: '#0B6FCE', apoio: '#B9D4EC' };

/**
 * Legenda por posição. Máximo 2 linhas — a 3ª não cabe sem espremer o aparelho.
 * Texto curto de propósito: na miniatura da Play a screenshot aparece com menos
 * de 200px de largura, e frase longa vira borrão cinza.
 */
const LEGENDAS = {
  '01': ['Orçamento pronto', 'ainda na casa do cliente'],
  '02': ['Fale o serviço.', 'A Olli monta o orçamento'],
  '03': ['PDF com a sua marca,', 'enviado pelo WhatsApp'],
  '04': ['O cliente assina', 'no seu celular'],
  '05': ['Recibo e ordem de serviço', 'em um toque'],
  '06': ['Quase 700 códigos de erro', 'que abrem sem internet'],
  '07': ['O que já foi aprovado', 'e ainda não foi pago'],
  '08': ['As ferramentas', 'do seu ofício'],
};

/** Escapa texto para dentro do SVG (legenda com & ou < quebraria o XML). */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svgFundo(linhas) {
  const [l1 = '', l2 = ''] = linhas;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#0C2C54"/>
      <stop offset="1" stop-color="#071A32"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.06" r="0.85">
      <stop offset="0" stop-color="${MARCA.azul}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${MARCA.azul}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fio" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${MARCA.ciano}"/>
      <stop offset="1" stop-color="${MARCA.azul}"/>
    </linearGradient>
  </defs>
  <rect width="${LARGURA}" height="${ALTURA}" fill="url(#bg)"/>
  <rect width="${LARGURA}" height="${ALTURA}" fill="url(#glow)"/>

  <text x="${LARGURA / 2}" y="152" text-anchor="middle" fill="#FFFFFF"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="62" font-weight="700"
        >${esc(l1)}</text>
  <text x="${LARGURA / 2}" y="230" text-anchor="middle" fill="${MARCA.apoio}"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="62" font-weight="700"
        >${esc(l2)}</text>

  <rect x="${LARGURA / 2 - 60}" y="272" width="120" height="7" rx="3.5" fill="url(#fio)"/>
</svg>`;
}

/** Cantos arredondados na captura: sem isso o print colado parece recorte torto. */
function svgMascara(w, h, r) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/>
     </svg>`,
  );
}

async function montar(arquivo) {
  const prefixo = path.basename(arquivo).slice(0, 2);
  const legenda = LEGENDAS[prefixo];
  if (!legenda) {
    console.warn(`  ! ${path.basename(arquivo)} — sem legenda para o prefixo "${prefixo}", pulando`);
    return null;
  }

  // Área livre abaixo do bloco de legenda, com respiro embaixo.
  const TOPO = 330;
  const MARGEM_BAIXO = 70;
  const alturaDisponivel = ALTURA - TOPO - MARGEM_BAIXO;

  const meta = await sharp(arquivo).metadata();
  const escala = Math.min(alturaDisponivel / meta.height, (LARGURA - 260) / meta.width);
  const w = Math.round(meta.width * escala);
  const h = Math.round(meta.height * escala);

  const raio = Math.round(w * 0.055);
  const captura = await sharp(arquivo)
    .resize(w, h)
    .composite([{ input: svgMascara(w, h, raio), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const destino = path.join(DIR_SAIDA, path.basename(arquivo));

  // DUAS PASSADAS, de propósito. O sharp aplica as operações na ORDEM INTERNA
  // dele, não na ordem em que a gente encadeia: `flatten` roda ANTES de
  // `composite`. Fazendo tudo numa passada só, o `composite` reintroduz o canal
  // alpha da captura DEPOIS do flatten, e o PNG sai com 4 canais — que é
  // exatamente o que a Play recusa em screenshot ("24-bit PNG, no alpha").
  // Descoberto pelo próprio conferidor no fim deste arquivo (alpha=true).
  const composto = await sharp(Buffer.from(svgFundo(legenda)))
    .composite([{ input: captura, left: Math.round((LARGURA - w) / 2), top: TOPO }])
    .png()
    .toBuffer();

  await sharp(composto)
    .flatten({ background: MARCA.navy }) // agora sim: nada mais entra depois
    .png({ compressionLevel: 9 })
    .toFile(destino);

  return destino;
}

(async () => {
  if (!fs.existsSync(DIR_BRUTAS)) {
    console.log(
      `Nada a fazer: ${path.relative(RAIZ, DIR_BRUTAS)} não existe ainda.\n` +
      'Capture as telas primeiro — o passo a passo está em assets/loja/SCREENSHOTS.md.',
    );
    return;
  }
  const brutas = fs
    .readdirSync(DIR_BRUTAS)
    .filter((f) => /^\d\d.*\.png$/i.test(f))
    .sort();

  if (!brutas.length) {
    console.log(
      `Nenhum PNG "NN-*.png" em ${path.relative(RAIZ, DIR_BRUTAS)}.\n` +
      'Ver assets/loja/SCREENSHOTS.md para o roteiro de captura.',
    );
    return;
  }

  console.log(`Montando ${brutas.length} screenshot(s) para ${LARGURA}x${ALTURA}:\n`);
  for (const f of brutas) {
    const destino = await montar(path.join(DIR_BRUTAS, f));
    if (!destino) continue;
    const m = await sharp(destino).metadata();
    const kb = (fs.statSync(destino).size / 1024).toFixed(0);
    const ok = m.width === LARGURA && m.height === ALTURA && !m.hasAlpha;
    console.log(`  ${ok ? 'OK ' : 'X  '} ${path.basename(destino)} — ${m.width}x${m.height}, alpha=${m.hasAlpha}, ${kb} KB`);
  }
  console.log(
    `\nA Play exige de 2 a 8 screenshots de celular. Você tem ${brutas.length}.` +
    (brutas.length < 4 ? '\nAbaixo de 4 o app perde elegibilidade a formatos de destaque da Play.' : ''),
  );
})().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
