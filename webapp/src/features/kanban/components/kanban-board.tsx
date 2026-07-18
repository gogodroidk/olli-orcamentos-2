/**
 * QUADRO (funil) DE ORÇAMENTOS — dado real, gravação real.
 *
 * 3 ESTADOS (regra 8): carregando (esqueleto) · ERRO com "Tentar de novo" · vazio de
 * verdade. Erro NUNCA vira quadro vazio: um funil vazio por engano faz o dono achar
 * que não tem venda nenhuma.
 *
 * Arrastar entre colunas grava. NÃO existe reordenar dentro da coluna: não há coluna
 * de ordem no banco, então uma ordem "arrastada" morreria no F5 — exatamente a
 * mentira que este quadro veio consertar. A ordem é a última movimentação (mais
 * recente no topo), e isso está escrito na tela.
 */
import {
	type Announcements,
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	type ScreenReaderInstructions,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { Empresa, Orcamento } from "@dominio";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RotateCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useMinhaEmpresa } from "@/olli/data";
import FormOrcamento, { duplicarComoRascunho } from "@/pages/olli/orcamentos/FormOrcamento";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import { useDicaDeArraste } from "../hooks/useDicaDeArraste";
import { useOverflowLateral } from "../hooks/useOverflowLateral";
import { useQuadro } from "../hooks/useQuadro";
import { blobDoCartao, type Cartao, COLUNAS } from "../utils/colunas";
import { createRestrictToContainer } from "../utils/restrict-to-container";
import BoardColumn from "./board-column";
import DicaDeArraste from "./dica-arrastar";
import { CartaoFantasma } from "./task-card";

const ESQUELETO_CARDS = ["e1", "e2", "e3"];

/**
 * O SINAL DE "TEM MAIS COLUNA AQUI". Só existe quando existe coluna escondida daquele
 * lado (ver `useOverflowLateral`) — sombra permanente num quadro que cabe inteiro seria
 * uma seta apontando para o nada.
 *
 * É um BOTÃO, e não só a sombra do `TableOverflowHint`: mouse comum não tem rolagem
 * horizontal, e sem ele a única saída seria arrastar a barra de rolagem lá embaixo.
 * A sombra não recebe clique (`pointer-events-none`); só o botão recebe.
 *
 * MONTA E DESMONTA em vez de aparecer por `opacity` + `transition`: a versão com fade
 * ficou PRESA em `opacity: 0` num navegador que congela transições (medido aqui — a
 * classe já era `opacity-100` e o computado seguia 0). Um controle funcional não pode
 * depender de uma animação terminar para existir; quando ele não é necessário, ele
 * simplesmente não está na tela — e nem no caminho do Tab.
 */
function SetaDeRolagem({ lado, onClick }: { lado: "esquerda" | "direita"; onClick: () => void }) {
	const ehEsquerda = lado === "esquerda";
	const rotulo = ehEsquerda ? "Ver colunas à esquerda" : "Ver colunas à direita";
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-y-0 z-20 flex w-10 items-center pb-4",
				ehEsquerda ? "left-0 justify-start bg-gradient-to-r" : "right-0 justify-end bg-gradient-to-l",
				"from-background to-transparent",
			)}
		>
			<button
				type="button"
				onClick={onClick}
				aria-label={rotulo}
				title={rotulo}
				className={cn(
					"pointer-events-auto relative flex size-9 items-center justify-center rounded-full",
					"border border-border bg-card text-text-secondary shadow-md",
					// Desenho de 36px, alvo de toque de 44px — sem tapar mais card do que precisa.
					"after:absolute after:-inset-1 after:content-['']",
					"transition-colors hover:text-text-primary",
					"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
				)}
			>
				{ehEsquerda ? (
					<ChevronLeft className="size-5" aria-hidden />
				) : (
					<ChevronRight className="size-5" aria-hidden />
				)}
			</button>
		</div>
	);
}

/** Instruções e anúncios do drag em pt-BR: o dnd-kit fala inglês por padrão, e o
 *  leitor de tela é o único jeito de saber o que o arraste fez para quem não vê o quadro. */
const INSTRUCOES_LEITOR_DE_TELA: ScreenReaderInstructions = {
	draggable:
		"Para pegar um orçamento, pressione a barra de espaço. " +
		"Enquanto arrasta, use as setas do teclado para mover entre colunas. " +
		"Pressione espaço novamente para soltar na nova coluna, ou Esc para cancelar.",
};

export default function KanbanBoard() {
	const { colunas, total, isLoading, isError, error, refetch, mover, emVoo, erro, limparErro } = useQuadro();
	const { data: empresaLinha } = useMinhaEmpresa();
	// A `empresa` também é uma tabela de BLOB: o objeto de domínio vive em `dados`.
	const empresa = (empresaLinha?.dados as Empresa | undefined) ?? null;

	/** O editor aberto sobre um card do quadro — o MESMO FormOrcamento da lista de
	 *  Orçamentos, para não haver dois formulários com regras diferentes. */
	const [editor, setEditor] = useState<{ orc: Orcamento; ehNovo: boolean } | null>(null);

	/** Clique no corpo do card: só abre se houver blob (ver `blobDoCartao`) — sem
	 *  documento não há o que editar. */
	const abrirEditor = (cartao: Cartao) => {
		const blob = blobDoCartao(cartao);
		if (!blob) return;
		setEditor({ orc: blob, ehNovo: false });
	};

	/** Oferecido pelo FormOrcamento quando a edição está bloqueada (já enviado/aprovado):
	 *  duplica como rascunho novo, no lugar do editor atual. */
	const duplicar = (o: Orcamento) =>
		setEditor({ orc: duplicarComoRascunho(o, empresa?.validadeDiasPadrao), ehNovo: true });

	const [arrastando, setArrastando] = useState<string | null>(null);

	/** O quadro rola na horizontal quando as colunas não cabem — e isso precisa APARECER. */
	const { ref: refDoQuadro, obterElemento, antes, depois, rolar } = useOverflowLateral<HTMLDivElement>(colunas.length);

	/** Prende o card arrastado dentro da área do quadro. Estável: lê o container por ref. */
	const restringirAoQuadro = useMemo(() => createRestrictToContainer(obterElemento), [obterElemento]);

	/** A aula de arrastar: uma vez por navegador, e só quando há card para arrastar. */
	const dica = useDicaDeArraste(!isLoading && !isError && total > 0);

	/** Enquanto a dica está na tela, a alça do PRIMEIRO card pisca — a frase "pegue pela
	 *  alça" só ensina se o olho achar a alça de que ela fala. Uma só: piscar o quadro
	 *  inteiro seria ruído, não indicação. */
	const destaqueId = useMemo(() => {
		if (!dica.visivel || dica.saindo) return null;
		return colunas.find((c) => c.cartoes.length > 0)?.cartoes[0]?.id ?? null;
	}, [dica.visivel, dica.saindo, colunas]);

	const sensores = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor),
	);

	const emArraste = useMemo(() => {
		if (!arrastando) return null;
		for (const c of colunas) {
			const achado = c.cartoes.find((x) => x.id === arrastando);
			if (achado) return { cartao: achado, coluna: c.coluna };
		}
		return null;
	}, [arrastando, colunas]);

	/** Número do orçamento pelo id do card, e título da coluna pelo id da coluna —
	 *  para os anúncios de leitor de tela falarem a língua do usuário, não o id técnico. */
	const numeroDoCartao = (id: string) => colunas.flatMap((c) => c.cartoes).find((c) => c.id === id)?.numero ?? id;
	const tituloDaColuna = (id: string) => COLUNAS.find((c) => c.id === id)?.titulo ?? id;

	const anuncios: Announcements = useMemo(
		() => ({
			onDragStart: ({ active }) => `Orçamento ${numeroDoCartao(String(active.id))} selecionado para arrastar.`,
			onDragOver: ({ active, over }: DragOverEvent) =>
				over
					? `Orçamento ${numeroDoCartao(String(active.id))} sobre a coluna ${tituloDaColuna(String(over.id))}.`
					: `Orçamento ${numeroDoCartao(String(active.id))} fora de qualquer coluna.`,
			onDragEnd: ({ active, over }) =>
				over
					? `Orçamento ${numeroDoCartao(String(active.id))} solto na coluna ${tituloDaColuna(String(over.id))}.`
					: `Orçamento ${numeroDoCartao(String(active.id))} solto fora de uma coluna. Nada foi movido.`,
			onDragCancel: ({ active }) =>
				`Arraste cancelado. Orçamento ${numeroDoCartao(String(active.id))} voltou ao lugar.`,
		}),
		[colunas],
	);

	const aoSoltar = (evento: DragEndEvent) => {
		setArrastando(null);
		const { active, over } = evento;
		if (!over) return;

		const origem = active.data.current?.colunaId as string | undefined;
		const destinoId = String(over.id);
		if (!origem || origem === destinoId) return; // soltou na própria coluna: nada muda.

		const destino = COLUNAS.find((c) => c.id === destinoId);
		if (!destino?.destino) return; // "Outros" não recebe (ver board-column).

		const cartao = colunas.flatMap((c) => c.cartoes).find((c) => c.id === String(active.id));
		if (cartao) mover(cartao, destino.destino);
	};

	if (isLoading) {
		return (
			<div className="flex w-full flex-col gap-4 md:flex-row md:gap-2">
				{COLUNAS.map((c) => (
					<div key={c.id} className="flex w-full flex-col md:w-auto md:min-w-[180px] md:flex-1 md:shrink">
						<div className="mb-2 px-0.5">
							<div className="flex items-center gap-1.5">
								<Skeleton className="size-2 rounded-full" />
								<Skeleton className="h-3.5 w-24" />
							</div>
							<Skeleton className="mt-1 h-3 w-16" />
						</div>
						<div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2">
							{ESQUELETO_CARDS.map((k) => (
								<Skeleton key={`${c.id}-${k}`} className="h-[86px] w-full rounded-lg" />
							))}
						</div>
					</div>
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
					<AlertTriangle className="size-7 text-error" aria-hidden />
				</div>
				<div>
					<p className="text-base font-semibold text-text-primary">Não foi possível carregar o quadro</p>
					<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
						{(error as Error)?.message ?? "Erro ao consultar seus orçamentos."}
					</p>
				</div>
				<Button variant="outline" onClick={() => refetch()}>
					<RotateCw className="size-4" aria-hidden />
					Tentar de novo
				</Button>
			</Card>
		);
	}

	if (total === 0) {
		return (
			<Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
					<Inbox className="size-7 text-text-disabled" aria-hidden />
				</div>
				<div>
					<p className="text-base font-semibold text-text-primary">Nenhum orçamento ainda</p>
					<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
						Assim que você criar um orçamento, ele aparece aqui em Rascunho e você acompanha o funil até o Aprovado.
					</p>
				</div>
			</Card>
		);
	}

	return (
		<div>
			{erro && (
				<output
					aria-live="assertive"
					className="mb-4 flex w-full items-start gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-sm"
				>
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
					<span className="flex-1 text-text-primary">{erro}</span>
					<button
						type="button"
						onClick={limparErro}
						aria-label="Fechar aviso"
						className="shrink-0 rounded p-0.5 text-text-secondary hover:text-text-primary"
					>
						<X className="size-4" aria-hidden />
					</button>
				</output>
			)}

			{dica.visivel && <DicaDeArraste saindo={dica.saindo} aoFechar={dica.fechar} />}

			<DndContext
				sensors={sensores}
				collisionDetection={closestCorners}
				modifiers={[restringirAoQuadro]}
				accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCOES_LEITOR_DE_TELA }}
				onDragStart={(e: DragStartEvent) => {
					// Arrastou: aprendeu na prática. A aula não precisa mais aparecer.
					if (dica.visivel) dica.fechar();
					setArrastando(String(e.active.id));
				}}
				onDragEnd={aoSoltar}
				onDragCancel={() => setArrastando(null)}
			>
				{/* O `relative` é do WRAPPER, nunca do scroller: sinal preso na borda tem de
				    ficar parado enquanto o conteúdo passa por baixo — mesma regra do
				    `TableOverflowHint` das listas. */}
				<div className="relative">
					<div
						ref={refDoQuadro}
						className="flex w-full flex-col items-stretch gap-4 overflow-x-auto pb-4 md:flex-row md:items-start md:gap-2"
					>
						{colunas.map((m) => (
							<BoardColumn
								key={m.coluna.id}
								montada={m}
								emVoo={emVoo}
								destaqueId={destaqueId}
								onMover={mover}
								onAbrir={abrirEditor}
							/>
						))}
					</div>

					{antes && <SetaDeRolagem lado="esquerda" onClick={() => rolar(-1)} />}
					{depois && <SetaDeRolagem lado="direita" onClick={() => rolar(1)} />}
				</div>

				<DragOverlay>
					{emArraste ? <CartaoFantasma cartao={emArraste.cartao} coluna={emArraste.coluna} /> : null}
				</DragOverlay>
			</DndContext>

			{editor && (
				<FormOrcamento
					aberto
					aoFechar={() => setEditor(null)}
					inicial={editor.orc}
					ehNovo={editor.ehNovo}
					aoDuplicar={duplicar}
				/>
			)}
		</div>
	);
}
