import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

/**
 * Abstração única de reconhecimento de fala (web + nativo).
 *
 * A lib `expo-speech-recognition` já resolve automaticamente para uma
 * implementação web (`.web.js`, baseada em webkitSpeechRecognition/
 * SpeechRecognition do navegador) quando o bundle é o de web — por isso o
 * MESMO `ExpoSpeechRecognitionModule` e o MESMO `useSpeechRecognitionEvent`
 * funcionam nas duas plataformas, sem precisar de `require` condicional nem
 * de branch de import. Só o COMPORTAMENTO (auto-restart, textos de erro,
 * checagem de serviço instalado) precisa diferenciar plataforma — e isso é
 * feito com `Platform.OS`, nunca com hooks condicionais.
 *
 * REQUISITO DE DISPOSITIVO (Android): o reconhecimento de fala nativo
 * depende de um serviço de reconhecimento de voz instalado e HABILITADO no
 * aparelho — normalmente o pacote "Reconhecimento e Síntese de Fala do
 * Google" (com.google.android.tts, Android 13+) ou o app Google
 * (com.google.android.googlequicksearchbox, Android ≤12). Em aparelhos sem
 * Google Play Services (ex.: alguns Android chineses, ROMs customizadas) ou
 * com esse serviço desabilitado, `isRecognitionAvailable()` retorna false —
 * e é isso que dispara o card de "faltando" com o botão de ação abaixo, em
 * vez de deixar o usuário tocar num microfone que nunca vai responder.
 */

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

/** Máximo de reinícios automáticos seguidos sem nenhum resultado de fala. */
const MAX_RESTARTS_SEM_RESULTADO = 3;
/** Espera antes de reiniciar a escuta após o motor encerrar sozinho. */
const DELAY_AUTO_RESTART_MS = 250;

export interface UseReconhecimentoVozOpts {
  onParcial: (texto: string) => void;
  onFinal: (texto: string) => void;
  /**
   * `sugerirNuvem: true` quando o erro é de um tipo que indica que o
   * reconhecimento de voz NO APARELHO não vai funcionar de jeito nenhum
   * (serviço ausente/recusado, idioma não suportado, sem microfone) — quem
   * chama pode usar isso para oferecer a transcrição na nuvem em vez de
   * insistir no motor local.
   */
  onErro: (mensagemAmigavel: string, opts?: { permissaoNegadaPermanente?: boolean; sugerirNuvem?: boolean }) => void;
  onFimEscuta: () => void;
}

export interface UseReconhecimentoVozResultado {
  /** true = motor de fala existe na plataforma (checagem rápida e síncrona). */
  disponivel: boolean;
  /** false só depois de terminarmos a checagem real de disponibilidade (evita "piscar" a UI). */
  checandoDisponibilidade: boolean;
  /** Motivo amigável quando `disponivel` é false, para exibir no card de "faltando". */
  motivoIndisponivel: string | null;
  ouvindo: boolean;
  iniciar: () => Promise<void>;
  parar: () => void;
  /** Abre as configurações do app/sistema (usado após negação permanente de permissão). */
  abrirConfiguracoes: () => void;
}

/**
 * Exportado para `vozNuvem.ts` reaproveitar o mesmo texto de negação de
 * permissão de microfone (fluxo de gravação na nuvem via `expo-audio`, sem
 * nenhuma dependência do serviço de reconhecimento de voz do Google).
 */
export function mensagemPermissaoNegada(permanente: boolean): string {
  if (isWeb) {
    return 'Preciso da permissão do microfone para te ouvir. Libere nas configurações do navegador — ou escreva o que precisa abaixo.';
  }
  return permanente
    ? 'Você negou o microfone e o Android não vai perguntar de novo. Toque em "Abrir configurações" e libere o Microfone para o OLLI — ou escreva abaixo.'
    : 'Preciso da permissão do microfone para te ouvir. Toque no microfone de novo e permita — ou escreva o que precisa abaixo.';
}

function mapearErro(code: ExpoSpeechRecognitionErrorCode | string): { msg: string; permanente?: boolean; sugerirNuvem?: boolean } | null {
  // 'no-speech' (silêncio) e 'aborted' (usuário/app cancelou de propósito)
  // não são fatais — quem decide o que fazer é o controle de auto-restart
  // ou o próprio fluxo de parar(), não uma mensagem de erro para o usuário.
  if (code === 'no-speech' || code === 'aborted') return null;
  if (code === 'not-allowed') return { msg: mensagemPermissaoNegada(false) };
  if (code === 'service-not-allowed') {
    return {
      msg: isAndroid
        ? 'O serviço de reconhecimento de voz do aparelho recusou o pedido. Confira se o "Reconhecimento e Síntese de Fala do Google" está instalado e habilitado, ou escreva abaixo.'
        : 'O reconhecimento de fala está desabilitado neste aparelho. Ative Siri e Ditado em Ajustes, ou escreva abaixo.',
      sugerirNuvem: true,
    };
  }
  if (code === 'network') return { msg: 'A transcrição precisa de internet. Confira a conexão ou escreva abaixo.' };
  if (code === 'audio-capture') return { msg: 'Não encontrei um microfone neste aparelho. Use o campo de texto abaixo.', sugerirNuvem: true };
  if (code === 'language-not-supported') return { msg: 'O português não está disponível no reconhecimento de voz deste aparelho. Use o campo de texto abaixo.', sugerirNuvem: true };
  if (code === 'busy') return { msg: 'O microfone está ocupado com outro app agora. Feche o outro app e tente de novo, ou escreva abaixo.' };
  if (code === 'interrupted') return { msg: 'A escuta foi interrompida (chamada, alarme ou outro app). Toque no microfone para tentar de novo.' };
  if (code === 'speech-timeout') return null; // Android: equivalente a silêncio — tratado pelo auto-restart.
  return { msg: 'Tive um problema com o microfone. Você pode escrever abaixo.' };
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
  const [checandoDisponibilidade, setChecandoDisponibilidade] = useState(true);
  const [motivoIndisponivel, setMotivoIndisponivel] = useState<string | null>(null);
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

  // Checagem REAL de disponibilidade: `isRecognitionAvailable()` chama
  // `SpeechRecognizer.isRecognitionAvailable()` do próprio Android — é a
  // fonte de verdade do sistema operacional sobre existir (ou não) um
  // serviço de reconhecimento de voz resolvível, e NÃO sofre o filtro de
  // visibilidade de pacotes do manifest (diferente de
  // `getSpeechRecognitionServices()`, que usa `queryIntentServices` e só
  // enxerga os pacotes listados em `androidSpeechServicePackages` do
  // app.json — por isso ela entra aqui só como dado extra de diagnóstico,
  // nunca decidindo `disponivel` sozinha, senão criaríamos falso negativo
  // em aparelhos com serviço de voz que não bate com nossa lista).
  //
  // É esta checagem que resolve o cenário do dono reportando "não funciona
  // no aparelho": quando o Android confirma que NENHUM serviço de fala
  // está instalado/habilitado, mostramos o motivo exato (com ação) em vez
  // de deixar o usuário tocar num microfone que nunca vai responder.
  useEffect(() => {
    let cancelado = false;
    setChecandoDisponibilidade(true);

    async function checar() {
      let ok = false;
      try {
        ok = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      } catch {
        ok = false;
      }

      if (cancelado) return;

      if (!ok) {
        setMotivoIndisponivel(
          isWeb
            ? 'Este navegador não tem reconhecimento de voz disponível.'
            : isAndroid
            ? 'Não encontrei um serviço de reconhecimento de voz neste aparelho. Instale ou habilite o app "Reconhecimento e Síntese de Fala do Google" (com.google.android.tts) na Play Store.'
            : 'O reconhecimento de fala está desligado neste aparelho. Ative Siri e Ditado em Ajustes > Geral > Teclado.'
        );
      } else {
        setMotivoIndisponivel(null);
      }
      setDisponivel(ok);
      setChecandoDisponibilidade(false);
    }

    checar();
    return () => {
      cancelado = true;
    };
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

  const abrirConfiguracoes = useCallback(() => {
    // openSettings() retorna uma Promise — precisa de .catch(), um
    // try/catch síncrono não pegaria uma rejeição.
    Linking.openSettings().catch(() => {
      // noop — dispositivo sem suporte a deep link de configurações
    });
  }, []);

  const iniciar = useCallback(async () => {
    limparTimerRestart();
    restartsSemResultadoRef.current = 0;
    teveResultadoNestaSessaoRef.current = false;

    try {
      // Sempre pedimos o status ATUAL antes de decidir: getPermissionsAsync
      // é chamado ANTES de qualquer requestPermissionsAsync ou start().
      let permissao = await ExpoSpeechRecognitionModule.getPermissionsAsync();

      if (!permissao.granted) {
        if (!permissao.canAskAgain) {
          // Negação permanente: o sistema não vai mostrar o diálogo de novo
          // (comportamento do Android/iOS). Só resta abrir as configurações.
          onErroRef.current(mensagemPermissaoNegada(true), { permissaoNegadaPermanente: true });
          return;
        }

        permissao = await ExpoSpeechRecognitionModule.requestPermissionsAsync();

        if (!permissao.granted) {
          onErroRef.current(mensagemPermissaoNegada(!permissao.canAskAgain), {
            permissaoNegadaPermanente: !permissao.canAskAgain,
          });
          return;
        }
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
    const mapeado = mapearErro(event.error);
    if (mapeado == null) return; // no-speech / aborted / speech-timeout: silencioso
    aindaOuvindoRef.current = false;
    limparTimerRestart();
    setOuvindo(false);
    onErroRef.current(mapeado.msg, { permissaoNegadaPermanente: mapeado.permanente, sugerirNuvem: mapeado.sugerirNuvem });
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

  return { disponivel, checandoDisponibilidade, motivoIndisponivel, ouvindo, iniciar, parar, abrirConfiguracoes };
}

/**
 * Checagem síncrona e rápida se a voz está PROVAVELMENTE disponível —
 * usada por telas que precisam decidir a UI antes de montar o hook (ex.:
 * HomeScreen ao exibir um card de atalho para a OLLI Voz).
 *
 * É só uma prévia otimista: a checagem completa (que também confere se há
 * um serviço de reconhecimento instalado no Android) acontece dentro de
 * `useReconhecimentoVoz`, já na tela de voz.
 */
export function vozProvavelmenteDisponivel(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}
