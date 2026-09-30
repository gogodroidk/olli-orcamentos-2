export type TabelaDocumentoNumerado = 'orcamentos' | 'recibos';

/** Mesmo parser usado pelos geradores mobile/web: `<seq><aa>` ou `REC-<seq><aa>`. */
export function extrairSequenciaDocumento(numero: unknown): number {
  const bruto = String(numero ?? '').replace(/^REC-/i, '');
  const match = /(\d+)(\d{2})\s*$/.exec(bruto);
  return match ? Number(match[1]) : 0;
}

/**
 * Escolhe um número acima de todos os pisos conhecidos após uma colisão.
 * `piso` inclui contador/última tentativa; `numeros` reúne SQLite + nuvem.
 */
export function numeroDocumentoAposColisao(
  tabela: TabelaDocumentoNumerado,
  numeros: readonly unknown[],
  piso = 0,
  agora = new Date(),
): { numero: string; sequencia: number } {
  const maior = numeros.reduce<number>(
    (max, numero) => Math.max(max, extrairSequenciaDocumento(numero)),
    Math.max(0, Math.floor(Number(piso) || 0)),
  );
  const sequencia = maior + 1;
  const ano = agora.getFullYear().toString().slice(-2);
  const sufixo = `${String(sequencia).padStart(3, '0')}${ano}`;
  return {
    sequencia,
    numero: tabela === 'recibos' ? `REC-${sufixo}` : sufixo,
  };
}

/** Só a constraint de numeração autoriza mudar um número comercial. */
export function erroEhColisaoNumero(tabela: TabelaDocumentoNumerado, erro: unknown): boolean {
  const e = (erro ?? {}) as { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };
  if (String(e.code ?? '') !== '23505') return false;
  const texto = `${e.constraint ?? ''} ${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  const indice = `${tabela}_numero_por_tenant_uidx`;
  // PostgREST normalmente informa o índice. Em versões que omitem constraint e
  // detalhes, 23505 numa destas tabelas (upsert por PK id) só pode vir do número.
  return !texto.trim() || texto.includes(indice) || texto.includes('(user_id, numero)');
}
