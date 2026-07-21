/**
 * PLANOS — o estado REAL da assinatura, o catálogo com mensal/anual e o comparativo.
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
 * ═══ PREÇO E RECURSO VÊM DA FONTE, NUNCA DE MEMÓRIA ═══
 * Todo valor de R$ vem de `@precos` (a mesma `web/src/data/planos.ts` da landing,
 * conferida contra a Stripe live) — nenhum número é digitado nesta tela. A cobertura
 * do comparativo vem de `@entitlements` (o mapa que o app e o worker leem), então a
 * tabela não pode prometer um recurso que o plano não libera.
 *
 * ═══ CHECKOUT DE VERDADE ═══
 * Pro e Empresa, mensal ou anual, abrem o Stripe Checkout pelo worker (`checkout.ts`).
 * CARTÃO → STRIPE. PIX → MERCADO PAGO (e, hoje, Pix só existe para recarregar créditos,
 * na tela de Créditos do app — o painel não vende Pix). Decisão do dono, textual: "deixe
 * os pagamentos do CARTÃO no STRIPE, e os pagamentos PIX no MERCADO PAGO". O OLLI não
 * vende assinatura por cartão no Mercado Pago (`/mp/plano/assinatura`): se aparecer um
 * botão daqui apontando para `/mp/`, é regressão e o gate
 * `scripts/teste-roteamento-pagamento.ts` reprova. Mapa: docs/ENXAME/PAGAMENTOS_ROTEAMENTO.md.
 * Qualquer falha vira um estado honesto com "Tentar de novo" e o WhatsApp como
 * alternativa — botão que "não faz nada" some no meio de uma venda (P0: erro ≠ vazio).
 */
import { AlertTriangle, Check, Crown, Loader2, MessageCircle, Minus, RotateCw, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { paraBr } from "@/olli/datas";
// A leitura da assinatura saiu daqui para `olli/marcaDocumento`: ela ganhou um
// SEGUNDO leitor (o gerador de documentos, que decide se o selo OLLI sai) e duas
// cópias da mesma consulta é como esta tela e o papel impresso passariam a
// discordar sobre o plano de quem paga. Mesma query, mesma resposta, um lugar só.
import { useMinhaAssinatura } from "@/olli/marcaDocumento";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { ehMembroNaoDono } from "@/olli/papel";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import { cn } from "@/utils";
import { type FalhaCheckout, iniciarCheckout, type PlanoCheckout } from "./checkout";
import { nomeDoPlano, type PlanoBase, PLANOS_BASE } from "./planos-base";
import {
	DESCONTO_ANUAL_ROTULO,
	type PeriodoCobranca,
	precoDoPlano,
	precoNoPeriodo,
	reais,
} from "./precos";
import { IA_USOS_GRATIS_MES, LINHAS_RECURSOS, PLANOS_COMPARADOS, temAcessoRecurso } from "./recursos";
import type { PlanoId, ResumoAssinatura } from "./tipos";

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

/** Só Pro e Empresa têm checkout. Resolve (plano + período) no id que o worker aceita. */
function idCheckout(plano: "pro" | "empresa", periodo: PeriodoCobranca): PlanoCheckout {
	if (plano === "pro") return periodo === "anual" ? "pro_anual" : "pro";
	return periodo === "anual" ? "empresa_anual" : "empresa";
}

/** Estado do checkout em andamento — um por vez, com erro visível (nunca silencioso). */
interface EstadoCheckout {
	plano: PlanoId | null;
	carregando: boolean;
	erro: FalhaCheckout | null;
}

export default function Planos() {
	const { data: resumo, isLoading, isError, error, refetch, isFetching } = useMinhaAssinatura();
	const [periodo, setPeriodo] = useState<PeriodoCobranca>("mensal");
	const [checkout, setCheckout] = useState<EstadoCheckout>({ plano: null, carregando: false, erro: null });

	// A tabela `assinaturas` é lida pelo MEU user_id — mas quem é membro não-dono
	// (técnico/gestor) não tem linha própria: a assinatura pertence ao DONO da
	// organização. Sem checar o papel, esta tela leria "sem linha" como "Grátis" e
	// mostraria "Você está no plano Grátis" pra quem trabalha numa empresa PAGANTE.
	const contexto = useContextoDeEscrita();
	// Só tratamos como "membro não-dono" quando o papel foi CONFIRMADO — carregando
	// ou com erro, cai no caminho normal (mesma cautela do "papel indeterminado
	// bloqueia" usado em Meu Negócio: aqui não bloqueia leitura, só não afirma nada
	// que não sabemos). `ehMembroNaoDono` é a MESMA função que decide se o selo do
	// OLLI sai do documento (olli/marcaRegra.ts): a regra de quem é dono da conta
	// mora num lugar só.
	const membroNaoDono = !contexto.isLoading && !contexto.isError && ehMembroNaoDono(contexto.data?.papel);

	// Sem leitura confiável, NENHUM plano é marcado como atual: marcar "Grátis" por
	// padrão seria exatamente o rebaixamento que esta tela existe para evitar.
	const planoAtual = (id: PlanoId): boolean | null =>
		resumo && !isError && !membroNaoDono ? resumo.planoEfetivo === id : null;

	async function assinar(plano: "pro" | "empresa") {
		setCheckout({ plano, carregando: true, erro: null });
		const r = await iniciarCheckout(idCheckout(plano, periodo));
		if (r.ok) {
			// Redireciona para o Checkout hospedado — a página sai daqui; mantém o
			// "carregando" ligado até a navegação acontecer.
			window.location.assign(r.url);
			return;
		}
		setCheckout({ plano, carregando: false, erro: r.erro });
	}

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
			<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-base font-semibold text-text-primary">Escolha seu plano</h2>
				<SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-3">
				{PLANOS_BASE.map((p) => (
					<CardPlano
						key={p.id}
						plano={p}
						periodo={periodo}
						atual={planoAtual(p.id)}
						escritaBloqueada={membroNaoDono}
						carregando={checkout.plano === p.id && checkout.carregando}
						erro={checkout.plano === p.id ? checkout.erro : null}
						aoAssinar={() => {
							if (p.id === "pro" || p.id === "empresa") assinar(p.id);
						}}
					/>
				))}
			</div>

			{/* ─── 3. O COMPARATIVO (a verdade linha a linha) ─── */}
			<h2 className="mb-3 mt-10 text-base font-semibold text-text-primary">Comparar recurso a recurso</h2>
			<TabelaComparativo />

			<p className="mt-6 text-xs text-text-secondary">
				Pro e Empresa você assina agora, direto por aqui: escolha mensal ou anual (o anual sai {DESCONTO_ANUAL_ROTULO}{" "}
				mais barato) e o pagamento <strong>no cartão</strong> abre em seguida, no ambiente seguro da Stripe — renova
				automaticamente e você cancela quando quiser. Prefere pelo WhatsApp? A gente também resolve. O mapa e o painel da
				equipe ao vivo ainda estão em desenvolvimento (marcados como “em breve”).
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
						<AlertTriangle className="size-5" aria-hidden />
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
					<RotateCw className={cn("size-4", tentando && "animate-spin")} aria-hidden />
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
					<Users className="size-5" aria-hidden />
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
						{tom === "warning" ? <AlertTriangle className="size-5" aria-hidden /> : <Crown className="size-5" aria-hidden />}
					</span>
					<div>
						<p className="font-semibold text-text-primary">{titulo}</p>
						<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">{texto}</p>
					</div>
				</div>
				<Button asChild variant={acao.discreta ? "outline" : "default"} className="shrink-0 self-start sm:self-auto">
					<a href={acao.href} target="_blank" rel="noreferrer noopener">
						<MessageCircle className="size-4" aria-hidden />
						{acao.rotulo}
					</a>
				</Button>
			</div>
		</Card>
	);
}

/* ────────────────────────────  Seletor de período  ─────────────────────────── */

function SeletorPeriodo({ periodo, aoMudar }: { periodo: PeriodoCobranca; aoMudar: (p: PeriodoCobranca) => void }) {
	return (
		<ToggleGroup
			type="single"
			value={periodo}
			// Radix devolve "" ao desmarcar o item ativo — ignoramos para nunca ficar sem período.
			onValueChange={(v) => {
				if (v === "mensal" || v === "anual") aoMudar(v);
			}}
			aria-label="Período de cobrança"
			className="w-full rounded-xl border border-border bg-bg-neutral/40 p-1 sm:w-auto"
		>
			<ToggleGroupItem
				value="mensal"
				className="h-11 flex-1 rounded-lg px-4 text-sm font-semibold text-text-secondary data-[state=on]:bg-primary data-[state=on]:text-common-white data-[state=on]:shadow-sm sm:flex-none"
			>
				Mensal
			</ToggleGroupItem>
			<ToggleGroupItem
				value="anual"
				className="h-11 flex-1 gap-2 rounded-lg px-4 text-sm font-semibold text-text-secondary data-[state=on]:bg-primary data-[state=on]:text-common-white data-[state=on]:shadow-sm sm:flex-none"
			>
				Anual
				<span className="rounded-full bg-success/20 px-1.5 py-0.5 text-[11px] font-bold text-success-darker dark:text-success-light">
					−{DESCONTO_ANUAL_ROTULO}
				</span>
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

/* ────────────────────────────────  Catálogo  ──────────────────────────────── */

function CardPlano({
	plano,
	periodo,
	atual,
	escritaBloqueada,
	carregando,
	erro,
	aoAssinar,
}: {
	plano: PlanoBase;
	periodo: PeriodoCobranca;
	/** true/false quando sabemos; `null` quando a leitura falhou (não marcamos nada). */
	atual: boolean | null;
	/** Membro não-dono: quem assina/troca de plano é o dono da empresa, não ele. */
	escritaBloqueada?: boolean;
	carregando: boolean;
	erro: FalhaCheckout | null;
	aoAssinar: () => void;
}) {
	const ehAtual = atual === true;
	const preco = precoDoPlano(plano.id);
	// Preço da tela derivado da FONTE — no Grátis não há período nem nota.
	const { valor, sufixo, nota } = preco
		? precoNoPeriodo(preco, periodo)
		: { valor: reais(0), sufixo: "", nota: null };

	// WhatsApp de fallback com o preço DERIVADO (nunca um R$ digitado).
	const precoWhats = preco ? (periodo === "anual" ? `${reais(preco.anualCentavos)}/ano` : `${reais(preco.mensalCentavos)}/mês`) : "";
	const msgWhats =
		plano.id === "gratis"
			? "Olá! Tenho uma dúvida sobre o plano Grátis do OLLI."
			: `Olá! Quero assinar o plano ${plano.nome} do OLLI (${precoWhats}).`;

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
				<span className="text-3xl font-bold tracking-tight text-text-primary tabular-nums">{valor}</span>
				{sufixo && <span className="text-sm text-text-secondary">{sufixo}</span>}
			</p>
			{/* Reserva a linha da nota (min-h) para os três cartões alinharem, com ou sem economia. */}
			<p className="mt-1 min-h-[1rem] text-xs font-medium text-success-darker dark:text-success-light">{nota ?? ""}</p>

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
					<Button variant="outline" className="min-h-[44px] w-full" disabled>
						Seu plano atual
					</Button>
				) : plano.id === "gratis" ? (
					<p className="text-center text-xs text-text-secondary">Sempre disponível na sua conta.</p>
				) : (
					<>
						<Button
							variant={plano.destaque ? "default" : "outline"}
							className="min-h-[44px] w-full"
							onClick={aoAssinar}
							disabled={carregando}
							aria-busy={carregando}
						>
							{carregando ? (
								<>
									<Loader2 className="size-4 animate-spin" aria-hidden />
									Abrindo pagamento…
								</>
							) : (
								`Assinar ${plano.nome}`
							)}
						</Button>

						{erro && (
							<div
								className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-left"
								role="alert"
							>
								<p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
									<AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
									{erro.titulo}
								</p>
								<p className="mt-1 text-xs text-text-secondary">{erro.mensagem}</p>
								<div className="mt-2.5 flex flex-wrap gap-2">
									<Button size="sm" variant="outline" className="min-h-[40px]" onClick={aoAssinar}>
										<RotateCw className="size-3.5" aria-hidden />
										Tentar de novo
									</Button>
									<Button asChild size="sm" variant="ghost" className="min-h-[40px]">
										<a href={linkWhatsApp(msgWhats)} target="_blank" rel="noreferrer noopener">
											<MessageCircle className="size-3.5" aria-hidden />
											Assinar pelo WhatsApp
										</a>
									</Button>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</Card>
	);
}

/* ──────────────────────────────  Comparativo  ─────────────────────────────── */

/** Marca visual de "incluído", com nome para o leitor de tela (ícone sozinho é mudo). */
function Incluido() {
	return (
		<>
			<Check className="mx-auto size-4 text-success" aria-hidden />
			<span className="sr-only">Incluído</span>
		</>
	);
}

/** Marca visual de "não incluído", também com nome acessível. */
function NaoIncluido() {
	return (
		<>
			<Minus className="mx-auto size-4 text-text-disabled" aria-hidden />
			<span className="sr-only">Não incluído</span>
		</>
	);
}

/** Uma célula do comparativo para (plano × recurso). */
function Celula({ plano, recurso, emBreve }: { plano: PlanoId; recurso: (typeof LINHAS_RECURSOS)[number]["recurso"]; emBreve?: boolean }) {
	// A IA no Grátis é por COTA, não por plano (ver entitlements): mostra o limite real
	// em vez de um "não incluído" que seria mentira (ela existe, só é limitada).
	if (recurso === "ia_ilimitada" && plano === "gratis") {
		return (
			<>
				<span aria-hidden className="text-xs font-semibold text-text-secondary">
					{IA_USOS_GRATIS_MES}/mês
				</span>
				<span className="sr-only">{IA_USOS_GRATIS_MES} usos por mês</span>
			</>
		);
	}
	if (!temAcessoRecurso(plano, recurso)) return <NaoIncluido />;
	// Libera no mapa, mas o produto ainda marca "(em breve)" — não vender como pronto.
	if (emBreve) return <span className="text-xs font-medium text-text-secondary">Em breve</span>;
	return <Incluido />;
}

function TabelaComparativo() {
	const base = PLANOS_BASE.find((p) => p.id === "gratis")?.beneficios ?? [];
	const colClass = "px-4 py-3 text-center text-sm font-semibold text-text-primary";
	const grupoClass = "bg-bg-neutral/40 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary";
	const linhaClass = "border-t border-border/60";
	const cabecalhoLinhaClass = "px-4 py-2.5 text-left text-sm font-normal text-text-primary";
	const celulaClass = "px-4 py-2.5 text-center";

	return (
		<Card className="gap-0 overflow-hidden p-0">
			<div className="overflow-x-auto">
				<table className="w-full min-w-[560px] border-collapse">
					<caption className="sr-only">Comparativo de recursos incluídos em cada plano</caption>
					<thead>
						<tr className="border-b border-border">
							<th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
								Recurso
							</th>
							{PLANOS_COMPARADOS.map((id) => (
								<th key={id} scope="col" className={colClass}>
									{nomeDoPlano(id)}
								</th>
							))}
						</tr>
					</thead>

					<tbody>
						<tr>
							<th scope="rowgroup" colSpan={PLANOS_COMPARADOS.length + 1} className={grupoClass}>
								Em todos os planos
							</th>
						</tr>
						{base.map((beneficio) => (
							<tr key={beneficio} className={linhaClass}>
								<th scope="row" className={cabecalhoLinhaClass}>
									{beneficio}
								</th>
								{PLANOS_COMPARADOS.map((id) => (
									<td key={id} className={celulaClass}>
										<Incluido />
									</td>
								))}
							</tr>
						))}
					</tbody>

					<tbody>
						<tr>
							<th scope="rowgroup" colSpan={PLANOS_COMPARADOS.length + 1} className={grupoClass}>
								Nos planos pagos
							</th>
						</tr>
						{LINHAS_RECURSOS.map((linha) => (
							<tr key={linha.recurso} className={linhaClass}>
								<th scope="row" className={cabecalhoLinhaClass}>
									<span className="inline-flex flex-wrap items-center gap-1.5">
										{linha.rotulo}
										{linha.emBreve && (
											<Badge variant="secondary" className="text-[10px]">
												Em breve
											</Badge>
										)}
									</span>
								</th>
								{PLANOS_COMPARADOS.map((id) => (
									<td key={id} className={celulaClass}>
										<Celula plano={id} recurso={linha.recurso} emBreve={linha.emBreve} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
}
