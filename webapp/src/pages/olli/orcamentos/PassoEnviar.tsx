/**
 * PASSO "ENVIAR PARA O CLIENTE" — abre logo depois de "Criar orçamento" (CQ-ATIVACAO-LOTE1, achado 2).
 *
 * Antes: o editor fechava e a pessoa caía na lista, sem nada dizendo "agora envie". 4 dos 9 que
 * orçaram e não enviaram tiveram "criou orçamento" como último evento da conta. No app, a mesma
 * ação abre a tela do orçamento, onde está o enviar; aqui o painel passa a fazer o mesmo.
 *
 * Vale para TODO orçamento novo em rascunho (regra em `abrePassoEnviarAposSalvar`), não só o 1º:
 * enviar é sempre o próximo passo, e quem não quer agora fecha com 1 toque ("Agora não") ou Esc.
 *
 * As 3 ações REUSAM o que o painel já tem: o envio pelo WhatsApp (`useEnviarWhatsApp`, que também
 * pede o número se faltar), o mesmo fluxo no modo "copiar link" e o PDF da lista (`verPdf`).
 * Sem animação própria: o Dialog do design system já respeita `prefers-reduced-motion`.
 */
import type { Orcamento } from "@dominio";
import { CheckCircle2, FileText, Link2, MessageCircle } from "lucide-react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";

interface Props {
	orcamento: Orcamento | null;
	aoFechar: () => void;
	aoWhatsApp: (o: Orcamento) => void;
	aoCopiarLink: (o: Orcamento) => void;
	aoVerPdf: (o: Orcamento) => void;
}

const ACAO = "h-auto min-h-[52px] w-full justify-start gap-3 px-4 py-3 text-left";

export default function PassoEnviar({ orcamento, aoFechar, aoWhatsApp, aoCopiarLink, aoVerPdf }: Props) {
	const nome = orcamento?.clienteNome?.trim() || "o cliente";
	// Cada ação fecha este passo ANTES de abrir a próxima janela (dois diálogos empilhados confundem).
	const agir = (fn: (o: Orcamento) => void) => () => {
		if (!orcamento) return;
		aoFechar();
		fn(orcamento);
	};

	return (
		<Dialog open={!!orcamento} onOpenChange={(aberto) => !aberto && aoFechar()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success" />
						Orçamento {orcamento?.numero ? `${orcamento.numero} ` : ""}criado
					</DialogTitle>
					<DialogDescription>
						Agora envie para {nome}. O cliente recebe um link, confere e aprova com um toque.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-2">
					<Button type="button" className={ACAO} autoFocus onClick={agir(aoWhatsApp)}>
						<MessageCircle aria-hidden="true" className="size-5 shrink-0" />
						<span className="flex flex-col">
							<span className="font-semibold">Enviar pelo WhatsApp</span>
							<span className="text-xs font-normal opacity-90">A mensagem já vai pronta, com o link.</span>
						</span>
					</Button>
					<Button type="button" variant="outline" className={ACAO} onClick={agir(aoCopiarLink)}>
						<Link2 aria-hidden="true" className="size-5 shrink-0" />
						<span className="flex flex-col">
							<span className="font-semibold">Copiar link</span>
							<span className="text-xs font-normal text-text-secondary">
								Para mandar por onde quiser. Não precisa do número.
							</span>
						</span>
					</Button>
					<Button type="button" variant="outline" className={ACAO} onClick={agir(aoVerPdf)}>
						<FileText aria-hidden="true" className="size-5 shrink-0" />
						<span className="flex flex-col">
							<span className="font-semibold">Ver PDF</span>
							<span className="text-xs font-normal text-text-secondary">Confira como o documento ficou.</span>
						</span>
					</Button>
				</div>

				<DialogFooter>
					<Button type="button" variant="ghost" className="min-h-[44px] sm:min-h-9" onClick={aoFechar}>
						Agora não
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
