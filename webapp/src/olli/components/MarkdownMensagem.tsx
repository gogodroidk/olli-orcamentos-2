import { interpretarMarkdown, type ParteChat } from "@chat-ui";

/**
 * Markdown da resposta da OLLI no painel. Só nós de texto: um trecho com HTML
 * aparece como texto, e link que não é http(s) ou mailto não vira âncora.
 */
export function MarkdownMensagem({ texto }: { texto: string }) {
	const blocos = interpretarMarkdown(texto);
	return (
		<div className="space-y-2 text-sm leading-relaxed text-text-primary">
			{blocos.map((bloco) => {
				if (bloco.tipo === "codigo") {
					return (
						<pre
							key={bloco.id}
							className="overflow-x-auto rounded-xl bg-secondary px-3 py-2 text-[13px] leading-relaxed text-text-primary"
						>
							<code>{bloco.texto || " "}</code>
						</pre>
					);
				}
				if (bloco.tipo === "lista") {
					const Lista = bloco.ordenada ? "ol" : "ul";
					return (
						<Lista key={bloco.id} className={bloco.ordenada ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
							{bloco.itens.map((item) => (
								<li key={item.id}>{desenharPartes(item.partes)}</li>
							))}
						</Lista>
					);
				}
				if (bloco.tipo === "titulo") {
					return (
						<p key={bloco.id} className={bloco.nivel === 1 ? "text-base font-semibold" : "font-semibold"}>
							{desenharPartes(bloco.partes)}
						</p>
					);
				}
				return (
					<p key={bloco.id} className="whitespace-pre-wrap break-words">
						{desenharPartes(bloco.partes)}
					</p>
				);
			})}
		</div>
	);
}

function desenharPartes(partes: ParteChat[]) {
	return partes.map((parte) => {
		if (parte.tipo === "negrito") return <strong key={parte.id}>{parte.texto}</strong>;
		if (parte.tipo === "italico") return <em key={parte.id}>{parte.texto}</em>;
		if (parte.tipo === "codigo") {
			return (
				<code key={parte.id} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.92em]">
					{parte.texto}
				</code>
			);
		}
		if (parte.tipo === "link") {
			return (
				<a
					key={parte.id}
					href={parte.href}
					target="_blank"
					rel="noopener noreferrer"
					className="underline underline-offset-2"
				>
					{parte.texto}
				</a>
			);
		}
		return <span key={parte.id}>{parte.texto}</span>;
	});
}
