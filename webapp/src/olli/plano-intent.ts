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

export function destinoDepoisDoLogin(intencao: IntencaoPlano | null): string | null {
	if (!intencao) return null;
	return `/planos?plano=${intencao.plano}&periodo=${intencao.periodo}&origem=landing`;
}

export function caminhoCallbackAuth(intencao: IntencaoPlano | null): string {
	if (!intencao) return '/auth/login';
	return `/auth/login?plano=${intencao.plano}&periodo=${intencao.periodo}`;
}
