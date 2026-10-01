/**
 * "Já celebrou?" — guarda, no aparelho, quais orçamentos já tiveram a festa de
 * aprovado/pago no detalhe, para ela sair UMA vez só (item 2.10).
 *
 * A regra pura (chave, teto, leitura tolerante) mora em
 * `components/orcamento/linhaDoTempo.ts`. Aqui é só o AsyncStorage.
 *
 * Leitura que FALHA responde "já celebrou" (`true`): o lado seguro aqui é NÃO
 * festejar — confete repetido incomoda, confete a menos não apaga nada. Nenhum
 * dado de negócio depende desta lista; ela só decide um enfeite.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CELEBRACOES_KEY } from './storageKeys';
import {
  chaveCelebracao,
  lerCelebracoes,
  registrarCelebracao,
  type MotivoCelebracao,
} from '../components/orcamento/linhaDoTempo';

export async function jaCelebrou(orcamentoId: string, motivo: MotivoCelebracao): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CELEBRACOES_KEY);
    const lista = raw ? lerCelebracoes(JSON.parse(raw)) : [];
    return lista.includes(chaveCelebracao(orcamentoId, motivo));
  } catch {
    return true;
  }
}

/** Marca como celebrado. Best-effort: falhar só pode repetir o enfeite. Nunca lança. */
export async function marcarCelebrado(orcamentoId: string, motivo: MotivoCelebracao): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CELEBRACOES_KEY);
    const lista = raw ? lerCelebracoes(JSON.parse(raw)) : [];
    const nova = registrarCelebracao(lista, chaveCelebracao(orcamentoId, motivo));
    await AsyncStorage.setItem(CELEBRACOES_KEY, JSON.stringify(nova));
  } catch {
    // enfeite: sem gravação, no pior caso a festa sai de novo noutra transição
  }
}
