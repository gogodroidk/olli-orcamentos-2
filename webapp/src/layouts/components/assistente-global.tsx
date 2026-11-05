import {
	apagarConversa,
	atualizarConversa,
	type ConversaGuardada,
	type EstadoChatGuardado,
	LIMITE_MENSAGENS,
	lerEstadoChat,
	planoDeRevelacao,
} from "@chat-ui";
import { avaliarPedidoIa, type ModoPedidoIa } from "@ia-segura";
import { useQueryClient } from "@tanstack/react-query";
import {
	Bot,
	CheckCircle2,
	FilePlus2,
	History,
	Loader2,
	MessageSquareText,
	Mic,
	MicOff,
	Send,
	Sparkles,
	Square,
	Trash2,
	Undo2,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { AutopilotPanel } from "@/olli/components/AutopilotPanel";
import { MarkdownMensagem } from "@/olli/components/MarkdownMensagem";
import type { PrefillItemOrcamento } from "@/olli/components/prefillItemOrcamento";
import { cancelarAcaoIa, confirmarAcaoIa, type RascunhoAcaoIaRemota, reverterAcaoIa } from "@/olli/iaActions";
import type { AutopilotPreview } from "@/olli/iaAutopilot";
import type { FalhaIA, MensagemChat } from "@/pages/olli/diagnostico/chat";
import { perguntarAoAssistente } from "@/pages/olli/diagnostico/chat";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/ui/sheet";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";

const STORAGE_KEY = "olli-assistente-web-v1";
const STORAGE_ESTADO = "olli-assistente-web-v2";
const MAX_HISTORICO = 20;
const MAX_TEXTO = 4000;
const MAX_CORPO_BYTES = 48 * 1024;

type MensagemLocal = MensagemChat & { id: string; visivelAte?: number };

const formatoQuando = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

function lerDoNavegador(): EstadoChatGuardado {
	try {
		const novo = localStorage.getItem(STORAGE_ESTADO);
		if (novo) return lerEstadoChat(novo);
	} catch {
		// navegador sem localStorage: segue para a sessão
	}
	try {
		const antigo = sessionStorage.getItem(STORAGE_KEY);
		if (antigo) return lerEstadoChat(antigo);
	} catch {
		// sessão indisponível
	}
	return { ativaId: "", conversas: [] };
}

function reduzirMovimento(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
type PendenteCredito = { historico: MensagemChat[]; ref: string };
type ReenvioCancelado = {
	historico: MensagemChat[];
	ref: string;
	confirmarCredito: boolean;
	modo: Exclude<ModoPedidoIa, "bloqueado">;
};

type ReconhecimentoNavegador = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult:
		| ((evento: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
		| null;
	onerror: ((evento: { error?: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};
type ReconhecimentoConstrutor = new () => ReconhecimentoNavegador;

declare global {
	interface Window {
		SpeechRecognition?: ReconhecimentoConstrutor;
		webkitSpeechRecognition?: ReconhecimentoConstrutor;
	}
}

const SUGESTOES = [
	"Organize os pontos que devo confirmar antes de enviar um orçamento",
	"Me ajude a responder um cliente que achou o preço alto",
	"Transforme minha descrição em um item claro de orçamento",
];

function idMensagem() {
	return crypto.randomUUID();
}

/** Mantém a conversa abaixo do teto de 64 KiB do Worker, medindo UTF-8 real. */
function limitarHistorico(mensagens: MensagemChat[]): MensagemChat[] {
	const escolhidas: MensagemChat[] = [];
	for (const mensagem of [...mensagens].reverse()) {
		const tentativa = [mensagem, ...escolhidas];
		const bytes = new TextEncoder().encode(JSON.stringify({ mensagens: tentativa })).length;
		if (bytes > MAX_CORPO_BYTES) break;
		escolhidas.unshift(mensagem);
	}
	return escolhidas;
}

function nomeDaTela(pathname: string): string {
	const mapa: Record<string, string> = {
		"/inicio": "Início",
		"/orcamentos": "Orçamentos",
		"/clientes": "Clientes",
		"/produtos": "Produtos",
		"/servicos": "Serviços",
		"/agenda": "Agenda",
		"/contratos": "Contratos",
		"/equipamentos": "Equipamentos",
		"/equipe": "Equipe",
		"/planos": "Planos",
		"/integracoes": "Integrações",
	};
	return mapa[pathname] ?? "Painel";
}

function ListaHistorico({
	conversas,
	ativaId,
	onNova,
	onAbrir,
	onApagar,
}: {
	conversas: ConversaGuardada[];
	ativaId: string;
	onNova: () => void;
	onAbrir: (id: string) => void;
	onApagar: (id: string) => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center justify-between gap-2 px-3 py-3">
				<p className="text-sm font-semibold text-text-primary">Conversas</p>
				<Button type="button" size="sm" variant="outline" className="h-8" onClick={onNova}>
					Nova
				</Button>
			</div>
			<div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
				{conversas.length === 0 && (
					<p className="px-2 text-xs leading-relaxed text-text-secondary">
						As conversas ficam neste navegador. Nada disso vai para outra conta.
					</p>
				)}
				{conversas.map((conversa) => (
					<div
						key={conversa.id}
						className={cn(
							"flex items-start gap-1 rounded-xl px-2 py-2",
							conversa.id === ativaId ? "bg-primary/10" : "hover:bg-accent",
						)}
					>
						<button type="button" className="min-w-0 flex-1 text-left" onClick={() => onAbrir(conversa.id)}>
							<span className="block truncate text-sm font-medium text-text-primary">{conversa.titulo}</span>
							<span className="block text-[11px] text-text-secondary">
								{formatoQuando.format(conversa.atualizadoEm)}
							</span>
						</button>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-8 shrink-0"
							aria-label={`Apagar conversa ${conversa.titulo}`}
							onClick={() => onApagar(conversa.id)}
						>
							<Trash2 className="size-3.5" />
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}

export function AssistenteConversa({
	className,
	historicoLateral = false,
}: {
	className?: string;
	historicoLateral?: boolean;
}) {
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const [boot] = useState(lerDoNavegador);
	const [ativaId, setAtivaId] = useState(() => boot.ativaId || crypto.randomUUID());
	const [conversas, setConversas] = useState<ConversaGuardada[]>(boot.conversas);
	const [mensagens, setMensagens] = useState<MensagemLocal[]>(
		() => boot.conversas.find((c) => c.id === boot.ativaId)?.mensagens ?? [],
	);
	const [historicoAberto, setHistoricoAberto] = useState(false);
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [falha, setFalha] = useState<FalhaIA | null>(null);
	const [pendenteCredito, setPendenteCredito] = useState<PendenteCredito | null>(null);
	const [reenvio, setReenvio] = useState<ReenvioCancelado | null>(null);
	const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
	const [creditoSemSaldo, setCreditoSemSaldo] = useState(false);
	const [rascunhoAcao, setRascunhoAcao] = useState<RascunhoAcaoIaRemota | null>(null);
	const [processandoAcao, setProcessandoAcao] = useState(false);
	const [mensagemAcao, setMensagemAcao] = useState<string | null>(null);
	const [ouvindo, setOuvindo] = useState(false);
	const reconhecimentoRef = useRef<ReconhecimentoNavegador | null>(null);
	const fimRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const revelacaoRef = useRef(0);
	const revelacaoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const conversasRef = useRef(conversas);
	conversasRef.current = conversas;
	const geracaoRef = useRef(0);

	useEffect(() => {
		const limpas = mensagens.map((m) => ({ id: m.id, role: m.role, texto: m.texto })).slice(-LIMITE_MENSAGENS);
		const proximo = atualizarConversa(
			{ ativaId, conversas: conversasRef.current },
			{ id: ativaId, titulo: "", atualizadoEm: Date.now(), mensagens: limpas },
		);
		conversasRef.current = proximo.conversas;
		setConversas(proximo.conversas);
		try {
			localStorage.setItem(STORAGE_ESTADO, JSON.stringify(proximo));
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(limpas.slice(-MAX_HISTORICO)));
		} catch {
			// cota do navegador cheia: a conversa segue só na memória desta visita
		}
		fimRef.current?.scrollIntoView({ behavior: reduzirMovimento() ? "auto" : "smooth", block: "end" });
	}, [mensagens, ativaId]);

	useEffect(
		() => () => {
			reconhecimentoRef.current?.stop();
			reconhecimentoRef.current = null;
			if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
			abortRef.current?.abort();
		},
		[],
	);

	const historicoApi = useMemo<MensagemChat[]>(
		() => mensagens.slice(-MAX_HISTORICO).map(({ role, texto: conteudo }) => ({ role, texto: conteudo })),
		[mensagens],
	);

	function pularRevelacao() {
		revelacaoRef.current += 1;
		if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
		setMensagens((atuais) => atuais.map((m) => (m.visivelAte != null ? { ...m, visivelAte: undefined } : m)));
	}

	function revelarResposta(id: string, completo: string) {
		const plano = planoDeRevelacao(completo, reduzirMovimento());
		if (plano.cortes.length < 2) return;
		const token = ++revelacaoRef.current;
		let passo = 1;
		const tick = () => {
			if (revelacaoRef.current !== token) return;
			const corte = plano.cortes[passo] ?? completo.length;
			const ultimo = passo >= plano.cortes.length - 1;
			setMensagens((atuais) => atuais.map((m) => (m.id === id ? { ...m, visivelAte: ultimo ? undefined : corte } : m)));
			passo += 1;
			if (!ultimo) revelacaoTimerRef.current = setTimeout(tick, plano.intervaloMs);
		};
		revelacaoTimerRef.current = setTimeout(tick, plano.intervaloMs);
	}

	async function executar(
		historico: MensagemChat[],
		creditoRef: string,
		confirmarCredito = false,
		modo: Exclude<ModoPedidoIa, "bloqueado"> = "consulta",
	) {
		setFalha(null);
		setReenvio(null);
		setEnviando(true);
		revelacaoRef.current += 1;
		if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
		setMensagens((atuais) => atuais.map((m) => (m.visivelAte != null ? { ...m, visivelAte: undefined } : m)));
		const geracao = geracaoRef.current;
		const controller = new AbortController();
		abortRef.current = controller;
		const resposta = await perguntarAoAssistente(limitarHistorico(historico), {
			creditoRef,
			confirmarCredito,
			modo,
			signal: controller.signal,
		});
		if (abortRef.current === controller) abortRef.current = null;
		setEnviando(false);
		if (geracao !== geracaoRef.current) return;
		if (!resposta.ok && resposta.erro.tipo === "cancelado") {
			setReenvio({ historico, ref: creditoRef, confirmarCredito, modo });
			setFalha(resposta.erro);
			return;
		}
		if (!resposta.ok) {
			setFalha(resposta.erro);
			if (resposta.erro.tipo === "creditos") {
				if (confirmarCredito) setCreditoSemSaldo(true);
				else setPendenteCredito({ historico, ref: creditoRef });
			}
			return;
		}
		setPendenteCredito(null);
		setCreditoSemSaldo(false);
		if (resposta.rascunho) {
			setRascunhoAcao(resposta.rascunho);
			setMensagemAcao(null);
		}
		const textoResposta = resposta.rascunho
			? `${resposta.resposta}\n\nPrévia segura criada. Confira o antes e depois abaixo; nenhuma alteração foi aplicada ainda.`
			: resposta.resposta;
		const id = idMensagem();
		const plano = planoDeRevelacao(textoResposta, reduzirMovimento());
		const assistente: MensagemLocal = {
			id,
			role: "assistant",
			texto: textoResposta,
			visivelAte: plano.cortes.length > 1 ? plano.cortes[0] : undefined,
		};
		setMensagens((atuais) => [...atuais, assistente].slice(-LIMITE_MENSAGENS));
		revelarResposta(id, textoResposta);
	}

	async function enviar(valor = texto) {
		const limpo = valor.trim().slice(0, MAX_TEXTO);
		if (!limpo || enviando) return;
		const ultima = reenvio?.historico.at(-1);
		if (reenvio && ultima?.role === "user" && ultima.texto === limpo) {
			const alvo = reenvio;
			setReenvio(null);
			setTexto("");
			setFalha(null);
			await executar(alvo.historico, alvo.ref, alvo.confirmarCredito, alvo.modo);
			return;
		}
		setReenvio(null);
		const avaliacao = avaliarPedidoIa(limpo);
		if (avaliacao.modo === "bloqueado") {
			setMensagens((atuais) =>
				[
					...atuais.map((m) => (m.visivelAte != null ? { ...m, visivelAte: undefined } : m)),
					{ id: idMensagem(), role: "user" as const, texto: limpo },
					{
						id: idMensagem(),
						role: "assistant" as const,
						texto: avaliacao.motivo ?? "Não posso executar essa operação pelo chat.",
					},
				].slice(-LIMITE_MENSAGENS),
			);
			setTexto("");
			setFalha(null);
			return;
		}
		revelacaoRef.current += 1;
		if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
		const usuario: MensagemLocal = { id: idMensagem(), role: "user", texto: limpo };
		const novoHistorico = [...historicoApi, { role: "user" as const, texto: limpo }].slice(-MAX_HISTORICO);
		setMensagens((atuais) =>
			[...atuais.map((m) => (m.visivelAte != null ? { ...m, visivelAte: undefined } : m)), usuario].slice(
				-LIMITE_MENSAGENS,
			),
		);
		setTexto("");
		setFalha(null);
		setPendenteCredito(null);
		setCreditoSemSaldo(false);
		await executar(novoHistorico, `web-chat:${crypto.randomUUID()}`, false, avaliacao.modo);
	}

	async function confirmarUsoDeCredito() {
		if (!pendenteCredito || enviando) return;
		setConfirmacaoAberta(false);
		await executar(pendenteCredito.historico, pendenteCredito.ref, true);
	}

	async function decidirAcao(decisao: "confirmar" | "cancelar" | "reverter") {
		if (!rascunhoAcao || processandoAcao) return;
		setProcessandoAcao(true);
		setMensagemAcao(null);
		const resultado =
			decisao === "confirmar"
				? await confirmarAcaoIa(rascunhoAcao)
				: decisao === "cancelar"
					? await cancelarAcaoIa(rascunhoAcao)
					: await reverterAcaoIa(rascunhoAcao);
		setProcessandoAcao(false);
		if (!resultado.ok) {
			setMensagemAcao(resultado.mensagem);
			return;
		}
		setRascunhoAcao((atual) => (atual ? { ...atual, status: resultado.status } : atual));
		setMensagemAcao(
			resultado.status === "aplicada"
				? "Alteração aplicada e registrada. Você ainda pode desfazer enquanto o registro não receber outra edição."
				: resultado.status === "revertida"
					? "Alteração desfeita e registrada."
					: "Prévia cancelada; nada foi alterado.",
		);
		if (resultado.status === "aplicada" || resultado.status === "revertida") {
			await queryClient.invalidateQueries({ queryKey: ["olli"] });
		}
	}

	function alternarVoz() {
		if (ouvindo) {
			reconhecimentoRef.current?.stop();
			return;
		}
		const Construtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
		if (!Construtor) {
			toast.error(
				"Seu navegador não oferece voz ao vivo. Você pode colar a conversa ou anexar um arquivo no Autopilot.",
			);
			return;
		}
		const reconhecimento = new Construtor();
		reconhecimento.lang = "pt-BR";
		reconhecimento.continuous = false;
		reconhecimento.interimResults = true;
		let transcrito = "";
		reconhecimento.onresult = (evento) => {
			let parcial = "";
			for (let indice = evento.resultIndex; indice < evento.results.length; indice += 1) {
				const frase = evento.results[indice]?.[0]?.transcript?.trim() ?? "";
				if (!frase) continue;
				if (evento.results[indice]?.isFinal) transcrito = `${transcrito} ${frase}`.trim();
				else parcial = `${parcial} ${frase}`.trim();
			}
			setTexto((atual) => `${atual.replace(/\s+$/, "")} ${transcrito || parcial}`.trim().slice(0, MAX_TEXTO));
		};
		reconhecimento.onerror = (evento) => {
			setOuvindo(false);
			if (evento.error !== "aborted" && evento.error !== "no-speech")
				toast.error("Não consegui ouvir agora. Você pode escrever a mensagem.");
		};
		reconhecimento.onend = () => {
			setOuvindo(false);
			reconhecimentoRef.current = null;
		};
		reconhecimentoRef.current = reconhecimento;
		setOuvindo(true);
		reconhecimento.start();
	}

	function usarNoOrcamento(mensagem: MensagemLocal) {
		const primeiraLinha =
			mensagem.texto
				.split(/\r?\n/)
				.find((linha) => linha.trim())
				?.trim() ?? "Serviço sugerido pela OLLI";
		const prefillItem: PrefillItemOrcamento = {
			tipo: "servico",
			nome: primeiraLinha.replace(/^#+\s*/, "").slice(0, 90),
			descricao: mensagem.texto,
		};
		navigate("/orcamentos?novo=1", { state: { prefillItem } });
	}

	function usarAutopilotNoOrcamento(preview: AutopilotPreview) {
		const itens = preview.candidatos.orcamento.itens.map((item) => ({
			tipo: item.tipo,
			nome: item.nome,
			descricao: item.descricao,
			quantidade: item.quantidade,
			unidade: item.unidade,
			precoSugerido: item.precoSugerido,
		}));
		if (!itens.length) return;
		navigate("/orcamentos?novo=1", { state: { prefillItems: itens } });
	}

	function parar() {
		if (enviando) {
			abortRef.current?.abort();
			return;
		}
		pularRevelacao();
	}

	function limpar() {
		geracaoRef.current += 1;
		revelacaoRef.current += 1;
		if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
		abortRef.current?.abort();
		setAtivaId(crypto.randomUUID());
		setMensagens([]);
		setFalha(null);
		setPendenteCredito(null);
		setCreditoSemSaldo(false);
		setRascunhoAcao(null);
		setMensagemAcao(null);
		setHistoricoAberto(false);
		setTexto("");
		setReenvio(null);
	}

	function abrirConversa(id: string) {
		const alvo = conversasRef.current.find((c) => c.id === id);
		if (!alvo) return;
		geracaoRef.current += 1;
		revelacaoRef.current += 1;
		if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
		abortRef.current?.abort();
		setAtivaId(id);
		setMensagens(alvo.mensagens);
		setFalha(null);
		setPendenteCredito(null);
		setRascunhoAcao(null);
		setMensagemAcao(null);
		setHistoricoAberto(false);
		setReenvio(null);
	}

	function apagarUmaConversa(id: string) {
		const proximo = apagarConversa({ ativaId, conversas: conversasRef.current }, id);
		conversasRef.current = proximo.conversas;
		setConversas(proximo.conversas);
		try {
			localStorage.setItem(STORAGE_ESTADO, JSON.stringify(proximo));
		} catch {
			/* cota */
		}
		if (id === ativaId) limpar();
	}

	const revelando = mensagens.some((m) => m.visivelAte != null && m.visivelAte < m.texto.length);
	const ocupado = enviando || revelando;

	return (
		<div className={cn("flex min-h-0 flex-1", className)}>
			{historicoLateral && (
				<aside className="hidden w-60 shrink-0 border-r border-border md:flex md:flex-col">
					<ListaHistorico
						conversas={conversas}
						ativaId={ativaId}
						onNova={limpar}
						onAbrir={abrirConversa}
						onApagar={apagarUmaConversa}
					/>
				</aside>
			)}
			<div className="relative flex min-h-0 flex-1 flex-col">
				<div className="border-b border-border px-4 py-3">
					<AutopilotPanel compact onUsarNoOrcamento={usarAutopilotNoOrcamento} />
				</div>
				<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-text-secondary">
					<p>
						Contexto atual: <span className="font-medium text-text-primary">{nomeDaTela(location.pathname)}</span>. A
						OLLI não envia dados desta tela automaticamente.
					</p>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className={cn("h-8 gap-1 px-2", historicoLateral && "md:hidden")}
						onClick={() => setHistoricoAberto(true)}
						aria-label="Histórico de conversas"
					>
						<History className="size-3.5" /> Histórico
					</Button>
				</div>

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
					{mensagens.length === 0 && (
						<div className="space-y-4 py-3">
							<div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
								<div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
									<Sparkles className="size-4 text-primary" />
									Sua copilota de trabalho
								</div>
								<p className="mt-2 text-sm leading-relaxed text-text-secondary">
									Peça ajuda para organizar um atendimento, escrever uma resposta ou transformar uma descrição em item
									de orçamento. Revise sempre antes de enviar ao cliente.
								</p>
							</div>
							<div className="grid gap-2">
								{SUGESTOES.map((sugestao) => (
									<Button
										key={sugestao}
										type="button"
										variant="outline"
										className="h-auto justify-start whitespace-normal py-2.5 text-left"
										onClick={() => enviar(sugestao)}
									>
										<MessageSquareText className="mr-2 size-4 shrink-0 text-primary" />
										{sugestao}
									</Button>
								))}
							</div>
						</div>
					)}

					{mensagens.map((mensagem) => {
						const emRevelacao = mensagem.visivelAte != null && mensagem.visivelAte < mensagem.texto.length;
						const visivel = emRevelacao ? mensagem.texto.slice(0, mensagem.visivelAte) : mensagem.texto;
						if (mensagem.role === "user") {
							return (
								<div key={mensagem.id} className="flex justify-end">
									<div className="max-w-[min(85%,40rem)] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
										<p className="whitespace-pre-wrap break-words">{mensagem.texto}</p>
									</div>
								</div>
							);
						}
						return (
							<div key={mensagem.id} className="flex items-start gap-3" aria-busy={emRevelacao || undefined}>
								<div
									className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
									aria-hidden="true"
								>
									<Bot className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									{emRevelacao ? (
										<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
											{visivel}
											<span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-primary motion-reduce:hidden" />
										</p>
									) : (
										<MarkdownMensagem texto={visivel} />
									)}
									{!emRevelacao && (
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="mt-1 h-8 gap-1.5 px-2 text-xs"
											onClick={() => usarNoOrcamento(mensagem)}
										>
											<FilePlus2 className="size-3.5" />
											Usar no orçamento
										</Button>
									)}
								</div>
							</div>
						);
					})}

					{enviando && (
						<div className="flex items-start gap-3 text-sm text-text-secondary" aria-live="polite">
							<div
								className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
								aria-hidden="true"
							>
								<Bot className="size-4" />
							</div>
							<div className="flex items-center gap-2 pt-1.5">
								<Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" />A OLLI está pensando…
							</div>
						</div>
					)}

					{rascunhoAcao && (
						<Card
							className="border-primary/25 bg-primary/5 p-4"
							role="region"
							aria-label="Prévia de alteração pela OLLI IA"
						>
							<div className="flex items-start gap-3">
								<span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
									{rascunhoAcao.status === "aplicada" ? (
										<CheckCircle2 className="size-4" />
									) : rascunhoAcao.status === "revertida" || rascunhoAcao.status === "cancelada" ? (
										<XCircle className="size-4" />
									) : (
										<Sparkles className="size-4" />
									)}
								</span>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-semibold text-text-primary">{rascunhoAcao.summary}</p>
									<p className="mt-0.5 text-xs text-text-secondary">Alvo: {rascunhoAcao.targetLabel}</p>
								</div>
							</div>
							<div className="mt-3 space-y-2">
								{rascunhoAcao.changes.map((change) => (
									<div key={change.field} className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
										<p className="font-medium text-text-primary">{change.field}</p>
										<p className="mt-1 break-words text-text-secondary">
											<span className="line-through">{String(change.before ?? "vazio")}</span> →{" "}
											<span className="font-medium text-text-primary">{String(change.after ?? "vazio")}</span>
										</p>
									</div>
								))}
							</div>
							{mensagemAcao && (
								<p className="mt-3 text-xs leading-relaxed text-text-secondary" aria-live="polite">
									{mensagemAcao}
								</p>
							)}
							<div className="mt-3 flex flex-wrap justify-end gap-2">
								{rascunhoAcao.status === "aguardando_confirmacao" && (
									<>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => decidirAcao("cancelar")}
											disabled={processandoAcao}
										>
											Cancelar
										</Button>
										<Button type="button" size="sm" onClick={() => decidirAcao("confirmar")} disabled={processandoAcao}>
											{processandoAcao ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}Confirmar alteração
										</Button>
									</>
								)}
								{rascunhoAcao.status === "aplicada" && (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => decidirAcao("reverter")}
										disabled={processandoAcao}
									>
										<Undo2 className="mr-1.5 size-3.5" /> Desfazer
									</Button>
								)}
							</div>
						</Card>
					)}

					{falha && (
						<Card className="border-warning/30 bg-warning/5 p-3">
							<p className="text-sm font-semibold text-text-primary">
								{creditoSemSaldo && falha.tipo === "creditos" ? "Sem créditos disponíveis" : falha.titulo}
							</p>
							<p className="mt-1 text-xs leading-relaxed text-text-secondary">
								{creditoSemSaldo && falha.tipo === "creditos"
									? "A resposta não foi gerada e nenhum valor foi debitado. Confira seus créditos ou planos para continuar."
									: falha.mensagem}
							</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{falha.tipo === "creditos" && pendenteCredito && !creditoSemSaldo && (
									<Button type="button" size="sm" onClick={() => setConfirmacaoAberta(true)}>
										Usar 1 crédito
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() =>
										falha.tipo === "creditos" || falha.tipo === "cotaDiaria"
											? navigate("/planos")
											: enviar(historicoApi.at(-1)?.texto ?? "")
									}
								>
									{falha.tipo === "creditos" ? "Ver planos e créditos" : falha.acao}
								</Button>
							</div>
						</Card>
					)}
					<div ref={fimRef} />
				</div>

				<div className="border-t border-border p-3 sm:p-4">
					<div className="rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring/50">
						<Textarea
							value={texto}
							onChange={(event) => setTexto(event.target.value.slice(0, MAX_TEXTO))}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									if (ocupado) parar();
									else enviar();
								}
							}}
							placeholder="Mensagem para a OLLI"
							className="max-h-40 min-h-[52px] resize-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0"
							disabled={enviando}
						/>
						<div className="flex items-center justify-between gap-2 px-2 pb-2">
							<Button
								type="button"
								size="icon"
								variant={ouvindo ? "destructive" : "ghost"}
								className="size-9"
								onClick={alternarVoz}
								disabled={enviando}
								aria-label={ouvindo ? "Parar voz ao vivo" : "Falar com a OLLI"}
								aria-pressed={ouvindo}
							>
								{ouvindo ? <MicOff className="size-4" /> : <Mic className="size-4" />}
							</Button>
							<div className="flex items-center gap-2">
								{mensagens.length > 0 && (
									<Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={limpar}>
										Nova conversa
									</Button>
								)}
								<Button
									type="button"
									size="icon"
									className="size-9"
									onClick={() => (ocupado ? parar() : enviar())}
									disabled={!ocupado && !texto.trim()}
									aria-label={ocupado ? "Parar resposta" : "Enviar mensagem"}
								>
									{ocupado ? <Square className="size-3.5 fill-current" /> : <Send className="size-4" />}
								</Button>
							</div>
						</div>
					</div>
					<p className="mt-2 text-[11px] text-text-disabled">
						{ouvindo
							? "Ouvindo… toque no microfone para parar"
							: "Enter envia · Shift+Enter quebra a linha · microfone é push-to-talk. Revise a resposta antes de enviar ao cliente."}
					</p>
				</div>
				{historicoAberto && (
					<div className="absolute inset-0 z-10 flex flex-col bg-background">
						<div className="flex justify-end border-b border-border px-2 py-1">
							<Button type="button" size="sm" variant="ghost" onClick={() => setHistoricoAberto(false)}>
								Fechar
							</Button>
						</div>
						<ListaHistorico
							conversas={conversas}
							ativaId={ativaId}
							onNova={limpar}
							onAbrir={abrirConversa}
							onApagar={apagarUmaConversa}
						/>
					</div>
				)}
			</div>

			<Dialog open={confirmacaoAberta} onOpenChange={setConfirmacaoAberta}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Usar 1 crédito nesta resposta?</DialogTitle>
						<DialogDescription>
							A OLLI tentará responder a última pergunta e debitará 1 crédito somente se o uso for autorizado pelo
							servidor. Esta confirmação vale apenas para esta resposta.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setConfirmacaoAberta(false)}>
							Agora não
						</Button>
						<Button type="button" onClick={confirmarUsoDeCredito} disabled={enviando}>
							Confirmar 1 crédito
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default function AssistenteGlobal() {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					variant="ghost"
					className="min-h-[44px] gap-2 px-2.5 text-text-primary"
					aria-label="Abrir assistente OLLI IA"
				>
					<span className="relative">
						<Bot className="size-5" />
						<span
							className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success ring-2 ring-background"
							aria-hidden="true"
						/>
					</span>
					<span className="hidden text-sm font-semibold lg:inline">OLLI IA</span>
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(100vw,460px)] gap-0 p-0 sm:max-w-[460px]">
				<SheetHeader className="border-b border-border px-5 py-4 pr-14">
					<SheetTitle className="flex items-center gap-2">
						<Bot className="size-5 text-primary" /> Assistente OLLI
					</SheetTitle>
					<SheetDescription>Ajuda prática para atender, organizar e orçar.</SheetDescription>
				</SheetHeader>
				<AssistenteConversa />
			</SheetContent>
		</Sheet>
	);
}
