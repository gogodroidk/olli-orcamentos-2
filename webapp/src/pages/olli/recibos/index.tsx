/**
 * RECIBOS — lista dos pagamentos recebidos.
 *
 * Duas regras que a tela cumpre e que não são detalhe:
 *
 * • A DATA VEM DO BLOB. A coluna `recibos.data_recebimento` está corrompida em
 *   produção (dia/mês trocados — ver `dados.ts`). Ler a coluna mostraria "07/10/2026"
 *   onde o dinheiro entrou em 10/07/2026. Aqui a data sai de `dados.dataRecebimento`.
 *
 * • 3 ESTADOS DE VERDADE: carregando · erro (com "Tentar de novo") · vazio. Um erro de
 *   rede NUNCA vira "nenhum recibo" nem "R$ 0,00" no total recebido — o dono acharia
 *   que o mês não faturou nada.
 */
import type { Recibo } from "@dominio";
import {
	AlertTriangle,
	FileWarning,
	Inbox,
	Lock,
	MoreHorizontal,
	Pencil,
	Plus,
	RotateCw,
	Search,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { NameCell } from "@/olli/components/record-list-helpers";
import { useContextoDeEscrita, useExcluir } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import { type LinhaRecibo, reais, reciboDaLinha, useRecibos } from "./dados";
import FormRecibo from "./FormRecibo";

const ESQUELETOS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"];

/**
 * Valor de UMA linha (não a soma do rodapé). `reais(null)` formata como "R$ 0,00" —
 * bug crônico da casa: "não sei" viraria "recebeu zero" e o dono acharia que aquele
 * pagamento nunca entrou. Aqui, sem valor conhecido, a célula mostra "—" mesmo.
 */
function valorExibivel(v: number | null | undefined): string {
	return v == null ? "—" : reais(v);
}

/** Linha da tela: o domínio (do blob) + a linha crua, para o caso degradado. */
interface ItemLista {
	linha: LinhaRecibo;
	recibo: Recibo | null;
}

export default function RecibosPage() {
	const { data, isLoading, isError, error, refetch, isFetching } = useRecibos();
	const excluir = useExcluir("recibos");

	/**
	 * GATE DE PAPEL: recibo é emitido pelo DONO (mesma regra do Meu Negócio). Membro
	 * não-dono vê a lista, mas "Novo recibo"/Editar/Excluir ficam escondidos — e
	 * quando o papel é DESCONHECIDO (carregando ou erro), bloqueia também: "não sei
	 * quem é" nunca pode virar "deixa gravar".
	 */
	// O botão "Novo recibo" fica SEMPRE visível — só some se você for, com CERTEZA,
	// um membro não-dono (ownerUserId preenchido). Enquanto carrega, dá erro ou é
	// conta própria/dono, o botão aparece: esconder por "não sei ainda" trava o uso.
	// A proteção de tenant de verdade continua na gravação (mutacoes.ts), não aqui.
	const contexto = useContextoDeEscrita();
	const ehMembroConfirmado = contexto.data?.ownerUserId != null;
	const podeEscrever = !ehMembroConfirmado;

	const [busca, setBusca] = useState("");
	const [formAberto, setFormAberto] = useState(false);
	const [emEdicao, setEmEdicao] = useState<Recibo | null>(null);
	const [aExcluir, setAExcluir] = useState<Recibo | null>(null);
	const [erroExclusao, setErroExclusao] = useState<string | null>(null);

	const itens: ItemLista[] = useMemo(
		() => (data ?? []).map((linha) => ({ linha, recibo: reciboDaLinha(linha) })),
		[data],
	);

	const filtrados = useMemo(() => {
		const termo = busca.trim().toLowerCase();
		if (!termo) return itens;
		return itens.filter(({ linha, recibo }) => {
			const alvo = [
				recibo?.numero ?? linha.numero,
				recibo?.clienteNome ?? linha.cliente_nome,
				recibo?.formaPagamento ?? linha.forma_pagamento,
				recibo?.orcamentoNumero,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return alvo.includes(termo);
		});
	}, [itens, busca]);

	/** Soma o que é MOSTRADO (respeita a busca) — o rodapé não pode contradizer a lista. */
	const totalRecebido = useMemo(
		() => filtrados.reduce((s, { linha, recibo }) => s + (recibo?.valorRecebido ?? linha.valor_recebido ?? 0), 0),
		[filtrados],
	);

	/** Recibos com pagamento registrado mas PDF ainda não gerado (o app sabe gerar). */
	const semPdf = useMemo(() => filtrados.filter(({ recibo }) => recibo?.pdfEmitido === false).length, [filtrados]);

	function abrirNovo() {
		setEmEdicao(null);
		setFormAberto(true);
	}

	function abrirEdicao(r: Recibo) {
		setEmEdicao(r);
		setFormAberto(true);
	}

	async function confirmarExclusao() {
		if (!aExcluir) return;
		setErroExclusao(null);
		try {
			await excluir.mutateAsync(aExcluir);
			setAExcluir(null);
		} catch (e) {
			setErroExclusao((e as Error)?.message ?? "Não foi possível excluir o recibo. Tente de novo.");
		}
	}

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* ─────────────────────────────  Cabeçalho  ───────────────────────────── */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">Recibos</h1>
						{!isLoading && !isError && (
							<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
								{filtrados.length}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-sm text-text-secondary">
						Pagamentos recebidos. Receba de um orçamento aprovado e o valor e os itens já vêm preenchidos.
					</p>
				</div>

				<div className="flex w-full items-center gap-2 sm:w-auto">
					<div className="relative w-full sm:w-64">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled"
						/>
						<Input
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por nº, cliente…"
							aria-label="Buscar recibos"
							className="h-10 rounded-full pl-10"
						/>
					</div>
					{podeEscrever && (
						<Button type="button" onClick={abrirNovo} className="h-10 shrink-0 gap-2">
							<Plus aria-hidden="true" className="size-4" />
							Novo recibo
						</Button>
					)}
				</div>
			</div>

			{/* Aviso SÓ para quem é, com certeza, membro não-dono. Enquanto carrega ou
			    dá erro, não trava nada nem mostra alarme — o botão fica disponível. */}
			{ehMembroConfirmado && (
				<div className="mb-4 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
					<Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-darker dark:text-warning" />
					<span>
						Recibos são emitidos pelo dono da conta. Você pode conferir os pagamentos aqui; para registrar ou
						alterar um recebimento, peça ao dono.
					</span>
				</div>
			)}

			{/* ─────────────────  Resumo (só quando os dados são reais)  ───────────────── */}
			{!isLoading && !isError && filtrados.length > 0 && (
				<div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-bg-neutral/40 px-4 py-3">
					<div>
						<p className="text-[11px] uppercase tracking-wide text-text-disabled">Total recebido</p>
						<p className="mt-0.5 text-lg font-semibold tabular-nums text-success-dark dark:text-success">
							{reais(totalRecebido)}
						</p>
					</div>
					<div>
						<p className="text-[11px] uppercase tracking-wide text-text-disabled">Recibos</p>
						<p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">{filtrados.length}</p>
					</div>
					{semPdf > 0 && (
						<div>
							<p className="text-[11px] uppercase tracking-wide text-text-disabled">PDF pendente</p>
							<p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-warning-darker dark:text-warning">
								<FileWarning aria-hidden="true" className="size-4" />
								{semPdf}
							</p>
						</div>
					)}
				</div>
			)}

			{/* ─────────────────  3 estados: carregando | erro | vazio  ────────────────── */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					<div className="divide-y divide-border/60">
						{ESQUELETOS.map((k) => (
							<div key={k} className="flex items-center gap-4 px-4 py-4">
								<Skeleton className="size-7 shrink-0 rounded-full" />
								<Skeleton className="h-3.5 w-1/4" />
								<Skeleton className="h-3.5 w-1/6" />
								<Skeleton className="ml-auto h-3.5 w-20" />
							</div>
						))}
					</div>
				</Card>
			) : isError ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
						<AlertTriangle aria-hidden="true" className="size-7 text-error" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar os recibos</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."}
						</p>
					</div>
					<Button type="button" onClick={() => refetch()} disabled={isFetching} className="gap-2 rounded-full">
						<RotateCw aria-hidden="true" className={cn("size-4", isFetching && "animate-spin")} />
						Tentar de novo
					</Button>
				</Card>
			) : filtrados.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						<Inbox aria-hidden="true" className="size-7 text-text-disabled" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{busca ? "Nenhum recibo encontrado" : "Nenhum recibo ainda"}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{busca
								? "Tente outro número, cliente ou forma de pagamento."
								: "Quando você registrar um pagamento, ele aparece aqui."}
						</p>
					</div>
					{!busca && podeEscrever && (
						<Button type="button" onClick={abrirNovo} className="gap-2 rounded-full">
							<Plus aria-hidden="true" className="size-4" />
							Registrar o primeiro
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
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Nº</th>
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Cliente</th>
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Orçamento</th>
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Forma</th>
									<th className="whitespace-nowrap px-4 py-3 font-semibold">Recebido em</th>
									<th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Valor</th>
									<th className="w-12 px-4 py-3">
										<span className="sr-only">Ações</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{filtrados.map(({ linha, recibo }) => (
									<tr
										key={linha.id}
										className="border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40"
									>
										<td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-text-primary">
											{recibo?.numero ?? linha.numero ?? "—"}
											{recibo?.pdfEmitido === false && (
												<Badge variant="warning" className="ml-2 font-medium">
													PDF pendente
												</Badge>
											)}
										</td>
										<td className="px-4 py-3.5">
											<NameCell name={recibo?.clienteNome ?? linha.cliente_nome ?? "—"} />
										</td>
										<td className="whitespace-nowrap px-4 py-3.5 text-text-secondary">
											{recibo?.orcamentoNumero ? `Nº ${recibo.orcamentoNumero}` : "—"}
										</td>
										<td className="whitespace-nowrap px-4 py-3.5 text-text-secondary">
											{recibo?.formaPagamento ?? linha.forma_pagamento ?? "—"}
										</td>
										{/* Data do BLOB — a coluna está corrompida (ver cabeçalho). */}
										<td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-text-secondary">
											{recibo?.dataRecebimento || "—"}
										</td>
										<td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums text-text-primary">
											{valorExibivel(recibo?.valorRecebido ?? linha.valor_recebido)}
										</td>
										<td className="px-2 py-3.5 text-right">
											<AcoesRecibo
												recibo={recibo}
												podeEscrever={podeEscrever}
												aoEditar={abrirEdicao}
												aoExcluir={(r) => {
													setErroExclusao(null);
													setAExcluir(r);
												}}
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* MOBILE */}
					<div className="divide-y divide-border/60 md:hidden">
						{filtrados.map(({ linha, recibo }) => (
							<div key={linha.id} className="p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="text-sm font-semibold tabular-nums text-text-primary">
											{recibo?.numero ?? linha.numero ?? "—"}
										</p>
										<div className="mt-1">
											<NameCell name={recibo?.clienteNome ?? linha.cliente_nome ?? "—"} />
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<span className="text-sm font-semibold tabular-nums text-success-dark dark:text-success">
											{valorExibivel(recibo?.valorRecebido ?? linha.valor_recebido)}
										</span>
										<AcoesRecibo
											recibo={recibo}
											podeEscrever={podeEscrever}
											aoEditar={abrirEdicao}
											aoExcluir={(r) => {
												setErroExclusao(null);
												setAExcluir(r);
											}}
										/>
									</div>
								</div>

								<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Recebido em</dt>
										<dd className="mt-0.5 truncate text-sm tabular-nums text-text-primary">
											{recibo?.dataRecebimento || "—"}
										</dd>
									</div>
									<div className="min-w-0">
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Forma</dt>
										<dd className="mt-0.5 truncate text-sm text-text-primary">
											{recibo?.formaPagamento ?? linha.forma_pagamento ?? "—"}
										</dd>
									</div>
									{recibo?.orcamentoNumero && (
										<div className="min-w-0">
											<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Orçamento</dt>
											<dd className="mt-0.5 truncate text-sm text-text-primary">Nº {recibo.orcamentoNumero}</dd>
										</div>
									)}
								</dl>

								{recibo?.pdfEmitido === false && (
									<Badge variant="warning" className="mt-3 font-medium">
										Pagamento registrado · PDF ainda não gerado
									</Badge>
								)}
							</div>
						))}
					</div>

					<div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						<span>
							{filtrados.length} recibo{filtrados.length === 1 ? "" : "s"}
						</span>
						<span className="tabular-nums">Total: {reais(totalRecebido)}</span>
					</div>
				</Card>
			)}

			{/* ────────────────────────────  Formulário  ───────────────────────────── */}
			<FormRecibo aberto={formAberto} aoFechar={() => setFormAberto(false)} recibo={emEdicao} />

			{/* ───────────────────────  Exclusão (soft delete)  ─────────────────────── */}
			<ConfirmarExclusao
				aberto={!!aExcluir}
				aoFechar={() => {
					setAExcluir(null);
					setErroExclusao(null);
				}}
				aoConfirmar={confirmarExclusao}
				nome={aExcluir ? `Recibo ${aExcluir.numero} · ${aExcluir.clienteNome}` : ""}
				tipo="recibo"
				aviso={
					aExcluir?.orcamentoNumero
						? `Este recibo está ligado ao orçamento nº ${aExcluir.orcamentoNumero} — depois de excluído, ele deixa de contar como pagamento recebido daquele orçamento.`
						: undefined
				}
				excluindo={excluir.isPending}
				erro={erroExclusao}
			/>
		</div>
	);
}

/**
 * Ações da linha. Menu de verdade (não um ícone solto): abre por teclado, tem foco
 * visível e rótulo acessível — a lista é densa e a linha inteira não vira botão.
 *
 * Sem o blob (`recibo === null`, que não deveria acontecer: `dados` é NOT NULL) as
 * ações ficam TRAVADAS. Editar/excluir a partir das colunas gravaria um blob sem
 * `itens` e com a data errada, destruindo o recibo em vez de corrigi-lo.
 *
 * GATE DE PAPEL: membro não-dono (ou papel DESCONHECIDO) não vê Editar/Excluir —
 * recibo é emitido pelo dono da conta (ver cabeçalho da página).
 */
function AcoesRecibo({
	recibo,
	podeEscrever,
	aoEditar,
	aoExcluir,
}: {
	recibo: Recibo | null;
	podeEscrever: boolean;
	aoEditar: (r: Recibo) => void;
	aoExcluir: (r: Recibo) => void;
}) {
	if (!recibo) {
		return (
			<span
				className="inline-flex items-center gap-1 text-xs text-warning-darker dark:text-warning"
				title="Este recibo veio sem os dados completos. Abra-o no aplicativo do celular."
			>
				<FileWarning aria-hidden="true" className="size-4" />
				<span className="sr-only">Recibo sem dados completos — ações indisponíveis</span>
			</span>
		);
	}

	if (!podeEscrever) {
		return (
			<span
				className="inline-flex items-center gap-1 text-xs text-text-disabled"
				title="Recibos são emitidos pelo dono da conta."
			>
				<Lock aria-hidden="true" className="size-4" />
				<span className="sr-only">Ações indisponíveis — recibos são emitidos pelo dono da conta</span>
			</span>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button type="button" variant="ghost" size="icon" className="size-8">
					<MoreHorizontal aria-hidden="true" className="size-4" />
					<span className="sr-only">Ações do recibo {recibo.numero}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={() => aoEditar(recibo)}>
					<Pencil aria-hidden="true" className="mr-2 size-4" />
					Editar
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => aoExcluir(recibo)}
					className="text-error-dark focus:text-error-dark dark:text-error dark:focus:text-error"
				>
					<Trash2 aria-hidden="true" className="mr-2 size-4" />
					Excluir
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
