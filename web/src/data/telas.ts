import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "astro/zod";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRATO DAS CAPTURAS DE TELA — `web/public/telas/telas.json`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PRODUTOR: `scripts/telas/capturar-telas.mjs` (Playwright + sharp).
 * CONSUMIDOR: `web/src/components/EsteiraTelas.astro`.
 *
 * Este arquivo é o CONTRATO ENTRE OS DOIS. O schema abaixo é a única fonte da
 * verdade sobre o formato: se o pipeline mudar a saída e não mudar aqui, o
 * build morre apontando o campo — não renderiza torto e não some em silêncio.
 *
 * ── OS TRÊS ESTADOS, E POR QUE SÃO TRÊS ────────────────────────────────────
 *
 * A regra P0 desta casa é "carregando | erro | valor — 'não sei' NUNCA vira
 * 'não tem', erro NUNCA vira sucesso". Aplicada a um arquivo de build:
 *
 *   1. ARQUIVO AUSENTE → `{ estado: "ausente" }`. A seção não renderiza, o
 *      build passa. Isto NÃO é erro: é "as capturas ainda não foram geradas".
 *
 *   2. ARQUIVO PRESENTE E INVÁLIDO → **THROW. O BUILD MORRE.** JSON quebrado,
 *      campo faltando, `alt` preguiçoso, arquivo declarado que não está em
 *      disco. São erros de quem gerou, e tratá-los como "ausente" seria
 *      exatamente "erro vira vazio": a seção sumiria da landing publicada e
 *      ninguém descobriria até um humano reparar que ela não está lá.
 *
 *   3. VÁLIDO → a seção aparece sozinha, sem tocar em código.
 *
 * ── FORMATO (o que o pipeline emite hoje, verificado no arquivo real) ───────
 *
 * ```jsonc
 * {
 *   "geradoPor": "scripts/telas/capturar-telas.mjs",
 *   "telas": [{
 *     "id": "orcamento-aprovado",          // kebab-case, único
 *     "titulo": "Orçamento aprovado",      // rótulo curto, visível
 *     "legenda": "O momento em que o serviço vira dinheiro…",
 *     "alt": "Tela do OLLI mostrando o orçamento nº 00126…",
 *     "superficie": "celular",             // "celular" | "computador"
 *     "destaque": true,                    // a tela-herói. no máximo UMA.
 *     "arquivos": [                        // 1× e 2×, em AVIF e WebP
 *       { "arquivo": "orcamento-aprovado@2x.avif", "largura": 786, "altura": 1704 },
 *       { "arquivo": "orcamento-aprovado@2x.webp", "largura": 786, "altura": 1704 },
 *       { "arquivo": "orcamento-aprovado.avif",    "largura": 393, "altura": 852 },
 *       { "arquivo": "orcamento-aprovado.webp",    "largura": 393, "altura": 852 }
 *     ]
 *   }]
 * }
 * ```
 *
 * `arquivo` é NOME, não caminho: o diretório é sempre `/telas/`. Guardar o
 * caminho inteiro em cada entrada convidaria a divergir num deles.
 *
 * ── REGRAS QUE O SCHEMA IMPÕE, E O PORQUÊ DE CADA UMA ──────────────────────
 *
 * • `alt` ≥ 24 caracteres e não pode começar com "screenshot/captura/imagem/
 *   print/foto". Telas reais são CONTEÚDO, não decoração: o `alt` é o que o
 *   leitor de tela e o Google recebem no lugar da imagem, então ele tem que
 *   carregar o ARGUMENTO ("orçamento nº 00126 … com status Aprovado"), não
 *   descrever o arquivo. "screenshot do app" passaria despercebido numa
 *   revisão humana e não informaria ninguém.
 *
 * • Cada tela precisa de AVIF **e** WebP. AVIF está em ~94–95% dos
 *   navegadores; os 5% restantes (iOS 15, WebView antiga) veriam retângulo
 *   quebrado. `<picture>` sem fallback é "erro vira vazio" em forma visual.
 *
 * • `largura`/`altura` por arquivo, obrigatórios. É deles que sai o `srcset`
 *   com descritor `w` (o navegador escolhe 1× ou 2× conforme a tela dele) e a
 *   caixa reservada que impede o salto de layout quando a imagem chega.
 *
 * • no máximo UMA tela com `destaque: true`. Duas heroínas não é ênfase, é
 *   indecisão.
 */

const PREFIXOS_PREGUICOSOS = ["screenshot", "captura", "imagem", "print", "foto"];

const Arquivo = z.object({
	arquivo: z
		.string()
		.regex(
			/^[a-z0-9@.-]+\.(avif|webp)$/,
			"nome de arquivo inválido — esperado algo como `agenda@2x.avif`",
		),
	largura: z.number().int().positive(),
	altura: z.number().int().positive(),
});

const Tela = z
	.object({
		id: z
			.string()
			.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id tem que ser kebab-case minúsculo"),
		titulo: z.string().min(3),
		legenda: z.string().min(8),
		alt: z
			.string()
			.min(24, "alt curto demais — descreva o ARGUMENTO da tela, não o arquivo")
			.refine(
				(v) =>
					!PREFIXOS_PREGUICOSOS.some((p) => v.trim().toLowerCase().startsWith(p)),
				{
					message:
						'alt não pode começar com "screenshot/captura/imagem/print/foto" — ' +
						"descreva o que a tela PROVA",
				},
			),
		superficie: z.enum(["celular", "computador"]),
		destaque: z.boolean(),
		arquivos: z.array(Arquivo).min(2),
	})
	.superRefine((t, ctx) => {
		for (const ext of ["avif", "webp"] as const) {
			if (!t.arquivos.some((a) => a.arquivo.endsWith(`.${ext}`))) {
				ctx.addIssue({
					code: "custom",
					message: `"${t.id}" não tem nenhum arquivo .${ext} — sem os dois formatos, ${
						ext === "webp"
							? "quem não suporta AVIF (iOS 15, WebView antiga) vê imagem quebrada"
							: "perdemos a versão leve para 95% dos visitantes"
					}`,
				});
			}
		}
	});

const Manifesto = z
	.object({
		geradoPor: z.string().min(1),
		telas: z.array(Tela),
	})
	.superRefine((m, ctx) => {
		const destaques = m.telas.filter((t) => t.destaque);
		if (destaques.length > 1) {
			ctx.addIssue({
				code: "custom",
				message: `${destaques.length} telas com destaque: true (${destaques
					.map((t) => t.id)
					.join(", ")}) — só pode haver uma`,
			});
		}
		const vistos = new Set<string>();
		for (const t of m.telas) {
			if (vistos.has(t.id)) {
				ctx.addIssue({ code: "custom", message: `id repetido: "${t.id}"` });
			}
			vistos.add(t.id);
		}
	});

type TelaBruta = z.infer<typeof Tela>;

/** Uma tela já pronta para virar `<picture>`: srcset montado, caixa calculada. */
export interface TelaPronta {
	id: string;
	titulo: string;
	legenda: string;
	alt: string;
	superficie: "celular" | "computador";
	destaque: boolean;
	/** srcset com descritor `w` — o navegador escolhe 1× ou 2× pela tela dele. */
	srcsetAvif: string;
	srcsetWebp: string;
	/** `src` do <img>: o WebP MENOR, que é o fallback de quem não tem AVIF nem srcset. */
	src: string;
	/** Caixa de exibição em CSS px. Declarada para não haver salto de layout. */
	larguraExibida: number;
	alturaExibida: number;
}

export type EstadoTelas =
	| { estado: "ausente"; telas: []; destaque: null }
	| { estado: "pronto"; telas: TelaPronta[]; destaque: TelaPronta | null };

/**
 * Largura de EXIBIÇÃO por superfície; a altura sai da proporção real do arquivo,
 * nunca de palpite. Celular em pé e painel deitado não cabem na mesma largura:
 * forçar isso espremeria o painel até o texto dele virar textura.
 */
const LARGURA_EXIBIDA = { celular: 248, computador: 440 } as const;

/**
 * ⚠️ ONDE FICA O `public/` — e por que NÃO dá para usar `import.meta.url` aqui.
 *
 * Bug MEDIDO, não previsto. A primeira versão deste arquivo usava
 * `new URL("../../public/", import.meta.url)`, que é o que qualquer um escreve.
 * Funciona no editor e some no build: o Vite empacota este módulo no bundle de
 * servidor, e durante `astro build` o `import.meta.url` vale
 *
 *     …/web/dist/.prerender/chunks/index_DF7GFkV2.mjs
 *
 * (impresso, não deduzido). Dois níveis acima é `…/web/dist/public/`, que não
 * existe. Resultado: ENOENT → interpretado como "ainda não geraram" → a seção
 * sumia da landing em silêncio, com o manifesto e as imagens presentes e
 * corretos. É o defeito que este arquivo existe para impedir, entrando pela
 * porta dos fundos: "não achei" virando "não tem".
 *
 * A correção não é só trocar por `process.cwd()`. É ANCORAR E CONFERIR A
 * ÂNCORA: se `public/` não for encontrado, isso não é ausência de capturas — é
 * o cálculo do caminho estar errado, e aí o build morre dizendo onde procurou.
 * Só com um `public/` de verdade na mão é que "telas.json não está lá" passa a
 * significar "ainda não geraram".
 */
function acharRaizPublica(): URL {
	const tentativas = [
		// `astro build`/`astro dev` rodam com cwd na raiz do projeto Astro — é a
		// mesma premissa do astro.config.mjs, que lê src/content/blog daqui.
		pathToFileURL(join(process.cwd(), "public/")),
		// Rede de segurança para quem invocar o build de outro diretório.
		new URL("../../public/", import.meta.url),
	];
	for (const t of tentativas) if (existsSync(fileURLToPath(t))) return t;
	throw new Error(
		"[telas] não encontrei o diretório public/ do site. Isto NÃO é " +
			'"ainda não geraram as capturas" — é o cálculo de caminho deste arquivo ' +
			"estar errado, e tratar como ausência apagaria a seção sem aviso. " +
			"Procurei em:\n" +
			tentativas.map((t) => `  · ${fileURLToPath(t)}`).join("\n"),
	);
}

const RAIZ_PUBLICA = acharRaizPublica();
const DIR_TELAS = new URL("telas/", RAIZ_PUBLICA);
const CAMINHO_MANIFESTO = new URL("telas.json", DIR_TELAS);

function montar(t: TelaBruta): TelaPronta {
	const porExt = (ext: string) =>
		t.arquivos
			.filter((a) => a.arquivo.endsWith(`.${ext}`))
			.sort((a, b) => a.largura - b.largura);
	const avif = porExt("avif");
	const webp = porExt("webp");
	const srcset = (lista: typeof avif) =>
		lista.map((a) => `/telas/${a.arquivo} ${a.largura}w`).join(", ");

	const larguraExibida = LARGURA_EXIBIDA[t.superficie];
	// A proporção vem do MENOR arquivo, que é o mesmo enquadramento do maior —
	// e usar o menor evita depender de o 2× existir.
	const base = webp[0] ?? avif[0];
	return {
		id: t.id,
		titulo: t.titulo,
		legenda: t.legenda,
		alt: t.alt,
		superficie: t.superficie,
		destaque: t.destaque,
		srcsetAvif: srcset(avif),
		srcsetWebp: srcset(webp),
		src: `/telas/${(webp[0] ?? avif[0]).arquivo}`,
		larguraExibida,
		alturaExibida: Math.round((larguraExibida * base.altura) / base.largura),
	};
}

/**
 * Lê e valida o manifesto em tempo de BUILD.
 *
 * Node `fs` e não `import.meta.glob`: os arquivos vivem em `public/`, que o Vite
 * não processa nem indexa. E é build-time de propósito — o site é SSG, então
 * custa uma leitura de arquivo por build e zero bytes no cliente.
 */
export function carregarTelas(): EstadoTelas {
	let bruto: string;
	try {
		bruto = readFileSync(fileURLToPath(CAMINHO_MANIFESTO), "utf8");
	} catch (erro) {
		// ENOENT é o estado legítimo "ainda não geraram as capturas". Qualquer
		// OUTRO erro de leitura (permissão, diretório no lugar do arquivo) é
		// problema real e não pode virar "não tem".
		if ((erro as NodeJS.ErrnoException)?.code === "ENOENT") {
			return { estado: "ausente", telas: [], destaque: null };
		}
		throw new Error(
			`[telas] não consegui LER ${fileURLToPath(CAMINHO_MANIFESTO)} — e não é ` +
				`ausência de arquivo, é falha de leitura: ${(erro as Error).message}`,
		);
	}

	let json: unknown;
	try {
		json = JSON.parse(bruto);
	} catch (erro) {
		throw new Error(
			`[telas] telas.json existe mas não é JSON válido: ${(erro as Error).message}\n` +
				`O arquivo EXISTE, então isto é erro de quem gerou — não vou tratar ` +
				`como "sem telas" e apagar a seção da landing em silêncio.`,
		);
	}

	const r = Manifesto.safeParse(json);
	if (!r.success) {
		const detalhe = r.error.issues
			.map((i) => `  · ${i.path.join(".") || "(raiz)"}: ${i.message}`)
			.join("\n");
		throw new Error(
			`[telas] telas.json não bate com o contrato (web/src/data/telas.ts):\n${detalhe}\n\n` +
				`O build morre aqui de propósito: manifesto quebrado tratado como ` +
				`"sem telas" faria a seção sumir da landing sem ninguém perceber.`,
		);
	}

	// Cada arquivo declarado tem que EXISTIR em disco. Sem esta conferência, um
	// manifesto correto apontando para um .avif que o pipeline não gravou
	// produziria <img> quebrada em produção — o pior dos mundos: ocupa o espaço,
	// não mostra nada e ainda parece descuido.
	const faltando: string[] = [];
	for (const t of r.data.telas) {
		for (const a of t.arquivos) {
			const p = fileURLToPath(new URL(a.arquivo, DIR_TELAS));
			try {
				statSync(p);
			} catch {
				faltando.push(`${t.id} → ${a.arquivo}`);
			}
		}
	}
	if (faltando.length > 0) {
		throw new Error(
			`[telas] o manifesto declara arquivos que não estão em web/public/telas/:\n` +
				faltando.map((f) => `  · ${f}`).join("\n"),
		);
	}

	const prontas = r.data.telas.map(montar);
	// A tela de destaque abre a esteira. Ela é o melhor argumento do produto;
	// deixar que ela caia no meio por acaso da ordem do JSON desperdiça o melhor
	// que temos no lugar onde menos gente olha.
	prontas.sort((a, b) => Number(b.destaque) - Number(a.destaque));

	return {
		estado: "pronto",
		telas: prontas,
		destaque: prontas.find((t) => t.destaque) ?? null,
	};
}
