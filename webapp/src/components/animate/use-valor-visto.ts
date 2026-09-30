import { useEffect, useRef, useState } from "react";
import { useUserInfo } from "@/store/userStore";

const PREFIXO = "olli.visto.";

/**
 * O valor que ESTE número mostrava na última vez que o dono o viu (neste navegador).
 *
 * É o que dá sentido ao "dinheiro entrou": o prestador registra o recibo no celular,
 * abre o painel e vê o "Recebido no mês" subir de onde ele parou — não de zero, que
 * seria encenação. Lido UMA vez na montagem; o valor atual é gravado assim que chega.
 *
 * Por conta (id do usuário na chave) para não misturar duas contas no mesmo
 * computador. `null` quando não há leitura anterior, a conta ainda não carregou ou o
 * armazenamento está bloqueado (aba anônima) — e aí nada anima: sem referência
 * verdadeira, o número aparece pronto. `chave: null` desliga o hook (componente que
 * só às vezes conta).
 */
export function useValorVistoAntes(chave: string | null, valor: number | null): number | null {
	const uid = useUserInfo().id;
	const chaveCompleta = uid && chave ? `${PREFIXO}${uid}.${chave}` : null;
	const [antes, setAntes] = useState<number | null>(() => ler(chaveCompleta));
	// Qual chave já foi LIDA. Se a conta só chegar depois do 1º render, lê a referência
	// antes de gravar o valor atual por cima dela.
	const lidaRef = useRef(chaveCompleta);

	useEffect(() => {
		if (!chaveCompleta) return;
		if (lidaRef.current !== chaveCompleta) {
			lidaRef.current = chaveCompleta;
			setAntes(ler(chaveCompleta));
		}
		if (valor !== null) gravar(chaveCompleta, valor);
	}, [chaveCompleta, valor]);

	return antes;
}

function ler(chave: string | null): number | null {
	if (!chave) return null;
	try {
		const bruto = window.localStorage.getItem(chave);
		if (bruto === null) return null;
		const n = Number(bruto);
		return Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
}

function gravar(chave: string, valor: number): void {
	try {
		window.localStorage.setItem(chave, String(valor));
	} catch {
		// Armazenamento bloqueado: da próxima vez o número só aparece pronto.
	}
}
