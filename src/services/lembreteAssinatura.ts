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
 * disso só espanta. Quanto mais perto do vencimento, mais forte o aviso e menos
 * tempo ele fica dispensado; no vencimento, não some.
 *
 * O limite do Grátis (5 envios/mês desde 07/11/2026) é avisado em outro lugar
 * (ver `limitesComerciais.ts` e `planosBase.ts`), não neste lembrete. O que o Pro vende
 * agora vem da tabela única `planosBase.ts` (`frasePro`), nunca escrito aqui.
 */
import { frasePro } from './planosBase.ts';

export type TipoLembrete =
  | 'renovar_pix'
  | 'plano_vencido'
  | 'trial_acabando'
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
    /** Orçamentos enviados neste mês (informativo: o Grátis não tem teto). */
    enviosUsados: number;
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

/**
 * Dias de CALENDÁRIO (Brasília, UTC−3 fixo) entre hoje e o vencimento. `diasAte` arredonda
 * pra cima e dizia "vence amanhã" na manhã do próprio dia do vencimento; o aviso de
 * renovação usa este, que fala "hoje" no dia certo. O portão (<= 5) continua em `diasAte`.
 */
function diasCalendarioBrasilia(iso: string, agora: Date): number {
  const dia = (ms: number) => Math.floor((ms - 3 * 60 * 60 * 1000) / DIA_MS);
  return dia(Date.parse(iso)) - dia(agora.getTime());
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
      const diasCal = diasCalendarioBrasilia(assinatura.proximaCobranca as string, agora);
      return {
        id: `renovar_pix:${assinatura.proximaCobranca}`,
        tipo: 'renovar_pix',
        urgencia: diasCal <= 1 ? 'critico' : diasCal <= 3 ? 'atencao' : 'info',
        titulo: `Seu ${nome} vence ${quando(diasCal)}`,
        texto: 'O Pix não renova sozinho. Renove agora para não perder o acesso — os dias que faltam não se perdem.',
        cta: { rotulo: 'Renovar com Pix', acao: 'renovar_pix' },
        ctaSecundario: null,
        dispensavelPorHoras: diasCal > 2 ? 24 : null,
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
        texto: `Assine por ${e.precoProMensal}/mês — dá para pagar com Pix — e mantenha o Pro: ${frasePro()}.`,
        cta: { rotulo: 'Assinar o Pro', acao: 'planos' },
        ctaSecundario: null,
        dispensavelPorHoras: dias <= 1 ? null : 24,
      };
    }
    return null;
  }

  if (oferta.planoEfetivo !== 'gratis') return null;

  const mes = mesDe(agora);
  const usados = oferta.enviosUsados;
  const podeTestar = oferta.trialEstado === 'eligible' || oferta.trialEstado === 'unstarted';
  const ofertaTeste = podeTestar
    ? { rotulo: `Testar o Pro ${oferta.trialDias} dias grátis`, acao: 'iniciar_trial' as const }
    : null;

  // Conta que ainda não enviou nenhum orçamento: sem cobrança (ver topo).
  if (usados < 1) return null;

  // 4) Já usa o produto e pode testar o Pro de graça.
  if (ofertaTeste) {
    return {
      id: `trial_disponivel:${mes}`,
      tipo: 'trial_disponivel',
      urgencia: 'info',
      titulo: `Teste o Pro por ${oferta.trialDias} dias, de graça`,
      texto: `Sem cartão e sem cobrança automática: ${frasePro()}.`,
      cta: ofertaTeste,
      ctaSecundario: { rotulo: 'Ver planos', acao: 'planos' },
      dispensavelPorHoras: 72,
    };
  }

  // 5) Usa o Grátis (sem limite) e já testou: lembrete leve do que o Pro acrescenta.
  return {
    id: `assinar:${mes}`,
    tipo: 'assinar',
    urgencia: 'info',
    titulo: usados === 1 ? 'Você enviou 1 orçamento este mês' : `Você enviou ${usados} orçamentos este mês`,
    texto: `No Pro (${e.precoProMensal}/mês, dá para pagar com Pix): ${frasePro()}.`,
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
