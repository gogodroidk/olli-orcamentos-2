import type { OrdemServico, StatusOS } from '../types';

/**
 * Define o marco de conclusão da OS.
 *
 * O marco representa a transição para `concluida`, não a última edição da
 * linha. Assim, checklist, fotos ou observações editados depois não movem a
 * OS de mês nos indicadores. Reabrir a OS limpa o marco; concluí-la de novo
 * cria um novo marco.
 */
export function concluidoEmDaTransicao(
  anterior: Pick<OrdemServico, 'status' | 'concluidoEm'> | undefined,
  proximo: StatusOS,
  agora: string,
): string | undefined {
  if (proximo !== 'concluida') return undefined;
  if (anterior?.status === 'concluida' && anterior.concluidoEm) return anterior.concluidoEm;
  return agora;
}
