/**
 * Confere a SAÍDA do site v10 (D-2876) antes de ir ao ar. Roda no `npm run build`; qualquer falha derruba o build.
 *
 * 1. SITEMAP COMPLETO — toda página indexável (sem noindex e com canonical para si mesma) está no sitemap. Foi o que
 *    a auditoria de visibilidade de 20/11 achou faltando (1 URL de 18 em produção).
 * 2. LINKS — todo href/src interno de todo HTML aponta para arquivo que existe no dist.
 * 3. DESCRIÇÃO ≤160 nas páginas da v10 e nas /para/* (o Google corta ali).
 * 4. FAQPage — cada pergunta do JSON-LD aparece escrita na página (schema não diz o que a página não diz).
 * 5. FRASES VELHAS — copy da v10 de antes do corte do Grátis e promessas sem fonte não podem voltar.
 * 6. UMA tag h1, título e canonical em toda página.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const ORIGEM = "https://olliorcamentos.online";
const erros = [];
/** Páginas utilitárias que o astro.config tira do sitemap de propósito (ver `filter` lá). */
const FORA_DO_SITEMAP_POR_DESIGN = new Set(["/excluir-conta/"]);

function html(dir) {
	const saida = [];
	for (const nome of readdirSync(dir)) {
		const c = join(dir, nome);
		if (statSync(c).isDirectory()) saida.push(...html(c));
		else if (nome.endsWith(".html")) saida.push(c);
	}
	return saida;
}
const rotaDe = (arq) => {
	const r = "/" + relative(DIST, arq).replace(/index\.html$/, "").replace(/\.html$/, "/");
	return r === "//" ? "/" : r;
};

const paginas = html(DIST).map((arq) => ({ arq, rota: rotaDe(arq), txt: readFileSync(arq, "utf8") }));

// 1. sitemap
const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
const noSitemap = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(ORIGEM, "")));
const indexaveis = [];
for (const p of paginas) {
	if (p.rota === "/404/" || FORA_DO_SITEMAP_POR_DESIGN.has(p.rota)) continue;
	const noindex = /<meta name="robots" content="[^"]*noindex/i.test(p.txt);
	const canonical = p.txt.match(/<link rel="canonical" href="([^"]+)"/)?.[1]?.replace(ORIGEM, "");
	const redirecionamento = /http-equiv="refresh"/i.test(p.txt);
	if (noindex || redirecionamento) continue;
	if (canonical && canonical !== p.rota) continue; // variante: canonical aponta para outra
	indexaveis.push(p.rota);
	if (!noSitemap.has(p.rota)) erros.push(`SITEMAP: ${p.rota} é indexável e não está no sitemap`);
}
for (const r of noSitemap) if (!existsSync(join(DIST, r, "index.html")) && !existsSync(join(DIST, r))) erros.push(`SITEMAP: ${r} está no sitemap e não existe no dist`);

// 2. links internos
const alvoExiste = (href) => {
	let alvo = href.split("#")[0].split("?")[0];
	if (!alvo) return true;
	if (alvo.startsWith(ORIGEM)) alvo = alvo.slice(ORIGEM.length) || "/";
	if (!alvo.startsWith("/")) return true;
	const f = join(DIST, decodeURIComponent(alvo));
	if (existsSync(f) && statSync(f).isFile()) return true;
	return existsSync(join(f, "index.html"));
};
// rotas do app/worker que o domínio raiz serve por fora do dist
const EXTERNAS_DA_RAIZ = [/^\/o\//, /^\/q\//, /^\/api\//];
for (const p of paginas.filter((x) => x.rota !== "/404/")) {
	const vistos = new Set();
	for (const m of p.txt.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
		const href = m[1];
		if (/^(https?:|mailto:|tel:|data:|#|javascript:)/.test(href) && !href.startsWith(ORIGEM)) continue;
		if (EXTERNAS_DA_RAIZ.some((re) => re.test(href))) continue;
		if (vistos.has(href)) continue;
		vistos.add(href);
		if (!alvoExiste(href)) erros.push(`LINK: ${p.rota} aponta para ${href}, que não existe no dist`);
	}
	for (const m of p.txt.matchAll(/srcset="([^"]+)"/g)) {
		for (const item of m[1].split(",")) {
			const u = item.trim().split(/\s+/)[0];
			if (u.startsWith("/") && !alvoExiste(u)) erros.push(`SRCSET: ${p.rota} usa ${u}, que não existe no dist`);
		}
	}
}

// 3 + 6. descrição, h1, título, canonical
const DE_V10 = (r) => ["/", "/planos/", "/como-funciona/", "/para-empresas/", "/duvidas/"].includes(r) || r.startsWith("/para/");
for (const p of paginas) {
	if (p.rota === "/404/") continue;
	const desc = p.txt.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
	if (DE_V10(p.rota) && desc.length > 160) erros.push(`DESCRIÇÃO: ${p.rota} tem ${desc.length} caracteres (máx. 160)`);
	if (DE_V10(p.rota) && desc.length < 50) erros.push(`DESCRIÇÃO: ${p.rota} tem só ${desc.length} caracteres`);
	if (!/<title>[^<]{5,}<\/title>/.test(p.txt)) erros.push(`TÍTULO: ${p.rota} sem <title>`);
	if (!/<link rel="canonical"/.test(p.txt) && !/http-equiv="refresh"/.test(p.txt)) erros.push(`CANONICAL: ${p.rota} sem canonical`);
	const h1 = (p.txt.match(/<h1[\s>]/g) ?? []).length;
	if (h1 !== 1 && !/http-equiv="refresh"/.test(p.txt)) erros.push(`H1: ${p.rota} tem ${h1} <h1>`);
}

// 4. FAQPage
const semTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
for (const p of paginas) {
	const visivel = semTags(p.txt);
	for (const m of p.txt.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
		let j;
		try {
			j = JSON.parse(m[1]);
		} catch {
			erros.push(`JSON-LD: ${p.rota} tem bloco que não é JSON válido`);
			continue;
		}
		if (j["@type"] === "FAQPage") {
			for (const q of j.mainEntity) if (!visivel.includes(q.name.replace(/\s+/g, " "))) erros.push(`FAQ: ${p.rota} declara no schema a pergunta "${q.name}" que não está escrita na página`);
		}
	}
}

// 5. frases velhas / sem fonte (só nas páginas da v10)
const VELHAS = [
	[/Pix no link:/i, "bullet de plano escrito à mão (a fonte é planosBase)"],
	[/Com Pix no link/i, "selo de plano escrito à mão"],
	[/previsão 1º de janeiro/i, "data da App Store sem fonte"],
	[/exporta[çc][ãa]o de dados/i, "afirmação sobre exportação de dados sem fonte (LGPD)"],
	[/até 5 envios por mês · PDF/i, "limite do Grátis escrito à mão"],
];
for (const p of paginas.filter((x) => DE_V10(x.rota))) {
	const v = semTags(p.txt);
	for (const [re, porque] of VELHAS) if (re.test(v)) erros.push(`FRASE VELHA: ${p.rota} contém ${re} — ${porque}`);
	if (!/<script[^>]+src="\/_astro\/[^"]+"/.test(p.txt)) erros.push(`MEDIÇÃO: ${p.rota} sem o bundle de marketing (utm/Pixel)`);
}

// 7. LIMITE DA LEI (D-2937): foto de pessoa gerada por IA nunca é cliente, depoimento, nome nem equipe. A imagem fica sem selo,
//    então a descrição (alt) e a página não podem dizer o contrário. Só pega o que aparece escrito; a regra editorial é do SITE.
const FOTOS_DE_IA = /\/(?:site\/img\/fotos\/grok|fotos)\/[^"]*\.webp/;
for (const p of paginas) {
	for (const m of p.txt.matchAll(/<img\b[^>]*>/g)) {
		const tag = m[0];
		const src = tag.match(/\ssrc="([^"]+)"/)?.[1] ?? "";
		if (!FOTOS_DE_IA.test(src)) continue;
		const alt = tag.match(/\salt="([^"]*)"/)?.[1] ?? "";
		if (/cliente|depoimento|avalia|nossa equipe|nosso time|funcion[áa]rio|colaborador|\bnosso t[ée]cnico/i.test(alt)) erros.push(`FOTO DE IA: ${p.rota} descreve ${src} como cliente/equipe/depoimento: "${alt}"`);
	}
	if (/depoimento/i.test(semTags(p.txt)) && FOTOS_DE_IA.test(p.txt)) erros.push(`FOTO DE IA: ${p.rota} fala em depoimento e tem foto de IA na página`);
}

console.log(`Site v10 conferido — ${paginas.length} páginas, ${indexaveis.length} indexáveis, ${noSitemap.size} URLs no sitemap.`);
if (erros.length) {
	console.error(`\n${erros.length} problema(s):\n- ` + erros.slice(0, 60).join("\n- "));
	process.exit(1);
}
