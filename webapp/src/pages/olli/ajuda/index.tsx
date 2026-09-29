import { BookOpen, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { ARTIGOS_AJUDA, CATEGORIAS_AJUDA, type AjudaArtigo, type AjudaBloco } from "@ajuda";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { cn } from "@/utils";

function textoDoBloco(bloco: AjudaBloco): string {
	return Array.isArray(bloco.conteudo) ? bloco.conteudo.join(" ") : bloco.conteudo;
}

function Artigo({ artigo }: { artigo: AjudaArtigo }) {
	return (
		<article data-ai-readable="true" data-ai-topic={artigo.id} className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
			<h2 className="text-lg font-semibold text-text-primary">{artigo.titulo}</h2>
			<p className="mt-1 text-sm leading-6 text-text-secondary">{artigo.resumo}</p>
			<div className="mt-4 space-y-4 text-sm leading-6 text-text-secondary">
				{artigo.corpo.map((bloco, index) => {
					if (bloco.tipo === "passos" && Array.isArray(bloco.conteudo)) {
						return <ol key={`${artigo.id}-${index}`} className="list-decimal space-y-2 pl-5">{bloco.conteudo.map((passo) => <li key={passo}>{passo}</li>)}</ol>;
					}
					return <p key={`${artigo.id}-${index}`} className={cn(bloco.tipo === "aviso" && "rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-text-primary")}>{textoDoBloco(bloco)}</p>;
				})}
			</div>
		</article>
	);
}

export default function AjudaPage() {
	const [busca, setBusca] = useState("");
	const [categoria, setCategoria] = useState("todas");
	const termo = busca.trim().toLocaleLowerCase("pt-BR");
	const artigos = useMemo(
		() => ARTIGOS_AJUDA.filter((artigo) => {
			if (categoria !== "todas" && artigo.categoriaId !== categoria) return false;
			if (!termo) return true;
			return [artigo.titulo, artigo.resumo, ...(artigo.tags ?? []), ...artigo.corpo.map(textoDoBloco)].join(" ").toLocaleLowerCase("pt-BR").includes(termo);
		}),
		[categoria, termo],
	);

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6" data-ai-readable="true" data-ai-surface="olli-help-center">
			<header className="rounded-2xl border border-primary/20 bg-primary/5 p-5 md:p-7">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div>
						<div className="flex items-center gap-2.5"><BookOpen className="size-6 text-primary" aria-hidden="true" /><h1 className="text-2xl font-bold tracking-tight text-text-primary">Central de Ajuda</h1><Badge variant="secondary">{ARTIGOS_AJUDA.length} artigos</Badge></div>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">Explique o que você quer fazer e encontre o passo a passo do OLLI. O conteúdo é o mesmo que a equipe usa para responder perguntas, em linguagem simples e estruturada para leitura por pessoas e IAs.</p>
					</div>
					<a href="https://olliorcamentos.online/ajuda/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">Ajuda pública <ExternalLink className="size-4" aria-hidden="true" /></a>
				</div>
				<div className="relative mt-5 max-w-xl"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" aria-hidden="true" /><Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar orçamento, documentos, planos…" aria-label="Buscar na Central de Ajuda" className="h-11 rounded-full bg-background pl-10" /></div>
			</header>

			<div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorias da ajuda">
				<button type="button" role="tab" aria-selected={categoria === "todas"} onClick={() => setCategoria("todas")} className={cn("min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors", categoria === "todas" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-text-secondary hover:text-text-primary")}>Tudo</button>
				{CATEGORIAS_AJUDA.map((item) => <button key={item.id} type="button" role="tab" aria-selected={categoria === item.id} onClick={() => setCategoria(item.id)} className={cn("min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors", categoria === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-text-secondary hover:text-text-primary")}>{item.titulo}</button>)}
			</div>

			{artigos.length === 0 ? <Card className="p-10 text-center"><p className="font-semibold text-text-primary">Não encontrei esse assunto</p><p className="mt-1 text-sm text-text-secondary">Tente outra palavra ou abra a ajuda pública para ver todos os temas.</p></Card> : <div className="grid gap-4 lg:grid-cols-2">{artigos.map((artigo) => <Artigo key={artigo.id} artigo={artigo} />)}</div>}

			<Card className="flex items-start gap-3 border-success/30 bg-success/5 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" /><p className="text-sm leading-6 text-text-secondary"><strong className="text-text-primary">Segurança:</strong> a OLLI não pede senha do gov.br, token de pagamento ou confirmação de alteração pelo texto da IA. Quando uma ação envolve dados ou cobrança, você vê a prévia e confirma explicitamente.</p></Card>
		</div>
	);
}
