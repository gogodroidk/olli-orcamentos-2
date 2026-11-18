/**
 * "Importar dos contatos" — lista de clientes do painel (D-2245).
 *
 * Fluxo: escolher (agenda do celular no Chrome Android, ou arquivo .vcf/.csv) →
 * PRÉVIA (novo / já é cliente / sem telefone) → só grava no "Importar". Nada sobe
 * sem a pessoa ver e confirmar (LGPD). Erro nunca vira silêncio: cada falha aparece.
 */
import type { Cliente } from "@dominio";
import { BookUser, FileUp, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { agora, novoId } from "@/olli/contrato";
import { useOlliList } from "@/olli/data";
import { useSalvar } from "@/olli/mutacoes";
import { type LinhaCliente, linhaParaCliente } from "@/pages/olli/clientes/FormCliente";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import {
	doNavegador,
	escolherNaAgenda,
	type ItemPrevia,
	lerArquivoDeContatos,
	montarPrevia,
	seletorDeContatosDisponivel,
} from "./contatos";

type Lidos = Array<{ nome: string; telefones: string[] }>;

interface Props {
	/** Contatos que já chegaram prontos (ex.: .vcf compartilhado pelo WhatsApp). Abre direto na prévia. */
	recebidos?: Lidos | null;
	aoFecharRecebidos?: () => void;
}

export default function ImportarContatos({ recebidos, aoFecharRecebidos }: Props) {
	const [aberto, setAberto] = useState(false);
	const [lidos, setLidos] = useState<Lidos | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [marcados, setMarcados] = useState<Set<number>>(new Set());
	const [gravando, setGravando] = useState(false);
	const arquivoRef = useRef<HTMLInputElement>(null);
	const clientes = useOlliList<LinhaCliente>("clientes", { orderBy: "nome", ascending: true });
	const salvar = useSalvar("clientes");
	const agenda = seletorDeContatosDisponivel();

	useEffect(() => {
		if (recebidos?.length) {
			setLidos(recebidos);
			setErro(null);
			setAberto(true);
		}
	}, [recebidos]);

	const previa = useMemo<ItemPrevia[]>(() => {
		if (!lidos) return [];
		const existentes = (clientes.data ?? []).map((l) => linhaParaCliente(l).telefone).filter(Boolean);
		return montarPrevia(lidos, existentes);
	}, [lidos, clientes.data]);

	// Novos já vêm marcados; repetidos e sem telefone nunca.
	useEffect(() => {
		setMarcados(new Set(previa.flatMap((item, i) => (item.tipo === "novo" ? [i] : []))));
	}, [previa]);

	const fechar = () => {
		if (gravando) return;
		setAberto(false);
		setLidos(null);
		setErro(null);
		aoFecharRecebidos?.();
	};

	const daAgenda = async () => {
		setErro(null);
		try {
			const escolhidos = await escolherNaAgenda(true);
			if (escolhidos.length) setLidos(doNavegador(escolhidos));
		} catch {
			setErro("O navegador não abriu a agenda agora. Use um arquivo de contatos (.vcf ou .csv).");
		}
	};

	const doArquivo = async (ev: React.ChangeEvent<HTMLInputElement>) => {
		const arquivo = ev.target.files?.[0];
		ev.target.value = "";
		if (!arquivo) return;
		setErro(null);
		try {
			const r = lerArquivoDeContatos(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
			if (r.ok) setLidos(r.contatos);
			else setErro(r.motivo);
		} catch {
			setErro("Não consegui ler esse arquivo. Tente exportar os contatos de novo.");
		}
	};

	const importar = async () => {
		const escolhidos = previa.flatMap((item, i) => (item.tipo === "novo" && marcados.has(i) ? [item.contato] : []));
		if (!escolhidos.length) return;
		setGravando(true);
		let ok = 0;
		let falhou = 0;
		for (const c of escolhidos) {
			const quando = agora();
			const cliente: Cliente = { id: novoId(), nome: c.nome, telefone: c.telefone, criadoEm: quando, atualizadoEm: quando };
			try {
				await salvar.mutateAsync(cliente);
				ok += 1;
			} catch {
				falhou += 1;
			}
		}
		setGravando(false);
		if (falhou) {
			setErro(`${ok} importado(s), ${falhou} não gravou. Verifique a internet e importe de novo: quem já entrou aparece como "Já é seu cliente".`);
			return;
		}
		toast.success(ok === 1 ? "1 cliente importado." : `${ok} clientes importados.`);
		fechar();
	};

	const qtd = previa.filter((item, i) => item.tipo === "novo" && marcados.has(i)).length;

	return (
		<>
			<Button type="button" variant="outline" className="min-h-[44px] gap-2" onClick={() => setAberto(true)}>
				<BookUser className="size-4" aria-hidden />
				Importar dos contatos
			</Button>
			<input
				ref={arquivoRef}
				type="file"
				accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv"
				className="sr-only"
				onChange={doArquivo}
				aria-hidden
				tabIndex={-1}
			/>
			<Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Importar clientes dos contatos</DialogTitle>
						<DialogDescription>Só entram os contatos que você escolher, e você confere antes de salvar.</DialogDescription>
					</DialogHeader>

					{!lidos ? (
						<div className="grid gap-2">
							{agenda && (
								<Button type="button" className="min-h-[44px] gap-2" onClick={daAgenda}>
									<BookUser className="size-4" aria-hidden />
									Escolher na agenda do celular
								</Button>
							)}
							<Button type="button" variant="outline" className="min-h-[44px] gap-2" onClick={() => arquivoRef.current?.click()}>
								<FileUp className="size-4" aria-hidden />
								Arquivo de contatos (.vcf ou .csv)
							</Button>
							{!agenda && (
								<p className="text-xs text-text-secondary">
									No iPhone: Contatos › escolha › Compartilhar contato › Salvar em Arquivos, e escolha o arquivo aqui. No Google
									Contatos: Exportar › CSV.
								</p>
							)}
						</div>
					) : clientes.isLoading ? (
						<p className="flex items-center gap-2 text-sm text-text-secondary">
							<Loader2 className="size-4 animate-spin" aria-hidden /> Conferindo seus clientes…
						</p>
					) : clientes.isError ? (
						<p className="text-sm text-error" role="alert">
							Não consegui conferir seus clientes agora, então não importo nada para não duplicar. Recarregue e tente de novo.
						</p>
					) : (
						<ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
							{previa.map((item, i) => (
								<li key={`${i}-${item.tipo}`} className="flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm">
									{item.tipo === "novo" ? (
										<Checkbox
											id={`contato-${i}`}
											checked={marcados.has(i)}
											onCheckedChange={(v) =>
												setMarcados((atual) => {
													const n = new Set(atual);
													if (v) n.add(i);
													else n.delete(i);
													return n;
												})
											}
										/>
									) : (
										<span className="size-4" aria-hidden />
									)}
									<label htmlFor={`contato-${i}`} className="flex-1">
										<span className={item.tipo === "novo" ? "text-text-primary" : "text-text-secondary"}>
											{item.tipo === "sem_telefone" ? item.nome : item.contato.nome}
										</span>
										<span className="block text-xs text-text-secondary">
											{item.tipo === "novo" ? item.contato.telefone : item.tipo === "repetido" ? `${item.contato.telefone} · ${item.motivo}` : "Sem telefone com DDD"}
										</span>
									</label>
								</li>
							))}
						</ul>
					)}

					{erro && (
						<p className="text-sm text-error" role="alert">
							{erro}
						</p>
					)}

					<DialogFooter className="gap-2">
						<Button type="button" variant="outline" className="min-h-[44px]" onClick={fechar} disabled={gravando}>
							Cancelar
						</Button>
						{lidos && !clientes.isError && (
							<Button type="button" className="min-h-[44px]" onClick={importar} disabled={gravando || qtd === 0 || clientes.isLoading}>
								{gravando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
								{qtd === 1 ? "Importar 1 cliente" : `Importar ${qtd} clientes`}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
