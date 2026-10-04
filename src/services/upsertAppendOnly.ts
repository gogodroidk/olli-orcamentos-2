/**
 * Opções do upsert do espelho relacional (cloudSync), com a regra das tabelas
 * APPEND-ONLY. Módulo puro (sem Expo/Supabase) para o teste executar a regra real.
 *
 * `documento_versoes` só tem `select, insert` para `authenticated`
 * (migration 20260911100000_document_library_grants): versão de documento é
 * histórico, nunca é reescrita. Um upsert comum vira `INSERT ... ON CONFLICT DO
 * UPDATE` e o Postgres exige privilégio de UPDATE mesmo quando não há conflito —
 * daí o 42501 em todo push. Com `ignoreDuplicates` o PostgREST gera `ON CONFLICT
 * DO NOTHING`, que só precisa de INSERT: a versão nova entra e a já espelhada fica
 * intacta (o que é exatamente o contrato de append-only).
 *
 * NÃO conceder UPDATE no banco para "consertar" isto: a ausência do grant é a
 * garantia de imutabilidade do histórico.
 *
 * `pmoc_plano_versoes` NÃO entra: `pmoc_plan_versions` tem policy de UPDATE e só
 * congela a versão depois de aprovada (trigger `pmoc_plan_versions_congelada`) —
 * o rascunho precisa continuar sendo atualizado pelo sync.
 */
export const TABELAS_APPEND_ONLY: ReadonlySet<string> = new Set(['documento_versoes']);

export function opcoesUpsert(
  table: string,
  onConflict: string,
): { onConflict: string; ignoreDuplicates?: true } {
  return TABELAS_APPEND_ONLY.has(table) ? { onConflict, ignoreDuplicates: true } : { onConflict };
}
