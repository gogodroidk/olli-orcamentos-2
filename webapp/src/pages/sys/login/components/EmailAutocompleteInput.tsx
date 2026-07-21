import { useId, useMemo, useState } from "react";
import { Input } from "@/ui/input";
import { cn } from "@/utils";

/**
 * Sugestão de e-mail por provedor — assim que aparece o "@", mostra
 * "<usuário>@<provedor>" pros mais comuns no Brasil. Existe no login E no
 * cadastro (mesmo componente pra não duplicar a lista/lógica entre as duas
 * telas).
 */
const EMAIL_PROVIDERS = [
	"gmail.com",
	"hotmail.com",
	"outlook.com",
	"yahoo.com.br",
	"icloud.com",
	"live.com",
	"terra.com.br",
	"uol.com.br",
	"bol.com.br",
];

type EmailAutocompleteInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
};

export function EmailAutocompleteInput({
	value,
	onChange,
	onBlur,
	className,
	...props
}: EmailAutocompleteInputProps) {
	const listboxId = useId();
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);

	const atIndex = value.indexOf("@");

	const suggestions = useMemo(() => {
		if (atIndex < 0) return [];
		const localPart = value.slice(0, atIndex);
		const domainQuery = value.slice(atIndex + 1).toLowerCase();
		const matches = EMAIL_PROVIDERS.filter((domain) => domain.startsWith(domainQuery));
		// já digitou o provedor inteiro (ex: "gmail.com") — nada mais a completar
		if (matches.length === 1 && matches[0] === domainQuery) return [];
		return matches.map((domain) => `${localPart}@${domain}`);
	}, [value, atIndex]);

	const showSuggestions = open && suggestions.length > 0;

	const selectSuggestion = (suggestion: string) => {
		onChange(suggestion);
		setOpen(false);
		setActiveIndex(-1);
	};

	return (
		<div className="relative">
			<Input
				type="email"
				autoComplete="email"
				role="combobox"
				aria-expanded={showSuggestions}
				aria-controls={listboxId}
				aria-autocomplete="list"
				aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
				value={value}
				onChange={(e) => {
					onChange(e.target.value);
					setOpen(true);
					setActiveIndex(-1);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => {
					setOpen(false);
					setActiveIndex(-1);
					onBlur?.();
				}}
				onKeyDown={(e) => {
					if (!showSuggestions) return;
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setActiveIndex((i) => (i + 1) % suggestions.length);
					} else if (e.key === "ArrowUp") {
						e.preventDefault();
						setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
					} else if (e.key === "Enter" && activeIndex >= 0) {
						e.preventDefault();
						selectSuggestion(suggestions[activeIndex]);
					} else if (e.key === "Escape") {
						setOpen(false);
						setActiveIndex(-1);
					}
				}}
				className={className}
				{...props}
			/>

			{showSuggestions && (
				<ul
					id={listboxId}
					role="listbox"
					className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
				>
					{suggestions.map((suggestion, index) => (
						<li
							key={suggestion}
							id={`${listboxId}-${index}`}
							role="option"
							aria-selected={index === activeIndex}
							className={cn(
								"cursor-pointer rounded-sm px-2 py-1.5 text-sm",
								index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
							)}
							// mousedown (não click) + preventDefault: escolhe ANTES do input
							// perder o foco, senão o onBlur fecha a lista antes do clique valer
							onMouseDown={(e) => {
								e.preventDefault();
								selectSuggestion(suggestion);
							}}
						>
							{suggestion}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default EmailAutocompleteInput;
