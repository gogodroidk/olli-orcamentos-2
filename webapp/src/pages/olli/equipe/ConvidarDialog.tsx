/**
 * Diálogo "Convidar" — não é um "em breve" solto: explica exatamente onde o
 * convite acontece hoje (app OLLI, celular) e por quê. O fluxo de convite real
 * (gerar token, enviar por WhatsApp/e-mail) vive no app; aqui é só a ponte.
 */
import { Smartphone, UserPlus } from "lucide-react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { PAPEL_LABEL } from "./useEquipe";

interface Props {
	aberto: boolean;
	aoFechar: () => void;
}

export default function ConvidarDialog({ aberto, aoFechar }: Props) {
	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
			<DialogContent>
				<DialogHeader>
					<div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10">
						<UserPlus className="size-5 text-primary" aria-hidden="true" />
					</div>
					<DialogTitle className="mt-1">Convidar para a equipe</DialogTitle>
					<DialogDescription>
						O convite é enviado pelo aplicativo OLLI no celular — é lá que dá para gerar o link e
						escolher o papel de quem está entrando.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 rounded-xl border border-border bg-bg-neutral/40 p-4 text-sm">
					<div className="flex items-start gap-3">
						<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
							1
						</div>
						<p className="text-text-secondary">
							Abra o app OLLI no celular e vá em <span className="font-medium text-text-primary">Equipe</span>.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
							2
						</div>
						<p className="text-text-secondary">
							Toque em <span className="font-medium text-text-primary">Convidar</span> e escolha o papel:{" "}
							{PAPEL_LABEL.admin}, {PAPEL_LABEL.gestor} ou {PAPEL_LABEL.tecnico}.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
							3
						</div>
						<p className="text-text-secondary">
							Compartilhe o link gerado por WhatsApp — a pessoa entra assim que aceitar.
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 rounded-lg bg-info/10 px-3 py-2.5 text-xs text-info-dark dark:text-info-light">
					<Smartphone className="size-4 shrink-0" aria-hidden="true" />
					Assim que a pessoa aceitar, ela aparece aqui na lista automaticamente.
				</div>

				<DialogFooter>
					<Button type="button" onClick={aoFechar}>
						Entendi
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
