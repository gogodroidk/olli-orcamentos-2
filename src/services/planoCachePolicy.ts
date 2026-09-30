import type { PlanoId } from './entitlements';

/** Janela máxima de uso offline de um entitlement previamente confirmado. */
export const PLANO_CACHE_GRACA_MS = 7 * 24 * 60 * 60 * 1000;

export type OrigemPlanoCache = 'gratis' | 'pagamento' | 'admin' | 'trial';

export interface DadosPlanoCache {
  plano: PlanoId;
  status?: string;
  validoAte?: string;
  origem: OrigemPlanoCache;
}

export interface PlanoCachePersistido extends DadosPlanoCache {
  schemaVersion: 2;
  ownerUserId: string;
  lidoEm: number;
}

const PLANOS = new Set<PlanoId>(['gratis', 'pro', 'empresa']);
const ORIGENS = new Set<OrigemPlanoCache>(['gratis', 'pagamento', 'admin', 'trial']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAVES = new Set(['schemaVersion', 'ownerUserId', 'lidoEm', 'plano', 'status', 'validoAte', 'origem']);

function textoOpcionalSeguro(valor: unknown, maximo: number): valor is string | undefined {
  return valor === undefined || (typeof valor === 'string' && valor.length > 0 && valor.length <= maximo);
}

/**
 * Serializa somente o mínimo necessário para a graça offline. O identificador
 * de dono é obrigatório: cache legado sem dono é deliberadamente inválido.
 */
export function criarPlanoCache(
  ownerUserId: string,
  dados: DadosPlanoCache,
  lidoEm = Date.now(),
): PlanoCachePersistido {
  if (!UUID.test(ownerUserId)) throw new Error('plano_cache_owner_invalido');
  if (!PLANOS.has(dados.plano) || !ORIGENS.has(dados.origem)) throw new Error('plano_cache_dados_invalidos');
  if (!Number.isFinite(lidoEm) || lidoEm < 0) throw new Error('plano_cache_relogio_invalido');
  return {
    schemaVersion: 2,
    ownerUserId,
    lidoEm,
    plano: dados.plano,
    origem: dados.origem,
    ...(dados.status ? { status: dados.status } : {}),
    ...(dados.validoAte ? { validoAte: dados.validoAte } : {}),
  };
}

/** Parser estrito: tipo, chaves extras e cache legado falham fechados. */
export function interpretarPlanoCache(raw: string | null): PlanoCachePersistido | null {
  if (!raw) return null;
  try {
    const valor: unknown = JSON.parse(raw);
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const obj = valor as Record<string, unknown>;
    if (Object.keys(obj).some((chave) => !CHAVES.has(chave))) return null;
    if (obj.schemaVersion !== 2 || typeof obj.ownerUserId !== 'string' || !UUID.test(obj.ownerUserId)) return null;
    if (typeof obj.lidoEm !== 'number' || !Number.isFinite(obj.lidoEm) || obj.lidoEm < 0) return null;
    if (typeof obj.plano !== 'string' || !PLANOS.has(obj.plano as PlanoId)) return null;
    if (typeof obj.origem !== 'string' || !ORIGENS.has(obj.origem as OrigemPlanoCache)) return null;
    if (!textoOpcionalSeguro(obj.status, 64) || !textoOpcionalSeguro(obj.validoAte, 64)) return null;
    if (obj.validoAte !== undefined && !Number.isFinite(Date.parse(obj.validoAte))) return null;
    return obj as unknown as PlanoCachePersistido;
  } catch {
    return null;
  }
}

/**
 * Valida dono, relógio, janela offline e a vigência autoritativa. Um pagamento
 * não ganha sete dias extras depois do período quitado; a graça só cobre falta
 * de rede enquanto a vigência previamente confirmada ainda existe.
 */
export function planoCacheValido(
  cache: PlanoCachePersistido | null,
  ownerUserId: string,
  agoraMs = Date.now(),
): cache is PlanoCachePersistido {
  if (!cache || !UUID.test(ownerUserId) || cache.ownerUserId !== ownerUserId) return false;
  if (!Number.isFinite(agoraMs)) return false;
  const idade = agoraMs - cache.lidoEm;
  if (idade < 0 || idade > PLANO_CACHE_GRACA_MS) return false;

  if (cache.origem === 'pagamento' || cache.origem === 'trial') {
    if (!cache.validoAte) return false;
    const termina = Date.parse(cache.validoAte);
    if (!Number.isFinite(termina) || termina <= agoraMs) return false;
  }

  return true;
}
