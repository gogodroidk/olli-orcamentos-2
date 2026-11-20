/**
 * "O QUE O PRO FEZ POR VOCÊ" — véspera e fim do teste do Pro (CQ-DINHEIRO-LOTE1, D-2506).
 *
 * 15 testes do Pro, 0 compras: o teste começava e acabava sem a pessoa saber o que o Pro
 * fez por ela. Este cartão mostra só números VERDADEIROS da conta, lidos do banco pela
 * RLS do próprio dono (nada de RPC nova, nada de migration):
 *  - `trials_comerciais` → quando o teste começou e quando acaba/acabou;
 *  - `orcamentos_publicos` criados DENTRO dessa janela → orçamentos que foram pelo link
 *    sem o selo da OLLI, quantos o cliente abriu e quantos aprovou.
 * A regra do que dizer (e do que NÃO dizer quando é zero) é pura e testada:
 * `src/services/resumoTestePro.ts`.
 *
 * Só o DONO vê (membro da equipe não compra). Leitura que falha não vira "0": o cartão
 * mostra só o título e o botão. O botão é o MESMO Pix do Pro da tela de Planos.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { useMinhaAssinatura } from "@/olli/marcaDocumento";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { ehMembroNaoDono } from "@/olli/papel";
import { useUserInfo } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { type NumerosTestePro, type ResumoTestePro, resumoTestePro } from "../../../../../src/services/resumoTestePro";
import { precoDoPlano, reais } from "./precos";
import { opcoesOfertaComercial } from "./useLembreteAssinatura";

/** Destino do botão fora da tela de Planos: Planos já abrindo o Pix do Pro mensal. */
export const URL_PAGAR_PRO_DO_TESTE = "/planos?plano=pro&periodo=mensal&origem=teste&pagar=pix";

/** Teto de leitura: o teste dura 14 dias; ninguém publica 500 links nesse tempo. */
const LIMITE_LINKS = 500;

async function lerNumerosDoTeste(userId: string): Promise<NumerosTestePro | null> {
	const trial = await supabase
		.from("trials_comerciais")
		.select("iniciado_em, termina_em")
		.eq("owner_user_id", userId)
		.not("iniciado_em", "is", null)
		.order("iniciado_em", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (trial.error || !trial.data) return null;
	const { iniciado_em: inicio, termina_em: fim } = trial.data as {
		iniciado_em: string | null;
		termina_em: string | null;
	};
	if (!inicio || !fim) return null;
	const links = await supabase
		.from("orcamentos_publicos")
		.select("visualizado_em, status")
		.eq("user_id", userId)
		.gte("criado_em", inicio)
		.lt("criado_em", fim)
		.limit(LIMITE_LINKS);
	if (links.error || !Array.isArray(links.data)) return null;
	const linhas = links.data as { visualizado_em: string | null; status: string | null }[];
	return {
		linksEnviados: linhas.length,
		linksAbertos: linhas.filter((l) => !!l.visualizado_em).length,
		linksAprovados: linhas.filter((l) => l.status === "aprovado").length,
	};
}

/** O resumo para a tela, ou `null` (nada a mostrar). Chame ANTES de qualquer `return` cedo. */
export function useResumoTestePro(): ResumoTestePro | null {
	const userId = useUserInfo().id ?? "";
	const oferta = useQuery(opcoesOfertaComercial);
	const assinatura = useMinhaAssinatura();
	const contexto = useContextoDeEscrita();
	const estado = oferta.data?.trialEstado;
	const dono = contexto.isSuccess && !ehMembroNaoDono(contexto.data?.papel);
	const talvez = !!userId && dono && (estado === "active" || estado === "ended");
	const numeros = useQuery({
		queryKey: ["olli", "resumo-teste-pro", userId, oferta.data?.trialTerminaEm ?? null],
		queryFn: () => lerNumerosDoTeste(userId),
		enabled: talvez,
		staleTime: 5 * 60_000,
		retry: 1,
	});
	if (!talvez || !oferta.data || !assinatura.data || assinatura.isError || numeros.isLoading) return null;
	return resumoTestePro({
		agora: new Date(),
		trialEstado: oferta.data.trialEstado,
		terminaEm: oferta.data.trialTerminaEm,
		planoEfetivo: assinatura.data.planoEfetivo,
		numeros: numeros.isError ? null : (numeros.data ?? null),
	});
}

export function ResumoTesteProCard({
	resumo,
	aoPagar,
	className,
}: {
	resumo: ResumoTestePro | null;
	/** Na tela de Planos abre o Pix ali mesmo; nas outras telas, vai para Planos. */
	aoPagar?: () => void;
	className?: string;
}) {
	const navigate = useNavigate();
	const [fechado, setFechado] = useState(false);
	if (!resumo || fechado) return null;
	const preco = precoDoPlano("pro");
	const rotulo = preco ? `Assinar o Pro por ${reais(preco.mensalCentavos)}/mês` : "Assinar o Pro";
	return (
		<section aria-label={resumo.titulo}>
			<Card data-testid="resumo-teste-pro" className={`border-brand/30 bg-brand/5 p-4 ${className ?? ""}`}>
				<div className="flex items-start gap-3">
					<Sparkles className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
					<div className="min-w-0 flex-1">
						<p className="font-semibold text-text-primary">{resumo.titulo}</p>
						{resumo.feitos.length > 0 ? (
							<>
								<p className="mt-1 text-sm text-text-secondary">O que o Pro fez por você no teste:</p>
								<ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-primary">
									{resumo.feitos.map((linha) => (
										<li key={linha}>{linha}</li>
									))}
								</ul>
							</>
						) : null}
						{resumo.naoUsou ? <p className="mt-1 text-sm text-text-secondary">{resumo.naoUsou}</p> : null}
						<p className="mt-2 text-xs text-text-secondary">
							Seus dados continuam salvos, em qualquer plano.
						</p>
						<div className="mt-3 flex flex-col gap-2 sm:flex-row">
							<Button className="min-h-11" onClick={() => (aoPagar ? aoPagar() : navigate(URL_PAGAR_PRO_DO_TESTE))}>
								{rotulo}
							</Button>
							<Button variant="ghost" className="min-h-11" onClick={() => setFechado(true)}>
								Agora não
							</Button>
						</div>
					</div>
				</div>
			</Card>
		</section>
	);
}
