/**
 * Marcos de DECISÃO e de INTERAÇÃO do orçamento (TypeScript puro — sem banco).
 *
 * `decididoEm` e `ultimaInteracaoEm` vivem no blob (`orcamentos.data` no SQLite,
 * `dados` na nuvem): sem coluna e sem migration. Quem grava é `saveOrcamento`
 * (`src/database/database.ts`), que passa TODO save por `carimbarDecisao` — o
 * fluxo manual, o sync do link (cliente aprovou/recusou) e a conversão em OS.
 *
 * Por que existe: o KPI "aprovados no mês" contava pela `dataEmissao`. Um orçamento
 * emitido em 28/09 e aprovado em 03/10 aparecia como venda de SETEMBRO — o mês que
 * já fechou —, e outubro mostrava menos do que vendeu. Com `decididoEm`, o mês do
 * KPI é o da decisão (COALESCE(decididoEm, dataEmissao) — ver `consultasSql.ts`).
 */
import type { Orcamento, StatusOrcamento } from '../types/index.ts';

/** Status em que o cliente JÁ DECIDIU (o "sim" virou recibo/OS em `convertido`). */
export const STATUS_DECIDIDOS: readonly StatusOrcamento[] = ['aprovado', 'recusado', 'convertido'];

export function statusDecidido(status: StatusOrcamento | undefined | null): boolean {
  return !!status && STATUS_DECIDIDOS.includes(status);
}

function isoValido(v: string | undefined): boolean {
  return !!v && Number.isFinite(new Date(v).getTime());
}

/**
 * Devolve `novo` com os marcos coerentes com a transição `anterior → novo`:
 *  - entrou em status decidido (vindo de não decidido, ou nasceu decidido) e não
 *    trouxe `decididoEm` válido → carimba `agora` (quem sabe a hora real — o sync do
 *    link, com `respondido_em` — informa antes e é respeitado);
 *  - `aprovado → convertido` mantém o `decididoEm` da aprovação (a decisão foi lá);
 *    decidido antes deste campo existir continua sem carimbo (KPI usa a emissão);
 *  - VOLTOU para não decidido (reaberto) → `decididoEm` sai: um orçamento em
 *    negociação de novo não pode contar como venda do mês em que foi aprovado antes;
 *  - mudou de status (ou nasceu) → `ultimaInteracaoEm = agora`, salvo se quem chamou
 *    já informou um valor válido mais novo que o anterior; sem troca de status, o
 *    marco anterior é preservado.
 * Puro: não muta os argumentos.
 */
export function carimbarDecisao(anterior: Orcamento | null | undefined, novo: Orcamento, agora: Date): Orcamento {
  const agoraIso = agora.toISOString();
  const out: Orcamento = { ...novo };
  const mudouStatus = !anterior || anterior.status !== novo.status;

  if (statusDecidido(novo.status)) {
    if (!isoValido(out.decididoEm)) {
      if (anterior && statusDecidido(anterior.status)) {
        // JÁ estava decidido (aprovado → convertido, recusado editado): a decisão foi
        // antes. Orçamento antigo, decidido antes deste campo existir, fica SEM
        // carimbo — o KPI cai na `dataEmissao` em vez de virar venda de hoje.
        if (isoValido(anterior.decididoEm)) out.decididoEm = anterior.decididoEm;
        else delete out.decididoEm;
      } else {
        out.decididoEm = agoraIso;
      }
    }
  } else if (out.decididoEm !== undefined) {
    delete out.decididoEm;
  }

  const informado = out.ultimaInteracaoEm;
  const anteriorTs = anterior?.ultimaInteracaoEm;
  if (mudouStatus) {
    const informadoNovo = isoValido(informado) && (!isoValido(anteriorTs) || (informado as string) > (anteriorTs as string));
    if (!informadoNovo) out.ultimaInteracaoEm = agoraIso;
  } else if (!isoValido(informado) && isoValido(anteriorTs)) {
    // Edição sem troca de status vinda de uma tela que não conhece o campo: o marco
    // gravado não pode sumir só porque o objeto em memória não o tinha.
    out.ultimaInteracaoEm = anteriorTs;
  }
  return out;
}
