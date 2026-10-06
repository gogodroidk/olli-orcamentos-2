/**
 * Faixa no topo da lista de orçamentos: "este orçamento está pronto e ainda não foi enviado".
 * A regra de QUEM aparece mora em `orcamentosParados.ts` (pura e testada); aqui só o desenho.
 *
 * Sem animação (tela de trabalho; a faixa aparece e pronto). Um orçamento por vez — o mexido por
 * último — e a contagem dos demais, para não virar parede de avisos.
 */
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import type { LinhaParaFaixa } from "./orcamentosParados";

interface Props {
	/** Já filtradas por `prontosParados` (a mais recente primeiro). */
	paradas: LinhaParaFaixa[];
	/** Id do orçamento que está preparando o envio agora (desabilita o botão). */
	enviandoId: string | null;
	onEnviar: (id: string) => void;
	onDispensar: (id: string) => void;
}

export function FaixaOrcamentoParado({ paradas, enviandoId, onEnviar, onDispensar }: Props) {
	const primeira = paradas[0];
	if (!primeira?.dados) return null;
	const d = primeira.dados;
	const outras = paradas.length - 1;
	const ocupado = enviandoId === primeira.id;

	return (
		<Card className="flex flex-col gap-3 border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
			<div className="min-w-0">
				<p className="text-sm font-semibold text-text-primary">
					O orçamento nº {d.numero || "sem número"} de {d.clienteNome} está pronto e ainda não foi enviado.
				</p>
				<p className="mt-0.5 text-xs text-text-secondary">
					O cliente só vê o preço e aprova quando recebe o link.
					{outras > 0 ? ` Mais ${outras} ${outras === 1 ? "orçamento pronto" : "orçamentos prontos"} na lista.` : ""}
				</p>
			</div>
			<div className="flex shrink-0 gap-2">
				<Button type="button" variant="outline" onClick={() => onDispensar(primeira.id)} disabled={ocupado}>
					Agora não
				</Button>
				<Button type="button" onClick={() => onEnviar(primeira.id)} disabled={ocupado}>
					{ocupado ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MessageCircle className="mr-2 size-4" />}
					Enviar pelo WhatsApp
				</Button>
			</div>
		</Card>
	);
}
