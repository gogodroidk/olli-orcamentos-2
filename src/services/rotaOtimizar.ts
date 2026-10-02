/**
 * ORDENAR A ROTA DO DIA no aparelho — vizinho mais próximo + 2-opt, respeitando
 * os horários fixos. Jogada 3 do plano "OLLI Inteligente" (Onda I2), versão GRÁTIS.
 *
 * Sem Routes API, sem matriz paga: o custo de cada trecho é a estimativa de
 * `etaEstimado.ts` (linha reta × 1,4 ÷ velocidade urbana do horário). Por isso o
 * resultado é sempre "ordem estimada pela distância (sem trânsito)" — a tela diz.
 *
 * Arquivo PURO (só importa `etaEstimado.ts`, que também é puro): o `node` roda o
 * comportamento real em `scripts/teste-rota-otimizar.ts`.
 *
 * ─── O MODELO (simples de explicar, difícil de surpreender) ────────────────
 * O dia tem HORÁRIOS (os inícios que já estão na agenda, em ordem). Ordenar a rota
 * troca QUEM vai em cada horário — "às 14h vai o João, às 15h a Maria" —, não a
 * forma do dia. Assim o prestador não descobre que o almoço sumiu.
 *  - Parada FIXA (horário combinado com o cliente, visita que já começou) não sai
 *    do lugar nem do horário.
 *  - Parada LIVRE ocupa o horário da posição dela; se a viagem anterior não deixa
 *    chegar a tempo, o início é empurrado para o próximo múltiplo de `passoMin`.
 *  - Uma ordem em que alguma parada FIXA ficaria atrasada é INVIÁVEL e nunca é
 *    sugerida. Visitas sem coordenada não entram na conta, mas os horários delas
 *    viram BLOQUEIOS: uma parada livre não é empurrada para cima de uma delas.
 *
 * ─── A BUSCA ───────────────────────────────────────────────────────────────
 *  1. Vizinho mais próximo: posição a posição, a parada fixa daquela posição ou a
 *     livre mais perta de onde ele está. Sem ponto de partida (sem base
 *     cadastrada), testa cada livre como primeira e fica com a melhor.
 *  2. 2-opt: inverte trechos que só têm paradas livres enquanto a viagem total
 *     diminuir e a ordem continuar viável.
 *  3. Só sugere trocar se o ganho passar de `GANHO_MINIMO_MIN` — 2 minutos de
 *     "economia" estimada não valem avisar cliente nenhum.
 *
 * ─── ERRO NÃO VIRA VAZIO ───────────────────────────────────────────────────
 * Menos de 2 paradas livres com coordenada não é "rota já ótima": é
 * `{ ok:false, motivo:'poucas_paradas' }`, e a tela diz por quê.
 */
import { estimarParaChegar, estimarViagem, pontoValido, type Ponto } from './etaEstimado.ts';

const MS_MIN = 60_000;

export interface ParadaRota {
  id: string;
  ponto: Ponto;
  /** Início marcado hoje (ms). */
  inicioMs: number;
  /** Duração do serviço (min). */
  duracaoMin: number;
  /** `true` = horário combinado: não muda de posição nem de horário. */
  fixa: boolean;
}

export interface IntervaloMs {
  inicioMs: number;
  fimMs: number;
}

export interface OpcoesRota {
  /** De onde ele sai (base cadastrada). Sem ela, a conta começa na 1ª parada. */
  origem?: Ponto | null;
  /** Grade dos horários empurrados (min). Padrão 5. */
  passoMin?: number;
  /** Visitas que não entram na rota (sem coordenada) mas ocupam a agenda. */
  bloqueios?: readonly IntervaloMs[];
  /** Ganho mínimo (min) para sugerir trocar. Padrão `GANHO_MINIMO_MIN`. */
  ganhoMinimoMin?: number;
}

export const GANHO_MINIMO_MIN = 5;

export interface Totais {
  /** Minutos de viagem estimados (soma dos trechos, inclui o da base quando há). */
  minutos: number;
  /** Km de rua estimados. */
  km: number;
  /** Fim estimado do dia (ms) — fim do último serviço. */
  fimMs: number;
}

export interface Mudanca {
  id: string;
  deMs: number;
  paraMs: number;
}

export type ResultadoRota =
  | { ok: false; motivo: 'poucas_paradas' | 'ordem_atual_inviavel' }
  | {
      ok: true;
      /** Ids na ordem sugerida (igual à atual quando `melhorou` é false). */
      ordem: string[];
      /** Início sugerido de cada parada (ms). */
      inicios: Record<string, number>;
      atual: Totais;
      sugerida: Totais;
      /** Economia estimada (>= 0). */
      ganhoMin: number;
      ganhoKm: number;
      /** `true` = vale sugerir (ganho >= mínimo e alguma parada muda). */
      melhorou: boolean;
      /** Paradas cujo horário muda (para "Aplicar e avisar quem mudou"). */
      mudancas: Mudanca[];
    };

interface Agenda {
  viavel: boolean;
  inicios: number[];
  minutos: number;
  km: number;
  fimMs: number;
}

function arredondarParaCima(ms: number, passoMin: number): number {
  const passo = passoMin * MS_MIN;
  return Math.ceil(ms / passo) * passo;
}

/** Empurra `inicio` para depois de qualquer bloqueio que a visita encostaria. */
function desviarBloqueios(inicio: number, duracaoMs: number, bloqueios: readonly IntervaloMs[], passoMin: number): number {
  let ini = inicio;
  for (let volta = 0; volta < bloqueios.length + 1; volta++) {
    const choque = bloqueios.find((b) => ini < b.fimMs && ini + duracaoMs > b.inicioMs);
    if (!choque) break;
    ini = arredondarParaCima(choque.fimMs, passoMin);
  }
  return ini;
}

/**
 * Monta o dia para uma sequência: viagem, inícios e se é viável. `slots` são os
 * horários do dia em ordem (os inícios atuais ordenados).
 */
function agendar(seq: readonly ParadaRota[], slots: readonly number[], o: Required<Pick<OpcoesRota, 'passoMin' | 'bloqueios'>> & { origem: Ponto | null }): Agenda {
  let minutos = 0;
  let km = 0;
  let livreEm = -Infinity; // fim do serviço anterior
  let anterior: Ponto | null = o.origem;
  const inicios: number[] = [];
  for (let i = 0; i < seq.length; i++) {
    const p = seq[i];
    const slot = slots[i];
    let chegada = -Infinity;
    if (anterior) {
      // Primeiro trecho (da base): sai a tempo de chegar no horário. Os demais
      // saem quando o serviço anterior termina.
      const est = Number.isFinite(livreEm)
        ? estimarViagem(anterior, p.ponto, livreEm)
        : estimarParaChegar(anterior, p.ponto, p.fixa ? p.inicioMs : slot);
      if (!est) return { viavel: false, inicios, minutos, km, fimMs: livreEm };
      minutos += est.minutos;
      km += est.distanciaKm;
      if (Number.isFinite(livreEm)) chegada = livreEm + est.minutos * MS_MIN;
    }
    const durMs = Math.max(0, p.duracaoMin) * MS_MIN;
    let inicio: number;
    if (p.fixa) {
      inicio = p.inicioMs;
      if (chegada > inicio) return { viavel: false, inicios, minutos, km, fimMs: livreEm };
    } else {
      inicio = Math.max(slot, Number.isFinite(chegada) ? arredondarParaCima(chegada, o.passoMin) : slot);
      inicio = desviarBloqueios(inicio, durMs, o.bloqueios, o.passoMin);
    }
    inicios.push(inicio);
    livreEm = inicio + durMs;
    anterior = p.ponto;
  }
  return { viavel: true, inicios, minutos, km: Math.round(km * 10) / 10, fimMs: livreEm };
}

/** A viagem de uma ordem com os horários que ela já tem (nada é empurrado). Também serve o resumo do Mapa. */
export function totaisDaRota(seq: readonly ParadaRota[], origem: Ponto | null): Totais {
  let minutos = 0;
  let km = 0;
  let anterior: Ponto | null = origem;
  let fimMs = -Infinity;
  for (let i = 0; i < seq.length; i++) {
    const p = seq[i];
    if (anterior) {
      const est = i === 0 ? estimarParaChegar(anterior, p.ponto, p.inicioMs) : estimarViagem(anterior, p.ponto, fimMs);
      if (est) {
        minutos += est.minutos;
        km += est.distanciaKm;
      }
    }
    fimMs = p.inicioMs + Math.max(0, p.duracaoMin) * MS_MIN;
    anterior = p.ponto;
  }
  return { minutos, km: Math.round(km * 10) / 10, fimMs };
}

function distKm(a: Ponto, b: Ponto): number {
  // O vizinho mais próximo só precisa comparar; a hora não muda a ordem de quem está mais perto.
  return estimarViagem(a, b, 0)?.distanciaKm ?? Infinity;
}

/** Vizinho mais próximo respeitando as posições fixas. */
function vizinhoMaisProximo(base: readonly ParadaRota[], primeira: ParadaRota | null, origem: Ponto | null): ParadaRota[] {
  const livres = base.filter((p) => !p.fixa);
  const usadas = new Set<string>();
  const seq: ParadaRota[] = [];
  let aqui: Ponto | null = origem;
  for (let pos = 0; pos < base.length; pos++) {
    const fixa = base[pos].fixa ? base[pos] : null;
    let escolhida: ParadaRota | null = fixa;
    if (!escolhida) {
      if (pos === 0 && primeira) {
        escolhida = primeira;
      } else {
        let melhor = Infinity;
        for (const l of livres) {
          if (usadas.has(l.id)) continue;
          const d = aqui ? distKm(aqui, l.ponto) : 0;
          if (d < melhor) {
            melhor = d;
            escolhida = l;
          }
        }
      }
    }
    if (!escolhida) break;
    usadas.add(escolhida.id);
    seq.push(escolhida);
    aqui = escolhida.ponto;
  }
  return seq;
}

/** 2-opt só sobre trechos de paradas livres, aceitando apenas ordens viáveis que encurtam a viagem. */
function doisOpt(
  inicial: ParadaRota[],
  slots: readonly number[],
  o: Required<Pick<OpcoesRota, 'passoMin' | 'bloqueios'>> & { origem: Ponto | null },
): { seq: ParadaRota[]; agenda: Agenda } {
  let seq = inicial;
  let agenda = agendar(seq, slots, o);
  let melhorou = true;
  let voltas = 0;
  while (melhorou && voltas < 60) {
    melhorou = false;
    voltas++;
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i].fixa) continue;
      for (let j = i + 1; j < seq.length; j++) {
        if (seq[j].fixa) break; // o trecho não pode atravessar uma fixa
        const nova = [...seq.slice(0, i), ...seq.slice(i, j + 1).reverse(), ...seq.slice(j + 1)];
        const ag = agendar(nova, slots, o);
        const melhor = ag.viavel && (!agenda.viavel || ag.minutos < agenda.minutos - 0.5);
        if (melhor) {
          seq = nova;
          agenda = ag;
          melhorou = true;
        }
      }
    }
  }
  return { seq, agenda };
}

/**
 * Ordena a rota do dia. `paradas` são as visitas COM coordenada que podem entrar
 * na rota (quem chama tira as sem ponto e passa os horários delas em `bloqueios`).
 */
export function otimizarRota(paradas: readonly ParadaRota[], opcoes: OpcoesRota = {}): ResultadoRota {
  const validas = paradas.filter((p) => pontoValido(p.ponto) && Number.isFinite(p.inicioMs));
  const base = [...validas].sort((a, b) => a.inicioMs - b.inicioMs);
  const livres = base.filter((p) => !p.fixa);
  if (livres.length < 2) return { ok: false, motivo: 'poucas_paradas' };

  const origem = pontoValido(opcoes.origem) ? opcoes.origem : null;
  const o = {
    origem,
    passoMin: opcoes.passoMin && opcoes.passoMin > 0 ? opcoes.passoMin : 5,
    bloqueios: opcoes.bloqueios ?? [],
  };
  const slots = base.map((p) => p.inicioMs);
  const ganhoMinimo = opcoes.ganhoMinimoMin ?? GANHO_MINIMO_MIN;

  const atual = totaisDaRota(base, origem);
  const agendaAtual = agendar(base, slots, o);

  // Sem origem, qualquer livre pode abrir o dia: testa cada uma (n é pequeno).
  const candidatas = origem || base[0].fixa ? [null] : livres;
  let melhorSeq: ParadaRota[] | null = null;
  let melhorAgenda: Agenda | null = null;
  for (const primeira of candidatas) {
    const nn = vizinhoMaisProximo(base, primeira, origem);
    if (nn.length !== base.length) continue;
    const { seq, agenda } = doisOpt(nn, slots, o);
    if (!agenda.viavel) continue;
    if (!melhorAgenda || agenda.minutos < melhorAgenda.minutos) {
      melhorSeq = seq;
      melhorAgenda = agenda;
    }
  }

  const iniciosAtuais: Record<string, number> = {};
  for (const p of base) iniciosAtuais[p.id] = p.inicioMs;

  if (!melhorSeq || !melhorAgenda) {
    // Nenhuma ordem viável encontrada: se nem a atual fecha, a tela precisa dizer.
    if (!agendaAtual.viavel) return { ok: false, motivo: 'ordem_atual_inviavel' };
    return {
      ok: true,
      ordem: base.map((p) => p.id),
      inicios: iniciosAtuais,
      atual,
      sugerida: atual,
      ganhoMin: 0,
      ganhoKm: 0,
      melhorou: false,
      mudancas: [],
    };
  }

  const inicios: Record<string, number> = {};
  melhorSeq.forEach((p, i) => { inicios[p.id] = melhorAgenda!.inicios[i]; });
  const mudancas: Mudanca[] = melhorSeq
    .filter((p) => inicios[p.id] !== p.inicioMs)
    .map((p) => ({ id: p.id, deMs: p.inicioMs, paraMs: inicios[p.id] }));
  const sugerida: Totais = { minutos: melhorAgenda.minutos, km: melhorAgenda.km, fimMs: melhorAgenda.fimMs };
  const ganhoMin = Math.max(0, atual.minutos - sugerida.minutos);
  const ganhoKm = Math.max(0, Math.round((atual.km - sugerida.km) * 10) / 10);
  const melhorou = ganhoMin >= ganhoMinimo && mudancas.length > 0;

  if (!melhorou) {
    return { ok: true, ordem: base.map((p) => p.id), inicios: iniciosAtuais, atual, sugerida: atual, ganhoMin: 0, ganhoKm: 0, melhorou: false, mudancas: [] };
  }
  return { ok: true, ordem: melhorSeq.map((p) => p.id), inicios, atual, sugerida, ganhoMin, ganhoKm, melhorou, mudancas };
}

/** "economiza 34 min e 18 km" — a frase do ganho, sempre com "estimativa". */
export function textoGanho(ganhoMin: number, ganhoKm: number): string {
  const min = Math.round(ganhoMin);
  const km = (Math.round(ganhoKm * 10) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (min <= 0 && ganhoKm <= 0) return 'Sua ordem já é a mais curta que achei.';
  if (ganhoKm <= 0) return `Economiza cerca de ${min} min (estimativa, sem trânsito).`;
  return `Economiza cerca de ${min} min e ${km} km (estimativa, sem trânsito).`;
}

/** O motivo do `ok:false` em uma frase para a tela. */
export function textoMotivoRota(motivo: 'poucas_paradas' | 'ordem_atual_inviavel'): string {
  return motivo === 'poucas_paradas'
    ? 'Para ordenar, preciso de pelo menos 2 visitas com local no mapa e horário livre (as já começadas ou com horário combinado ficam no lugar).'
    : 'Com os horários combinados de hoje não dá para chegar a tempo em todas pela estimativa. Revise os horários na agenda.';
}
