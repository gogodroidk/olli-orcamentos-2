/**
 * Cidade do cadastro → texto de busca da coordenada de RESERVA do clima.
 * PURO (nenhum import em tempo de execução): `node scripts/teste-painel-rua.ts`.
 *
 * O clima é por célula de ~5 km (o worker arredonda), então a cidade basta. A
 * consulta inclui "Brasil" para não cair numa homônima de fora.
 */

/** `null` quando o cadastro não tem cidade utilizável (aí o clima diz o porquê). */
export function consultaCidadeClima(cidade: string | null | undefined, estado: string | null | undefined): string | null {
  const c = typeof cidade === 'string' ? cidade.trim().replace(/\s+/g, ' ') : '';
  if (c.length < 2) return null;
  const uf = typeof estado === 'string' ? estado.trim().toUpperCase() : '';
  return uf.length === 2 ? `${c} - ${uf}, Brasil` : `${c}, Brasil`;
}

/** Chave estável do cache: a mesma cidade escrita com outra caixa/espaço não geocodifica de novo. */
export function chaveCidadeClima(consulta: string): string {
  return consulta.trim().toLowerCase().replace(/\s+/g, ' ');
}
