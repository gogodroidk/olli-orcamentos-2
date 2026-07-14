import { AlertTriangle, Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useOlliList } from "@/olli/data";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";

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

function isStatusKey(key: string) {
	return /status|situacao/i.test(key);
}

interface Props {
	table: string;
	title: string;
	subtitle?: string;
	orderBy?: string;
	/** Colunas explícitas; se ausente, deriva das chaves da primeira linha. */
	columns?: string[];
}

export default function RecordListPage({ table, title, subtitle, orderBy, columns }: Props) {
	const { data, isLoading, isError, error, refetch } = useOlliList(table, { orderBy });
	const [q, setQ] = useState("");

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

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* Cabeçalho */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-text-primary">{title}</h1>
					{subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
				</div>
				<div className="relative w-full sm:w-72">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
					<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-9" />
				</div>
			</div>

			{/* 3 estados: carregando | erro | valor */}
			{isLoading ? (
				<Card className="p-4">
					<div className="space-y-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton key={i} className="h-10 w-full" />
						))}
					</div>
				</Card>
			) : isError ? (
				<Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
					<AlertTriangle className="size-8 text-warning" />
					<div>
						<p className="font-semibold text-text-primary">Não foi possível carregar</p>
						<p className="mt-1 text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."}
						</p>
					</div>
					<button
						type="button"
						onClick={() => refetch()}
						className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
					>
						Tentar de novo
					</button>
				</Card>
			) : rows.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
					<Inbox className="size-8 text-text-disabled" />
					<p className="font-semibold text-text-primary">{q ? "Nada encontrado" : "Ainda não há registros"}</p>
					<p className="text-sm text-text-secondary">
						{q ? "Tente outro termo de busca." : "Quando você criar o primeiro, ele aparece aqui."}
					</p>
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-neutral/40 text-left text-xs uppercase tracking-wide text-text-secondary">
									{cols.map((c) => (
										<th key={c} className="whitespace-nowrap px-4 py-3 font-semibold">
											{prettify(c)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((r, i) => (
									<tr
										key={(r as { id?: string }).id ?? i}
										className="border-b border-border/60 transition hover:bg-bg-neutral/30"
									>
										{cols.map((c) => {
											const val = (r as Record<string, unknown>)[c];
											return (
												<td key={c} className="whitespace-nowrap px-4 py-3 text-text-primary">
													{isStatusKey(c) && val ? (
														<Badge variant="info">{formatValue(c, val)}</Badge>
													) : (
														formatValue(c, val)
													)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						{rows.length} registro(s)
					</div>
				</Card>
			)}
		</div>
	);
}
