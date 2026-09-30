/**
 * FORMULÁRIO DE CONTRATO RECORRENTE — criar e editar (painel).
 *
 * Mesmos campos e mesma validação do celular (`validarContrato`, fonte única). Ao
 * salvar, a próxima visita já é gerada e o formulário DIZ o que aconteceu — nada em
 * silêncio. Ativo = equipamento do inventário OU texto livre (piscina, caixa d'água…).
 */
import type { AtivoContrato, ContratoRecorrente, Equipamento, ModoCobrancaContrato, SituacaoContrato } from "@dominio";
import { Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Campo, CampoMoeda, formatarMoeda } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import SeletorCliente, { type ClienteSelecionado } from "@/olli/components/SeletorCliente";
import { novoId } from "@/olli/contrato";
import { useOlliList } from "@/olli/data";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";
import {
	diaBR,
	hojeNoBrasil,
	nomeDoEquipamento,
	PERIODICIDADES_CONTRATO,
	proximasVisitas,
	validarContrato,
	valorMensalEquivalente,
} from "../../../../../src/utils/contratoRecorrente";
import { resumoDaGeracao } from "../../../../../src/utils/contratoRecorrenteGeracao";
import { type LinhaAsset, linhaParaEquipamento } from "../equipamentos/equipamento";
import { PAPEL_ROTULO, useTecnicos } from "../ordens-servico/useTecnicos";
import { useSalvarContrato } from "./useContratos";

const SEM = "__nenhum__";

const SITUACOES: { id: SituacaoContrato; label: string }[] = [
	{ id: "vigente", label: "Ativo" },
	{ id: "suspenso", label: "Pausado (não gera visita)" },
	{ id: "encerrado", label: "Encerrado (não gera visita)" },
];

function novoContrato(): ContratoRecorrente {
	const agora = new Date().toISOString();
	return {
		id: novoId(),
		titulo: "",
		situacao: "vigente",
		periodicidade: "mensal",
		dataInicio: hojeNoBrasil(),
		horarioVisita: "08:00",
		ativos: [],
		atividades: [],
		modoCobranca: "mensal",
		valor: 0,
		renovacao: "manual",
		criadoEm: agora,
		atualizadoEm: agora,
	};
}

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	contrato: ContratoRecorrente | null;
	/** Frase do que a gravação fez ("1 visita nova na agenda"). */
	aoSalvar: (frase: string) => void;
}

export default function FormContrato({ aberto, aoFechar, contrato, aoSalvar }: Props) {
	const formId = useId();
	const salvar = useSalvarContrato();
	const equipe = useTecnicos();
	const ativosQ = useOlliList<LinhaAsset>("assets", { orderBy: "criado_em", ascending: false, enabled: aberto });

	const [c, setC] = useState<ContratoRecorrente>(() => contrato ?? novoContrato());
	const [atividadesTexto, setAtividadesTexto] = useState("");
	const [novoAtivo, setNovoAtivo] = useState("");
	const [erro, setErro] = useState<string | null>(null);

	// `reset` numa ref: o objeto do useMutation muda a cada mutação e, nas dependências,
	// o efeito abaixo re-rodaria no meio da digitação (mesma razão do FormAgendamento).
	const resetarErro = useRef(salvar.reset);
	resetarErro.current = salvar.reset;

	// Reabrir recarrega o registro (senão "editar" mostraria o contrato anterior).
	useEffect(() => {
		if (!aberto) return;
		const base = contrato ?? novoContrato();
		setC(base);
		setAtividadesTexto(base.atividades.join("\n"));
		setNovoAtivo("");
		setErro(null);
		resetarErro.current();
	}, [aberto, contrato]);

	const set = (patch: Partial<ContratoRecorrente>) => setC((atual) => ({ ...atual, ...patch }));

	const equipamentos = useMemo<Equipamento[]>(
		() =>
			(ativosQ.data ?? [])
				.map(linhaParaEquipamento)
				.filter((e) => !c.clienteId || e.clienteId === c.clienteId)
				.slice(0, 40),
		[ativosQ.data, c.clienteId],
	);

	const montado: ContratoRecorrente = {
		...c,
		atividades: atividadesTexto
			.split("\n")
			.map((t) => t.trim())
			.filter(Boolean),
	};
	const previa = validarContrato(montado).length === 0 ? proximasVisitas(montado, new Date(), 3) : [];

	const clienteSel: ClienteSelecionado | null = c.clienteId
		? { clienteId: c.clienteId, clienteNome: c.clienteNome ?? "", clienteTelefone: "" }
		: null;

	function alternarEquipamento(eq: Equipamento) {
		const existe = c.ativos.some((a) => a.assetId === eq.id);
		set({
			ativos: existe
				? c.ativos.filter((a) => a.assetId !== eq.id)
				: [...c.ativos, { id: novoId(), nome: nomeDoEquipamento(eq), assetId: eq.id }],
		});
	}

	function adicionarLivre() {
		const nome = novoAtivo.trim();
		if (!nome) return;
		set({ ativos: [...c.ativos, { id: novoId(), nome }] });
		setNovoAtivo("");
	}

	async function submeter(ev: React.FormEvent) {
		ev.preventDefault();
		const erros = validarContrato(montado);
		if (erros.length) {
			setErro(erros[0]);
			return;
		}
		setErro(null);
		const r = await salvar.mutateAsync(montado);
		aoSalvar(
			r.geracao
				? resumoDaGeracao(r.geracao) || "Contrato salvo. A próxima visita já estava na agenda."
				: "Contrato salvo. Não consegui gerar as visitas agora — tento de novo na próxima abertura.",
		);
		aoFechar();
	}

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			titulo={contrato ? "Editar contrato" : "Novo contrato recorrente"}
			descricao="Cliente + ativos + periodicidade + valor. O OLLI coloca cada visita na agenda."
			formId={formId}
			salvando={salvar.isPending}
			erro={erro ?? (salvar.isError ? ((salvar.error as Error)?.message ?? "Não foi possível salvar.") : null)}
			rotuloSalvar={contrato ? "Salvar contrato" : "Criar contrato"}
			largo
		>
			<form id={formId} onSubmit={submeter} className="space-y-4">
				<Campo rotulo="Nome do contrato" obrigatorio>
					<Input
						value={c.titulo}
						onChange={(e) => set({ titulo: e.target.value })}
						placeholder="Ex.: Manutenção mensal da piscina"
						autoFocus
					/>
				</Campo>

				<Campo rotulo="Cliente" obrigatorio>
					<SeletorCliente
						valor={clienteSel}
						aoSelecionar={(cl) =>
							set({
								clienteId: cl.clienteId,
								clienteNome: cl.clienteNome,
								endereco: c.endereco?.trim() || cl.clienteEndereco || undefined,
							})
						}
					/>
				</Campo>

				<Campo rotulo="Endereço da visita">
					<Input
						value={c.endereco ?? ""}
						onChange={(e) => set({ endereco: e.target.value })}
						placeholder="Rua, número, bairro…"
					/>
				</Campo>

				{/* ─── Ativos ─── */}
				<div className="space-y-2">
					<p className="text-sm font-medium text-text-primary">
						Ativos atendidos <span className="text-error-dark dark:text-error">*</span>
					</p>
					{c.ativos.length === 0 && (
						<p className="text-xs text-text-secondary">
							Um equipamento do inventário ou um ativo escrito (piscina, caixa d'água, jardim…).
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						{c.ativos.map((a: AtivoContrato) => (
							<Button
								key={a.id}
								type="button"
								size="sm"
								variant="outline"
								className="gap-1 border-primary text-primary"
								onClick={() => set({ ativos: c.ativos.filter((x) => x.id !== a.id) })}
								aria-label={`Remover ${a.nome}`}
							>
								{a.nome}
								<X className="size-3.5" aria-hidden="true" />
							</Button>
						))}
					</div>
					<div className="flex gap-2">
						<Input
							value={novoAtivo}
							onChange={(e) => setNovoAtivo(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									adicionarLivre();
								}
							}}
							placeholder="Ex.: Piscina adulto"
							aria-label="Novo ativo"
						/>
						<Button type="button" variant="outline" onClick={adicionarLivre} className="gap-1">
							<Plus className="size-4" aria-hidden="true" />
							Adicionar
						</Button>
					</div>
					{ativosQ.isError ? (
						<p className="text-xs text-text-secondary">Não consegui carregar o inventário de equipamentos.</p>
					) : equipamentos.length > 0 ? (
						<div className="space-y-1">
							<p className="text-xs text-text-secondary">Do inventário{c.clienteId ? " deste cliente" : ""}:</p>
							<div className="flex flex-wrap gap-2">
								{equipamentos.map((eq) => {
									const ativo = c.ativos.some((a) => a.assetId === eq.id);
									return (
										<Button
											key={eq.id}
											type="button"
											size="sm"
											variant={ativo ? "default" : "outline"}
											aria-pressed={ativo}
											onClick={() => alternarEquipamento(eq)}
										>
											{nomeDoEquipamento(eq)}
										</Button>
									);
								})}
							</div>
						</div>
					) : null}
				</div>

				{/* ─── Periodicidade e agenda ─── */}
				<div className="grid gap-4 sm:grid-cols-3">
					<Campo rotulo="Visita a cada" obrigatorio>
						<Select value={c.periodicidade} onValueChange={(v) => set({ periodicidade: v })}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PERIODICIDADES_CONTRATO.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>
					<Campo rotulo="Primeira visita" obrigatorio dica="O dia vira o dia das próximas.">
						<Input type="date" value={c.dataInicio} onChange={(e) => set({ dataInicio: e.target.value })} />
					</Campo>
					<Campo rotulo="Horário" obrigatorio>
						<Input
							type="time"
							value={c.horarioVisita}
							onChange={(e) => set({ horarioVisita: e.target.value.slice(0, 5) })}
						/>
					</Campo>
				</div>
				<Campo rotulo="Fim do contrato" dica="Em branco = sem data para acabar.">
					<Input
						type="date"
						value={c.dataFim ?? ""}
						min={c.dataInicio || undefined}
						onChange={(e) => set({ dataFim: e.target.value || undefined })}
					/>
				</Campo>

				<Campo rotulo="O que é feito em cada visita" dica="Uma por linha. Vira o checklist da OS, por ativo.">
					<Textarea
						rows={3}
						value={atividadesTexto}
						onChange={(e) => setAtividadesTexto(e.target.value)}
						placeholder={"Medir pH e cloro\nAspirar o fundo"}
					/>
				</Campo>

				{/* ─── Técnico ─── */}
				{equipe.isError ? (
					<p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
						Não consegui carregar a equipe.{" "}
						<button type="button" className="font-semibold underline" onClick={() => equipe.refetch()}>
							Tentar de novo
						</button>
					</p>
				) : (equipe.data?.length ?? 0) > 0 || c.responsavelId ? (
					<Campo rotulo="Técnico responsável pelas visitas">
						<Select
							value={c.responsavelId || SEM}
							onValueChange={(v) => {
								const m = equipe.data?.find((x) => x.userId === v);
								set(
									v === SEM
										? { responsavelId: undefined, responsavelNome: undefined }
										: { responsavelId: v, responsavelNome: m?.nome ?? c.responsavelNome },
								);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={SEM}>Ninguém ainda</SelectItem>
								{(equipe.data ?? []).map((m) => (
									<SelectItem key={m.userId} value={m.userId}>
										{m.nome} · {PAPEL_ROTULO[m.papel] ?? m.papel}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>
				) : null}

				{/* ─── Cobrança ─── */}
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="Cobrança">
						<Select value={c.modoCobranca} onValueChange={(v) => set({ modoCobranca: v as ModoCobrancaContrato })}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="mensal">Valor por mês</SelectItem>
								<SelectItem value="por_visita">Valor por visita</SelectItem>
							</SelectContent>
						</Select>
					</Campo>
					<Campo
						rotulo={c.modoCobranca === "mensal" ? "Valor mensal" : "Valor de cada visita"}
						dica={
							c.modoCobranca === "por_visita" && c.valor > 0
								? `≈ R$ ${formatarMoeda(valorMensalEquivalente(c))}/mês. Você cobra pelo seu Pix; o OLLI não passa o dinheiro.`
								: "Você cobra pelo seu Pix; o OLLI não passa o dinheiro."
						}
					>
						<CampoMoeda valor={c.valor} aoMudar={(v) => set({ valor: v })} />
					</Campo>
				</div>

				{contrato && (
					<Campo rotulo="Situação">
						<Select value={c.situacao} onValueChange={(v) => set({ situacao: v as SituacaoContrato })}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SITUACOES.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>
				)}

				<Campo rotulo="Observações">
					<Textarea
						rows={2}
						value={c.observacoes ?? ""}
						onChange={(e) => set({ observacoes: e.target.value })}
						placeholder="Ex.: chave com o zelador"
					/>
				</Campo>

				<p className={cn("rounded-lg px-3 py-2 text-sm", previa.length ? "bg-primary/10 text-text-primary" : "text-text-secondary")}>
					{previa.length
						? `Próximas visitas: ${previa.map(diaBR).join(" · ")}`
						: "Preencha cliente, ativo, periodicidade e primeira visita para ver as próximas datas."}
				</p>
			</form>
		</FormDialog>
	);
}
