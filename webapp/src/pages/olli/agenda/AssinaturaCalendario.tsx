/**
 * Arquivo .ics da agenda e link de assinatura (Google Agenda, iPhone, Outlook).
 * Sem OAuth. O link só existe depois da migration no banco; até lá a tela diz isso
 * e o arquivo continua baixando.
 */
import type { Agendamento } from "@dominio";
import { CalendarSync, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { supabase } from "@/lib/supabase";
import { baixarIcsAgenda } from "./googleAgenda";
import {
	ativarAssinaturaIcal,
	revogarAssinaturaIcal,
	type ClienteRpcIcal,
	type EscopoIcal,
} from "../../../../../src/utils/assinaturaIcal.ts";

const BASE_LINK = "https://link.olliorcamentos.online";

function clienteWeb(): ClienteRpcIcal {
	return {
		rpc(fn, args) {
			return supabase.rpc(fn, args);
		},
	};
}

export function AssinaturaCalendario({ itens }: { itens: readonly Agendamento[] }) {
	const [aberto, setAberto] = useState(false);
	const [ocupado, setOcupado] = useState(false);
	const [aviso, setAviso] = useState<string | null>(null);
	const [link, setLink] = useState<{ https: string; webcal: string; escopo: EscopoIcal } | null>(null);
	const [trocar, setTrocar] = useState(false);
	const [copiado, setCopiado] = useState(false);

	async function criar(substituir: boolean) {
		setOcupado(true);
		setAviso(null);
		setCopiado(false);
		try {
			let antigoCancelado = false;
			if (substituir && link) {
				const morto = await revogarAssinaturaIcal(clienteWeb(), link.escopo);
				if (morto === "indisponivel") {
					setAviso("A assinatura por link ainda não está disponível nesta conta. O arquivo .ics continua funcionando.");
					return;
				}
				if (morto !== "ok") {
					setAviso("Não consegui cancelar o link antigo. Ele continua valendo.");
					return;
				}
				antigoCancelado = true;
				setLink(null);
			}
			const r = await ativarAssinaturaIcal(clienteWeb(), BASE_LINK);
			if (r.estado === "pronto") {
				setLink({ https: r.https, webcal: r.webcal, escopo: r.escopo });
				setTrocar(false);
				return;
			}
			if (antigoCancelado && r.estado !== "pronto") {
				setAviso("O link antigo já foi cancelado e o novo não saiu. Crie de novo. O arquivo .ics continua funcionando.");
				return;
			}
			if (r.estado === "indisponivel") {
				setAviso("A assinatura por link ainda não está disponível nesta conta. Enquanto isso, baixe o arquivo .ics.");
				return;
			}
			if (r.estado === "sem_sessao") {
				setAviso("Entre de novo na sua conta para criar o link.");
				return;
			}
			if (r.estado === "sem_acesso") {
				setAviso("Este papel não assina a agenda da equipe. Nada foi criado.");
				return;
			}
			setAviso("Não consegui criar o link agora. O arquivo .ics continua disponível.");
		} finally {
			setOcupado(false);
		}
	}

	async function copiar() {
		if (!link || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(link.https);
			setCopiado(true);
		} catch {
			setAviso("Não consegui copiar. Selecione o endereço e copie à mão.");
		}
	}

	const fraseEscopo =
		link?.escopo === "propria"
			? "Este link tem só as visitas em que você é o responsável."
			: "Este link tem a agenda da conta, inclusive a da equipe.";

	return (
		<>
			<Button type="button" variant="outline" className="gap-2" onClick={() => setAberto(true)}>
				<CalendarSync className="size-4" aria-hidden="true" />
				Outro calendário
			</Button>
			<Dialog open={aberto} onOpenChange={setAberto}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Levar a agenda para outro calendário</DialogTitle>
						<DialogDescription>
							Arquivo .ics ou link de assinatura. O que você mudar no Google Agenda, no iPhone ou no Outlook não volta para o OLLI. A conexão direta com a conta Google continua desligada.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-3">
						<Button
							type="button"
							variant="outline"
							className="justify-start gap-2"
							disabled={ocupado}
							onClick={() => {
								if (!baixarIcsAgenda(itens)) {
									setAviso("Não há compromisso dos últimos 30 dias, nem série que se repete, para baixar.");
								}
							}}
						>
							Baixar agenda (.ics)
						</Button>
						<p className="text-xs text-text-secondary">
							O arquivo baixa o que esta tela mostra, de 30 dias atrás para a frente, mais as séries que se repetem. O link segue o seu papel: técnico assina só as próprias visitas; dono, gestor e admin assinam a agenda da conta. Quem tiver o link vê título, cliente, endereço e observação.
						</p>
						{!link ? (
							<Button type="button" variant="outline" className="justify-start gap-2" disabled={ocupado} onClick={() => void criar(false)}>
								{ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
								Criar link de assinatura
							</Button>
						) : (
							<div className="grid gap-2">
								<p className="text-sm text-text-secondary">
									{fraseEscopo} Quem tiver o link vê título, cliente, endereço e observação. Se vazar, gere outro. No Google Agenda: Configurações, Adicionar calendário, Por URL. No iPhone, assine o endereço webcal.
								</p>
								<p className="break-all text-sm text-text-primary">
									{link.https}
								</p>
								<p className="break-all text-xs text-text-secondary">{link.webcal}</p>
								<div className="flex flex-wrap gap-2">
									<Button type="button" variant="outline" onClick={() => void copiar()}>
										{copiado ? "Copiado" : "Copiar link https"}
									</Button>
									{!trocar ? (
										<Button type="button" variant="ghost" onClick={() => setTrocar(true)} disabled={ocupado}>
											Gerar outro link
										</Button>
									) : (
										<Button type="button" variant="ghost" onClick={() => void criar(true)} disabled={ocupado}>
											Confirmar: o link antigo para
										</Button>
									)}
								</div>
							</div>
						)}
						{aviso ? (
							<p role="alert" className="text-sm font-medium text-error-dark dark:text-error">
								{aviso}
							</p>
						) : null}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
