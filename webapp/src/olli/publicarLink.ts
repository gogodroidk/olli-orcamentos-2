/**
 * Publica o orçamento para o CLIENTE (`orcamentos_publicos`) e devolve o link `/o/<token>`.
 *
 * É a versão do PAINEL de `gerarLinkOrcamento` (app, src/services/clienteLink.ts). O que o cliente
 * vê (token, snapshot, Pix) vem das MESMAS funções puras (`clienteLinkSnapshot.ts`); aqui só mora
 * o que muda de ambiente: o cliente Supabase do navegador e a leitura dos recibos na nuvem.
 *
 * Por que o painel passou a ter isto (06/10/2026): o painel só imprimia o PDF. Dos 10 PDFs
 * "enviados" por contas reais, 0 tinham link /o/ e 4 seguiam em rascunho — o cliente nunca tinha
 * como abrir nada. Ver o menu do orçamento em `pages/olli/orcamentos`.
 *
 * Regras herdadas do app (cada uma já custou um bug lá):
 *  - o token EXISTENTE é reaproveitado (o link não muda no reenvio) e erro de LEITURA lança: "não
 *    consegui ver" nunca vira "não existe", senão nasce um 2º link e o cliente que já aprovou no
 *    1º vê o pedido de aprovação de novo;
 *  - reenvio atualiza só o conteúdo, NUNCA o `status` (é a resposta do cliente; só o worker escreve);
 *  - colisão de token (23505) tenta outro; outro erro lança;
 *  - recibos que não dá para ler = `null` (a página não monta Pix), nunca "0 recebido".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Empresa, Orcamento } from "@dominio";
import { conteudoDoLink, gerarTokenLink } from "../../../src/services/clienteLinkSnapshot.ts";
import { cobrancaDoLink } from "../../../src/utils/cobrancaCliente.ts";

/** Domínio do portal do cliente. Mesmo default do app (`src/config.ts`). */
export const LINK_BASE_URL: string = (
	(import.meta.env?.VITE_LINK_BASE_URL as string | undefined) ?? "https://link.olliorcamentos.online"
).replace(/\/+$/, "");

interface Deps {
	supabase: Pick<SupabaseClient, "auth" | "from">;
	baseUrl?: string;
	/** Só para teste: token determinístico. */
	novoToken?: () => string;
}

/** Soma dos recibos não estornados do orçamento, ou `null` se a leitura falhou. */
async function recebidoNaNuvem(supabase: Deps["supabase"], orcamentoId: string): Promise<number | null> {
	try {
		const { data, error } = await supabase
			.from("recibos")
			.select("valor_recebido, dados")
			.eq("orcamento_id", orcamentoId)
			.is("excluido_em", null);
		if (error || !Array.isArray(data)) return null;
		return data.reduce((total, linha) => {
			const estornado = Boolean((linha as { dados?: { estornadoEm?: unknown } }).dados?.estornadoEm);
			const valor = Number((linha as { valor_recebido?: unknown }).valor_recebido);
			return estornado || !Number.isFinite(valor) ? total : total + Math.max(0, valor);
		}, 0);
	} catch {
		return null;
	}
}

export async function publicarLinkOrcamento(orc: Orcamento, empresa: Empresa | null, deps: Deps): Promise<string> {
	const { supabase } = deps;
	const baseUrl = (deps.baseUrl ?? LINK_BASE_URL).replace(/\/+$/, "");
	const novoToken = deps.novoToken ?? (() => gerarTokenLink());

	const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
	const userId = sessao?.user?.id;
	if (erroSessao || !userId) throw new Error("Entre de novo para gerar o link do cliente.");

	const cobranca = cobrancaDoLink(orc, await recebidoNaNuvem(supabase, orc.id));
	const conteudo = conteudoDoLink(orc, empresa, cobranca);

	// Token que já existe: erro de leitura LANÇA (ver cabeçalho).
	const lido = await supabase
		.from("orcamentos_publicos")
		.select("token")
		.eq("orcamento_id", orc.id)
		.eq("user_id", userId)
		.limit(1)
		.maybeSingle();
	if (lido.error) throw lido.error;
	const existente = (lido.data as { token?: string } | null)?.token ?? null;

	let token = "";
	if (existente) {
		const { data, error } = await supabase
			.from("orcamentos_publicos")
			.update(conteudo)
			.eq("token", existente)
			.eq("user_id", userId)
			.select("token");
		if (error) throw error;
		if (Array.isArray(data) && data.length > 0) token = existente;
		// 0 linhas: a linha sumiu entre a leitura e a escrita — cai na criação abaixo.
	}

	if (!token) {
		const linha = { user_id: userId, orcamento_id: orc.id, ...conteudo, status: "enviado" };
		let inserido = false;
		let ultimoErro: unknown = null;
		for (let tentativa = 0; tentativa < 3 && !inserido; tentativa++) {
			token = novoToken();
			const { error } = await supabase.from("orcamentos_publicos").insert({ token, ...linha });
			if (!error) {
				inserido = true;
				break;
			}
			ultimoErro = error;
			if ((error as { code?: string }).code !== "23505") throw error;
		}
		if (!inserido) throw ultimoErro ?? new Error("Não foi possível gerar o link do cliente.");
	}

	return `${baseUrl}/o/${token}`;
}
