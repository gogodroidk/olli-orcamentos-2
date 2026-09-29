/**
 * LEMBRETE DE ASSINATURA — regra única de "que lembrete de pagar esta conta vê agora".
 *
 * Módulo PURO (zero import de rede/storage): o app (src/) e o painel (webapp/, pelo
 * alias `@lembreteAssinatura`) mostram EXATAMENTE a mesma coisa, e o teste
 * `scripts/teste-lembrete-assinatura.ts` confere a regra sem subir tela nenhuma.
 *
 * Por que existe (29/09/2026): 60 contas, 0 pagantes. Ninguém batia no limite do
 * Grátis e nada no produto lembrava de assinar; quem pagar por Pix (não renova
 * sozinho) também precisa ser lembrado antes de vencer. Pedido do dono: "tem que
 * colocar um lembrete para o cliente pagar".
 *
 * Tom: lembrar sempre, humilhar nunca. Conta nova sem nenhum orçamento NÃO vê
 * cobrança — o trabalho dela é chegar ao primeiro orçamento; pedir dinheiro antes
 * disso só espanta. Quanto mais perto do limite/vencimento, mais forte o aviso e
 * menos tempo ele fica dispensado; no limite esgotado e no vencimento, não some.
 */

export type TipoLembrete =
  | 'renovar_pix'
  | 'plano_vencido'
  | 'trial_acabando'
  | 'cota_esgotada'
  | 'cota_quase'
  | 'trial_disponivel'
  | 'assinar';

export type UrgenciaLembrete = 'info' | 'atencao' | 'critico';

/** Para onde o botão leva. A tela traduz em navegação/ação. */
export type AcaoLembrete = 'planos' | 'iniciar_trial' | 'renovar_pix';

export interface Lembrete {
  /** Chave estável para "dispensar": muda quando o motivo muda (mês, vencimento). */
  id: string;
  tipo: TipoLembrete;
  urgencia: UrgenciaLembrete;
  titulo: string;
  texto: string;
  cta: { rotulo: string; acao: AcaoLembrete };
  ctaSecundario: { rotulo: string; acao: AcaoLembrete } | null;
  /** Por quanto tempo "agora não" esconde o aviso. `null` = não dá para dispensar. */
  dispensavelPorHoras: number | null;
}

export interface EntradaLembrete {
  agora: Date;
  /** Estado da oferta (RPC meu_estado_oferta_comercial). null = não confirmado. */
  oferta: {
    planoEfetivo: 'gratis' | 'pro' | 'empresa';
    limiteEnvios: number | null;
    enviosUsados: number;
    enviosRestantes: number | null;
    trialEstado: 'unstarted' | 'eligible' | 'active' | 'ended' | 'converted' | 'revoked';
    trialTerminaEm: string | null;
    trialDias: number;
  } | null;
  /** Linha de assinatura já derivada. null = não confirmado. */
  assinatura: {
    planoEfetivo: 'gratis' | 'pro' | 'empresa';
    planoContratado: 'gratis' | 'pro' | 'empresa';
    origem?: 'gratis' | 'pagamento' | 'admin';
    /** Assinatura recorrente no cartão (cobra sozinha). */
    renovaSozinho?: boolean;
    /** Fim do período pago (ISO). */
    proximaCobranca?: string;
  } | null;
  /** Preço do Pro já formatado ("R$ 39,00"), vindo da fonte de preços de quem chama. */
  precoProMensal: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

const NOME_PLANO = { gratis: 'Grátis', pro: 'Pro', empresa: 'Empresa' } as const;

function diasAte(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - agora.getTime()) / DIA_MS);
}

function quando(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

function mesDe(agora: Date): string {
  return agora.toISOString().slice(0, 7);
}

/**
 * O lembrete que esta conta deve ver agora — ou `null`.
 * Sem dados confirmados (oferta E assinatura nulas) não inventa nada: "não sei"
 * nunca vira cobrança nem vira silêncio disfarçado de "está tudo pago".
 */
export function lembreteAssinatura(e: EntradaLembrete): Lembrete | null {
  const { agora, oferta, assinatura } = e;

  // 1) Pagou sem renovação automática (Pix / 12x): lembrar ANTES de vencer.
  if (
    assinatura &&
    assinatura.origem === 'pagamento' &&
    assinatura.renovaSozinho === false &&
    (assinatura.planoEfetivo === 'pro' || assinatura.planoEfetivo === 'empresa')
  ) {
    const dias = diasAte(assinatura.proximaCobranca, agora);
    if (dias !== null && dias <= 5) {
      const nome = NOME_PLANO[assinatura.planoEfetivo];
      return {
        id: `renovar_pix:${assinatura.proximaCobranca}`,
        tipo: 'renovar_pix',
        urgencia: dias <= 1 ? 'critico' : dias <= 3 ? 'atencao' : 'info',
        titulo: `Seu ${nome} vence ${quando(dias)}`,
        texto: 'O Pix não renova sozinho. Renove agora para não perder o acesso — os dias que faltam não se perdem.',
        cta: { rotulo: 'Renovar com Pix', acao: 'renovar_pix' },
        ctaSecundario: null,
        dispensavelPorHoras: dias > 2 ? 24 : null,
      };
    }
    return null;
  }

  // 2) Venceu há pouco (até 30 dias): chamar de volta.
  if (
    assinatura &&
    assinatura.planoEfetivo === 'gratis' &&
    (assinatura.planoContratado === 'pro' || assinatura.planoContratado === 'empresa')
  ) {
    const dias = diasAte(assinatura.proximaCobranca, agora);
    if (dias !== null && dias <= 0 && dias >= -30) {
      const nome = NOME_PLANO[assinatura.planoContratado];
      return {
        id: `plano_vencido:${assinatura.proximaCobranca}`,
        tipo: 'plano_vencido',
        urgencia: 'critico',
        titulo: `Seu ${nome} venceu`,
        texto: `Você voltou ao Grátis — seus dados continuam salvos. Renove para liberar tudo de novo.`,
        cta: { rotulo: 'Renovar com Pix', acao: 'renovar_pix' },
        ctaSecundario: null,
        dispensavelPorHoras: 72,
      };
    }
  }

  if (!oferta) return null;

  // 3) Teste do Pro acabando.
  if (oferta.trialEstado === 'active') {
    const dias = diasAte(oferta.trialTerminaEm, agora);
    if (dias !== null && dias <= 3) {
      return {
        id: `trial_acabando:${oferta.trialTerminaEm}`,
        tipo: 'trial_acabando',
        urgencia: dias <= 1 ? 'critico' : 'atencao',
        titulo: `Seu teste do Pro acaba ${quando(dias)}`,
        texto: `Assine por ${e.precoProMensal}/mês — dá para pagar com Pix — e continue sem limite e sem a marca OLLI no PDF.`,
        cta: { rotulo: 'Assinar o Pro', acao: 'planos' },
        ctaSecundario: null,
        dispensavelPorHoras: dias <= 1 ? null : 24,
      };
    }
    return null;
  }

  if (oferta.planoEfetivo !== 'gratis' || oferta.limiteEnvios === null) return null;

  const mes = mesDe(agora);
  const usados = oferta.enviosUsados;
  const limite = oferta.limiteEnvios;
  const restantes = oferta.enviosRestantes ?? Math.max(0, limite - usados);
  const podeTestar = oferta.trialEstado === 'eligible' || oferta.trialEstado === 'unstarted';
  const ofertaTeste = podeTestar
    ? { rotulo: `Testar o Pro ${oferta.trialDias} dias grátis`, acao: 'iniciar_trial' as const }
    : null;

  // 4) Limite do mês esgotado: não some.
  if (restantes <= 0) {
    return {
      id: `cota_esgotada:${mes}`,
      tipo: 'cota_esgotada',
      urgencia: 'critico',
      titulo: `Você usou os ${limite} orçamentos grátis deste mês`,
      texto: `Para continuar enviando orçamentos agora, assine o Pro por ${e.precoProMensal}/mês — pode pagar com Pix.`,
      cta: ofertaTeste ?? { rotulo: 'Assinar o Pro', acao: 'planos' },
      ctaSecundario: ofertaTeste ? { rotulo: 'Assinar o Pro', acao: 'planos' } : null,
      dispensavelPorHoras: null,
    };
  }

  // 5) Perto do limite.
  if (restantes <= 2) {
    return {
      id: `cota_quase:${mes}:${restantes}`,
      tipo: 'cota_quase',
      urgencia: 'atencao',
      titulo: restantes === 1 ? 'Falta 1 orçamento grátis este mês' : `Faltam ${restantes} orçamentos grátis este mês`,
      texto: `Você já enviou ${usados} de ${limite}. No Pro (${e.precoProMensal}/mês, com Pix) é sem limite e sem a marca OLLI no PDF.`,
      cta: { rotulo: 'Ver o Pro', acao: 'planos' },
      ctaSecundario: ofertaTeste,
      dispensavelPorHoras: 48,
    };
  }

  // Conta que ainda não enviou nenhum orçamento: sem cobrança (ver topo).
  if (usados < 1) return null;

  // 6) Já usa o produto e pode testar o Pro de graça.
  if (ofertaTeste) {
    return {
      id: `trial_disponivel:${mes}`,
      tipo: 'trial_disponivel',
      urgencia: 'info',
      titulo: `Teste o Pro por ${oferta.trialDias} dias, de graça`,
      texto: 'Sem cartão e sem cobrança automática: orçamentos sem limite, IA sem cota e PDF sem a marca OLLI.',
      cta: ofertaTeste,
      ctaSecundario: { rotulo: 'Ver planos', acao: 'planos' },
      dispensavelPorHoras: 72,
    };
  }

  // 7) Usa o Grátis e já testou: lembrete leve de assinar.
  return {
    id: `assinar:${mes}`,
    tipo: 'assinar',
    urgencia: 'info',
    titulo: `Você enviou ${usados} de ${limite} orçamentos grátis este mês`,
    texto: `Com o Pro (${e.precoProMensal}/mês, dá para pagar com Pix) é sem limite, com IA sem cota e PDF sem a marca OLLI.`,
    cta: { rotulo: 'Assinar o Pro', acao: 'planos' },
    ctaSecundario: null,
    dispensavelPorHoras: 72,
  };
}

/** `true` se o lembrete foi dispensado há menos de `dispensavelPorHoras`. */
export function lembreteDispensado(l: Lembrete, dispensadoEmIso: string | null, agora: Date): boolean {
  if (l.dispensavelPorHoras === null || !dispensadoEmIso) return false;
  const t = Date.parse(dispensadoEmIso);
  if (!Number.isFinite(t)) return false;
  return agora.getTime() - t < l.dispensavelPorHoras * 60 * 60 * 1000;
}

/** Chave de armazenamento local do "agora não" (por conta e por motivo). */
export function chaveDispensaLembrete(userId: string, l: Lembrete): string {
  return `olli.lembrete.${userId}.${l.id}`;
}
