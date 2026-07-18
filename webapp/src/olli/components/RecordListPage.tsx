import { AlertTriangle, Inbox, MoreHorizontal, Plus, RotateCw, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useOlliList } from "@/olli/data";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import { isMoneyKey, isNameKey, isStatusKey, NameCell, StatusBadge } from "./record-list-helpers";

/** Colunas internas que não interessam ao usuário. */
const HIDDEN = new Set([
	"id",
	"user_id",
	"owner_user_id",
	"org_id",
	"organizacao_id",
	"created_at",
	"updated_at",
	"deleted_at",
	"criado_em",
	"atualizado_em",
	"excluido_em",
	"sync_at",
	"remote_id",
]);

function prettify(key: string): string {
	const map: Record<string, string> = {
		nome: "Nome",
		telefone: "Telefone",
		email: "E-mail",
		cidade: "Cidade",
		estado: "UF",
		endereco: "Endereço",
		bairro: "Bairro",
		cep: "CEP",
		cnpj: "CNPJ",
		cpf: "CPF",
		valor: "Valor",
		total: "Total",
		preco: "Preço",
		custo: "Custo",
		status: "Status",
		numero: "Nº",
		descricao: "Descrição",
		unidade: "Un.",
		observacoes: "Observações",
	};
	return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Chaves estáveis para os placeholders de carregamento (evita index como key). */
const SKELETON_ROWS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6", "sk-7"];
const SKELETON_CARDS = ["skc-1", "skc-2", "skc-3", "skc-4", "skc-5"];

function formatValue(key: string, v: unknown): string {
	if (v === null || v === undefined || v === "") return "—";
	if (typeof v === "boolean") return v ? "Sim" : "Não";
	if (typeof v === "number") {
		if (/(valor|total|preco|custo|subtotal)/i.test(key)) return BRL.format(v);
		return String(v);
	}
	if (typeof v === "string") {
		// data pura YYYY-MM-DD: formata cru (new Date() a trata como UTC e no BR
		// mostraria 1 dia a menos). Com hora (…T…) o fuso já vem embutido.
		const dataPura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
		if (dataPura) return `${dataPura[3]}/${dataPura[2]}/${dataPura[1]}`;
		if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
			const d = new Date(v);
			if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
		}
		return v;
	}
	return "—";
}

/** Linha crua da tabela (o `select('*')` do Supabase, em snake_case). */
export type Linha = Record<string, unknown>;

/** Um item do menu "…" de cada linha. */
export interface AcaoDeLinha {
	rotulo: string;
	aoClicar: (linha: Linha) => void;
	icone?: ReactNode;
	/** Vermelho + separado do resto (ex.: "Excluir"). */
	destrutiva?: boolean;
}

interface Props {
	table: string;
	title: string;
	subtitle?: string;
	orderBy?: string;
	/** Ordem crescente (padrão: decrescente, que é o certo para data). Nome pede `true`. */
	ascending?: boolean;
	/** Colunas explícitas; se ausente, deriva das chaves da primeira linha. */
	columns?: string[];

	/* ── CRUD (tudo OPCIONAL: sem estas props, a lista é só leitura, como antes) ── */

	/** Botão primário do cabeçalho — e do estado vazio, onde ele mais importa. */
	acaoNova?: { rotulo: string; aoClicar: () => void };
	/**
	 * Abrir/editar o registro. Liga o clique na linha E um botão de verdade na
	 * coluna principal — porque `onClick` numa `<tr>` não existe para quem usa
	 * teclado. O menu "…" repete a ação, então há sempre 2 caminhos sem mouse.
	 */
	aoAbrirLinha?: (linha: Linha) => void;
	/** Itens do menu "…" da linha (ex.: Editar, Excluir). */
	acoesDaLinha?: AcaoDeLinha[];
	/** Textos do estado vazio de verdade (sem busca ativa). */
	vazioTitulo?: string;
	vazioDescricao?: string;
}

export default function RecordListPage({
	table,
	title,
	subtitle,
	orderBy,
	ascending,
	columns,
	acaoNova,
	aoAbrirLinha,
	acoesDaLinha,
	vazioTitulo,
	vazioDescricao,
}: Props) {
	const { data, isLoading, isError, error, refetch } = useOlliList(table, { orderBy, ascending });
	const [q, setQ] = useState("");
	const temMenu = !!acoesDaLinha?.length;

	const cols = useMemo(() => {
		if (columns) return columns;
		const first = data?.[0];
		if (!first) return [];
		const isIdish = (v: unknown) => typeof v === "string" && /^[0-9a-f]{16,}$/i.test(v.replace(/-/g, ""));
		return Object.keys(first)
			.filter((k) => !HIDDEN.has(k) && !/(_id|_por|_by)$/i.test(k)) // esconde chaves estrangeiras
			.filter((k) => {
				const val = (first as Record<string, unknown>)[k];
				if (typeof val === "object" && val !== null) return false; // pula json/arrays
				if (isIdish(val)) return false; // pula colunas de UUID/hash
				return true;
			})
			.slice(0, 6);
	}, [data, columns]);

	/** Primeira coluna de texto (nem status, nem dinheiro) — ganha destaque. */
	const primaryCol = useMemo(() => cols.find((c) => !isStatusKey(c) && !isMoneyKey(c)) ?? cols[0], [cols]);

	const rows = useMemo(() => {
		const list = data ?? [];
		if (!q.trim()) return list;
		const needle = q.toLowerCase();
		return list.filter((r) =>
			Object.values(r as Record<string, unknown>).some((v) =>
				String(v ?? "")
					.toLowerCase()
					.includes(needle),
			),
		);
	}, [data, q]);

	/** Conteúdo de uma célula, respeitando status / nome / dinheiro / texto. */
	const renderCell = (col: string, row: Record<string, unknown>) => {
		const val = row[col];
		if (isStatusKey(col) && val !== null && val !== undefined && val !== "") {
			return <StatusBadge value={val} />;
		}
		if (isNameKey(col)) {
			return <NameCell name={formatValue(col, val)} />;
		}
		return formatValue(col, val);
	};

	/** Como o registro se chama — para o `aria-label` do menu e do botão de abrir. */
	const nomeDaLinha = (row: Linha) => (primaryCol ? formatValue(primaryCol, row[primaryCol]) : "registro");

	/**
	 * A coluna principal vira um BOTÃO de verdade quando dá para abrir o registro.
	 * É ele — não o `onClick` da `<tr>` — que dá o caminho de teclado (Tab + Enter).
	 */
	const celulaPrincipal = (col: string, row: Linha) => {
		const conteudo = renderCell(col, row);
		if (!aoAbrirLinha) return conteudo;
		return (
			<button
				type="button"
				onClick={() => aoAbrirLinha(row)}
				aria-label={`Abrir ${nomeDaLinha(row)}`}
				className="-mx-1 rounded-md px-1 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
			>
				{conteudo}
			</button>
		);
	};

	const menuDaLinha = (row: Linha) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-8 text-text-secondary"
					aria-label={`Ações de ${nomeDaLinha(row)}`}
					// A linha inteira é clicável no mouse; o clique no menu não pode
					// abrir o registro por baixo.
					onClick={(e) => e.stopPropagation()}
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{acoesDaLinha?.map((a) => (
					<DropdownMenuItem
						key={a.rotulo}
						onSelect={() => a.aoClicar(row)}
						className={cn("gap-2", a.destrutiva && "text-error focus:text-error")}
					>
						{a.icone}
						{a.rotulo}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const botaoNovo = acaoNova && (
		<Button type="button" onClick={acaoNova.aoClicar} className="gap-2">
			<Plus className="size-4" />
			{acaoNova.rotulo}
		</Button>
	);

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* Cabeçalho rico */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">{title}</h1>
						{!isLoading && !isError && (
							<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
								{rows.length}
							</Badge>
						)}
					</div>
					{subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
				</div>
				<div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
					<div className="relative w-full sm:w-72">
						<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
						<Input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="Buscar…"
							aria-label={`Buscar em ${title}`}
							type="search"
							className="h-10 rounded-full pl-10"
						/>
					</div>
					{botaoNovo}
				</div>
			</div>

			{/* 3 estados: carregando | erro | vazio | dados */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					{/* skeleton de linhas */}
					<div className="hidden md:block">
						<div className="border-b border-border bg-bg-neutral/40 px-4 py-3">
							<Skeleton className="h-3 w-40" />
						</div>
						<div className="divide-y divide-border/60">
							{SKELETON_ROWS.map((k) => (
								<div key={k} className="flex items-center gap-4 px-4 py-4">
									<Skeleton className="size-7 shrink-0 rounded-full" />
									<Skeleton className="h-3.5 w-1/4" />
									<Skeleton className="h-3.5 w-1/5" />
									<Skeleton className="ml-auto h-3.5 w-16" />
								</div>
							))}
						</div>
					</div>
					<div className="space-y-3 p-4 md:hidden">
						{SKELETON_CARDS.map((k) => (
							<Skeleton key={k} className="h-24 w-full rounded-xl" />
						))}
					</div>
				</Card>
			) : isError ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
						<AlertTriangle className="size-7 text-error" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."}
						</p>
					</div>
					<Button type="button" variant="outline" onClick={() => refetch()} className="gap-2 rounded-full">
						<RotateCw className="size-4" />
						Tentar de novo
					</Button>
				</Card>
			) : rows.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						<Inbox className="size-7 text-text-disabled" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{q ? "Nada encontrado" : (vazioTitulo ?? "Ainda não há registros")}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{q
								? "Tente outro termo de busca."
								: (vazioDescricao ?? "Quando você criar o primeiro, ele aparece aqui.")}
						</p>
					</div>
					{/* O botão também mora aqui: base vazia é exatamente onde ele é a próxima ação. */}
					{!q && botaoNovo}
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{/* DESKTOP: tabela premium */}
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
									{cols.map((c) => (
										<th
											key={c}
											className={cn("whitespace-nowrap px-4 py-3 font-semibold", isMoneyKey(c) && "text-right")}
										>
											{prettify(c)}
										</th>
									))}
									{temMenu && <th className="w-12 px-4 py-3 font-semibold sr-only">Ações</th>}
								</tr>
							</thead>
							<tbody>
								{rows.map((r, i) => {
									const row = r as Record<string, unknown>;
									return (
										// O `onClick` da <tr> é conveniência de MOUSE, e só. Quem usa teclado
										// tem 2 caminhos equivalentes e focáveis: o botão da coluna principal
										// (Tab + Enter) e o item "Editar" do menu "…". Pôr tabIndex/role na
										// própria <tr> quebraria a semântica da tabela e criaria uma parada de
										// foco duplicada por linha.
										<tr
											key={(r as { id?: string }).id ?? i}
											onClick={aoAbrirLinha ? () => aoAbrirLinha(row) : undefined}
											className={cn(
												"border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40",
												aoAbrirLinha && "cursor-pointer",
											)}
										>
											{cols.map((c) => (
												<td
													key={c}
													className={cn(
														"px-4 py-3.5 align-middle",
														isMoneyKey(c)
															? "whitespace-nowrap text-right font-medium tabular-nums text-text-primary"
															: c === primaryCol
																? "font-medium text-text-primary"
																: "whitespace-nowrap text-text-secondary",
													)}
												>
													{c === primaryCol ? celulaPrincipal(c, row) : renderCell(c, row)}
												</td>
											))}
											{temMenu && <td className="px-2 py-3.5 text-right align-middle">{menuDaLinha(row)}</td>}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* MOBILE: cada linha vira um card com campos rotulados */}
					<div className="divide-y divide-border/60 md:hidden">
						{rows.map((r, i) => {
							const row = r as Record<string, unknown>;
							const statusCol = cols.find((c) => isStatusKey(c) && row[c] != null && row[c] !== "");
							const restCols = cols.filter((c) => c !== primaryCol && c !== statusCol);
							return (
								<div key={(r as { id?: string }).id ?? i} className="p-4">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 text-sm">
											{primaryCol && aoAbrirLinha ? (
												celulaPrincipal(primaryCol, row)
											) : primaryCol && isNameKey(primaryCol) ? (
												<NameCell name={formatValue(primaryCol, row[primaryCol])} />
											) : (
												<span className="font-medium text-text-primary">
													{primaryCol ? formatValue(primaryCol, row[primaryCol]) : "—"}
												</span>
											)}
										</div>
										<div className="flex shrink-0 items-center gap-1">
											{statusCol && <StatusBadge value={row[statusCol]} className="shrink-0" />}
											{temMenu && menuDaLinha(row)}
										</div>
									</div>
									{restCols.length > 0 && (
										<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
											{restCols.map((c) => (
												<div key={c} className="min-w-0">
													<dt className="text-[11px] uppercase tracking-wide text-text-disabled">{prettify(c)}</dt>
													<dd
														className={cn(
															"mt-0.5 truncate text-sm text-text-primary",
															isMoneyKey(c) && "font-medium tabular-nums",
														)}
													>
														{isNameKey(c) ? <NameCell name={formatValue(c, row[c])} /> : formatValue(c, row[c])}
													</dd>
												</div>
											))}
										</dl>
									)}
								</div>
							);
						})}
					</div>

					<div className="border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						{rows.length} registro{rows.length === 1 ? "" : "s"}
					</div>
				</Card>
			)}
		</div>
	);
}
