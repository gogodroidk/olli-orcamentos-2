/**
 * Substitui o `mergeDeepRight` do ramda.
 *
 * O ramda inteiro entrava no bundle por causa de QUATRO funções (`clone`, `concat`,
 * `chain` e este merge) — três delas tinham equivalente nativo de uma linha. Trocar
 * as quatro tira a biblioteca do painel sem mudar comportamento.
 *
 * A semântica é a MESMA do ramda, e a parte que importa é a dos arrays: só objeto
 * simples é mesclado recursivamente; array (e qualquer outro valor) é SUBSTITUÍDO
 * pelo da direita. É disso que as opções do ApexCharts dependem — `colors: [...]`
 * ou `labels: [...]` vindos do card precisam trocar a lista base inteira, não
 * grudar item a item nela.
 */

const ehObjetoSimples = (v: unknown): v is Record<string, unknown> =>
	Object.prototype.toString.call(v) === "[object Object]";

function mesclar(esquerda: Record<string, unknown>, direita: Record<string, unknown>): Record<string, unknown> {
	const saida: Record<string, unknown> = { ...esquerda };
	for (const chave of Object.keys(direita)) {
		const valorEsq = esquerda[chave];
		const valorDir = direita[chave];
		saida[chave] =
			ehObjetoSimples(valorEsq) && ehObjetoSimples(valorDir) ? mesclar(valorEsq, valorDir) : valorDir;
	}
	return saida;
}

export function mesclarProfundo<E extends object, D extends object>(esquerda: E, direita: D): E & D {
	return mesclar(esquerda as Record<string, unknown>, direita as Record<string, unknown>) as E & D;
}
