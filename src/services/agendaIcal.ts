/**
 * Levar a agenda do celular para outro calendário: arquivo .ics agora, ou o
 * link que o Google Agenda / iPhone assinam. O OAuth do Google continua desligado.
 */

import { Platform } from 'react-native';
import { LINK_BASE_URL } from '../config';
import type { Agendamento } from '../types';
import { criarIcsAgenda, type EventoIcs } from '../utils/icsAgenda';
import {
  ativarAssinaturaIcal,
  revogarAssinaturaIcal,
  type ClienteRpcIcal,
  type EscopoIcal,
  type ResultadoAtivarIcal,
} from '../utils/assinaturaIcal';
import { supabase } from './supabase';

function cliente(): ClienteRpcIcal | null {
  const db = supabase;
  if (!db) return null;
  return {
    rpc(fn, args) {
      return db.rpc(fn, args);
    },
  };
}

export function ativarLinkIcal(escopo?: EscopoIcal): Promise<ResultadoAtivarIcal> {
  const c = cliente();
  if (!c) return Promise.resolve({ estado: 'erro' });
  return ativarAssinaturaIcal(c, LINK_BASE_URL, escopo);
}

export function revogarLinkIcal(escopo: EscopoIcal): Promise<'ok' | 'indisponivel' | 'sem_sessao' | 'erro'> {
  const c = cliente();
  if (!c) return Promise.resolve('erro');
  return revogarAssinaturaIcal(c, escopo);
}

export type ResultadoArquivoIcs = 'ok' | 'vazio' | 'sem_folha' | 'erro';

/** Abre a folha de compartilhar com o arquivo, ou baixa no navegador. */
export async function compartilharArquivoIcs(eventos: readonly EventoIcs[]): Promise<ResultadoArquivoIcs> {
  const ics = criarIcsAgenda(eventos, { modo: 'agenda' });
  if (!ics) return 'erro';
  if (!ics.includes('BEGIN:VEVENT')) return 'vazio';

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agenda-olli.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'ok';
  }

  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const dest = `${FileSystem.documentDirectory ?? ''}agenda-olli.ics`;
    await FileSystem.writeAsStringAsync(dest, ics);
    if (!(await Sharing.isAvailableAsync())) return 'sem_folha';
    await Sharing.shareAsync(dest, {
      mimeType: 'text/calendar',
      UTI: 'public.calendar-event',
      dialogTitle: 'Agenda OLLI',
    });
    return 'ok';
  } catch {
    return 'erro';
  }
}

export type { Agendamento };
