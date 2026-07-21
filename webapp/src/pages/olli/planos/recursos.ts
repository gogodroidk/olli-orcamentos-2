/**
 * COMPARATIVO DE RECURSOS — quem entrega o quê, lido do MESMO mapa que o app e o worker.
 *
 * As colunas de "incluído / não incluído" NÃO são digitadas à mão: elas perguntam ao
 * `temAcessoRecurso` de `src/services/entitlements.ts` (via ponte `@entitlements`), a
 * mesma função que decide o acesso de verdade no produto. Assim o comparativo não pode
 * prometer um recurso que o plano não libera — se a tabela de entitlements mudar, esta
 * tela muda junto, sem ninguém reescrever de memória (o erro que já vendeu recurso
 * inexistente neste projeto — ver `planos-base.ts`).
 *
 * O RÓTULO de cada linha é copy comercial derivada dos próprios comentários de
 * `entitlements.ts` e do `PLANOS_BASE` do app. O "(em breve)" acompanha exatamente o
 * que a tela do app marca como ainda em desenvolvimento (mapa/painel da equipe).
 */
import { IA_USOS_GRATIS_MES, type PlanoId, type Recurso, temAcessoRecurso } from "@entitlements";

export { IA_USOS_GRATIS_MES, temAcessoRecurso };
export type { PlanoId, Recurso };

/** Uma linha do comparativo: um recurso do mapa de entitlements + seu rótulo na tela. */
export interface LinhaRecurso {
	recurso: Recurso;
	rotulo: string;
	/** Marcado "(em breve)" na tela do app — não vendemos como pronto. */
	emBreve?: boolean;
}

/**
 * As linhas pagas, na ordem em que valem a pena de cima para baixo. A cobertura por
 * plano é resolvida em runtime por `temAcessoRecurso`, não fixada aqui.
 */
export const LINHAS_RECURSOS: readonly LinhaRecurso[] = [
	{ recurso: "ia_ilimitada", rotulo: "IA sem limite (voz, chat e diagnóstico)" },
	{ recurso: "relatorios", rotulo: "Relatórios de faturamento e conversão" },
	{ recurso: "metas", rotulo: "Metas de vendas e acompanhamento" },
	{ recurso: "radar_clientes", rotulo: "Radar de clientes que sumiram" },
	{ recurso: "relatorio_dia", rotulo: "Relatório do dia, falado" },
	{ recurso: "modelos_pdf_premium", rotulo: "Modelos premium de PDF" },
	{ recurso: "remove_olli_brand", rotulo: "Documento sem a marca OLLI" },
	{ recurso: "equipe", rotulo: "Vários técnicos e permissões por papel" },
	{ recurso: "mapa_equipe", rotulo: "Equipe ao vivo no mapa", emBreve: true },
	{ recurso: "dashboard_empresa", rotulo: "Painel de gestão da empresa", emBreve: true },
];

/** A ordem das colunas do comparativo. */
export const PLANOS_COMPARADOS: readonly PlanoId[] = ["gratis", "pro", "empresa"];
