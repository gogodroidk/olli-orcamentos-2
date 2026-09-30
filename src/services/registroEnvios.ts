/**
 * Registro de COBRANÇAS e LEMBRETES enviados pelo WhatsApp (1 toque).
 *
 * O app não sabe se o prestador de fato apertou "enviar" dentro do WhatsApp — sabe
 * que ele TOCOU em "Cobrar"/"Lembrar" e o WhatsApp abriu com a mensagem pronta. É
 * esse toque que registramos: serve para o radar não insistir no mesmo cliente no
 * mesmo dia (cobrança) nem no mesmo mês (lembrete), e para a tela mostrar "cobrado
 * hoje"/"lembrado em DD/MM".
 *
 * Mesmo padrão do "adiar" do radar de clientes: AsyncStorage + push best-effort para
 * `extras_sync` (ver EXTRAS_ASYNC em cloudSync.ts), com a parte pura em
 * `utils/cobrancaCliente.ts` (`registrarEnvio`, `lerMapaEnvios`).
 *
 * LEITURA QUE FALHA = MAPA VAZIO, e aqui isso é o lado seguro: o radar mostra o item
 * como "ainda não cobrado" (de MAIS, nunca de menos). Nenhum dinheiro some da tela
 * por causa desta leitura — ela só reordena e rotula.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COBRANCAS_ENVIADAS_KEY, LEMBRETES_ENVIADOS_KEY } from './storageKeys';
import { pushExtraChave } from './cloudSync';
import { lerMapaEnvios, registrarEnvio, type MapaEnvios } from '../utils/cobrancaCliente';

async function lerMapa(chave: string): Promise<MapaEnvios> {
  try {
    const raw = await AsyncStorage.getItem(chave);
    return raw ? lerMapaEnvios(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

async function carimbar(chave: string, chaveNuvem: string, id: string): Promise<void> {
  try {
    const mapa = registrarEnvio(await lerMapa(chave), id);
    await AsyncStorage.setItem(chave, JSON.stringify(mapa));
    // Espelha na nuvem (extras_sync) — best-effort, nunca trava a tela.
    void pushExtraChave(chaveNuvem).catch(() => {});
  } catch {
    // registrar é best-effort: a mensagem já foi aberta, a falha aqui só faz o
    // radar mostrar o item de novo (de mais, nunca de menos)
  }
}

/** orcamentoId → ISO da última cobrança enviada. */
export function lerCobrancasEnviadas(): Promise<MapaEnvios> {
  return lerMapa(COBRANCAS_ENVIADAS_KEY);
}

export function registrarCobrancaEnviada(orcamentoId: string): Promise<void> {
  return carimbar(COBRANCAS_ENVIADAS_KEY, 'cobranca.enviadas', orcamentoId);
}

/** clienteId → ISO do último lembrete de pós-venda enviado. */
export function lerLembretesEnviados(): Promise<MapaEnvios> {
  return lerMapa(LEMBRETES_ENVIADOS_KEY);
}

export function registrarLembreteEnviado(clienteId: string): Promise<void> {
  return carimbar(LEMBRETES_ENVIADOS_KEY, 'posvenda.lembrados', clienteId);
}
