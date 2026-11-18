import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairMarca, resolverLogo } from './marca.mjs';
import { renderPagina, paginaProibida } from './pagina.mjs';
import { gravarDemo } from './gerar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(aqui, 'fixtures');

test('tira a cor do theme-color e o logo de arquivo local, sem sair da pasta', () => {
  const aurora = extrairMarca(fs.readFileSync(path.join(fx, 'aurora.html'), 'utf8'));
  assert.equal(aurora.cor, '#0E6B62');
  assert.equal(aurora.logo, 'aurora-logo.svg');
  const luminar = extrairMarca(fs.readFileSync(path.join(fx, 'luminar.html'), 'utf8'));
  assert.equal(luminar.cor, '#E07A1F');
  assert.equal(luminar.logo, 'luminar-logo.svg');
  assert.equal(resolverLogo('https://exemplo.test/logo.svg', fx), null);
  assert.equal(resolverLogo('../segredo.svg', fx), null);
  assert.equal(resolverLogo('aurora-logo.svg', fx).endsWith('aurora-logo.svg'), true);
});

test('dois leads fictícios: atendimento da Aurora e site da Luminar', () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
  const casos = [
    ['aurora.json', 'aurora.html', 'atendimento', 'Refrigeração Aurora', 'Campinas'],
    ['luminar.json', 'luminar.html', 'site', 'Elétrica Luminar', 'Ribeirão Preto'],
  ];
  for (const [leadArq, siteArq, modelo, empresa, cidade] of casos) {
    const lead = JSON.parse(fs.readFileSync(path.join(aqui, 'leads', leadArq), 'utf8'));
    const htmlSite = fs.readFileSync(path.join(fx, siteArq), 'utf8');
    const r = gravarDemo({ lead, htmlSite, baseDir: fx, saida });
    assert.equal(r.modelo, modelo);
    const html = fs.readFileSync(path.join(r.dir, 'index.html'), 'utf8');
    assert.match(html, new RegExp(empresa));
    assert.match(html, new RegExp(cidade));
    assert.match(html, /WhatsApp/);
    assert.match(html, new RegExp(r.cor));
    assert.equal(fs.existsSync(path.join(r.dir, 'logo.svg')), true);
    assert.equal(paginaProibida(html), false);
    assert.doesNotMatch(html, /<script|R\$|garanto|OLLI Orçamentos|wa\.me/i);
    const ficha = JSON.parse(fs.readFileSync(path.join(r.dir, 'FICHA.json'), 'utf8'));
    assert.equal(ficha.publicado, false);
    assert.equal(ficha.enviado, false);
    assert.equal(ficha.ficticio, true);
  }
  const sujo = renderPagina({ empresa: '<script>', cidade: 'X', nicho: 'elétrica', pedido: 'quero um site', cor: '#E07A1F', corTexto: '#1B2A4A' });
  assert.equal(sujo.html.includes('<script'), false);
  assert.match(sujo.html, /&lt;script&gt;/);
});
