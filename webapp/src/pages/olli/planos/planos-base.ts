/**
 * OS PLANOS — cópia literal de `PLANOS_BASE` (src/screens/PlanosScreen.tsx, ~linha 80).
 *
 * ⚠️ NADA AQUI PODE SER ESCRITO DE MEMÓRIA. Já aconteceu neste projeto (está
 * documentado no próprio PlanosScreen): a página web anunciou "o Pro libera
 * orçamentos ilimitados" — falso, o Grátis já os tem — e vendeu como pronto um
 * recurso de equipe que a própria tela do app marca "(em breve)". Isso é promessa
 * que o produto não cumpre, cobrada em dinheiro.
 *
 * Preço, benefício e o "(em breve)" vêm do app. Se lá mudar, mude aqui.
 *
 * O que o plano DE FATO libera em código está em `src/services/planos.ts`
 * (RECURSOS_POR_PLANO) — os benefícios abaixo são a leitura comercial disso.
 */
import type { PlanoId } from "./tipos";

export interface PlanoBase {
	id: PlanoId;
	nome: string;
	preco: string;
	periodo?: string;
	tagline: string;
	destaque?: boolean;
	beneficios: string[];
}

export const PLANOS_BASE: readonly PlanoBase[] = [
	{
		id: "gratis",
		nome: "Grátis",
		preco: "R$ 0",
		tagline: "Tudo que você precisa pra começar a fechar negócio.",
		beneficios: [
			"Orçamentos e recibos ilimitados",
			"Catálogo de serviços e produtos",
			"Clientes e agenda",
			"Diagnóstico por código de erro (offline)",
			"Link do orçamento para o cliente",
		],
	},
	{
		id: "pro",
		nome: "Pro",
		preco: "R$ 39",
		periodo: "/mês",
		tagline: "Para o autônomo que quer vender mais e ganhar tempo.",
		destaque: true,
		beneficios: [
			"Tudo do plano Grátis",
			"Relatórios de faturamento e conversão",
			"Metas de vendas e acompanhamento por período",
			"Suporte prioritário por WhatsApp",
		],
	},
	{
		id: "empresa",
		nome: "Empresa",
		preco: "R$ 99",
		periodo: "/mês",
		tagline: "Para equipes que atendem em campo todos os dias.",
		beneficios: [
			"Tudo do plano Pro",
			"Vários técnicos e permissões por papel (em breve)",
			"Equipe ao vivo no mapa (em breve)",
			"Painel de gestão e metas da equipe (em breve)",
			"Suporte prioritário",
		],
	},
];

/** Nome de exibição do plano. */
export function nomeDoPlano(p: PlanoId): string {
	return p === "empresa" ? "Empresa" : p === "pro" ? "Pro" : "Grátis";
}
