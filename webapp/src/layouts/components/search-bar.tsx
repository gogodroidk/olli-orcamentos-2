import { useCallback, useEffect, useMemo, useState } from "react";
import { useBoolean } from "react-use";
import { Icon } from "@/components/icon";
import useLocale from "@/locales/use-locale";
import { useRouter } from "@/routes/hooks";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandSeparator } from "@/ui/command";
import { ScrollArea } from "@/ui/scroll-area";
import { Text } from "@/ui/typography";
import { useFilteredNavData } from "../dashboard/nav";

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
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open: boolean) => !open);
			}
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

	return (
		<>
			{/* O ic-search.svg é currentColor e o variant ghost não define cor de texto:
			    a lupa herdava o preto padrão do navegador e ficava em 1,27:1 sobre o
			    fundo `bg-action-selected` do escuro. Com o token vai a 16,57:1. */}
			<Button
				variant="ghost"
				className="bg-action-selected px-2 rounded-lg min-h-[44px] text-text-primary"
				size="sm"
				onClick={() => setOpen(true)}
				aria-label={`Buscar (${isMac ? "Cmd" : "Ctrl"}+K)`}
			>
				<div className="flex items-center justify-center gap-4">
					<Icon icon="local:ic-search" size="20" />
					{/* Azul CHEIO, não `bg-primary/80`: medido no navegador, o branco sobre o azul
					    a 80% (composto sobre o botão cinza da busca) dava 3,64:1 — reprova nos
					    4,5:1 da WCAG para texto pequeno. Sem a transparência vai a 5,02:1. */}
					<kbd className="flex items-center justify-center rounded-md bg-primary text-common-white px-1.5 py-0.5 text-sm font-semibold">
						{isMac ? <Icon icon="qlementine-icons:key-cmd-16" /> : <span>Ctrl</span>}
						<span>K</span>
					</kbd>
				</div>
			</Button>

			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title={t("sys.search.title")}
				description={t("sys.search.description")}
			>
				<CommandInput placeholder={t("sys.search.placeholder")} value={searchQuery} onValueChange={setSearchQuery} />
				<ScrollArea className="h-[400px]">
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
				</ScrollArea>
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
