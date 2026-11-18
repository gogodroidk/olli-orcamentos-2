// Gera uma prévia estática a partir do que o lead falou e do HTML público do site.
// Não publica, não envia e não busca a rede se o HTML vier de um arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extrairMarca, gravarLogo } from './marca.mjs';
import { renderPagina, paginaProibida } from './pagina.mjs';

export function slugEmpresa(nome) {
  const s = String(nome || 'demo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return s || 'demo';
}

export function gravarDemo({ lead, htmlSite, baseDir, saida }) {
  if (!lead?.empresa) throw new Error('lead_sem_empresa');
  const dir = path.join(saida, slugEmpresa(lead.empresa));
  fs.mkdirSync(dir, { recursive: true });
  const marca = extrairMarca(htmlSite || '');
  const logoNome = gravarLogo(marca.logo, baseDir, dir);
  const { html, modelo, oferta } = renderPagina({
    empresa: lead.empresa,
    cidade: lead.cidade || '',
    nicho: lead.nicho || '',
    pedido: lead.pedido || '',
    cor: marca.cor,
    corTexto: marca.corTexto,
    logoNome,
  });
  if (paginaProibida(html)) throw new Error('pagina_proibida');
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'FICHA.json'), `${JSON.stringify({
    empresa: lead.empresa,
    cidade: lead.cidade || '',
    nicho: lead.nicho || '',
    modelo,
    oferta,
    cor: marca.cor,
    ficticio: Boolean(lead.ficticio),
    publicado: false,
    enviado: false,
  }, null, 2)}\n`);
  return { dir, modelo, oferta, cor: marca.cor, logoNome };
}

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : '';
}

function main() {
  const leadPath = arg('--lead');
  const sitePath = arg('--site-html');
  const saida = arg('--saida');
  if (!leadPath || !sitePath || !saida) throw new Error('uso: gerar.mjs --lead --site-html --saida');
  const lead = JSON.parse(fs.readFileSync(leadPath, 'utf8'));
  const htmlSite = fs.readFileSync(sitePath, 'utf8');
  const r = gravarDemo({ lead, htmlSite, baseDir: path.dirname(sitePath), saida });
  process.stdout.write(`${JSON.stringify({ ok: true, dir: r.dir, modelo: r.modelo, cor: r.cor, publicado: false })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
