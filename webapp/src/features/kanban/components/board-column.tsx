/**
 * A COLUNA — cabeçalho com CONTAGEM e SOMA em R$, e a pilha de cards.
 *
 * O cabeçalho nunca inventa dinheiro: se algum card da coluna está sem valor, a
 * soma aparece com um "+ ?" em vez de fingir que a coluna vale exatamente aquilo.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LARGURA: ELÁSTICA COM PISO, E NÃO 290px FIXOS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Com largura fixa de 290px as 5 colunas somavam ~1.500px e NÃO cabiam em notebook
 * nenhum: o dono via 3 colunas e meia e não tinha como saber que "Aprovado" existia
 * à direita. A conta real da largura disponível num 1366: 1366 − 260 (menu lateral)
 * − 64 (`px-8` do `<main>`) − 48 (`p-6` da página) − ~15 (barra de rolagem) ≈ 979px.
 *
 * Por isso cada coluna é `flex-1` com piso de {@link PISO_DA_COLUNA}: 5 × 180 + 4 × 8
 * de intervalo = 932px, então as cinco cabem em 1366 (e sobram em 1440), crescendo
 * até ocupar a tela inteira quando há espaço. Abaixo disso a régua não cede mais e o
 * quadro rola — com sinal visível de que rola (ver `useOverflowLateral`), porque
 * coluna espremida a 150px quebra o nome do cliente e piora tudo o que veio consertar.
 *
 * O piso NÃO pode ser reduzido sem antes medir o card: em 180px o nome do cliente
 * fica com ~152px úteis (≈ 20 caracteres por linha, em até 2 linhas). Foi para caber
 * nisso que a alça e o menu saíram das laterais do card (ver `task-card.tsx`).
 */
import { useDroppable } from "@dnd-kit/core";
import type { StatusOrcamento } from "@dominio";
import { Badge } from "@/ui/badge";
import { cn } from "@/utils";
import { BRL, type Cartao, type ColunaMontada } from "../utils/colunas";
import TaskCard from "./task-card";

/** Largura mínima da coluna em px. Ver o cabeçalho antes de mexer. */
export const PISO_DA_COLUNA = 180;

type Props = {
	montada: ColunaMontada;
	emVoo: ReadonlySet<string>;
	/** Card cuja alça pisca enquanto a dica de primeira vez está na tela. */
	destaqueId?: string | null;
	onMover: (cartao: Cartao, novoStatus: StatusOrcamento) => void;
	onAbrir: (cartao: Cartao) => void;
};

export default function BoardColumn({ montada, emVoo, destaqueId, onMover, onAbrir }: Props) {
	const { coluna, cartoes, soma, temSemValor } = montada;

	// "Outros" (status desconhecido) não tem status canônico para gravar — então não
	// aceita drop. Ela existe só para que NENHUM orçamento suma do quadro.
	const podeReceber = coluna.destino !== null;
	const { setNodeRef, isOver } = useDroppable({ id: coluna.id, disabled: !podeReceber });

	// `md:min-w-[180px]` é o PISO_DA_COLUNA escrito à mão: o Tailwind gera o CSS lendo
	// o código-fonte, então a classe precisa aparecer literal aqui.
	return (
		<section
			aria-label={coluna.titulo}
			className="flex w-full shrink-0 flex-col md:w-auto md:min-w-[180px] md:flex-1 md:shrink"
		>
			{/* Título e soma em duas linhas: numa coluna de 180px eles não cabem lado a
			    lado, e "Em negociação" truncado para "Em negocia…" é pior que uma linha a mais. */}
			<div className="mb-2 px-0.5">
				<div className="flex min-w-0 items-center gap-1.5">
					<span className={cn("size-2 shrink-0 rounded-full", coluna.ponto)} aria-hidden />
					<span className="truncate text-sm font-semibold text-text-primary">{coluna.titulo}</span>
					<Badge variant="secondary" className="pointer-events-none shrink-0 tabular-nums">
						{cartoes.length}
					</Badge>
				</div>
				<span className="mt-0.5 block truncate text-xs font-medium tabular-nums text-text-secondary">
					{BRL.format(soma)}
					{temSemValor && (
						<>
							<span aria-hidden> + ?</span>
							<span className="sr-only">, mais orçamentos sem valor informado</span>
						</>
					)}
				</span>
			</div>

			<div
				ref={setNodeRef}
				className={cn(
					"flex min-h-[140px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/40 p-2",
					// Motion funcional (regra 9): a cor só muda para dizer "pode soltar aqui".
					"transition-colors",
					isOver && podeReceber && "border-primary/50 bg-primary/5",
				)}
			>
				{cartoes.map((c) => (
					<TaskCard
						key={c.id}
						cartao={c}
						coluna={coluna}
						salvando={emVoo.has(c.id)}
						destaque={c.id === destaqueId}
						onMover={onMover}
						onAbrir={onAbrir}
					/>
				))}

				{cartoes.length === 0 && (
					<div className="grid flex-1 place-items-center px-2 py-6 text-center text-xs text-text-secondary">
						Nenhum orçamento aqui
					</div>
				)}
			</div>
		</section>
	);
}
