import type { PortaDisponivel, ResultadoPorta } from './comum';
import type { Coordenada } from './MapsProvider';

/**
 * RoutingProvider — CÁLCULO DE ROTA e roteirização: tempo/distância entre
 * pontos (com trânsito quando o provider suportar) e ordenação de várias
 * paradas (roteiro do técnico no dia). Separado de MapsProvider de propósito: um
 * geocodifica/exibe, o outro calcula caminho — a pesquisa trata como portas
 * distintas justamente para poder trocar o motor de rota sem trocar o de mapa.
 *
 * Provider escolhido: Google Routes API como início (mesma chave server-side no
 * worker); OSRM ou GraphHopper como alternativa futura self-hosted quando o
 * volume justificar (ver backlog ROUTING). "OSM grátis" não é infra sem custo.
 *
 * Impl de-facto HOJE: NENHUM cálculo de rota. O que existe é só ABRIR o Google
 * Maps já com a rota traçada (`src/services/rotas.ts` → `abrirRotaGoogleMaps`),
 * onde o próprio app do Google mostra tempo/trânsito — não devolvemos os números
 * para dentro do OLLI. O "PLANO FUTURO" já esboçado em `rotas.ts` (rota
 * `POST /rota` no worker proxyando `computeRoutes`) é exatamente o que esta
 * porta padroniza.
 *
 * Onda de fiação: Onda 12 (Agenda avançada + Google) — depende de billing (B4)
 * para o embutido; o cálculo server-side pode vir antes atrás desta porta.
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
