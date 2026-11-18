import {
	BookOpen,
	Calculator,
	Calendar,
	ClipboardList,
	Crown,
	DatabaseBackup,
	FileSignature,
	Files,
	FileText,
	Home,
	Kanban,
	MapPinned,
	MessageSquareText,
	Package,
	PencilRuler,
	Plug,
	Receipt,
	Settings2,
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
 * Ícones em lucide-react 0.487, traço 2, 20px — a mesma família e o mesmo
 * peso do topo e do conteúdo. 24px estourava a caixa de 22px do item e
 * brigava com a lupa e a engrenagem. Orçamentos e Documentos não compartilham
 * mais o mesmo glifo.
 */
export const frontendNavData: NavProps["data"] = [
	{
		name: "Painel",
		items: [{ title: "Início", path: "/inicio", icon: <Home size={20} strokeWidth={2} /> }],
	},
	{
		name: "Comercial",
		items: [
			{ title: "Quadro", path: "/quadro", icon: <Kanban size={20} strokeWidth={2} /> },
			{ title: "Orçamentos", path: "/orcamentos", icon: <FileText size={20} strokeWidth={2} /> },
			{ title: "Clientes", path: "/clientes", icon: <Users size={20} strokeWidth={2} /> },
			{ title: "Prospecção", path: "/prospeccao", icon: <MapPinned size={20} strokeWidth={2} /> },
			{ title: "Produtos", path: "/produtos", icon: <Package size={20} strokeWidth={2} /> },
			{ title: "Serviços", path: "/servicos", icon: <Wrench size={20} strokeWidth={2} /> },
			{ title: "Precificação", path: "/precificacao", icon: <Calculator size={20} strokeWidth={2} /> },
			{ title: "Recibos", path: "/recibos", icon: <Receipt size={20} strokeWidth={2} /> },
			{ title: "Documentos", path: "/documentos", icon: <Files size={20} strokeWidth={2} /> },
			{ title: "Central de dados", path: "/dados", icon: <DatabaseBackup size={20} strokeWidth={2} /> },
		],
	},
	{
		name: "Operação",
		items: [
			{ title: "Ordens de serviço", path: "/ordens-servico", icon: <ClipboardList size={20} strokeWidth={2} /> },
			{ title: "Agenda", path: "/agenda", icon: <Calendar size={20} strokeWidth={2} /> },
			// Contrato recorrente por ativo: gera cada visita na agenda (qualquer ofício).
			{ title: "Contratos", path: "/contratos", icon: <FileSignature size={20} strokeWidth={2} /> },
			{ title: "Equipe", path: "/equipe", icon: <UsersRound size={20} strokeWidth={2} /> },
			// Era `mdi:air-conditioner` (Iconify) — antes disso, `solar:cpu-bolt-bold-duotone`,
			// um CHIP DE PROCESSADOR que não dizia nada sobre equipamento de campo. Os
			// campos da tabela são BTU, refrigerante e tensão: é ar-condicionado. `Wind`
			// (fluxo de ar) é o equivalente em lucide-react.
			{ title: "Equipamentos", path: "/equipamentos", icon: <Wind size={20} strokeWidth={2} /> },
		],
	},
	{
		name: "Ferramentas",
		items: [
			{ title: "Assistente IA", path: "/assistente", icon: <MessageSquareText size={20} strokeWidth={2} /> },
			{ title: "Central de ajuda", path: "/ajuda", icon: <BookOpen size={20} strokeWidth={2} /> },
			{ title: "Ferramentas de ofício", path: "/ferramentas", icon: <PencilRuler size={20} strokeWidth={2} /> },
			{
				// A base é 100% HVAC (climatização/refrigeração) — só aparece pra quem
				// tem esse ofício, via o gate de `ITENS_SOMENTE_VERTICAL` em
				// `nav-data/index.ts` (@/olli/verticais). Backward-compat: sem ofício
				// definido, mostra normalmente.
				title: "Diagnóstico IA",
				path: "/diagnostico",
				icon: <Stethoscope size={20} strokeWidth={2} />,
			},
		],
	},
	{
		name: "Conta",
		items: [
			{ title: "Planos", path: "/planos", icon: <Crown size={20} strokeWidth={2} /> },
			{ title: "Meu negócio", path: "/meu-negocio", icon: <Store size={20} strokeWidth={2} /> },
			{ title: "Integrações", path: "/integracoes", icon: <Plug size={20} strokeWidth={2} /> },
			{ title: "Configurações", path: "/configuracoes", icon: <Settings2 size={20} strokeWidth={2} /> },
		],
	},
];
