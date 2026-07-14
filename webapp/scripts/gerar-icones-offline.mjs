/**
 * Gera o pacote OFFLINE de ícones (src/components/icon/icons-offline.ts).
 *
 * POR QUE EXISTE
 *   O @iconify/react, quando não encontra o ícone numa coleção já registrada,
 *   vai buscá-lo em runtime na api.iconify.design (um terceiro). Isso significa
 *   que a UI do painel fica dependendo de um servidor que não é nosso: se ele
 *   cair, o painel abre SEM ÍCONE NENHUM — e cada visita do cliente vaza pra lá.
 *
 *   Este script varre o código, descobre quais ícones são realmente usados,
 *   baixa só esses (uma vez, aqui no build) e grava um módulo TS que registra
 *   as coleções localmente. Em produção: zero requisição a terceiros.
 *
 * QUANDO RODAR
 *   Sempre que adicionar/trocar um ícone de biblioteca no código:
 *     node scripts/gerar-icones-offline.mjs
 *   O arquivo gerado é versionado — o build normal NÃO depende de rede.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath (e não .pathname): o caminho do projeto tem espaço e viraria %20.
const SRC = fileURLToPath(new URL("../src", import.meta.url));
const SAIDA = join(SRC, "components", "icon", "icons-offline.ts");

// `local:` é registrado a partir dos SVGs em src/assets/icons (register-icons.ts).
// `url:` é uma <img> direta. Nenhum dos dois vem do Iconify.
const PREFIXOS_IGNORADOS = new Set(["local", "url", "http", "https", "data"]);

/** Varre recursivamente os fontes .ts/.tsx. */
function arquivosFonte(dir) {
	const saida = [];
	for (const nome of readdirSync(dir)) {
		const caminho = join(dir, nome);
		if (statSync(caminho).isDirectory()) saida.push(...arquivosFonte(caminho));
		else if (/\.tsx?$/.test(nome)) saida.push(caminho);
	}
	return saida;
}

// Junta os ícones citados no código, agrupados por prefixo.
const porPrefixo = new Map();
for (const arquivo of arquivosFonte(SRC)) {
	const texto = readFileSync(arquivo, "utf8");
	for (const [, prefixo, nome] of texto.matchAll(/["'`]([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)["'`]/g)) {
		if (PREFIXOS_IGNORADOS.has(prefixo)) continue;
		if (!porPrefixo.has(prefixo)) porPrefixo.set(prefixo, new Set());
		porPrefixo.get(prefixo).add(nome);
	}
}

const colecoes = [];
let totalIcones = 0;

for (const [prefixo, nomes] of [...porPrefixo].sort()) {
	const lista = [...nomes].sort();
	const url = `https://api.iconify.design/${prefixo}.json?icons=${lista.join(",")}`;
	const resposta = await fetch(url);

	// Prefixo que não é uma coleção Iconify de verdade (ex.: "components:xyz" que
	// é só uma string qualquer do código) devolve 404 — ignorar sem alarde.
	if (!resposta.ok) {
		console.log(`  ·  ${prefixo.padEnd(20)} não é coleção Iconify — ignorado`);
		continue;
	}
	const dados = await resposta.json();
	const achados = Object.keys(dados.icons ?? {}).length + Object.keys(dados.aliases ?? {}).length;
	if (achados === 0) {
		console.log(`  ·  ${prefixo.padEnd(20)} não é coleção Iconify — ignorado`);
		continue;
	}

	// Um ícone citado no código que não existe na biblioteca é um bug silencioso
	// (renderiza vazio). Falhar alto é melhor do que descobrir em produção.
	if (dados.not_found?.length) {
		throw new Error(`Ícones inexistentes em "${prefixo}": ${dados.not_found.join(", ")} — corrija o nome no código.`);
	}

	delete dados.not_found;
	colecoes.push(dados);
	totalIcones += achados;
	console.log(`  ✓  ${prefixo.padEnd(20)} ${String(achados).padStart(3)} ícone(s)`);
}

const conteudo = `// GERADO POR scripts/gerar-icones-offline.mjs — NÃO EDITAR À MÃO.
// Regenerar: node scripts/gerar-icones-offline.mjs
//
// Contém APENAS os ícones que o código realmente usa, embutidos no bundle. É o
// que garante que o painel funcione com os ícones mesmo sem falar com terceiros
// (e o que permite manter o Content-Security-Policy fechado).
import type { IconifyJSON } from "@iconify/react";

export const colecoesOffline: IconifyJSON[] = ${JSON.stringify(colecoes, null, 1)};
`;

writeFileSync(SAIDA, conteudo, "utf8");
console.log(`\n${totalIcones} ícones de ${colecoes.length} bibliotecas embutidos em src/components/icon/icons-offline.ts`);
