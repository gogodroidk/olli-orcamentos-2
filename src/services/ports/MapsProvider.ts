import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * MapsProvider — GEO de endereços: geocodificação (endereço → coordenada),
 * geocodificação reversa, validação/autocomplete de endereço e abrir o app de
 * mapa com um destino. É distinto de RoutingProvider (cálculo de rota/tempo).
 *
 * Provider escolhido: Google (Geocoding/Places/Address Validation) como padrão
 * inicial pela qualidade de dados BR; MapLibre para VISUALIZAÇÃO quando fizer
 * sentido (ver backlog MAPS). Chave client-side (Maps SDK) exige billing no
 * Google Cloud — bloqueio B4; a chave de server-side (Geocoding/Routes) fica no
 * worker, nunca no bundle.
 *
 * Impl de-facto HOJE:
 *   - abrir mapa com destino: `src/services/rotas.ts` (`abrirRotaGoogleMaps`,
 *     deep-link público, SEM chave/billing — funciona hoje);
 *   - flag de mapa embutido: `src/services/localizacaoEquipe.ts`
 *     (`mapaEmbutidoDisponivel`, ligada por `EXPO_PUBLIC_MAPS_KEY`);
 *   - CEP → endereço (BR): `src/services/cep.ts` (ViaCEP) — parente próximo,
 *     mas mantido separado por ser um provider BR de CEP, não de geocoding.
 * `disponivel()` desta porta espelha `mapaEmbutidoDisponivel()`; enquanto false,
 * o caminho pleno é sempre o deep-link (`abrirRotaGoogleMaps`).
 *
 * Onda de fiação: geocoding/validação server-side na Onda 8 (CRM: locais de
 * atendimento); mapa embutido na Onda 12 (bloqueado por B4).
 */
export interface MapsProvider extends PortaDisponivel {
  /** Endereço textual → coordenada (lat/lng). */
  geocodificar(endereco: string): Promise<ResultadoPorta<Coordenada>>;

  /** Coordenada → endereço textual (geocodificação reversa). */
  enderecoDe(coord: Coordenada): Promise<ResultadoPorta<{ enderecoFormatado: string }>>;

  /**
   * Abre o app/navegador de mapa com a rota até `endereco` (modo dirigindo).
   * Deep-link puro — sempre disponível, mesmo com `disponivel()` false. Espelha
   * `rotas.ts.abrirRotaGoogleMaps`.
   */
  abrirRotaAte(endereco: string): Promise<void>;
}

export interface Coordenada {
  lat: number;
  lng: number;
}
