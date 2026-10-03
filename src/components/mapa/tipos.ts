import type { StyleProp, ViewStyle } from 'react-native';
import type { EstadoParadaDia } from '../../utils/agendaDia';

/** Cor do pin: o estado da visita no dia, ou "equipe" (técnico na Equipe ao vivo). */
export type TomPin = EstadoParadaDia | 'equipe';

export interface PinMapa {
  id: string;
  lat: number;
  lon: number;
  /** O que vai dentro do pin: "1", "2"… ou as iniciais do técnico. */
  rotulo: string;
  tom: TomPin;
  /** Chuva prevista na hora da visita: anel laranja. */
  chuva?: boolean;
  /** Ponto aproximado (CEP/bairro): halo tracejado. */
  aproximado?: boolean;
  /** Texto para leitor de tela. */
  acessibilidade: string;
}

export interface MapaBaseProps {
  pins: readonly PinMapa[];
  /** A linha da rota, [lon, lat] em ordem. Ausente = sem linha. */
  linha?: readonly [number, number][];
  /** `false` = mini-mapa: sem gestos (o toque é do cartão em volta). */
  interativo?: boolean;
  onPinPress?: (id: string) => void;
  selecionado?: string | null;
  /** Espaço que o enquadramento deve deixar livre (ex.: a folha de baixo). */
  margens?: { topo: number; base: number; lados: number };
  /** Muda quando a ordem muda: refaz a animação de "desenhar" a linha. */
  chaveAnimacao?: string;
  style?: StyleProp<ViewStyle>;
}
