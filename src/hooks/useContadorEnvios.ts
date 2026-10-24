import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { obterEstadoOfertaComercial } from '../services/cotaEnvios';
import { contadorEnvios, type ContadorEnvios } from '../services/limitesComerciais';

/**
 * useContadorEnvios — liga a regra pura `contadorEnvios` (services/limitesComerciais.ts) à tela.
 *
 * TRÊS ESTADOS, nunca dois (memória "erro vira vazio"):
 *   `carregando`   → ainda não sei; a tela não desenha o contador.
 *   `indisponivel` → não deu para ler a oferta; o contador não aparece e NADA muda no envio
 *                    (quem barra o 6º envio é o servidor, não este número informativo).
 *   `pronto`       → sei: `contador.mostrar` diz se há o que contar (conta nova do Grátis, 3º envio em diante).
 * Revalida a cada foco da tela (enviar um orçamento e voltar atualiza sozinho). Nada sobe como exceção.
 */
export type EstadoContadorEnvios =
  | { estado: 'carregando' }
  | { estado: 'indisponivel' }
  | { estado: 'pronto'; contador: ContadorEnvios };

export function useContadorEnvios(): EstadoContadorEnvios {
  const [estado, setEstado] = useState<EstadoContadorEnvios>({ estado: 'carregando' });

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      void (async () => {
        try {
          const oferta = await obterEstadoOfertaComercial();
          if (!ativo) return;
          // `null` = leitura falhou ou resposta estranha: indisponível, não "sem contador".
          setEstado(oferta ? { estado: 'pronto', contador: contadorEnvios(oferta) } : { estado: 'indisponivel' });
        } catch {
          if (ativo) setEstado({ estado: 'indisponivel' });
        }
      })();
      return () => {
        ativo = false;
      };
    }, []),
  );

  return estado;
}
