/**
 * Serviço de ORDENS DE SERVIÇO (Onda 4) — a ÚNICA superfície de API do contrato
 * entre a fundação (frente A) e o app do técnico (frente B), além dos types.
 *
 * Local-first: toda leitura/escrita passa pelo SQLite (database.ts), que já espelha
 * na nuvem (public.ordens_servico) em background. Aqui vive só a REGRA de negócio:
 * numeração sequencial (OS-0001), geração de OS a partir de um orçamento aprovado,
 * criação manual e as mutações pontuais (status/técnico/checklist/foto).
 *
 * Nenhuma coluna fora do CONTRATO é inventada. Ids via generateId() (UUID estável
 * entre aparelhos). Todas as escritas atualizam `atualizadoEm`.
 */
import {
  getDb,
  getOrdensServico,
  getOrdemServico as getOrdemServicoDb,
  saveOrdemServico,
  getOrcamento,
} from '../database/database';
import { generateId } from '../utils/id';
import type { OrdemServico, StatusOS, ItemChecklist } from '../types';

/** Todas as OS visíveis (o SELECT local já reflete o tenant/org via sync). */
export async function getOrdens(): Promise<OrdemServico[]> {
  return getOrdensServico();
}

/** OS atribuídas a um técnico específico (filtro por tecnicoId). */
export async function getMinhasOrdens(tecnicoId: string): Promise<OrdemServico[]> {
  if (!tecnicoId) return [];
  const todas = await getOrdensServico();
  return todas.filter((os) => os.tecnicoId === tecnicoId);
}

/** Uma OS por id, ou null. */
export async function getOrdem(id: string): Promise<OrdemServico | null> {
  return getOrdemServicoDb(id);
}

/**
 * Próximo número de OS no formato OS-0001, sequencial e monotônico. Deriva do MAIOR
 * número já usado (parseando o sufixo numérico) + 1. Invariante REAL: o número nunca
 * é reusado enquanto a OS existir na tabela — ativa OU na lixeira (soft delete apenas
 * marca `excluido_em`, a linha e o número continuam lá). Por isso a query varre TODAS
 * as ordens direto no banco (sem o filtro de lixeira de getOrdensServico()): se
 * olhássemos só as ativas, a OS de maior número poderia estar na lixeira, sair do
 * cálculo do MAX e ter seu número reemitido — colidindo com ela mesma ao ser
 * restaurada (não há UNIQUE em `numero`). Sem OS ainda (ou erro/tabela ausente) →
 * OS-0001.
 */
async function proximoNumeroOS(): Promise<string> {
  let maior = 0;
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ numero: string }>('SELECT numero FROM ordens_servico');
    for (const row of rows) {
      const m = /(\d+)\s*$/.exec(row.numero ?? '');
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maior) maior = n;
      }
    }
  } catch {
    // Tabela ausente ou erro de leitura: segue com maior=0 (não trava a criação da OS).
  }
  return `OS-${String(maior + 1).padStart(4, '0')}`;
}

/**
 * Cria uma OS a partir de um orçamento APROVADO: copia cliente (id/nome), título
 * (numero do orçamento) e valor (valorTotal). Status inicial 'aberta'. Lança se o
 * orçamento não existir (o chamador trata a mensagem).
 */
export async function criarOSDeOrcamento(orcamentoId: string): Promise<OrdemServico> {
  const orc = await getOrcamento(orcamentoId);
  if (!orc) {
    throw new Error('Orçamento não encontrado para gerar a OS.');
  }
  // Dedupe: um orçamento gera no máximo UMA ordem de serviço. Se já existe uma OS
  // com este orcamentoId, aborta com mensagem clara em vez de duplicar.
  const jaExiste = (await getOrdensServico()).some((os) => os.orcamentoId === orcamentoId);
  if (jaExiste) {
    throw new Error('Já existe uma ordem de serviço para este orçamento.');
  }
  const agora = new Date().toISOString();
  const os: OrdemServico = {
    id: generateId(),
    numero: await proximoNumeroOS(),
    orcamentoId: orc.id,
    clienteId: orc.clienteId || undefined,
    clienteNome: orc.clienteNome ?? '',
    titulo: orc.numero ? `Orçamento ${orc.numero}` : (orc.clienteNome ?? 'Ordem de serviço'),
    status: 'aberta',
    checklist: [],
    fotos: [],
    valor: orc.valorTotal,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  await saveOrdemServico(os);
  return os;
}

/**
 * Cria uma OS avulsa (sem orçamento de origem) a partir de um parcial. Preenche os
 * obrigatórios com defaults sãos (número sequencial, status 'aberta', listas vazias)
 * quando não vierem. Nunca sobrescreve id/datas fornecidos explicitamente.
 */
export async function criarOSManual(parcial: Partial<OrdemServico>): Promise<OrdemServico> {
  const agora = new Date().toISOString();
  const os: OrdemServico = {
    id: parcial.id ?? generateId(),
    numero: parcial.numero ?? (await proximoNumeroOS()),
    orcamentoId: parcial.orcamentoId,
    clienteId: parcial.clienteId,
    clienteNome: parcial.clienteNome ?? '',
    titulo: parcial.titulo ?? 'Ordem de serviço',
    descricao: parcial.descricao,
    status: parcial.status ?? 'aberta',
    tecnicoId: parcial.tecnicoId,
    tecnicoNome: parcial.tecnicoNome,
    dataAgendada: parcial.dataAgendada,
    checklist: Array.isArray(parcial.checklist) ? parcial.checklist : [],
    fotos: Array.isArray(parcial.fotos) ? parcial.fotos : [],
    observacoes: parcial.observacoes,
    valor: parcial.valor,
    criadoEm: parcial.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  await saveOrdemServico(os);
  return os;
}

/**
 * Carrega a OS, aplica um patch e persiste — helper interno das mutações pontuais.
 * Lança se a OS não existir. Sempre atualiza `atualizadoEm`.
 */
async function patchOrdem(id: string, patch: Partial<OrdemServico>): Promise<OrdemServico> {
  const atual = await getOrdemServicoDb(id);
  if (!atual) {
    throw new Error('Ordem de serviço não encontrada.');
  }
  const atualizada: OrdemServico = {
    ...atual,
    ...patch,
    id: atual.id,
    atualizadoEm: new Date().toISOString(),
  };
  await saveOrdemServico(atualizada);
  return atualizada;
}

/** Muda o status da OS (aberta → agendada → em_execucao → …). */
export async function atualizarStatusOS(id: string, status: StatusOS): Promise<void> {
  await patchOrdem(id, { status });
}

/** Atribui (ou reatribui) o técnico executor da OS. */
export async function atribuirTecnico(id: string, tecnicoId: string, tecnicoNome: string): Promise<void> {
  await patchOrdem(id, { tecnicoId, tecnicoNome });
}

/** Substitui o checklist inteiro da OS (o app envia a lista completa já mutada). */
export async function atualizarChecklist(id: string, checklist: ItemChecklist[]): Promise<void> {
  await patchOrdem(id, { checklist: Array.isArray(checklist) ? checklist : [] });
}

/** Anexa uma foto (uri) à OS, preservando as existentes e sem duplicar. */
export async function adicionarFotoOS(id: string, uri: string): Promise<void> {
  if (!uri) return;
  const atual = await getOrdemServicoDb(id);
  if (!atual) {
    throw new Error('Ordem de serviço não encontrada.');
  }
  const fotos = Array.isArray(atual.fotos) ? atual.fotos : [];
  if (fotos.includes(uri)) return; // idempotente: já anexada
  await patchOrdem(id, { fotos: [...fotos, uri] });
}
