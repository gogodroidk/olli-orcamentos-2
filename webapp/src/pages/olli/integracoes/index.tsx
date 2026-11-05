import {
	Bot,
	CalendarClock,
	CalendarPlus,
	FileCheck2,
	FileSpreadsheet,
	KeyRound,
	LogIn,
	MapPin,
	MessageCircle,
	Plug,
	Star,
	Webhook,
	type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import { Badge } from "@/ui/badge";
import { buttonVariants } from "@/ui/button";
import { cn } from "@/utils";
import { FORA_DESTA_LEVA, listarDisponiveis, listarEmBreve, type Integracao } from "./catalogo";

const ICONE: Record<string, LucideIcon> = {
	whatsapp: MessageCircle,
	"agenda-arquivo": CalendarPlus,
	planilha: FileSpreadsheet,
	pix: KeyRound,
	"google-avaliacao": Star,
	nfse: FileCheck2,
	"rota-mapa": MapPin,
	"agenda-conta": CalendarClock,
	"avaliacao-painel": Star,
	"login-google-equipe": LogIn,
	webhooks: Webhook,
	"chave-ia": Bot,
};

function Cartao({ item }: { item: Integracao }) {
	const Icone = ICONE[item.id] ?? Plug;
	const pronto = item.estado === "disponivel";
	const tituloId = `integracao-${item.id}`;

	return (
		<article className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby={tituloId}>
			<div className="flex items-start justify-between gap-3">
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
					<Icone className="size-5" />
				</span>
				<Badge variant={pronto ? "success" : "warning"}>{pronto ? "Já no OLLI" : "Em breve"}</Badge>
			</div>
			<h3 id={tituloId} className="mt-4 text-base font-semibold text-text-primary">
				{item.nome}
			</h3>
			<p className="mt-1 text-sm leading-6 text-text-secondary">{item.resumo}</p>
			<p className="mt-3 flex-1 text-sm leading-6 text-text-secondary">{item.detalhe}</p>
			{pronto && item.rota && item.rotuloAcao ? (
				<NavLink to={item.rota} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-fit")}>
					{item.rotuloAcao}
				</NavLink>
			) : null}
		</article>
	);
}

export default function IntegracoesPage() {
	const disponiveis = listarDisponiveis();
	const emBreve = listarEmBreve();

	return (
		<div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-6">
			<header className="rounded-2xl border border-primary/20 bg-primary/5 p-5 md:p-7">
				<div className="flex items-center gap-2.5">
					<Plug className="size-6 text-primary" aria-hidden="true" />
					<h1 className="text-2xl font-bold tracking-tight text-text-primary">Integrações</h1>
				</div>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
					O que já liga com o seu dia a dia, e o que ainda vamos fazer sem mensalidade para a OLLI. O que está em breve
					não tem botão: esta tela não pede senha, chave nem login.
				</p>
				<p className="mt-3 text-sm font-medium text-text-primary">
					{disponiveis.length} já no OLLI · {emBreve.length} em breve
				</p>
			</header>

			<section aria-labelledby="integracoes-disponiveis" className="space-y-4">
				<div>
					<h2 id="integracoes-disponiveis" className="text-lg font-semibold text-text-primary">
						Já no OLLI
					</h2>
					<p className="mt-1 text-sm text-text-secondary">Abre a tela onde isso já funciona.</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					{disponiveis.map((item) => (
						<Cartao key={item.id} item={item} />
					))}
				</div>
			</section>

			<section aria-labelledby="integracoes-em-breve" className="space-y-4">
				<div>
					<h2 id="integracoes-em-breve" className="text-lg font-semibold text-text-primary">
						Em breve
					</h2>
					<p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
						Ordem de prioridade, do mais útil para o prestador ao que pode esperar. Nenhum deles está ligado. Não há data
						prometida.
					</p>
				</div>
				<ol className="grid list-none gap-4 md:grid-cols-2">
					{emBreve.map((item) => (
						<li key={item.id}>
							<Cartao item={item} />
						</li>
					))}
				</ol>
			</section>

			<section aria-labelledby="integracoes-fora" className="space-y-3">
				<h2 id="integracoes-fora" className="text-lg font-semibold text-text-primary">
					Fora desta leva
				</h2>
				<p className="max-w-2xl text-sm leading-6 text-text-secondary">
					Útil no ofício, mas cobra mensalidade ou taxa. Não entra na fila enquanto houver caminho sem esse custo.
				</p>
				<ul className="space-y-3">
					{FORA_DESTA_LEVA.map((item) => (
						<li key={item.id} className="rounded-2xl border border-border bg-card px-4 py-3">
							<p className="text-sm font-semibold text-text-primary">{item.nome}</p>
							<p className="mt-1 text-sm leading-6 text-text-secondary">{item.motivo}</p>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
