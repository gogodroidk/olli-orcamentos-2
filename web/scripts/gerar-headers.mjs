/**
 * Gera o dist/_headers da landing (cabeçalhos de segurança + cache).
 *
 * POR QUE NÃO É UM ARQUIVO FIXO
 *   O Astro injeta 2 scripts INLINE no HTML (o carregador das ilhas React). Um
 *   Content-Security-Policy decente não pode usar `script-src 'unsafe-inline'`
 *   (isso é justamente o que abre a porta pra XSS), então a alternativa correta
 *   é autorizar cada script inline pelo HASH do seu conteúdo.
 *
 *   Como o conteúdo muda a cada build, o _headers TEM que ser gerado depois do
 *   build — por isso este script roda no `npm run build` (ver package.json).
 *
 * Se um dia o CSP começar a bloquear script no console, quase sempre é porque
 * este passo não rodou.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));

function arquivosHtml(dir) {
	const saida = [];
	for (const nome of readdirSync(dir)) {
		const caminho = join(dir, nome);
		if (statSync(caminho).isDirectory()) saida.push(...arquivosHtml(caminho));
		else if (nome.endsWith(".html")) saida.push(caminho);
	}
	return saida;
}

// Pega só <script> SEM src (os inline). O (?![^>]*\ssrc=) é o que exclui os externos.
const REGEX_INLINE = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

const hashes = new Set();
for (const arquivo of arquivosHtml(DIST)) {
	const html = readFileSync(arquivo, "utf8");
	for (const [, corpo] of html.matchAll(REGEX_INLINE)) {
		if (!corpo.trim()) continue;
		hashes.add(`'sha256-${createHash("sha256").update(corpo, "utf8").digest("base64")}'`);
	}
}

// O Cloudflare injeta sozinho o beacon do Web Analytics (static.cloudflareinsights.com)
// nas páginas servidas pela zona. Sem liberar aqui, o CSP o bloqueia e as
// estatísticas de visita simplesmente param de chegar — em silêncio.
const CF_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com";
const CF_ANALYTICS_BEACON = "https://cloudflareinsights.com";

const scriptSrc = ["'self'", CF_ANALYTICS_SCRIPT, ...hashes].join(" ");

// style-src precisa de 'unsafe-inline': o Astro/Tailwind emitem atributos style=""
// e o CSP não tem como "hashear" atributo. Estilo inline não executa código —
// o risco é ordens de magnitude menor que o de script inline, que ficou fechado.
const csp = [
	"default-src 'self'",
	`script-src ${scriptSrc}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self' data:",
	`connect-src 'self' ${CF_ANALYTICS_BEACON}`,
	"form-action 'self'",
	"base-uri 'self'",
	"frame-ancestors 'none'",
	"upgrade-insecure-requests",
].join("; ");

const conteudo = `# GERADO POR scripts/gerar-headers.mjs no build — NÃO EDITAR À MÃO.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()
  X-Frame-Options: DENY
  Content-Security-Policy: ${csp}

# Assets com hash no nome são imutáveis — pode cachear pra sempre.
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`;

writeFileSync(join(DIST, "_headers"), conteudo, "utf8");
console.log(`_headers gerado — ${hashes.size} script(s) inline autorizado(s) por hash.`);
