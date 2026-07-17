/**
 * LISTA DO CATÁLOGO — a casca que produtos e serviços compartilham.
 *
 * As duas páginas (`/catalogo/produtos` e `/catalogo/servicos`) são a MESMA tela:
 * a única diferença é o par de colunas marca/modelo e o texto. Duplicar isso em dois
 * arquivos duplicaria também os 3 estados, a busca e o fluxo de exclusão.
 *
 * REGRAS QUE ESTA TELA HONRA (e por quê):
 * • 3 ESTADOS DE VERDADE — carregando · ERRO (com "Tentar de novo") · vazio. Erro
 *   NUNCA vira "catálogo vazio": o dono acharia que perdeu os preços e recadastraria
 *   tudo por cima.
 * • BUSCA sem acento — "servico" acha "Serviço", "R410" acha "R-410A". Mesmos campos
 *   que o filtro do celular (nome, descrição, marca, modelo).
 * • EXCLUIR é SOFT DELETE (vai para a lixeira) — o diálogo diz isso, sem mentir.
 * • MARGEM na tabela, com a MESMA conta do celular (ver `margemInfo`). Preço abaixo
 *   do custo aparece em vermelho na lista inteira — não só dentro do formulário.
 * • Sem animação decorativa: tabela densa, motion só funcional (hover/foco).
 */
import type { ProdutoItem } from "@dominio";
import {
	AlertTriangle,
	Inbox,
	Lock,
	MoreHorizontal,
	Package,
	Pencil,
	Plus,
	RotateCw,
	Search,
	Trash2,
	Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { useOlliList } from "@/olli/data";
import { useContextoDeEscrita, useExcluir } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import FormItemCatalogo, {
	abaixoDoCusto,
	emReais,
	type ItemCatalogo,
	type LinhaCatalogo,
	linhaParaItem,
	margemInfo,
	mensagemDeErro,
	ROTULO_DO_TIPO,
	TABELA_DO_TIPO,
	type TipoCatalogo,
} from "./FormItemCatalogo";

/** "Marca · Modelo" de um produto. `""` para serviço ou produto sem os dois campos.
 *  O `tipo` vem da rota — nunca se infere pelo formato do objeto (ver FormItemCatalogo). */
function marcaModelo(tipo: TipoCatalogo, item: ItemCatalogo): string {
	if (tipo !== "produto") return "";
	const p = item as ProdutoItem;
	return [p.marca, p.modelo].filter(Boolean).join(" · ");
}

/** `true` se o item casa com o termo JÁ NORMALIZADO. Mesmos campos do filtro do celular. */
function casaBusca(tipo: TipoCatalogo, item: ItemCatalogo, termo: string): boolean {
	const p = tipo === "produto" ? (item as ProdutoItem) : null;
	const campos = [item.nome, item.descricao ?? "", p?.marca ?? "", p?.modelo ?? ""];
	return campos.some((c) => normalizar(c).includes(termo));
}

/** Ignora acento, caixa e hífen: "r410" acha "R-410A", "servico" acha "Serviço". */
const normalizar = (s: string) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[-/.\s]+/g, "")
		.toLowerCase();

const SKELETON_LINHAS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"];

/* ───────────────────────  Peças da linha (fora do render)  ─────────────────── */
/*
 * `CelulaMargem` e `MenuAcoes` moram no ESCOPO DO MÓDULO de propósito. Declaradas
 * dentro do componente, elas seriam um TIPO NOVO a cada render — e o React
 * desmontaria a subárvore. Na prática: o `useOlliList` revalida em segundo plano
 * (staleTime 30s / foco na janela), a lista re-renderiza, e o menu que o usuário
 * tinha acabado de abrir FECHARIA sozinho no meio do clique.
 */

/** Margem na lista. Sem custo NÃO é "0%" — é DESCONHECIDA; escrever 0% mentiria. */
function CelulaMargem({ item }: { item: ItemCatalogo }) {
	const m = margemInfo(item.preco, item.custo);
	if (abaixoDoCusto(item.preco, item.custo)) {
		return (
			<span className="font-medium tabular-nums text-error-dark dark:text-error" title="Preço abaixo do custo">
				{m ? `${m.pct}%` : "prejuízo"}
			</span>
		);
	}
	if (!m) {
		return (
			<span className="text-text-disabled" title="Informe o custo para ver a margem">
				—
			</span>
		);
	}
	return <span className="font-medium tabular-nums text-success-dark dark:text-success">{m.pct}%</span>;
}

/** Editar / Excluir. Menu do Radix: abre no teclado (Enter/Espaço), navega nas setas. */
function MenuAcoes({
	item,
	aoEditar,
	aoExcluir,
}: {
	item: ItemCatalogo;
	aoEditar: (item: ItemCatalogo) => void;
	aoExcluir: (item: ItemCatalogo) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="size-8" aria-label={`Ações de ${item.nome}`}>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuItem onSelect={() => aoEditar(item)}>
					<Pencil className="mr-2 size-4" />
					Editar
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive" onSelect={() => aoExcluir(item)}>
					<Trash2 className="mr-2 size-4" />
					Excluir
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface Props {
	tipo: TipoCatalogo;
}

export default function ListaCatalogo({ tipo }: Props) {
	const tabela = TABELA_DO_TIPO[tipo];
	const rotulo = ROTULO_DO_TIPO[tipo]; // "produto" | "serviço"
	const plural = tipo === "produto" ? "produtos" : "serviços";
	const Icone = tipo === "produto" ? Package : Wrench;

	const { data, isLoading, isError, error, refetch, isFetching } = useOlliList<LinhaCatalogo>(tabela, {
		orderBy: "nome",
		ascending: true,
	});

	const [busca, setBusca] = useState("");
	/** `undefined` = formulário fechado · `null` = novo · item = edição. */
	const [emEdicao, setEmEdicao] = useState<ItemCatalogo | null | undefined>(undefined);
	const [paraExcluir, setParaExcluir] = useState<ItemCatalogo | null>(null);

	const excluir = useExcluir(tabela);

	/*
	 * GATE DE PAPEL — TRÊS estados (O3-31), nunca dois.
	 *
	 * O catálogo é escrita do DONO (`produtos`/`servicos` são "so-dono" em
	 * `TENANT_DA_TABELA`): um membro não-dono que salvasse gravaria no tenant DELE, e
	 * a empresa nunca veria o item.
	 *
	 * Os três estados viram três UIs diferentes, de propósito:
	 *  - MEMBRO CONFIRMADO (`ownerUserId != null`) → esconde as ações + aviso honesto.
	 *  - DONO CONFIRMADO                           → ações liberadas.
	 *  - DESCONHECIDO (carregando/erro)            → ação VISÍVEL porém DESABILITADA.
	 *
	 * O estado desconhecido não some da tela (esconder e reaparecer faria os botões
	 * piscarem a cada carga) e também não libera: antes, `data?.ownerUserId != null`
	 * colapsava carregando/erro no MESMO valor de "sou o dono" e o botão abria o
	 * formulário — o usuário preenchia tudo para tomar um 42501 no submit. Agora ele
	 * vê o botão apagado e o motivo. A trava de dado continua no `useSalvar`
	 * (3 estados) e no RLS; isto aqui é a honestidade da interface.
	 */
	const contextoEscrita = useContextoDeEscrita();
	const permissaoDesconhecida =
		contextoEscrita.isLoading || contextoEscrita.isError || !contextoEscrita.data;
	/** CONFIRMADO como membro não-dono — só aí a tela vira somente-leitura de verdade. */
	const somenteLeitura = contextoEscrita.data?.ownerUserId != null;
	/** Mostra o controle (não pisca enquanto carrega). */
	const podeEditar = !somenteLeitura;
	/** Deixa de fato AGIR — só com o papel confirmado. Desconhecido = desabilitado. */
	const escritaLiberada = !permissaoDesconhecida && !somenteLeitura;

	const itens = useMemo(() => (data ?? []).map((l) => linhaParaItem(tipo, l)), [data, tipo]);

	const filtrados = useMemo(() => {
		const termo = normalizar(busca.trim());
		if (!termo) return itens;
		return itens.filter((i) => casaBusca(tipo, i, termo));
	}, [itens, busca, tipo]);

	// Gravação SUBIU. Se havia busca ativa e o item salvo NÃO casa com o filtro atual,
	// ele sumiria da lista sem explicação — o dono acha que falhou e recadastra (duplica).
	// Limpar a busca traz o item de volta à vista; o toast confirma que subiu.
	const aoSalvarItem = (item: ItemCatalogo) => {
		const termo = normalizar(busca.trim());
		if (termo && !casaBusca(tipo, item, termo)) setBusca("");
		toast.success(`${tipo === "produto" ? "Produto" : "Serviço"} salvo`);
	};

	const confirmarExclusao = () => {
		if (!paraExcluir) return;
		excluir.mutate(paraExcluir, { onSuccess: () => setParaExcluir(null) });
	};

	const pedirExclusao = (item: ItemCatalogo) => {
		excluir.reset(); // limpa o erro da exclusão ANTERIOR — senão ele abre vermelho por cima de um item inocente.
		setParaExcluir(item);
	};

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* ───────────────────────────────  Cabeçalho  ─────────────────────────── */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">
							{tipo === "produto" ? "Produtos" : "Serviços"}
						</h1>
						{!isLoading && !isError && (
							<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
								{filtrados.length}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-sm text-text-secondary">
						{tipo === "produto"
							? "O que você revende. Preço, custo e margem — pronto para entrar num orçamento."
							: "O que você executa. Preço, custo e margem — pronto para entrar num orçamento."}
					</p>
				</div>

				<div className="flex w-full gap-2 sm:w-auto">
					<div className="relative w-full sm:w-64">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled"
						/>
						<Input
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder={`Buscar ${plural}…`}
							aria-label={`Buscar ${plural}`}
							className="h-10 rounded-full pl-10"
						/>
					</div>
					{podeEditar && (
						<Button
							type="button"
							className="h-10 shrink-0 gap-2"
							disabled={!escritaLiberada}
							title={permissaoDesconhecida ? "Verificando suas permissões…" : undefined}
							onClick={() => setEmEdicao(null)}
						>
							<Plus className="size-4" />
							<span className="hidden sm:inline">Novo {rotulo}</span>
							<span className="sm:hidden">Novo</span>
						</Button>
					)}
				</div>
			</div>

			{/* Aviso de permissão — honesto sobre POR QUE não dá para cadastrar/editar. */}
			{somenteLeitura && (
				<div className="mb-4 flex items-start gap-2.5 rounded-xl bg-info/10 px-4 py-3 text-sm text-info-dark dark:text-info-light">
					<Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					<p>
						O catálogo é da empresa, e só o <strong>dono</strong> pode alterá-lo. Você pode consultar os {plural} aqui;
						para cadastrar ou corrigir um {rotulo}, fale com o dono da conta.
					</p>
				</div>
			)}

			{/* ─────────────────────  3 estados: carregando · erro · vazio  ────────── */}
			{isLoading ? (
				<Card className="overflow-hidden p-0">
					<div className="border-b border-border bg-bg-neutral/40 px-4 py-3">
						<Skeleton className="h-3 w-40" />
					</div>
					<div className="divide-y divide-border/60">
						{SKELETON_LINHAS.map((k) => (
							<div key={k} className="flex items-center gap-4 px-4 py-4">
								<Skeleton className="h-3.5 w-1/3" />
								<Skeleton className="h-3.5 w-16" />
								<Skeleton className="ml-auto h-3.5 w-20" />
								<Skeleton className="h-3.5 w-12" />
							</div>
						))}
					</div>
				</Card>
			) : isError ? (
				// ERRO ≠ VAZIO. Dizer "nenhum produto" aqui faria o dono recadastrar o catálogo inteiro.
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
						<AlertTriangle className="size-7 text-error" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar o catálogo</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">{mensagemDeErro(error)}</p>
						<p className="mx-auto mt-2 max-w-sm text-xs text-text-disabled">
							Seus {plural} continuam salvos — isto é uma falha de leitura, não perda de dado.
						</p>
					</div>
					<Button type="button" onClick={() => refetch()} disabled={isFetching} className="gap-2 rounded-full">
						<RotateCw className={cn("size-4", isFetching && "animate-spin")} />
						Tentar de novo
					</Button>
				</Card>
			) : filtrados.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						<Inbox className="size-7 text-text-disabled" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{busca.trim() ? "Nada encontrado" : `Seu catálogo de ${plural} está vazio`}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{busca.trim()
								? "Tente outro termo — a busca olha nome, descrição, marca e modelo."
								: podeEditar
									? `Cadastre um ${rotulo} uma vez e ele passa a estar a um clique de qualquer orçamento.`
									: `Ainda não há ${plural} no catálogo da empresa. Só o dono da conta pode cadastrar.`}
						</p>
					</div>
					{!busca.trim() && podeEditar && (
						<Button
							type="button"
							className="gap-2"
							disabled={!escritaLiberada}
							title={permissaoDesconhecida ? "Verificando suas permissões…" : undefined}
							onClick={() => setEmEdicao(null)}
						>
							<Plus className="size-4" />
							Cadastrar {rotulo}
						</Button>
					)}
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{/* ───────────────────────────  DESKTOP: tabela  ────────────────────── */}
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
									<th scope="col" className="px-4 py-3 font-semibold">
										{tipo === "produto" ? "Produto" : "Serviço"}
									</th>
									{tipo === "produto" && (
										<th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
											Marca / Modelo
										</th>
									)}
									<th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
										Un.
									</th>
									<th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold">
										Custo
									</th>
									<th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold">
										Preço
									</th>
									<th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold">
										Margem
									</th>
									<th scope="col" className="px-2 py-3">
										<span className="sr-only">Ações</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{filtrados.map((item) => (
									<tr
										key={item.id}
										className="border-b border-border/50 transition-colors last:border-0 hover:bg-bg-neutral/40"
									>
										<td className="px-4 py-3.5 align-middle">
											{/* O nome é o alvo de edição — e é um <button>: alcançável por Tab, não só por mouse. */}
											<button
												type="button"
												onClick={() => setEmEdicao(item)}
												className="flex max-w-md flex-col items-start rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
											>
												<span className="flex items-center gap-2 font-medium text-text-primary hover:underline">
													<Icone aria-hidden="true" className="size-4 shrink-0 text-text-disabled" />
													{item.nome || "(sem nome)"}
												</span>
												{item.descricao && (
													<span className="mt-0.5 line-clamp-1 pl-6 text-xs text-text-secondary">{item.descricao}</span>
												)}
											</button>
										</td>

										{tipo === "produto" && (
											<td className="whitespace-nowrap px-4 py-3.5 align-middle text-text-secondary">
												{marcaModelo(tipo, item) || "—"}
											</td>
										)}

										<td className="whitespace-nowrap px-4 py-3.5 align-middle text-text-secondary">{item.unidade}</td>

										<td className="whitespace-nowrap px-4 py-3.5 text-right align-middle tabular-nums text-text-secondary">
											{item.custo != null && item.custo > 0 ? emReais(item.custo) : "—"}
										</td>

										<td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-medium tabular-nums text-text-primary">
											{emReais(item.preco)}
										</td>

										<td className="whitespace-nowrap px-4 py-3.5 text-right align-middle">
											<CelulaMargem item={item} />
										</td>

										<td className="px-2 py-3.5 text-right align-middle">
											{podeEditar && <MenuAcoes item={item} aoEditar={setEmEdicao} aoExcluir={pedirExclusao} />}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* ────────────────────────────  MOBILE: cards  ─────────────────────── */}
					<div className="divide-y divide-border/60 md:hidden">
						{filtrados.map((item) => (
							<div key={item.id} className="p-4">
								<div className="flex items-start justify-between gap-2">
									<button
										type="button"
										onClick={() => setEmEdicao(item)}
										className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
									>
										<span className="flex items-center gap-2 font-medium text-text-primary">
											<Icone aria-hidden="true" className="size-4 shrink-0 text-text-disabled" />
											<span className="truncate">{item.nome || "(sem nome)"}</span>
										</span>
										{marcaModelo(tipo, item) && (
											<span className="mt-0.5 block truncate pl-6 text-xs text-text-secondary">
												{marcaModelo(tipo, item)}
											</span>
										)}
									</button>
									{podeEditar && <MenuAcoes item={item} aoEditar={setEmEdicao} aoExcluir={pedirExclusao} />}
								</div>

								<dl className="mt-3 grid grid-cols-3 gap-x-4">
									<div>
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Preço</dt>
										<dd className="mt-0.5 font-medium tabular-nums text-text-primary">
											{emReais(item.preco)}
											<span className="ml-1 text-xs font-normal text-text-secondary">/{item.unidade}</span>
										</dd>
									</div>
									<div>
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Custo</dt>
										<dd className="mt-0.5 tabular-nums text-text-secondary">
											{item.custo != null && item.custo > 0 ? emReais(item.custo) : "—"}
										</dd>
									</div>
									<div>
										<dt className="text-[11px] uppercase tracking-wide text-text-disabled">Margem</dt>
										<dd className="mt-0.5">
											<CelulaMargem item={item} />
										</dd>
									</div>
								</dl>
							</div>
						))}
					</div>

					<div className="border-t border-border px-4 py-2.5 text-xs text-text-secondary">
						{filtrados.length} {filtrados.length === 1 ? rotulo : plural}
						{busca.trim() && itens.length !== filtrados.length && ` de ${itens.length}`}
					</div>
				</Card>
			)}

			{/* ──────────────────────────────  Formulário  ──────────────────────────── */}
			{emEdicao !== undefined && (
				<FormItemCatalogo
					aberto
					tipo={tipo}
					item={emEdicao}
					aoFechar={() => setEmEdicao(undefined)}
					aoSalvar={aoSalvarItem}
				/>
			)}

			{/* ───────────────────────────────  Exclusão  ───────────────────────────── */}
			<ConfirmarExclusao
				aberto={!!paraExcluir}
				aoFechar={() => setParaExcluir(null)}
				aoConfirmar={confirmarExclusao}
				nome={paraExcluir?.nome ?? ""}
				tipo={rotulo}
				aviso={`Orçamentos que já usam este ${rotulo} NÃO mudam — eles guardam o preço do dia em que foram feitos. Ele só deixa de aparecer para novos orçamentos.`}
				excluindo={excluir.isPending}
				erro={excluir.isError ? mensagemDeErro(excluir.error) : null}
			/>
		</div>
	);
}
