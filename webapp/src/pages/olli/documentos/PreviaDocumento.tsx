import { Printer } from "lucide-react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";

interface Props {
	aberto: boolean;
	titulo: string;
	html: string;
	imprimindo?: boolean;
	aoFechar: () => void;
	aoImprimir: () => void;
}

/** Prévia do mesmo HTML que a impressão usa. O iframe não navega: é só o papel. */
export function PreviaDocumento({ aberto, titulo, html, imprimindo, aoFechar, aoImprimir }: Props) {
	return (
		<Dialog open={aberto} onOpenChange={(abertoAgora) => !abertoAgora && !imprimindo && aoFechar()}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{titulo}</DialogTitle>
					<DialogDescription>É o documento que vai para a impressão. Nada aqui é um modelo diferente.</DialogDescription>
				</DialogHeader>
				<iframe title={titulo} srcDoc={html} sandbox="" className="h-[70vh] w-full rounded-md border border-border bg-white" />
				<DialogFooter>
					<Button type="button" variant="outline" onClick={aoFechar} disabled={imprimindo}>Fechar</Button>
					<Button type="button" onClick={aoImprimir} disabled={imprimindo || !html} className="gap-2">
						<Printer className="size-4" />
						{imprimindo ? "Preparando…" : "Imprimir"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
