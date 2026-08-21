import type { FalhaIA, MensagemChat } from "@/pages/olli/diagnostico/chat";
import { Bot, FilePlus2, Loader2, MessageSquareText, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { perguntarAoAssistente } from "@/pages/olli/diagnostico/chat";
import type { PrefillItemOrcamento } from "@/olli/components/prefillItemOrcamento";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/ui/sheet";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";

const STORAGE_KEY = "olli-assistente-web-v1";
const MAX_HISTORICO = 20;
const MAX_TEXTO = 4000;
const MAX_CORPO_BYTES = 48 * 1024;

type MensagemLocal = MensagemChat & { id: string };
type PendenteCredito = { historico: MensagemChat[]; ref: string };

const SUGESTOES = [
	"Organize os pontos que devo confirmar antes de enviar um orçamento",
	"Me ajude a responder um cliente que achou o preço alto",
	"Transforme minha descrição em um item claro de orçamento",
];

function idMensagem() {
	return crypto.randomUUID();
}

function carregarHistorico(): MensagemLocal[] {
	try {
		const salvo = sessionStorage.getItem(STORAGE_KEY);
		if (!salvo) return [];
		const parsed = JSON.parse(salvo) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(m): m is MensagemLocal =>
					!!m &&
					typeof m === "object" &&
					((m as MensagemLocal).role === "user" || (m as MensagemLocal).role === "assistant") &&
					typeof (m as MensagemLocal).texto === "string" &&
					typeof (m as MensagemLocal).id === "string",
			)
			.slice(-MAX_HISTORICO);
	} catch {
		return [];
	}
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
		"/equipamentos": "Equipamentos",
		"/equipe": "Equipe",
		"/planos": "Planos",
	};
	return mapa[pathname] ?? "Painel";
}

export function AssistenteConversa({ className }: { className?: string }) {
	const navigate = useNavigate();
	const location = useLocation();
	const [mensagens, setMensagens] = useState<MensagemLocal[]>(carregarHistorico);
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [falha, setFalha] = useState<FalhaIA | null>(null);
	const [pendenteCredito, setPendenteCredito] = useState<PendenteCredito | null>(null);
	const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
	const [creditoSemSaldo, setCreditoSemSaldo] = useState(false);
	const fimRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mensagens.slice(-MAX_HISTORICO)));
		fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [mensagens]);

	const historicoApi = useMemo<MensagemChat[]>(
		() => mensagens.slice(-MAX_HISTORICO).map(({ role, texto: conteudo }) => ({ role, texto: conteudo })),
		[mensagens],
	);

	async function executar(historico: MensagemChat[], creditoRef: string, confirmarCredito = false) {
		setFalha(null);
		setEnviando(true);
		const resposta = await perguntarAoAssistente(limitarHistorico(historico), { creditoRef, confirmarCredito });
		setEnviando(false);
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
		const assistente: MensagemLocal = {
			id: idMensagem(),
			role: "assistant",
			texto: resposta.resposta,
		};
		setMensagens((atuais) => [...atuais, assistente].slice(-MAX_HISTORICO));
	}

	async function enviar(valor = texto) {
		const limpo = valor.trim().slice(0, MAX_TEXTO);
		if (!limpo || enviando) return;
		const usuario: MensagemLocal = { id: idMensagem(), role: "user", texto: limpo };
		const novoHistorico = [...historicoApi, { role: "user" as const, texto: limpo }].slice(-MAX_HISTORICO);
		setMensagens((atuais) => [...atuais, usuario].slice(-MAX_HISTORICO));
		setTexto("");
		setFalha(null);
		setPendenteCredito(null);
		setCreditoSemSaldo(false);
		await executar(novoHistorico, `web-chat:${crypto.randomUUID()}`);
	}

	async function confirmarUsoDeCredito() {
		if (!pendenteCredito || enviando) return;
		setConfirmacaoAberta(false);
		await executar(pendenteCredito.historico, pendenteCredito.ref, true);
	}

	function usarNoOrcamento(mensagem: MensagemLocal) {
		const primeiraLinha = mensagem.texto.split(/\r?\n/).find((linha) => linha.trim())?.trim() ?? "Serviço sugerido pela OLLI";
		const prefillItem: PrefillItemOrcamento = {
			tipo: "servico",
			nome: primeiraLinha.replace(/^#+\s*/, "").slice(0, 90),
			descricao: mensagem.texto,
		};
		navigate("/orcamentos?novo=1", { state: { prefillItem } });
	}

	function limpar() {
		setMensagens([]);
		setFalha(null);
		setPendenteCredito(null);
		setCreditoSemSaldo(false);
		sessionStorage.removeItem(STORAGE_KEY);
	}

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			<div className="border-b border-border px-4 py-2 text-xs text-text-secondary">
				Contexto atual: <span className="font-medium text-text-primary">{nomeDaTela(location.pathname)}</span>. A OLLI não envia dados desta tela automaticamente.
			</div>

			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
				{mensagens.length === 0 && (
					<div className="space-y-4 py-3">
						<div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
							<div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
								<Sparkles className="size-4 text-primary" />
								Sua copilota de trabalho
							</div>
							<p className="mt-2 text-sm leading-relaxed text-text-secondary">
								Peça ajuda para organizar um atendimento, escrever uma resposta ou transformar uma descrição em item de orçamento. Revise sempre antes de enviar ao cliente.
							</p>
						</div>
						<div className="grid gap-2">
							{SUGESTOES.map((sugestao) => (
								<Button key={sugestao} type="button" variant="outline" className="h-auto justify-start whitespace-normal py-2.5 text-left" onClick={() => enviar(sugestao)}>
									<MessageSquareText className="mr-2 size-4 shrink-0 text-primary" />
									{sugestao}
								</Button>
							))}
						</div>
					</div>
				)}

				{mensagens.map((mensagem) => (
					<div key={mensagem.id} className={cn("flex", mensagem.role === "user" ? "justify-end" : "justify-start")}>
						<div className={cn("max-w-[88%] rounded-2xl px-3.5 py-3 text-sm leading-relaxed", mensagem.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-text-primary")}>
							<p className="whitespace-pre-wrap break-words">{mensagem.texto}</p>
							{mensagem.role === "assistant" && (
								<Button type="button" size="sm" variant="ghost" className="mt-2 h-8 gap-1.5 px-2 text-xs" onClick={() => usarNoOrcamento(mensagem)}>
									<FilePlus2 className="size-3.5" />
									Usar no orçamento
								</Button>
							)}
						</div>
					</div>
				))}

				{enviando && (
					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<Loader2 className="size-4 animate-spin text-primary" />
						A OLLI está pensando…
					</div>
				)}

				{falha && (
					<Card className="border-warning/30 bg-warning/5 p-3">
						<p className="text-sm font-semibold text-text-primary">{creditoSemSaldo && falha.tipo === "creditos" ? "Sem créditos disponíveis" : falha.titulo}</p>
						<p className="mt-1 text-xs leading-relaxed text-text-secondary">{creditoSemSaldo && falha.tipo === "creditos" ? "A resposta não foi gerada e nenhum valor foi debitado. Confira seus créditos ou planos para continuar." : falha.mensagem}</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{falha.tipo === "creditos" && pendenteCredito && !creditoSemSaldo && <Button type="button" size="sm" onClick={() => setConfirmacaoAberta(true)}>Usar 1 crédito</Button>}
							<Button type="button" size="sm" variant="outline" onClick={() => falha.tipo === "creditos" || falha.tipo === "cotaDiaria" ? navigate("/planos") : enviar(historicoApi.at(-1)?.texto ?? "")}>
								{falha.tipo === "creditos" ? "Ver planos e créditos" : falha.acao}
							</Button>
						</div>
					</Card>
				)}
				<div ref={fimRef} />
			</div>

			<div className="border-t border-border p-4">
				<div className="relative">
					<Textarea
						value={texto}
						onChange={(event) => setTexto(event.target.value.slice(0, MAX_TEXTO))}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								enviar();
							}
						}}
						placeholder="Pergunte ou cole uma descrição do serviço…"
						className="min-h-24 resize-none pr-12"
						disabled={enviando}
					/>
					<Button type="button" size="icon" className="absolute bottom-2 right-2 size-9" onClick={() => enviar()} disabled={!texto.trim() || enviando} aria-label="Enviar mensagem">
						<Send className="size-4" />
					</Button>
				</div>
				<div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-text-disabled">
					<span>Enter envia · Shift+Enter quebra a linha</span>
					{mensagens.length > 0 && (
						<Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={limpar}>
							<RotateCcw className="size-3" /> Nova conversa
						</Button>
					)}
				</div>
			</div>

			<Dialog open={confirmacaoAberta} onOpenChange={setConfirmacaoAberta}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Usar 1 crédito nesta resposta?</DialogTitle>
						<DialogDescription>A OLLI tentará responder a última pergunta e debitará 1 crédito somente se o uso for autorizado pelo servidor. Esta confirmação vale apenas para esta resposta.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setConfirmacaoAberta(false)}>Agora não</Button>
						<Button type="button" onClick={confirmarUsoDeCredito} disabled={enviando}>Confirmar 1 crédito</Button>
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
				<Button variant="ghost" className="min-h-[44px] gap-2 px-2.5 text-text-primary" aria-label="Abrir assistente OLLI IA">
					<span className="relative">
						<Bot className="size-5" />
						<span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success ring-2 ring-background" aria-hidden="true" />
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
