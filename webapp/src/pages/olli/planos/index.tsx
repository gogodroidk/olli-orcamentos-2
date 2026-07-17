/**
 * PLANOS — o estado REAL da assinatura, sem discurso de venda por cima.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERRO É UM ESTADO. "GRÁTIS" É OUTRO. NUNCA CONFUNDA OS DOIS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Se a leitura de `assinaturas` falhar (rede, RLS, 5xx) e esta tela mostrar "Você
 * está no plano Grátis", ela mente para quem paga: o assinante abre o painel, vê a
 * página de vendas e acha que perdeu o que comprou. Aqui, falha vira um card de
 * erro com "Tentar de novo" — e o catálogo abaixo aparece SEM marcar plano atual,
 * porque nesse momento nós honestamente não sabemos qual é.
 *
 * Só `data === null` (a tabela respondeu, e não há linha) significa Grátis.
 *
 * NESTA ONDA NÃO HÁ CHECKOUT. A contratação continua no app / pelo suporte; fingir
 * um botão "Assinar" que não cobra seria pior do que não ter botão. O que a tela
 * faz é dizer a verdade e abrir um caminho de contato.
 *
 * A descrição dos planos vem de `planos-base.ts` (cópia do app) — nunca de memória.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Crown, MessageCircle, RotateCw, Sparkles, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { paraBr } from "@/olli/datas";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import { nomeDoPlano, PLANOS_BASE } from "./planos-base";
import { derivar, type LinhaAssinatura, type PlanoId, type ResumoAssinatura, SEM_ASSINATURA } from "./tipos";

/** Suporte — mesmo número do app (`EXPO_PUBLIC_WHATSAPP_SUPORTE`, src/config.ts). */
const WHATSAPP_SUPORTE = (import.meta.env.VITE_WHATSAPP_SUPORTE as string | undefined) ?? "5511941727487";

function linkWhatsApp(mensagem: string): string {
	return `https://wa.me/${WHATSAPP_SUPORTE.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

/** ISO → 'DD/MM/AAAA'. Data inválida devolve null (não inventamos data). */
function dataBr(iso: string | undefined): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : paraBr(d);
}

/** Leitura da assinatura do usuário logado. RLS já limita à própria linha. */
function useMinhaAssinatura() {
	return useQuery({
		queryKey: ["olli", "assinatura", "me"],
		queryFn: async (): Promise<ResumoAssinatura> => {
			const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
			if (erroSessao) throw erroSessao;
			const meuId = sessao.user?.id;
			if (!meuId) throw new Error("Sessão não encontrada. Entre de novo para ver seu plano.");

			// Só estas 3 colunas: são as que o app tem grant de SELECT (services/planos.ts).
			const { data, error } = await supabase
				.from("assinaturas")
				.select("plano, status, current_period_end")
				.eq("user_id", meuId)
				.maybeSingle();
			// O erro SOBE (vira isError) de propósito: quem chama tem que distinguir
			// "falhou" de "não tem assinatura". Engolir aqui recriaria o bug crônico.
			if (error) throw error;

			return data ? derivar(data as LinhaAssinatura) : SEM_ASSINATURA;
		},
		staleTime: 60_000,
		retry: 1,
	});
}

export default function Planos() {
	const { data: resumo, isLoading, isError, error, refetch, isFetching } = useMinhaAssinatura();

	// A tabela `assinaturas` é lida pelo MEU user_id — mas quem é membro não-dono
	// (técnico/gestor) não tem linha própria: a assinatura pertence ao DONO da
	// organização. Sem checar o papel, esta tela leria "sem linha" como "Grátis" e
	// mostraria "Você está no plano Grátis" pra quem trabalha numa empresa PAGANTE.
	const contexto = useContextoDeEscrita();
	const papel = contexto.data?.papel;
	const ehDono = papel === "owner" || papel === "pessoal";
	// Só tratamos como "membro não-dono" quando o papel foi CONFIRMADO — carregando
	// ou com erro, cai no caminho normal (mesma cautela do "papel indeterminado
	// bloqueia" usado em Meu Negócio: aqui não bloqueia leitura, só não afirma nada
	// que não sabemos).
	const membroNaoDono = !contexto.isLoading && !contexto.isError && !!papel && !ehDono;

	return (
		<div className="mx-auto w-full max-w-6xl p-4 md:p-6">
			<header className="mb-5">
				<h1 className="text-2xl font-bold tracking-tight text-text-primary">Planos</h1>
				<p className="mt-1 text-sm text-text-secondary">Sua assinatura e o que cada plano libera.</p>
			</header>

			{/* ─── 1. O SEU ESTADO (o mais importante da tela) ─── */}
			{contexto.isLoading ? (
				<Skeleton className="h-28 w-full rounded-xl" />
			) : membroNaoDono ? (
				<CardMembro />
			) : isLoading ? (
				<Skeleton className="h-28 w-full rounded-xl" />
			) : isError ? (
				<CardErro mensagem={(error as Error)?.message} aoTentar={() => refetch()} tentando={isFetching} />
			) : resumo ? (
				<CardStatus resumo={resumo} />
			) : null}

			{/* ─── 2. O CATÁLOGO ─── */}
			<h2 className="mb-3 mt-8 text-base font-semibold text-text-primary">O que cada plano dá</h2>
			<div className="grid gap-4 lg:grid-cols-3">
				{PLANOS_BASE.map((p) => (
					<CardPlano
						key={p.id}
						plano={p}
						// Sem leitura confiável, NENHUM plano é marcado como atual: marcar "Grátis"
						// por padrão seria exatamente o rebaixamento que esta tela existe para evitar.
						// Membro não-dono: idem — a linha lida é a DELE, não a da empresa.
						atual={resumo && !isError && !membroNaoDono ? resumo.planoEfetivo === p.id : null}
						escritaBloqueada={membroNaoDono}
					/>
				))}
			</div>

			<p className="mt-6 text-xs text-text-secondary">
				A contratação ainda é feita pelo app do OLLI (ou com a gente, pelo WhatsApp) — o pagamento direto por aqui está
				chegando. Mensal e anual são assinaturas que renovam automaticamente e podem ser canceladas quando você quiser.
				O mapa da equipe ao vivo ainda está em desenvolvimento (marcado como “em breve”).
			</p>
		</div>
	);
}

/* ────────────────────────────────  Estados  ───────────────────────────────── */

function CardErro({ mensagem, aoTentar, tentando }: { mensagem?: string; aoTentar: () => void; tentando: boolean }) {
	return (
		<Card className="gap-0 border-error/30 bg-error/5 p-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
						<AlertTriangle className="size-5" />
					</span>
					<div>
						<p className="font-semibold text-text-primary">Não consegui confirmar o seu plano agora</p>
						<p className="mt-0.5 text-sm text-text-secondary">
							{mensagem ?? "Falha ao consultar sua assinatura."} Isto é um erro de leitura — <strong>não</strong> quer
							dizer que sua assinatura acabou. Nada foi alterado.
						</p>
					</div>
				</div>
				<Button variant="outline" onClick={aoTentar} disabled={tentando} className="shrink-0">
					{tentando ? <RotateCw className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
					Tentar de novo
				</Button>
			</div>
		</Card>
	);
}

/** Membro não-dono: a assinatura é da empresa, não dele — não afirmamos plano nenhum. */
function CardMembro() {
	return (
		<Card className="gap-0 border-border p-5">
			<div className="flex items-start gap-3">
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
					<Users className="size-5" />
				</span>
				<div>
					<p className="font-semibold text-text-primary">O plano da sua empresa é gerenciado pelo dono</p>
					<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">
						Sua conta é de um membro da equipe — a assinatura e a cobrança ficam com quem é dono da empresa. Fale com
						ele para saber qual plano está ativo ou para mudar de plano.
					</p>
				</div>
			</div>
		</Card>
	);
}

function CardStatus({ resumo }: { resumo: ResumoAssinatura }) {
	const nome = nomeDoPlano(resumo.planoContratado);
	const quando = dataBr(resumo.proximaCobranca);

	// PAGAMENTO FALHOU (past_due) — o acesso continua durante a retentativa, mas a
	// pessoa PRECISA saber, e agora. Se a tela dissesse só "Pro ativo", ela descobriria
	// o problema no dia em que o acesso caísse.
	if (resumo.pagamentoFalhou) {
		return (
			<Faixa
				tom="warning"
				titulo={`Pagamento do plano ${nome} não foi aprovado`}
				texto={
					quando
						? `Seu acesso ao ${nome} continua por enquanto (período pago até ${quando}), mas a última cobrança falhou. Regularize para não perder os recursos.`
						: `Seu acesso ao ${nome} continua por enquanto, mas a última cobrança falhou. Regularize para não perder os recursos.`
				}
				acao={{
					rotulo: "Resolver pagamento",
					href: linkWhatsApp(`Olá! O pagamento do meu plano ${nome} no OLLI falhou e eu quero regularizar.`),
				}}
			/>
		);
	}

	// ATIVO.
	if (resumo.ativo) {
		const teste = resumo.status === "trialing";
		return (
			<Faixa
				tom="success"
				titulo={`${nome} ativo`}
				texto={
					teste
						? quando
							? `Você está no período de teste. A primeira cobrança é em ${quando}.`
							: "Você está no período de teste do plano."
						: quando
							? `Renova automaticamente em ${quando}. Cancele quando quiser.`
							: "Assinatura ativa."
				}
				acao={{
					rotulo: "Falar sobre minha assinatura",
					href: linkWhatsApp(`Olá! Quero falar sobre a minha assinatura do plano ${nome} no OLLI.`),
					discreta: true,
				}}
			/>
		);
	}

	// CONTRATOU, MAS NÃO ESTÁ VIGENTE (cancelado ou vencido) — dizer o que aconteceu,
	// e não simplesmente exibir "Grátis" como se ele nunca tivesse pago.
	if (resumo.planoContratado !== "gratis") {
		return (
			<Faixa
				tom="warning"
				titulo={`Sua assinatura do ${nome} não está mais ativa`}
				texto={
					quando
						? `O período pago terminou em ${quando}. Enquanto isso, sua conta está no plano Grátis — seus orçamentos, clientes e recibos continuam todos aqui.`
						: "Enquanto isso, sua conta está no plano Grátis — seus orçamentos, clientes e recibos continuam todos aqui."
				}
				acao={{
					rotulo: `Voltar para o ${nome}`,
					href: linkWhatsApp(`Olá! Quero reativar o meu plano ${nome} no OLLI.`),
				}}
			/>
		);
	}

	// GRÁTIS de verdade (a tabela respondeu e não há assinatura).
	return (
		<Faixa
			tom="neutro"
			titulo="Você está no plano Grátis"
			texto="Orçamentos, recibos, clientes e agenda são ilimitados aqui — sem prazo e sem cartão. O Pro entra quando você quiser relatórios, metas e IA sem limite."
			acao={{
				rotulo: "Quero assinar o Pro",
				href: linkWhatsApp("Olá! Quero assinar o plano Pro do OLLI."),
			}}
		/>
	);
}

function Faixa({
	tom,
	titulo,
	texto,
	acao,
}: {
	tom: "success" | "warning" | "neutro";
	titulo: string;
	texto: string;
	acao: { rotulo: string; href: string; discreta?: boolean };
}) {
	const cores = {
		success: { card: "border-success/30 bg-success/5", tile: "bg-success/10 text-success" },
		warning: { card: "border-warning/40 bg-warning/5", tile: "bg-warning/10 text-warning" },
		neutro: { card: "border-border", tile: "bg-primary/10 text-primary" },
	}[tom];

	return (
		<Card className={cn("gap-0 p-5", cores.card)}>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", cores.tile)}>
						{tom === "warning" ? <AlertTriangle className="size-5" /> : <Crown className="size-5" />}
					</span>
					<div>
						<p className="font-semibold text-text-primary">{titulo}</p>
						<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">{texto}</p>
					</div>
				</div>
				<Button asChild variant={acao.discreta ? "outline" : "default"} className="shrink-0 self-start sm:self-auto">
					<a href={acao.href} target="_blank" rel="noreferrer noopener">
						<MessageCircle className="size-4" />
						{acao.rotulo}
					</a>
				</Button>
			</div>
		</Card>
	);
}

/* ────────────────────────────────  Catálogo  ──────────────────────────────── */

function CardPlano({
	plano,
	atual,
	escritaBloqueada,
}: {
	plano: (typeof PLANOS_BASE)[number];
	/** true/false quando sabemos; `null` quando a leitura falhou (não marcamos nada). */
	atual: boolean | null;
	/** Membro não-dono: quem assina/troca de plano é o dono da empresa, não ele. */
	escritaBloqueada?: boolean;
}) {
	const ehAtual = atual === true;
	const mensagem: Record<PlanoId, string> = {
		gratis: "Olá! Tenho uma dúvida sobre o plano Grátis do OLLI.",
		pro: "Olá! Quero assinar o plano Pro do OLLI (R$ 39/mês).",
		empresa: "Olá! Quero assinar o plano Empresa do OLLI (R$ 99/mês).",
	};

	return (
		<Card
			className={cn(
				"relative h-full gap-0 p-6",
				ehAtual && "border-primary ring-1 ring-primary/30",
				plano.destaque && !ehAtual && "border-primary/40",
			)}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-bold text-text-primary">{plano.nome}</h3>
				{ehAtual ? (
					<Badge variant="success">Seu plano atual</Badge>
				) : plano.destaque ? (
					<Badge variant="default">
						<Sparkles className="size-3" aria-hidden /> Mais escolhido
					</Badge>
				) : null}
			</div>

			<p className="mt-1 text-sm text-text-secondary">{plano.tagline}</p>

			<p className="mt-4 flex items-baseline gap-1">
				<span className="text-3xl font-bold tracking-tight text-text-primary tabular-nums">{plano.preco}</span>
				{plano.periodo && <span className="text-sm text-text-secondary">{plano.periodo}</span>}
			</p>

			<ul className="mt-5 space-y-2.5">
				{plano.beneficios.map((b) => (
					<li key={b} className="flex items-start gap-2 text-sm text-text-primary">
						<Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
						<span>{b}</span>
					</li>
				))}
			</ul>

			<div className="mt-6">
				{escritaBloqueada ? (
					<p className="text-center text-xs text-text-secondary">Fale com o dono da conta para mudar de plano.</p>
				) : ehAtual ? (
					<Button variant="outline" className="w-full" disabled>
						Seu plano atual
					</Button>
				) : plano.id === "gratis" ? (
					<p className="text-center text-xs text-text-secondary">Sempre disponível na sua conta.</p>
				) : (
					<Button asChild variant={plano.destaque ? "default" : "outline"} className="w-full">
						<a href={linkWhatsApp(mensagem[plano.id])} target="_blank" rel="noreferrer noopener">
							<MessageCircle className="size-4" />
							Falar com a gente
						</a>
					</Button>
				)}
			</div>
		</Card>
	);
}
