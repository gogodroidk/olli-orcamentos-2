import { strict as assert } from 'node:assert';
import { readFileSync, statSync } from 'node:fs';

// oficios.ts importa sem extensão (Astro/Vite), o Node puro não resolve: lê como texto.
const fonte = readFileSync(new URL('../web/src/data/oficios.ts', import.meta.url), 'utf8');
const bloco = (re: RegExp) => {
  const m = re.exec(fonte);
  assert.ok(m, `bloco não achado: ${re}`);
  return m[1];
};
const slugsValidos = new Set([...bloco(/SLUG_POR_OFICIO[^{]*\{([^}]*)\}/).matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]));
const OG_PROPRIO_POR_SLUG = new Set([...bloco(/OG_PROPRIO_POR_SLUG[^[]*\[([^\]]*)\]/).matchAll(/'([^']+)'/g)].map((m) => m[1]));
assert.equal(slugsValidos.size, 10);
assert.ok(OG_PROPRIO_POR_SLUG.size > 0);
for (const slug of OG_PROPRIO_POR_SLUG) {
  assert.ok(slugsValidos.has(slug), `slug desconhecido: ${slug}`);
  const arq = new URL(`../web/public/og/${slug}.png`, import.meta.url);
  const bytes = readFileSync(arq);
  // PNG: assinatura + IHDR com largura/altura em big-endian nos bytes 16-23.
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${slug}: não é PNG`);
  assert.equal(bytes.readUInt32BE(16), 1200, `${slug}: largura`);
  assert.equal(bytes.readUInt32BE(20), 630, `${slug}: altura`);
  assert.ok(statSync(arq).size < 300 * 1024, `${slug}: passa de 300 KB (WhatsApp ignora og:image maior)`);
}
// Climatização fica no genérico até o card ser refeito (nome 'Clínica Bem Estar' sob 'Cliente exemplo').
assert.equal(OG_PROPRIO_POR_SLUG.has('climatizacao-e-refrigeracao'), false);

// A página passa a imagem ao Layout e o Layout usa nos dois metas.
const pagina = readFileSync(new URL('../web/src/pages/para/[oficio].astro', import.meta.url), 'utf8');
assert.match(pagina, /ogImagem=\{ogImagem\}/);
const layout = readFileSync(new URL('../web/src/layouts/Layout.astro', import.meta.url), 'utf8');
assert.match(layout, /og:image" content=\{new URL\(ogImagem,/);
assert.match(layout, /twitter:image" content=\{new URL\(ogImagem,/);
console.log(`teste-og-oficios: ${OG_PROPRIO_POR_SLUG.size} cards conferidos`);
