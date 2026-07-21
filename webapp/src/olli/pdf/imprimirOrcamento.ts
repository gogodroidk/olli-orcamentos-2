/**
 * imprimirOrcamento — o painel gera o PDF do orçamento pro PRESTADOR baixar/imprimir.
 *
 * REUSO, NÃO REESCRITA: chama `montarHtmlOrcamentoCompleto` do app
 * (`src/utils/pdfGenerator.ts`) — o MESMO gerador que produz o PDF do celular. O
 * documento que o prestador imprime no computador é byte-a-byte o mesmo do app; não
 * há um segundo layout pra divergir. O que tornava isso impossível era o import de
 * `react-native`/`expo` na árvore do gerador; os stubs do vite.config (ver
 * src/shims/native-stubs.ts) resolvem isso sem executar nada de nativo.
 *
 * A impressão é NATIVA do navegador e mora em `./imprimirHtml` — o MESMO caminho
 * de papel do contrato. Ele saiu daqui quando o segundo documento chegou: duas
 * cópias do iframe divergiriam na primeira correção de navegador.
 *
 * O cliente NÃO depende disto: ele já recebe o orçamento pelo portal do worker
 * (/o/<token>). Isto é a via do prestador — do próprio arquivo dele.
 *
 * MARCA D'ÁGUA: `removerMarca` vem do chamador, resolvido da assinatura REAL em
 * `olli/marcaDocumento.ts`. Antes ele simplesmente não era passado, e o assinante
 * Pro/Empresa via o selo do OLLI voltar só porque imprimiu no computador. Ausente =
 * selo impresso: o default erra para o lado que o cliente reclama, não para o lado
 * que entrega de graça o que é vendido.
 */
import type { Depoimento, Empresa, Orcamento } from "@dominio";
import { gerarHtmlOrcamento } from "../../../../src/utils/pdfGenerator";
import { imprimirHtml } from "./imprimirHtml";

/**
 * Gera e imprime o PDF do orçamento. NUNCA lança silenciosamente: a falha volta pro
 * chamador mostrar um toast — um botão de PDF que "não faz nada" é o padrão que a casa mata.
 */
export async function imprimirOrcamento(
	orcamento: Orcamento,
	empresa: Empresa,
	depoimentos: Depoimento[] = [],
	opcoes?: { removerMarca?: boolean },
): Promise<void> {
	// gerarHtmlOrcamento (SÍNCRONO, puro) em vez de montarHtmlOrcamentoCompleto: este
	// último faz populateImages (converte file:// do celular — no painel as imagens já
	// são data:/http) e obterLinkPublico (import dinâmico que puxa o Supabase e o async-
	// storage do app pro bundle web). Nada disso é preciso aqui: as URIs do painel já
	// são web, e o QR de aprovação do CLIENTE não vai no PDF do PRESTADOR — o cliente já
	// aprova pelo portal /o/<token>. Sem linkPublico, o guia de aprovação cai no texto-
	// instrução, que é o fallback já previsto no gerador.
	//
	// `accentRaw` fica `undefined` de propósito: o gerador então honra a cor de marca
	// DAQUELE orçamento (`o.corMarca`), que é o mesmo caminho do celular. Passar a cor
	// da empresa aqui faria o painel imprimir numa cor e o app noutra.
	const html = gerarHtmlOrcamento(orcamento, empresa, depoimentos, undefined, {
		removerMarca: opcoes?.removerMarca === true,
	});
	await imprimirHtml(html);
}
