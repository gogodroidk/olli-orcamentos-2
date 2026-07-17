import { ArrowUpRight, Building2, FileText, type LucideIcon, Rocket, Users } from "lucide-react";
import { Link } from "react-router";
import { Card } from "@/ui/card";

interface Passo {
	titulo: string;
	descricao: string;
	to: string;
	Icon: LucideIcon;
	/** Cor do tile (hex da paleta OLLI — mesmas usadas nos KPIs). */
	color: string;
}

const PASSOS: Passo[] = [
	{
		titulo: "Criar meu primeiro orçamento",
		descricao: "Monte uma proposta e mande pro cliente em minutos.",
		to: "/orcamentos",
		Icon: FileText,
		color: "#0B6FCE",
	},
	{
		titulo: "Cadastrar um cliente",
		descricao: "Nome, telefone e endereço prontos pro próximo orçamento.",
		to: "/clientes",
		Icon: Users,
		color: "#8B5CF6",
	},
	{
		titulo: "Preencher os dados da empresa",
		descricao: "Logo e contato que aparecem no PDF do orçamento.",
		to: "/meu-negocio",
		Icon: Building2,
		color: "#F59E0B",
	},
];

/**
 * PRIMEIROS PASSOS — só existe para conta claramente NOVA (sem orçamento e sem
 * cliente cadastrado). Sem isto, quem acabou de criar a conta cai numa tela
 * inteira de "—"/"Nenhum orçamento ainda" sem nenhuma pista de por onde começar.
 *
 * O pai (`index.tsx`) só renderiza este card quando SABE que as duas listas
 * vieram vazias (consulta OK, não carregando, não erro) — nunca durante
 * carregando/erro, e some sozinho assim que existir o primeiro orçamento OU
 * o primeiro cliente.
 */
export function PrimeirosPassosCard() {
	return (
		<Card className="gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
					<Rocket className="size-5" strokeWidth={2.2} />
				</span>
				<div>
					<h2 className="text-base font-semibold text-text-primary">Primeiros passos</h2>
					<p className="mt-0.5 text-xs text-text-secondary">
						Sua conta está pronta. Comece por aqui para os números ganharem vida.
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
				{PASSOS.map((passo) => (
					<Link
						key={passo.to}
						to={passo.to}
						className="group flex items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
					>
						<span
							className="grid size-9 shrink-0 place-items-center rounded-lg border"
							style={{ backgroundColor: `${passo.color}1A`, color: passo.color, borderColor: `${passo.color}33` }}
						>
							<passo.Icon className="size-[18px]" strokeWidth={2.2} />
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex items-start gap-1 text-sm font-semibold leading-snug text-text-primary">
								<span>{passo.titulo}</span>
								<ArrowUpRight className="mt-0.5 size-3.5 shrink-0 -translate-x-1 text-text-disabled opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
							</div>
							<p className="mt-1 text-xs leading-snug text-text-secondary">{passo.descricao}</p>
						</div>
					</Link>
				))}
			</div>
		</Card>
	);
}
