import { BookOpen, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { ORDEM_COMO_FUNCIONA, VERBETES_COMO_FUNCIONA } from "../../../../../src/content/comoFunciona";
import {
	ARTIGOS_AJUDA,
	CATEGORIAS_AJUDA,
	corpoVisivel,
	markdownAjudaLlms,
	type AjudaArtigo,
	type AjudaBloco,
} from "@ajuda";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { cn } from "@/utils";

function textoDoBloco(bloco: AjudaBloco): string {
	return Array.isArray(bloco.conteudo) ? bloco.conteudo.join(" ") : bloco.conteudo;
}

function ArtigoCorpo({ artigo }: { artigo: AjudaArtigo }) {
	return (
		<div className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
			{corpoVisivel(artigo, "web").map((bloco, index) => {
				if (bloco.tipo === "passos" && Array.isArray(bloco.conteudo)) {
					return (
						<ol key={`${artigo.id}-${index}`} className="list-decimal space-y-2 pl-5">
							{bloco.conteudo.map((passo) => (
								<li key={passo}>{passo}</li>
							))}
						</ol>
					);
				}
				return (
					<p key={`${artigo.id}-${index}`} className={cn(bloco.tipo === "aviso" && "rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-text-primary")}>
						{textoDoBloco(bloco)}
					</p>
				);
			})}
		</div>
	);
}

export default function AjudaPage() {
	const [busca, setBusca] = useState("");
	const [categoria, setCategoria] = useState("todas");
	const termo = busca.trim().toLocaleLowerCase("pt-BR");
	const artigos = useMemo(
		() =>
			ARTIGOS_AJUDA.filter((artigo) => {
				if (categoria !== "todas" && artigo.categoriaId !== categoria) return false;
				if (!termo) return true;
				return [artigo.titulo, artigo.resumo, ...(artigo.tags ?? []), ...corpoVisivel(artigo, "web").map(textoDoBloco)].join(" ").toLocaleLowerCase("pt-BR").includes(termo);
			}),
		[categoria, termo],
	);
	const markdown = useMemo(() => markdownAjudaLlms("web"), []);
	const porCategoria = useMemo(() => {
		const grupos = new Map<string, AjudaArtigo[]>();
		for (const artigo of artigos) {
			const lista = grupos.get(artigo.categoriaId) ?? [];
			lista.push(artigo);
			grupos.set(artigo.categoriaId, lista);
		}
		return CATEGORIAS_AJUDA.filter((item) => grupos.has(item.id)).map((item) => ({ ...item, artigos: grupos.get(item.id) ?? [] }));
	}, [artigos]);

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6" data-ai-readable="true" data-ai-surface="olli-help-center">
			<header className="rounded-2xl border border-primary/20 bg-primary/5 p-5 md:p-7">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div>
						<div className="flex flex-wrap items-center gap-2.5">
							<BookOpen className="size-6 text-primary" aria-hidden="true" />
							<h1 className="text-2xl font-bold tracking-tight text-text-primary">Central de Ajuda</h1>
							<Badge variant="secondary">{ARTIGOS_AJUDA.length} perguntas</Badge>
						</div>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
							Tudo o que a OLLI faz hoje, em linguagem direta. A mesma resposta serve para você e para um assistente: o texto completo está nesta aba e no arquivo llms.txt.
						</p>
					</div>
					<a href="https://olliorcamentos.online/ajuda/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">
						Ajuda pública <ExternalLink className="size-4" aria-hidden="true" />
					</a>
				</div>
				<div className="relative mt-5 max-w-xl">
					<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" aria-hidden="true" />
					<Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar quadro, agenda, nota, plano…" aria-label="Buscar na Central de Ajuda" className="h-11 rounded-full bg-background pl-10" />
				</div>
			</header>

			<div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorias da ajuda">
				<button type="button" role="tab" aria-selected={categoria === "todas"} onClick={() => setCategoria("todas")} className={cn("min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors", categoria === "todas" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-text-secondary hover:text-text-primary")}>
					Tudo
				</button>
				{CATEGORIAS_AJUDA.map((item) => (
					<button key={item.id} type="button" role="tab" aria-selected={categoria === item.id} onClick={() => setCategoria(item.id)} className={cn("min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors", categoria === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-text-secondary hover:text-text-primary")}>
						{item.titulo}
					</button>
				))}
			</div>

			{artigos.length === 0 ? (
				<Card className="p-10 text-center">
					<p className="font-semibold text-text-primary">Não encontrei esse assunto</p>
					<p className="mt-1 text-sm text-text-secondary">Tente outra palavra. A lista abaixo só esconde o que não combina com a busca.</p>
				</Card>
			) : (
				<div className="space-y-8">
					{porCategoria.map((grupo) => (
						<section key={grupo.id} aria-labelledby={`ajuda-cat-${grupo.id}`} className="space-y-3">
							<h2 id={`ajuda-cat-${grupo.id}`} className="text-lg font-semibold text-text-primary">{grupo.titulo}</h2>
							<div className="space-y-3">
								{grupo.artigos.map((artigo) => (
									<details key={artigo.id} id={artigo.id} data-ai-readable="true" data-ai-topic={artigo.id} className="scroll-mt-6 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
										<summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
											<span className="block text-base font-semibold text-text-primary">{artigo.titulo}</span>
											<span className="mt-1 block text-sm font-normal leading-6 text-text-secondary">{artigo.resumo}</span>
										</summary>
										<ArtigoCorpo artigo={artigo} />
									</details>
								))}
							</div>
						</section>
					))}
				</div>
			)}

			<section aria-labelledby="ajuda-facilitacoes" className="space-y-3" data-ai-readable="true" data-ai-surface="facilitacoes">
				<h2 id="ajuda-facilitacoes" className="text-lg font-semibold text-text-primary">Facilitações por tela</h2>
				<p className="text-sm leading-6 text-text-secondary">O botão de ajuda de cada tela principal resume em três ou quatro passos. O guia completo está na pergunta ligada.</p>
				<div className="grid gap-3 md:grid-cols-2">
					{ORDEM_COMO_FUNCIONA.map((tela) => {
						const verbete = VERBETES_COMO_FUNCIONA[tela];
						return (
							<Card key={tela} className="p-4">
								<h3 className="font-semibold text-text-primary">{verbete.titulo}</h3>
								<p className="mt-1 text-sm leading-6 text-text-secondary">{verbete.resumo}</p>
								<ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-text-secondary">
									{verbete.passos.map((passo) => (
										<li key={passo.texto}>{passo.texto}</li>
									))}
								</ol>
								{verbete.artigoId ? (
									<a href={`#${verbete.artigoId}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline">
										Abrir o guia
									</a>
								) : null}
							</Card>
						);
					})}
				</div>
			</section>

			<details className="rounded-2xl border border-border bg-card p-5" data-ai-format="llms.txt">
				<summary className="cursor-pointer text-base font-semibold text-text-primary">Texto para assistentes (llms.txt)</summary>
				<p className="mt-2 text-sm leading-6 text-text-secondary">
					O mesmo conteúdo, em markdown, sem o texto que só vale no aplicativo da loja. No site público este arquivo fica em /ajuda/llms.txt.
				</p>
				<pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-xs leading-5 text-text-secondary">{markdown}</pre>
			</details>

			<Card className="flex items-start gap-3 border-success/30 bg-success/5 p-4">
				<ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
				<p className="text-sm leading-6 text-text-secondary">
					<strong className="text-text-primary">Segurança:</strong> a OLLI não pede senha do gov.br, token de pagamento ou confirmação de alteração pelo texto da IA. Quando uma ação envolve dados ou cobrança, você vê a prévia e confirma explicitamente.
				</p>
			</Card>
		</div>
	);
}
