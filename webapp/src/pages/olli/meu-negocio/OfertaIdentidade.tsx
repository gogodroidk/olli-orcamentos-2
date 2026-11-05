import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";
import {
	BRIEFING_MAX,
	CHAVE_SESSAO_WEB,
	FRASES_REVISAO,
	PECAS_IDENTIDADE,
	lerPedido,
	mensagemPedido,
	montarPedido,
	nomeDaPeca,
	rotuloQuando,
	serializarPedido,
	textoOferta,
	textoResultado,
	type PecaId,
	type PedidoIdentidade,
} from "@identidade-upsell";

type Passo = "oferta" | "escolha" | "briefing" | "revisao" | "pronto";
type AvisoTela = "ok" | "sem_sessao" | "erro";

function lerSessao(): PedidoIdentidade | null {
	try {
		return lerPedido(sessionStorage.getItem(CHAVE_SESSAO_WEB));
	} catch {
		return null;
	}
}

function gravarSessao(pedido: PedidoIdentidade): boolean {
	try {
		sessionStorage.setItem(CHAVE_SESSAO_WEB, serializarPedido(pedido));
		return true;
	} catch {
		return false;
	}
}

async function avisarEquipe(pedido: PedidoIdentidade): Promise<AvisoTela> {
	const { data } = await supabase.auth.getUser();
	const user = data.user;
	if (!user) return "sem_sessao";
	const { error } = await supabase.from("feedback").insert({
		user_id: user.id,
		tipo: "sugestao",
		mensagem: mensagemPedido(pedido),
		contexto: {
			tela: "MeuNegocioWeb",
			assunto: "identidade_visual_upsell",
			pecas: pedido.pecas.join(","),
			origem: "sugestao",
			plataforma: "web",
		},
	});
	return error ? "erro" : "ok";
}

/**
 * Oferta de identidade visual vendida à parte. O preço não aparece: o Igor ainda
 * não publicou. O botão anota o pedido na caixa interna e nesta aba. Não cobra.
 */
export function OfertaIdentidade({ temLogo, bloqueado }: { temLogo: boolean; bloqueado: boolean }) {
	const oferta = textoOferta(temLogo);
	const [passo, setPasso] = useState<Passo>("oferta");
	const [pecas, setPecas] = useState<PecaId[]>([]);
	const [briefing, setBriefing] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);
	const [guardado, setGuardado] = useState<PedidoIdentidade | null>(() => lerSessao());
	const [resultado, setResultado] = useState<{ aviso: AvisoTela; gravou: boolean } | null>(null);

	function alternar(id: PecaId) {
		setErro(null);
		setPecas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
	}

	function seguirEscolha() {
		if (pecas.length === 0) {
			setErro("Escolha ao menos uma peça.");
			return;
		}
		setErro(null);
		setPasso("briefing");
	}

	function seguirBriefing() {
		const montado = montarPedido({ pecas, briefing }, { id: "rascunho", agoraIso: new Date().toISOString() });
		if (!montado.ok) {
			setErro(montado.motivo);
			return;
		}
		setBriefing(montado.pedido.briefing);
		setErro(null);
		setPasso("revisao");
	}

	async function anotar() {
		if (enviando || bloqueado) return;
		const montado = montarPedido(
			{ pecas, briefing },
			{ id: crypto.randomUUID(), agoraIso: new Date().toISOString() },
		);
		if (!montado.ok) {
			setErro(montado.motivo);
			return;
		}
		setEnviando(true);
		setErro(null);
		const base: PedidoIdentidade = { ...montado.pedido, avisoEquipe: "nao_enviado" };
		const gravouAntes = gravarSessao(base);
		let aviso: AvisoTela = "erro";
		try {
			aviso = await avisarEquipe(base);
		} catch {
			aviso = "erro";
		}
		const final: PedidoIdentidade = { ...base, avisoEquipe: aviso === "ok" ? "enviado" : "nao_enviado" };
		const gravou = gravouAntes ? gravarSessao(final) : false;
		if (gravou) setGuardado(final);
		setResultado({ aviso, gravou: gravouAntes && gravou });
		setPasso("pronto");
		setEnviando(false);
	}

	return (
		<section aria-labelledby="oferta-identidade" className="rounded-xl border border-border bg-card p-5 md:p-6">
			<h2 id="oferta-identidade" className="text-base font-semibold text-text-primary">
				{oferta.titulo}
			</h2>
			<p className="mb-4 mt-1 text-sm text-text-secondary">{oferta.corpo}</p>

			{bloqueado && (
				<p className="mb-4 text-sm text-text-secondary">Só o dono da conta pede este serviço.</p>
			)}

			{passo === "oferta" && (
				<div className="grid gap-3">
					{PECAS_IDENTIDADE.map((peca) => (
						<div key={peca.id}>
							<p className="text-sm font-semibold text-text-primary">{peca.nome}</p>
							<p className="text-sm text-text-secondary">{peca.entrega}</p>
							<p className="text-sm text-text-secondary">{peca.limite}</p>
						</div>
					))}
					<p className="text-sm text-text-primary">
						{FRASES_REVISAO[0]} {FRASES_REVISAO[1]}
					</p>
					{guardado && (
						<p className="text-sm text-text-secondary">
							Último pedido {rotuloQuando(guardado.criadoEm)}: {guardado.pecas.map(nomeDaPeca).join(", ")}.
							{guardado.avisoEquipe === "enviado" ? " A equipe recebeu." : " A equipe ainda não recebeu este."}
						</p>
					)}
					<Button type="button" disabled={bloqueado} onClick={() => { setErro(null); setPasso("escolha"); }}>
						Escolher o que preciso
					</Button>
				</div>
			)}

			{passo === "escolha" && (
				<div className="grid gap-2">
					<p className="text-sm font-semibold text-text-primary">O que você quer que a gente desenhe?</p>
					<p className="text-sm text-text-secondary">Pode marcar mais de uma. Nada é cobrado ao marcar.</p>
					{PECAS_IDENTIDADE.map((peca) => {
						const ativa = pecas.includes(peca.id);
						return (
							<button
								key={peca.id}
								type="button"
								aria-pressed={ativa}
								disabled={bloqueado}
								onClick={() => alternar(peca.id)}
								className={cn(
									"rounded-lg border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
									ativa ? "border-primary bg-primary/10" : "border-border",
								)}
							>
								<span className="block text-sm font-semibold text-text-primary">{peca.nome}</span>
								<span className="block text-sm text-text-secondary">{peca.entrega} {peca.limite}</span>
							</button>
						);
					})}
					{erro && <p role="alert" className="text-sm font-medium text-error">{erro}</p>}
					<div className="mt-2 flex flex-wrap gap-2">
						<Button type="button" disabled={bloqueado} onClick={seguirEscolha}>Continuar</Button>
						<Button type="button" variant="ghost" onClick={() => { setErro(null); setPasso("oferta"); }}>Voltar</Button>
					</div>
				</div>
			)}

			{passo === "briefing" && (
				<div className="grid gap-3">
					<label className="text-sm font-semibold text-text-primary" htmlFor="briefing-identidade">
						O que a marca precisa passar
					</label>
					<p className="text-sm text-text-secondary">Ofício, cores e onde a marca vai aparecer. Sem CPF, sem CNPJ e sem dado de cliente.</p>
					<Textarea
						id="briefing-identidade"
						disabled={bloqueado}
						maxLength={BRIEFING_MAX}
						value={briefing}
						onChange={(evento) => { setBriefing(evento.target.value); setErro(null); }}
						placeholder="Ex.: assistência de ar em Campinas, sóbrio, azul e branco, para o orçamento e a arte da camiseta."
						rows={5}
					/>
					<p className="text-xs text-text-secondary">{briefing.trim().length}/{BRIEFING_MAX}</p>
					{erro && <p role="alert" className="text-sm font-medium text-error">{erro}</p>}
					<div className="flex flex-wrap gap-2">
						<Button type="button" disabled={bloqueado} onClick={seguirBriefing}>Revisar pedido</Button>
						<Button type="button" variant="ghost" onClick={() => { setErro(null); setPasso("escolha"); }}>Voltar</Button>
					</div>
				</div>
			)}

			{passo === "revisao" && (
				<div className="grid gap-2">
					<p className="text-sm font-semibold text-text-primary">Confira antes de anotar</p>
					<p className="text-sm font-semibold text-text-primary">{pecas.map(nomeDaPeca).join(", ")}</p>
					<p className="text-sm text-text-secondary">{briefing}</p>
					<ul className="list-disc pl-5 text-sm text-text-secondary">
						{FRASES_REVISAO.map((frase) => <li key={frase}>{frase}</li>)}
					</ul>
					{erro && <p role="alert" className="text-sm font-medium text-error">{erro}</p>}
					<div className="mt-2 flex flex-wrap gap-2">
						<Button type="button" disabled={bloqueado || enviando} onClick={() => { void anotar(); }}>
							{enviando ? "Anotando…" : "Anotar pedido"}
						</Button>
						<Button type="button" variant="ghost" disabled={enviando} onClick={() => { setErro(null); setPasso("briefing"); }}>Voltar</Button>
					</div>
				</div>
			)}

			{passo === "pronto" && resultado && (
				<div className="grid gap-3">
					<p className="text-sm font-semibold text-text-primary">
						{resultado.aviso === "ok" || resultado.gravou ? "Pedido anotado" : "Pedido não saiu"}
					</p>
					<p className="text-sm text-text-primary">{textoResultado(resultado.aviso, resultado.gravou, "navegador")}</p>
					<Button type="button" variant="outline" onClick={() => { setPasso("oferta"); setResultado(null); }}>
						Ver a oferta de novo
					</Button>
				</div>
			)}
		</section>
	);
}
