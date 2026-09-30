import { useEffect } from "react";
import { GLOBAL_CONFIG } from "@/global-config";

/**
 * Título da aba do navegador ("Orçamentos · OLLI").
 *
 * `document.title` direto, e não `<Helmet>`: o react-helmet-async 2 não aplica
 * nada sob o React 19 (conferido no build de 30/09/2026 — a aba continuava com
 * o título estático do index.html). E o `<title>` nativo do React 19 também não
 * serve aqui: ele é anexado DEPOIS do `<title>` do index.html, e o navegador usa
 * o primeiro. Sem título (`undefined`) fica só o nome do app.
 */
export function useTituloDaAba(titulo: string | undefined) {
	useEffect(() => {
		document.title = titulo ? `${titulo} · ${GLOBAL_CONFIG.appName}` : GLOBAL_CONFIG.appName;
	}, [titulo]);
}
