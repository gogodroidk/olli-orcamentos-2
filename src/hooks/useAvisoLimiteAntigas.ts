import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obterEstadoOfertaComercial } from '../services/cotaEnvios';
import { avisoAntigas, type AvisoAntigas } from '../services/limitesComerciais';
import { LIMITE_ENVIOS_GRATIS_MES } from '../services/planosBase';

/**
 * useAvisoLimiteAntigas — banner "a partir de {D+30} o Grátis passa a permitir até 5 envios por mês" para conta ANTIGA.
 *
 * TRÊS ESTADOS, nunca dois (memória "erro vira vazio"):
 *   `carregando`   → ainda não sei; a tela não desenha nada.
 *   `indisponivel` → não deu para ler a oferta (rede/servidor); o aviso não aparece e NADA muda no envio. O aviso
 *                    formal também sai por e-mail no dia D, então a leitura falha sem esconder o limite de verdade.
 *   `pronto`       → sei: `aviso.mostrar` diz se há o que avisar (conta anterior, antes do limite, não dispensado).
 * Dispensável 1 vez por data de corte (AsyncStorage, só neste aparelho). Revalida a cada foco da tela.
 */
export type EstadoAvisoLimiteAntigas =
  | { estado: 'carregando' }
  | { estado: 'indisponivel' }
  | { estado: 'pronto'; aviso: AvisoAntigas };

export function useAvisoLimiteAntigas(): { estado: EstadoAvisoLimiteAntigas; dispensar: () => void } {
  const [estado, setEstado] = useState<EstadoAvisoLimiteAntigas>({ estado: 'carregando' });

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      void (async () => {
        try {
          const oferta = await obterEstadoOfertaComercial();
          if (!ativo) return;
          if (!oferta) {
            setEstado({ estado: 'indisponivel' });
            return;
          }
          const aviso = avisoAntigas(oferta, LIMITE_ENVIOS_GRATIS_MES);
          if (aviso.mostrar) {
            // Falha ao ler a dispensa: mostra o aviso (melhor repetir do que esconder uma mudança de plano).
            const dispensado = await AsyncStorage.getItem(aviso.chave).catch(() => null);
            if (!ativo) return;
            if (dispensado) {
              setEstado({ estado: 'pronto', aviso: { mostrar: false } });
              return;
            }
          }
          setEstado({ estado: 'pronto', aviso });
        } catch {
          if (ativo) setEstado({ estado: 'indisponivel' });
        }
      })();
      return () => {
        ativo = false;
      };
    }, []),
  );

  const dispensar = useCallback(() => {
    setEstado((atual) => {
      if (atual.estado === 'pronto' && atual.aviso.mostrar) {
        void AsyncStorage.setItem(atual.aviso.chave, new Date().toISOString()).catch(() => {});
        return { estado: 'pronto', aviso: { mostrar: false } };
      }
      return atual;
    });
  }, []);

  return { estado, dispensar };
}
