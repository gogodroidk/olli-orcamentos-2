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
 * CARTÃO → STRIPE (`checkout.ts`). PIX DO PLANO → `/abacate/*` (`pix.ts` + `DialogPix.tsx`),
 * decisão do dono de 29/09/2026: o checkout só de cartão perdeu um cliente real. O botão
 * "Pagar com Pix" só aparece quando `/abacate/config` diz `pix:true` — nunca há Pix de
 * mentira. O Pix não renova sozinho (paga-se 1 mês ou 12 meses e, no vencimento, de novo).
 * O OLLI não vende assinatura por cartão no Mercado Pago (`/mp/plano/assinatura`): se
 * aparecer um botão daqui apontando para `/mp/`, é regressão. A recarga de créditos por Pix
 * continua na tela de Créditos do app. Mapa: docs/ENXAME/PAGAMENTOS_ROTEAMENTO.md.
 * Qualquer falha vira um estado honesto com "Tentar de novo" e o WhatsApp como
 * alternativa — botão que "não faz nada" some no meio de uma venda (P0: erro ≠ vazio).
 */
import { registrarEtapaAtivacao } from "@/store/userStore";
import { AlertTriangle, Check, Clock, Crown, Loader2, MessageCircle, Minus, QrCode, RefreshCw, RotateCw, Sparkles, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DialogPix } from "./DialogPix";
import { type EstadoPixAutomatico, estadoPixAutomatico, type PlanoPix, pixAutomaticoDisponivel, pixDisponivel } from "./pix";
import { CardPixAutomaticoAtivo, DialogPixAutomatico } from "./PixAutomatico";
import { ROTULO_PIX_AUTOMATICO, textoCurtoPixAutomatico } from "../../../../../src/content/pixAutomatico";
import { FRASE_GRATIS, nomeDoPlano, type PlanoBase, PLANOS_BASE, RECURSOS_GRATIS } from "./planos-base";
import { estadoDoCardPlano } from "./estadoCard";
import { notaCartao } from "./notaCartao";
import {
	DESCONTO_ANUAL_ROTULO,
	type PeriodoCobranca,
	precoDoPlano,
	precoNoPeriodo,
	reais,
} from "./precos";
import { IA_USOS_GRATIS_MES, LINHAS_RECURSOS, PLANOS_COMPARADOS, planoIncluiRecurso } from "./recursos";
import type { PlanoId, ResumoAssinatura } from "./tipos";
import { BotaoPortalStripe, obterStatusPortalStripe } from "./portal";
import { urlGerenciarNaPlay } from "@play-billing-regras";
import { TRIAL_PRO_DIAS } from "@limites-comerciais";
import { PARAM_PAGAR, lerIntencaoPlano, podeAbrirPixDaIntencao } from "@/olli/plano-intent";
import { LembreteAssinaturaFaixa, PARAM_RENOVAR_PIX } from "./LembreteAssinaturaFaixa";
import { ResumoTesteProCard, useResumoTestePro } from "./ResumoTesteProCard";
import { comecarTesteProComAviso, opcoesOfertaComercial } from "./useLembreteAssinatura";
import { AudioIaPrototipo } from "./AudioIaPrototipo";
import { planosAudioIaLigada } from "../../../../../src/services/planosAudioIa";

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

/** Resolve (plano + período) na chave do catálogo de Pix do worker (`PLANO_PIX`). */
function idPix(plano: "pro" | "empresa", periodo: PeriodoCobranca): PlanoPix {
	return `${plano}_${periodo === "anual" ? "anual" : "mensal"}`;
}

/**
 * Plano PAGO, vigente, sem assinatura na Stripe = acesso comprado por Pix (não renova sozinho).
 * Só `renovaSozinho === false` afirma isso; `undefined` (não consegui ler) cai na tela de sempre.
 * O tipo estreita o plano para pro/empresa, os únicos que têm Pix.
 */
function acessoPorPix(
	resumo: ResumoAssinatura,
): resumo is ResumoAssinatura & { planoEfetivo: "pro" | "empresa"; renovaSozinho: false } {
	return (
		resumo.ativo &&
		resumo.origem === "pagamento" &&
		resumo.renovaSozinho === false &&
		(resumo.planoEfetivo === "pro" || resumo.planoEfetivo === "empresa")
	);
}

/** Estado do checkout em andamento — um por vez, com erro visível (nunca silencioso). */
interface EstadoCheckout {
	plano: PlanoId | null;
	carregando: boolean;
	erro: FalhaCheckout | null;
}

export default function Planos() {
	const intencao = useMemo(() => lerIntencaoPlano(window.location.search), []);
	const resumoTeste = useResumoTestePro();
	const { data: resumo, isLoading, isError, error, refetch, isFetching } = useMinhaAssinatura();
	const [periodo, setPeriodo] = useState<PeriodoCobranca>(() => intencao?.periodo ?? "mensal");
	const [checkout, setCheckout] = useState<EstadoCheckout>({ plano: null, carregando: false, erro: null });
	// Mesma query do lembrete de assinatura: iniciar o teste aqui atualiza a faixa junto.
	const ofertaQ = useQuery(opcoesOfertaComercial);
	const oferta = ofertaQ.data ?? null;
	const [iniciandoTrial, setIniciandoTrial] = useState(false);
	// Pix só aparece quando o worker CONFIRMA que está ligado; até lá (e se falhar), nada de Pix.
	const [pixLigado, setPixLigado] = useState(false);
	// A consulta do Pix já respondeu (ligado ou não)? Até lá o `pagar=pix` espera.
	const [pixVerificado, setPixVerificado] = useState(false);
	// Pix aberto: o período fica congelado no clique (mexer no seletor atrás do diálogo não troca o valor).
	const [pixAberto, setPixAberto] = useState<{ plano: "pro" | "empresa"; periodo: PeriodoCobranca } | null>(null);

	// Pix Automático (renova sozinho): DESLIGADO por padrão no servidor; só aparece com o worker confirmando a flag.
	const [pixAutoLigado, setPixAutoLigado] = useState(false);
	const [pixAutoEstado, setPixAutoEstado] = useState<EstadoPixAutomatico | null>(null);
	const [pixAutoAberto, setPixAutoAberto] = useState(false);
	const pixAutoAtiva = pixAutoEstado?.ativa === true;
	// `null` (não deu para ler) mantém o último estado conhecido: nunca inventa "ativa" nem "inativa".
	const recarregarPixAuto = useCallback(async () => {
		const e = await estadoPixAutomatico();
		if (e) setPixAutoEstado(e);
	}, []);

	const carregarOferta = () => ofertaQ.refetch();

	// Funil de receita: quem chega a ver o preço (1 vez por sessão da página).
	useEffect(() => {
		void registrarEtapaAtivacao("planos_visto");
	}, []);

	useEffect(() => {
		let ativo = true;
		void pixDisponivel().then((ligado) => {
			if (!ativo) return;
			setPixLigado(ligado);
			setPixVerificado(true);
		});
		void pixAutomaticoDisponivel().then((ligado) => {
			if (ativo) setPixAutoLigado(ligado);
		});
		void recarregarPixAuto();
		return () => {
			ativo = false;
		};
	}, [recarregarPixAuto]);

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
	const consultarStatusStripe = !membroNaoDono && !!resumo && resumo.planoContratado !== "gratis";
	const statusStripe = useQuery({
		queryKey: ["olli", "stripe", "status"],
		queryFn: obterStatusPortalStripe,
		enabled: consultarStatusStripe,
		staleTime: 60_000,
		retry: 1,
	});
	const acessoAdministrativo = statusStripe.isSuccess && statusStripe.data.origem === "administrativa";

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

	async function comecarTrial() {
		setIniciandoTrial(true);
		await comecarTesteProComAviso(() => Promise.all([refetch(), carregarOferta()]));
		setIniciandoTrial(false);
	}

	// Plano que o Pix renova: o vigente comprado por Pix ou o que venceu (voltou ao Grátis).
	const planoParaRenovarPix: "pro" | "empresa" | null =
		!resumo || isError || membroNaoDono
			? null
			: acessoPorPix(resumo)
				? resumo.planoEfetivo
				: resumo.planoEfetivo === "gratis" && resumo.planoContratado !== "gratis"
					? resumo.planoContratado
					: null;
	const cardRenovarPixVisivel = !!resumo && !isError && !membroNaoDono && acessoPorPix(resumo) && pixLigado && !pixAutoAtiva;
	const cardTrialVisivel = !membroNaoDono && oferta?.trialEstado === "eligible" && resumo?.planoEfetivo === "gratis";

	function irParaCatalogo() {
		document.getElementById("escolha-seu-plano")?.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	function renovarComPix() {
		if (planoParaRenovarPix && pixLigado) setPixAberto({ plano: planoParaRenovarPix, periodo: "mensal" });
		else irParaCatalogo();
	}

	// `?renovar=pix` (vindo do lembrete de outra tela): abre o Pix do plano atual assim
	// que assinatura e Pix estiverem confirmados. Uma vez só — e o parâmetro sai da URL
	// para recarregar a página não reabrir a cobrança.
	const [pedidoRenovarPix, setPedidoRenovarPix] = useState(
		() => new URLSearchParams(window.location.search).get(PARAM_RENOVAR_PIX) === "pix",
	);
	useEffect(() => {
		if (!pedidoRenovarPix || !pixLigado || !planoParaRenovarPix) return;
		setPedidoRenovarPix(false);
		setPixAberto({ plano: planoParaRenovarPix, periodo: "mensal" });
		const url = new URL(window.location.href);
		url.searchParams.delete(PARAM_RENOVAR_PIX);
		window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
	}, [pedidoRenovarPix, pixLigado, planoParaRenovarPix]);

	// `?plano=pro&pagar=pix` (vindo do botão do aviso de limite ou do resumo do teste):
	// abre o MESMO Pix do cartão do plano, uma vez só, quando a assinatura e o Pix estão
	// confirmados. Sem Pix ligado, membro da equipe ou plano pago, só rola até o catálogo.
	// O parâmetro sai da URL: recarregar a página não reabre a cobrança.
	const [pedidoPagarPix, setPedidoPagarPix] = useState(
		() => intencao !== null && new URLSearchParams(window.location.search).get(PARAM_PAGAR) === "pix",
	);
	useEffect(() => {
		if (!pedidoPagarPix || !intencao) return;
		if (!pixVerificado || isLoading || contexto.isLoading) return;
		setPedidoPagarPix(false);
		const url = new URL(window.location.href);
		url.searchParams.delete(PARAM_PAGAR);
		window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
		if (podeAbrirPixDaIntencao({ pixLigado, membroNaoDono, resumo: isError ? null : (resumo ?? null) })) {
			void registrarEtapaAtivacao("plano_pagar_clicado");
			setPixAberto({ plano: intencao.plano, periodo: intencao.periodo });
		} else {
			// Mesmo destino de `irParaCatalogo` (inline: o efeito não depende de função recriada a cada render).
			document.getElementById("escolha-seu-plano")?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, [pedidoPagarPix, intencao, pixVerificado, isLoading, contexto.isLoading, pixLigado, membroNaoDono, isError, resumo]);

	return (
		<div className="mx-auto w-full max-w-6xl p-4 md:p-6">
			<header className="mb-5">
				<h1 className="text-2xl font-bold tracking-tight text-text-primary">Planos</h1>
				<p className="mt-1 text-sm text-text-secondary">Sua assinatura e o que cada plano libera.</p>
			</header>

			{intencao ? (
				<Card className="mb-5 border-brand/30 bg-brand/5 p-4" role="status">
					<div className="flex items-start gap-3">
						<Sparkles className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
						<div>
							<p className="font-semibold text-text-primary">
								Você escolheu revisar o {nomeDoPlano(intencao.plano)} {intencao.periodo}
							</p>
							<p className="mt-1 text-sm text-text-secondary">
								Confira recursos, preço, renovação e cancelamento abaixo. Nenhuma cobrança começa sem seu clique e a confirmação final no checkout seguro.
							</p>
						</div>
					</div>
				</Card>
			) : null}

			{/*
			 * Lembrete de assinar/renovar (mesma regra do app). Some quando esta tela já
			 * mostra o mesmo estado: o card "Renovar com Pix", o card do teste grátis, o
			 * status de plano vencido e o convite genérico (a tela inteira já é o convite).
			 */}
			{/* Véspera/fim do teste: o que o Pro fez, e o Pix do Pro ali mesmo. */}
			<ResumoTesteProCard
				className="mb-5"
				resumo={resumoTeste}
				aoPagar={() => {
					if (pixLigado && podeAbrirPixDaIntencao({ pixLigado, membroNaoDono, resumo: isError ? null : (resumo ?? null) })) {
						void registrarEtapaAtivacao("plano_pagar_clicado");
						setPixAberto({ plano: "pro", periodo: "mensal" });
					} else {
						irParaCatalogo();
					}
				}}
			/>

			<LembreteAssinaturaFaixa
				className="mb-5"
				aoIrParaPlanos={irParaCatalogo}
				aoRenovarPix={renovarComPix}
				ocultar={(l) =>
					l.tipo === "assinar" ||
					l.tipo === "plano_vencido" ||
					(l.tipo === "renovar_pix" && cardRenovarPixVisivel) ||
					(l.tipo === "trial_acabando" && !!resumoTeste) ||
					(l.tipo === "trial_disponivel" && cardTrialVisivel)
				}
			/>

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
				<div className="space-y-3">
					<CardStatus resumo={resumo} acessoAdministrativo={acessoAdministrativo} renovaPorPixAutomatico={pixAutoAtiva} />
					{acessoPorPix(resumo) ? (
						<>
							{pixAutoEstado?.ativa && (
								<CardPixAutomaticoAtivo
									estado={pixAutoEstado}
									aoCancelado={() => {
										void recarregarPixAuto();
										void refetch();
									}}
								/>
							)}
							{pixLigado && !pixAutoAtiva && (
								<CardRenovarPix
									plano={resumo.planoEfetivo}
									aoRenovar={(periodoRenovacao) => setPixAberto({ plano: resumo.planoEfetivo, periodo: periodoRenovacao })}
								/>
							)}
							{/* Sem cliente na Stripe não há o que gerenciar nem cancelar: Pix não tem assinatura. */}
							{resumo.temClienteStripe && <BotaoPortalStripe rotulo="Ver faturas no Portal da Stripe" />}
						</>
					) : resumo.renovaPelaPlay ? (
						<CardAssinaturaPlay produto={resumo.produtoPlay} />
					) : consultarStatusStripe && statusStripe.isLoading ? (
						<Skeleton className="h-10 w-80 rounded-lg" />
					) : statusStripe.data?.gerenciavel ? (
						<BotaoPortalStripe rotulo="Gerenciar, atualizar cartão ou cancelar" />
					) : null}
				</div>
			) : null}

			{cardTrialVisivel ? (
				<Card className="mt-4 gap-0 border-primary/35 bg-primary/5 p-5">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-3">
							<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
								<Sparkles className="size-5" aria-hidden />
							</span>
							<div>
								<p className="font-semibold text-text-primary">Experimente tudo do Pro por {TRIAL_PRO_DIAS} dias</p>
								<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">
									Sem cartão e sem cobrança automática. Quando terminar, a conta volta ao Grátis e seus dados continuam salvos.
								</p>
							</div>
						</div>
						<Button onClick={() => void comecarTrial()} disabled={iniciandoTrial} className="min-h-[44px] shrink-0">
							{iniciandoTrial ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
							Começar teste grátis
						</Button>
					</div>
				</Card>
			) : null}

			{/* ─── 2. O CATÁLOGO ─── */}
			<div
				id="escolha-seu-plano"
				className="mt-8 flex scroll-mt-4 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
			>
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
						emTeste={!!resumo && resumo.origem === "trial" && resumo.planoEfetivo === p.id}
						escritaBloqueada={membroNaoDono}
						carregando={checkout.plano === p.id && checkout.carregando}
						erro={checkout.plano === p.id ? checkout.erro : null}
						aoAssinar={() => {
							if (p.id === "pro" || p.id === "empresa") {
								void registrarEtapaAtivacao("plano_pagar_clicado");
								assinar(p.id);
							}
						}}
						pixDisponivel={pixLigado}
						pixAutomaticoDisponivel={pixAutoLigado && !pixAutoAtiva && p.id === "pro" && periodo === "mensal"}
						aoPagarComPixAutomatico={() => {
							void registrarEtapaAtivacao("plano_pagar_clicado");
							setPixAutoAberto(true);
						}}
						aoPagarComPix={() => {
							if (p.id === "pro" || p.id === "empresa") {
								void registrarEtapaAtivacao("plano_pagar_clicado");
								setPixAberto({ plano: p.id, periodo });
							}
						}}
					/>
				))}
			</div>

			{pixAutoAberto ? (
				<DialogPixAutomatico
					aoFechar={() => setPixAutoAberto(false)}
					aoAtivo={() => {
						void recarregarPixAuto();
						void refetch();
					}}
				/>
			) : null}

			{pixAberto ? (
				<DialogPix
					// `key` = uma cobrança nova por abertura (nunca reaproveita QR de outra escolha).
					key={`${pixAberto.plano}-${pixAberto.periodo}`}
					plano={idPix(pixAberto.plano, pixAberto.periodo)}
					nomePlano={nomeDoPlano(pixAberto.plano)}
					aoFechar={() => setPixAberto(null)}
					// O servidor já liberou o plano: relê a assinatura e a oferta (some o trial, marca "plano atual").
					aoPago={() => void Promise.all([refetch(), carregarOferta()])}
					linkWhatsApp={linkWhatsApp}
				/>
			) : null}

			{/* ─── 3. O COMPARATIVO (a verdade linha a linha) ─── */}
			<h2 className="mb-3 mt-10 text-base font-semibold text-text-primary">Comparar recurso a recurso</h2>
			<TabelaComparativo />

			<p className="mt-6 text-xs text-text-secondary">
				Pro e Empresa você assina agora, direto por aqui: escolha mensal ou anual (o anual sai {DESCONTO_ANUAL_ROTULO}{" "}
				mais barato) e o pagamento <strong>no cartão</strong> abre em seguida, no ambiente seguro da Stripe — renova
				automaticamente e você cancela quando quiser pelo Portal da Stripe.
				{pixLigado ? (
					<>
						{" "}
						Prefere <strong>Pix</strong>? Use "Pagar com Pix": ele libera 1 mês (ou 12, no anual) e não renova sozinho —
						perto do vencimento você paga de novo.
					</>
				) : null}{" "}
				Se precisar de ajuda, o WhatsApp continua disponível.
			</p>

			{/* D1438-G20: protótipo de áudio. Flag apagada = este bloco não monta. */}
			{planosAudioIaLigada(import.meta.env.VITE_PLANOS_AUDIO_IA as string | undefined) ? <AudioIaPrototipo /> : null}
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

/** Pacote do app Android na Google Play (app.json → expo.android.package). */
const PACOTE_ANDROID = "online.olliorcamentos.app";

/**
 * Assinatura vendida pela GOOGLE PLAY (no app Android). Não é da Stripe: o Portal da Stripe
 * não a enxerga, e o Pix não deve ser oferecido (ela já renova sozinha pela loja). Cancelar,
 * pausar ou trocar o cartão é na Play Store — o link abre a página de assinaturas de lá.
 */
function CardAssinaturaPlay({ produto }: { produto?: string }) {
	return (
		<Card className="gap-0 border-border p-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="font-semibold text-text-primary">Assinatura pela Google Play</p>
					<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">
						Você assinou pelo app Android, e a cobrança é feita na sua conta Google. Para cancelar, pausar ou trocar a
						forma de pagamento, use a Play Store.
					</p>
				</div>
				<Button asChild variant="outline" className="min-h-[44px] shrink-0">
					<a href={urlGerenciarNaPlay(PACOTE_ANDROID, produto)} target="_blank" rel="noopener noreferrer">
						Gerenciar na Google Play
					</a>
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

function CardStatus({
	resumo,
	acessoAdministrativo = false,
	renovaPorPixAutomatico = false,
}: {
	resumo: ResumoAssinatura;
	acessoAdministrativo?: boolean;
	/** Pix Automático ativo: o acesso vindo de Pix RENOVA sozinho (o texto de "Pix não renova" seria falso). */
	renovaPorPixAutomatico?: boolean;
}) {
	const nome = resumo.origem === "trial" ? "Pro" : nomeDoPlano(resumo.planoContratado);
	const quando = dataBr(resumo.proximaCobranca);

	if (resumo.origem === "trial") {
		return (
			<Faixa
				tom="success"
				titulo="Seu teste Pro está ativo"
				texto={`${quando ? `Você tem os recursos Pro até ${quando}. Se assinar agora por Pix ou cartão, mensal ou anual, não perde nenhum dia: o Pro pago começa em ${quando}, quando o teste acaba (o Pix Automático e o cartão em 12x começam no dia do pagamento). ` : ""}Sem cartão e sem cobrança automática; ao terminar, seus dados permanecem salvos.`}
			/>
		);
	}

	if (resumo.origem === "admin" || acessoAdministrativo) {
		return (
			<Faixa
				tom="success"
				titulo={`${nome} liberado administrativamente`}
				texto={`${quando ? `Acesso liberado até ${quando}. ` : ""}Esta conta não possui cobrança automática nem assinatura Stripe para cancelar.`}
				acao={{
					rotulo: "Falar sobre meu acesso",
					href: linkWhatsApp(`Olá! Quero falar sobre o acesso administrativo ao plano ${nome} no OLLI.`),
					discreta: true,
				}}
			/>
		);
	}

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
					portal: true,
				}}
			/>
		);
	}

	// ATIVO POR PIX — não há renovação automática nem cancelamento: dizer "renova
	// automaticamente" aqui seria mentira.
	if (acessoPorPix(resumo)) {
		return (
			<Faixa
				tom="success"
				titulo={`${nome} ativo`}
				texto={
					renovaPorPixAutomatico
						? `${quando ? `Acesso até ${quando}. ` : ""}Pix Automático ativo: renova sozinho todo mês, até você cancelar.`
						: `${quando ? `Acesso até ${quando}. ` : ""}Pagamento por Pix não renova sozinho.`
				}
				acao={{
					rotulo: "Falar sobre minha assinatura",
					href: linkWhatsApp(`Olá! Quero falar sobre a minha assinatura do plano ${nome} no OLLI.`),
					discreta: true,
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
					href: "#escolha-seu-plano",
					externa: false,
				}}
			/>
		);
	}

	// GRÁTIS de verdade (a tabela respondeu e não há assinatura).
	// O pagamento mora nos cartões ("Assinar Pro" / Pix). A faixa só desce até eles.
	// O WhatsApp continua no cartão, como ajuda, se o checkout falhar.
	return (
		<Faixa
			tom="neutro"
			titulo="Você está no plano Grátis"
			texto={`O Grátis tem ${FRASE_GRATIS}. Sem prazo e sem cartão.`}
			acao={{
				rotulo: "Quero assinar o Pro",
				href: "#escolha-seu-plano",
				externa: false,
			}}
		/>
	);
}

/** Renovar o plano atual por Pix. Os preços vêm da mesma fonte do catálogo (`precoDoPlano`). */
function CardRenovarPix({
	plano,
	aoRenovar,
}: {
	plano: "pro" | "empresa";
	aoRenovar: (periodo: PeriodoCobranca) => void;
}) {
	const preco = precoDoPlano(plano);
	if (!preco) return null;
	return (
		<Card className="gap-0 border-border p-5">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
						<QrCode className="size-5" aria-hidden />
					</span>
					<div>
						<p className="font-semibold text-text-primary">Renovar com Pix</p>
						<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">
							Os dias que faltam não se perdem: a renovação começa quando o seu acesso atual termina.
						</p>
					</div>
				</div>
				<div className="flex shrink-0 flex-col gap-2 sm:flex-row">
					<Button variant="outline" className="min-h-[44px]" onClick={() => aoRenovar("mensal")}>
						Renovar 1 mês com Pix — {reais(preco.mensalCentavos)}
					</Button>
					<Button className="min-h-[44px]" onClick={() => aoRenovar("anual")}>
						Renovar 1 ano com Pix — {reais(preco.anualCentavos)}
					</Button>
				</div>
			</div>
		</Card>
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
	acao?:
		| { rotulo: string; href: string; discreta?: boolean; externa?: boolean }
		| { rotulo: string; portal: true };
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
				{acao && "portal" in acao ? (
					<BotaoPortalStripe className="shrink-0 self-start sm:self-auto" rotulo={acao.rotulo} />
				) : acao ? (
					<Button asChild variant={acao.discreta ? "outline" : "default"} className="shrink-0 self-start sm:self-auto">
						<a
							href={acao.href}
							{...(acao.externa === false ? {} : { target: "_blank", rel: "noreferrer noopener" })}
						>
							{acao.externa === false ? null : <MessageCircle className="size-4" aria-hidden />}
							{acao.rotulo}
						</a>
					</Button>
				) : null}
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
				className="h-11 flex-1 rounded-lg px-4 text-sm font-semibold text-text-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm sm:flex-none"
			>
				Mensal
			</ToggleGroupItem>
			<ToggleGroupItem
				value="anual"
				className="h-11 flex-1 gap-2 rounded-lg px-4 text-sm font-semibold text-text-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm sm:flex-none"
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
	emTeste,
	escritaBloqueada,
	carregando,
	erro,
	aoAssinar,
	pixDisponivel,
	aoPagarComPix,
	pixAutomaticoDisponivel,
	aoPagarComPixAutomatico,
}: {
	plano: PlanoBase;
	periodo: PeriodoCobranca;
	/** true/false quando sabemos; `null` quando a leitura falhou (não marcamos nada). */
	atual: boolean | null;
	/** O acesso a este plano é um TESTE: o cartão fica marcado, mas pagar continua possível. */
	emTeste: boolean;
	/** Membro não-dono: quem assina/troca de plano é o dono da empresa, não ele. */
	escritaBloqueada?: boolean;
	carregando: boolean;
	erro: FalhaCheckout | null;
	aoAssinar: () => void;
	/** O worker confirmou que o Pix está ligado. Sem isso, nenhum botão de Pix. */
	pixDisponivel: boolean;
	aoPagarComPix: () => void;
	/** O worker confirmou o Pix Automático (desligado por padrão) e este cartão é o Pro mensal. */
	pixAutomaticoDisponivel: boolean;
	aoPagarComPixAutomatico: () => void;
}) {
	const estado = estadoDoCardPlano({ atual, emTeste });
	// Só o plano PAGO trava o cartão; no teste ele fica marcado mas pode ser assinado (estadoCard.ts).
	const ehAtual = estado === "travado_atual";
	const ehTeste = estado === "teste_pode_assinar";
	const preco = precoDoPlano(plano.id);
	// Preço da tela derivado da FONTE — no Grátis não há período nem nota.
	const { valor, sufixo, nota } = preco
		? precoNoPeriodo(preco, periodo)
		: { valor: reais(0), sufixo: "", nota: null };

	// Pix avulso: paga o período uma vez, sem renovar. Ao lado do Pix Automático, o rótulo diz isso.
	// D-2151 #13: "secondary" (cinza sobre cinza) parecia desabilitado — contorno na cor da marca.
	const botaoPix = (
		<Button
			variant="outline"
			className="mt-2 min-h-[44px] w-full border-primary text-primary hover:bg-primary/5 hover:text-primary"
			onClick={aoPagarComPix}
			disabled={carregando}
			data-opcao-pagamento="pix-avulso"
		>
			<QrCode className="size-4" aria-hidden />
			{pixAutomaticoDisponivel ? "Pagar com Pix só este mês" : "Pagar com Pix"}
		</Button>
	);

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
				(ehAtual || ehTeste) && "border-primary ring-1 ring-primary/30",
				plano.destaque && !ehAtual && !ehTeste && "border-primary/40",
			)}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-bold text-text-primary">{plano.nome}</h3>
				{ehAtual ? (
					<Badge variant="success">Seu plano atual</Badge>
				) : ehTeste ? (
					<Badge variant="success">Teste ativo</Badge>
				) : plano.destaque ? (
					<Badge variant="default">
						<Sparkles className="size-3" aria-hidden /> Recomendado
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
				{plano.bullets.map((b) => (
					<li key={b.texto} className="flex items-start gap-2 text-sm text-text-primary">
						{/* "Em breve" sem o ✓ de quem já funciona — três estados, nunca dois. */}
						{b.emBreve ? (
							<Clock className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
						) : (
							<Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
						)}
						<span>
							{b.texto}
							{b.emBreve && <span className="text-text-secondary"> (em breve)</span>}
						</span>
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
						{/* D-2171 (Igor, 18/11): com o Pix Automático disponível (Pro mensal) ele é a 1ª opção, o Pix avulso
						    a 2ª e o cartão a 3ª. Sem ele, a ordem de sempre (cartão, depois Pix). */}
						{pixAutomaticoDisponivel && (
							<div data-opcao-pagamento="pix-automatico">
								<Button className="h-auto min-h-[44px] w-full whitespace-normal py-2" onClick={aoPagarComPixAutomatico} disabled={carregando}>
									<RefreshCw className="size-4" aria-hidden />
									{ROTULO_PIX_AUTOMATICO}
								</Button>
								<p className="mt-1 text-center text-xs text-text-secondary">
									{textoCurtoPixAutomatico(reais(precoDoPlano("pro")?.mensalCentavos ?? 0))}
								</p>
							</div>
						)}

						{pixAutomaticoDisponivel && pixDisponivel && botaoPix}

						<Button
							variant={plano.destaque && !pixAutomaticoDisponivel ? "default" : "outline"}
							className={cn("min-h-[44px] w-full", pixAutomaticoDisponivel && "mt-2")}
							onClick={aoAssinar}
							disabled={carregando}
							aria-busy={carregando}
							data-opcao-pagamento="cartao"
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

						{!pixAutomaticoDisponivel && pixDisponivel && botaoPix}

						{/* Quais cartões o checkout aceita — dito ANTES do clique (ver notaCartao.ts). */}
						<p className="mt-2 text-center text-xs text-text-secondary">{notaCartao(pixDisponivel)}</p>

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
	if (!planoIncluiRecurso(plano, recurso)) return <NaoIncluido />;
	// Libera no mapa, mas o produto ainda marca "(em breve)" — não vender como pronto.
	if (emBreve) return <span className="text-xs font-medium text-text-secondary">Em breve</span>;
	return <Incluido />;
}

function TabelaComparativo() {
	// "Em todos os planos" = a alma do Grátis, sem a nota do selo (o selo é só do Grátis).
	const base = RECURSOS_GRATIS;
	const colClass = "px-4 py-3 text-center text-sm font-semibold text-text-primary";
	const grupoClass = "bg-bg-neutral/40 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary";
	const linhaClass = "border-t border-border/60";
	const cabecalhoLinhaClass = "px-4 py-2.5 text-left text-sm font-normal text-text-primary";
	const celulaClass = "px-4 py-2.5 text-center";

	return (
		<Card className="min-w-0 max-w-full gap-0 overflow-hidden p-0">
			{/* D-2151 #1: `relative` prende aqui os filhos absolutos da tabela (ex.: a legenda `sr-only`); sem ele
			    eles escapavam da rolagem e a página toda vazava de lado no celular (551px numa tela de 390). */}
			<div className="relative w-0 min-w-full max-w-full overflow-x-auto overscroll-x-contain">
				<table className="w-[560px] max-w-none border-collapse">
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
