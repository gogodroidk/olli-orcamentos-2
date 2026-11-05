import AsyncStorage from '@react-native-async-storage/async-storage';
import { IDENTIDADE_UPSELL_KEY } from './storageKeys';
import { lerPedido, serializarPedido, type PedidoIdentidade } from './identidadeUpsell';

/** Último pedido neste aparelho. Sai no logout, junto com o resto da conta. */
export async function lerPedidoLocal(): Promise<PedidoIdentidade | null> {
  try {
    return lerPedido(await AsyncStorage.getItem(IDENTIDADE_UPSELL_KEY));
  } catch {
    return null;
  }
}

export async function gravarPedidoLocal(pedido: PedidoIdentidade): Promise<boolean> {
  try {
    await AsyncStorage.setItem(IDENTIDADE_UPSELL_KEY, serializarPedido(pedido));
    return true;
  } catch {
    return false;
  }
}
