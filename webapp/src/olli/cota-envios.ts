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
import { precoDoPlano, reais } from "@/pages/olli/planos/precos";

/**
 * REGISTRA o envio e aplica o limite do Grátis (5 por mês em conta nova; vale para todas
 * as contas desde o corte de 07/11 — `limite_gratis_config`). Só a recusa do LIMITE barra:
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
 * Sem a palavra "bloqueado"; o orçamento fica salvo. No momento de maior vontade de
 * enviar, o aviso leva ao Pix do Pro (CQ-DINHEIRO-LOTE1): `rotuloAcao` é o botão e
 * `URL_PAGAR_PRO_DO_LIMITE` o destino — o MESMO Pix da tela de Planos, nada de cobrança nova.
 * Preço da fonte única (`web/src/data/planos.ts`), nunca digitado aqui.
 */
export function avisoLimiteEnvios(reserva: ReservaEnvioOrcamento): { titulo: string; mensagem: string; rotuloAcao: string } {
  const teto = reserva.limiteEnvios ?? 5;
  const preco = precoDoPlano("pro");
  const precoTexto = preco ? ` (${reais(preco.mensalCentavos)} por mês)` : "";
  return {
    titulo: "Limite do mês atingido",
    mensagem: `Você usou os ${teto} envios do Grátis deste mês. Seu orçamento está salvo. Para enviar agora, libere o Pro${precoTexto} e pague por Pix; se preferir esperar, os envios voltam no próximo mês.`,
    rotuloAcao: "Liberar no Pro",
  };
}

/**
 * Destino do botão do aviso de limite: Planos já com a intenção do Pro mensal e o pedido
 * de abrir o Pix (`pagar=pix`, lido em `planos/index.tsx`). Parâmetros allowlistados
 * (`lerIntencaoPlano`), sem destino livre.
 */
export const URL_PAGAR_PRO_DO_LIMITE = "/planos?plano=pro&periodo=mensal&origem=limite&pagar=pix";

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
