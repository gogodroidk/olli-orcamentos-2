/**
 * A DICA DE PRIMEIRA VEZ do quadro — mostrada UMA vez por navegador, e nunca mais.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════
 * O card do quadro não anuncia que se arrasta. Quem nunca viu um funil desses lê a
 * tela inteira e não descobre o gesto — e aí o quadro vira uma lista bonita e morta.
 * A alça (`task-card.tsx`) resolve o "isto é arrastável?" para quem passa o mouse;
 * esta dica resolve o "isto se arrasta?" para quem chega pela primeira vez.
 *
 * O QUE ELA NÃO É: um tour. Nada de passo 1 de 4, nada de overlay bloqueando o
 * quadro, nada de "Próximo". É uma linha de texto que aparece sozinha, some sozinha
 * e pode ser fechada — custo zero de clique para quem já sabe arrastar.
 *
 * TRÊS JEITOS DE ELA IR EMBORA, todos definitivos (o carimbo é gravado nos três):
 *  1. o usuário fecha no X;
 *  2. o tempo acaba (ela sai sozinha);
 *  3. o usuário ARRASTA um card — aprendeu na prática, não precisa mais de aula.
 *
 * O carimbo mora no `localStorage`. Se o `localStorage` estiver indisponível
 * (navegação privada em Safari antigo, storage bloqueado), a dica NÃO vira uma
 * praga que reaparece a cada F5: o sinalizador de módulo garante no máximo uma
 * aparição por sessão da aba.
 */
import { useCallback, useEffect, useState } from "react";

/** Versionada: se um dia o gesto mudar, `v2` volta a ensinar quem já tinha visto. */
const CHAVE = "olli.quadro.dica-arrastar.v1";

/** Tempo na tela. Longo o bastante para ser lido sem pressa, curto para não virar mobília. */
const MS_NA_TELA = 15_000;

/** Duração do fade de saída — precisa bater com a classe `duration-200` da dica. */
const MS_DE_SAIDA = 220;

/** Rede de segurança para quando o `localStorage` não pode ser lido nem escrito. */
let jaApareceuNestaSessao = false;

function jaViu(): boolean {
	try {
		return window.localStorage.getItem(CHAVE) === "1";
	} catch {
		// Sem storage, a única memória que temos é a da aba aberta.
		return jaApareceuNestaSessao;
	}
}

function marcarComoVista(): void {
	jaApareceuNestaSessao = true;
	try {
		window.localStorage.setItem(CHAVE, "1");
	} catch {
		// Storage bloqueado: o sinalizador de módulo acima já segura o resto da sessão.
	}
}

export interface DicaDeArraste {
	/** Está montada (inclui o instante do fade de saída). */
	visivel: boolean;
	/** Está saindo — a dica usa isto para ir a `opacity-0` antes de desmontar. */
	saindo: boolean;
	/** Fecha e carimba: não aparece mais. Idempotente. */
	fechar: () => void;
}

/**
 * @param pronto só conta a partir do momento em que o quadro tem card na tela —
 * uma dica de arrastar sobre um esqueleto de carregamento (ou sobre o vazio) ensina
 * um gesto que não tem em que ser feito, e queimaria a única aparição.
 */
export function useDicaDeArraste(pronto: boolean): DicaDeArraste {
	const [visivel, setVisivel] = useState(false);
	const [saindo, setSaindo] = useState(false);

	useEffect(() => {
		if (!pronto || jaApareceuNestaSessao || jaViu()) return;
		jaApareceuNestaSessao = true;
		setVisivel(true);
	}, [pronto]);

	const fechar = useCallback(() => {
		marcarComoVista();
		setSaindo(true);
	}, []);

	// Some sozinha.
	useEffect(() => {
		if (!visivel || saindo) return;
		const t = window.setTimeout(fechar, MS_NA_TELA);
		return () => window.clearTimeout(t);
	}, [visivel, saindo, fechar]);

	// Desmonta depois do fade.
	useEffect(() => {
		if (!saindo) return;
		const t = window.setTimeout(() => {
			setVisivel(false);
			setSaindo(false);
		}, MS_DE_SAIDA);
		return () => window.clearTimeout(t);
	}, [saindo]);

	return { visivel, saindo, fechar };
}
