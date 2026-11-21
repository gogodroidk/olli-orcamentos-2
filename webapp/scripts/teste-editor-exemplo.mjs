import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
	configFile: false,
	envFile: false,
	optimizeDeps: { noDiscovery: true },
	resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
	server: { middlewareMode: true, hmr: false, watch: null },
});
after(() => vite.close());
const { default: OpcoesOrcamento } = await vite.ssrLoadModule("/src/pages/olli/orcamentos/OpcoesOrcamento.tsx");

const zeroConfirmado = { status: "success", fetchStatus: "idle", data: [] };
const comOrcamento = { ...zeroConfirmado, data: [{ id: "orc-1" }] };

function renderizar(exemplo, historico) {
	return renderToStaticMarkup(
		createElement(OpcoesOrcamento, {
			exemplo,
			historico,
			desconto: createElement("label", null, "Desconto"),
			totais: createElement("p", null, "Total do orçamento"),
			condicoes: createElement("h3", null, "Condições do documento"),
			aoAbrirMaisOpcoes: () => {},
		}),
	);
}

test("exemplo e zero confirmado recolhem só desconto e condições", () => {
	const html = renderizar(true, zeroConfirmado);
	const painel = html.match(/<details[^>]*>[\s\S]*<\/details>/)?.[0];
	assert.ok(painel);
	assert.doesNotMatch(painel, /^<details[^>]*\sopen[\s=>]/);
	assert.match(painel, /<summary[^>]*>Mais opções/);
	assert.match(painel, /Desconto.*Condições do documento/);
	assert.doesNotMatch(painel, /Total do orçamento/);
	assert.match(html, /Total do orçamento.*<details/);
});

for (const [caso, exemplo, historico] of [
	["exemplo com orçamento salvo", true, comOrcamento],
	["orçamento novo comum", false, zeroConfirmado],
	["edição de orçamento salvo", false, comOrcamento],
	["exemplo com primeira leitura em andamento", true, { status: "pending", fetchStatus: "fetching" }],
	["exemplo com zero em cache e nova leitura", true, { ...zeroConfirmado, fetchStatus: "fetching" }],
	["exemplo com leitura em erro", true, { ...zeroConfirmado, status: "error" }],
	["exemplo com leitura sem resposta", true, { ...zeroConfirmado, data: null }],
	["exemplo com leitura pausada", true, { ...zeroConfirmado, fetchStatus: "paused" }],
]) {
	test(`${caso} mantém desconto e condições à vista`, () => {
		const html = renderizar(exemplo, historico);
		assert.doesNotMatch(html, /<(details|summary)\b|\shidden[\s=>]/);
		assert.match(html, /Desconto.*Total do orçamento.*Condições do documento/);
	});
}
