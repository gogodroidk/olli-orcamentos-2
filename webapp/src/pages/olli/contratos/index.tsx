/**
 * CONTRATOS RECORRENTES — a resposta à sazonalidade, no painel.
 *
 * Topo: "R$ X/mês em contratos" (a receita recorrente em vigor, mesma conta do
 * celular — `resumirContratos`). Cada contrato mostra as próximas visitas, o técnico,
 * o valor e "Cobrar" (WhatsApp com o Pix do PRÓPRIO prestador; o OLLI não intermedeia).
 *
 * Quatro estados, nunca colapsados: carregando · erro (com "Tentar de novo") ·
 * desligado (servidor sem o recurso — diz que está desligado, não finge) · valor.
 * Papel: contrato é dinheiro → técnico não vê esta tela (e a RLS não deixa ele gravar).
 * Plano: PMOC/contratos são do Empresa (`pmoc_contratos`, 01/10/2026) — 3 estados em
 * `@/olli/recursoPlano` (carregando · não confirmado · "Disponível no Empresa").
 */
import type { ContratoRecorrente, Empresa, SituacaoContrato } from "@dominio";
import {
	AlertTriangle,
	CalendarClock,
	CalendarPlus,
	Copy,
	FileSignature,
	Loader2,
	Pencil,
	PlugZap,
	Plus,
	RotateCw,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatarMoeda } from "@/olli/components/campos";
import { novoId } from "@/olli/contrato";
import { useMinhaEmpresa, useOlliList } from "@/olli/data";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { CartaoRecursoPlanoPainel, useRecursoPlanoPainel } from "@/olli/recursoPlano";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { avisoPix } from "../../../../../src/utils/cobrancaCliente";
import {
	copiarContrato,
	diaBR,
	FILTROS_LISTA_CONTRATO,
	type FiltroListaContrato,
	filtrarListaContratos,
	fraseProrrogarContrato,
	fraseReceitaMensal,
	hojeNoBrasil,
	MODO_COBRANCA_LABEL,
	ordenarListaContratos,
	prepararCobrancaContrato,
	prorrogarFim,
	proximasVisitas,
	resumirContratos,
	rotuloFimContrato,
	rotuloPeriodicidade,
	SITUACAO_CONTRATO_LABEL,
	situacaoEfetiva,
} from "../../../../../src/utils/contratoRecorrente";
import { resumoDaGeracao } from "../../../../../src/utils/contratoRecorrenteGeracao";
import { numeroWhatsapp } from "../inicio/financeiro";
import FormContrato from "./FormContrato";
import { useContratos, useExcluirContrato, useGerarVisitas, useSalvarContrato } from "./useContratos";

const VARIANTE: Record<SituacaoContrato, "success" | "warning" | "info" | "error"> = {
	vigente: "success",
	suspenso: "warning",
	rascunho: "info",
	encerrado: "info",
	cancelado: "error",
};

export default function ContratosPage() {
	const ctx = useContextoDeEscrita();
	const recursoPlano = useRecursoPlanoPainel("pmoc_contratos");
	const leitura = useContratos();
	const empresaQ = useMinhaEmpresa();
	const clientesQ = useOlliList<{ id: string; telefone: string | null }>("clientes", { colunas: "id, telefone" });
	const gerar = useGerarVisitas();
	const excluir = useExcluirContrato();
	const prorrogarSalvar = useSalvarContrato();

	const [formAberto, setFormAberto] = useState(false);
	const [editando, setEditando] = useState<ContratoRecorrente | null>(null);
	const [criandoCopia, setCriandoCopia] = useState(false);
	const [excluindo, setExcluindo] = useState<ContratoRecorrente | null>(null);
	const [prorrogando, setProrrogando] = useState<ContratoRecorrente | null>(null);
	const [aviso, setAviso] = useState<string | null>(null);
	const [busca, setBusca] = useState("");
	const [filtro, setFiltro] = useState<FiltroListaContrato>("todos");

	const contratos = leitura.data?.status === "ok" ? leitura.data.contratos : [];
	const resumo = useMemo(() => resumirContratos(contratos), [contratos]);
	const hoje = hojeNoBrasil();
	const lista = useMemo(
		() => ordenarListaContratos(filtrarListaContratos(contratos, filtro, busca)),
		[contratos, filtro, busca],
	);
	const fimProrrogado = prorrogando ? prorrogarFim(prorrogando) : null;
	const empresa = (empresaQ.data?.dados as Empresa | undefined) ?? null;

	// Papel: fail-closed. Carregando → espera; erro → não mostra valores; técnico → fora.
	if (ctx.isLoading) {
		return (
			<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}
	if (ctx.isError || !ctx.data) {
		return (
			<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
				<Card className="flex flex-col items-center gap-3 p-10 text-center">
					<AlertTriangle className="size-8 text-error" aria-hidden="true" />
					<p className="font-semibold text-text-primary">Não consegui confirmar seu acesso</p>
					<Button variant="outline" onClick={() => ctx.refetch()}>
						Tentar de novo
					</Button>
				</Card>
			</div>
		);
	}
	if (ctx.data.papel === "tecnico") {
		return (
			<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
				<Card className="p-10 text-center text-sm text-text-secondary">
					Contratos ficam com o dono e a gestão da empresa. As visitas que eles geram aparecem na sua agenda.
				</Card>
			</div>
		);
	}

	// Plano depois do papel: o técnico já recebeu a frase dele acima; para quem
	// administra, o recurso é do Empresa (o tenant decide — gestor de empresa paga entra).
	if (recursoPlano.estado !== "liberado" && recursoPlano.estado !== "em_breve") {
		return <CartaoRecursoPlanoPainel recurso="pmoc_contratos" uso={recursoPlano} />;
	}

	function linkCobranca(c: ContratoRecorrente): { url: string | null; alerta: string | null } {
		const cobranca = prepararCobrancaContrato({ contrato: c, empresa });
		const tel = c.clienteId ? ((clientesQ.data ?? []).find((x) => x.id === c.clienteId)?.telefone ?? "") : "";
		const num = numeroWhatsapp(tel);
		const alertaPix =
			cobranca.situacaoPix === "sem_valor"
				? "Contrato sem valor: a mensagem vai sem Pix."
				: (avisoPix(cobranca.situacaoPix)?.titulo ?? null);
		// Sem telefone válido, abre o WhatsApp para escolher o contato (nunca um número torto).
		const url = `https://wa.me/${num ?? ""}?text=${encodeURIComponent(cobranca.texto)}`;
		return {
			url,
			alerta:
				[alertaPix, num ? null : "Cliente sem celular válido: escolha o contato no WhatsApp."]
					.filter(Boolean)
					.join(" ") || null,
		};
	}

	return (
		<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="flex items-center gap-2 text-xl font-bold text-text-primary md:text-2xl">
						<FileSignature className="size-5 text-primary" aria-hidden="true" />
						Contratos recorrentes
					</h1>
					<p className="mt-0.5 text-sm text-text-secondary">
						Feche a manutenção uma vez: as visitas entram na agenda ao salvar e sempre que você abre o OLLI.
					</p>
				</div>
				{leitura.data?.status === "ok" && (
					<Button
						className="gap-2"
						onClick={() => {
							setEditando(null);
							setCriandoCopia(false);
							setFormAberto(true);
						}}
					>
						<Plus className="size-4" aria-hidden="true" />
						Novo contrato
					</Button>
				)}
			</div>

			{leitura.isLoading && (
				<div className="space-y-3">
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-32 w-full" />
				</div>
			)}

			{(leitura.isError || leitura.data?.status === "erro") && (
				<Card className="flex flex-col items-center gap-3 p-10 text-center">
					<AlertTriangle className="size-8 text-error" aria-hidden="true" />
					<p className="font-semibold text-text-primary">Não foi possível carregar os contratos</p>
					<p className="text-sm text-text-secondary">
						{leitura.data?.status === "erro" ? leitura.data.mensagem : "Erro ao consultar os contratos."} Isto não quer
						dizer que você não tem contratos.
					</p>
					<Button variant="outline" className="gap-2" onClick={() => leitura.refetch()} disabled={leitura.isFetching}>
						<RotateCw className="size-4" aria-hidden="true" />
						Tentar de novo
					</Button>
				</Card>
			)}

			{leitura.data?.status === "desligado" && (
				<Card className="flex flex-col items-center gap-3 p-10 text-center">
					<PlugZap className="size-8 text-text-secondary" aria-hidden="true" />
					<p className="font-semibold text-text-primary">Recurso ainda desligado</p>
					<p className="max-w-md text-sm text-text-secondary">{leitura.data.mensagem}</p>
				</Card>
			)}

			{leitura.data?.status === "ok" && (
				<>
					<Card className="mb-4 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-2xl font-bold text-text-primary tabular-nums">{fraseReceitaMensal(resumo)}</p>
							<p className="text-sm text-text-secondary">
								{resumo.ativos} {resumo.ativos === 1 ? "contrato ativo" : "contratos ativos"}
								{resumo.terminandoEm30Dias ? (
									<>
										{" · "}
										<button
											type="button"
											className="font-semibold text-primary underline"
											onClick={() => setFiltro("terminando")}
										>
											{resumo.terminandoEm30Dias} terminando em 30 dias
										</button>
									</>
								) : null}
							</p>
						</div>
						<div className="flex flex-col items-start gap-1 sm:items-end">
							<Button
								variant="outline"
								className="gap-2"
								disabled={gerar.isPending}
								onClick={async () => {
									setAviso(null);
									try {
										const r = await gerar.mutateAsync();
										setAviso(resumoDaGeracao(r) || "Tudo em dia: as próximas visitas já estão na agenda.");
									} catch (e) {
										setAviso((e as Error)?.message || "Não consegui gerar as visitas agora.");
									}
								}}
							>
								{gerar.isPending ? (
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								) : (
									<CalendarClock className="size-4" aria-hidden="true" />
								)}
								Conferir visitas agora
							</Button>
							{aviso && <output className="text-sm text-text-secondary">{aviso}</output>}
						</div>
					</Card>

					{contratos.length > 0 && (
						<div className="mb-4 flex flex-col gap-3">
							<Input
								value={busca}
								onChange={(e) => setBusca(e.target.value)}
								placeholder="Buscar cliente, nome ou endereço"
								aria-label="Buscar contratos"
								autoCapitalize="none"
								autoCorrect="off"
							/>
							<fieldset className="flex min-w-0 flex-wrap gap-2 border-0 p-0" aria-label="Filtrar contratos">
								{FILTROS_LISTA_CONTRATO.map((f) => (
									<Button
										key={f.id}
										type="button"
										size="sm"
										variant={filtro === f.id ? "default" : "outline"}
										aria-pressed={filtro === f.id}
										onClick={() => setFiltro(f.id)}
									>
										{f.label}
									</Button>
								))}
							</fieldset>
						</div>
					)}

					{contratos.length === 0 ? (
						<Card className="flex flex-col items-center gap-3 p-10 text-center">
							<FileSignature className="size-8 text-text-secondary" aria-hidden="true" />
							<p className="font-semibold text-text-primary">Nenhum contrato ainda</p>
							<p className="max-w-md text-sm text-text-secondary">
								Cadastre a manutenção mensal do seu cliente (piscina, ar-condicionado, jardim, caixa d'água…). O OLLI
								gera cada visita na agenda e prepara a cobrança do mês.
							</p>
							<Button
								className="gap-2"
								onClick={() => {
									setEditando(null);
									setCriandoCopia(false);
									setFormAberto(true);
								}}
							>
								<Plus className="size-4" aria-hidden="true" />
								Criar primeiro contrato
							</Button>
						</Card>
					) : lista.length === 0 ? (
						<Card className="flex flex-col items-center gap-3 p-10 text-center">
							<p className="font-semibold text-text-primary">Nenhum contrato neste filtro</p>
							<p className="max-w-md text-sm text-text-secondary">
								{busca.trim()
									? "Nada combina com essa busca. Limpe o texto ou troque o filtro."
									: "Troque o filtro para ver os outros contratos."}
							</p>
							<Button
								variant="outline"
								onClick={() => {
									setFiltro("todos");
									setBusca("");
								}}
							>
								Ver todos
							</Button>
						</Card>
					) : (
						<div className="grid gap-3 md:grid-cols-2">
							{lista.map((c) => {
								const situacao = situacaoEfetiva(c, hoje);
								const proximas = proximasVisitas(c);
								const cobranca = linkCobranca(c);
								const fim = rotuloFimContrato(c);
								const podeProrrogar = prorrogarFim(c) !== null;
								return (
									<Card key={c.id} className="flex flex-col gap-3 p-4">
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate font-semibold text-text-primary">{c.titulo}</p>
												<p className="truncate text-sm text-text-secondary">{c.clienteNome || "Sem cliente"}</p>
											</div>
											<Badge variant={VARIANTE[situacao]}>{SITUACAO_CONTRATO_LABEL[situacao]}</Badge>
										</div>
										<p className="text-sm text-text-secondary">
											{rotuloPeriodicidade(c.periodicidade)} · R$ {formatarMoeda(c.valor)}{" "}
											{MODO_COBRANCA_LABEL[c.modoCobranca]} · {c.ativos.length}{" "}
											{c.ativos.length === 1 ? "ativo" : "ativos"}
											{c.responsavelNome ? ` · ${c.responsavelNome}` : ""}
										</p>
										<p className="flex items-center gap-2 text-sm font-medium text-text-primary">
											<CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
											{proximas.length
												? `Próximas: ${proximas.map(diaBR).join(" · ")}`
												: c.dataFim && c.dataFim < hoje
													? `Terminou em ${diaBR(c.dataFim)}`
													: "Sem visitas previstas"}
										</p>
										{fim && <p className="text-sm font-medium text-text-secondary">{fim}</p>}
										{cobranca.alerta && <p className="text-xs text-text-secondary">{cobranca.alerta}</p>}
										<div className="flex flex-wrap gap-2">
											<Button
												size="sm"
												variant="outline"
												className="gap-1"
												onClick={() => {
													setEditando(c);
													setCriandoCopia(false);
													setFormAberto(true);
												}}
											>
												<Pencil className="size-3.5" aria-hidden="true" />
												Editar
											</Button>
											<Button
												size="sm"
												variant="outline"
												className="gap-1"
												onClick={() => {
													setEditando(copiarContrato(c, new Date(), novoId));
													setCriandoCopia(true);
													setFormAberto(true);
												}}
											>
												<Copy className="size-3.5" aria-hidden="true" />
												Copiar
											</Button>
											{podeProrrogar && (
												<Button
													size="sm"
													variant="outline"
													className="gap-1"
													onClick={() => {
														prorrogarSalvar.reset();
														setProrrogando(c);
													}}
												>
													<CalendarPlus className="size-3.5" aria-hidden="true" />
													Prorrogar 12 meses
												</Button>
											)}
											{cobranca.url && (
												<Button size="sm" variant="outline" asChild>
													<a href={cobranca.url} target="_blank" rel="noopener noreferrer">
														Cobrar no WhatsApp
													</a>
												</Button>
											)}
											<Button
												size="sm"
												variant="ghost"
												className="gap-1 text-error-dark dark:text-error"
												onClick={() => setExcluindo(c)}
											>
												<Trash2 className="size-3.5" aria-hidden="true" />
												Excluir
											</Button>
										</div>
									</Card>
								);
							})}
						</div>
					)}
				</>
			)}

			<FormContrato
				aberto={formAberto}
				aoFechar={() => {
					setFormAberto(false);
					setCriandoCopia(false);
				}}
				contrato={editando}
				criando={criandoCopia}
				aoSalvar={setAviso}
			/>

			<Dialog
				open={!!prorrogando && !!fimProrrogado}
				onOpenChange={(v) => !v && !prorrogarSalvar.isPending && setProrrogando(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Prorrogar 12 meses</DialogTitle>
						<DialogDescription>
							{prorrogando?.dataFim && fimProrrogado?.dataFim
								? fraseProrrogarContrato(prorrogando.dataFim, fimProrrogado.dataFim)
								: "Não dá para prorrogar este contrato."}
						</DialogDescription>
					</DialogHeader>
					{prorrogarSalvar.isError && (
						<p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error">
							{(prorrogarSalvar.error as Error)?.message ?? "Não foi possível prorrogar."}
						</p>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setProrrogando(null)}
							disabled={prorrogarSalvar.isPending}
							autoFocus
						>
							Cancelar
						</Button>
						<Button
							disabled={prorrogarSalvar.isPending || !fimProrrogado}
							onClick={async () => {
								if (!fimProrrogado?.dataFim) return;
								try {
									const r = await prorrogarSalvar.mutateAsync(fimProrrogado);
									const gerado = r.geracao ? resumoDaGeracao(r.geracao) : null;
									setAviso(
										gerado
											? `${gerado} Fim no OLLI: ${diaBR(fimProrrogado.dataFim)}.`
											: `Fim atualizado para ${diaBR(fimProrrogado.dataFim)}. Não consegui gerar as visitas agora — tento de novo na próxima abertura.`,
									);
									setProrrogando(null);
								} catch {
									/* o erro aparece no próprio diálogo */
								}
							}}
						>
							{prorrogarSalvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
							Prorrogar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Diálogo próprio (e não o ConfirmarExclusao): aquele promete "restaurar da
			    lixeira", e contrato ainda não tem tela de lixeira — prometer seria mentir.
			    Para parar sem excluir, o caminho é "Editar → Pausado/Encerrado". */}
			<Dialog open={!!excluindo} onOpenChange={(v) => !v && !excluir.isPending && setExcluindo(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Excluir contrato?</DialogTitle>
						<DialogDescription>
							<strong className="font-medium text-text-primary">{excluindo?.titulo}</strong> para de gerar visitas e sai
							da lista. As visitas já geradas continuam na agenda. Se quiser só parar por um tempo, edite e marque como
							Pausado.
						</DialogDescription>
					</DialogHeader>
					{excluir.isError && (
						<p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error">
							{(excluir.error as Error)?.message ?? "Não foi possível excluir."}
						</p>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setExcluindo(null)} disabled={excluir.isPending} autoFocus>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							disabled={excluir.isPending}
							onClick={async () => {
								if (!excluindo) return;
								try {
									await excluir.mutateAsync(excluindo);
									setExcluindo(null);
								} catch {
									/* o erro aparece no próprio diálogo */
								}
							}}
						>
							{excluir.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
							Excluir contrato
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
