/**
 * FONTES PRÓPRIAS (LGPD): as páginas que o worker serve ao cliente final (link do orçamento, confirmação de visita, página de
 * pagamento, PMOC, equipe) NÃO carregam mais Google Fonts — o <link> entregava o IP do visitante ao Google. As fontes (Plus Jakarta
 * Sans e Spectral, ambas SIL OFL 1.1, uso comercial livre) ficam em web/public/fonts e saem de olliorcamentos.online/fonts
 * (CORS aberto em web/scripts/gerar-headers.mjs, que gera o _headers do build). Só o subset latin (cobre o português). Licenças ao lado dos arquivos.
 */
export const FONTES_ORIGEM = 'https://olliorcamentos.online';

export const FONTES_CSS =
  `@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:200 800;font-display:swap;src:url(${FONTES_ORIGEM}/fonts/plus-jakarta-sans-latin-wght.woff2) format('woff2')}` +
  `@font-face{font-family:'Spectral';font-style:normal;font-weight:600;font-display:swap;src:url(${FONTES_ORIGEM}/fonts/spectral-latin-600.woff2) format('woff2')}` +
  `@font-face{font-family:'Spectral';font-style:normal;font-weight:700;font-display:swap;src:url(${FONTES_ORIGEM}/fonts/spectral-latin-700.woff2) format('woff2')}`;
