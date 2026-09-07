import type { PlanoId } from './entitlements';

/** Fonte única do contrato comercial aprovado; migration e cópias têm testes de paridade. */
export const ORCAMENTOS_ENVIADOS_GRATIS_MES = 5;
export const TRIAL_PRO_DIAS = 14;

export type CanalEnvioOrcamento = 'pdf' | 'link' | 'whatsapp';
export type TrialEstado = 'unstarted' | 'eligible' | 'active' | 'ended' | 'converted' | 'revoked';

export interface EstadoOfertaComercial {
  planoEfetivo: PlanoId;
  limiteEnvios: number | null;
  enviosUsados: number;
  enviosRestantes: number | null;
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
  permitido: boolean;
  planoEfetivo: PlanoId;
  limite: number | null;
  usados: number;
  restantes: number | null;
  contabilizadoAgora: boolean;
  requerConfirmacao: boolean;
  reservaToken: string | null;
  trialElegivel: boolean;
  motivo: 'plano_pago' | 'trial_ativo' | 'dentro_da_cota' | 'cota_esgotada' | 'indisponivel' | 'ambiente_local';
}

function inteiroNaoNegativo(valor: unknown, fallback: number): number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : fallback;
}

export function interpretarEstadoOferta(valor: unknown): EstadoOfertaComercial | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  const estados = new Set<TrialEstado>(['unstarted', 'eligible', 'active', 'ended', 'converted', 'revoked']);
  if (!estados.has(v.trial_estado as TrialEstado)) return null;
  if (v.requires_card !== false || v.auto_renews !== false || v.data_disposition !== 'preserve') return null;
  if (v.trial_dias !== TRIAL_PRO_DIAS) return null;
  const plano = v.plano_efetivo === 'empresa' ? 'empresa' : v.plano_efetivo === 'pro' ? 'pro' : 'gratis';
  const acessoAmpliado = plano !== 'gratis';
  const terminaEm = typeof v.trial_termina_em === 'string' && !Number.isNaN(Date.parse(v.trial_termina_em))
    ? v.trial_termina_em
    : null;
  if (v.trial_estado === 'active' && !terminaEm) return null;
  return {
    planoEfetivo: plano,
    limiteEnvios: acessoAmpliado ? null : ORCAMENTOS_ENVIADOS_GRATIS_MES,
    enviosUsados: inteiroNaoNegativo(v.envios_usados, 0),
    enviosRestantes: acessoAmpliado
      ? null
      : Math.max(0, inteiroNaoNegativo(v.envios_restantes, ORCAMENTOS_ENVIADOS_GRATIS_MES)),
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

/** Resposta parcial ou inesperada nunca pode inventar cota, plano ou trial. */
export function interpretarReservaEnvio(valor: unknown): ReservaEnvioOrcamento {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return reservaIndisponivel();
  const v = valor as Record<string, unknown>;
  const plano = v.plano_efetivo === 'empresa' ? 'empresa' : v.plano_efetivo === 'pro' ? 'pro' : 'gratis';
  const motivo = v.motivo;
  const motivos = new Set(['plano_pago', 'trial_ativo', 'dentro_da_cota', 'cota_esgotada']);
  if (typeof v.permitido !== 'boolean' || !motivos.has(motivo as string)) return reservaIndisponivel();

  const acessoAmpliado = plano !== 'gratis' || motivo === 'trial_ativo';
  const limite: number | null = acessoAmpliado ? null : ORCAMENTOS_ENVIADOS_GRATIS_MES;
  const usados = inteiroNaoNegativo(v.usados, 0);
  const restantes = acessoAmpliado
    ? null
    : Math.max(0, inteiroNaoNegativo(v.restantes, ORCAMENTOS_ENVIADOS_GRATIS_MES - usados));
  const reservaToken = typeof v.reserva_token === 'string' && /^[0-9a-f-]{36}$/i.test(v.reserva_token)
    ? v.reserva_token
    : null;
  const requerConfirmacao = v.requer_confirmacao === true;
  if (requerConfirmacao && !reservaToken) return reservaIndisponivel();
  return {
    permitido: v.permitido,
    planoEfetivo: plano,
    limite,
    usados,
    restantes,
    contabilizadoAgora: v.contabilizado_agora === true,
    requerConfirmacao,
    reservaToken,
    trialElegivel: v.trial_elegivel === true,
    motivo: motivo as ReservaEnvioOrcamento['motivo'],
  };
}

export function reservaIndisponivel(): ReservaEnvioOrcamento {
  return {
    permitido: false,
    planoEfetivo: 'gratis',
    limite: ORCAMENTOS_ENVIADOS_GRATIS_MES,
    usados: 0,
    restantes: null,
    contabilizadoAgora: false,
    requerConfirmacao: false,
    reservaToken: null,
    trialElegivel: false,
    motivo: 'indisponivel',
  };
}

export function reservaAmbienteLocal(): ReservaEnvioOrcamento {
  return {
    permitido: true,
    planoEfetivo: 'gratis',
    limite: ORCAMENTOS_ENVIADOS_GRATIS_MES,
    usados: 0,
    restantes: ORCAMENTOS_ENVIADOS_GRATIS_MES,
    contabilizadoAgora: false,
    requerConfirmacao: false,
    reservaToken: null,
    trialElegivel: false,
    motivo: 'ambiente_local',
  };
}

export function mensagemBloqueioEnvio(reserva: ReservaEnvioOrcamento): string {
  if (reserva.motivo === 'cota_esgotada') {
    return `Você já enviou os ${ORCAMENTOS_ENVIADOS_GRATIS_MES} orçamentos incluídos no Grátis neste mês. Seus rascunhos e dados continuam aqui. Experimente o Pro por ${TRIAL_PRO_DIAS} dias ou aguarde a renovação mensal da cota.`;
  }
  return 'Não conseguimos confirmar sua cota agora. Nenhum uso foi registrado. Verifique a conexão e tente novamente.';
}
