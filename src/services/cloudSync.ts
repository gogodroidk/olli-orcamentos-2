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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCurrentUser } from './supabase';
import { classificarContextoEquipe, decidirEscritaEquipe, decidirEmpresaEquipe } from './contextoEquipe';
import type { ContextoEquipe } from './contextoEquipe';
import { abrirParticaoDoUsuario, donoDoBancoAberto, getDb } from '../database/database';
import { podeSincronizar } from '../database/particao';
import {
  CHECKLIST_KEY,
  CHECKLIST_STAMP_KEY,
  RADAR_SNOOZE_KEY,
  RADAR_SNOOZE_STAMP_KEY,
  EMPRESA_STAMP_KEY,
} from './storageKeys';
import type {
  PmocPlano,
  PmocPlanoVersao,
  PmocOrdemGerada,
  Cliente,
  ServicoItem,
  ProdutoItem,
  Orcamento,
  Recibo,
  Empresa,
  ModeloOrcamento,
  Depoimento,
  Agendamento,
  OrdemServico,
  Equipamento,
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
  | 'agendamentos'
  | 'ordens_servico'
  | 'equipamentos'
  | 'pmoc_planos'
  | 'pmoc_plano_versoes'
  | 'pmoc_ordens_geradas';

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
  ordens_servico: 'id',
  equipamentos: 'id',
  pmoc_planos: 'id',
  pmoc_plano_versoes: 'id',
  pmoc_ordens_geradas: 'id',
};

// Mapa SyncTable → nome da tabela na NUVEM quando diferem. Padrão: nome igual à
// chave da SyncTable. `equipamentos` (tabela local) vive em `assets` na nuvem
// (nomenclatura PMOC). Usado SÓ nas chamadas remotas (upsert/select/delete); as
// operações LOCAIS seguem usando o nome local 'equipamentos'.
const REMOTE_TABLE: Partial<Record<SyncTable, string>> = {
  equipamentos: 'assets',
  pmoc_planos: 'pmoc_plans',
  pmoc_plano_versoes: 'pmoc_plan_versions',
};
function remoteNome(table: SyncTable): string {
  return REMOTE_TABLE[table] ?? table;
}

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
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: c.excluidoEm ?? null,
    // Relógio de sync. NUNCA null: a coluna na nuvem é NOT NULL, e um objeto vindo
    // de snapshot antigo (backup pré-v3) não tem o campo — caímos em criadoEm.
    atualizado_em: c.atualizadoEm ?? c.criadoEm,
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
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: s.excluidoEm ?? null,
    atualizado_em: s.atualizadoEm ?? s.criadoEm, // NOT NULL na nuvem (ver clienteToRow)
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
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: p.excluidoEm ?? null,
    atualizado_em: p.atualizadoEm ?? p.criadoEm, // NOT NULL na nuvem (ver clienteToRow)
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
    // Coluna-espelho só p/ índice/painel; a verdade do soft-delete é o `excluidoEm`
    // dentro de `dados` (blob), que já faz round-trip sozinho.
    excluido_em: o.excluidoEm ?? null,
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
    // Coluna-espelho só p/ índice/painel; a verdade do soft-delete é o `excluidoEm`
    // dentro de `dados` (blob), que já faz round-trip sozinho.
    excluido_em: r.excluidoEm ?? null,
    // Idem: espelho da coluna. A verdade do relógio é `atualizadoEm` dentro do blob.
    atualizado_em: r.atualizadoEm ?? r.criadoEm, // NOT NULL na nuvem (ver clienteToRow)
  };
}

function modeloToRow(m: ModeloOrcamento): Record<string, unknown> {
  return {
    id: m.id,
    nome: m.nome,
    descricao: m.descricao ?? null,
    dados: { orcamentoBase: m.orcamentoBase },
    criado_em: m.criadoEm,
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: m.excluidoEm ?? null,
    atualizado_em: m.atualizadoEm ?? m.criadoEm, // NOT NULL na nuvem (ver clienteToRow)
  };
}

function depoimentoToRow(d: Depoimento): Record<string, unknown> {
  return {
    id: d.id,
    nome_cliente: d.nomeCliente,
    estrelas: d.estrelas,
    texto: d.texto ?? null,
    criado_em: d.criadoEm,
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: d.excluidoEm ?? null,
    atualizado_em: d.atualizadoEm ?? d.criadoEm, // NOT NULL na nuvem (ver clienteToRow)
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
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: a.excluidoEm ?? null,
  };
}

// Ordem de Serviço (Onda 4): colunas explícitas (não jsonb-`dados`); checklist/fotos
// vão como ARRAY (viram jsonb na nuvem). SEM user_id (default auth.uid() + RLS).
function ordemServicoToRow(o: OrdemServico): Record<string, unknown> {
  return {
    id: o.id,
    numero: o.numero ?? null,
    orcamento_id: o.orcamentoId ?? null,
    cliente_id: o.clienteId ?? null,
    cliente_nome: o.clienteNome ?? null,
    titulo: o.titulo ?? null,
    descricao: o.descricao ?? null,
    status: o.status,
    tecnico_id: o.tecnicoId ?? null,
    tecnico_nome: o.tecnicoNome ?? null,
    data_agendada: o.dataAgendada ?? null,
    checklist: o.checklist ?? [],
    fotos: o.fotos ?? [],
    observacoes: o.observacoes ?? null,
    valor: o.valor ?? null,
    criado_em: o.criadoEm,
    atualizado_em: o.atualizadoEm,
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: o.excluidoEm ?? null,
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
  ordens_servico: ordemServicoToRow,
  equipamentos: equipamentoToRow,
  pmoc_planos: pmocPlanoToRow,
  pmoc_plano_versoes: pmocVersaoToRow,
  pmoc_ordens_geradas: pmocGeradaToRow,
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
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
    // Relógio remoto: é o que o localUpsert compara com o local para decidir se
    // esta linha da nuvem pode ou não sobrescrever a versão deste aparelho.
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined,
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
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined, // ver rowToCliente
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
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined, // ver rowToCliente
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
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined, // ver rowToCliente
  };
}

function rowToDepoimento(row: any): Depoimento {
  return {
    id: row.id,
    nomeCliente: row.nome_cliente,
    estrelas: row.estrelas ?? 5,
    texto: row.texto ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined, // ver rowToCliente
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
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
  };
}

// checklist/fotos podem vir como ARRAY (jsonb da nuvem) OU string (TEXT JSON do
// SQLite local, no caminho de push) — este parse tolera os dois e nunca quebra.
function arrOrParse(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// Equipamento → colunas da tabela `assets` na nuvem. NÃO envia user_id (default/RLS
// + injeção team-tenant). qr_token: PRESERVA o que veio do pull; OMITE quando vazio
// (1º insert) para o DEFAULT do banco gerar o token opaco — o app nunca gera/edita QR.
function equipamentoToRow(e: Equipamento): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: e.id,
    cliente_id: e.clienteId ?? null,
    local_id: e.localId ?? null,
    codigo_interno: e.codigoInterno ?? null,
    patrimonio: e.patrimonio ?? null,
    fabricante: e.fabricante ?? null,
    modelo: e.modelo ?? null,
    numero_serie: e.numeroSerie ?? null,
    categoria: e.categoria ?? null,
    capacidade_btu: e.capacidadeBtu ?? null,
    tensao: e.tensao ?? null,
    refrigerante: e.refrigerante ?? null,
    localizacao: e.localizacao ?? null,
    situacao: e.situacao,
    criticidade: e.criticidade ?? null,
    fotos: e.fotos ?? [],
    criado_em: e.criadoEm,
    atualizado_em: e.atualizadoEm,
    // Espelha o soft-delete: sem isso, um pull ressuscitaria itens da lixeira.
    excluido_em: e.excluidoEm ?? null,
  };
  if (e.qrToken) row.qr_token = e.qrToken;
  // qr_revogado_em é MONOTÔNICO (o app só revoga, nunca desrevoga): OMITE quando
  // vazio para um push last-writer-wins NÃO zerar uma revogação feita em outro
  // aparelho (que reativaria um QR revogado — falha de segurança). Só envia quando
  // ESTE aparelho tem a revogação; caso contrário o valor remoto é preservado.
  if (e.qrRevogadoEm) row.qr_revogado_em = e.qrRevogadoEm;
  return row;
}

// Linha (nuvem `assets` OU local `equipamentos`) → Equipamento. fotos tolera array
// (jsonb da nuvem) ou string (TEXT JSON local, no caminho de push) via arrOrParse.
function rowToEquipamentoCloud(row: any): Equipamento {
  return {
    id: row.id,
    clienteId: row.cliente_id ?? undefined,
    localId: row.local_id ?? undefined,
    codigoInterno: row.codigo_interno ?? undefined,
    patrimonio: row.patrimonio ?? undefined,
    fabricante: row.fabricante ?? undefined,
    modelo: row.modelo ?? undefined,
    numeroSerie: row.numero_serie ?? undefined,
    categoria: row.categoria ?? undefined,
    capacidadeBtu: row.capacidade_btu ?? undefined,
    tensao: row.tensao ?? undefined,
    refrigerante: row.refrigerante ?? undefined,
    localizacao: row.localizacao ?? undefined,
    situacao: (row.situacao ?? 'ativo') as Equipamento['situacao'],
    criticidade: (row.criticidade ?? undefined) as Equipamento['criticidade'],
    qrToken: row.qr_token ?? '',
    qrRevogadoEm: row.qr_revogado_em ?? undefined,
    fotos: arrOrParse(row.fotos),
    criadoEm: row.criado_em ?? new Date().toISOString(),
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? new Date().toISOString(),
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
  };
}

function rowToOrdemServico(row: any): OrdemServico {
  return {
    id: row.id,
    numero: row.numero ?? '',
    orcamentoId: row.orcamento_id ?? undefined,
    clienteId: row.cliente_id ?? undefined,
    clienteNome: row.cliente_nome ?? '',
    titulo: row.titulo ?? '',
    descricao: row.descricao ?? undefined,
    status: row.status,
    tecnicoId: row.tecnico_id ?? undefined,
    tecnicoNome: row.tecnico_nome ?? undefined,
    dataAgendada: row.data_agendada ?? undefined,
    checklist: arrOrParse(row.checklist),
    fotos: arrOrParse(row.fotos),
    observacoes: row.observacoes ?? undefined,
    valor: row.valor ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? new Date().toISOString(),
    // Preserva o soft-delete vindo da nuvem — senão o pull ressuscita o item.
    excluidoEm: row.excluido_em ?? undefined,
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
 *
 * GUARDA ESPECIAL PARA `empresa` (são DUAS, nesta ordem): antes de qualquer
 * comparação de carimbo, quem NÃO é dono do tenant nem sequer tenta o upsert —
 * senão o membro de equipe grava uma cópia da empresa do dono no tenant dele
 * (ver o bloco no corpo da função). Passada essa, vem a guarda de carimbo:
 * `empresa` é upsert por `user_id` (uma linha por dono,
 * onConflict 'user_id'), então dois aparelhos do MESMO dono editando "Meu
 * Negócio" em momentos diferentes se alternavam em "último a salvar vence" —
 * sem proteção, o aparelho que sincronizasse por último sempre vencia, mesmo
 * partindo de uma base mais velha (relógio ou apenas rede mais lenta). Guarda:
 * EMPRESA_STAMP_KEY grava o `atualizado_em` da nuvem visto no ÚLTIMO PULL (o
 * "eu vi a empresa neste estado" deste aparelho — ver localUpsertEmpresa). Se a
 * nuvem AGORA tem um `atualizado_em` mais novo que esse carimbo, outro aparelho
 * escreveu depois do nosso último pull: pulamos o push (não sobrescrevemos uma
 * edição que nunca vimos) em vez de aplicar last-write-wins cego. Sem carimbo
 * local (aparelho nunca deu pull, ex.: só criou a empresa localmente) o push
 * sempre acontece — piso seguro igual ao resto do módulo.
 */
// Contexto de escrita da EQUIPE (Onda 2): quando o usuário é um MEMBRO
// não-dono de uma organização (técnico/gestor/admin), os orçamentos e
// agendamentos que ele cria devem nascer no tenant do DONO (user_id=owner) para
// a empresa enxergá-los — senão caem no tenant do próprio técnico (default
// auth.uid()) e ficam invisíveis para a org. `criado_por` (default auth.uid())
// já carimba a autoria.
//
// TRÊS ESTADOS, nunca dois (O0-4). O antigo `string | null` colapsava o ERRO no
// mesmo valor da conta pessoal (`null`): uma falha de rede ao ler a org fazia o
// técnico gravar no PRÓPRIO tenant e o dono nunca via a linha — o P1-3 ("cliente
// cadastrado pelo técnico sumia"). Agora `desconhecido` é um estado distinto e
// as escritas sensíveis a tenant são adiadas (fail-closed) até sabermos quem
// somos. Nada se perde: o SQLite local é a fonte da verdade e o push é espelho.
// A decisão pura mora em ./contextoEquipe (testável sem rede/SQLite).
let contextoEquipe: ContextoEquipe = { status: 'desconhecido' };

/**
 * Tabelas que o membro de equipe grava NO TENANT DO DONO (injeção de `user_id`).
 * Adiadas quando o contexto é `desconhecido`.
 *
 * `empresa` NÃO entra aqui, mas também depende do contexto — por outro motivo e
 * com outra decisão: ela é a única linha ÚNICA POR DONO, ninguém injeta user_id
 * nela, e o membro simplesmente NÃO a escreve (guarda própria em
 * pushRowUnchecked, ver ali). `servicos`/`produtos`/`recibos` seguem escrita só
 * do dono via RLS e não dependem do contexto: continuam passando.
 */
const TABELAS_TENANT_EQUIPE: ReadonlySet<SyncTable> = new Set<SyncTable>([
  'clientes',
  'orcamentos',
  'agendamentos',
  'ordens_servico',
  'equipamentos',
  'pmoc_planos',
  'pmoc_plano_versoes',
  'pmoc_ordens_geradas',
]);

/**
 * Relê a organização e reclassifica o contexto. Usa `carregarMinhaOrganizacao`
 * (3 estados) e NÃO `getMinhaOrganizacao` — esta última colapsa erro em `null`,
 * e aqui o resultado decide TENANT de escrita, que é decisão de permissão.
 * Nunca lança.
 */
async function atualizarContextoEquipe(): Promise<ContextoEquipe> {
  try {
    // import dinâmico evita qualquer aresta estática entre sync e equipe.
    const { carregarMinhaOrganizacao } = await import('./equipe');
    contextoEquipe = classificarContextoEquipe(await carregarMinhaOrganizacao());
  } catch {
    contextoEquipe = { status: 'desconhecido' };
  }
  return contextoEquipe;
}

/**
 * Resolve o contexto sob demanda quando ainda é `desconhecido`. Existe porque
 * `pushRow` (disparado a CADA escrita local, database.ts) e o `pushAllLocal` do
 * restore rodam FORA do `syncOnLogin` — sem isto, a única resolução do contexto
 * acontecia no login e todo esse caminho escrevia com o tenant errado.
 */
export async function garantirContextoEquipe(): Promise<ContextoEquipe> {
  if (contextoEquipe.status !== 'desconhecido') return contextoEquipe;
  return atualizarContextoEquipe();
}

/**
 * De QUEM é a linha `empresa` que este aparelho deve ler, e se ele pode escrevê-la.
 * Resolve o contexto (sob demanda) e traduz pela decisão pura `decidirEmpresaEquipe`;
 * o `userId` do caso `pessoal` só aparece aqui porque depende da sessão.
 *
 * `null` = NÃO TOQUE em `empresa` agora (contexto indeterminado ou sem sessão) —
 * o mesmo fail-closed das tabelas de tenant. NUNCA lança.
 */
async function alvoEmpresa(): Promise<{ userId: string; souDono: boolean } | null> {
  try {
    const d = decidirEmpresaEquipe(await garantirContextoEquipe());
    if (!d.ler) return null;
    // Roteia pelo DISCRIMINANTE (`escrever`), não pela truthiness de
    // `ownerUserId`. São a mesma coisa só enquanto o banco garantir que todo
    // membro tem um dono com id não-vazio (`organizacoes.owner_user_id not null`);
    // no dia em que um `ownerUserId` chegar vazio, ramificar pela truthiness dele
    // mandaria o MEMBRO para o ramo do dono — `getCurrentUser()` devolveria o id
    // dele e `souDono: true` reabriria o vazamento inteiro. `escrever` é o campo
    // que `decidirEmpresaEquipe` calcula justamente para responder a esta pergunta.
    if (!d.escrever) return { userId: d.ownerUserId, souDono: false };
    const user = await getCurrentUser();
    return user?.id ? { userId: user.id, souDono: true } : null;
  } catch {
    return null; // não consegui decidir = não escrevo nem leio (fail-closed)
  }
}

/**
 * Esquece quem somos. Chamado no logout/troca de conta (`abortarSyncEmAndamento`)
 * para que o contexto do usuário ANTERIOR nunca carimbe uma linha do próximo.
 */
function resetarContextoEquipe(): void {
  contextoEquipe = { status: 'desconhecido' };
}

async function pushRowUnchecked(table: SyncTable, objLocal: unknown): Promise<void> {
  try {
    if (!objLocal || !supabase) return;
    if (table === 'empresa') {
      // SÓ O DONO DO TENANT ESCREVE `empresa`. O membro de equipe puxou para o
      // SQLite a empresa do DONO (precisa dela para emitir documento em nome da
      // empresa) e este upsert vai SEM `user_id` — o default `auth.uid()` o
      // carimbaria com o id do MEMBRO, criando no tenant dele uma cópia do
      // CNPJ/logo/endereço/chave Pix do dono, que sobrevive à saída dele da
      // equipe. Também não há o que perder: a RLS (`empresa_owner_write`) já
      // recusa a escrita na linha do dono, então para o membro este push nunca
      // teve efeito legítimo. `desconhecido` não passa pelo mesmo motivo das
      // tabelas de tenant — não saber de quem é a linha nunca autoriza gravá-la.
      const alvo = await alvoEmpresa();
      if (!alvo?.souDono) return;
      if (await empresaNuvemMudouDesdeUltimoPull(alvo.userId)) {
        // Outro aparelho editou a empresa depois do nosso último pull: não
        // sobrescrever — e puxar a versão mais nova para o local convergir em vez
        // de ficar divergente em silêncio (a edição local perde, estado fica são).
        void pullEmpresaMaisNova(alvo.userId).catch(() => {});
        return;
      }
    }
    const row = TO_ROW[table](objLocal);
    // Membro não-dono: cliente/orçamento/agendamento/OS/equipamento e o plano PMOC
    // (com suas versões e ordens geradas) são gravados no tenant do DONO da org. Sem
    // isto, uma linha nova empurrada do aparelho do técnico nasceria com user_id dele
    // e o dono nunca a veria (P1-3: cliente cadastrado pelo técnico no wizard sumia
    // em silêncio). `clientes` entrou nesta lista porque o wizard deixa o técnico
    // cadastrar cliente — a RLS de INSERT foi aberta a membro ativo em migration
    // dedicada (ver 20260719_clientes_insert_equipe.sql). (servicos/produtos/recibos
    // seguem escrita só do dono — não injetar. `empresa` também não injeta, mas tem
    // guarda PRÓPRIA e mais dura logo acima: o membro nem tenta o upsert.)
    if (TABELAS_TENANT_EQUIPE.has(table)) {
      const decisao = decidirEscritaEquipe(await garantirContextoEquipe());
      // Não sabemos o tenant: NÃO chutar. Adiar o espelho é inócuo (o SQLite local
      // já guardou a linha e o próximo sync a empurra); chutar grava no tenant
      // errado e a linha some para a org — dano permanente.
      if (decisao.adiar) return;
      if (decisao.userIdOverride) {
        (row as Record<string, unknown>).user_id = decisao.userIdOverride;
      }
    }
    await supabase.from(remoteNome(table)).upsert(row, { onConflict: ON_CONFLICT[table] });
    if (table === 'empresa') await marcarEmpresaVistaAgora();
  } catch {
    // idem: silencioso
  }
}

/**
 * true se a linha `empresa` na nuvem for ESTRITAMENTE mais nova que o carimbo do
 * último pull conhecido por este aparelho (EMPRESA_STAMP_KEY) — ou seja, outro
 * aparelho escreveu depois da última vez que vimos a nuvem. Sem carimbo local
 * devolve false → o push acontece (piso seguro). NUNCA lança.
 */
async function empresaNuvemMudouDesdeUltimoPull(userId: string): Promise<boolean> {
  try {
    if (!supabase) return false;
    const stampLocal = await AsyncStorage.getItem(EMPRESA_STAMP_KEY).catch(() => null);
    if (!stampLocal) {
      // Sem carimbo = este aparelho NUNCA puxou a empresa. Se a nuvem JÁ tem uma
      // empresa, NÃO empurrar por cima: seria sobrescrever o cadastro real de um
      // usuário existente que logou em aparelho novo (mecanismo do P0 da auditoria —
      // o antigo "return false" era o piso INSEGURO). Devolver true faz o chamador
      // puxar a nuvem em vez de empurrar, e o local converge. Se a nuvem não tem
      // empresa, é usuário novo criando a dele → false libera o push (fluxo correto).
      // `.eq(user_id)`: sem o filtro, um membro de equipe enxerga (RLS
      // `empresa_select` → donos_visiveis) a linha do DONO além da própria, e o
      // maybeSingle devolvia erro com 2 linhas — ou, pior, a resposta era sobre a
      // empresa de OUTRA pessoa. Só perguntamos sobre a linha do nosso tenant.
      const { data } = await supabase.from('empresa').select('user_id').eq('user_id', userId).maybeSingle();
      return !!data;
    }
    const { data } = await supabase
      .from('empresa')
      .select('atualizado_em')
      .eq('user_id', userId)
      .maybeSingle();
    const remoto = (data as any)?.atualizado_em as string | undefined;
    return tsMaisNovo(remoto, stampLocal);
  } catch {
    return false;
  }
}

/**
 * Puxa a versão mais nova da `empresa` na nuvem e aplica localmente. Usado
 * quando o push é recusado pela guarda (outro aparelho editou depois do nosso
 * último pull): em vez de divergir em silêncio, o local converge para a nuvem.
 * NUNCA lança.
 */
async function pullEmpresaMaisNova(userId: string): Promise<void> {
  try {
    if (!supabase) return;
    // Escopado ao tenant (ver empresaNuvemMudouDesdeUltimoPull): sem o filtro, a
    // "versão mais nova" podia ser a empresa de outro dono visível pela RLS.
    const { data } = await supabase.from('empresa').select('*').eq('user_id', userId).maybeSingle();
    const emp = rowToEmpresa(data);
    if (emp) await localUpsertEmpresa(emp, (data as any)?.atualizado_em);
  } catch {
    // best-effort
  }
}

/** Grava o carimbo local de `empresa` = agora (última vez que vimos/escrevemos a nuvem). NUNCA lança. */
async function marcarEmpresaVistaAgora(): Promise<void> {
  try {
    await AsyncStorage.setItem(EMPRESA_STAMP_KEY, new Date().toISOString());
  } catch {
    // best-effort: sem carimbo, o próximo push cai no piso seguro (sempre escreve)
  }
}

/** Remove UMA linha relacional por id. Só com sessão; NUNCA lança. */
export async function removeRow(table: SyncTable, id: string): Promise<void> {
  try {
    if (!id) return;
    if (!(await hasSession()) || !supabase) return;
    await supabase.from(remoteNome(table)).delete().eq('id', id);
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
    const { data, error } = await supabase.from(remoteNome(table)).select(`id, ${remoteCol}`);
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

/**
 * Guard de PULL para as tabelas de coluna com `atualizado_em` (clientes, servicos,
 * produtos, modelos, depoimentos — schema local v3). Retorna true quando a linha
 * LOCAL é mais nova que a recebida: nesse caso o pull PULA o upsert e preserva o
 * que este aparelho escreveu.
 *
 * É o que impede a ressurreição: excluí um serviço offline (excluido_em e
 * atualizado_em = agora), o mirrorPush falhou, a nuvem seguiu com a linha ativa e
 * ANTIGA. No próximo login o pullAll roda antes do pushAllLocal e, sem este guard,
 * a linha ativa remota zerava o excluido_em local. `tabela` é literal interno.
 */
async function localMaisNovoColuna(tabela: string, id: string, recebidoEm?: string): Promise<boolean> {
  if (!recebidoEm) return false;
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ ts: string | null }>(
      `SELECT atualizado_em AS ts FROM ${tabela} WHERE id = ?`, [id],
    );
    return tsMaisNovo(row?.ts, recebidoEm);
  } catch {
    return false;
  }
}

/** Idem, para `recibos` (blob JSON): o relógio vive dentro de `data`. */
async function localMaisNovoRecibo(id: string, recebidoEm?: string): Promise<boolean> {
  if (!recebidoEm) return false;
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ ts: string | null }>(
      "SELECT json_extract(data, '$.atualizadoEm') AS ts FROM recibos WHERE id = ?", [id],
    );
    return tsMaisNovo(row?.ts, recebidoEm);
  } catch {
    return false;
  }
}

// ─── Escrita SILENCIOSA no SQLite (sem re-disparar push) ─────────────────────
// Estes upserts gravam direto na tabela local, espelhando a forma dos `save*`
// de database.ts, MAS sem chamar pushRow — é assim que pullAll evita o loop.

/**
 * Grava a `empresa` recebida da nuvem no SQLite local e alinha o carimbo de
 * comparação (EMPRESA_STAMP_KEY) com o `atualizado_em` da linha — assim o
 * próximo push (pushRowUnchecked) sabe "a partir de qual versão da nuvem este
 * aparelho partiu" e detecta corretamente se outro aparelho escreveu depois.
 * `recebidoEm` é o `atualizado_em` cru da linha da nuvem (pode faltar em dados
 * legados); sem ele, ainda gravamos a empresa mas não tocamos o carimbo (o
 * próximo push cai no piso seguro de sempre escrever).
 */
async function localUpsertEmpresa(e: Empresa, recebidoEm?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO empresa (id, data) VALUES (?, ?)', [
    e.id ?? 'empresa_1',
    JSON.stringify(e),
  ]);
  if (recebidoEm) {
    try {
      await AsyncStorage.setItem(EMPRESA_STAMP_KEY, recebidoEm);
    } catch {
      // best-effort: sem carimbo, o próximo push cai no piso seguro (sempre escreve)
    }
  }
}

async function localUpsertCliente(c: Cliente): Promise<void> {
  // Guard de conflito: se este aparelho escreveu depois, a linha remota não entra.
  if (await localMaisNovoColuna('clientes', c.id, c.atualizadoEm)) return;
  const db = await getDb();
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    `INSERT OR REPLACE INTO clientes
       (id, nome, telefone, cpf, cnpj, endereco, complemento, estado, cidade, cep, criado_em, excluido_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.nome, c.telefone ?? null, c.cpf ?? null, c.cnpj ?? null,
     c.endereco ?? null, c.complemento ?? null, c.estado ?? null,
     c.cidade ?? null, c.cep ?? null, c.criadoEm, c.excluidoEm ?? null,
     c.atualizadoEm ?? c.criadoEm],
  );
}

async function localUpsertServico(s: ServicoItem): Promise<void> {
  if (await localMaisNovoColuna('servicos', s.id, s.atualizadoEm)) return;
  const db = await getDb();
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    `INSERT OR REPLACE INTO servicos (id, nome, descricao, preco, custo, unidade, foto_uri, criado_em, excluido_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [s.id, s.nome, s.descricao ?? null, s.preco, s.custo ?? null,
     s.unidade, s.fotoUri ?? null, s.criadoEm, s.excluidoEm ?? null,
     s.atualizadoEm ?? s.criadoEm],
  );
}

async function localUpsertProduto(p: ProdutoItem): Promise<void> {
  if (await localMaisNovoColuna('produtos', p.id, p.atualizadoEm)) return;
  const db = await getDb();
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    `INSERT OR REPLACE INTO produtos
       (id, nome, descricao, preco, custo, marca, modelo, unidade, foto_uri, criado_em, excluido_em, atualizado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.id, p.nome, p.descricao ?? null, p.preco, p.custo ?? null,
     p.marca ?? null, p.modelo ?? null, p.unidade, p.fotoUri ?? null, p.criadoEm, p.excluidoEm ?? null,
     p.atualizadoEm ?? p.criadoEm],
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
  if (await localMaisNovoRecibo(r.id, r.atualizadoEm)) return;
  const db = await getDb();
  // Blob vindo de nuvem antiga pode não ter o relógio; grava com criadoEm para o
  // guard ter o que comparar da próxima vez (em vez de undefined, que nunca vence).
  const gravado: Recibo = r.atualizadoEm ? r : { ...r, atualizadoEm: r.criadoEm };
  await db.runAsync('INSERT OR REPLACE INTO recibos (id, numero, data) VALUES (?,?,?)', [
    gravado.id,
    gravado.numero,
    JSON.stringify(gravado),
  ]);
}

async function localUpsertModelo(m: ModeloOrcamento): Promise<void> {
  if (await localMaisNovoColuna('modelos', m.id, m.atualizadoEm)) return;
  const db = await getDb();
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    'INSERT OR REPLACE INTO modelos (id, nome, descricao, data, criado_em, excluido_em, atualizado_em) VALUES (?,?,?,?,?,?,?)',
    [m.id, m.nome, m.descricao ?? null, JSON.stringify(m.orcamentoBase), m.criadoEm, m.excluidoEm ?? null,
     m.atualizadoEm ?? m.criadoEm],
  );
}

async function localUpsertDepoimento(d: Depoimento): Promise<void> {
  if (await localMaisNovoColuna('depoimentos', d.id, d.atualizadoEm)) return;
  const db = await getDb();
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    'INSERT OR REPLACE INTO depoimentos (id, nome_cliente, estrelas, texto, criado_em, excluido_em, atualizado_em) VALUES (?,?,?,?,?,?,?)',
    [d.id, d.nomeCliente, d.estrelas, d.texto ?? null, d.criadoEm, d.excluidoEm ?? null,
     d.atualizadoEm ?? d.criadoEm],
  );
}

async function localUpsertAgendamento(a: Agendamento): Promise<void> {
  const db = await getDb();
  // Anti-perda: se o agendamento local for mais novo, preserva a edição local.
  if (await localMaisNovoAgendamento(a.id, a.atualizadoEm)) return;
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    `INSERT OR REPLACE INTO agendamentos
       (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
     a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
     a.observacao ?? null, a.criadoEm, a.atualizadoEm, a.excluidoEm ?? null],
  );
}

async function localUpsertOrdemServico(o: OrdemServico): Promise<void> {
  const db = await getDb();
  // Anti-perda: se a OS local for mais nova, preserva a edição local (o técnico
  // pode ter tocado status/checklist/fotos offline entre o pull e a escrita).
  try {
    const loc = await db.getFirstAsync<{ atualizado_em: string }>(
      'SELECT atualizado_em FROM ordens_servico WHERE id = ?', [o.id],
    );
    if (loc?.atualizado_em && tsMaisNovo(loc.atualizado_em, o.atualizadoEm)) return;
  } catch {
    // sem linha local / erro de leitura → segue e grava (piso seguro)
  }
  // checklist/fotos como TEXT JSON (mesmo schema local de database.ts).
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
  await db.runAsync(
    `INSERT OR REPLACE INTO ordens_servico
       (id, numero, orcamento_id, cliente_id, cliente_nome, titulo, descricao, status,
        tecnico_id, tecnico_nome, data_agendada, checklist, fotos, observacoes, valor,
        criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [o.id, o.numero, o.orcamentoId ?? null, o.clienteId ?? null, o.clienteNome,
     o.titulo, o.descricao ?? null, o.status, o.tecnicoId ?? null, o.tecnicoNome ?? null,
     o.dataAgendada ?? null, JSON.stringify(o.checklist ?? []), JSON.stringify(o.fotos ?? []),
     o.observacoes ?? null, o.valor ?? null, o.criadoEm, o.atualizadoEm, o.excluidoEm ?? null],
  );
}

async function localUpsertEquipamento(e: Equipamento): Promise<void> {
  const db = await getDb();
  // Anti-perda: se o equipamento local for mais novo, preserva a edição local.
  try {
    const loc = await db.getFirstAsync<{ atualizado_em: string; qr_token: string }>(
      'SELECT atualizado_em, qr_token FROM equipamentos WHERE id = ?', [e.id],
    );
    if (loc?.atualizado_em && tsMaisNovo(loc.atualizado_em, e.atualizadoEm)) {
      // Local mais novo → preserva a edição. Mas faz BACKFILL do qr_token quando o
      // local ainda não o tem (equipamento criado offline; o token opaco só existe
      // após o 1º sync gerar o DEFAULT na nuvem) — sem tocar nos demais campos.
      if (e.qrToken && !loc.qr_token) {
        await db.runAsync('UPDATE equipamentos SET qr_token = ? WHERE id = ?', [e.qrToken, e.id]);
      }
      return;
    }
  } catch {
    // sem linha local / erro → grava (piso seguro)
  }
  // fotos como TEXT JSON (mesmo schema local de database.ts).
  // excluido_em espelhado: sem isso o pull zera o soft-delete local (ressuscita o item).
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
}

// ─── EXCLUSÕES (tombstones) — reconciliação nuvem ⇄ local ────────────────────
// Conjunto FIXO de tabelas que aceitam exclusão por id (todas as locais com PK
// `id` que sincronizam). Restringe os deletes locais a nomes conhecidos (jamais
// interpolamos um nome de tabela arbitrário vindo da nuvem em SQL).
const DELETABLE_TABLES = new Set<string>([
  'clientes', 'servicos', 'produtos', 'orcamentos', 'recibos', 'modelos', 'depoimentos', 'agendamentos', 'ordens_servico', 'equipamentos',
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

    // empresa (uma linha por usuário) — SEMPRE escopada a um tenant explícito.
    // O membro de equipe LEGITIMAMENTE puxa a empresa do DONO (é a marca que sai
    // nos documentos que ele emite), mas o `select('*')` sem filtro deixava a RLS
    // decidir sozinha QUAL linha vinha: um membro que já tinha empresa própria
    // enxergava DUAS e o maybeSingle devolvia erro — ele nunca mais recebia a
    // marca da empresa, em silêncio. Com contexto `desconhecido`, alvoEmpresa
    // devolve null e o pull é ADIADO: não dá para dizer de quem seria a linha, e
    // o local (fonte da verdade) segue intacto até o próximo sync saber quem somos.
    try {
      const alvo = await alvoEmpresa();
      if (alvo) {
        const { data } = await supabase.from('empresa').select('*').eq('user_id', alvo.userId).maybeSingle();
        if (syncAbortado(geracao)) return;
        const emp = rowToEmpresa(data);
        if (emp) await localUpsertEmpresa(emp, (data as any)?.atualizado_em);
      }
    } catch {}

    await pullTable<Cliente>('clientes', rowToCliente, localUpsertCliente, geracao);
    await pullTable<ServicoItem>('servicos', rowToServico, localUpsertServico, geracao);
    await pullTable<ProdutoItem>('produtos', rowToProduto, localUpsertProduto, geracao);
    await pullTable<Orcamento>('orcamentos', rowToOrcamento, localUpsertOrcamento, geracao);
    await pullTable<Recibo>('recibos', rowToRecibo, localUpsertRecibo, geracao);
    await pullTable<ModeloOrcamento>('modelos', rowToModelo, localUpsertModelo, geracao);
    await pullTable<Depoimento>('depoimentos', rowToDepoimento, localUpsertDepoimento, geracao);
    await pullTable<Agendamento>('agendamentos', rowToAgendamento, localUpsertAgendamento, geracao);
    await pullTable<OrdemServico>('ordens_servico', rowToOrdemServico, localUpsertOrdemServico, geracao);
    await pullTable<Equipamento>('equipamentos', rowToEquipamentoCloud, localUpsertEquipamento, geracao);
    await pullTable<PmocPlano>('pmoc_planos', rowToPmocPlano, localUpsertPmocPlano, geracao);
    await pullTable<PmocPlanoVersao>('pmoc_plano_versoes', rowToPmocVersao, localUpsertPmocVersao, geracao);
    await pullTable<PmocOrdemGerada>('pmoc_ordens_geradas', rowToPmocGerada, localUpsertPmocGerada, geracao);
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
    const { data, error } = await supabase.from(remoteNome(table)).select('*');
    if (error || !Array.isArray(data)) return;
    // Grava o lote inteiro numa ÚNICA transação: cada INSERT OR REPLACE fora de
    // transação força um commit/fsync próprio no SQLite — com dezenas/centenas de
    // linhas por tabela isso é ~50x mais lento que agrupar tudo num só commit.
    // NÃO muda O QUE é puxado nem a lógica de conflito/LWW/tombstone (que continua
    // dentro de localUpsert/fromRow, linha a linha, idêntica a antes) — só o
    // wrapper de transação. Bônus: se algo estourar no meio (fora do catch por
    // linha abaixo), a transação inteira reverte em vez de deixar a tabela num
    // estado parcialmente escrito.
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const row of data) {
        if (syncAbortado(geracao)) return; // logout/wipe em voo → para de gravar (commita o que já foi feito até aqui, igual ao comportamento anterior linha a linha)
        try {
          const obj = fromRow(row);
          if (obj) await localUpsert(obj);
        } catch {
          // pula linha problemática, segue o resto
        }
      }
    });
  } catch {
    // tabela indisponível = ignora
  }
}

// ─── PMOC Fase 2: plano, versões (append-only) e livro-caixa das ordens ──────
// `pmoc_plano_versoes` não tem `atualizado_em`: é APPEND-ONLY, e a nuvem tem um
// trigger que congela versão já aprovada. O upsert por id é idempotente — reenviar
// a mesma versão não muda nada, e alterar uma aprovada é recusado pelo banco.

function pmocPlanoToRow(p: PmocPlano): Record<string, unknown> {
  return {
    id: p.id,
    cliente_id: p.clienteId ?? null,
    contract_id: p.contratoId ?? null,
    numero: p.numero ?? null,
    titulo: p.titulo,
    situacao: p.situacao,
    versao_vigente: p.versaoVigente ?? null,
    criado_em: p.criadoEm,
    excluido_em: p.excluidoEm ?? null,
    atualizado_em: p.atualizadoEm ?? p.criadoEm, // NOT NULL na nuvem
  };
}

function rowToPmocPlano(row: any): PmocPlano | null {
  if (!row?.id || !row?.titulo) return null;
  return {
    id: row.id,
    clienteId: row.cliente_id ?? undefined,
    contratoId: row.contract_id ?? undefined,
    numero: row.numero ?? undefined,
    titulo: row.titulo,
    situacao: row.situacao ?? 'rascunho',
    versaoVigente: row.versao_vigente ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined,
    excluidoEm: row.excluido_em ?? undefined,
  };
}

async function localUpsertPmocPlano(p: PmocPlano): Promise<void> {
  if (await localMaisNovoColuna('pmoc_planos', p.id, p.atualizadoEm)) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO pmoc_planos
       (id, cliente_id, contrato_id, numero, titulo, situacao, versao_vigente, criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [p.id, p.clienteId ?? null, p.contratoId ?? null, p.numero ?? null, p.titulo,
     p.situacao, p.versaoVigente ?? null, p.criadoEm, p.atualizadoEm ?? p.criadoEm, p.excluidoEm ?? null],
  );
}

function pmocVersaoToRow(v: PmocPlanoVersao): Record<string, unknown> {
  return {
    id: v.id,
    plan_id: v.planoId,
    numero_versao: v.numeroVersao,
    // Periodicidades e referências normativas vivem AQUI (jsonb versionado), nunca
    // como coluna ou constante: são dados configuráveis, revisáveis pelo responsável.
    dados: {
      periodicidades: v.periodicidades ?? [],
      equipamentoIds: v.equipamentoIds ?? [],
      referencias: v.referencias ?? [],
    },
    responsavel_tecnico: v.responsavelTecnico ?? null,
    doc_responsabilidade: v.docResponsabilidade ?? null,
    aprovado_em: v.aprovadoEm ?? null,
    criado_em: v.criadoEm,
  };
}

function rowToPmocVersao(row: any): PmocPlanoVersao | null {
  if (!row?.id || !row?.plan_id) return null;
  const d = row.dados && typeof row.dados === 'object' ? row.dados : {};
  return {
    id: row.id,
    planoId: row.plan_id,
    numeroVersao: row.numero_versao ?? 1,
    periodicidades: Array.isArray(d.periodicidades) ? d.periodicidades : [],
    equipamentoIds: Array.isArray(d.equipamentoIds) ? d.equipamentoIds : [],
    referencias: Array.isArray(d.referencias) ? d.referencias : [],
    responsavelTecnico: row.responsavel_tecnico ?? undefined,
    docResponsabilidade: row.doc_responsabilidade ?? undefined,
    aprovadoEm: row.aprovado_em ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
  };
}

async function localUpsertPmocVersao(v: PmocPlanoVersao): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO pmoc_plano_versoes
       (id, plano_id, numero_versao, dados, responsavel_tecnico, doc_responsabilidade, aprovado_em, criado_em)
     VALUES (?,?,?,?,?,?,?,?)`,
    [v.id, v.planoId, v.numeroVersao,
     JSON.stringify({ periodicidades: v.periodicidades ?? [], equipamentoIds: v.equipamentoIds ?? [], referencias: v.referencias ?? [] }),
     v.responsavelTecnico ?? null, v.docResponsabilidade ?? null, v.aprovadoEm ?? null, v.criadoEm],
  );
}

function pmocGeradaToRow(g: PmocOrdemGerada): Record<string, unknown> {
  return {
    id: g.id,
    plano_id: g.planoId,
    asset_id: g.equipamentoId,
    periodo: g.periodo,
    // NUNCA null: entra no índice único, e no Postgres dois NULLs não colidem —
    // a chave de idempotência viraria decorativa.
    periodicidade_id: g.periodicidadeId ?? '',
    ordem_id: g.ordemId,
    vencimento: g.vencimento ?? null,
    criado_em: g.criadoEm,
    excluido_em: g.excluidoEm ?? null,
    atualizado_em: g.atualizadoEm ?? g.criadoEm,
  };
}

function rowToPmocGerada(row: any): PmocOrdemGerada | null {
  if (!row?.id || !row?.plano_id || !row?.ordem_id) return null;
  return {
    id: row.id,
    planoId: row.plano_id,
    equipamentoId: row.asset_id,
    periodo: row.periodo,
    periodicidadeId: row.periodicidade_id ?? '',
    ordemId: row.ordem_id,
    vencimento: row.vencimento ?? undefined,
    criadoEm: row.criado_em ?? new Date().toISOString(),
    atualizadoEm: row.atualizado_em ?? row.criado_em ?? undefined,
    excluidoEm: row.excluido_em ?? undefined,
  };
}

async function localUpsertPmocGerada(g: PmocOrdemGerada): Promise<void> {
  if (await localMaisNovoColuna('pmoc_ordens_geradas', g.id, g.atualizadoEm)) return;
  const db = await getDb();
  // INSERT OR REPLACE por `id`. A chave lógica (plano, equipamento, período,
  // periodicidade) é UNIQUE: se a nuvem trouxer uma linha com id DIFERENTE para a
  // MESMA visita, o índice recusa — e é exatamente o que queremos, porque a visita
  // já existe neste aparelho. O catch transforma a recusa em no-op.
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO pmoc_ordens_geradas
         (id, plano_id, asset_id, periodo, periodicidade_id, ordem_id, vencimento, criado_em, atualizado_em, excluido_em)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [g.id, g.planoId, g.equipamentoId, g.periodo, g.periodicidadeId ?? '', g.ordemId,
       g.vencimento ?? null, g.criadoEm, g.atualizadoEm ?? g.criadoEm, g.excluidoEm ?? null],
    );
  } catch {
    // Colisão da chave única: a visita já foi gerada aqui. No-op.
  }
}

// Leitores locais (usados pelo pushAllLocal).
function rowToPmocPlanoLocal(r: any): PmocPlano {
  return {
    id: r.id, clienteId: r.cliente_id ?? undefined, contratoId: r.contrato_id ?? undefined,
    numero: r.numero ?? undefined, titulo: r.titulo, situacao: r.situacao,
    versaoVigente: r.versao_vigente ?? undefined, criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em ?? r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
  };
}
function rowToPmocVersaoLocal(r: any): PmocPlanoVersao {
  const d = JSON.parse(r.dados || '{}');
  return {
    id: r.id, planoId: r.plano_id, numeroVersao: r.numero_versao,
    periodicidades: Array.isArray(d.periodicidades) ? d.periodicidades : [],
    equipamentoIds: Array.isArray(d.equipamentoIds) ? d.equipamentoIds : [],
    referencias: Array.isArray(d.referencias) ? d.referencias : [],
    responsavelTecnico: r.responsavel_tecnico ?? undefined,
    docResponsabilidade: r.doc_responsabilidade ?? undefined,
    aprovadoEm: r.aprovado_em ?? undefined, criadoEm: r.criado_em,
  };
}
function rowToPmocGeradaLocal(r: any): PmocOrdemGerada {
  return {
    id: r.id, planoId: r.plano_id, equipamentoId: r.asset_id, periodo: r.periodo,
    periodicidadeId: r.periodicidade_id ?? '', ordemId: r.ordem_id,
    vencimento: r.vencimento ?? undefined, criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em ?? r.criado_em,
    excluidoEm: r.excluido_em ?? undefined,
  };
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
 * remotos são buscados em LOTE (uma query por tabela) ANTES do loop — o guard vira
 * lookup no mapa, sem N+1. Desde o schema local v3 TODAS as dez tabelas de dado
 * carregam `atualizado_em` e passam pelo guard; antes disso seis delas iam no
 * upsert direto, e era por aí que uma cópia local velha desfazia uma exclusão.
 * `empresa` (linha única por dono, sem timestamp de edição no modelo do app) tem
 * sua PRÓPRIA guarda dentro de pushRowUnchecked (EMPRESA_STAMP_KEY, ver ali).
 * NUNCA lança: na dúvida (offline/sem timestamp) o push acontece.
 */
export async function pushAllLocal(geracao?: number): Promise<void> {
  try {
    if (!(await hasSession()) || !supabase) return;
    const db = await getDb();

    // empresa (uma linha por usuário; guarda anti-regressão em pushRowUnchecked).
    try {
      const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM empresa LIMIT 1');
      if (row?.data) await pushRowUnchecked('empresa', JSON.parse(row.data) as Empresa);
    } catch {}

    // Timestamps remotos em LOTE (1 query por tabela) para o guard anti-regressão.
    const tsOrcamentos = await carregarTimestampsRemotos('orcamentos', 'atualizado_em');
    const tsAgendamentos = await carregarTimestampsRemotos('agendamentos', 'atualizado_em');
    const tsOrdens = await carregarTimestampsRemotos('ordens_servico', 'atualizado_em');
    const tsEquip = await carregarTimestampsRemotos('equipamentos', 'atualizado_em');
    // Desde o schema v3 estas seis também têm relógio, então ganham o MESMO guard.
    // Sem ele, uma cópia local ativa e velha (aparelho que ainda não puxou o
    // "excluir"/"restaurar" feito em outro) sobrescreveria a versão mais nova da nuvem.
    const tsClientes = await carregarTimestampsRemotos('clientes', 'atualizado_em');
    const tsServicos = await carregarTimestampsRemotos('servicos', 'atualizado_em');
    const tsProdutos = await carregarTimestampsRemotos('produtos', 'atualizado_em');
    const tsRecibos = await carregarTimestampsRemotos('recibos', 'atualizado_em');
    const tsModelos = await carregarTimestampsRemotos('modelos', 'atualizado_em');
    const tsDepoimentos = await carregarTimestampsRemotos('depoimentos', 'atualizado_em');

    await pushTable('clientes', 'SELECT * FROM clientes', rowToClienteLocal,
      (c) => remoteMaisNovoNoMapa(tsClientes, c.id, c.atualizadoEm), geracao);
    await pushTable('servicos', 'SELECT * FROM servicos', rowToServicoLocal,
      (s) => remoteMaisNovoNoMapa(tsServicos, s.id, s.atualizadoEm), geracao);
    await pushTable('produtos', 'SELECT * FROM produtos', rowToProdutoLocal,
      (p) => remoteMaisNovoNoMapa(tsProdutos, p.id, p.atualizadoEm), geracao);
    await pushTable('orcamentos', 'SELECT data FROM orcamentos', (r: any) => JSON.parse(r.data) as Orcamento,
      (o) => remoteMaisNovoNoMapa(tsOrcamentos, o.id, o.atualizadoEm), geracao);
    await pushTable('recibos', 'SELECT data FROM recibos', (r: any) => JSON.parse(r.data) as Recibo,
      (r) => remoteMaisNovoNoMapa(tsRecibos, r.id, r.atualizadoEm), geracao);
    await pushTable('modelos', 'SELECT * FROM modelos', (r: any) => ({
      id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
      orcamentoBase: JSON.parse(r.data), criadoEm: r.criado_em,
      // Sem isso, modeloToRow mandaria excluido_em=null e apagaria o soft-delete na nuvem.
      excluidoEm: r.excluido_em ?? undefined,
      atualizadoEm: r.atualizado_em ?? r.criado_em, // ver rowToClienteLocal
    } as ModeloOrcamento),
      (m) => remoteMaisNovoNoMapa(tsModelos, m.id, m.atualizadoEm), geracao);
    await pushTable('depoimentos', 'SELECT * FROM depoimentos', rowToDepoimentoLocal,
      (d) => remoteMaisNovoNoMapa(tsDepoimentos, d.id, d.atualizadoEm), geracao);
    await pushTable('agendamentos', 'SELECT * FROM agendamentos', rowToAgendamentoLocal,
      (a) => remoteMaisNovoNoMapa(tsAgendamentos, a.id, a.atualizadoEm), geracao);
    await pushTable<OrdemServico>('ordens_servico', 'SELECT * FROM ordens_servico', rowToOrdemServico,
      (o) => remoteMaisNovoNoMapa(tsOrdens, o.id, o.atualizadoEm), geracao);
    await pushTable<Equipamento>('equipamentos', 'SELECT * FROM equipamentos', rowToEquipamentoCloud,
      (e) => remoteMaisNovoNoMapa(tsEquip, e.id, e.atualizadoEm), geracao);

    const tsPlanos = await carregarTimestampsRemotos('pmoc_planos', 'atualizado_em');
    const tsGeradas = await carregarTimestampsRemotos('pmoc_ordens_geradas', 'atualizado_em');
    await pushTable<PmocPlano>('pmoc_planos', 'SELECT * FROM pmoc_planos', rowToPmocPlanoLocal,
      (p) => remoteMaisNovoNoMapa(tsPlanos, p.id, p.atualizadoEm), geracao);
    // Versoes: append-only, sem relogio. O upsert por id e idempotente e a nuvem
    // recusa alterar versao ja aprovada (trigger pmoc_bloquear_versao_congelada).
    await pushTable<PmocPlanoVersao>('pmoc_plano_versoes', 'SELECT * FROM pmoc_plano_versoes', rowToPmocVersaoLocal,
      undefined, geracao);
    await pushTable<PmocOrdemGerada>('pmoc_ordens_geradas', 'SELECT * FROM pmoc_ordens_geradas', rowToPmocGeradaLocal,
      (g) => remoteMaisNovoNoMapa(tsGeradas, g.id, g.atualizadoEm), geracao);
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
    // Mapeia (e aplica o guard LWW) ANTES de empurrar; depois empurra em PARALELO
    // com teto de concorrência. Antes era um `await` por linha (sequencial): num
    // login com muitos registros isso vira dezenas de round-trips um atrás do
    // outro — o "app arrasta/bugadinho". Cada linha continua sendo um upsert
    // INDEPENDENTE (mesma injeção de owner de equipe, mesma isolação de falha por
    // item — pushRowUnchecked engole o próprio erro), então a semântica não muda;
    // só param de esperar em fila.
    const alvos: T[] = [];
    for (const r of rows) {
      try {
        const obj = toLocal(r);
        if (guard && guard(obj)) continue; // nuvem mais nova → não regride
        alvos.push(obj);
      } catch {
        // pula item problemático de mapeamento
      }
    }
    const TETO = 8; // concorrência modesta: acelera sem estourar a conexão/limites
    for (let i = 0; i < alvos.length; i += TETO) {
      if (syncAbortado(geracao)) return; // logout/wipe em voo → para de empurrar
      await Promise.all(alvos.slice(i, i + TETO).map((o) => pushRowUnchecked(table, o)));
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
    // Sem isso, clienteToRow mandaria excluido_em=null e apagaria o soft-delete na nuvem.
    excluidoEm: r.excluido_em ?? undefined,
    // Idem para o relógio: sem ele o push mandaria atualizado_em=null (coluna NOT NULL).
    atualizadoEm: r.atualizado_em ?? r.criado_em,
  };
}
function rowToServicoLocal(r: any): ServicoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
    // Sem isso, servicoToRow mandaria excluido_em=null e apagaria o soft-delete na nuvem.
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? r.criado_em, // ver rowToClienteLocal
  };
}
function rowToProdutoLocal(r: any): ProdutoItem {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? undefined,
    preco: r.preco, custo: r.custo ?? undefined, marca: r.marca ?? undefined,
    modelo: r.modelo ?? undefined, unidade: r.unidade,
    fotoUri: r.foto_uri ?? undefined, criadoEm: r.criado_em,
    // Sem isso, produtoToRow mandaria excluido_em=null e apagaria o soft-delete na nuvem.
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? r.criado_em, // ver rowToClienteLocal
  };
}
function rowToDepoimentoLocal(r: any): Depoimento {
  return {
    id: r.id, nomeCliente: r.nome_cliente, estrelas: r.estrelas,
    texto: r.texto ?? undefined, criadoEm: r.criado_em,
    // Sem isso, depoimentoToRow mandaria excluido_em=null e apagaria o soft-delete na nuvem.
    excluidoEm: r.excluido_em ?? undefined,
    atualizadoEm: r.atualizado_em ?? r.criado_em, // ver rowToClienteLocal
  };
}
function rowToAgendamentoLocal(r: any): Agendamento {
  return {
    id: r.id, clienteId: r.cliente_id ?? undefined, clienteNome: r.cliente_nome,
    titulo: r.titulo, tipo: r.tipo, inicio: r.inicio, fim: r.fim ?? undefined,
    endereco: r.endereco ?? undefined, status: r.status,
    orcamentoId: r.orcamento_id ?? undefined, observacao: r.observacao ?? undefined,
    criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
    // Sem isso, agendamentoToRow mandaria excluido_em=null e apagaria o soft-delete na nuvem.
    excluidoEm: r.excluido_em ?? undefined,
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

// ─── EXTRAS (chave-valor) — checklist do Hoje, snooze do radar, relatórios ───
// Estes três dados ficavam SÓ no aparelho. Agora sincronizam via a tabela genérica
// `public.extras_sync` (uma linha por (user_id, chave)), com last-write-wins pelo
// `atualizado_em`. Uma tabela chave-valor evita explodir o schema em várias tabelas
// pequenas. Tudo aqui é best-effort e NUNCA lança (offline/deslogado = no-op).
//
// Fontes de cada extra:
//  - 'checklist.hoje'  → AsyncStorage (CHECKLIST_KEY); carimbo lateral CHECKLIST_STAMP_KEY.
//  - 'radar.snooze'    → AsyncStorage (RADAR_SNOOZE_KEY); carimbo RADAR_SNOOZE_STAMP_KEY.
//  - 'relatorio.<data>'→ SQLite (relatorios_diarios), uma linha por dia; `criado_em` é o carimbo.
//
// Por que carimbo lateral nos dois primeiros: o valor guardado é um blob sem
// timestamp próprio, então o LWW precisa saber QUANDO ele foi escrito localmente
// para comparar com a versão da nuvem. O carimbo é gravado junto de cada escrita
// local (ver pushExtraChave e o push do HojeScreen).

/** Prefixo das chaves de relatório diário dentro de extras_sync. */
const PREFIXO_RELATORIO = 'relatorio.';

/** Lê um extra da nuvem: { dados, atualizado_em } ou null. NUNCA lança. */
async function pullExtraRow(chave: string): Promise<{ dados: any; atualizadoEm: string } | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('extras_sync')
      .select('dados, atualizado_em')
      .eq('chave', chave)
      .maybeSingle();
    if (error || !data) return null;
    return { dados: (data as any).dados, atualizadoEm: (data as any).atualizado_em };
  } catch {
    return null;
  }
}

/** Upsert de um extra na nuvem (sem user_id: default auth.uid()). NUNCA lança. */
async function upsertExtraRow(chave: string, dados: unknown, atualizadoEm: string): Promise<void> {
  try {
    if (!supabase) return;
    await supabase
      .from('extras_sync')
      .upsert({ chave, dados, atualizado_em: atualizadoEm }, { onConflict: 'user_id,chave' });
  } catch {
    // best-effort
  }
}

// ── Extras baseados em AsyncStorage (checklist do Hoje, snooze do radar) ──
// Cada um casa uma chave de valor com uma chave de carimbo. O carimbo é o
// `atualizado_em` local usado no LWW; ausência de carimbo = "muito antigo" (a
// nuvem vence), o que é o comportamento correto num aparelho novo/limpo.
interface ExtraAsyncSpec {
  chaveNuvem: string;
  valorKey: string;
  stampKey: string;
}
const EXTRAS_ASYNC: ExtraAsyncSpec[] = [
  { chaveNuvem: 'checklist.hoje', valorKey: CHECKLIST_KEY, stampKey: CHECKLIST_STAMP_KEY },
  { chaveNuvem: 'radar.snooze', valorKey: RADAR_SNOOZE_KEY, stampKey: RADAR_SNOOZE_STAMP_KEY },
];

/** Lê o carimbo local (ISO) de um extra AsyncStorage, ou null. NUNCA lança. */
async function lerStamp(stampKey: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(stampKey);
  } catch {
    return null;
  }
}

/**
 * Sincroniza UM extra baseado em AsyncStorage. Regra de convergência (local-first,
 * nunca perde uma edição local não sincronizada):
 *
 *  - COM carimbo local → LWW puro: a nuvem só vence se for ESTRITAMENTE mais nova
 *    que o carimbo; senão o local sobe. (Caminho do checklist, que carimba a cada
 *    escrita via pushExtraChave.)
 *  - SEM carimbo local, mas COM valor local → ambíguo. Alguns extras (ex.: o snooze
 *    do radar) são escritos por módulos que não carimbam. Em vez de deixar a nuvem
 *    clobberar uma possível edição offline, o LOCAL sobe (local-first) e passa a
 *    ter carimbo para os próximos ciclos. Num aparelho NOVO/limpo não há valor
 *    local, então este ramo não dispara e a nuvem é aplicada abaixo.
 *  - SEM valor local, COM nuvem → aparelho novo: aplica a nuvem e alinha o carimbo.
 *
 * NUNCA lança.
 */
async function sincronizarExtraAsync(spec: ExtraAsyncSpec): Promise<void> {
  try {
    const [remoto, valorLocalRaw, stampLocal] = await Promise.all([
      pullExtraRow(spec.chaveNuvem),
      AsyncStorage.getItem(spec.valorKey).catch(() => null),
      lerStamp(spec.stampKey),
    ]);

    // Nuvem vence só quando: (a) é estritamente mais nova que um carimbo local que
    // existe, OU (b) não há valor local (aparelho novo — nada a preservar).
    const nuvemVence = !!remoto && (
      (!!stampLocal && tsMaisNovo(remoto.atualizadoEm, stampLocal)) ||
      valorLocalRaw == null
    );

    if (nuvemVence && remoto) {
      try {
        await AsyncStorage.setItem(spec.valorKey, JSON.stringify(remoto.dados));
        await AsyncStorage.setItem(spec.stampKey, remoto.atualizadoEm);
      } catch {
        // best-effort local
      }
      return;
    }

    // Local vence (ou nuvem inexistente): empurra o valor local, se houver.
    if (valorLocalRaw != null) {
      let dados: unknown = null;
      try {
        dados = JSON.parse(valorLocalRaw);
      } catch {
        return; // valor local corrompido: não propaga lixo
      }
      const carimbo = stampLocal || new Date().toISOString();
      await upsertExtraRow(spec.chaveNuvem, dados, carimbo);
      // Garante um carimbo local para os próximos ciclos (se ainda não havia) —
      // assim um valor escrito por módulo que não carimba passa a ter LWW real.
      if (!stampLocal) {
        try {
          await AsyncStorage.setItem(spec.stampKey, carimbo);
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Push imediato (fire-and-forget) de UM extra AsyncStorage após mudança local.
 * Grava o carimbo local ANTES do upsert (para o LWW deste aparelho refletir a
 * escrita mesmo se o upload falhar) e sobe o valor atual. Usado pelo HojeScreen
 * ao salvar o checklist e pelo radar ao adiar um cliente. NUNCA lança.
 */
export async function pushExtraChave(chaveNuvem: string): Promise<void> {
  try {
    const spec = EXTRAS_ASYNC.find(e => e.chaveNuvem === chaveNuvem);
    if (!spec) return;
    const agora = new Date().toISOString();
    try {
      await AsyncStorage.setItem(spec.stampKey, agora);
    } catch {
      // best-effort: sem carimbo o próximo sync ainda sobe o valor
    }
    if (!(await hasSession())) return; // offline/deslogado: fica p/ o próximo login
    const raw = await AsyncStorage.getItem(spec.valorKey).catch(() => null);
    if (raw == null) return;
    let dados: unknown = null;
    try {
      dados = JSON.parse(raw);
    } catch {
      return;
    }
    await upsertExtraRow(chaveNuvem, dados, agora);
  } catch {
    // fire-and-forget: nunca afeta a UI
  }
}

// ── Relatórios diários (SQLite relatorios_diarios ⇄ extras_sync) ──
// Cada dia vira a chave 'relatorio.<data>'. `criado_em` da linha local é o
// carimbo do LWW. O pull grava DIRETO no SQLite (sem passar por saveRelatorioDia,
// mantendo o caminho silencioso e desacoplado da UI).

/** Sobe os relatórios diários locais para a nuvem. NUNCA lança. */
async function pushRelatoriosDiarios(geracao?: number): Promise<void> {
  try {
    if (!supabase) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ data: string; dados: string; criado_em: string }>(
      'SELECT data, dados, criado_em FROM relatorios_diarios',
    );
    for (const r of rows) {
      if (syncAbortado(geracao)) return;
      try {
        if (!r?.data) continue;
        let dados: unknown;
        try {
          dados = JSON.parse(r.dados);
        } catch {
          continue; // linha corrompida: pula
        }
        const carimbo = r.criado_em || new Date().toISOString();
        await upsertExtraRow(PREFIXO_RELATORIO + r.data, dados, carimbo);
      } catch {
        // pula linha problemática
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Grava um relatório diário direto no SQLite (silencioso, sem push). NUNCA lança.
 *
 * Merge POR CAMPO, não LWW do blob inteiro: o snapshot (números) é cache derivado
 * e segue o `criado_em` mais novo; a NOTA é autoral e segue o `notaEm` mais novo,
 * independente do snapshot. Sem isso, um aparelho que só VISUALIZA o dia gerava um
 * criado_em novo (sem nota) que, no LWW do blob, apagava a nota escrita em outro
 * aparelho — perda permanente e silenciosa de dado autoral.
 */
async function localUpsertRelatorio(data: string, dados: unknown, criadoEm: string): Promise<void> {
  try {
    if (!data) return;
    const db = await getDb();
    const localRow = await db.getFirstAsync<{ dados: string; ts: string | null }>(
      'SELECT dados, criado_em AS ts FROM relatorios_diarios WHERE data = ?', [data],
    );
    const incoming = (dados && typeof dados === 'object') ? (dados as Record<string, unknown>) : {};
    let local: Record<string, unknown> | null = null;
    if (localRow?.dados) { try { local = JSON.parse(localRow.dados) as Record<string, unknown>; } catch { local = null; } }

    // Snapshot (números): a versão com criado_em ESTRITAMENTE mais novo.
    const incomingMaisNovo = tsMaisNovo(criadoEm, localRow?.ts ?? undefined);
    const base = incomingMaisNovo ? incoming : (local ?? incoming);
    const baseTs = incomingMaisNovo ? criadoEm : (localRow?.ts ?? criadoEm);

    // Nota (autoral): a de notaEm mais novo. O clause extra cobre "local nunca teve
    // nota" (tsMaisNovo devolve false quando um dos lados falta).
    const notaLocalEm = local?.notaEm as string | undefined;
    const notaRemotaEm = incoming.notaEm as string | undefined;
    const usaRemota = tsMaisNovo(notaRemotaEm, notaLocalEm) || (!notaLocalEm && !!notaRemotaEm);

    // Local já vence nos dois eixos (e existe) → nada muda; evita reescrita/push.
    if (!incomingMaisNovo && !usaRemota && local) return;

    const merged: Record<string, unknown> = { ...base };
    const nota = usaRemota ? incoming.nota : local?.nota;
    const notaEm = usaRemota ? notaRemotaEm : notaLocalEm;
    if (nota !== undefined) merged.nota = nota; else delete merged.nota;
    if (notaEm !== undefined) merged.notaEm = notaEm; else delete merged.notaEm;

    await db.runAsync(
      'INSERT OR REPLACE INTO relatorios_diarios (data, dados, criado_em) VALUES (?,?,?)',
      [data, JSON.stringify(merged), baseTs || new Date().toISOString()],
    );
  } catch {
    // best-effort
  }
}

/** Baixa os relatórios diários da nuvem para o SQLite (LWW por data). NUNCA lança. */
async function pullRelatoriosDiarios(geracao?: number): Promise<void> {
  try {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('extras_sync')
      .select('chave, dados, atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(90) // ~3 meses de relatorios; historico completo vive na nuvem
      .like('chave', PREFIXO_RELATORIO + '%');
    if (error || !Array.isArray(data)) return;
    for (const row of data) {
      if (syncAbortado(geracao)) return;
      try {
        const chave = (row as any)?.chave as string;
        if (!chave || !chave.startsWith(PREFIXO_RELATORIO)) continue;
        const dia = chave.slice(PREFIXO_RELATORIO.length);
        if (!dia) continue;
        await localUpsertRelatorio(dia, (row as any).dados, (row as any).atualizado_em);
      } catch {
        // pula linha problemática
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Sincroniza TODOS os extras (chamado no syncOnLogin, DEPOIS do pull principal):
 *  1) relatórios: pull (nuvem→SQLite, LWW por dia) e depois push (SQLite→nuvem);
 *  2) checklist do Hoje e snooze do radar: LWW por carimbo lateral.
 * Ordem pull-antes-de-push nos relatórios espelha o pipeline principal (não
 * sobrescreve a nuvem com dado velho de um aparelho recém-logado). NUNCA lança.
 */
export async function sincronizarExtras(geracao?: number): Promise<void> {
  try {
    if (!(await hasSession()) || !supabase) return;
    await pullRelatoriosDiarios(geracao);
    if (syncAbortado(geracao)) return;
    await pushRelatoriosDiarios(geracao);
    if (syncAbortado(geracao)) return;
    for (const spec of EXTRAS_ASYNC) {
      if (syncAbortado(geracao)) return;
      await sincronizarExtraAsync(spec);
    }
  } catch {
    // best-effort: extras nunca quebram o sync principal
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
  // Troca de conta / logout: o contexto de equipe é de QUEM SAIU. Mantê-lo faria
  // o próximo usuário carimbar linhas no tenant do anterior (mistura de tenant).
  resetarContextoEquipe();
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
 *  5) sincronizarExtras() — sincroniza os "extras" chave-valor (checklist do Hoje,
 *                           snooze do radar e relatórios diários) via extras_sync,
 *                           com last-write-wins. Roda por último para não competir
 *                           com o pipeline relacional; falha aqui não afeta o resto.
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

    // PARTIÇÃO (O0-2) — antes de QUALQUER leitura/escrita: garante que o SQLite
    // aberto é o deste usuário. Num aparelho onde outra conta saiu "mantendo os
    // dados", sem isto o pushAllLocal abaixo empurraria os clientes/orçamentos
    // DELA para o tenant deste usuário. Falhou? Não sincroniza: um sync sobre o
    // banco de outra pessoa é pior do que sync nenhum.
    const usuario = await getCurrentUser();
    if (!usuario?.id) return;
    try {
      await abrirParticaoDoUsuario(usuario.id);
    } catch {
      return;
    }
    // Cinto e suspensório: só seguimos se o banco aberto for PROVADAMENTE o dele.
    // `indeterminado` (não sei de quem é) NÃO passa — erro nunca vira permissão.
    if (!podeSincronizar(await donoDoBancoAberto(usuario.id))) return;

    // Descobre se o usuário é membro não-dono de uma org ANTES de empurrar, para
    // gravar orçamentos/agendamentos no tenant do dono (ver contextoEquipe).
    // Releitura forçada (não `garantir...`): no login o contexto pode ser de outra
    // conta. Se falhar, fica `desconhecido` e o push das tabelas de tenant é adiado.
    await atualizarContextoEquipe();
    await pullAll(geracao);
    if (syncAbortado(geracao)) return;
    await pushLocalTombstones(geracao);
    if (syncAbortado(geracao)) return;
    await pushAllLocal(geracao);
    if (syncAbortado(geracao)) return;
    await podarTombstonesAntigos();
    if (syncAbortado(geracao)) return;
    // Extras chave-valor (checklist do Hoje, snooze do radar, relatórios diários)
    // via extras_sync, com last-write-wins. Por último: não compete com o pipeline
    // relacional e uma falha aqui não pode afetar o sync principal.
    await sincronizarExtras(geracao);
    // O pull gravou agendamentos direto no SQLite sem tocar nas notificações:
    // reconcilia os lembretes locais com o estado novo (reagenda/cancela). Import
    // tardio p/ não acoplar cloudSync ao módulo de agenda no grafo estático (evita
    // ciclo de carga). Fire-and-forget: falha de notificação não afeta o sync.
    void import('./agenda')
      .then(m => m.resincronizarLembretes())
      .catch(() => {});
    // Mesmo motivo, para os lembretes de vencimento PMOC: o pull grava
    // ordens_servico/pmoc_ordens_geradas direto no SQLite (localUpsert*, sem
    // passar por atualizarStatusOS/gerarOrdensDoPlano), então uma OS concluída
    // em OUTRO aparelho só cancela o lembrete aqui após esta reconciliação.
    void import('./pmoc')
      .then(m => m.resincronizarLembretesPmoc())
      .catch(() => {});
    // Ritual diário ("Bom dia da OLLI" / "Fechar o dia") — reagendado aqui pelo
    // MESMO motivo dos dois acima: é o ponto onde o app já "abriu com sessão
    // válida e recalculou" (boot com sessão dispara INITIAL_SESSION → aqui; todo
    // sync seguinte também). Sem TaskManager/BackgroundFetch neste app, este é o
    // único lugar seguro (partição já resolvida) para o reagendamento automático
    // — ver services/ritualDiario.ts. Import tardio pelo mesmo motivo de ciclo de
    // carga; fire-and-forget, nunca lança.
    void import('./ritualDiario')
      .then(m => m.reagendarRitualDiario())
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
