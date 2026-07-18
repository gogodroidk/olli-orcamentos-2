/**
 * legal-web.ts — adapta os documentos legais para o PÚBLICO da web.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE ESTE ARQUIVO CONSERTA
 *
 * `src/content/legal/privacidade.ts` e `termos.ts` traziam, no campo `aviso` —
 * renderizado numa caixa logo abaixo do <h1>, em PRODUÇÃO —, o texto:
 *
 *   "Este é um MODELO … deve ser revisado e adaptado por um(a) advogado(a) ANTES
 *    DE SER PUBLICADO ou usado com clientes reais."
 *
 * E, no corpo da seção 1 da Privacidade: "Antes de publicar, complete aqui a razão
 * social, o CNPJ, o endereço…".
 *
 * Esses dois textos foram escritos como nota PARA O TIME e viraram texto PARA O
 * CLIENTE. Quem abre "Privacidade" é exatamente a pessoa decidindo se confia — e
 * lia que a empresa publicou um rascunho.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO **NÃO** FAZ
 *
 * Não afirma revisão jurídica. Ela continua NÃO tendo acontecido e continua
 * necessária. A nota interna continua verdadeira e continua onde ela é correta:
 * no JSDoc de `src/content/legal/*.ts`, lido por quem edita o documento.
 *
 * Tirar a nota da tela e agendar a revisão são coisas independentes — a primeira
 * não substitui a segunda. O que muda aqui é só a AUDIÊNCIA da nota.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A ADAPTAÇÃO MORA AQUI, EM `web/`, E NÃO NA FONTE
 *
 * `src/content/legal/*` é compartilhado com a `LegalScreen` do app Expo. Editar lá
 * muda o app junto, e o app não é escopo desta onda. Adaptando na borda da web, a
 * landing para de mostrar rascunho HOJE, sem blast radius no APK.
 *
 * Quando a fonte for corrigida (desejável), este arquivo continua correto: as
 * substituições são idempotentes e o gate abaixo é que manda.
 */
import type { LegalDoc, LegalSection } from "../../../src/content/legal/privacidade";
import {
	EMPRESA,
	emailPrivacidadePublicavel,
	enderecoEmLinha,
	identidadePublicavel,
} from "./empresa";

/**
 * Linguagem de RASCUNHO que nunca pode chegar ao visitante.
 *
 * Isto é um GATE, não um conselho: se qualquer uma destas expressões sobreviver à
 * adaptação, o BUILD MORRE (ver `adaptarParaWeb`). O modo de falha que estamos
 * comprando: alguém edita `src/content/legal/*`, reintroduz "MODELO" numa seção
 * nova, e a landing volta a anunciar que publicou um rascunho — em silêncio.
 * Com o gate, isso vira erro de build no PR.
 */
const LINGUAGEM_DE_RASCUNHO: readonly RegExp[] = [
	/\bMODELO\b/,
	/antes de (ser )?publicad/i,
	/Antes de publicar/i,
	/aconselhamento jurídico/i,
	/revisad[oa] .{0,40}advogad/i,
	/PREENCHER/,
];

/** Sentinela da frase-instrução no corpo da seção 1 da Privacidade. */
const INSTRUCAO_INTERNA_SECAO_1 = /\s*Antes de publicar, complete aqui[^]*$/;

/**
 * O aviso que o visitante DEVE ler no lugar do antigo.
 *
 * Cada afirmação aqui é verificável olhando a própria página: a data sai do
 * documento, o canal é o WhatsApp que já atende hoje (o mesmo de `index.astro` e
 * de `src/config.ts`), e "linguagem direta" o leitor confere lendo. Nada sobre
 * revisão jurídica, porque não houve.
 */
function avisoDeVigencia(doc: LegalDoc): string {
	const dpo = emailPrivacidadePublicavel();
	const canal = dpo
		? `${dpo} ou WhatsApp ${EMPRESA.whatsappLegivel}`
		: `WhatsApp ${EMPRESA.whatsappLegivel}`;
	return (
		`Documento vigente desde ${doc.atualizadoEm}. ` +
		`Está escrito em linguagem direta, sem juridiquês, para você conseguir ler inteiro — ` +
		`e vale exatamente como está aqui. ` +
		`Dúvidas sobre os seus dados, ou para exercer um direito da LGPD: ${canal}.`
	);
}

/**
 * Seção 1 da Privacidade ("Quem é o controlador"): tira a instrução interna e,
 * quando a identidade jurídica existe, entrega o dado que ela pedia.
 *
 * Sem identidade preenchida, o parágrafo apenas perde a frase-instrução — e o que
 * sobra continua verdadeiro (a OLLI é a controladora; o canal do WhatsApp é real).
 * NÃO inventamos razão social nem CNPJ para tapar o buraco.
 */
function adaptarSecao(secao: LegalSection): LegalSection {
	if (!secao.paragrafos) return secao;

	const empresa = identidadePublicavel();
	const dpo = emailPrivacidadePublicavel();

	const paragrafos = secao.paragrafos.map((p) => {
		if (!INSTRUCAO_INTERNA_SECAO_1.test(p)) return p;
		const limpo = p.replace(INSTRUCAO_INTERNA_SECAO_1, "").trim();
		if (!empresa) return limpo;
		const email = dpo ? ` E-mail de privacidade: ${dpo}.` : "";
		return (
			`${limpo} O controlador é ${empresa.razaoSocial}, CNPJ ${empresa.cnpj}, ` +
			`com endereço em ${enderecoEmLinha(empresa)}.${email}`
		);
	});

	return { ...secao, paragrafos };
}

/** Toda string que o visitante vai efetivamente ler. É sobre ela que o gate roda. */
function textoVisivel(doc: LegalDoc): string[] {
	const linhas = [doc.titulo, doc.atualizadoEm, doc.aviso, ...doc.intro];
	for (const s of doc.secoes) {
		linhas.push(s.titulo);
		linhas.push(...(s.paragrafos ?? []));
		linhas.push(...(s.itens ?? []));
		for (const linha of s.tabela ?? []) {
			linhas.push(linha.dado, linha.finalidade, linha.base);
		}
	}
	return linhas;
}

/**
 * Adapta o documento e FALHA O BUILD se sobrar linguagem de rascunho.
 *
 * Roda no frontmatter da página (build time, SSG), então o erro aparece no
 * `npm run build` e no `astro check` — nunca no navegador do visitante.
 */
export function adaptarParaWeb(doc: LegalDoc): LegalDoc {
	const adaptado: LegalDoc = {
		...doc,
		aviso: avisoDeVigencia(doc),
		secoes: doc.secoes.map(adaptarSecao),
	};

	for (const linha of textoVisivel(adaptado)) {
		for (const padrao of LINGUAGEM_DE_RASCUNHO) {
			if (padrao.test(linha)) {
				throw new Error(
					`[legal-web] Linguagem de rascunho chegaria ao visitante em "${adaptado.titulo}".\n` +
						`  Padrão: ${padrao}\n` +
						`  Trecho: ${linha.slice(0, 200)}\n` +
						`  Conserte em src/content/legal/ ou ensine a adaptação em web/src/data/legal-web.ts.\n` +
						`  NÃO desligue este gate: ele existe porque este texto já foi ao ar dizendo que era um MODELO não publicável.`,
				);
			}
		}
	}

	return adaptado;
}
