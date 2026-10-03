/**
 * Remarcar UMA visita para outro dia/hora (o "Remarcar e avisar" da chuva).
 *
 * Visita de série muda só ESTA ocorrência — `editarRecorrente(id, 'so_esta')`
 * grava a exceção da série; as outras repetições continuam onde estavam. Visita
 * avulsa muda a própria linha. A duração é mantida (`planoRemarcarVisita`).
 *
 * LANÇA quando não consegue gravar (visita sumiu do aparelho, foi para a
 * Lixeira, erro de banco): a tela mostra o erro e nada é dado como remarcado.
 */
import { editarRecorrente, getAgendamento, saveAgendamento } from './agenda';
import { planoRemarcarVisita } from '../utils/climaNaAgenda';
import { idBaseDaOcorrencia, type OcorrenciaAgendamento } from '../utils/contratoRecorrente';
import type { Agendamento } from '../types';
import { nowISO } from '../utils/date';

export interface ResultadoRemarcar {
  /** A linha como estava (série: a base inteira) — o "Desfazer" grava isto de volta. */
  antes: Agendamento;
  /** A linha gravada. */
  depois: Agendamento;
}

export async function remarcarVisita(v: OcorrenciaAgendamento, novoInicio: Date): Promise<ResultadoRemarcar> {
  const plano = planoRemarcarVisita(v, novoInicio);
  if (!plano) throw new Error('Escolha um dia e um horário válidos.');
  const antes = await getAgendamento(idBaseDaOcorrencia(v.id));
  if (!antes || antes.excluidoEm) throw new Error('Esta visita não está mais na sua agenda.');
  if (plano.modo === 'so_esta_da_serie') {
    const r = await editarRecorrente(v.id, 'so_esta', plano.fim ? { inicio: plano.inicio, fim: plano.fim } : { inicio: plano.inicio });
    return { antes, depois: r.base };
  }
  const depois: Agendamento = { ...antes, inicio: plano.inicio, fim: plano.fim, atualizadoEm: nowISO() };
  await saveAgendamento(depois);
  return { antes, depois };
}

/** "Desfazer": grava a linha como estava (nuvem e lembretes pelo caminho normal). */
export async function desfazerRemarcacao(antes: Agendamento): Promise<void> {
  await saveAgendamento({ ...antes, excluidoEm: undefined, atualizadoEm: nowISO() });
}
