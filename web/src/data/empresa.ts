/**
 * empresa.ts — IDENTIDADE JURÍDICA DA OLLI. Fonte única.
 *
 * Rodapé, JSON-LD (`Organization`), `llms.txt` e o adaptador dos documentos legais
 * (`legal-web.ts`) leem daqui. Não repita nenhum destes valores à mão em lugar
 * nenhum: dado jurídico duplicado diverge na primeira atualização, e a regra desta
 * casa é copy derivada da fonte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO PREENCHER (é o único arquivo que precisa ser tocado)
 *
 * Troque cada `PREENCHER` pelo valor do cartão CNPJ. Enquanto QUALQUER campo
 * obrigatório continuar com o marcador, `identidadePublicavel()` devolve `null` e
 * NADA institucional é renderizado — nem no rodapé, nem no schema, nem no llms.txt.
 * Isto é código, não disciplina: nenhum dado falso pode ir ao ar por esquecimento.
 *
 * Procure por `PREENCHER` (e só por isso) para achar tudo o que falta:
 *     grep -rn "PREENCHER" web/src/data/empresa.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUE ISTO EXISTE, e não é preferência estética: o Decreto nº 7.962/2013,
 * art. 2º, I e II, obriga site que oferta contrato de consumo a exibir nome
 * empresarial, CNPJ e endereço "em local de destaque e de fácil visualização".
 * A landing vende assinatura (R$ 39 e R$ 99/mês) com CTA em toda página.
 */

/**
 * O marcador. Um só, literal, fácil de achar e de trocar.
 * NÃO troque a string do marcador — troque os VALORES que o usam.
 */
export const PREENCHER = "PREENCHER" as const;

export interface EnderecoEmpresa {
	logradouro: string;
	bairro: string;
	cidade: string;
	uf: string;
	cep: string;
	/** ISO 3166-1 alpha-2. Fixo: a OLLI é brasileira. */
	pais: "BR";
}

export interface Empresa {
	razaoSocial: string;
	nomeFantasia: string;
	/** CNPJ formatado, como sai do cartão: 00.000.000/0001-00 */
	cnpj: string;
	endereco: EnderecoEmpresa;
	emailContato: string;
	emailPrivacidade: string;
	/** Só dígitos, com DDI — é o que o wa.me consome. */
	whatsapp: string;
	/** WhatsApp formatado para leitura humana. */
	whatsappLegivel: string;
	/** Nome de quem responde o suporte. Vira "Quem responde é o {nome}". */
	responsavel: string;
	/** Horário e prazo REAIS de atendimento. Só publique o que for cumprir. */
	atendimento: string;
}

export const EMPRESA: Empresa = {
	razaoSocial: PREENCHER, //          ← DONO: razão social exata do cartão CNPJ
	nomeFantasia: "OLLI",
	cnpj: PREENCHER, //                 ← DONO: CNPJ formatado (00.000.000/0001-00)
	endereco: {
		logradouro: PREENCHER, //         ← DONO: rua e número
		bairro: PREENCHER, //             ← DONO
		cidade: PREENCHER, //             ← DONO
		uf: PREENCHER, //                 ← DONO: sigla de 2 letras
		cep: PREENCHER, //                ← DONO: 00000-000
		pais: "BR",
	},
	emailContato: PREENCHER, //         ← DONO: criar a caixa antes de publicar
	emailPrivacidade: PREENCHER, //     ← DONO: canal do Encarregado/DPO (LGPD)
	// Este já existe e é real (index.astro:22 e src/config.ts do app).
	whatsapp: "5511941727487",
	whatsappLegivel: "(11) 94172-7487",
	responsavel: PREENCHER, //          ← DONO: quem assina e responde
	atendimento: PREENCHER, //          ← DONO: ex. "Segunda a sexta, 8h–18h"
};

/** Um campo está preenchido quando não é o marcador nem string vazia. */
function preenchido(valor: string): boolean {
	return valor.trim().length > 0 && valor.trim() !== PREENCHER;
}

/**
 * O GATE. Devolve a identidade só quando os campos que a LEI exige estão todos
 * preenchidos — razão social, CNPJ e endereço completo (Decreto 7.962/2013, II).
 *
 * Devolve `null` — e não um objeto com buracos — de propósito: quem consome é
 * obrigado pelo TypeScript a tratar o caso "ainda não temos", em vez de renderizar
 * "CNPJ: undefined". É a mesma regra do P0 desta casa: "não sei" nunca vira "não tem",
 * e muito menos vira um valor inventado na tela.
 */
export function identidadePublicavel(): Empresa | null {
	const e = EMPRESA;
	const completo =
		preenchido(e.razaoSocial) &&
		preenchido(e.cnpj) &&
		preenchido(e.endereco.logradouro) &&
		preenchido(e.endereco.bairro) &&
		preenchido(e.endereco.cidade) &&
		preenchido(e.endereco.uf) &&
		preenchido(e.endereco.cep);
	return completo ? e : null;
}

/** E-mail de privacidade, se existir. Independente do gate acima (a LGPD pede o canal do DPO mesmo sem o resto). */
export function emailPrivacidadePublicavel(): string | null {
	return preenchido(EMPRESA.emailPrivacidade) ? EMPRESA.emailPrivacidade : null;
}

/** E-mail de contato, se existir. */
export function emailContatoPublicavel(): string | null {
	return preenchido(EMPRESA.emailContato) ? EMPRESA.emailContato : null;
}

/** Endereço numa linha, para o rodapé. Só chame com uma identidade que passou no gate. */
export function enderecoEmLinha(e: Empresa): string {
	const { logradouro, bairro, cidade, uf, cep } = e.endereco;
	return `${logradouro} · ${bairro} · ${cidade}/${uf} · CEP ${cep}`;
}
