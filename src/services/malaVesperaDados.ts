/**
 * MALA DA VÉSPERA — a CASCA que lê o banco local (visitas de amanhã + itens dos
 * orçamentos ligados) e guarda as caixinhas marcadas. A regra está em
 * `malaVespera.ts` (pura). Nada de rede.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { getOrcamento } from '../database/database';
import { getAgendamentosDoDia } from './agenda';
import { aplicarEscopo, type EscopoAgenda } from '../utils/agendaDominio';
import { formatarNumeroExibicao } from '../utils/numeroDocumento';
import { MALA_MARCADOS_KEY } from './storageKeys';
import type { VisitaMala } from './malaVespera';

/** O dia seguinte ao `agora` (relógio do aparelho), às 12h para fugir de fuso/DST. */
export function amanhaDe(agora: Date): Date {
  const d = new Date(agora);
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Visitas de amanhã (com as repetições de série), no escopo de quem vê (o
 * técnico, só as dele), com os itens do orçamento ligado. Lança se o banco falhar.
 */
export async function visitasDaMala(agora: Date, escopo: EscopoAgenda): Promise<VisitaMala[]> {
  const doDia = await getAgendamentosDoDia(amanhaDe(agora));
  const ativas = aplicarEscopo(doDia, escopo).filter((a) => a.status !== 'cancelado' && a.status !== 'concluido');
  const visitas: VisitaMala[] = [];
  for (const a of ativas) {
    let itens: VisitaMala['itensOrcamento'] = null;
    let numero: string | null = null;
    if (a.orcamentoId) {
      const o = await getOrcamento(a.orcamentoId);
      if (o && !o.excluidoEm) {
        itens = o.itens.map((i) => ({ tipo: i.tipo, nome: i.nome, quantidade: i.quantidade, unidade: i.unidade }));
        numero = o.numero ? formatarNumeroExibicao(o.numero) : null;
      }
    }
    visitas.push({
      id: a.id,
      clienteNome: a.clienteNome,
      inicio: a.inicio,
      tipo: a.tipo,
      titulo: a.titulo,
      itensOrcamento: itens,
      orcamentoNumero: numero,
    });
  }
  return visitas;
}

/** Caixinhas marcadas da mala de `dia` ('AAAA-MM-DD'). Falha = nada marcado. */
export async function lerMarcados(dia: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(MALA_MARCADOS_KEY);
    const g = raw ? JSON.parse(raw) : null;
    if (g?.dia === dia && Array.isArray(g.marcados)) return new Set(g.marcados.filter((x: unknown) => typeof x === 'string'));
  } catch {
    // ilegível = começa desmarcado (conveniência, não dado de negócio)
  }
  return new Set();
}

export async function gravarMarcados(dia: string, marcados: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(MALA_MARCADOS_KEY, JSON.stringify({ dia, marcados: [...marcados] }));
  } catch {
    // sem disco: vale para esta sessão
  }
}

/** 'AAAA-MM-DD' local do dia da mala. */
export function chaveDia(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}
