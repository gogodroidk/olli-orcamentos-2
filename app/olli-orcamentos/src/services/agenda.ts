import { getDb } from '../database/database';
import { Agendamento } from '../types';

/**
 * CRUD da Agenda (Fase 2). Mesmo padrão do database.ts: SQLite local,
 * offline-first. As datas (`inicio`/`fim`) são ISO datetime; o filtro por
 * intervalo usa comparação lexicográfica de strings ISO (segura para ordenar).
 */

function rowToAgendamento(r: any): Agendamento {
  return {
    id: r.id,
    clienteId: r.cliente_id ?? undefined,
    clienteNome: r.cliente_nome,
    titulo: r.titulo,
    tipo: r.tipo,
    inicio: r.inicio,
    fim: r.fim ?? undefined,
    endereco: r.endereco ?? undefined,
    status: r.status,
    orcamentoId: r.orcamento_id ?? undefined,
    observacao: r.observacao ?? undefined,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  };
}

/** Todos os agendamentos, do mais antigo para o mais recente. */
export async function getAgendamentos(): Promise<Agendamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM agendamentos ORDER BY inicio ASC');
  return rows.map(rowToAgendamento);
}

/**
 * Agendamentos cujo início cai no intervalo [inicioISO, fimISO).
 * Use os limites do dia/semana/mês como ISO datetime.
 */
export async function getAgendamentosRange(inicioISO: string, fimISO: string): Promise<Agendamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM agendamentos WHERE inicio >= ? AND inicio < ? ORDER BY inicio ASC',
    [inicioISO, fimISO]
  );
  return rows.map(rowToAgendamento);
}

/** Agendamentos do dia informado (Date local). Default: hoje. */
export async function getAgendamentosDoDia(dia: Date = new Date()): Promise<Agendamento[]> {
  const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0);
  const fim = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1, 0, 0, 0, 0);
  return getAgendamentosRange(inicio.toISOString(), fim.toISOString());
}

export async function getAgendamento(id: string): Promise<Agendamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM agendamentos WHERE id = ?', [id]);
  return row ? rowToAgendamento(row) : null;
}

/** Cria ou atualiza (upsert) um agendamento. */
export async function saveAgendamento(a: Agendamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO agendamentos
       (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
     a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
     a.observacao ?? null, a.criadoEm, a.atualizadoEm]
  );
}

export async function deleteAgendamento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM agendamentos WHERE id = ?', [id]);
}
