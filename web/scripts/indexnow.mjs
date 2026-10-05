#!/usr/bin/env node
/**
 * IndexNow da landing: avisa Bing e demais buscadores participantes que páginas mudaram,
 * para eles voltarem a rastrear mais cedo. NÃO garante indexação nem posição: só encurta
 * o tempo até o recrawl. (O Google não participa do IndexNow.)
 *
 * POR QUE É UM SCRIPT E NÃO PARTE DO WORKER
 *   O olli-site serve só arquivos estáticos. O aviso é uma ação de publicação, não de
 *   atendimento: roda na máquina de quem publica, uma vez por deploy.
 *
 * FLUXO (dois passos, porque depois do deploy o site no ar já é igual ao dist/)
 *   1. cd web && npm run build
 *   2. node scripts/indexnow.mjs plan      ANTES do deploy: compara dist/ com o que está
 *                                          no ar e grava .indexnow-plano.json (só o que mudou)
 *   3. cd ../site && npx wrangler deploy
 *   4. node scripts/indexnow.mjs ping      DEPOIS: confere a chave no ar e envia o plano
 *
 * Opções:  --dry-run (mostra, não envia) · --all (plano = todo o sitemap)
 *          --max N (teto de URLs por envio, padrão 200) · --force (reenvia plano já enviado)
 *
 * REGRAS DO PROTOCOLO (https://www.indexnow.org/documentation)
 *   - chave de 8 a 128 caracteres [A-Za-z0-9-], num arquivo UTF-8 em /<chave>.txt na raiz;
 *   - POST em lote com host, key, keyLocation e urlList (até 10.000 URLs);
 *   - enviar só URL realmente alterada: reenviar tudo a cada deploy parece spam (429).
 *
 * A chave é pública por desenho (o protocolo exige o arquivo aberto na raiz). Ela só prova
 * que quem avisa controla o domínio; não dá acesso a nada.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HOST = "olliorcamentos.online";
export const CHAVE = "2466c056b8a77c60c534fdb996675a2d";
export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const LIMITE_PROTOCOLO = 10000;
export const TETO_PADRAO = 200;

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(RAIZ, "dist");
const ARQUIVO_PLANO = join(RAIZ, ".indexnow-plano.json");

export function chaveValida(chave) {
	return /^[A-Za-z0-9-]{8,128}$/.test(chave);
}

/** `https://host/ajuda/` → `ajuda/index.html`; `https://host/` → `index.html`. */
export function urlParaArquivo(url) {
	const { pathname } = new URL(url);
	const limpo = decodeURIComponent(pathname).replace(/^\/+/, "");
	if (limpo === "" || limpo.endsWith("/")) return `${limpo}index.html`;
	return /\.[a-z0-9]+$/i.test(limpo) ? limpo : `${limpo}/index.html`;
}

/**
 * Tira o que muda sem o conteúdo mudar, para o hash comparar o NOSSO conteúdo: o que a
 * Cloudflare injeta na entrega (scripts em /cdn-cgi/, e-mail ofuscado), o `uid` aleatório
 * que o Astro grava em cada ilha a cada build, e espaço de quebra. Sem isso, toda página
 * com ilha pareceria "alterada" em todo deploy e o aviso viraria spam.
 */
export function normalizar(html) {
	return html
		.replace(/<script[^>]*\/cdn-cgi\/[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<a[^>]*\/cdn-cgi\/l\/email-protection[^>]*>[\s\S]*?<\/a>/gi, "")
		.replace(/(<astro-island\b[^>]*?\buid=")[^"]*"/gi, '$1"')
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.trim();
}

export function hash(texto) {
	return createHash("sha256").update(normalizar(texto)).digest("hex");
}

/** URLs `<loc>` de um sitemap, só do nosso host e só https. */
export function urlsDoSitemap(xml, host = HOST) {
	const saida = [];
	for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
		try {
			const u = new URL(m[1]);
			if (u.protocol === "https:" && u.hostname === host) saida.push(u.href);
		} catch {
			// URL inválida no sitemap: ignora, o build já teria reclamado.
		}
	}
	return [...new Set(saida)];
}

/**
 * Decide o que avisar. `lerLocal(url)` devolve o HTML novo (ou null se não existe no dist);
 * `lerNoAr(url)` devolve `{ status, corpo }` do que está no ar agora (ou lança em erro de rede).
 *
 * Erro de rede NÃO vira "mudou": fica em `falhas` e fora do plano. Na dúvida, não avisa
 * (o mesmo princípio de "não sei" não é "mudou" que o resto do OLLI segue).
 */
export async function planejar(urls, lerLocal, lerNoAr) {
	const plano = { novas: [], alteradas: [], iguais: [], semArquivo: [], falhas: [] };
	for (const url of urls) {
		const local = lerLocal(url);
		if (local == null) {
			plano.semArquivo.push(url);
			continue;
		}
		let noAr;
		try {
			noAr = await lerNoAr(url);
		} catch (erro) {
			plano.falhas.push({ url, motivo: String(erro?.message ?? erro) });
			continue;
		}
		if (noAr.status === 404) plano.novas.push(url);
		else if (noAr.status !== 200) plano.falhas.push({ url, motivo: `HTTP ${noAr.status}` });
		else if (hash(noAr.corpo) !== hash(local)) plano.alteradas.push(url);
		else plano.iguais.push(url);
	}
	return plano;
}

export function montarPayload(urls, { host = HOST, chave = CHAVE } = {}) {
	if (!chaveValida(chave)) throw new Error("chave IndexNow inválida (8 a 128 caracteres A-Z a-z 0-9 -)");
	const urlList = [...new Set(urls)].filter((u) => {
		try {
			const x = new URL(u);
			return x.protocol === "https:" && x.hostname === host;
		} catch {
			return false;
		}
	});
	if (urlList.length > LIMITE_PROTOCOLO) throw new Error(`mais de ${LIMITE_PROTOCOLO} URLs num envio`);
	return { host, key: chave, keyLocation: `https://${host}/${chave}.txt`, urlList };
}

/** Traduz o código de resposta do IndexNow em decisão. */
export function interpretarResposta(status) {
	if (status === 200 || status === 202) return { ok: true, texto: status === 200 ? "aceito" : "recebido (a chave ainda será validada)" };
	if (status === 400) return { ok: false, texto: "400: formato inválido" };
	if (status === 403) return { ok: false, texto: "403: chave não confere com o arquivo no ar" };
	if (status === 422) return { ok: false, texto: "422: URLs fora do host ou chave inconsistente" };
	if (status === 429) return { ok: false, texto: "429: muitos envios (parece spam). Espere e envie menos URLs" };
	return { ok: false, texto: `resposta inesperada ${status}` };
}

// ── execução (CLI) ────────────────────────────────────────────────────────────────

function opcoes(argv) {
	const o = { dry: argv.includes("--dry-run"), todas: argv.includes("--all"), force: argv.includes("--force"), max: TETO_PADRAO };
	const i = argv.indexOf("--max");
	if (i >= 0) o.max = Number(argv[i + 1]);
	if (!Number.isInteger(o.max) || o.max < 1) throw new Error("--max precisa ser um inteiro positivo");
	return o;
}

function lerLocalDoDist(url) {
	const arquivo = join(DIST, urlParaArquivo(url));
	return existsSync(arquivo) ? readFileSync(arquivo, "utf8") : null;
}

async function lerNoAr(url) {
	const r = await fetch(url, { headers: { "cache-control": "no-cache" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
	return { status: r.status, corpo: r.status === 200 ? await r.text() : "" };
}

async function cmdPlan(o) {
	const sitemap = join(DIST, "sitemap-0.xml");
	if (!existsSync(sitemap)) throw new Error("dist/sitemap-0.xml não existe: rode `npm run build` antes");
	const urls = urlsDoSitemap(readFileSync(sitemap, "utf8"));
	let mudaram;
	let resumo;
	if (o.todas) {
		mudaram = urls;
		resumo = { todas: urls.length };
	} else {
		const p = await planejar(urls, lerLocalDoDist, lerNoAr);
		mudaram = [...p.novas, ...p.alteradas];
		resumo = { novas: p.novas.length, alteradas: p.alteradas.length, iguais: p.iguais.length, semArquivo: p.semArquivo.length, falhas: p.falhas.length };
		for (const f of p.falhas) console.warn(`  não consegui comparar ${f.url}: ${f.motivo} (fora do plano)`);
	}
	console.log("plano:", JSON.stringify(resumo));
	if (mudaram.length > o.max && !o.force) {
		throw new Error(`${mudaram.length} URLs mudaram, acima do teto de ${o.max}. Se é mudança de template, rode de novo com --max ou --force.`);
	}
	writeFileSync(ARQUIVO_PLANO, JSON.stringify({ geradoEm: new Date().toISOString(), urls: mudaram, enviadoEm: null }, null, 2));
	console.log(`${mudaram.length} URL(s) no plano (${ARQUIVO_PLANO}). Agora faça o deploy e rode: node scripts/indexnow.mjs ping`);
	for (const u of mudaram.slice(0, 20)) console.log("  ", u);
}

async function cmdPing(o) {
	if (!existsSync(ARQUIVO_PLANO)) throw new Error("sem plano: rode `node scripts/indexnow.mjs plan` ANTES do deploy");
	const plano = JSON.parse(readFileSync(ARQUIVO_PLANO, "utf8"));
	if (plano.enviadoEm && !o.force) {
		console.log(`plano já enviado em ${plano.enviadoEm}; nada a fazer (use --force para reenviar)`);
		return;
	}
	if (plano.urls.length === 0) {
		console.log("plano vazio: nenhuma página mudou, nada a avisar");
		return;
	}
	const payload = montarPayload(plano.urls);
	if (payload.urlList.length !== plano.urls.length) throw new Error("o plano tem URL fora de https://" + HOST);
	if (payload.urlList.length > o.max && !o.force) throw new Error(`${payload.urlList.length} URLs, acima do teto ${o.max}`);

	// A chave tem que estar no ar ANTES do aviso: sem isso a resposta é 403 e conta como erro.
	const r = await fetch(payload.keyLocation, { signal: AbortSignal.timeout(20000) }).catch(() => null);
	const corpo = r?.status === 200 ? (await r.text()).trim() : null;
	if (corpo !== CHAVE) throw new Error(`o arquivo ${payload.keyLocation} não está no ar com a chave certa (HTTP ${r?.status ?? "sem resposta"}). Faça o deploy antes do ping.`);

	if (o.dry) {
		console.log(`[dry-run] enviaria ${payload.urlList.length} URL(s) para ${ENDPOINT}`);
		return;
	}
	const resp = await fetch(ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/json; charset=utf-8" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(30000),
	});
	const v = interpretarResposta(resp.status);
	console.log(`IndexNow: ${v.texto}`);
	if (!v.ok) throw new Error(v.texto);
	plano.enviadoEm = new Date().toISOString();
	writeFileSync(ARQUIVO_PLANO, JSON.stringify(plano, null, 2));
	console.log(`${payload.urlList.length} URL(s) avisadas. Isso acelera o recrawl; não garante indexação.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const [, , comando, ...resto] = process.argv;
	try {
		const o = opcoes(resto);
		if (comando === "plan") await cmdPlan(o);
		else if (comando === "ping") await cmdPing(o);
		else throw new Error("uso: node scripts/indexnow.mjs <plan|ping> [--dry-run] [--all] [--max N] [--force]");
	} catch (erro) {
		console.error("indexnow:", erro.message);
		// exitCode (e não process.exit): no Windows, exit com fetch pendente derruba o libuv.
		process.exitCode = 1;
	}
}
