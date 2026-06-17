/**
 * Sincronização item-a-item (per-row, two-way) com o Supabase.
 *
 * O painel web lê as TABELAS RELACIONAIS (`clientes`, `orcamentos`, …), não o
 * blob de `backups`. Este módulo espelha cada mutação local nessas tabelas para
 * o painel refletir o app ao vivo — e, no login, traz de volta o que estiver na
 * nuvem (aparelho novo) e empurra o que já existir localmente (aparelho do dono).
 *
 * REGRAS DE OURO
 *  - Local-first: o SQLite é a fonte da verdade. Tudo aqui é ADITIVO e roda em
 *    background. NUNCA lança — offline / deslogado / sem-config = no-op silencioso.
 *  - Sem `user_id` nos writes: o default `auth.uid()` das tabelas (RLS) preenche.
 *  - Sem loop de sync: o `pullAll()` escreve DIRETO no SQLite (caminho silencioso),
 *    sem chamar os `save*` de database.ts (que disparam push). Assim, baixar da
 *    nuvem não re-dispara upload.
 */
import { supabase, getCurrentUser } from './supabase';
import { getDb } from '../database/database';
import type {
  Cliente,
  ServicoItem,
  ProdutoItem,
  Orcamento,
  Recibo,
  Empresa,
  ModeloOrcamento,
  Depoimento,
  Agendamento,
} from '../types';

// ─── Tabelas sincronizadas ───────────────────────────────────────────────────
export type SyncTable =
  | 'empresa'
  | 'clientes'
  | 'servicos'
  | 'produtos'
  | 'orcamentos'
  | 'recibos'
  | 'modelos'
  | 'depoimentos'
  | 'agendamentos';

/** Alvo de conflito do upsert por tabela. `empresa` é uma linha por usuário. */
const ON_CONFLICT: Record<SyncTable, string> = {
  empresa: 'user_id',
  clientes: 'id',
  servicos: 'id',
  produtos: 'id',
  orcamentos: 'id',
  recibos: 'id',
  modelos: 'id',
  depoimentos: 'id',
  agendamentos: 'id',
};

// ─── Mapeadores local → linha da nuvem (toRow) ───────────────────────────────
// Cada toRow devolve EXATAMENTE as colunas da tabela Supabase (sem user_id).
// As tabelas com jsonb (`empresa`, `orcamentos`, `recibos`, `modelos`) guardam o
// objeto completo do app em `dados`, e replicam as colunas que o painel lê.

function empresaToRow(e: Empresa): Record<string, unknown> {
  return { dados: e, atualizado_em: new Date().toISOString() };
}

function clienteToRow(c: Cliente): Record<string, unknown> {
  return {
    id: c.id,
    nome: c.nome,
    telefone: c.telefone ?? null,
    cpf: c.cpf ?? null,
    cnpj: c.cnpj ?? null,
    endereco: c.endereco ?? null,
    complemento: c.complemento ?? null,
    estado: c.estado ?? null,
    cidade: c.cidade ?? null,
    cep: c.cep ?? null,
    criado_em: c.criadoEm,
  };
}

function servicoToRow(s: ServicoItem): Record<string, unknown> {
  return {
    id: s.id,
    nome: s.nome,
    descricao: s.descricao ?? null,
    preco: s.preco,
    custo: s.custo ?? null,
    unidade: s.unidade ?? null,
    foto_uri: s.fotoUri ?? null,
    criado_em: s.criadoEm,
  };
}

function produtoToRow(p: ProdutoItem): Record<string, unknown> {
  return {
    id: p.id,
    nome: p.nome,
    descricao: p.descricao ?? null,
    preco: p.preco,
    custo: p.custo ?? null,
    marca: p.marca ?? null,
    modelo: p.modelo ?? null,
    unidade: p.unidade ?? null,
    foto_uri: p.fotoUri ?? null,
    criado_em: p.criadoEm,
  };
}

function orcamentoToRow(o: Orcamento): Record<string, unknown> {
  return {
    id: o.id,
    numero: o.numero,
    cliente_id: o.clienteId ?? null,
    cliente_nome: o.clienteNome ?? null,
    status: o.status,
    subtotal: o.subtotal ?? null,
    desconto: o.desconto ?? null,
    valor_total: o.valorTotal ?? null,
    data_emissao: o.dataEmissao ?? null,
    dados: o,
    criado_em: o.criadoEm,
    atualizado_em: o.atualizadoEm,
  };
}

function reciboToRow(r: Recibo): Record<string, unknown> {
  return {
    id: r.id,
    numero: r.numero,
    orcamento_id: r.orcamentoId ?? null,
    cliente_id: r.clienteId ?? null,
    cliente_nome: r.clienteNome ?? null,
    valor_recebido: r.valorRecebido ?? null,
    forma_pagamento: r.formaPagamento ?? null,
    data_recebimento: r.dataRecebimento ?? null,
    dados: r,
    criado_em: r.criadoEm,
  };
}

function modeloToRow(m: ModeloOrcamento): Record<string, unknown> {
  return {
    id: m.id,
    nome: m.nome,
    descricao: m.descricao ?? null,
    dados: { orcamentoBase: m.orcamentoBase },
    criado_em: m.criadoEm,
  };
}

function depoimentoToRow(d: Depoimento): Record<string, unknown> {
  return {
    id: d.id,
    nome_cliente: d.nomeCliente,
    estrelas: d.estrelas,
    texto: d.texto ?? null,
    criado_em: d.criadoEm,
  };
}

function agendamentoToRow(a: Agendamento): Record<string, unknown> {
  return {
    id: a.id,
    cliente_id: a.clienteId ?? null,
    cliente_nome: a.clienteNome,
    titulo: a.titulo,
    tipo: a.tipo,
    inicio: a.inicio,
    fim: a.fim ?? null,
    endereco: a.endereco ?? null,
    status: a.status,
    orcamento_id: a.orcamentoId ?? null,
    observacao: a.observacao ?? null,
    criado_em: a.criadoEm,
    atualizado_em: a.atualizadoEm,
  };
}

const TO_ROW: Record<SyncTable, (obj: any) => Record<string, unknown>> = {
  empresa: empresaToRow,
  clientes: clienteToRow,
  servicos: servicoToRow,
  produtos: produtoToRow,
  orcamentos: orcamentoToRow,
  recibos: reciboToRow,
  modelos: modeloToRow,
  depoimentos: depoimentoToRow,
  agendamentos: agendamentoToRow,
};

// ─── Mapeadores linha da nuvem → local (fromRow) ─────────────────────────────
// Para as tabelas com `dados` jsonb, o objeto completo do app vive em `dados` —
// preferimos ele (é a verdade do app); caímos para as colunas só se faltar.

function rowToEmpresa(row: any): Empresa | null {
  const d = row?.dados;
  return d && typeof d === 'object' ? (d as Empresa) : null;
}

function rowToCliente(row: any): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone ?? '',
    cpf: row.cpf ?? undefined,
    cnpj: row.cnpj ?? undefined,
    endereco: row.endereco ?? undefined,
    complemento: row.complemento ?? undefined,
    estado: row.estado ?? undefined,
    cidade: row.cidade ?? undefined,
    cep: row.cep ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
  };
}

function rowToServico(row: any): ServicoItem {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? undefined,
    preco: row.preco ?? 0,
    custo: row.custo ?? undefined,
    unidade: row.unidade ?? 'un',
    fotoUri: row.foto_uri ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
  };
}

function rowToProduto(row: any): ProdutoItem {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? undefined,
    preco: row.preco ?? 0,
    custo: row.custo ?? undefined,
    marca: row.marca ?? undefined,
    modelo: row.modelo ?? undefined,
    unidade: row.unidade ?? 'un',
    fotoUri: row.foto_uri ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
  };
}

function rowToOrcamento(row: any): Orcamento | null {
  const d = row?.dados;
  return d && typeof d === 'object' ? (d as Orcamento) : null;
}

function rowToRecibo(row: any): Recibo | null {
  const d = row?.dados;
  return d && typeof d === 'object' ? (d as Recibo) : null;
}

function rowToModelo(row: any): ModeloOrcamento | null {
  const base = row?.dados?.orcamentoBase;
  if (!base || typeof base !== 'object') return null;
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? undefined,
    orcamentoBase: base,
    criadoEm: row.criado_em ?? new Date().toISOString(),
  };
}

function rowToDepoimento(row: any): Depoimento {
  return {
    id: row.id,
    nomeCliente: row.nome_cliente,
    estrelas: row.estrelas ?? 5,
    texto: row.texto ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
  };
}

function rowToAgendamento(row: any): Agendamento {
  return {
    id: row.id,
    clienteId: row.cliente_id ?? undefined,
    clienteNome: row.cliente_nome,
    titulo: row.titulo,
    tipo: row.tipo,
    inicio: row.inicio,
    fim: row.fim ?? undefined,
    endereco: row.endereco ?? undefined,
    status: row.status,
    orcamentoId: row.orcamento_id ?? undefined,
    observacao: row.observacao ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? new Date().toISOString(),
  };
}

// ─── Guarda de sessão ────────────────────────────────────────────────────────
/** True só quando há cliente configurado E sessão logada. */
async function hasSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const user = await getCurrentUser();
    return !!user;
  } catch {
    return false;
  }
}

// ─── PUSH per-row (upsert) ───────────────────────────────────────────────────
/**
 * Espelha UM objeto local na tabela relacional (upsert). Fire-and-forget:
 * só roda com sessão; NUNCA lança. Offline / deslogado = no-op silencioso.
 */
export async function pushRow(table: SyncTable, objLocal: unknown): Promise<void> {
  try {
    if (!objLocal) return;
    if (!(await hasSession())) return;
    await pushRowUnchecked(table, objLocal);
  } catch {
    // espelho em background: erros nunca afetam o app local
  }
}

/**
 * Upsert sem checar sessão — para o caminho em LOTE (pushAllLocal), que valida a
 * sessão UMA vez antes de iterar (evita um getUser() por linha). NUNCA lança.
 */
async function pushRowUnchecked(table: SyncTable, objLocal: unknown): Promise<void> {
  try {
    if (!objLocal || !supabase) return;
    const row = TO_ROW[table](objLocal);
    await supabase.from(table).upsert(row, { onConflict: ON_CONFLICT[table] });
  } catch {
    // idem: silencioso
  }
}

/** Remove UMA linha relacional por id. Só com sessão; NUNCA lança. */
export async function removeRow(table: SyncTable, id: string): Promise<void> {
  try {
    if (!id) return;
    if (!(await hasSession()) || !supabase) return;
    await supabase.from(table).delete().eq('id', id);
  } catch {
    // idem: silencioso
  }
}

// ─── Escrita SILENCIOSA no SQLite (sem re-disparar push) ─────────────────────
// Estes upserts gravam direto na tabela local, espelhando a forma dos `save*`
// de database.ts, MAS sem chamar pushRow — é assim que pullAll evita o loop.

async function localUpsertEmpresa(e: Empresa): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO empresa (id, data) VALUES (?, ?)', [
    e.id ?? 'empresa_1',
    JSON.stringify(e),
  ]);
}

async function localUpsertCliente(c: Cliente): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO clientes
       (id, nome, telefone, cpf, cnpj, endereco, complemento, estado, cidade, cep, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.nome, c.telefone ?? null, c.cpf ?? null, c.cnpj ?? null,
     c.endereco ?? null, c.complemento ?? null, c.estado ?? null,
     c.cidade ?? null, c.cep ?? null, c.criadoEm],
  );
}

async function localUpsertServico(s: ServicoItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO servicos (id, nome, descricao, preco, custo, unidade, foto_uri, criado_em)
     VALUES (?,?,?,?,?,?,?,?)`,
    [s.id, s.nome, s.descricao ?? null, s.preco, s.custo ?? null,
     s.unidade, s.fotoUri ?? null, s.criadoEm],
  );
}

async function localUpsertProduto(p: ProdutoItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO produtos
       (id, nome, descricao, preco, custo, marca, modelo, unidade, foto_uri, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [p.id, p.nome, p.descricao ?? null, p.preco, p.custo ?? null,
     p.marca ?? null, p.modelo ?? null, p.unidade, p.fotoUri ?? null, p.criadoEm],
  );
}

async function localUpsertOrcamento(o: Orcamento): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)', [
    o.id,
    o.numero,
    JSON.stringify(o),
  ]);
}

async function localUpsertRecibo(r: Recibo): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)', [
    r.id,
    r.numero,
    JSON.stringify(r),
  ]);
}

async function localUpsertModelo(m: ModeloOrcamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO modelos (id, nome, descricao, data, criado_em) VALUES (?,?,?,?,?)',
    [m.id, m.nome, m.descricao ?? null, JSON.stringify(m.orcamentoBase), m.criadoEm],
  );
}

async function localUpsertDepoimento(d: Depoimento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em) VALUES (?,?,?,?,?)',
    [d.id, d.nomeCliente, d.estrelas, d.texto ?? null, d.criadoEm],
  );
}

async function localUpsertAgendamento(a: Agendamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO agendamentos
       (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
     a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
     a.observacao ?? null, a.criadoEm, a.atualizadoEm],
  );
}

// ─── PULL ALL (nuvem → SQLite local, caminho silencioso) ─────────────────────
/**
 * Lê todas as tabelas da nuvem e grava no SQLite SEM re-disparar push.
 * Aparelho novo logando: traz os dados de volta. NUNCA lança.
 */
export async function pullAll(): Promise<void> {
  try {
    if (!(await hasSession()) || !supabase) return;

    // empresa (uma linha por usuário)
    try {
      const { data } = await supabase.from('empresa').select('*').maybeSingle();
      const emp = rowToEmpresa(data);
      if (emp) await localUpsertEmpresa(emp);
    } catch {}

    await pullTable<Cliente>('clientes', rowToCliente, localUpsertCliente);
    await pullTable<ServicoItem>('servicos', rowToServico, localUpsertServico);
    await pullTable<ProdutoItem>('produtos', rowToProduto, localUpsertProduto);
    await pullTable<Orcamento>('orcamentos', rowToOrcamento, localUpsertOrcamento);
    await pullTable<Recibo>('recibos', rowToRecibo, localUpsertRecibo);
    await pullTable<ModeloOrcamento>('modelos', rowToModelo, localUpsertModelo);
    await pullTable<Depoimento>('depoimentos', rowToDepoimento, localUpsertDepoimento);
    await pullTable<Agendamento>('agendamentos', rowToAgendamento, localUpsertAgendamento);
  } catch {
    // pull é best-effort; falha não afeta o app local
  }
}

/** Lê uma tabela e grava cada linha no SQLite (silencioso). Tolera fromRow nulo. */
async function pullTable<T>(
  table: SyncTable,
  fromRow: (row: any) => T | null,
  localUpsert: (obj: T) => Promise<void>,
): Promise<void> {
  try {
    if (!supabase) return;
    const { data, error } = await supabase.from(table).select('*');
    if (error || !Array.isArray(data)) return;
    for (const row of data) {
      try {
        const obj = fromRow(row);
        if (obj) await localUpsert(obj);
      } catch {
        // pula linha problemática, segue o resto
      }
    }
  } catch {
    // tabela indisponível = ignora
  }
}

// ─── PUSH ALL LOCAL (SQLite → nuvem) ─────────────────────────────────────────
/**
 * Lê tudo do SQLite e faz upsert de cada item na nuvem. Para aparelhos que já
 * têm dados locais (ex.: o do dono) popularem o painel. NUNCA lança.
 */
export async function pushAllLocal(): Promise<void> {
  try {
    if (!(await hasSession()) || !supabase) return;
    const db = await getDb();

    // empresa
    try {
      const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM empresa LIMIT 1');
      if (row?.data) await pushRowUnchecked('empresa', JSON.parse(row.data) as Empresa);
    } catch {}

    await pushTable('clientes', 'SELECT * FROM clientes', rowToClienteLocal);
    await pushTable('servicos', 'SELECT * FROM servicos', rowToServicoLocal);
    await pushTable('produtos', 'SELECT * FROM produtos', rowToProdutoLocal);
    await pushTable('orcamentos', 'SELECT data FROM orcamentos', (r: any) => JSON.parse(r.data) as Orcamento);
    await pushTable('recibos', 'SELECT data FROM recibos', (r: any) => JSON.parse(r.data) as Recibo);
    await pushTable('modelos', 'SELECT * FROM modelos', (r: any) => ({
      id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
      orcamentoBase: JSON.parse(r.data), criadoEm: r.criado_em,
    } as ModeloOrcamento));
    await pushTable('depoimentos', 'SELECT * FROM depoimentos', rowToDepoimentoLocal);
    await pushTable('agendamentos', 'SELECT * FROM agendamentos', rowToAgendamentoLocal);
  } catch {
    // best-effort
  }
}

/**
 * Lê linhas locais via SQL, mapeia para o objeto do app e faz upsert de cada.
 * Usa `pushRowUnchecked` — pushAllLocal já validou a sessão antes de chamar.
 */
async function pushTable<T>(
  table: SyncTable,
  sql: string,
  toLocal: (row: any) => T,
): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(sql);
    for (const r of rows) {
      try {
        await pushRowUnchecked(table, toLocal(r));
      } catch {
        // pula item problemático
      }
    }
  } catch {
    // tabela local indisponível = ignora
  }
}

// Mapeadores de LINHA SQLite → objeto do app (colunas locais, distintas das da
// nuvem). Usados só pelo pushAllLocal.
function rowToClienteLocal(r: any): Cliente {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone ?? '',
    cpf: r.cpf ?? undefined, cnpj: r.cnpj ?? undefined,
    endereco: r.endereco ?? undefined, complemento: r.complemento ?? undefined,
    estado: r.estado ?? undefined, cidade: r.cidade ?? undefined,
    cep: r.cep ?? undefined, criadoEm: r.criado_em,
  };
}
function rowToServicoLocal(r: any): ServicoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
  };
}
function rowToProdutoLocal(r: any): ProdutoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, marca: r.marca ?? undefined,
    modelo: r.modelo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
  };
}
function rowToDepoimentoLocal(r: any): Depoimento {
  return {
    id: r.id, nomeCliente: r.nome_cliente, estrelas: r.estrelas,
    texto: r.texto ?? undefined, criadoEm: r.criado_em,
  };
}
function rowToAgendamentoLocal(r: any): Agendamento {
  return {
    id: r.id, clienteId: r.cliente_id ?? undefined, clienteNome: r.cliente_nome,
    titulo: r.titulo, tipo: r.tipo, inicio: r.inicio, fim: r.fim ?? undefined,
    endereco: r.endereco ?? undefined, status: r.status,
    orcamentoId: r.orcamento_id ?? undefined, observacao: r.observacao ?? undefined,
    criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
  };
}

// ─── SYNC ON LOGIN ───────────────────────────────────────────────────────────
let syncing = false;

/**
 * No login: empurra o que já existe local (popula o painel imediatamente) e
 * depois puxa o que houver na nuvem (aparelho novo). Upserts idempotentes; em
 * conflito vence o último a escrever (pushAllLocal antes, pullAll depois, então
 * a nuvem prevalece para o dispositivo recém-logado). NÃO bloqueia a UI:
 * roda em background e NUNCA lança. Reentrância protegida por flag.
 */
export async function syncOnLogin(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    if (!(await hasSession())) return;
    await pushAllLocal();
    await pullAll();
  } catch {
    // sync de fundo: nunca quebra a sessão / UX
  } finally {
    syncing = false;
  }
}
