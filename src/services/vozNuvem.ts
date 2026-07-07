import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { DIAGNOSTICO_URL } from '../config';
import { supabase } from './supabase';
import { mensagemPermissaoNegada } from './reconhecimentoVoz';
import type { VozResultadoOk, VozItem } from './olliAssistente';

/**
 * Gravação de voz "à prova de aparelho": em vez de depender do serviço de
 * reconhecimento de fala nativo do Android (que pode estar ausente/desligado
 * em ROMs sem Google Play Services — ver `reconhecimentoVoz.ts`), grava o
 * ÁUDIO direto com `expo-audio` (só precisa da permissão RECORD_AUDIO, sem
 * nenhum serviço externo do Google) e manda para o Worker transcrever/montar
 * o orçamento com o Gemini. Funciona em QUALQUER Android com microfone.
 *
 * Consome a rota `POST /transcrever` do Worker (frente F1 da mesma planta).
 */

/** Limite de gravação: corta sozinho em 2 minutos para não gerar áudio gigante. */
const LIMITE_SEGUNDOS = 120;
/** Espelha MAX_AUDIO_BODY_BYTES do worker (4 MiB) — checamos ANTES de gastar upload. */
const LIMITE_BASE64_CHARS = 4_000_000;
/** A rota /transcrever é mais pesada (upload de áudio + Gemini) que /voz. */
const TIMEOUT_TRANSCREVER_MS = 60_000;

const SEM_IA =
  'A OLLI por voz ainda não está ligada aqui. Você pode escrever os itens normalmente que eu monto o orçamento pra você.';
const FALHOU =
  'Não consegui falar com a OLLI agora. Confira a internet e tente de novo — ou crie o orçamento na mão.';
const TIMEOUT_MSG =
  'A OLLI demorou demais para responder (conexão lenta). Tente de novo ou crie o orçamento na mão.';
const OFFLINE =
  'Sem conexão com a internet agora. Confira o Wi-Fi/dados e tente de novo.';
const SOBRECARGA =
  'A OLLI está muito requisitada agora. Tente de novo em alguns segundos.';
const ERRO_SERVIDOR =
  'A OLLI teve um problema para responder agora. Tente de novo em instantes.';
const PRECISA_LOGIN =
  'Sua sessão expirou. Toque em Conta e entre de novo para usar a OLLI.';
const MUITAS_REQUISICOES =
  'Você usou a OLLI demais agora, aguarde um minutinho.';
const CANCELADO =
  'Envio cancelado. Você pode tentar de novo quando quiser.';
const GRAVACAO_LONGA =
  'Gravação longa demais, fale em trechos menores.';
const SEM_AUDIO =
  'Não consegui capturar o áudio. Tente gravar de novo.';
const ERRO_MICROFONE =
  'Não consegui usar o microfone agora. Tente de novo ou escreva abaixo.';

/** Token de acesso da sessão atual (ou null se deslogado/sem backend). Nunca lança. */
async function accessTokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function mensagemPorStatus(status: number, fallback: string): string {
  if (status === 401) return PRECISA_LOGIN;
  if (status === 429) return MUITAS_REQUISICOES;
  if (status === 503) return SOBRECARGA;
  if (status >= 500) return ERRO_SERVIDOR;
  return fallback;
}

function mensagemErroIA(erro: unknown, fallback: string): string {
  const s = typeof erro === 'string' ? erro : '';
  if (/nao_autorizado|n[ãa]o_autorizado|401/i.test(s)) return PRECISA_LOGIN;
  if (/muitas_requisicoes|429/i.test(s)) return MUITAS_REQUISICOES;
  if (/503|overload|high demand|unavailable|sobrecarreg|exhausted|quota|rate/i.test(s)) {
    return SOBRECARGA;
  }
  if (!s || /[{}]|gemini|anthropic|http|json|token|api/i.test(s)) return fallback;
  return s;
}

function normalizarItem(raw: any): VozItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const descricao = typeof raw.descricao === 'string' ? raw.descricao.trim() : '';
  if (!descricao) return null;
  const qtd = Number(raw.quantidade);
  const valor = raw.valorUnitario;
  return {
    descricao,
    quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
    valorUnitario: typeof valor === 'number' && Number.isFinite(valor) ? valor : null,
    tipo: raw.tipo === 'peca' ? 'peca' : 'servico',
  };
}

export interface CatalogoItem {
  nome: string;
  preco?: number;
}

export interface UseGravadorNuvemOpts {
  modo: 'transcrever' | 'orcamento';
  catalogo?: CatalogoItem[];
  onTexto: (texto: string) => void;
  onOrcamento?: (r: VozResultadoOk) => void;
  onErro: (msg: string, o?: { permissaoNegadaPermanente?: boolean }) => void;
}

export interface UseGravadorNuvemResultado {
  gravando: boolean;
  enviando: boolean;
  segundos: number;
  iniciarGravacao: () => Promise<void>;
  pararEEnviar: () => Promise<void>;
  cancelar: () => void;
  abrirConfiguracoes: () => void;
}

/**
 * Hook de gravação + envio para transcrição/orçamento na nuvem. Pede a
 * permissão de microfone DIRETO pelo `expo-audio` — sem nenhuma dependência
 * do serviço de reconhecimento de voz do Google (que é o que falta em vários
 * aparelhos). O áudio final vira base64 e vai para `POST /transcrever`.
 */
export function useGravadorNuvem(opts: UseGravadorNuvemOpts): UseGravadorNuvemResultado {
  const { modo, catalogo, onTexto, onOrcamento, onErro } = opts;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [gravando, setGravando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segundosRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoStopRef = useRef(false);
  /** true quando o abort veio de `cancelar()` (usuário) — distingue de timeout. */
  const canceladoPeloUsuarioRef = useRef(false);

  const onTextoRef = useRef(onTexto);
  const onOrcamentoRef = useRef(onOrcamento);
  const onErroRef = useRef(onErro);
  onTextoRef.current = onTexto;
  onOrcamentoRef.current = onOrcamento;
  onErroRef.current = onErro;

  const pararTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // cleanup ao desmontar: para o timer e cancela upload pendente
  useEffect(() => {
    return () => {
      pararTimer();
      abortRef.current?.abort();
    };
  }, [pararTimer]);

  const abrirConfiguracoes = useCallback(() => {
    Linking.openSettings().catch(() => {
      // noop — dispositivo sem suporte a deep link de configurações
    });
  }, []);

  const enviarParaTranscricao = useCallback(async () => {
    const uri = recorder.uri;
    if (!uri) {
      onErroRef.current(SEM_AUDIO);
      return;
    }
    if (!DIAGNOSTICO_URL) {
      onErroRef.current(SEM_IA);
      return;
    }

    const token = await accessTokenAtual();
    if (!token) {
      onErroRef.current(PRECISA_LOGIN);
      return;
    }

    setEnviando(true);
    try {
      // require preguiçoso: `expo-file-system/legacy` só é tocado aqui, no
      // caminho 100% nativo — nunca em module-scope (lição Hermes).
      const FileSystem = require('expo-file-system/legacy');
      const audioBase64: string = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!audioBase64) {
        onErroRef.current(SEM_AUDIO);
        return;
      }
      if (audioBase64.length > LIMITE_BASE64_CHARS) {
        onErroRef.current(GRAVACAO_LONGA);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      canceladoPeloUsuarioRef.current = false;
      const timer = setTimeout(() => controller.abort(), TIMEOUT_TRANSCREVER_MS);

      try {
        const body: Record<string, unknown> = {
          audioBase64,
          mimeType: 'audio/mp4',
          modo,
        };
        if (catalogo && catalogo.length > 0) body.catalogo = catalogo;

        const r = await fetch(`${DIAGNOSTICO_URL}/transcrever`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!r.ok) {
          onErroRef.current(mensagemPorStatus(r.status, FALHOU));
          return;
        }

        const data: any = await r.json();
        if (!data?.ok) {
          onErroRef.current(mensagemErroIA(data?.erro, FALHOU));
          return;
        }

        if (modo === 'orcamento') {
          if (!Array.isArray(data.itens)) {
            onErroRef.current(FALHOU);
            return;
          }
          const texto = typeof data.texto === 'string' ? data.texto : '';
          onTextoRef.current(texto);
          onOrcamentoRef.current?.({
            ok: true,
            titulo: typeof data.titulo === 'string' ? data.titulo : undefined,
            clienteNome: typeof data.clienteNome === 'string' ? data.clienteNome : undefined,
            itens: data.itens.map(normalizarItem).filter((i: VozItem | null): i is VozItem => i !== null),
            observacao: typeof data.observacao === 'string' ? data.observacao : undefined,
          });
        } else {
          const texto = typeof data.texto === 'string' ? data.texto.trim() : '';
          if (!texto) {
            onErroRef.current('Não consegui entender o áudio. Tente falar de novo, com calma.');
            return;
          }
          onTextoRef.current(texto);
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          onErroRef.current(canceladoPeloUsuarioRef.current ? CANCELADO : TIMEOUT_MSG);
          return;
        }
        onErroRef.current(OFFLINE);
      } finally {
        clearTimeout(timer);
        abortRef.current = null;
      }
    } catch {
      onErroRef.current(SEM_AUDIO);
    } finally {
      setEnviando(false);
    }
  }, [recorder, modo, catalogo]);

  const iniciarGravacao = useCallback(async () => {
    try {
      let permissao = await getRecordingPermissionsAsync();

      if (!permissao.granted) {
        if (!permissao.canAskAgain) {
          onErroRef.current(mensagemPermissaoNegada(true), { permissaoNegadaPermanente: true });
          return;
        }
        permissao = await requestRecordingPermissionsAsync();
        if (!permissao.granted) {
          onErroRef.current(mensagemPermissaoNegada(!permissao.canAskAgain), {
            permissaoNegadaPermanente: !permissao.canAskAgain,
          });
          return;
        }
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();

      autoStopRef.current = false;
      segundosRef.current = 0;
      setSegundos(0);
      setGravando(true);
      pararTimer();
      // O efeito colateral do auto-stop (stop + envio) fica FORA do updater de
      // setState — o updater deve ser puro (o React pode reexecutá-lo em dev/
      // StrictMode). Contamos os segundos num ref e disparamos o auto-stop aqui.
      timerRef.current = setInterval(() => {
        const next = segundosRef.current + 1;
        segundosRef.current = next;
        setSegundos(next);
        if (next >= LIMITE_SEGUNDOS && !autoStopRef.current) {
          autoStopRef.current = true;
          pararTimer();
          setGravando(false);
          recorder.stop().finally(() => {
            enviarParaTranscricao();
          });
        }
      }, 1000);
    } catch {
      setGravando(false);
      onErroRef.current(ERRO_MICROFONE);
    }
  }, [recorder, pararTimer, enviarParaTranscricao]);

  const pararEEnviar = useCallback(async () => {
    if (autoStopRef.current) return; // já parou sozinho (limite de tempo) e já está enviando
    pararTimer();
    setGravando(false);
    try {
      await recorder.stop();
    } catch {
      // noop — pode já ter parado
    }
    await enviarParaTranscricao();
  }, [recorder, pararTimer, enviarParaTranscricao]);

  const cancelar = useCallback(() => {
    autoStopRef.current = true; // evita o auto-stop do timer também disparar envio
    canceladoPeloUsuarioRef.current = true;
    pararTimer();
    setGravando(false);
    setEnviando(false);
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      recorder.stop().catch(() => {});
    } catch {
      // noop
    }
  }, [recorder, pararTimer]);

  return { gravando, enviando, segundos, iniciarGravacao, pararEEnviar, cancelar, abrirConfiguracoes };
}
