/**
 * O CARD DO QUADRO — número, cliente, valor e há quantos dias está parado.
 *
 * ACESSIBILIDADE (regra 10): arrastar NÃO é o único caminho. Todo card tem o menu
 * "Mover para", que faz exatamente a mesma gravação — é o caminho do teclado, do
 * leitor de tela e do celular (onde arrastar entre colunas roladas é sofrível).
 * Por isso o arraste mora numa ALÇA dedicada, e não no card inteiro: se o card
 * todo fosse o alvo do drag, o Enter/Espaço em cima dele iniciaria um arraste em
 * vez de abrir o menu, e o botão do menu ficaria inalcançável pelo teclado.
 *
 * O card "fantasma" do DragOverlay (`CartaoFantasma`) é um componente SEPARADO e sem
 * hooks: se ele chamasse `useDraggable` com o mesmo id do card real, haveria dois
 * draggables com o mesmo id registrados no dnd-kit ao mesmo tempo.
 */
import { useDraggable } from "@dnd-kit/core";
import type { StatusOrcamento } from "@dominio";
import { Check, Clock, GripVertical, Loader2, MoreVertical } from "lucide-react";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { cn } from "@/utils";
import {
	blobDoCartao,
	BRL,
	type Cartao,
	COLUNAS,
	type Coluna,
	DIAS_DE_ALERTA,
	rotuloDoStatus,
	rotuloParado,
} from "../utils/colunas";

/** Só alerta no MEIO do funil: um orçamento aprovado ou perdido há 40 dias está parado
 *  por bem — pintar de laranja seria alarme falso. */
function estaEsfriando(cartao: Cartao, coluna: Coluna): boolean {
	const emAndamento = coluna.id === "rascunho" || coluna.id === "enviado" || coluna.id === "negociacao";
	return emAndamento && cartao.diasParado !== null && cartao.diasParado >= DIAS_DE_ALERTA;
}

/** Número + valor + cliente + dias parado. O conteúdo, sem nada de arrastar. */
function Miolo({ cartao, coluna, salvando }: { cartao: Cartao; coluna: Coluna; salvando?: boolean }) {
	const esfriando = estaEsfriando(cartao, coluna);

	return (
		<div className="min-w-0 flex-1">
			<div className="flex items-baseline justify-between gap-2">
				<span className="truncate font-mono text-xs font-semibold text-text-secondary">{cartao.numero}</span>
				<span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">
					{cartao.valor === null ? (
						<>
							{/* Valor desconhecido é "—", jamais "R$ 0,00": zero fingido encolhe o funil. */}
							<span aria-hidden>—</span>
							<span className="sr-only">valor não informado</span>
						</>
					) : (
						BRL.format(cartao.valor)
					)}
				</span>
			</div>

			<div className="mt-1 line-clamp-1 text-sm font-medium text-text-primary">{cartao.cliente}</div>

			<div className="mt-1.5 flex items-center gap-1 text-xs">
				{salvando ? (
					<>
						<Loader2 className="size-3 animate-spin text-text-disabled" aria-hidden />
						<span className="text-text-secondary">Salvando…</span>
					</>
				) : (
					<>
						<Clock
							className={cn("size-3", esfriando ? "text-warning-darker dark:text-warning" : "text-text-disabled")}
							aria-hidden
						/>
						<span
							className={cn(esfriando ? "font-medium text-warning-darker dark:text-warning" : "text-text-secondary")}
						>
							{rotuloParado(cartao.diasParado)}
						</span>
						<span className="sr-only">sem movimentação. Status atual: {rotuloDoStatus(cartao.status)}.</span>
					</>
				)}
			</div>
		</div>
	);
}

const CASCA = "rounded-lg border border-l-4 bg-card p-2.5 shadow-sm";

type Props = {
	cartao: Cartao;
	coluna: Coluna;
	/** Gravação em voo: o card fica travado, mas continua visível e legível. */
	salvando?: boolean;
	onMover: (cartao: Cartao, novoStatus: StatusOrcamento) => void;
	/** Abre o mesmo editor da lista de Orçamentos sobre este card. Só chamado quando
	 *  há blob (ver `blobDoCartao`) — sem documento não há o que editar. */
	onAbrir: (cartao: Cartao) => void;
};

export default function TaskCard({ cartao, coluna, salvando, onMover, onAbrir }: Props) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
		id: cartao.id,
		data: { colunaId: coluna.id },
		disabled: salvando,
	});
	// Sem blob (linha corrompida/legada) não há documento para abrir — mesma trava da
	// lista de Orçamentos (`MenuDaLinha`): o corpo fica visível, mas não clicável.
	const temBlob = blobDoCartao(cartao) !== null;

	return (
		<div
			ref={setNodeRef}
			aria-busy={salvando || undefined}
			className={cn(CASCA, coluna.faixa, isDragging && "opacity-40", salvando && "opacity-70")}
		>
			<div className="flex items-start gap-1.5">
				<button
					type="button"
					ref={setActivatorNodeRef}
					{...listeners}
					{...attributes}
					aria-label={`Arrastar orçamento ${cartao.numero}. Ou use o menu Mover para.`}
					disabled={salvando}
					className={cn(
						"-ml-1 mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-text-secondary",
						"hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
						"active:cursor-grabbing disabled:cursor-not-allowed",
					)}
				>
					<GripVertical className="size-4" aria-hidden />
				</button>

				{temBlob ? (
					<button
						type="button"
						onClick={() => onAbrir(cartao)}
						disabled={salvando}
						aria-label={`Abrir orçamento ${cartao.numero} para editar`}
						className={cn(
							"min-w-0 flex-1 rounded text-left",
							"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
							"disabled:cursor-not-allowed",
						)}
					>
						<Miolo cartao={cartao} coluna={coluna} salvando={salvando} />
					</button>
				) : (
					<Miolo cartao={cartao} coluna={coluna} salvando={salvando} />
				)}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							disabled={salvando}
							aria-label={`Mover ${cartao.numero} para outro estágio`}
							className="-mr-1 size-7 shrink-0 text-text-secondary hover:text-text-primary"
						>
							<MoreVertical className="size-4" aria-hidden />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>Mover para</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{/* Os 10 status, agrupados pela coluna que os abriga. O arraste só consegue
						    expressar o status canônico de cada coluna (soltar em "Enviado" grava
						    `enviado`); o menu devolve a precisão que falta — sem ele não haveria como
						    registrar "Aguardando assinatura" ou "Expirado" pelo painel. */}
						{COLUNAS.map((c) => (
							<div key={c.id}>
								<DropdownMenuLabel className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-text-disabled">
									{c.titulo}
								</DropdownMenuLabel>
								{c.status.map((s) => {
									const atual = s === cartao.status;
									return (
										<DropdownMenuItem key={s} disabled={atual} onSelect={() => onMover(cartao, s)} className="gap-2">
											<span className={cn("size-1.5 shrink-0 rounded-full", c.ponto)} aria-hidden />
											<span className="flex-1">{rotuloDoStatus(s)}</span>
											{atual && <Check className="size-3.5 text-text-secondary" aria-label="status atual" />}
										</DropdownMenuItem>
									);
								})}
							</div>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

/** O card que segue o cursor durante o arraste. Só visual — sem hook, sem menu. */
export function CartaoFantasma({ cartao, coluna }: { cartao: Cartao; coluna: Coluna }) {
	return (
		<div className={cn(CASCA, coluna.faixa, "rotate-1 cursor-grabbing shadow-lg")}>
			<div className="flex items-start gap-1.5">
				<GripVertical className="-ml-0.5 mt-0.5 size-4 shrink-0 text-text-disabled" aria-hidden />
				<Miolo cartao={cartao} coluna={coluna} />
				{/* Espaço do botão de menu, para o fantasma ter a mesma largura do card real. */}
				<span className="size-7 shrink-0" aria-hidden />
			</div>
		</div>
	);
}
