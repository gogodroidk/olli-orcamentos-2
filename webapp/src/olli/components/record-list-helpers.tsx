import type { MouseEvent as EventoDeMouse, ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { cn } from "@/utils";

/** Variantes de cor do Badge (shadcn) usadas para status. Exportado: telas com um
 *  mapa de situação FECHADO e conhecido (ex.: equipamentos) devem montar seu próprio
 *  `Record<Situacao, BadgeVariant>` explícito em vez de confiar no regex genérico
 *  abaixo — que casa por palavra-chave e pode errar em enums que ele não previu
 *  (ver `getStatusVariant`: "desativado" cai errado porque contém "ativ"). */
export type BadgeVariant =
	| "default"
	| "secondary"
	| "destructive"
	| "info"
	| "warning"
	| "success"
	| "error"
	| "outline";

/** Uma coluna é "status" quando a chave fala de status/situação. */
export function isStatusKey(key: string): boolean {
	return /status|situacao|situação/i.test(key);
}

/** Uma coluna é "dinheiro" quando a chave é valor/total/preço/custo/subtotal. */
export function isMoneyKey(key: string): boolean {
	return /(valor|total|preco|preço|custo|subtotal)/i.test(key);
}

/** Uma coluna é "nome de pessoa/empresa" — ganha mini-avatar. */
export function isNameKey(key: string): boolean {
	return (
		/(^|_)(nome|cliente_nome|razao_social|razão_social|fantasia|responsavel|responsável)$/i.test(key) ||
		/nome/i.test(key)
	);
}

/** Iniciais (até 2) de um nome, para o fallback do avatar. */
export function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Mapeia o valor cru de um status para uma variante de cor por palavra-chave.
 * aprovado/convertido/pago → verde/menta · recusado/cancelado → vermelho ·
 * enviado/em_negociacao → azul · pendente/aguardando → amarelo · rascunho → cinza.
 */
export function getStatusVariant(value: unknown): BadgeVariant {
	const v = String(value ?? "")
		.toLowerCase()
		.trim();
	if (!v) return "secondary";
	// `(?<![a-z])ativ[oa]`: o `ativ[oa]` cru casava DENTRO de "des-ativa-do" e pintava
	// de VERDE um registro DESATIVADO (achado do 21st-sweep). A lookbehind exige que
	// "ativo/ativa" comece um token — "ativo" casa, "desativado"/"inativa" não. O par
	// disso está na linha de baixo: "desativ" entra no mesmo grupo que "inativ" já usava.
	if (/aprovad|convertid|pag[oa]|conclu[ií]|finaliz|(?<![a-z])ativ[oa]|ganho|aceit|sucesso|receb|quitad/.test(v))
		return "success";
	if (/recusad|cancelad|reprovad|rejeitad|perdid|desativ|inativ|vencid|atrasad|expirad|falh|erro|estornad/.test(v))
		return "error";
	if (/enviad|negocia|andamento|em_?aberto|process|analise|análise|revis|agendad/.test(v)) return "info";
	if (/pendente|aguard|em_?espera|novo|nova|previst/.test(v)) return "warning";
	if (/rascunho|draft|arquivad/.test(v)) return "secondary";
	return "secondary";
}

/** Rótulo legível de um status cru: "em_negociacao" → "Em negociacao". */
export function formatStatusLabel(value: unknown): string {
	const raw = String(value ?? "")
		.replace(/_/g, " ")
		.trim();
	if (!raw) return "—";
	return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Badge de status com cor derivada da palavra-chave. */
export function StatusBadge({ value, className }: { value: unknown; className?: string }) {
	return (
		<Badge variant={getStatusVariant(value)} className={cn("font-medium", className)}>
			{formatStatusLabel(value)}
		</Badge>
	);
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * LINHA CLICÁVEL — uma implementação só, para TODAS as listas do painel.
 *
 * O dono pediu: "clicar em QUALQUER LUGAR" da linha abre o registro, em vez de ter
 * que acertar o nome. Isso é fácil de fazer errado de duas maneiras:
 *
 * 1. ROUBAR O CLIQUE DE QUEM JÁ CLICA. A linha tem botões dentro (o "…", o próprio
 *    botão do nome, e — quando o menu do Radix está aberto — os itens dele, que
 *    PORTALAM no DOM mas continuam filhos na árvore do React e portanto BORBULHAM
 *    até a <tr>). Sem guarda, escolher "Excluir" no menu abriria o editor por baixo
 *    do diálogo de exclusão. Por isso o teste é feito no ALVO do evento (`closest`
 *    de qualquer controle), e NÃO com `currentTarget.contains` — que daria falso
 *    para o item portalado, justamente o caso perigoso.
 *
 * 2. ATROPELAR SELEÇÃO DE TEXTO. Arrastar para copiar um telefone termina em um
 *    clique; abrir o formulário aí é hostil. Seleção viva = não é clique.
 *
 * TECLADO: a <tr> continua sendo uma <tr> — sem `role`/`tabIndex` postiços, que
 * quebrariam a semântica da tabela e criariam uma parada de foco duplicada por
 * linha. O caminho sem mouse é o `BotaoAbrirLinha` da célula principal (Tab +
 * Enter/Espaço, foco visível), e a linha inteira acende junto via `focus-within`.
 * ═══════════════════════════════════════════════════════════════════════════════ */

/** O que, dentro de uma linha, JÁ tem clique próprio — e portanto não abre a linha. */
const CONTROLES_DA_LINHA = [
	"a[href]",
	"button",
	"input",
	"select",
	"textarea",
	"label",
	"summary",
	'[role="button"]',
	'[role="link"]',
	'[role="menu"]',
	'[role="menuitem"]',
	'[role="menuitemcheckbox"]',
	'[role="menuitemradio"]',
	'[role="checkbox"]',
	'[role="switch"]',
	'[role="dialog"]',
	'[contenteditable="true"]',
	/** Escotilha para um elemento sem semântica interativa que mesmo assim não deve abrir a linha. */
	"[data-sem-abrir-linha]",
].join(",");

/** `true` quando o clique nasceu num controle que já faz outra coisa. */
export function cliqueEmControle(evento: EventoDeMouse<HTMLElement>): boolean {
	const alvo = evento.target instanceof Element ? evento.target : null;
	return alvo !== null && alvo.closest(CONTROLES_DA_LINHA) !== null;
}

/** `true` se há texto selecionado agora — arrastar para copiar não é clique. */
function houveSelecaoDeTexto(): boolean {
	if (typeof window === "undefined" || typeof window.getSelection !== "function") return false;
	const selecao = window.getSelection();
	return selecao !== null && !selecao.isCollapsed && selecao.toString().trim().length > 0;
}

/**
 * Afordância: o cursor diz que clica, o hover pinta a linha (já vinha das telas) e o
 * `focus-within` acende a linha quando o botão da célula principal recebe o foco.
 * `group` habilita o `group-hover:underline` do nome — o sublinhado que anuncia
 * "isto abre algo" sem poluir a tabela com ícone novo.
 */
const CLASSE_LINHA_CLICAVEL = "group cursor-pointer focus-within:bg-bg-neutral/60";

/** Props prontas para a `<tr>` (desktop) ou o card (mobile) de uma linha clicável. */
export interface PropsDaLinhaClicavel {
	className: string;
	onClick?: (evento: EventoDeMouse<HTMLElement>) => void;
}

/**
 * Espalhe o retorno na `<tr>`/card: `<tr {...linhaClicavel(abrir, "classes de sempre")}>`.
 * Com `aoAbrir` nulo (sem permissão, linha sem documento) devolve só as classes —
 * a linha fica inerte, sem cursor de mão prometendo o que não acontece.
 */
export function linhaClicavel(aoAbrir: (() => void) | null | undefined, classeBase?: string): PropsDaLinhaClicavel {
	if (!aoAbrir) return { className: cn(classeBase) };
	return {
		className: cn(classeBase, CLASSE_LINHA_CLICAVEL),
		onClick: (evento) => {
			if (cliqueEmControle(evento)) return;
			if (houveSelecaoDeTexto()) return;
			aoAbrir();
		},
	};
}

/**
 * O botão da célula principal — o caminho de TECLADO da linha clicável (e o alvo de
 * mouse mais óbvio). Existe um por linha, de propósito: duas paradas de foco por
 * linha transformariam navegar a tabela num calvário de Tab.
 */
export function BotaoAbrirLinha({
	rotulo,
	aoAbrir,
	ocupado,
	className,
	children,
}: {
	/** `aria-label` completo — "Abrir cliente João", "Ver PDF do orçamento 0007". */
	rotulo: string;
	aoAbrir: () => void;
	/** Ação em andamento (ex.: gerando o PDF): anuncia e trava o clique repetido. */
	ocupado?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={aoAbrir}
			aria-label={rotulo}
			aria-busy={ocupado || undefined}
			disabled={ocupado}
			className={cn(
				"-mx-1 max-w-full rounded-md px-1 text-left disabled:cursor-progress",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
				className,
			)}
		>
			{children}
		</button>
	);
}

/** Célula de nome: mini-avatar (inicial) + texto. Sem avatar quando vazio. */
export function NameCell({ name, className }: { name: string; className?: string }) {
	if (!name || name === "—") {
		return <span className="text-text-disabled">—</span>;
	}
	return (
		<span className={cn("flex min-w-0 items-center gap-2.5", className)}>
			<Avatar className="size-7 shrink-0">
				<AvatarFallback className="bg-primary/15 text-[11px] font-semibold text-primary-dark dark:bg-primary/25 dark:text-primary-light">
					{getInitials(name)}
				</AvatarFallback>
			</Avatar>
			<span className="truncate font-medium text-text-primary">{name}</span>
		</span>
	);
}
