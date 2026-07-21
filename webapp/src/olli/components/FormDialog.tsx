import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
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
	/**
	 * Guarda opcional contra descarte acidental: devolve true quando o formulário
	 * tem alteração NÃO SALVA. Se fornecida e "suja", Esc/clique-fora/Cancelar
	 * pedem confirmação antes de descartar. Opcional de propósito: cliente e
	 * equipamento não precisam de confirmação; o orçamento (o documento que vira
	 * dinheiro) precisa.
	 */
	confirmarSeSujo?: () => boolean;
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
	confirmarSeSujo,
}: Props) {
	// Fechar SEM salvar (Esc, clique-fora, X, Cancelar) passa por aqui. Durante o
	// salvamento nada fecha (comportamento que já existia). Com alteração não
	// salva, pedimos confirmação — um Esc distraído não pode apagar em silêncio
	// um orçamento preenchido. `window.confirm` de propósito: bloqueante e
	// síncrono (o retorno decide o onOpenChange na hora), zero componente novo.
	// O fluxo de SALVAR não passa por aqui: no sucesso, o formulário chama
	// `aoFechar()` direto — a guarda nunca atrapalha quem salvou.
	const fecharComGuarda = () => {
		if (salvando) return;
		if (confirmarSeSujo?.() && !window.confirm("Você tem alterações não salvas. Descartar mesmo assim?")) {
			return;
		}
		aoFechar();
	};

	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && fecharComGuarda()}>
			{/*
			 * TETO DE ALTURA + rolagem do diálogo inteiro — isto é o que salva o
			 * formulário quando o TECLADO do celular sobe.
			 *
			 * O `DialogContent` do shadcn nasce com `max-height: none` (medido) e fica
			 * `fixed top-1/2 -translate-y-1/2`: centrado, sem limite e sem rolagem
			 * própria. Só a ScrollArea do corpo rolava. Medido no navegador a 375 × 360
			 * (celular com o teclado aberto), o diálogo "Novo cliente" ficava com 423px
			 * de altura e sobrava 32px para CIMA e 32px para BAIXO — o TÍTULO ficava em
			 * y = -8, fora da tela e sem como trazer de volta, porque o que rola é o
			 * corpo, não o diálogo.
			 *
			 * `dvh` (não `vh`): é a unidade que acompanha o teclado subindo.
			 * `overflow-y-auto` é a rede: se mesmo assim não couber, o diálogo inteiro
			 * rola e o título e o "Salvar" continuam alcançáveis.
			 */}
			<DialogContent className={`max-h-[calc(100dvh-1.5rem)] overflow-y-auto ${largo ? "max-w-3xl" : "max-w-lg"}`}>
				<DialogHeader>
					<DialogTitle>{titulo}</DialogTitle>
					{descricao && <DialogDescription>{descricao}</DialogDescription>}
				</DialogHeader>

				{/* `dvh` no lugar de `vh`: com o teclado aberto, `vh` continua contando a
				    tela inteira em navegador que não encolhe o viewport de layout, e o
				    corpo pedia altura que não existia mais.
				    (Tentei também trocar por `flex-1 min-h-0` para o corpo encolher
				    sozinho; não serve: o Viewport do ScrollArea daqui usa `asChild` +
				    `h-full`, e medido no navegador o `height:100%` não resolveu contra a
				    altura vinda do flex — a raiz ficou com 121px e o viewport com 690px,
				    ou seja, campo cortado e inalcançável. Por isso o teto fica no
				    diálogo, com o rodapé grudado.) */}
				<ScrollArea className="max-h-[65dvh] pr-3">
					<div className="px-0.5 pb-1">{children}</div>
				</ScrollArea>

				{erro && (
					<p
						role="alert"
						className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error-dark dark:text-error"
					>
						{erro}
					</p>
				)}

				{/* Rodapé GRUDADO no fim do diálogo: como quem rola agora é o diálogo
				    inteiro (teto acima), sem `sticky` o "Salvar" descia junto e sumia —
				    medido a 375 × 360, ele ficava fora da tela. Com `sticky bottom-0` o
				    botão fica sempre à vista, que era a promessa original. */}
				<DialogFooter className="sticky bottom-0 -mb-2 bg-background pb-2">
					<Button type="button" variant="outline" onClick={fecharComGuarda} disabled={salvando}>
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
