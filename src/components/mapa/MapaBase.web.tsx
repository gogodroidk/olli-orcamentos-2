import React from 'react';
import { EsquemaRota } from './EsquemaRota';
import type { MapaBaseProps } from './tipos';

/**
 * Web (build RN-web): o MapLibre nativo não existe aqui. Em vez de um mapa falso,
 * o esquema das paradas nas posições relativas, dizendo que é esquema.
 */
export function MapaBase(props: MapaBaseProps) {
  return <EsquemaRota {...props} aviso="Esquema das paradas, sem mapa de fundo (o mapa aparece no app do celular)" />;
}
