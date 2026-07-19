/**
 * A REGRA da marca do documento — o selo "Gerado com OLLI Orçamentos" sai, ou fica?
 *
 * Mora separado de `marcaDocumento.ts` (que fala com o Supabase e com o React Query)
 * pelo mesmo motivo que `entitlements.ts` mora separado de `planos.ts` no app: a
 * regra que decide DINHEIRO tem que poder ser executada sem subir o painel inteiro.
 * Aqui não há client, não há rede, não há hook — só entrada e saída.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRÊS ESTADOS. "NÃO SEI" NUNCA VIRA "NÃO TEM".
 * ═══════════════════════════════════════════════════════════════════════════════
 * O bug que esta regra fecha: o app calculava o entitlement e passava `removerMarca`
 * ao gerador; o painel nunca passava. O MESMO assinante Pro/Empresa gerava o contrato
 * do orçamento 0042 no celular e saía SEM selo, gerava no computador e saía COM selo.
 * Ele paga exatamente para o selo não aparecer, e a marca voltava conforme a tela.
 *
 * Consertar isso é mais do que "passar o booleano": a leitura da assinatura pode
 * falhar, e um booleano só tem dois valores. Por isso `Marca` carrega `confirmado`
 * junto com `removerMarca` — o "não sei" é um estado próprio, e quem chama é obrigado
 * a vê-lo.
 *
 * O lado seguro do "não sei" é o selo FICAR: tirar a marca de quem não pagou entrega
 * de graça o que é vendido; deixá-la em quem pagou é um incômodo VISÍVEL, que ele
 * reclama e nós corrigimos. Note que não existe caminho que devolva
 * `removerMarca: true` com `confirmado: false` — tirar a marca exige certeza.
 */
import type { ResumoAssinatura } from "@/pages/olli/planos/tipos";
// A tabela "que plano libera o quê" vem da FONTE do app (módulo PURO, zero imports).
// Recopiar "pro | empresa" aqui criaria um segundo lugar para a regra de COBRANÇA
// envelhecer — e no dia em que os dois discordassem, o cliente pagante veria a marca
// de volta sem erro nenhum aparecer.
import { RECURSO_REMOVE_MARCA, temAcessoRecurso } from "../../../src/services/entitlements";
import { ehMembroNaoDono } from "./papel";

/** Por que não deu para confirmar o plano — cada um pede uma frase diferente. */
export type MotivoIndeterminado =
	/** A leitura de `assinaturas` falhou (rede, RLS, 5xx). Dá para tentar de novo. */
	| "falha"
	/** Membro não-dono: a assinatura é do dono da empresa, e a RLS não a entrega. */
	| "membro";

export interface Marca {
	/** O valor passado ao gerador. `true` remove o selo OLLI do documento. */
	removerMarca: boolean;
	/** `true` = o plano foi LIDO. `false` = não sabemos, e o selo ficou por isso. */
	confirmado: boolean;
	/** Só quando `confirmado` é false. */
	motivo?: MotivoIndeterminado;
}

/** O selo fica, e não sabemos se deveria — o lado seguro, sempre nomeado. */
function naoSei(motivo: MotivoIndeterminado): Marca {
	return { removerMarca: false, confirmado: false, motivo };
}

/**
 * Recebe o que as duas leituras devolveram; devolve o que vai para o papel.
 *
 * A REGRA DE QUEM É DONO é a MESMA da tela de Planos (`pages/olli/planos/index.tsx`),
 * não uma segunda invenção: membro não-dono não tem linha própria em `assinaturas` —
 * a assinatura é do DONO da organização, e a RLS só entrega a linha do próprio
 * usuário. Ler "sem linha" como "Grátis" para um técnico de uma empresa PAGANTE é o
 * rebaixamento que aquela tela existe para impedir; aqui vira `motivo: 'membro'`.
 */
export function derivarMarca(entrada: {
	resumo: ResumoAssinatura | undefined;
	falhouAssinatura: boolean;
	/** Papel na organização. `undefined` = ainda não sabemos (carregando ou erro). */
	papel: string | undefined;
}): Marca {
	// A MESMA função que a tela de Planos usa — não uma segunda escrita da condição.
	// Papel desconhecido devolve false ali dentro e cai no caminho normal.
	if (ehMembroNaoDono(entrada.papel)) return naoSei("membro");

	if (entrada.falhouAssinatura || !entrada.resumo) return naoSei("falha");

	// `planoEfetivo` já considera status E vencimento (ver `derivar` em planos/tipos):
	// assinatura vencida que ninguém atualizou não conta como paga. `past_due` conta —
	// a cobrança falhou, mas o acesso continua durante a retentativa; quem só teve um
	// cartão recusado não perde a marca no meio de um contrato.
	return {
		removerMarca: temAcessoRecurso(entrada.resumo.planoEfetivo, RECURSO_REMOVE_MARCA),
		confirmado: true,
	};
}

/**
 * O que dizer quando a marca entrou sem confirmação. Uma frase por motivo, escrita
 * aqui para o contrato e o orçamento dizerem a MESMA coisa.
 *
 * NÃO citamos o texto impresso, de propósito: os dois documentos imprimem marcas
 * DIFERENTES — o contrato usa `footerSeloOlliHtml` ("Gerado com OLLI Orçamentos",
 * src/utils/marcaOlli.ts) e o orçamento usa a linha `brand-olli` ("Orçamento feito
 * com OLLI", src/utils/pdfGenerator.ts). Citar um literal aqui deixaria a frase certa
 * num documento e errada no outro — e uma copy que descreve o papel errado é a mesma
 * classe de defeito que este arquivo existe para fechar.
 *
 * Devolve `null` quando o plano foi confirmado: não há o que avisar.
 */
export function avisoDaMarca(marca: Marca): string | null {
	if (marca.confirmado) return null;
	if (marca.motivo === "membro") {
		return "A marca do OLLI vai no documento: o plano da empresa é confirmado na conta do dono, não na sua.";
	}
	return "Não consegui confirmar o seu plano agora, então a marca do OLLI vai no documento. Isto é um erro de leitura — não quer dizer que sua assinatura acabou.";
}
