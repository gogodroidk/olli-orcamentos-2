import { supabase } from "@/lib/supabase";
import {
	interpretarReservaEnvio,
	interpretarEstadoOferta,
	interpretarInicioTrial,
	reservaIndisponivel,
	type CanalEnvioOrcamento,
	type ReservaEnvioOrcamento,
	type EstadoOfertaComercial,
	type InicioTrialPro,
} from "@limites-comerciais";

export async function reservarEnvioOrcamento(
	orcamentoId: string,
	canal: CanalEnvioOrcamento,
): Promise<ReservaEnvioOrcamento> {
	const referencia = orcamentoId.trim();
	if (!referencia || referencia.length > 160) return reservaIndisponivel();
	try {
		const { data, error } = await supabase.rpc("reservar_envio_orcamento_gratis", {
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
