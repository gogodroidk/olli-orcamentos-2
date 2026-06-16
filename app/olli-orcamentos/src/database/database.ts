import * as SQLite from 'expo-sqlite';
import { Cliente, ServicoItem, ProdutoItem, Orcamento, Recibo, Empresa, ModeloOrcamento, Depoimento } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('olli_orcamentos.db');
    await initDb(db);
  }
  return db;
}

async function initDb(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS empresa (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT,
      cpf TEXT,
      cnpj TEXT,
      endereco TEXT,
      complemento TEXT,
      estado TEXT,
      cidade TEXT,
      cep TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servicos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      custo REAL,
      unidade TEXT DEFAULT 'un',
      foto_uri TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      custo REAL,
      marca TEXT,
      modelo TEXT,
      unidade TEXT DEFAULT 'un',
      foto_uri TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orcamentos (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recibos (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modelos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      data TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS depoimentos (
      id TEXT PRIMARY KEY,
      nome_cliente TEXT NOT NULL,
      estrelas INTEGER NOT NULL,
      texto TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contadores (
      chave TEXT PRIMARY KEY,
      valor INTEGER NOT NULL
    );
  `);

  // Insert default empresa data if not exists
  const empresaRow = await database.getFirstAsync<{ id: string }>('SELECT id FROM empresa LIMIT 1');
  if (!empresaRow) {
    const defaultEmpresa: Empresa = {
      id: 'empresa_1',
      nome: 'GR TECH Refrigeração',
      especialidade: 'Assistência técnica de Ar condicionado',
      slogan: 'Soluções em Climatização Comercial e Residencial',
      cnpj: '44.301.204/0001-38',
      cpf: '441.415.238-01',
      endereco: 'Rua Henrique Perdigão',
      cidade: 'São Paulo',
      estado: 'SP',
      telefone: '(11) 95875-8030',
      whatsapp: '11958758030',
      site: 'www.grtechrefrigeracao.com.br',
      email: 'contato@grtechrefrigeracao.com.br',
      chavePix: '44301204000138',
      normas: 'Execução conforme normas ABNT NBR 16401, SMACNA e ANVISA',
      nomePrestador: 'Igor De Souza',
    };
    await database.runAsync(
      'INSERT INTO empresa (id, data) VALUES (?, ?)',
      ['empresa_1', JSON.stringify(defaultEmpresa)]
    );

    // Insert default depoimentos
    const depoimentos: Depoimento[] = [
      { id: 'dep_1', nomeCliente: 'Wanessa Costa Broklin', estrelas: 5, criadoEm: new Date().toISOString() },
      { id: 'dep_2', nomeCliente: 'Tania Manente de Carvalho', estrelas: 5, criadoEm: new Date().toISOString() },
    ];
    for (const d of depoimentos) {
      await database.runAsync(
        'INSERT INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em) VALUES (?,?,?,?,?)',
        [d.id, d.nomeCliente, d.estrelas, d.texto ?? null, d.criadoEm]
      );
    }
  }
}

// ─── EMPRESA ─────────────────────────────────────────────
export async function getEmpresa(): Promise<Empresa | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM empresa LIMIT 1');
  return row ? JSON.parse(row.data) : null;
}

export async function saveEmpresa(empresa: Empresa): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO empresa (id, data) VALUES (?, ?)',
    [empresa.id, JSON.stringify(empresa)]
  );
}

// ─── CLIENTES ─────────────────────────────────────────────
export async function getClientes(): Promise<Cliente[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM clientes ORDER BY nome ASC');
  return rows.map(rowToCliente);
}

export async function searchClientes(q: string): Promise<Cliente[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM clientes WHERE nome LIKE ? OR telefone LIKE ? ORDER BY nome ASC',
    [`%${q}%`, `%${q}%`]
  );
  return rows.map(rowToCliente);
}

export async function saveCliente(cliente: Cliente): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO clientes
     (id, nome, telefone, cpf, cnpj, endereco, complemento, estado, cidade, cep, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [cliente.id, cliente.nome, cliente.telefone, cliente.cpf ?? null,
     cliente.cnpj ?? null, cliente.endereco ?? null, cliente.complemento ?? null,
     cliente.estado ?? null, cliente.cidade ?? null, cliente.cep ?? null,
     cliente.criadoEm]
  );
}

export async function deleteCliente(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM clientes WHERE id = ?', [id]);
}

function rowToCliente(r: any): Cliente {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone,
    cpf: r.cpf ?? undefined, cnpj: r.cnpj ?? undefined,
    endereco: r.endereco ?? undefined, complemento: r.complemento ?? undefined,
    estado: r.estado ?? undefined, cidade: r.cidade ?? undefined,
    cep: r.cep ?? undefined, criadoEm: r.criado_em,
  };
}

// ─── SERVIÇOS ─────────────────────────────────────────────
export async function getServicos(): Promise<ServicoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM servicos ORDER BY nome ASC');
  return rows.map(rowToServico);
}

export async function searchServicos(q: string): Promise<ServicoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM servicos WHERE nome LIKE ? ORDER BY nome ASC',
    [`%${q}%`]
  );
  return rows.map(rowToServico);
}

export async function saveServico(s: ServicoItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO servicos (id, nome, descricao, preco, custo, unidade, foto_uri, criado_em)
     VALUES (?,?,?,?,?,?,?,?)`,
    [s.id, s.nome, s.descricao ?? null, s.preco, s.custo ?? null,
     s.unidade, s.fotoUri ?? null, s.criadoEm]
  );
}

export async function deleteServico(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM servicos WHERE id = ?', [id]);
}

function rowToServico(r: any): ServicoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
  };
}

// ─── PRODUTOS ─────────────────────────────────────────────
export async function getProdutos(): Promise<ProdutoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM produtos ORDER BY nome ASC');
  return rows.map(rowToProduto);
}

export async function searchProdutos(q: string): Promise<ProdutoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM produtos WHERE nome LIKE ? ORDER BY nome ASC',
    [`%${q}%`]
  );
  return rows.map(rowToProduto);
}

export async function saveProduto(p: ProdutoItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO produtos
     (id, nome, descricao, preco, custo, marca, modelo, unidade, foto_uri, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [p.id, p.nome, p.descricao ?? null, p.preco, p.custo ?? null,
     p.marca ?? null, p.modelo ?? null, p.unidade, p.fotoUri ?? null, p.criadoEm]
  );
}

export async function deleteProduto(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM produtos WHERE id = ?', [id]);
}

function rowToProduto(r: any): ProdutoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, marca: r.marca ?? undefined,
    modelo: r.modelo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
  };
}

// ─── ORÇAMENTOS ─────────────────────────────────────────────
export async function getOrcamentos(): Promise<Orcamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM orcamentos ORDER BY id DESC');
  return rows.map(r => JSON.parse(r.data));
}

export async function getOrcamento(id: string): Promise<Orcamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM orcamentos WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) : null;
}

export async function saveOrcamento(o: Orcamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)',
    [o.id, o.numero, JSON.stringify(o)]
  );
}

export async function deleteOrcamento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM orcamentos WHERE id = ?', [id]);
}

/**
 * Contador monotônico: SEMPRE cresce, mesmo após excluir registros.
 * Na primeira vez, semeia a partir do total existente (migração suave),
 * evitando colidir com números já gerados pela versão antiga.
 */
async function proximoNaSequencia(chave: string, tabelaParaSemear: string): Promise<number> {
  const db = await getDb();
  let resultado = 1;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ valor: number }>('SELECT valor FROM contadores WHERE chave = ?', [chave]);
    let atual = row?.valor;
    if (atual == null) {
      const cnt = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${tabelaParaSemear}`);
      atual = cnt?.c ?? 0;
    }
    resultado = atual + 1;
    await db.runAsync('INSERT OR REPLACE INTO contadores (chave, valor) VALUES (?, ?)', [chave, resultado]);
  });
  return resultado;
}

export async function getNextOrcamentoNumber(): Promise<string> {
  const seq = await proximoNaSequencia('orcamento', 'orcamentos');
  const year = new Date().getFullYear().toString().slice(-2);
  return `${String(seq).padStart(3, '0')}${year}`;
}

// ─── RECIBOS ─────────────────────────────────────────────
export async function getRecibos(): Promise<Recibo[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM recibos ORDER BY id DESC');
  return rows.map(r => JSON.parse(r.data));
}

export async function saveRecibo(r: Recibo): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
    [r.id, r.numero, JSON.stringify(r)]
  );
}

export async function getNextReciboNumber(): Promise<string> {
  const seq = await proximoNaSequencia('recibo', 'recibos');
  const year = new Date().getFullYear().toString().slice(-2);
  return `REC-${String(seq).padStart(3, '0')}${year}`;
}

// ─── MODELOS ─────────────────────────────────────────────
export async function getModelos(): Promise<ModeloOrcamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM modelos ORDER BY criado_em DESC');
  return rows.map(r => ({ id: r.id, nome: r.nome, descricao: r.descricao, orcamentoBase: JSON.parse(r.data), criadoEm: r.criado_em }));
}

export async function saveModelo(m: ModeloOrcamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO modelos (id, nome, descricao, data, criado_em) VALUES (?,?,?,?,?)',
    [m.id, m.nome, m.descricao ?? null, JSON.stringify(m.orcamentoBase), m.criadoEm]
  );
}

export async function deleteModelo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM modelos WHERE id = ?', [id]);
}

// ─── DEPOIMENTOS ─────────────────────────────────────────────
export async function getDepoimentos(): Promise<Depoimento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM depoimentos ORDER BY criado_em DESC');
  return rows.map(r => ({ id: r.id, nomeCliente: r.nome_cliente, estrelas: r.estrelas, texto: r.texto ?? undefined, criadoEm: r.criado_em }));
}

export async function saveDepoimento(d: Depoimento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em) VALUES (?,?,?,?,?)',
    [d.id, d.nomeCliente, d.estrelas, d.texto ?? null, d.criadoEm]
  );
}

export async function deleteDepoimento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM depoimentos WHERE id = ?', [id]);
}

// ─── EXPORT / IMPORT (backup) ─────────────────────────────
export interface BackupSnapshot {
  version: number;
  exportedAt: string;
  empresa: Empresa | null;
  clientes: Cliente[];
  servicos: ServicoItem[];
  produtos: ProdutoItem[];
  orcamentos: Orcamento[];
  recibos: Recibo[];
  modelos: ModeloOrcamento[];
  depoimentos: Depoimento[];
}

export async function exportAllData(): Promise<BackupSnapshot> {
  const [empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos] = await Promise.all([
    getEmpresa(), getClientes(), getServicos(), getProdutos(),
    getOrcamentos(), getRecibos(), getModelos(), getDepoimentos(),
  ]);
  return {
    version: 1, exportedAt: new Date().toISOString(),
    empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos,
  };
}

/**
 * Substitui TODO o conteúdo local pelos dados do snapshot (restauração).
 * ATÔMICO: roda dentro de uma transação — se qualquer passo falhar, faz
 * ROLLBACK e os dados locais permanecem intactos (nunca perde tudo no meio).
 * Valida o snapshot ANTES de apagar qualquer coisa.
 */
export async function importAllData(data: Partial<BackupSnapshot>): Promise<void> {
  if (!data || typeof data !== 'object') {
    throw new Error('Backup inválido ou corrompido.');
  }
  const asArray = <T,>(x: any): T[] => (Array.isArray(x) ? x : []);
  const clientes = asArray<Cliente>(data.clientes);
  const servicos = asArray<ServicoItem>(data.servicos);
  const produtos = asArray<ProdutoItem>(data.produtos);
  const orcamentos = asArray<Orcamento>(data.orcamentos);
  const recibos = asArray<Recibo>(data.recibos);
  const modelos = asArray<ModeloOrcamento>(data.modelos);
  const depoimentos = asArray<Depoimento>(data.depoimentos);

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM clientes; DELETE FROM servicos; DELETE FROM produtos;
      DELETE FROM orcamentos; DELETE FROM recibos; DELETE FROM modelos; DELETE FROM depoimentos;
    `);
    if (data.empresa) await saveEmpresa(data.empresa);
    for (const c of clientes) await saveCliente(c);
    for (const s of servicos) await saveServico(s);
    for (const p of produtos) await saveProduto(p);
    for (const o of orcamentos) await saveOrcamento(o);
    for (const r of recibos) await saveRecibo(r);
    for (const m of modelos) await saveModelo(m);
    for (const d of depoimentos) await saveDepoimento(d);
  });
}

// ─── STATS ─────────────────────────────────────────────
export async function getStats() {
  const orcamentos = await getOrcamentos();
  const agora = new Date();
  const tresMesesAtras = new Date(agora.getFullYear(), agora.getMonth() - 3, 1);

  const recentes = orcamentos.filter(o => new Date(o.criadoEm) >= tresMesesAtras);

  return {
    totalOrcamentos: orcamentos.length,
    orcamentosRecentes: recentes.length,
    orcamentosAbertos: recentes.filter(o => o.status === 'enviado' || o.status === 'aguardando_assinatura').length,
    orcamentosAprovados: recentes.filter(o => o.status === 'aprovado').length,
    orcamentosRecusados: recentes.filter(o => o.status === 'recusado').length,
    faturamentoMes: recentes.filter(o => o.status === 'aprovado').reduce((sum, o) => sum + o.valorTotal, 0),
    ticketMedio: recentes.length > 0 ? recentes.reduce((sum, o) => sum + o.valorTotal, 0) / recentes.length : 0,
  };
}
