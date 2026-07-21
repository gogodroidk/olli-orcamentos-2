import { type ComponentType, lazy } from "react";

/**
 * Carregamento de chunk em rede ruim.
 *
 * O painel é dividido em pedaços que baixam sob demanda (cada tela é um arquivo).
 * Isso é ótimo para o peso da primeira tela e PÉSSIMO se ninguém tratar a falha:
 * o prestador está no meio da rua, o 4G oscila na hora exata em que ele toca em
 * "Orçamentos", o `import()` rejeita — e o React sobe o erro até a fronteira mais
 * próxima. Sem tratamento isso é uma TELA MORTA em cima de uma rede que já voltou.
 *
 * É a mesma doença do "erro vira vazio", só que em forma de bundle: a tela some e
 * nada explica por quê. Aqui a resposta é: tentar de novo sozinho (a maioria das
 * quedas de 4G dura menos de um segundo) e, se ainda assim não vier, entregar o
 * erro para o ChunkBoundary mostrar uma saída — nunca engolir.
 */

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reconhece a falha de DOWNLOAD de chunk e a separa de um erro de verdade dentro
 * do módulo (um `throw` no corpo do componente também rejeita o `import()`).
 * A distinção importa: falha de rede pede "tente de novo"; bug pede o Sentry.
 * Na dúvida devolvemos `false` — dizer "é da sua internet" quando é bug nosso
 * empurra o problema para o usuário e esconde a causa.
 */
export function ehErroDeChunk(erro: unknown): boolean {
	const msg = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro ?? "");
	return (
		/Failed to fetch dynamically imported module/i.test(msg) ||
		/error loading dynamically imported module/i.test(msg) ||
		/Importing a module script failed/i.test(msg) ||
		/ChunkLoadError/i.test(msg) ||
		/dynamically imported module/i.test(msg)
	);
}

async function importarComTentativas<T>(fabrica: () => Promise<T>, tentativas: number): Promise<T> {
	let ultimoErro: unknown;
	for (let i = 0; i < tentativas; i++) {
		try {
			return await fabrica();
		} catch (erro) {
			ultimoErro = erro;
			// Só insiste em falha de REDE. Se o módulo tem bug, repetir 3x só atrasa
			// a tela de erro em ~1s e não conserta nada.
			if (!ehErroDeChunk(erro)) throw erro;
			// 300ms, 600ms — o suficiente para a mão sair da frente da antena ou o
			// aparelho trocar de torre, sem deixar o dono olhando para o nada.
			if (i < tentativas - 1) await esperar(300 * 2 ** i);
		}
	}
	throw ultimoErro;
}

/**
 * `React.lazy` com reentrega. Use no lugar do `lazy` puro em TODO import() de tela.
 *
 * Atenção ao limite: depois que um `lazy` rejeita, o React guarda a promessa
 * rejeitada e o mesmo componente nunca mais tenta sozinho. Por isso a insistência
 * mora AQUI DENTRO (antes de o React ver o resultado) e a última cartada — recarregar
 * a página — fica no ChunkBoundary. Um botão "tentar de novo" que só re-renderiza o
 * mesmo `lazy` não busca nada de novo e mente para o usuário.
 */
export function lazyComRetry<T extends ComponentType<any>>(fabrica: () => Promise<{ default: T }>) {
	return lazy(() => importarComTentativas(fabrica, 3));
}
