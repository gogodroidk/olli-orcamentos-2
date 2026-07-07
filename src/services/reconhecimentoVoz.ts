import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

/**
 * Abstração única de reconhecimento de fala (web + nativo) para a v3.
 *
 * A lib `expo-speech-recognition` já resolve automaticamente para uma
 * implementação web (`.web.js`, baseada em webkitSpeechRecognition/
 * SpeechRecognition do navegador) quando o bundle é o de web — por isso o
 * MESMO `ExpoSpeechRecognitionModule` e o MESMO `useSpeechRecognitionEvent`
 * funcionam nas duas plataformas, sem precisar de `require` condicional nem
 * de branch de import. Só o COMPORTAMENTO (auto-restart, textos de erro)
 * precisa diferenciar plataforma — e isso é feito com `Platform.OS`, nunca
 * com hooks condicionais.
 */

const isWeb = Platform.OS === 'web';

/** Máximo de reinícios automáticos seguidos sem nenhum resultado de fala. */
const MAX_RESTARTS_SEM_RESULTADO = 3;
/** Espera antes de reiniciar a escuta após o motor encerrar sozinho. */
const DELAY_AUTO_RESTART_MS = 250;

export interface UseReconhecimentoVozOpts {
  onParcial: (texto: string) => void;
  onFinal: (texto: string) => void;
  onErro: (mensagemAmigavel: string) => void;
  onFimEscuta: () => void;
}

export interface UseReconhecimentoVozResultado {
  disponivel: boolean;
  ouvindo: boolean;
  iniciar: () => Promise<void>;
  parar: () => void;
}

function mensagemPermissaoNegada(): string {
  return isWeb
    ? 'Preciso da permissão do microfone para te ouvir. Libere nas configurações do navegador — ou escreva o que precisa abaixo.'
    : 'Preciso da permissão do microfone para te ouvir. Libere em Configurações > Apps > OLLI — ou escreva o que precisa abaixo.';
}

function mapearErro(code: ExpoSpeechRecognitionErrorCode | string): string | null {
  // 'no-speech' (silêncio) não é fatal — quem decide o que fazer é o
  // controle de auto-restart, não uma mensagem de erro para o usuário.
  if (code === 'no-speech') return null;
  if (code === 'not-allowed' || code === 'service-not-allowed') return mensagemPermissaoNegada();
  if (code === 'network') return 'A transcrição precisa de internet. Confira a conexão ou escreva abaixo.';
  if (code === 'audio-capture') return 'Não encontrei um microfone neste aparelho. Use o campo de texto abaixo.';
  return 'Tive um problema com o microfone. Você pode escrever abaixo.';
}

/**
 * Hook de reconhecimento de fala em pt-BR, funcional em web e Android.
 *
 * No Android, o motor de reconhecimento encerra a escuta sozinho após
 * pausas mesmo com `continuous: true` — este hook reinicia automaticamente
 * (até um limite) para simular uma escuta contínua de verdade.
 */
export function useReconhecimentoVoz(opts: UseReconhecimentoVozOpts): UseReconhecimentoVozResultado {
  const { onParcial, onFinal, onErro, onFimEscuta } = opts;

  const [disponivel, setDisponivel] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);

  // refs para não recriar os handlers de evento a cada render
  const aindaOuvindoRef = useRef(false);
  const restartsSemResultadoRef = useRef(0);
  const teveResultadoNestaSessaoRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onParcialRef = useRef(onParcial);
  const onFinalRef = useRef(onFinal);
  const onErroRef = useRef(onErro);
  const onFimEscutaRef = useRef(onFimEscuta);
  onParcialRef.current = onParcial;
  onFinalRef.current = onFinal;
  onErroRef.current = onErro;
  onFimEscutaRef.current = onFimEscuta;

  useEffect(() => {
    try {
      setDisponivel(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setDisponivel(false);
    }
  }, []);

  const limparTimerRestart = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const iniciarEscutaBruta = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
      });
    } catch {
      aindaOuvindoRef.current = false;
      setOuvindo(false);
      onErroRef.current('Não consegui iniciar a escuta. Tente novamente ou escreva abaixo.');
    }
  }, []);

  const iniciar = useCallback(async () => {
    limparTimerRestart();
    restartsSemResultadoRef.current = 0;
    teveResultadoNestaSessaoRef.current = false;

    try {
      let permissao = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (!permissao.granted) {
        permissao = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      }
      if (!permissao.granted) {
        onErroRef.current(mensagemPermissaoNegada());
        return;
      }
    } catch {
      // Se a checagem de permissão falhar de forma inesperada, ainda
      // tentamos iniciar — o próprio start() reportará erro via evento.
    }

    aindaOuvindoRef.current = true;
    setOuvindo(true);
    iniciarEscutaBruta();
  }, [iniciarEscutaBruta, limparTimerRestart]);

  const parar = useCallback(() => {
    aindaOuvindoRef.current = false;
    limparTimerRestart();
    setOuvindo(false);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // noop — encerrar sem escuta ativa não é erro
    }
  }, [limparTimerRestart]);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    teveResultadoNestaSessaoRef.current = true;
    restartsSemResultadoRef.current = 0;
    if (event.isFinal) {
      onFinalRef.current(transcript);
      onParcialRef.current('');
    } else {
      onParcialRef.current(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    const msg = mapearErro(event.error);
    if (msg == null) return; // no-speech: silencioso
    aindaOuvindoRef.current = false;
    limparTimerRestart();
    setOuvindo(false);
    onErroRef.current(msg);
  });

  useSpeechRecognitionEvent('end', () => {
    // Web: comportamento idêntico ao original — encerra e some o parcial.
    // Nativo: o Android costuma encerrar sozinho em pausas mesmo com
    // continuous:true; se o usuário ainda não pediu para parar, reiniciamos
    // automaticamente (com um teto de tentativas sem resultado, pra não
    // ficar reiniciando pra sempre num silêncio total).
    if (!aindaOuvindoRef.current) {
      return;
    }

    if (isWeb) {
      // Web trata "end" como fim real da escuta (mesmo comportamento antigo).
      aindaOuvindoRef.current = false;
      setOuvindo(false);
      onParcialRef.current('');
      return;
    }

    if (!teveResultadoNestaSessaoRef.current) {
      restartsSemResultadoRef.current += 1;
    } else {
      restartsSemResultadoRef.current = 0;
    }
    teveResultadoNestaSessaoRef.current = false;

    if (restartsSemResultadoRef.current >= MAX_RESTARTS_SEM_RESULTADO) {
      aindaOuvindoRef.current = false;
      setOuvindo(false);
      onFimEscutaRef.current();
      return;
    }

    limparTimerRestart();
    restartTimerRef.current = setTimeout(() => {
      if (aindaOuvindoRef.current) iniciarEscutaBruta();
    }, DELAY_AUTO_RESTART_MS);
  });

  // cleanup ao desmontar: aborta escuta e cancela timers pendentes
  useEffect(() => {
    return () => {
      aindaOuvindoRef.current = false;
      limparTimerRestart();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // noop
      }
    };
  }, [limparTimerRestart]);

  return { disponivel, ouvindo, iniciar, parar };
}

/**
 * Checagem síncrona e rápida se a voz está PROVAVELMENTE disponível —
 * usada por telas que precisam decidir a UI antes de montar o hook (ex.:
 * HomeScreen ao exibir um card de atalho para a OLLI Voz).
 */
export function vozProvavelmenteDisponivel(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}
