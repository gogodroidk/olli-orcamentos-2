/**
 * PREFERÊNCIA DO RESUMO DIÁRIO POR E-MAIL — leitura e textos do botão
 * "Receber resumo diário por e-mail", iguais no app (mobile e desktop) e no painel
 * (alias `@resumo-email`).
 *
 * Módulo PURO (zero import): quem chama a RPC é a tela (`meu_resumo_dinheiro_email`
 * e `definir_resumo_dinheiro_email`, migration 20260930120000); aqui só se valida a
 * resposta e se decide o que a linha diz. Resposta fora do formato = `null` = ERRO
 * na tela — nunca "desligado" (não sei ≠ não tem).
 *
 * A decisão de consentimento (opt-out para quem já trabalha no OLLI, com freios)
 * está explicada na migration. O texto aqui não promete número que mora em outro
 * lugar (o teto semanal é configuração do Worker): diz a janela, o "só quando há o
 * que fazer" e o domingo mudo, que são regra fixa.
 */

export type BloqueioResumoEmail = 'descadastro' | 'hard_bounce' | 'complaint';

export interface EstadoResumoEmail {
  /** O resumo sai de fato para esta conta (preferência + supressões). */
  ativo: boolean;
  /** Ninguém escolheu ainda: vale o padrão (ligado, salvo descadastro de lembretes). */
  padrao: boolean;
  bloqueio: BloqueioResumoEmail | null;
  /** Só o dono da conta/empresa recebe o resumo. */
  elegivel: boolean;
}

export type OrigemPreferenciaResumo = 'app' | 'painel';

const BLOQUEIOS = new Set<string>(['descadastro', 'hard_bounce', 'complaint']);

/** Valida a resposta das RPCs. `null` = formato inesperado (a tela mostra erro). */
export function interpretarEstadoResumoEmail(dado: unknown): EstadoResumoEmail | null {
  if (dado === null || typeof dado !== 'object' || Array.isArray(dado)) return null;
  const d = dado as Record<string, unknown>;
  if (typeof d.ativo !== 'boolean' || typeof d.padrao !== 'boolean' || typeof d.elegivel !== 'boolean') return null;
  if (d.bloqueio !== null && !(typeof d.bloqueio === 'string' && BLOQUEIOS.has(d.bloqueio))) return null;
  return {
    ativo: d.ativo,
    padrao: d.padrao,
    bloqueio: (d.bloqueio as BloqueioResumoEmail | null) ?? null,
    elegivel: d.elegivel,
  };
}

export const ROTULO_RESUMO_EMAIL = 'Receber resumo diário por e-mail';

export interface LinhaResumoEmail {
  rotulo: string;
  descricao: string;
  /** Valor do interruptor. */
  ligado: boolean;
  /** Se o interruptor pode ser mexido (bounce/reclamação e membro de equipe: não). */
  podeAlternar: boolean;
}

const QUANDO = 'Entre 7h e 8h, só nos dias em que há dinheiro a receber, proposta parada ou cliente sumido. Nunca aos domingos.';

/** O que a linha diz para cada estado (com valor confirmado). */
export function linhaResumoEmail(estado: EstadoResumoEmail): LinhaResumoEmail {
  if (!estado.elegivel) {
    return {
      rotulo: ROTULO_RESUMO_EMAIL,
      descricao: 'O resumo vai para quem é dono da conta da empresa.',
      ligado: false,
      podeAlternar: false,
    };
  }
  if (estado.bloqueio === 'hard_bounce' || estado.bloqueio === 'complaint') {
    return {
      rotulo: ROTULO_RESUMO_EMAIL,
      descricao: 'Pausado: seu e-mail recusou nossas mensagens. Fale com o suporte para voltar a receber.',
      ligado: false,
      podeAlternar: false,
    };
  }
  if (!estado.ativo && estado.bloqueio === 'descadastro') {
    return {
      rotulo: ROTULO_RESUMO_EMAIL,
      descricao: `Você pediu para parar de receber lembretes por e-mail. Ligue aqui para receber só o resumo. ${QUANDO}`,
      ligado: false,
      podeAlternar: true,
    };
  }
  return {
    rotulo: ROTULO_RESUMO_EMAIL,
    descricao: estado.ativo ? QUANDO : `Desligado. ${QUANDO}`,
    ligado: estado.ativo,
    podeAlternar: true,
  };
}
