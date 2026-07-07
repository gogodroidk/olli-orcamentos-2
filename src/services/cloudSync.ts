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

// ─── TOMBSTONES de exclusão (nuvem) ──────────────────────────────────────────
/**
 * Empurra UM tombstone de exclusão para a nuvem (`public.exclusoes`). Idempotente
 * (upsert por (user_id,tabela,item_id)) e com `ignoreDuplicates`: se o tombstone
 * já existe na nuvem, NÃO reescreve o `excluido_em` — o carimbo ORIGINAL da
 * exclusão é preservado, para o tombstone poder de fato envelhecer e ser podado
 * (sem isto, cada sync refrescava a data e a retenção de 90 dias nunca vencia).
 * `excluidoEm` opcional preserva o carimbo local no re-push em lote. Fire-and-
 * forget: só com sessão; NUNCA lança. Offline / deslogado = no-op.
 */
export async function pushTombstone(tabela: string, itemId: string, excluidoEm?: string): Promise<void> {
  try {
    if (!tabela || !itemId) return;
    if (!(await hasSession()) || !supabase) return;
    await supabase
      .from('exclusoes')
      .upsert(
        { tabela, item_id: itemId, excluido_em: excluidoEm || new Date().toISOString() },
        { onConflict: 'user_id,tabela,item_id', ignoreDuplicates: true },
      );
  } catch {
    // espelho em background: nunca afeta o app local
  }
}

/**
 * Remove da NUVEM (public.exclusoes) os tombstones de uma lista de ids. Usado pelo
 * RESTORE: itens que o snapshot recupera precisam ter seu tombstone apagado, senão
 * o applyCloudTombstones do próximo sync os re-excluiria. Agrupa por tabela (1 delete
 * por tabela via `.in`). Só com sessão; NUNCA lança (offline = no-op).
 */
export async function limparTombstonesNuvem(ids: { tabela: string; itemId: string }[]): Promise<void> {
  try {
    if (!ids.length || !supabase || !(await hasSession())) return;
    const porTabela = new Map<string, string[]>();
    for (const { tabela, itemId } of ids) {
      if (!tabela || !itemId) continue;
      const lista = porTabela.get(tabela) ?? [];
      lista.push(itemId);
      porTabela.set(tabela, lista);
    }
    for (const [tabela, lista] of porTabela) {
      try {
        await supabase.from('exclusoes').delete().eq('tabela', tabela).in('item_id', lista);
      } catch {
        // best-effort por tabela
      }
    }
  } catch {
    // best-effort
  }
}

// ─── Guarda de timestamp do PULL (anti-perda de edição local) ────────────────
// Antes de sobrescrever um registro local com a versão da nuvem, checa se o LOCAL
// é mais novo (edição offline recente). Se for, o pull NÃO sobrescreve — assim,
// editar o mesmo orçamento/agendamento em dois aparelhos não apaga a versão mais
// recente. Na dúvida (sem timestamp) retorna false → upsert acontece (padrão antigo).
//
// IMPORTANTE: comparamos via Date.parse (epoch ms), NÃO por string. O timestamptz
// do Postgres pode chegar com offset (+00:00) ou precisão diferente do toISOString()
// do app — comparação lexicográfica quebraria silenciosamente; o parse é robusto.
function tsMaisNovo(localTs?: string | null, recebidoEm?: string): boolean {
  if (!localTs || !recebidoEm) return false;
  const a = Date.parse(localTs);
  const b = Date.parse(recebidoEm);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a > b;
}

/**
 * Guarda de timestamp do PUSH (anti-regressão da nuvem), em LOTE. Antes o push lia
 * o `atualizado_em` da nuvem com 1 SELECT por linha (N+1: com centenas de registros
 * o sync passava de segundos a minutos em rede móvel). Agora buscamos TODOS os
 * timestamps da tabela numa ÚNICA query e montamos um mapa `id → atualizado_em`; o
 * guard vira um lookup local síncrono. `remoteCol` é o nome (fixo, interno) da
 * coluna de timestamp. NUNCA lança: na dúvida devolve mapa vazio → o push acontece
 * (mantém o last-writer-wins antigo como piso seguro).
 */
async function carregarTimestampsRemotos(table: SyncTable, remoteCol: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!supabase) return mapa;
  try {
    // `remoteCol` é um literal interno ('atualizado_em'), nunca entrada externa.
    const { data, error } = await supabase.from(table).select(`id, ${remoteCol}`);
    if (error || !Array.isArray(data)) return mapa;
    for (const row of data) {
      const id = (row as any)?.id as string | undefined;
      const ts = (row as any)?.[remoteCol] as string | undefined;
      if (id && ts) mapa.set(id, ts);
    }
  } catch {
    // best-effort: mapa vazio faz o push acontecer (piso seguro)
  }
  return mapa;
}

/**
 * Consulta o mapa de timestamps remotos: true se a NUVEM for mais nova que o local
 * (→ push PULADO, preserva a versão remota). Lookup local, sem round-trip.
 */
function remoteMaisNovoNoMapa(mapa: Map<string, string>, id: string, localTs?: string | null): boolean {
  if (!localTs) return false;
  return tsMaisNovo(mapa.get(id), localTs);
}

async function localMaisNovoOrcamento(id: string, recebidoEm?: string): Promise<boolean> {
  if (!recebidoEm) return false;
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ ts: string | null }>(
      "SELECT json_extract(data, '$.atualizadoEm') AS ts FROM orcamentos WHERE id = ?", [id],
    );
    return tsMaisNovo(row?.ts, recebidoEm);
  } catch {
    return false;
  }
}

async function localMaisNovoAgendamento(id: string, recebidoEm?: string): Promise<boolean> {
  if (!recebidoEm) return false;
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ ts: string | null }>(
      'SELECT atualizado_em AS ts FROM agendamentos WHERE id = ?', [id],
    );
    return tsMaisNovo(row?.ts, recebidoEm);
  } catch {
    return false;
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
  // Anti-perda: se o orçamento local for mais novo, preserva a edição local.
  if (await localMaisNovoOrcamento(o.id, o.atualizadoEm)) return;
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
  // Anti-perda: se o agendamento local for mais novo, preserva a edição local.
  if (await localMaisNovoAgendamento(a.id, a.atualizadoEm)) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO agendamentos
       (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
     a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
     a.observacao ?? null, a.criadoEm, a.atualizadoEm],
  );
}

// ─── EXCLUSÕES (tombstones) — reconciliação nuvem ⇄ local ────────────────────
// Conjunto FIXO de tabelas que aceitam exclusão por id (todas as locais com PK
// `id` que sincronizam). Restringe os deletes locais a nomes conhecidos (jamais
// interpolamos um nome de tabela arbitrário vindo da nuvem em SQL).
const DELETABLE_TABLES = new Set<string>([
  'clientes', 'servicos', 'produtos', 'orcamentos', 'recibos', 'modelos', 'depoimentos', 'agendamentos',
]);

/** Apaga uma linha local por id, só para tabelas conhecidas. NUNCA lança. */
async function localDeleteById(tabela: string, itemId: string): Promise<void> {
  try {
    if (!DELETABLE_TABLES.has(tabela) || !itemId) return;
    const db = await getDb();
    // `tabela` é validada contra a allow-list acima antes de entrar no SQL.
    await db.runAsync(`DELETE FROM ${tabela} WHERE id = ?`, [itemId]);
  } catch {
    // best-effort
  }
}

/** Grava um tombstone no SQLite local (idempotente). NUNCA lança. */
async function localRecordTombstone(tabela: string, itemId: string, excluidoEm: string): Promise<void> {
  try {
    if (!tabela || !itemId) return;
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO exclusoes (tabela, item_id, excluido_em) VALUES (?,?,?)',
      [tabela, itemId, excluidoEm || new Date().toISOString()],
    );
  } catch {
    // best-effort
  }
}

/**
 * (a) Baixa os tombstones da nuvem e APAGA localmente esses ids (registrando o
 * tombstone local p/ o pull aditivo não re-subir a linha). Também limpa a linha
 * na nuvem (`removeRow`) por garantia — auto-cura caso o aparelho de origem não
 * tenha conseguido apagar, evitando que o pull seguinte ressuscite. NUNCA lança.
 */
async function applyCloudTombstones(geracao?: number): Promise<void> {
  try {
    if (!supabase) return;
    const { data, error } = await supabase.from('exclusoes').select('tabela, item_id, excluido_em');
    if (error || !Array.isArray(data)) return;
    for (const row of data) {
      if (syncAbortado(geracao)) return; // logout/wipe em voo → para de gravar
      try {
        const tabela = (row as any)?.tabela as string;
        const itemId = (row as any)?.item_id as string;
        if (!tabela || !itemId) continue;
        await localRecordTombstone(tabela, itemId, (row as any)?.excluido_em);
        await localDeleteById(tabela, itemId);
        if (DELETABLE_TABLES.has(tabela)) {
          await removeRow(tabela as SyncTable, itemId);
        }
      } catch {
        // pula tombstone problemático
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * (b) Sobe os tombstones LOCAIS para a nuvem e APAGA na nuvem os ids
 * correspondentes (`removeRow`). Cobre exclusões feitas offline neste aparelho.
 * Preserva o `excluido_em` ORIGINAL de cada tombstone (lê a coluna local e a
 * repassa a pushTombstone, que com `ignoreDuplicates` não refresca um carimbo já
 * na nuvem) — assim os tombstones envelhecem e a poda de 90 dias funciona de
 * verdade, em vez de "data do último sync" eterna. NUNCA lança.
 */
async function pushLocalTombstones(geracao?: number): Promise<void> {
  try {
    if (!supabase) return;
    const db = await getDb();
    const rows = await db.getAllAsync<any>('SELECT tabela, item_id, excluido_em FROM exclusoes');
    for (const r of rows) {
      if (syncAbortado(geracao)) return; // logout/wipe em voo → para de propagar
      try {
        const tabela = r?.tabela as string;
        const itemId = r?.item_id as string;
        if (!tabela || !itemId) continue;
        await pushTombstone(tabela, itemId, (r?.excluido_em as string) || undefined);
        if (DELETABLE_TABLES.has(tabela)) {
          await removeRow(tabela as SyncTable, itemId);
        }
      } catch {
        // pula tombstone problemático
      }
    }
  } catch {
    // best-effort
  }
}

// ─── PODA de tombstones (retenção) ───────────────────────────────────────────
// A tabela `exclusoes` só CRESCE (cada exclusão grava um tombstone). Sem poda, o
// SQLite local guarda um conjunto cada vez maior de tombstones para reprocessar.
// Retenção de 90 dias, apenas no LOCAL: podamos SÓ o SQLite deste aparelho e NUNCA
// os tombstones da NUVEM — a nuvem é a fonte da verdade das exclusões e precisa
// preservá-los para que um aparelho que ficou muito tempo sem sincronizar receba a
// exclusão quando voltar (apagar o tombstone remoto cedo demais faria esse aparelho
// re-subir a linha excluída, ressuscitando-a nos demais).
// CAVEAT (troca aceita): podar o tombstone LOCAL antes de a linha original sair
// deste SQLite não é possível aqui, pois o applyCloudTombstones já removeu a linha
// local ao aplicar o tombstone; mas um aparelho offline por >90 dias que ainda
// tenha a linha antiga localmente PODE re-subi-la no próximo push. É uma janela
// rara e conhecida; a proteção real (tombstone remoto perene) mitiga o caso comum.
const TOMBSTONE_RETENCAO_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias

/**
 * Apaga tombstones antigos (> 90 dias) SOMENTE no SQLite local, rodando DEPOIS do
 * push (para só podar o que já teve chance de propagar). Os tombstones da NUVEM são
 * intencionalmente preservados (fonte da verdade). Best-effort; NUNCA lança.
 */
async function podarTombstonesAntigos(): Promise<void> {
  const corte = new Date(Date.now() - TOMBSTONE_RETENCAO_MS).toISOString();
  // Local: SQLite compara ISO-8601 lexicograficamente de forma consistente (ambos
  // gerados por toISOString, mesmo formato/UTC) — seguro para o `<`.
  try {
    const db = await getDb();
    await db.runAsync('DELETE FROM exclusoes WHERE excluido_em < ?', [corte]);
  } catch {
    // best-effort local
  }
}

// ─── CONTADORES (numeração) — merge monotônico (nunca regride) ────────────────
/**
 * Funde os contadores locais com os da nuvem tomando SEMPRE o MAIOR valor por
 * chave (`Math.max`) e grava o máximo nos DOIS lados (local + nuvem, upsert por
 * `user_id,chave`). Garante numeração não-colidente entre aparelhos do mesmo
 * dono SEM nunca regredir um contador. NUNCA lança.
 */
async function syncContadores(geracao?: number): Promise<void> {
  try {
    if (!supabase) return;
    const db = await getDb();

    const locais = await db.getAllAsync<{ chave: string; valor: number }>(
      'SELECT chave, valor FROM contadores',
    );
    const max = new Map<string, number>();
    for (const l of locais) {
      if (l?.chave == null) continue;
      max.set(l.chave, Math.max(max.get(l.chave) ?? 0, Number(l.valor) || 0));
    }

    const { data, error } = await supabase.from('contadores').select('chave, valor');
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const chave = (row as any)?.chave as string;
        if (chave == null) continue;
        const valor = Number((row as any)?.valor) || 0;
        max.set(chave, Math.max(max.get(chave) ?? 0, valor));
      }
    }

    if (syncAbortado(geracao)) return; // logout/wipe em voo → não regrava contadores

    // Escreve o máximo de cada chave nos dois lados.
    for (const [chave, valor] of max) {
      try {
        await db.runAsync('INSERT OR REPLACE INTO contadores (chave, valor) VALUES (?, ?)', [chave, valor]);
      } catch {
        // best-effort local
      }
      try {
        await supabase.from('contadores').upsert({ chave, valor }, { onConflict: 'user_id,chave' });
      } catch {
        // best-effort nuvem
      }
    }
  } catch {
    // best-effort
  }
}

// ─── PULL ALL (nuvem → SQLite local, caminho silencioso) ─────────────────────
/**
 * Lê todas as tabelas da nuvem e grava no SQLite SEM re-disparar push.
 * Aparelho novo logando: traz os dados de volta. NUNCA lança.
 *
 * Antes do pull ADITIVO de linhas, aplica os tombstones da nuvem (apaga local +
 * registra tombstone) para um registro deletado NÃO reaparecer. Também funde os
 * contadores (numeração) tomando o maior valor.
 */
export async function pullAll(geracao?: number): Promise<void> {
  try {
    if (!(await hasSession()) || !supabase) return;

    // 1) Exclusões primeiro: garante que o pull aditivo abaixo não ressuscite ids.
    await applyCloudTombstones(geracao);
    if (syncAbortado(geracao)) return;

    // empresa (uma linha por usuário)
    try {
      const { data } = await supabase.from('empresa').select('*').maybeSingle();
      if (syncAbortado(geracao)) return;
      const emp = rowToEmpresa(data);
      if (emp) await localUpsertEmpresa(emp);
    } catch {}

    await pullTable<Cliente>('clientes', rowToCliente, localUpsertCliente, geracao);
    await pullTable<ServicoItem>('servicos', rowToServico, localUpsertServico, geracao);
    await pullTable<ProdutoItem>('produtos', rowToProduto, localUpsertProduto, geracao);
    await pullTable<Orcamento>('orcamentos', rowToOrcamento, localUpsertOrcamento, geracao);
    await pullTable<Recibo>('recibos', rowToRecibo, localUpsertRecibo, geracao);
    await pullTable<ModeloOrcamento>('modelos', rowToModelo, localUpsertModelo, geracao);
    await pullTable<Depoimento>('depoimentos', rowToDepoimento, localUpsertDepoimento, geracao);
    await pullTable<Agendamento>('agendamentos', rowToAgendamento, localUpsertAgendamento, geracao);
    if (syncAbortado(geracao)) return;

    // Numeração: funde contadores (maior valor vence) entre local e nuvem.
    await syncContadores(geracao);
  } catch {
    // pull é best-effort; falha não afeta o app local
  }
}

/** Lê uma tabela e grava cada linha no SQLite (silencioso). Tolera fromRow nulo. */
async function pullTable<T>(
  table: SyncTable,
  fromRow: (row: any) => T | null,
  localUpsert: (obj: T) => Promise<void>,
  geracao?: number,
): Promise<void> {
  try {
    if (!supabase) return;
    const { data, error } = await supabase.from(table).select('*');
    if (error || !Array.isArray(data)) return;
    for (const row of data) {
      if (syncAbortado(geracao)) return; // logout/wipe em voo → para de gravar
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
 *
 * GUARDA DE TIMESTAMP NO PUSH: para as tabelas que carregam timestamp de edição
 * (`atualizadoEm` → coluna `atualizado_em`: orcamentos e agendamentos) o push é
 * CONDICIONAL — antes de sobrescrever, compara com o `atualizado_em` da nuvem e
 * PULA o upsert se a nuvem for mais nova (edição feita em outro aparelho entre o
 * pull e o push, ou snapshot antigo recém-restaurado). Isso fecha o last-writer-
 * wins cego que podia reverter, no painel, trabalho mais recente. Os timestamps
 * remotos dessas duas tabelas são buscados em LOTE (uma query cada) ANTES do loop —
 * o guard vira lookup no mapa, sem N+1. As demais tabelas
 * (empresa/clientes/servicos/produtos/recibos/modelos/depoimentos) não têm
 * timestamp de EDIÇÃO no modelo do app (só `criado_em`/linha única) e seguem no
 * upsert direto. NUNCA lança: na dúvida (offline/sem timestamp) o push acontece.
 */
export async function pushAllLocal(geracao?: number): Promise<void> {
  try {
    if (!(await hasSession()) || !supabase) return;
    const db = await getDb();

    // empresa (uma linha por usuário; sem timestamp de edição → upsert direto).
    try {
      const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM empresa LIMIT 1');
      if (row?.data) await pushRowUnchecked('empresa', JSON.parse(row.data) as Empresa);
    } catch {}

    // Timestamps remotos em LOTE (1 query por tabela) para o guard anti-regressão.
    const tsOrcamentos = await carregarTimestampsRemotos('orcamentos', 'atualizado_em');
    const tsAgendamentos = await carregarTimestampsRemotos('agendamentos', 'atualizado_em');

    await pushTable('clientes', 'SELECT * FROM clientes', rowToClienteLocal, undefined, geracao);
    await pushTable('servicos', 'SELECT * FROM servicos', rowToServicoLocal, undefined, geracao);
    await pushTable('produtos', 'SELECT * FROM produtos', rowToProdutoLocal, undefined, geracao);
    await pushTable('orcamentos', 'SELECT data FROM orcamentos', (r: any) => JSON.parse(r.data) as Orcamento,
      (o) => remoteMaisNovoNoMapa(tsOrcamentos, o.id, o.atualizadoEm), geracao);
    await pushTable('recibos', 'SELECT data FROM recibos', (r: any) => JSON.parse(r.data) as Recibo, undefined, geracao);
    await pushTable('modelos', 'SELECT * FROM modelos', (r: any) => ({
      id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
      orcamentoBase: JSON.parse(r.data), criadoEm: r.criado_em,
    } as ModeloOrcamento), undefined, geracao);
    await pushTable('depoimentos', 'SELECT * FROM depoimentos', rowToDepoimentoLocal, undefined, geracao);
    await pushTable('agendamentos', 'SELECT * FROM agendamentos', rowToAgendamentoLocal,
      (a) => remoteMaisNovoNoMapa(tsAgendamentos, a.id, a.atualizadoEm), geracao);
    if (syncAbortado(geracao)) return;

    // Numeração: funde contadores (maior valor vence) entre local e nuvem.
    await syncContadores(geracao);
  } catch {
    // best-effort
  }
}

/**
 * Lê linhas locais via SQL, mapeia para o objeto do app e faz upsert de cada.
 * Usa `pushRowUnchecked` — pushAllLocal já validou a sessão antes de chamar.
 * `guard` (opcional, SÍNCRONO): recebe o objeto e retorna true se a NUVEM for mais
 * nova — nesse caso o item é PULADO (não sobrescreve a versão remota mais recente).
 */
async function pushTable<T>(
  table: SyncTable,
  sql: string,
  toLocal: (row: any) => T,
  guard?: (obj: T) => boolean,
  geracao?: number,
): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(sql);
    for (const r of rows) {
      if (syncAbortado(geracao)) return; // logout/wipe em voo → para de empurrar
      try {
        const obj = toLocal(r);
        if (guard && guard(obj)) continue; // nuvem mais nova → não regride
        await pushRowUnchecked(table, obj);
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

// ─── SINAL DE CONCLUSÃO DO SYNC (para as telas recarregarem) ─────────────────
// O sync roda em background (fire-and-forget) e o pullAll escreve DIRETO no
// SQLite. As telas carregam via useFocusEffect no mount — num aparelho recém-
// logado a tela pode abrir ANTES do pull terminar e mostrar estado vazio. Este
// registrador simples de callbacks permite às telas se inscreverem e refazerem
// o fetch quando o pull traz dados novos, sem acoplar cloudSync a nenhuma UI.
type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

/**
 * Inscreve um callback disparado quando o pull da nuvem GRAVA dados novos no
 * SQLite (ou seja, quando vale a pena a tela recarregar). Retorna a função de
 * cancelamento (chame no cleanup do efeito). Padrão de subscribe já usado no app.
 */
export function onSyncAplicado(fn: SyncListener): () => void {
  syncListeners.add(fn);
  return () => {
    syncListeners.delete(fn);
  };
}

/** Notifica os inscritos. NUNCA lança: um listener quebrado não afeta o sync. */
function notificarSyncAplicado(): void {
  for (const fn of syncListeners) {
    try {
      fn();
    } catch {
      // um listener com erro não pode quebrar o sync nem os demais
    }
  }
}

// ─── SYNC ON LOGIN ───────────────────────────────────────────────────────────
let syncing = false;

// Geração do sync (token de aborto). Cada `syncOnLogin` captura o valor atual no
// início e o carrega ao longo do pipeline; antes de CADA gravação local checa se
// a geração ainda é a corrente. `abortarSyncEmAndamento` incrementa este token,
// invalidando na hora qualquer sync em voo — usado no logout com "apagar dados"
// para nenhuma escrita de um pull já em andamento reinserir dados DEPOIS do wipe.
let syncGeneration = 0;

/**
 * Invalida qualquer `syncOnLogin` em andamento: a próxima checagem de geração no
 * pipeline (antes da próxima gravação local) faz o sync parar sem gravar mais
 * nada. Também libera a flag de reentrância para um novo login poder sincronizar.
 * Chamado no início do fluxo de logout-com-limpeza, ANTES do clearAllLocalData,
 * para fechar a corrida "escrita do pull cai depois do wipe". Síncrono; NUNCA lança.
 */
export function abortarSyncEmAndamento(): void {
  syncGeneration++;
  syncing = false;
}

/**
 * true se a geração capturada no início do sync já não é a corrente — ou seja,
 * `abortarSyncEmAndamento` foi chamado no meio do caminho. Quando `geracao` é
 * undefined (pullAll/pushAllLocal chamados fora do syncOnLogin, ex.: restore), o
 * fluxo não participa do aborto e roda até o fim.
 */
function syncAbortado(geracao: number | undefined): boolean {
  return geracao !== undefined && geracao !== syncGeneration;
}

/**
 * No login (ordem importa):
 *  1) pullAll()           — aplica exclusões da nuvem, traz o estado da nuvem e
 *                           funde contadores. Vem ANTES para o aparelho recém-
 *                           logado NÃO sobrescrever a nuvem com dado velho.
 *  2) pushLocalTombstones() — propaga p/ a nuvem as exclusões feitas offline
 *                           neste aparelho (apaga as linhas correspondentes lá).
 *  3) pushAllLocal()      — sobe as linhas locais sobreviventes (e funde de novo
 *                           os contadores). Como os ids excluídos já saíram do
 *                           SQLite, nada é ressuscitado.
 *  4) podarTombstonesAntigos() — poda tombstones > 90 dias no LOCAL para a tabela
 *                           `exclusoes` não crescer sem limite e degradar o sync.
 *                           Roda DEPOIS do push (só poda o que já propagou).
 * Ao terminar, reconcilia os lembretes de agenda (o pull grava agendamentos
 * direto no SQLite, sem reagendar notificações) e notifica os inscritos
 * (onSyncAplicado) para as telas recarregarem.
 * NÃO bloqueia a UI: roda em background e NUNCA lança. Reentrância por flag.
 * Cancelável por `abortarSyncEmAndamento` (checagem de geração antes de gravar).
 */
export async function syncOnLogin(): Promise<void> {
  if (syncing) return;
  syncing = true;
  const geracao = syncGeneration;
  try {
    if (!(await hasSession())) return;
    await pullAll(geracao);
    if (syncAbortado(geracao)) return;
    await pushLocalTombstones(geracao);
    if (syncAbortado(geracao)) return;
    await pushAllLocal(geracao);
    if (syncAbortado(geracao)) return;
    await podarTombstonesAntigos();
    // O pull gravou agendamentos direto no SQLite sem tocar nas notificações:
    // reconcilia os lembretes locais com o estado novo (reagenda/cancela). Import
    // tardio p/ não acoplar cloudSync ao módulo de agenda no grafo estático (evita
    // ciclo de carga). Fire-and-forget: falha de notificação não afeta o sync.
    void import('./agenda')
      .then(m => m.resincronizarLembretes())
      .catch(() => {});
    // Sinaliza que a nuvem já foi baixada para o SQLite: as telas que se
    // inscreveram refazem o fetch e o estado "vazio" inicial some sozinho.
    notificarSyncAplicado();
  } catch {
    // sync de fundo: nunca quebra a sessão / UX
  } finally {
    // Só zera a flag se ninguém abortou no meio (o abort já a zerou e pode ter
    // liberado um novo sync); assim não sobrescrevemos o estado de um novo login.
    if (!syncAbortado(geracao)) syncing = false;
  }
}
