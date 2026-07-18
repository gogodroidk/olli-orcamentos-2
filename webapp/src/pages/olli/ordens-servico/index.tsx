/**
 * ORDENS DE SERVIÇO — lista + criar/editar/excluir.
 *
 * As 3 regras que esta tela não abre mão:
 *
 * • 3 ESTADOS DE VERDADE: carregando · ERRO (com "Tentar de novo") · vazio. Uma
 *   falha de rede JAMAIS aparece como "nenhuma ordem" — isso faria o dono achar
 *   que a equipe não tem trabalho no dia.
 *
 * • EXCLUIR É LIXEIRA (soft delete, via `useExcluir`), e o objeto excluído é lido
 *   FRESCO do banco antes do carimbo: o upsert reescreve a linha inteira, e a
 *   cópia da lista pode estar sem as fotos que o técnico tirou há dois minutos.
 *
 * • O QUE VEIO DO CAMPO É MOSTRADO, NÃO EDITADO: o progresso do checklist e a
 *   contagem de fotos são o pulso da execução — quem os alimenta é o celular.
 */
import type { OrdemServico, StatusOS } from "@dominio";
import { STATUS_OS_LABELS } from "@dominio";
import { AlertTriangle, Camera, ClipboardList, Inbox, MoreHorizontal, Plus, RotateCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { NameCell } from "@/olli/components/record-list-helpers";
import { TableOverflowHint } from "@/olli/components/TableOverflowHint";
import { useOlliList } from "@/olli/data";
import { useExcluir } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import FormOs from "./FormOs";
import { carregarOsFresca, type LinhaOs, linhaParaOs } from "./linha";

/** Variantes de cor do Badge (shadcn). */
type VarianteBadge = "default" | "secondary" | "info" | "warning" | "success" | "error";

/**
 * Cor por status — espelha a intenção de `STATUS_OS_CORES` (@dominio), que é o que
 * o técnico vê no celular: cancelada é CINZA (encerrada), não vermelha de erro.
 * Sendo um `Record<StatusOS, …>`, um status novo no domínio QUEBRA a compilação
 * aqui em vez de aparecer sem cor.
 */
const COR_STATUS: Record<StatusOS, VarianteBadge> = {
	aberta: "secondary",
	agendada: "info",
	em_execucao: "warning",
	pausada: "default",
	concluida: "success",
	cancelada: "secondary",
};

const STATUS: [StatusOS, string][] = Object.entries(STATUS_OS_LABELS) as [StatusOS, string][];
const TODOS = "__todos__";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const SKELETON = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"];

function formatarQuando(iso?: string): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Busca tolerante a acento e caixa: "servico" acha "Serviço", "jose" acha "José". */
const normalizar = (s: string) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

/**
 * Progresso do checklist — o que o técnico já marcou EM CAMPO (leitura).
 * A barra é decorativa: quem lê com leitor de tela recebe a frase completa
 * (sr-only), porque "3/5" sozinho não diz de quê.
 */
function ProgressoChecklist({ os }: { os: OrdemServico }) {
	const total = os.checklist.length;
	if (total === 0) return <span className="text-text-disabled">—</span>;
	const feitos = os.checklist.filter((i) => i.feito).length;
	const pct = Math.round((feitos / total) * 100);
	return (
		<span className="flex items-center gap-2" title={`${feitos} de ${total} passos concluídos`}>
			<span aria-hidden="true" className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-bg-neutral">
				<span
					className={cn("block h-full rounded-full", feitos === total ? "bg-success" : "bg-primary")}
					style={{ width: `${pct}%` }}
				/>
			</span>
			<span aria-hidden="true" className="tabular-nums text-xs text-text-secondary">
				{feitos}/{total}
			</span>
			<span className="sr-only">
				Checklist: {feitos} de {total} passos concluídos
			</span>
		</span>
	);
}

/** Contagem de fotos anexadas no celular. O painel NÃO faz upload — só conta. */
function Fotos({ qtd }: { qtd: number }) {
	if (qtd === 0) return <span className="text-text-disabled">—</span>;
	return (
		<span className="inline-flex items-center gap-1.5 text-text-secondary">
			<Camera className="size-3.5" aria-hidden="true" />
			<span aria-hidden="true" className="tabular-nums">
				{qtd}
			</span>
			<span className="sr-only">
				{qtd} {qtd === 1 ? "foto anexada" : "fotos anexadas"} pelo aplicativo
			</span>
		</span>
	);
}

export default function OrdensServicoPage() {
	const { data, isLoading, isError, error, refetch } = useOlliList<LinhaOs>("ordens_servico", {
		orderBy: "criado_em",
	});
	const excluir = useExcluir("ordens_servico");

	const [busca, setBusca] = useState("");
	const [filtroStatus, setFiltroStatus] = useState<string>(TODOS);
	const [formAberto, setFormAberto] = useState(false);
	const [emEdicao, setEmEdicao] = useState<OrdemServico | null>(null);
	const [aExcluir, setAExcluir] = useState<OrdemServico | null>(null);
	const [excluindo, setExcluindo] = useState(false);
	const [erroExcluir, setErroExcluir] = useState<string | null>(null);

	const ordens = useMemo(() => (data ?? []).map(linhaParaOs), [data]);

	const lista = useMemo(() => {
		const termo = normalizar(busca.trim());
		return ordens.filter((os) => {
			if (filtroStatus !== TODOS && os.status !== filtroStatus) return false;
			if (!termo) return true;
			return [os.numero, os.clienteNome, os.titulo, os.tecnicoNome ?? ""].some((c) => normalizar(c).includes(termo));
		});
	}, [ordens, busca, filtroStatus]);

	function abrirNova() {
		setEmEdicao(null);
		setFormAberto(true);
	}

	function abrirEdicao(os: OrdemServico) {
		setEmEdicao(os);
		setFormAberto(true);
	}

	async function confirmarExclusao() {
		if (!aExcluir) return;
		setExcluindo(true);
		setErroExcluir(null);
		try {
			// Lê fresco: o carimbo da lixeira é um upsert da linha INTEIRA — com a cópia
			// da lista, uma foto tirada em campo depois do carregamento seria apagada junto.
			const fresca = await carregarOsFresca(aExcluir.id);
			await excluir.mutateAsync(fresca);
			setAExcluir(null);
		} catch (e) {
			setErroExcluir((e as Error)?.message ?? "Não consegui excluir agora. Tente de novo.");
		} finally {
			setExcluindo(false);
		}
	}

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">Ordens de serviço</h1>
						{!isLoading && !isError && (
							<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
								{lista.length}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-sm text-text-secondary">
						O trabalho em campo: quem executa, quando, e o que já foi feito.
					</p>
				</div>
				<Button onClick={abrirNova} className="shrink-0 gap-2">
					<Plus className="size-4" />
					Nova ordem
				</Button>
			</div>

			<div className="mb-4 flex flex-col gap-2.5 sm:flex-row">
				<div className="relative flex-1">
					<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
					<Input
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						placeholder="Buscar por número, cliente, título ou técnico…"
						className="h-10 rounded-full pl-10"
						aria-label="Buscar ordens de serviço"
					/>
				</div>
				<Select value={filtroStatus} onValueChange={setFiltroStatus}>
					<SelectTrigger className="h-10 w-full rounded-full sm:w-52" aria-label="Filtrar por status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={TODOS}>Todos os status</SelectItem>
						{STATUS.map(([valor, rotulo]) => (
							<SelectItem key={valor} value={valor}>
								{rotulo}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* 3 estados: carregando | ERRO | vazio | dados */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					<div className="divide-y divide-border/60">
						{SKELETON.map((k) => (
							<div key={k} className="flex items-center gap-4 px-4 py-4">
								<Skeleton className="h-3.5 w-16 shrink-0" />
								<Skeleton className="size-7 shrink-0 rounded-full" />
								<Skeleton className="h-3.5 w-1/4" />
								<Skeleton className="h-3.5 w-20" />
								<Skeleton className="ml-auto h-3.5 w-16" />
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
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar as ordens</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."}
						</p>
					</div>
					<Button variant="outline" onClick={() => refetch()} className="gap-2 rounded-full">
						<RotateCw className="size-4" />
						Tentar de novo
					</Button>
				</Card>
			) : lista.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						{ordens.length === 0 ? (
							<ClipboardList className="size-7 text-text-disabled" />
						) : (
							<Inbox className="size-7 text-text-disabled" />
						)}
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{ordens.length === 0 ? "Nenhuma ordem de serviço ainda" : "Nada encontrado"}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{ordens.length === 0
								? "Crie a primeira ordem e ela aparece aqui — e no celular do técnico."
								: "Nenhuma ordem corresponde à busca ou ao filtro de status."}
						</p>
					</div>
					{ordens.length === 0 && (
						<Button onClick={abrirNova} className="gap-2">
							<Plus className="size-4" />
							Nova ordem
						</Button>
					)}
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{/* DESKTOP */}
					<div className="relative hidden md:block">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Nº</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Cliente</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Serviço</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Técnico</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Agendada</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Checklist</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Fotos</th>
										<th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Valor</th>
										<th className="px-4 py-3">
											<span className="sr-only">Ações</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{lista.map((os) => (
										<tr
											key={os.id}
											className="border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40"
										>
											<td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-text-primary">
												{os.numero || "—"}
											</td>
											<td className="px-4 py-3.5">
												<NameCell name={os.clienteNome || "—"} />
											</td>
											<td className="px-4 py-3.5 text-text-primary">
												<span className="line-clamp-1">{os.titulo || "—"}</span>
											</td>
											<td className="whitespace-nowrap px-4 py-3.5">
												<Badge variant={COR_STATUS[os.status]} className="font-medium">
													{STATUS_OS_LABELS[os.status]}
												</Badge>
											</td>
											<td className="whitespace-nowrap px-4 py-3.5 text-text-secondary">
												{os.tecnicoNome || <span className="text-text-disabled">Não atribuída</span>}
											</td>
											<td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-text-secondary">
												{formatarQuando(os.dataAgendada)}
											</td>
											<td className="whitespace-nowrap px-4 py-3.5">
												<ProgressoChecklist os={os} />
											</td>
											<td className="whitespace-nowrap px-4 py-3.5">
												<Fotos qtd={os.fotos.length} />
											</td>
											<td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums text-text-primary">
												{os.valor != null ? BRL.format(os.valor) : "—"}
											</td>
											<td className="px-2 py-3.5 text-right">
												<AcoesDaOrdem os={os} aoEditar={abrirEdicao} aoExcluir={setAExcluir} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<TableOverflowHint />
					</div>

					{/* MOBILE */}
					<div className="divide-y divide-border/60 md:hidden">
						{lista.map((os) => (
							<div key={os.id} className="p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium tabular-nums text-text-primary">{os.numero || "—"}</span>
											<Badge variant={COR_STATUS[os.status]} className="font-medium">
												{STATUS_OS_LABELS[os.status]}
											</Badge>
										</div>
										<p className="mt-1.5 line-clamp-1 text-sm font-medium text-text-primary">{os.titulo || "—"}</p>
										<p className="mt-0.5 line-clamp-1 text-sm text-text-secondary">{os.clienteNome || "—"}</p>
									</div>
									<AcoesDaOrdem os={os} aoEditar={abrirEdicao} aoExcluir={setAExcluir} />
								</div>

								<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Técnico</dt>
										<dd className="mt-0.5 truncate text-sm text-text-primary">{os.tecnicoNome || "Não atribuída"}</dd>
									</div>
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Agendada</dt>
										<dd className="mt-0.5 truncate text-sm tabular-nums text-text-primary">
											{formatarQuando(os.dataAgendada)}
										</dd>
									</div>
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Checklist</dt>
										<dd className="mt-0.5">
											<ProgressoChecklist os={os} />
										</dd>
									</div>
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Valor</dt>
										<dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-text-primary">
											{os.valor != null ? BRL.format(os.valor) : "—"}
										</dd>
									</div>
								</dl>
							</div>
						))}
					</div>

					<div className="border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						{lista.length} ordem{lista.length === 1 ? "" : "s"}
						{lista.length !== ordens.length && ` de ${ordens.length}`}
					</div>
				</Card>
			)}

			<FormOs aberto={formAberto} aoFechar={() => setFormAberto(false)} ordem={emEdicao} />

			<ConfirmarExclusao
				aberto={aExcluir !== null}
				aoFechar={() => {
					setAExcluir(null);
					setErroExcluir(null);
				}}
				aoConfirmar={confirmarExclusao}
				nome={aExcluir ? `${aExcluir.numero || "OS"} — ${aExcluir.titulo || aExcluir.clienteNome}` : ""}
				tipo="ordem de serviço"
				aviso={
					aExcluir && aExcluir.fotos.length > 0
						? `As ${aExcluir.fotos.length} fotos e o checklist desta ordem vão para a lixeira junto — e somem do celular do técnico.`
						: "O técnico deixa de ver esta ordem no celular."
				}
				excluindo={excluindo}
				erro={erroExcluir}
			/>
		</div>
	);
}

/** Menu de ações da linha — teclado e leitor de tela inclusos (sem gesto obrigatório). */
function AcoesDaOrdem({
	os,
	aoEditar,
	aoExcluir,
}: {
	os: OrdemServico;
	aoEditar: (os: OrdemServico) => void;
	aoExcluir: (os: OrdemServico) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="size-8" aria-label={`Ações da ordem ${os.numero || os.titulo}`}>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={() => aoEditar(os)}>Editar</DropdownMenuItem>
				<DropdownMenuItem variant="destructive" onSelect={() => aoExcluir(os)}>
					Excluir
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
