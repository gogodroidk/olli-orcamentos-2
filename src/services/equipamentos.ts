/**
 * Serviço de EQUIPAMENTOS (PMOC Fase 1 — inventário HVAC + etiqueta QR).
 *
 * Superfície única que a tela consome. Orquestra os defaults do cadastro e a
 * regra do QR sobre o CRUD local (database.ts), que por sua vez espelha na nuvem
 * pelo caminho padrão de cloudSync (equipamentos é SyncTable de 1ª classe → a
 * tabela `assets` na nuvem, com pull-no-login e tombstone).
 *
 * REGRA DO QR (inegociável): o `qrToken` é opaco e nasce no BANCO (coluna com
 * DEFAULT gen_random_bytes na migration da fundação). O app NUNCA gera nem edita o
 * token — só o PRESERVA. Num cadastro novo o token começa vazio; o 1º sync manda a
 * linha SEM qr_token (o DEFAULT gera) e o pull traz o token de volta. Por isso a
 * "etiqueta/QR" só fica disponível depois que o equipamento sincronizou ao menos
 * uma vez (a tela deve tratar qrToken vazio como "sincronize para gerar a etiqueta").
 */
import {
  getEquipamentosDb,
  getEquipamentoDb,
  getEquipamentosDoClienteDb,
  saveEquipamentoDb,
  deleteEquipamentoDb,
} from '../database/database';
import { generateId } from '../utils/id';
import { Equipamento } from '../types';

/** Base pública do link do QR — o worker resolve GET /q/<token> (página do cliente). */
const BASE_ETIQUETA = 'https://link.olliorcamentos.online/q/';

/** URL pública da etiqueta (vazia enquanto o token ainda não foi gerado/sincronizado). */
export function urlEtiqueta(qrToken: string): string {
  return qrToken ? `${BASE_ETIQUETA}${encodeURIComponent(qrToken)}` : '';
}

export function getEquipamentos(): Promise<Equipamento[]> {
  return getEquipamentosDb();
}

export function getEquipamento(id: string): Promise<Equipamento | null> {
  return getEquipamentoDb(id);
}

/** Inventário de um cliente específico. */
export function getEquipamentosDoCliente(clienteId: string): Promise<Equipamento[]> {
  return getEquipamentosDoClienteDb(clienteId);
}

/**
 * Cria ou atualiza um equipamento. Preenche defaults e PRESERVA o `qrToken`
 * existente (nunca sobrescreve com vazio). Carimba `atualizadoEm` sempre.
 */
export async function salvarEquipamento(
  parcial: Partial<Equipamento> & { id?: string },
): Promise<Equipamento> {
  const agora = new Date().toISOString();
  const existente = parcial.id ? await getEquipamentoDb(parcial.id) : null;
  const e: Equipamento = {
    // `||` (não `??`): a tela monta um cadastro novo com id:'' (string vazia, que
    // `??` NÃO trataria como ausente) → sem isto todo equipamento novo nasceria com
    // id='' e cada INSERT OR REPLACE sobrescreveria o anterior (colapso do inventário).
    id: parcial.id || generateId(),
    clienteId: parcial.clienteId ?? existente?.clienteId,
    localId: parcial.localId ?? existente?.localId,
    codigoInterno: parcial.codigoInterno ?? existente?.codigoInterno,
    patrimonio: parcial.patrimonio ?? existente?.patrimonio,
    fabricante: parcial.fabricante ?? existente?.fabricante,
    modelo: parcial.modelo ?? existente?.modelo,
    numeroSerie: parcial.numeroSerie ?? existente?.numeroSerie,
    categoria: parcial.categoria ?? existente?.categoria,
    capacidadeBtu: parcial.capacidadeBtu ?? existente?.capacidadeBtu,
    tensao: parcial.tensao ?? existente?.tensao,
    refrigerante: parcial.refrigerante ?? existente?.refrigerante,
    localizacao: parcial.localizacao ?? existente?.localizacao,
    situacao: parcial.situacao ?? existente?.situacao ?? 'ativo',
    criticidade: parcial.criticidade ?? existente?.criticidade,
    // qrToken: preserva o token vigente (do pull); nunca o zera. Só fica vazio num
    // cadastro totalmente novo — o banco gera no 1º sync.
    qrToken: existente?.qrToken ?? parcial.qrToken ?? '',
    qrRevogadoEm: parcial.qrRevogadoEm ?? existente?.qrRevogadoEm,
    fotos: parcial.fotos ?? existente?.fotos ?? [],
    criadoEm: existente?.criadoEm ?? parcial.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  await saveEquipamentoDb(e);
  return e;
}

export function removerEquipamento(id: string): Promise<void> {
  return deleteEquipamentoDb(id);
}

/**
 * Revoga o QR vigente: a página pública /q/<token> passa a negar o scan. NÃO gera
 * um token novo aqui (rotação/reemissão é fase seguinte) — só carimba a revogação.
 */
export async function revogarQr(id: string): Promise<void> {
  const e = await getEquipamentoDb(id);
  if (!e || e.qrRevogadoEm) return;
  await saveEquipamentoDb({ ...e, qrRevogadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() });
}

/** Anexa UMA foto ao equipamento (mescla; ignora duplicata). */
export async function adicionarFotoEquip(id: string, uri: string): Promise<void> {
  const e = await getEquipamentoDb(id);
  if (!e || !uri || e.fotos.includes(uri)) return;
  await saveEquipamentoDb({ ...e, fotos: [...e.fotos, uri], atualizadoEm: new Date().toISOString() });
}
