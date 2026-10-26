/**
 * "Pagar depois" (P0-08, spec CPO 23/10): a cobrança Pix do plano fica guardada NO APARELHO para a tela de
 * Planos mostrar "Pix aguardando · vale até HH:MM · Ver código" e reabrir o MESMO código, sem gerar outra
 * cobrança. Regra pura (sem React Native): o que vale guardar e o que vale reabrir.
 *
 * O brCode é o código da própria cobrança da pessoa (o mesmo que ela pode copiar na tela); nada de segredo.
 * Guardado com o id da conta: outra conta no mesmo aparelho nunca vê o Pix de ninguém.
 */
import type { CobrancaPixPlano, PlanoPixKey } from '../services/pixPlano';

export const PIX_PENDENTE_VERSAO = 1;
const PLANOS: readonly PlanoPixKey[] = ['pro_mensal', 'pro_anual', 'empresa_mensal', 'empresa_anual'];
/** Some do cartão 1 min antes de vencer: reabrir um código que vence em segundos só frustra. */
const MARGEM_MS = 60_000;

export interface PixPendenteGuardado {
  v: typeof PIX_PENDENTE_VERSAO;
  userId: string;
  cobranca: CobrancaPixPlano;
}

/** O que gravar. Sem validade conhecida não guarda (não dá para dizer "vale até"). */
export function paraGuardar(c: CobrancaPixPlano, userId: string): PixPendenteGuardado | null {
  if (!userId || !c?.id || !c.brCode || !c.expiresAt || Number.isNaN(Date.parse(c.expiresAt))) return null;
  return { v: PIX_PENDENTE_VERSAO, userId, cobranca: c };
}

/** Lê o que foi guardado. Lixo, outra conta ou vencido = null (o chamador apaga). */
export function lerPixPendente(bruto: unknown, userId: string, agora: Date = new Date()): CobrancaPixPlano | null {
  if (!bruto || typeof bruto !== 'object' || !userId) return null;
  const g = bruto as Partial<PixPendenteGuardado>;
  if (g.v !== PIX_PENDENTE_VERSAO || g.userId !== userId) return null;
  const c = g.cobranca as Partial<CobrancaPixPlano> | undefined;
  if (!c || typeof c.id !== 'string' || !c.id || typeof c.brCode !== 'string' || !c.brCode) return null;
  if (typeof c.expiresAt !== 'string') return null;
  const fim = Date.parse(c.expiresAt);
  if (Number.isNaN(fim) || fim - MARGEM_MS <= agora.getTime()) return null;
  const p = c.plano as Partial<CobrancaPixPlano['plano']> | undefined;
  if (!p || !PLANOS.includes(p.id as PlanoPixKey) || typeof p.nome !== 'string' || typeof p.meses !== 'number' || typeof p.valor !== 'number') return null;
  return {
    id: c.id,
    brCode: c.brCode,
    brCodeBase64: typeof c.brCodeBase64 === 'string' ? c.brCodeBase64 : '',
    expiresAt: c.expiresAt,
    plano: { id: p.id as PlanoPixKey, nome: p.nome, meses: p.meses, valor: p.valor },
  };
}
