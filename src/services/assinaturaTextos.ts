/**
 * O que a tela de Assinatura MOSTRA para um resumo — regra pura (sem import nativo)
 * para o teste rodar no Node (`scripts/teste-assinatura-honesta.ts`).
 *
 * Por que existe: a tela misturava a ORIGEM do acesso com o status da Stripe. A
 * conta demo (Empresa concedido pelo admin) aparecia como "Empresa" + pílula "Sem
 * assinatura" + "Acesso até —" + "Método: Não informado"; quem pagou no Pix via
 * "Não informado" no método; o teste grátis do Pro nem aparecia. Cada origem tem
 * aqui o seu texto, derivado do que o resumo de fato sabe.
 */

export type OrigemAcesso = 'gratis' | 'pagamento' | 'admin' | 'trial';

/** O pedaço do resumo que a apresentação lê (espelha `ResumoAssinatura`). */
export interface ResumoParaTela {
  planoEfetivo: 'gratis' | 'pro' | 'empresa';
  status?: string;
  origem?: OrigemAcesso;
  /** Fim do acesso efetivo (ISO): período pago, fim do teste ou fim da concessão. */
  validoAte?: string;
  proximaCobranca?: string;
  renovaSozinho?: boolean;
  renovaPelaPlay?: boolean;
  temClienteStripe?: boolean;
}

export type TomPilula = 'sucesso' | 'destaque' | 'aviso' | 'perigo' | 'neutro';

/** Pílula ao lado do nome do plano. */
export function pilulaAssinatura(r: ResumoParaTela): { rotulo: string; tom: TomPilula } {
  if (r.origem === 'admin') return { rotulo: 'Concedido', tom: 'sucesso' };
  if (r.origem === 'trial') return { rotulo: 'Teste grátis', tom: 'destaque' };
  switch (r.status) {
    case 'active': return { rotulo: 'Ativa', tom: 'sucesso' };
    case 'trialing': return { rotulo: 'Em teste', tom: 'destaque' };
    case 'past_due': return { rotulo: 'Pagamento pendente', tom: 'aviso' };
    case 'canceled': return { rotulo: 'Cancelada', tom: 'neutro' };
    case 'unpaid': return { rotulo: 'Não paga', tom: 'perigo' };
    case 'incomplete':
    case 'incomplete_expired': return { rotulo: 'Incompleta', tom: 'aviso' };
    default:
      // Status desconhecido num plano que está valendo: é ativo (a regra do plano
      // efetivo já conferiu status + vigência). Só o Grátis é "Sem assinatura".
      if (r.planoEfetivo !== 'gratis') return { rotulo: 'Ativa', tom: 'sucesso' };
      return { rotulo: r.status ? r.status : 'Sem assinatura', tom: 'neutro' };
  }
}

/**
 * Linha de validade do cartão "Cobrança". `valorIso` vem cru para a tela formatar;
 * `semFim` = concessão sem data de término (não é "—", é "não termina").
 */
export function linhaValidade(r: ResumoParaTela): { rotulo: string; valorIso?: string; semFim?: boolean } {
  if (r.origem === 'admin') {
    return r.validoAte ? { rotulo: 'Acesso concedido até', valorIso: r.validoAte } : { rotulo: 'Acesso concedido', semFim: true };
  }
  if (r.origem === 'trial') return { rotulo: 'Teste grátis até', valorIso: r.validoAte };
  const fim = r.proximaCobranca ?? r.validoAte;
  return { rotulo: r.renovaSozinho === true ? 'Próxima cobrança' : 'Acesso até', valorIso: fim };
}

/** Acesso sem pagamento (concessão ou teste): não há "último pagamento" nem método. */
export function temCobranca(r: ResumoParaTela): boolean {
  return r.origem !== 'admin' && r.origem !== 'trial';
}

/** Método de pagamento exibido. O cartão da Stripe, quando lido, sempre vence. */
export function rotuloMetodo(r: ResumoParaTela, cartao: string | null): string {
  if (cartao) return cartao;
  if (r.renovaPelaPlay === true) return 'Google Play';
  // Pago sem renovação e sem nunca ter passado pela Stripe: só pode ser o Pix do
  // plano. Com cliente na Stripe pode ser o 12x avulso no cartão — aí não chutamos.
  if (r.origem === 'pagamento' && r.renovaSozinho === false && r.temClienteStripe !== true) {
    return 'Pix (renovação manual)';
  }
  return 'Não informado';
}

/** O portal da Stripe só tem o que mostrar para quem já foi cliente da Stripe. */
export function mostraPortalStripe(r: ResumoParaTela): boolean {
  return r.temClienteStripe === true;
}
