/**
 * Web Vitals de CAMPO do painel (LCP, INP, CLS) → Sentry Metrics.
 *
 * Por quê: o laboratório (Lighthouse) diz que o login abre em 1,66 s, mas o INP
 * das telas logadas nunca foi medido — o CrUX do painel é vazio (pouco tráfego,
 * `noindex`). Sem número de campo, animar mais seria chute (plano-mestre, 7.2).
 *
 * Custo: `web-vitals` (~2 KB gzip) entra por import() DEPOIS do Sentry, que já
 * carrega no ocioso — nada no caminho da primeira tela. As métricas vão como
 * `distribution` (Sentry Metrics), que NÃO consome a cota de eventos de erro do
 * plano grátis; um `captureMessage` por medida gastaria a cota em dias.
 *
 * Privacidade: só nome da métrica, valor, faixa (good/needs-improvement/poor)
 * e a SEÇÃO da rota ("/orcamentos"), nunca o caminho inteiro nem query string —
 * um id de registro na URL seria dado de cliente saindo do painel.
 *
 * O mapeamento é puro (sem import de valor) para o teste da raiz rodar com
 * `node` direto: `scripts/teste-painel-leve.ts`.
 */

export type NomeVital = "LCP" | "INP" | "CLS";

/** Formato mínimo que o `web-vitals` entrega nos callbacks (o que usamos dele). */
export interface VitalBruto {
	name: string;
	value: number;
	rating: string;
	navigationType?: string;
}

export interface MedidaVital {
	nome: `web_vital.${Lowercase<NomeVital>}`;
	valor: number;
	unidade: "millisecond" | "none";
	atributos: { rota: string; faixa: string; navegacao: string };
}

const VITAIS: readonly NomeVital[] = ["LCP", "INP", "CLS"];
const FAIXAS = new Set(["good", "needs-improvement", "poor"]);

/** "/orcamentos/123?x=1" → "/orcamentos". Raiz e vazio → "/". */
export function secaoDaRota(pathname: string): string {
	const primeiro = String(pathname || "")
		.split(/[?#]/)[0]
		.split("/")
		.filter(Boolean)[0];
	if (!primeiro) return "/";
	// Segmento com cara de id (número, uuid, hash) nunca vira atributo.
	if (/\d/.test(primeiro) || primeiro.length > 40) return "/:id";
	return `/${primeiro.toLowerCase()}`;
}

/**
 * Converte a medida do `web-vitals` no que vai para o Sentry. `null` = descarta
 * (métrica que não acompanhamos, valor inválido). Nunca lança.
 */
export function medidaParaSentry(vital: VitalBruto, pathname: string): MedidaVital | null {
	if (!vital || !VITAIS.includes(vital.name as NomeVital)) return null;
	if (!Number.isFinite(vital.value) || vital.value < 0) return null;
	const nome = vital.name as NomeVital;
	return {
		nome: `web_vital.${nome.toLowerCase() as Lowercase<NomeVital>}`,
		// CLS é adimensional (0,05); LCP e INP em ms, arredondados — fração de ms é ruído.
		valor: nome === "CLS" ? Math.round(vital.value * 10_000) / 10_000 : Math.round(vital.value),
		unidade: nome === "CLS" ? "none" : "millisecond",
		atributos: {
			rota: secaoDaRota(pathname),
			faixa: FAIXAS.has(vital.rating) ? vital.rating : "desconhecida",
			navegacao: typeof vital.navigationType === "string" ? vital.navigationType : "desconhecida",
		},
	};
}

type Distribuir = (nome: string, valor: number, opcoes: { unit: string; attributes: Record<string, string> }) => void;

/**
 * Liga a medição. `distribuir` é o `Sentry.metrics.distribution` já iniciado.
 * Falha ao baixar o `web-vitals` só desliga a medição — nunca a tela.
 */
export async function ligarWebVitals(distribuir: Distribuir): Promise<boolean> {
	try {
		const { onCLS, onINP, onLCP } = await import("web-vitals");
		const enviar = (vital: VitalBruto) => {
			const medida = medidaParaSentry(vital, window.location.pathname);
			if (!medida) return;
			try {
				distribuir(medida.nome, medida.valor, { unit: medida.unidade, attributes: medida.atributos });
			} catch {
				// Sentry recusou a métrica: perde-se a medida, não o painel.
			}
		};
		onLCP(enviar);
		onINP(enviar);
		onCLS(enviar);
		return true;
	} catch {
		return false;
	}
}
