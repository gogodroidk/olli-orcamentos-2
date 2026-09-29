/**
 * Confere a SAÍDA PÚBLICA da landing (dist/) antes de ela ir ao ar.
 *
 * POR QUE EXISTE
 *   A auditoria de 29/09 achou, no HTML servido a todo visitante, 7 comentários de
 *   HTML com bastidor — "A OLLI tem 0 pagante", nomes de concorrente, "LANDING_BRIEF" —
 *   e "0 calculadora de campo" numa meta description. Nada disso aparecia na tela; só
 *   no código-fonte da página e no que o Google e as IAs leem. Revisão visual não pega.
 *
 *   Este passo roda no `npm run build` (ver package.json), depois do `astro build`:
 *   se qualquer arquivo público (HTML, llms.txt, manifestos, XML) contiver bastidor,
 *   o BUILD MORRE — em vez de a próxima leva publicar de novo em silêncio.
 *
 * O teste de fonte correspondente é `scripts/teste-landing-honesta.ts` (raiz).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));

/** Arquivos de texto que o visitante (ou um robô) recebe. */
const PUBLICO = /\.(html|txt|json|xml|webmanifest)$/;

/**
 * Comentários de HTML que são do FRAMEWORK, não nossos: o Astro marca o fim de cada
 * ilha com `<!--astro:end-->`. Qualquer outro `<!--` é comentário escrito à mão.
 */
const COMENTARIO_DO_FRAMEWORK = /^<!--astro:end-->/;

/** Bastidor e zero que não podem chegar a ninguém. */
const PROIBIDO = [
	{ re: /\b0 pagantes?\b/i, motivo: "número interno de clientes pagantes" },
	{ re: /\b0 clientes pagantes\b/i, motivo: "número interno de clientes pagantes" },
	{ re: /Field Control|\bAuvo\b/i, motivo: "nome de concorrente" },
	{ re: /LANDING_BRIEF|EXECUTION_LOG|docs\/LOJAS\.md/, motivo: "documento interno" },
	{ re: /benchmark de \d+ recursos/i, motivo: "pesquisa interna de concorrência" },
	{ re: /\b0 calculadoras?\b/i, motivo: "contagem zero estampada" },
	{ re: /\b0 ferramentas?\b/i, motivo: "contagem zero estampada" },
];

function arquivosPublicos(dir) {
	const saida = [];
	for (const nome of readdirSync(dir)) {
		const caminho = join(dir, nome);
		if (statSync(caminho).isDirectory()) saida.push(...arquivosPublicos(caminho));
		else if (PUBLICO.test(nome)) saida.push(caminho);
	}
	return saida;
}

const problemas = [];
const arquivos = arquivosPublicos(DIST);

for (const arquivo of arquivos) {
	const texto = readFileSync(arquivo, "utf8");
	const nome = relative(DIST, arquivo);

	if (arquivo.endsWith(".html")) {
		for (const m of texto.matchAll(/<!--/g)) {
			const trecho = texto.slice(m.index, m.index + 80);
			if (!COMENTARIO_DO_FRAMEWORK.test(trecho)) {
				problemas.push(`${nome}: comentário de HTML publicado — "${trecho.replace(/\s+/g, " ").slice(0, 60)}…"`);
			}
		}
	}
	for (const { re, motivo } of PROIBIDO) {
		const achado = texto.match(re);
		if (achado) problemas.push(`${nome}: ${motivo} — "${achado[0]}"`);
	}
}

if (arquivos.length === 0) {
	console.error("[saida-publica] dist/ vazio — rode o astro build antes.");
	process.exit(1);
}

if (problemas.length > 0) {
	console.error(`[saida-publica] ${problemas.length} vazamento(s) na saída pública:`);
	for (const p of problemas) console.error(`  - ${p}`);
	console.error(
		"Comentário de bastidor em .astro é {/* */} (o Astro remove). Contagem pode ser zero? " +
			"Trate o ramo do zero na copy em vez de imprimir o número.",
	);
	process.exit(1);
}

console.log(`Saída pública conferida — ${arquivos.length} arquivo(s), nenhum bastidor.`);
