/**
 * LEMBRETE DE ASSINATURA NO PAINEL — liga a regra pura (`@lembreteAssinatura`, a MESMA
 * que o app usa) aos dados que o painel já lê.
 *
 * Nenhuma consulta nova: a assinatura vem de `useMinhaAssinatura` (mesma query da tela
 * de Planos e do selo do documento) e a oferta comercial de `opcoesOfertaComercial`
 * (mesma query da tela de Planos). O preço do Pro vem de `precoDoPlano` — a fonte única
 * de R$ do painel —, nunca digitado aqui.
 *
 * "NÃO SEI" NÃO VIRA COBRANÇA: enquanto qualquer leitura carrega, sem sessão, com o
 * papel na organização indeterminado ou para membro não-dono (a conta é do dono),
 * não há lembrete. Leitura com erro entra como `null` na regra, que não inventa nada.
 */

import {
	chaveDispensaLembrete,
	type EntradaLembrete,
	type Lembrete,
	lembreteAssinatura,
	lembreteDispensado,
} from "@lembreteAssinatura";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { iniciarTrialPro, obterEstadoOfertaComercial } from "@/olli/cota-envios";
import { useMinhaAssinatura } from "@/olli/marcaDocumento";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { ehMembroNaoDono } from "@/olli/papel";
import { useUserInfo } from "@/store/userStore";
import { precoDoPlano, reais } from "./precos";
import type { ResumoAssinatura } from "./tipos";

/**
 * Estado da oferta comercial (RPC `meu_estado_oferta_comercial`). `null` = não
 * confirmado (a função já engole a falha e devolve null — nunca um estado inventado).
 * Uma query só para a tela de Planos e para o lembrete: as duas nunca discordam.
 */
export const opcoesOfertaComercial = queryOptions({
	queryKey: ["olli", "oferta-comercial"],
	queryFn: obterEstadoOfertaComercial,
	staleTime: 60_000,
});

/**
 * Começa o teste grátis do Pro com os MESMOS avisos da tela de Planos (sucesso com a
 * data; falha dizendo que o teste não foi consumido). `recarregar` relê o que a tela
 * mostra. Devolve se iniciou.
 */
export async function comecarTesteProComAviso(recarregar: () => Promise<unknown>): Promise<boolean> {
	const inicio = await iniciarTrialPro();
	if (!inicio) {
		toast.error("Não foi possível iniciar o teste. Confirme a conexão e tente novamente; o teste não foi consumido.");
		return false;
	}
	await recarregar();
	toast.success(`Pro liberado até ${new Date(inicio.terminaEm).toLocaleDateString("pt-BR")}. Sem cobrança automática.`);
	return true;
}

/** O resumo do painel no formato da regra. `origem: "trial"` não existe lá: o teste é lido pela oferta. */
function assinaturaDaRegra(resumo: ResumoAssinatura): NonNullable<EntradaLembrete["assinatura"]> {
	return {
		planoEfetivo: resumo.planoEfetivo,
		planoContratado: resumo.planoContratado,
		origem: resumo.origem === "trial" ? undefined : resumo.origem,
		renovaSozinho: resumo.renovaSozinho,
		proximaCobranca: resumo.proximaCobranca,
	};
}

/**
 * "Agora não" guardado só nesta aba quando o navegador recusa o `localStorage`
 * (aba anônima, armazenamento bloqueado): o aviso some até recarregar, em vez de
 * o botão "não fazer nada".
 */
const dispensadosNestaAba = new Map<string, string>();

function lerDispensa(chave: string): string | null {
	try {
		const salvo = window.localStorage.getItem(chave);
		if (salvo) return salvo;
	} catch {
		// Armazenamento indisponível: vale só a memória da aba.
	}
	return dispensadosNestaAba.get(chave) ?? null;
}

function gravarDispensa(chave: string, quando: string): void {
	dispensadosNestaAba.set(chave, quando);
	try {
		window.localStorage.setItem(chave, quando);
	} catch {
		// Sem armazenamento, a memória da aba já cobre.
	}
}

export interface EstadoLembreteAssinatura {
	/** O lembrete a mostrar agora — `null` = nada a mostrar (ou ainda não sabemos). */
	lembrete: Lembrete | null;
	/** "Agora não". Só esconde lembretes dispensáveis (`dispensavelPorHoras !== null`). */
	dispensar: () => void;
	/** Inicia o teste grátis do Pro (ação `iniciar_trial`) e relê assinatura e oferta. */
	iniciarTeste: () => Promise<void>;
	iniciandoTeste: boolean;
}

export function useLembreteAssinatura(): EstadoLembreteAssinatura {
	const userId = useUserInfo().id ?? "";
	const contexto = useContextoDeEscrita();
	const assinatura = useMinhaAssinatura();
	const oferta = useQuery(opcoesOfertaComercial);
	const [iniciandoTeste, setIniciandoTeste] = useState(false);
	// Muda a cada "agora não" para reler a dispensa recém-gravada.
	const [versaoDispensa, setVersaoDispensa] = useState(0);

	const precoPro = precoDoPlano("pro");
	const pronto =
		!!userId &&
		// Papel CONFIRMADO: carregando ou com erro, não dá para saber se a conta é do dono.
		contexto.isSuccess &&
		!ehMembroNaoDono(contexto.data?.papel) &&
		!assinatura.isLoading &&
		!oferta.isLoading &&
		!!precoPro;

	const lembrete = useMemo(() => {
		void versaoDispensa;
		if (!pronto || !precoPro) return null;
		const agora = new Date();
		const l = lembreteAssinatura({
			agora,
			oferta: oferta.data ?? null,
			assinatura: assinatura.isError || !assinatura.data ? null : assinaturaDaRegra(assinatura.data),
			precoProMensal: reais(precoPro.mensalCentavos),
		});
		if (!l) return null;
		return lembreteDispensado(l, lerDispensa(chaveDispensaLembrete(userId, l)), agora) ? null : l;
	}, [pronto, precoPro, oferta.data, assinatura.isError, assinatura.data, userId, versaoDispensa]);

	const dispensar = useCallback(() => {
		if (!lembrete || lembrete.dispensavelPorHoras === null) return;
		gravarDispensa(chaveDispensaLembrete(userId, lembrete), new Date().toISOString());
		setVersaoDispensa((v) => v + 1);
	}, [lembrete, userId]);

	const { refetch: reler } = assinatura;
	const { refetch: relerOferta } = oferta;
	const iniciarTeste = useCallback(async () => {
		setIniciandoTeste(true);
		await comecarTesteProComAviso(() => Promise.all([reler(), relerOferta()]));
		setIniciandoTeste(false);
	}, [reler, relerOferta]);

	return { lembrete, dispensar, iniciarTeste, iniciandoTeste };
}
