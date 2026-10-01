/**
 * RECURSO DO PLANO no painel — o paywall reposicionado (Grátis ilimitado, 01/10/2026).
 *
 * O mesmo contrato do app (`src/components/RecursoPlano.tsx`), com a MESMA regra pura
 * (`estadoAcessoRecurso` em `src/services/entitlements.ts`) e o MESMO texto
 * (`src/services/planosBase.ts`). Três estados de verdade, nunca dois:
 *   carregando    → skeleton;
 *   indeterminado → "Não consegui confirmar seu plano" + Tentar de novo (nunca libera,
 *                   nunca rebaixa quem paga por erro de leitura);
 *   bloqueado     → "Disponível no Pro/Empresa" + o benefício + link para Planos;
 *   em_breve / liberado → o recurso.
 *
 * O plano do TENANT vem de `meu_estado_oferta_comercial` (o servidor resolve a empresa):
 * é ele que libera os recursos de campo para o gestor/técnico de uma empresa paga
 * (`RECURSOS_DO_TENANT`). O painel é web: pode vender, então o link para Planos aparece.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Crown, RotateCw } from "lucide-react";
import { useNavigate } from "react-router";
import { opcoesOfertaComercial } from "@/pages/olli/planos/useLembreteAssinatura";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import {
	estadoAcessoRecurso,
	planoMinimoDoRecurso,
	type EstadoAcessoRecurso,
	type Recurso,
} from "../../../src/services/entitlements";
import { NOME_PLANO, ROTULO_RECURSO, beneficioRecurso } from "../../../src/services/planosBase";
import { opcoesAssinatura } from "./marcaDocumento";

export interface EstadoRecursoPainel {
	estado: EstadoAcessoRecurso;
	planoMinimo: "pro" | "empresa";
	tentarDeNovo: () => void;
}

/** O estado do recurso para uma tela do painel. Chame ANTES de qualquer `return` cedo. */
export function useRecursoPlanoPainel(recurso: Recurso): EstadoRecursoPainel {
	const assinatura = useQuery(opcoesAssinatura);
	const oferta = useQuery(opcoesOfertaComercial);
	const planoTenant = oferta.data && oferta.data.planoEfetivo !== "gratis" ? oferta.data.planoEfetivo : undefined;
	const estado = estadoAcessoRecurso(
		{
			plano: assinatura.data?.planoEfetivo ?? "gratis",
			planoTenant,
			carregando: assinatura.isLoading || oferta.isLoading,
			confirmado: !assinatura.isError && !!assinatura.data,
		},
		recurso,
	);
	return {
		estado,
		planoMinimo: planoMinimoDoRecurso(recurso),
		tentarDeNovo: () => {
			void assinatura.refetch();
			void oferta.refetch();
		},
	};
}

/** O cartão que ocupa o lugar do recurso quando ele não está liberado. `null` quando está. */
export function CartaoRecursoPlanoPainel({ recurso, uso }: { recurso: Recurso; uso: EstadoRecursoPainel }) {
	const navigate = useNavigate();
	const { estado, planoMinimo, tentarDeNovo } = uso;
	if (estado === "liberado" || estado === "em_breve") return null;
	if (estado === "carregando") {
		return (
			<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}
	if (estado === "indeterminado") {
		return (
			<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
				<Card className="flex flex-col items-center gap-3 p-10 text-center">
					<AlertTriangle className="size-8 text-warning" aria-hidden="true" />
					<p className="font-semibold text-text-primary">Não consegui confirmar seu plano agora</p>
					<p className="max-w-md text-sm text-text-secondary">
						Isto é um erro de leitura — não quer dizer que sua assinatura acabou. Seus dados continuam salvos.
					</p>
					<Button variant="outline" onClick={tentarDeNovo}>
						<RotateCw className="size-4" aria-hidden="true" />
						Tentar de novo
					</Button>
				</Card>
			</div>
		);
	}
	const rotulo = ROTULO_RECURSO[recurso];
	const nome = NOME_PLANO[planoMinimo];
	return (
		<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
			<Card className="flex flex-col items-center gap-3 p-10 text-center">
				<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
					<Crown className="size-3.5" aria-hidden="true" />
					Disponível no {nome}
				</span>
				<p className="text-lg font-semibold text-text-primary">{rotulo.titulo}</p>
				<p className="max-w-md text-sm text-text-secondary">{beneficioRecurso(recurso)}</p>
				<p className="text-xs text-text-secondary">Seus dados continuam salvos, em qualquer plano.</p>
				<Button onClick={() => navigate("/planos")}>Ver o plano {nome}</Button>
			</Card>
		</div>
	);
}
