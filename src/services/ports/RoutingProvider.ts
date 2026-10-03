import type { PortaDisponivel, ResultadoPorta } from './comum';
import type { Coordenada } from './MapsProvider';

/**
 * RoutingProvider — CÁLCULO DE ROTA e roteirização: tempo/distância entre
 * pontos (com trânsito quando o provider suportar) e ordenação de várias
 * paradas (roteiro do técnico no dia). Separado de MapsProvider de propósito: um
 * geocodifica/exibe, o outro calcula caminho — a pesquisa trata como portas
 * distintas justamente para poder trocar o motor de rota sem trocar o de mapa.
 *
 * Impl de-facto HOJE (Onda I2, 01/10/2026): GRÁTIS e no aparelho. O billing do
 * Google está desligado e o dono proibiu pagar, então não há Routes API: o tempo
 * entre pontos é a estimativa sem trânsito de `src/services/etaEstimado.ts` e a
 * ordenação do dia é `src/services/rotaOtimizar.ts` (vizinho mais próximo + 2-opt
 * respeitando horários fixos). Navegar continua sendo o deep link público do Maps
 * (`src/services/rotas.ts`). OSRM/GraphHopper self-hosted ficam para quando o
 * volume justificar — o servidor demo deles não permite uso comercial.
 */
export interface RoutingProvider extends PortaDisponivel {
  /** Tempo e distância entre dois pontos (com trânsito se o provider oferecer). */
  calcularTrajeto(origem: Coordenada, destino: Coordenada): Promise<ResultadoPorta<Trajeto>>;

  /**
   * Ordena `paradas` numa sequência eficiente a partir de `origem` (roteiro do
   * dia). Devolve os índices na nova ordem + o trajeto total estimado.
   */
  otimizarRoteiro(origem: Coordenada, paradas: Coordenada[]): Promise<ResultadoPorta<Roteiro>>;
}

export interface Trajeto {
  /** Duração estimada em segundos. */
  duracaoSegundos: number;
  /** Distância em metros. */
  distanciaMetros: number;
  /** Polyline codificada (opcional) para desenhar no mapa embutido. */
  polyline?: string;
}

export interface Roteiro {
  /** Índices de `paradas` na ordem sugerida de visita. */
  ordem: number[];
  total: Trajeto;
}
