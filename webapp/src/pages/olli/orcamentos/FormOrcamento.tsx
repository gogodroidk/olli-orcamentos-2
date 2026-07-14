/**
 * EDITOR DE ORÇAMENTO — a tela que mais mexe em dado do cliente.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AS TRÊS COISAS QUE ESTE ARQUIVO EXISTE PARA NÃO DEIXAR ACONTECER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. APAGAR O QUE O TÉCNICO PREENCHEU NO CELULAR. `orcamentos.dados` é o objeto de
 *    domínio INTEIRO (fotos, assinaturas, sinal, laudo, capa…), e as colunas de cima
 *    são só espelhos. Por isso o estado deste formulário NASCE do blob (`inicial`) e
 *    é sempre PATCHED (`{...o, campo}`) — nunca remontado a partir dos campos da
 *    tela. Montar um objeto novo com o que a tela conhece apagaria em silêncio tudo
 *    que ela não conhece.
 *
 * 2. SOBRESCREVER O QUE O CLIENTE JÁ VIU. Se o status já é enviado/visualizado/
 *    em_negociação/aguardando_assinatura/aprovado, o cliente recebeu (e talvez
 *    aceitou) aquele documento. Editar por cima muda o papel debaixo do nariz dele —
 *    e, no caso do aprovado, mexe no que foi aceito (CDC art. 40). Nesta versão a
 *    edição desses status é BLOQUEADA, com aviso, e o caminho oferecido é DUPLICAR
 *    como novo rascunho. A trava mora AQUI (não na lista): nenhum chamador consegue
 *    contorná-la.
 *
 * 3. CONFUNDIR 10% COM R$ 10. Quando `descontoTipo === 'percentual'`, o campo
 *    `desconto` guarda o PERCENTUAL. Todo número que aparece em reais na tela vem de
 *    `calcularTotais().descontoEmReais`; o que vai para o blob é `comTotais()`.
 *    Trocar o tipo ZERA o campo (igual ao app) — converter "10" de reais para 10%
 *    seria adivinhar a intenção do usuário em cima do preço do cliente.
 *
 * O NÚMERO do documento só é gerado NO SUBMIT (`proximoNumeroDocumento`): gerar ao
 * abrir queima o número quando o usuário desiste, e aí o 003 nunca existe.
 */
import type { ItemOrcamento, Orcamento, ProdutoItem, ServicoItem } from "@dominio";
import { propostaJaEnviada, STATUS_LABELS } from "@dominio";
import { AlertTriangle, Boxes, Check, Copy, Loader2, Plus, RotateCw, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Campo, CampoMoeda, formatarMoeda } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import SeletorCliente, { type ClienteSelecionado } from "@/olli/components/SeletorCliente";
import { calcularTotais, comTotais, subtotalDoItem } from "@/olli/components/totais";
import { novoId } from "@/olli/contrato";
import { useOlliList } from "@/olli/data";
import { agoraIso, brParaIso, emDiasBr, hojeYmd } from "@/olli/datas";
import { proximoNumeroDocumento, useSalvar } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Separator } from "@/ui/separator";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";

/* ═══════════════════════════════  A TRAVA  ═══════════════════════════════════ */

/**
 * Status em que a edição é BLOQUEADA — o cliente já recebeu o documento.
 *
 * `propostaJaEnviada` é a fonte única do domínio (enviado · visualizado ·
 * em_negociacao · aguardando_assinatura). O `aprovado` entra aqui além dela: além
 * de visto, foi ACEITO — mexer nele depois é alterar o que o cliente contratou.
 */
export function edicaoBloqueada(status: Orcamento["status"]): boolean {
	return propostaJaEnviada(status) || status === "aprovado";
}

/** Validade padrão quando a empresa não configurou a dela (igual ao `novoOrcamentoVazio`). */
const VALIDADE_DIAS_PADRAO = 15;

/**
 * Cópia do orçamento como um RASCUNHO NOVO — o caminho honesto para "editar" um
 * documento que o cliente já viu: o original fica intacto (é o que ele tem em mãos)
 * e a alteração vira uma proposta nova.
 *
 * O que NÃO viaja para a cópia: o número (gerado no submit), o status, as datas do
 * documento antigo, a assinatura do CLIENTE (ele assinou aquele papel, não este) e
 * o carimbo de lixeira. Os itens ganham `id` novo para não existirem duas linhas
 * com o mesmo id em documentos diferentes.
 */
export function duplicarComoRascunho(o: Orcamento, validadeDias = VALIDADE_DIAS_PADRAO): Orcamento {
	const agora = agoraIso();
	return comTotais({
		...o,
		id: novoId(),
		numero: "", // só no submit — ver cabeçalho
		status: "rascunho",
		dataEmissao: hojeYmd(),
		validadeOrcamento: emDiasBr(validadeDias),
		itens: o.itens.map((i) => ({ ...i, id: novoId() })),
		assinaturaClienteUri: undefined,
		dataAssinaturaCliente: undefined,
		excluidoEm: undefined,
		criadoEm: agora,
		atualizadoEm: agora,
	});
}

/** O aviso que aparece no lugar do formulário quando a edição está bloqueada. */
export function AvisoOrcamentoEnviado({
	aberto,
	aoFechar,
	orcamento,
	aoDuplicar,
}: {
	aberto: boolean;
	aoFechar: () => void;
	orcamento: Orcamento;
	aoDuplicar?: (o: Orcamento) => void;
}) {
	const aprovado = orcamento.status === "aprovado";
	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div
							aria-hidden="true"
							className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/10"
						>
							<AlertTriangle className="size-5 text-warning" />
						</div>
						<DialogTitle className="pt-1.5 text-left">Este orçamento já foi enviado ao cliente</DialogTitle>
					</div>
				</DialogHeader>

				<div className="rounded-lg border border-border bg-bg-neutral/50 px-3 py-2.5">
					<p className="text-[11px] uppercase tracking-wide text-text-disabled">Orçamento</p>
					<p className="mt-0.5 flex items-center gap-2 font-medium text-text-primary">
						<span className="truncate">
							{orcamento.numero || "(sem número)"} · {orcamento.clienteNome || "(sem cliente)"}
						</span>
						<Badge variant={aprovado ? "success" : "info"} className="shrink-0">
							{STATUS_LABELS[orcamento.status]}
						</Badge>
					</p>
				</div>

				<p className="text-sm text-text-secondary">
					{aprovado ? (
						<>
							O cliente <strong className="font-medium text-text-primary">aprovou</strong> este documento. Alterar o que
							ele aceitou — preço, itens, garantia — sem que ele saiba não é uma correção, é outro contrato.
						</>
					) : (
						<>
							O cliente já tem este documento em mãos. Se você editar por cima, o papel que ele viu passa a dizer outra
							coisa — e ninguém avisa ele.
						</>
					)}
				</p>

				<p className="text-sm text-text-secondary">
					Faça uma <strong className="font-medium text-text-primary">cópia como novo rascunho</strong>: o original
					continua valendo, e você negocia em cima da proposta nova.
				</p>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={aoFechar}>
						Fechar
					</Button>
					{aoDuplicar && (
						<Button type="button" onClick={() => aoDuplicar(orcamento)}>
							<Copy className="mr-2 size-4" />
							Duplicar como novo rascunho
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/* ═════════════════════════════  Catálogo (itens)  ════════════════════════════ */

/**
 * Linha de `servicos`/`produtos` no Supabase. Os campos que uso têm o MESMO nome no
 * domínio e na coluna (nome, preco, unidade…), então tipo-os a partir do domínio —
 * se o app renomear um deles, isto para de compilar. `foto_uri` é a exceção: no banco
 * é snake_case, e virar `fotoUri` só na hora de montar o item.
 */
type LinhaServico = Pick<ServicoItem, "id" | "nome" | "descricao" | "preco" | "unidade"> & {
	foto_uri?: string | null;
};
type LinhaProduto = Pick<ProdutoItem, "id" | "nome" | "descricao" | "preco" | "unidade"> & {
	foto_uri?: string | null;
};
type OpcaoCatalogo = (LinhaServico | LinhaProduto) & { tipo: ItemOrcamento["tipo"] };

/** Busca tolerante a acento e caixa — "instalacao" acha "Instalação". */
const normalizar = (s: string) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

/** Quantidade em pt-BR: 2,5 (e não 2.5). O valor guardado continua sendo `number`. */
const qtdParaTexto = (n: number) => String(n).replace(".", ",");

/** Texto → número. Devolve NaN quando não dá para ler — quem chama decide o que fazer. */
const textoParaNumero = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

/** Máscara de data DD/MM/AAAA (a validade do orçamento é string, não Date). */
function mascaraDataBr(v: string): string {
	const d = (v ?? "").replace(/\D/g, "").slice(0, 8);
	if (d.length <= 2) return d;
	if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
	return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/* ═══════════════════════════════  O EDITOR  ═════════════════════════════════ */

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	/**
	 * O orçamento COMPLETO. Ao editar, é o BLOB (`row.dados`) — nunca um objeto
	 * remontado a partir das colunas, que viria sem fotos/assinaturas/sinal.
	 */
	inicial: Orcamento;
	/** true = documento novo (ou duplicata). O número é gerado no submit. */
	ehNovo: boolean;
	/** Oferecido quando a edição está bloqueada. */
	aoDuplicar?: (o: Orcamento) => void;
}

export default function FormOrcamento({ aberto, aoFechar, inicial, ehNovo, aoDuplicar }: Props) {
	const formId = useId();

	// TRAVA (motivo 2 do cabeçalho): documento já enviado não abre para edição.
	// Fica antes de qualquer estado do formulário — não há caminho que a contorne.
	if (!ehNovo && edicaoBloqueada(inicial.status)) {
		return <AvisoOrcamentoEnviado aberto={aberto} aoFechar={aoFechar} orcamento={inicial} aoDuplicar={aoDuplicar} />;
	}

	return (
		<Editor key={inicial.id} formId={formId} aberto={aberto} aoFechar={aoFechar} inicial={inicial} ehNovo={ehNovo} />
	);
}

/**
 * O formulário de verdade. Separado do componente de cima só para que a TRAVA possa
 * decidir ANTES de qualquer `useState` (hook não pode ficar depois de um `return`).
 */
function Editor({
	formId,
	aberto,
	aoFechar,
	inicial,
	ehNovo,
}: {
	formId: string;
	aberto: boolean;
	aoFechar: () => void;
	inicial: Orcamento;
	ehNovo: boolean;
}) {
	// O estado NASCE do blob inteiro e só é PATCHED — ver motivo 1 do cabeçalho.
	const [orc, setOrc] = useState<Orcamento>(inicial);
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);

	// Buffers de texto: sem eles, derivar o texto de volta do número a cada tecla
	// apaga a vírgula que o usuário acabou de digitar ("2," vira "2").
	const [qtdTexto, setQtdTexto] = useState<Record<string, string>>({});
	const [descontoTexto, setDescontoTexto] = useState<string | null>(null);

	const [catalogoAberto, setCatalogoAberto] = useState(false);
	const [buscaCatalogo, setBuscaCatalogo] = useState("");

	const salvar = useSalvar("orcamentos");

	const patch = (p: Partial<Orcamento>) => setOrc((o) => ({ ...o, ...p }));
	const setItens = (itens: ItemOrcamento[]) => setOrc((o) => ({ ...o, itens }));

	const t = useMemo(() => calcularTotais(orc), [orc]);

	/* ───────────────────────────────  Catálogo  ───────────────────────────────── */

	const servicos = useOlliList<LinhaServico>("servicos", { orderBy: "nome", ascending: true });
	const produtos = useOlliList<LinhaProduto>("produtos", { orderBy: "nome", ascending: true });

	const catalogoCarregando = servicos.isLoading || produtos.isLoading;
	const catalogoComErro = servicos.isError || produtos.isError;

	const opcoes = useMemo<OpcaoCatalogo[]>(() => {
		const s: OpcaoCatalogo[] = (servicos.data ?? []).map((r) => ({ ...r, tipo: "servico" }));
		const p: OpcaoCatalogo[] = (produtos.data ?? []).map((r) => ({ ...r, tipo: "produto" }));
		return [...s, ...p];
	}, [servicos.data, produtos.data]);

	const resultados = useMemo(() => {
		const termo = normalizar(buscaCatalogo.trim());
		if (!termo) return opcoes;
		return opcoes.filter((o) => normalizar(o.nome).includes(termo) || normalizar(o.descricao ?? "").includes(termo));
	}, [opcoes, buscaCatalogo]);

	/**
	 * Adiciona do catálogo. Item já presente (mesmo `catalogoId` e mesmo tipo) só
	 * INCREMENTA a quantidade — é o que o app faz (Step2Itens), e evita duas linhas
	 * idênticas no PDF do cliente.
	 */
	function adicionarDoCatalogo(op: OpcaoCatalogo) {
		const existente = orc.itens.find((i) => i.catalogoId === op.id && i.tipo === op.tipo);
		if (existente) {
			setItens(
				orc.itens.map((i) =>
					i.id === existente.id
						? {
								...i,
								quantidade: i.quantidade + 1,
								subtotal: subtotalDoItem({ preco: i.preco, quantidade: i.quantidade + 1 }),
							}
						: i,
				),
			);
		} else {
			const item: ItemOrcamento = {
				id: novoId(),
				tipo: op.tipo,
				catalogoId: op.id,
				nome: op.nome,
				preco: op.preco ?? 0,
				quantidade: 1,
				// `unidade` é NOT NULL no domínio; a coluna aceita null (cadastro antigo).
				unidade: op.unidade || "un",
				subtotal: subtotalDoItem({ preco: op.preco ?? 0, quantidade: 1 }),
			};
			// Opcionais: a chave só existe quando há valor (o app omite, não grava null).
			if (op.descricao) item.descricao = op.descricao;
			if (op.foto_uri) item.fotoUri = op.foto_uri;
			setItens([...orc.itens, item]);
		}
		setCatalogoAberto(false);
		setBuscaCatalogo("");
	}

	/** Item que não está no catálogo. `catalogoId` é STRING VAZIA — nunca null. */
	function adicionarAvulso(tipo: ItemOrcamento["tipo"]) {
		setItens([
			...orc.itens,
			{
				id: novoId(),
				tipo,
				catalogoId: "",
				nome: "",
				preco: 0,
				quantidade: 1,
				unidade: "un",
				subtotal: 0,
			},
		]);
		setCatalogoAberto(false);
		setBuscaCatalogo("");
	}

	/** Altera um item e RECALCULA o subtotal da linha na mesma tacada. */
	function alterarItem(id: string, p: Partial<ItemOrcamento>) {
		setItens(
			orc.itens.map((i) => {
				if (i.id !== id) return i;
				const atualizado = { ...i, ...p };
				return { ...atualizado, subtotal: subtotalDoItem(atualizado) };
			}),
		);
	}

	function removerItem(id: string) {
		setItens(orc.itens.filter((i) => i.id !== id));
		setQtdTexto((m) => {
			const { [id]: _fora, ...resto } = m;
			return resto;
		});
	}

	/* ───────────────────────────────  Cliente  ────────────────────────────────── */

	/**
	 * Atribuição CAMPO A CAMPO (e não `{...o, ...sel}`): quando o cliente novo não tem
	 * CPF/endereço, o seletor OMITE a chave — um spread manteria o CPF do cliente
	 * ANTERIOR no documento. Aqui o `undefined` sobrescreve e a chave some do blob.
	 */
	const escolherCliente = (c: ClienteSelecionado) =>
		patch({
			clienteId: c.clienteId,
			clienteNome: c.clienteNome,
			clienteTelefone: c.clienteTelefone,
			clienteCpfCnpj: c.clienteCpfCnpj,
			clienteEndereco: c.clienteEndereco,
		});

	/* ────────────────────────────────  Submit  ────────────────────────────────── */

	/** Devolve a 1ª pendência que impede o documento de existir — ou null. */
	function validar(): string | null {
		if (!orc.clienteId || !orc.clienteNome.trim()) return "Escolha o cliente deste orçamento.";
		if (orc.itens.length === 0) return "Adicione pelo menos um item — um orçamento sem itens não é um orçamento.";

		const semNome = orc.itens.find((i) => !i.nome.trim());
		if (semNome) return "Um dos itens está sem nome. Dê um nome a ele ou remova a linha.";

		const qtdRuim = orc.itens.find((i) => !Number.isFinite(i.quantidade) || i.quantidade <= 0);
		if (qtdRuim) return `A quantidade de "${qtdRuim.nome}" precisa ser maior que zero.`;

		const precoRuim = orc.itens.find((i) => !Number.isFinite(i.preco) || i.preco < 0);
		if (precoRuim) return `O preço de "${precoRuim.nome}" está inválido.`;

		if (orc.descontoTipo === "percentual" && orc.desconto > 100) {
			return "O desconto não pode passar de 100%.";
		}
		// Validade é 'DD/MM/AAAA'. `brParaIso` devolve null quando a data não existe
		// (32/13/2026, por exemplo) — melhor barrar do que emitir um PDF com data falsa.
		if (orc.validadeOrcamento && !brParaIso(orc.validadeOrcamento)) {
			return "A validade do orçamento não é uma data válida (use DD/MM/AAAA).";
		}
		return null;
	}

	async function enviar(e: React.FormEvent) {
		e.preventDefault();

		// Trava defensiva: o `FormOrcamento` já bloqueou a abertura, mas o status pode
		// ter mudado (o cliente abriu o link enquanto a aba estava parada aqui).
		if (!ehNovo && edicaoBloqueada(inicial.status)) {
			setErro("Este orçamento já foi enviado ao cliente e não pode mais ser editado. Feche e duplique-o.");
			return;
		}

		const problema = validar();
		if (problema) {
			setErro(problema);
			return;
		}

		setErro(null);
		setEnviando(true);
		try {
			// `comTotais` recalcula subtotais/desconto/sinal como o app faz — o mesmo
			// orçamento tem que fechar no mesmo centavo nos dois lugares.
			let final = comTotais({ ...orc, atualizadoEm: agoraIso() });

			// O número nasce AQUI, não ao abrir o formulário (ver cabeçalho).
			if (!final.numero.trim()) {
				final = { ...final, numero: await proximoNumeroDocumento("orcamento") };
			}

			await salvar.mutateAsync(final);
			aoFechar();
		} catch (err) {
			setErro((err as Error)?.message ?? "Não foi possível salvar o orçamento.");
		} finally {
			setEnviando(false);
		}
	}

	/* ────────────────────────────────  Render  ────────────────────────────────── */

	const formas: { chave: keyof Orcamento["formasPagamento"]; rotulo: string }[] = [
		{ chave: "pix", rotulo: "Pix" },
		{ chave: "credito", rotulo: "Crédito" },
		{ chave: "debito", rotulo: "Débito" },
		{ chave: "dinheiro", rotulo: "Dinheiro" },
	];

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			largo
			titulo={ehNovo ? "Novo orçamento" : `Editar orçamento ${inicial.numero || ""}`.trim()}
			descricao={
				ehNovo
					? "O número do documento é gerado quando você salvar."
					: "Rascunho — o cliente ainda não recebeu este documento."
			}
			erro={erro}
			salvando={enviando}
			formId={formId}
			rotuloSalvar={ehNovo ? "Criar orçamento" : "Salvar alterações"}
		>
			<form id={formId} onSubmit={enviar} className="space-y-6">
				{/* ─────────────  Cliente  ───────────── */}
				<section className="space-y-4">
					<Campo rotulo="Cliente" obrigatorio>
						<SeletorCliente
							valor={orc.clienteId ? orc : null}
							aoSelecionar={escolherCliente}
							invalido={!orc.clienteId && !!erro}
						/>
					</Campo>
					{orc.clienteEndereco && (
						<p className="-mt-2 text-xs text-text-secondary">
							{orc.clienteEndereco}
							{orc.clienteCpfCnpj ? ` · ${orc.clienteCpfCnpj}` : ""}
						</p>
					)}
				</section>

				<Separator />

				{/* ─────────────  Itens  ───────────── */}
				<section className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h3 className="text-sm font-semibold text-text-primary">Itens</h3>
							<p className="text-xs text-text-secondary">
								{orc.itens.length === 0
									? "Do catálogo ou avulso — o que entrar aqui vira linha no PDF do cliente."
									: `${orc.itens.length} ${orc.itens.length === 1 ? "linha" : "linhas"} no documento`}
							</p>
						</div>

						<Popover open={catalogoAberto} onOpenChange={setCatalogoAberto}>
							<PopoverTrigger asChild>
								<Button type="button" size="sm" variant="outline">
									<Plus className="mr-1.5 size-4" />
									Adicionar item
								</Button>
							</PopoverTrigger>
							<PopoverContent align="end" className="w-96 p-0">
								{/* shouldFilter={false}: o filtro é nosso (ignora acento). */}
								<Command shouldFilter={false}>
									<CommandInput
										placeholder="Buscar no catálogo…"
										value={buscaCatalogo}
										onValueChange={setBuscaCatalogo}
										disabled={catalogoCarregando || catalogoComErro}
									/>
									<CommandList>
										{catalogoCarregando ? (
											<div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
												<Loader2 className="size-4 animate-spin" />
												Carregando catálogo…
											</div>
										) : catalogoComErro ? (
											// ERRO ≠ VAZIO: dizer "catálogo vazio" numa falha de rede faria o
											// usuário recadastrar à mão serviços que já existem.
											<div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
												<AlertTriangle className="size-6 text-error" />
												<div>
													<p className="text-sm font-semibold text-text-primary">
														Não foi possível carregar o catálogo
													</p>
													<p className="mt-1 text-xs text-text-secondary">
														{((servicos.error ?? produtos.error) as Error)?.message ?? "Erro ao consultar os dados."}
													</p>
												</div>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => {
														servicos.refetch();
														produtos.refetch();
													}}
												>
													<RotateCw className="mr-2 size-4" />
													Tentar de novo
												</Button>
											</div>
										) : (
											<>
												<CommandEmpty>
													<p className="px-4 py-3 text-center text-sm text-text-secondary">
														{buscaCatalogo.trim()
															? "Nada com esse nome no catálogo."
															: "Seu catálogo ainda está vazio."}
													</p>
												</CommandEmpty>
												{resultados.length > 0 && (
													<CommandGroup heading="Catálogo">
														{resultados.map((op) => {
															const jaTem = orc.itens.some((i) => i.catalogoId === op.id && i.tipo === op.tipo);
															return (
																<CommandItem
																	key={`${op.tipo}-${op.id}`}
																	value={`${op.tipo}-${op.id}`}
																	onSelect={() => adicionarDoCatalogo(op)}
																	className="flex items-center gap-2 py-2"
																>
																	{op.tipo === "servico" ? (
																		<Wrench className="size-4 shrink-0 text-text-disabled" />
																	) : (
																		<Boxes className="size-4 shrink-0 text-text-disabled" />
																	)}
																	<span className="flex min-w-0 flex-col">
																		<span className="truncate font-medium text-text-primary">{op.nome}</span>
																		<span className="text-xs text-text-secondary">
																			R$ {formatarMoeda(op.preco ?? 0)} / {op.unidade || "un"}
																		</span>
																	</span>
																	{jaTem && <Check className="ml-auto size-4 shrink-0 text-success" />}
																</CommandItem>
															);
														})}
													</CommandGroup>
												)}
											</>
										)}
									</CommandList>

									{/* Item avulso fica FORA da lista: continua alcançável quando a busca não
									    acha nada — que é exatamente quando mais se precisa dele. */}
									<div className="flex gap-1 border-t border-border p-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="flex-1 justify-start gap-2 font-normal"
											onClick={() => adicionarAvulso("servico")}
										>
											<Wrench className="size-4" />
											Serviço avulso
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="flex-1 justify-start gap-2 font-normal"
											onClick={() => adicionarAvulso("produto")}
										>
											<Boxes className="size-4" />
											Produto avulso
										</Button>
									</div>
								</Command>
							</PopoverContent>
						</Popover>
					</div>

					{orc.itens.length === 0 ? (
						<div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
							<p className="text-sm font-medium text-text-primary">Nenhum item ainda</p>
							<p className="mt-1 text-xs text-text-secondary">
								Um orçamento sem itens não pode ser salvo — nem faria sentido para o cliente.
							</p>
						</div>
					) : (
						<ul className="space-y-2">
							{orc.itens.map((item) => (
								<li key={item.id} className="rounded-xl border border-border bg-bg-neutral/30 p-3">
									<div className="flex items-start gap-2">
										<span
											aria-hidden="true"
											className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10"
											title={item.tipo === "servico" ? "Serviço" : "Produto"}
										>
											{item.tipo === "servico" ? (
												<Wrench className="size-3.5 text-primary" />
											) : (
												<Boxes className="size-3.5 text-primary" />
											)}
										</span>

										<div className="min-w-0 flex-1 space-y-2">
											<Input
												aria-label={`Nome do item (${item.tipo === "servico" ? "serviço" : "produto"})`}
												value={item.nome}
												placeholder="Nome do item"
												onChange={(e) => alterarItem(item.id, { nome: e.target.value })}
												className={cn("h-9", !item.nome.trim() && "border-error")}
											/>

											<div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_5rem_1fr_auto]">
												{/* Quantidade com buffer de texto: aceita "2,5" sem apagar a vírgula. */}
												<Input
													aria-label={`Quantidade de ${item.nome || "item"}`}
													inputMode="decimal"
													className="h-9 text-right tabular-nums"
													value={qtdTexto[item.id] ?? qtdParaTexto(item.quantidade)}
													onChange={(e) => {
														const texto = e.target.value;
														setQtdTexto((m) => ({ ...m, [item.id]: texto }));
														const n = textoParaNumero(texto);
														if (Number.isFinite(n)) alterarItem(item.id, { quantidade: n });
													}}
													onBlur={() =>
														setQtdTexto((m) => {
															const { [item.id]: _fora, ...resto } = m;
															return resto;
														})
													}
												/>
												<Input
													aria-label={`Unidade de ${item.nome || "item"}`}
													className="h-9"
													placeholder="un"
													value={item.unidade}
													onChange={(e) => alterarItem(item.id, { unidade: e.target.value })}
												/>
												<CampoMoeda valor={item.preco} aoMudar={(v) => alterarItem(item.id, { preco: v })} />
												<div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
													<span className="text-sm font-semibold tabular-nums text-text-primary">
														R$ {formatarMoeda(item.subtotal)}
													</span>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label={`Remover ${item.nome || "item"} do orçamento`}
														onClick={() => removerItem(item.id)}
														className="text-text-secondary hover:text-error"
													>
														<Trash2 className="size-4" />
													</Button>
												</div>
											</div>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>

				<Separator />

				{/* ─────────────  Desconto + Totais  ───────────── */}
				<section className="grid gap-4 md:grid-cols-2">
					<Campo
						rotulo="Desconto"
						dica={
							orc.descontoTipo === "percentual"
								? `${t.desconto}% do subtotal = R$ ${formatarMoeda(t.descontoEmReais)}`
								: "Valor em reais, abatido do subtotal."
						}
						erro={
							orc.descontoTipo === "percentual" && orc.desconto > 100
								? "O desconto não pode passar de 100%."
								: undefined
						}
					>
						<div className="flex gap-2">
							{/* Trocar o tipo ZERA o campo (igual ao app): "10" em reais não vira
							    10% por adivinhação — isso mudaria o preço do cliente sem ele pedir. */}
							<fieldset className="flex shrink-0 rounded-lg border border-border p-0.5">
								<legend className="sr-only">Tipo de desconto</legend>
								{(["valor", "percentual"] as const).map((tipo) => (
									<button
										key={tipo}
										type="button"
										aria-pressed={orc.descontoTipo === tipo}
										onClick={() => {
											setDescontoTexto(null);
											patch({ descontoTipo: tipo, desconto: 0 });
										}}
										className={cn(
											"rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
											orc.descontoTipo === tipo
												? "bg-primary text-white"
												: "text-text-secondary hover:text-text-primary",
										)}
									>
										{tipo === "valor" ? "R$" : "%"}
									</button>
								))}
							</fieldset>

							{orc.descontoTipo === "valor" ? (
								<div className="flex-1">
									<CampoMoeda valor={orc.desconto} aoMudar={(v) => patch({ desconto: v })} />
								</div>
							) : (
								<div className="relative flex-1">
									<Input
										aria-label="Desconto em porcentagem"
										inputMode="decimal"
										className="pr-8 text-right tabular-nums"
										placeholder="0"
										value={descontoTexto ?? (orc.desconto ? qtdParaTexto(orc.desconto) : "")}
										onChange={(e) => {
											const texto = e.target.value;
											setDescontoTexto(texto);
											const n = textoParaNumero(texto);
											patch({ desconto: Number.isFinite(n) && texto.trim() ? n : 0 });
										}}
										onBlur={() => setDescontoTexto(null)}
									/>
									<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-secondary">
										%
									</span>
								</div>
							)}
						</div>
					</Campo>

					{/* O painel de totais é o que o cliente vai ver no rodapé do PDF. */}
					<div className="rounded-xl border border-border bg-bg-neutral/40 p-4">
						<dl className="space-y-1.5 text-sm">
							<div className="flex items-center justify-between">
								<dt className="text-text-secondary">Serviços</dt>
								<dd className="tabular-nums text-text-primary">R$ {formatarMoeda(t.subtotalServicos)}</dd>
							</div>
							<div className="flex items-center justify-between">
								<dt className="text-text-secondary">Produtos</dt>
								<dd className="tabular-nums text-text-primary">R$ {formatarMoeda(t.subtotalProdutos)}</dd>
							</div>
							<div className="flex items-center justify-between border-t border-border pt-1.5">
								<dt className="text-text-secondary">Subtotal</dt>
								<dd className="font-medium tabular-nums text-text-primary">R$ {formatarMoeda(t.subtotal)}</dd>
							</div>
							{t.descontoEmReais > 0 && (
								<div className="flex items-center justify-between">
									<dt className="text-text-secondary">
										Desconto{orc.descontoTipo === "percentual" ? ` (${t.desconto}%)` : ""}
									</dt>
									<dd className="tabular-nums text-error">− R$ {formatarMoeda(t.descontoEmReais)}</dd>
								</div>
							)}
							<div className="flex items-baseline justify-between border-t border-border pt-2.5">
								<dt className="font-semibold text-text-primary">Total</dt>
								<dd className="text-xl font-bold tabular-nums text-text-primary">R$ {formatarMoeda(t.valorTotal)}</dd>
							</div>
						</dl>
					</div>
				</section>

				<Separator />

				{/* ─────────────  Rodapé do documento  ───────────── */}
				<section className="space-y-4">
					<h3 className="text-sm font-semibold text-text-primary">Condições do documento</h3>

					<div className="grid gap-4 md:grid-cols-2">
						<Campo rotulo="Garantia" dica="Aparece no PDF, junto das condições.">
							<Input
								value={orc.garantia ?? ""}
								placeholder="Ex.: 90 dias para o serviço executado"
								// Campo opcional: vazio vira AUSÊNCIA da chave no blob (o app omite,
								// nunca grava null). Ver regra das chaves opcionais.
								onChange={(e) => patch({ garantia: e.target.value.trim() ? e.target.value : undefined })}
							/>
						</Campo>

						<Campo rotulo="Validade do orçamento" dica="DD/MM/AAAA — depois desta data a proposta expira.">
							<Input
								inputMode="numeric"
								placeholder="22/07/2026"
								className="tabular-nums"
								value={orc.validadeOrcamento ?? ""}
								onChange={(e) => {
									const v = mascaraDataBr(e.target.value);
									patch({ validadeOrcamento: v || undefined });
								}}
								aria-invalid={!!orc.validadeOrcamento && !brParaIso(orc.validadeOrcamento)}
							/>
						</Campo>
					</div>

					<Campo rotulo="Condições de pagamento">
						<Textarea
							rows={2}
							value={orc.condicoesPagamento ?? ""}
							placeholder="Ex.: 50% na aprovação, 50% na entrega."
							onChange={(e) => patch({ condicoesPagamento: e.target.value.trim() ? e.target.value : undefined })}
						/>
					</Campo>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium text-text-primary">Formas de pagamento aceitas</legend>
						<div className="flex flex-wrap gap-x-6 gap-y-2.5">
							{formas.map(({ chave, rotulo }) => {
								const id = `forma-${chave}`;
								return (
									<div key={chave} className="flex items-center gap-2">
										<Checkbox
											id={id}
											checked={orc.formasPagamento[chave]}
											onCheckedChange={(v) =>
												patch({ formasPagamento: { ...orc.formasPagamento, [chave]: v === true } })
											}
										/>
										<label htmlFor={id} className="cursor-pointer text-sm text-text-primary">
											{rotulo}
										</label>
									</div>
								);
							})}
						</div>
					</fieldset>

					<Campo rotulo="Informações adicionais">
						<Textarea
							rows={2}
							value={orc.informacoesAdicionais ?? ""}
							placeholder="Observações que o cliente precisa ler."
							onChange={(e) => patch({ informacoesAdicionais: e.target.value.trim() ? e.target.value : undefined })}
						/>
					</Campo>

					<Campo rotulo="Laudo técnico" dica="O diagnóstico que justifica o serviço.">
						<Textarea
							rows={3}
							value={orc.laudoTecnico ?? ""}
							placeholder="Ex.: evaporadora com serpentina obstruída, dreno saturado…"
							onChange={(e) => patch({ laudoTecnico: e.target.value.trim() ? e.target.value : undefined })}
						/>
					</Campo>
				</section>

				{/* Rodapé informativo: o que este formulário NÃO mexeu continua no documento. */}
				{!ehNovo && (
					<p className="flex items-start gap-2 rounded-lg bg-bg-neutral/60 px-3 py-2 text-xs text-text-secondary">
						<ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
						Fotos, assinaturas, sinal e demais campos preenchidos no celular são preservados ao salvar — este formulário
						edita só o que está acima.
					</p>
				)}
			</form>
		</FormDialog>
	);
}
