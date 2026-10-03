/**
 * LEMBRETE DE ASSINATURA × REGRA DAS LOJAS — a versão do lembrete que cada
 * plataforma pode MOSTRAR.
 *
 * A regra de "que lembrete esta conta vê" continua única em `lembreteAssinatura.ts`
 * (pura, compartilhada com o painel). Este módulo só decide o que dela pode ir
 * para a tela quando o app roda dentro de uma loja:
 *
 *  - iOS (Guideline 3.1.1) e Android da Google Play: NÃO pode haver botão nem
 *    texto que mande pagar por fora da loja (preço da web, Pix, "renove",
 *    "assine"). Mesma decisão de `COMPRA_NO_APP` / `BUILD_PLAY_SEM_COMPRA_EXTERNA`
 *    na PlanosScreen. O que é INFORMAÇÃO (data de vencimento, fim do teste) fica;
 *    o teste grátis do Pro fica também — não envolve pagamento nenhum.
 *  - Android, quem assina PELA GOOGLE PLAY: o único caminho de cobrança que o
 *    lembrete pode oferecer é "Gerenciar na Google Play" (a central de assinaturas
 *    da própria loja) — NUNCA Pix.
 *  - Web: tudo aparece como a regra escreveu.
 *
 * Fail-closed: qualquer plataforma que não seja explicitamente a web é tratada
 * como loja. Módulo PURO (só `import type`) para o teste
 * `scripts/teste-lembrete-assinatura-loja.ts` rodar sem subir tela.
 */
import type { AcaoLembrete, Lembrete, TipoLembrete, UrgenciaLembrete } from './lembreteAssinatura';

/**
 * Ações que a faixa pode executar: as da regra + 'gerenciar_play', que só a
 * adaptação à loja cria (Android, assinante da Google Play).
 */
export type AcaoLembreteExibivel = AcaoLembrete | 'gerenciar_play';

/** O que a faixa desenha. CTAs podem sumir (loja), por isso ambos são opcionais. */
export interface LembreteExibivel {
  id: string;
  tipo: TipoLembrete;
  urgencia: UrgenciaLembrete;
  titulo: string;
  texto: string;
  cta: { rotulo: string; acao: AcaoLembreteExibivel } | null;
  ctaSecundario: { rotulo: string; acao: AcaoLembreteExibivel } | null;
  dispensavelPorHoras: number | null;
}

/** Contexto da conta que a regra pura não carrega. */
export interface ContextoLembreteLoja {
  /** A assinatura vigente é da Google Play (`ResumoAssinatura.renovaPelaPlay`). */
  renovaPelaPlay?: boolean;
}

/** Tipos de lembrete sobre um plano PAGO que vence/venceu (onde gerenciar faz sentido). */
const TIPOS_DE_PLANO_PAGO: ReadonlySet<TipoLembrete> = new Set<TipoLembrete>(['renovar_pix', 'plano_vencido']);

const CTA_GERENCIAR_PLAY = { rotulo: 'Gerenciar na Google Play', acao: 'gerenciar_play' as const };

/** Ações que levam a contratar/pagar — proibidas dentro das lojas. */
const ACOES_DE_COMPRA: ReadonlySet<AcaoLembrete> = new Set<AcaoLembrete>(['planos', 'renovar_pix']);

/** Só a web contrata. iOS, Android e o que mais aparecer: loja (fail-closed). */
export function plataformaPodeVender(plataforma: string): boolean {
  return plataforma === 'web';
}

/**
 * Texto neutro, por tipo, para as lojas: informa o fato, não ensina a pagar.
 * `null` = nesta plataforma o lembrete não tem o que dizer sem vender — some.
 */
function textoNeutro(tipo: TipoLembrete): string | null {
  switch (tipo) {
    case 'renovar_pix':
      return 'Depois dessa data sua conta volta ao Grátis — seus dados continuam salvos.';
    case 'plano_vencido':
      return 'Você voltou ao Grátis — seus dados continuam salvos.';
    case 'trial_acabando':
      return 'Depois disso sua conta volta ao Grátis — seus dados continuam salvos.';
    case 'trial_disponivel':
      // A regra lista o que o Pro dá — e um dos itens é "link com pagamento por
      // Pix" (o cliente pagando o PRESTADOR). Correto, mas nas lojas qualquer
      // menção a pagamento num aviso de plano é risco de revisão: texto neutro.
      return 'Sem cartão e sem cobrança automática. Depois, a conta volta ao Grátis — seus dados continuam salvos.';
    case 'assinar':
      // Lembrete leve cujo único propósito é "assine": sem botão e sem preço,
      // vira faixa sem ação ocupando o topo da Home. Não aparece nas lojas.
      return null;
  }
}

/**
 * Adapta o lembrete da regra à plataforma. `null` = não mostrar nada.
 * Na web devolve o lembrete intacto.
 */
export function lembreteParaPlataforma(
  l: Lembrete,
  plataforma: string,
  contexto: ContextoLembreteLoja = {},
): LembreteExibivel | null {
  if (plataformaPodeVender(plataforma)) {
    return { ...l };
  }

  if (l.tipo === 'assinar') return null;

  const permitido = (c: Lembrete['cta'] | null) => (c && !ACOES_DE_COMPRA.has(c.acao) ? c : null);
  const ctas: { rotulo: string; acao: AcaoLembreteExibivel }[] = [permitido(l.cta), permitido(l.ctaSecundario)].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  // Android + assinatura da Google Play: o caminho é a central da própria loja.
  if (plataforma === 'android' && contexto.renovaPelaPlay === true && TIPOS_DE_PLANO_PAGO.has(l.tipo)) {
    ctas.unshift(CTA_GERENCIAR_PLAY);
  }

  return {
    id: l.id,
    tipo: l.tipo,
    urgencia: l.urgencia,
    titulo: l.titulo,
    texto: textoNeutro(l.tipo) ?? l.texto,
    // O teste grátis, quando era o secundário, sobe para primário.
    cta: ctas[0] ?? null,
    ctaSecundario: ctas[1] ?? null,
    dispensavelPorHoras: l.dispensavelPorHoras,
  };
}
