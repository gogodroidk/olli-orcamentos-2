import { Calendar, ClipboardList, FileText, Package, Users, Wrench } from "lucide-react";
import { useOlliList } from "@/olli/data";
import type { OrcamentoRow } from "./helpers";
import { RecentOrcamentosCard } from "./RecentOrcamentosCard";
import { StatCard, type StatCardDef } from "./StatCard";
import { StatusDonutCard } from "./StatusDonutCard";
import { WelcomeHeader } from "./WelcomeHeader";

/**
 * INÍCIO — dashboard premium do OLLI.
 *
 * Tudo com dados REAIS (hooks `@/olli/data`, RLS-scoped) e a regra dos 3 estados
 * (isLoading → skeleton · isError → "—"/aviso, nunca vira vazio · data → valor).
 * Os orçamentos são lidos UMA vez aqui e compartilhados pelo donut (agrupa por
 * status) e pela lista de recentes, evitando consulta duplicada.
 */

const KPIS: StatCardDef[] = [
	{ table: "orcamentos", label: "Orçamentos", to: "/orcamentos", Icon: FileText, color: "#0B6FCE" },
	{ table: "clientes", label: "Clientes", to: "/clientes", Icon: Users, color: "#3FD8EA" },
	{ table: "ordens_servico", label: "Ordens de serviço", to: "/ordens-servico", Icon: ClipboardList, color: "#F59E0B" },
	{ table: "agendamentos", label: "Agendamentos", to: "/agenda", Icon: Calendar, color: "#2BE39A" },
	{ table: "produtos", label: "Produtos", to: "/produtos", Icon: Package, color: "#8B5CF6" },
	{ table: "servicos", label: "Serviços", to: "/servicos", Icon: Wrench, color: "#FB7185" },
];

export default function Inicio() {
	// Uma leitura só de orçamentos (mais novos primeiro) alimenta donut + recentes.
	const {
		data: orcamentos,
		isLoading: orcLoading,
		isError: orcError,
	} = useOlliList<OrcamentoRow>("orcamentos", { orderBy: "criado_em", ascending: false });

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
			<WelcomeHeader />

			{/* KPIs ricos — clicáveis, cada um leva à sua lista */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
				{KPIS.map((k) => (
					<StatCard key={k.table} {...k} />
				))}
			</div>

			{/* Gráfico + recentes */}
			<div className="grid gap-5 lg:grid-cols-2">
				<StatusDonutCard rows={orcamentos} isLoading={orcLoading} isError={orcError} />
				<RecentOrcamentosCard rows={orcamentos} isLoading={orcLoading} isError={orcError} />
			</div>
		</div>
	);
}
