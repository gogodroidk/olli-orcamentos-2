/**
 * Ciclo comercial (Onda 3) — pagamento e recibo vinculados ao orçamento.
 *
 * Não existe (e não precisa existir) uma tabela "pagamentos" nova: o recibo
 * (`src/database/database.ts` → tabela `recibos`, já schema-less/JSON) É o
 * registro de pagamento. `Recibo.orcamentoId` já faz o vínculo com o
 * orçamento; o campo `Recibo.pdfEmitido` (opcional, aditivo — sem migração)
 * distingue "paguei e registrei" de "já gerei/compartilhei o PDF do recibo".
 *
 * Se no futuro (Onda 9 — Financeiro operacional) for preciso separar
 * pagamentos parciais/parcelas de recibos formais, a tabela dedicada ficaria
 * assim (deixado como referência para a Frente 2/próxima onda, NÃO aplicar
 * agora):
 *
 *   -- supabase/migrations/xxxx_pagamentos.sql (rascunho, não aplicado)
 *   -- create table public.pagamentos (
 *   --   id uuid primary key,
 *   --   orcamento_id uuid references public.orcamentos(id),
 *   --   user_id uuid references auth.users(id),
 *   --   valor numeric not null,
 *   --   forma_pagamento text not null,
 *   --   data_recebimento date not null,
 *   --   recibo_id uuid references public.recibos(id),
 *   --   criado_em timestamptz default now()
 *   -- );
 *
 * Por ora, para o ciclo cliente→orçamento→envio→aprovação→pagamento→recibo
 * fechar sem duplicar dado, tudo deriva de `recibos` + `orcamentos`.
 */
import { Orcamento, Recibo } from '../types';
import { getRecibos, saveRecibo, getNextReciboNumber } from '../database/database';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { Colors } from '../theme';

export type StatusFinanceiro = 'aguardando_pagamento' | 'parcial' | 'pago' | 'recibo_emitido';

export interface BadgeFinanceiro {
  status: StatusFinanceiro;
  label: string;
  color: string;
  icon: 'clock-outline' | 'cash-check' | 'cash-multiple' | 'file-check-outline';
}

/** Recibo (se houver) vinculado a este orçamento — o mais recente primeiro. */
export function getReciboDoOrcamento(orcamentoId: string, recibos: Recibo[]): Recibo | null {
  const doOrc = recibos.filter(r => r.orcamentoId === orcamentoId);
  if (doOrc.length === 0) return null;
  // getRecibos() já vem ordenado por criadoEm desc; por segurança reordenamos aqui também.
  return [...doOrc].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))[0];
}

/** Soma todos os recebimentos vinculados ao orçamento (pagamento parcial incluso). */
export function totalRecebidoDoOrcamento(orcamentoId: string, recibos: Recibo[]): number {
  return recibos
    .filter(r => r.orcamentoId === orcamentoId)
    .reduce((total, r) => total + (Number.isFinite(r.valorRecebido) ? Math.max(0, r.valorRecebido) : 0), 0);
}

/**
 * Deriva o estado financeiro de um orçamento a partir do(s) recibo(s) vinculados.
 * Orçamentos APROVADOS (ou já CONVERTIDOS — status pós-aprovação que marca
 * serviço fechado/recibo emitido) entram no ciclo de cobrança. Depois que um
 * recebimento existe, porém, o histórico financeiro não pode desaparecer só
 * porque alguém mudou o status comercial para recusado/cancelado/expirado:
 * são máquinas independentes. Novos recebimentos continuam bloqueados pela
 * validação de `registrarPagamento` enquanto o comercial não estiver aprovado.
 */
export function getStatusFinanceiro(orcamento: Orcamento, recibos: Recibo[]): StatusFinanceiro | null {
  const vinculados = recibos.filter(r => r.orcamentoId === orcamento.id);
  const comercialRecebivel = orcamento.status === 'aprovado' || orcamento.status === 'convertido';
  if (!comercialRecebivel && vinculados.length === 0) return null;
  const recebido = totalRecebidoDoOrcamento(orcamento.id, recibos);
  if (recebido <= 0 || vinculados.length === 0) return 'aguardando_pagamento';
  const total = Math.max(0, orcamento.valorTotal || 0);
  if (total > 0 && recebido + 0.005 < total) return 'parcial';
  // pdfEmitido ausente = recibo LEGADO (criado antes deste campo existir),
  // que já era o formal/final naquela época — trata como já emitido.
  return vinculados.some(r => r.pdfEmitido !== false) ? 'recibo_emitido' : 'pago';
}

export function getBadgeFinanceiro(status: StatusFinanceiro): BadgeFinanceiro {
  switch (status) {
    case 'recibo_emitido':
      return { status, label: 'Recibo emitido', color: Colors.primary, icon: 'file-check-outline' };
    case 'pago':
      return { status, label: 'Pago', color: Colors.success, icon: 'cash-check' };
    case 'parcial':
      return { status, label: 'Pagamento parcial', color: Colors.warning, icon: 'cash-multiple' };
    case 'aguardando_pagamento':
    default:
      return { status: 'aguardando_pagamento', label: 'Aguardando pagamento', color: Colors.warning, icon: 'clock-outline' };
  }
}

/** Mapa orcamentoId → Recibo mais recente, para telas em lista (evita N buscas). */
export async function mapaRecibosPorOrcamento(): Promise<Map<string, Recibo>> {
  const recibos = await getRecibos();
  const mapa = new Map<string, Recibo>();
  for (const r of recibos) {
    if (!r.orcamentoId) continue;
    const atual = mapa.get(r.orcamentoId);
    if (!atual || (r.criadoEm || '') > (atual.criadoEm || '')) mapa.set(r.orcamentoId, r);
  }
  return mapa;
}

export interface RegistrarPagamentoInput {
  orcamento: Orcamento;
  valorRecebido: number;
  formaPagamento: string;
  dataRecebimento: string; // DD/MM/AAAA, mesmo formato usado em EmitirReciboScreen
}

/**
 * Registra o pagamento de um orçamento aprovado SEM gerar/compartilhar o PDF
 * do recibo ainda — é o botão rápido "Registrar pagamento" da lista de
 * orçamentos. Cria o registro de recibo (fonte da verdade do pagamento) com
 * `pdfEmitido: false`; o usuário emite o PDF formal depois em "Emitir recibo"
 * (EmitirReciboScreen), que reaproveita este MESMO registro em vez de duplicar
 * e marca `pdfEmitido: true` (ver também `marcarReciboComoPdfEmitido`, usado
 * por outros fluxos que só têm o `Recibo` em mãos, sem refazer os campos).
 */
export async function registrarPagamento(input: RegistrarPagamentoInput): Promise<Recibo> {
  const { orcamento, valorRecebido, formaPagamento, dataRecebimento } = input;
  if (orcamento.status !== 'aprovado' && orcamento.status !== 'convertido') {
    throw new Error('Só é possível registrar recebimento de um orçamento aprovado ou convertido.');
  }
  if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) {
    throw new Error('O valor recebido deve ser maior que zero.');
  }
  if (!formaPagamento?.trim() || !dataRecebimento?.trim()) {
    throw new Error('Informe a forma e a data do recebimento.');
  }
  const recebimentos = await getRecibos();
  const saldo = Math.max(0, (orcamento.valorTotal || 0) - totalRecebidoDoOrcamento(orcamento.id, recebimentos));
  if (saldo <= 0 || valorRecebido > saldo + 0.005) {
    throw new Error('O valor informado ultrapassa o saldo restante deste orçamento.');
  }
  const numero = await getNextReciboNumber();
  const recibo: Recibo = {
    id: generateId(),
    numero,
    orcamentoId: orcamento.id,
    orcamentoNumero: orcamento.numero,
    clienteId: orcamento.clienteId,
    clienteNome: orcamento.clienteNome,
    clienteTelefone: orcamento.clienteTelefone,
    itens: orcamento.itens,
    valorRecebido,
    formaPagamento,
    dataRecebimento,
    exibirAssinatura: true,
    criadoEm: nowISO(),
    pdfEmitido: false,
  };
  await saveRecibo(recibo);
  return recibo;
}

/** Marca um recibo já existente como "PDF emitido" (chamado ao gerar/compartilhar o PDF). */
export async function marcarReciboComoPdfEmitido(recibo: Recibo): Promise<Recibo> {
  const atualizado: Recibo = { ...recibo, pdfEmitido: true };
  await saveRecibo(atualizado);
  return atualizado;
}
