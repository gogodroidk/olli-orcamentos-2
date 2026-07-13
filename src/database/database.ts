import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Cliente, ServicoItem, ProdutoItem, Orcamento, Recibo, Empresa, ModeloOrcamento, Depoimento, CodigoErro, CasoErro, Agendamento, OrcamentoVersao, OrdemServico, ItemChecklist, StatusOS, Equipamento, SituacaoEquipamento, CriticidadeEquipamento, PmocPlano, PmocPlanoVersao, PmocOrdemGerada, StatusOrcamento, propostaJaEnviada } from '../types';
// codigos_erro.json (~365 KB) é carregado SOB DEMANDA em seedCodigosErro (lazy
// require), não como import estático — assim o boot não paga o parse quando o
// seed já rodou (achado da re-auditoria: "APK não incha" / peso do boot).
import { pushRow, removeRow, pushTombstone, pushAllLocal, limparTombstonesNuvem } from '../services/cloudSync';
import { cancelarTodosLembretes, resincronizarLembretes } from '../services/agenda';
import { cancelarTodosLembretesPmoc } from '../services/pmocLembretes';
import { APP_DATA_STORAGE_KEYS } from '../services/storageKeys';
import { generateId } from '../utils/id';

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
    // O handle só é PUBLICADO na variável de módulo depois que initDb (e portanto
    // runMigrations) termina. Publicá-lo antes deixaria, se um ALTER falhasse no
    // meio, um banco meio migrado em cache: como o guard é `if (!db)`, ninguém
    // retentaria a migração e a sessão inteira rodaria com metade das tabelas sem
    // a coluna nova ("no such column"). Falhando, nada fica em cache e a próxima
    // chamada tenta de novo.
    const aberto = await SQLite.openDatabaseAsync('olli_orcamentos.db');
    await initDb(aberto);
    db = aberto;
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

    -- A coluna 'atualizado_em' (relógio de sync) existe nestas tabelas desde a v3
    -- do schema. É o que permite ao cloudSync decidir quem vence um conflito: sem
    -- ela, um pull de linha ativa apagava um soft delete feito offline. Ver
    -- runMigrations. (Sem crase aqui: isto vive dentro de um template literal JS.)
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
      criado_em TEXT NOT NULL,
      excluido_em TEXT,
      atualizado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS servicos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      custo REAL,
      unidade TEXT DEFAULT 'un',
      foto_uri TEXT,
      criado_em TEXT NOT NULL,
      excluido_em TEXT,
      atualizado_em TEXT
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
      criado_em TEXT NOT NULL,
      excluido_em TEXT,
      atualizado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS orcamentos (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      data TEXT NOT NULL
    );
    -- dashboard-agg: índices de EXPRESSÃO sobre o blob JSON — sem eles, todo
    -- WHERE/ORDER BY json_extract(...) abaixo (agregados do dashboard + lista
    -- paginada) faz table scan lendo e parseando o TEXT de CADA linha. Com o
    -- índice, o SQLite resolve status/soft-delete/cliente pela B-tree sem
    -- tocar no blob inteiro. CREATE INDEX IF NOT EXISTS é idempotente — roda
    -- em toda abertura, não precisa entrar no framework de SCHEMA_VERSION.
    CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos (json_extract(data, '$.status'));
    CREATE INDEX IF NOT EXISTS idx_orcamentos_excluido ON orcamentos (json_extract(data, '$.excluidoEm'));
    CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON orcamentos (json_extract(data, '$.clienteId'));
    CREATE INDEX IF NOT EXISTS idx_orcamentos_criado ON orcamentos (json_extract(data, '$.criadoEm'));

    -- VERSÕES de orçamento (mestre 13.5) — snapshot congelado do orçamento ANTES
    -- de uma edição sobre uma proposta JÁ ENVIADA. Append-only (nunca se edita uma
    -- versão): a numeração é sequencial por orçamento. 'dados' guarda o Orcamento
    -- completo em JSON (mesmo padrão de 'orcamentos.data'). Sincroniza com a nuvem
    -- (public.orcamento_versoes) — ver migration 20260708_versoes.sql.
    CREATE TABLE IF NOT EXISTS orcamento_versoes (
      id TEXT PRIMARY KEY,
      orcamento_id TEXT NOT NULL,
      numero_versao INTEGER NOT NULL,
      dados TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orcamento_versoes_orc ON orcamento_versoes (orcamento_id, numero_versao);

    CREATE TABLE IF NOT EXISTS recibos (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      data TEXT NOT NULL
    );
    -- dashboard-agg: idem orcamentos — usados pelo anti-join de "contas a
    -- receber" (orçamento aprovado sem recibo) e pela busca de recibos de uma
    -- página de orçamentos (getRecibosPorOrcamentoIds), sem carregar tudo.
    CREATE INDEX IF NOT EXISTS idx_recibos_orcamento ON recibos (json_extract(data, '$.orcamentoId'));
    CREATE INDEX IF NOT EXISTS idx_recibos_excluido ON recibos (json_extract(data, '$.excluidoEm'));

    CREATE TABLE IF NOT EXISTS modelos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      data TEXT NOT NULL,
      criado_em TEXT NOT NULL,
      excluido_em TEXT,
      atualizado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS depoimentos (
      id TEXT PRIMARY KEY,
      nome_cliente TEXT NOT NULL,
      estrelas INTEGER NOT NULL,
      texto TEXT,
      criado_em TEXT NOT NULL,
      excluido_em TEXT,
      atualizado_em TEXT
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
      atualizado_em TEXT NOT NULL,
      excluido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agendamentos_inicio ON agendamentos (inicio);

    -- Onda 4 — ORDENS DE SERVIÇO (OS mínima + app do técnico). Espelha a nuvem
    -- public.ordens_servico (ver migration 20260710_ordens_servico.sql). checklist
    -- e fotos vivem como TEXT JSON (mesmo padrão de orcamentos.data). Nasce de um
    -- orçamento aprovado (orcamento_id) ou é criada à mão. tecnico_id/tecnico_nome
    -- é a atribuição (quem executa), não o dono do dado.
    CREATE TABLE IF NOT EXISTS ordens_servico (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      orcamento_id TEXT,
      cliente_id TEXT,
      cliente_nome TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      status TEXT NOT NULL DEFAULT 'aberta',
      tecnico_id TEXT,
      tecnico_nome TEXT,
      data_agendada TEXT,
      checklist TEXT NOT NULL DEFAULT '[]',
      fotos TEXT NOT NULL DEFAULT '[]',
      observacoes TEXT,
      valor REAL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      excluido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ordens_servico_status ON ordens_servico (status);
    CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico ON ordens_servico (tecnico_id);
    CREATE INDEX IF NOT EXISTS idx_ordens_servico_orcamento ON ordens_servico (orcamento_id);

    -- PMOC Fase 1 — EQUIPAMENTOS (inventario HVAC + etiqueta QR). Espelha a nuvem
    -- public.assets (ver 20260709_pmoc_fundacao + 20260711_assets_fotos). fotos vive
    -- como TEXT JSON (mesmo padrao de orcamentos.data / ordens_servico.fotos). O
    -- qr_token e a IDENTIDADE PUBLICA OPACA vinda do banco (DEFAULT no INSERT da
    -- nuvem) — o app NUNCA gera nem edita: recebe no pull e preserva/reenvia. Numa
    -- linha criada offline, qr_token fica '' ate o proximo pull trazer o token.
    CREATE TABLE IF NOT EXISTS equipamentos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT,
      local_id TEXT,
      codigo_interno TEXT,
      patrimonio TEXT,
      fabricante TEXT,
      modelo TEXT,
      numero_serie TEXT,
      categoria TEXT,
      capacidade_btu INTEGER,
      tensao TEXT,
      refrigerante TEXT,
      localizacao TEXT,
      situacao TEXT NOT NULL DEFAULT 'ativo',
      criticidade TEXT,
      qr_token TEXT NOT NULL DEFAULT '',
      qr_revogado_em TEXT,
      fotos TEXT NOT NULL DEFAULT '[]',
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      excluido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_equipamentos_cliente ON equipamentos (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_equipamentos_situacao ON equipamentos (situacao);
    CREATE INDEX IF NOT EXISTS idx_equipamentos_qr_token ON equipamentos (qr_token);

    -- PMOC Fase 2 — plano de manutenção, periodicidade e ordens recorrentes.
    -- Espelha supabase/migrations/20260715_pmoc_fase2.sql.
    -- 'situacao' é OPERACIONAL (rascunho/vigente/...), NUNCA conformidade legal.
    CREATE TABLE IF NOT EXISTS pmoc_planos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT,
      contrato_id TEXT,
      numero TEXT,
      titulo TEXT NOT NULL,
      situacao TEXT NOT NULL DEFAULT 'rascunho',
      versao_vigente INTEGER,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      excluido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pmoc_planos_cliente ON pmoc_planos (cliente_id);

    -- Append-only. 'dados' (JSON) guarda periodicidades, atividades e referências
    -- normativas: são DADOS versionados e configuráveis, nunca constantes de
    -- código -- prazo de norma muda, e quem valida é o responsável habilitado.
    CREATE TABLE IF NOT EXISTS pmoc_plano_versoes (
      id TEXT PRIMARY KEY,
      plano_id TEXT NOT NULL,
      numero_versao INTEGER NOT NULL,
      dados TEXT NOT NULL,
      responsavel_tecnico TEXT,
      doc_responsabilidade TEXT,
      aprovado_em TEXT,
      criado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pmoc_versoes_plano ON pmoc_plano_versoes (plano_id, numero_versao);

    -- Livro-caixa da geração recorrente: "o plano P, no equipamento E, no período
    -- 2026-07, já virou a ordem O".
    CREATE TABLE IF NOT EXISTS pmoc_ordens_geradas (
      id TEXT PRIMARY KEY,
      plano_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      periodo TEXT NOT NULL,
      periodicidade_id TEXT NOT NULL DEFAULT '',
      ordem_id TEXT NOT NULL,
      vencimento TEXT,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      excluido_em TEXT
    );
    -- A CHAVE DE IDEMPOTÊNCIA, igual à da nuvem. A geração roda no boot e em vários
    -- aparelhos; sem esta restrição, dois aparelhos gerando "a manutenção de julho"
    -- criam DUAS ordens e o técnico vai duas vezes ao mesmo endereço. A idempotência
    -- mora no BANCO, não na lógica que gera.
    CREATE UNIQUE INDEX IF NOT EXISTS pmoc_ordens_geradas_unica
      ON pmoc_ordens_geradas (plano_id, asset_id, periodo, periodicidade_id);
    CREATE INDEX IF NOT EXISTS idx_pmoc_geradas_plano ON pmoc_ordens_geradas (plano_id, periodo);

    -- Relatório do dia falado — snapshot diário compilado (orçamentos, recibos,
    -- agendamentos, clientes novos) para reler/ouvir depois. Local-only (não
    -- sincroniza com a nuvem, igual eventos/cache_ia/casos_erro): é um histórico
    -- pessoal do aparelho, não um dado relacional do negócio.
    CREATE TABLE IF NOT EXISTS relatorios_diarios (
      data TEXT PRIMARY KEY,
      dados TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );
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
const SCHEMA_VERSION = 3;

/**
 * Adiciona uma coluna SÓ se ela ainda não existir (defensivo). Em instalação nova
 * a coluna já veio no CREATE TABLE acima → PRAGMA table_info a encontra e o ALTER
 * é pulado; em instalação existente (sem a coluna) o ALTER a acrescenta. Assim o
 * mesmo bloco de migração roda com segurança nos dois casos, SEM erro de "duplicate
 * column" e SEM jamais perder dado (ALTER ADD COLUMN é aditivo). NUNCA lança por
 * causa de coluna já existente; qualquer outra falha propaga (migração deve falhar
 * alto, não silenciosa). `tabela`/`coluna` são literais internos — nunca entrada externa.
 */
async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  tabela: string,
  coluna: string,
  definicao: string,
): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabela})`);
  if (cols.some((c) => c.name === coluna)) return;
  await database.execAsync(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

/**
 * Migrador incremental do SQLite via PRAGMA user_version. Em instalações novas o
 * baseline já foi criado pelos CREATE TABLE IF NOT EXISTS acima (v=0 → grava a
 * versão atual). Em releases futuros, adicione blocos sequenciais idempotentes.
 */
async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const v = row?.user_version ?? 0;
  if (v >= SCHEMA_VERSION) return;

  // v < 2 — LIXEIRA (Frente 1): coluna `excluido_em TEXT` (ISO do soft delete,
  // nullable) nas tabelas de coluna. As de blob JSON (orcamentos/recibos) guardam
  // `excluidoEm` DENTRO do JSON — não têm coluna. Defensivo (addColumnIfMissing):
  // seguro tanto para instalação nova (coluna já no CREATE) quanto existente.
  if (v < 2) {
    for (const tabela of ['clientes', 'servicos', 'produtos', 'modelos', 'depoimentos', 'agendamentos', 'ordens_servico', 'equipamentos']) {
      await addColumnIfMissing(database, tabela, 'excluido_em', 'TEXT');
    }
  }

  // v < 3 — RELÓGIO DE SYNC: `atualizado_em TEXT` nas cinco tabelas de coluna que
  // não tinham timestamp de edição. (agendamentos/ordens_servico/equipamentos já
  // têm; orcamentos/recibos guardam `atualizadoEm` dentro do blob JSON.)
  // Sem este relógio o sync dessas tabelas era last-writer-wins cego, e o pull de
  // uma linha ativa zerava um soft delete feito offline — o item ressuscitava.
  // Espelha a migration da nuvem 20260714_atualizado_em.sql, inclusive o backfill.
  if (v < 3) {
    for (const tabela of ['clientes', 'servicos', 'produtos', 'modelos', 'depoimentos']) {
      await addColumnIfMissing(database, tabela, 'atualizado_em', 'TEXT');
      // Backfill com criado_em (nunca com "agora"): carimbar tudo como recém-editado
      // faria cada linha local vencer o guard contra a nuvem no primeiro sync.
      await database.execAsync(
        `UPDATE ${tabela} SET atualizado_em = criado_em WHERE atualizado_em IS NULL`,
      );
    }
  }

  await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/**
 * Importa a base de códigos de erro do asset. VERSIONADO: quando o asset é
 * atualizado (ex.: 602 → 698 códigos da base HVAC v2), basta incrementar
 * SEED_CODIGOS_VERSAO — instalações existentes fazem re-seed completo
 * (DELETE + INSERT em transação) na primeira abertura após o update; sem o
 * versionamento, quem já tinha a tabela populada nunca recebia os códigos novos.
 */
const SEED_CODIGOS_VERSAO = 2; // v1 = 602 códigos; v2 = 698 (base HVAC 2026-07-07)

async function seedCodigosErro(database: SQLite.SQLiteDatabase) {
  const meta = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  void meta; // versão de schema é tratada em runMigrations; aqui usamos tabela própria
  await database.execAsync(
    'CREATE TABLE IF NOT EXISTS seed_meta (chave TEXT PRIMARY KEY, valor TEXT)'
  );
  const atual = await database.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM seed_meta WHERE chave = 'codigos_versao'"
  );
  const row = await database.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM codigos_erro');
  const versaoAtual = Number(atual?.valor ?? '0');
  if ((row?.c ?? 0) > 0 && versaoAtual >= SEED_CODIGOS_VERSAO) return;
  // Só AGORA (quando vamos de fato semear) o JSON grande é lido e parseado.
  const seed = require('../../assets/codigos_erro.json') as any[];
  if (!Array.isArray(seed) || seed.length === 0) return;
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM codigos_erro');
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
    await database.runAsync(
      "INSERT INTO seed_meta (chave, valor) VALUES ('codigos_versao', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
      [String(SEED_CODIGOS_VERSAO)]
    );
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
  // LIXEIRA: leitura normal só ATIVOS (excluido_em IS NULL). Os soft-deletados
  // vivem em getLixeiraClientes até restaurar / expurgo.
  const rows = await db.getAllAsync<any>('SELECT * FROM clientes WHERE excluido_em IS NULL ORDER BY nome ASC');
  return rows.map(rowToCliente);
}

/** Um cliente ATIVO por id (para telefone/endereço na Ordem de Serviço). null se não achar. */
export async function getCliente(id: string): Promise<Cliente | null> {
  if (!id) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM clientes WHERE id = ? AND excluido_em IS NULL', [id]);
  return row ? rowToCliente(row) : null;
}

export async function searchClientes(q: string): Promise<Cliente[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM clientes WHERE excluido_em IS NULL AND (nome LIKE ? OR telefone LIKE ?) ORDER BY nome ASC',
    [`%${q}%`, `%${q}%`]
  );
  return rows.map(rowToCliente);
}

export async function saveCliente(cliente: Cliente): Promise<void> {
  const db = await getDb();
  // O BANCO carimba o relógio de sync — a UI nunca manda `atualizadoEm`. O objeto
  // espelhado na nuvem tem que levar o MESMO carimbo que foi para o SQLite, senão
  // os dois lados divergem e o guard de conflito passa a comparar valores errados.
  const agora = new Date().toISOString();
  const salvo: Cliente = { ...cliente, atualizadoEm: agora };
  await db.runAsync(
    `INSERT OR REPLACE INTO clientes
     (id, nome, telefone, cpf, cnpj, endereco, complemento, estado, cidade, cep, criado_em, excluido_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [salvo.id, salvo.nome, salvo.telefone, salvo.cpf ?? null,
     salvo.cnpj ?? null, salvo.endereco ?? null, salvo.complemento ?? null,
     salvo.estado ?? null, salvo.cidade ?? null, salvo.cep ?? null,
     salvo.criadoEm, salvo.excluidoEm ?? null, agora]
  );
  mirrorPush('clientes', salvo);
}

/**
 * EXCLUIR (usuário) = SOFT DELETE: manda o cliente para a LIXEIRA (seta
 * excluido_em = agora, mantém a linha). Some das listas normais mas é recuperável.
 * Mantém ESTE nome (deleteCliente) para os call-sites existentes não quebrarem — o
 * que muda é a semântica (antes hard delete, agora soft). Sincroniza como UPDATE
 * normal (mirrorPush do objeto atualizado), NÃO usa tombstone.
 */
export async function deleteCliente(id: string): Promise<void> {
  const db = await getDb();
  // Excluir É uma escrita: bumpa `atualizado_em` junto. Sem isso a exclusão não
  // teria relógio e um pull de linha ativa (a nuvem, se o mirrorPush falhou
  // offline) sobrescreveria o soft delete — o cliente ressuscitaria.
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE clientes SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getClienteRaw(id);
  if (atualizado) mirrorPush('clientes', atualizado);
}

/** RESTAURAR: tira o cliente da lixeira (excluido_em = null) e re-espelha ativo. */
export async function restaurarCliente(id: string): Promise<void> {
  const db = await getDb();
  // Restaurar também bumpa o relógio: é a única forma de a restauração vencer,
  // nos outros aparelhos, a cópia ainda excluída que eles têm em cache.
  await db.runAsync('UPDATE clientes SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getClienteRaw(id);
  if (atualizado) mirrorPush('clientes', atualizado);
}

/**
 * EXCLUIR DEFINITIVAMENTE (da lixeira): hard delete real + tombstone que propaga a
 * exclusão entre aparelhos/painel. Era o comportamento do antigo deleteCliente.
 */
export async function excluirClienteDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM clientes WHERE id = ?', [id]);
  mirrorRemove('clientes', id);
  registrarExclusao('clientes', id);
}

/** Itens de cliente na LIXEIRA (soft-deletados), do excluído mais recente ao mais antigo. */
export async function getLixeiraClientes(): Promise<Cliente[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM clientes WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToCliente);
}

/** Lê um cliente por id INCLUINDO soft-deletados (uso interno: espelho pós-soft-delete). */
async function getClienteRaw(id: string): Promise<Cliente | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM clientes WHERE id = ?', [id]);
  return row ? rowToCliente(row) : null;
}

function rowToCliente(r: any): Cliente {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone,
    cpf: r.cpf ?? undefined, cnpj: r.cnpj ?? undefined,
    endereco: r.endereco ?? undefined, complemento: r.complemento ?? undefined,
    estado: r.estado ?? undefined, cidade: r.cidade ?? undefined,
    cep: r.cep ?? undefined, criadoEm: r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? undefined,
  };
}

// ─── SERVIÇOS ─────────────────────────────────────────────
export async function getServicos(): Promise<ServicoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM servicos WHERE excluido_em IS NULL ORDER BY nome ASC');
  return rows.map(rowToServico);
}

export async function searchServicos(q: string): Promise<ServicoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM servicos WHERE excluido_em IS NULL AND nome LIKE ? ORDER BY nome ASC',
    [`%${q}%`]
  );
  return rows.map(rowToServico);
}

export async function saveServico(s: ServicoItem): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const salvo: ServicoItem = { ...s, atualizadoEm: agora };
  await db.runAsync(
    `INSERT OR REPLACE INTO servicos (id, nome, descricao, preco, custo, unidade, foto_uri, criado_em, excluido_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [salvo.id, salvo.nome, salvo.descricao ?? null, salvo.preco, salvo.custo ?? null,
     salvo.unidade, salvo.fotoUri ?? null, salvo.criadoEm, salvo.excluidoEm ?? null, agora]
  );
  mirrorPush('servicos', salvo);
}

/** SOFT DELETE → LIXEIRA (mantém o nome para os call-sites). Bumpa o relógio de sync. */
export async function deleteServico(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE servicos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getServicoRaw(id);
  if (atualizado) mirrorPush('servicos', atualizado);
}

/** RESTAURAR da lixeira. Bumpa o relógio para vencer a cópia excluída dos outros aparelhos. */
export async function restaurarServico(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE servicos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getServicoRaw(id);
  if (atualizado) mirrorPush('servicos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirServicoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM servicos WHERE id = ?', [id]);
  mirrorRemove('servicos', id);
  registrarExclusao('servicos', id);
}

/** Serviços na LIXEIRA (soft-deletados). */
export async function getLixeiraServicos(): Promise<ServicoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM servicos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToServico);
}

async function getServicoRaw(id: string): Promise<ServicoItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM servicos WHERE id = ?', [id]);
  return row ? rowToServico(row) : null;
}

function rowToServico(r: any): ServicoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? undefined,
  };
}

// ─── PRODUTOS ─────────────────────────────────────────────
export async function getProdutos(): Promise<ProdutoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM produtos WHERE excluido_em IS NULL ORDER BY nome ASC');
  return rows.map(rowToProduto);
}

export async function searchProdutos(q: string): Promise<ProdutoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM produtos WHERE excluido_em IS NULL AND nome LIKE ? ORDER BY nome ASC',
    [`%${q}%`]
  );
  return rows.map(rowToProduto);
}

export async function saveProduto(p: ProdutoItem): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const salvo: ProdutoItem = { ...p, atualizadoEm: agora };
  await db.runAsync(
    `INSERT OR REPLACE INTO produtos
     (id, nome, descricao, preco, custo, marca, modelo, unidade, foto_uri, criado_em, excluido_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [salvo.id, salvo.nome, salvo.descricao ?? null, salvo.preco, salvo.custo ?? null,
     salvo.marca ?? null, salvo.modelo ?? null, salvo.unidade, salvo.fotoUri ?? null,
     salvo.criadoEm, salvo.excluidoEm ?? null, agora]
  );
  mirrorPush('produtos', salvo);
}

/** SOFT DELETE → LIXEIRA (mantém o nome para os call-sites). Bumpa o relógio de sync. */
export async function deleteProduto(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE produtos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getProdutoRaw(id);
  if (atualizado) mirrorPush('produtos', atualizado);
}

/** RESTAURAR da lixeira. Bumpa o relógio para vencer a cópia excluída dos outros aparelhos. */
export async function restaurarProduto(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE produtos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getProdutoRaw(id);
  if (atualizado) mirrorPush('produtos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirProdutoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM produtos WHERE id = ?', [id]);
  mirrorRemove('produtos', id);
  registrarExclusao('produtos', id);
}

/** Produtos na LIXEIRA (soft-deletados). */
export async function getLixeiraProdutos(): Promise<ProdutoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM produtos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToProduto);
}

async function getProdutoRaw(id: string): Promise<ProdutoItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM produtos WHERE id = ?', [id]);
  return row ? rowToProduto(row) : null;
}

function rowToProduto(r: any): ProdutoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, marca: r.marca ?? undefined,
    modelo: r.modelo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? undefined,
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
  // LIXEIRA: só ATIVOS. orcamentos guarda a entidade inteira no blob JSON `data`,
  // então o soft-delete mora em `data.$.excluidoEm` (não há coluna) — filtramos por
  // json_extract. Robusto ao sync: o cloudSync escreve o blob inteiro (com excluidoEm).
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM orcamentos WHERE json_extract(data, '$.excluidoEm') IS NULL ORDER BY json_extract(data, '$.criadoEm') DESC, numero DESC",
  );
  return rows.map(r => JSON.parse(r.data));
}

/**
 * dashboard-agg (item 1.18): agregados dos KPIs de orçamento em SQL puro
 * (COUNT/SUM/WHERE via json_extract), no lugar do antigo padrão
 * `getOrcamentos().filter(...).reduce(...)` sobre o HISTÓRICO INTEIRO a cada
 * foco de tela. Mesma regra de soft-delete de `getOrcamentos` (excluido_em
 * IS NULL) — os números batem com o reduce em JS que substituem.
 */
export async function getOrcamentosAgregadoPorStatus(
  statuses: readonly StatusOrcamento[],
): Promise<{ contagem: number; valorTotal: number }> {
  if (statuses.length === 0) return { contagem: 0, valorTotal: 0 };
  const db = await getDb();
  const placeholders = statuses.map(() => '?').join(',');
  const row = await db.getFirstAsync<{ contagem: number; soma: number | null }>(
    `SELECT COUNT(*) as contagem, COALESCE(SUM(json_extract(data, '$.valorTotal')), 0) as soma
     FROM orcamentos
     WHERE json_extract(data, '$.excluidoEm') IS NULL
       AND json_extract(data, '$.status') IN (${placeholders})`,
    [...statuses],
  );
  return { contagem: row?.contagem ?? 0, valorTotal: row?.soma ?? 0 };
}

/** Total de orçamentos ATIVOS (qualquer status) — denominador de taxas (ex.: conversão). */
export async function getOrcamentosTotalAtivos(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM orcamentos WHERE json_extract(data, '$.excluidoEm') IS NULL",
  );
  return row?.c ?? 0;
}

/**
 * "Contas a receber": orçamentos APROVADOS sem recibo vinculado ainda.
 * Substitui `aprovados.filter(o => !getReciboDoOrcamento(o.id, recibos))`,
 * que era O(aprovados × recibos) em JS — aqui vira um anti-join em SQL.
 * Mesma regra de `getReciboDoOrcamento`: só considera recibo ATIVO
 * (excluido_em IS NULL) e só status EXATAMENTE 'aprovado' (não 'convertido').
 */
export async function getContasAReceberAgregado(): Promise<{ contagem: number; valorTotal: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ contagem: number; soma: number | null }>(
    `SELECT COUNT(*) as contagem, COALESCE(SUM(json_extract(o.data, '$.valorTotal')), 0) as soma
     FROM orcamentos o
     WHERE json_extract(o.data, '$.excluidoEm') IS NULL
       AND json_extract(o.data, '$.status') = 'aprovado'
       AND NOT EXISTS (
         SELECT 1 FROM recibos r
         WHERE json_extract(r.data, '$.orcamentoId') = o.id
           AND json_extract(r.data, '$.excluidoEm') IS NULL
       )`,
  );
  return { contagem: row?.contagem ?? 0, valorTotal: row?.soma ?? 0 };
}

/**
 * Orçamentos com status dentro do conjunto informado E criados há pelo menos
 * `diasMinimos` dias corridos (não calendário) — mesmo cálculo de `diasAtras`
 * (`Math.floor((Date.now()-d.getTime())/86400000) >= N`), só que em SQL via
 * `julianday`. `criadoEm` é sempre `new Date().toISOString()` (UTC, ver
 * `nowISO`), e `julianday('now')`/`julianday(iso)` tratam ISO como UTC — a
 * diferença dá o mesmo número de dias corridos que o `Date.now()` em JS,
 * independente do fuso do aparelho. `floor(x) >= N ⟺ x >= N` para N inteiro,
 * então a comparação direta (sem floor) é equivalente ao original.
 */
export async function getOrcamentosParadosAgregado(
  statuses: readonly StatusOrcamento[],
  diasMinimos: number,
): Promise<{ contagem: number; valorTotal: number }> {
  if (statuses.length === 0) return { contagem: 0, valorTotal: 0 };
  const db = await getDb();
  const placeholders = statuses.map(() => '?').join(',');
  const row = await db.getFirstAsync<{ contagem: number; soma: number | null }>(
    `SELECT COUNT(*) as contagem, COALESCE(SUM(json_extract(data, '$.valorTotal')), 0) as soma
     FROM orcamentos
     WHERE json_extract(data, '$.excluidoEm') IS NULL
       AND json_extract(data, '$.status') IN (${placeholders})
       AND (julianday('now') - julianday(json_extract(data, '$.criadoEm'))) >= ?`,
    [...statuses, diasMinimos],
  );
  return { contagem: row?.contagem ?? 0, valorTotal: row?.soma ?? 0 };
}

/** Últimos N orçamentos ATIVOS (mais recentes primeiro) — para cards/tabelas do dashboard, sem carregar o histórico inteiro. */
export async function getUltimosOrcamentos(limite: number): Promise<Orcamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM orcamentos WHERE json_extract(data, '$.excluidoEm') IS NULL ORDER BY json_extract(data, '$.criadoEm') DESC, numero DESC LIMIT ?",
    [limite],
  );
  return rows.map(r => JSON.parse(r.data));
}

/**
 * Contagem + soma de valorTotal por status, de TODOS os orçamentos ATIVOS,
 * numa ÚNICA query agregada (GROUP BY) — usada pela pizza e pelos KPIs de
 * "Relatórios" (RelatoriosDesktopScreen) no lugar de `getOrcamentos()`
 * completo (SELECT * + JSON.parse do histórico inteiro) reduzido em JS. Só os
 * status com pelo menos 1 orçamento aparecem no mapa — mesmo corte que a tela
 * já fazia com `.filter(d => d.qtd > 0)`.
 */
export async function getOrcamentosResumoPorStatus(): Promise<Partial<Record<StatusOrcamento, { contagem: number; valorTotal: number }>>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: StatusOrcamento; contagem: number; soma: number | null }>(
    `SELECT json_extract(data, '$.status') as status, COUNT(*) as contagem,
            COALESCE(SUM(json_extract(data, '$.valorTotal')), 0) as soma
     FROM orcamentos
     WHERE json_extract(data, '$.excluidoEm') IS NULL
     GROUP BY json_extract(data, '$.status')`,
  );
  const mapa: Partial<Record<StatusOrcamento, { contagem: number; valorTotal: number }>> = {};
  for (const r of rows) mapa[r.status] = { contagem: r.contagem, valorTotal: r.soma ?? 0 };
  return mapa;
}

/**
 * Datas de criação (`criadoEm`, ISO) de todos os orçamentos ATIVOS — só a
 * data, não o registro inteiro (itens, fotos, assinaturas, formas de
 * pagamento etc. ficam de fora). Usada pelo gráfico de linha de "Relatórios"
 * para agrupar por mês. O agrupamento em si continua em JS (mesma regra de
 * sempre: `new Date(iso).getFullYear()/getMonth()`, MÊS LOCAL do aparelho) —
 * fazer isso em SQL (`strftime`) trataria o fuso como UTC e podia deslocar de
 * mês orçamentos criados perto da virada do dia, quebrando "números idênticos".
 */
export async function getOrcamentosDatasCriacao(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ criadoEm: string }>(
    `SELECT json_extract(data, '$.criadoEm') as criadoEm
     FROM orcamentos
     WHERE json_extract(data, '$.excluidoEm') IS NULL`,
  );
  return rows.map(r => r.criadoEm);
}

/** Filtro compartilhado pela lista paginada de orçamentos (OrcamentosScreen). */
export interface FiltroOrcamentos {
  clienteId?: string;
  status?: StatusOrcamento;
  /** Busca livre — mesma regra da tela: cliente (case-insensitive) OU número do orçamento (substring). */
  busca?: string;
}

/**
 * Busca por nome tem que ser acento-insensível como o `normalizarBusca` do app
 * (JS, Unicode). O `LOWER()` do SQLite só cobre ASCII — "JOSÉ" não casava com
 * "josé" (regressão real ao trocar filter/reduce em JS por SQL). Solução: tirar
 * acento + minúsculo dos DOIS lados — na coluna via REPLACE aninhado (SQL), na
 * query via NFD-strip (JS) — para o LIKE comparar `jose` com `jose`.
 */
const PARES_ACENTO: [string, string][] = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['Á', 'a'], ['À', 'a'], ['Â', 'a'], ['Ã', 'a'], ['Ä', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'], ['É', 'e'], ['È', 'e'], ['Ê', 'e'], ['Ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'], ['Í', 'i'], ['Ì', 'i'], ['Î', 'i'], ['Ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'], ['Ó', 'o'], ['Ò', 'o'], ['Ô', 'o'], ['Õ', 'o'], ['Ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'], ['Ú', 'u'], ['Ù', 'u'], ['Û', 'u'], ['Ü', 'u'],
  ['ç', 'c'], ['Ç', 'c'], ['ñ', 'n'], ['Ñ', 'n'],
];

/** Expressão SQL "sem acento + minúsculo" de `expr` (REPLACE aninhado sobre LOWER). */
function semAcentoLowerSql(expr: string): string {
  let s = `LOWER(${expr})`;
  for (const [de, para] of PARES_ACENTO) s = `REPLACE(${s}, '${de}', '${para}')`;
  return s;
}

/** Versão JS equivalente (para o lado da query) — mesmo resultado do REPLACE do SQL. */
function semAcentoLower(s: string): string {
  let r = s.toLowerCase();
  for (const [de, para] of PARES_ACENTO) r = r.split(de).join(para);
  return r;
}

/** Escapa os curingas do LIKE (%, _, \) para que o texto digitado seja literal. Usar com `ESCAPE '\\'`. */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

/** Monta a cláusula WHERE + params compartilhada por paginação/resumo/ids — uma única fonte da regra de filtro. */
function whereOrcamentosFiltro(filtro: FiltroOrcamentos): { clausula: string; params: (string | number)[] } {
  const condicoes: string[] = ["json_extract(data, '$.excluidoEm') IS NULL"];
  const params: (string | number)[] = [];
  if (filtro.clienteId) {
    condicoes.push("json_extract(data, '$.clienteId') = ?");
    params.push(filtro.clienteId);
  }
  if (filtro.status) {
    condicoes.push("json_extract(data, '$.status') = ?");
    params.push(filtro.status);
  }
  if (filtro.busca && filtro.busca.trim()) {
    // Nome: sem-acento+minúsculo dos dois lados (acento-insensível como o app).
    // Número: minúsculo (dígitos não mudam). Curingas do usuário escapados.
    const nomeSql = semAcentoLowerSql("json_extract(data, '$.clienteNome')");
    condicoes.push(`(${nomeSql} LIKE ? ESCAPE '\\' OR LOWER(numero) LIKE ? ESCAPE '\\')`);
    const like = `%${escaparLike(semAcentoLower(filtro.busca.trim()))}%`;
    params.push(like, like);
  }
  return { clausula: condicoes.join(' AND '), params };
}

/**
 * PAGINAÇÃO (item 1.18): uma página de orçamentos (mais recentes primeiro),
 * já filtrada em SQL — no lugar de `getOrcamentos()` completo + filtro em JS
 * a cada busca/troca de status. `OrcamentosScreen` chama com LIMIT 50 e vai
 * pedindo a próxima página (`offset`) ao chegar no fim da lista.
 */
export async function getOrcamentosPagina(filtro: FiltroOrcamentos, limite: number, offset: number): Promise<Orcamento[]> {
  const db = await getDb();
  const { clausula, params } = whereOrcamentosFiltro(filtro);
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM orcamentos WHERE ${clausula} ORDER BY json_extract(data, '$.criadoEm') DESC, numero DESC LIMIT ? OFFSET ?`,
    [...params, limite, offset],
  );
  return rows.map(r => JSON.parse(r.data));
}

/** Contagem + soma de valorTotal do TOTAL filtrado (não só a página carregada) — para o cabeçalho da lista. */
export async function getOrcamentosResumoFiltro(filtro: FiltroOrcamentos): Promise<{ contagem: number; valorTotal: number }> {
  const db = await getDb();
  const { clausula, params } = whereOrcamentosFiltro(filtro);
  const row = await db.getFirstAsync<{ contagem: number; soma: number | null }>(
    `SELECT COUNT(*) as contagem, COALESCE(SUM(json_extract(data, '$.valorTotal')), 0) as soma FROM orcamentos WHERE ${clausula}`,
    params,
  );
  return { contagem: row?.contagem ?? 0, valorTotal: row?.soma ?? 0 };
}

/** Todos os ids que batem o filtro (não só a página carregada) — usado por "selecionar todos" na seleção em lote. */
export async function getOrcamentosIdsFiltro(filtro: FiltroOrcamentos): Promise<string[]> {
  const db = await getDb();
  const { clausula, params } = whereOrcamentosFiltro(filtro);
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM orcamentos WHERE ${clausula}`, params);
  return rows.map(r => r.id);
}

/** Recibos ATIVOS vinculados a um conjunto de orçamentos (ex.: os da página atual) — evita carregar `recibos` inteiro. */
export async function getRecibosPorOrcamentoIds(orcamentoIds: string[]): Promise<Recibo[]> {
  if (orcamentoIds.length === 0) return [];
  const db = await getDb();
  const placeholders = orcamentoIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM recibos WHERE json_extract(data, '$.excluidoEm') IS NULL AND json_extract(data, '$.orcamentoId') IN (${placeholders})`,
    orcamentoIds,
  );
  return rows.map(r => JSON.parse(r.data));
}

// Leitura por id NÃO filtra soft-delete de propósito: restaurar/detalhar da lixeira
// precisam do registro mesmo excluído (a lista normal é que não o linka).
export async function getOrcamento(id: string): Promise<Orcamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM orcamentos WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) : null;
}

/**
 * Metadados VOLÁTEIS do orçamento que NÃO representam mudança comercial e, por
 * isso, NÃO entram na impressão digital. Tudo o mais (formasPagamento, chavePix,
 * fotosServico, sinalData, dataEmissao, corMarca, subtotalServicos/Produtos, etc.)
 * é conteúdo que o cliente vê no PDF/Link e DEVE disparar versão ao mudar. Por
 * isso usamos LISTA DE EXCLUSÃO (não whitelist): campo comercial novo passa a
 * contar automaticamente, sem risco de esquecimento. Os excluídos:
 *  - `id`: identidade, não conteúdo.
 *  - `status`: o sync do link (visualizado/aprovado/recusado) e o fluxo manual
 *    mudam status sem mudar a proposta — jamais pode disparar versão falsa.
 *  - `criadoEm`/`atualizadoEm`: timestamps de trilha, não conteúdo.
 *  - `assinaturaClienteUri`/`dataAssinaturaCliente`: AÇÃO do cliente sobre a
 *    proposta (assinar), não uma edição do dono — não gera versão.
 */
const CAMPOS_VOLATEIS_ORCAMENTO: ReadonlySet<string> = new Set([
  'id',
  'status',
  'criadoEm',
  'atualizadoEm',
  'assinaturaClienteUri',
  'dataAssinaturaCliente',
  // LIXEIRA: mandar para a lixeira / restaurar NÃO é mudança comercial da proposta
  // — nunca deve congelar uma versão falsa se algum save passar por aqui.
  'excluidoEm',
]);

/**
 * Serialização CANÔNICA: ordena as chaves de objetos recursivamente para que dois
 * orçamentos com o MESMO conteúdo, mas chaves em ordem diferente (o "anterior" vem
 * do banco via JSON.parse; o "novo" vem do editor), produzam a MESMA string. Arrays
 * (ex.: `itens`) PRESERVAM a ordem — reordenar item muda a proposta. Valores
 * primitivos e `null` passam direto.
 */
function stringifyCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor === undefined ? null : valor);
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(stringifyCanonico).join(',')}]`;
  }
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj).sort();
  const partes = chaves.map((k) => `${JSON.stringify(k)}:${stringifyCanonico(obj[k])}`);
  return `{${partes.join(',')}}`;
}

/**
 * "Impressão digital" comercial de um orçamento — TODO o conteúdo que o CLIENTE
 * pode ver na proposta (PDF + Link), EXCETO os metadados voláteis de
 * `CAMPOS_VOLATEIS_ORCAMENTO`. Muda de fingerprint = a proposta mudou de verdade e
 * merece uma versão. Lista de EXCLUSÃO + stringify canônico (chaves ordenadas) →
 * comparação estável e à prova de esquecimento (campo comercial novo já conta).
 */
function impressaoComercial(o: Orcamento): string {
  const origem = o as unknown as Record<string, unknown>;
  const filtrado: Record<string, unknown> = {};
  for (const chave of Object.keys(origem)) {
    if (CAMPOS_VOLATEIS_ORCAMENTO.has(chave)) continue;
    filtrado[chave] = origem[chave];
  }
  return stringifyCanonico(filtrado);
}

/**
 * Salva o orçamento. REGRA DE OURO (mestre 13.5): se o orçamento JÁ persistido
 * está numa proposta enviada (enviado/visualizado/em_negociacao/aguardando_
 * assinatura) e a EDIÇÃO muda o conteúdo comercial, congelamos o estado ANTERIOR
 * como uma VERSÃO antes de sobrescrever — o que o cliente viu nunca some. Uma
 * simples troca de status (ex.: o link marcou "visualizado") não gera versão.
 */
export async function saveOrcamento(o: Orcamento): Promise<void> {
  const db = await getDb();

  // Snapshot da versão anterior, quando aplicável (best-effort: nunca impede o save).
  try {
    const anterior = await getOrcamento(o.id);
    if (
      anterior &&
      propostaJaEnviada(anterior.status) &&
      impressaoComercial(anterior) !== impressaoComercial(o)
    ) {
      await congelarVersaoOrcamento(anterior);
    }
  } catch {
    // versionamento é aditivo: uma falha aqui jamais bloqueia salvar o orçamento
  }

  await db.runAsync(
    'INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)',
    [o.id, o.numero, JSON.stringify(o)]
  );
  mirrorPush('orcamentos', o);
}

/**
 * EXCLUIR (usuário) = SOFT DELETE → LIXEIRA. Reescreve o blob com excluidoEm=agora
 * e bump de atualizadoEm (para o guard de timestamp do sync tratar como a escrita
 * mais nova). NÃO passa por saveOrcamento (evita congelar versão) e NÃO apaga o
 * histórico de versões (o orçamento pode ser restaurado). Mantém o nome para os
 * call-sites. Sincroniza como UPDATE (mirrorPush do blob), sem tombstone.
 */
export async function deleteOrcamento(id: string): Promise<void> {
  const db = await getDb();
  const o = await getOrcamento(id);
  if (!o) return;
  const agora = new Date().toISOString();
  const atualizado: Orcamento = { ...o, excluidoEm: agora, atualizadoEm: agora };
  await db.runAsync(
    'INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)',
    [atualizado.id, atualizado.numero, JSON.stringify(atualizado)],
  );
  mirrorPush('orcamentos', atualizado);
}

/** RESTAURAR da lixeira: limpa excluidoEm, bump atualizadoEm, re-espelha ativo. */
export async function restaurarOrcamento(id: string): Promise<void> {
  const db = await getDb();
  const o = await getOrcamento(id);
  if (!o) return;
  const { excluidoEm, ...resto } = o;
  void excluidoEm;
  const atualizado: Orcamento = { ...resto, atualizadoEm: new Date().toISOString() };
  await db.runAsync(
    'INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)',
    [atualizado.id, atualizado.numero, JSON.stringify(atualizado)],
  );
  mirrorPush('orcamentos', atualizado);
}

/**
 * EXCLUIR DEFINITIVAMENTE (da lixeira): hard delete real + tombstone. Também apaga
 * o histórico de versões (não faz sentido sem o orçamento pai). Era o comportamento
 * do antigo deleteOrcamento.
 */
export async function excluirOrcamentoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM orcamentos WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM orcamento_versoes WHERE orcamento_id = ?', [id]);
  mirrorRemove('orcamentos', id);
  registrarExclusao('orcamentos', id);
}

/** Orçamentos na LIXEIRA (soft-deletados), do excluído mais recente ao mais antigo. */
export async function getLixeiraOrcamentos(): Promise<Orcamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM orcamentos WHERE json_extract(data, '$.excluidoEm') IS NOT NULL ORDER BY json_extract(data, '$.excluidoEm') DESC",
  );
  return rows.map(r => JSON.parse(r.data));
}

// ─── VERSÕES DE ORÇAMENTO (mestre 13.5) ─────────────────────
function rowToVersao(r: any): OrcamentoVersao {
  return {
    id: r.id,
    orcamentoId: r.orcamento_id,
    numeroVersao: r.numero_versao,
    dados: JSON.parse(r.dados),
    criadoEm: r.criado_em,
  };
}

/**
 * Próximo número de versão (sequencial) de um orçamento — 1 se ainda não houver.
 * Exportado para o espelho na nuvem RENUMERAR ao colidir na UNIQUE
 * (orcamento_id, numero_versao) de outro aparelho — ver clienteLink.espelhar
 * VersaoNuvem. MAX+1 é LOCAL; a convergência entre aparelhos é feita lá.
 */
export async function proximoNumeroVersao(orcamentoId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(numero_versao) as m FROM orcamento_versoes WHERE orcamento_id = ?',
    [orcamentoId],
  );
  return (row?.m ?? 0) + 1;
}

/**
 * Congela um SNAPSHOT do orçamento como uma versão nova (append-only). Grava local
 * e espelha na nuvem (fire-and-forget). Recebe o estado a preservar (normalmente o
 * orçamento ANTES da edição). Idempotência prática: cada chamada cria uma versão
 * nova — quem decide QUANDO chamar é o `saveOrcamento` (só quando o conteúdo mudou).
 */
export async function congelarVersaoOrcamento(snapshot: Orcamento): Promise<OrcamentoVersao> {
  const db = await getDb();
  const numeroVersao = await proximoNumeroVersao(snapshot.id);
  const versao: OrcamentoVersao = {
    id: generateId(),
    orcamentoId: snapshot.id,
    numeroVersao,
    dados: snapshot,
    criadoEm: new Date().toISOString(),
  };
  await db.runAsync(
    'INSERT OR REPLACE INTO orcamento_versoes (id, orcamento_id, numero_versao, dados, criado_em) VALUES (?,?,?,?,?)',
    [versao.id, versao.orcamentoId, versao.numeroVersao, JSON.stringify(versao.dados), versao.criadoEm],
  );
  mirrorVersaoNuvem(versao);
  return versao;
}

/**
 * Histórico de versões de um orçamento, da mais RECENTE para a mais antiga.
 * DE-DUPLICADO de forma estável por `numero_versao`: dois aparelhos podem, por
 * merge da nuvem, gravar a MESMA vN com `id` diferente (o espelho renumera para
 * evitar, mas snapshots antigos já podem trazer o duplo). Quando isso ocorre,
 * exibimos UMA linha por número — preferindo o `criado_em` mais antigo (a versão
 * "original") e, como desempate final, o menor `id` (determinístico). Ordena a
 * seleção no SQL por (numero_versao ASC, criado_em ASC, id ASC) e depois inverte
 * para DESC, garantindo que o de-dup fique com o registro mais antigo de cada nº.
 */
export async function getVersoesOrcamento(orcamentoId: string): Promise<OrcamentoVersao[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM orcamento_versoes WHERE orcamento_id = ? ORDER BY numero_versao ASC, criado_em ASC, id ASC',
    [orcamentoId],
  );
  const porNumero = new Map<number, OrcamentoVersao>();
  for (const r of rows) {
    const v = rowToVersao(r);
    // Primeira ocorrência (já é a mais antiga pela ordenação) vence — ignora as duplicatas.
    if (!porNumero.has(v.numeroVersao)) porNumero.set(v.numeroVersao, v);
  }
  return Array.from(porNumero.values()).sort((a, b) => b.numeroVersao - a.numeroVersao);
}

/** Quantas versões um orçamento tem (para badge/contador sem carregar tudo). */
export async function countVersoesOrcamento(orcamentoId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM orcamento_versoes WHERE orcamento_id = ?',
    [orcamentoId],
  );
  return row?.c ?? 0;
}

/**
 * Upsert SILENCIOSO de uma versão vinda da nuvem no SQLite local (sem re-espelhar
 * para a nuvem — evita loop). Usado pelo pull downstream (clienteLink.puxarVersoes
 * NuvemParaOrcamento), para as versões criadas em OUTRO aparelho aparecerem aqui.
 * Idempotente por id. NUNCA lança.
 */
export async function upsertVersaoLocalSilencioso(versao: OrcamentoVersao): Promise<void> {
  try {
    if (!versao?.id || !versao.orcamentoId || versao.numeroVersao == null) return;
    const db = await getDb();
    const dadosStr = typeof (versao.dados as unknown) === 'string'
      ? (versao.dados as unknown as string)
      : JSON.stringify(versao.dados);
    await db.runAsync(
      'INSERT OR REPLACE INTO orcamento_versoes (id, orcamento_id, numero_versao, dados, criado_em) VALUES (?,?,?,?,?)',
      [versao.id, versao.orcamentoId, versao.numeroVersao, dadosStr, versao.criadoEm ?? new Date().toISOString()],
    );
  } catch {
    // best-effort: pull de versão nunca afeta o app local
  }
}

/**
 * Espelha UMA versão na nuvem (public.orcamento_versoes). Fire-and-forget e
 * import DINÂMICO de clienteLink (evita aresta estática database↔services e
 * mantém o padrão do módulo). Nunca afeta o save local: offline/deslogado = no-op.
 */
function mirrorVersaoNuvem(versao: OrcamentoVersao): void {
  try {
    void (async () => {
      try {
        const { espelharVersaoNuvem } = await import('../services/clienteLink');
        await espelharVersaoNuvem(versao);
      } catch {
        // espelho em background: nunca afeta o app local
      }
    })().catch(() => {});
  } catch {
    // idem
  }
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

// ─── ORDENS DE SERVIÇO (Onda 4) ─────────────────────────────
function rowToOrdemServico(r: any): OrdemServico {
  // checklist/fotos vêm como TEXT JSON — parse defensivo (nunca quebra a leitura).
  let checklist: ItemChecklist[] = [];
  let fotos: string[] = [];
  try {
    const c = JSON.parse(r.checklist ?? '[]');
    if (Array.isArray(c)) checklist = c;
  } catch {
    // linha corrompida → checklist vazio (não quebra a listagem)
  }
  try {
    const f = JSON.parse(r.fotos ?? '[]');
    if (Array.isArray(f)) fotos = f;
  } catch {
    // idem
  }
  return {
    id: r.id,
    numero: r.numero,
    orcamentoId: r.orcamento_id ?? undefined,
    clienteId: r.cliente_id ?? undefined,
    clienteNome: r.cliente_nome,
    titulo: r.titulo,
    descricao: r.descricao ?? undefined,
    status: r.status as StatusOS,
    tecnicoId: r.tecnico_id ?? undefined,
    tecnicoNome: r.tecnico_nome ?? undefined,
    dataAgendada: r.data_agendada ?? undefined,
    checklist,
    fotos,
    observacoes: r.observacoes ?? undefined,
    valor: r.valor ?? undefined,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    excluidoEm: r.excluido_em ?? undefined,
  };
}

export async function getOrdensServico(): Promise<OrdemServico[]> {
  const db = await getDb();
  // LIXEIRA: só ATIVAS (excluido_em IS NULL). Mais recentes primeiro, tiebreaker por número.
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM ordens_servico WHERE excluido_em IS NULL ORDER BY criado_em DESC, numero DESC',
  );
  return rows.map(rowToOrdemServico);
}

// Leitura por id NÃO filtra soft-delete (restaurar/detalhe da lixeira).
export async function getOrdemServico(id: string): Promise<OrdemServico | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM ordens_servico WHERE id = ?', [id]);
  return row ? rowToOrdemServico(row) : null;
}

export async function saveOrdemServico(os: OrdemServico): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO ordens_servico
       (id, numero, orcamento_id, cliente_id, cliente_nome, titulo, descricao, status,
        tecnico_id, tecnico_nome, data_agendada, checklist, fotos, observacoes, valor,
        criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [os.id, os.numero, os.orcamentoId ?? null, os.clienteId ?? null, os.clienteNome,
     os.titulo, os.descricao ?? null, os.status, os.tecnicoId ?? null, os.tecnicoNome ?? null,
     os.dataAgendada ?? null, JSON.stringify(os.checklist ?? []), JSON.stringify(os.fotos ?? []),
     os.observacoes ?? null, os.valor ?? null, os.criadoEm, os.atualizadoEm, os.excluidoEm ?? null],
  );
  // Espelho na nuvem pelo caminho PADRÃO de cloudSync (ordens_servico é SyncTable
  // de primeira classe: push/pull-no-login/tombstone/guard de timestamp + injeção
  // team-tenant do owner já tratados lá). Fire-and-forget, nunca afeta o save local.
  mirrorPush('ordens_servico', os);
}

/** SOFT DELETE → LIXEIRA (mantém o nome). Bump atualizado_em p/ o guard de sync. */
export async function deleteOrdemServico(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE ordens_servico SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getOrdemServico(id);
  if (atualizado) mirrorPush('ordens_servico', atualizado);
}

/** RESTAURAR da lixeira. */
export async function restaurarOrdemServico(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE ordens_servico SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getOrdemServico(id);
  if (atualizado) mirrorPush('ordens_servico', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirOrdemServicoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM ordens_servico WHERE id = ?', [id]);
  mirrorRemove('ordens_servico', id);
  registrarExclusao('ordens_servico', id);
}

/** OS na LIXEIRA (soft-deletadas). */
export async function getLixeiraOrdensServico(): Promise<OrdemServico[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM ordens_servico WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToOrdemServico);
}

/** Lê as OS ATIVAS (para o backup — a lixeira não vai no backup, ver exportAllData). */
async function getOrdensServicoForBackup(): Promise<OrdemServico[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM ordens_servico WHERE excluido_em IS NULL ORDER BY criado_em ASC');
  return rows.map(rowToOrdemServico);
}

// ─── EQUIPAMENTOS (PMOC Fase 1 — inventário HVAC + etiqueta QR) ──────────────
// CRUD LOCAL do inventário. A superfície do CONTRATO (getEquipamentos,
// salvarEquipamento, revogarQr, adicionarFotoEquip, urlEtiqueta…) vive em
// src/services/equipamentos.ts, que orquestra numeração/QR e chama estas funções.
// Aqui é só o acesso ao SQLite + o espelho na nuvem pelo caminho padrão de
// cloudSync (equipamentos é SyncTable de primeira classe: push/pull-no-login/
// tombstone/guard de timestamp + injeção team-tenant do owner já tratados lá).
function rowToEquipamento(r: any): Equipamento {
  // fotos vem como TEXT JSON — parse defensivo (nunca quebra a leitura).
  let fotos: string[] = [];
  try {
    const f = JSON.parse(r.fotos ?? '[]');
    if (Array.isArray(f)) fotos = f;
  } catch {
    // linha corrompida → sem fotos (não quebra a listagem)
  }
  return {
    id: r.id,
    clienteId: r.cliente_id ?? undefined,
    localId: r.local_id ?? undefined,
    codigoInterno: r.codigo_interno ?? undefined,
    patrimonio: r.patrimonio ?? undefined,
    fabricante: r.fabricante ?? undefined,
    modelo: r.modelo ?? undefined,
    numeroSerie: r.numero_serie ?? undefined,
    categoria: r.categoria ?? undefined,
    capacidadeBtu: r.capacidade_btu ?? undefined,
    tensao: r.tensao ?? undefined,
    refrigerante: r.refrigerante ?? undefined,
    localizacao: r.localizacao ?? undefined,
    situacao: (r.situacao ?? 'ativo') as SituacaoEquipamento,
    criticidade: (r.criticidade ?? undefined) as CriticidadeEquipamento | undefined,
    qrToken: r.qr_token ?? '',
    qrRevogadoEm: r.qr_revogado_em ?? undefined,
    fotos,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    excluidoEm: r.excluido_em ?? undefined,
  };
}

export async function getEquipamentosDb(): Promise<Equipamento[]> {
  const db = await getDb();
  // LIXEIRA: só ATIVOS. Mais recentes primeiro (por criação); tiebreaker por id.
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM equipamentos WHERE excluido_em IS NULL ORDER BY criado_em DESC, id DESC',
  );
  return rows.map(rowToEquipamento);
}

// Leitura por id NÃO filtra soft-delete (restaurar/detalhe da lixeira).
export async function getEquipamentoDb(id: string): Promise<Equipamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM equipamentos WHERE id = ?', [id]);
  return row ? rowToEquipamento(row) : null;
}

/** Equipamentos ATIVOS de um cliente específico (inventário do cliente). */
export async function getEquipamentosDoClienteDb(clienteId: string): Promise<Equipamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM equipamentos WHERE cliente_id = ? AND excluido_em IS NULL ORDER BY criado_em DESC, id DESC',
    [clienteId],
  );
  return rows.map(rowToEquipamento);
}

export async function saveEquipamentoDb(e: Equipamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO equipamentos
       (id, cliente_id, local_id, codigo_interno, patrimonio, fabricante, modelo, numero_serie,
        categoria, capacidade_btu, tensao, refrigerante, localizacao, situacao, criticidade,
        qr_token, qr_revogado_em, fotos, criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [e.id, e.clienteId ?? null, e.localId ?? null, e.codigoInterno ?? null, e.patrimonio ?? null,
     e.fabricante ?? null, e.modelo ?? null, e.numeroSerie ?? null, e.categoria ?? null,
     e.capacidadeBtu ?? null, e.tensao ?? null, e.refrigerante ?? null, e.localizacao ?? null,
     e.situacao, e.criticidade ?? null, e.qrToken ?? '', e.qrRevogadoEm ?? null,
     JSON.stringify(e.fotos ?? []), e.criadoEm, e.atualizadoEm, e.excluidoEm ?? null],
  );
  // Espelho na nuvem pelo caminho PADRÃO de cloudSync (fire-and-forget, nunca
  // afeta o save local). O TO_ROW preserva o qr_token que veio do pull (ou o omite
  // no primeiro insert sem token, deixando o DEFAULT do banco gerar) — ver cloudSync.
  mirrorPush('equipamentos', e);
}

/** SOFT DELETE → LIXEIRA (mantém o nome; removerEquipamento do service chama aqui). */
export async function deleteEquipamentoDb(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE equipamentos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getEquipamentoDb(id);
  if (atualizado) mirrorPush('equipamentos', atualizado);
}

/** RESTAURAR da lixeira. */
export async function restaurarEquipamento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE equipamentos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getEquipamentoDb(id);
  if (atualizado) mirrorPush('equipamentos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirEquipamentoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM equipamentos WHERE id = ?', [id]);
  mirrorRemove('equipamentos', id);
  registrarExclusao('equipamentos', id);
}

/** Equipamentos na LIXEIRA (soft-deletados). */
export async function getLixeiraEquipamentos(): Promise<Equipamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM equipamentos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToEquipamento);
}

/** Lê os equipamentos ATIVOS (para o backup — a lixeira não vai no backup). */
async function getEquipamentosForBackup(): Promise<Equipamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM equipamentos WHERE excluido_em IS NULL ORDER BY criado_em ASC');
  return rows.map(rowToEquipamento);
}

// ─── RECIBOS ─────────────────────────────────────────────
export async function getRecibos(): Promise<Recibo[]> {
  const db = await getDb();
  // LIXEIRA: só ATIVOS. Mesma lógica de getOrcamentos (soft-delete no blob JSON):
  // ordena por data de criação (mais novo primeiro), com fallback por `numero`.
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM recibos WHERE json_extract(data, '$.excluidoEm') IS NULL ORDER BY json_extract(data, '$.criadoEm') DESC, numero DESC",
  );
  return rows.map(r => JSON.parse(r.data));
}

// Leitura por id NÃO filtra soft-delete (restaurar/detalhe da lixeira).
export async function getRecibo(id: string): Promise<Recibo | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM recibos WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) : null;
}

export async function saveRecibo(r: Recibo): Promise<void> {
  const db = await getDb();
  // Recibo é blob: o relógio de sync vive DENTRO do JSON (e é espelhado na coluna
  // `atualizado_em` da nuvem por reciboToRow).
  const salvo: Recibo = { ...r, atualizadoEm: new Date().toISOString() };
  await db.runAsync(
    'INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
    [salvo.id, salvo.numero, JSON.stringify(salvo)]
  );
  mirrorPush('recibos', salvo);
}

/** SOFT DELETE → LIXEIRA (excluidoEm no blob). Bumpa o relógio de sync. */
export async function deleteRecibo(id: string): Promise<void> {
  const db = await getDb();
  const r = await getRecibo(id);
  if (!r) return;
  const agora = new Date().toISOString();
  const atualizado: Recibo = { ...r, excluidoEm: agora, atualizadoEm: agora };
  await db.runAsync('INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
    [atualizado.id, atualizado.numero, JSON.stringify(atualizado)]);
  mirrorPush('recibos', atualizado);
}

/** RESTAURAR da lixeira. Bumpa o relógio para vencer a cópia excluída dos outros aparelhos. */
export async function restaurarRecibo(id: string): Promise<void> {
  const db = await getDb();
  const r = await getRecibo(id);
  if (!r) return;
  const { excluidoEm, ...resto } = r;
  void excluidoEm;
  const atualizado: Recibo = { ...(resto as Recibo), atualizadoEm: new Date().toISOString() };
  await db.runAsync('INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
    [atualizado.id, atualizado.numero, JSON.stringify(atualizado)]);
  mirrorPush('recibos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirReciboDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM recibos WHERE id = ?', [id]);
  mirrorRemove('recibos', id);
  registrarExclusao('recibos', id);
}

/** Recibos na LIXEIRA (soft-deletados). */
export async function getLixeiraRecibos(): Promise<Recibo[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM recibos WHERE json_extract(data, '$.excluidoEm') IS NOT NULL ORDER BY json_extract(data, '$.excluidoEm') DESC",
  );
  return rows.map(r => JSON.parse(r.data));
}

export async function getNextReciboNumber(): Promise<string> {
  const seq = await proximoNaSequencia('recibo', 'recibos');
  const year = new Date().getFullYear().toString().slice(-2);
  return `REC-${String(seq).padStart(3, '0')}${year}`;
}

// ─── MODELOS ─────────────────────────────────────────────
function rowToModelo(r: any): ModeloOrcamento {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    orcamentoBase: JSON.parse(r.data), criadoEm: r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? undefined,
  };
}

export async function getModelos(): Promise<ModeloOrcamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM modelos WHERE excluido_em IS NULL ORDER BY criado_em DESC');
  return rows.map(rowToModelo);
}

export async function saveModelo(m: ModeloOrcamento): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const salvo: ModeloOrcamento = { ...m, atualizadoEm: agora };
  await db.runAsync(
    'INSERT OR REPLACE INTO modelos (id, nome, descricao, data, criado_em, excluido_em, atualizado_em) VALUES (?,?,?,?,?,?,?)',
    [salvo.id, salvo.nome, salvo.descricao ?? null, JSON.stringify(salvo.orcamentoBase),
     salvo.criadoEm, salvo.excluidoEm ?? null, agora]
  );
  mirrorPush('modelos', salvo);
}

/** SOFT DELETE → LIXEIRA (mantém o nome). Bumpa o relógio de sync. */
export async function deleteModelo(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE modelos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getModeloRaw(id);
  if (atualizado) mirrorPush('modelos', atualizado);
}

/** RESTAURAR da lixeira. Bumpa o relógio para vencer a cópia excluída dos outros aparelhos. */
export async function restaurarModelo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE modelos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getModeloRaw(id);
  if (atualizado) mirrorPush('modelos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirModeloDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM modelos WHERE id = ?', [id]);
  mirrorRemove('modelos', id);
  registrarExclusao('modelos', id);
}

/** Modelos na LIXEIRA (soft-deletados). */
export async function getLixeiraModelos(): Promise<ModeloOrcamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM modelos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToModelo);
}

async function getModeloRaw(id: string): Promise<ModeloOrcamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM modelos WHERE id = ?', [id]);
  return row ? rowToModelo(row) : null;
}

// ─── DEPOIMENTOS ─────────────────────────────────────────────
function rowToDepoimento(r: any): Depoimento {
  return {
    id: r.id, nomeCliente: r.nome_cliente, estrelas: r.estrelas,
    texto: r.texto ?? undefined, criadoEm: r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? undefined,
  };
}

export async function getDepoimentos(): Promise<Depoimento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM depoimentos WHERE excluido_em IS NULL ORDER BY criado_em DESC');
  return rows.map(rowToDepoimento);
}

export async function saveDepoimento(d: Depoimento): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const salvo: Depoimento = { ...d, atualizadoEm: agora };
  await db.runAsync(
    'INSERT OR REPLACE INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em, excluido_em, atualizado_em) VALUES (?,?,?,?,?,?,?)',
    [salvo.id, salvo.nomeCliente, salvo.estrelas, salvo.texto ?? null, salvo.criadoEm,
     salvo.excluidoEm ?? null, agora]
  );
  mirrorPush('depoimentos', salvo);
}

/** SOFT DELETE → LIXEIRA (mantém o nome). Bumpa o relógio de sync. */
export async function deleteDepoimento(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE depoimentos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getDepoimentoRaw(id);
  if (atualizado) mirrorPush('depoimentos', atualizado);
}

/** RESTAURAR da lixeira. Bumpa o relógio para vencer a cópia excluída dos outros aparelhos. */
export async function restaurarDepoimento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE depoimentos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getDepoimentoRaw(id);
  if (atualizado) mirrorPush('depoimentos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE (hard delete + tombstone). */
export async function excluirDepoimentoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM depoimentos WHERE id = ?', [id]);
  mirrorRemove('depoimentos', id);
  registrarExclusao('depoimentos', id);
}

/** Depoimentos na LIXEIRA (soft-deletados). */
export async function getLixeiraDepoimentos(): Promise<Depoimento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM depoimentos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToDepoimento);
}

async function getDepoimentoRaw(id: string): Promise<Depoimento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM depoimentos WHERE id = ?', [id]);
  return row ? rowToDepoimento(row) : null;
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
 * Busca códigos de erro com filtro opcional por marca, por severidade e por
 * texto livre (código, falha, sintoma/causa, ação ou exibição "LED piscando").
 * Prioriza o MATCH EXATO de código (ex.: digitou "E4" e existe um código "E4")
 * no topo dos resultados — depois, ordem alfabética por marca/código.
 */
export async function searchCodigosErro(opts: { marca?: string | null; q?: string; severidade?: string | null }): Promise<CodigoErro[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: any[] = [];
  if (opts.marca) { where.push('marca = ?'); params.push(opts.marca); }
  if (opts.severidade) { where.push('severidade = ?'); params.push(opts.severidade); }
  const q = opts.q?.trim();
  const orderParams: any[] = [];
  if (q) {
    where.push('(codigo LIKE ? OR falha LIKE ? OR causa LIKE ? OR acao LIKE ? OR exibicao LIKE ? OR cat_app LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
    orderParams.push(q);
  }
  const orderBy = q
    ? '(CASE WHEN UPPER(codigo) = UPPER(?) THEN 0 ELSE 1 END) ASC, marca ASC, codigo ASC'
    : 'marca ASC, codigo ASC';
  const sql =
    'SELECT * FROM codigos_erro' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${orderBy} LIMIT 200`;
  const rows = await db.getAllAsync<any>(sql, [...params, ...orderParams]);
  return rows.map(rowToCodigoErro);
}

/**
 * Quantos códigos existem em cada severidade DENTRO do contexto atual (marca +
 * texto), ignorando o próprio filtro de severidade. Alimenta a contagem ao vivo
 * dos chips — o técnico vê "12 críticas, 40 altas" e usa o filtro pra triar, em
 * vez de tatear. Mesma cláusula WHERE da busca, menos a severidade.
 */
export async function countCodigosErroPorSeveridade(
  opts: { marca?: string | null; q?: string }
): Promise<Record<string, number>> {
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
    'SELECT severidade, COUNT(*) as c FROM codigos_erro' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' GROUP BY severidade';
  const rows = await db.getAllAsync<{ severidade: string | null; c: number }>(sql, params);
  const out: Record<string, number> = {};
  for (const r of rows) { if (r.severidade) out[r.severidade] = r.c; }
  return out;
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
    excluidoEm: r.excluido_em ?? undefined,
  };
}

async function getAgendamentosForBackup(): Promise<Agendamento[]> {
  const db = await getDb();
  // Só ATIVOS (a lixeira não entra no backup — ver exportAllData).
  const rows = await db.getAllAsync<any>('SELECT * FROM agendamentos WHERE excluido_em IS NULL ORDER BY inicio ASC');
  return rows.map(rowToAgendamentoLocal);
}

// ─── AGENDAMENTOS — LIXEIRA (soft-delete). As LEITURAS e o DELETE do usuário
// vivem em services/agenda.ts (fora do meu escopo). Estas funções dão o suporte
// da lixeira em database.ts; o INTEGRADOR liga o agenda.deleteAgendamento a
// moverAgendamentoParaLixeira e filtra `excluido_em IS NULL` nas leituras de agenda
// (ver observações). Enquanto não ligado, nada solta soft-delete de agendamento e
// getLixeiraAgendamentos fica vazio — sem inconsistência.
async function getAgendamentoLocalRaw(id: string): Promise<Agendamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM agendamentos WHERE id = ?', [id]);
  return row ? rowToAgendamentoLocal(row) : null;
}

/** SOFT DELETE de agendamento → LIXEIRA. Bump atualizado_em p/ o guard de sync. */
export async function moverAgendamentoParaLixeira(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE agendamentos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const atualizado = await getAgendamentoLocalRaw(id);
  if (atualizado) mirrorPush('agendamentos', atualizado);
}

/** RESTAURAR agendamento da lixeira. */
export async function restaurarAgendamento(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE agendamentos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const atualizado = await getAgendamentoLocalRaw(id);
  if (atualizado) mirrorPush('agendamentos', atualizado);
}

/** EXCLUIR DEFINITIVAMENTE agendamento (hard delete + tombstone). */
export async function excluirAgendamentoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM agendamentos WHERE id = ?', [id]);
  mirrorRemove('agendamentos', id);
  registrarExclusao('agendamentos', id);
}

/** Agendamentos na LIXEIRA (soft-deletados). */
export async function getLixeiraAgendamentos(): Promise<Agendamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM agendamentos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC');
  return rows.map(rowToAgendamentoLocal);
}

// ─── RELATÓRIO DO DIA (falado) ────────────────────────────
/**
 * Snapshot compilado de um dia (orçamentos, recibos, agenda, clientes novos).
 * O shape completo de `dados` é definido por `RelatorioDia` em services/relatorioDia
 * — aqui a coluna é só um JSON opaco, igual ao padrão de `orcamentos`/`modelos`.
 */
export interface RelatorioDiaRow {
  data: string; // 'YYYY-MM-DD'
  dados: any;
  criadoEm: string;
}

/** Cria ou substitui (upsert) o snapshot do dia — idempotente por `data`. */
export async function saveRelatorioDia(data: string, dados: unknown, criadoEm?: string): Promise<void> {
  const db = await getDb();
  // criadoEm é o carimbo de LWW do snapshot. Passe-o para PRESERVAR (visualização
  // não deve avançar o relógio); omita para carimbar agora (autoria/1ª gravação).
  await db.runAsync(
    'INSERT OR REPLACE INTO relatorios_diarios (data, dados, criado_em) VALUES (?,?,?)',
    [data, JSON.stringify(dados), criadoEm ?? new Date().toISOString()]
  );
}

/** Lê o snapshot salvo de um dia específico ('YYYY-MM-DD'), ou null. */
export async function getRelatorioDia(data: string): Promise<RelatorioDiaRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string; dados: string; criado_em: string }>(
    'SELECT * FROM relatorios_diarios WHERE data = ?', [data]
  );
  return row ? { data: row.data, dados: JSON.parse(row.dados), criadoEm: row.criado_em } : null;
}

/** Histórico de relatórios salvos, do mais recente para o mais antigo. */
export async function getRelatoriosDias(limit = 30): Promise<RelatorioDiaRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string; dados: string; criado_em: string }>(
    'SELECT * FROM relatorios_diarios ORDER BY data DESC LIMIT ?', [limit]
  );
  return rows.map(r => ({ data: r.data, dados: JSON.parse(r.dados), criadoEm: r.criado_em }));
}

async function getRelatoriosDiasForBackup(): Promise<RelatorioDiaRow[]> {
  return getRelatoriosDias(3650); // ~10 anos — o backup leva o histórico inteiro
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
  /** Histórico de relatórios do dia (opcional — snapshots antigos não têm). */
  relatoriosDiarios?: RelatorioDiaRow[];
  /** Histórico de versões de orçamento (opcional — snapshots antigos não têm). */
  orcamentoVersoes?: OrcamentoVersao[];
  /** Ordens de serviço (opcional — snapshots antigos não têm). */
  ordensServico?: OrdemServico[];
  /** Equipamentos HVAC / inventário PMOC (opcional — snapshots antigos não têm). */
  equipamentos?: Equipamento[];
}

/** Lê todas as versões de orçamento (para o backup levar o histórico completo). */
async function getVersoesForBackup(): Promise<OrcamentoVersao[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM orcamento_versoes ORDER BY orcamento_id ASC, numero_versao ASC',
  );
  return rows.map(rowToVersao);
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
  const [empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos, agendamentos, contadores, relatoriosDiarios, orcamentoVersoes, ordensServico, equipamentos] = await Promise.all([
    getEmpresa(), getClientes(), getServicos(), getProdutos(),
    getOrcamentos(), getRecibos(), getModelos(), getDepoimentos(), getAgendamentosForBackup(), getContadoresForBackup(),
    getRelatoriosDiasForBackup(), getVersoesForBackup(), getOrdensServicoForBackup(), getEquipamentosForBackup(),
  ]);
  return {
    version: 2, exportedAt: new Date().toISOString(),
    empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos, agendamentos, contadores, relatoriosDiarios, orcamentoVersoes, ordensServico, equipamentos,
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
  const relatoriosDiarios = asArray<RelatorioDiaRow>(data.relatoriosDiarios);
  const orcamentoVersoes = asArray<OrcamentoVersao>(data.orcamentoVersoes);
  const ordensServico = asArray<OrdemServico>(data.ordensServico);
  const equipamentos = asArray<Equipamento>(data.equipamentos);

  // GUARDA ANTI-PERDA: um backup corrompido/parcial que vira `{}` passa pela checagem
  // de objeto lá em cima e, SEM isto, apagaria todas as tabelas e inseriria nada
  // (perda TOTAL). Se o snapshot não traz NENHUM item nem empresa, é vazio/inválido:
  // recusa ANTES de tocar no banco. Um app de fato vazio não tem o que perder.
  const totalItens =
    clientes.length + servicos.length + produtos.length + orcamentos.length +
    recibos.length + modelos.length + depoimentos.length + agendamentos.length +
    relatoriosDiarios.length + orcamentoVersoes.length + ordensServico.length + equipamentos.length;
  if (totalItens === 0 && !data.empresa) {
    throw new Error('Backup vazio ou inválido — nada para restaurar. Seus dados não foram alterados.');
  }

  // Ids que o snapshot TRAZ DE VOLTA — usados para limpar tombstones (senão um item
  // recuperado num restore seria re-excluído pelo applyCloudTombstones no próximo sync).
  const idsRestaurados: { tabela: string; itemId: string }[] = [
    ...clientes.map((c) => ({ tabela: 'clientes', itemId: c.id })),
    ...servicos.map((s) => ({ tabela: 'servicos', itemId: s.id })),
    ...produtos.map((p) => ({ tabela: 'produtos', itemId: p.id })),
    ...orcamentos.map((o) => ({ tabela: 'orcamentos', itemId: o.id })),
    ...recibos.map((r) => ({ tabela: 'recibos', itemId: r.id })),
    ...modelos.map((m) => ({ tabela: 'modelos', itemId: m.id })),
    ...depoimentos.map((d) => ({ tabela: 'depoimentos', itemId: d.id })),
    ...agendamentos.map((a) => ({ tabela: 'agendamentos', itemId: a.id })),
    ...ordensServico.map((os) => ({ tabela: 'ordens_servico', itemId: os.id })),
    ...equipamentos.map((e) => ({ tabela: 'equipamentos', itemId: e.id })),
  ];

  const db = await getDb();
  // Dentro da transação usamos upserts LOCAIS SILENCIOSOS (runAsync direto, SEM
  // mirrorPush) para não disparar uma tempestade de rede no meio da restauração.
  // UM ÚNICO pushAllLocal() é disparado DEPOIS do commit (fire-and-forget).
  await db.withTransactionAsync(async () => {
    // Restore = "SUBSTITUIR os dados atuais": apaga também a `empresa` antiga, para
    // não deixar o negócio de outra conta/estado persistir (logo/nome/dados que vão
    // ao PDF e ao link público). Se o snapshot trouxer empresa, ela é reinserida
    // abaixo; se NÃO trouxer, o restore fica sem empresa (coerente com o snapshot).
    await db.execAsync(`
      DELETE FROM empresa;
      DELETE FROM clientes; DELETE FROM servicos; DELETE FROM produtos;
      DELETE FROM orcamentos; DELETE FROM orcamento_versoes; DELETE FROM recibos; DELETE FROM modelos; DELETE FROM depoimentos;
      DELETE FROM agendamentos; DELETE FROM ordens_servico; DELETE FROM equipamentos;
    `);
    if (data.empresa) {
      await db.runAsync('INSERT OR REPLACE INTO empresa (id, data) VALUES (?, ?)', [
        data.empresa.id, JSON.stringify(data.empresa),
      ]);
    }
    // `atualizado_em` PRECISA ir nestes inserts: a coluna da nuvem é NOT NULL, e o
    // pushAllLocal que roda logo após o commit mandaria null para todo item
    // restaurado, quebrando o sync inteiro de quem acabou de restaurar um backup.
    // Snapshots antigos não têm o campo → caímos em criadoEm (nunca em "agora",
    // que faria o item restaurado vencer cópias remotas mais recentes).
    for (const c of clientes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO clientes
         (id, nome, telefone, cpf, cnpj, endereco, complemento, estado, cidade, cep, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [c.id, c.nome, c.telefone, c.cpf ?? null, c.cnpj ?? null, c.endereco ?? null,
         c.complemento ?? null, c.estado ?? null, c.cidade ?? null, c.cep ?? null, c.criadoEm,
         c.atualizadoEm ?? c.criadoEm],
      );
    }
    for (const s of servicos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO servicos (id, nome, descricao, preco, custo, unidade, foto_uri, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [s.id, s.nome, s.descricao ?? null, s.preco, s.custo ?? null, s.unidade, s.fotoUri ?? null, s.criadoEm,
         s.atualizadoEm ?? s.criadoEm],
      );
    }
    for (const p of produtos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO produtos
         (id, nome, descricao, preco, custo, marca, modelo, unidade, foto_uri, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.nome, p.descricao ?? null, p.preco, p.custo ?? null, p.marca ?? null,
         p.modelo ?? null, p.unidade, p.fotoUri ?? null, p.criadoEm,
         p.atualizadoEm ?? p.criadoEm],
      );
    }
    for (const o of orcamentos) {
      await db.runAsync('INSERT OR REPLACE INTO orcamentos (id, numero, data) VALUES (?,?,?)',
        [o.id, o.numero, JSON.stringify(o)]);
    }
    for (const v of orcamentoVersoes) {
      // Só restaura versões válidas e ligadas a um orçamento (defensivo contra
      // snapshots corrompidos). `dados` pode chegar como objeto (JSON parseado) ou
      // como string já serializada — normalizamos para string antes de gravar.
      if (!v || !v.id || !v.orcamentoId || v.numeroVersao == null) continue;
      const dadosStr = typeof v.dados === 'string' ? v.dados : JSON.stringify(v.dados);
      await db.runAsync(
        'INSERT OR REPLACE INTO orcamento_versoes (id, orcamento_id, numero_versao, dados, criado_em) VALUES (?,?,?,?,?)',
        [v.id, v.orcamentoId, v.numeroVersao, dadosStr, v.criadoEm ?? new Date().toISOString()],
      );
    }
    for (const r of recibos) {
      await db.runAsync('INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)',
        [r.id, r.numero, JSON.stringify(r)]);
    }
    for (const m of modelos) {
      await db.runAsync('INSERT OR REPLACE INTO modelos (id, nome, descricao, data, criado_em, atualizado_em) VALUES (?,?,?,?,?,?)',
        [m.id, m.nome, m.descricao ?? null, JSON.stringify(m.orcamentoBase), m.criadoEm,
         m.atualizadoEm ?? m.criadoEm]);
    }
    for (const d of depoimentos) {
      await db.runAsync('INSERT OR REPLACE INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em, atualizado_em) VALUES (?,?,?,?,?,?)',
        [d.id, d.nomeCliente, d.estrelas, d.texto ?? null, d.criadoEm,
         d.atualizadoEm ?? d.criadoEm]);
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
    for (const os of ordensServico) {
      // Defensivo contra snapshots corrompidos: exige id + campos NOT NULL do schema.
      if (!os || !os.id) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO ordens_servico
           (id, numero, orcamento_id, cliente_id, cliente_nome, titulo, descricao, status,
            tecnico_id, tecnico_nome, data_agendada, checklist, fotos, observacoes, valor,
            criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [os.id, os.numero ?? '', os.orcamentoId ?? null, os.clienteId ?? null, os.clienteNome ?? '',
         os.titulo ?? '', os.descricao ?? null, os.status ?? 'aberta', os.tecnicoId ?? null,
         os.tecnicoNome ?? null, os.dataAgendada ?? null,
         JSON.stringify(Array.isArray(os.checklist) ? os.checklist : []),
         JSON.stringify(Array.isArray(os.fotos) ? os.fotos : []),
         os.observacoes ?? null, os.valor ?? null,
         os.criadoEm ?? new Date().toISOString(), os.atualizadoEm ?? new Date().toISOString()],
      );
    }
    for (const e of equipamentos) {
      // Defensivo contra snapshots corrompidos: exige id + campos NOT NULL do schema.
      if (!e || !e.id) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO equipamentos
           (id, cliente_id, local_id, codigo_interno, patrimonio, fabricante, modelo, numero_serie,
            categoria, capacidade_btu, tensao, refrigerante, localizacao, situacao, criticidade,
            qr_token, qr_revogado_em, fotos, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [e.id, e.clienteId ?? null, e.localId ?? null, e.codigoInterno ?? null, e.patrimonio ?? null,
         e.fabricante ?? null, e.modelo ?? null, e.numeroSerie ?? null, e.categoria ?? null,
         e.capacidadeBtu ?? null, e.tensao ?? null, e.refrigerante ?? null, e.localizacao ?? null,
         e.situacao ?? 'ativo', e.criticidade ?? null, e.qrToken ?? '', e.qrRevogadoEm ?? null,
         JSON.stringify(Array.isArray(e.fotos) ? e.fotos : []),
         e.criadoEm ?? new Date().toISOString(), e.atualizadoEm ?? new Date().toISOString()],
      );
    }
    // Relatórios diários: MERGE (não apaga o histórico local existente) — é um
    // diário pessoal do aparelho, diferente das tabelas relacionais acima que o
    // restore SUBSTITUI por completo. O snapshot só adiciona/atualiza os dias que trouxer.
    for (const rd of relatoriosDiarios) {
      await db.runAsync('INSERT OR REPLACE INTO relatorios_diarios (data, dados, criado_em) VALUES (?,?,?)',
        [rd.data, JSON.stringify(rd.dados), rd.criadoEm]);
    }

    // Numeração: restaura os contadores do snapshot, com PISO no nº de registros
    // restaurados (Math.max) — a sequência nunca regride nem colide com números já
    // usados. (Snapshots antigos sem `contadores` caem no piso pela contagem.)
    const contadores = (data.contadores && typeof data.contadores === 'object') ? data.contadores : {};
    const cOrc = Math.max(Number(contadores['orcamento']) || 0, orcamentos.length);
    const cRec = Math.max(Number(contadores['recibo']) || 0, recibos.length);
    await db.runAsync('INSERT OR REPLACE INTO contadores (chave, valor) VALUES (?, ?)', ['orcamento', cOrc]);
    await db.runAsync('INSERT OR REPLACE INTO contadores (chave, valor) VALUES (?, ?)', ['recibo', cRec]);

    // Restore RECUPERA itens: remove os tombstones LOCAIS desses ids para o
    // pushLocalTombstones não os re-excluir. (Os da nuvem são limpos após o commit.)
    for (const { tabela, itemId } of idsRestaurados) {
      await db.runAsync('DELETE FROM exclusoes WHERE tabela = ? AND item_id = ?', [tabela, itemId]);
    }
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

  // Limpa na NUVEM os tombstones dos ids restaurados — senão o próximo syncOnLogin
  // (applyCloudTombstones) re-excluiria o que o restore acabou de recuperar. O botão
  // "Restaurar" passa a recuperar de verdade. Fire-and-forget: offline = no-op.
  if (idsRestaurados.length) {
    try {
      void limparTombstonesNuvem(idsRestaurados).catch(() => {});
    } catch {
      // idem
    }
  }

  // O restore apagou e recriou os agendamentos direto no SQLite, sem tocar nas
  // notificações locais: reconcilia os lembretes com o estado restaurado (cancela
  // os órfãos e reagenda os futuros). Fire-and-forget: falha de notificação nunca
  // pode comprometer o restore dos dados.
  try {
    void resincronizarLembretes().catch(() => {});
  } catch {
    // idem
  }
}

// ─── LIMPEZA TOTAL (logout) ───────────────────────────────
// As chaves de AsyncStorage que guardam DADOS do usuário e devem ser zeradas no
// logout ficam centralizadas em services/storageKeys (APP_DATA_STORAGE_KEYS),
// compartilhadas com os módulos donos de cada chave. A allow-list é explícita
// (nunca AsyncStorage.clear()) para jamais apagar a sessão de auth, a chave de
// onboarding ('olli.onboarded' — preferência do aparelho) ou chaves de terceiros.

// Tabelas do SQLite que guardam DADOS do usuário — apagadas no logout. Preserva
// APENAS `codigos_erro` (seed estático de 602 códigos, igual para todos), que é
// re-semeado sob demanda mas não precisa ser reimportado a cada logout.
const USER_DATA_TABLES = [
  'clientes', 'servicos', 'produtos', 'orcamentos', 'orcamento_versoes', 'recibos', 'modelos',
  'depoimentos', 'agendamentos', 'ordens_servico', 'empresa', 'exclusoes', 'contadores',
  'eventos', 'cache_ia', 'casos_erro', 'relatorios_diarios',
  // PMOC/HVAC — estavam de FORA e vazavam entre contas no aparelho compartilhado (equipamentos,
  // planos de manutenção e ordens geradas do usuário anterior sobreviviam ao logout).
  'equipamentos', 'pmoc_planos', 'pmoc_plano_versoes', 'pmoc_ordens_geradas',
];

/**
 * Apaga TODOS os dados locais do usuário (SQLite + chaves de app no AsyncStorage),
 * preservando a chave de onboarding e o seed estático `codigos_erro`. Usado no
 * LOGOUT para o próximo login partir de um estado limpo — impede o vazamento de
 * dados entre contas em aparelho compartilhado (o pushAllLocal do próximo login
 * não pode subir dados do usuário anterior). Transacional: se qualquer DELETE
 * falhar, faz ROLLBACK e nada é perdido pela metade.
 */
export async function clearAllLocalData(): Promise<void> {
  const database = await getDb();
  // 1) SQLite — tudo dentro de UMA transação (all-or-nothing).
  await database.withTransactionAsync(async () => {
    for (const tabela of USER_DATA_TABLES) {
      // Nomes vêm de uma allow-list fixa (nunca de entrada externa) → SQL seguro.
      await database.runAsync(`DELETE FROM ${tabela}`);
    }
  });
  // 2) Notificações agendadas — cancela os lembretes de agenda E de vencimento
  // PMOC da conta anterior ANTES de apagar os mapas que permitem cancelá-los,
  // senão continuariam disparando no aparelho (com nome/endereço do cliente)
  // após a troca de conta. Best-effort.
  try {
    await cancelarTodosLembretes();
  } catch {
    // não bloqueia o logout
  }
  try {
    await cancelarTodosLembretesPmoc();
  } catch {
    // não bloqueia o logout
  }
  // 3) AsyncStorage — remove só as chaves de dados do usuário (allow-list).
  // Best-effort: uma falha aqui não deve impedir o logout (o SQLite já foi limpo).
  try {
    await AsyncStorage.multiRemove(APP_DATA_STORAGE_KEYS);
  } catch {
    // não bloqueia o logout
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

// ─── PMOC Fase 2 — plano, versões (append-only) e livro-caixa das ordens ─────
//
// CAVEAT LEGAL: `situacao` é OPERACIONAL. Periodicidades e referências normativas
// vivem no JSON da VERSÃO (dado configurável), nunca em coluna ou constante.

function rowToPmocPlanoDb(r: any): PmocPlano {
  return {
    id: r.id,
    clienteId: r.cliente_id ?? undefined,
    contratoId: r.contrato_id ?? undefined,
    numero: r.numero ?? undefined,
    titulo: r.titulo,
    situacao: r.situacao,
    versaoVigente: r.versao_vigente ?? undefined,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em ?? undefined,
    excluidoEm: r.excluido_em ?? undefined,
  };
}

export async function savePmocPlano(p: PmocPlano): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const salvo: PmocPlano = { ...p, atualizadoEm: agora };
  await db.runAsync(
    `INSERT OR REPLACE INTO pmoc_planos
       (id, cliente_id, contrato_id, numero, titulo, situacao, versao_vigente, criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [salvo.id, salvo.clienteId ?? null, salvo.contratoId ?? null, salvo.numero ?? null,
     salvo.titulo, salvo.situacao, salvo.versaoVigente ?? null, salvo.criadoEm, agora,
     salvo.excluidoEm ?? null],
  );
  mirrorPush('pmoc_planos', salvo);
}

/** Planos ATIVOS (fora da lixeira), do mais recente ao mais antigo. */
export async function getPmocPlanos(): Promise<PmocPlano[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM pmoc_planos WHERE excluido_em IS NULL ORDER BY criado_em DESC',
  );
  return rows.map(rowToPmocPlanoDb);
}

/** Um plano por id. NÃO filtra soft-delete (a Lixeira precisa ler o item excluído). */
export async function getPmocPlano(id: string): Promise<PmocPlano | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>('SELECT * FROM pmoc_planos WHERE id = ?', [id]);
  return r ? rowToPmocPlanoDb(r) : null;
}

/** SOFT DELETE → LIXEIRA. Bumpa o relógio de sync (ver deleteCliente). */
export async function deletePmocPlano(id: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE pmoc_planos SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [agora, agora, id]);
  const p = await getPmocPlano(id);
  if (p) mirrorPush('pmoc_planos', p);
}

export async function restaurarPmocPlano(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE pmoc_planos SET excluido_em = NULL, atualizado_em = ? WHERE id = ?', [new Date().toISOString(), id]);
  const p = await getPmocPlano(id);
  if (p) mirrorPush('pmoc_planos', p);
}

export async function excluirPmocPlanoDefinitivo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pmoc_planos WHERE id = ?', [id]);
  mirrorRemove('pmoc_planos', id);
  registrarExclusao('pmoc_planos', id);
}

export async function getLixeiraPmocPlanos(): Promise<PmocPlano[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM pmoc_planos WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC',
  );
  return rows.map(rowToPmocPlanoDb);
}

function rowToPmocVersaoDb(r: any): PmocPlanoVersao {
  const d = JSON.parse(r.dados || '{}');
  return {
    id: r.id,
    planoId: r.plano_id,
    numeroVersao: r.numero_versao,
    periodicidades: Array.isArray(d.periodicidades) ? d.periodicidades : [],
    equipamentoIds: Array.isArray(d.equipamentoIds) ? d.equipamentoIds : [],
    referencias: Array.isArray(d.referencias) ? d.referencias : [],
    responsavelTecnico: r.responsavel_tecnico ?? undefined,
    docResponsabilidade: r.doc_responsabilidade ?? undefined,
    aprovadoEm: r.aprovado_em ?? undefined,
    criadoEm: r.criado_em,
  };
}

/**
 * APPEND-ONLY. Uma versão APROVADA nunca é reescrita: o snapshot é a prova do que
 * o responsável técnico assinou. A nuvem tem trigger que recusa alterá-la; aqui
 * recusamos antes de gastar rede, e falhamos alto (não silenciosamente).
 */
export async function savePmocVersao(v: PmocPlanoVersao): Promise<void> {
  const db = await getDb();
  const existente = await db.getFirstAsync<{ aprovado_em: string | null }>(
    'SELECT aprovado_em FROM pmoc_plano_versoes WHERE id = ?', [v.id],
  );
  if (existente?.aprovado_em) {
    throw new Error('Versão já aprovada não pode ser alterada. Crie uma nova versão do plano.');
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO pmoc_plano_versoes
       (id, plano_id, numero_versao, dados, responsavel_tecnico, doc_responsabilidade, aprovado_em, criado_em)
     VALUES (?,?,?,?,?,?,?,?)`,
    [v.id, v.planoId, v.numeroVersao,
     JSON.stringify({ periodicidades: v.periodicidades ?? [], equipamentoIds: v.equipamentoIds ?? [], referencias: v.referencias ?? [] }),
     v.responsavelTecnico ?? null, v.docResponsabilidade ?? null, v.aprovadoEm ?? null, v.criadoEm],
  );
  mirrorPush('pmoc_plano_versoes', v);
}

export async function getPmocVersoes(planoId: string): Promise<PmocPlanoVersao[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM pmoc_plano_versoes WHERE plano_id = ? ORDER BY numero_versao DESC', [planoId],
  );
  return rows.map(rowToPmocVersaoDb);
}

/** A versão vigente do plano (a apontada por `versao_vigente`), ou a mais recente. */
export async function getPmocVersaoVigente(planoId: string): Promise<PmocPlanoVersao | null> {
  const plano = await getPmocPlano(planoId);
  const versoes = await getPmocVersoes(planoId);
  if (!versoes.length) return null;
  if (plano?.versaoVigente != null) {
    const v = versoes.find((x) => x.numeroVersao === plano.versaoVigente);
    if (v) return v;
  }
  return versoes[0];
}

/** Próximo número de versão do plano. Considera TODAS as versões (nunca reusa). */
export async function proximoNumeroVersaoPmoc(planoId: string): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ maior: number | null }>(
    'SELECT MAX(numero_versao) AS maior FROM pmoc_plano_versoes WHERE plano_id = ?', [planoId],
  );
  return (r?.maior ?? 0) + 1;
}

function rowToPmocGeradaDb(r: any): PmocOrdemGerada {
  return {
    id: r.id,
    planoId: r.plano_id,
    equipamentoId: r.asset_id,
    periodo: r.periodo,
    periodicidadeId: r.periodicidade_id ?? '',
    ordemId: r.ordem_id,
    vencimento: r.vencimento ?? undefined,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em ?? undefined,
    excluidoEm: r.excluido_em ?? undefined,
  };
}

/**
 * Registra que uma visita do período virou ordem de serviço.
 *
 * `INSERT OR IGNORE` + índice único (plano, equipamento, período, periodicidade):
 * retorna `false` quando a visita JÁ existia. É assim que a geração vira segura de
 * repetir — a idempotência mora no BANCO, não em quem chama. Quem recebe `false`
 * deve DESFAZER a ordem que acabou de criar, senão sobra uma OS órfã.
 */
export async function registrarOrdemGerada(g: PmocOrdemGerada): Promise<boolean> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const r = await db.runAsync(
    `INSERT OR IGNORE INTO pmoc_ordens_geradas
       (id, plano_id, asset_id, periodo, periodicidade_id, ordem_id, vencimento, criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [g.id, g.planoId, g.equipamentoId, g.periodo, g.periodicidadeId ?? '', g.ordemId,
     g.vencimento ?? null, g.criadoEm, agora, null],
  );
  const inserida = (r?.changes ?? 0) > 0;
  if (inserida) mirrorPush('pmoc_ordens_geradas', { ...g, atualizadoEm: agora });
  return inserida;
}

/** Todas as visitas já geradas para um plano (para saber o que NÃO regerar). */
export async function getOrdensGeradas(planoId: string): Promise<PmocOrdemGerada[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM pmoc_ordens_geradas WHERE plano_id = ? AND excluido_em IS NULL ORDER BY periodo DESC', [planoId],
  );
  return rows.map(rowToPmocGeradaDb);
}

/**
 * `true` se o item foi excluído DEFINITIVAMENTE (hard delete + tombstone), e não
 * apenas mandado para a lixeira. É o que distingue "essa OS nunca chegou a ser
 * criada" de "o usuário a apagou de vez" — sem isso, um reconciliador que recria
 * a OS pelo id ressuscitaria justamente o que foi apagado de propósito, e o
 * tombstone a mataria de novo no próximo sync (ping-pong).
 */
export async function houveExclusaoDefinitiva(tabela: string, itemId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const r = await db.getFirstAsync<{ n: number }>(
      'SELECT 1 AS n FROM exclusoes WHERE tabela = ? AND item_id = ? LIMIT 1',
      [tabela, itemId],
    );
    return !!r;
  } catch {
    // Na dúvida, NÃO recria: preferimos deixar o usuário regerar de propósito a
    // ressuscitar algo que ele apagou.
    return true;
  }
}
