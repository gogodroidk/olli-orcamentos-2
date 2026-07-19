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

// Mesma armadilha do beacon acima, agora pro Sentry: o SDK manda o erro via fetch
// pro endpoint de ingestão. Sem este domínio no connect-src, o navegador bloqueia
// o envio e o monitoramento fica MUDO — configurado, sem erro visível, e sem
// nenhum evento chegando. Este host é o da DSN (ver web/sentry.client.config.js);
// se a org do Sentry mudar, ele muda junto.
const SENTRY_INGEST = "https://o4511745793327104.ingest.us.sentry.io";

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
	`connect-src 'self' ${CF_ANALYTICS_BEACON} ${SENTRY_INGEST}`,
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

# As capturas de tela NÃO têm hash no nome (moram em public/, o Vite não as
# processa), então o padrão do worker de assets vale pra elas: max-age=0,
# must-revalidate. Medido em produção (19/07, Slow 4G + CPU 4×, DPR 3, VISITA
# REPETIDA com cache quente): as 8 imagens revalidam, devolvem 304 com corpo
# vazio — 300 b cada, 2.400 b no total, os bytes já estavam certos — e mesmo
# assim custam 1.439 ms de relógio, porque o que se paga é o ROUND-TRIP, não o
# byte. Com a janela abaixo, quem volta no mesmo dia não faz nenhuma dessas 8
# requisições.
#
# POR QUE 1 DIA E NÃO 1 ANO: sem hash no nome, cache longo é irreversível —
# recapturar as telas não invalidaria nada e o visitante veria a tela velha até
# a janela expirar. 1 dia fresco + 1 dia servindo do cache enquanto revalida
# atrás limita a defasagem visível a ~2 dias, que é o preço honesto de um nome
# de arquivo estável. Se um dia isto incomodar, a correção certa é dar hash ao
# nome no pipeline de captura (scripts/telas/capturar-telas.mjs) e só então
# subir para "immutable" — não esticar a janela em cima de nome instável.
#
# (Sem crase neste bloco de propósito: ele mora DENTRO de um template literal,
# e uma crase aqui fecharia a string no meio. O astro check pegou exatamente
# isso quando esta regra foi escrita.)
/telas/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=86400
`;

writeFileSync(join(DIST, "_headers"), conteudo, "utf8");
console.log(`_headers gerado — ${hashes.size} script(s) inline autorizado(s) por hash.`);
