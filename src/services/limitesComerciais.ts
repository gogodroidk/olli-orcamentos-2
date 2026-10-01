import type { PlanoId } from './entitlements';

/**
 * CONTRATO COMERCIAL DO ENVIO DE ORÇAMENTOS — fonte única.
 *
 * ═══ GRÁTIS = ORÇAMENTOS ILIMITADOS (decisão do dono, 01/10/2026) ═══
 *
 * Até 01/10/2026 o Grátis tinha uma cota de 5 orçamentos enviados por mês. O
 * diagnóstico de 29/09 mostrou que ninguém batia nela, e a avaliação mais curtida
 * contra o concorrente era exatamente "só faz 5 orçamento por mês? to fora". A
 * cota saiu. O que o Grátis paga agora é o SELO discreto "Feito com OLLI" no PDF,
 * no recibo e no link (ver `src/utils/marcaOlli.ts`); o Pro tira o selo.
 *
 * ═══ O QUE CONTINUA EXISTINDO (e por quê) ═══
 *
 * A reserva/confirmação do envio (`reservar_envio_orcamento_gratis` e
 * `confirmar_envio_orcamento_gratis`) continua — não como PORTÃO, mas como
 * REGISTRO: é a confirmação do 1º envio que inicia o teste do Pro de 14 dias
 * (migration 20260930120000) e alimenta o funil de receita. Por isso:
 *
 *  - o envio NUNCA é bloqueado por este módulo. Se o registro falhar (rede, RLS,
 *    servidor antigo), o orçamento sai do mesmo jeito e o resultado diz
 *    `motivo: 'sem_registro'` — um estado NOMEADO, não um vazio disfarçado. O que
 *    se perde nesse caso é só o que dependeria do registro: o teste automático não
 *    começa por ESTE envio (falha fechada para conceder, nunca para entregar);
 *  - os nomes de fio (`dentro_da_cota`, `cota_esgotada`) ficam: o APK 1.1.x que
 *    está nas mãos dos clientes rejeita `motivo` desconhecido e bloquearia o
 *    envio. A migration 20261002150000 faz o servidor responder `dentro_da_cota`
 *    para todo envio do Grátis, sem teto.
 */
export const TRIAL_PRO_DIAS = 14;

export type CanalEnvioOrcamento = 'pdf' | 'link' | 'whatsapp';
export type TrialEstado = 'unstarted' | 'eligible' | 'active' | 'ended' | 'converted' | 'revoked';

export interface EstadoOfertaComercial {
  planoEfetivo: PlanoId;
  /** Orçamentos distintos enviados neste mês (informativo — não existe teto). */
  enviosUsados: number;
  trialEstado: TrialEstado;
  trialTerminaEm: string | null;
  trialDias: number;
  requerCartao: false;
  renovaAutomaticamente: false;
  preservaDados: true;
}

export interface InicioTrialPro {
  iniciado: boolean;
  replay: boolean;
  terminaEm: string;
}

export interface ReservaEnvioOrcamento {
  /**
   * Sempre `true` desde 01/10/2026: o Grátis é ilimitado e nenhum envio é barrado
   * por cota. Tipado como `boolean` (e não `true`) só para o ramo de recusa das
   * telas antigas continuar compilando — ver `mensagemBloqueioEnvio`.
   */
  permitido: boolean;
  planoEfetivo: PlanoId;
  /** Orçamentos distintos registrados neste mês (informativo). */
  usados: number;
  contabilizadoAgora: boolean;
  requerConfirmacao: boolean;
  reservaToken: string | null;
  trialElegivel: boolean;
  /**
   * - `dentro_da_cota`: envio do Grátis REGISTRADO (nome de fio mantido pelo APK antigo);
   * - `plano_pago` / `trial_ativo`: plano que não precisa de registro;
   * - `sem_registro`: o registro falhou (rede, servidor, resposta estranha) — o
   *   envio segue, só não conta para o teste automático nem para o funil;
   * - `ambiente_local`: sem Supabase configurado (desenvolvimento);
   * - `cota_esgotada`: LEGADO. Nunca é produzido desde 01/10/2026; continua no tipo
   *   só porque telas mais antigas ainda o comparam (ver VisualizarOrcamentoScreen).
   */
  motivo: 'plano_pago' | 'trial_ativo' | 'dentro_da_cota' | 'sem_registro' | 'ambiente_local' | 'cota_esgotada';
}

function inteiroNaoNegativo(valor: unknown, fallback: number): number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : fallback;
}

/**
 * Lê `meu_estado_oferta_comercial`. Os campos de cota (`limite_envios`,
 * `envios_restantes`) são IGNORADOS de propósito: o servidor antigo ainda os manda
 * com o 5, o novo manda `null`, e nenhum dos dois pode reinventar uma cota no app.
 */
export function interpretarEstadoOferta(valor: unknown): EstadoOfertaComercial | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  const estados = new Set<TrialEstado>(['unstarted', 'eligible', 'active', 'ended', 'converted', 'revoked']);
  if (!estados.has(v.trial_estado as TrialEstado)) return null;
  if (v.requires_card !== false || v.auto_renews !== false || v.data_disposition !== 'preserve') return null;
  if (v.trial_dias !== TRIAL_PRO_DIAS) return null;
  const plano = v.plano_efetivo === 'empresa' ? 'empresa' : v.plano_efetivo === 'pro' ? 'pro' : 'gratis';
  const terminaEm = typeof v.trial_termina_em === 'string' && !Number.isNaN(Date.parse(v.trial_termina_em))
    ? v.trial_termina_em
    : null;
  if (v.trial_estado === 'active' && !terminaEm) return null;
  return {
    planoEfetivo: plano,
    enviosUsados: inteiroNaoNegativo(v.envios_usados, 0),
    trialEstado: v.trial_estado as TrialEstado,
    trialTerminaEm: terminaEm,
    trialDias: TRIAL_PRO_DIAS,
    requerCartao: false,
    renovaAutomaticamente: false,
    preservaDados: true,
  };
}

export function interpretarInicioTrial(valor: unknown): InicioTrialPro | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.iniciado !== 'boolean' || typeof v.replay !== 'boolean') return null;
  if (v.requires_card !== false || v.auto_renews !== false || v.data_disposition !== 'preserve') return null;
  if (v.trial_dias !== TRIAL_PRO_DIAS || typeof v.termina_em !== 'string' || Number.isNaN(Date.parse(v.termina_em))) return null;
  return { iniciado: v.iniciado, replay: v.replay, terminaEm: v.termina_em };
}

/**
 * Interpreta a resposta de `reservar_envio_orcamento_gratis`.
 *
 * Resposta parcial ou inesperada nunca inventa plano, token ou teste — mas também
 * nunca barra o envio: vira `sem_registro`. Um servidor ANTIGO que ainda responda
 * `cota_esgotada` (antes da migration 20261002150000 ser aplicada) também vira
 * `sem_registro`: a cota não existe mais no produto, e quem decide isso é o
 * contrato comercial, não a versão do banco.
 */
export function interpretarReservaEnvio(valor: unknown): ReservaEnvioOrcamento {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return envioSemRegistro();
  const v = valor as Record<string, unknown>;
  const motivo = v.motivo;
  const motivos = new Set(['plano_pago', 'trial_ativo', 'dentro_da_cota']);
  if (v.permitido !== true || !motivos.has(motivo as string)) return envioSemRegistro();

  const plano: PlanoId = v.plano_efetivo === 'empresa' ? 'empresa' : v.plano_efetivo === 'pro' ? 'pro' : 'gratis';
  const reservaToken = typeof v.reserva_token === 'string' && /^[0-9a-f-]{36}$/i.test(v.reserva_token)
    ? v.reserva_token
    : null;
  const requerConfirmacao = v.requer_confirmacao === true;
  if (requerConfirmacao && !reservaToken) return envioSemRegistro();
  return {
    permitido: true,
    planoEfetivo: plano,
    usados: inteiroNaoNegativo(v.usados, 0),
    contabilizadoAgora: v.contabilizado_agora === true,
    requerConfirmacao,
    reservaToken,
    trialElegivel: v.trial_elegivel === true,
    motivo: motivo as 'plano_pago' | 'trial_ativo' | 'dentro_da_cota',
  };
}

/** O registro do envio falhou: o envio segue, sem token, sem teste, sem inventar plano. */
export function envioSemRegistro(): ReservaEnvioOrcamento {
  return {
    permitido: true,
    planoEfetivo: 'gratis',
    usados: 0,
    contabilizadoAgora: false,
    requerConfirmacao: false,
    reservaToken: null,
    trialElegivel: false,
    motivo: 'sem_registro',
  };
}

export function reservaAmbienteLocal(): ReservaEnvioOrcamento {
  return { ...envioSemRegistro(), motivo: 'ambiente_local' };
}

/**
 * Texto para quando um envio é recusado. Desde 01/10/2026 este módulo não recusa
 * envio nenhum (`permitido` é sempre `true`); a função fica porque telas antigas
 * ainda a importam no ramo de recusa, que ficou inalcançável.
 */
export function mensagemBloqueioEnvio(_reserva: ReservaEnvioOrcamento): string {
  return 'Não conseguimos concluir o envio agora. Verifique a conexão e tente novamente.';
}
