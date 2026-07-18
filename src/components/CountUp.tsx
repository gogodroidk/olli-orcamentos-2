import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TextStyle } from 'react-native';
import { Motion, useReducedMotion } from '../theme/motion';
import { formatCurrency, formatNumber } from '../utils/currency';

interface Props {
  value: number;
  format?: 'currency' | 'int';
  duration?: number;
  style?: TextStyle | TextStyle[];
}

function formatar(v: number, format: 'currency' | 'int'): string {
  if (format === 'currency') return formatCurrency(v);
  return formatNumber(Math.round(v), 0);
}

/**
 * Número que "conta" do valor anterior até o novo — usado em KPIs e totais.
 * Anima com Animated.Value (useNativeDriver:false pois altera texto).
 */
export function CountUp({ value, format = 'int', duration = 800, style }: Props) {
  const anim = useRef(new Animated.Value(value)).current;
  const anterior = useRef(value);
  const [texto, setTexto] = useState(() => formatar(value, format));
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    const de = anterior.current;
    const para = Number.isFinite(value) ? value : 0;

    if (de === para) {
      setTexto(formatar(para, format));
      return;
    }

    // Acessibilidade: com "Reduzir movimento" ligado o número aparece direto no
    // valor final — o conteúdo é idêntico, só sem a contagem. Um KPI que rola
    // números sozinho é justamente o tipo de movimento que essa preferência pede
    // para desligar.
    if (reduzirMovimento) {
      anterior.current = para;
      setTexto(formatar(para, format));
      return;
    }

    anim.setValue(de);
    const listenerId = anim.addListener(({ value: v }) => {
      setTexto(formatar(v, format));
    });

    Animated.timing(anim, {
      toValue: para,
      duration,
      easing: Motion.easing.standard,
      useNativeDriver: false,
    }).start(() => {
      anterior.current = para;
      setTexto(formatar(para, format));
    });

    return () => {
      anim.removeListener(listenerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format, duration, reduzirMovimento]);

  return <Text style={style}>{texto}</Text>;
}
