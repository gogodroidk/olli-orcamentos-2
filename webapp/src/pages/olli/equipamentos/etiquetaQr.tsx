/**
 * ETIQUETA QR — mostra o QR code público do equipamento (o mesmo que vai no
 * adesivo colado na máquina).
 *
 * O token (`qr_token`) nasce no BANCO (DEFAULT), nunca aqui — ver equipamento.ts
 * e FormEquipamento.tsx. Ele vira uma URL pública servida pelo WORKER:
 *   https://link.olliorcamentos.online/q/<token>
 * (worker/src/pmoc.js, rota `GET /q/<token>`). Essa mesma rota também serve o
 * QR pronto como imagem em `/q/<token>.svg` — é o que o app do celular imprime
 * na etiqueta física (src/utils/etiquetaQrPdf.ts).
 *
 * ZERO dependência nova: `qrcode.react` já está no projeto (usado em
 * sys/login/qrcode-form.tsx) — só reaproveitamos.
 *
 * 3 estados de verdade, sempre visíveis (nada "escondido"):
 *  - token ativo     → QR + link + "abrir etiqueta pública"
 *  - token revogado   → aviso claro (a etiqueta antiga parou de resolver)
 *  - sem token ainda  → aviso que o backend ainda vai gerar (equipamento novo
 *                        que ainda não sincronizou o INSERT que dispara o DEFAULT)
 */
import type { Equipamento } from "@dominio";
import { AlertTriangle, Copy, ExternalLink, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { nomeEquipamento, subEquipamento } from "./equipamento";

/** Espelho de `urlEtiqueta` (src/services/equipamentos.ts) — mesma base de link
 *  que o worker serve (`worker/src/pmoc.js`, `GET /q/<token>`). */
const BASE_ETIQUETA = "https://link.olliorcamentos.online/q/";

export function urlEtiqueta(qrToken: string): string {
	return qrToken ? `${BASE_ETIQUETA}${encodeURIComponent(qrToken)}` : "";
}

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	equipamento: Equipamento | null;
}

export default function EtiquetaQrDialog({ aberto, aoFechar, equipamento }: Props) {
	const [copiado, setCopiado] = useState(false);

	if (!equipamento) return null;

	const titulo = nomeEquipamento(equipamento);
	const sub = subEquipamento(equipamento);
	const revogado = !!equipamento.qrRevogadoEm;
	const link = !revogado ? urlEtiqueta(equipamento.qrToken) : "";

	const copiarLink = async () => {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			setCopiado(true);
			setTimeout(() => setCopiado(false), 2000);
		} catch {
			// Sem permissão de clipboard (http local, navegador antigo) — o link já
			// está visível na tela para copiar manualmente. Não é um erro fatal.
		}
	};

	return (
		<Dialog
			open={aberto}
			onOpenChange={(v) => {
				if (!v) aoFechar();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<QrCode className="size-5 text-primary" />
						Etiqueta QR
					</DialogTitle>
					<DialogDescription>
						{titulo}
						{sub ? ` · ${sub}` : ""}
					</DialogDescription>
				</DialogHeader>

				{revogado ? (
					<div className="flex flex-col items-center gap-3 rounded-xl border border-error/30 bg-error/5 p-6 text-center">
						<AlertTriangle className="size-8 text-error" />
						<p className="text-sm font-medium text-text-primary">Esta etiqueta foi revogada</p>
						<p className="text-sm text-text-secondary">
							O adesivo antigo colado no equipamento não abre mais o histórico. Gere uma nova etiqueta pelo app para
							substituir a que está na máquina.
						</p>
					</div>
				) : !equipamento.qrToken ? (
					<div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-bg-neutral p-6 text-center">
						<QrCode className="size-8 text-text-disabled" />
						<p className="text-sm font-medium text-text-primary">Etiqueta ainda não gerada</p>
						<p className="text-sm text-text-secondary">
							O código do QR é criado pelo sistema assim que este equipamento termina de sincronizar. Tente
							novamente em alguns instantes.
						</p>
					</div>
				) : (
					<div className="flex flex-col items-center gap-4">
						<div className="flex items-center justify-center rounded-2xl border border-border bg-white p-4">
							<QRCodeSVG value={link} size={200} marginSize={0} />
						</div>

						<p className="text-center text-xs text-text-secondary">
							Aponte a câmera do celular para ver o histórico deste equipamento.
						</p>

						<div className="flex w-full items-center gap-1.5 rounded-lg border border-border bg-bg-neutral px-3 py-2">
							<code className="min-w-0 flex-1 truncate text-xs text-text-secondary">{link}</code>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7 shrink-0"
								onClick={copiarLink}
								aria-label="Copiar link da etiqueta"
								title="Copiar link"
							>
								<Copy className="size-3.5" />
							</Button>
						</div>
						{copiado && <p className="-mt-2 text-xs font-medium text-success">Link copiado.</p>}

						<Button type="button" variant="outline" className="w-full gap-2" asChild>
							<a href={link} target="_blank" rel="noreferrer">
								<ExternalLink className="size-4" />
								Abrir etiqueta pública
							</a>
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
