import { Avatar, AvatarFallback } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { cn } from "@/utils";

/** Variantes de cor do Badge (shadcn) usadas para status. */
type BadgeVariant = "default" | "secondary" | "destructive" | "info" | "warning" | "success" | "error" | "outline";

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
	if (/aprovad|convertid|pag[oa]|conclu[ií]|finaliz|ativ[oa]|ganho|aceit|sucesso|receb|quitad/.test(v))
		return "success";
	if (/recusad|cancelad|reprovad|rejeitad|perdid|inativ|vencid|atrasad|expirad|falh|erro|estornad/.test(v))
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
