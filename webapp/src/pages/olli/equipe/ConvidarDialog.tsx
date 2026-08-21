/**
 * Criação de convite no painel web.
 *
 * O token continua a ser criado exclusivamente pelo Worker: esta tela nunca
 * decide organização, permissões ou validade do link. Ela só coleta o papel,
 * chama a API autenticada e oferece o link resultante para compartilhamento.
 */
import { Check, Copy, Link as LinkIcon, Mail, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { criarConviteEquipe } from "./api";
import { PAPEL_LABEL, type Papel } from "./useEquipe";

interface Props {
	aberto: boolean;
	aoFechar: () => void;
}

const PAPEIS_CONVIDAVEIS: Exclude<Papel, "owner">[] = ["tecnico", "gestor", "admin"];

export default function ConvidarDialog({ aberto, aoFechar }: Props) {
	const [papel, setPapel] = useState<Exclude<Papel, "owner">>("tecnico");
	const [email, setEmail] = useState("");
	const [link, setLink] = useState<string | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);

	const fechar = () => {
		if (enviando) return;
		setErro(null);
		setLink(null);
		setEmail("");
		setPapel("tecnico");
		aoFechar();
	};

	const criar = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErro(null);
		setEnviando(true);
		try {
			const convite = await criarConviteEquipe(papel, email);
			setLink(convite.link);
			toast.success("Convite criado. Compartilhe o link com a pessoa.");
		} catch (causa) {
			setErro((causa as Error)?.message || "Não consegui criar o convite agora.");
		} finally {
			setEnviando(false);
		}
	};

	const copiar = async () => {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			toast.success("Link do convite copiado.");
		} catch {
			toast.message("Copie o link exibido abaixo.");
		}
	};

	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
			<DialogContent>
				<DialogHeader>
					<div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10">
						<UserPlus className="size-5 text-primary" aria-hidden="true" />
					</div>
					<DialogTitle className="mt-1">Convidar para a equipe</DialogTitle>
					<DialogDescription>
						A pessoa escolhe a própria senha ao aceitar. Nunca compartilhe sua senha ou sua conta.
					</DialogDescription>
				</DialogHeader>

				{link ? (
					<div className="space-y-3">
						<div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-text-primary">
							<div className="flex items-center gap-2 font-semibold">
								<Check className="size-4 text-success-dark dark:text-success-light" aria-hidden="true" />
								Convite pronto para compartilhar
							</div>
							<p className="mt-1 text-text-secondary">
								Ele dá acesso como {PAPEL_LABEL[papel].toLowerCase()} e pode ser aceito uma única vez.
							</p>
						</div>
						<div className="flex gap-2">
							<Input value={link} readOnly aria-label="Link do convite" className="min-w-0 font-mono text-xs" />
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={copiar}
								aria-label="Copiar link do convite"
								title="Copiar link"
							>
								<Copy className="size-4" />
							</Button>
						</div>
					</div>
				) : (
					<form id="form-convidar-equipe" onSubmit={criar} className="space-y-4">
						<div className="space-y-2">
							<label htmlFor="convite-email" className="text-sm font-medium text-text-primary">
								E-mail da pessoa <span className="font-normal text-text-secondary">(opcional)</span>
							</label>
							<div className="relative">
								<Mail
									className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-disabled"
									aria-hidden="true"
								/>
								<Input
									id="convite-email"
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="tecnico@empresa.com"
									className="pl-9"
									autoComplete="email"
								/>
							</div>
							<p className="text-xs text-text-secondary">
								O link continua disponível para você compartilhar por WhatsApp.
							</p>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium text-text-primary" htmlFor="convite-papel">
								Papel de acesso
							</label>
							<Select value={papel} onValueChange={(value) => setPapel(value as Exclude<Papel, "owner">)}>
								<SelectTrigger id="convite-papel" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PAPEIS_CONVIDAVEIS.map((opcao) => (
										<SelectItem key={opcao} value={opcao}>
											{PAPEL_LABEL[opcao]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-text-secondary">
								Técnico trabalha no dia a dia; gestor acompanha a operação; administrador também gerencia a equipe.
							</p>
						</div>
						{erro && (
							<p role="alert" className="rounded-lg bg-error/10 px-3 py-2.5 text-sm text-error">
								{erro}
							</p>
						)}
					</form>
				)}

				<DialogFooter>
					{link ? (
						<Button type="button" onClick={fechar}>
							Concluir
						</Button>
					) : (
						<>
							<Button type="button" variant="outline" onClick={fechar} disabled={enviando}>
								Cancelar
							</Button>
							<Button type="submit" form="form-convidar-equipe" disabled={enviando} className="gap-2">
								<LinkIcon className="size-4" />
								{enviando ? "Criando…" : "Gerar convite"}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
