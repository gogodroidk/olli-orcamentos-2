/**
 * RECURSOS POR PLANO — a camada de APRESENTAÇÃO do comparativo da landing.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * "Que plano libera o quê" NÃO se digita aqui: mora em `src/services/entitlements.ts`,
 * o mesmo módulo que a UI e o worker consultam para decidir acesso. A regra da casa
 * (ver `data/oficios.ts`, escrita depois de 5 incidentes de copy inventada) é copy
 * derivada da FONTE — e feature é copy que, se inventada, vira propaganda enganosa.
 *
 * Então a MATRIZ de ✓/✗ deste comparativo é COMPUTADA de `entitlements` via
 * `temAcessoRecurso` — nunca marcada à mão. O que este arquivo adiciona é só o
 * RÓTULO humano de cada chave técnica (`remove_olli_brand` → "Remove a marca OLLI
 * do PDF"), exatamente como `ICONE_POR_OFICIO` mapeia `VerticalId` → ícone sem
 * recriar a lista de ofícios.
 *
 * ═══ O GUARDA DE EXAUSTIVIDADE ═══
 *
 * `ROTULO_RECURSO` é `Record<Recurso, …>`: se alguém adicionar um recurso em
 * `entitlements.ts` sem dar um rótulo aqui, o build NÃO COMPILA — em vez de a
 * feature nova aparecer no comparativo como uma linha vazia, ou sumir em silêncio.
 * Mesmo truque do `TENANT_DA_TABELA` do painel e do `SLUG_POR_OFICIO`.
 *
 * ═══ "EM BREVE" É VERDADE, NÃO FALTA ═══
 *
 * `entitlements` concede `mapa_equipe` e `dashboard_empresa` ao plano Empresa, mas o
 * produto ainda não os entrega no caminho web/APK (a captura de localização em
 * background depende do prebuild com expo-location — Onda 8; ver o comentário em
 * `pages/index.astro` na seção de planos). Vender "(em breve)" como pronto é o erro
 * que esta landing já cometeu. Por isso esses dois carregam `emBreve: true` e o
 * comparativo os mostra como "Em breve", não como ✓ — três estados, nunca dois.
 */
import {
	IA_USOS_GRATIS_MES,
	RECURSOS_POR_PLANO,
	temAcessoRecurso,
} from "../../../src/services/entitlements";
import type { PlanoId, Recurso } from "../../../src/services/entitlements";

export { IA_USOS_GRATIS_MES };
export type { PlanoId, Recurso };

/** Ordem em que os planos aparecem nas colunas — do menor para o maior. */
export const PLANOS_ORDEM: readonly PlanoId[] = ["gratis", "pro", "empresa"] as const;

/** Nome legível de cada plano, para o cabeçalho da tabela. */
export const NOME_PLANO: Record<PlanoId, string> = {
	gratis: "Grátis",
	pro: "Pro",
	empresa: "Empresa",
};

interface RotuloRecurso {
	/** Como o recurso aparece na linha do comparativo. Deriva a redação dos
	 *  comentários de `entitlements.ts` — não promete nada além do que a fonte diz. */
	titulo: string;
	/**
	 * `true` = o plano CONCEDE o recurso, mas o produto ainda não o entrega hoje.
	 * A célula vira "Em breve" em vez de ✓ (ver o cabeçalho deste arquivo).
	 */
	emBreve?: boolean;
}

/**
 * RÓTULO de cada recurso gateado. `Record<Recurso, …>` de propósito: exaustivo,
 * quebra o build se `entitlements` ganhar um recurso sem rótulo aqui.
 *
 * A ordem das chaves É a ordem das linhas na tabela: recursos do Pro primeiro,
 * recursos de equipe (Empresa) depois. `ia_ilimitada` está aqui pela
 * exaustividade, mas o comparativo a trata numa LINHA PRÓPRIA (a IA do Grátis não
 * é "não tem", é "3 usos/mês" — um terceiro estado que ✓/✗ não expressa).
 */
export const ROTULO_RECURSO: Record<Recurso, RotuloRecurso> = {
	ia_ilimitada: { titulo: "IA sem limite de uso" },
	relatorios: { titulo: "Relatórios de faturamento e conversão" },
	metas: { titulo: "Metas de vendas e acompanhamento" },
	radar_clientes: { titulo: "Radar de clientes sumidos (lista completa)" },
	relatorio_dia: { titulo: "Relatório do dia falado" },
	modelos_pdf_premium: { titulo: "Todos os modelos premium de documento" },
	remove_olli_brand: { titulo: "Remove a marca OLLI do PDF" },
	equipe: { titulo: "Equipe com papéis e permissões" },
	mapa_equipe: { titulo: "Equipe ao vivo no mapa", emBreve: true },
	dashboard_empresa: { titulo: "Painel de gestão da empresa", emBreve: true },
};

/**
 * Recursos LIVRES em qualquer plano — inclusive no Grátis. Não passam pelo mapa de
 * entitlements de propósito (ver o cabeçalho de `entitlements.ts`: "nunca se
 * gateiam"), então são listados aqui como o piso que todo mundo tem. Todos ✓ nas
 * três colunas — o comparativo não pergunta o plano para eles.
 */
export const RECURSOS_BASE: readonly string[] = [
	"Orçamentos, recibos, clientes e agenda ilimitados",
	"Ordem de serviço com checklist, fotos e assinatura na tela",
	"Link do orçamento para o cliente aprovar",
	"Diagnóstico por código de erro (climatização)",
];

/**
 * Recursos que `plano` adiciona sobre `base` (`base = null` → tudo que ele tem),
 * na ordem de `ROTULO_RECURSO`. É a diferença dos conjuntos de `entitlements` —
 * é assim que os bullets do cartão "Tudo do X, mais…" saem da fonte em vez de
 * serem digitados: adicionar um recurso ao Pro em `entitlements` faz a bolinha
 * nova aparecer no cartão do Pro sozinha.
 */
export function recursosAdicionais(plano: PlanoId, base: PlanoId | null): Recurso[] {
	const doPlano = RECURSOS_POR_PLANO[plano];
	const daBase = base ? RECURSOS_POR_PLANO[base] : new Set<Recurso>();
	return (Object.keys(ROTULO_RECURSO) as Recurso[]).filter(
		(r) => doPlano.has(r) && !daBase.has(r),
	);
}

/** Rótulo do recurso para bullet de cartão — com "(em breve)" quando for o caso. */
export function rotuloBullet(r: Recurso): string {
	const { titulo, emBreve } = ROTULO_RECURSO[r];
	return emBreve ? `${titulo} (em breve)` : titulo;
}

/** Estado de uma célula do comparativo — três estados, nunca dois (P0 da casa). */
export type Celula =
	| { tipo: "sim" }
	| { tipo: "nao" }
	| { tipo: "texto"; valor: string };

export interface LinhaComparativo {
	titulo: string;
	celulas: Record<PlanoId, Celula>;
}

/** ✓ para todos — usado nas linhas de recurso base. */
function todosSim(): Record<PlanoId, Celula> {
	return { gratis: { tipo: "sim" }, pro: { tipo: "sim" }, empresa: { tipo: "sim" } };
}

/**
 * As LINHAS do comparativo, derivadas de `entitlements`:
 *  1. os recursos base (todos ✓);
 *  2. a IA, numa linha própria — Grátis mostra a cota (`IA_USOS_GRATIS_MES`),
 *     pagos mostram "Ilimitada";
 *  3. uma linha por recurso gateado (menos `ia_ilimitada`, já coberta na #2),
 *     com ✓/✗/Em breve computado por `temAcessoRecurso`.
 */
export function linhasComparativo(): LinhaComparativo[] {
	const base: LinhaComparativo[] = RECURSOS_BASE.map((titulo) => ({
		titulo,
		celulas: todosSim(),
	}));

	const ia: LinhaComparativo = {
		titulo: "IA de diagnóstico e voz",
		celulas: {
			gratis: { tipo: "texto", valor: `${IA_USOS_GRATIS_MES} usos/mês` },
			pro: { tipo: "texto", valor: "Ilimitada" },
			empresa: { tipo: "texto", valor: "Ilimitada" },
		},
	};

	const recursos = (Object.keys(ROTULO_RECURSO) as Recurso[])
		.filter((r) => r !== "ia_ilimitada")
		.map((r) => {
			const { titulo, emBreve } = ROTULO_RECURSO[r];
			const celulaDe = (plano: PlanoId): Celula => {
				if (!temAcessoRecurso(plano, r)) return { tipo: "nao" };
				return emBreve ? { tipo: "texto", valor: "Em breve" } : { tipo: "sim" };
			};
			return {
				titulo,
				celulas: {
					gratis: celulaDe("gratis"),
					pro: celulaDe("pro"),
					empresa: celulaDe("empresa"),
				},
			};
		});

	return [...base, ia, ...recursos];
}
