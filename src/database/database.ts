import * as SQLite from 'expo-sqlite';
import { Cliente, ServicoItem, ProdutoItem, Orcamento, Recibo, Empresa, ModeloOrcamento, Depoimento, CodigoErro, CasoErro, Agendamento } from '../types';
import codigosErroSeed from '../../assets/codigos_erro.json';
import { pushRow, removeRow, pushTombstone, pushAllLocal } from '../services/cloudSync';

/**
 * Espelha uma mutação local na nuvem (painel web) em background.
 * Fire-and-forget: o SQLite é a fonte da verdade; este espelho NUNCA pode
 * afetar o save local. `pushRow`/`removeRow` já engolem erros internamente,
 * mas envolvemos em try/catch + `.catch` por garantia (offline/deslogado = no-op).
 */
function mirrorPush(table: Parameters<typeof pushRow>[0], obj: unknown): void {
  try {
    void pushRow(table, obj).catch(() => {});
  } catch {
    // espelho em background nunca quebra o app local
  }
}

function mirrorRemove(table: Parameters<typeof removeRow>[0], id: string): void {
  try {
    void removeRow(table, id).catch(() => {});
  } catch {
    // idem
  }
}

/**
 * Registra um TOMBSTONE de exclusão: grava localmente em `exclusoes` (para o
 * pullAll não ressuscitar o id) e empurra para a nuvem (fire-and-forget) para a
 * exclusão convergir entre aparelhos e o painel. Local-first: roda em background
 * e NUNCA lança — offline / deslogado apenas mantém o tombstone local (que sobe
 * no próximo login via syncOnLogin).
 */
function registrarExclusao(table: string, id: string): void {
  try {
    void (async () => {
      try {
        const database = await getDb();
        await database.runAsync(
          'INSERT OR REPLACE INTO exclusoes (tabela, item_id, excluido_em) VALUES (?,?,?)',
          [table, id, new Date().toISOString()],
        );
      } catch {
        // o tombstone local é best-effort; jamais quebra o delete local
      }
      try {
        await pushTombstone(table, id);
      } catch {
        // espelho em background: nunca afeta o app local
      }
    })().catch(() => {});
  } catch {
    // idem
  }
}

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

    -- Tombstones de exclusão: registram o que foi apagado localmente para a
    -- exclusão CONVERGIR entre aparelhos e o painel (pullAll é só aditivo; sem
    -- isto, um registro deletado reaparece ao baixar da nuvem). Sincronizada
    -- com a tabela nuvem public.exclusoes (migration 0005).
    CREATE TABLE IF NOT EXISTS exclusoes (
      tabela TEXT NOT NULL,
      item_id TEXT NOT NULL,
      excluido_em TEXT NOT NULL,
      PRIMARY KEY (tabela, item_id)
    );

    -- Etapa 0.3 — cache de diagnóstico IA por (código+marca). A IA só é chamada
    -- quando não há cache; protege a margem e serve de fallback.
    CREATE TABLE IF NOT EXISTS cache_ia (
      chave TEXT PRIMARY KEY,
      resposta TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );

    -- Etapa 0.4 — instrumentação de eventos desde o dia 1 (funil/uso/IA).
    CREATE TABLE IF NOT EXISTS eventos (
      id TEXT PRIMARY KEY,
      evento TEXT NOT NULL,
      props TEXT,
      criado_em TEXT NOT NULL
    );

    -- Etapa 1.1 — base de 602 códigos de erro (importada de assets na 1ª abertura).
    CREATE TABLE IF NOT EXISTS codigos_erro (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT NOT NULL,
      familia TEXT,
      tipo TEXT,
      codigo TEXT,
      exibicao TEXT,
      falha TEXT,
      cat_bruta TEXT,
      cat_app TEXT,
      severidade TEXT,
      causa TEXT,
      acao TEXT,
      confianca TEXT,
      fonte_id TEXT,
      url TEXT,
      obs TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_codigos_marca ON codigos_erro (marca);
    CREATE INDEX IF NOT EXISTS idx_codigos_codigo ON codigos_erro (codigo);

    -- Etapa 1.6 — casos "não achei meu erro" para enriquecer a base.
    CREATE TABLE IF NOT EXISTS casos_erro (
      id TEXT PRIMARY KEY,
      marca TEXT,
      modelo TEXT,
      codigo TEXT,
      sintoma TEXT,
      criado_em TEXT NOT NULL
    );

    -- Fase 2 — agenda do prestador (visitas, instalações, manutenções…).
    CREATE TABLE IF NOT EXISTS agendamentos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT,
      cliente_nome TEXT NOT NULL,
      titulo TEXT NOT NULL,
      tipo TEXT NOT NULL,
      inicio TEXT NOT NULL,
      fim TEXT,
      endereco TEXT,
      status TEXT NOT NULL DEFAULT 'agendado',
      orcamento_id TEXT,
      observacao TEXT,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agendamentos_inicio ON agendamentos (inicio);
  `);

  await runMigrations(database);
  await seedCodigosErro(database);

  // Sem dados-semente falsos: instalações novas começam SEM empresa e SEM
  // depoimentos. O usuário cadastra a própria empresa em "Meu Negócio" (as telas
  // que usam empresa toleram null). O único seed real é o de `codigos_erro` acima.
}

// Versão atual do schema LOCAL. Faça BUMP a cada alteração de COLUNA (ALTER TABLE),
// adicionando um bloco `if (v < N)` em runMigrations. Sem isto, CREATE TABLE IF NOT
// EXISTS é no-op em bancos JÁ instalados e a coluna nova nunca chega ao campo →
// crash "no such column" em produção. O framework agora existe; basta usá-lo.
const SCHEMA_VERSION = 1;

/**
 * Migrador incremental do SQLite via PRAGMA user_version. Em instalações novas o
 * baseline já foi criado pelos CREATE TABLE IF NOT EXISTS acima (v=0 → grava a
 * versão atual). Em releases futuros, adicione blocos sequenciais idempotentes.
 */
async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const v = row?.user_version ?? 0;
  if (v >= SCHEMA_VERSION) return;

  // v < 1: baseline (todas as tabelas já criadas acima). Sem migração de coluna ainda.
  // EXEMPLO de migração futura — ao adicionar uma coluna, descomente e ajuste:
  //   if (v < 2) {
  //     await database.execAsync("ALTER TABLE clientes ADD COLUMN atualizado_em TEXT");
  //   }

  await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/**
 * Etapa 1.2 — importa os 602 códigos de erro do asset na primeira abertura.
 * Idempotente: só insere se a tabela estiver vazia. Tudo em uma transação.
 */
async function seedCodigosErro(database: SQLite.SQLiteDatabase) {
  const row = await database.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM codigos_erro');
  if ((row?.c ?? 0) > 0) return;
  const seed = codigosErroSeed as any[];
  if (!Array.isArray(seed) || seed.length === 0) return;
  await database.withTransactionAsync(async () => {
    for (const c of seed) {
      await database.runAsync(
        `INSERT INTO codigos_erro
           (marca, familia, tipo, codigo, exibicao, falha, cat_bruta, cat_app, severidade, causa, acao, confianca, fonte_id, url, obs)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [c.marca ?? '', c.familia ?? '', c.tipo ?? '', c.codigo ?? '',
         c.exibicao ?? '', c.falha ?? '', c.catBruta ?? '', c.catApp ?? '',
         c.severidade ?? '', c.causa ?? '', c.acao ?? '', c.confianca ?? '',
         c.fonteId ?? '', c.url ?? '', c.obs ?? '']
      );
    }
  });
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
  mirrorPush('empresa', empresa);
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
  mirrorPush('clientes', cliente);
}

export async function deleteCliente(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM clientes WHERE id = ?', [id]);
  mirrorRemove('clientes', id);
  registrarExclusao('clientes', id);
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
  mirrorPush('servicos', s);
}

export async function deleteServico(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM servicos WHERE id = ?', [id]);
  mirrorRemove('servicos', id);
  registrarExclusao('servicos', id);
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
  mirrorPush('produtos', p);
}

export async function deleteProduto(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM produtos WHERE id = ?', [id]);
  mirrorRemove('produtos', id);
  registrarExclusao('produtos', id);
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
  // Ordena pela DATA DE CRIAÇÃO (mais novo primeiro). O `id` é UUID (ordem
  // aleatória); a data real mora no blob JSON (`data.$.criadoEm`), pois a tabela
  // local guarda só (id, numero, data). `json_extract` (JSON1, embutido no
  // SQLite do Expo) lê a chave; o tiebreaker por `numero` cobre linhas legadas
  // sem `criadoEm`.
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM orcamentos ORDER BY json_extract(data, '$.criadoEm') DESC, numero DESC",
  );
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
  mirrorPush('orcamentos', o);
}

export async function deleteOrcamento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM orcamentos WHERE id = ?', [id]);
  mirrorRemove('orcamentos', id);
  registrarExclusao('orcamentos', id);
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
  // Mesma lógica de getOrcamentos: ordena por data de criação (mais novo
  // primeiro), extraída do blob JSON, com fallback por `numero`.
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM recibos ORDER BY json_extract(data, '$.criadoEm') DESC, numero DESC",
  );
  return rows.map(r => JSON.parse(r.data));
}

export async function saveRecibo(r: Recibo): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
    [r.id, r.numero, JSON.stringify(r)]
  );
  mirrorPush('recibos', r);
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
  mirrorPush('modelos', m);
}

export async function deleteModelo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM modelos WHERE id = ?', [id]);
  mirrorRemove('modelos', id);
  registrarExclusao('modelos', id);
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
  mirrorPush('depoimentos', d);
}

export async function deleteDepoimento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM depoimentos WHERE id = ?', [id]);
  mirrorRemove('depoimentos', id);
  registrarExclusao('depoimentos', id);
}

// ─── CACHE DE IA (Etapa 0.3) ─────────────────────────────
/** Lê a resposta cacheada para uma chave (ex.: `diag:Midea:E4`), ou null. */
export async function getCacheIA(chave: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ resposta: string }>(
    'SELECT resposta FROM cache_ia WHERE chave = ?', [chave]
  );
  return row?.resposta ?? null;
}

/** Grava/atualiza a resposta de IA no cache. */
export async function setCacheIA(chave: string, resposta: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO cache_ia (chave, resposta, criado_em) VALUES (?,?,?)',
    [chave, resposta, new Date().toISOString()]
  );
}

// ─── EVENTOS / ANALYTICS (Etapa 0.4) ─────────────────────
/**
 * Grava um evento de uso (funil/IA/diagnóstico). Nunca lança: instrumentação
 * jamais deve quebrar a UX. Use via `track()` em services/analytics.ts.
 */
export async function insertEvento(id: string, evento: string, props?: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO eventos (id, evento, props, criado_em) VALUES (?,?,?,?)',
      [id, evento, props ? JSON.stringify(props) : null, new Date().toISOString()]
    );
  } catch {
    // silencioso de propósito
  }
}

/** Lê os eventos mais recentes (para o futuro painel master / depuração). */
export async function getEventos(limit = 200): Promise<{ id: string; evento: string; props: any; criadoEm: string }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM eventos ORDER BY criado_em DESC LIMIT ?', [limit]);
  return rows.map(r => ({ id: r.id, evento: r.evento, props: r.props ? JSON.parse(r.props) : null, criadoEm: r.criado_em }));
}

// ─── CÓDIGOS DE ERRO (Etapa 1) ───────────────────────────
function rowToCodigoErro(r: any): CodigoErro {
  return {
    id: r.id, marca: r.marca, familia: r.familia ?? '', tipo: r.tipo ?? '',
    codigo: r.codigo ?? '', exibicao: r.exibicao ?? '', falha: r.falha ?? '',
    catBruta: r.cat_bruta ?? '', catApp: r.cat_app ?? '', severidade: r.severidade ?? '',
    causa: r.causa ?? '', acao: r.acao ?? '', confianca: r.confianca ?? '',
    fonteId: r.fonte_id ?? '', url: r.url ?? '', obs: r.obs ?? '',
  };
}

/** Lista as marcas distintas (para os chips de filtro), em ordem alfabética. */
export async function getMarcasErro(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ marca: string }>('SELECT DISTINCT marca FROM codigos_erro ORDER BY marca ASC');
  return rows.map(r => r.marca);
}

export async function countCodigosErro(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM codigos_erro');
  return row?.c ?? 0;
}

/**
 * Busca códigos de erro com filtro opcional por marca e por texto livre
 * (código, falha, sintoma/causa, ação ou exibição "LED piscando").
 */
export async function searchCodigosErro(opts: { marca?: string | null; q?: string }): Promise<CodigoErro[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: any[] = [];
  if (opts.marca) { where.push('marca = ?'); params.push(opts.marca); }
  const q = opts.q?.trim();
  if (q) {
    where.push('(codigo LIKE ? OR falha LIKE ? OR causa LIKE ? OR acao LIKE ? OR exibicao LIKE ? OR cat_app LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  const sql =
    'SELECT * FROM codigos_erro' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY marca ASC, codigo ASC LIMIT 200';
  const rows = await db.getAllAsync<any>(sql, params);
  return rows.map(rowToCodigoErro);
}

// ─── CASOS "NÃO ACHEI MEU ERRO" (Etapa 1.6) ──────────────
export async function saveCasoErro(caso: CasoErro): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO casos_erro (id, marca, modelo, codigo, sintoma, criado_em) VALUES (?,?,?,?,?,?)',
    [caso.id, caso.marca ?? null, caso.modelo ?? null, caso.codigo ?? null, caso.sintoma ?? null, caso.criadoEm]
  );
}

export async function getCasosErro(): Promise<CasoErro[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM casos_erro ORDER BY criado_em DESC');
  return rows.map(r => ({
    id: r.id, marca: r.marca ?? undefined, modelo: r.modelo ?? undefined,
    codigo: r.codigo ?? undefined, sintoma: r.sintoma ?? undefined, criadoEm: r.criado_em,
  }));
}

// ─── AGENDAMENTOS (Fase 2 — usados no backup; CRoUD em services/agenda.ts) ─
function rowToAgendamentoLocal(r: any): Agendamento {
  return {
    id: r.id, clienteId: r.cliente_id ?? undefined, clienteNome: r.cliente_nome,
    titulo: r.titulo, tipo: r.tipo, inicio: r.inicio, fim: r.fim ?? undefined,
    endereco: r.endereco ?? undefined, status: r.status,
    orcamentoId: r.orcamento_id ?? undefined, observacao: r.observacao ?? undefined,
    criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
  };
}

async function getAgendamentosForBackup(): Promise<Agendamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM agendamentos ORDER BY inicio ASC');
  return rows.map(rowToAgendamentoLocal);
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
  agendamentos: Agendamento[];
  /** Contadores de numeração (orcamento/recibo). Restaurados p/ a sequência não regredir/colidir. */
  contadores?: Record<string, number>;
}

/** Lê os contadores de numeração para o backup (chave → valor). */
async function getContadoresForBackup(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ chave: string; valor: number }>('SELECT chave, valor FROM contadores');
  const out: Record<string, number> = {};
  for (const r of rows) out[r.chave] = Number(r.valor) || 0;
  return out;
}

export async function exportAllData(): Promise<BackupSnapshot> {
  const [empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos, agendamentos, contadores] = await Promise.all([
    getEmpresa(), getClientes(), getServicos(), getProdutos(),
    getOrcamentos(), getRecibos(), getModelos(), getDepoimentos(), getAgendamentosForBackup(), getContadoresForBackup(),
  ]);
  return {
    version: 2, exportedAt: new Date().toISOString(),
    empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos, agendamentos, contadores,
  };
}

/**
 * Substitui TODO o conteúdo local pelos dados do snapshot (restauração).
 * ATÔMICO: roda dentro de uma transação — se qualquer passo falhar, faz
 * ROLLBACK e os dados locais permanecem intactos (nunca perde tudo no meio).
 * Valida o snapshot ANTES de apagar qualquer coisa.
 */
export async function importAllData(data: Partial<BackupSnapshot>, opts: { pushToCloud?: boolean } = {}): Promise<void> {
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
  const agendamentos = asArray<Agendamento>(data.agendamentos);

  const db = await getDb();
  // Dentro da transação usamos upserts LOCAIS SILENCIOSOS (runAsync direto, SEM
  // mirrorPush) para não disparar uma tempestade de rede no meio da restauração.
  // UM ÚNICO pushAllLocal() é disparado DEPOIS do commit (fire-and-forget).
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM clientes; DELETE FROM servicos; DELETE FROM produtos;
      DELETE FROM orcamentos; DELETE FROM recibos; DELETE FROM modelos; DELETE FROM depoimentos;
      DELETE FROM agendamentos;
    `);
    if (data.empresa) {
      await db.runAsync('INSERT OR REPLACE INTO empresa (id, data) VALUES (?, ?)', [
        data.empresa.id, JSON.stringify(data.empresa),
      ]);
    }
    for (const c of clientes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO clientes
         (id, nome, telefone, cpf, cnpj, endereco, complemento, estado, cidade, cep, criado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [c.id, c.nome, c.telefone, c.cpf ?? null, c.cnpj ?? null, c.endereco ?? null,
         c.complemento ?? null, c.estado ?? null, c.cidade ?? null, c.cep ?? null, c.criadoEm],
      );
    }
    for (const s of servicos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO servicos (id, nome, descricao, preco, custo, unidade, foto_uri, criado_em)
         VALUES (?,?,?,?,?,?,?,?)`,
        [s.id, s.nome, s.descricao ?? null, s.preco, s.custo ?? null, s.unidade, s.fotoUri ?? null, s.criadoEm],
      );
    }
    for (const p of produtos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO produtos
         (id, nome, descricao, preco, custo, marca, modelo, unidade, foto_uri, criado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.nome, p.descricao ?? null, p.preco, p.custo ?? null, p.marca ?? null,
         p.modelo ?? null, p.unidade, p.fotoUri ?? null, p.criadoEm],
      );
    }
    for (const o of orcamentos) {
      await db.runAsync('INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)',
        [o.id, o.numero, JSON.stringify(o)]);
    }
    for (const r of recibos) {
      await db.runAsync('INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
        [r.id, r.numero, JSON.stringify(r)]);
    }
    for (const m of modelos) {
      await db.runAsync('INSERT OR REPLACE INTO modelos (id, nome, descricao, data, criado_em) VALUES (?,?,?,?,?)',
        [m.id, m.nome, m.descricao ?? null, JSON.stringify(m.orcamentoBase), m.criadoEm]);
    }
    for (const d of depoimentos) {
      await db.runAsync('INSERT OR REPLACE INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em) VALUES (?,?,?,?,?)',
        [d.id, d.nomeCliente, d.estrelas, d.texto ?? null, d.criadoEm]);
    }
    for (const a of agendamentos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO agendamentos
           (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
         a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
         a.observacao ?? null, a.criadoEm, a.atualizadoEm],
      );
    }

    // Numeração: restaura os contadores do snapshot, com PISO no nº de registros
    // restaurados (Math.max) — a sequência nunca regride nem colide com números já
    // usados. (Snapshots antigos sem `contadores` caem no piso pela contagem.)
    const contadores = (data.contadores && typeof data.contadores === 'object') ? data.contadores : {};
    const cOrc = Math.max(Number(contadores['orcamento']) || 0, orcamentos.length);
    const cRec = Math.max(Number(contadores['recibo']) || 0, recibos.length);
    await db.runAsync('INSERT OR REPLACE INTO contadores (chave, valor) VALUES (?, ?)', ['orcamento', cOrc]);
    await db.runAsync('INSERT OR REPLACE INTO contadores (chave, valor) VALUES (?, ?)', ['recibo', cRec]);
  });

  // Espelho na nuvem só quando EXPLICITAMENTE pedido (ex.: importar arquivo local).
  // No RESTORE da nuvem (padrão) NÃO pushamos: o snapshot pode ser mais ANTIGO que
  // as tabelas relacionais atuais, e um push cego as reverteria (perda de dados). A
  // próxima sincronização (pullAll com guarda de timestamp) reconcilia com segurança.
  if (opts.pushToCloud) {
    try {
      void pushAllLocal().catch(() => {});
    } catch {
      // idem
    }
  }
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
