/**
 * Central de Ajuda (D-1438 G12): toda pergunta vira FAQ e llms.txt,
 * o preço de tabela da web não vaza para a loja, e o painel lê o corpo filtrado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
	ARTIGOS_AJUDA,
	CATEGORIAS_AJUDA,
	faqSchemaOrg,
	markdownAjudaLlms,
	perguntasEstruturadas,
} from "../src/content/ajuda/index.ts";
import { PRECO_EMPRESA, PRECO_PRO, reais } from "../src/services/precosPlanos.ts";

const raiz = new URL("..", import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");

const ids = ARTIGOS_AJUDA.map((artigo) => artigo.id);
assert.equal(new Set(ids).size, ids.length, "id de artigo repetido");

for (const categoria of CATEGORIAS_AJUDA) {
	assert.ok(ARTIGOS_AJUDA.some((artigo) => artigo.categoriaId === categoria.id), `categoria sem artigo: ${categoria.id}`);
}
for (const artigo of ARTIGOS_AJUDA) {
	assert.ok(CATEGORIAS_AJUDA.some((categoria) => categoria.id === artigo.categoriaId), `artigo sem categoria: ${artigo.id}`);
	assert.ok(artigo.titulo.trim().length > 8, `${artigo.id}: título curto`);
	assert.ok(artigo.resumo.trim().length > 8, `${artigo.id}: resumo curto`);
	assert.ok(artigo.corpo.length > 0, `${artigo.id}: sem corpo`);
}

const obrigatorios = [
	"o-que-e-a-olli",
	"busca-do-painel",
	"quadro-do-dia",
	"clientes-carteira",
	"catalogo-servicos-produtos",
	"agenda-visitas",
	"contratos-recorrentes",
	"documentos-biblioteca",
	"assistente-ia",
	"diagnostico-climatizacao",
	"ferramentas-oficio",
	"meu-negocio-documentos",
	"aparencia-configuracoes",
	"central-de-dados",
	"planos-assinatura",
];
for (const id of obrigatorios) assert.ok(ids.includes(id), `falta o artigo ${id}`);

const web = perguntasEstruturadas("web");
const android = perguntasEstruturadas("android");
const ios = perguntasEstruturadas("ios");
assert.equal(web.length, ARTIGOS_AJUDA.length, "FAQ web cobre cada artigo");
assert.equal(faqSchemaOrg("web")["@type"], "FAQPage");
assert.equal(faqSchemaOrg("web").mainEntity.length, web.length);

const mdWeb = markdownAjudaLlms("web");
const mdAndroid = markdownAjudaLlms("android");
const precoPro = reais(PRECO_PRO.mensalCentavos);
const precoEmpresa = reais(PRECO_EMPRESA.mensalCentavos);
assert.match(mdWeb, new RegExp(precoPro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(mdWeb, new RegExp(precoEmpresa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(mdWeb, /65\.361\.266\/0001-05/);
assert.match(mdWeb, /não emite nota fiscal/);
assert.match(mdWeb, /Ctrl\+K/);
assert.match(mdWeb, /Mover para/);
assert.match(mdWeb, /não é uma sincronização de mão dupla/);
assert.doesNotMatch(mdWeb, /Google Play/);
assert.doesNotMatch(mdWeb, /Tudo funciona offline/);
assert.match(mdAndroid, /feita e gerenciada pela Google Play/);
assert.doesNotMatch(mdAndroid, /Stripe|AbacatePay|12x|Pagar com Pix/i);
assert.doesNotMatch(mdAndroid, /R\$\s*\d/);
assert.doesNotMatch(ios.map((p) => p.resposta).join("\n"), /Google Play|Play Store/i);

const painel = ler("webapp/src/pages/olli/ajuda/index.tsx");
assert.match(painel, /data-ai-readable/);
assert.match(painel, /corpoVisivel\(artigo, "web"\)/);
assert.match(painel, /markdownAjudaLlms\("web"\)/);
assert.match(painel, /faqSchemaOrg\("web"\)/);
assert.match(painel, /ORDEM_COMO_FUNCIONA/);
assert.doesNotMatch(painel, /artigo\.corpo\.map\(/);

const publico = ler("web/src/pages/ajuda/index.astro");
assert.match(publico, /corpoVisivel\(artigo,\s*"web"\)/);
assert.match(publico, /faqSchemaOrg\("web"\)/);
assert.match(publico, /\/ajuda\/llms\.txt/);
assert.doesNotMatch(publico, /artigo\.corpo\.map\(/);

const endpoint = ler("web/src/pages/ajuda/llms.txt.ts");
assert.match(endpoint, /markdownAjudaLlms\("web"\)/);
assert.match(ler("web/src/pages/llms.txt.ts"), /\/ajuda\/llms\.txt/);

console.log(`OK — Central de Ajuda: ${web.length} perguntas, FAQ e llms.txt derivados da mesma fonte.`);
