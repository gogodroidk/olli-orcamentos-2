/**
 * RECIBO — registrar um pagamento recebido.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE FORMULÁRIO PROTEGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. BLOB INTEIRO NA EDIÇÃO. `recibos.dados` guarda o Recibo completo — inclusive
 *    `assinaturaPrestadorUri`, `exibirAssinatura` e os `itens` copiados do orçamento.
 *    Ao editar, parto do objeto que veio do blob e faço MERGE. Montar um Recibo só
 *    com os campos desta tela apagaria a assinatura e os itens que já foram para o
 *    PDF do cliente.
 *
 * 2. PAGAMENTO PARCIAL COM CONTA HONESTA. Um orçamento pode ter vários recibos. A
 *    tela soma os OUTROS recibos daquele orçamento e mostra quanto FALTA. Se essa
 *    soma não puder ser calculada (rede caiu), a tela DIZ ISSO — não mostra
 *    "já recebido: R$ 0,00", que faria o usuário cobrar de novo o que já entrou.
 *
 * 3. NÚMERO SÓ NO SALVAR. `proximoNumeroDocumento('recibo')` INCREMENTA o contador.
 *    Chamar ao abrir o formulário queimaria o REC-00126 se o usuário desistisse.
 *
 * 4. DATA NO FORMATO DO BLOB. `dataRecebimento` é 'DD/MM/AAAA' — é o que o app do
 *    celular lê. O <input type="date"> trabalha em 'YYYY-MM-DD'; a conversão é
 *    explícita, nas funções de `datas.ts`. (A coluna `data_recebimento` é gravada em
 *    ISO pelo `contrato.ts`; ver `dados.ts` para o porquê.)
 *
 * 5. CHAVE OPCIONAL É OMITIDA. Sem orçamento vinculado, `orcamentoId`/`orcamentoNumero`
 *    NÃO existem no blob — não viram `null`. É assim que o app grava.
 */
import type { ItemOrcamento, Orcamento, Recibo } from "@dominio";
import { AlertTriangle, Check, ChevronsUpDown, FileText, Loader2, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Campo, CampoMoeda } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import { StatusBadge } from "@/olli/components/record-list-helpers";
import SeletorCliente, { type ClienteSelecionado } from "@/olli/components/SeletorCliente";
import { novoId } from "@/olli/contrato";
import { agoraIso, brParaYmd, hojeYmd, ymdParaBr } from "@/olli/datas";
import { proximoNumeroDocumento, useSalvar } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/ui/command";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { cn } from "@/utils";
import {
	type LinhaOrcamento,
	orcamentoDaLinha,
	reais,
	reciboDaLinha,
	STATUS_RECEBIVEIS,
	somaRecebida,
	useOrcamentos,
	useRecibos,
} from "./dados";

/**
 * Formas de pagamento. Os cinco primeiros são LITERALMENTE os chips do app
 * (`EmitirReciboScreen.tsx`): escrever "Cartão" onde o app escreve "Cartão de crédito"
 * criaria dois vocabulários para a mesma coisa no mesmo banco. "Boleto" é adição do
 * painel. O tipo é `string` livre — daí o campo "Outra".
 */
const FORMAS = ["PIX", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Transferência", "Boleto"] as const;

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	/** Recibo existente = EDIÇÃO (objeto vindo do blob, inteiro). Ausente = novo. */
	recibo?: Recibo | null;
	/** Pré-seleciona o orçamento (ex.: "Receber" a partir de um orçamento aprovado). */
	orcamentoIdInicial?: string | null;
}

export default function FormRecibo({ aberto, aoFechar, recibo, orcamentoIdInicial }: Props) {
	const editando = !!recibo;
	const salvar = useSalvar("recibos");

	/* ─────────────────────────────  estado do form  ──────────────────────────── */
	const [orcamentoId, setOrcamentoId] = useState<string | null>(null);
	const [cliente, setCliente] = useState<ClienteSelecionado | null>(null);
	const [valorRecebido, setValorRecebido] = useState(0);
	const [formaPagamento, setFormaPagamento] = useState<string>("PIX");
	const [dataYmd, setDataYmd] = useState(hojeYmd());
	const [tentouSalvar, setTentouSalvar] = useState(false);
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);
	/** O usuário mexeu no valor? Então o seletor de orçamento não o sobrescreve mais. */
	const [valorTocado, setValorTocado] = useState(false);

	/* ───────────────────────────────  dados  ─────────────────────────────────── */
	const listaOrcamentos = useOrcamentos();
	const listaRecibos = useRecibos();

	const orcamentos = useMemo(() => listaOrcamentos.data ?? [], [listaOrcamentos.data]);
	const orcamentoSel: Orcamento | null = useMemo(() => {
		if (!orcamentoId) return null;
		const linha = orcamentos.find((o) => o.id === orcamentoId);
		return linha ? orcamentoDaLinha(linha) : null;
	}, [orcamentos, orcamentoId]);

	/**
	 * Quanto já entrou deste orçamento (fora este recibo). TRÊS ESTADOS de propósito:
	 * `null` = NÃO SEI (carregando ou erro) — e "não sei" nunca pode virar "R$ 0,00".
	 */
	const jaRecebido: number | null = useMemo(() => {
		if (!orcamentoId) return null;
		if (listaRecibos.isLoading || listaRecibos.isError || !listaRecibos.data) return null;
		const dominio = listaRecibos.data.map(reciboDaLinha).filter((r): r is Recibo => r !== null);
		return somaRecebida(dominio, orcamentoId, recibo?.id);
	}, [orcamentoId, listaRecibos.isLoading, listaRecibos.isError, listaRecibos.data, recibo?.id]);

	const totalOrcamento = orcamentoSel?.valorTotal ?? null;
	const falta =
		totalOrcamento !== null && jaRecebido !== null
			? Math.max(0, Math.round((totalOrcamento - jaRecebido) * 100) / 100)
			: null;

	/* ─────────────────  reset a cada abertura (novo OU edição)  ─────────────────
	 * Reidrata SÓ ao abrir (ou ao trocar de recibo). Listar os campos do próprio
	 * `recibo` nas dependências faria o formulário se resetar sozinho a cada
	 * revalidação da lista — apagando o que o usuário está digitando. */
	// biome-ignore lint/correctness/useExhaustiveDependencies: ver comentário acima.
	useEffect(() => {
		if (!aberto) return;
		setErro(null);
		setTentouSalvar(false);
		setSalvando(false);
		if (recibo) {
			setOrcamentoId(recibo.orcamentoId ?? null);
			setCliente({
				clienteId: recibo.clienteId,
				clienteNome: recibo.clienteNome,
				clienteTelefone: recibo.clienteTelefone ?? "",
			});
			setValorRecebido(recibo.valorRecebido);
			setFormaPagamento(recibo.formaPagamento || "PIX");
			// Data vem do BLOB (a coluna está corrompida) e em 'DD/MM/AAAA'.
			setDataYmd(brParaYmd(recibo.dataRecebimento) ?? "");
			setValorTocado(true); // valor já existe: o seletor de orçamento não mexe nele.
		} else {
			setOrcamentoId(orcamentoIdInicial ?? null);
			setCliente(null);
			setValorRecebido(0);
			setFormaPagamento("PIX");
			setDataYmd(hojeYmd());
			setValorTocado(false);
		}
	}, [aberto, recibo?.id, orcamentoIdInicial]);

	/**
	 * Escolher um orçamento traz cliente, valor e itens junto — é o fluxo principal
	 * ("recebi do orçamento X"). O valor sugerido é o que FALTA, não o total: num
	 * orçamento com entrada já paga, sugerir o total faria o dono cobrar duas vezes.
	 * Quando ainda não sei quanto entrou (`falta === null`), sugiro o total e a tela
	 * avisa, em vez de fingir uma conta que não fiz.
	 */
	function escolherOrcamento(linha: LinhaOrcamento | null) {
		if (!linha) {
			setOrcamentoId(null);
			return;
		}
		const o = orcamentoDaLinha(linha);
		setOrcamentoId(linha.id);
		if (!o) return;

		setCliente({
			clienteId: o.clienteId,
			clienteNome: o.clienteNome,
			clienteTelefone: o.clienteTelefone ?? "",
		});

		if (!valorTocado) {
			const dominio = (listaRecibos.data ?? []).map(reciboDaLinha).filter((r): r is Recibo => r !== null);
			const conheco = !listaRecibos.isLoading && !listaRecibos.isError && !!listaRecibos.data;
			const entrou = conheco ? somaRecebida(dominio, o.id, recibo?.id) : 0;
			setValorRecebido(Math.max(0, Math.round((o.valorTotal - entrou) * 100) / 100));
		}
	}

	/* ────────────────────────────  validação  ────────────────────────────────── */
	const erroCliente = !cliente?.clienteId ? "Escolha o cliente que pagou." : undefined;
	const erroValor = !(valorRecebido > 0) ? "Informe o valor recebido." : undefined;
	// Valido o YMD do <input type="date"> pela ida-e-volta do conversor que a gravação
	// usa: se `ymdParaBr` não conseguir converter, o blob receberia uma data quebrada.
	const erroData = !brParaYmd(ymdParaBr(dataYmd)) ? "Informe a data do recebimento." : undefined;
	const erroForma = !formaPagamento.trim() ? "Informe a forma de pagamento." : undefined;
	const invalido = !!(erroCliente || erroValor || erroData || erroForma);

	/** Aviso (não bloqueio): dono pode receber a mais de propósito (taxa, acréscimo). */
	const ultrapassa = falta !== null && valorRecebido > falta && valorRecebido > 0;

	async function aoEnviar(e: React.FormEvent) {
		e.preventDefault();
		setTentouSalvar(true);
		setErro(null);
		if (invalido || !cliente) return;

		setSalvando(true);
		try {
			// NÚMERO SÓ AGORA (ver cabeçalho, item 3). Na edição, o número não muda.
			const numero = recibo?.numero ?? (await proximoNumeroDocumento("recibo"));

			// ITENS. Só recopio do orçamento quando o VÍNCULO MUDOU: um recibo já emitido é
			// um RETRATO — se o orçamento foi editado depois, o documento que o cliente
			// recebeu não pode mudar retroativamente.
			// E se o vínculo mudou mas o orçamento novo veio ilegível (blob ausente, ou o
			// orçamento está na lixeira), NÃO apago os itens às cegas: manter é reversível,
			// apagar não.
			const vinculoMudou = (recibo?.orcamentoId ?? null) !== orcamentoId;
			let itens: ItemOrcamento[] = recibo?.itens ?? [];
			if (vinculoMudou) {
				if (!orcamentoId)
					itens = []; // desvinculou: os itens vinham daquele orçamento
				else if (orcamentoSel) itens = orcamentoSel.itens;
			}

			const salvo: Recibo = {
				// MERGE: preserva assinatura, pdfEmitido e qualquer campo que o celular grave.
				...(recibo ?? {}),
				id: recibo?.id ?? novoId(),
				numero,
				clienteId: cliente.clienteId,
				clienteNome: cliente.clienteNome,
				clienteTelefone: cliente.clienteTelefone ?? "",
				itens,
				valorRecebido,
				formaPagamento: formaPagamento.trim(),
				dataRecebimento: ymdParaBr(dataYmd), // 'DD/MM/AAAA' — formato do blob.
				exibirAssinatura: recibo?.exibirAssinatura ?? true,
				criadoEm: recibo?.criadoEm ?? agoraIso(),
				atualizadoEm: agoraIso(),
				// Recibo nascido no painel ainda NÃO virou PDF. O app mostra "pagamento
				// registrado · PDF ainda não gerado" e oferece gerar. Marcar true aqui
				// mentiria: nenhum PDF foi entregue ao cliente.
				pdfEmitido: recibo?.pdfEmitido ?? false,
			};

			if (orcamentoId) {
				salvo.orcamentoId = orcamentoId;
				// O número pode não estar à mão (orçamento na lixeira, ou lista com erro).
				// Nesse caso PRESERVO o que já estava no recibo — exigir `orcamentoSel` aqui
				// faria uma edição banal (trocar a forma de pagamento) DESVINCULAR o recibo
				// do orçamento em silêncio, e o parcial daquele orçamento passaria a mentir.
				const numeroOrc =
					orcamentoSel?.numero ?? (recibo?.orcamentoId === orcamentoId ? recibo.orcamentoNumero : undefined);
				if (numeroOrc) salvo.orcamentoNumero = numeroOrc;
				else delete salvo.orcamentoNumero;
			} else {
				// Chave OPCIONAL: o app OMITE quando não há vínculo. Não gravar null.
				delete salvo.orcamentoId;
				delete salvo.orcamentoNumero;
			}

			await salvar.mutateAsync(salvo);
			aoFechar();
		} catch (e2) {
			setErro((e2 as Error)?.message ?? "Não foi possível salvar o recibo. Tente de novo.");
		} finally {
			setSalvando(false);
		}
	}

	const formId = "form-recibo";

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			titulo={editando ? `Editar recibo ${recibo?.numero ?? ""}`.trim() : "Novo recibo"}
			descricao={
				editando
					? "Ajuste o pagamento registrado. O número do recibo não muda."
					: "Registre um pagamento recebido. O número (REC-…) é gerado ao salvar."
			}
			erro={erro}
			salvando={salvando}
			formId={formId}
			rotuloSalvar={editando ? "Salvar" : "Registrar recebimento"}
		>
			<form id={formId} onSubmit={aoEnviar} className="space-y-5">
				{/* ───────────────  Orçamento (opcional, mas é o fluxo principal)  ────────────── */}
				<Campo
					rotulo="Recebendo de um orçamento"
					dica="Preenche o cliente, o valor e copia os itens. Deixe em branco para um recebimento avulso."
				>
					<SeletorOrcamento
						valor={orcamentoId}
						aoSelecionar={escolherOrcamento}
						lista={listaOrcamentos}
						disabled={salvando}
					/>
				</Campo>

				{/* ─────────────────────────  Pagamento parcial  ───────────────────────── */}
				{orcamentoId && (
					<PainelParcial
						total={totalOrcamento}
						jaRecebido={jaRecebido}
						falta={falta}
						esteValor={valorRecebido}
						carregando={listaRecibos.isLoading}
						erro={listaRecibos.isError}
						aoTentarDeNovo={() => listaRecibos.refetch()}
						recarregando={listaRecibos.isFetching}
						// "Sumido" ≠ "erro de rede" ≠ "ainda carregando": só é sumido quando a
						// lista CHEGOU e o orçamento não está nela (foi para a lixeira, p.ex.).
						sumido={!orcamentoSel && !listaOrcamentos.isLoading && !listaOrcamentos.isError}
					/>
				)}

				{/* ─────────────────────────────  Cliente  ─────────────────────────────── */}
				<Campo rotulo="Cliente" obrigatorio erro={tentouSalvar ? erroCliente : undefined}>
					<SeletorCliente
						valor={cliente}
						aoSelecionar={setCliente}
						disabled={salvando}
						invalido={tentouSalvar && !!erroCliente}
					/>
				</Campo>

				{/* ───────────────────────────  Valor + data  ──────────────────────────── */}
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo
						rotulo="Valor recebido"
						obrigatorio
						erro={tentouSalvar ? erroValor : undefined}
						dica={ultrapassa && falta !== null ? undefined : "Quanto entrou de fato, neste pagamento."}
					>
						<CampoMoeda
							valor={valorRecebido}
							aoMudar={(v) => {
								setValorTocado(true);
								setValorRecebido(v);
							}}
							disabled={salvando}
						/>
					</Campo>

					<Campo rotulo="Data do recebimento" obrigatorio erro={tentouSalvar ? erroData : undefined}>
						<Input
							type="date"
							value={dataYmd}
							onChange={(e) => setDataYmd(e.target.value)}
							disabled={salvando}
							aria-invalid={tentouSalvar && !!erroData}
						/>
					</Campo>
				</div>

				{/* <output> tem role="status" implícito: o leitor de tela anuncia o aviso
				    quando ele aparece, sem roubar o foco de quem está digitando o valor. */}
				{ultrapassa && falta !== null && (
					<output className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
						<AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
						<span>
							Este valor passa do que falta receber deste orçamento (<strong>{reais(falta)}</strong>). Se for de
							propósito (acréscimo, taxa), pode salvar — só confira antes.
						</span>
					</output>
				)}

				{/* ──────────────────────  Forma de pagamento  ─────────────────────────── */}
				<Campo rotulo="Forma de pagamento" obrigatorio erro={tentouSalvar ? erroForma : undefined}>
					<div className="space-y-2">
						<div className="flex flex-wrap gap-2">
							{FORMAS.map((f) => {
								const ativo = formaPagamento === f;
								return (
									<Button
										key={f}
										type="button"
										size="sm"
										variant={ativo ? "default" : "outline"}
										aria-pressed={ativo}
										disabled={salvando}
										onClick={() => setFormaPagamento(f)}
										className="rounded-full"
									>
										{ativo && <Check aria-hidden="true" className="mr-1.5 size-3.5" />}
										{f}
									</Button>
								);
							})}
						</div>
						{/* O tipo é texto livre: quem recebeu em "permuta" tem que conseguir escrever. */}
						<Input
							value={(FORMAS as readonly string[]).includes(formaPagamento) ? "" : formaPagamento}
							onChange={(e) => setFormaPagamento(e.target.value)}
							disabled={salvando}
							placeholder="Outra forma (ex.: cheque, permuta)…"
							aria-label="Outra forma de pagamento"
						/>
					</div>
				</Campo>
			</form>
		</FormDialog>
	);
}

/* ══════════════════════════  Painel de pagamento parcial  ═════════════════════ */

/**
 * A conta do parcial. O ponto sensível é o `erro`: quando não dá para saber quanto
 * já entrou, esta caixa DIZ que não sabe. Mostrar "Já recebido: R$ 0,00" numa falha
 * de rede levaria o dono a cobrar de novo um valor que o cliente já pagou.
 */
function PainelParcial({
	total,
	jaRecebido,
	falta,
	esteValor,
	carregando,
	erro,
	aoTentarDeNovo,
	recarregando,
	sumido,
}: {
	total: number | null;
	jaRecebido: number | null;
	falta: number | null;
	esteValor: number;
	carregando: boolean;
	erro: boolean;
	aoTentarDeNovo: () => void;
	recarregando: boolean;
	sumido: boolean;
}) {
	if (sumido) {
		return (
			<p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
				<AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
				<span>
					Não achei este orçamento na lista (pode ter ido para a lixeira). O vínculo do recibo continua intacto — só não
					dá para mostrar o total nem preencher os itens a partir dele.
				</span>
			</p>
		);
	}

	if (erro) {
		return (
			<div className="rounded-lg border border-error/30 bg-error/5 px-3 py-3">
				<p className="flex items-start gap-2 text-sm font-medium text-text-primary">
					<AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-error" />
					<span>
						Não consegui somar os recibos já emitidos deste orçamento. Salvar agora pode duplicar um pagamento que já
						entrou.
					</span>
				</p>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="mt-2"
					onClick={aoTentarDeNovo}
					disabled={recarregando}
				>
					{recarregando ? (
						<Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
					) : (
						<RotateCw aria-hidden="true" className="mr-2 size-4" />
					)}
					Tentar de novo
				</Button>
			</div>
		);
	}

	const quitado = falta !== null && falta <= 0;

	return (
		<div className="rounded-lg border border-border bg-bg-neutral/50 px-3 py-3">
			<dl className="grid grid-cols-3 gap-3 text-sm">
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Total do orçamento</dt>
					<dd className="mt-0.5 font-medium tabular-nums text-text-primary">{total !== null ? reais(total) : "—"}</dd>
				</div>
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Já recebido</dt>
					<dd className="mt-0.5 font-medium tabular-nums text-text-primary">
						{carregando ? (
							<span className="inline-flex items-center gap-1.5 text-text-secondary">
								<Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
								calculando…
							</span>
						) : jaRecebido !== null ? (
							reais(jaRecebido)
						) : (
							"—"
						)}
					</dd>
				</div>
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Falta receber</dt>
					<dd className={cn("mt-0.5 font-semibold tabular-nums", quitado ? "text-success" : "text-text-primary")}>
						{falta !== null ? reais(falta) : "—"}
					</dd>
				</div>
			</dl>

			{quitado && (
				<p className="mt-2 text-xs text-text-secondary">
					Este orçamento já está quitado pelos recibos existentes. Este novo recibo de{" "}
					<strong className="font-medium text-text-primary">{reais(esteValor)}</strong> ficaria por cima do total.
				</p>
			)}
		</div>
	);
}

/* ═══════════════════════════  Seletor de orçamento  ═══════════════════════════ */

/**
 * Combobox de orçamento. Mostra por padrão só os RECEBÍVEIS (aprovado/convertido) —
 * que é de onde vem quase todo recibo — mas deixa ver todos: na vida real o cliente
 * paga um orçamento que ainda está como "enviado", e travar isso obrigaria o dono a
 * mentir o status só para conseguir dar o recibo.
 *
 * 3 estados dentro da lista: carregando · erro com "Tentar de novo" · vazio.
 */
function SeletorOrcamento({
	valor,
	aoSelecionar,
	lista,
	disabled,
}: {
	valor: string | null;
	aoSelecionar: (linha: LinhaOrcamento | null) => void;
	lista: ReturnType<typeof useOrcamentos>;
	disabled?: boolean;
}) {
	const [aberto, setAberto] = useState(false);
	const [busca, setBusca] = useState("");
	const [todos, setTodos] = useState(false);

	const { data, isLoading, isError, error, refetch, isFetching } = lista;

	const selecionado = useMemo(() => (data ?? []).find((o) => o.id === valor) ?? null, [data, valor]);

	const resultados = useMemo(() => {
		const base = (data ?? []).filter((o) => todos || STATUS_RECEBIVEIS.has(String(o.status ?? "")));
		const termo = busca.trim().toLowerCase();
		if (!termo) return base;
		return base.filter((o) => `${o.numero ?? ""} ${o.cliente_nome ?? ""}`.toLowerCase().includes(termo));
	}, [data, busca, todos]);

	return (
		<Popover open={aberto} onOpenChange={setAberto}>
			<PopoverTrigger asChild>
				{/* biome-ignore lint/a11y/useSemanticElements: um <select> nativo não busca
				    enquanto se digita, e uma base com centenas de orçamentos fica inutilizável.
				    role="combobox" + aria-expanded + a lista do cmdk são o padrão ARIA APG. */}
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={aberto}
					disabled={disabled}
					className={cn("h-10 w-full justify-between px-3 font-normal", !selecionado && "text-text-secondary")}
				>
					<span className="flex min-w-0 items-center gap-2">
						<FileText aria-hidden="true" className="size-4 shrink-0 text-text-disabled" />
						<span className="truncate">
							{selecionado
								? `Nº ${selecionado.numero ?? "—"} · ${selecionado.cliente_nome ?? "sem cliente"}`
								: "Sem orçamento (recebimento avulso)"}
						</span>
					</span>
					<ChevronsUpDown aria-hidden="true" className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>

			<PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-80 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Buscar por número ou cliente…"
						value={busca}
						onValueChange={setBusca}
						disabled={isLoading || isError}
					/>

					<CommandList>
						{isLoading ? (
							<div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
								<Loader2 aria-hidden="true" className="size-4 animate-spin" />
								Carregando orçamentos…
							</div>
						) : isError ? (
							// ERRO ≠ "nenhum orçamento". Dizer "nenhum" numa falha de rede faria o
							// dono emitir o recibo solto, sem vínculo — e perder a conta do parcial.
							<div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
								<AlertTriangle aria-hidden="true" className="size-6 text-error" />
								<div>
									<p className="text-sm font-semibold text-text-primary">Não foi possível carregar os orçamentos</p>
									<p className="mt-1 text-xs text-text-secondary">
										{(error as Error)?.message ?? "Erro ao consultar os dados."}
									</p>
								</div>
								<Button type="button" size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
									{isFetching ? (
										<Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
									) : (
										<RotateCw aria-hidden="true" className="mr-2 size-4" />
									)}
									Tentar de novo
								</Button>
							</div>
						) : (
							<>
								<CommandEmpty>
									<p className="px-4 py-3 text-center text-sm text-text-primary">
										{busca.trim()
											? "Nenhum orçamento encontrado."
											: todos
												? "Você ainda não tem orçamentos."
												: "Nenhum orçamento aprovado. Marque “Mostrar todos” abaixo."}
									</p>
								</CommandEmpty>

								{resultados.length > 0 && (
									<CommandGroup>
										{resultados.map((o) => {
											const escolhido = valor === o.id;
											return (
												<CommandItem
													key={o.id}
													value={o.id}
													onSelect={() => {
														aoSelecionar(o);
														setAberto(false);
														setBusca("");
													}}
													className="flex items-center gap-2 py-2"
												>
													<Check
														aria-hidden="true"
														className={cn("size-4 shrink-0", escolhido ? "opacity-100" : "opacity-0")}
													/>
													<span className="flex min-w-0 flex-1 flex-col">
														<span className="truncate font-medium text-text-primary">
															Nº {o.numero ?? "—"} · {o.cliente_nome ?? "sem cliente"}
														</span>
														<span className="text-xs tabular-nums text-text-secondary">{reais(o.valor_total)}</span>
													</span>
													<StatusBadge value={o.status} className="shrink-0" />
												</CommandItem>
											);
										})}
									</CommandGroup>
								)}
							</>
						)}
					</CommandList>

					{!isLoading && !isError && (
						<div className="flex items-center justify-between gap-2 border-t border-border p-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="font-normal"
								onClick={() => {
									aoSelecionar(null);
									setAberto(false);
									setBusca("");
								}}
							>
								Sem orçamento
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-pressed={todos}
								className="font-normal"
								onClick={() => setTodos((v) => !v)}
							>
								{todos ? (
									"Só os aprovados"
								) : (
									<>
										Mostrar todos
										<Badge variant="secondary" className="ml-2">
											{(lista.data ?? []).length}
										</Badge>
									</>
								)}
							</Button>
						</div>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
