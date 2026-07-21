/**
 * O CARD DO QUADRO — número, cliente, valor e há quantos dias está parado.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POR QUE O LAYOUT É EM 3 LINHAS, E NÃO "ALÇA | CONTEÚDO | MENU"
 * ═══════════════════════════════════════════════════════════════════════════════
 * Antes, a alça e o menu ficavam em colunas laterais que atravessavam o card de cima
 * a baixo: o NOME DO CLIENTE — a única coisa que o dono realmente lê para reconhecer
 * o orçamento — perdia ~56px de largura em TODAS as linhas, mesmo estando sozinho na
 * dele. Numa coluna de ~190px (a largura em que as 5 colunas cabem num notebook de
 * 1366) isso é a diferença entre ler "Condomínio Vila Nova" e ler "Condomínio Vil…".
 *
 * Agora a alça e o menu dividem só a PRIMEIRA linha, com o número (que tem 5
 * caracteres — `00126`, ver `proximoNumeroDocumento` em `@/olli/mutacoes`). O nome do
 * cliente ocupa a largura inteira do card, e valor e dias parados dividem o rodapé.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ACESSIBILIDADE (regra 10): arrastar NÃO é o único caminho
 * ═══════════════════════════════════════════════════════════════════════════════
 * Todo card tem o menu "Mover para", que faz exatamente a mesma gravação — é o
 * caminho do teclado, do leitor de tela e do celular (onde arrastar entre colunas
 * roladas é sofrível). Por isso o arraste mora numa ALÇA dedicada, e não no card
 * inteiro: se o card todo fosse o alvo do drag, o Enter/Espaço em cima dele iniciaria
 * um arraste em vez de abrir o menu, e o botão do menu ficaria inalcançável pelo
 * teclado.
 *
 * A CONSEQUÊNCIA DE ARRASTAR SÓ PELA ALÇA, e como ela é paga: quem tenta arrastar
 * pelo CORPO do card não move nada — e, ao soltar, o `click` abriria o editor do
 * orçamento na cara do usuário, que só queria mudar de coluna. Por isso o alvo de
 * clique ignora o evento quando o ponteiro andou mais que `TOLERANCIA_DE_CLIQUE`
 * entre o `pointerdown` e o `click`: gesto de arraste frustrado não vira formulário
 * aberto por engano. Teclado não é afetado (o `click` do Enter não tem `pointerdown`).
 *
 * O card "fantasma" do DragOverlay (`CartaoFantasma`) é um componente SEPARADO e sem
 * hooks: se ele chamasse `useDraggable` com o mesmo id do card real, haveria dois
 * draggables com o mesmo id registrados no dnd-kit ao mesmo tempo.
 */
import { useDraggable } from "@dnd-kit/core";
import type { StatusOrcamento } from "@dominio";
import { Check, Clock, GripVertical, Loader2, MoreVertical } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useRef } from "react";
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
	BRL,
	blobDoCartao,
	type Cartao,
	COLUNAS,
	type Coluna,
	DIAS_DE_ALERTA,
	rotuloDoStatus,
	rotuloParado,
} from "../utils/colunas";

/** Quantos px o ponteiro pode andar entre apertar e soltar e ainda ser "um clique". */
const TOLERANCIA_DE_CLIQUE = 10;

/** Só alerta no MEIO do funil: um orçamento aprovado ou perdido há 40 dias está parado
 *  por bem — pintar de laranja seria alarme falso. */
function estaEsfriando(cartao: Cartao, coluna: Coluna): boolean {
	const emAndamento = coluna.id === "rascunho" || coluna.id === "enviado" || coluna.id === "negociacao";
	return emAndamento && cartao.diasParado !== null && cartao.diasParado >= DIAS_DE_ALERTA;
}

/** Cliente + rodapé (dias parados e valor). O conteúdo, sem nada de arrastar. */
function Miolo({ cartao, coluna, salvando }: { cartao: Cartao; coluna: Coluna; salvando?: boolean }) {
	const esfriando = estaEsfriando(cartao, coluna);

	return (
		<>
			<div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-text-primary">{cartao.cliente}</div>

			<div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
				{salvando ? (
					<span className="flex min-w-0 items-center gap-1">
						<Loader2 className="size-3 shrink-0 animate-spin text-text-disabled motion-reduce:animate-none" aria-hidden />
						<span className="truncate text-text-secondary">Salvando…</span>
					</span>
				) : (
					<span className="flex min-w-0 items-center gap-1">
						<Clock
							className={cn(
								"size-3 shrink-0",
								esfriando ? "text-warning-darker dark:text-warning" : "text-text-disabled",
							)}
							aria-hidden
						/>
						<span
							className={cn(
								"truncate",
								esfriando ? "font-medium text-warning-darker dark:text-warning" : "text-text-secondary",
							)}
						>
							{rotuloParado(cartao.diasParado)}
						</span>
						<span className="sr-only">sem movimentação. Status atual: {rotuloDoStatus(cartao.status)}.</span>
					</span>
				)}

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
		</>
	);
}

const CASCA = "relative rounded-lg border border-l-4 bg-card p-2 shadow-sm";

/**
 * A ALÇA. Ela é a única coisa na tela que diz "isto se arrasta", então parece um
 * controle mesmo parada: fundo próprio, `cursor-grab` e um `title` que explica o
 * gesto no hover. O `after` invisível estica o alvo de toque para 44px (regra de
 * movimento do projeto) sem inchar o desenho num card de ~170px de largura.
 */
const ALCA =
	"relative flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md " +
	"bg-muted/70 text-text-secondary transition-colors hover:bg-muted hover:text-text-primary " +
	"after:absolute after:-inset-2 after:content-[''] " +
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
	"active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
	cartao: Cartao;
	coluna: Coluna;
	/** Gravação em voo: o card fica travado, mas continua visível e legível. */
	salvando?: boolean;
	/** Enquanto a dica de primeira vez está na tela, UMA alça pisca para ser achada. */
	destaque?: boolean;
	onMover: (cartao: Cartao, novoStatus: StatusOrcamento) => void;
	/** Abre o mesmo editor da lista de Orçamentos sobre este card. Só chamado quando
	 *  há blob (ver `blobDoCartao`) — sem documento não há o que editar. */
	onAbrir: (cartao: Cartao) => void;
};

export default function TaskCard({ cartao, coluna, salvando, destaque, onMover, onAbrir }: Props) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
		id: cartao.id,
		data: { colunaId: coluna.id },
		disabled: salvando,
	});
	// Sem blob (linha corrompida/legada) não há documento para abrir — mesma trava da
	// lista de Orçamentos (`MenuDaLinha`): o corpo fica visível, mas não clicável.
	const temBlob = blobDoCartao(cartao) !== null;

	/** Onde o ponteiro apertou, para separar clique de tentativa de arraste (ver topo). */
	const apertouEm = useRef<{ x: number; y: number } | null>(null);

	const aoApertar = (e: ReactPointerEvent<HTMLButtonElement>) => {
		apertouEm.current = { x: e.clientX, y: e.clientY };
	};

	const aoClicar = (e: { clientX: number; clientY: number }) => {
		const inicio = apertouEm.current;
		apertouEm.current = null;
		if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > TOLERANCIA_DE_CLIQUE) return;
		onAbrir(cartao);
	};

	return (
		<div
			ref={setNodeRef}
			aria-busy={salvando || undefined}
			className={cn(CASCA, coluna.faixa, isDragging && "opacity-40", salvando && "opacity-70")}
		>
			{/* O card inteiro abre o orçamento. Fica ATRÁS dos controles (a alça e o menu
			    sobem com `z-10`), então clicar neles nunca abre o editor por tabela. */}
			{temBlob && (
				<button
					type="button"
					onPointerDown={aoApertar}
					onClick={aoClicar}
					disabled={salvando}
					aria-label={`Abrir orçamento ${cartao.numero} para editar`}
					className={cn(
						"absolute inset-0 z-0 cursor-pointer rounded-lg",
						"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
						"disabled:cursor-not-allowed",
					)}
				/>
			)}

			{/* O conteúdo não intercepta ponteiro: o clique atravessa para o alvo acima.
			    Só a alça e o menu voltam a receber (`pointer-events-auto`). */}
			<div className="pointer-events-none relative z-10">
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						ref={setActivatorNodeRef}
						{...listeners}
						{...attributes}
						title="Arraste para outra coluna"
						aria-label={`Arrastar orçamento ${cartao.numero} para outra coluna. Ou use o menu Mover para.`}
						disabled={salvando}
						className={cn(
							"pointer-events-auto",
							ALCA,
							destaque && "bg-primary/15 text-primary ring-2 ring-primary/50 motion-safe:animate-pulse",
						)}
					>
						<GripVertical className="size-4" aria-hidden />
					</button>

					<span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-secondary">
						{cartao.numero}
					</span>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								disabled={salvando}
								aria-label={`Mover ${cartao.numero} para outro estágio`}
								title="Mover para outro estágio"
								className={cn(
									"pointer-events-auto relative size-7 shrink-0 text-text-secondary hover:text-text-primary",
									// Mesmo alvo de toque de 44px da alça, sem crescer no desenho.
									"after:absolute after:-inset-2 after:content-['']",
								)}
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

				<Miolo cartao={cartao} coluna={coluna} salvando={salvando} />
			</div>
		</div>
	);
}

/** O card que segue o cursor durante o arraste. Só visual — sem hook, sem menu. */
export function CartaoFantasma({ cartao, coluna }: { cartao: Cartao; coluna: Coluna }) {
	return (
		<div className={cn(CASCA, coluna.faixa, "rotate-1 cursor-grabbing shadow-lg")}>
			<div className="flex items-center gap-1.5">
				<span className={cn(ALCA, "cursor-grabbing")} aria-hidden>
					<GripVertical className="size-4" />
				</span>
				<span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-secondary">
					{cartao.numero}
				</span>
				{/* Espaço do botão de menu, para o fantasma ter a mesma largura do card real. */}
				<span className="size-7 shrink-0" aria-hidden />
			</div>
			<Miolo cartao={cartao} coluna={coluna} />
		</div>
	);
}
