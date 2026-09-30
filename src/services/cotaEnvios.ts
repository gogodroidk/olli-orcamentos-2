import { supabase } from './supabase';
import {
  interpretarReservaEnvio,
  interpretarEstadoOferta,
  interpretarInicioTrial,
  reservaAmbienteLocal,
  reservaIndisponivel,
  type CanalEnvioOrcamento,
  type ReservaEnvioOrcamento,
  type EstadoOfertaComercial,
  type InicioTrialPro,
} from './limitesComerciais';

/** Reserva um orçamento mensal; repetir o mesmo id no mês é idempotente. */
export async function reservarEnvioOrcamento(
  orcamentoId: string,
  canal: CanalEnvioOrcamento,
): Promise<ReservaEnvioOrcamento> {
  const referencia = orcamentoId.trim();
  if (!referencia || referencia.length > 160) return reservaIndisponivel();
  if (!supabase) return reservaAmbienteLocal();
  try {
    const { data, error } = await supabase.rpc('reservar_envio_orcamento_gratis', {
      p_orcamento_id: referencia,
      p_canal: canal,
    });
    if (error) return reservaIndisponivel();
    return interpretarReservaEnvio(data);
  } catch {
    return reservaIndisponivel();
  }
}

export async function obterEstadoOfertaComercial(): Promise<EstadoOfertaComercial | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('meu_estado_oferta_comercial');
    return error ? null : interpretarEstadoOferta(data);
  } catch {
    return null;
  }
}

export async function iniciarTrialPro(): Promise<InicioTrialPro | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('iniciar_trial_pro', { p_gatilho: 'pro_attempt' });
    return error ? null : interpretarInicioTrial(data);
  } catch {
    return null;
  }
}

export async function confirmarEnvioOrcamento(
  orcamentoId: string,
  reservaToken: string | null,
): Promise<boolean> {
  if (!reservaToken || !supabase) return true;
  try {
    const { data, error } = await supabase.rpc('confirmar_envio_orcamento_gratis', {
      p_orcamento_id: orcamentoId.trim(),
      p_reserva_token: reservaToken,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function cancelarReservaEnvioOrcamento(
  orcamentoId: string,
  reservaToken: string | null,
): Promise<void> {
  if (!reservaToken || !supabase) return;
  try {
    await supabase.rpc('cancelar_reserva_envio_orcamento_gratis', {
      p_orcamento_id: orcamentoId.trim(),
      p_reserva_token: reservaToken,
    });
  } catch {
    // A reserva expira sozinha; não mascaramos o erro original da entrega.
  }
}
