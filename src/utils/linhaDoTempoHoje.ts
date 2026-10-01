/**
 * LINHA DO TEMPO DO HOJE (Onda 2, item 2.7) — regras PURAS.
 *
 * A tela Hoje mostra as visitas do dia numa linha vertical: o que já foi feito,
 * o que está acontecendo AGORA, a próxima parada e o resto do dia. Aqui mora só
 * a decisão de em que fase cada visita está e o texto do horário — sem banco,
 * sem React Native e com `agora` como parâmetro, para o teste em Node
 * (`scripts/teste-hoje-linha-do-tempo.ts`) travar as regras.
 *
 * Mesma régua do resto do app (`utils/agendaDia.ts`): sem `fim` a visita dura 1h;
 * "em andamento" é `inicio <= agora < fim efetivo`.
 */
import type { Agendamento } from '../types/index.ts';
import { emAndamento, fimEfetivoMs } from './agendaDia.ts';

/**
 * Em que ponto do dia a visita está:
 *  - `feita`      → alguém deu baixa (status concluído);
 *  - `agora`      → em andamento neste instante;
 *  - `sem_baixa`  → o horário já passou e ninguém concluiu nem cancelou;
 *  - `proxima`    → a primeira que ainda vai começar;
 *  - `depois`     → as demais que ainda vão começar (ou com horário ilegível).
 */
export type FaseVisita = 'feita' | 'agora' | 'sem_baixa' | 'proxima' | 'depois';

export interface ItemLinhaDoTempo<T extends Agendamento = Agendamento> {
  visita: T;
  fase: FaseVisita;
}

/** Rótulo curto da fase, exibido ao lado do horário. */
export const ROTULO_FASE: Record<FaseVisita, string> = {
  feita: 'Feita',
  agora: 'Agora',
  sem_baixa: 'Sem baixa',
  proxima: 'Próxima',
  depois: 'Mais tarde',
};

/**
 * Monta a linha do tempo: visitas canceladas ficam de fora, o resto vem em ordem
 * de início, cada uma com a sua fase. Só UMA visita é `proxima` (a primeira que
 * ainda não começou), mesmo havendo outra em andamento — o "agora" é onde o
 * prestador está; a "próxima" é para onde ele vai depois.
 */
export function montarLinhaDoTempo<T extends Agendamento>(
  itens: readonly T[],
  agora: Date = new Date(),
): ItemLinhaDoTempo<T>[] {
  const t = agora.getTime();
  const ordenadas = itens
    .filter((a) => a.status !== 'cancelado' && !a.excluidoEm)
    .slice()
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  let proximaMarcada = false;
  return ordenadas.map((visita) => {
    if (visita.status === 'concluido') return { visita, fase: 'feita' as const };
    if (emAndamento(visita, agora)) return { visita, fase: 'agora' as const };
    const fim = fimEfetivoMs(visita);
    if (fim !== null && fim <= t) return { visita, fase: 'sem_baixa' as const };
    const ini = new Date(visita.inicio).getTime();
    if (!proximaMarcada && Number.isFinite(ini) && ini > t) {
      proximaMarcada = true;
      return { visita, fase: 'proxima' as const };
    }
    return { visita, fase: 'depois' as const };
  });
}

/** Contagem para o cabeçalho da linha do tempo ("2 de 5 feitas"). */
export function resumoDoDia(linha: readonly ItemLinhaDoTempo[]): { total: number; feitas: number; semBaixa: number } {
  let feitas = 0;
  let semBaixa = 0;
  for (const i of linha) {
    if (i.fase === 'feita') feitas++;
    else if (i.fase === 'sem_baixa') semBaixa++;
  }
  return { total: linha.length, feitas, semBaixa };
}

/** Só dá para concluir pelo Hoje o que está acontecendo ou já passou. */
export function podeConcluirPeloHoje(fase: FaseVisita): boolean {
  return fase === 'agora' || fase === 'sem_baixa';
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Abaixo disto a próxima visita mostra contagem ("em 25 min") em vez do relógio. */
export const MINUTOS_CONTAGEM_PROXIMA = 60;

/**
 * Texto de apoio ao horário, derivado SÓ de `inicio`/`fim` (nenhuma estimativa
 * de trânsito — isso é do aviso "saia às", que tem fonte própria):
 *  - agora     → "até 16:00";
 *  - próxima   → "em 25 min" (se faltar menos de 1h) ou "" (o relógio já diz);
 *  - sem baixa → "terminou às 11:00";
 *  - demais    → "".
 */
export function detalheHorario(item: ItemLinhaDoTempo, agora: Date = new Date()): string {
  const { visita, fase } = item;
  const fim = fimEfetivoMs(visita);
  if (fase === 'agora' && fim !== null) return `até ${hhmm(fim)}`;
  if (fase === 'sem_baixa' && fim !== null) return `terminou às ${hhmm(fim)}`;
  if (fase === 'proxima') {
    const ini = new Date(visita.inicio).getTime();
    if (!Number.isFinite(ini)) return '';
    const minutos = Math.ceil((ini - agora.getTime()) / 60000);
    if (minutos > 0 && minutos < MINUTOS_CONTAGEM_PROXIMA) return `em ${minutos} min`;
  }
  return '';
}

/**
 * Como gravar a baixa: visita de série (repetição projetada `<base>@<dia>` ou a
 * linha-base de uma série) muda SÓ esta ocorrência — concluir a série inteira
 * por engano era o bug B12/B18. Visita avulsa muda a própria linha.
 */
export function alcanceDaBaixa(v: Pick<Agendamento, 'recorrencia'> & { ocorrenciaDe?: string }): 'so_esta_da_serie' | 'visita_avulsa' {
  return v.ocorrenciaDe || v.recorrencia ? 'so_esta_da_serie' : 'visita_avulsa';
}
