/**
 * Stub WEB de src/utils/exportarDocumento.ts — usado SÓ no build do painel, via
 * alias por caminho absoluto no vite.config.
 *
 * POR QUE ISTO EM VEZ DE STUBAR react-native/expo UM A UM: pdfGenerator.ts importa
 * `{ exportarHtmlComoPdf, safeFileName }` de exportarDocumento e re-exporta
 * `abrirWhatsApp` dele. O exportarDocumento real importa `react-native` no topo e faz
 * `require('expo-print' | 'expo-sharing' | 'expo-file-system/legacy')` no ramo nativo —
 * e o expo arrasta expo-modules-core → TurboModuleRegistry → uma cascata nativa
 * inteira que o Vite tenta resolver no build. `gerarHtmlOrcamento` (o que o painel
 * chama) NÃO usa nada disso. Então trocamos o MÓDULO-fronteira por esta versão
 * browser: pdfGenerator resolve seus imports, e a cascata nativa nunca entra no grafo.
 *
 * safeFileName é cópia literal do original (string pura). exportarHtmlComoPdf/
 * abrirWhatsApp existem só pra satisfazer os imports/re-exports; o painel imprime pelo
 * seu próprio helper (olli/pdf/imprimirOrcamento) e não chama estes.
 */

export interface OpcoesCompartilhar {
	dialogTitle?: string;
}

/** Cópia literal do safeFileName original (pura, sem dependência). */
export function safeFileName(s: string): string {
	return (
		s
			.normalize("NFD")
			.replace(/[^a-zA-Z0-9-_]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "documento"
	);
}

/**
 * No painel a impressão passa por olli/pdf/imprimirOrcamento (iframe + print). Este
 * existe só pro import de pdfGenerator resolver. Se for chamado (não é), imprime via
 * a mesma via nativa do navegador em vez de falhar calado.
 */
export async function exportarHtmlComoPdf(html: string, _nome: string, _opcoes?: OpcoesCompartilhar): Promise<void> {
	if (typeof window === "undefined") return;
	const win = window.open("", "_blank");
	if (!win) throw new Error("Pop-up bloqueado — libere para imprimir o PDF.");
	win.document.write(html);
	win.document.close();
	win.focus();
	win.print();
}

/** Passthrough web do abrirWhatsApp (o original usa Linking do react-native). */
export async function abrirWhatsApp(telefone: string, mensagem: string): Promise<void> {
	const numero = String(telefone).replace(/\D/g, "");
	const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
	if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
}
