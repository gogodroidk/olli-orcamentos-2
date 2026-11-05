/**
 * Identidade visual do prestador (D1438-G07): logo no PDF, recorte, site e
 * link de avaliação do Google. Roda sem aparelho e sem rede.
 *
 *     node scripts/teste-identidade-visual.ts
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  CAIXA_LOGO_CABECALHO,
  aspectoDoModo,
  bytesDeBase64,
  dimensoesImagemDataUri,
  encaixarImagem,
  fotoPerfilAceita,
  fotoPerfilExibivel,
  linkAvaliacaoUsavel,
  mimeDeBase64Imagem,
  normalizarLinkAvaliacaoGoogle,
  normalizarSiteProprio,
  recorteNaImagem,
  siteParaDocumento,
  tagImgLogo,
} from '../src/utils/identidadeVisual.ts';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

function png(w: number, h: number): string {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const len = Buffer.from([0, 0, 0, 13]);
  const type = Buffer.from('IHDR');
  const data = Buffer.alloc(13);
  data.writeUInt32BE(w, 0);
  data.writeUInt32BE(h, 4);
  data[8] = 8;
  const raw = Buffer.concat([sig, len, type, data, Buffer.alloc(4)]);
  return `data:image/png;base64,${raw.toString('base64')}`;
}

function jpeg(w: number, h: number, comApp0 = false): string {
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (h >> 8) & 0xff, h & 0xff,
    (w >> 8) & 0xff, w & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const raw = Buffer.concat([Buffer.from([0xff, 0xd8]), comApp0 ? app0 : Buffer.alloc(0), sof]);
  return `data:image/jpeg;base64,${raw.toString('base64')}`;
}

assert.deepEqual(bytesDeBase64('TWFu', 3), Uint8Array.from([77, 97, 110]));
assert.equal(mimeDeBase64Imagem(png(8, 4).split(',')[1]), 'image/png');
assert.equal(mimeDeBase64Imagem(jpeg(20, 10).split(',')[1]), 'image/jpeg');

assert.deepEqual(dimensoesImagemDataUri(png(512, 128)), { largura: 512, altura: 128 });
assert.deepEqual(dimensoesImagemDataUri(jpeg(800, 100, true)), { largura: 800, altura: 100 });
assert.equal(dimensoesImagemDataUri('data:image/svg+xml;base64,PHN2Zy8+'), null);

const quadrada = tagImgLogo(png(512, 512), 'brand-logo', CAIXA_LOGO_CABECALHO);
assert.match(quadrada, /width="64"/);
assert.match(quadrada, /height="64"/);
assert.match(quadrada, /class="brand-logo"/);
const larga = tagImgLogo(png(800, 100), 'brand-logo', CAIXA_LOGO_CABECALHO);
assert.match(larga, /width="200"/);
assert.match(larga, /height="25"/);
assert.equal(tagImgLogo('data:image/svg+xml;base64,PHN2Zy8+', 'brand-logo', CAIXA_LOGO_CABECALHO), '');
assert.equal(tagImgLogo(`${png(8, 8)}" onerror="alert(1)`, 'brand-logo', CAIXA_LOGO_CABECALHO), '');
assert.equal(tagImgLogo(png(8, 8), 'brand-logo"><script>', CAIXA_LOGO_CABECALHO), '');
assert.deepEqual(encaixarImagem(40, 40, CAIXA_LOGO_CABECALHO), { largura: 40, altura: 40 });

assert.deepEqual(recorteNaImagem(1000, 500, 1, 1, 0, 0), { x: 250, y: 0, largura: 500, altura: 500 });
const zoom = recorteNaImagem(1000, 500, 1, 2, 0, 0);
assert.equal(zoom.largura, 250);
assert.equal(zoom.altura, 250);
assert.ok(zoom.x > 0 && zoom.x + zoom.largura <= 1000);
assert.deepEqual(recorteNaImagem(1000, 500, 1, 2, -1, -1).x, 0);
const canto = recorteNaImagem(1000, 500, 1, 2, 1, 1);
assert.ok(canto.x + canto.largura <= 1000);
assert.ok(canto.y + canto.altura <= 500);
assert.equal(aspectoDoModo('faixa', 100, 80), 2.5);
assert.equal(aspectoDoModo('inteira', 100, 80), 1.25);

assert.equal(normalizarSiteProprio('').ok && normalizarSiteProprio('').url, '');
assert.equal(normalizarSiteProprio('www.clima.com.br').ok && normalizarSiteProprio('www.clima.com.br').url, 'https://www.clima.com.br/');
assert.equal(normalizarSiteProprio('http://minhaempresa.com.br/orcamentos').ok
  && normalizarSiteProprio('http://minhaempresa.com.br/orcamentos').url, 'http://minhaempresa.com.br/orcamentos');
assert.equal(normalizarSiteProprio('javascript:alert(1)').ok, false);
assert.equal(normalizarSiteProprio('localhost').ok, false);
assert.equal(siteParaDocumento('não é site'), '');
assert.equal(siteParaDocumento('www.suaempresa.com.br'), 'https://www.suaempresa.com.br/');

assert.equal(normalizarLinkAvaliacaoGoogle('').ok && normalizarLinkAvaliacaoGoogle('').url, '');
assert.equal(
  normalizarLinkAvaliacaoGoogle('g.page/r/abc/review').ok
  && normalizarLinkAvaliacaoGoogle('g.page/r/abc/review').url,
  'https://g.page/r/abc/review',
);
assert.equal(
  normalizarLinkAvaliacaoGoogle('https://search.google.com/local/writereview?placeid=ChIJ').ok,
  true,
);
assert.equal(normalizarLinkAvaliacaoGoogle('https://www.google.com').ok, false);
assert.equal(normalizarLinkAvaliacaoGoogle('https://evil.com/g.page').ok, false);
assert.equal(normalizarLinkAvaliacaoGoogle('https://google.com.evil.com/maps').ok, false);
assert.equal(normalizarLinkAvaliacaoGoogle('javascript:alert(1)').ok, false);
assert.equal(linkAvaliacaoUsavel('bit.ly/avaliacao'), '');
assert.equal(linkAvaliacaoUsavel('https://maps.app.goo.gl/abc'), 'https://maps.app.goo.gl/abc');

assert.equal(fotoPerfilAceita('file:///data/foto.jpg').ok, false);
assert.equal(fotoPerfilAceita('content://media/1').ok, false);
assert.equal(fotoPerfilAceita('data:image/svg+xml;base64,PHN2Zw==').ok, false);
assert.equal(fotoPerfilAceita('https://lh3.googleusercontent.com/a/foto').ok, true);
assert.equal(fotoPerfilAceita(`data:image/jpeg;base64,${'A'.repeat(50)}`).ok, true);
assert.equal(fotoPerfilExibivel('file:///tmp/a.jpg'), null);
assert.equal(fotoPerfilExibivel('https://cdn.exemplo.com/eu.jpg'), 'https://cdn.exemplo.com/eu.jpg');

const negocio = ler('../src/screens/MeuNegocioScreen.tsx');
const conta = ler('../src/screens/ContaScreen.tsx');
const contaDesktop = ler('../src/screens/desktop/ContaDesktopScreen.tsx');
const pdf = ler('../src/utils/pdfGenerator.ts');
const recibo = ler('../src/utils/reciboPdf.ts');
const chassi = ler('../src/utils/documentoBase.ts');
const anvisa = ler('../src/utils/certificadoAnvisaPdf.ts');
const caixa = ler('../src/utils/certificadoCaixaDaguaPdf.ts');
const imagem = ler('../src/utils/imagemDataUri.ts');
const painel = ler('../webapp/src/pages/olli/meu-negocio/index.tsx');
const config = ler('../webapp/src/pages/olli/configuracoes/index.tsx');
const recibosDesktop = ler('../src/screens/desktop/RecibosDesktopScreen.tsx');
const visualizar = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
const encerrar = ler('../src/components/encerramento/EncerrarAtendimentoModal.tsx');
const emitir = ler('../src/screens/EmitirReciboScreen.tsx');
const contaServico = ler('../src/services/conta.ts');

assert.match(negocio, /allowsEditing:\s*recortar/);
assert.match(negocio, /normalizarSiteProprio/);
assert.match(negocio, /normalizarLinkAvaliacaoGoogle/);
assert.match(negocio, /Site próprio/);
assert.match(pdf, /tagImgLogo/);
assert.match(pdf, /siteParaDocumento/);
assert.match(pdf, /return escapeHtml\(IMG_CACHE\[uri\] \|\| \(uri\.startsWith\('data:'\) \? uri : ''\)\);/);
assert.match(recibo, /tagImgLogo/);
assert.match(recibo, /siteParaDocumento/);
assert.match(chassi, /tagImgLogo/);
assert.match(chassi, /siteParaDocumento/);
assert.match(anvisa, /tagImgLogo/);
assert.match(anvisa, /escapeHtml\(logoData\)/);
assert.match(caixa, /tagImgLogo/);
assert.match(imagem, /mimeDeBase64Imagem/);
assert.match(painel, /RecorteImagem/);
assert.match(painel, /normalizarSiteProprio/);
assert.match(config, /type="file"/);
assert.match(config, /RecorteImagem/);
assert.doesNotMatch(config, /URL da foto de perfil/);
assert.match(conta, /escolherFotoPerfil/);
assert.match(contaDesktop, /escolherFotoPerfil/);
assert.match(contaServico, /fotoPerfilAceita/);
for (const fonte of [emitir, recibosDesktop, visualizar, encerrar]) {
  assert.match(fonte, /linkAvaliacaoUsavel/);
}

console.log('teste-identidade-visual: ok');
