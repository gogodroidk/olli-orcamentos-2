/**
 * MARCA DO DOCUMENTO — a LEITURA que alimenta a regra de `marcaRegra.ts`.
 *
 * Aqui mora o I/O (a consulta da assinatura e o papel na organização) e as duas
 * formas de consumi-lo. A regra em si — quem tem direito a tirar o selo do OLLI, e o
 * que fazer quando não dá para saber — está em `./marcaRegra`, sem client e sem
 * hook, para poder ser executada fora do painel.
 *
 * A justificativa que estava escrita em `pdf/imprimirContrato.ts` ("o painel não tem
 * gate de plano, nenhum usePlano/temAcesso existe aqui") era verdade quando foi
 * escrita e deixou de ser: a tela de Planos passou a ler a assinatura REAL. Enquanto
 * o comentário envelhecia calado, o assinante Pro/Empresa recebia o contrato SEM selo
 * pelo celular e COM selo pelo computador.
 */
import { queryOptions, type QueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { derivar, type LinhaAssinatura, type ResumoAssinatura, SEM_ASSINATURA } from "@/pages/olli/planos/tipos";
import { derivarMarca, type Marca } from "./marcaRegra";
import { opcoesContextoDeEscrita } from "./mutacoes";

export { avisoDaMarca, type Marca, type MotivoIndeterminado } from "./marcaRegra";

/* ─────────────────────────  A leitura da assinatura  ───────────────────────── */

/**
 * A query da MINHA assinatura. Mora aqui (e não na tela de Planos) porque agora tem
 * dois leitores: a tela que mostra o plano e o gerador de documentos que decide o
 * selo. Mesma `queryKey` → o React Query serve os dois com UMA requisição, e as duas
 * respostas nunca podem discordar.
 */
export const opcoesAssinatura = queryOptions({
	queryKey: ["olli", "assinatura", "me"],
	queryFn: async (): Promise<ResumoAssinatura> => {
		const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
		if (erroSessao) throw erroSessao;
		const meuId = sessao.user?.id;
		if (!meuId) throw new Error("Sessão não encontrada. Entre de novo para ver seu plano.");

		// Só estas 3 colunas: são as que o app tem grant de SELECT (services/planos.ts).
		const { data, error } = await supabase
			.from("assinaturas")
			.select("plano, status, current_period_end")
			.eq("user_id", meuId)
			.maybeSingle();
		// O erro SOBE (vira isError) de propósito: quem chama tem que distinguir
		// "falhou" de "não tem assinatura". Engolir aqui recriaria o bug crônico.
		if (error) throw error;

		return data ? derivar(data as LinhaAssinatura) : SEM_ASSINATURA;
	},
	staleTime: 60_000,
	retry: 1,
});

/** Leitura da assinatura do usuário logado. RLS já limita à própria linha. */
export function useMinhaAssinatura() {
	return useQuery(opcoesAssinatura);
}

/* ───────────────────────────────  Os consumos  ─────────────────────────────── */

/** Estado da marca para uma TELA: obriga o chamador a tratar o "ainda não sei". */
export type EstadoMarca = { estado: "carregando" } | { estado: "pronto"; marca: Marca };

/**
 * Para telas que decidem ANTES do clique (o diálogo do contrato): enquanto carrega,
 * o botão espera e diz que está esperando. Um botão que imprime durante a dúvida
 * transforma a dúvida em papel.
 */
export function useMarcaDoDocumento(): EstadoMarca {
	const assinatura = useQuery(opcoesAssinatura);
	const contexto = useQuery(opcoesContextoDeEscrita);

	if (assinatura.isLoading || contexto.isLoading) return { estado: "carregando" };

	return {
		estado: "pronto",
		marca: derivarMarca({
			resumo: assinatura.data,
			falhouAssinatura: assinatura.isError,
			// Erro na leitura do papel → `undefined` = "não sei o papel", que cai no
			// caminho normal (idêntico à tela de Planos).
			papel: contexto.isError ? undefined : contexto.data?.papel,
		}),
	};
}

/** `await` que não deixa a falha de UMA leitura derrubar a decisão da outra. */
async function tentar<T>(promessa: Promise<T>): Promise<{ ok: true; valor: T } | { ok: false }> {
	try {
		return { ok: true, valor: await promessa };
	} catch {
		return { ok: false };
	}
}

/**
 * Para fluxos IMPERATIVOS (o botão de PDF da lista, que imprime no clique): resolve
 * as duas leituras antes de decidir. Com o cache quente é instantâneo; com a query
 * no ar, ele ESPERA a que já está voando em vez de disparar uma segunda.
 *
 * Nunca lança: uma leitura de plano que falha não pode impedir o prestador de
 * imprimir o documento dele. Ela volta como `confirmado: false`, para o chamador
 * dizer o que aconteceu.
 */
export async function resolverMarcaDoDocumento(qc: QueryClient): Promise<Marca> {
	const [assinatura, contexto] = await Promise.all([
		tentar(qc.fetchQuery(opcoesAssinatura)),
		tentar(qc.fetchQuery(opcoesContextoDeEscrita)),
	]);

	return derivarMarca({
		resumo: assinatura.ok ? assinatura.valor : undefined,
		falhouAssinatura: !assinatura.ok,
		papel: contexto.ok ? contexto.valor.papel : undefined,
	});
}
