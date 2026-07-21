/**
 * INDICADOR DE OVERFLOW HORIZONTAL — réplica do padrão do app
 * (`src/components/web/TabelaDados.tsx`): uma sombra fixa na borda direita da
 * tabela, sinal mínimo de que ela rola lateralmente. Em telas estreitas (perto
 * de 1024px, o mínimo do layout desktop) as tabelas do painel costumam exceder
 * a largura visível e rolar sem nenhum aviso de que há mais colunas à direita.
 *
 * Medir o overflow de verdade (largura do conteúdo vs. do viewport) pediria
 * layout assíncrono (ResizeObserver) reagindo a toda mudança de dados/coluna;
 * uma sombra SEMPRE presente já resolve o sinal mínimo, mais simples e sem
 * risco de ficar dessincronizada do scroll — a mesma escolha do app.
 *
 * Uso: dentro de um wrapper `relative` que envolve o `<div className="overflow-x-auto">`
 * da tabela — nunca dentro do próprio scroller (senão a sombra rolaria junto com o
 * conteúdo em vez de ficar fixa na borda). O `Card` pai já tem `overflow-hidden`,
 * então isto nunca vaza para fora do cartão nem quebra o `border-radius` do canto.
 */
export function TableOverflowHint() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-foreground/10 to-transparent"
		/>
	);
}
