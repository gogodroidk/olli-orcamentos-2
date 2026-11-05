import { Sparkles } from "lucide-react";
import { useState } from "react";
import {
	PRECIFICACAO_IA_MAX_TEXTO,
	aplicarRascunhoPrecificacao,
	pedirRascunhoPrecificacao,
	rotuloCampoPrecificacao,
	textoCampoPrecificacao,
	type CamposPrecificacaoForm,
	type ModoPrecificacaoIa,
	type RascunhoPrecificacaoIa,
} from "@/olli/precificacaoIa";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Textarea } from "@/ui/textarea";

type Props = {
	campos: CamposPrecificacaoForm;
	onAplicar: (campos: CamposPrecificacaoForm, modo: ModoPrecificacaoIa | null) => void;
};

export function PrecificacaoIaPainel({ campos, onAplicar }: Props) {
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [rascunho, setRascunho] = useState<RascunhoPrecificacaoIa | null>(null);
	const [mensagem, setMensagem] = useState<string | null>(null);
	const [confirmarCredito, setConfirmarCredito] = useState(false);
	const [creditoRef, setCreditoRef] = useState("");
	const [colocado, setColocado] = useState(false);

	const previa = rascunho ? aplicarRascunhoPrecificacao(campos, rascunho) : null;
	const podeLer = texto.trim().length > 0 && texto.trim().length <= PRECIFICACAO_IA_MAX_TEXTO && !enviando;

	async function ler(gastarCredito: boolean) {
		const ref = creditoRef || crypto.randomUUID();
		setCreditoRef(ref);
		setEnviando(true);
		setMensagem(null);
		setColocado(false);
		const resultado = await pedirRascunhoPrecificacao(texto, { confirmarCredito: gastarCredito, creditoRef: ref });
		setEnviando(false);
		if (!resultado.ok) {
			if (resultado.erro === "sem_creditos" && !gastarCredito) {
				setConfirmarCredito(true);
				setRascunho(null);
				return;
			}
			if (resultado.erro === "sem_creditos") {
				setConfirmarCredito(false);
				setMensagem("Não há crédito de IA disponível. A calculadora continua livre, sem este rascunho.");
				return;
			}
			setConfirmarCredito(false);
			setMensagem(resultado.mensagem);
			setRascunho(null);
			return;
		}
		setConfirmarCredito(false);
		setRascunho(resultado.rascunho);
	}

	function colocar() {
		if (!rascunho || !previa || previa.preenchidos.length === 0) return;
		onAplicar(previa.campos, previa.modo);
		setColocado(true);
	}

	return (
		<Card className="p-5" data-ai-readable="true" data-ai-topic="precificacao-ia-prototipo">
			<div className="flex items-start gap-3">
				<Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
				<div>
					<h2 className="font-semibold text-text-primary">Rascunho com IA</h2>
					<p className="mt-1 text-sm leading-6 text-text-secondary">
						Protótipo. A IA só separa os números que você escrever. O preço sai da calculadora desta tela, com a mesma conta de sempre. Não é pesquisa de mercado, não é garantia e não vai para o cliente.
					</p>
				</div>
			</div>

			<label htmlFor="precificacao-ia-texto" className="mt-4 block text-sm font-medium text-text-primary">
				Descreva o serviço ou a peça
			</label>
			<Textarea
				id="precificacao-ia-texto"
				value={texto}
				maxLength={PRECIFICACAO_IA_MAX_TEXTO}
				onChange={(event) => {
					setTexto(event.target.value.slice(0, PRECIFICACAO_IA_MAX_TEXTO));
					setCreditoRef("");
					setConfirmarCredito(false);
					setColocado(false);
				}}
				placeholder="Ex.: limpeza de dois splits, 2 horas, minha hora a R$ 80, R$ 40 de produto, R$ 25 de deslocamento, margem de 30%."
				className="mt-2 min-h-28"
			/>
			<p className="mt-1 text-xs text-text-secondary">{texto.trim().length}/{PRECIFICACAO_IA_MAX_TEXTO}</p>
			<Button type="button" className="mt-3" onClick={() => { void ler(false); }} disabled={!podeLer}>
				{enviando ? "Lendo…" : "Ler os números"}
			</Button>

			<div className="mt-4 space-y-3" aria-live="polite">
				{confirmarCredito ? (
					<div className="rounded-xl border border-border bg-background p-3">
						<p className="text-sm leading-6 text-text-secondary">
							A cota grátis da IA acabou. Continuar gasta um crédito de IA que você já tem. Não abre cobrança nova e não muda o preço do plano.
						</p>
						<Button type="button" variant="outline" className="mt-3" onClick={() => { void ler(true); }} disabled={enviando}>
							{enviando ? "Lendo…" : "Usar um crédito e ler"}
						</Button>
					</div>
				) : null}
				{mensagem ? <p className="text-sm leading-6 text-text-secondary">{mensagem}</p> : null}
				{rascunho && previa ? (
					<div className="space-y-3">
						{rascunho.avisos.length > 0 ? <p className="text-sm leading-6 text-text-secondary">{rascunho.avisos.join(" ")}</p> : null}
						{rascunho.faltando.length > 0 ? (
							<p className="text-sm leading-6 text-text-secondary">Ainda não está no texto: {rascunho.faltando.join(", ")}.</p>
						) : null}
						{previa.preenchidos.length > 0 ? (
							<ul className="space-y-1 text-sm text-text-primary">
								{previa.preenchidos.map((chave) => (
									<li key={chave}>
										{rotuloCampoPrecificacao(chave)}: {textoCampoPrecificacao(chave, previa.campos[chave])}
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm leading-6 text-text-secondary">Não achei número para colocar na calculadora.</p>
						)}
						{rascunho.evidencia ? <p className="text-xs leading-5 text-text-secondary">Trecho lido: {rascunho.evidencia}</p> : null}
						<Button type="button" variant="outline" onClick={colocar} disabled={previa.preenchidos.length === 0}>
							Colocar na calculadora
						</Button>
						<p className="text-xs leading-5 text-text-secondary">Nada é salvo no catálogo neste passo. Confira o preço sugerido ao lado antes de salvar.</p>
						{colocado ? <p className="text-sm text-text-primary">Números colocados na calculadora. O preço ao lado é da conta desta tela.</p> : null}
					</div>
				) : null}
			</div>
		</Card>
	);
}
