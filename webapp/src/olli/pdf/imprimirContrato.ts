/**
 * imprimirContrato — o CONTRATO DE PRESTAÇÃO DE SERVIÇOS no painel.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REUSO, NÃO REESCRITA — e por que deu pra reusar inteiro
 * ═══════════════════════════════════════════════════════════════════════════════
 * O gerador é o do app: `gerarHtmlContrato`/`termosPadraoContrato` de
 * `src/utils/contratoPdf.ts`, o MESMO que produz o contrato do celular. Não há um
 * segundo layout, um segundo texto de cláusula nem um segundo aviso jurídico pra
 * divergir — o papel que sai do computador é o papel que sai do telefone.
 *
 * Isso não era garantido: o precedente da casa é um arquivo de tema que quebrou o
 * build do painel por importar react-native. A cadeia do contrato foi conferida
 * arquivo a arquivo antes de escrever esta linha:
 *
 *   contratoPdf → types (puro) · currency (puro) · date (puro) · html (puro)
 *               → documentoBase → html (puro)
 *                               → marcaOlli            (ZERO imports)
 *                               → theme/cores          (ZERO imports)  ← o pulo do gato
 *
 * `documentoBase` importa `../theme/cores` — o arquivo de DADO puro —, não
 * `../theme` (o índice, que arrasta o TemaProvider e o react-native). É exatamente
 * a separação "dado puro × efeito de plataforma" que resolveu a quebra anterior, e
 * é ela que deixa o contrato atravessar pro painel sem stub novo.
 *
 * O ÚNICO ponto de plataforma da cadeia é `carregarImagensDocumento`, que faz
 * `await import('./imagemDataUri')` (esse sim importa react-native). O painel já
 * resolve isso: o vite.config troca o módulo pelo shim web, que passa `data:` e
 * `http(s):` direto e devolve null pro `file://` do celular — comportamento certo
 * no navegador. Ou seja, dá pra chamar `montarHtmlContratoCompleto` (colheita de
 * imagens + geração) sem recompor nada aqui.
 *
 * O que NÃO atravessa é `compartilharPdfContrato`: ela importa `exportarDocumento`
 * pra falar com expo-print/expo-sharing. É a fronteira certa — o painel imprime
 * pelo navegador (`imprimirHtml`), o mesmo caminho do PDF do orçamento.
 *
 * MARCA D'ÁGUA: `removerMarca` não é passado, igual ao PDF do orçamento do painel.
 * O painel não tem gate de plano (nenhum `usePlano`/`temAcesso` existe aqui), e
 * inventar um entitlement no lugar de ler o do app seria decidir cobrança por
 * chute. O selo do OLLI fica — como já fica no orçamento impresso daqui.
 */
import type { ContratoPadrao, Empresa, Orcamento } from "@dominio";
import {
	AVISO_APP,
	montarHtmlContratoCompleto,
	type TermosContrato,
	termosPadraoContrato,
} from "../../../../src/utils/contratoPdf";
import { imprimirHtml } from "./imprimirHtml";

export type { TermosContrato };

/**
 * O aviso de honestidade jurídica DA INTERFACE, na letra do app — reexportado
 * daqui pra o painel nunca reescrevê-lo de memória. (O aviso longo, o do PAPEL,
 * é impresso pelo `rodapeDocumento` em toda geração e não depende desta tela: não
 * existe plano nem caminho que o remova.)
 */
export { AVISO_APP };

/**
 * A COLHEITA, verbatim do app: orçamento aprovado + cadastro da empresa + as
 * cláusulas padrão que o prestador salvou (no celular, em "Cláusulas padrão do
 * contrato"). O painel LÊ esse padrão e não o reescreve — ele é campo de `Empresa`
 * e gravá-lo daqui exigiria repetir o merge com detecção de conflito de Meu
 * Negócio; o que este arquivo entrega é o ajuste DESTE documento.
 */
export function termosDoOrcamento(o: Orcamento, empresa: Empresa): TermosContrato {
	return termosPadraoContrato(o, empresa, empresa.contratoPadrao);
}

/** O formulário do diálogo: TUDO texto, do jeito que o usuário digitou. */
export interface EdicaoContrato {
	objeto: string;
	local: string;
	prazo: string;
	pagamento: string;
	garantia: string;
	multaAtrasoPercent: string;
	jurosMesPercent: string;
	avisoPrevioDias: string;
	foro: string;
	obrigacoesContratada: string;
	obrigacoesContratante: string;
	clausulasExtras: string;
}

/** Os termos resolvidos viram o texto inicial de cada caixa — nada começa vazio. */
export function edicaoDeTermos(t: TermosContrato): EdicaoContrato {
	return {
		objeto: t.objeto,
		local: t.local,
		prazo: t.prazo,
		pagamento: t.pagamento,
		garantia: t.garantia,
		multaAtrasoPercent: String(t.multaAtrasoPercent),
		jurosMesPercent: String(t.jurosMesPercent),
		avisoPrevioDias: String(t.avisoPrevioDias),
		foro: t.foro,
		obrigacoesContratada: t.obrigacoesContratada,
		obrigacoesContratante: t.obrigacoesContratante,
		clausulasExtras: t.clausulasExtras,
	};
}

/**
 * Texto digitado, ou o valor colhido. Espaço em branco não conta como preenchido —
 * mesma regra do `textoOuPadrao` do app: apagar uma cláusula não pode imprimir um
 * contrato com a cláusula EM BRANCO, imprime o padrão conhecido.
 *
 * `clausulasExtras` é a exceção e passa por `textoLivre`: lá o vazio é uma escolha
 * legítima (não ter disposição complementar), e o gerador já omite a cláusula.
 */
function textoOuColhido(digitado: string, colhido: string): string {
	const t = digitado.trim();
	return t.length > 0 ? t : colhido;
}

/** Número digitado (aceita vírgula), ou `undefined` = "não sei" → cai no padrão. */
function numeroDigitado(texto: string): number | undefined {
	const t = texto.trim().replace(",", ".");
	if (!t) return undefined;
	const n = Number(t);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Edição do prestador → termos prontos pro gerador.
 *
 * OS NÚMEROS NÃO SÃO VALIDADOS AQUI. Eles são devolvidos ao próprio
 * `termosPadraoContrato`, que os passa pelo `numeroOuPadrao` do app — o mesmo
 * limitador, com os mesmos limites, que roda no celular. É de propósito: o teto da
 * multa de mora é o do art. 52, §1º, do CDC, e recopiar "2" aqui criaria um segundo
 * lugar pra esse número envelhecer. Se o app mudar o limite, o painel muda junto,
 * sem ninguém lembrar de vir aqui.
 *
 * Vazio/ilegível cai na cascata do app (padrão salvo → padrão do app), NUNCA em
 * zero: "não sei quanto é a multa" não pode virar "não tem multa" impresso.
 */
export function resolverTermos(
	o: Orcamento,
	empresa: Empresa,
	colhidos: TermosContrato,
	edicao: EdicaoContrato,
): TermosContrato {
	const padraoSalvo: ContratoPadrao = empresa.contratoPadrao ?? {};
	const numeros = termosPadraoContrato(o, empresa, {
		...padraoSalvo,
		multaAtrasoPercent: numeroDigitado(edicao.multaAtrasoPercent) ?? padraoSalvo.multaAtrasoPercent,
		jurosMesPercent: numeroDigitado(edicao.jurosMesPercent) ?? padraoSalvo.jurosMesPercent,
		avisoPrevioDias: numeroDigitado(edicao.avisoPrevioDias) ?? padraoSalvo.avisoPrevioDias,
	});

	return {
		objeto: textoOuColhido(edicao.objeto, colhidos.objeto),
		local: textoOuColhido(edicao.local, colhidos.local),
		prazo: textoOuColhido(edicao.prazo, colhidos.prazo),
		pagamento: textoOuColhido(edicao.pagamento, colhidos.pagamento),
		garantia: textoOuColhido(edicao.garantia, colhidos.garantia),
		multaAtrasoPercent: numeros.multaAtrasoPercent,
		jurosMesPercent: numeros.jurosMesPercent,
		avisoPrevioDias: numeros.avisoPrevioDias,
		foro: textoOuColhido(edicao.foro, colhidos.foro),
		obrigacoesContratada: textoOuColhido(edicao.obrigacoesContratada, colhidos.obrigacoesContratada),
		obrigacoesContratante: textoOuColhido(edicao.obrigacoesContratante, colhidos.obrigacoesContratante),
		// Cláusulas complementares: vazio é escolha, não falta de dado.
		clausulasExtras: edicao.clausulasExtras.trim(),
	};
}

/**
 * Os TETOS que o gerador aplica — PERGUNTADOS ao gerador, não recopiados.
 *
 * A caixa de "multa" precisa dizer ao prestador qual é o máximo (senão ele digita
 * 10%, vê 2% sair no papel e acha que o sistema comeu o número). Mas o limite mora
 * dentro do `numeroOuPadrao` do app e não é exportado. Em vez de escrever "2" na
 * interface — a duplicata clássica que envelhece calada —, sondamos: mandamos um
 * valor absurdo e lemos o que voltou depois do clamp. Função pura, custo zero, e a
 * dica da tela passa a ser SEMPRE o limite real do documento.
 */
export function tetosDoContrato(o: Orcamento, empresa: Empresa): {
	multaAtrasoPercent: number;
	jurosMesPercent: number;
	avisoPrevioDias: number;
} {
	const ABSURDO = 1e9;
	const t = termosPadraoContrato(o, empresa, {
		multaAtrasoPercent: ABSURDO,
		jurosMesPercent: ABSURDO,
		avisoPrevioDias: ABSURDO,
	});
	return {
		multaAtrasoPercent: t.multaAtrasoPercent,
		jurosMesPercent: t.jurosMesPercent,
		avisoPrevioDias: t.avisoPrevioDias,
	};
}

/**
 * Monta e imprime o contrato. NUNCA falha em silêncio: o erro volta pro chamador
 * mostrar o toast — um botão que "não faz nada" é o padrão que a casa mata.
 *
 * A assinatura do contrato colhida no celular (`assinaturaContratoUri`) entra
 * quando existe: quem já assinou no aparelho não pode receber, no computador, um
 * papel sem a assinatura que o cliente deu. Quem não assinou continua com a linha
 * em branco pra assinar na mão — que é o fluxo do painel.
 */
export async function imprimirContrato(
	o: Orcamento,
	empresa: Empresa,
	termos: TermosContrato,
): Promise<void> {
	const html = await montarHtmlContratoCompleto(o, empresa, termos, {
		assinaturaClienteUri: o.assinaturaContratoUri,
		dataAssinaturaCliente: o.dataAssinaturaContrato,
	});
	await imprimirHtml(html);
}
