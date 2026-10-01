import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { CICLO, useReduzirMovimento } from '../../theme/motion';
import { formatCurrency, formatNumber } from '../../utils/currency';
import { curvas } from './curvas';

type Formato = 'brl' | 'inteiro';

interface Props {
  valor: number;
  /** `brl` = R$ com centavos; `inteiro` = número sem casas. Padrão `inteiro`. */
  formato?: Formato;
  style?: StyleProp<TextStyle>;
  /** Repassado ao `Text` (ex.: 1 no rodapé, para total grande não quebrar linha). */
  numberOfLines?: number;
}

function formatar(v: number, formato: Formato): string {
  return formato === 'brl' ? formatCurrency(v) : formatNumber(Math.round(v), 0);
}

/**
 * Número que conta do valor anterior até o novo (KPIs, totais). O relógio da
 * contagem roda na UI thread; o JS só re-renderiza quando o número EXIBIDO muda
 * (centavo a centavo no BRL, unidade a unidade no inteiro), não a cada quadro.
 *
 * O formato (Intl) fica no JS de propósito: o runtime de worklets não garante
 * `Intl`. Valor não finito vira 0 — mesma regra do `formatCurrency`.
 *
 * Leitor de tela: anuncia SEMPRE o valor final, nunca os intermediários.
 * "Reduzir movimento": o número aparece direto no valor final.
 */
export function ContadorAnimado({ valor, formato = 'inteiro', style, numberOfLines }: Props) {
  const reduzir = useReduzirMovimento();
  const alvo = Number.isFinite(valor) ? valor : 0;
  // Passo de exibição: centavo no BRL, unidade no inteiro.
  const escala = formato === 'brl' ? 100 : 1;

  const atual = useSharedValue(alvo);
  const montado = useRef(false);
  const [exibido, setExibido] = useState(alvo);

  useEffect(() => {
    // Primeira montagem: já começa no valor (não conta a partir de zero a cada
    // abertura de tela — isso é enfeite, não informação).
    if (!montado.current) {
      montado.current = true;
      return;
    }
    if (reduzir) {
      cancelAnimation(atual);
      atual.set(alvo);
      setExibido(alvo);
      return;
    }
    atual.set(withTiming(alvo, { duration: CICLO.contagem, easing: curvas.decelerate }));
  }, [alvo, reduzir, atual]);

  useEffect(() => () => cancelAnimation(atual), [atual]);

  useAnimatedReaction(
    () => Math.round(atual.get() * escala),
    (passo, anterior) => {
      if (passo !== anterior) scheduleOnRN(setExibido, passo / escala);
    },
    [escala],
  );

  const textoFinal = formatar(alvo, formato);
  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={textoFinal}>
      {formatar(exibido, formato)}
    </Text>
  );
}
