import { supabase } from "@/lib/supabase";
import {
	interpretarReservaEnvio,
	interpretarEstadoOferta,
	interpretarInicioTrial,
	envioSemRegistro,
	type CanalEnvioOrcamento,
	type ReservaEnvioOrcamento,
	type EstadoOfertaComercial,
	type InicioTrialPro,
} from "@limites-comerciais";

/**
 * REGISTRA o envio (o Grátis é ilimitado — ver `limitesComerciais.ts`). Nunca barra:
 * falha de registro vira `motivo: 'sem_registro'` e o PDF sai do mesmo jeito.
 */
export async function reservarEnvioOrcamento(
	orcamentoId: string,
	canal: CanalEnvioOrcamento,
): Promise<ReservaEnvioOrcamento> {
	const referencia = orcamentoId.trim();
	if (!referencia || referencia.length > 160) return envioSemRegistro();
	try {
		const { data, error } = await supabase.rpc("reservar_envio_orcamento_gratis", {
			p_orcamento_id: referencia,
			p_canal: canal,
		});
		if (error) return envioSemRegistro();
		return interpretarReservaEnvio(data);
	} catch {
		return envioSemRegistro();
	}
}

/**
 * P0-09: texto da recusa do limite do Grátis em conta nova (única recusa do contrato).
 * Mesmo texto do app (VisualizarOrcamentoScreen): sem a palavra "bloqueado", orçamento salvo.
 */
export function avisoLimiteEnvios(reserva: ReservaEnvioOrcamento): { titulo: string; mensagem: string } {
  const teto = reserva.limiteEnvios ?? 5;
  return {
    titulo: "Limite do mês atingido",
    mensagem: `Você usou os ${teto} envios do Grátis deste mês. Seu orçamento está salvo. Os envios voltam no próximo mês; para enviar mais agora, veja os planos.`,
  };
}

export async function obterEstadoOfertaComercial(): Promise<EstadoOfertaComercial | null> {
	try {
		const { data, error } = await supabase.rpc("meu_estado_oferta_comercial");
		return error ? null : interpretarEstadoOferta(data);
	} catch {
		return null;
	}
}

export async function iniciarTrialPro(): Promise<InicioTrialPro | null> {
	try {
		const { data, error } = await supabase.rpc("iniciar_trial_pro", { p_gatilho: "pro_attempt" });
		return error ? null : interpretarInicioTrial(data);
	} catch {
		return null;
	}
}

export async function confirmarEnvioOrcamento(
	orcamentoId: string,
	reservaToken: string | null,
): Promise<boolean> {
	if (!reservaToken) return true;
	try {
		const { data, error } = await supabase.rpc("confirmar_envio_orcamento_gratis", {
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
	if (!reservaToken) return;
	try {
		await supabase.rpc("cancelar_reserva_envio_orcamento_gratis", {
			p_orcamento_id: orcamentoId.trim(),
			p_reserva_token: reservaToken,
		});
	} catch {
		// A reserva expira sozinha; não escondemos o erro real da ação.
	}
}
