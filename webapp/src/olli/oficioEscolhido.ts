/**
 * OFÍCIO ESCOLHIDO NO CARTÃO "Seu primeiro orçamento em 1 minuto" — sugestão para o "Meu negócio".
 *
 * Por quê (E2E de produção, 06/10/2026): a pessoa escolhe "Elétrica" no cartão do Início, monta o
 * orçamento de exemplo, pede o PDF e cai no "Meu negócio" — que pergunta DE NOVO "Que tipo de
 * serviço você orça?" sem nada marcado, com Especialidade e Nome da empresa vazios. É a tela em que
 * 38 de 61 contas pararam (04/10). Lembrar a escolha tira 3 campos obrigatórios da frente.
 *
 * Regras:
 *  - É só SUGESTÃO de preenchimento: o formulário mostra, a pessoa revisa e só então salva. Nada é
 *    gravado no banco por aqui, e dado que já existe na empresa NUNCA é sobrescrito.
 *  - Vive no navegador (localStorage). Sem storage (aba anônima, bloqueado) = sem sugestão, sem erro.
 *  - "Outro serviço" (geral) marca o tipo de serviço mas NÃO inventa uma especialidade.
 */

const CHAVE = "olli.oficio_escolhido_cartao";

export function lembrarOficioEscolhido(id: string): void {
	try {
		window.localStorage.setItem(CHAVE, id);
	} catch {
		// sem storage: a sugestão simplesmente não existe
	}
}

export function oficioEscolhidoLembrado(): string | null {
	try {
		return window.localStorage.getItem(CHAVE);
	} catch {
		return null;
	}
}

export interface OficioSugerido {
	id: string;
	/** Texto para a Especialidade. `null` = não sugerir (ex.: "Outro serviço"). */
	especialidade: string | null;
}

interface BaseEmpresa {
	nome?: string;
	nomePrestador?: string;
	especialidade?: string;
	verticais?: string[];
}

const vazio = (s: string | undefined) => !(s ?? "").trim();

/**
 * Preenche SÓ o que está vazio: tipo de serviço e especialidade vêm do ofício escolhido; o nome da
 * empresa vem do nome de quem se cadastrou (autônomo é o caso comum; a pessoa edita se for diferente).
 */
export function semearComOficio<T extends BaseEmpresa>(base: T, oficio: OficioSugerido | null): T {
	const saida = { ...base };
	if (oficio && !saida.verticais?.length) saida.verticais = [oficio.id];
	if (oficio?.especialidade && vazio(saida.especialidade)) saida.especialidade = oficio.especialidade;
	if (vazio(saida.nome) && !vazio(saida.nomePrestador)) saida.nome = (saida.nomePrestador ?? "").trim();
	return saida;
}
