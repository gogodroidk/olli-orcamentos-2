/**
 * imprimirHtml — a ÚNICA saída de papel do painel.
 *
 * A impressão é NATIVA do navegador: um iframe oculto recebe o HTML e chamamos
 * `print()`; o usuário escolhe "Salvar como PDF" ou manda pra impressora. É o mesmo
 * padrão do ramo web do app (exportarDocumento.imprimirHtmlWeb), pequeno e
 * autocontido pra o painel não depender do módulo de export do app (que arrasta o
 * ramo nativo). Sem lib de PDF nova, sem popup bloqueado.
 *
 * POR QUE ISTO MORA SOZINHO: nasceu dentro de `imprimirOrcamento.ts`. Quando o
 * contrato chegou, copiar as 60 linhas do iframe criaria dois caminhos de impressão
 * — e a primeira vez que um deles ganhasse uma correção (um `afterprint` que não
 * dispara, um navegador que precisa de mais folga antes do remove) o outro ficaria
 * pra trás em silêncio. Documento que sai diferente conforme o botão que o gerou é
 * pior que documento que não sai.
 */

/** Imprime um HTML via iframe oculto. Resolve após disparar o diálogo; remove o iframe depois. */
export function imprimirHtml(html: string): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof document === "undefined" || !document.body) {
			reject(new Error("Impressão indisponível neste ambiente."));
			return;
		}
		const iframe = document.createElement("iframe");
		iframe.setAttribute("aria-hidden", "true");
		Object.assign(iframe.style, {
			position: "fixed",
			right: "0",
			bottom: "0",
			width: "0",
			height: "0",
			border: "0",
			opacity: "0",
			pointerEvents: "none",
		});

		let feito = false;
		const limpar = () => {
			try {
				if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
			} catch {
				/* ignore */
			}
		};
		const finalizar = () => {
			if (feito) return;
			feito = true;
			// Remove o iframe com folga: em alguns navegadores print() é assíncrono e
			// remover cedo demais cancela o diálogo.
			setTimeout(limpar, 1000);
			resolve();
		};

		iframe.onload = () => {
			try {
				const win = iframe.contentWindow;
				if (!win) {
					limpar();
					reject(new Error("Não consegui abrir a janela de impressão."));
					return;
				}
				// afterprint fecha o ciclo quando o navegador o suporta; o timer é a rede.
				win.onafterprint = finalizar;
				win.focus();
				win.print();
				setTimeout(finalizar, 800);
			} catch (e) {
				limpar();
				reject(e instanceof Error ? e : new Error("Falha ao imprimir."));
			}
		};

		document.body.appendChild(iframe);
		const doc = iframe.contentDocument;
		if (!doc) {
			limpar();
			reject(new Error("Não consegui preparar o documento para impressão."));
			return;
		}
		doc.open();
		doc.write(html);
		doc.close();
	});
}
