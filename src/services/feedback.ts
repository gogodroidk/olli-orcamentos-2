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
 */
export type TipoFeedback = 'feedback' | 'sugestao' | 'bug' | 'elogio' | 'erro';

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
      tipo,
      mensagem: (mensagem || '').slice(0, 4000),
      contexto: { versao: APP_VERSION, plataforma: Platform.OS, ...contexto },
    };
    const { error } = await supabase.from('feedback').insert(linha);
    return error ? 'erro' : 'ok';
  } catch {
    return 'erro';
  }
}
