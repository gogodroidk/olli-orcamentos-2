/**
 * Consultas SQL puras do SQLite local — separadas de `database.ts` para o teste
 * (`scripts/teste-agenda-excecoes.ts`) rodar a MESMA consulta num SQLite de verdade
 * no Node (`node:sqlite`), sem expo-sqlite. Mesmo padrão de `contasAReceberSql.ts`.
 */

/**
 * Busca por nome tem que ser acento-insensível como o `normalizarBusca` do app
 * (JS, Unicode). O `LOWER()` do SQLite só cobre ASCII — "JOSÉ" não casava com
 * "josé" (regressão real ao trocar filter/reduce em JS por SQL). Solução: tirar
 * acento + minúsculo dos DOIS lados — na coluna via REPLACE aninhado (SQL), na
 * query via a mesma tabela (JS) — para o LIKE comparar `jose` com `jose`.
 */
const PARES_ACENTO: [string, string][] = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['Á', 'a'], ['À', 'a'], ['Â', 'a'], ['Ã', 'a'], ['Ä', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'], ['É', 'e'], ['È', 'e'], ['Ê', 'e'], ['Ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'], ['Í', 'i'], ['Ì', 'i'], ['Î', 'i'], ['Ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'], ['Ó', 'o'], ['Ò', 'o'], ['Ô', 'o'], ['Õ', 'o'], ['Ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'], ['Ú', 'u'], ['Ù', 'u'], ['Û', 'u'], ['Ü', 'u'],
  ['ç', 'c'], ['Ç', 'c'], ['ñ', 'n'], ['Ñ', 'n'],
];

/** Expressão SQL "sem acento + minúsculo" de `expr` (REPLACE aninhado sobre LOWER). */
export function semAcentoLowerSql(expr: string): string {
  let s = `LOWER(${expr})`;
  for (const [de, para] of PARES_ACENTO) s = `REPLACE(${s}, '${de}', '${para}')`;
  return s;
}

/** Versão JS equivalente (para o lado da query) — mesmo resultado do REPLACE do SQL. */
export function semAcentoLower(s: string): string {
  let r = s.toLowerCase();
  for (const [de, para] of PARES_ACENTO) r = r.split(de).join(para);
  return r;
}

/** Escapa os curingas do LIKE (%, _, \) para que o texto digitado seja literal. Usar com `ESCAPE '\\'`. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

// ─── Busca do catálogo (serviços / produtos) ──────────────────────────────────

export type TabelaCatalogo = 'servicos' | 'produtos';

/**
 * Busca do catálogo no passo "Itens" do orçamento:
 *  - SEM ACENTO e sem caixa: "eletrica" acha "Instalação Elétrica" (antes era
 *    `nome LIKE ?`, que só ignorava caixa em ASCII e errava todo acento);
 *  - casa no nome OU na descrição;
 *  - ORDENADA POR USO: o que o prestador mais coloca em orçamento vem primeiro (conta
 *    os itens dos orçamentos ATIVOS que apontam para o item pelo `catalogoId` e são
 *    do mesmo tipo); empate → nome. Item nunca usado entra com uso 0, nunca some.
 * Parâmetros: [like, like] — use `paramsBuscaCatalogo(q)`.
 */
export function sqlBuscaCatalogo(tabela: TabelaCatalogo): string {
  const tipo = tabela === 'servicos' ? 'servico' : 'produto';
  return `
SELECT c.*, COALESCE(u.uso, 0) AS uso
  FROM ${tabela} c
  LEFT JOIN (
    SELECT json_extract(i.value, '$.catalogoId') AS catalogo_id, COUNT(*) AS uso
      FROM orcamentos o, json_each(o.data, '$.itens') i
     WHERE json_extract(o.data, '$.excluidoEm') IS NULL
       AND json_extract(i.value, '$.tipo') = '${tipo}'
     GROUP BY catalogo_id
  ) u ON u.catalogo_id = c.id
 WHERE c.excluido_em IS NULL
   AND (${semAcentoLowerSql('c.nome')} LIKE ? ESCAPE '\\'
        OR ${semAcentoLowerSql("COALESCE(c.descricao, '')")} LIKE ? ESCAPE '\\')
 ORDER BY COALESCE(u.uso, 0) DESC, ${semAcentoLowerSql('c.nome')} ASC`;
}

/** Os parâmetros de `sqlBuscaCatalogo` para o texto digitado (vazio = tudo). */
export function paramsBuscaCatalogo(q: string): [string, string] {
  const like = `%${escaparLike(semAcentoLower((q ?? '').trim()))}%`;
  return [like, like];
}

// ─── KPIs do mês de orçamentos ───────────────────────────────────────────────

/**
 * Dia ('YYYY-MM-DD') que coloca o orçamento num MÊS de KPI: o da DECISÃO
 * (`decididoEm`, ISO UTC convertido para o dia LOCAL do aparelho, o mesmo fuso de
 * `dataEmissao`), senão o da emissão, senão o da criação (registros antigos).
 * `date(NULL)` e `date('lixo')` dão NULL, então dado ausente/ilegível cai no próximo.
 */
export const EXPR_DIA_KPI_ORCAMENTO = `substr(COALESCE(
    date(json_extract(data, '$.decididoEm'), 'localtime'),
    json_extract(data, '$.dataEmissao'),
    json_extract(data, '$.criadoEm')
  ), 1, 10)`;

/**
 * Contagem + soma de `valorTotal` dos orçamentos ATIVOS com status em `nStatus`
 * placeholders e dia de KPI em [inicio, fimExclusivo). Parâmetros:
 * [...statuses, inicioYmd, fimExclusivoYmd].
 */
export function sqlAgregadoPorStatusNoPeriodo(nStatus: number): string {
  const placeholders = Array.from({ length: nStatus }, () => '?').join(',');
  return `SELECT COUNT(*) as contagem, COALESCE(SUM(json_extract(data, '$.valorTotal')), 0) as soma
     FROM orcamentos
     WHERE json_extract(data, '$.excluidoEm') IS NULL
       AND json_extract(data, '$.status') IN (${placeholders})
       AND ${EXPR_DIA_KPI_ORCAMENTO} >= ?
       AND ${EXPR_DIA_KPI_ORCAMENTO} < ?`;
}
