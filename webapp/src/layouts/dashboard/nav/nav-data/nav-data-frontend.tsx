import {
	Calculator,
	Calendar,
	ClipboardList,
	Crown,
	FileText,
	Home,
	Kanban,
	Package,
	Receipt,
	Stethoscope,
	Store,
	Users,
	UsersRound,
	Wind,
	Wrench,
} from "lucide-react";
import type { NavProps } from "@/components/nav";

/**
 * Menu do painel OLLI (pt-BR). Os `title` são texto direto — o i18next
 * devolve a própria string quando não acha a chave, então não precisa de
 * tradução para renderizar em português.
 *
 * Ícones em lucide-react (linha fina) — mesma família usada no conteúdo das
 * telas, pra não misturar com o Iconify "solar:*-bold-duotone" (preenchido)
 * que ficava divergente do cabeçalho de cada página (ex.: Orçamentos usava
 * um ícone de documento no menu e outro, `FileText`, no cabeçalho).
 */
export const frontendNavData: NavProps["data"] = [
	{
		name: "Painel",
		items: [{ title: "Início", path: "/inicio", icon: <Home size={24} /> }],
	},
	{
		name: "Comercial",
		items: [
			{ title: "Quadro", path: "/quadro", icon: <Kanban size={24} /> },
			{ title: "Orçamentos", path: "/orcamentos", icon: <FileText size={24} /> },
			{ title: "Clientes", path: "/clientes", icon: <Users size={24} /> },
			{ title: "Produtos", path: "/produtos", icon: <Package size={24} /> },
			{ title: "Serviços", path: "/servicos", icon: <Wrench size={24} /> },
			{ title: "Recibos", path: "/recibos", icon: <Receipt size={24} /> },
		],
	},
	{
		name: "Operação",
		items: [
			{ title: "Ordens de serviço", path: "/ordens-servico", icon: <ClipboardList size={24} /> },
			{ title: "Agenda", path: "/agenda", icon: <Calendar size={24} /> },
			{ title: "Equipe", path: "/equipe", icon: <UsersRound size={24} /> },
			// Era `mdi:air-conditioner` (Iconify) — antes disso, `solar:cpu-bolt-bold-duotone`,
			// um CHIP DE PROCESSADOR que não dizia nada sobre equipamento de campo. Os
			// campos da tabela são BTU, refrigerante e tensão: é ar-condicionado. `Wind`
			// (fluxo de ar) é o equivalente em lucide-react.
			{ title: "Equipamentos", path: "/equipamentos", icon: <Wind size={24} /> },
		],
	},
	{
		name: "Ferramentas",
		items: [
			{ title: "Ferramentas de ofício", path: "/ferramentas", icon: <Calculator size={24} /> },
			{
				// A base é 100% HVAC (climatização/refrigeração) — só aparece pra quem
				// tem esse ofício, via o gate de `ITENS_SOMENTE_VERTICAL` em
				// `nav-data/index.ts` (@/olli/verticais). Backward-compat: sem ofício
				// definido, mostra normalmente.
				title: "Diagnóstico IA",
				path: "/diagnostico",
				icon: <Stethoscope size={24} />,
			},
		],
	},
	{
		name: "Conta",
		items: [
			{ title: "Planos", path: "/planos", icon: <Crown size={24} /> },
			{ title: "Meu negócio", path: "/meu-negocio", icon: <Store size={24} /> },
		],
	},
];
