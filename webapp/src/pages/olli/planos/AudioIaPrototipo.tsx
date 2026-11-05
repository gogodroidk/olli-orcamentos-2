/**
 * D1438-G20 — protótipo na tela de Planos. Só monta se
 * `VITE_PLANOS_AUDIO_IA=1`. Fora isso, não pede microfone e não aparece.
 * A escuta é do navegador. O rascunho é local. Nada é gravado e nenhuma IA
 * paga é chamada. Spec: docs/ENXAME/PLANOS_AUDIO_IA.md
 */
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Textarea } from "@/ui/textarea";
import {
	FALA_MAX,
	formatarReaisAudio,
	formatarTelefoneAudio,
	interpretarFalaPlanos,
	planosAudioIaLigada,
	type RascunhoAudioIa,
	rotuloTipoAudioIa,
} from "../../../../../src/services/planosAudioIa";

type ResultadoVoz = {
	resultIndex: number;
	results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
};

type Reconhecimento = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: ((evento: ResultadoVoz) => void) | null;
	onerror: ((evento: { error?: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};

function criarReconhecimento(): Reconhecimento | null {
	if (typeof window === "undefined") return null;
	const w = window as unknown as {
		SpeechRecognition?: new () => Reconhecimento;
		webkitSpeechRecognition?: new () => Reconhecimento;
	};
	const Construtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
	return Construtor ? new Construtor() : null;
}

function aplicarFala(fala: string): { erro: string | null; rascunho: RascunhoAudioIa | null; texto: string } {
	const saida = interpretarFalaPlanos(fala);
	if (!saida.ok) return { erro: "Fale ou escreva o que você quer montar.", rascunho: null, texto: fala };
	return {
		erro: null,
		rascunho: saida.rascunho,
		texto: saida.rascunho.documentoFalado ? saida.textoUsado : fala,
	};
}

function PrototipoLigado() {
	const [texto, setTexto] = useState("");
	const [parcial, setParcial] = useState("");
	const [ouvindo, setOuvindo] = useState(false);
	const [erro, setErro] = useState<string | null>(null);
	const [rascunho, setRascunho] = useState<RascunhoAudioIa | null>(null);
	const [semMicrofone, setSemMicrofone] = useState(false);
	const reconhecimentoRef = useRef<Reconhecimento | null>(null);
	const textoRef = useRef("");
	textoRef.current = texto;

	useEffect(() => {
		return () => {
			reconhecimentoRef.current?.stop();
			reconhecimentoRef.current = null;
		};
	}, []);

	function montar(fala: string) {
		const resultado = aplicarFala(fala);
		setErro(resultado.erro);
		setRascunho(resultado.rascunho);
		if (resultado.texto !== fala) setTexto(resultado.texto);
	}

	function alternarVoz() {
		if (ouvindo) {
			reconhecimentoRef.current?.stop();
			return;
		}
		const reconhecimento = criarReconhecimento();
		if (!reconhecimento) {
			setSemMicrofone(true);
			setErro("Este navegador não ouve. Escreva o que você falaria.");
			return;
		}
		reconhecimento.lang = "pt-BR";
		reconhecimento.continuous = false;
		reconhecimento.interimResults = true;
		let final = "";
		reconhecimento.onresult = (evento) => {
			let trecho = "";
			for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
				const frase = evento.results[i]?.[0]?.transcript?.trim() ?? "";
				if (!frase) continue;
				if (evento.results[i]?.isFinal) final = `${final} ${frase}`.trim();
				else trecho = `${trecho} ${frase}`.trim();
			}
			setParcial(trecho);
			if (final) {
				const junto = `${textoRef.current} ${final}`.trim().slice(0, FALA_MAX);
				textoRef.current = junto;
				setTexto(junto);
			}
		};
		reconhecimento.onerror = (evento) => {
			setOuvindo(false);
			if (evento.error !== "aborted" && evento.error !== "no-speech") {
				setErro("Não consegui ouvir agora. Escreva o que você falaria.");
			}
		};
		reconhecimento.onend = () => {
			setOuvindo(false);
			setParcial("");
			reconhecimentoRef.current = null;
			const fala = textoRef.current.trim();
			if (fala) montar(fala);
		};
		reconhecimentoRef.current = reconhecimento;
		setSemMicrofone(false);
		setOuvindo(true);
		try {
			reconhecimento.start();
		} catch {
			setOuvindo(false);
			setErro("Não consegui abrir o microfone. Escreva o que você falaria.");
		}
	}

	function limpar() {
		reconhecimentoRef.current?.stop();
		textoRef.current = "";
		setTexto("");
		setParcial("");
		setErro(null);
		setRascunho(null);
	}

	return (
		<Card className="mt-8 gap-0 border-dashed p-5" aria-labelledby="planos-audio-ia-titulo">
			<div className="flex flex-wrap items-center gap-2">
				<h2 id="planos-audio-ia-titulo" className="text-base font-semibold text-text-primary">
					Protótipo: fale e eu monto o rascunho
				</h2>
				<Badge variant="warning">Não está no ar</Badge>
			</div>
			<p className="mt-2 max-w-3xl text-sm text-text-secondary">
				Isto não faz parte do plano que está à venda. O navegador ouve nesta tela e eu monto um orçamento ou um
				cadastro. Nada é gravado. O áudio não sai daqui e eu não chamo a IA paga.
			</p>
			<p className="mt-1 text-xs text-text-secondary">
				Fale o preço em número, como 180 reais. Eu não invento o que faltou.
			</p>

			<Textarea
				className="mt-4 min-h-24"
				maxLength={FALA_MAX}
				value={parcial ? `${texto} ${parcial}`.trim() : texto}
				onChange={(ev) => {
					textoRef.current = ev.target.value;
					setTexto(ev.target.value);
				}}
				placeholder="Exemplo: orçamento para o João, instalação de split, 450 reais. Ou: cadastra o cliente Ana, telefone e e-mail."
				aria-label="O que você falou"
			/>

			<div className="mt-3 flex flex-wrap gap-2">
				<Button
					type="button"
					variant={ouvindo ? "destructive" : "outline"}
					className="min-h-[44px]"
					onClick={alternarVoz}
					aria-pressed={ouvindo}
				>
					{ouvindo ? <Square aria-hidden /> : <Mic aria-hidden />}
					{ouvindo ? "Parar" : "Falar"}
				</Button>
				<Button type="button" className="min-h-[44px]" onClick={() => montar(texto)} disabled={!texto.trim()}>
					Montar rascunho
				</Button>
				<Button type="button" variant="ghost" className="min-h-[44px]" onClick={limpar}>
					Limpar
				</Button>
			</div>
			{semMicrofone ? (
				<p className="mt-2 text-sm text-text-secondary">
					Este navegador não oferece voz. O texto acima continua valendo.
				</p>
			) : null}
			{erro ? (
				<p className="mt-3 text-sm text-text-primary" role="alert">
					{erro}
				</p>
			) : null}

			{rascunho ? (
				<output className="mt-4 block rounded-xl border border-border bg-background p-4" aria-live="polite">
					<p className="text-sm font-semibold text-text-primary">{rotuloTipoAudioIa(rascunho.tipo)}</p>
					<p className="mt-1 text-sm text-text-secondary">{rascunho.aviso}</p>
					{rascunho.clienteNome ? (
						<p className="mt-3 text-sm text-text-primary">Cliente: {rascunho.clienteNome}</p>
					) : null}
					{rascunho.telefone ? (
						<p className="text-sm text-text-primary">Telefone: {formatarTelefoneAudio(rascunho.telefone)}</p>
					) : null}
					{rascunho.email ? <p className="text-sm text-text-primary">E-mail: {rascunho.email}</p> : null}
					{rascunho.itemNome ? (
						<p className="mt-3 text-sm text-text-primary">
							{rascunho.itemTipo === "peca" ? "Produto" : "Serviço"}: {rascunho.itemNome}
						</p>
					) : null}
					{rascunho.itens.length > 0 ? (
						<ul className="mt-3 space-y-2">
							{rascunho.itens.map((item) => (
								<li key={`${item.tipo}-${item.descricao}`} className="text-sm text-text-primary">
									{item.quantidade} × {item.descricao}
									{" — "}
									{item.valorUnitario === null
										? "preço não falado"
										: item.valorUnitario === 0
											? `${formatarReaisAudio(0)} (cortesia)`
											: formatarReaisAudio(item.valorUnitario)}
								</li>
							))}
						</ul>
					) : null}
					{rascunho.faltando.length > 0 ? (
						<p className="mt-3 text-sm text-text-secondary">Faltou: {rascunho.faltando.join("; ")}.</p>
					) : null}
				</output>
			) : null}
		</Card>
	);
}

/** Defesa em profundidade: mesmo importada, a árvore não monta com a flag apagada. */
export function AudioIaPrototipo() {
	if (!planosAudioIaLigada(import.meta.env.VITE_PLANOS_AUDIO_IA as string | undefined)) return null;
	return <PrototipoLigado />;
}
