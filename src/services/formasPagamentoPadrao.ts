/**
 * Smart default: lembra a ÚLTIMA combinação de formas de pagamento marcada
 * pelo prestador em um orçamento salvo, por empresa — em vez de todo
 * orçamento novo sempre reabrir com só PIX marcado (o único padrão fixo de
 * hoje). Mesmo padrão de mapa-em-AsyncStorage de services/radarClientes.ts:
 * nunca lança, falha vira "sem padrão salvo ainda".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormaPagamento } from '../types';
import { FORMAS_PAGAMENTO_PADRAO_KEY } from './storageKeys';

type MapaFormasPagamento = Record<string, FormaPagamento>;

async function lerMapa(): Promise<MapaFormasPagamento> {
  try {
    const raw = await AsyncStorage.getItem(FORMAS_PAGAMENTO_PADRAO_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Última combinação salva para esta empresa. `null` quando ainda não há
 * nenhuma salva (empresa nova) OU quando `empresaId` está ausente — nesses
 * casos o chamador cai no próprio default estático (`{ pix: true }`).
 */
export async function getUltimasFormasPagamento(empresaId: string | undefined | null): Promise<FormaPagamento | null> {
  if (!empresaId) return null;
  const mapa = await lerMapa();
  return mapa[empresaId] ?? null;
}

/**
 * Grava a combinação como o novo padrão desta empresa, para o PRÓXIMO
 * orçamento já nascer com ela marcada. Best-effort e fire-and-forget do
 * ponto de vista do chamador: falha aqui nunca pode travar o salvamento do
 * orçamento em si.
 */
export async function salvarUltimasFormasPagamento(
  empresaId: string | undefined | null,
  formas: FormaPagamento,
): Promise<void> {
  if (!empresaId) return;
  try {
    const mapa = await lerMapa();
    mapa[empresaId] = formas;
    await AsyncStorage.setItem(FORMAS_PAGAMENTO_PADRAO_KEY, JSON.stringify(mapa));
  } catch {
    // salvar é best-effort: nunca deve travar o fluxo de orçamento
  }
}
