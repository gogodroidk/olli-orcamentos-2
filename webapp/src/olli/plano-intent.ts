export type PlanoIntent = 'pro' | 'empresa';
export type PeriodoIntent = 'mensal' | 'anual';

export interface IntencaoPlano {
	plano: PlanoIntent;
	periodo: PeriodoIntent;
}

/**
 * Lê somente plano/período allowlistados. Não existe `returnTo` arbitrário:
 * todos os destinos são construídos internamente, eliminando open redirect.
 */
export function lerIntencaoPlano(search: string): IntencaoPlano | null {
	const params = new URLSearchParams(search);
	const plano = params.get('plano');
	if (plano !== 'pro' && plano !== 'empresa') return null;
	const periodo = params.get('periodo');
	return {
		plano,
		periodo: periodo === 'anual' ? 'anual' : 'mensal',
	};
}

/** Parâmetro que pede para abrir o Pix do plano da intenção (`?plano=pro&pagar=pix`). */
export const PARAM_PAGAR = "pagar";

/**
 * O `pagar=pix` só abre o Pix quando é seguro: Pix confirmado ligado, quem paga é o dono
 * da conta e ela está no Grátis ou no teste do Pro (pagar no teste é permitido). Plano
 * pago, leitura com erro ou membro da equipe: nada abre sozinho.
 */
export function podeAbrirPixDaIntencao(e: {
	pixLigado: boolean;
	membroNaoDono: boolean;
	resumo: { planoEfetivo: string; origem?: string | null } | null;
}): boolean {
	if (!e.pixLigado || e.membroNaoDono || !e.resumo) return false;
	return e.resumo.planoEfetivo === "gratis" || e.resumo.origem === "trial";
}

export function destinoDepoisDoLogin(intencao: IntencaoPlano | null): string | null {
	if (!intencao) return null;
	return `/planos?plano=${intencao.plano}&periodo=${intencao.periodo}&origem=landing`;
}

/**
 * Caminho de retorno do OAuth/cadastro. SEMPRE `/auth/login`, sem query, mesmo com
 * intenção de plano: o Supabase compara o `redirectTo` com a allowlist pela URL
 * INTEIRA, então `/auth/login?plano=pro` não bate com `/auth/login` e o GoTrue manda
 * o `?code=` para o Site URL (a landing), onde ele morre — conta criada sem sessão
 * (incidente 16–25/09). A intenção viaja no sessionStorage (`guardarIntencaoOAuth`).
 */
export function caminhoCallbackAuth(_intencao: IntencaoPlano | null): string {
	return '/auth/login';
}

/** Chave da intenção de plano guardada durante a ida-e-volta ao Google/Apple. */
export const CHAVE_INTENCAO_OAUTH = 'olli:oauth-intencao';
/** A ida-e-volta ao provedor leva segundos; 30 min cobre quem demora e expira o resto. */
const VALIDADE_INTENCAO_MS = 30 * 60 * 1000;

type ArmazenamentoSimples = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Guarda a intenção de plano antes do redirect do OAuth. Mesma aba = mesmo
 * sessionStorage na volta. Sem intenção, apaga qualquer resto de tentativa antiga.
 * Nunca lança (storage bloqueado só perde a conveniência, não o login).
 */
export function guardarIntencaoOAuth(
	armazenamento: ArmazenamentoSimples | null | undefined,
	intencao: IntencaoPlano | null,
	agora = Date.now(),
): void {
	try {
		if (!armazenamento) return;
		if (!intencao) {
			armazenamento.removeItem(CHAVE_INTENCAO_OAUTH);
			return;
		}
		armazenamento.setItem(
			CHAVE_INTENCAO_OAUTH,
			JSON.stringify({ plano: intencao.plano, periodo: intencao.periodo, em: agora }),
		);
	} catch {
		// storage indisponível (aba privada/bloqueada): segue sem a intenção
	}
}

/**
 * Lê E APAGA a intenção guardada. Revalida contra a mesma allowlist de
 * `lerIntencaoPlano` (o storage é editável pelo usuário) e descarta se vencida.
 */
export function consumirIntencaoOAuth(
	armazenamento: ArmazenamentoSimples | null | undefined,
	agora = Date.now(),
): IntencaoPlano | null {
	try {
		if (!armazenamento) return null;
		const cru = armazenamento.getItem(CHAVE_INTENCAO_OAUTH);
		armazenamento.removeItem(CHAVE_INTENCAO_OAUTH);
		if (!cru) return null;
		const dado = JSON.parse(cru) as { plano?: unknown; periodo?: unknown; em?: unknown };
		if (typeof dado.em !== 'number' || agora - dado.em > VALIDADE_INTENCAO_MS || dado.em > agora) return null;
		return lerIntencaoPlano(`?${new URLSearchParams({ plano: String(dado.plano), periodo: String(dado.periodo) })}`);
	} catch {
		return null;
	}
}
