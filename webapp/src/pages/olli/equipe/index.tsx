/**
 * EQUIPE — quem tem acesso à sua conta OLLI.
 *
 * Antes era a lista genérica crua (colunas de UUID, sem cara de nada). Agora é
 * uma tela de verdade: cabeçalho com contador, cartões ricos por membro (avatar
 * com iniciais, nome/e-mail, papel, status) e um botão "Convidar" que explica o
 * fluxo real em vez de sumir num "em breve".
 *
 * 3 estados sempre: carregando (skeleton) · erro (com "Tentar de novo") · vazio
 * real (conta pessoal, sem organização — aí a equipe É só você).
 */
import { AlertTriangle, RotateCw, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import ConvidarDialog from "./ConvidarDialog";
import { type MembroEquipe, PAPEL_LABEL, type Papel, useEquipe } from "./useEquipe";

const SKELETON_CARDS = ["sk-1", "sk-2", "sk-3", "sk-4"];

/** Cor do badge por papel — dono/admin em destaque, o resto neutro. */
const PAPEL_VARIANTE: Record<Papel, "default" | "info" | "secondary"> = {
	owner: "default",
	admin: "info",
	gestor: "secondary",
	tecnico: "secondary",
};

function iniciais(nome?: string, email?: string): string {
	const base = (nome || email || "?").trim();
	if (!base) return "?";
	const partes = base
		.replace(/@.*/, "")
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (partes.length === 0) return base[0]?.toUpperCase() ?? "?";
	if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
	return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

/** Paleta estável por avatar, derivada do userId — não pisca de cor a cada render. */
const CORES_AVATAR = [
	{ bg: "bg-primary/15", text: "text-primary" },
	{ bg: "bg-info/15", text: "text-info-dark dark:text-info-light" },
	{ bg: "bg-success/15", text: "text-success-dark dark:text-success-light" },
	{ bg: "bg-warning/15", text: "text-warning-dark dark:text-warning-light" },
];

function corDoAvatar(userId: string) {
	let soma = 0;
	for (let i = 0; i < userId.length; i++) soma += userId.charCodeAt(i);
	return CORES_AVATAR[soma % CORES_AVATAR.length];
}

function CartaoMembro({ membro }: { membro: MembroEquipe }) {
	const cor = corDoAvatar(membro.userId);
	const nomeExibido = membro.nome || membro.email || `Membro ${membro.userId.slice(0, 8)}`;

	return (
		<Card className="flex-row items-center gap-4 p-4">
			<div
				className={cn(
					"flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
					cor.bg,
					cor.text,
				)}
				aria-hidden="true"
			>
				{iniciais(membro.nome, membro.email)}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-semibold text-text-primary">
						{nomeExibido}
						{membro.souEu && <span className="ml-1.5 font-normal text-text-secondary">(você)</span>}
					</p>
				</div>
				{membro.email && membro.nome && (
					<p className="truncate text-sm text-text-secondary">{membro.email}</p>
				)}
			</div>

			<div className="flex shrink-0 flex-col items-end gap-1.5">
				<Badge variant={PAPEL_VARIANTE[membro.papel]} shape="square">
					{PAPEL_LABEL[membro.papel]}
				</Badge>
				<Badge variant={membro.ativo ? "success" : "outline"} shape="square" className="gap-1">
					<span
						className={cn("size-1.5 rounded-full", membro.ativo ? "bg-success" : "bg-text-disabled")}
						aria-hidden="true"
					/>
					{membro.ativo ? "Ativo" : "Inativo"}
				</Badge>
			</div>
		</Card>
	);
}

export default function EquipePage() {
	const { data, isLoading, isError, error, refetch } = useEquipe();
	const [convidarAberto, setConvidarAberto] = useState(false);

	const membros = data?.membros ?? [];
	const orgId = data?.orgId ?? null;

	return (
		<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
			{/* Cabeçalho */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">Equipe</h1>
						{!isLoading && !isError && (
							<Badge variant="default" className="rounded-full px-2.5 tabular-nums">
								{membros.length}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-sm text-text-secondary">
						{data?.orgNome
							? `Quem tem acesso à conta de ${data.orgNome}.`
							: "Quem tem acesso à sua conta OLLI."}
					</p>
				</div>
				<Button type="button" onClick={() => setConvidarAberto(true)} className="gap-2 shrink-0">
					<UserPlus className="size-4" />
					Convidar
				</Button>
			</div>

			{/* 3 estados: carregando | erro | vazio | dados */}
			{isLoading ? (
				<div className="space-y-3">
					{SKELETON_CARDS.map((k) => (
						<Card key={k} className="flex-row items-center gap-4 p-4">
							<Skeleton className="size-12 shrink-0 rounded-full" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-40" />
								<Skeleton className="h-3 w-56" />
							</div>
							<Skeleton className="h-6 w-20 rounded-md" />
						</Card>
					))}
				</div>
			) : isError ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
						<AlertTriangle className="size-7 text-error" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">Não foi possível carregar a equipe</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{(error as Error)?.message ?? "Erro ao consultar os dados."}
						</p>
					</div>
					<button
						type="button"
						onClick={() => refetch()}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
					>
						<RotateCw className="size-4" />
						Tentar de novo
					</button>
				</Card>
			) : membros.length === 0 ? (
				<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-bg-neutral">
						<Users className="size-7 text-text-disabled" />
					</div>
					<div>
						<p className="text-base font-semibold text-text-primary">
							{orgId ? "Nenhum membro por aqui ainda" : "Sua conta ainda é só sua"}
						</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
							{orgId
								? "Convide alguém para dividir o trabalho — orçamentos, agenda e clientes."
								: "Convide alguém para trabalhar com você. Assim que a primeira pessoa aceitar, sua conta vira uma empresa com equipe."}
						</p>
					</div>
					<Button type="button" onClick={() => setConvidarAberto(true)} className="gap-2">
						<UserPlus className="size-4" />
						Convidar
					</Button>
				</Card>
			) : (
				<div className="space-y-3">
					{membros.map((m) => (
						<CartaoMembro key={m.userId} membro={m} />
					))}
				</div>
			)}

			<ConvidarDialog aberto={convidarAberto} aoFechar={() => setConvidarAberto(false)} />
		</div>
	);
}
