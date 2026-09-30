import { imprimirHtml } from "./imprimirHtml";

function escaparHtml(valor: string): string {
	return valor
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export async function imprimirDocumentoManual(input: {
	titulo: string;
	tipo: string;
	cliente?: string | null;
	texto?: string | null;
	versao?: number;
}): Promise<void> {
	const titulo = escaparHtml(input.titulo.trim());
	const tipo = escaparHtml(input.tipo.trim() || "Documento");
	const cliente = input.cliente?.trim() ? escaparHtml(input.cliente.trim()) : "Documento técnico";
	const texto = escaparHtml(input.texto?.trim() || "").replace(/\r?\n/g, "<br>");
	const versao = Number.isFinite(input.versao) ? `Versão ${input.versao}` : "Rascunho";
	const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title><style>
@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f1c2e;line-height:1.55;margin:0}header{border-bottom:2px solid #0b6fce;padding-bottom:14px;margin-bottom:24px}h1{font-size:24px;margin:0 0 6px}p{margin:0 0 12px}.meta{color:#475569;font-size:12px}.conteudo{font-size:14px;white-space:normal;overflow-wrap:anywhere}.rodape{border-top:1px solid #d9e1ec;margin-top:32px;padding-top:10px;color:#5c6a7f;font-size:11px}@media print{a{color:inherit;text-decoration:none}}
</style></head><body><header><h1>${titulo}</h1><p class="meta">${tipo} · ${cliente} · ${escaparHtml(versao)}</p></header><main class="conteudo">${texto || "Sem conteúdo adicional."}</main><footer class="rodape">Documento preparado no OLLI Orçamentos. Revise antes de enviar ao cliente.</footer></body></html>`;
	await imprimirHtml(html);
}
