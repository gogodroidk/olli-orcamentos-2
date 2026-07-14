/**
 * FORMULÁRIO DO CATÁLOGO — produto e serviço na MESMA casca.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POR QUE UM SÓ ARQUIVO PARA OS DOIS
 * ═══════════════════════════════════════════════════════════════════════════════
 * `ProdutoItem` é literalmente `ServicoItem` + `marca` + `modelo` (ver @dominio).
 * Duplicar o formulário significaria manter duas cópias da mesma conta de margem,
 * das mesmas regras de omissão de chave e do mesmo aviso de preço — e elas
 * divergiriam. Aqui a única diferença é um bloco de dois campos.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AS QUATRO ARMADILHAS QUE ESTE ARQUIVO EXISTE PARA EVITAR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 1. FOTO — o técnico tira a foto no CELULAR e ela vira `fotoUri` (`file://…`).
 *    O painel não sabe exibir nem trocar essa foto (não há bucket no Storage), mas
 *    `produtoToRow` grava `foto_uri: p.fotoUri ?? null`: montar o objeto só com os
 *    campos da TELA APAGARIA a foto do celular a cada edição feita na web. Por isso
 *    `montarItem` PRESERVA `fotoUri` (e `criadoEm`, e `excluidoEm`) do registro base.
 *
 * 2. CHAVE AUSENTE ≠ NULL — o app omite a chave quando o campo está vazio
 *    (`JSON.stringify` descarta `undefined`). `custo` vazio no app é
 *    `custo: v || undefined`; aqui, `custo === 0` vira ausência, igual.
 *
 * 3. UNIDADE — `UNIDADES` é um VALOR do app (`../src/types`), e o painel só pode
 *    IMPORTAR TIPOS de lá: o dev server do Vite tem `fs.allow` na pasta `webapp/`
 *    (ela tem lockfile próprio), então um import de runtime cruzando essa fronteira
 *    dá 403 no browser. Solução sem cópia cega: o mapa de rótulos abaixo é
 *    `Record<UnidadeMedida, string>` — se o app criar/renomear uma unidade, ESTE
 *    ARQUIVO PARA DE COMPILAR (chave faltando/sobrando). Divergência vira erro.
 *
 * 4. PREÇO ZERADO — o app deixa salvar, mas só depois de um alerta explícito
 *    ("entrará de graça em qualquer orçamento"). Replicamos: o primeiro submit
 *    avisa, o segundo salva. Bloquear de vez impediria EDITAR um item que o celular
 *    já criou com preço 0 — o usuário não conseguiria nem corrigir o nome.
 */
import type { ProdutoItem, ServicoItem, UnidadeMedida } from "@dominio";
import { AlertTriangle, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Campo, CampoMoeda } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import { round2 } from "@/olli/components/totais";
import { novoId } from "@/olli/contrato";
import { agoraIso } from "@/olli/datas";
import { useSalvar } from "@/olli/mutacoes";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";

/* ──────────────────────────────  Tipos e tabela  ───────────────────────────── */

export type TipoCatalogo = "produto" | "servico";

/** Os dois itens do catálogo. `ProdutoItem` = `ServicoItem` + marca/modelo. */
export type ItemCatalogo = ProdutoItem | ServicoItem;

/** Tabela do OLLI por tipo. Bate com `TabelaOlli` do contrato. */
export const TABELA_DO_TIPO = { produto: "produtos", servico: "servicos" } as const;

export const ROTULO_DO_TIPO: Record<TipoCatalogo, string> = { produto: "produto", servico: "serviço" };

/** `true` quando o item é um produto — e só então `marca`/`modelo` existem. */
export function ehProduto(item: ItemCatalogo | null | undefined): item is ProdutoItem {
	return !!item && "marca" in item;
}

/* ─────────────────────────────────  Unidades  ──────────────────────────────── */

/**
 * Rótulos das unidades. É um `Record<UnidadeMedida, …>` DE PROPÓSITO: o TypeScript
 * exige a lista COMPLETA e recusa chave que não exista no domínio (ver nota 3 no
 * cabeçalho). A ordem é a mesma de `UNIDADES` no app.
 */
export const UNIDADES_ROTULO: Record<UnidadeMedida, string> = {
	un: "un — unidade",
	m: "m — metro",
	"m²": "m² — metro quadrado",
	"m³": "m³ — metro cúbico",
	kg: "kg — quilo",
	L: "L — litro",
	h: "h — hora",
	dia: "dia — diária",
	pç: "pç — peça",
	cx: "cx — caixa",
};

const UNIDADES_DO_DOMINIO = Object.keys(UNIDADES_ROTULO) as UnidadeMedida[];

/** Unidade padrão do app quando o campo não foi preenchido (`unidade: editing.unidade ?? 'un'`). */
export const UNIDADE_PADRAO: UnidadeMedida = "un";

/* ────────────────────────────  Linha ↔ domínio  ────────────────────────────── */

/**
 * A LINHA do Supabase (`produtos` / `servicos`) — snake_case, colunas anuláveis.
 * Não é o tipo de domínio (não pode ser: `foto_uri` ≠ `fotoUri`); é o inverso exato
 * de `produtoToRow`/`servicoToRow` em `contrato.ts`. `marca`/`modelo` só existem em
 * `produtos`.
 */
export interface LinhaCatalogo {
	id: string;
	nome: string;
	descricao: string | null;
	preco: number | null;
	custo: number | null;
	unidade: string | null;
	marca?: string | null;
	modelo?: string | null;
	foto_uri: string | null;
	criado_em: string;
	atualizado_em: string | null;
	excluido_em: string | null;
}

/**
 * Linha → objeto de DOMÍNIO. O retorno é tipado como `ItemCatalogo`, então se o app
 * acrescentar um campo obrigatório isto para de compilar em vez de gravar um objeto
 * pela metade. Chave ausente continua AUSENTE (nunca vira `null` — ver nota 2).
 */
export function linhaParaItem(tipo: TipoCatalogo, l: LinhaCatalogo): ItemCatalogo {
	const item: ServicoItem = {
		id: l.id,
		nome: l.nome,
		preco: l.preco ?? 0,
		unidade: l.unidade || UNIDADE_PADRAO,
		criadoEm: l.criado_em,
	};
	if (l.descricao) item.descricao = l.descricao;
	if (l.custo != null) item.custo = l.custo;
	if (l.foto_uri) item.fotoUri = l.foto_uri;
	if (l.atualizado_em) item.atualizadoEm = l.atualizado_em;
	if (l.excluido_em) item.excluidoEm = l.excluido_em;

	if (tipo === "produto") {
		const p: ProdutoItem = { ...item };
		if (l.marca) p.marca = l.marca;
		if (l.modelo) p.modelo = l.modelo;
		return p;
	}
	return item;
}

/* ────────────────────────────────  Margem  ─────────────────────────────────── */

/**
 * Margem sobre o PREÇO DE VENDA — `(preco - custo) / preco`. Fórmula copiada de
 * `src/screens/desktop/produtoMargem.ts` (`margemInfo`), inclusive o arredondamento:
 * o mesmo produto tem que mostrar o MESMO "62%" no celular e no painel. Trocar por
 * markup (`lucro / custo`) daria outro número na mesma tela do mesmo dono.
 *
 * `null` quando não dá para calcular (sem custo, ou preço 0 — divisão por zero).
 */
export function margemInfo(preco?: number, custo?: number): { pct: number; lucro: number } | null {
	if (!preco || !custo || custo <= 0) return null;
	return { pct: Math.round(((preco - custo) / preco) * 100), lucro: round2(preco - custo) };
}

/** Preço abaixo do custo — inclui o caso preço 0, que `margemInfo` não cobre. */
export function abaixoDoCusto(preco?: number, custo?: number): boolean {
	return !!custo && custo > 0 && (preco ?? 0) < custo;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const emReais = (v: number) => BRL.format(Number.isFinite(v) ? v : 0);

/* ─────────────────────────────  Erros legíveis  ────────────────────────────── */

/**
 * Traduz o erro do Supabase SEM escondê-lo. `produtos` e `servicos` NÃO estão em
 * `TABELAS_DO_TENANT_DO_DONO` (contrato.ts): o catálogo é escrita do DONO. Um técnico
 * que tentar salvar leva um 42501 do RLS — e "new row violates row-level security
 * policy" não diz nada a um instalador de ar-condicionado.
 */
export function mensagemDeErro(e: unknown): string {
	const err = e as { message?: string; code?: string } | null;
	const bruto = err?.message ?? "";
	if (err?.code === "42501" || /row-level security|permission denied/i.test(bruto)) {
		return "Seu usuário não tem permissão para mexer no catálogo. Produtos e serviços são editados pelo dono da conta.";
	}
	if (/failed to fetch|network|fetch failed/i.test(bruto)) {
		return "Não consegui falar com o servidor. Verifique a conexão e tente de novo.";
	}
	return bruto || "Não foi possível salvar agora. Tente de novo.";
}

/* ──────────────────────────────  Rascunho (form)  ──────────────────────────── */

interface Rascunho {
	nome: string;
	descricao: string;
	preco: number;
	/** 0 = NÃO INFORMADO (o app grava `custo: v || undefined`). Ver nota 2 do cabeçalho. */
	custo: number;
	unidade: string;
	marca: string;
	modelo: string;
}

function itemParaRascunho(item?: ItemCatalogo | null): Rascunho {
	return {
		nome: item?.nome ?? "",
		descricao: item?.descricao ?? "",
		preco: item?.preco ?? 0,
		custo: item?.custo ?? 0,
		unidade: item?.unidade || UNIDADE_PADRAO,
		marca: (ehProduto(item) && item.marca) || "",
		modelo: (ehProduto(item) && item.modelo) || "",
	};
}

/**
 * Rascunho → objeto de DOMÍNIO pronto para o `useSalvar`.
 *
 * `base` é o registro que está sendo EDITADO. Ele carrega o que a tela não mostra
 * (`fotoUri`, `criadoEm`, `excluidoEm`) — e é justamente isso que não pode sumir.
 */
export function montarItem(tipo: TipoCatalogo, r: Rascunho, base?: ItemCatalogo | null): ItemCatalogo {
	const agora = agoraIso();
	const item: ServicoItem = {
		id: base?.id ?? novoId(),
		nome: r.nome.trim(),
		preco: r.preco,
		unidade: r.unidade || UNIDADE_PADRAO,
		criadoEm: base?.criadoEm ?? agora,
		atualizadoEm: agora,
	};

	const descricao = r.descricao.trim();
	if (descricao) item.descricao = descricao;
	if (r.custo > 0) item.custo = r.custo;
	// Campos que a web não edita mas o celular preenche — preservar ou apagar (nota 1).
	if (base?.fotoUri) item.fotoUri = base.fotoUri;
	if (base?.excluidoEm) item.excluidoEm = base.excluidoEm;

	if (tipo === "produto") {
		const p: ProdutoItem = { ...item };
		const marca = r.marca.trim();
		const modelo = r.modelo.trim();
		if (marca) p.marca = marca;
		if (modelo) p.modelo = modelo;
		return p;
	}
	return item;
}

/* ───────────────────────────────  Componente  ──────────────────────────────── */

interface Props {
	aberto: boolean;
	tipo: TipoCatalogo;
	/** Registro em edição. `null`/ausente = criar novo. */
	item?: ItemCatalogo | null;
	aoFechar: () => void;
	/** Chamado só quando a gravação SUBIU (para a lista dar o feedback certo). */
	aoSalvar?: (item: ItemCatalogo) => void;
}

export default function FormItemCatalogo({ aberto, tipo, item, aoFechar, aoSalvar }: Props) {
	const idBase = useId();
	const formId = `form-catalogo-${idBase}`;
	const rotulo = ROTULO_DO_TIPO[tipo];
	const editando = !!item;

	const [r, setR] = useState<Rascunho>(() => itemParaRascunho(item));
	const [erroNome, setErroNome] = useState<string | null>(null);
	/** O submit que avisa do preço zerado NÃO salva; o próximo salva (nota 4). */
	const [confirmaPrecoZero, setConfirmaPrecoZero] = useState(false);

	const salvar = useSalvar(TABELA_DO_TIPO[tipo]);
	const resetarMutacao = salvar.reset;

	// Reabrir o diálogo (ou trocar de registro) tem que zerar o formulário: sem isto,
	// o rascunho do item anterior vaza para o próximo e o usuário salva o nome errado —
	// e o erro da gravação passada continuaria vermelho embaixo de um item novo.
	useEffect(() => {
		if (!aberto) return;
		setR(itemParaRascunho(item));
		setErroNome(null);
		setConfirmaPrecoZero(false);
		resetarMutacao();
	}, [aberto, item, resetarMutacao]);

	const margem = useMemo(() => margemInfo(r.preco, r.custo), [r.preco, r.custo]);
	const prejuizo = abaixoDoCusto(r.preco, r.custo);
	const precoZerado = r.preco <= 0;

	/** Unidade legada (veio do celular fora da lista): mantém como opção em vez de trocá-la sozinha. */
	const opcoesUnidade = useMemo(() => {
		const atual = r.unidade;
		const conhecida = (UNIDADES_DO_DOMINIO as string[]).includes(atual);
		return conhecida || !atual ? UNIDADES_DO_DOMINIO : [...UNIDADES_DO_DOMINIO, atual];
	}, [r.unidade]);

	const enviar = (e: React.FormEvent) => {
		e.preventDefault();
		if (salvar.isPending) return;

		if (!r.nome.trim()) {
			setErroNome(`Dê um nome ao ${rotulo} — é como ele aparece no orçamento do cliente.`);
			return;
		}
		setErroNome(null);

		// Preço 0: avisa uma vez, salva na segunda (nota 4 do cabeçalho).
		if (precoZerado && !confirmaPrecoZero) {
			setConfirmaPrecoZero(true);
			return;
		}

		const objeto = montarItem(tipo, r, item);
		salvar.mutate(objeto, {
			onSuccess: () => {
				aoSalvar?.(objeto);
				aoFechar();
			},
		});
	};

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			titulo={editando ? `Editar ${rotulo}` : `Novo ${rotulo}`}
			descricao={
				editando
					? "As mudanças valem para os PRÓXIMOS orçamentos. Documentos já emitidos guardam o preço do dia em que foram feitos."
					: `Este ${rotulo} fica disponível para adicionar em qualquer orçamento.`
			}
			formId={formId}
			salvando={salvar.isPending}
			erro={salvar.isError ? mensagemDeErro(salvar.error) : null}
			rotuloSalvar={precoZerado && confirmaPrecoZero ? "Salvar mesmo assim" : "Salvar"}
		>
			<form id={formId} onSubmit={enviar} className="space-y-4" noValidate>
				<Campo rotulo="Nome" obrigatorio erro={erroNome ?? undefined}>
					<Input
						// Foco inicial no primeiro campo: é um diálogo de propósito único, e o
						// leitor de tela anuncia o rótulo ao receber o foco.
						autoFocus
						value={r.nome}
						onChange={(e) => setR((p) => ({ ...p, nome: e.target.value }))}
						placeholder={
							tipo === "produto" ? "Ex.: Fluido refrigerante R-410A" : "Ex.: Instalação de split 12.000 BTUs"
						}
						// O texto do erro fica no <Campo>, com role="alert" — o leitor de tela o anuncia sozinho.
						aria-invalid={!!erroNome}
						maxLength={120}
					/>
				</Campo>

				<Campo rotulo="Descrição" dica="Aparece embaixo do nome no orçamento. Opcional.">
					<Textarea
						value={r.descricao}
						onChange={(e) => setR((p) => ({ ...p, descricao: e.target.value }))}
						placeholder={
							tipo === "produto" ? "Especificação, embalagem, garantia…" : "O que está incluso, prazo, garantia…"
						}
						rows={3}
						maxLength={500}
					/>
				</Campo>

				{tipo === "produto" && (
					<div className="grid gap-4 sm:grid-cols-2">
						<Campo rotulo="Marca">
							<Input
								value={r.marca}
								onChange={(e) => setR((p) => ({ ...p, marca: e.target.value }))}
								placeholder="Ex.: Midea"
								maxLength={60}
							/>
						</Campo>
						<Campo rotulo="Modelo">
							<Input
								value={r.modelo}
								onChange={(e) => setR((p) => ({ ...p, modelo: e.target.value }))}
								placeholder="Ex.: 12.000 BTUs"
								maxLength={60}
							/>
						</Campo>
					</div>
				)}

				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="Preço de venda" obrigatorio dica="O que o cliente paga.">
						<CampoMoeda
							valor={r.preco}
							aoMudar={(v) => {
								setR((p) => ({ ...p, preco: v }));
								setConfirmaPrecoZero(false); // mudou o preço → o aviso tem que ser reconquistado.
							}}
							disabled={salvar.isPending}
						/>
					</Campo>

					<Campo rotulo="Custo" dica="Quanto ELE te custa. Fica só para você — nunca sai no orçamento.">
						<CampoMoeda
							valor={r.custo}
							aoMudar={(v) => setR((p) => ({ ...p, custo: v }))}
							disabled={salvar.isPending}
						/>
					</Campo>
				</div>

				{/*
				 * MARGEM / PREJUÍZO / PREÇO ZERADO — uma única região viva (`aria-live="polite"`):
				 * quem não vê a tela recebe o novo número de margem ao terminar de digitar o valor,
				 * sem ser interrompido no meio da digitação. Nenhum destes avisos BLOQUEIA o salvar
				 * (vender no prejuízo é decisão do dono — brinde, ajuste, desova de estoque).
				 */}
				<div aria-live="polite" className="empty:hidden">
					{margem && !prejuizo && (
						<p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-text-primary">
							<TrendingUp aria-hidden="true" className="size-4 shrink-0 text-success" />
							<span>
								Margem de <strong className="font-semibold tabular-nums">{margem.pct}%</strong> · Lucro de{" "}
								<strong className="font-semibold tabular-nums">{emReais(margem.lucro)}</strong> por{" "}
								{r.unidade || UNIDADE_PADRAO}.
							</span>
						</p>
					)}

					{prejuizo && (
						<p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
							<TrendingDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
							<span>
								Preço <strong className="font-semibold">abaixo do custo</strong>: você perde{" "}
								<strong className="font-semibold tabular-nums">{emReais(round2(r.custo - r.preco))}</strong> a cada{" "}
								{r.unidade || UNIDADE_PADRAO} vendida.
								{margem && ` (margem de ${margem.pct}%)`} Dá para salvar assim — só confira se é o que você quer.
							</span>
						</p>
					)}

					{precoZerado && (
						<p
							className={cn(
								"mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-text-primary",
								confirmaPrecoZero ? "bg-error/10" : "bg-bg-neutral",
							)}
						>
							<AlertTriangle
								aria-hidden="true"
								className={cn("mt-0.5 size-4 shrink-0", confirmaPrecoZero ? "text-error" : "text-text-disabled")}
							/>
							<span>
								Preço zerado — este {rotulo} entra <strong className="font-semibold">de graça</strong> em qualquer
								orçamento.
								{confirmaPrecoZero && " Clique em “Salvar mesmo assim” para confirmar."}
							</span>
						</p>
					)}
				</div>

				<Campo rotulo="Unidade de medida" dica="Como o item é cobrado no orçamento (por hora, por metro, por peça…).">
					<Select value={r.unidade} onValueChange={(v) => setR((p) => ({ ...p, unidade: v }))}>
						<SelectTrigger className="w-full" aria-label="Unidade de medida">
							<SelectValue placeholder="Selecionar unidade" />
						</SelectTrigger>
						<SelectContent>
							{opcoesUnidade.map((u) => (
								<SelectItem key={u} value={u}>
									{UNIDADES_ROTULO[u as UnidadeMedida] ?? `${u} — (unidade antiga)`}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Campo>

				{salvar.isPending && (
					<p className="flex items-center gap-2 text-xs text-text-secondary">
						<Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
						Gravando no seu catálogo…
					</p>
				)}
			</form>
		</FormDialog>
	);
}
