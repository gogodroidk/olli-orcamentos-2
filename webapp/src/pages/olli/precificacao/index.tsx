import type { ProdutoItem, ServicoItem } from "@dominio";
import { Calculator, Info, Package, Save, ShieldCheck, TrendingUp, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { calcularPrecoProduto, calcularPrecoServico } from "@precificacao";
import { Campo, CampoMoeda } from "@/olli/components/campos";
import { novoId } from "@/olli/contrato";
import { agoraIso } from "@/olli/datas";
import { useContextoDeEscrita, useSalvar } from "@/olli/mutacoes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { cn } from "@/utils";
import { PRECIFICACAO_IA_LIGADA, type CamposPrecificacaoForm } from "@/olli/precificacaoIa";
import { PrecificacaoIaPainel } from "./PrecificacaoIaPainel";

type Modo = "servico" | "produto";
type Campos = CamposPrecificacaoForm;

const INICIAL: Campos = {
	nome: "",
	custoMateriais: 0,
	horas: 1,
	valorHora: 80,
	deslocamento: 0,
	custoCompra: 0,
	frete: 0,
	embalagem: 0,
	outrosCustos: 0,
	despesasFixasRateadas: 0,
	impostoPct: 6,
	taxaPagamentoPct: 3,
	reservaPct: 2,
	margemPct: 25,
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PCT = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function CampoPercentual({ rotulo, valor, aoMudar, dica }: { rotulo: string; valor: number; aoMudar: (valor: number) => void; dica?: string }) {
	return (
		<Campo rotulo={rotulo} dica={dica}>
			<div className="relative">
				<Input type="number" inputMode="decimal" min={0} max={90} step={0.1} value={valor} onChange={(event) => aoMudar(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)} className="pr-9 text-right tabular-nums" />
				<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">%</span>
			</div>
		</Campo>
	);
}

function ResultadoCard({ titulo, valor, destaque = false, descricao }: { titulo: string; valor: string; destaque?: boolean; descricao: string }) {
	return (
		<Card className={cn("gap-1 p-4", destaque && "border-primary/40 bg-primary/5")}>
			<p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{titulo}</p>
			<p className={cn("text-2xl font-bold tabular-nums text-text-primary", destaque && "text-primary")}>{valor}</p>
			<p className="text-xs leading-5 text-text-secondary">{descricao}</p>
		</Card>
	);
}

export default function PrecificacaoPage() {
	const [modo, setModo] = useState<Modo>("servico");
	const [campos, setCampos] = useState<Campos>(INICIAL);
	const salvarServico = useSalvar("servicos");
	const salvarProduto = useSalvar("produtos");
	const contexto = useContextoDeEscrita();
	const somenteLeitura = contexto.data?.ownerUserId != null;
	const permissaoPronta = !contexto.isLoading && !contexto.isError && !!contexto.data && !somenteLeitura;
	const salvando = salvarServico.isPending || salvarProduto.isPending;

	const resultado = useMemo(() => modo === "servico"
		? calcularPrecoServico({
			custoMateriais: campos.custoMateriais,
			horas: campos.horas,
			valorHora: campos.valorHora,
			deslocamento: campos.deslocamento,
			outrosCustos: campos.outrosCustos,
			despesasFixasRateadas: campos.despesasFixasRateadas,
			impostoPct: campos.impostoPct,
			taxaPagamentoPct: campos.taxaPagamentoPct,
			reservaPct: campos.reservaPct,
			margemPct: campos.margemPct,
		})
		: calcularPrecoProduto({
			custoCompra: campos.custoCompra,
			frete: campos.frete,
			embalagem: campos.embalagem,
			outrosCustos: campos.outrosCustos,
			despesasFixasRateadas: campos.despesasFixasRateadas,
			impostoPct: campos.impostoPct,
			taxaPagamentoPct: campos.taxaPagamentoPct,
			reservaPct: campos.reservaPct,
			margemPct: campos.margemPct,
		}), [campos, modo]);

	const atualizar = <K extends keyof Campos>(campo: K, valor: Campos[K]) => setCampos((atual) => ({ ...atual, [campo]: valor }));

	async function salvarNoCatalogo() {
		const nome = campos.nome.trim();
		if (!resultado || !nome || !permissaoPronta || salvando) return;
		const criadoEm = agoraIso();
		try {
			if (modo === "servico") {
				const servico: ServicoItem = { id: novoId(), nome, preco: resultado.precoSugerido, custo: resultado.custoDireto, unidade: "un", criadoEm };
				await salvarServico.mutateAsync(servico);
			} else {
				const produto: ProdutoItem = { id: novoId(), nome, preco: resultado.precoSugerido, custo: resultado.custoDireto, unidade: "pç", criadoEm };
				await salvarProduto.mutateAsync(produto);
			}
			toast.success(`${modo === "servico" ? "Serviço" : "Produto"} salvo no catálogo`, { description: `${nome} · ${BRL.format(resultado.precoSugerido)}` });
		} catch (erro) {
			toast.error(erro instanceof Error ? erro.message : "Não consegui salvar no catálogo.");
		}
	}

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6" data-ai-readable="true" data-ai-surface="central-precificacao">
			<header>
				<div className="flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Calculator className="size-5" /></span><div><h1 className="text-2xl font-bold tracking-tight text-text-primary">Central de Precificação</h1><p className="mt-1 text-sm text-text-secondary">Forme preço de serviço, peça ou produto sem esquecer custo, taxa, risco e lucro.</p></div></div>
			</header>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
				<div className="space-y-5">
					<Card className="p-5">
						<div className="grid grid-cols-2 gap-2" role="tablist" aria-label="O que será precificado">
							<button type="button" role="tab" aria-selected={modo === "servico"} onClick={() => setModo("servico")} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors", modo === "servico" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-text-secondary hover:text-text-primary")}><Wrench className="size-4" />Serviço</button>
							<button type="button" role="tab" aria-selected={modo === "produto"} onClick={() => setModo("produto")} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors", modo === "produto" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-text-secondary hover:text-text-primary")}><Package className="size-4" />Produto, peça ou material</button>
						</div>
					</Card>

					{PRECIFICACAO_IA_LIGADA ? (
						<PrecificacaoIaPainel
							campos={campos}
							onAplicar={(proximos, modoLido) => {
								setCampos(proximos);
								if (modoLido) setModo(modoLido);
							}}
						/>
					) : null}

					<Card className="p-5">
						<h2 className="font-semibold text-text-primary">1. Seus custos</h2>
						<p className="mt-1 text-sm text-text-secondary">Use o custo real desta venda. O que ficar em zero não entra na conta.</p>
						<div className="mt-4 grid gap-4 sm:grid-cols-2">
							{modo === "servico" ? <>
								<Campo rotulo="Materiais e peças"><CampoMoeda valor={campos.custoMateriais} aoMudar={(valor) => atualizar("custoMateriais", valor)} /></Campo>
								<Campo rotulo="Horas de trabalho"><Input type="number" inputMode="decimal" min={0} step={0.25} value={campos.horas} onChange={(event) => atualizar("horas", Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)} className="text-right tabular-nums" /></Campo>
								<Campo rotulo="Valor da sua hora" dica="Inclua salário desejado e encargos da sua mão de obra."><CampoMoeda valor={campos.valorHora} aoMudar={(valor) => atualizar("valorHora", valor)} /></Campo>
								<Campo rotulo="Deslocamento"><CampoMoeda valor={campos.deslocamento} aoMudar={(valor) => atualizar("deslocamento", valor)} /></Campo>
							</> : <>
								<Campo rotulo="Custo de compra por unidade"><CampoMoeda valor={campos.custoCompra} aoMudar={(valor) => atualizar("custoCompra", valor)} /></Campo>
								<Campo rotulo="Frete por unidade"><CampoMoeda valor={campos.frete} aoMudar={(valor) => atualizar("frete", valor)} /></Campo>
								<Campo rotulo="Embalagem por unidade"><CampoMoeda valor={campos.embalagem} aoMudar={(valor) => atualizar("embalagem", valor)} /></Campo>
							</>}
							<Campo rotulo="Outros custos"><CampoMoeda valor={campos.outrosCustos} aoMudar={(valor) => atualizar("outrosCustos", valor)} /></Campo>
							<Campo rotulo="Rateio de despesas fixas" dica="Parte de aluguel, internet, ferramentas e administração atribuída a esta venda."><CampoMoeda valor={campos.despesasFixasRateadas} aoMudar={(valor) => atualizar("despesasFixasRateadas", valor)} /></Campo>
						</div>
					</Card>

					<Card className="p-5">
						<h2 className="font-semibold text-text-primary">2. Taxas, proteção e lucro</h2>
						<div className="mt-4 grid gap-4 sm:grid-cols-2">
							<CampoPercentual rotulo="Impostos" valor={campos.impostoPct} aoMudar={(valor) => atualizar("impostoPct", valor)} />
							<CampoPercentual rotulo="Taxa de pagamento" valor={campos.taxaPagamentoPct} aoMudar={(valor) => atualizar("taxaPagamentoPct", valor)} dica="Cartão, marketplace ou outro intermediador." />
							<CampoPercentual rotulo="Reserva de risco e garantia" valor={campos.reservaPct} aoMudar={(valor) => atualizar("reservaPct", valor)} />
							<CampoPercentual rotulo="Margem de lucro desejada" valor={campos.margemPct} aoMudar={(valor) => atualizar("margemPct", valor)} />
						</div>
					</Card>
				</div>

				<aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-live="polite">
					{resultado ? <>
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
							<ResultadoCard titulo="Custo total" valor={BRL.format(resultado.custoDireto)} descricao="Tudo que você informou antes de impostos e lucro." />
							<ResultadoCard titulo="Preço mínimo" valor={BRL.format(resultado.precoEquilibrio)} descricao="Cobre custos e taxas, mas não deixa lucro." />
							<ResultadoCard titulo="Preço sugerido" valor={BRL.format(resultado.precoSugerido)} destaque descricao={`Inclui margem alvo de ${PCT.format(campos.margemPct)}%.`} />
							<ResultadoCard titulo="Lucro estimado" valor={BRL.format(resultado.lucroEstimado)} descricao={`Margem real ${PCT.format(resultado.margemRealPct)}% · markup ${PCT.format(resultado.markupPct)}%.`} />
						</div>
						<Card className="p-5">
							<div className="flex items-start gap-3"><TrendingUp className="mt-0.5 size-5 shrink-0 text-success" /><div><h2 className="font-semibold text-text-primary">Espaço de negociação</h2><p className="mt-1 text-sm leading-6 text-text-secondary">Desconto máximo aproximado sem entrar no prejuízo: <strong className="text-text-primary">{PCT.format(resultado.descontoMaxSemPrejuizoPct)}%</strong>. Abaixo de {BRL.format(resultado.precoEquilibrio)}, seus custos e taxas deixam de estar cobertos.</p></div></div>
						</Card>
						<Card className="p-5" data-ai-readable="true" data-ai-topic="memoria-calculo-preco">
							<h2 className="font-semibold text-text-primary">Como o preço foi formado</h2>
							<ul className="mt-3 space-y-2 text-sm text-text-secondary">{resultado.memoria.map((linha) => <li key={linha} className="flex gap-2"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{linha}</li>)}</ul>
						</Card>
						<Card className="p-5">
							<Campo rotulo={`Nome para salvar como ${modo === "servico" ? "serviço" : "produto"}`} dica="Depois de salvo, fica disponível para os próximos orçamentos."><Input value={campos.nome} onChange={(event) => atualizar("nome", event.target.value.slice(0, 160))} placeholder={modo === "servico" ? "Ex.: Instalação de tomada" : "Ex.: Disjuntor bipolar 32 A"} /></Campo>
							<Button type="button" className="mt-4 w-full gap-2" onClick={() => { void salvarNoCatalogo(); }} disabled={!campos.nome.trim() || !permissaoPronta || salvando}><Save className="size-4" />{salvando ? "Salvando…" : "Salvar no catálogo"}</Button>
							{somenteLeitura ? <p className="mt-2 text-xs text-text-secondary">Somente o dono da empresa pode alterar o catálogo.</p> : contexto.isError ? <p className="mt-2 text-xs text-error">Não consegui confirmar sua permissão. O cálculo continua disponível, mas o salvamento está bloqueado.</p> : null}
						</Card>
					</> : <Card className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><Calculator className="size-9 text-text-disabled" /><h2 className="mt-3 font-semibold text-text-primary">Informe pelo menos um custo</h2><p className="mt-1 max-w-sm text-sm leading-6 text-text-secondary">O preço aparece automaticamente quando houver custo. Percentuais incompatíveis também bloqueiam o resultado para evitar um cálculo enganoso.</p></Card>}
					<Card className="flex items-start gap-3 border-info/30 bg-info/5 p-4"><Info className="mt-0.5 size-5 shrink-0 text-info-dark dark:text-info-light" /><p className="text-xs leading-5 text-text-secondary">O resultado é uma referência baseada nos valores informados. Compare com sua região, capacidade, qualidade, prazo e concorrência antes de enviar.</p></Card>
					<Card className="flex items-start gap-3 border-success/30 bg-success/5 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" /><p className="text-xs leading-5 text-text-secondary">Seu custo e sua margem são privados. Eles ficam no catálogo da sua empresa e não aparecem no documento público do cliente.</p></Card>
				</aside>
			</div>
		</div>
	);
}
