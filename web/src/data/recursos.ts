/**
 * RECURSOS POR PLANO — a camada de APRESENTAÇÃO do comparativo da landing.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * "Que plano libera o quê" NÃO se digita aqui: mora em `src/services/entitlements.ts`,
 * o mesmo módulo que a UI e o worker consultam para decidir acesso. E o RÓTULO de cada
 * recurso também não: desde 01/10/2026 (Grátis ilimitado) ele vem da tabela única
 * `src/services/planosBase.ts` — a mesma do app, do painel e dos e-mails. A regra da
 * casa (ver `data/oficios.ts`, escrita depois de 5 incidentes de copy inventada) é copy
 * derivada da FONTE — e feature é copy que, se inventada, vira propaganda enganosa.
 *
 * Então a MATRIZ de ✓/✗ deste comparativo é COMPUTADA de `entitlements` via
 * `temAcessoRecurso`, o rótulo vem de `planosBase` e o "Em breve" de `RECURSOS_EM_BREVE`.
 *
 * ═══ "EM BREVE" É VERDADE, NÃO FALTA ═══
 *
 * `entitlements` concede recursos que o produto ainda não entrega (hoje `mapa_equipe` e
 * `dashboard_empresa` — a lista viva é `RECURSOS_EM_BREVE`). Vender "(em breve)" como
 * pronto é o erro que esta landing já cometeu. Por isso o comparativo os mostra como
 * "Em breve", não como ✓ — três estados, nunca dois.
 */
import {
	IA_USOS_GRATIS_MES,
	RECURSOS_EM_BREVE,
	RECURSOS_EM_ORDEM,
	temAcessoRecurso,
} from "../../../src/services/entitlements";
import type { PlanoId, Recurso } from "../../../src/services/entitlements";
import {
	FRASE_GRATIS,
	NOME_PLANO,
	NOTA_SELO_GRATIS,
	planoBase,
	RECURSOS_GRATIS,
	ROTULO_RECURSO as ROTULO_FONTE,
	TEXTO_SELO_OLLI,
} from "../../../src/services/planosBase";

export { FRASE_GRATIS, IA_USOS_GRATIS_MES, NOME_PLANO, NOTA_SELO_GRATIS, planoBase, TEXTO_SELO_OLLI };
export type { PlanoId, Recurso };

/** Ordem em que os planos aparecem nas colunas — do menor para o maior. */
export const PLANOS_ORDEM: readonly PlanoId[] = ["gratis", "pro", "empresa"] as const;

interface RotuloRecurso {
	/** Como o recurso aparece na linha do comparativo (da tabela única). */
	titulo: string;
	/** `true` = o plano CONCEDE o recurso, mas o produto ainda não o entrega hoje. */
	emBreve?: boolean;
}

/**
 * RÓTULO de cada recurso gateado, na ORDEM de `RECURSOS_EM_ORDEM` (Pro primeiro,
 * depois os do Empresa). `Record<Recurso, …>`: exaustivo — um recurso novo em
 * `entitlements` sem rótulo em `planosBase` quebra o build.
 */
export const ROTULO_RECURSO: Record<Recurso, RotuloRecurso> = Object.fromEntries(
	RECURSOS_EM_ORDEM.map((r) => [
		r,
		{ titulo: ROTULO_FONTE[r].titulo, ...(RECURSOS_EM_BREVE.has(r) ? { emBreve: true } : {}) },
	]),
) as Record<Recurso, RotuloRecurso>;

/**
 * Recursos LIVRES em qualquer plano — a alma do Grátis, da tabela única. A linha de IA
 * sai daqui porque o comparativo a mostra numa linha própria (a IA do Grátis não é
 * "tem", é "3 usos/mês" — um terceiro estado que ✓/✗ não expressa).
 */
export const RECURSOS_BASE: readonly string[] = RECURSOS_GRATIS.filter((t) => !/^IA\b/.test(t));

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
 * As LINHAS do comparativo, derivadas de `entitlements` + `planosBase`:
 *  1. os recursos base (todos ✓) — o primeiro é "Orçamentos ilimitados";
 *  2. a IA, numa linha própria — Grátis mostra a cota (`IA_USOS_GRATIS_MES`),
 *     pagos mostram "Uso justo diário" (NÃO "Ilimitada": o worker aplica cota
 *     diária aos pagos, e os Termos §4 dizem "uso justo diário");
 *  3. uma linha por recurso gateado (menos `ia_ilimitada`, já coberta na #2),
 *     com ✓/✗/Em breve computado por `temAcessoRecurso`. A do selo ("Sem o selo
 *     Feito com OLLI…") é ✗ no Grátis — é o "preço" honesto do Grátis ilimitado.
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
			pro: { tipo: "texto", valor: "Uso justo diário" },
			empresa: { tipo: "texto", valor: "Uso justo diário" },
		},
	};

	const recursos = RECURSOS_EM_ORDEM.filter((r) => r !== "ia_ilimitada").map((r) => {
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
