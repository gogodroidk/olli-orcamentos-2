import type { Empresa } from "@dominio";
import {
	AVISO_EXEMPLO,
	calcularChecklistAtivacao,
	exemploOrcamentoPara,
	fatosDaEmpresa,
	itensPrefillDoExemplo,
	mostrarCartaoPrimeiroOrcamento,
	type PassoAtivacaoId,
	statusFoiEnviado,
	TITULO_PRIMEIRO_ORCAMENTO,
	totalDoExemplo,
	verticalDoExemplo,
} from "@ativacao";
import { VERTICAIS, VERTICAL_GERAL, type VerticalId } from "@verticais";
import { lembrarOficioEscolhido } from "@/olli/oficioEscolhido";
import { CheckCircle2, ChevronRight, Circle, FileText, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useValorVistoAntes } from "@/components/animate/use-valor-visto";
import { ehDonoDaConta } from "@/olli/papel";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { formatBRL } from "./helpers";
import { registrarEtapaAtivacao } from "@/store/userStore";

/** Os ofícios da pergunta de 1 toque: os especializados + "Outro serviço". */
const OFICIOS: readonly { id: VerticalId; label: string; emoji: string }[] = [
	...VERTICAIS.map((v) => ({ id: v.id, label: v.label, emoji: v.emoji })),
	{ id: VERTICAL_GERAL.id, label: "Outro serviço", emoji: VERTICAL_GERAL.emoji },
];

/** Para onde cada passo do checklist leva no painel. */
const DESTINO: Record<Exclude<PassoAtivacaoId, "primeiro_envio">, string> = {
	empresa: "/meu-negocio",
	pix: "/meu-negocio",
	primeiro_recibo: "/recibos",
};

interface Leitura<T> {
	data: T | undefined;
	isSuccess: boolean;
}

interface Props {
	/** Orçamentos da tela (a MESMA leitura dos KPIs): só `status` interessa aqui. */
	orcamentos: Leitura<{ status?: string | null }[]>;
	/** Recibos da tela (a MESMA leitura do "Recebido no mês"). */
	recibos: Leitura<unknown[]>;
	/** Linha de `empresa` (blob em `dados`). `null` = conta sem cadastro (é um valor, não erro). */
	empresa: Leitura<Record<string, unknown> | null>;
}

/**
 * ATIVAÇÃO NO INÍCIO DO PAINEL — gêmeo do `AtivacaoInicio` do app (mobile/desktop):
 *
 *  1. "Seu primeiro orçamento em 1 minuto" — só quando a leitura CONFIRMOU zero
 *     orçamentos. Um clique abre o editor com o exemplo do ofício (itens e valores
 *     de referência) e o aviso de que é exemplo. Sem ofício, a pergunta é de 1
 *     clique (a escolha vale para este exemplo; o ofício fica salvo em "Meu negócio").
 *  2. Checklist de 4 passos com progresso, até concluir.
 *
 * A regra (o exemplo de cada ofício, os passos, o "some quando conclui") é a MESMA
 * do app, importada de `@ativacao`. 3 estados: enquanto qualquer leitura carrega
 * ou falha, não desenha nada — nem convite de "primeiro orçamento" para quem já
 * tem 40, nem passo "pendente" que ele já cumpriu. Só o DONO vê (membro não edita
 * o cadastro da empresa); papel desconhecido = não mostra.
 */
export function AtivacaoCard({ orcamentos, recibos, empresa }: Props) {
	const navigate = useNavigate();
	const contexto = useContextoDeEscrita();
	const ehDono = contexto.isSuccess && ehDonoDaConta(contexto.data?.papel);

	const leiturasProntas = orcamentos.isSuccess && recibos.isSuccess && empresa.isSuccess;
	// Telemetria do funil: o cartão "Seu primeiro orçamento" foi de fato desenhado.
	const cartaoVisivel = ehDono && leiturasProntas && mostrarCartaoPrimeiroOrcamento((orcamentos.data ?? []).length);
	useEffect(() => {
		if (cartaoVisivel) void registrarEtapaAtivacao("ativacao_card_visto");
	}, [cartaoVisivel]);

	if (!ehDono || !leiturasProntas) return null;
	const listaOrc = orcamentos.data ?? [];
	const dados = (empresa.data?.dados as Empresa | undefined) ?? null;

	const checklist = calcularChecklistAtivacao({
		...fatosDaEmpresa(dados),
		primeiroOrcamentoEnviado: listaOrc.some((o) => statusFoiEnviado(o.status)),
		primeiroRecibo: (recibos.data?.length ?? 0) > 0,
	});
	const mostrarPrimeiro = mostrarCartaoPrimeiroOrcamento(listaOrc.length);
	if (!mostrarPrimeiro && checklist.estado !== "pendente") return null;

	const vertical = verticalDoExemplo(dados);
	const exemplo = exemploOrcamentoPara(vertical);

	const abrirExemplo = (v: VerticalId) => {
		const ex = exemploOrcamentoPara(v);
		if (!ex) return;
		// Sugestão para o "Meu negócio" (a escolha vale para o exemplo; o cadastro só a usa pré-preenchida).
		lembrarOficioEscolhido(v);
		// Pelo ESTADO da rota, como os outros atalhos de "novo orçamento" (ver
		// `orcamentos/index.tsx`): o editor abre sozinho com os itens do exemplo.
		navigate("/orcamentos?novo=1", { state: { prefillItems: itensPrefillDoExemplo(ex), exemploVertical: v } });
	};

	const irPara = (passo: PassoAtivacaoId) => {
		if (passo === "primeiro_envio") {
			// Quem já tem rascunho vai à lista enviar o que já fez; o exemplo é para quem não tem nenhum.
			if (mostrarPrimeiro && vertical) abrirExemplo(vertical);
			else navigate("/orcamentos");
			return;
		}
		navigate(DESTINO[passo]);
	};

	return (
		<div className="space-y-4">
			{mostrarPrimeiro && (
				<Card className="surgir gap-0 overflow-hidden p-0 shadow-sm">
					<div className="flex items-start gap-3 px-5 py-4">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
							<Zap className="size-5" strokeWidth={2.2} />
						</span>
						<div className="min-w-0 flex-1">
							<h2 className="text-base font-semibold text-text-primary">{TITULO_PRIMEIRO_ORCAMENTO}</h2>
							<p className="mt-0.5 text-sm text-text-secondary">
								{exemplo
									? `Preparamos um exemplo de ${exemplo.titulo.toLowerCase()} (${formatBRL(totalDoExemplo(exemplo))}). Troque o cliente e os valores pelos seus e envie.`
									: "Qual é o seu ofício? Com um clique, preparamos um orçamento de exemplo do seu serviço."}
							</p>
						</div>
					</div>
					<div className="border-t border-border/60 px-5 py-4">
						{exemplo && vertical ? (
							<div className="space-y-2">
								<Button
									onClick={() => {
										void registrarEtapaAtivacao("ativacao_card_clicado");
										abrirExemplo(vertical);
									}}
									className="min-h-11"
								>
									<FileText className="mr-2 size-4" />
									Abrir orçamento de exemplo
								</Button>
								<p className="text-xs leading-snug text-text-secondary">{AVISO_EXEMPLO}</p>
							</div>
						) : (
							<fieldset>
								<legend className="sr-only">Escolha o seu ofício</legend>
								<div className="flex flex-wrap gap-2">
									{OFICIOS.map((o) => (
										<button
											key={o.id}
											type="button"
											onClick={() => {
												void registrarEtapaAtivacao("ativacao_card_clicado");
												void registrarEtapaAtivacao("oficio_escolhido");
												abrirExemplo(o.id);
											}}
											className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
										>
											<span aria-hidden="true">{o.emoji}</span>
											{o.label}
										</button>
									))}
								</div>
							</fieldset>
						)}
					</div>
				</Card>
			)}

			{checklist.estado === "pendente" && (
				<Card className="surgir gap-0 overflow-hidden p-0 shadow-sm">
					<div className="flex items-center justify-between gap-3 px-5 pt-4">
						<h2 className="text-base font-semibold text-text-primary">Deixe o OLLI pronto para trabalhar</h2>
						<span className="text-xs font-semibold text-text-secondary">
							{checklist.feitos} de {checklist.total}
						</span>
					</div>
					<div className="px-5 pt-3">
						<BarraAtivacao feitos={checklist.feitos} total={checklist.total} />
					</div>
					<ul className="divide-y divide-border/60 px-2 py-2">
						{checklist.passos.map((p) => (
							<li key={p.id}>
								<button
									type="button"
									disabled={p.feito}
									onClick={() => irPara(p.id)}
									className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors enabled:hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-default"
								>
									{p.feito ? (
										<CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success" />
									) : (
										<Circle aria-hidden="true" className="size-5 shrink-0 text-text-disabled" />
									)}
									<span className="min-w-0 flex-1">
										<span
											className={`block text-sm font-medium ${p.feito ? "text-text-secondary line-through" : "text-text-primary"}`}
										>
											{p.titulo}
											<span className="sr-only">{p.feito ? " — feito" : " — pendente"}</span>
										</span>
										{!p.feito && <span className="block text-xs text-text-secondary">{p.descricao}</span>}
									</span>
									{!p.feito && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-disabled" />}
								</button>
							</li>
						))}
					</ul>
				</Card>
			)}
		</div>
	);
}

/**
 * A barra do checklist cresce A PARTIR do que o dono viu da última vez: cadastrou o
 * Pix, voltou ao Início — a barra anda de 1/4 para 2/4 na frente dele. É o "você
 * avançou" que faltava no onboarding, sem texto a mais.
 *
 * `scaleX` (compositor) no lugar de `width` (que refaz o layout a cada quadro), com
 * duração/curva dos tokens; em "Reduzir movimento" a duração vira 1ms (tokens.css).
 */
function BarraAtivacao({ feitos, total }: { feitos: number; total: number }) {
	const antes = useValorVistoAntes("ativacao-feitos", feitos);
	const alvo = total > 0 ? feitos / total : 0;
	const [fracao, setFracao] = useState(() => (antes !== null && antes < feitos && total > 0 ? antes / total : alvo));

	useEffect(() => {
		// Um quadro depois da pintura: a posição de partida precisa estar NA TELA para a
		// transição ter de onde sair.
		const quadro = requestAnimationFrame(() => setFracao(alvo));
		return () => cancelAnimationFrame(quadro);
	}, [alvo]);

	return (
		<div
			className="h-1.5 overflow-hidden rounded-full bg-border"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={feitos}
			aria-label="Progresso da ativação"
		>
			<div
				className="h-full origin-left rounded-full bg-success transition-transform duration-(--motion-duration-slow) ease-(--motion-ease-enter)"
				style={{ transform: `scaleX(${fracao})` }}
			/>
		</div>
	);
}
