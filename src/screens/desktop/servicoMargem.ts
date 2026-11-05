/**
 * Regras de apresentação do catálogo de SERVIÇOS, puras (sem React).
 *
 * A conta da margem é a mesma do painel web (`margemInfo` em
 * `webapp/src/pages/olli/catalogo/FormItemCatalogo.tsx`): (preço − custo) / preço.
 * Trocar por markup daria outro número na mesma tela do mesmo dono.
 *
 * Preço abaixo do custo NÃO é "lucro negativo". Sem custo, a margem é
 * desconhecida — escrever 0% mentiria.
 */
export interface ServicoBuscavel {
  nome: string;
  descricao?: string | null;
}

/** Mesma normalização da busca do painel: sem acento, caixa, hífen ou espaço. */
export function normalizarBuscaServico(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-/.\s]+/g, '')
    .toLowerCase();
}

export function filtrarServicos<T extends ServicoBuscavel>(itens: readonly T[], consulta: string): T[] {
  const termo = normalizarBuscaServico(consulta);
  if (!termo) return itens.slice();
  return itens.filter((item) =>
    normalizarBuscaServico(item.nome).includes(termo) ||
    normalizarBuscaServico(item.descricao ?? '').includes(termo),
  );
}

/**
 * Margem sobre o PREÇO. `null` quando não dá para calcular (sem custo, custo
 * ≤ 0, ou preço 0 — divisão por zero). Percentual negativo = preço abaixo do custo.
 */
export function margemInfo(preco?: number, custo?: number): { pct: number; lucro: number } | null {
  if (!preco || !custo || custo <= 0) return null;
  const lucro = Math.round((preco - custo) * 100) / 100;
  return { pct: Math.round(((preco - custo) / preco) * 100), lucro };
}

/** Preço abaixo do custo — inclui preço 0, que `margemInfo` não cobre. */
export function abaixoDoCusto(preco?: number, custo?: number): boolean {
  return !!custo && custo > 0 && (preco ?? 0) < custo;
}

export interface SeloMargem {
  tom: 'lucro' | 'prejuizo';
  /** Texto curto da lista. Prejuízo nunca diz "lucro". */
  texto: string;
}

export function seloMargem(preco?: number, custo?: number): SeloMargem | null {
  if (abaixoDoCusto(preco, custo)) {
    const info = margemInfo(preco, custo);
    return { tom: 'prejuizo', texto: info ? `prejuízo ${Math.abs(info.pct)}%` : 'prejuízo' };
  }
  const info = margemInfo(preco, custo);
  if (!info) return null;
  return { tom: 'lucro', texto: `lucro ${info.pct}%` };
}

export interface TextoListaServicos {
  estado: 'lista' | 'vazio' | 'sem-resultado';
  titulo: string;
  subtitulo: string;
}

/**
 * Catálogo vazio e busca sem match são estados diferentes. Dizer "cadastre um
 * serviço" quando o filtro não achou nada faz o dono achar que perdeu o preço
 * e recadastrar por cima.
 */
export function textoListaServicos(total: number, visiveis: number, consulta: string): TextoListaServicos {
  if (visiveis > 0) {
    return { estado: 'lista', titulo: '', subtitulo: '' };
  }
  if (normalizarBuscaServico(consulta).length > 0 && total > 0) {
    return {
      estado: 'sem-resultado',
      titulo: 'Nada encontrado',
      subtitulo: 'Nenhum serviço com esse nome ou descrição. Tente outro termo ou limpe a busca.',
    };
  }
  return {
    estado: 'vazio',
    titulo: 'Nenhum serviço',
    subtitulo: 'Cadastre seus serviços para montar orçamentos em segundos.',
  };
}

/**
 * Excluir serviço é soft delete (lixeira, restaurável). Dizer que não pode ser
 * desfeito é falso. Orçamentos já emitidos guardam o preço do dia.
 */
export function mensagemExcluirServico(nome: string): string {
  const titulo = nome.trim() || '(sem nome)';
  return `"${titulo}" vai para a lixeira. Dá para restaurar depois. Orçamentos já feitos não mudam: eles guardam o preço do dia.`;
}
