/**
 * PIX AUTOMÁTICO no painel — confirmação (preço, "todo mês", como cancelar), autorização na página da
 * AbacatePay e acompanhamento até o SERVIDOR liberar o Pro; mais o cartão "renova sozinho / cancelar".
 *
 * O painel nunca "acha" que ativou: só `ativa:true` vindo de `/abacate/assinatura/status` conta (o worker já liberou).
 * Desligado por padrão: quem monta este diálogo só o faz com `/abacate/config` → `pixAutomatico:true` (ver `pix.ts`).
 * Texto único com o app: `src/content/pixAutomatico.ts` (testado em scripts/teste-pix-automatico-copy.ts).
 */
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import {
	ROTULO_CANCELAR_PIX_AUTOMATICO,
	TEXTO_PIX_AUTOMATICO_ATIVO,
	textoAcordoPixAutomatico,
} from "../../../../../src/content/pixAutomatico";
import { cancelarPixAutomatico, consultarPixAutomatico, criarPixAutomatico, type EstadoPixAutomatico } from "./pix";
import { precoDoPlano, reais } from "./precos";

const POLL_MS = 5_000;
const POLL_MAX_MS = 15 * 60_000;

type Fase = "confirmar" | "criando" | "aguardando" | "ativa" | "falhou";

const MOTIVO_TEXTO: Record<string, string> = {
	plano_ainda_ativo: "Seu plano ainda está ativo por mais alguns dias. Assine o Pix Automático perto do vencimento, para não pagar em dobro.",
	assinatura_ja_ativa: "Você já tem a renovação automática por Pix ativa.",
	sessao: "Sua sessão expirou. Entre de novo na sua conta para continuar.",
	desligado: "O Pix Automático não está disponível agora. Você ainda pode pagar com Pix avulso ou no cartão.",
	falha: "Não consegui iniciar agora. Verifique sua conexão e tente de novo. Nada foi cobrado.",
};

export function DialogPixAutomatico({ aoFechar, aoAtivo }: { aoFechar: () => void; aoAtivo: () => void }) {
	const [fase, setFase] = useState<Fase>("confirmar");
	const [checkoutId, setCheckoutId] = useState<string | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [motivo, setMotivo] = useState<string>("falha");
	const valor = reais(precoDoPlano("pro")?.mensalCentavos ?? 0);

	async function autorizar() {
		setFase("criando");
		const r = await criarPixAutomatico();
		if (!r.ok) {
			setMotivo(r.motivo);
			setFase("falhou");
			return;
		}
		setCheckoutId(r.checkoutId);
		setUrl(r.url);
		setFase("aguardando");
		window.open(r.url, "_blank", "noopener,noreferrer");
	}

	// Pergunta ao servidor a cada 5 s (até 15 min) depois de abrir a página de autorização.
	useEffect(() => {
		if (fase !== "aguardando" || !checkoutId) return;
		let ativo = true;
		const limite = Date.now() + POLL_MAX_MS;
		const tick = async () => {
			if (Date.now() > limite) {
				if (ativo) {
					setMotivo("falha");
					setFase("falhou");
				}
				return;
			}
			const st = await consultarPixAutomatico(checkoutId);
			if (!ativo || !st?.ativa) return;
			setFase("ativa");
			aoAtivo();
		};
		const iv = setInterval(() => void tick(), POLL_MS);
		return () => {
			ativo = false;
			clearInterval(iv);
		};
	}, [fase, checkoutId, aoAtivo]);

	return (
		<Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Pix Automático — OLLI Pro</DialogTitle>
					<DialogDescription>{valor} por mês, debitado sozinho do seu banco.</DialogDescription>
				</DialogHeader>

				{(fase === "confirmar" || fase === "criando") && (
					<div className="space-y-3">
						<p className="text-sm text-text-secondary">{textoAcordoPixAutomatico(valor)}</p>
						<Button className="min-h-[44px] w-full" onClick={() => void autorizar()} disabled={fase === "criando"} aria-busy={fase === "criando"}>
							{fase === "criando" ? (
								<>
									<Loader2 className="size-4 animate-spin" aria-hidden />
									Abrindo a autorização…
								</>
							) : (
								`Autorizar ${valor}/mês`
							)}
						</Button>
						<Button variant="ghost" className="min-h-[44px] w-full" onClick={aoFechar}>
							Voltar
						</Button>
					</div>
				)}

				{fase === "aguardando" && (
					<div className="space-y-3" aria-live="polite">
						<p className="text-sm text-text-secondary">
							Abrimos a página da AbacatePay em outra aba: leia o QR Code no app do seu banco e autorize. O primeiro débito é na hora. O
							QR vale 1 hora.
						</p>
						<div className="flex items-center gap-2 text-sm text-text-secondary">
							<Loader2 className="size-4 animate-spin" aria-hidden />
							<span>Aguardando a autorização…</span>
						</div>
						{url && (
							<Button asChild variant="outline" className="min-h-[44px] w-full">
								<a href={url} target="_blank" rel="noopener noreferrer">
									<ExternalLink className="size-4" aria-hidden />
									Abrir a página de novo
								</a>
							</Button>
						)}
					</div>
				)}

				{fase === "ativa" && (
					<div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
						<span className="grid size-14 place-items-center rounded-full bg-success/10 text-success">
							<CheckCircle2 className="size-8" aria-hidden />
						</span>
						<p className="text-base font-semibold text-text-primary">Pix Automático ativo!</p>
						<p className="text-sm text-text-secondary">Seu plano Pro já está ativo e renova sozinho todo mês.</p>
						<Button className="min-h-[44px] w-full" onClick={aoFechar}>
							Fechar
						</Button>
					</div>
				)}

				{fase === "falhou" && (
					<div className="rounded-lg border border-warning/40 bg-warning/5 p-4" role="alert">
						<p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
							<AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
							Não foi possível concluir
						</p>
						<p className="mt-1 text-sm text-text-secondary">{MOTIVO_TEXTO[motivo] ?? MOTIVO_TEXTO.falha}</p>
						{motivo === "falha" && (
							<Button className="mt-3 min-h-[44px] w-full" onClick={() => setFase("confirmar")}>
								<RefreshCw className="size-4" aria-hidden />
								Tentar de novo
							</Button>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Quem tem a renovação automática ativa: avisa e deixa cancelar, sem sair do painel. */
export function CardPixAutomaticoAtivo({ estado, aoCancelado }: { estado: EstadoPixAutomatico; aoCancelado: () => void }) {
	const [cancelando, setCancelando] = useState(false);
	const [confirmando, setConfirmando] = useState(false);
	const ate = estado.pagoAte ? new Date(estado.pagoAte).toLocaleDateString("pt-BR") : null;

	async function cancelar() {
		setCancelando(true);
		const r = await cancelarPixAutomatico();
		setCancelando(false);
		if (!r) {
			toast.error("Não deu para cancelar agora. Tente de novo ou cancele a autorização no app do seu banco.");
			return;
		}
		setConfirmando(false);
		toast.success(r.ate ? `Renovação cancelada. Seu Pro segue até ${new Date(r.ate).toLocaleDateString("pt-BR")}.` : "Renovação cancelada. Nada mais será cobrado.");
		aoCancelado();
	}

	return (
		<Card className="gap-0 border-border p-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="font-semibold text-text-primary">{TEXTO_PIX_AUTOMATICO_ATIVO}</p>
					<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">
						{ate ? `Período já pago até ${ate}. ` : ""}O valor é debitado do seu banco por Pix todo mês, até você cancelar. Cancelando, nada
						mais é cobrado e o Pro segue até o fim do período já pago.
					</p>
				</div>
				{confirmando ? (
					<div className="flex shrink-0 gap-2">
						<Button variant="outline" className="min-h-[44px]" onClick={() => setConfirmando(false)} disabled={cancelando}>
							Voltar
						</Button>
						<Button variant="destructive" className="min-h-[44px]" onClick={() => void cancelar()} disabled={cancelando} aria-busy={cancelando}>
							{cancelando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
							Confirmar cancelamento
						</Button>
					</div>
				) : (
					<Button variant="outline" className="min-h-[44px] shrink-0" onClick={() => setConfirmando(true)}>
						{ROTULO_CANCELAR_PIX_AUTOMATICO}
					</Button>
				)}
			</div>
		</Card>
	);
}
