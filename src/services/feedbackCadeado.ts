/**
 * Popup de feedback do cadeado — camada com React Native (armazenamento, gatilho, envio).
 * A regra (quando mostrar) é PURA: `feedbackCadeadoRegra.ts`. A copy: `feedbackCadeadoCopy.ts`.
 *
 * Envio pelo canal que já existe (`public.feedback`, RLS: só o dono insere; só o /admin lê): tipo
 * `motivo_cadeado`, com recurso, opção e plano em `contexto`. Não há migration. Best-effort: nunca lança.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { iphoneSoInforma } from './cadeadoRecurso';
import { enviarFeedback } from './feedback';
import { track, Eventos } from './analytics';
import { FEEDBACK_CADEADO_KEY } from './storageKeys';
import { lerEstadoFeedbackCadeado, type EstadoFeedbackCadeado } from './feedbackCadeadoRegra';
import type { OpcaoMotivo } from './feedbackCadeadoCopy';
import type { Recurso } from './entitlements';

export async function lerEstadoFeedback(): Promise<EstadoFeedbackCadeado> {
  try {
    return lerEstadoFeedbackCadeado(await AsyncStorage.getItem(FEEDBACK_CADEADO_KEY));
  } catch {
    return {};
  }
}

export async function gravarEstadoFeedback(e: EstadoFeedbackCadeado): Promise<void> {
  try {
    await AsyncStorage.setItem(FEEDBACK_CADEADO_KEY, JSON.stringify(e));
  } catch { /* sem armazenamento: o próximo popup só decide de novo; a regra ainda protege com o estado em memória do host */ }
}

type Ouvinte = (recurso: Recurso) => void;
const ouvintes = new Set<Ouvinte>();

/** Chamado pela tela "Disponível no Pro" quando ela fecha SEM a pessoa assinar. */
export function marcarCadeadoFechado(recurso: Recurso): void {
  for (const o of ouvintes) o(recurso);
}

export function aoCadeadoFechado(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

/**
 * Fim da vida de uma tela de cadeado: se o recurso ainda está `bloqueado` (a pessoa não assinou), registra o evento
 * e chama o popup. Fica aqui para a tela do cadeado e o `TelaRecursoPlano` usarem a MESMA lógica.
 */
export function fechouCadeadoSemAssinar(recurso: Recurso, estado: string): void {
  if (estado !== 'bloqueado') return;
  // iPhone: não há o que assinar ali (sem venda pela Apple); a pergunta "o que faltou para assinar" não se aplica.
  if (iphoneSoInforma(Platform.OS)) return;
  track(Eventos.gateFechadoSemAssinar, { recurso });
  marcarCadeadoFechado(recurso);
}

export function enviarMotivoCadeado(p: { recurso: Recurso; opcao: OpcaoMotivo; texto: string; plano: string }): Promise<'ok' | 'sem_sessao' | 'erro'> {
  return enviarFeedback('motivo_cadeado', p.texto.trim(), { tela: 'cadeado', recurso: p.recurso, opcao: p.opcao, plano: p.plano });
}
