import { supabase } from '@/lib/supabase';

const WORKER_URL = (
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? 'https://diagnostico.olliorcamentos.online'
).replace(/\/+$/, '');

export type EstadoAcaoIaRemota = 'aguardando_confirmacao' | 'aplicada' | 'cancelada' | 'revertida';

export interface MudancaAcaoIaRemota {
	field: string;
	before: string | number | boolean | null;
	after: string | number | boolean | null;
}

export interface RascunhoAcaoIaRemota {
	id: string;
	confirmationToken: string;
	scope: string;
	targetLabel: string;
	summary: string;
	changes: MudancaAcaoIaRemota[];
	status: EstadoAcaoIaRemota;
}

export type ResultadoAcaoIa =
	| { ok: true; status: EstadoAcaoIaRemota; podeReverter: boolean }
	| { ok: false; mensagem: string };

function texto(valor: unknown, limite: number): string {
	return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= limite ? valor.trim() : '';
}

function valorSeguro(valor: unknown): valor is string | number | boolean | null {
	return valor === null || typeof valor === 'string' || typeof valor === 'boolean' || (typeof valor === 'number' && Number.isFinite(valor));
}

export function normalizarRascunhoAcaoIa(valor: unknown): RascunhoAcaoIaRemota | null {
	if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
	const bruto = valor as Record<string, unknown>;
	const id = texto(bruto.id, 160);
	const confirmationToken = texto(bruto.confirmationToken, 160);
	const scope = texto(bruto.scope, 40);
	const targetLabel = texto(bruto.targetLabel, 160);
	const summary = texto(bruto.summary, 240);
	if (!id || !confirmationToken || !scope || !targetLabel || !summary || bruto.status !== 'aguardando_confirmacao' || !Array.isArray(bruto.changes)) return null;
	const changes: MudancaAcaoIaRemota[] = [];
	for (const item of bruto.changes) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
		const change = item as Record<string, unknown>;
		const field = texto(change.field, 80);
		if (!field || !valorSeguro(change.before) || !valorSeguro(change.after)) return null;
		changes.push({ field, before: change.before, after: change.after });
	}
	if (changes.length < 1 || changes.length > 6) return null;
	return { id, confirmationToken, scope, targetLabel, summary, changes, status: 'aguardando_confirmacao' };
}

const MENSAGEM_POR_ERRO: Record<string, string> = {
	nao_autorizado: 'Sua sessão expirou. Entre novamente antes de confirmar.',
	confirmacao_invalida: 'A confirmação não corresponde a esta prévia. Gere uma nova.',
	permissao_atual_invalida: 'Seu papel ou vínculo mudou; a alteração foi bloqueada.',
	vinculo_proprio_protegido: 'A OLLI não altera seu próprio vínculo de equipe. Use a tela de equipe com outro administrador.',
	acao_expirada: 'Esta prévia expirou. Peça à OLLI para gerar uma nova com os dados atuais.',
	registro_alterado_desde_previa: 'O registro mudou depois da prévia. Revise os dados e gere outra alteração.',
	registro_alterado_apos_aplicacao: 'O registro foi editado depois da aplicação; o desfazer automático foi bloqueado.',
	estado_invalido: 'Esta ação já foi decidida e não pode repetir essa etapa.',
	limite_indisponivel: 'Não consegui confirmar o limite de segurança agora. Nada foi alterado.',
	muitas_requisicoes: 'Muitas ações em pouco tempo. Aguarde alguns segundos.',
};

async function chamar(endpoint: 'confirmar' | 'cancelar' | 'reverter', draft: RascunhoAcaoIaRemota): Promise<ResultadoAcaoIa> {
	let token: string | null = null;
	try {
		const { data } = await supabase.auth.getSession();
		token = data.session?.access_token ?? null;
	} catch {
		token = null;
	}
	if (!token) return { ok: false, mensagem: MENSAGEM_POR_ERRO.nao_autorizado };

	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), 15_000);
	try {
		const response = await fetch(`${WORKER_URL}/ia/acoes/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ actionId: draft.id, confirmationToken: draft.confirmationToken }),
			signal: controller.signal,
		});
		const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
		if (response.ok && data?.ok === true && ['aplicada', 'cancelada', 'revertida'].includes(String(data.status))) {
			return {
				ok: true,
				status: String(data.status) as EstadoAcaoIaRemota,
				podeReverter: data.podeReverter === true || data.status === 'aplicada',
			};
		}
		const code = typeof data?.erro === 'string' ? data.erro : '';
		return { ok: false, mensagem: MENSAGEM_POR_ERRO[code] ?? 'A ação não foi concluída. Nada adicional foi alterado.' };
	} catch {
		return { ok: false, mensagem: 'A conexão falhou. Confira a internet antes de tentar novamente.' };
	} finally {
		window.clearTimeout(timer);
	}
}

export const confirmarAcaoIa = (draft: RascunhoAcaoIaRemota) => chamar('confirmar', draft);
export const cancelarAcaoIa = (draft: RascunhoAcaoIaRemota) => chamar('cancelar', draft);
export const reverterAcaoIa = (draft: RascunhoAcaoIaRemota) => chamar('reverter', draft);
