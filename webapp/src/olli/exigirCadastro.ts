/**
 * PORTA DO CADASTRO NO ENVIO — gêmea web de `src/services/exigirCadastro.ts` (app).
 *
 * Desde o app 1.2.0 o cadastro incompleto NÃO fecha mais o produto: a pessoa entra,
 * monta o primeiro orçamento (o exemplo do ofício no Início) e só é cobrada dos dados
 * do negócio quando um documento vai SAIR com eles (PDF do orçamento, contrato). O
 * painel ainda tinha a trava antiga (`OnboardingGuard` mandava tudo para Meu Negócio)
 * e 38 de 61 contas nunca passaram dela (04/10/2026). Esta porta substitui a trava.
 *
 * A regra é a MESMA do app (`estadoCadastroDaLeitura` + `decidirEnvioComCadastro`,
 * em `src/services/perfilOperacional.ts`), com os 3 estados:
 *  - completo → libera;
 *  - incompleto → segura e diz o que falta, com "Completar agora" (dono);
 *  - leitura falhou → segura com "não consegui conferir". Erro nunca libera.
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { opcoesMinhaEmpresa } from "@/olli/data";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import {
	type DecisaoEnvioDocumento,
	decidirEnvioComCadastro,
	estadoCadastroDaLeitura,
	juntarPendentes,
} from "@/olli/onboarding";
import { ehDonoDaConta } from "@/olli/papel";

/** O que a pessoa tentou gerar — só muda a frase do aviso. */
export type DocumentoComCadastro = "orcamento" | "contrato" | "documento";

const NOME_DOCUMENTO: Record<DocumentoComCadastro, string> = {
	orcamento: "O orçamento",
	contrato: "O contrato",
	documento: "O documento",
};

export interface AvisoPortaCadastro {
	titulo: string;
	mensagem: string;
	/** Mostrar "Completar agora" (só quem pode abrir o Meu Negócio). */
	completar: boolean;
}

/**
 * Texto do aviso para uma decisão SEGURADA (pura, testável). `null` quando libera.
 * `podeCompletar` é `false` só com o papel CONHECIDO e não-dono: membro não edita o
 * cadastro da empresa, então não recebe um botão que não leva a lugar nenhum.
 */
export function avisoDaPortaCadastro(
	decisao: DecisaoEnvioDocumento,
	documento: DocumentoComCadastro,
	podeCompletar: boolean,
): AvisoPortaCadastro | null {
	if (decisao.libera) return null;
	if (decisao.motivo === "nao_sei") {
		return {
			titulo: "Nada foi gerado",
			mensagem: "Não consegui conferir os dados do seu negócio agora. Tente de novo em instantes.",
			completar: false,
		};
	}
	const falta = juntarPendentes(decisao.pendentes);
	if (!podeCompletar) {
		return {
			titulo: "Nada foi gerado",
			mensagem: `${NOME_DOCUMENTO[documento]} sai com os dados do negócio, e falta ${falta}. Peça ao dono da empresa para completar os dados do negócio.`,
			completar: false,
		};
	}
	return {
		titulo: "Complete seu negócio para gerar",
		mensagem: `${NOME_DOCUMENTO[documento]} sai com o nome e o contato do seu negócio. Falta: ${falta}.`,
		completar: true,
	};
}

/**
 * Lê a empresa NA HORA (não confia no cache, que pode ser de minutos atrás) e decide.
 * Nunca lança: leitura que falha vira `nao_sei`.
 */
export async function conferirCadastroParaGerar(qc: QueryClient): Promise<DecisaoEnvioDocumento> {
	try {
		const empresa = await qc.fetchQuery({ ...opcoesMinhaEmpresa, staleTime: 0 });
		return decidirEnvioComCadastro(estadoCadastroDaLeitura({ ok: true, empresa }));
	} catch {
		return decidirEnvioComCadastro(estadoCadastroDaLeitura({ ok: false }));
	}
}

/** Endereço do Meu Negócio em modo "completar", voltando para onde a pessoa estava. */
export function rotaCompletarCadastro(retorno: string): string {
	return `/meu-negocio?onboarding=1&retorno=${encodeURIComponent(retorno)}`;
}

/**
 * Hook da porta: `await exigir("orcamento")` devolve `true` quando pode gerar; senão
 * mostra o aviso certo (com "Completar agora" para o dono) e devolve `false`.
 * Papel ainda desconhecido mantém o caminho de completar (o Meu Negócio continua
 * protegido pela própria tela) — mesma escolha do app.
 */
export function usePortaDoCadastro() {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const local = useLocation();
	const contexto = useContextoDeEscrita();
	const papelConhecido = contexto.isSuccess;
	const papel = contexto.data?.papel;

	return useCallback(
		async (documento: DocumentoComCadastro): Promise<boolean> => {
			const decisao = await conferirCadastroParaGerar(qc);
			const podeCompletar = !papelConhecido || ehDonoDaConta(papel);
			const aviso = avisoDaPortaCadastro(decisao, documento, podeCompletar);
			if (!aviso) return true;
			const retorno = `${local.pathname}${local.search}`;
			toast.error(aviso.titulo, {
				description: aviso.mensagem,
				position: "top-center",
				duration: 10_000,
				action: aviso.completar
					? { label: "Completar agora", onClick: () => navigate(rotaCompletarCadastro(retorno)) }
					: undefined,
			});
			return false;
		},
		[qc, navigate, local.pathname, local.search, papelConhecido, papel],
	);
}
