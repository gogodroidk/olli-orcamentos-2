/**
 * PREPARAR NOTA FISCAL — os dados da NFS-e de um recibo, prontos para copiar no
 * Emissor Nacional. A MESMA regra do app (`src/utils/notaServico.ts`): código por
 * ofício, descrição, município do ISS e checklist saem iguais nos dois lados.
 *
 * O OLLI NÃO EMITE A NOTA. Nenhum botão aqui diz "emitir": o prestador emite no
 * portal do governo com a conta gov.br dele e depois ANOTA o número aqui.
 *
 * Três estados em tudo que vem da rede (cliente, orçamento, empresa, nota guardada,
 * interesse): carregando · erro com "tentar de novo" · valor. Tabela ausente
 * (migration não aplicada) = "desligado", dito com todas as letras — nunca um
 * "ainda não guardada" inventado.
 */
import type { Cliente, Empresa, Orcamento, Recibo } from "@dominio";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Copy, ExternalLink, Info, RotateCw, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useMinhaEmpresa } from "@/olli/data";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";
import {
	AVISO_NAO_EMITE,
	CODIGOS_NACIONAIS,
	type CampoCopiavel,
	camposParaCopiar,
	checklistNota,
	type DadosNota,
	erroRecursoDesligado,
	formatarCodigoNacional,
	interpretarNotaSalva,
	LIMITE_DESCRICAO,
	type NotaSalva,
	normalizarCodigoNacional,
	OBRIGATORIEDADE_NFSE,
	prepararDadosNota,
	ROTULO_INTERESSE_NOTA_AUTOMATICA,
	sugerirCodigoServico,
	TEXTO_INTERESSE_NOTA_AUTOMATICA,
	TEXTO_INTERESSE_REGISTRADO,
	URL_EMISSOR_NACIONAL,
	validarNumeroNota,
} from "../../../../../src/utils/notaServico";

const COLUNAS = "id, status, numero_nota, emitida_em, atualizado_em, dados";

/** Erro que significa "a tabela não existe no servidor" — vira estado DESLIGADO. */
class RecursoDesligado extends Error {}

function falhou(error: { code?: string; message?: string }): never {
	if (erroRecursoDesligado(error)) throw new RecursoDesligado("desligado");
	throw new Error(error.message || "erro");
}

function notaOuErro(data: unknown): NotaSalva {
	const nota = interpretarNotaSalva(data);
	if (!nota) throw new Error("resposta_invalida");
	return nota;
}

interface Props {
	recibo: Recibo | null;
	aoFechar: () => void;
}

export default function PrepararNota({ recibo, aoFechar }: Props) {
	return (
		<Dialog open={!!recibo} onOpenChange={(v) => !v && aoFechar()}>
			<DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-3xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Preparar nota fiscal</DialogTitle>
					<DialogDescription>
						{recibo ? `Recibo ${recibo.numero} · ${recibo.clienteNome}` : "Dados para o Emissor Nacional"}
					</DialogDescription>
				</DialogHeader>
				{recibo && <Conteudo recibo={recibo} />}
			</DialogContent>
		</Dialog>
	);
}

function Conteudo({ recibo }: { recibo: Recibo }) {
	const qc = useQueryClient();
	const chaveNota = ["olli", "nota-preparada", recibo.id] as const;
	const chaveInteresse = ["olli", "nota-automatica-interesse"] as const;

	const empresaQ = useMinhaEmpresa();
	const clienteQ = useQuery({
		queryKey: ["olli", "cliente", recibo.clienteId],
		enabled: !!recibo.clienteId,
		queryFn: async () => {
			const { data, error } = await supabase.from("clientes").select("*").eq("id", recibo.clienteId).maybeSingle();
			if (error) throw error;
			return (data as Cliente | null) ?? null;
		},
	});
	const orcamentoQ = useQuery({
		queryKey: ["olli", "orcamento-dados", recibo.orcamentoId],
		enabled: !!recibo.orcamentoId,
		queryFn: async () => {
			const { data, error } = await supabase
				.from("orcamentos")
				.select("dados")
				.eq("id", recibo.orcamentoId)
				.maybeSingle();
			if (error) throw error;
			return ((data as { dados: Orcamento | null } | null)?.dados ?? null) as Orcamento | null;
		},
	});
	const notaQ = useQuery({
		queryKey: chaveNota,
		retry: (n, e) => !(e instanceof RecursoDesligado) && n < 1,
		queryFn: async (): Promise<NotaSalva | null> => {
			const { data, error } = await supabase
				.from("notas_preparadas")
				.select(COLUNAS)
				.eq("recibo_id", recibo.id)
				.maybeSingle();
			if (error) falhou(error);
			return data === null ? null : notaOuErro(data);
		},
	});
	const interesseQ = useQuery({
		queryKey: chaveInteresse,
		retry: (n, e) => !(e instanceof RecursoDesligado) && n < 1,
		queryFn: async () => {
			const { data, error } = await supabase.from("nota_automatica_interesse").select("user_id").maybeSingle();
			if (error) falhou(error);
			return data !== null;
		},
	});

	const [codigo, setCodigo] = useState<string | null>(null);
	const [outroCodigo, setOutroCodigo] = useState("");
	const [descricao, setDescricao] = useState<string | null>(null);
	const [numero, setNumero] = useState("");
	const [copiado, setCopiado] = useState<string | null>(null);

	// O que já foi escolhido e guardado volta para a tela.
	useEffect(() => {
		if (notaQ.data) {
			setCodigo(notaQ.data.dados.servico.codigo);
			setDescricao(notaQ.data.dados.servico.descricao);
		}
	}, [notaQ.data]);

	const carregandoOrigem =
		empresaQ.isLoading || (!!recibo.clienteId && clienteQ.isLoading) || (!!recibo.orcamentoId && orcamentoQ.isLoading);
	const erroOrigem = empresaQ.isError || clienteQ.isError || orcamentoQ.isError;

	const notaSalva = notaQ.data ?? null;
	const emitida = notaSalva?.status === "emitida";
	const empresa = (empresaQ.data?.dados as Empresa | undefined) ?? null;

	const dados: DadosNota | null = useMemo(() => {
		if (emitida && notaSalva) return notaSalva.dados;
		if (carregandoOrigem || erroOrigem) return null;
		return prepararDadosNota(
			{ recibo, empresa, cliente: clienteQ.data ?? null, orcamento: orcamentoQ.data ?? null },
			{ codigo, descricao },
		);
	}, [
		emitida,
		notaSalva,
		carregandoOrigem,
		erroOrigem,
		recibo,
		empresa,
		clienteQ.data,
		orcamentoQ.data,
		codigo,
		descricao,
	]);

	const sugestao = useMemo(() => sugerirCodigoServico(empresa?.verticais), [empresa]);
	const opcoesCodigo = useMemo(() => {
		const lista = sugestao ? [sugestao.principal, ...sugestao.alternativas] : Object.values(CODIGOS_NACIONAIS);
		const atual = dados?.servico.codigo;
		if (atual && CODIGOS_NACIONAIS[atual] && !lista.some((c) => c.codigo === atual))
			lista.push(CODIGOS_NACIONAIS[atual]);
		return lista;
	}, [sugestao, dados?.servico.codigo]);
	const campos = useMemo(() => (dados ? camposParaCopiar(dados) : []), [dados]);
	const checklist = useMemo(() => (dados ? checklistNota(dados) : []), [dados]);

	const guardar = useMutation({
		mutationFn: async (d: DadosNota) => {
			const { data, error } = await supabase
				.from("notas_preparadas")
				.upsert({ recibo_id: d.reciboId, dados: d }, { onConflict: "user_id,recibo_id" })
				.select(COLUNAS)
				.single();
			if (error) falhou(error);
			return notaOuErro(data);
		},
		onSuccess: (nota) => {
			qc.setQueryData(chaveNota, nota);
			toast.success("Nota preparada guardada. Ela ainda não foi emitida.");
		},
		onError: (e) =>
			toast.error(
				e instanceof RecursoDesligado
					? "Guardar a nota ainda está desligado no servidor."
					: "Não consegui guardar agora. Nada foi alterado.",
			),
	});

	const anotar = useMutation({
		mutationFn: async (vars: { id: string; numero: string | null }) => {
			const patch = vars.numero
				? { status: "emitida", numero_nota: vars.numero, emitida_em: new Date().toISOString() }
				: { status: "preparada", numero_nota: null, emitida_em: null };
			const { data, error } = await supabase
				.from("notas_preparadas")
				.update(patch)
				.eq("id", vars.id)
				.select(COLUNAS)
				.single();
			if (error) falhou(error);
			return notaOuErro(data);
		},
		onSuccess: (nota) => {
			qc.setQueryData(chaveNota, nota);
			setNumero("");
			toast.success(
				nota.status === "emitida" ? `Anotado: NFS-e nº ${nota.numero} emitida por você.` : "Voltou para preparada.",
			);
		},
		onError: () => toast.error("Não consegui anotar agora. Nada foi alterado."),
	});

	const registrarInteresse = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("nota_automatica_interesse").insert({ origem: "painel" });
			// Já registrado = o mesmo pedido: conta como sucesso.
			if (error && error.code !== "23505") falhou(error);
		},
		onSuccess: () => qc.setQueryData(chaveInteresse, true),
		onError: () => toast.error("Não consegui registrar seu interesse agora. Tente de novo."),
	});

	async function copiar(c: CampoCopiavel) {
		if (!c.valor) return;
		try {
			await navigator.clipboard.writeText(c.valor);
			setCopiado(c.id);
		} catch {
			toast.error("O navegador não deixou copiar. Selecione o texto e copie à mão.");
		}
	}

	const numeroValido = validarNumeroNota(numero);
	const outroValido = normalizarCodigoNacional(outroCodigo);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2.5 rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
				<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
				<div>
					<p className="font-medium text-text-primary">{AVISO_NAO_EMITE}</p>
					<p className="mt-1 text-xs text-text-secondary">{OBRIGATORIEDADE_NFSE}</p>
				</div>
			</div>

			{carregandoOrigem ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-1/2" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/3" />
				</div>
			) : erroOrigem ? (
				<div className="flex flex-wrap items-center gap-2">
					<p className="text-sm text-error">Não consegui ler os dados do cliente e da empresa agora.</p>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="gap-1.5"
						onClick={() => {
							void empresaQ.refetch();
							void clienteQ.refetch();
							void orcamentoQ.refetch();
						}}
					>
						<RotateCw className="size-3.5" />
						Tentar de novo
					</Button>
				</div>
			) : dados ? (
				<>
					{/* Situação: carregando | erro | desligado | valor */}
					<section aria-labelledby="nota-situacao" className="rounded-lg border border-border px-3 py-2.5">
						<h3 id="nota-situacao" className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
							Situação
						</h3>
						{notaQ.isLoading ? (
							<Skeleton className="mt-2 h-4 w-64" />
						) : notaQ.error instanceof RecursoDesligado ? (
							<p className="mt-1 text-sm text-text-secondary">
								Guardar a nota preparada ainda está desligado no servidor. Os campos para copiar funcionam normalmente.
							</p>
						) : notaQ.isError ? (
							<div className="mt-1 flex flex-wrap items-center gap-2">
								<p className="text-sm text-error">Não consegui ver se esta nota já foi guardada.</p>
								<Button type="button" size="sm" variant="outline" onClick={() => notaQ.refetch()} className="gap-1.5">
									<RotateCw className="size-3.5" />
									Tentar de novo
								</Button>
							</div>
						) : !notaSalva ? (
							<p className="mt-1 text-sm text-text-primary">
								Ainda não guardada. Os dados abaixo foram montados a partir do recibo.
							</p>
						) : emitida ? (
							<p className="mt-1 text-sm font-medium text-success-dark dark:text-success">
								Emitida por você · NFS-e nº {notaSalva.numero}
							</p>
						) : (
							<p className="mt-1 text-sm text-text-primary">Preparada. Ainda não emitida.</p>
						)}
					</section>

					{/* Código do serviço */}
					{!emitida && (
						<section aria-labelledby="nota-codigo" className="flex flex-col gap-2">
							<h3 id="nota-codigo" className="text-sm font-semibold text-text-primary">
								Código do serviço
							</h3>
							<p className="text-sm text-text-secondary">
								{sugestao
									? `Sugestão para ${sugestao.oficioLabel}: ${formatarCodigoNacional(sugestao.principal.codigo)}. ${sugestao.explicacao}`
									: "Seu ofício não tem uma sugestão. Escolha o código que descreve o serviço que você fez, ou digite outro."}
							</p>
							<fieldset aria-labelledby="nota-codigo" className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2">
								{opcoesCodigo.map((c) => {
									const ativo = dados.servico.codigo === c.codigo;
									return (
										<button
											key={c.codigo}
											type="button"
											aria-pressed={ativo}
											onClick={() => setCodigo(c.codigo)}
											className={cn(
												"rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
												ativo ? "border-primary bg-primary/10" : "border-border hover:bg-bg-neutral/60",
											)}
										>
											<span className="block text-sm font-semibold tabular-nums text-text-primary">
												{formatarCodigoNacional(c.codigo)}
											</span>
											<span className="line-clamp-2 text-xs text-text-secondary">{c.titulo}</span>
										</button>
									);
								})}
							</fieldset>
							<div className="flex items-end gap-2">
								<div className="flex-1">
									<label htmlFor="nota-outro-codigo" className="text-xs text-text-secondary">
										Outro código (6 números)
									</label>
									<Input
										id="nota-outro-codigo"
										value={outroCodigo}
										onChange={(e) => setOutroCodigo(e.target.value)}
										inputMode="numeric"
										placeholder="Ex.: 14.01.01"
										aria-invalid={!!outroCodigo && !outroValido}
										className="mt-1"
									/>
								</div>
								<Button
									type="button"
									variant="outline"
									disabled={!outroValido}
									onClick={() => outroValido && setCodigo(outroValido)}
								>
									Usar
								</Button>
							</div>
						</section>
					)}

					{/* Campos para copiar, na ordem das telas do emissor */}
					<section aria-labelledby="nota-campos" className="flex flex-col gap-3">
						<h3 id="nota-campos" className="text-sm font-semibold text-text-primary">
							Copie campo a campo
						</h3>
						{(["Pessoas", "Serviço", "Valores"] as const).map((etapa) => (
							<div key={etapa} className="rounded-lg border border-border">
								<p className="border-b border-border bg-bg-neutral/40 px-3 py-1.5 text-xs font-semibold text-text-secondary">
									Tela “{etapa}” do emissor
								</p>
								<div className="divide-y divide-border/60">
									{campos
										.filter((c) => c.etapa === etapa)
										.map((c) => (
											<div key={c.id} className="flex items-start gap-3 px-3 py-2.5">
												<div className="min-w-0 flex-1">
													<p className="text-xs text-text-secondary">{c.rotulo}</p>
													{c.id === "descricao" && !emitida ? (
														<>
															<Textarea
																value={dados.servico.descricao}
																onChange={(e) => setDescricao(e.target.value)}
																maxLength={LIMITE_DESCRICAO}
																rows={6}
																aria-label="Descrição do serviço"
																className="mt-1"
															/>
															<p className="mt-1 text-xs text-text-disabled">
																{dados.servico.descricao.length}/{LIMITE_DESCRICAO} caracteres
																{descricao !== null && (
																	<button
																		type="button"
																		className="ml-2 underline underline-offset-2"
																		onClick={() => setDescricao(null)}
																	>
																		voltar ao texto automático
																	</button>
																)}
															</p>
														</>
													) : (
														<p
															className={cn(
																"mt-0.5 whitespace-pre-line break-words text-sm",
																c.exibicao ? "text-text-primary" : "font-medium text-warning-darker dark:text-warning",
															)}
														>
															{c.exibicao || "Falta este dado"}
														</p>
													)}
													{c.dica && <p className="mt-1 text-xs text-text-secondary">{c.dica}</p>}
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="shrink-0 gap-1.5"
													disabled={!c.valor}
													onClick={() => copiar(c)}
													aria-label={`Copiar ${c.rotulo}`}
												>
													{copiado === c.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
													{copiado === c.id ? "Copiado" : "Copiar"}
												</Button>
											</div>
										))}
								</div>
							</div>
						))}
					</section>

					{/* Checklist */}
					<section aria-labelledby="nota-checklist" className="flex flex-col gap-2">
						<h3 id="nota-checklist" className="text-sm font-semibold text-text-primary">
							Antes de emitir, confira
						</h3>
						<ul className="flex flex-col gap-1.5">
							{checklist.map((i) => (
								<li key={i.id} className="flex gap-2 text-sm">
									{i.alerta ? (
										<AlertCircle
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-warning-darker dark:text-warning"
										/>
									) : (
										<Square aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-disabled" />
									)}
									<span className={cn(i.alerta ? "font-medium text-text-primary" : "text-text-secondary")}>
										{i.alerta && <span className="sr-only">Atenção: </span>}
										{i.texto}
									</span>
								</li>
							))}
						</ul>
					</section>

					{/* Ações */}
					<section className="flex flex-col gap-3 rounded-lg border border-border p-3">
						<Button asChild className="gap-2">
							<a href={URL_EMISSOR_NACIONAL} target="_blank" rel="noopener noreferrer">
								<ExternalLink aria-hidden="true" className="size-4" />
								Abrir o Emissor Nacional
							</a>
						</Button>
						{notaQ.isSuccess &&
							(emitida && notaSalva ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={anotar.isPending}
									onClick={() => anotar.mutate({ id: notaSalva.id, numero: null })}
								>
									Não emiti: voltar para preparada
								</Button>
							) : (
								<>
									<Button
										type="button"
										variant="outline"
										disabled={guardar.isPending}
										onClick={() => guardar.mutate(dados)}
									>
										{notaSalva ? "Atualizar nota preparada" : "Guardar nota preparada"}
									</Button>
									{notaSalva && (
										<form
											className="flex items-end gap-2"
											onSubmit={(e) => {
												e.preventDefault();
												if (numeroValido) anotar.mutate({ id: notaSalva.id, numero: numeroValido });
											}}
										>
											<div className="flex-1">
												<label htmlFor="nota-numero" className="text-xs text-text-secondary">
													Já emitiu? Número da NFS-e
												</label>
												<Input
													id="nota-numero"
													value={numero}
													onChange={(e) => setNumero(e.target.value)}
													inputMode="numeric"
													placeholder="Número que o portal mostrou"
													aria-invalid={!!numero && !numeroValido}
													className="mt-1"
												/>
											</div>
											<Button type="submit" disabled={!numeroValido || anotar.isPending}>
												Anotar
											</Button>
										</form>
									)}
									{numero && !numeroValido && (
										<p className="text-xs text-error">Até 13 números (número da NFS-e) ou 50 (chave de acesso).</p>
									)}
								</>
							))}
					</section>

					{/* Pré-venda da nota automática — sem preço, sem cobrança. */}
					<section aria-labelledby="nota-automatica" className="flex flex-col gap-2 rounded-lg bg-bg-neutral/50 p-3">
						<h3 id="nota-automatica" className="text-sm font-semibold text-text-primary">
							Nota automática
						</h3>
						{interesseQ.data === true ? (
							<p className="text-sm font-medium text-success-dark dark:text-success">{TEXTO_INTERESSE_REGISTRADO}</p>
						) : (
							<>
								<p className="text-sm text-text-secondary">{TEXTO_INTERESSE_NOTA_AUTOMATICA}</p>
								{interesseQ.isLoading ? (
									<Skeleton className="h-9 w-48" />
								) : interesseQ.error instanceof RecursoDesligado ? (
									<p className="text-sm text-text-secondary">
										O registro de interesse ainda está desligado no servidor.
									</p>
								) : interesseQ.isError ? (
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-sm text-error">Não consegui ver se você já pediu.</p>
										<Button type="button" size="sm" variant="outline" onClick={() => interesseQ.refetch()}>
											Tentar de novo
										</Button>
									</div>
								) : (
									<Button
										type="button"
										variant="outline"
										className="self-start"
										disabled={registrarInteresse.isPending}
										onClick={() => registrarInteresse.mutate()}
									>
										{ROTULO_INTERESSE_NOTA_AUTOMATICA}
									</Button>
								)}
							</>
						)}
					</section>
				</>
			) : null}
		</div>
	);
}
