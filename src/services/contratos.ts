/**
 * Contratos recorrentes no APP (celular e desktop) — a casca fina sobre a
 * implementação compartilhada com o painel (`utils/contratoRecorrenteSupabase.ts`).
 *
 * O que só existe aqui: descobrir o TENANT de escrita (o mesmo contexto de equipe do
 * sync — `garantirContextoEquipe`) e a geração AUTOMÁTICA de visitas que o sync
 * dispara ao abrir o app. As visitas geradas (OS + agendamento) descem para o SQLite
 * no mesmo sync e funcionam offline para o técnico.
 */
import { supabase, getCurrentUser } from './supabase';
import { garantirContextoEquipe } from './cloudSync';
import { resolverTenantEquipe } from './contextoEquipe';
import { carregarMinhaOrganizacao } from './equipe';
import type { ContratoRecorrente } from '../types';
import {
  excluirContrato as excluirContratoRemoto,
  gerarVisitas,
  listarContratos as listarContratosRemoto,
  type LeituraContratos,
  MENSAGEM_DESLIGADO,
  salvarContrato as salvarContratoRemoto,
} from '../utils/contratoRecorrenteSupabase';
import type { ResultadoGeracaoContratos } from '../utils/contratoRecorrenteGeracao';

export type { LeituraContratos };

export function listarContratos(): Promise<LeituraContratos> {
  return listarContratosRemoto(supabase);
}

/** Tenant de escrita: o dono (para membro) ou o próprio usuário. `null` = não sei. */
async function tenantDeEscrita(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return resolverTenantEquipe(await garantirContextoEquipe(), user?.id);
  } catch {
    return null;
  }
}

/**
 * Salva o contrato e já gera as visitas devidas dele (a próxima visita aparece na
 * agenda na hora). Devolve o contrato salvo e o resultado da geração — `null` quando a
 * geração falhou (o contrato está salvo; a próxima abertura do app tenta de novo).
 */
export async function salvarContrato(
  contrato: ContratoRecorrente,
): Promise<{ contrato: ContratoRecorrente; geracao: ResultadoGeracaoContratos | null }> {
  const salvo = await salvarContratoRemoto(supabase, contrato, await tenantDeEscrita());
  let geracao: ResultadoGeracaoContratos | null = null;
  if (supabase) {
    try {
      geracao = await gerarVisitas(supabase, [salvo]);
    } catch {
      geracao = null;
    }
  }
  return { contrato: salvo, geracao };
}

export function excluirContrato(contrato: ContratoRecorrente): Promise<void> {
  return excluirContratoRemoto(supabase, contrato);
}

/** Geração sob demanda (botão "Gerar visitas agora"). Lança com mensagem legível. */
export async function gerarVisitasAgora(): Promise<ResultadoGeracaoContratos> {
  if (!supabase) throw new Error(MENSAGEM_DESLIGADO);
  return gerarVisitas(supabase);
}

/** Intervalo mínimo entre gerações automáticas no mesmo aparelho (o sync roda a cada volta ao app). */
const INTERVALO_AUTOMATICO_MS = 15 * 60 * 1000;
let ultimaAutomatica = 0;

/**
 * Geração automática, chamada pelo sync ANTES do pull (as OS criadas descem no mesmo
 * ciclo). Só para quem é gestão: técnico não gera (a RLS barraria de qualquer forma —
 * aqui evitamos a viagem). Papel desconhecido (offline, erro) = não gera (fail-closed).
 * NUNCA lança: falha aqui não pode afetar o sync.
 */
export async function gerarVisitasAutomatico(): Promise<ResultadoGeracaoContratos | null> {
  try {
    if (!supabase) return null;
    const agora = Date.now();
    if (agora - ultimaAutomatica < INTERVALO_AUTOMATICO_MS) return null;
    const org = await carregarMinhaOrganizacao();
    if (org.status !== 'ok') return null;
    if (org.org && org.org.papel === 'tecnico') return null;
    ultimaAutomatica = agora;
    const leitura = await listarContratosRemoto(supabase);
    if (leitura.status !== 'ok' || !leitura.contratos.length) return null;
    return await gerarVisitas(supabase, leitura.contratos);
  } catch {
    return null;
  }
}
