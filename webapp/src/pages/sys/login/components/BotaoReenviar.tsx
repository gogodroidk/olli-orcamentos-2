import { ESPERA_REENVIO_S, fracaoReenvio, rotuloReenvio, segundosParaReenviar } from "@acesso-codigo";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";

/**
 * Segundos que faltam para liberar o reenvio. Re-renderiza 1x por segundo só
 * enquanto trava; liberado, o intervalo para sozinho.
 */
export function useSegundosParaReenviar(liberaEm: number | null): number {
	const [agora, setAgora] = useState(() => Date.now());
	useEffect(() => {
		setAgora(Date.now());
		if (liberaEm === null) return;
		const id = window.setInterval(() => {
			const t = Date.now();
			setAgora(t);
			if (t >= liberaEm) window.clearInterval(id);
		}, 1000);
		return () => window.clearInterval(id);
	}, [liberaEm]);
	return segundosParaReenviar(liberaEm, agora);
}

const RAIO = 7;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

interface Props {
	segundos: number;
	enviando: boolean;
	onClick: () => void;
	rotulo?: string;
}

/**
 * "Reenviar código" com contador circular. O anel é redesenhado uma vez por
 * segundo pelo estado (nada anima por CSS), então "Reduzir movimento" não muda
 * nada aqui — o número em segundos está sempre no texto.
 */
export function BotaoReenviar({ segundos, enviando, onClick, rotulo = "Reenviar código" }: Props) {
	const travado = segundos > 0;
	return (
		<Button
			type="button"
			variant="link"
			size="sm"
			disabled={travado || enviando}
			onClick={onClick}
			className="gap-2"
		>
			{enviando ? (
				<Loader2 className="size-4 animate-spin" aria-hidden />
			) : travado ? (
				<svg viewBox="0 0 18 18" className="size-4 -rotate-90" aria-hidden>
					<title>Tempo até liberar o reenvio</title>
					<circle cx="9" cy="9" r={RAIO} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
					<circle
						cx="9"
						cy="9"
						r={RAIO}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeDasharray={CIRCUNFERENCIA}
						strokeDashoffset={CIRCUNFERENCIA * (1 - fracaoReenvio(segundos, ESPERA_REENVIO_S))}
					/>
				</svg>
			) : null}
			{enviando ? "Enviando…" : rotuloReenvio(segundos, rotulo)}
		</Button>
	);
}
