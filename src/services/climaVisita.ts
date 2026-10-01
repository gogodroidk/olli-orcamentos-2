/**
 * climaVisita.ts — "Chuva na Visita" (Onda I1, jogada 1), lado com rede/React.
 *
 * Busca o `/clima` do worker (MET Norway, via `buscarClima` de `clima.ts`, com o
 * cache de processo de lá) na COORDENADA DO CLIENTE da visita e cruza com a hora
 * marcada. Toda a decisão mora em `climaVisitaRegra.ts` (pura, testada em node
 * por `scripts/teste-clima-visita.ts`); este arquivo só liga a rede à regra.
 *
 * Uso (quem encaixar nas telas — ver o PR):
 *   const clima = useClimaVisita({ inicio, fim, lat, lon, externa, local }, { alertas });
 *   <ClimaVisitaChip analise={clima} />
 *   {clima.sugerirRemarcar && <FolhaRemarcarChuva … analise={clima} />}
 *
 * Três estados SEMPRE visíveis: carregando ("Carregando clima…"), falha ("Clima
 * indisponível") e previsão. A atribuição CC BY 4.0 vem em `analise.atribuicao`.
 */
import { useEffect, useState } from 'react';
import { buscarClima } from './clima';
import type { EstadoClima } from './climaTexto';
import {
  analisarClimaVisita,
  type OpcoesClimaVisita,
  type ResultadoClimaVisita,
  type VisitaParaClima,
} from './climaVisitaRegra';

export * from './climaVisitaRegra';

/**
 * Clima de uma visita, já analisado. Sem coordenada não faz rede nenhuma (o
 * resultado diz "endereço do cliente sem localização"). Nunca fica preso em
 * 'carregando': erro inesperado vira "Clima indisponível".
 */
export function useClimaVisita(visita: VisitaParaClima, opcoes: OpcoesClimaVisita = {}): ResultadoClimaVisita {
  const [clima, setClima] = useState<EstadoClima>('carregando');
  const { lat, lon } = visita;

  useEffect(() => {
    let vivo = true;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      setClima({ ok: false, motivo: 'sem_localizacao' });
      return;
    }
    setClima('carregando');
    buscarClima(lat, lon)
      .then((r) => {
        if (vivo) setClima(r);
      })
      .catch(() => {
        if (vivo) setClima({ ok: false, motivo: 'clima_indisponivel' });
      });
    return () => {
      vivo = false;
    };
  }, [lat, lon]);

  return analisarClimaVisita(visita, clima, opcoes);
}
