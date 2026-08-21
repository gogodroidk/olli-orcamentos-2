/**
 * empresa.ts — IDENTIDADE JURÍDICA DA OLLI. Fonte única.
 *
 * Rodapé, JSON-LD (`Organization`), `llms.txt` e o adaptador dos documentos legais
 * (`legal-web.ts`) leem daqui. Endereço residencial não é dado do produto: não fica
 * armazenado neste repositório e não é renderizado no site. Quando existir um
 * endereço comercial definido para publicação, ele deve passar por revisão jurídica
 * antes de entrar nesta fonte única.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO PREENCHER (é o único arquivo que precisa ser tocado)
 *
 * Razão social e CNPJ vêm do cartão CNPJ. Os campos de endereço permanecem com o
 * marcador até existir endereço COMERCIAL aprovado para publicação; eles não
 * participam do gate nem são enviados ao visitante.
 *
 * Procure por `PREENCHER` (e só por isso) para achar o endereço comercial pendente:
 *     grep -rn "PREENCHER" web/src/data/empresa.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUE ISTO EXISTE, e não é preferência estética: o Decreto nº 7.962/2013,
 * art. 2º, I e II, obriga site que oferta contrato de consumo a exibir nome
 * empresarial, CNPJ e endereço "em local de destaque e de fácil visualização".
 * A landing vende assinatura (planos Pro e Empresa) com CTA em toda página.
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
	razaoSocial: "OLLI INTELIGENCIA DIGITAL SISTEMAS LTDA",
	nomeFantasia: "OLLI",
	cnpj: "65.361.266/0001-05",
	endereco: {
		logradouro: PREENCHER,
		bairro: PREENCHER,
		cidade: PREENCHER,
		uf: PREENCHER,
		cep: PREENCHER,
		pais: "BR",
	},
	emailContato: "contato@olliorcamentos.online",
	emailPrivacidade: "contato@olliorcamentos.online",
	// Este já existe e é real (index.astro:22 e src/config.ts do app).
	whatsapp: "5511941727487",
	whatsappLegivel: "(11) 94172-7487",
	responsavel: "Igor de Souza Aquino",
	atendimento: "Atendimento em dias úteis pelos canais informados",
};

/** Um campo está preenchido quando não é o marcador nem string vazia. */
function preenchido(valor: string): boolean {
	return valor.trim().length > 0 && valor.trim() !== PREENCHER;
}

/**
 * O GATE da identidade exibida no produto. Razão social e CNPJ precisam ser reais;
 * o endereço comercial é tratado separadamente e nunca cai para o residencial.
 *
 * Devolve `null` — e não um objeto com buracos — de propósito: quem consome é
 * obrigado pelo TypeScript a tratar o caso "ainda não temos", em vez de renderizar
 * "CNPJ: undefined". É a mesma regra do P0 desta casa: "não sei" nunca vira "não tem",
 * e muito menos vira um valor inventado na tela.
 */
export function identidadePublicavel(): Empresa | null {
	const e = EMPRESA;
	const completo = preenchido(e.razaoSocial) && preenchido(e.cnpj);
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
