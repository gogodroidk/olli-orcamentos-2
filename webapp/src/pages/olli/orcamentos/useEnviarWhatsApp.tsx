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
 *
 * CQ-ATIVACAO-LOTE1 (19/11/2026, achados 3 e 6 da revisão de ativação):
 *  - SEM o WhatsApp do cliente, o envio não morre mais num aviso vermelho: o número é pedido AQUI,
 *    num campo só (DDD + número, o erro diz o que consertar), e fica salvo no orçamento e no
 *    cadastro do cliente (só se o cliente ainda não tinha número válido). 3 dos 9 que orçaram e
 *    não enviaram não tinham o número em nenhum orçamento.
 *  - "COPIAR LINK" funciona sem número (modo `link`): a pessoa cola onde quiser. Mesma porta do
 *    cadastro, mesmo registro do envio (canal `link`) e a mesma honestidade: copiar não é enviar,
 *    então só "Já enviei" confirma o envio (registro, teste do Pro, evento). Atenção: publicar o
 *    link já promove o status para "enviado" no banco (trigger 20261024040000) — igual ao WhatsApp.
 *  - MEDIÇÃO: `envio_barrado_sem_whatsapp` (pediu o número), `orcamento_salvar_barrado` (limite do
 *    Grátis segurou) e, na porta, `envio_barrado_cadastro`. Sem dado pessoal.
 */
import type { Orcamento } from "@dominio";
import { avisoTrialAutomatico } from "@ativacao";
import type { ReservaEnvioOrcamento } from "@limites-comerciais";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { mascaraTelefone } from "@/olli/components/campos";
import { avisoLimiteEnvios, cancelarReservaEnvioOrcamento, confirmarEnvioOrcamento, obterEstadoOfertaComercial, reservarEnvioOrcamento } from "@/olli/cota-envios";
import { conferirWhatsAppDigitado, type ModoEnvio, proximoPassoDoEnvio } from "@/olli/envioAtivacao";
import { usePortaDoCadastro } from "@/olli/exigirCadastro";
import { linkWhatsApp, numeroParaWhatsApp } from "@/olli/linkWhatsApp";
import { useSalvar } from "@/olli/mutacoes";
import { publicarLinkOrcamento } from "@/olli/publicarLink";
import { registrarEtapaAtivacao } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { useMarcarEnviado } from "./useMarcarEnviado";
import { montarMensagemEnvioOrcamento, montarMensagemLinkOrcamento } from "../../../../../src/utils/mensagensOrcamento";

interface Pendente {
	orcamentoId: string;
	blob: Orcamento;
	reserva: ReservaEnvioOrcamento;
	/** `whatsapp`: mensagem pronta + "Abrir o WhatsApp". `link`: link copiado para colar onde quiser. */
	modo: ModoEnvio;
	/** `null` no modo `link` (não há conversa para abrir). */
	linkWa: string | null;
	url: string | null;
	mensagem: string;
	/** `true` depois que a pessoa clicou em "Abrir o WhatsApp": agora falta ela dizer se mandou. */
	abriu: boolean;
	/** Modo `link`: a cópia automática deu certo? Se não, o diálogo mostra o link para copiar à mão. */
	copiou: boolean;
}

/** Copia para a área de transferência sem lançar (o navegador pode recusar fora de um clique). */
async function copiarTexto(texto: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(texto);
		return true;
	} catch {
		return false;
	}
}

/** Alvo de toque de 44 px no celular (Fitts / WCAG 2.5.8); compacto a partir de `sm`. */
const TOQUE = "min-h-[44px] sm:min-h-9";

export function useEnviarWhatsApp() {
	const qc = useQueryClient();
	const exigirCadastro = usePortaDoCadastro();
	const marcarEnviado = useMarcarEnviado();
	const salvarOrcamento = useSalvar("orcamentos");
	const [pendente, setPendente] = useState<Pendente | null>(null);
	const [preparando, setPreparando] = useState<string | null>(null);
	const [confirmando, setConfirmando] = useState(false);
	// Orçamento sem WhatsApp do cliente: o número é pedido no próprio diálogo de envio.
	const [semNumero, setSemNumero] = useState<{ orcamentoId: string; blob: Orcamento } | null>(null);
	const [numero, setNumero] = useState("");
	const [erroNumero, setErroNumero] = useState<string | null>(null);
	const [salvandoNumero, setSalvandoNumero] = useState(false);
	const idCampo = useId();
	const idErro = `${idCampo}-erro`;
	const idDica = `${idCampo}-dica`;
	const idLink = useId();

	/**
	 * Envia o orçamento. `modo = "whatsapp"` (padrão) abre a conversa com a mensagem pronta;
	 * `modo = "link"` publica o link /o/ e copia, para a pessoa mandar por onde quiser.
	 */
	const enviar = useCallback(
		async (orcamentoId: string, blob: Orcamento, modo: ModoEnvio = "whatsapp") => {
			if (preparando) return;
			// 1) WhatsApp do cliente: número que não dá para confiar não vira link — pede o número AQUI.
			if (proximoPassoDoEnvio(modo, blob.clienteTelefone) === "pedir_numero") {
				void registrarEtapaAtivacao("envio_barrado_sem_whatsapp");
				setNumero(blob.clienteTelefone ? mascaraTelefone(blob.clienteTelefone) : "");
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
				const reserva = await reservarEnvioOrcamento(orcamentoId, modo);
				if (!reserva.permitido) {
					// P0-09: limite do Grátis em conta nova — só o envio para, o orçamento fica salvo.
					void registrarEtapaAtivacao("orcamento_salvar_barrado");
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
				if (modo === "link") {
					// Sem link não há o que copiar: desfaz o registro e diz o que fazer.
					if (!url) {
						if (reserva.requerConfirmacao) await cancelarReservaEnvioOrcamento(orcamentoId, reserva.reservaToken);
						toast.error("Não consegui criar o link agora", {
							description: "Nada foi enviado. Confira a internet e toque em “Copiar link” de novo.",
							position: "top-center",
						});
						return;
					}
					const copiou = await copiarTexto(url);
					setPendente({ orcamentoId, blob, reserva, modo, linkWa: null, url, mensagem, abriu: false, copiou });
					return;
				}
				const linkWa = linkWhatsApp(blob.clienteTelefone, mensagem);
				if (!linkWa) {
					if (reserva.requerConfirmacao) await cancelarReservaEnvioOrcamento(orcamentoId, reserva.reservaToken);
					toast.error("Não consegui montar a mensagem do WhatsApp.");
					return;
				}
				setPendente({ orcamentoId, blob, reserva, modo, linkWa, url, mensagem, abriu: false, copiou: false });
			} finally {
				setPreparando(null);
			}
		},
		[exigirCadastro, preparando],
	);

	/**
	 * "Salvar e continuar": confere o número (o erro diz o que consertar), grava no orçamento — relendo
	 * o blob FRESCO, nunca por cima de um velho — e no cadastro do cliente quando ele ainda não tinha
	 * número válido (nunca troca um número bom em silêncio). Depois segue o envio pelo WhatsApp.
	 */
	const salvarNumeroEEnviar = useCallback(async () => {
		const alvo = semNumero;
		if (!alvo || salvandoNumero) return;
		const conferido = conferirWhatsAppDigitado(numero);
		if (!conferido.ok) {
			setErroNumero(conferido.erro);
			return;
		}
		const telefone = mascaraTelefone(conferido.digitos);
		setSalvandoNumero(true);
		setErroNumero(null);
		let salvo = false;
		try {
			const { data, error } = await supabase.from("orcamentos").select("dados").eq("id", alvo.orcamentoId).maybeSingle();
			if (error) throw error;
			const fresco = data?.dados as Orcamento | null | undefined;
			if (!fresco || typeof fresco !== "object") throw new Error("orçamento não encontrado");
			await salvarOrcamento.mutateAsync({ ...fresco, clienteTelefone: telefone, atualizadoEm: new Date().toISOString() });
			salvo = true;
			if (fresco.clienteId) {
				// Best-effort: o orçamento já tem o número; o cadastro do cliente é um bônus.
				try {
					const { data: cli } = await supabase.from("clientes").select("telefone").eq("id", fresco.clienteId).maybeSingle();
					if (cli && !numeroParaWhatsApp(cli.telefone as string | null)) {
						await supabase
							.from("clientes")
							.update({ telefone, atualizado_em: new Date().toISOString() })
							.eq("id", fresco.clienteId);
						void qc.invalidateQueries({ queryKey: ["olli", "clientes"] });
					}
				} catch {
					// o envio segue com o número salvo no orçamento
				}
			}
			void qc.invalidateQueries({ queryKey: ["olli", "orcamentos"] });
		} catch {
			// Erro nunca vira silêncio: o diálogo fica aberto e diz o que fazer.
			setErroNumero("Não consegui salvar o número agora. Confira a internet e toque em “Salvar e continuar” de novo.");
		} finally {
			setSalvandoNumero(false);
		}
		if (!salvo) return;
		// Fora do try: uma falha do ENVIO tem a mensagem própria e não pode virar "não consegui salvar".
		setSemNumero(null);
		await enviar(alvo.orcamentoId, { ...alvo.blob, clienteTelefone: telefone }, "whatsapp");
	}, [semNumero, salvandoNumero, numero, salvarOrcamento, qc, enviar]);

	/** "Copiar link" sem número: fecha o pedido do número e segue no modo `link`. */
	const copiarLinkSemNumero = useCallback(async () => {
		const alvo = semNumero;
		if (!alvo || salvandoNumero) return;
		setSemNumero(null);
		await enviar(alvo.orcamentoId, alvo.blob, "link");
	}, [semNumero, salvandoNumero, enviar]);

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
		if (await copiarTexto(pendente.url)) {
			setPendente((p) => (p ? { ...p, copiou: true } : p));
			toast.success("Link copiado");
		} else {
			toast.error("Não consegui copiar. Selecione o link e copie à mão.", { description: pendente.url });
		}
	}, [pendente]);

	const nomeCliente = (b: Orcamento | undefined) => b?.clienteNome?.trim() || "seu cliente";

	const dialogoNumero = (
		<Dialog open={!!semNumero} onOpenChange={(aberto) => !aberto && !salvandoNumero && setSemNumero(null)}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Qual o WhatsApp de {nomeCliente(semNumero?.blob)}?</DialogTitle>
					<DialogDescription>Fica salvo neste orçamento. Depois é só conferir a mensagem e enviar.</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					onSubmit={(ev) => {
						ev.preventDefault();
						void salvarNumeroEEnviar();
					}}
					className="space-y-2"
				>
					<Label htmlFor={idCampo}>WhatsApp do cliente, com DDD</Label>
					<Input
						id={idCampo}
						type="tel"
						inputMode="tel"
						autoComplete="off"
						autoFocus
						value={numero}
						onChange={(ev) => {
							setNumero(mascaraTelefone(ev.target.value));
							if (erroNumero) setErroNumero(null);
						}}
						onBlur={() => {
							// Erro na hora de sair do campo (não só no envio) — mas campo vazio não grita.
							if (!numero.trim()) return;
							const c = conferirWhatsAppDigitado(numero);
							setErroNumero(c.ok ? null : c.erro);
						}}
						placeholder="(11) 98123-4567"
						maxLength={20}
						aria-invalid={!!erroNumero}
						aria-describedby={erroNumero ? idErro : idDica}
						className="min-h-[44px] text-base sm:text-sm"
					/>
					{erroNumero ? (
						<p id={idErro} role="alert" className="text-sm font-medium text-error-dark dark:text-error">
							{erroNumero}
						</p>
					) : (
						<p id={idDica} className="text-xs text-text-secondary">
							Não tem o número agora? Toque em “Copiar link” e mande por onde quiser.
						</p>
					)}
					<DialogFooter className="gap-2 pt-2 sm:justify-between">
						<div className="flex flex-col-reverse gap-2 sm:flex-row">
							<Button type="button" variant="ghost" className={TOQUE} disabled={salvandoNumero} onClick={() => setSemNumero(null)}>
								Cancelar
							</Button>
							<Button
								type="button"
								variant="outline"
								className={TOQUE}
								disabled={salvandoNumero || !!preparando}
								onClick={() => void copiarLinkSemNumero()}
							>
								Copiar link
							</Button>
						</div>
						<Button type="submit" className={TOQUE} disabled={salvandoNumero} aria-busy={salvandoNumero}>
							{salvandoNumero ? "Salvando…" : "Salvar e continuar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);

	const dialogo = (
		<Dialog open={!!pendente} onOpenChange={(aberto) => !aberto && !confirmando && void cancelar()}>
			<DialogContent className="sm:max-w-lg">
				{pendente?.modo === "link" && (
					<>
						<DialogHeader>
							<DialogTitle>Link do orçamento pronto</DialogTitle>
							<DialogDescription>
								{pendente.copiou
									? `Copiei o link. Cole na conversa com ${nomeCliente(pendente.blob)} e envie: ele abre, confere e aprova com um toque.`
									: `Copie o link abaixo, cole na conversa com ${nomeCliente(pendente.blob)} e envie.`}
							</DialogDescription>
						</DialogHeader>
						<Label htmlFor={idLink} className="sr-only">
							Link do orçamento
						</Label>
						<Input
							id={idLink}
							readOnly
							value={pendente.url ?? ""}
							onFocus={(ev) => ev.currentTarget.select()}
							className="min-h-[44px] font-mono text-sm"
						/>
						<p className="text-xs text-text-secondary">
							Copiar não é enviar: cole o link na conversa e, depois de mandar, toque em “Já enviei”.
						</p>
						<DialogFooter className="gap-2 sm:justify-between">
							<div className="flex flex-col-reverse gap-2 sm:flex-row">
								<Button type="button" variant="ghost" className={TOQUE} disabled={confirmando} onClick={() => void cancelar()}>
									Ainda não
								</Button>
								<Button type="button" variant="outline" className={TOQUE} disabled={confirmando} onClick={() => void copiarLink()}>
									{pendente.copiou ? "Copiar de novo" : "Copiar link"}
								</Button>
							</div>
							<Button type="button" className={TOQUE} disabled={confirmando} onClick={() => void jaEnviei()}>
								{confirmando ? "Registrando…" : "Já enviei"}
							</Button>
						</DialogFooter>
					</>
				)}
				{pendente?.modo === "whatsapp" && !pendente.abriu && pendente.linkWa && (
					<>
						<DialogHeader>
							<DialogTitle>Enviar para {nomeCliente(pendente.blob)} pelo WhatsApp</DialogTitle>
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
							<div className="flex flex-col-reverse gap-2 sm:flex-row">
								<Button type="button" variant="outline" className={TOQUE} onClick={() => void cancelar()}>
									Cancelar
								</Button>
								{pendente.url && (
									<Button type="button" variant="outline" className={TOQUE} onClick={() => void copiarLink()}>
										Copiar link
									</Button>
								)}
							</div>
							<Button asChild className={TOQUE}>
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
				{pendente?.modo === "whatsapp" && pendente.abriu && (
					<>
						<DialogHeader>
							<DialogTitle>Conseguiu enviar?</DialogTitle>
							<DialogDescription>
								Abrir o WhatsApp não é enviar. Toque em “Enviar” lá e volte aqui: só marco o orçamento como enviado se você confirmar.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="gap-2">
							<Button type="button" variant="outline" className={TOQUE} disabled={confirmando} onClick={() => void cancelar()}>
								Ainda não
							</Button>
							<Button type="button" className={TOQUE} disabled={confirmando} onClick={() => void jaEnviei()}>
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
