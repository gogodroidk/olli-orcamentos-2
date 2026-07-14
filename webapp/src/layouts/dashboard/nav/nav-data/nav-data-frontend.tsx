import { Icon } from "@/components/icon";
import type { NavProps } from "@/components/nav";

/**
 * Menu do painel OLLI (pt-BR). Os `title` são texto direto — o i18next
 * devolve a própria string quando não acha a chave, então não precisa de
 * tradução para renderizar em português.
 */
export const frontendNavData: NavProps["data"] = [
	{
		name: "Painel",
		items: [{ title: "Início", path: "/inicio", icon: <Icon icon="solar:home-smile-bold-duotone" size="24" /> }],
	},
	{
		name: "Comercial",
		items: [
			{ title: "Quadro", path: "/quadro", icon: <Icon icon="solar:checklist-minimalistic-bold-duotone" size="24" /> },
			{ title: "Orçamentos", path: "/orcamentos", icon: <Icon icon="solar:document-text-bold-duotone" size="24" /> },
			{ title: "Clientes", path: "/clientes", icon: <Icon icon="solar:users-group-rounded-bold-duotone" size="24" /> },
			{ title: "Produtos", path: "/produtos", icon: <Icon icon="solar:box-bold-duotone" size="24" /> },
			{
				title: "Serviços",
				path: "/servicos",
				icon: <Icon icon="solar:settings-minimalistic-bold-duotone" size="24" />,
			},
			{ title: "Recibos", path: "/recibos", icon: <Icon icon="solar:bill-list-bold-duotone" size="24" /> },
		],
	},
	{
		name: "Operação",
		items: [
			{
				title: "Ordens de serviço",
				path: "/ordens-servico",
				icon: <Icon icon="solar:clipboard-list-bold-duotone" size="24" />,
			},
			{ title: "Agenda", path: "/agenda", icon: <Icon icon="solar:calendar-bold-duotone" size="24" /> },
			{ title: "Equipe", path: "/equipe", icon: <Icon icon="solar:users-group-two-rounded-bold-duotone" size="24" /> },
			{ title: "Equipamentos", path: "/equipamentos", icon: <Icon icon="solar:cpu-bolt-bold-duotone" size="24" /> },
		],
	},
	{
		name: "Ferramentas",
		items: [
			{
				title: "Ferramentas de ofício",
				path: "/ferramentas",
				icon: <Icon icon="solar:widget-5-bold-duotone" size="24" />,
			},
			{
				title: "Diagnóstico IA",
				path: "/diagnostico",
				icon: <Icon icon="solar:magic-stick-3-bold-duotone" size="24" />,
			},
		],
	},
	{
		name: "Conta",
		items: [
			{ title: "Planos", path: "/planos", icon: <Icon icon="solar:crown-bold-duotone" size="24" /> },
			{ title: "Meu negócio", path: "/meu-negocio", icon: <Icon icon="solar:shop-2-bold-duotone" size="24" /> },
		],
	},
];
