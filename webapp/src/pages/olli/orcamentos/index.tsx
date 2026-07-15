/**
 * ORÇAMENTOS — a lista. É por aqui que o dono decide o dia dele.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. A VERDADE É O BLOB, NÃO A LINHA. As colunas (`numero`, `status`, `valor_total`)
 *    são espelhos; o documento inteiro — itens, fotos, assinaturas, sinal — mora em
 *    `dados` (jsonb). Editar, duplicar e EXCLUIR aqui só acontecem em cima do blob.
 *    Uma linha sem blob (corrompida ou de uma versão antiga) tem as ações
 *    DESABILITADAS e diz por quê — em vez de abrir um formulário vazio que, ao
 *    salvar, apagaria o documento do cliente.
 *
 * 2. ERRO NÃO É LISTA VAZIA. Falha de rede mostra erro + "Tentar de novo". Dizer
 *    "você não tem orçamentos" para quem tem 40 é mentir para o dono — e ele age em
 *    cima disso (liga para o cliente errado, refaz o que já existe).
 *
 * A exclusão é SOFT (lixeira): `useExcluir` carimba `excluidoEm` no blob e na coluna.
 * Apagar de verdade faria o celular ressuscitar a linha no próximo sync.
 */
import type { Empresa, Orcamento, StatusOrcamento } from "@dominio";
import { STATUS_LABELS } from "@dominio";
import {
	AlertTriangle,
	Copy,
	FileText,
	Inbox,
	MoreHorizontal,
	Pencil,
	Plus,
	RotateCw,
	Search,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { novoOrcamentoVazio } from "@/olli/components/novoOrcamentoVazio";
import { getStatusVariant, NameCell } from "@/olli/components/record-list-helpers";
import { useMinhaEmpresa, useOlliList } from "@/olli/data";
import { ymdParaBr } from "@/olli/datas";
import { useExcluir } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import FormOrcamento, { duplicarComoRascunho, edicaoBloqueada } from "./FormOrcamento";

/**
 * A linha como ela vem do Supabase: colunas-espelho + o BLOB. Os nomes das colunas
 * são snake_case; o blob é o objeto de domínio em camelCase.
 */
interface LinhaOrcamento {
	id: string;
	numero: string | null;
	cliente_nome: string | null;
	status: string | null;
	valor_total: number | null;
	data_emissao: string | null;
	criado_em: string;
	/** O documento INTEIRO. `null` só em linha corrompida/legada — e aí as ações travam. */
	dados: Orcamento | null;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SKELETON = ["s1", "s2", "s3", "s4", "s5", "s6"];

/** Ordem do funil — a mesma do domínio, para o filtro não inventar status. */
const STATUS: StatusOrcamento[] = [
	"rascunho",
	"enviado",
	"visualizado",
	"em_negociacao",
	"aguardando_assinatura",
	"aprovado",
	"recusado",
	"expirado",
	"cancelado",
	"convertido",
];

/**
 * O blob, se ele existir DE VERDADE. Um `dados` sem `itens` não é um orçamento —
 * é ruído, e tratá-lo como documento faria o painel salvar um objeto meia-boca por
 * cima do que o cliente tem em mãos.
 */
function blobDe(linha: LinhaOrcamento): Orcamento | null {
	const d = linha.dados;
	if (!d || typeof d !== "object" || !Array.isArray(d.itens)) return null;
	return d;
}

function StatusDoOrcamento({ valor }: { valor: string | null }) {
	if (!valor) return <span className="text-text-disabled">—</span>;
	// STATUS_LABELS é do domínio: "em_negociacao" vira "Em negociação" (com cedilha e
	// til), não "Em negociacao". O cliente não vê esta tela, mas o dono vê o dia todo.
	const rotulo = STATUS_LABELS[valor as StatusOrcamento] ?? valor;
	return (
		<Badge variant={getStatusVariant(valor)} className="font-medium">
			{rotulo}
		</Badge>
	);
}

export default function OrcamentosPage() {
	const { data, isLoading, isError, error, refetch, isFetching } = useOlliList<LinhaOrcamento>("orcamentos", {
		orderBy: "criado_em",
	});
	const { data: empresaLinha } = useMinhaEmpresa();
	// A `empresa` também é uma tabela de BLOB: o objeto de domínio vive em `dados`.
	const empresa = (empresaLinha?.dados as Empresa | undefined) ?? null;

	const [busca, setBusca] = useState("");
	const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusOrcamento>("todos");

	/** O editor aberto. `ehNovo` decide se o número será gerado no submit. */
	const [editor, setEditor] = useState<{ orc: Orcamento; ehNovo: boolean } | null>(null);
	const [excluindo, setExcluindo] = useState<Orcamento | null>(null);
	const [erroExclusao, setErroExclusao] = useState<string | null>(null);

	const excluir = useExcluir("orcamentos");

	const linhas = useMemo(() => {
		let lista = data ?? [];
		if (filtroStatus !== "todos") lista = lista.filter((l) => l.status === filtroStatus);
		const termo = busca.trim().toLowerCase();
		if (!termo) return lista;
		return lista.filter(
			(l) => (l.numero ?? "").toLowerCase().includes(termo) || (l.cliente_nome ?? "").toLowerCase().includes(termo),
		);
	}, [data, busca, filtroStatus]);

	const somaVisivel = useMemo(() => linhas.reduce((s, l) => s + (l.valor_total ?? 0), 0), [linhas]);

	/* ─────────────────────────────────  Ações  ───────────────────────────────── */

	const abrirNovo = () => setEditor({ orc: novoOrcamentoVazio(empresa), ehNovo: true });

	/** Editar: SEMPRE em cima do blob. A trava de "já enviado" mora no FormOrcamento. */
	const abrirEdicao = (linha: LinhaOrcamento) => {
		const blob = blobDe(linha);
		if (!blob) return;
		setEditor({ orc: blob, ehNovo: false });
	};

	const duplicar = (o: Orcamento) =>
		setEditor({ orc: duplicarComoRascunho(o, empresa?.validadeDiasPadrao), ehNovo: true });

	async function confirmarExclusao() {
		if (!excluindo) return;
		setErroExclusao(null);
		try {
			// O objeto INTEIRO vai para o `useExcluir` — ele carimba `excluidoEm` dentro
			// do blob e na coluna. Mandar só o id gravaria um blob truncado.
			await excluir.mutateAsync(excluindo);
			setExcluindo(null);
		} catch (err) {
			setErroExclusao((err as Error)?.message ?? "Não foi possível excluir.");
		}
	}

	/* ────────────────────────────────  Render  ───────────────────────────────── */

	/** O menu de ações de uma linha — o mesmo no desktop e no mobile. */
	function MenuDaLinha({ linha }: { linha: LinhaOrcamento }) {
		const blob = blobDe(linha);
		const bloqueado = blob ? edicaoBloqueada(blob.status) : false;

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Ações do orçamento ${linha.numero ?? ""}`.trim()}
						className="text-text-secondary"
					>
						<MoreHorizontal className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					{!blob ? (
						// Sem blob não há documento — e um formulário vazio que "salva por cima"
						// seria destruição de dado com cara de funcionalidade.
						<DropdownMenuItem disabled className="text-xs">
							Este orçamento está sem os dados completos. Abra-o no celular.
						</DropdownMenuItem>
					) : (
						<>
							<DropdownMenuItem onSelect={() => abrirEdicao(linha)}>
								<Pencil className="mr-2 size-4" />
								{bloqueado ? "Editar (já enviado)" : "Editar"}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => duplicar(blob)}>
								<Copy className="mr-2 size-4" />
								Duplicar como rascunho
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={() => {
									setErroExclusao(null);
									setExcluindo(blob);
								}}
								className="text-error focus:text-error"
							>
								<Trash2 className="mr-2 size-4" />
								Excluir
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* ─────────────  Cabeçalho  ───────────── */}
			<div className="mb-5 flex flex-col gap-4">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2.5">
							<h1 className="text-2xl font-bold tracking-tight text-text-primary">Orçamentos</h1>
							{!isLoading && !isError && (
								<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
									{linhas.length}
								</Badge>
							)}
						</div>
						<p className="mt-1 text-sm text-text-secondary">
							Cada linha aqui é um documento que vai (ou já foi) para a mão de um cliente.
						</p>
					</div>

					<Button onClick={abrirNovo}>
						<Plus className="mr-2 size-4" />
						Novo orçamento
					</Button>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row">
					<div className="relative flex-1 sm:max-w-xs">
						<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
						<Input
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por número ou cliente…"
							aria-label="Buscar orçamentos"
							className="h-10 rounded-full pl-10"
						/>
					</div>

					<Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as "todos" | StatusOrcamento)}>
						<SelectTrigger className="h-10 w-full rounded-full sm:w-56" aria-label="Filtrar por status">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="todos">Todos os status</SelectItem>
							{STATUS.map((s) => (
								<SelectItem key={s} value={s}>
									{STATUS_LABELS[s]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* ─────────────  3 estados: carregando · erro · vazio · dados  ───────────── */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					<div className="divide-y divide-border/60">
						{SKELETON.map((k) => (
							<div key={k} className="flex items-center gap-4 px-4 py-4">
								<Skeleton className="h-3.5 w-16 shrink-0" />
								<Skeleton className="size-7 shrink-0 rounded-full" />
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="ml-auto h-5 w-20 rounded-full" />
								<Skeleton className="h-3.5 w-24" />
							</div>
						))}
					</div>
				</Card>
			) : isError ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
						<AlertTriangle className="size-7 text-error" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar seus orçamentos</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."} Seus documentos continuam salvos — é a
							consulta que falhou.
						</p>
					</div>
					<Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
						<RotateCw className={cn("mr-2 size-4", isFetching && "animate-spin")} />
						Tentar de novo
					</Button>
				</Card>
			) : linhas.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						<Inbox className="size-7 text-text-disabled" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{busca || filtroStatus !== "todos" ? "Nenhum orçamento com esse filtro" : "Você ainda não tem orçamentos"}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{busca || filtroStatus !== "todos"
								? "Tente outro termo ou limpe o filtro de status."
								: "Crie o primeiro — leva menos de um minuto."}
						</p>
					</div>
					{!busca && filtroStatus === "todos" && (
						<Button onClick={abrirNovo}>
							<Plus className="mr-2 size-4" />
							Criar o primeiro orçamento
						</Button>
					)}
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{/* DESKTOP */}
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Nº</th>
									<th className="px-4 py-3 font-semibold">Cliente</th>
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th>
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Emissão</th>
									<th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Total</th>
									<th className="w-12 px-2 py-3">
										<span className="sr-only">Ações</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{linhas.map((l) => {
									const semBlob = blobDe(l) === null;
									return (
										<tr
											key={l.id}
											className="border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40"
										>
											<td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-text-primary">
												<span className="flex items-center gap-1.5">
													<FileText className="size-3.5 text-text-disabled" />
													{l.numero || "—"}
												</span>
											</td>
											<td className="px-4 py-3.5">
												<NameCell name={l.cliente_nome || "—"} />
												{semBlob && (
													// Aviso honesto: a linha existe, o documento não veio inteiro.
													<span className="mt-1 flex items-center gap-1 text-xs text-warning-darker dark:text-warning">
														<AlertTriangle className="size-3" />
														Sem os dados completos — não dá para editar por aqui.
													</span>
												)}
											</td>
											<td className="whitespace-nowrap px-4 py-3.5">
												<StatusDoOrcamento valor={l.status} />
											</td>
											<td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-text-secondary">
												{l.data_emissao ? ymdParaBr(l.data_emissao) : "—"}
											</td>
											<td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums text-text-primary">
												{BRL.format(l.valor_total ?? 0)}
											</td>
											<td className="px-2 py-3.5 text-right">
												<MenuDaLinha linha={l} />
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* MOBILE */}
					<div className="divide-y divide-border/60 md:hidden">
						{linhas.map((l) => (
							<div key={l.id} className="flex items-start gap-3 p-4">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium tabular-nums text-text-primary">{l.numero || "—"}</span>
										<StatusDoOrcamento valor={l.status} />
									</div>
									<div className="mt-2">
										<NameCell name={l.cliente_nome || "—"} />
									</div>
									<div className="mt-2 flex items-center justify-between gap-3 text-sm">
										<span className="tabular-nums text-text-secondary">
											{l.data_emissao ? ymdParaBr(l.data_emissao) : "—"}
										</span>
										<span className="font-semibold tabular-nums text-text-primary">
											{BRL.format(l.valor_total ?? 0)}
										</span>
									</div>
									{blobDe(l) === null && (
										<p className="mt-2 flex items-center gap-1 text-xs text-warning-darker dark:text-warning">
											<AlertTriangle className="size-3" />
											Sem os dados completos — não dá para editar por aqui.
										</p>
									)}
								</div>
								<MenuDaLinha linha={l} />
							</div>
						))}
					</div>

					<div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						<span>
							{linhas.length} orçamento{linhas.length === 1 ? "" : "s"}
						</span>
						<span className="tabular-nums">
							Soma dos exibidos: <strong className="font-semibold text-text-primary">{BRL.format(somaVisivel)}</strong>
						</span>
					</div>
				</Card>
			)}

			{/* ─────────────  Editor  ───────────── */}
			{editor && (
				<FormOrcamento
					aberto
					aoFechar={() => setEditor(null)}
					inicial={editor.orc}
					ehNovo={editor.ehNovo}
					aoDuplicar={duplicar}
				/>
			)}

			{/* ─────────────  Exclusão (soft delete)  ───────────── */}
			{excluindo && (
				<ConfirmarExclusao
					aberto
					aoFechar={() => {
						setExcluindo(null);
						setErroExclusao(null);
					}}
					aoConfirmar={confirmarExclusao}
					tipo="orçamento"
					nome={`${excluindo.numero || "sem número"} · ${excluindo.clienteNome || "sem cliente"}`}
					aviso={
						edicaoBloqueada(excluindo.status)
							? "Este orçamento já foi enviado ao cliente — ele continua com o documento em mãos mesmo depois de você excluí-lo daqui."
							: undefined
					}
					excluindo={excluir.isPending}
					erro={erroExclusao}
				/>
			)}
		</div>
	);
}
