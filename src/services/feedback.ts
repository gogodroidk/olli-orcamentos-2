import { Platform } from 'react-native';
import { supabase, getCurrentUser } from './supabase';
import { APP_VERSION } from '../config';

/**
 * Caixa de feedback + erros (public.feedback). O app INSERE (usuario logado); so o
 * painel /admin LE (via service_role — a RLS nega leitura aos papeis publicos). E a
 * resposta a "onde vou ver os feedbacks/erros": aqui vira linha, o admin mostra.
 *
 * NUNCA envie dado sensivel de cliente — so o que o chamador colocar em `contexto`.
 * Best-effort: nunca lanca; a UI trata o retorno.
 *
 * TIPO DO PRODUTO != TIPO DO BANCO. A coluna `tipo` tem CHECK constraint
 * (20260717_feedback_inbox.sql) que so aceita 5 valores, e mexer em constraint de
 * producao e passo humano. Entao o tipo do produto vai SEMPRE em `contexto.origem`
 * (jsonb livre, sem constraint) e a coluna `tipo` recebe o valor aceito mais
 * proximo. Assim um tipo novo nunca fica esperando migration pra parar de falhar
 * calado — o dado entra hoje, e o /admin separa por `contexto->>'origem'`.
 */
export type TipoFeedback = 'feedback' | 'sugestao' | 'bug' | 'elogio' | 'erro' | 'pulso';

/** Traducao produto -> banco. Unico lugar que conhece o CHECK constraint. */
const TIPO_NO_BANCO: Record<TipoFeedback, string> = {
  feedback: 'feedback',
  sugestao: 'sugestao',
  bug: 'bug',
  elogio: 'elogio',
  erro: 'erro',
  // Pulso da semana e feedback espontaneo de satisfacao — cabe em 'feedback'.
  pulso: 'feedback',
};

export interface ContextoFeedback {
  tela?: string;
  plano?: string;
  [k: string]: unknown;
}

export async function enviarFeedback(
  tipo: TipoFeedback,
  mensagem: string,
  contexto: ContextoFeedback = {},
): Promise<'ok' | 'sem_sessao' | 'erro'> {
  try {
    if (!supabase) return 'sem_sessao';
    const user = await getCurrentUser();
    if (!user) return 'sem_sessao';
    const linha = {
      user_id: user.id, // bate com o `with check (user_id = auth.uid())` da RLS
      tipo: TIPO_NO_BANCO[tipo] || 'feedback',
      mensagem: (mensagem || '').slice(0, 4000),
      // `origem` vem DEPOIS do spread: e o tipo real do produto e o chamador nao
      // pode sobrescrever, senao a leitura do /admin deixa de ser confiavel.
      contexto: { versao: APP_VERSION, plataforma: Platform.OS, ...contexto, origem: tipo },
    };
    const { error } = await supabase.from('feedback').insert(linha);
    return error ? 'erro' : 'ok';
  } catch {
    return 'erro';
  }
}
