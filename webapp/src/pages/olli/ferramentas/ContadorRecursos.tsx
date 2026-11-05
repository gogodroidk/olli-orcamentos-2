import { ExternalLink } from "lucide-react";
import { Link } from "react-router";
import {
	AVISO_CONTADOR,
	CAMINHOS_NFSE,
	INTRO_CONTADOR,
	PASSOS_NFSE,
	RODAPE_CONTADOR,
	SERVICOS_OFICIAIS,
	TIPOS_EMPRESA,
} from "../../../../../src/content/contador";

/**
 * Parte de contador em Recursos úteis. Só explica e aponta fonte oficial.
 * A OLLI não emite nota fiscal.
 */
export function ContadorRecursos() {
	return (
		<section className="mt-5 space-y-4 border-t border-border pt-5" aria-labelledby="contador">
			<div>
				<h3 id="contador" className="font-semibold text-text-primary">
					Contador: nota fiscal e tipos de empresa
				</h3>
				<p className="mt-1 text-sm leading-relaxed text-text-secondary">{INTRO_CONTADOR}</p>
			</div>

			<p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm leading-relaxed text-text-primary" role="note">
				{AVISO_CONTADOR}
			</p>

			<div className="grid gap-3 md:grid-cols-2">
				{TIPOS_EMPRESA.map((tipo) => (
					<article key={tipo.id} className="rounded-xl border border-border bg-background p-4">
						<p className="text-xs font-semibold uppercase tracking-wide text-primary">{tipo.nome}</p>
						<h4 className="mt-1 font-medium text-text-primary">{tipo.titulo}</h4>
						<p className="mt-2 text-sm leading-relaxed text-text-secondary">{tipo.texto}</p>
						<ul className="mt-3 space-y-1.5">
							{tipo.fontes.map((fonte) => (
								<li key={fonte.href}>
									<a
										href={fonte.href}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
									>
										{fonte.rotulo}
										<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
									</a>
								</li>
							))}
						</ul>
					</article>
				))}
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				{CAMINHOS_NFSE.map((caminho) => (
					<article key={caminho.id} className="rounded-xl border border-border bg-background p-4">
						<h4 className="font-medium text-text-primary">{caminho.titulo}</h4>
						<p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{caminho.quando}</p>
						<a
							href={caminho.fonte.href}
							target="_blank"
							rel="noreferrer"
							className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						>
							{caminho.fonte.rotulo}
							<ExternalLink className="size-3.5" aria-hidden="true" />
						</a>
					</article>
				))}
			</div>

			<div>
				<h4 className="font-medium text-text-primary">Como emitir a NFS-e</h4>
				<ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-text-secondary">
					{PASSOS_NFSE.map((passo) => (
						<li key={passo.id}>{passo.texto}</li>
					))}
				</ol>
				<p className="mt-3 text-sm text-text-secondary">
					<Link to="/recibos" className="font-semibold text-primary underline-offset-2 hover:underline">
						Abrir recibos
					</Link>
					{" "}
					e usar Preparar nota fiscal só copia os dados. A emissão continua no governo.
				</p>
			</div>

			<ul className="flex flex-wrap gap-2">
				{SERVICOS_OFICIAIS.map((servico) => (
					<li key={servico.href}>
						<a
							href={servico.href}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						>
							{servico.rotulo}
							<ExternalLink className="size-3.5" aria-hidden="true" />
						</a>
					</li>
				))}
			</ul>

			<p className="text-xs leading-relaxed text-text-disabled">{RODAPE_CONTADOR}</p>
		</section>
	);
}
