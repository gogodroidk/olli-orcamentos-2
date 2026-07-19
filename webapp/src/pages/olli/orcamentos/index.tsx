/**
 * ORÇAMENTOS — a lista. É por aqui que o dono decide o dia dele.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. A VERDADE É O BLOB, NÃO A LINHA. As colunas (`numero`, `status`, `valor_total`)
 *    são espelhos; o documento inteiro — itens, fotos, assinaturas, sinal — mora em
 *    `dados` (jsonb). Editar, duplicar e EXCLUIR aqui só acontecem em cima do blob.
 *    Uma linha sem blob (corrompida ou de uma versão antiga) tem as ações
 *    DESABILITADAS e diz por quê — em vez de abrir um formulário vazio que, ao
 *    salvar, apagaria o documento do cliente.
 *
 * 2. ERRO NÃO É LISTA VAZIA. Falha de rede mostra erro + "Tentar de novo". Dizer
 *    "você não tem orçamentos" para quem tem 40 é mentir para o dono — e ele age em
 *    cima disso (liga para o cliente errado, refaz o que já existe).
 *
 * A exclusão é SOFT (lixeira): `useExcluir` carimba `excluidoEm` no blob e na coluna.
 * Apagar de verdade faria o celular ressuscitar a linha no próximo sync.
 */
import type { Cliente, Empresa, Orcamento, StatusOrcamento } from "@dominio";
import { STATUS_LABELS } from "@dominio";
import {
	AlertTriangle,
	Copy,
	FileSignature,
	FileText,
	Inbox,
	Loader2,
	MoreHorizontal,
	Pencil,
	Plus,
	Printer,
	RotateCw,
	Search,
	Trash2,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ChunkBoundary } from "@/components/lazy/chunk-boundary";
import { lazyComRetry } from "@/components/lazy/carregar-chunk";
import { useQueryClient } from "@tanstack/react-query";
import { avisoDaMarca, resolverMarcaDoDocumento } from "@/olli/marcaDocumento";
import { imprimirOrcamento } from "@/olli/pdf/imprimirOrcamento";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { novoOrcamentoVazio } from "@/olli/components/novoOrcamentoVazio";
import { orcamentoComItemPrefill, type PrefillItemOrcamento } from "@/olli/components/prefillItemOrcamento";
import { BotaoAbrirLinha, getStatusVariant, linhaClicavel, NameCell } from "@/olli/components/record-list-helpers";
import { clienteParaOrcamento } from "@/olli/components/SeletorCliente";
import { TableOverflowHint } from "@/olli/components/TableOverflowHint";
import { useMinhaEmpresa, useOlliList } from "@/olli/data";
import { ymdParaBr } from "@/olli/datas";
import { useExcluir } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
/**
 * Contrato carregado SOB DEMANDA: ele arrasta o gerador de PDF do contrato, e
 * quem só abre a lista de orçamentos (a maioria, o tempo todo) não deve pagar
 * esse download. `lazyComRetry` reentrega o pedaço se a rede falhar — o público
 * é prestador em 4G ruim, onde chunk que não baixa é comum e viraria tela morta.
 */
const DialogoContrato = lazyComRetry(() => import("./DialogoContrato"));
import FormOrcamento, { duplicarComoRascunho, edicaoBloqueada } from "./FormOrcamento";

/**
 * A linha como ela vem do Supabase: colunas-espelho + o BLOB. Os nomes das colunas
 * são snake_case; o blob é o objeto de domínio em camelCase.
 */
interface LinhaOrcamento {
	id: string;
	numero: string | null;
	cliente_nome: string | null;
	status: string | null;
	valor_total: number | null;
	data_emissao: string | null;
	criado_em: string;
	/** O documento INTEIRO. `null` só em linha corrompida/legada — e aí as ações travam. */
	dados: Orcamento | null;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SKELETON = ["s1", "s2", "s3", "s4", "s5", "s6"];

/** Ordem do funil — a mesma do domínio, para o filtro não inventar status. */
const STATUS: StatusOrcamento[] = [
	"rascunho",
	"enviado",
	"visualizado",
	"em_negociacao",
	"aguardando_assinatura",
	"aprovado",
	"recusado",
	"expirado",
	"cancelado",
	"convertido",
];

/** Os mesmos slugs de `STATUS`, num Set — só pra validar o que a URL manda. */
const STATUS_VALIDOS = new Set<string>(STATUS);

/**
 * O blob, se ele existir DE VERDADE. Um `dados` sem `itens` não é um orçamento —
 * é ruído, e tratá-lo como documento faria o painel salvar um objeto meia-boca por
 * cima do que o cliente tem em mãos.
 */
function blobDe(linha: LinhaOrcamento): Orcamento | null {
	const d = linha.dados;
	if (!d || typeof d !== "object" || !Array.isArray(d.itens)) return null;
	return d;
}

function StatusDoOrcamento({ valor }: { valor: string | null }) {
	if (!valor) return <span className="text-text-disabled">—</span>;
	// STATUS_LABELS é do domínio: "em_negociacao" vira "Em negociação" (com cedilha e
	// til), não "Em negociacao". O cliente não vê esta tela, mas o dono vê o dia todo.
	const rotulo = STATUS_LABELS[valor as StatusOrcamento] ?? valor;
	return (
		<Badge variant={getStatusVariant(valor)} className="font-medium">
			{rotulo}
		</Badge>
	);
}

/**
 * O menu de ações de uma linha — o mesmo no desktop e no mobile.
 *
 * Mora no ESCOPO DO MÓDULO de propósito (mesmo padrão de `MenuAcoes`, em
 * `catalogo/ListaCatalogo.tsx`, e `AcoesRecibo`, em `recibos/index.tsx`). Declarada
 * DENTRO do componente da página, ela seria um TIPO NOVO a cada render — e como o
 * `useOlliList` revalida em segundo plano e a busca também dispara render a cada
 * tecla, o React desmontaria e remontaria a subárvore inteira do menu a cada
 * digitação, fechando qualquer dropdown que o dono tivesse acabado de abrir.
 */
function MenuDaLinha({
	linha,
	onVerPdf,
	onGerarContrato,
	onEditar,
	onDuplicar,
	onExcluir,
}: {
	linha: LinhaOrcamento;
	/** O MESMO caminho do clique na linha — o menu não tem uma segunda versão da regra. */
	onVerPdf: (linha: LinhaOrcamento) => void;
	onGerarContrato: (linha: LinhaOrcamento) => void;
	onEditar: (linha: LinhaOrcamento) => void;
	onDuplicar: (blob: Orcamento) => void;
	onExcluir: (blob: Orcamento) => void;
}) {
	const blob = blobDe(linha);
	const bloqueado = blob ? edicaoBloqueada(blob.status) : false;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Ações do orçamento ${linha.numero ?? ""}`.trim()}
					className="text-text-secondary"
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{!blob ? (
					// Sem blob não há documento — e um formulário vazio que "salva por cima"
					// seria destruição de dado com cara de funcionalidade.
					<DropdownMenuItem disabled className="text-xs">
						Este orçamento está sem os dados completos. Abra-o no celular.
					</DropdownMenuItem>
				) : (
					<>
						{/* PDF real: o MESMO gerador do app, impresso pelo navegador (Salvar como PDF).
						    O cliente já recebe pelo portal /o/<token>; este é o arquivo do PRESTADOR.
						    Vem PRIMEIRO e continua aqui mesmo sendo a ação do clique na linha: quem
						    chegou pelo menu não tem que adivinhar que a linha faz isso. */}
						<DropdownMenuItem onSelect={() => onVerPdf(linha)}>
							<Printer className="mr-2 size-4" />
							Ver / imprimir PDF
						</DropdownMenuItem>
						{/* CONTRATO: o mesmo gerador do celular (src/utils/contratoPdf), com as
						    cláusulas ajustáveis antes de imprimir. Vem logo abaixo do PDF porque é
						    a sequência real do trabalho — o prestador manda a proposta e, quando o
						    cliente aceita, emite o contrato do MESMO orçamento, sem redigitar nada. */}
						<DropdownMenuItem onSelect={() => onGerarContrato(linha)}>
							<FileSignature className="mr-2 size-4" />
							Gerar contrato
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onEditar(linha)}>
							<Pencil className="mr-2 size-4" />
							{bloqueado ? "Editar (já enviado)" : "Editar"}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onDuplicar(blob)}>
							<Copy className="mr-2 size-4" />
							Duplicar como rascunho
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onExcluir(blob)} className="text-error focus:text-error">
							<Trash2 className="mr-2 size-4" />
							Excluir
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * As ações de uma linha: EDITAR fica VISÍVEL, fora do "…".
 *
 * Motivo: o clique na linha agora abre o PDF. Se editar existisse só dentro do menu,
 * a queixa do dono ("tenho que clicar nos três pontinhos") teria só mudado de dono —
 * do PDF para a edição. Mesma peça no desktop e no mobile; escopo de MÓDULO pelo
 * mesmo motivo de `MenuDaLinha` (ver acima).
 */
function AcoesDoOrcamento({
	linha,
	onVerPdf,
	onGerarContrato,
	onEditar,
	onDuplicar,
	onExcluir,
}: {
	linha: LinhaOrcamento;
	onVerPdf: (linha: LinhaOrcamento) => void;
	onGerarContrato: (linha: LinhaOrcamento) => void;
	onEditar: (linha: LinhaOrcamento) => void;
	onDuplicar: (blob: Orcamento) => void;
	onExcluir: (blob: Orcamento) => void;
}) {
	const semBlob = blobDe(linha) === null;
	return (
		<div className="flex items-center justify-end gap-0.5">
			<Button
				variant="ghost"
				size="icon"
				className="text-text-secondary"
				aria-label={`Editar orçamento ${linha.numero ?? "sem número"}`}
				title="Editar"
				// Sem o documento não há o que editar — e o menu explica por quê.
				disabled={semBlob}
				onClick={() => onEditar(linha)}
			>
				<Pencil className="size-4" />
			</Button>
			<MenuDaLinha
				linha={linha}
				onVerPdf={onVerPdf}
				onGerarContrato={onGerarContrato}
				onEditar={onEditar}
				onDuplicar={onDuplicar}
				onExcluir={onExcluir}
			/>
		</div>
	);
}

export default function OrcamentosPage() {
	const { data, isLoading, isError, error, refetch, isFetching } = useOlliList<LinhaOrcamento>("orcamentos", {
		orderBy: "criado_em",
	});
	const { data: empresaLinha } = useMinhaEmpresa();
	// A `empresa` também é uma tabela de BLOB: o objeto de domínio vive em `dados`.
	const empresa = (empresaLinha?.dados as Empresa | undefined) ?? null;

	// Os cartões do Início mandam pra cá com "?status=" — "Em jogo" chega como
	// enviado,visualizado,em_negociacao,aguardando_assinatura; "A receber" e "Taxa de
	// aprovação" chegam como aprovado,convertido (ver `paramStatus` em
	// pages/olli/inicio/financeiro.ts). São os MESMOS slugs de `StatusOrcamento`, então
	// não há nome pra traduzir — só filtrar fora um valor torto que não exista no funil.
	const [searchParams, setSearchParams] = useSearchParams();
	// `?novo=1` e `?cliente=<nome>` chegam de outras telas (WelcomeHeader, ações de
	// contexto do cliente) — ver o efeito logo após `abrirNovo`, mais abaixo.
	const location = useLocation();
	const statusDaUrl = useMemo(() => {
		const bruto = searchParams.get("status");
		if (!bruto) return null;
		const valores = bruto
			.split(",")
			.map((s) => s.trim())
			.filter((s) => STATUS_VALIDOS.has(s));
		return valores.length > 0 ? new Set(valores) : null;
	}, [searchParams]);

	const [busca, setBusca] = useState("");
	const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusOrcamento>("todos");
	// O filtro que veio da URL manda até o dono trocar o status manualmente no
	// dropdown — a partir daí a escolha dele prevalece (mesmo que ele volte a "Todos").
	const [filtroManual, setFiltroManual] = useState(false);

	/** O editor aberto. `ehNovo` decide se o número será gerado no submit. */
	const [editor, setEditor] = useState<{ orc: Orcamento; ehNovo: boolean } | null>(null);
	/** id da linha cujo PDF está sendo montado — a linha mostra isso, não fica muda. */
	const [pdfEmCurso, setPdfEmCurso] = useState<string | null>(null);
	/** O orçamento que virou contrato — o diálogo abre em cima do BLOB, nunca da linha. */
	const [contratoDe, setContratoDe] = useState<Orcamento | null>(null);
	const [excluindo, setExcluindo] = useState<Orcamento | null>(null);
	const [erroExclusao, setErroExclusao] = useState<string | null>(null);

	const excluir = useExcluir("orcamentos");
	/** Usado só para AGUARDAR a leitura do plano no clique do PDF (ver `verPdf`). */
	const qc = useQueryClient();

	const linhas = useMemo(() => {
		let lista = data ?? [];
		if (!filtroManual && statusDaUrl) {
			lista = lista.filter((l) => l.status && statusDaUrl.has(l.status));
		} else if (filtroStatus !== "todos") {
			lista = lista.filter((l) => l.status === filtroStatus);
		}
		const termo = busca.trim().toLowerCase();
		if (!termo) return lista;
		return lista.filter(
			(l) => (l.numero ?? "").toLowerCase().includes(termo) || (l.cliente_nome ?? "").toLowerCase().includes(termo),
		);
	}, [data, busca, filtroStatus, statusDaUrl, filtroManual]);

	const somaVisivel = useMemo(() => linhas.reduce((s, l) => s + (l.valor_total ?? 0), 0), [linhas]);

	/* ─────────────────────────────────  Ações  ───────────────────────────────── */

	const abrirNovo = () => setEditor({ orc: novoOrcamentoVazio(empresa), ehNovo: true });

	/**
	 * Chegada com intenção pronta, vinda de OUTRA tela:
	 *   • `?novo=1` (CTA do WelcomeHeader, ação "Novo orçamento" da lista de clientes) —
	 *     abre o editor sozinho, sem o usuário precisar clicar em nada aqui.
	 *   • `?cliente=<nome>` (ação "Ver orçamentos deste cliente") — pré-preenche a busca,
	 *     que já filtra por `cliente_nome` (ver `linhas` acima).
	 *   • cliente pré-selecionado no NOVO orçamento vem pelo ESTADO da rota
	 *     (`location.state.clientePreSelecionado`, montado em `clientes/index.tsx` com
	 *     `linhaParaCliente`), nunca pela URL — dado de cliente não é query string.
	 *     `clienteParaOrcamento` é o MESMO conversor que `SeletorCliente` usa, então o
	 *     orçamento sai idêntico a se o usuário tivesse escolhido o cliente na mão.
	 *   • 1 item pré-carregado também vem pelo ESTADO da rota
	 *     (`location.state.prefillItem`, montado em `diagnostico/PorCodigo.tsx` e
	 *     `diagnostico/PorSintoma.tsx` — "Criar orçamento com este diagnóstico"), mesma
	 *     ideia do app: o técnico só ajusta preço/quantidade, não digita tudo de novo.
	 *
	 * Roda uma vez, no MOUNT: a URL é limpa logo depois para um F5 ou um "voltar" não
	 * reabrir o editor sozinho de novo.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: intencionalmente só no mount — ver comentário acima
	useEffect(() => {
		const querNovo = searchParams.get("novo");
		const clienteDaUrl = searchParams.get("cliente");
		if (!querNovo && !clienteDaUrl) return;

		if (clienteDaUrl) setBusca(clienteDaUrl);

		if (querNovo) {
			const estado = location.state as
				| { clientePreSelecionado?: Cliente; prefillItem?: PrefillItemOrcamento }
				| null
				| undefined;
			let orc = novoOrcamentoVazio(empresa);
			if (estado?.clientePreSelecionado) {
				orc = { ...orc, ...clienteParaOrcamento(estado.clientePreSelecionado) };
			}
			if (estado?.prefillItem) {
				orc = orcamentoComItemPrefill(orc, estado.prefillItem);
			}
			setEditor({ orc, ehNovo: true });
		}

		const proximos = new URLSearchParams(searchParams);
		proximos.delete("novo");
		proximos.delete("cliente");
		setSearchParams(proximos, { replace: true });
	}, []);

	/**
	 * VER O PDF — a ação PRINCIPAL da linha, e o pedido literal do dono: "clicar e ver
	 * o PDF, não clicar nos três pontinhos, gerar e esperar aparecer".
	 *
	 * Por que o PDF (e não abrir o editor) no clique: o gesto do dia dele é CONFERIR o
	 * documento e mandar pro cliente — editar é o caso raro, e continua a um clique,
	 * visível, no botão de lápis ao lado do "…". Por que imprimir e não uma prévia
	 * nova: `imprimirOrcamento` já monta o documento REAL (o mesmo gerador do app) num
	 * iframe e chama print() — a pré-visualização do navegador É o PDF, sem popup e sem
	 * uma segunda tela de preview pra divergir do arquivo que sai.
	 *
	 * Os 3 estados aparecem: "Preparando…" enquanto monta, sucesso ao abrir o diálogo,
	 * e ERRO dito em voz alta se falhar — nunca uma janela em branco ou um clique mudo.
	 */
	const verPdf = (linha: LinhaOrcamento) => {
		if (pdfEmCurso) return; // já tem um em preparo; a linha mostra o estado
		const blob = blobDe(linha);
		if (!blob) {
			toast.error("Este orçamento está sem os dados completos — abra-o no celular para gerar o PDF.", {
				position: "top-center",
			});
			return;
		}
		if (!empresa) {
			toast.error("Complete o cadastro do seu negócio (Meu Negócio) antes de gerar o PDF.", {
				position: "top-center",
			});
			return;
		}
		setPdfEmCurso(linha.id);
		/**
		 * O SELO DO OLLI é resolvido ANTES de montar o documento, e o clique ESPERA
		 * por isso. `resolverMarcaDoDocumento` lê a assinatura real (cache quente =
		 * instantâneo) e nunca lança: plano que não carrega não pode impedir o
		 * prestador de imprimir. Quando não dá para confirmar, o selo fica — e o
		 * toast de sucesso conta que ficou, em vez de deixá-lo descobrir no papel.
		 */
		const tarefa = resolverMarcaDoDocumento(qc)
			.then(async (marca) => {
				await imprimirOrcamento(blob, empresa, [], { removerMarca: marca.removerMarca });
				return marca;
			})
			.finally(() => setPdfEmCurso(null));
		toast.promise(tarefa, {
			loading: "Preparando o PDF…",
			success: (marca) => {
				const aviso = avisoDaMarca(marca);
				return aviso
					? `Abri a janela de impressão. ${aviso}`
					: "Abri a janela de impressão — escolha “Salvar como PDF”.";
			},
			error: "Não consegui gerar o PDF agora. Tente de novo.",
		});
	};

	/**
	 * GERAR CONTRATO — o documento que diz o que foi combinado, a partir do orçamento
	 * que o cliente já aceitou. O prestador não redigita nada: o diálogo abre com as
	 * cláusulas colhidas do orçamento + do cadastro, prontas pra ajustar.
	 *
	 * As MESMAS duas guardas do PDF, pelo mesmo motivo: sem o blob não existe
	 * documento (itens, valor, sinal moram nele), e sem o cadastro da empresa o
	 * contrato sairia sem CONTRATADA — um contrato com uma parte em branco é pior
	 * que nenhum contrato. Cada caso diz o que fazer, não trava mudo.
	 */
	const gerarContrato = (linha: LinhaOrcamento) => {
		const blob = blobDe(linha);
		if (!blob) {
			toast.error("Este orçamento está sem os dados completos — abra-o no celular para gerar o contrato.", {
				position: "top-center",
			});
			return;
		}
		if (!empresa) {
			toast.error("Complete o cadastro do seu negócio (Meu Negócio) antes de gerar o contrato.", {
				position: "top-center",
			});
			return;
		}
		setContratoDe(blob);
	};

	/** Editar: SEMPRE em cima do blob. A trava de "já enviado" mora no FormOrcamento. */
	const abrirEdicao = (linha: LinhaOrcamento) => {
		const blob = blobDe(linha);
		if (!blob) return;
		setEditor({ orc: blob, ehNovo: false });
	};

	const duplicar = (o: Orcamento) =>
		setEditor({ orc: duplicarComoRascunho(o, empresa?.validadeDiasPadrao), ehNovo: true });

	/** Abre a confirmação de exclusão (soft delete) sobre o blob — limpa o erro da
	 *  exclusão ANTERIOR primeiro, senão o diálogo abriria vermelho por cima de um
	 *  orçamento inocente. */
	const pedirExclusao = (blob: Orcamento) => {
		setErroExclusao(null);
		setExcluindo(blob);
	};

	async function confirmarExclusao() {
		if (!excluindo) return;
		setErroExclusao(null);
		try {
			// O objeto INTEIRO vai para o `useExcluir` — ele carimba `excluidoEm` dentro
			// do blob e na coluna. Mandar só o id gravaria um blob truncado.
			await excluir.mutateAsync(excluindo);
			setExcluindo(null);
		} catch (err) {
			setErroExclusao((err as Error)?.message ?? "Não foi possível excluir.");
		}
	}

	/* ────────────────────────────────  Render  ───────────────────────────────── */

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* ─────────────  Cabeçalho  ───────────── */}
			<div className="mb-5 flex flex-col gap-4">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2.5">
							<h1 className="text-2xl font-bold tracking-tight text-text-primary">Orçamentos</h1>
							{!isLoading && !isError && (
								<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
									{linhas.length}
								</Badge>
							)}
						</div>
						{/* A afordância também é escrita: o clique na linha faz uma coisa que não se
						    adivinha pelo hover. Copy derivada do que o código faz — clicar chama
						    `verPdf`, que imprime o documento real; editar é o lápis da própria linha. */}
						<p className="mt-1 text-sm text-text-secondary">
							Cada linha aqui é um documento que vai (ou já foi) para a mão de um cliente. Clique na linha para ver o
							PDF; use o lápis para editar.
						</p>
					</div>

					<Button onClick={abrirNovo}>
						<Plus className="mr-2 size-4" />
						Novo orçamento
					</Button>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row">
					<div className="relative flex-1 sm:max-w-xs">
						<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
						<Input
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por número ou cliente…"
							aria-label="Buscar orçamentos"
							className="h-10 rounded-full pl-10"
						/>
					</div>

					<Select
						value={filtroStatus}
						onValueChange={(v) => {
							setFiltroStatus(v as "todos" | StatusOrcamento);
							setFiltroManual(true);
						}}
					>
						<SelectTrigger className="h-10 w-full rounded-full sm:w-56" aria-label="Filtrar por status">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="todos">Todos os status</SelectItem>
							{STATUS.map((s) => (
								<SelectItem key={s} value={s}>
									{STATUS_LABELS[s]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* ─────────────  3 estados: carregando · erro · vazio · dados  ───────────── */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					<div className="divide-y divide-border/60">
						{SKELETON.map((k) => (
							<div key={k} className="flex items-center gap-4 px-4 py-4">
								<Skeleton className="h-3.5 w-16 shrink-0" />
								<Skeleton className="size-7 shrink-0 rounded-full" />
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="ml-auto h-5 w-20 rounded-full" />
								<Skeleton className="h-3.5 w-24" />
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
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar seus orçamentos</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."} Seus documentos continuam salvos — é a
							consulta que falhou.
						</p>
					</div>
					<Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
						<RotateCw className={cn("mr-2 size-4", isFetching && "animate-spin")} />
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
							{busca || filtroStatus !== "todos" ? "Nenhum orçamento com esse filtro" : "Você ainda não tem orçamentos"}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{busca || filtroStatus !== "todos"
								? "Tente outro termo ou limpe o filtro de status."
								: "Crie o primeiro — leva menos de um minuto."}
						</p>
					</div>
					{!busca && filtroStatus === "todos" && (
						<Button onClick={abrirNovo}>
							<Plus className="mr-2 size-4" />
							Criar o primeiro orçamento
						</Button>
					)}
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{/* DESKTOP */}
					<div className="relative hidden md:block">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Nº</th>
										<th className="px-4 py-3 font-semibold">Cliente</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th>
										<th className="whitespace-nowrap px-4 py-3 font-semibold">Emissão</th>
										<th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Total</th>
										{/* w-24: a coluna passou a ter DOIS controles (lápis + "…"). Com w-12 o
										    navegador esticava a coluna assim mesmo, roubando largura do Cliente. */}
										<th className="w-24 px-2 py-3">
											<span className="sr-only">Ações</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{linhas.map((l) => {
										const semBlob = blobDe(l) === null;
										const gerando = pdfEmCurso === l.id;
										return (
											// Clicar em QUALQUER LUGAR da linha abre o PDF. `linhaClicavel` blinda o
											// que já clica: o lápis, o "…" e os itens do menu (que portalam no DOM mas
											// borbulham na árvore do React até esta <tr>).
											<tr
												key={l.id}
												{...linhaClicavel(
													() => verPdf(l),
													"border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40",
												)}
											>
												<td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-text-primary">
													{/* O Nº é o caminho de TECLADO da mesma ação (Tab + Enter). */}
													<BotaoAbrirLinha
														rotulo={`Ver PDF do orçamento ${l.numero || "sem número"}`}
														aoAbrir={() => verPdf(l)}
														ocupado={gerando}
														className="flex items-center gap-1.5 group-hover:underline"
													>
														{gerando ? (
															<Loader2
																aria-hidden="true"
																className="size-3.5 text-text-secondary motion-safe:animate-spin"
															/>
														) : (
															<FileText aria-hidden="true" className="size-3.5 text-text-disabled" />
														)}
														{l.numero || "—"}
													</BotaoAbrirLinha>
												</td>
												<td className="px-4 py-3.5">
													<NameCell name={l.cliente_nome || "—"} />
													{semBlob && (
														// Aviso honesto: a linha existe, o documento não veio inteiro.
														<span className="mt-1 flex items-center gap-1 text-xs text-warning-darker dark:text-warning">
															<AlertTriangle className="size-3" />
															Sem os dados completos — não dá para ver o PDF nem editar por aqui.
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-4 py-3.5">
													<StatusDoOrcamento valor={l.status} />
												</td>
												<td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-text-secondary">
													{l.data_emissao ? ymdParaBr(l.data_emissao) : "—"}
												</td>
												<td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums text-text-primary">
													{BRL.format(l.valor_total ?? 0)}
												</td>
												<td className="px-2 py-3.5 text-right">
													<AcoesDoOrcamento
														linha={l}
														onVerPdf={verPdf}
														onGerarContrato={gerarContrato}
														onEditar={abrirEdicao}
														onDuplicar={duplicar}
														onExcluir={pedirExclusao}
													/>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						<TableOverflowHint />
					</div>

					{/* MOBILE */}
					<div className="divide-y divide-border/60 md:hidden">
						{linhas.map((l) => (
							<div key={l.id} {...linhaClicavel(() => verPdf(l), "flex items-start gap-3 p-4 transition-colors")}>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<BotaoAbrirLinha
											rotulo={`Ver PDF do orçamento ${l.numero || "sem número"}`}
											aoAbrir={() => verPdf(l)}
											ocupado={pdfEmCurso === l.id}
											className="flex items-center gap-1.5"
										>
											{pdfEmCurso === l.id ? (
												<Loader2 aria-hidden="true" className="size-3.5 text-text-secondary motion-safe:animate-spin" />
											) : (
												<FileText aria-hidden="true" className="size-3.5 text-text-disabled" />
											)}
											<span className="font-medium tabular-nums text-text-primary">{l.numero || "—"}</span>
										</BotaoAbrirLinha>
										<StatusDoOrcamento valor={l.status} />
									</div>
									<div className="mt-2">
										<NameCell name={l.cliente_nome || "—"} />
									</div>
									<div className="mt-2 flex items-center justify-between gap-3 text-sm">
										<span className="tabular-nums text-text-secondary">
											{l.data_emissao ? ymdParaBr(l.data_emissao) : "—"}
										</span>
										<span className="font-semibold tabular-nums text-text-primary">
											{BRL.format(l.valor_total ?? 0)}
										</span>
									</div>
									{blobDe(l) === null && (
										<p className="mt-2 flex items-center gap-1 text-xs text-warning-darker dark:text-warning">
											<AlertTriangle className="size-3" />
											Sem os dados completos — não dá para ver o PDF nem editar por aqui.
										</p>
									)}
								</div>
								<AcoesDoOrcamento
									linha={l}
									onVerPdf={verPdf}
									onGerarContrato={gerarContrato}
									onEditar={abrirEdicao}
									onDuplicar={duplicar}
									onExcluir={pedirExclusao}
								/>
							</div>
						))}
					</div>

					<div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						<span>
							{linhas.length} orçamento{linhas.length === 1 ? "" : "s"}
						</span>
						<span className="tabular-nums">
							Soma dos exibidos:{" "}
							<strong className="font-semibold text-text-primary font-serif">{BRL.format(somaVisivel)}</strong>
						</span>
					</div>
				</Card>
			)}

			{/* ─────────────  Editor  ───────────── */}
			{editor && (
				<FormOrcamento
					aberto
					aoFechar={() => setEditor(null)}
					inicial={editor.orc}
					ehNovo={editor.ehNovo}
					aoDuplicar={duplicar}
				/>
			)}

			{/* ─────────────  Contrato  ─────────────
			    `key` no id do orçamento: o formulário do diálogo é semeado UMA vez, na
			    montagem. Sem a chave, abrir o contrato de um segundo orçamento reaproveitaria
			    a instância e mostraria as cláusulas do PRIMEIRO — o prestador imprimiria o
			    objeto e o prazo do cliente errado sem nada na tela denunciando.
			    `empresa` já foi checada em `gerarContrato`; o `&&` é a garantia de tipo. */}
			{contratoDe && empresa && (
				/* Se o pedaço do contrato não baixar, a fronteira diz isso em português
				   e deixa fechar — em vez de diálogo em branco, que o usuário lê como
				   "o sistema perdeu meu orçamento". */
				<ChunkBoundary oQue="o contrato">
					<Suspense fallback={null}>
						<DialogoContrato
							key={contratoDe.id}
							orcamento={contratoDe}
							empresa={empresa}
							aoFechar={() => setContratoDe(null)}
						/>
					</Suspense>
				</ChunkBoundary>
			)}

			{/* ─────────────  Exclusão (soft delete)  ───────────── */}
			{excluindo && (
				<ConfirmarExclusao
					aberto
					aoFechar={() => {
						setExcluindo(null);
						setErroExclusao(null);
					}}
					aoConfirmar={confirmarExclusao}
					tipo="orçamento"
					nome={`${excluindo.numero || "sem número"} · ${excluindo.clienteNome || "sem cliente"}`}
					aviso={
						edicaoBloqueada(excluindo.status)
							? "Este orçamento já foi enviado ao cliente — ele continua com o documento em mãos mesmo depois de você excluí-lo daqui."
							: undefined
					}
					excluindo={excluir.isPending}
					erro={erroExclusao}
				/>
			)}
		</div>
	);
}
