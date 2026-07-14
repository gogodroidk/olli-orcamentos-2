import { useMinhaEmpresa, useOlliCount } from "@/olli/data";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { Calendar, ClipboardList, FileText, Package, Users, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";

const KPIS: { table: string; label: string; to: string; Icon: LucideIcon }[] = [
	{ table: "orcamentos", label: "Orçamentos", to: "/orcamentos", Icon: FileText },
	{ table: "clientes", label: "Clientes", to: "/clientes", Icon: Users },
	{ table: "ordens_servico", label: "Ordens de serviço", to: "/ordens-servico", Icon: ClipboardList },
	{ table: "agendamentos", label: "Agendamentos", to: "/agenda", Icon: Calendar },
	{ table: "produtos", label: "Produtos", to: "/produtos", Icon: Package },
	{ table: "servicos", label: "Serviços", to: "/servicos", Icon: Wrench },
];

function Kpi({ table, label, to, Icon }: (typeof KPIS)[number]) {
	const { data, isLoading, isError } = useOlliCount(table);
	return (
		<Link to={to} className="block">
			<Card className="flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
				<div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
					<Icon className="size-5" />
				</div>
				<div>
					{isLoading ? (
						<Skeleton className="h-7 w-12" />
					) : (
						<div className="text-2xl font-bold text-text-primary">{isError ? "—" : data}</div>
					)}
					<div className="text-sm text-text-secondary">{label}</div>
				</div>
			</Card>
		</Link>
	);
}

export default function Inicio() {
	const { data: empresa } = useMinhaEmpresa();
	const nome = (empresa?.nome as string | undefined) ?? "";
	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			<h1 className="text-2xl font-bold text-text-primary">Olá{nome ? `, ${nome}` : ""} 👋</h1>
			<p className="mt-1 text-sm text-text-secondary">Aqui está o resumo do seu negócio.</p>
			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{KPIS.map((k) => (
					<Kpi key={k.table} {...k} />
				))}
			</div>
		</div>
	);
}
