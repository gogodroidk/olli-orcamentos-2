/**
 * CONFIRMAR EXCLUSÃO — o diálogo que aparece antes de todo `useExcluir`.
 *
 * Duas regras de honestidade, e as duas já custaram caro neste projeto:
 *
 * 1. DIZ O QUE VAI SUMIR, PELO NOME. "Tem certeza?" não é confirmação de nada: o
 *    usuário não sabe se clicou na linha certa. Aqui o nome do registro aparece
 *    em destaque — se estiver errado, ele vê ANTES de confirmar.
 *
 * 2. NÃO MENTE SOBRE O QUE ACONTECE. No OLLI, excluir é SOFT DELETE (carimba
 *    `excluidoEm`): o registro vai para a LIXEIRA e pode voltar. Um texto tipo
 *    "esta ação não pode ser desfeita" seria falso — e assustaria o usuário a
 *    ponto de ele não limpar a base. Dizemos exatamente o que é.
 *
 * O botão perigoso NÃO recebe o foco inicial (o "Cancelar" recebe): Enter reflexo
 * em cima de um diálogo que acabou de abrir não pode excluir nada.
 */
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	aoConfirmar: () => void;
	/** O NOME do registro (ex.: "Maria Souza", "Orçamento 00126"). É o que o usuário confere. */
	nome: string;
	/** O tipo, em minúsculas e no singular: "cliente", "orçamento", "produto"… */
	tipo?: string;
	/** Consequência extra que o usuário PRECISA saber (ex.: "os itens deste orçamento vão junto"). */
	aviso?: ReactNode;
	excluindo?: boolean;
	/** Erro da exclusão. Fica VISÍVEL no diálogo — em toast, some e o usuário acha que excluiu. */
	erro?: string | null;
}

export default function ConfirmarExclusao({
	aberto,
	aoFechar,
	aoConfirmar,
	nome,
	tipo = "registro",
	aviso,
	excluindo,
	erro,
}: Props) {
	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && !excluindo && aoFechar()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div
							aria-hidden="true"
							className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-error/10"
						>
							<AlertTriangle className="size-5 text-error" />
						</div>
						<div className="min-w-0 pt-0.5">
							<DialogTitle className="text-left">Excluir {tipo}?</DialogTitle>
						</div>
					</div>
				</DialogHeader>

				{/* O QUE vai ser excluído — em destaque, para conferir antes de clicar. */}
				<div className="rounded-lg border border-border bg-bg-neutral/50 px-3 py-2.5">
					<p className="text-[11px] uppercase tracking-wide text-text-disabled">{tipo}</p>
					<p className="mt-0.5 truncate font-medium text-text-primary" title={nome}>
						{nome || "(sem nome)"}
					</p>
				</div>

				<p className="text-sm text-text-secondary">
					Ele vai para a <strong className="font-medium text-text-primary">lixeira</strong> — não some para sempre, e
					você pode restaurá-lo depois. Enquanto estiver lá, ele some das listas e dos relatórios.
				</p>

				{aviso && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">{aviso}</p>}

				{erro && (
					<p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error">
						{erro}
					</p>
				)}

				<DialogFooter>
					{/* Foco inicial no CANCELAR — ver cabeçalho. */}
					<Button type="button" variant="outline" onClick={aoFechar} disabled={excluindo} autoFocus>
						Cancelar
					</Button>
					<Button type="button" variant="destructive" onClick={aoConfirmar} disabled={excluindo}>
						{excluindo ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
						{excluindo ? "Excluindo…" : "Excluir"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
