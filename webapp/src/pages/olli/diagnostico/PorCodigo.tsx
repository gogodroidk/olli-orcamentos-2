import { ExternalLink, Search, Sparkles, Wrench, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EsqueletoLista, EstadoErro, EstadoVazio } from "./componentes";
import {
	filtrarCodigos,
	type HvacCodigo,
	marcasDaBase,
	useBaseHvac,
	varianteConfianca,
	varianteSeveridade,
} from "./hvac";

/** Sentinela do seletor — Radix não aceita SelectItem com value "". */
const TODAS = "__todas__";
/** Teto de cartões renderizados de uma vez (a base tem centenas; protege o DOM). */
const MAX_RENDER = 80;

export function PorCodigo({ aoAprofundar }: { aoAprofundar: (c: HvacCodigo) => void }) {
	const base = useBaseHvac();
	const [marca, setMarca] = useState<string>(TODAS);
	const [termo, setTermo] = useState("");

	const marcas = useMemo(() => (base.data ? marcasDaBase(base.data) : []), [base.data]);

	const resultados = useMemo(() => {
		if (!base.data) return [];
		return filtrarCodigos(base.data, { marca: marca === TODAS ? "" : marca, termo });
	}, [base.data, marca, termo]);

	const temFiltro = termo.trim().length > 0 || marca !== TODAS;
	const limpar = () => {
		setTermo("");
		setMarca(TODAS);
	};

	return (
		<div className="space-y-4">
			{/* Barra de busca — marca + texto livre, lado a lado no desktop. */}
			<Card className="p-4">
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="sm:w-56">
						<Select value={marca} onValueChange={setMarca} disabled={base.isLoading || base.isError}>
							<SelectTrigger className="w-full" aria-label="Filtrar por marca">
								<SelectValue placeholder="Todas as marcas" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={TODAS}>Todas as marcas</SelectItem>
								{marcas.map((m) => (
									<SelectItem key={m.marca} value={m.marca}>
										{m.marca} ({m.total})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="relative flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
						<Input
							value={termo}
							onChange={(e) => setTermo(e.target.value)}
							disabled={base.isLoading || base.isError}
							placeholder="Código no display (ex.: E5, F0, U4) ou o que está acontecendo"
							className="pl-9 pr-9"
							aria-label="Buscar por código ou falha"
						/>
						{termo && (
							<button
								type="button"
								onClick={() => setTermo("")}
								aria-label="Limpar busca"
								className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-secondary hover:text-text-primary"
							>
								<X className="size-4" />
							</button>
						)}
					</div>
				</div>

				{/* Linha de status honesta: quantos códigos, e o filtro ativo. */}
				<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
					{base.isLoading ? (
						<span>Carregando a base oficial de códigos…</span>
					) : base.isError ? (
						<span className="text-error-dark dark:text-error">Base indisponível agora.</span>
					) : (
						<>
							<span>
								<strong className="font-semibold text-text-primary">{base.data?.length ?? 0}</strong> códigos
								oficiais na base
							</span>
							{temFiltro && (
								<>
									<span aria-hidden>·</span>
									<span>
										{resultados.length} resultado{resultados.length === 1 ? "" : "s"}
									</span>
									<button
										type="button"
										onClick={limpar}
										className="font-medium text-primary hover:underline"
									>
										limpar filtro
									</button>
								</>
							)}
						</>
					)}
				</div>
			</Card>

			{/* Corpo: 3 estados. */}
			{base.isLoading ? (
				<EsqueletoLista />
			) : base.isError ? (
				<EstadoErro
					titulo="Não consegui carregar a base de códigos"
					mensagem="Pode ter sido a conexão ou sua sessão. Tente de novo."
					aoTentar={() => base.refetch()}
				/>
			) : resultados.length === 0 ? (
				<EstadoVazio
					titulo="Nenhum código encontrado"
					mensagem={
						temFiltro
							? "Ajuste a marca ou o termo. Se não achar aqui, descreva o sintoma na aba Por sintoma — a OLLI raciocina em cima do caso."
							: "Comece digitando um código ou escolhendo uma marca."
					}
					acao={
						temFiltro ? (
							<Button variant="outline" onClick={limpar}>
								Limpar filtro
							</Button>
						) : undefined
					}
				/>
			) : (
				<div className="space-y-3">
					{resultados.slice(0, MAX_RENDER).map((c, i) => (
						<CartaoCodigo key={c.id} codigo={c} indice={i} aoAprofundar={aoAprofundar} />
					))}
					{resultados.length > MAX_RENDER && (
						<p className="px-1 pt-1 text-center text-xs text-text-secondary">
							Mostrando os {MAX_RENDER} primeiros de {resultados.length}. Refine a busca para ver o resto.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/** Um código da base, com causa/ação/severidade/fonte e atalho para a IA. */
function CartaoCodigo({
	codigo: c,
	indice,
	aoAprofundar,
}: {
	codigo: HvacCodigo;
	indice: number;
	aoAprofundar: (c: HvacCodigo) => void;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, delay: Math.min(indice * 0.03, 0.3) }}
		>
			<Card className="overflow-hidden p-0">
				<div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
					<span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-sm font-bold text-primary-dark dark:text-primary-light">
						{c.codigo || "—"}
					</span>
					<Badge variant="secondary">{c.marca}</Badge>
					{c.familia && <span className="text-xs text-text-secondary">{c.familia}</span>}
					<div className="ml-auto flex items-center gap-1.5">
						{c.severidade && (
							<Badge variant={varianteSeveridade(c.severidade)}>{c.severidade}</Badge>
						)}
					</div>
				</div>

				<div className="space-y-3 p-4">
					{c.falha && <p className="font-semibold text-text-primary">{c.falha}</p>}

					{c.causa && (
						<Linha titulo="Causa provável" texto={c.causa} />
					)}
					{c.acao && (
						<Linha
							titulo="Primeira ação"
							texto={c.acao}
							Icone={Wrench}
							destaque
						/>
					)}

					<div className="flex flex-wrap items-center gap-2 pt-1">
						{c.confianca && (
							<Badge variant={varianteConfianca(c.confianca)}>Confiança: {c.confianca}</Badge>
						)}
						{c.fonte_id && (
							<span className="text-xs text-text-secondary">Fonte {c.fonte_id}</span>
						)}
						<div className="ml-auto flex items-center gap-2">
							{c.url && (
								<a
									href={c.url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
								>
									Documentação
									<ExternalLink className="size-3" />
								</a>
							)}
							<Button size="sm" variant="outline" className="gap-1.5" onClick={() => aoAprofundar(c)}>
								<Sparkles className="size-3.5" />
								Aprofundar com a OLLI
							</Button>
						</div>
					</div>
				</div>
			</Card>
		</motion.div>
	);
}

function Linha({
	titulo,
	texto,
	Icone,
	destaque,
}: {
	titulo: string;
	texto: string;
	Icone?: typeof Wrench;
	destaque?: boolean;
}) {
	return (
		<div
			className={
				destaque
					? "rounded-lg border border-primary/20 bg-primary/5 p-3"
					: undefined
			}
		>
			<p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
				{Icone && <Icone className="size-3.5" />}
				{titulo}
			</p>
			<p className="text-sm text-text-primary">{texto}</p>
		</div>
	);
}
