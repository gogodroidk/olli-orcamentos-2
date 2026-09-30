/**
 * Onde mora a memória "o que o dono viu da última vez" (ver `use-valor-visto.ts`).
 *
 * Arquivo sem import de propósito: o `userStore` precisa apagar essa memória no
 * "Sair" e não pode importar o hook (que importa o `userStore` — ciclo).
 */
export const PREFIXO_VISTO = "olli.visto.";

/**
 * LGPD: apaga do navegador os números que o painel guardou para a próxima visita
 * (ex.: o "Recebido no mês" em reais, com o id da conta na chave). Chamado no
 * "Sair" — num computador compartilhado, quem senta depois não pode ler quanto o
 * prestador recebeu. O custo é só a próxima visita não ter de onde contar.
 */
export function esquecerValoresVistos(): void {
	try {
		const ls = window.localStorage;
		const chaves: string[] = [];
		for (let i = 0; i < ls.length; i++) {
			const chave = ls.key(i);
			if (chave?.startsWith(PREFIXO_VISTO)) chaves.push(chave);
		}
		for (const chave of chaves) ls.removeItem(chave);
	} catch {
		// Armazenamento bloqueado: então também não havia nada gravado.
	}
}
