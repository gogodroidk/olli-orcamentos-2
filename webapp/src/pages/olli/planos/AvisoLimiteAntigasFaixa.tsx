/**
 * FAIXA DO AVISO ÀS CONTAS ANTIGAS — "a partir de {data} o Grátis passa a permitir até N envios por mês".
 *
 * A regra (quem vê, até quando, o texto) é a MESMA do app (`avisoAntigas` em `@limites-comerciais`); o teto e a data
 * vêm do servidor. Ao APARECER, grava a ciência no banco (1ª exibição + versão = chave do aviso): é ela que deixa o
 * limite da conta antiga começar na data do aviso (parecer LEGAL R0012 §2; sem ciência, o banco adia 7 dias).
 * Sem dado confirmado não desenha nada. "Entendi" esconde neste navegador (a ciência já está gravada).
 */
import { avisoAntigas } from "@limites-comerciais";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { registrarCienciaLimiteGratis } from "@/olli/cota-envios";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/utils";
import { opcoesOfertaComercial } from "./useLembreteAssinatura";

function lerDispensa(chave: string): boolean {
	try {
		return localStorage.getItem(chave) !== null;
	} catch {
		// Sem armazenamento: mostra (melhor repetir do que esconder uma mudança de plano).
		return false;
	}
}

export function AvisoLimiteAntigasFaixa({ className }: { className?: string }) {
	const { data: oferta } = useQuery(opcoesOfertaComercial);
	const dados = oferta?.avisoLimiteAntigas ?? null;
	const aviso = dados?.limite ? avisoAntigas(oferta ?? null, dados.limite) : ({ mostrar: false } as const);
	const chave = aviso.mostrar ? aviso.chave : null;
	const [dispensada, setDispensada] = useState<string | null>(null);
	const visivel = chave !== null && dispensada !== chave && !lerDispensa(chave);

	useEffect(() => {
		if (visivel && chave && dados && !dados.cienciaRegistrada) void registrarCienciaLimiteGratis(chave, "painel");
	}, [visivel, chave, dados]);

	if (!aviso.mostrar || !visivel) return null;

	const entendi = () => {
		try {
			localStorage.setItem(aviso.chave, new Date().toISOString());
		} catch {
			// Só esconde nesta visita.
		}
		setDispensada(aviso.chave);
	};

	return (
		<Card className={cn("gap-0 border-primary/30 bg-primary/5 p-5", className)} role="status">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
						<CalendarClock className="size-5" aria-hidden />
					</span>
					<div>
						<p className="font-semibold text-text-primary">Mudança no plano Grátis em {aviso.dataBR}</p>
						<p className="mt-0.5 max-w-2xl text-sm text-text-secondary">{aviso.texto}</p>
					</div>
				</div>
				<Button variant="ghost" className="min-h-[44px] shrink-0" onClick={entendi}>
					Entendi
				</Button>
			</div>
		</Card>
	);
}
