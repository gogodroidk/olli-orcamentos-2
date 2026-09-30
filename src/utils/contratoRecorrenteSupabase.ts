/**
 * Contratos recorrentes sobre o supabase-js — UMA implementação para o app (celular e
 * desktop) e o painel web. Cada lado passa o próprio client (sessão do usuário, RLS
 * dele); nada aqui cria client nem guarda estado.
 *
 * Contratos são ONLINE de propósito: são gestão (dono/gestor, no escritório), e a
 * geração de visita precisa do banco como juiz da idempotência (a chave única de
 * `contrato_visitas`). O que o técnico usa em campo — a OS e o agendamento gerados —
 * chega ao celular pelo sync normal e funciona offline como qualquer OS.
 *
 * Três estados sempre: `ok` | `desligado` (servidor sem a migration / app sem
 * Supabase — a tela DIZ que está desligado, nunca finge) | `erro` (rede, RLS…).
 */
import type { ContratoRecorrente } from '../types/index.ts';
import { contratoParaLinha, type Linha, linhaParaContrato, validarContrato } from './contratoRecorrente.ts';
import {
  gerarVisitasDosContratos,
  type PortaGeracaoContratos,
  type ResultadoGeracaoContratos,
} from './contratoRecorrenteGeracao.ts';

/**
 * O client do Supabase visto de forma ESTRUTURAL. App e painel têm cada um a sua
 * cópia do supabase-js (versões e genéricos diferentes); importar o tipo de um deles
 * faria o outro não compilar. Só `from()` é usado aqui.
 */
// biome-ignore lint/suspicious/noExplicitAny: o query builder do supabase-js é genérico demais para um tipo estrutural útil; o formato das linhas é validado por linhaParaContrato.
export type SupabaseClient = { from(tabela: string): any };

export type LeituraContratos =
  | { status: 'ok'; contratos: ContratoRecorrente[] }
  | { status: 'desligado'; mensagem: string }
  | { status: 'erro'; mensagem: string };

export const MENSAGEM_DESLIGADO =
  'Os contratos recorrentes ainda não foram ativados no servidor. Nada foi gerado — assim que forem ativados, esta tela passa a funcionar.';

interface ErroPg {
  code?: string;
  message?: string;
}

/**
 * Erro de ESQUEMA (a migration ainda não foi aplicada): coluna ou tabela inexistente.
 * 42703 = coluna, 42P01 = tabela; PGRST204/PGRST205 = o cache do PostgREST não conhece.
 */
export function erroEhRecursoDesligado(e: unknown): boolean {
  const code = (e as ErroPg | null)?.code ?? '';
  return code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205';
}

function mensagemDeErro(e: unknown): string {
  const m = (e as ErroPg | null)?.message;
  if (typeof m === 'string' && /row-level security|permission denied/i.test(m)) {
    return 'Sua conta não tem permissão para mexer em contratos. Peça ao dono ou gestor da empresa.';
  }
  if (typeof m === 'string' && /fetch|network|Failed to/i.test(m)) {
    return 'Sem conexão com o servidor. Contratos precisam de internet — tente de novo.';
  }
  return 'Não consegui carregar os contratos agora. Tente de novo.';
}

export async function listarContratos(client: SupabaseClient | null): Promise<LeituraContratos> {
  if (!client) return { status: 'desligado', mensagem: MENSAGEM_DESLIGADO };
  try {
    const { data, error } = await client
      .from('service_contracts')
      .select('*')
      .is('excluido_em', null)
      .not('periodicidade', 'is', null)
      .order('criado_em', { ascending: false })
      .limit(500);
    if (error) {
      if (erroEhRecursoDesligado(error)) return { status: 'desligado', mensagem: MENSAGEM_DESLIGADO };
      return { status: 'erro', mensagem: mensagemDeErro(error) };
    }
    return { status: 'ok', contratos: ((data ?? []) as Linha[]).map(linhaParaContrato) };
  } catch (e) {
    return { status: 'erro', mensagem: mensagemDeErro(e) };
  }
}

/**
 * Grava (cria ou edita) o contrato no tenant `tenantUserId` (o DONO; para o próprio
 * dono é o id dele). Lança com mensagem legível — a tela mostra.
 */
export async function salvarContrato(
  client: SupabaseClient | null,
  contrato: ContratoRecorrente,
  tenantUserId: string | null,
): Promise<ContratoRecorrente> {
  if (!client) throw new Error(MENSAGEM_DESLIGADO);
  const erros = validarContrato(contrato);
  if (erros.length) throw new Error(erros[0]);
  // Sem tenant conhecido não grava: adivinhar gravaria no tenant errado (fail-closed).
  if (!tenantUserId) throw new Error('Não consegui confirmar a qual empresa este contrato pertence. Tente de novo em instantes.');
  const agora = new Date().toISOString();
  const linha: Linha = { ...contratoParaLinha({ ...contrato, atualizadoEm: agora }), user_id: tenantUserId };
  const { data, error } = await client.from('service_contracts').upsert(linha, { onConflict: 'id' }).select('*');
  if (error) {
    if (erroEhRecursoDesligado(error)) throw new Error(MENSAGEM_DESLIGADO);
    throw new Error(mensagemDeErro(error).replace('carregar', 'salvar'));
  }
  const salvo = (data as Linha[] | null)?.[0];
  return salvo ? linhaParaContrato(salvo) : { ...contrato, userId: tenantUserId, atualizadoEm: agora };
}

/** Manda para a lixeira (soft delete). As visitas já geradas continuam na agenda. */
export async function excluirContrato(client: SupabaseClient | null, contrato: ContratoRecorrente): Promise<void> {
  if (!client) throw new Error(MENSAGEM_DESLIGADO);
  const agora = new Date().toISOString();
  const { error } = await client
    .from('service_contracts')
    .update({ excluido_em: agora, atualizado_em: agora })
    .eq('id', contrato.id);
  if (error) throw new Error(mensagemDeErro(error).replace('carregar', 'excluir'));
}

/** Porta de escrita da geração sobre o supabase-js (RLS do usuário logado). */
export function portaSupabase(client: SupabaseClient): PortaGeracaoContratos {
  const inserirSeNaoExiste = async (tabela: string, linha: Linha): Promise<boolean> => {
    const { data, error } = await client
      .from(tabela)
      .upsert(linha, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  };
  return {
    async reservas(contratoIds) {
      if (!contratoIds.length) return [];
      const { data, error } = await client
        .from('contrato_visitas')
        .select('id, contrato_id, periodo, ordem_criada_em')
        .in('contrato_id', contratoIds);
      if (error) throw error;
      return ((data ?? []) as { id: string; contrato_id: string; periodo: string; ordem_criada_em: string | null }[]).map((r) => ({
        id: r.id,
        contratoId: r.contrato_id,
        periodo: r.periodo,
        ordemCriadaEm: r.ordem_criada_em,
      }));
    },
    reservar: (linha) => inserirSeNaoExiste('contrato_visitas', linha),
    async inserirOrdem(linha) {
      await inserirSeNaoExiste('ordens_servico', linha);
    },
    async inserirAgendamento(linha) {
      await inserirSeNaoExiste('agendamentos', linha);
    },
    async confirmar(reservaId, quando) {
      const { error } = await client
        .from('contrato_visitas')
        .update({ ordem_criada_em: quando, atualizado_em: quando })
        .eq('id', reservaId);
      if (error) throw error;
    },
    async proximoSequencialOs(userId) {
      // Mesma técnica do painel (`proximoNumeroOs`): maior sequencial visível + 1,
      // lixeira incluída (número apagado não é reemitido).
      const { data, error } = await client
        .from('ordens_servico')
        .select('numero')
        .eq('user_id', userId)
        .order('criado_em', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const maior = ((data ?? []) as { numero?: string | null }[]).reduce((max, l) => {
        const m = /(\d+)\s*$/.exec(String(l.numero ?? ''));
        return m ? Math.max(max, Number(m[1])) : max;
      }, 0);
      return maior + 1;
    },
  };
}

/**
 * Gera as visitas devidas dos contratos visíveis. Lê os contratos, roda o motor e
 * devolve o resultado honesto (criadas/falhas…). Lança só se não conseguir ler.
 */
export async function gerarVisitas(
  client: SupabaseClient,
  contratos?: readonly ContratoRecorrente[],
  agora: Date = new Date(),
): Promise<ResultadoGeracaoContratos> {
  let lista = contratos;
  if (!lista) {
    const leitura = await listarContratos(client);
    if (leitura.status !== 'ok') throw new Error(leitura.mensagem);
    lista = leitura.contratos;
  }
  return gerarVisitasDosContratos(portaSupabase(client), lista, { agora });
}
