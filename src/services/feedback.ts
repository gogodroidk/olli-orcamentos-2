import { Platform } from 'react-native';
import { supabase, getCurrentUser } from './supabase';
import { APP_VERSION } from '../config';

/**
 * Caixa de feedback + erros (public.feedback). O app INSERE (usuario logado); so o
 * painel /admin LE (via service_role — a RLS nega leitura aos papeis publicos). E a
 * resposta a "onde vou ver os feedbacks/erros": aqui vira linha, o admin mostra.
 *
 * REGRA: nao envie dado sensivel de cliente — so o que o chamador colocar em
 * `contexto`. Best-effort: nunca lanca; a UI trata o retorno.
 *
 * UNICA EXCECAO, deliberada: `enviarDenunciaIA` (tipo 'denuncia'). Ali o texto
 * denunciado E o objeto da revisao — moderar uma resposta sem poder ler a
 * resposta e impossivel, e o canal exigido pela politica de AI-Generated
 * Content do Google Play viraria enfeite. Como uma resposta de IA num app de
 * orcamento carrega nome/endereco/preco de cliente rotineiramente, a excecao
 * so vale com estas duas condicoes, que NAO sao opcionais:
 *   1. o usuario le, ANTES do envio, que aquele trecho vai para revisao, e
 *      pode desistir (components/SinalizarIA.tsx — nao ha caminho que envie
 *      sem essa confirmacao);
 *   2. viaja o MINIMO para moderar: a resposta denunciada + o pedido que a
 *      gerou, truncados. Nada de historico da conversa, cadastro do cliente
 *      ou dado do aparelho alem do que o proprio usuario digitou/falou.
 * Se um dia alguem precisar mandar mais que esse par, a regra acima muda
 * primeiro — o comentario nao pode voltar a descrever um codigo que nao existe.
 *
 * TIPO DO PRODUTO != TIPO DO BANCO. A coluna `tipo` tem CHECK constraint
 * (20260717_feedback_inbox.sql) que so aceita 5 valores, e mexer em constraint de
 * producao e passo humano. Entao o tipo do produto vai SEMPRE em `contexto.origem`
 * (jsonb livre, sem constraint) e a coluna `tipo` recebe o valor aceito mais
 * proximo. Assim um tipo novo nunca fica esperando migration pra parar de falhar
 * calado — o dado entra hoje, e o /admin separa por `contexto->>'origem'`.
 */
export type TipoFeedback = 'feedback' | 'sugestao' | 'bug' | 'elogio' | 'erro' | 'pulso' | 'denuncia';

/** Traducao produto -> banco. Unico lugar que conhece o CHECK constraint. */
const TIPO_NO_BANCO: Record<TipoFeedback, string> = {
  feedback: 'feedback',
  sugestao: 'sugestao',
  bug: 'bug',
  elogio: 'elogio',
  erro: 'erro',
  // Pulso da semana e feedback espontaneo de satisfacao — cabe em 'feedback'.
  pulso: 'feedback',
  // Denuncia de conteudo gerado por IA (Google Play AI-Generated Content policy:
  // exige caminho in-app para sinalizar). Nao existe no CHECK constraint — mapeia
  // pro mais proximo ('bug': algo errado com o conteudo). O tipo real do produto
  // fica em contexto.origem = 'denuncia' e o /admin destaca por ali.
  denuncia: 'bug',
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

/**
 * Teto do pedido que viaja junto da denuncia. O moderador precisa saber o que
 * foi PEDIDO para julgar a resposta ("me xinga" muda tudo) — mas nao precisa da
 * conversa inteira. Curto de proposito: e o gatilho, nao o historico.
 */
const PEDIDO_MAX = 600;

/** Quando nao ha pedido, diga isso — vazio confunde "nao havia" com "nao veio". */
const SEM_PEDIDO = '(sem pedido registrado)';

/**
 * Denuncia de conteudo gerado por IA — o caminho in-app exigido pela politica
 * de AI-Generated Content do Google Play. UNICO ponto do app que manda texto de
 * IA para o servidor sob a excecao documentada no topo deste arquivo, e o unico
 * lugar que aplica o corte do `pedido`: a regra e a poda moram juntas, senao
 * cada tela corta de um jeito e a regra vira decoracao.
 *
 * As tres superficies generativas (chat, diagnostico, voz em modo conversa)
 * chamam por aqui, todas via <SinalizarIA>, que so chega neste ponto DEPOIS do
 * usuario confirmar o aviso. Nunca chame direto de uma tela: o aviso e parte do
 * contrato, nao da UI.
 *
 * Devolve o resultado REAL do insert — quem chama nao pode dizer "recebemos"
 * sem ver 'ok' (o app e de campo; offline e o caso comum, nao a excecao).
 */
export function enviarDenunciaIA(params: {
  /** Tela onde o conteudo foi renderizado — diz ao /admin qual superficie revisar. */
  tela: string;
  /** O texto gerado que o usuario esta denunciando. */
  resposta: string;
  /** O pedido do usuario que gerou aquela resposta (fala, pergunta ou sintoma). */
  pedido: string;
}): Promise<'ok' | 'sem_sessao' | 'erro'> {
  const pedido = (params.pedido || '').trim().slice(0, PEDIDO_MAX);
  return enviarFeedback('denuncia', params.resposta, {
    tela: params.tela,
    pedido: pedido || SEM_PEDIDO,
  });
}
