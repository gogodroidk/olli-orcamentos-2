/**
 * EQUIPAMENTOS — inventário HVAC (base do PMOC).
 *
 * Lê a tabela REMOTA `assets` (o app chama de `equipamentos` localmente; o
 * `contrato.ts` traduz o nome na gravação). Cada linha é reidratada para o objeto de
 * domínio INTEIRO antes de ir para o formulário ou para a exclusão — é isso que
 * garante que editar/excluir não apague `fotos`, `qrToken` e `localId`, que só
 * existem no registro e não na tela.
 *
 * 3 ESTADOS DE VERDADE: carregando · erro (com "Tentar de novo") · vazio. E o mesmo
 * cuidado vale para a lista de CLIENTES, que é uma segunda consulta: se ela falhar,
 * a coluna "Cliente" NÃO pode dizer "—" (que se lê como "equipamento sem cliente") —
 * ela diz que não conseguiu carregar. Erro que vira vazio é o bug crônico da casa.
 */
import type { Equipamento, SituacaoEquipamento } from "@dominio";
import { STATUS_EQUIP_LABELS } from "@dominio";
import { AlertTriangle, Inbox, Pencil, Plus, QrCode, RotateCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { StatusBadge } from "@/olli/components/record-list-helpers";
import { useOlliList } from "@/olli/data";
import { useExcluir } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import { type LinhaAsset, linhaParaEquipamento, nomeEquipamento, rotuloCategoria, subEquipamento } from "./equipamento";
import FormEquipamento from "./FormEquipamento";

/** Chaves estáveis para os placeholders de carregamento (nunca o índice). */
const ESQUELETO = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"];

type LinhaCliente = { id: string; nome: string };

/** Como o nome do cliente aparece: resolvido, ainda carregando, ou irresolúvel. */
type Vinculo =
	| { tipo: "sem_cliente" }
	| { tipo: "carregando" }
	| { tipo: "resolvido"; nome: string }
	| { tipo: "nao_resolvido" };

function CelulaCliente({ vinculo }: { vinculo: Vinculo }) {
	switch (vinculo.tipo) {
		case "sem_cliente":
			return <span className="text-text-disabled">—</span>;
		case "carregando":
			return <Skeleton className="h-3.5 w-24" />;
		case "resolvido":
			return <span className="truncate text-text-primary">{vinculo.nome}</span>;
		default:
			// NÃO é "—": o equipamento TEM um cliente, nós é que não o temos à mão
			// (lista falhou, ou o cliente foi para a lixeira). Dizer "—" seria mentir.
			return (
				<span
					className="truncate text-warning"
					title="Este equipamento está vinculado a um cliente que não está na lista atual (pode estar na lixeira). O vínculo é preservado ao salvar."
				>
					Cliente indisponível
				</span>
			);
	}
}

/** Estado da etiqueta QR — é o adesivo que está colado no equipamento do cliente. */
function BadgeQr({ e }: { e: Equipamento }) {
	if (e.qrRevogadoEm) {
		return (
			<Badge variant="error" className="gap-1 font-medium">
				<QrCode className="size-3" />
				Revogada
			</Badge>
		);
	}
	if (!e.qrToken) {
		return (
			<Badge variant="secondary" className="gap-1 font-medium">
				<QrCode className="size-3" />
				Sem etiqueta
			</Badge>
		);
	}
	return (
		<Badge variant="success" className="gap-1 font-medium">
			<QrCode className="size-3" />
			Ativa
		</Badge>
	);
}

export default function EquipamentosPage() {
	const { data, isLoading, isError, error, refetch } = useOlliList<LinhaAsset>("assets", {
		orderBy: "criado_em",
	});
	// Mesmas opções que o SeletorCliente usa → mesma chave de cache, sem 2ª requisição.
	const clientesQuery = useOlliList<LinhaCliente>("clientes", { orderBy: "nome", ascending: true });

	const [busca, setBusca] = useState("");
	const [filtroSituacao, setFiltroSituacao] = useState<SituacaoEquipamento | "todas">("todas");

	const [formAberto, setFormAberto] = useState(false);
	const [emEdicao, setEmEdicao] = useState<Equipamento | null>(null);
	const [aExcluir, setAExcluir] = useState<Equipamento | null>(null);

	const excluir = useExcluir("equipamentos");

	/* ── Dados ───────────────────────────────────────────────────────────────── */
	const equipamentos = useMemo(() => (data ?? []).map(linhaParaEquipamento), [data]);

	const nomesPorCliente = useMemo(() => {
		const m = new Map<string, string>();
		for (const c of clientesQuery.data ?? []) m.set(c.id, c.nome);
		return m;
	}, [clientesQuery.data]);

	const vinculoDe = (e: Equipamento): Vinculo => {
		if (!e.clienteId) return { tipo: "sem_cliente" };
		const nome = nomesPorCliente.get(e.clienteId);
		if (nome) return { tipo: "resolvido", nome };
		if (clientesQuery.isLoading) return { tipo: "carregando" };
		return { tipo: "nao_resolvido" };
	};

	/** Quantos por situação — alimenta os chips (e mostra que o filtro não mente). */
	const contagem = useMemo(() => {
		const m = new Map<string, number>();
		for (const e of equipamentos) m.set(e.situacao, (m.get(e.situacao) ?? 0) + 1);
		return m;
	}, [equipamentos]);

	const situacoesPresentes = useMemo(
		() => (Object.keys(STATUS_EQUIP_LABELS) as SituacaoEquipamento[]).filter((s) => (contagem.get(s) ?? 0) > 0),
		[contagem],
	);

	const linhas = useMemo(() => {
		const termo = busca.trim().toLowerCase();
		return equipamentos.filter((e) => {
			if (filtroSituacao !== "todas" && e.situacao !== filtroSituacao) return false;
			if (!termo) return true;
			const alvo = [
				e.fabricante,
				e.modelo,
				e.numeroSerie,
				e.patrimonio,
				e.codigoInterno,
				e.localizacao,
				e.tensao,
				e.refrigerante,
				rotuloCategoria(e.categoria),
				e.clienteId ? nomesPorCliente.get(e.clienteId) : "",
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return alvo.includes(termo);
		});
	}, [equipamentos, busca, filtroSituacao, nomesPorCliente]);

	/* ── Ações ───────────────────────────────────────────────────────────────── */
	const abrirNovo = () => {
		setEmEdicao(null);
		setFormAberto(true);
	};
	const abrirEdicao = (e: Equipamento) => {
		setEmEdicao(e);
		setFormAberto(true);
	};

	const confirmarExclusao = async () => {
		if (!aExcluir) return;
		try {
			await excluir.mutateAsync(aExcluir);
			setAExcluir(null);
		} catch {
			// O erro fica VISÍVEL no diálogo (via `excluir.isError`) — não fecha nada.
		}
	};

	const temFiltro = !!busca.trim() || filtroSituacao !== "todas";

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* ── Cabeçalho ── */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						{/* mdi:air-conditioner — o MESMO glifo que o app do celular usa para
						    equipamento HVAC (CATEGORIAS_HVAC, MaterialCommunityIcons). */}
						<Icon icon="mdi:air-conditioner" size="26" className="text-primary" />
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">Equipamentos</h1>
						{!isLoading && !isError && (
							<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
								{linhas.length}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-sm text-text-secondary">
						Inventário de equipamentos dos seus clientes — a base do PMOC.
					</p>
				</div>

				<div className="flex w-full gap-2 sm:w-auto">
					<div className="relative flex-1 sm:w-64 sm:flex-none">
						<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
						<Input
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar equipamento…"
							className="h-10 rounded-full pl-10"
						/>
					</div>
					<Button type="button" onClick={abrirNovo} className="h-10 shrink-0 gap-2 rounded-full px-4">
						<Plus className="size-4" />
						<span className="hidden sm:inline">Novo equipamento</span>
						<span className="sm:hidden">Novo</span>
					</Button>
				</div>
			</div>

			{/* ── Filtro por situação (só as situações que existem de fato) ── */}
			{!isLoading && !isError && situacoesPresentes.length > 1 && (
				<div className="mb-4 flex flex-wrap gap-2">
					<ChipSituacao
						ativo={filtroSituacao === "todas"}
						aoClicar={() => setFiltroSituacao("todas")}
						rotulo="Todas"
						quantidade={equipamentos.length}
					/>
					{situacoesPresentes.map((s) => (
						<ChipSituacao
							key={s}
							ativo={filtroSituacao === s}
							aoClicar={() => setFiltroSituacao(s)}
							rotulo={STATUS_EQUIP_LABELS[s]}
							quantidade={contagem.get(s) ?? 0}
						/>
					))}
				</div>
			)}

			{/* ── 3 estados ── */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					<div className="divide-y divide-border/60">
						{ESQUELETO.map((k) => (
							<div key={k} className="flex items-center gap-4 px-4 py-4">
								<Skeleton className="size-9 shrink-0 rounded-lg" />
								<Skeleton className="h-3.5 w-1/4" />
								<Skeleton className="h-3.5 w-1/6" />
								<Skeleton className="ml-auto h-6 w-20 rounded-full" />
							</div>
						))}
					</div>
				</Card>
			) : isError ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
						<AlertTriangle className="size-7 text-error" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar os equipamentos</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."}
						</p>
					</div>
					<Button type="button" variant="outline" onClick={() => refetch()} className="gap-2 rounded-full">
						<RotateCw className="size-4" />
						Tentar de novo
					</Button>
				</Card>
			) : linhas.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						<Inbox className="size-7 text-text-disabled" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{temFiltro ? "Nenhum equipamento encontrado" : "Nenhum equipamento cadastrado"}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{temFiltro
								? "Tente outro termo ou limpe o filtro de situação."
								: "Cadastre o primeiro equipamento do seu cliente — ele ganha uma etiqueta QR automaticamente."}
						</p>
					</div>
					{!temFiltro && (
						<Button type="button" onClick={abrirNovo} className="gap-2 rounded-full">
							<Plus className="size-4" />
							Novo equipamento
						</Button>
					)}
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{/* DESKTOP */}
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
									<th className="px-4 py-3 font-semibold">Equipamento</th>
									<th className="px-4 py-3 font-semibold">Cliente</th>
									<th className="px-4 py-3 font-semibold">Localização</th>
									<th className="px-4 py-3 font-semibold">Situação</th>
									<th className="px-4 py-3 font-semibold">Etiqueta</th>
									<th className="px-4 py-3 text-right font-semibold">Ações</th>
								</tr>
							</thead>
							<tbody>
								{linhas.map((e) => (
									<tr
										key={e.id}
										className="border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40"
									>
										<td className="px-4 py-3.5">
											<div className="flex min-w-0 items-center gap-3">
												<div
													aria-hidden="true"
													className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"
												>
													<Icon icon="mdi:air-conditioner" size="18" className="text-primary" />
												</div>
												<div className="min-w-0">
													<p className="truncate font-medium text-text-primary">{nomeEquipamento(e)}</p>
													<p className="truncate text-xs text-text-secondary">
														{subEquipamento(e) || e.numeroSerie || e.codigoInterno || "—"}
													</p>
												</div>
											</div>
										</td>
										<td className="max-w-40 px-4 py-3.5">
											<CelulaCliente vinculo={vinculoDe(e)} />
										</td>
										<td className="max-w-40 px-4 py-3.5">
											{e.localizacao ? (
												<span className="truncate text-text-secondary">{e.localizacao}</span>
											) : (
												<span className="text-text-disabled">—</span>
											)}
										</td>
										<td className="whitespace-nowrap px-4 py-3.5">
											<StatusBadge value={STATUS_EQUIP_LABELS[e.situacao]} />
										</td>
										<td className="whitespace-nowrap px-4 py-3.5">
											<BadgeQr e={e} />
										</td>
										<td className="whitespace-nowrap px-4 py-3.5 text-right">
											<AcoesLinha e={e} aoEditar={abrirEdicao} aoExcluir={setAExcluir} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* MOBILE */}
					<div className="divide-y divide-border/60 md:hidden">
						{linhas.map((e) => (
							<div key={e.id} className="p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-center gap-3">
										<div
											aria-hidden="true"
											className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"
										>
											<Icon icon="mdi:air-conditioner" size="18" className="text-primary" />
										</div>
										<div className="min-w-0">
											<p className="truncate font-medium text-text-primary">{nomeEquipamento(e)}</p>
											<p className="truncate text-xs text-text-secondary">{subEquipamento(e) || "—"}</p>
										</div>
									</div>
									<StatusBadge value={STATUS_EQUIP_LABELS[e.situacao]} className="shrink-0" />
								</div>

								<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Cliente</dt>
										<dd className="mt-0.5 flex truncate text-sm">
											<CelulaCliente vinculo={vinculoDe(e)} />
										</dd>
									</div>
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Localização</dt>
										<dd className="mt-0.5 truncate text-sm text-text-primary">{e.localizacao || "—"}</dd>
									</div>
								</dl>

								<div className="mt-3 flex items-center justify-between gap-2">
									<BadgeQr e={e} />
									<AcoesLinha e={e} aoEditar={abrirEdicao} aoExcluir={setAExcluir} />
								</div>
							</div>
						))}
					</div>

					<div className="border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						{linhas.length} equipamento{linhas.length === 1 ? "" : "s"}
						{temFiltro && ` de ${equipamentos.length}`}
					</div>
				</Card>
			)}

			<FormEquipamento aberto={formAberto} aoFechar={() => setFormAberto(false)} equipamento={emEdicao} />

			<ConfirmarExclusao
				aberto={!!aExcluir}
				aoFechar={() => {
					setAExcluir(null);
					excluir.reset();
				}}
				aoConfirmar={confirmarExclusao}
				nome={aExcluir ? nomeEquipamento(aExcluir) : ""}
				tipo="equipamento"
				aviso={
					aExcluir?.qrToken
						? "A etiqueta QR colada neste equipamento para de funcionar enquanto ele estiver na lixeira."
						: undefined
				}
				excluindo={excluir.isPending}
				erro={excluir.isError ? ((excluir.error as Error)?.message ?? "Não consegui excluir agora.") : null}
			/>
		</div>
	);
}

/* ──────────────────────────────  Peças da tela  ────────────────────────────── */

function ChipSituacao({
	ativo,
	aoClicar,
	rotulo,
	quantidade,
}: {
	ativo: boolean;
	aoClicar: () => void;
	rotulo: string;
	quantidade: number;
}) {
	return (
		<button
			type="button"
			onClick={aoClicar}
			aria-pressed={ativo}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
				ativo
					? "border-primary bg-primary text-white"
					: "border-border bg-transparent text-text-secondary hover:bg-bg-neutral",
			)}
		>
			{rotulo}
			<span className={cn("tabular-nums", ativo ? "text-white/75" : "text-text-disabled")}>{quantidade}</span>
		</button>
	);
}

/** Editar / Excluir. Botões de verdade: alcançáveis por Tab, com nome acessível. */
function AcoesLinha({
	e,
	aoEditar,
	aoExcluir,
}: {
	e: Equipamento;
	aoEditar: (e: Equipamento) => void;
	aoExcluir: (e: Equipamento) => void;
}) {
	const nome = nomeEquipamento(e);
	return (
		<div className="inline-flex items-center gap-1">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-8"
				onClick={() => aoEditar(e)}
				aria-label={`Editar ${nome}`}
				title="Editar"
			>
				<Pencil className="size-4" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-8 text-text-secondary hover:text-error"
				onClick={() => aoExcluir(e)}
				aria-label={`Excluir ${nome}`}
				title="Excluir"
			>
				<Trash2 className="size-4" />
			</Button>
		</div>
	);
}
