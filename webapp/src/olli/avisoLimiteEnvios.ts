/**
 * AVISO DO LIMITE DO GRÁTIS COM BOTÃO DE PAGAR (CQ-DINHEIRO-LOTE1, D-2506).
 *
 * Antes: no PDF o aviso virava erro vermelho e sumia; no WhatsApp era só texto. Era o
 * único gatilho de compra e não tinha botão. Agora os dois caminhos (PDF e WhatsApp)
 * passam por aqui:
 *  - o aviso fica 20 s na tela, com o botão "Liberar no Pro" (leva ao Pix do Pro pela
 *    tela de Planos — o mesmo `DialogPix` de sempre, nenhuma cobrança nova);
 *  - grava `limite_aviso_visto` quando aparece e `limite_aviso_pagar_clicado` no clique
 *    (telemetria best-effort: falha nunca trava o aviso nem a navegação).
 */

import type { ReservaEnvioOrcamento } from "@limites-comerciais";
import { toast } from "sonner";
import { registrarEtapaAtivacao } from "@/store/userStore";
import { avisoLimiteEnvios, URL_PAGAR_PRO_DO_LIMITE } from "./cota-envios";

/** 20 s: tempo de ler 2 frases e decidir, sem prender a tela (o X fecha antes). */
export const DURACAO_AVISO_LIMITE_MS = 20_000;

/** Botão de ação do toast com alvo de 44 px (Fitts; perfil generic-saas). */
export const ESTILO_BOTAO_44PX = {
	height: 44,
	minWidth: 44,
	padding: "0 16px",
	fontSize: 14,
	fontWeight: 600,
} as const;

/**
 * Mostra o aviso do limite com o botão de pagar. `irPara` é o `navigate` do roteador
 * (SPA: não recarrega o painel). Devolve o texto mostrado (útil para teste e log).
 */
export function mostrarAvisoLimiteEnvios(
	reserva: ReservaEnvioOrcamento,
	irPara: (url: string) => void,
): { titulo: string; mensagem: string; rotuloAcao: string } {
	const aviso = avisoLimiteEnvios(reserva);
	void registrarEtapaAtivacao("limite_aviso_visto");
	toast.info(aviso.titulo, {
		id: "aviso-limite-envios",
		description: aviso.mensagem,
		position: "top-center",
		duration: DURACAO_AVISO_LIMITE_MS,
		closeButton: true,
		action: {
			label: aviso.rotuloAcao,
			onClick: () => {
				void registrarEtapaAtivacao("limite_aviso_pagar_clicado");
				irPara(URL_PAGAR_PRO_DO_LIMITE);
			},
		},
		// Alvo de toque de 44 px (o botão padrão do sonner tem 24 px). Estilo inline vence o CSS do sonner.
		actionButtonStyle: ESTILO_BOTAO_44PX,
	});
	return aviso;
}
