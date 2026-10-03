/**
 * "Saindo agora, chega por volta de…" — ETA ESTIMADO no aparelho (Onda I2).
 *
 * Até 30/09/2026 isto chamava o worker `POST /eta`, que pagava a Routes API do
 * Google. O billing do Google está desligado e o dono proibiu pagar: agora o
 * tempo é ESTIMADO aqui mesmo (`etaEstimado.ts`: linha reta × 1,4 ÷ velocidade
 * urbana do horário), sem rede e sem custo, e a tela diz "estimativa, sem
 * trânsito" (`ROTULO_ESTIMATIVA`). Nunca "com trânsito".
 *
 * ESTADOS EXPLÍCITOS — regra dura do repo: nunca colapsar erro em vazio.
 * `getEta*` nunca lança; sempre resolve um destes:
 *
 *   'ok'              — estimativa (minutos, km de rua) e `chegada` = agora + minutos.
 *   'sem_localizacao' — a posição do aparelho não veio (permissão negada, GPS
 *                       desligado). Acionável: ativar a localização.
 *   'sem_destino'     — a visita não tem local no mapa (cliente sem coordenada,
 *                       ou a visita é num endereço diferente do cadastro).
 *                       Acionável: completar o CEP/endereço do cliente.
 *   'indisponivel'    — qualquer outra causa (recurso não confirmado, erro).
 *
 * ORIGEM (posição atual): só existe quando há módulo de localização — hoje a web
 * (`navigator.geolocation`). No APK, `expo-location` ainda não é dependência
 * (`LOCALIZACAO_DISPONIVEL` em localizacaoEquipe.ts): o import é DINÂMICO e só é
 * tentado quando a constante for `true`. NUNCA `import 'expo-location'` em
 * module-scope: quebra o bundle Hermes mesmo sem uso (lição do release v6).
 * Para o APK, a hora de sair que funciona sem GPS é a do `AvisoSaidaCard`
 * (origem = visita anterior ou base da empresa).
 */
import { Platform } from 'react-native';
import { acessoRecursoAgora } from './planos';
import { LOCALIZACAO_DISPONIVEL } from './localizacaoEquipe';
import { estimarViagem, type Ponto } from './etaEstimado';
import { hhmm, janelaChegada, pontoDoAgendamento } from './saidaCalculo';
import type { Agendamento, Cliente } from '../types';

export type ResultadoEta =
  | { estado: 'ok'; minutos: number; distanciaKm: number; chegada: Date }
  | { estado: 'sem_localizacao' }
  | { estado: 'sem_destino' }
  | { estado: 'indisponivel' };

/**
 * Mensagem de WhatsApp "estou a caminho". Com estimativa, vai uma JANELA ("chego
 * entre 14:40 e 15:20"), que é a incerteza real de uma conta sem trânsito dita em
 * voz alta. Nos demais estados a mensagem sai SEM horário — nunca inventa um.
 */
export function mensagemEstouACaminho(nomeCliente: string, resultado: ResultadoEta | null): string {
  const primeiro = (nomeCliente ?? '').trim().split(/\s+/)[0] || 'tudo bem';
  if (resultado?.estado === 'ok') {
    const janela = janelaChegada(resultado.chegada, resultado.minutos);
    if (janela) {
      return `Olá ${primeiro}, estou a caminho, chego entre ${hhmm(janela.de)} e ${hhmm(janela.ate)}.`;
    }
  }
  return `Olá ${primeiro}, estou a caminho!`;
}

/**
 * Posição atual do aparelho (best-effort). `null` quando sem permissão, GPS
 * desligado ou módulo indisponível — nunca lança.
 */
async function origemAtual(): Promise<Ponto | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          (e) => reject(e),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      });
      return { lat: coords.latitude, lon: coords.longitude };
    } catch (erro) {
      console.log('[eta] geolocalização web indisponível/negada:', erro);
      return null;
    }
  }

  if (!LOCALIZACAO_DISPONIVEL) return null;

  try {
    // Import dinâmico de propósito — ver o header do arquivo e localizacaoEquipe.ts.
    const Location = await import('expo-location' as any);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch (erro) {
    console.log('[eta] não foi possível capturar localização nativa:', erro);
    return null;
  }
}

/** Estimativa daqui até `destino`, saindo agora. Nunca lança. */
export async function getEta(destino: Ponto): Promise<ResultadoEta> {
  try {
    const origem = await origemAtual();
    if (!origem) return { estado: 'sem_localizacao' };
    const agora = Date.now();
    const est = estimarViagem(origem, destino, agora);
    if (!est) return { estado: 'indisponivel' };
    return { estado: 'ok', minutos: est.minutos, distanciaKm: est.distanciaKm, chegada: new Date(agora + est.minutos * 60_000) };
  } catch (erro) {
    console.log('[eta] falha ao estimar:', erro);
    return { estado: 'indisponivel' };
  }
}

/**
 * Há como mostrar o chip para esta visita? Decisão SÍNCRONA (a UI decide antes de
 * qualquer conta). No nativo, sem módulo de localização, nunca: "Ative a
 * localização" seria um beco sem saída. Sem local da visita no mapa, o chip
 * aparece com "sem local no mapa" — a ação é completar o cadastro.
 */
export function temDestinoEta(a: Pick<Agendamento, 'clienteId'> | null | undefined): boolean {
  if (Platform.OS !== 'web' && !LOCALIZACAO_DISPONIVEL) return false;
  return !!a?.clienteId;
}

/**
 * ETA de um agendamento: o ponto do cliente (nunca geocodifica texto livre — isso
 * era Google). Inteligência do Pro (`hora_de_sair`): sem o recurso CONFIRMADO, o
 * próprio `EtaChip` mostra "Disponível no Pro" e este `indisponivel` nem aparece.
 */
export async function getEtaAgendamento(
  a: Pick<Agendamento, 'clienteId' | 'endereco'> | null | undefined,
  clientes: readonly Cliente[] = [],
): Promise<ResultadoEta> {
  if (!a) return { estado: 'indisponivel' };
  if ((await acessoRecursoAgora('hora_de_sair')) !== 'liberado') return { estado: 'indisponivel' };
  const destino = pontoDoAgendamento(a, clientes);
  if (!destino) return { estado: 'sem_destino' };
  return getEta(destino);
}
