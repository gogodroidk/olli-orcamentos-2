/**
 * Cálculo de margem de lucro (preço - custo) / preço, em %. Puramente
 * apresentacional — mesma fórmula usada (sem exportar) na ProdutosScreen
 * mobile — compartilhado aqui entre ProdutosDesktopScreen (coluna "Margem"
 * da tabela) e PainelProduto (banner do formulário) para não duplicar a
 * conta em dois arquivos.
 */
export function margemInfo(preco?: number, custo?: number): { pct: number } | null {
  if (!preco || !custo || custo <= 0) return null;
  return { pct: Math.round(((preco - custo) / preco) * 100) };
}
