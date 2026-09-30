/**
 * FAIXA DO LEMBRETE DE ASSINATURA — o aviso "está na hora de assinar/renovar" do painel.
 *
 * O QUE dizer e QUANDO vem inteiro da regra compartilhada com o app
 * (`@lembreteAssinatura`, via `useLembreteAssinatura`): esta faixa só desenha e traduz a
 * ação do botão em navegação. Sem lembrete (ou sem dados confirmados), não renderiza
 * nada — nunca um aviso de mentira.
 *
 * O peso visual acompanha a urgência: `info` é um convite, `atencao` é âmbar e
 * `critico` é vermelho e anunciado ao leitor de tela. "Agora não" só existe quando a
 * regra deixa dispensar.
 */
import type { AcaoLembrete, Lembrete } from "@lembreteAssinatura";
import { AlertTriangle, Loader2, QrCode, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/utils";
import { useLembreteAssinatura } from "./useLembreteAssinatura";

/** Rota da tela de Planos e o pedido para abrir direto o Pix do plano atual. */
export const ROTA_PLANOS = "/planos";
export const PARAM_RENOVAR_PIX = "renovar";

const ESTILO = {
	info: { card: "border-primary/30 bg-primary/5", tile: "bg-primary/10 text-primary" },
	atencao: { card: "border-warning/40 bg-warning/5", tile: "bg-warning/10 text-warning" },
	critico: { card: "border-error/40 bg-error/5", tile: "bg-error/10 text-error" },
} as const;

function Icone({ lembrete }: { lembrete: Lembrete }) {
	if (lembrete.tipo === "renovar_pix" || lembrete.tipo === "plano_vencido")
		return <QrCode className="size-5" aria-hidden />;
	if (lembrete.urgencia === "info") return <Sparkles className="size-5" aria-hidden />;
	return <AlertTriangle className="size-5" aria-hidden />;
}

/**
 * O lembrete conectado aos dados. Na tela de Planos, quem chama troca a navegação
 * (já está lá: rola até o catálogo / abre o Pix) e esconde o que a tela já mostra.
 */
export function LembreteAssinaturaFaixa({
	className,
	ocultar,
	aoIrParaPlanos,
	aoRenovarPix,
}: {
	className?: string;
	/** `true` = a tela já mostra esse estado; a faixa some para não repetir. */
	ocultar?: (lembrete: Lembrete) => boolean;
	aoIrParaPlanos?: () => void;
	aoRenovarPix?: () => void;
}) {
	const navigate = useNavigate();
	const { lembrete, dispensar, iniciarTeste, iniciandoTeste } = useLembreteAssinatura();
	if (!lembrete || ocultar?.(lembrete)) return null;

	const agir = (acao: AcaoLembrete) => {
		if (acao === "iniciar_trial") {
			void iniciarTeste();
		} else if (acao === "renovar_pix") {
			if (aoRenovarPix) aoRenovarPix();
			else navigate(`${ROTA_PLANOS}?${PARAM_RENOVAR_PIX}=pix`);
		} else if (aoIrParaPlanos) {
			aoIrParaPlanos();
		} else {
			navigate(ROTA_PLANOS);
		}
	};

	const estilo = ESTILO[lembrete.urgencia];
	const critico = lembrete.urgencia === "critico";

	return (
		<Card className={cn("gap-0 p-5", estilo.card, className)} role={critico ? "alert" : "status"}>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", estilo.tile)}>
						<Icone lembrete={lembrete} />
					</span>
					<div>
						<p className={cn("text-text-primary", critico ? "font-bold" : "font-semibold")}>{lembrete.titulo}</p>
						<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">{lembrete.texto}</p>
					</div>
				</div>
				<div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
					{lembrete.ctaSecundario && (
						<Button
							variant="outline"
							className="min-h-[44px]"
							onClick={() => lembrete.ctaSecundario && agir(lembrete.ctaSecundario.acao)}
							disabled={iniciandoTeste}
						>
							{lembrete.ctaSecundario.acao === "iniciar_trial" && iniciandoTeste && (
								<Loader2 className="size-4 animate-spin" aria-hidden />
							)}
							{lembrete.ctaSecundario.rotulo}
						</Button>
					)}
					<Button
						className="min-h-[44px]"
						onClick={() => agir(lembrete.cta.acao)}
						disabled={iniciandoTeste}
						aria-busy={iniciandoTeste}
					>
						{lembrete.cta.acao === "iniciar_trial" && iniciandoTeste && (
							<Loader2 className="size-4 animate-spin" aria-hidden />
						)}
						{lembrete.cta.rotulo}
					</Button>
					{/* Por último no celular (depois das ações); à esquerda delas no computador. */}
					{lembrete.dispensavelPorHoras !== null && (
						<Button variant="ghost" className="min-h-[44px] sm:order-first" onClick={dispensar}>
							Agora não
						</Button>
					)}
				</div>
			</div>
		</Card>
	);
}
