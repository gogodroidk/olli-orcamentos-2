import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/ui/button";

const PAGAMENTOS_URL = (
	(import.meta.env.VITE_PAGAMENTOS_URL as string | undefined) ??
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ??
	"https://diagnostico.olliorcamentos.online"
).replace(/\/+$/, "");
const TIMEOUT_MS = 20_000;

function urlStripeSegura(valor: unknown): string | null {
	if (typeof valor !== "string") return null;
	try {
		const url = new URL(valor);
		const host = url.hostname.toLowerCase();
		return url.protocol === "https:" && (host === "stripe.com" || host.endsWith(".stripe.com")) ? url.toString() : null;
	} catch {
		return null;
	}
}

export interface FaturaStripe {
	id: string;
	data: number | null;
	valorCentavos: number;
	moeda: string;
	status: string | null;
	pago: boolean;
	recibo: string | null;
	intervalo: "month" | "year" | null;
}

export interface MetodoStripe { brand: string; last4: string }

async function chamar(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
	const { data, error } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (error || !token) throw new Error("Sua sessão expirou. Entre de novo para continuar.");

	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const resposta = await fetch(`${PAGAMENTOS_URL}${path}`, {
			...init,
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
			signal: controller.signal,
		});
		const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
		if (!resposta.ok || dados.ok === false) {
			const codigo = typeof dados.erro === "string" ? dados.erro : "";
			if (codigo === "sem_assinatura" || resposta.status === 404) throw new Error("Esta conta ainda não tem uma assinatura Stripe para gerenciar.");
			if (codigo === "stripe_nao_configurado") throw new Error("A área de cobrança está indisponível no momento.");
			if (codigo === "muitas_requisicoes") throw new Error("Muitas tentativas. Aguarde um instante e tente de novo.");
			if (resposta.status === 401) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
			throw new Error("Não consegui consultar sua cobrança agora. Tente de novo em instantes.");
		}
		return dados;
	} catch (erro) {
		if (erro instanceof DOMException && erro.name === "AbortError") throw new Error("A cobrança demorou para responder. Confira a conexão e tente de novo.");
		throw erro;
	} finally {
		window.clearTimeout(timer);
	}
}

export async function abrirPortalStripe(): Promise<string> {
	const dados = await chamar("/stripe/portal", { method: "POST", body: "{}" });
	const url = urlStripeSegura(dados.url);
	if (!url) throw new Error("A Stripe não devolveu um endereço seguro para gerenciar a assinatura.");
	return url;
}

export async function listarFaturasStripe(): Promise<FaturaStripe[]> {
	const dados = await chamar("/stripe/faturas");
	if (!Array.isArray(dados.faturas)) return [];
	return dados.faturas.flatMap((item): FaturaStripe[] => {
		const fatura = item as Partial<FaturaStripe>;
		if (typeof fatura.id !== "string" || typeof fatura.valorCentavos !== "number" || !Number.isFinite(fatura.valorCentavos)) return [];
		return [{
			id: fatura.id,
			data: typeof fatura.data === "number" ? fatura.data : null,
			valorCentavos: fatura.valorCentavos,
			moeda: typeof fatura.moeda === "string" ? fatura.moeda : "brl",
			status: typeof fatura.status === "string" ? fatura.status : null,
			pago: fatura.pago === true,
			recibo: urlStripeSegura(fatura.recibo),
			intervalo: fatura.intervalo === "month" || fatura.intervalo === "year" ? fatura.intervalo : null,
		}];
	});
}

export async function obterMetodoStripe(): Promise<MetodoStripe | null> {
	const dados = await chamar("/stripe/metodo");
	const metodo = dados.metodo as Partial<MetodoStripe> | null | undefined;
	return metodo && typeof metodo.brand === "string" && typeof metodo.last4 === "string" ? { brand: metodo.brand, last4: metodo.last4 } : null;
}

export function BotaoPortalStripe({ className, rotulo = "Gerenciar assinatura" }: { className?: string; rotulo?: string }) {
	const [abrindo, setAbrindo] = useState(false);
	async function abrir() {
		setAbrindo(true);
		try {
			window.location.assign(await abrirPortalStripe());
		} catch (erro) {
			toast.error(erro instanceof Error ? erro.message : "Não consegui abrir a cobrança agora.");
			setAbrindo(false);
		}
	}
	return (
		<Button type="button" variant="outline" className={className} onClick={abrir} disabled={abrindo}>
			{abrindo ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
			{abrindo ? "Abrindo Stripe…" : rotulo}
			{!abrindo && <ExternalLink className="size-3.5" aria-hidden="true" />}
		</Button>
	);
}
