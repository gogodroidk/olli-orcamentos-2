import React, { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { useGravadorNuvem } from '../services/vozNuvem';
import { OlliInput } from './OlliInput';
import type { MaskType } from './OlliInput';

/**
 * CampoComVoz — um OlliInput com DITADO por voz (amor do técnico). O técnico toca no
 * microfone, fala, e o texto transcrito é ACRESCENTADO ao campo — ideal para escrever
 * observações/laudo/orientações no meio da rua sem digitar.
 *
 * Reusa `useGravadorNuvem` (modo 'transcrever'): grava o áudio e manda pro Worker
 * transcrever com o Gemini — funciona em QUALQUER Android (não depende do
 * reconhecimento de voz nativo). Degrada com elegância: sem IA/sinal, o `onErro`
 * mostra um aviso e o campo continua 100% digitável.
 */
export interface CampoComVozProps {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  helper?: string;
  multiline?: boolean;
  mask?: MaskType;
  containerStyle?: ViewStyle;
}

export function CampoComVoz({ label, value, onChangeText, placeholder, helper, multiline, mask, containerStyle }: CampoComVozProps) {
  const [erro, setErro] = useState('');

  const { gravando, enviando, segundos, iniciarGravacao, pararEEnviar } = useGravadorNuvem({
    modo: 'transcrever',
    onTexto: (t) => {
      const limpo = (t || '').trim();
      if (!limpo) return;
      const base = (value || '').trim();
      onChangeText(base ? `${base} ${limpo}` : limpo);
      setErro('');
    },
    onErro: (msg) => setErro(msg),
  });

  const icon: React.ComponentProps<typeof OlliInput>['rightIcon'] = enviando
    ? 'dots-horizontal'
    : gravando
      ? 'stop-circle'
      : 'microphone';

  // O helper vira o estado da gravação enquanto ocupado; erro quando falha; senão o helper do chamador.
  const helperMostrado = gravando
    ? `Ouvindo… ${segundos}s (toque no ■ para transcrever)`
    : enviando
      ? 'Transcrevendo o que você falou…'
      : erro || helper;

  return (
    <OlliInput
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      helper={helperMostrado}
      multiline={multiline}
      mask={mask}
      containerStyle={containerStyle}
      rightIcon={icon}
      // Enquanto transcreve, o botão fica inerte (evita gravar sobre o envio).
      onRightIconPress={enviando ? undefined : gravando ? pararEEnviar : iniciarGravacao}
      rightIconLabel={gravando ? 'Parar e transcrever' : 'Ditar por voz'}
    />
  );
}
