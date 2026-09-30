/**
 * Geometria do donut "Orçamentos por status" em SVG puro.
 *
 * Substituiu o ApexCharts em 30/09/2026: a biblioteca inteira (~150 KB gzip)
 * existia para desenhar UM anel. Aqui cada fatia é um `<circle>` com
 * `pathLength=100`, então o traço e o deslocamento são porcentagens diretas —
 * sem trigonometria, sem arco calculado à mão.
 *
 * Módulo puro (sem React, sem import de valor) para o teste da raiz rodar com
 * `node` direto: `scripts/teste-painel-leve.ts`.
 */

/** Folga entre fatias, em % do perímetro. Some quando só há uma fatia. */
export const DONUT_FOLGA = 0.8;

export interface FatiaDonut {
	/** Comprimento visível da fatia (0..100, em % do perímetro). */
	traco: number;
	/** `stroke-dashoffset` que posiciona a fatia depois das anteriores. */
	deslocamento: number;
	/** Porcentagem inteira mostrada ao usuário. */
	pct: number;
}

/**
 * Fatias na MESMA ordem dos grupos. Total zero (ou dado inválido) devolve [] —
 * quem chama mostra o estado vazio, nunca um anel "cheio de nada".
 */
export function fatiasDonut(valores: readonly number[]): FatiaDonut[] {
	const limpos = valores.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
	const total = limpos.reduce((s, v) => s + v, 0);
	if (total <= 0) return [];
	const visiveis = limpos.filter((v) => v > 0).length;
	const folga = visiveis > 1 ? DONUT_FOLGA : 0;
	let acumulado = 0;
	return limpos.map((v) => {
		const fracao = (v / total) * 100;
		// Fatia menor que a folga ainda aparece como um fio (0,4%), não some.
		const traco = v > 0 ? Math.max(fracao - folga, Math.min(fracao, 0.4)) : 0;
		const fatia = { traco, deslocamento: -acumulado, pct: Math.round(fracao) };
		acumulado += fracao;
		return fatia;
	});
}
