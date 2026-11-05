/**
 * Botão "Mover" — o caminho que não depende de arrastar.
 *
 * No celular abre uma gaveta com alvos de 44px. Do `md` para cima abre o menu,
 * com as mesmas opções. Os dois nunca ficam no teclado ao mesmo tempo: um está
 * `hidden`.
 */
import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { cn } from "@/utils";

export interface OpcaoVisivel {
	id: string;
	rotulo: string;
	grupo?: string;
	atual?: boolean;
}

type Props = {
	rotuloAcessivel: string;
	titulo: string;
	descricao: string;
	opcoes: OpcaoVisivel[];
	onEscolher: (id: string) => void;
	desabilitado?: boolean;
	rotuloVisivel?: string;
};

const BOTAO =
	"pointer-events-auto relative h-11 shrink-0 px-3 text-xs font-semibold md:h-7 md:px-2 md:text-[11px] alvo-toque";

function comCabecalho(opcoes: OpcaoVisivel[]) {
	let grupoAnterior = "";
	return opcoes.map((opcao) => {
		const cabecalho = Boolean(opcao.grupo && opcao.grupo !== grupoAnterior);
		if (opcao.grupo) grupoAnterior = opcao.grupo;
		return { ...opcao, cabecalho };
	});
}

export default function BotaoMover({
	rotuloAcessivel,
	titulo,
	descricao,
	opcoes,
	onEscolher,
	desabilitado,
	rotuloVisivel = "Mover",
}: Props) {
	const [gavetaAberta, setGavetaAberta] = useState(false);
	const linhas = comCabecalho(opcoes);

	function escolher(id: string) {
		setGavetaAberta(false);
		onEscolher(id);
	}

	return (
		<>
			<div className="pointer-events-auto md:hidden">
				<Drawer open={gavetaAberta} onOpenChange={setGavetaAberta}>
					<DrawerTrigger asChild>
						<Button
							type="button"
							variant="outline"
							className={BOTAO}
							disabled={desabilitado}
							aria-label={rotuloAcessivel}
						>
							{rotuloVisivel}
						</Button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>{titulo}</DrawerTitle>
							<DrawerDescription>{descricao}</DrawerDescription>
						</DrawerHeader>
						<div className="overflow-y-auto px-4 pb-2">
							{linhas.map((opcao) => (
								<div key={opcao.id}>
									{opcao.cabecalho && (
										<p className="px-1 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-text-disabled">
											{opcao.grupo}
										</p>
									)}
									<button
										type="button"
										disabled={opcao.atual || desabilitado}
										onClick={() => escolher(opcao.id)}
										aria-current={opcao.atual ? "true" : undefined}
										className={cn(
											"flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
											"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
											"disabled:opacity-60",
											opcao.atual ? "font-medium text-text-secondary" : "text-text-primary hover:bg-muted",
										)}
									>
										<span className="flex-1">{opcao.rotulo}</span>
										{opcao.atual && (
											<>
												<Check className="size-4 shrink-0" aria-hidden />
												<span className="text-xs">Atual</span>
											</>
										)}
									</button>
								</div>
							))}
						</div>
						<DrawerFooter>
							<DrawerClose asChild>
								<Button type="button" variant="outline" className="h-11">
									Fechar
								</Button>
							</DrawerClose>
						</DrawerFooter>
					</DrawerContent>
				</Drawer>
			</div>

			<div className="pointer-events-auto hidden md:block">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							className={BOTAO}
							disabled={desabilitado}
							aria-label={rotuloAcessivel}
						>
							{rotuloVisivel}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>Mover para</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{linhas.map((opcao) => (
							<div key={opcao.id}>
								{opcao.cabecalho && (
									<DropdownMenuLabel className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-text-disabled">
										{opcao.grupo}
									</DropdownMenuLabel>
								)}
								<DropdownMenuItem
									disabled={opcao.atual}
									onSelect={() => onEscolher(opcao.id)}
									className="min-h-11 gap-2 md:min-h-0"
								>
									<span className="flex-1">{opcao.rotulo}</span>
									{opcao.atual && <Check className="size-3.5 text-text-secondary" aria-label="status atual" />}
								</DropdownMenuItem>
							</div>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
