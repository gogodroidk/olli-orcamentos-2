import { RefreshCw, Send, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";
import { type FalhaIA, type MensagemChat, perguntarPorSintoma } from "./chat";

/** Contexto vindo de um clique em "Aprofundar" na aba Por código. */
export interface SementeSintoma {
	marca?: string;
	modelo?: string;
	codigo?: string;
	pergunta?: string;
	/** muda a cada semeadura para o efeito disparar mesmo com valores iguais */
	nonce: number;
}

interface MsgLocal {
	role: "user" | "assistant";
	texto: string;
	/** Texto REALMENTE enviado ao Worker (pode carregar o contexto na 1ª pergunta). */
	envio?: string;
}

const ID_INPUT = "olli-sintoma-input";

const EXEMPLOS = [
	"Split não gela e a externa não liga",
	"Faz barulho e desarma o disjuntor ao ligar",
	"Pisca 5 vezes e para de funcionar",
];

export function PorSintoma({
	semente,
	aoIrParaCodigo,
}: {
	semente?: SementeSintoma;
	aoIrParaCodigo: () => void;
}) {
	const [marca, setMarca] = useState("");
	const [modelo, setModelo] = useState("");
	const [codigo, setCodigo] = useState("");
	const [pergunta, setPergunta] = useState("");
	const [mensagens, setMensagens] = useState<MsgLocal[]>([]);
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<FalhaIA | null>(null);

	const fimRef = useRef<HTMLDivElement | null>(null);

	// Semeadura a partir da aba Por código: preenche contexto + pergunta sugerida.
	useEffect(() => {
		if (!semente) return;
		if (semente.marca) setMarca(semente.marca);
		if (semente.codigo) setCodigo(semente.codigo);
		setModelo("");
		setPergunta(semente.pergunta ?? "");
		document.getElementById(ID_INPUT)?.focus();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [semente?.nonce]);

	useEffect(() => {
		fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [mensagens.length, enviando, erro]);

	function contextoStr(): string {
		const partes: string[] = [];
		if (marca.trim()) partes.push(`Marca: ${marca.trim()}`);
		if (modelo.trim()) partes.push(`Modelo: ${modelo.trim()}`);
		if (codigo.trim()) partes.push(`Código no display: ${codigo.trim().toUpperCase()}`);
		return partes.join(" · ");
	}

	async function enviar(lista: MsgLocal[]) {
		setEnviando(true);
		setErro(null);
		const payload: MensagemChat[] = lista.map((m) => ({ role: m.role, texto: m.envio ?? m.texto }));
		const res = await perguntarPorSintoma(payload);
		if (res.ok) {
			setMensagens((atual) => [...atual, { role: "assistant", texto: res.resposta }]);
		} else {
			setErro(res.erro);
		}
		setEnviando(false);
	}

	function perguntar(texto: string) {
		const limpo = texto.trim();
		if (!limpo || enviando) return;
		const primeira = !mensagens.some((m) => m.role === "user");
		const ctx = contextoStr();
		const envio = primeira && ctx ? `${ctx}\n\nSintoma / pergunta: ${limpo}` : limpo;
		const nova = [...mensagens, { role: "user" as const, texto: limpo, envio }];
		setMensagens(nova);
		setPergunta("");
		void enviar(nova);
	}

	function tentarDeNovo() {
		if (erro?.tipo === "naoConfigurada") {
			aoIrParaCodigo();
			return;
		}
		// A conversa já termina na última pergunta do técnico — só reenvia.
		if (mensagens.length > 0) void enviar(mensagens);
	}

	const vazio = mensagens.length === 0;

	return (
		<div className="space-y-4">
			{/* Contexto opcional do aparelho — melhora muito a resposta da IA. */}
			<Card className="p-4">
				<p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
					<Sparkles className="size-3.5" />
					Contexto do aparelho <span className="font-normal normal-case">(opcional, mas ajuda)</span>
				</p>
				<div className="grid gap-3 sm:grid-cols-3">
					<Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca (ex.: Midea)" aria-label="Marca" />
					<Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Modelo (ex.: Xtreme 12k)" aria-label="Modelo" />
					<Input
						value={codigo}
						onChange={(e) => setCodigo(e.target.value)}
						placeholder="Código no display (ex.: E5)"
						aria-label="Código no display"
					/>
				</div>
			</Card>

			{/* Conversa. */}
			<Card className="flex min-h-[22rem] flex-col p-4">
				<div className="flex-1 space-y-3">
					{vazio && !enviando && !erro && (
						<div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
							<div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
								<Sparkles className="size-7" />
							</div>
							<div className="space-y-1">
								<p className="font-semibold text-text-primary">Descreva o que está acontecendo</p>
								<p className="mx-auto max-w-md text-sm text-text-secondary">
									A OLLI Técnica raciocina sobre o sintoma e sugere os testes na ordem certa — do mais
									rápido ao mais caro — sem mandar trocar peça antes da hora.
								</p>
							</div>
							<div className="flex flex-wrap justify-center gap-2">
								{EXEMPLOS.map((ex) => (
									<button
										key={ex}
										type="button"
										onClick={() => perguntar(ex)}
										className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
									>
										{ex}
									</button>
								))}
							</div>
						</div>
					)}

					<AnimatePresence initial={false}>
						{mensagens.map((m, i) => (
							<motion.div
								key={i}
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.2 }}
								className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
							>
								<div
									className={cn(
										"max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
										m.role === "user"
											? "rounded-br-sm bg-primary text-primary-foreground"
											: "rounded-bl-sm bg-muted text-text-primary",
									)}
								>
									{m.role === "assistant" && (
										<span className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
											<Sparkles className="size-3" />
											OLLI Técnica
										</span>
									)}
									{m.texto}
								</div>
							</motion.div>
						))}
					</AnimatePresence>

					{enviando && (
						<div className="flex justify-start">
							<div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
								{[0, 1, 2].map((d) => (
									<motion.span
										key={d}
										className="size-2 rounded-full bg-text-secondary"
										animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
										transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
									/>
								))}
							</div>
						</div>
					)}

					{erro && (
						<div className="rounded-xl border border-error/30 bg-error/5 p-4">
							<p className="font-semibold text-text-primary">{erro.titulo}</p>
							<p className="mt-0.5 text-sm text-text-secondary">{erro.mensagem}</p>
							<Button variant="outline" size="sm" className="mt-3 gap-2" onClick={tentarDeNovo}>
								<RefreshCw className="size-3.5" />
								{erro.acao}
							</Button>
						</div>
					)}

					<div ref={fimRef} />
				</div>

				{/* Redação da pergunta. */}
				<div className="mt-3 border-t border-border/60 pt-3">
					<div className="flex items-end gap-2">
						<Textarea
							id={ID_INPUT}
							value={pergunta}
							onChange={(e) => setPergunta(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									perguntar(pergunta);
								}
							}}
							rows={2}
							placeholder="Descreva o sintoma… (Enter envia, Shift+Enter quebra linha)"
							className="max-h-40 min-h-[2.75rem] flex-1 resize-none"
							aria-label="Sua pergunta para a OLLI"
						/>
						<Button
							onClick={() => perguntar(pergunta)}
							disabled={enviando || !pergunta.trim()}
							className="h-11 gap-2"
						>
							<Send className="size-4" />
							<span className="hidden sm:inline">Perguntar</span>
						</Button>
					</div>
					<p className="mt-2 text-xs text-text-secondary">
						A OLLI pode errar — confirme marca e modelo e sempre teste antes de trocar qualquer peça.
					</p>
				</div>
			</Card>
		</div>
	);
}
