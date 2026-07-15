/**
 * SELETOR DE CLIENTE — o combobox que alimenta orçamento, recibo, OS e agendamento.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POR QUE ELE DEVOLVE 5 CAMPOS, E NÃO SÓ O ID
 * ═══════════════════════════════════════════════════════════════════════════════
 * O orçamento DESNORMALIZA o cliente dentro do blob `dados` (clienteNome,
 * clienteTelefone, clienteCpfCnpj, clienteEndereco). E isso é proposital: o PDF que
 * o cliente recebe é gerado a partir do blob, então o documento tem que preservar
 * o nome/endereço **do dia em que foi emitido** — se o técnico corrigir o endereço
 * do cliente depois, um orçamento antigo não pode mudar retroativamente.
 * Guardar só o `clienteId` também faria o documento sair EM BRANCO quando o cliente
 * fosse excluído (soft delete). Por isso o retorno é o pacote inteiro.
 *
 * O mapeamento abaixo é cópia de `clienteParaOrc`
 * (`src/screens/NovoOrcamentoScreen.tsx`, ~linha 100) — inclusive o `cpf ?? cnpj`
 * e o endereço concatenado. Divergir aqui faz o mesmo cliente sair diferente no
 * PDF do celular e no do painel.
 *
 * 3 ESTADOS: carregando · erro (com "Tentar de novo") · vazio de verdade. Erro
 * NUNCA vira "Nenhum cliente encontrado" — isso faria o usuário cadastrar de novo
 * um cliente que já existe.
 */
import type { Cliente, Orcamento } from "@dominio";
import { AlertTriangle, Check, ChevronsUpDown, Loader2, Plus, RotateCw, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useOlliList } from "@/olli/data";
import { Button } from "@/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { cn } from "@/utils";
import { mascaraTelefone } from "./campos";

/**
 * Os campos de cliente COMO O ORÇAMENTO OS GUARDA. Derivado do tipo de domínio de
 * propósito: se o app renomear/remover um deles, isto para de compilar em vez de
 * gravar um blob que o celular não sabe ler.
 */
export type ClienteSelecionado = Pick<
	Orcamento,
	"clienteId" | "clienteNome" | "clienteTelefone" | "clienteCpfCnpj" | "clienteEndereco"
>;

/**
 * Linha da tabela `clientes` no Supabase. As colunas coincidem 1:1 com o domínio
 * (ver `clienteToRow` em `contrato.ts`), então tipo-as a partir de `Cliente` —
 * outra cópia manual seria mais uma coisa para divergir.
 */
type LinhaCliente = Pick<
	Cliente,
	"id" | "nome" | "telefone" | "cpf" | "cnpj" | "endereco" | "complemento" | "cidade" | "estado"
>;

/** Réplica de `clienteParaOrc` do app. As chaves opcionais são OMITIDAS quando não há valor. */
export function clienteParaOrcamento(c: LinhaCliente): ClienteSelecionado {
	const sel: ClienteSelecionado = {
		clienteId: c.id,
		clienteNome: c.nome,
		clienteTelefone: c.telefone ?? "",
	};
	const doc = c.cpf ?? c.cnpj;
	if (doc) sel.clienteCpfCnpj = doc;
	if (c.endereco) {
		sel.clienteEndereco = [c.endereco, c.complemento, c.cidade, c.estado].filter(Boolean).join(", ");
	}
	return sel;
}

/**
 * Busca tolerante: ignora acento, caixa e a máscara do telefone. Sem isto, "jose"
 * não acha "José" — e o usuário jura que o cliente sumiu.
 */
const normalizar = (s: string) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

interface Props {
	/** O cliente já escolhido — vem dos campos desnormalizados do próprio documento. */
	valor: ClienteSelecionado | null;
	aoSelecionar: (cliente: ClienteSelecionado) => void;
	/** Abre o cadastro de cliente. Opcional: este componente NÃO conhece o form de cliente. */
	aoPedirNovoCliente?: () => void;
	id?: string;
	disabled?: boolean;
	/** Marca o gatilho como inválido (o texto do erro fica no `<Campo>` que o envolve). */
	invalido?: boolean;
}

export default function SeletorCliente({ valor, aoSelecionar, aoPedirNovoCliente, id, disabled, invalido }: Props) {
	const [aberto, setAberto] = useState(false);
	const [busca, setBusca] = useState("");

	const { data, isLoading, isError, error, refetch, isFetching } = useOlliList<LinhaCliente>("clientes", {
		orderBy: "nome",
		ascending: true,
	});

	const resultados = useMemo(() => {
		const lista = data ?? [];
		const termo = busca.trim();
		if (!termo) return lista;
		const alvoTexto = normalizar(termo);
		const alvoDigitos = soDigitos(termo);
		return lista.filter((c) => {
			if (normalizar(c.nome).includes(alvoTexto)) return true;
			// Telefone: compara só os dígitos, então "98765" acha "(11) 98765-4321".
			return alvoDigitos.length > 0 && soDigitos(c.telefone ?? "").includes(alvoDigitos);
		});
	}, [data, busca]);

	const escolher = (c: LinhaCliente) => {
		aoSelecionar(clienteParaOrcamento(c));
		setAberto(false);
		setBusca("");
	};

	return (
		<Popover open={aberto} onOpenChange={setAberto}>
			<PopoverTrigger asChild>
				{/* biome-ignore lint/a11y/useSemanticElements: um <select> nativo não faz
				    busca-enquanto-digita, e uma base com centenas de clientes é
				    inutilizável sem isso. `role="combobox"` + aria-expanded + a lista do
				    cmdk são exatamente o padrão de combobox do ARIA APG (teclado: setas
				    navegam, Enter escolhe, Esc fecha). */}
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={aberto}
					aria-invalid={invalido || undefined}
					disabled={disabled}
					className={cn(
						"h-10 w-full justify-between px-3 font-normal",
						!valor?.clienteId && "text-text-secondary",
						invalido && "border-error",
					)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<UserRound className="size-4 shrink-0 text-text-disabled" />
						<span className="truncate">
							{valor?.clienteId ? valor.clienteNome || "(sem nome)" : "Selecionar cliente…"}
						</span>
						{valor?.clienteTelefone && (
							<span className="shrink-0 text-xs tabular-nums text-text-secondary">
								{mascaraTelefone(valor.clienteTelefone)}
							</span>
						)}
					</span>
					<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>

			<PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
				{/* shouldFilter={false}: o filtro é nosso — o do cmdk não sabe casar
				    "98765" com um telefone mascarado nem ignorar acento no nome. */}
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Buscar por nome ou telefone…"
						value={busca}
						onValueChange={setBusca}
						disabled={isLoading || isError}
					/>

					<CommandList>
						{isLoading ? (
							<div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
								<Loader2 className="size-4 animate-spin" />
								Carregando clientes…
							</div>
						) : isError ? (
							// ERRO ≠ VAZIO. Sem esta separação, uma falha de rede diria
							// "nenhum cliente" e o usuário duplicaria um cadastro que existe.
							<div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
								<AlertTriangle className="size-6 text-error" />
								<div>
									<p className="text-sm font-semibold text-text-primary">Não foi possível carregar os clientes</p>
									<p className="mt-1 text-xs text-text-secondary">
										{(error as Error)?.message ?? "Erro ao consultar os dados."}
									</p>
								</div>
								<Button type="button" size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
									{isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCw className="mr-2 size-4" />}
									Tentar de novo
								</Button>
							</div>
						) : (
							<>
								<CommandEmpty>
									<div className="px-4 py-2 text-center">
										<p className="text-sm text-text-primary">
											{busca.trim() ? "Nenhum cliente encontrado." : "Você ainda não tem clientes."}
										</p>
										{aoPedirNovoCliente && (
											<p className="mt-1 text-xs text-text-secondary">Cadastre o primeiro abaixo.</p>
										)}
									</div>
								</CommandEmpty>

								{resultados.length > 0 && (
									<CommandGroup>
										{resultados.map((c) => {
											const selecionado = valor?.clienteId === c.id;
											return (
												<CommandItem
													key={c.id}
													value={c.id}
													onSelect={() => escolher(c)}
													className="flex items-center gap-2 py-2"
												>
													<Check className={cn("size-4 shrink-0", selecionado ? "opacity-100" : "opacity-0")} />
													<span className="flex min-w-0 flex-col">
														<span className="truncate font-medium text-text-primary">{c.nome}</span>
														<span className="truncate text-xs tabular-nums text-text-secondary">
															{c.telefone ? mascaraTelefone(c.telefone) : "sem telefone"}
															{c.cidade ? ` · ${c.cidade}` : ""}
														</span>
													</span>
												</CommandItem>
											);
										})}
									</CommandGroup>
								)}
							</>
						)}
					</CommandList>

					{/* "Novo cliente" fica FORA da lista: continua alcançável mesmo com a
					    busca sem resultado — que é justamente quando mais se precisa dele. */}
					{aoPedirNovoCliente && !isLoading && !isError && (
						<div className="border-t border-border p-1">
							<Button
								type="button"
								variant="ghost"
								className="w-full justify-start gap-2 font-normal"
								onClick={() => {
									setAberto(false);
									aoPedirNovoCliente();
								}}
							>
								<Plus className="size-4" />
								Cadastrar novo cliente
							</Button>
						</div>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
