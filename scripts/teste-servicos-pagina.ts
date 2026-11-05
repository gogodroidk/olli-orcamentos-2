/**
 * Página /servicos/ fechada até o portão. Não publica preço fixo, não usa o WhatsApp do app
 * e não entra no sitemap enquanto PAGINA_PUBLICADA=false.
 *   node scripts/teste-servicos-pagina.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const dados = ler('../web/src/data/servicos.ts');
const pagina = ler('../web/src/pages/servicos.astro');
const config = ler('../web/astro.config.mjs');
const headers = ler('../web/scripts/gerar-headers.mjs');
const privacidade = ler('../src/content/legal/privacidade.ts');
const worker = ler('../worker/src/index.js');
const sql = ler('../supabase/migrations/20261103190000_servicos_pedidos.sql');

assert.match(dados, /PAGINA_PUBLICADA = false/);
assert.match(dados, /WHATSAPP_SERVICOS = "5511960163507"/);
assert.doesNotMatch(dados, /R\$|94172-7487|50\s*\/\s*50|captar X clientes de verdade/);
assert.doesNotMatch(pagina, /R\$|94172-7487|OLLI Orçamentos/);
assert.match(pagina, /noindex=\{!PAGINA_PUBLICADA\}/);
assert.match(pagina, /ofertaDoApp=\{false\}/);
assert.match(pagina, /telefoneContato=\{WHATSAPP_SERVICOS\}/);
assert.match(pagina, /marca="OLLI"/);
assert.match(pagina, /id="p-negocio"/);
assert.match(pagina, /id="p-cidade"/);
assert.match(pagina, /id="p-dor"/);
assert.match(pagina, /id="p-whatsapp"/);
assert.match(pagina, /id="p-aceite"/);
assert.match(pagina, /name="site_web"/);
assert.match(pagina, /no máximo 180 dias/);
assert.match(pagina, /assistente virtual \(IA\)/);
assert.match(pagina, /CNPJ 65\.361\.266\/0001-05/);
assert.match(pagina, /https:\/\/diagnostico\.olliorcamentos\.online\/servicos\/pedido/);
assert.match(pagina, /O pedido NÃO foi enviado/);
assert.match(config, /'\/servicos\/'/);
assert.match(headers, /diagnostico\.olliorcamentos\.online/);
assert.match(privacidade, /no máximo 180 dias se não houver proposta/);
assert.match(worker, /pathname === '\/servicos\/pedido'/);
assert.match(worker, /limparPedidosDiagnostico/);
assert.match(sql, /servicos_pedidos_retencao_limpar/);
assert.match(sql, /interval '180 days'/);
assert.match(sql, /revoke all on public\.servicos_pedidos from public, anon, authenticated/);
assert.doesNotMatch(sql, /grant .* to anon|grant .* to authenticated/i);

console.log('teste-servicos-pagina: ok');
