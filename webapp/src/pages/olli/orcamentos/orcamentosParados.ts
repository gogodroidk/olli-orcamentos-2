/**
 * O EMPURRÃO DO ENVIO — quais rascunhos a lista deve lembrar de enviar (painel).
 *
 * Por quê (06/10/2026): das contas que orçaram, 8 de 11 só têm rascunho e, no banco, 7 dessas 8 não
 * mostram NENHUM sinal de envio (sem link, sem envio confirmado, sem atividade). São orçamentos
 * completos — cliente, itens, valor — que o prestador montou e deixou parados. Ninguém lembra a pessoa;
 * quando ela volta ao painel, a lista é só uma lista.
 *
 * A regra é conservadora de propósito (lembrete que incomoda vira ruído que se ignora):
 *  - só RASCUNHO, com o documento inteiro, ao menos 1 item, valor > 0 e nome do cliente;
 *  - só se o WhatsApp do cliente é válido (a ação oferecida é "Enviar pelo WhatsApp"; sem número ela
 *    não funcionaria — o prestador já recebe esse aviso ao tentar enviar);
 *  - só depois de 60 min SEM mexer: quem está editando agora não é lembrado;
 *  - "Agora não" cala aquele orçamento por 24 h.
 */
import type { Orcamento } from "@dominio";
import { numeroParaWhatsApp } from "../../../olli/linkWhatsApp.ts";

export const MINUTOS_PARADO = 60;
export const HORAS_DISPENSA = 24;

export interface LinhaParaFaixa {
	id: string;
	status: string | null;
	criado_em: string;
	dados: Orcamento | null;
}

/** Quando o documento foi mexido pela última vez (o blob manda; a coluna é o plano B). */
export function ultimaMexidaMs(linha: LinhaParaFaixa): number {
	const candidatos = [linha.dados?.atualizadoEm, linha.dados?.criadoEm, linha.criado_em]
		.map((v) => (v ? Date.parse(v) : Number.NaN))
		.filter((n) => Number.isFinite(n));
	return candidatos.length ? Math.max(...candidatos) : Number.NaN;
}

export function prontoEParado(linha: LinhaParaFaixa, agoraMs: number, dispensados: Record<string, number> = {}): boolean {
	if (linha.status !== "rascunho") return false;
	const d = linha.dados;
	if (!d || !Array.isArray(d.itens) || d.itens.length === 0) return false;
	if (!(Number(d.valorTotal) > 0)) return false;
	if (!String(d.clienteNome ?? "").trim()) return false;
	if (!numeroParaWhatsApp(d.clienteTelefone)) return false;
	const mexida = ultimaMexidaMs(linha);
	if (!Number.isFinite(mexida) || agoraMs - mexida < MINUTOS_PARADO * 60_000) return false;
	const dispensadoEm = dispensados[linha.id];
	if (typeof dispensadoEm === "number" && agoraMs - dispensadoEm < HORAS_DISPENSA * 3_600_000) return false;
	return true;
}

/** Os rascunhos prontos e parados, o mexido por último primeiro (é o que a pessoa lembra). */
export function prontosParados<T extends LinhaParaFaixa>(
	linhas: readonly T[],
	agoraMs: number,
	dispensados: Record<string, number> = {},
): T[] {
	return linhas
		.filter((l) => prontoEParado(l, agoraMs, dispensados))
		.sort((a, b) => ultimaMexidaMs(b) - ultimaMexidaMs(a));
}

const CHAVE_DISPENSADOS = "olli.faixa_envio_dispensada";

/** Lê as dispensas (localStorage; sem storage = nenhuma dispensa, a faixa só volta a aparecer). */
export function lerDispensados(): Record<string, number> {
	try {
		const bruto = window.localStorage.getItem(CHAVE_DISPENSADOS);
		const obj = bruto ? JSON.parse(bruto) : {};
		return obj && typeof obj === "object" ? (obj as Record<string, number>) : {};
	} catch {
		return {};
	}
}

export function dispensarFaixa(id: string, agoraMs: number): Record<string, number> {
	const atual = lerDispensados();
	// Mantém só as dispensas ainda válidas: o objeto não cresce para sempre.
	const vivas = Object.fromEntries(Object.entries(atual).filter(([, t]) => agoraMs - t < HORAS_DISPENSA * 3_600_000));
	vivas[id] = agoraMs;
	try {
		window.localStorage.setItem(CHAVE_DISPENSADOS, JSON.stringify(vivas));
	} catch {
		// sem storage: a dispensa vale só enquanto a página estiver aberta
	}
	return vivas;
}
