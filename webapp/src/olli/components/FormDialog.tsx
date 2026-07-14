import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/dialog";
import { ScrollArea } from "@/ui/scroll-area";

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	titulo: string;
	descricao?: string;
	/** Mensagem de erro da gravação. Fica VISÍVEL — não some num toast que o usuário perde. */
	erro?: string | null;
	salvando?: boolean;
	/** id do <form> que este rodapé submete (o form fica no corpo). */
	formId: string;
	rotuloSalvar?: string;
	children: ReactNode;
	/** Largura maior para formulários densos (ex.: orçamento com itens). */
	largo?: boolean;
}

/**
 * Casca padrão de todo formulário do painel.
 *
 * Decisões que valem para as 8 telas:
 * - O erro de gravação aparece DENTRO do diálogo, junto do botão. Erro em toast
 *   some sozinho e o usuário fica achando que salvou.
 * - Enquanto salva, o botão trava e mostra o estado — sem isso o usuário clica
 *   duas vezes e cria dois registros.
 * - O corpo rola, o rodapé não: em tela de notebook o botão "Salvar" tem que
 *   continuar alcançável num formulário longo.
 * - Sem animação decorativa: painel denso pede motion funcional (regra do perfil).
 */
export default function FormDialog({
	aberto,
	aoFechar,
	titulo,
	descricao,
	erro,
	salvando,
	formId,
	rotuloSalvar = "Salvar",
	children,
	largo,
}: Props) {
	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && !salvando && aoFechar()}>
			<DialogContent className={largo ? "max-w-3xl" : "max-w-lg"}>
				<DialogHeader>
					<DialogTitle>{titulo}</DialogTitle>
					{descricao && <DialogDescription>{descricao}</DialogDescription>}
				</DialogHeader>

				<ScrollArea className="max-h-[65vh] pr-3">
					<div className="px-0.5 pb-1">{children}</div>
				</ScrollArea>

				{erro && (
					<p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error">
						{erro}
					</p>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={aoFechar} disabled={salvando}>
						Cancelar
					</Button>
					<Button type="submit" form={formId} disabled={salvando}>
						{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
						{salvando ? "Salvando…" : rotuloSalvar}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
