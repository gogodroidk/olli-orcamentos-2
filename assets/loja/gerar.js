/**
 * gerar.js — produz os assets de imagem da ficha da Google Play a partir da
 * marca REAL do OLLI (o mesmo SVG de `web/public/favicon.svg` /
 * `web/src/components/OlliLogo.astro`) e de `assets/icon.png`.
 *
 * Roda com o `sharp` que já existe em `web/node_modules` (0.35.3) — nenhuma
 * dependência nova é instalada:
 *
 *     node assets/loja/gerar.js
 *
 * Saídas (todas em `assets/loja/`):
 *   icone-512.png          512x512 PNG **com alpha** (a Play exige 32-bit com alpha).
 *   feature-graphic.png    1024x500 PNG **24-bit sem alpha** (a Play exige sem alpha).
 *
 * POR QUE O ÍCONE PRECISA DE `ensureAlpha`: medido com sharp, o
 * `assets/icon.png` de origem tem 3 canais e `hasAlpha=false`. Um resize puro
 * herdaria isso e sairia um PNG de 24 bits — que é exatamente o que a Play
 * recusa no campo "Ícone do app" (lá o pedido é 32-bit COM alpha; é só no
 * feature graphic e nos screenshots que a exigência se inverte).
 *
 * POR QUE `flatten` NO FEATURE GRAPHIC: o SVG é desenhado sobre um fundo
 * opaco, mas o rasterizador entrega RGBA de qualquer jeito. `flatten` sobre a
 * cor de marca garante os 24 bits sem alpha que a Play pede — e, se um dia
 * alguém deixar um buraco transparente no desenho, ele vira azul-marinho em
 * vez de branco (a Play achataria para BRANCO, estourando o layout escuro).
 */
const path = require('path');
const fs = require('fs');

const RAIZ = path.resolve(__dirname, '..', '..');
const sharp = require(path.join(RAIZ, 'web', 'node_modules', 'sharp'));
const SAIDA = __dirname;

/** Marca — os mesmos valores do favicon.svg e do tema do app (não reinventar). */
const MARCA = {
  navy: '#0A2547',      // android.adaptiveIcon.backgroundColor + pdfSectionBg do tema
  ciano: '#3FD8EA',     // stop 0 do gradiente da logo
  azul: '#0B6FCE',      // stop 1 do gradiente da logo
  cianoClaro: '#7FE9F5',// "olhos" da logo
  gelo: '#EAFEFF',      // traço do check da logo
};

/** O mark da logo (viewBox 64x64), idêntico ao de web/public/favicon.svg. */
function markOlli(id) {
  return `
    <g>
      <path d="M22 49 L12 59.5 L30 50 Z" fill="url(#${id})"/>
      <rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#${id})"/>
      <rect x="13" y="11.5" width="38" height="15" rx="9" fill="#ffffff" fill-opacity="0.1"/>
      <rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="${MARCA.cianoClaro}"/>
      <rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="${MARCA.cianoClaro}"/>
      <path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="${MARCA.gelo}" stroke-width="6"
            stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
}

/**
 * O feature graphic. 1024x500.
 *
 * Zona segura respeitada: nada essencial a menos de 72px de qualquer borda
 * (superfícies da Play cortam as bordas) e o canto inferior direito fica
 * deliberadamente calmo — é onde a Play sobrepõe o botão de play quando existe
 * vídeo promocional. Ver assets/loja/FEATURE-GRAPHIC.md.
 *
 * Sem texto miúdo: o menor corpo de texto é 26px em 1024 de largura, que
 * sobrevive à miniatura. Sem preço, sem "nº 1", sem CTA — proibidos pela
 * política de metadados.
 */
function svgFeatureGraphic() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${MARCA.ciano}"/>
      <stop offset="1" stop-color="${MARCA.azul}"/>
    </linearGradient>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0C2C54"/>
      <stop offset="1" stop-color="#081C36"/>
    </linearGradient>
    <radialGradient id="brilho" cx="0.22" cy="0.16" r="0.75">
      <stop offset="0" stop-color="${MARCA.azul}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${MARCA.azul}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="brilhoCiano" cx="0.86" cy="0.82" r="0.6">
      <stop offset="0" stop-color="${MARCA.ciano}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${MARCA.ciano}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="papel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#E8F1FA"/>
    </linearGradient>
    <filter id="sombra" x="-30%" y="-30%" width="170%" height="170%">
      <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#000000" flood-opacity="0.42"/>
    </filter>
    <!-- A faixa diagonal precisa MORRER nas pontas: com opacidade chapada ela
         vira uma costura reta no meio da arte (visto na 1ª renderização). -->
    <linearGradient id="faixa" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.030"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Fundo -->
  <rect width="1024" height="500" fill="url(#fundo)"/>
  <rect width="1024" height="500" fill="url(#brilho)"/>
  <rect width="1024" height="500" fill="url(#brilhoCiano)"/>

  <!-- Faixa diagonal sutil: dá profundidade sem competir com o texto -->
  <path d="M620 -60 L1090 -60 L1024 560 L470 560 Z" fill="url(#faixa)"/>

  <!-- Fio de marca na base (âncora visual, fora da zona de leitura) -->
  <rect x="0" y="494" width="1024" height="6" fill="url(#grad)"/>

  <!-- ================= BLOCO DE TEXTO (esquerda) ================= -->
  <g transform="translate(78, 0)">
    <!-- Logo + wordmark -->
    <g transform="translate(0, 96) scale(0.86)">
      ${markOlli('grad')}
    </g>
    <text x="66" y="145" font-family="Segoe UI, Arial, Helvetica, sans-serif"
          font-size="44" font-weight="700" letter-spacing="1.5" fill="#FFFFFF">OLLI</text>

    <!-- Headline: uma mensagem só -->
    <text x="0" y="243" font-family="Segoe UI, Arial, Helvetica, sans-serif"
          font-size="55" font-weight="700" fill="#FFFFFF">Orçamento pronto</text>
    <text x="0" y="306" font-family="Segoe UI, Arial, Helvetica, sans-serif"
          font-size="55" font-weight="700" fill="url(#grad)">ainda no cliente</text>

    <!-- Subline: os três documentos que o app emite de verdade -->
    <text x="0" y="366" font-family="Segoe UI, Arial, Helvetica, sans-serif"
          font-size="27" font-weight="400" fill="#B9D4EC">Orçamentos · Recibos · Ordens de serviço</text>
  </g>

  <!-- ================= ARTE (direita): o documento assinado ================= -->
  <g transform="translate(660, 74) rotate(-5 150 176)" filter="url(#sombra)">
    <rect x="0" y="0" width="272" height="330" rx="20" fill="url(#papel)"/>

    <!-- Cabeçalho do documento na cor de marca -->
    <rect x="0" y="0" width="272" height="62" rx="20" fill="${MARCA.navy}"/>
    <rect x="0" y="42" width="272" height="20" fill="${MARCA.navy}"/>
    <rect x="22" y="23" width="86" height="9" rx="4.5" fill="${MARCA.cianoClaro}" fill-opacity="0.9"/>
    <rect x="200" y="23" width="50" height="9" rx="4.5" fill="#ffffff" fill-opacity="0.34"/>

    <!-- Linhas de itens (abstratas: nada de texto ilegível) -->
    <g fill="#C3D4E4">
      <rect x="22" y="88"  width="150" height="9" rx="4.5"/>
      <rect x="212" y="88"  width="38" height="9" rx="4.5" fill="#9FB4C8"/>
      <rect x="22" y="118" width="124" height="9" rx="4.5"/>
      <rect x="212" y="118" width="38" height="9" rx="4.5" fill="#9FB4C8"/>
      <rect x="22" y="148" width="163" height="9" rx="4.5"/>
      <rect x="212" y="148" width="38" height="9" rx="4.5" fill="#9FB4C8"/>
    </g>

    <!-- Barra de total (o mesmo padrão do PDF do app: faixa navy) -->
    <rect x="22" y="182" width="228" height="34" rx="10" fill="${MARCA.navy}"/>
    <rect x="36" y="195" width="58" height="9" rx="4.5" fill="#ffffff" fill-opacity="0.42"/>
    <rect x="176" y="194" width="60" height="11" rx="5.5" fill="${MARCA.cianoClaro}"/>

    <!-- Assinatura do cliente, feita no aparelho. Traçado IRREGULAR de propósito:
         uma onda regular lia como gráfico/senoide, não como alguém assinando
         (foi o que a 1ª renderização mostrou). Laçada inicial + descida abaixo
         da linha + rubrica de saída = leitura imediata de "assinado à mão". -->
    <path d="M32 276 c6 -20 15 -30 20 -24 c5 6 1 22 -6 30 c-7 8 -10 2 -4 -8
             c8 -13 22 -12 32 -2 c9 9 16 10 21 -2 c5 -13 13 -16 18 -6
             c5 10 11 12 17 0 c5 -10 12 -12 17 -2"
          fill="none" stroke="${MARCA.navy}" stroke-opacity="0.85" stroke-width="4.2"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M44 292 c38 9 82 7 116 -8" fill="none" stroke="${MARCA.navy}"
          stroke-opacity="0.55" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="34" y="303" width="150" height="5" rx="2.5" fill="#B6C7D8"/>
  </g>

  <!-- Selo de aprovado: o check da própria logo, reaproveitado -->
  <g transform="translate(852, 334)">
    <circle cx="46" cy="46" r="46" fill="#12B76A"/>
    <circle cx="46" cy="46" r="46" fill="none" stroke="#ffffff" stroke-opacity="0.30" stroke-width="3"/>
    <path d="M28 47 l12 12.5 l24 -25" fill="none" stroke="#FFFFFF" stroke-width="8"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function gerarFeatureGraphic() {
  const destino = path.join(SAIDA, 'feature-graphic.png');
  await sharp(Buffer.from(svgFeatureGraphic()), { density: 144 })
    .resize(1024, 500, { fit: 'fill' })
    // 24-bit sem alpha: exigência da Play para o feature graphic.
    .flatten({ background: MARCA.navy })
    .png({ compressionLevel: 9 })
    .toFile(destino);
  return destino;
}

async function gerarIcone512() {
  const origem = path.join(RAIZ, 'assets', 'icon.png');
  const destino = path.join(SAIDA, 'icone-512.png');
  await sharp(origem)
    .resize(512, 512, { fit: 'cover' })
    // 32-bit COM alpha: exigência da Play para o ícone do app. O icon.png de
    // origem tem 3 canais (medido), então sem isto sairia 24-bit e seria recusado.
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toFile(destino);
  return destino;
}

(async () => {
  const feitos = [await gerarIcone512(), await gerarFeatureGraphic()];
  for (const f of feitos) {
    const meta = await sharp(f).metadata();
    const kb = (fs.statSync(f).size / 1024).toFixed(1);
    console.log(
      `${path.relative(RAIZ, f)} — ${meta.width}x${meta.height}, ${meta.channels} canais, ` +
      `alpha=${meta.hasAlpha}, ${kb} KB`,
    );
  }
})().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
