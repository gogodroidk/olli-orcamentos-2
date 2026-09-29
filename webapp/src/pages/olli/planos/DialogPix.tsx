/**
 * DIÁLOGO DO PIX — gera a cobrança, mostra o QR e acompanha o pagamento até o plano
 * ser liberado pelo SERVIDOR.
 *
 * O painel nunca "acha" que pagou: só `pago:true` vindo de `/abacate/status` conta, e
 * nesse momento o worker já liberou o plano (ver `pix.ts`). Por isso aqui não há
 * otimismo: enquanto a resposta não afirma, o estado é "aguardando".
 *
 * Ciclo (`fase`):
 *   gerando → pronto ─(pago)→ pago
 *                └─(passou de expiraEm)→ expirado → "Gerar novo Pix" → gerando
 *   gerando ─(falha)→ falhou → "Tentar de novo" → gerando
 *   pronto ─(falha DEFINITIVA na consulta)→ falhouConsulta → "Tentar de novo" volta a
 *   consultar a MESMA cobrança (gerar outra aqui poderia cobrar em dobro quem já pagou)
 *
 * O polling roda a cada 4s só enquanto a fase é `pronto` e o diálogo está montado; fechar
 * o diálogo desmonta este componente e para tudo. A expiração é decidida no próprio tique:
 * passou de `expiraEm` E a consulta respondeu "ainda não pago" — se a consulta falhar, não
 * dá para afirmar que expirou (poderia ter sido pago no limite), então segue tentando. Falha TRANSITÓRIA na consulta (rede,
 * 502) não derruba o QR: segue tentando e avisa em voz baixa.
 */
import { AlertTriangle, CheckCircle2, Copy, Loader2, MessageCircle, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { cn } from "@/utils";
import { type CobrancaPix, consultarStatusPix, criarPix, type FalhaPix, type PlanoPix } from "./pix";

/** Intervalo do polling — o Pix costuma confirmar em segundos; 4s é rápido sem martelar o worker. */
const POLL_MS = 4_000;
const COPIADO_MS = 2_000;

type Fase = "gerando" | "pronto" | "expirado" | "pago" | "falhou" | "falhouConsulta";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function horaBr(iso: string | null): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function passou(iso: string | null): boolean {
	if (!iso) return false;
	const t = new Date(iso).getTime();
	return !Number.isNaN(t) && Date.now() >= t;
}

export interface DialogPixProps {
	plano: PlanoPix;
	/** "Pro" / "Empresa" — só para o texto. */
	nomePlano: string;
	aoFechar: () => void;
	/** Chamado UMA vez quando o servidor confirma o pagamento — recarrega o plano da tela. */
	aoPago: () => void;
	linkWhatsApp: (mensagem: string) => string;
}

export function DialogPix({ plano, nomePlano, aoFechar, aoPago, linkWhatsApp }: DialogPixProps) {
	const [fase, setFase] = useState<Fase>("gerando");
	const [cobranca, setCobranca] = useState<CobrancaPix | null>(null);
	const [falha, setFalha] = useState<FalhaPix | null>(null);
	const [consultaInstavel, setConsultaInstavel] = useState(false);
	const [copiado, setCopiado] = useState(false);
	// Incrementar dispara uma nova cobrança (gerar / tentar de novo / gerar novo Pix).
	const [geracao, setGeracao] = useState(0);
	const [consultaGeracao, setConsultaGeracao] = useState(0);

	// `vivo` = o diálogo ainda está montado. O StrictMode do dev roda mount → cleanup → mount;
	// sem ref, o resultado da primeira chamada seria descartado por engano.
	const vivo = useRef(false);
	const geracaoIniciada = useRef(-1);
	const aoPagoRef = useRef(aoPago);
	aoPagoRef.current = aoPago;
	const copiadoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
			clearTimeout(copiadoTimer.current);
		};
	}, []);

	// ── Gera a cobrança ──
	useEffect(() => {
		if (geracaoIniciada.current === geracao) return; // StrictMode: não cobra duas vezes
		geracaoIniciada.current = geracao;
		setFase("gerando");
		setFalha(null);
		setCobranca(null);
		setConsultaInstavel(false);
		void criarPix(plano).then((r) => {
			if (!vivo.current) return;
			if (r.ok) {
				setCobranca(r.cobranca);
				setFase("pronto");
			} else {
				setFalha(r.erro);
				setFase("falhou");
			}
		});
	}, [geracao, plano]);

	// ── Acompanha o pagamento ──
	const cobrancaId = cobranca?.id;
	const expiraEm = cobranca?.expiraEm ?? null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `consultaGeracao` religa o polling após falha definitiva.
	useEffect(() => {
		if (fase !== "pronto" || !cobrancaId) return;
		let ativo = true;
		let emVoo = false;

		const confirmarPago = () => {
			setFase("pago");
			aoPagoRef.current();
		};

		const consultar = async () => {
			if (emVoo) return;
			emVoo = true;
			const r = await consultarStatusPix(cobrancaId);
			emVoo = false;
			if (!ativo || !vivo.current) return;

			if (r.ok) {
				setConsultaInstavel(false);
				if (r.pago) return confirmarPago();
				// A última consulta antes de declarar expirado: se o Pix foi pago no limite,
				// o plano já foi liberado — dizer "expirou" seria mentira.
				if (passou(expiraEm)) setFase("expirado");
				return;
			}
			if (!r.transitorio) {
				setFalha(r.erro);
				setFase("falhouConsulta");
				return;
			}
			// Não consegui perguntar: NÃO é "não pagou" nem "expirou". Continua tentando.
			setConsultaInstavel(true);
		};

		const id = setInterval(() => void consultar(), POLL_MS);
		return () => {
			ativo = false;
			clearInterval(id);
		};
	}, [fase, cobrancaId, expiraEm, consultaGeracao]);

	const copiar = useCallback(async () => {
		if (!cobranca) return;
		try {
			await navigator.clipboard.writeText(cobranca.brCode);
			setCopiado(true);
			clearTimeout(copiadoTimer.current);
			copiadoTimer.current = setTimeout(() => setCopiado(false), COPIADO_MS);
		} catch {
			toast.error("Não consegui copiar automaticamente. Selecione o código abaixo e copie.");
		}
	}, [cobranca]);

	const meses = cobranca?.plano.meses ?? (plano.endsWith("_anual") ? 12 : 1);
	const libera = meses === 1 ? "libera 1 mês" : `libera ${meses} meses`;
	const msgWhats = `Olá! Quero assinar o plano ${nomePlano} do OLLI e prefiro pagar por Pix.`;
	const qrOk = !!cobranca?.qrCodeUri.startsWith("data:image/");
	const ate = horaBr(cobranca?.expiraEm ?? null);

	return (
		<Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
			<DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pagar {nomePlano} com Pix</DialogTitle>
					<DialogDescription>
						{cobranca
							? `${cobranca.plano.nome} — ${brl.format(cobranca.plano.valor)} (${libera})`
							: `Plano ${nomePlano}`}
					</DialogDescription>
				</DialogHeader>

				{fase === "gerando" && (
					<div className="flex flex-col items-center gap-3 py-10" aria-live="polite">
						<Loader2 className="size-8 animate-spin text-primary" aria-hidden />
						<p className="text-sm text-text-secondary">Gerando seu Pix…</p>
					</div>
				)}

				{(fase === "falhou" || fase === "falhouConsulta") && falha && (
					<div className="rounded-lg border border-warning/40 bg-warning/5 p-4" role="alert">
						<p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
							<AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
							{falha.titulo}
						</p>
						<p className="mt-1 text-sm text-text-secondary">{falha.mensagem}</p>
						{fase === "falhouConsulta" && (
							<p className="mt-1 text-sm text-text-secondary">
								Se você já pagou, o plano é liberado assim que o Pix for confirmado. Tentar de novo só volta a conferir
								este mesmo Pix — não gera outra cobrança.
							</p>
						)}
						<div className="mt-3 flex flex-wrap gap-2">
							<Button
								size="sm"
								variant="outline"
								className="min-h-[40px]"
								onClick={() => {
									if (fase === "falhouConsulta") {
										setFalha(null);
										setFase("pronto");
										setConsultaGeracao((n) => n + 1);
									} else {
										setGeracao((n) => n + 1);
									}
								}}
							>
								<RotateCw className="size-3.5" aria-hidden />
								Tentar de novo
							</Button>
							<Button asChild size="sm" variant="ghost" className="min-h-[40px]">
								<a href={linkWhatsApp(msgWhats)} target="_blank" rel="noreferrer noopener">
									<MessageCircle className="size-3.5" aria-hidden />
									Assinar pelo WhatsApp
								</a>
							</Button>
						</div>
					</div>
				)}

				{fase === "pago" && (
					<div className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
						<span className="grid size-14 place-items-center rounded-full bg-success/10 text-success">
							<CheckCircle2 className="size-8" aria-hidden />
						</span>
						<p className="text-base font-semibold text-text-primary">Pagamento confirmado!</p>
						<p className="text-sm text-text-secondary">Seu plano {nomePlano} já está ativo.</p>
						<Button className="mt-2 min-h-[44px] w-full" onClick={aoFechar}>
							Fechar
						</Button>
					</div>
				)}

				{fase === "expirado" && (
					<div className="rounded-lg border border-warning/40 bg-warning/5 p-4" role="alert">
						<p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
							<AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
							Este Pix expirou
						</p>
						<p className="mt-1 text-sm text-text-secondary">
							O Pix vale por 1 hora. Nenhuma cobrança foi feita — gere um novo para pagar.
						</p>
						<Button className="mt-3 min-h-[44px] w-full" onClick={() => setGeracao((n) => n + 1)}>
							<RotateCw className="size-4" aria-hidden />
							Gerar novo Pix
						</Button>
					</div>
				)}

				{fase === "pronto" && cobranca && (
					<div className="flex flex-col items-center gap-4">
						{qrOk ? (
							<img
								src={cobranca.qrCodeUri}
								alt={`QR Code do Pix de ${brl.format(cobranca.plano.valor)} para o plano ${nomePlano}`}
								className="size-56 rounded-lg border border-border bg-white p-2"
							/>
						) : (
							<p className="rounded-lg border border-border p-3 text-center text-sm text-text-secondary">
								Não consegui exibir o QR Code. Use o código Pix abaixo (copia e cola).
							</p>
						)}

						<p className="text-2xl font-bold tabular-nums text-text-primary">{brl.format(cobranca.plano.valor)}</p>

						<div className="w-full">
							<label htmlFor="pix-brcode" className="sr-only">
								Código Pix copia e cola
							</label>
							<textarea
								id="pix-brcode"
								readOnly
								rows={3}
								value={cobranca.brCode}
								onFocus={(e) => e.currentTarget.select()}
								className="w-full resize-none rounded-md border border-border bg-bg-neutral/40 p-2 font-mono text-xs text-text-secondary"
							/>
							<Button
								variant={copiado ? "outline" : "default"}
								className={cn("mt-2 min-h-[44px] w-full", copiado && "border-success text-success")}
								onClick={() => void copiar()}
							>
								{copiado ? <CheckCircle2 className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
								{copiado ? "Código copiado!" : "Copiar código Pix"}
							</Button>
						</div>

						<div className="flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
							<Loader2 className="size-4 animate-spin" aria-hidden />
							<span>Aguardando o pagamento{ate ? ` (válido até ${ate})` : ""}…</span>
						</div>
						{consultaInstavel && (
							<p className="text-center text-xs text-warning" aria-live="polite">
								Não consegui conferir o pagamento agora. Continuo tentando — se você já pagou, o plano será liberado.
							</p>
						)}
					</div>
				)}

				{fase !== "pago" && (
					<p className="text-xs text-text-secondary">
						Pix não renova sozinho: perto do vencimento você paga de novo (no anual, só 1 vez por ano). Se você pagar e
						fechar esta janela, o plano é liberado assim que o Pix for confirmado — basta atualizar a página.
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
