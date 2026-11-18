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
import { AlertTriangle, Crown, Lock, RotateCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { opcoesOfertaComercial } from "@/pages/olli/planos/useLembreteAssinatura";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Skeleton } from "@/ui/skeleton";
import { precoDoPlano, reais } from "@/pages/olli/planos/precos";
import {
	emCarenciaGratis,
	estadoAcessoRecurso,
	planoMinimoDoRecurso,
	RECURSOS_DO_TENANT,
	type EstadoAcessoRecurso,
	type Recurso,
} from "../../../src/services/entitlements";
import { NOME_PLANO, ROTULO_RECURSO, avisoMudancaGratis, beneficioRecurso } from "../../../src/services/planosBase";
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
			// Recurso do TENANT (o técnico/gestor usa o plano da empresa): sem a oferta lida,
			// "não tem" seria palpite — rebaixaria o membro de uma empresa paga por erro de
			// leitura. `obterEstadoOfertaComercial` devolve `null` na falha (não lança).
			confirmado:
				!assinatura.isError &&
				!!assinatura.data &&
				(!RECURSOS_DO_TENANT.has(recurso) || (!oferta.isError && oferta.data != null)),
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

// ─── D-2267: cadeado nas AÇÕES (criar/editar), a lista continua visível ───────────────

/** "R$ 39,00" do plano mínimo do recurso, da fonte única de preço. */
function precoMensalDe(plano: "pro" | "empresa"): string {
	const p = precoDoPlano(plano);
	return p ? reais(p.mensalCentavos) : "";
}

/** A tela "Disponível no Pro: R$ 39 por mês" (abre ao tocar num cadeado). Assinar leva a Planos (Pix Automático em 1º). */
export function DialogoDisponivelNoPro({ recurso, aberto, aoFechar }: { recurso: Recurso; aberto: boolean; aoFechar: () => void }) {
	const navigate = useNavigate();
	const plano = planoMinimoDoRecurso(recurso);
	const nome = NOME_PLANO[plano];
	const preco = precoMensalDe(plano);
	return (
		<Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Lock className="size-4 text-primary" aria-hidden="true" />
						Disponível no {nome}: {preco} por mês
					</DialogTitle>
					<DialogDescription>{beneficioRecurso(recurso)}</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-text-secondary">Tudo o que você já criou continua na sua conta, em qualquer plano.</p>
				<DialogFooter className="gap-2">
					<Button variant="outline" className="min-h-[44px]" onClick={aoFechar}>
						Agora não
					</Button>
					<Button
						className="min-h-[44px]"
						onClick={() => {
							aoFechar();
							navigate("/planos");
						}}
					>
						Assinar o {nome}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Portão de uma AÇÃO paga (criar, editar, importar). `exigir(fn)`:
 *   liberado / em_breve → roda;  bloqueado → abre "Disponível no Pro";
 *   carregando → espera (nada);  indeterminado → avisa que não confirmou (nunca libera nem rebaixa).
 * Renderize `dialogo` uma vez na tela. `travado` serve para pôr o ícone de cadeado no botão.
 */
export function usePortaoPro(recurso: Recurso) {
	const uso = useRecursoPlanoPainel(recurso);
	const [aberto, setAberto] = useState(false);
	const exigir = (fn: () => void) => {
		if (uso.estado === "liberado" || uso.estado === "em_breve") return fn();
		if (uso.estado === "bloqueado") return setAberto(true);
		if (uso.estado === "indeterminado") {
			toast.error("Não consegui confirmar seu plano agora. Tente de novo em instantes.");
			uso.tentarDeNovo();
		}
	};
	return {
		uso,
		travado: uso.estado === "bloqueado",
		exigir,
		dialogo: <DialogoDisponivelNoPro recurso={recurso} aberto={aberto} aoFechar={() => setAberto(false)} />,
	};
}

/** Ícone de cadeado ao lado do rótulo quando a ação está travada. */
export function ComCadeado({ travado, children }: { travado: boolean; children: ReactNode }) {
	return (
		<>
			{travado ? <Lock className="size-4" aria-label="Disponível no Pro" /> : null}
			{children}
		</>
	);
}

/** Faixa no topo da lista travada: explica o cadeado e que nada sumiu. */
export function FaixaRecursoPro({ recurso, uso, aoAssinar }: { recurso: Recurso; uso: EstadoRecursoPainel; aoAssinar: () => void }) {
	if (uso.estado !== "bloqueado") return null;
	const nome = NOME_PLANO[uso.planoMinimo];
	return (
		<div className="mx-auto mb-3 flex w-full max-w-7xl flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
			<Lock className="size-4 shrink-0 text-primary" aria-hidden="true" />
			<p className="min-w-0 flex-1 text-text-primary">
				{ROTULO_RECURSO[recurso].titulo} é do {nome}. O que você já criou continua aqui, para ver quando quiser.
			</p>
			<Button size="sm" className="min-h-[40px]" onClick={aoAssinar}>
				Ver o {nome}
			</Button>
		</div>
	);
}

/** Aviso aos Grátis de hoje, enquanto a carência vale (some sozinho depois da tranca e para quem paga). */
export function AvisoMudancaGratis() {
	const assinatura = useQuery(opcoesAssinatura);
	if (assinatura.isLoading || assinatura.isError || assinatura.data?.planoEfetivo !== "gratis") return null;
	if (!emCarenciaGratis("recibos")) return null;
	const { titulo, texto } = avisoMudancaGratis(precoMensalDe("pro"));
	return (
		<output className="mx-auto mb-3 block w-full max-w-7xl rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
			<span className="block font-semibold text-text-primary">{titulo}</span>
			<span className="mt-1 block text-text-secondary">{texto}</span>
		</output>
	);
}

