/**
 * "ENVIAR PELO WHATSAPP" no painel — fecha o buraco do envio (06/10/2026).
 *
 * O painel só imprimia o PDF. Das contas reais, 10 PDFs "enviados": 0 com link /o/ (o cliente nunca
 * teve o que abrir) e 4 seguiam em rascunho. O app já tinha este fluxo; o painel não, e é por ele
 * que entram os cadastros de anúncio.
 *
 * O fluxo é o do app (`handleWhatsAppAgora` + "Conseguiu enviar?"), com a mesma honestidade:
 *  1. confere o WhatsApp do cliente (número duvidoso NÃO abre o WhatsApp de um desconhecido);
 *  2. porta do cadastro (o documento sai com os dados do negócio — 3 estados, erro nunca libera);
 *  3. registra o envio (reserva) e publica o link /o/<token> — se o link falhar, a mensagem sai
 *     SEM link e o diálogo diz isso, para ninguém achar que foi com;
 *  4. mostra a mensagem pronta e o botão "Abrir o WhatsApp" (clique real da pessoa, sem popup);
 *  5. ABRIR NÃO É ENVIAR: só depois de "Já enviei" o envio é confirmado e o orçamento vira
 *     "enviado" (e só se ainda for rascunho — nunca rebaixa quem já foi aprovado).
 */

import { avisoTrialAutomatico } from "@ativacao";
import type { Orcamento } from "@dominio";
import type { ReservaEnvioOrcamento } from "@limites-comerciais";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { mascaraTelefone } from "@/olli/components/campos";
import { doNavegador, escolherNaAgenda, primeiroTelefone, seletorDeContatosDisponivel } from "@/olli/contatos/contatos";
import {
	avisoLimiteEnvios,
	cancelarReservaEnvioOrcamento,
	confirmarEnvioOrcamento,
	obterEstadoOfertaComercial,
	reservarEnvioOrcamento,
} from "@/olli/cota-envios";
import { usePortaDoCadastro } from "@/olli/exigirCadastro";
import { linkWhatsApp, numeroParaWhatsApp } from "@/olli/linkWhatsApp";
import { useSalvar } from "@/olli/mutacoes";
import { publicarLinkOrcamento } from "@/olli/publicarLink";
import { registrarEtapaAtivacao } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { montarMensagemEnvioOrcamento, montarMensagemLinkOrcamento } from "../../../../../src/utils/mensagensOrcamento";
import { useMarcarEnviado } from "./useMarcarEnviado";

interface Pendente {
	orcamentoId: string;
	blob: Orcamento;
	reserva: ReservaEnvioOrcamento;
	linkWa: string;
	url: string | null;
	mensagem: string;
	/** `true` depois que a pessoa clicou em "Abrir o WhatsApp": agora falta ela dizer se mandou. */
	abriu: boolean;
}

export function useEnviarWhatsApp() {
	const qc = useQueryClient();
	const exigirCadastro = usePortaDoCadastro();
	const marcarEnviado = useMarcarEnviado();
	const [pendente, setPendente] = useState<Pendente | null>(null);
	const [preparando, setPreparando] = useState<string | null>(null);
	const [confirmando, setConfirmando] = useState(false);
	// D-2151 #2: orçamento sem WhatsApp do cliente. Antes era um aviso vermelho sem saída e o 1º envio
	// morria ali; agora o número é pedido AQUI, salvo no orçamento (blob fresco) e o envio segue.
	const salvarOrcamento = useSalvar("orcamentos");
	const [semNumero, setSemNumero] = useState<{ orcamentoId: string; blob: Orcamento } | null>(null);
	const [numero, setNumero] = useState("");
	const [erroNumero, setErroNumero] = useState<string | null>(null);
	const [salvandoNumero, setSalvandoNumero] = useState(false);

	const enviar = useCallback(
		async (orcamentoId: string, blob: Orcamento) => {
			if (preparando) return;
			// 1) WhatsApp do cliente: número que não dá para confiar não vira link.
			const semLinkWa = linkWhatsApp(blob.clienteTelefone, "");
			if (!semLinkWa) {
				setNumero(blob.clienteTelefone ?? "");
				setErroNumero(null);
				setSemNumero({ orcamentoId, blob });
				return;
			}
			setPreparando(orcamentoId);
			try {
				// 2) Porta do cadastro: o documento sai com os dados do negócio.
				const empresa = await exigirCadastro("orcamento");
				if (!empresa) return;

				// 3) Registra o envio (nunca barra: sem registro o envio segue) e publica o link.
				const reserva = await reservarEnvioOrcamento(orcamentoId, "whatsapp");
				if (!reserva.permitido) {
					// P0-09: limite do Grátis em conta nova — só o envio para, o orçamento fica salvo.
					const aviso = avisoLimiteEnvios(reserva);
					toast.info(aviso.titulo, { description: aviso.mensagem, position: "top-center", duration: 12_000 });
					return;
				}
				let url: string | null = null;
				let mensagem = montarMensagemEnvioOrcamento(blob, empresa);
				try {
					url = await publicarLinkOrcamento(blob, empresa, { supabase });
					mensagem = montarMensagemLinkOrcamento(blob, empresa, url);
				} catch {
					// Mensagem sem link ainda fecha negócio ("responda aprovado"); o diálogo avisa.
				}
				const linkWa = linkWhatsApp(blob.clienteTelefone, mensagem);
				if (!linkWa) {
					if (reserva.requerConfirmacao) await cancelarReservaEnvioOrcamento(orcamentoId, reserva.reservaToken);
					toast.error("Não consegui montar a mensagem do WhatsApp.");
					return;
				}
				setPendente({ orcamentoId, blob, reserva, linkWa, url, mensagem, abriu: false });
			} finally {
				setPreparando(null);
			}
		},
		[exigirCadastro, preparando],
	);

	/** Salva o número no orçamento (relê o blob fresco; nunca grava por cima de um velho) e segue o envio. */
	const salvarNumeroEEnviar = useCallback(async () => {
		const alvo = semNumero;
		if (!alvo || salvandoNumero) return;
		if (!numeroParaWhatsApp(numero)) {
			setErroNumero("Confira o número: DDD + número, ex.: (11) 98123-4567.");
			return;
		}
		setSalvandoNumero(true);
		setErroNumero(null);
		let salvo = false;
		try {
			const { data, error } = await supabase
				.from("orcamentos")
				.select("dados")
				.eq("id", alvo.orcamentoId)
				.maybeSingle();
			if (error) throw error;
			const fresco = data?.dados as Orcamento | null | undefined;
			if (!fresco || typeof fresco !== "object") throw new Error("orçamento não encontrado");
			const atualizado = { ...fresco, clienteTelefone: numero, atualizadoEm: new Date().toISOString() };
			await salvarOrcamento.mutateAsync(atualizado);
			void qc.invalidateQueries({ queryKey: ["olli", "orcamentos"] });
			salvo = true;
		} catch {
			// Erro nunca vira silêncio: o diálogo fica aberto e diz o que houve.
			setErroNumero("Não consegui salvar o número agora. Verifique a internet e tente de novo.");
		} finally {
			setSalvandoNumero(false);
		}
		if (!salvo) return;
		// Fora do try: uma falha do ENVIO tem a mensagem própria do `enviar` e não pode virar
		// "não consegui salvar" (já salvou) num diálogo que já fechou (revisão LIVRE #379, P3).
		setSemNumero(null);
		await enviar(alvo.orcamentoId, { ...alvo.blob, clienteTelefone: numero });
	}, [semNumero, salvandoNumero, numero, salvarOrcamento, qc, enviar]);

	const dialogoNumero = (
		<Dialog open={!!semNumero} onOpenChange={(aberto) => !aberto && !salvandoNumero && setSemNumero(null)}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Qual o WhatsApp de {semNumero?.blob.clienteNome || "seu cliente"}?</DialogTitle>
					<DialogDescription>Fica salvo neste orçamento. Depois é só conferir a mensagem e enviar.</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(ev) => {
						ev.preventDefault();
						void salvarNumeroEEnviar();
					}}
					className="space-y-2"
				>
					<Label htmlFor="whatsapp-cliente-envio">WhatsApp com DDD</Label>
					<Input
						id="whatsapp-cliente-envio"
						type="tel"
						inputMode="tel"
						autoFocus
						value={numero}
						onChange={(ev) => setNumero(mascaraTelefone(ev.target.value))}
						placeholder="(11) 98123-4567"
						maxLength={20}
						aria-invalid={!!erroNumero}
						aria-describedby={erroNumero ? "whatsapp-cliente-envio-erro" : undefined}
						className="min-h-[44px]"
					/>
					{/* D-2245: no Chrome do Android a agenda abre aqui mesmo (iPhone/computador não oferecem). */}
					{seletorDeContatosDisponivel() && (
						<Button
							type="button"
							variant="outline"
							className="min-h-[44px] w-full"
							disabled={salvandoNumero}
							onClick={async () => {
								setErroNumero(null);
								try {
									const escolhido = await escolherNaAgenda(false);
									if (!escolhido.length) return;
									const tel = primeiroTelefone(doNavegador(escolhido));
									if (tel) setNumero(mascaraTelefone(tel));
									else setErroNumero("Esse contato não tem telefone com DDD. Digite o número.");
								} catch {
									setErroNumero("O navegador não abriu a agenda agora. Digite o número.");
								}
							}}
						>
							Puxar dos contatos
						</Button>
					)}
					{erroNumero && (
						<p id="whatsapp-cliente-envio-erro" role="alert" className="text-sm text-error">
							{erroNumero}
						</p>
					)}
					<DialogFooter className="gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							className="min-h-[44px]"
							disabled={salvandoNumero}
							onClick={() => setSemNumero(null)}
						>
							Cancelar
						</Button>
						<Button type="submit" className="min-h-[44px]" disabled={salvandoNumero} aria-busy={salvandoNumero}>
							{salvandoNumero ? "Salvando…" : "Salvar e continuar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);

	const cancelar = useCallback(async () => {
		const p = pendente;
		setPendente(null);
		if (p?.reserva.requerConfirmacao) await cancelarReservaEnvioOrcamento(p.orcamentoId, p.reserva.reservaToken);
	}, [pendente]);

	/** "Já enviei": confirma o envio e move rascunho → enviado. Nunca lança. */
	const jaEnviei = useCallback(async () => {
		const p = pendente;
		if (!p || confirmando) return;
		setConfirmando(true);
		try {
			const confirmou = await confirmarEnvioOrcamento(p.orcamentoId, p.reserva.reservaToken);
			void registrarEtapaAtivacao("orcamento_enviado");

			// Status: relê o blob FRESCO e só move rascunho → enviado (nunca rebaixa).
			const resultado = await marcarEnviado(p.orcamentoId);
			const statusAtualizado = resultado === "enviado";
			const falhouStatus = resultado === "falhou";

			if (falhouStatus) {
				toast.warning("Envio registrado, mas não consegui atualizar o status", {
					description: "Mude o orçamento para “Enviado” no Quadro para ele aparecer no acompanhamento.",
					duration: 10_000,
				});
			} else if (statusAtualizado) {
				toast.success("Orçamento marcado como enviado", {
					description: p.url ? "Quando o cliente abrir o link, você vê aqui." : "Foi sem o link do cliente.",
				});
			}

			// Teste do Pro liberado no 1º envio: o servidor concede; aqui só contamos se confirmou.
			if (confirmou && p.reserva.requerConfirmacao) {
				const oferta = await obterEstadoOfertaComercial();
				const aviso = avisoTrialAutomatico(p.reserva, oferta);
				if (aviso) {
					void qc.invalidateQueries({ queryKey: ["olli", "oferta-comercial"] });
					void qc.invalidateQueries({ queryKey: ["olli", "assinatura", "me"] });
					setTimeout(() => toast.success(aviso.titulo, { description: aviso.mensagem, duration: 12_000 }), 0);
				}
			}
			void qc.invalidateQueries({ queryKey: ["olli", "orcamentos"] });
		} finally {
			setConfirmando(false);
			setPendente(null);
		}
	}, [pendente, confirmando, marcarEnviado, qc]);

	const copiarLink = useCallback(async () => {
		if (!pendente?.url) return;
		try {
			await navigator.clipboard.writeText(pendente.url);
			toast.success("Link copiado");
		} catch {
			toast.error("Não consegui copiar. Selecione o link e copie à mão.", { description: pendente.url });
		}
	}, [pendente]);

	const dialogo = (
		<Dialog open={!!pendente} onOpenChange={(aberto) => !aberto && !confirmando && void cancelar()}>
			<DialogContent className="sm:max-w-lg">
				{pendente && !pendente.abriu && (
					<>
						<DialogHeader>
							<DialogTitle>Enviar para {pendente.blob.clienteNome || "o cliente"} pelo WhatsApp</DialogTitle>
							<DialogDescription>
								{pendente.url
									? "O link do orçamento está pronto: o cliente abre, confere e aprova com um toque."
									: "Não consegui gerar o link do cliente agora — a mensagem vai sem ele (o cliente responde “aprovado”)."}
							</DialogDescription>
						</DialogHeader>
						<pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-text-secondary">
							{pendente.mensagem}
						</pre>
						<DialogFooter className="gap-2 sm:justify-between">
							<div className="flex gap-2">
								<Button type="button" variant="outline" onClick={() => void cancelar()}>
									Cancelar
								</Button>
								{pendente.url && (
									<Button type="button" variant="outline" onClick={() => void copiarLink()}>
										Copiar link
									</Button>
								)}
							</div>
							<Button asChild>
								<a
									href={pendente.linkWa}
									target="_blank"
									rel="noopener noreferrer"
									onClick={() => setPendente((p) => (p ? { ...p, abriu: true } : p))}
								>
									Abrir o WhatsApp
								</a>
							</Button>
						</DialogFooter>
					</>
				)}
				{pendente?.abriu && (
					<>
						<DialogHeader>
							<DialogTitle>Conseguiu enviar?</DialogTitle>
							<DialogDescription>
								Abrir o WhatsApp não é enviar. Toque em “Enviar” lá e volte aqui: só marco o orçamento como enviado se
								você confirmar.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="gap-2">
							<Button type="button" variant="outline" disabled={confirmando} onClick={() => void cancelar()}>
								Ainda não
							</Button>
							<Button type="button" disabled={confirmando} onClick={() => void jaEnviei()}>
								{confirmando ? "Registrando…" : "Já enviei"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);

	return {
		enviar,
		preparando,
		dialogo: (
			<>
				{dialogo}
				{dialogoNumero}
			</>
		),
	};
}
