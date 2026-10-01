/**
 * AGENDA DO DIA — as regras PURAS que Hoje, Início (Próxima parada), Relatório
 * do dia e o "Bom dia" usam para ler a agenda. Sem banco, sem React Native, sem
 * relógio escondido (`agora` entra como parâmetro): `services/agenda.ts` busca as
 * linhas (já com as séries recorrentes projetadas) e entrega para cá, e os testes
 * em Node (`scripts/teste-agenda-recorrencia-home.ts`) chamam estas funções direto.
 *
 * Por que existe: antes só a tela Agenda projetava as séries recorrentes. Uma
 * manutenção semanal criada no dia 1º aparecia na Agenda nos dias 8, 15, 22…, mas
 * o Hoje dizia "Nada agendado para hoje" e o Início dizia "Nenhuma visita
 * agendada". E a visita em andamento (14h–16h) sumia do Início às 14h01, bem
 * quando o prestador estava no cliente.
 */
import type { Agendamento } from '../types';

const MS_MINUTO = 60 * 1000;
const MS_DIA = 24 * 60 * MS_MINUTO;

/** Sem `fim` gravado, a visita conta como 1h — a MESMA regra do aviso de conflito
 *  de horário (`encontrarConflitoDeHorario`). Nada é gravado com isto. */
export const DURACAO_PADRAO_VISITA_MS = 60 * MS_MINUTO;

/** Janela da Próxima parada: o que está marcado nos próximos 60 dias. */
export const JANELA_PROXIMA_PARADA_DIAS = 60;

/** Até quanto tempo atrás uma visita ainda pode estar "em andamento" (serviço de
 *  vários dias, como obra ou pintura). Só alarga a consulta; quem decide é `fim`. */
export const JANELA_EM_ANDAMENTO_DIAS = 7;

/** Janela das visitas passadas sem baixa: os últimos 60 dias. */
export const JANELA_SEM_BAIXA_DIAS = 60;

type ComHorario = Pick<Agendamento, 'inicio' | 'fim'>;

/** Instante (ms) em que a visita termina: `fim`, ou `inicio` + 1h. `null` se `inicio` for inválido. */
export function fimEfetivoMs(a: ComHorario): number | null {
  const ini = new Date(a.inicio).getTime();
  if (!Number.isFinite(ini)) return null;
  const fim = a.fim ? new Date(a.fim).getTime() : Number.NaN;
  return Number.isFinite(fim) && fim > ini ? fim : ini + DURACAO_PADRAO_VISITA_MS;
}

/** Visita que ainda vale para a rua: não cancelada, não concluída, fora da lixeira. */
export function visitaAtiva(a: Pick<Agendamento, 'status' | 'excluidoEm'>): boolean {
  return a.status === 'agendado' && !a.excluidoEm;
}

/** true quando a visita já começou e ainda não terminou (`inicio` <= agora < fim efetivo). */
export function emAndamento(a: ComHorario, agora: Date = new Date()): boolean {
  const ini = new Date(a.inicio).getTime();
  const fim = fimEfetivoMs(a);
  const t = agora.getTime();
  return fim !== null && ini <= t && t < fim;
}

/**
 * Próxima parada: a primeira visita ativa cujo fim efetivo
 * (COALESCE(fim, inicio + 1h)) ainda não passou. Uma visita em andamento ganha
 * da seguinte porque começou antes. `null` = não há nenhuma na lista recebida.
 */
export function escolherProximaParada<T extends Agendamento>(itens: readonly T[], agora: Date = new Date()): T | null {
  const t = agora.getTime();
  let melhor: T | null = null;
  let melhorInicio = Number.POSITIVE_INFINITY;
  for (const a of itens) {
    if (!visitaAtiva(a)) continue;
    const fim = fimEfetivoMs(a);
    if (fim === null || fim < t) continue;
    const ini = new Date(a.inicio).getTime();
    if (ini < melhorInicio) {
      melhor = a;
      melhorInicio = ini;
    }
  }
  return melhor;
}

/**
 * Visitas que já terminaram nos últimos `dias` e continuam com status
 * "agendado": ninguém concluiu, cancelou nem remarcou. Mais recente primeiro.
 *
 * Séries recorrentes ficam de fora de propósito: hoje o status é da SÉRIE
 * inteira (concluir uma visita conclui todas), então não existe como dar baixa
 * numa repetição só. Contar as repetições passadas criaria um aviso que nunca
 * zera. Elas entram quando cada visita da série tiver o próprio status (exceções
 * por visita, item 2.8 do plano).
 */
export function filtrarVisitasSemBaixa<T extends Agendamento>(
  itens: readonly T[],
  agora: Date = new Date(),
  dias = JANELA_SEM_BAIXA_DIAS,
): T[] {
  const t = agora.getTime();
  const desde = t - dias * MS_DIA;
  return itens
    .filter((a) => {
      if (!visitaAtiva(a) || a.recorrencia) return false;
      if ((a as { ocorrenciaDe?: string }).ocorrenciaDe) return false;
      const ini = new Date(a.inicio).getTime();
      const fim = fimEfetivoMs(a);
      return fim !== null && fim <= t && ini >= desde;
    })
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
}

/** Meia-noite (horário do aparelho) do dia de `dia` e do dia seguinte. */
export function limitesDoDiaLocal(dia: Date): { inicio: Date; fim: Date } {
  return {
    inicio: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0),
    fim: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1, 0, 0, 0, 0),
  };
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function horaMinuto(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Rótulo do horário da Próxima parada: "AGORA · em atendimento" enquanto a
 * visita está acontecendo; senão "Hoje · 14:30", "Amanhã · 09:00" ou
 * "18/06 · 14:30". String vazia se `inicio` for inválido.
 */
export function rotuloQuandoVisita(a: ComHorario, agora: Date = new Date()): string {
  const d = new Date(a.inicio);
  if (Number.isNaN(d.getTime())) return '';
  if (emAndamento(a, agora)) return 'AGORA · em atendimento';
  const hh = horaMinuto(d);
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  if (mesmoDia(d, agora)) return `Hoje · ${hh}`;
  if (mesmoDia(d, amanha)) return `Amanhã · ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${hh}`;
}
