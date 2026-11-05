import { useCallback, useEffect, useMemo, useState } from "react";
import { useBoolean } from "react-use";
import { Icon } from "@/components/icon";
import useLocale from "@/locales/use-locale";
import { useRouter } from "@/routes/hooks";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/ui/command";
import { Text } from "@/ui/typography";
import { useFilteredNavData } from "../dashboard/nav";
import { atalhoAbreBusca } from "./atalho-busca";

interface SearchItem {
	key: string;
	label: string;
	path: string;
}

// Escapa caracteres especiais de regex antes de montar o RegExp com o texto digitado
// pelo usuário — sem isso, digitar "(" ou "*" lança SyntaxError e quebra a busca.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 高亮文本组件
const HighlightText = ({ text, query }: { text: string; query: string }) => {
	if (!query) return <>{text}</>;

	const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));

	return (
		<>
			{parts.map((part, i) =>
				part.toLowerCase() === query.toLowerCase() ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
					<span key={i} className="text-primary">
						{part}
					</span>
				) : (
					part
				),
			)}
		</>
	);
};

const SearchBar = () => {
	const { t } = useLocale();
	const { push } = useRouter();
	const [open, setOpen] = useBoolean(false);
	const [searchQuery, setSearchQuery] = useState("");
	const navData = useFilteredNavData();

	// Flatten navigation data into searchable items
	const flattenedItems = useMemo(() => {
		const items: SearchItem[] = [];

		const flattenItems = (navItems: typeof navData) => {
			for (const section of navItems) {
				for (const item of section.items) {
					if (item.path) {
						items.push({
							key: item.path,
							label: item.title,
							path: item.path,
						});
					}
					if (item.children) {
						flattenItems([{ items: item.children }]);
					}
				}
			}
		};

		flattenItems(navData);
		return items;
	}, [navData]);

	// const searchResult = useMemo(() => {
	// 	const query = searchQuery.toLowerCase();
	// 	return flattenedItems.filter((item) => t(item.label).toLowerCase().includes(query) || item.key.toLowerCase().includes(query));
	// }, [searchQuery, t, flattenedItems]);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (!atalhoAbreBusca(e)) return;
			e.preventDefault();
			setOpen((aberto: boolean) => !aberto);
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [setOpen]);

	const handleSelect = useCallback(
		(path: string) => {
			push(path); // push (não replace) — não pode apagar o histórico e quebrar o Voltar
			setOpen(false);
		},
		[push, setOpen],
	);

	const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
	const atalhoVisivel = isMac ? "Cmd+K" : "Ctrl+K";

	return (
		<>
			{/* Campo, não um selo azul. A lupa é currentColor: a cor vem do
			    text-text-secondary, nos dois temas, em vez do preto padrão do navegador. */}
			<Button
				variant="outline"
				className="h-11 min-h-[44px] w-11 min-w-11 justify-center rounded-full border-input bg-background px-0 text-text-secondary shadow-none hover:bg-accent hover:text-text-primary md:w-60 md:justify-start md:gap-2 md:px-3"
				size="sm"
				onClick={() => setOpen(true)}
				aria-label={`Buscar (${atalhoVisivel} ou Ctrl+Q)`}
				aria-keyshortcuts="Control+K Control+Q"
				aria-haspopup="dialog"
			>
				<Icon icon="local:ic-search" size="20" />
				<span className="hidden min-w-0 flex-1 truncate text-left text-sm font-normal md:inline">Buscar</span>
				<kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-text-secondary md:inline-flex">
					{isMac ? <Icon icon="qlementine-icons:key-cmd-16" size="14" /> : <span>Ctrl</span>}
					<span aria-hidden="true">+</span>
					<span>K</span>
				</kbd>
			</Button>

			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title={t("sys.search.title")}
				description={t("sys.search.description")}
			>
				<CommandInput placeholder={t("sys.search.placeholder")} value={searchQuery} onValueChange={setSearchQuery} />
				{/*
				 * `CommandList` (não um `ScrollArea` solto) — é ele que faz a paleta
				 * FUNCIONAR sem mouse, não só ficar bonita.
				 *
				 * Aqui morava um `<ScrollArea className="h-[400px]">`, e sem o
				 * `Command.List` do cmdk a paleta ficava puramente de mouse. Medido no
				 * navegador, com a paleta aberta e teclado de verdade: `aria-controls` do
				 * combobox apontava para um id INEXISTENTE, `aria-activedescendant`
				 * ficava `null`, ↓ não selecionava nada (`data-selected` nunca virava
				 * true), Enter não navegava e Esc não fechava — ou seja, Ctrl+K abria um
				 * diálogo do qual só dava para sair clicando. E o rodapé desta mesma
				 * paleta promete "↑ ↓ navegar · ↵ selecionar · ESC fechar".
				 *
				 * O cmdk registra os itens, calcula o selecionado e trata as setas a
				 * partir do elemento da lista; sem ele nada disso existe. A rolagem, que
				 * era o motivo do ScrollArea, o próprio `CommandList` já faz
				 * (`overflow-y-auto`) — só precisa da altura.
				 */}
				<CommandList className="max-h-[400px]">
					<CommandEmpty>{t("sys.search.empty")}</CommandEmpty>
					<CommandGroup heading={t("sys.search.group")}>
						{flattenedItems.map(({ key, label }) => (
							<CommandItem key={key} onSelect={() => handleSelect(key)} className="flex flex-col items-start">
								<div className="font-medium">
									<HighlightText text={t(label)} query={searchQuery} />
								</div>
								<div className="text-xs text-muted-foreground">
									<HighlightText text={key} query={searchQuery} />
								</div>
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
				<CommandSeparator />
				<div className="flex flex-wrap text-text-primary p-2 justify-end gap-2">
					<div className="flex items-center gap-1">
						<Badge variant="info">↑</Badge>
						<Badge variant="info">↓</Badge>
						<Text variant="caption">{t("sys.search.navigate")}</Text>
					</div>
					<div className="flex items-center gap-1">
						<Badge variant="info">↵</Badge>
						<Text variant="caption">{t("sys.search.select")}</Text>
					</div>
					<div className="flex items-center gap-1">
						<Badge variant="info">ESC</Badge>
						<Text variant="caption">{t("sys.search.close")}</Text>
					</div>
				</div>
			</CommandDialog>
		</>
	);
};

export default SearchBar;
