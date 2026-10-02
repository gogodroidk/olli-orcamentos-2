/**
 * BAIXA LEVE DE MATERIAL POR OS (Onda I4) — TypeScript PURO.
 *
 * "Saiu nesta OS": 2 m de cobre, 0,6 kg de R-410A, 1 suporte. Não é estoque
 * (não há saldo nem entrada): é o registro do que foi usado, que vira o custo de
 * material do Lucro Real da Visita (`services/lucroVisita.ts`).
 *
 * Quem usa: o SQLite local (`database.ts`, coluna TEXT JSON `materiais`), o sync
 * (`cloudSync.ts`, coluna jsonb `materiais` da migration 20261003104000) e a tela
 * da OS. Sem React, sem rede, sem relógio: `scripts/teste-lucro-visita.ts` roda
 * em Node.
 *
 * ─── TRÊS ESTADOS ──────────────────────────────────────────────────────────
 *   undefined → não informado (o lucro pede a baixa, nunca supõe "sem material")
 *   []        → "não usei material" — afirmação do técnico
 *   [itens]   → o que saiu
 */
import type { MaterialUsado } from '../types/index.ts';

/** Quantidade/custo válidos: número finito e não negativo. */
function numeroValido(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Normaliza a lista vinda do banco/nuvem. `null`/ausente/ilegível → `undefined`
 * (não informado). Item sem nome ou sem quantidade positiva é descartado.
 */
export function lerMateriais(bruto: unknown): MaterialUsado[] | undefined {
  let v = bruto;
  if (typeof v === 'string') {
    if (!v.trim()) return undefined;
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(v)) return undefined;
  const lista: MaterialUsado[] = [];
  for (const x of v) {
    const o = x as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') continue;
    const nome = typeof o.nome === 'string' ? o.nome.trim() : '';
    const quantidade = numeroValido(o.quantidade);
    if (!nome || !quantidade) continue;
    const item: MaterialUsado = {
      id: typeof o.id === 'string' && o.id ? o.id : `${nome}-${lista.length}`,
      nome,
      quantidade,
      unidade: typeof o.unidade === 'string' && o.unidade.trim() ? o.unidade.trim() : 'un',
    };
    const custo = numeroValido(o.custoUnitario);
    if (custo !== undefined) item.custoUnitario = custo;
    if (typeof o.produtoId === 'string' && o.produtoId) item.produtoId = o.produtoId;
    lista.push(item);
  }
  return lista;
}

/** Para a coluna TEXT do SQLite: `null` = não informado; '[]' = sem material. */
export function materiaisParaTexto(m: MaterialUsado[] | undefined): string | null {
  return Array.isArray(m) ? JSON.stringify(m) : null;
}

/** Atalhos de gás por ofício (refrigeração): só o NOME e a unidade — o custo é do prestador. */
export const GASES_REFRIGERACAO: readonly { nome: string; unidade: string }[] = [
  { nome: 'Gás R-410A', unidade: 'kg' },
  { nome: 'Gás R-32', unidade: 'kg' },
  { nome: 'Gás R-22', unidade: 'kg' },
];

/** "0,6 kg de Gás R-410A" — texto curto do item. */
export function textoMaterial(m: Pick<MaterialUsado, 'nome' | 'quantidade' | 'unidade'>): string {
  const q = Number.isInteger(m.quantidade) ? String(m.quantidade) : String(m.quantidade).replace('.', ',');
  return `${q} ${m.unidade} de ${m.nome}`;
}
