/**
 * imprimirOrcamento — o painel gera o PDF do orçamento pro PRESTADOR baixar/imprimir.
 *
 * REUSO, NÃO REESCRITA: chama `montarHtmlOrcamentoCompleto` do app
 * (`src/utils/pdfGenerator.ts`) — o MESMO gerador que produz o PDF do celular. O
 * documento que o prestador imprime no computador é byte-a-byte o mesmo do app; não
 * há um segundo layout pra divergir. O que tornava isso impossível era o import de
 * `react-native`/`expo` na árvore do gerador; os stubs do vite.config (ver
 * src/shims/native-stubs.ts) resolvem isso sem executar nada de nativo.
 *
 * A impressão é NATIVA do navegador: um iframe oculto recebe o HTML e chamamos
 * `print()`; o usuário escolhe "Salvar como PDF" ou imprime. É o mesmo padrão do
 * ramo web do app (exportarDocumento.imprimirHtmlWeb), reescrito aqui pequeno e
 * autocontido pra o painel não depender do módulo de export do app (que arrasta o
 * ramo nativo). Sem lib de PDF nova, sem popup bloqueado.
 *
 * O cliente NÃO depende disto: ele já recebe o orçamento pelo portal do worker
 * (/o/<token>). Isto é a via do prestador — do próprio arquivo dele.
 */
import type { Depoimento, Empresa, Orcamento } from "@dominio";
import { gerarHtmlOrcamento } from "../../../../src/utils/pdfGenerator";

/** Imprime um HTML via iframe oculto. Resolve após disparar o diálogo; remove o iframe depois. */
function imprimirHtml(html: string): Promise<void> {
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

/**
 * Gera e imprime o PDF do orçamento. NUNCA lança silenciosamente: a falha volta pro
 * chamador mostrar um toast — um botão de PDF que "não faz nada" é o padrão que a casa mata.
 */
export async function imprimirOrcamento(
	orcamento: Orcamento,
	empresa: Empresa,
	depoimentos: Depoimento[] = [],
): Promise<void> {
	// gerarHtmlOrcamento (SÍNCRONO, puro) em vez de montarHtmlOrcamentoCompleto: este
	// último faz populateImages (converte file:// do celular — no painel as imagens já
	// são data:/http) e obterLinkPublico (import dinâmico que puxa o Supabase e o async-
	// storage do app pro bundle web). Nada disso é preciso aqui: as URIs do painel já
	// são web, e o QR de aprovação do CLIENTE não vai no PDF do PRESTADOR — o cliente já
	// aprova pelo portal /o/<token>. Sem linkPublico, o guia de aprovação cai no texto-
	// instrução, que é o fallback já previsto no gerador.
	const html = gerarHtmlOrcamento(orcamento, empresa, depoimentos);
	await imprimirHtml(html);
}
