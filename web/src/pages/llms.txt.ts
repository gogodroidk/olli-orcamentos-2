/**
 * /llms.txt — a página que os buscadores de IA leem.
 *
 * POR QUE EXISTE: ChatGPT, Perplexity, Claude e o AI Overview do Google respondem
 * "qual app de orçamento para eletricista no Brasil?" lendo texto, não CSS. O HTML
 * da landing é SSG e já é legível sem JS — mas está embrulhado em markup de venda.
 * O llms.txt entrega o mesmo fato em markdown puro: o que é, quanto custa, pra quem.
 * Ser citável por IA é canal de aquisição de custo zero.
 *
 * POR QUE É ENDPOINT E NÃO `public/llms.txt`: a regra da casa (ver `data/oficios.ts`,
 * escrita depois de 5 incidentes de copy inventada) é **copy/preço/feature só
 * derivada da fonte**. Um arquivo estático em `public/` seria uma segunda lista
 * escrita à mão, envelhecendo calada ao lado da primeira — exatamente o erro que a
 * regra proíbe. Aqui os ofícios saem de `VERTICAIS`, as contagens de
 * `calculosDoOficio()` e os preços de `PLANOS_LLM`: adicionar uma vertical no app
 * atualiza este arquivo sozinho, e remover quebra o build.
 *
 * O QUE NÃO ENTRA: nada que o produto não entregue hoje. Offline só como o que é —
 * do app Android em teste fechado, nunca do navegador —, sem integração de WhatsApp
 * (não existe), sem nota de avaliação (não há avaliação real) e sem Pix quando o
 * worker não confirmou no build que ele está ligado (`data/pix.ts`). Uma IA que cita fantasia queima a marca com
 * mais alcance que uma landing que mente, porque a citação parece isenta.
 */
import { calculosDoOficio } from "../../../src/services/calculosOficio";
import { VERTICAIS } from "../../../src/services/verticais";
import { identidadePublicavel } from "../data/empresa";
import {
	DOR_POR_OFICIO,
	OFICIO_GERAL,
	PROFISSAO_POR_OFICIO,
	SLUG_POR_OFICIO,
} from "../data/oficios";
import {
	DESCONTO_ANUAL_ROTULO,
	PRECO_EMPRESA,
	PRECO_PRO,
	reais,
} from "../data/planos";
import { PIX_PLANO_LIGADO } from "../data/pix";
import { FRASE_GRATIS, GRATIS_CONDICAO } from "../data/recursos";
import { TRIAL_PRO_DIAS } from "../../../src/services/limitesComerciais";
import { postsPublicados } from "./blog/_dados";

const ORIGEM = "https://olliorcamentos.online";

/**
 * DERIVADO de `data/planos.ts` (o espelho do Stripe live) — a mesma fonte do
 * JSON-LD do `Layout.astro` e dos cartões da tela. A antiga "dívida de preço em
 * três lugares" foi paga: o número mora num lugar só e todo o resto importa dele.
 */
const PLANOS_LLM = [
	{ nome: "Grátis", preco: reais(0), nota: `${GRATIS_CONDICAO}, com ${FRASE_GRATIS}` },
	{
		nome: "Pro",
		preco: `${reais(PRECO_PRO.mensalCentavos)}/mês`,
		nota: `por usuário; no anual ${reais(PRECO_PRO.anualPorMesCentavos)}/mês (${reais(PRECO_PRO.anualCentavos)}/ano, ${DESCONTO_ANUAL_ROTULO} de desconto)`,
	},
	{
		nome: "Empresa",
		preco: `${reais(PRECO_EMPRESA.mensalCentavos)}/mês`,
		nota: `com equipe; no anual ${reais(PRECO_EMPRESA.anualPorMesCentavos)}/mês (${reais(PRECO_EMPRESA.anualCentavos)}/ano, ${DESCONTO_ANUAL_ROTULO} de desconto)`,
	},
];

/**
 * O 12× com a VERDADE, para a IA não citar "12× sem juros" como se fosse desconto.
 * É o valor CHEIO do ano parcelado (só o Pro tem produto avulso na Stripe), mais
 * caro que o anual à vista. Ver o ⚠ no cabeçalho de `data/planos.ts`.
 */
const doze_parcelado = PRECO_PRO.parceladoCentavos;
const doze_parcela = PRECO_PRO.parcelaCentavos;
const NOTA_DOZE =
	doze_parcelado !== null && doze_parcela !== null
		? `O Pro pode ser parcelado em 12× de ${reais(doze_parcela)} no cartão, mas isso soma ${reais(doze_parcelado)} — ${reais(doze_parcelado - PRECO_PRO.anualCentavos)} a mais que o anual à vista. O 12× é comodidade de fluxo de caixa, não desconto.`
		: "";

export async function GET() {
	// Guias do blog: só os publicados (o mesmo filtro `!rascunho` do site), com a
	// descrição do próprio frontmatter. Rascunho não vaza para a IA.
	const guias = (await postsPublicados())
		.map((p) => `- [${p.data.titulo}](${ORIGEM}/blog/${p.id}/): ${p.data.descricao}`)
		.join("\n");
	const oficios = [...VERTICAIS, { ...OFICIO_GERAL, cnaes: [], ferramentas: [] }].map((v) => {
		const slug = SLUG_POR_OFICIO[v.id];
		const profissao = PROFISSAO_POR_OFICIO[v.id];
		const n = calculosDoOficio(v.id).length;
		// Sem calculadora (o "qualquer serviço"), a linha não fala de calculadora.
		const calculo =
			n > 0
				? ` Inclui ${n} ferramenta${n > 1 ? "s" : ""} de cálculo do ofício, com a norma ou a fórmula daquele ofício.`
				: "";
		const nomes = calculosDoOficio(v.id).map((c) => c.nome).join("; ");
		const lista = nomes ? ` Ferramentas: ${nomes}.` : "";
		return `- [OLLI para ${profissao}](${ORIGEM}/para/${slug}/): ${DOR_POR_OFICIO[v.id]}${calculo}${lista}`;
	}).join("\n");

	const planos = PLANOS_LLM.map(
		(p) => `- **${p.nome}** — ${p.preco} (${p.nota}).`,
	).join("\n");

	const pagamento = PIX_PLANO_LIGADO
		? "Formas de pagamento dos planos pagos: cartão (assinatura mensal ou anual, que renova até o cancelamento) ou Pix, pelo mesmo preço, por 1 mês ou 1 ano, sem renovação automática. A contratação é feita pelo navegador."
		: "Os planos pagos são contratados no cartão, pelo navegador, em assinatura mensal ou anual que renova até o cancelamento.";

	/**
	 * Identidade jurídica, para a IA citar a ENTIDADE certa e não "um app chamado
	 * OLLI". Mesmo gate do rodapé: sem os dados preenchidos em data/empresa.ts, a
	 * seção inteira não existe — buscador de IA repete o que lê, e um CNPJ
	 * inventado viraria citação inventada com cara de fonte isenta.
	 */
	const empresa = identidadePublicavel();
	const quemSomos = empresa
		? `\n## Quem opera a OLLI\n\n` +
			`- Razão social: ${empresa.razaoSocial}\n` +
			`- CNPJ: ${empresa.cnpj}\n`
		: "";

	const corpo = `# OLLI

> Plataforma de orçamentos para qualquer negócio de serviço no Brasil: do orçamento à ordem de
> serviço e ao recibo, no celular e no computador. Feito para quem atende em campo
> — climatização, elétrica, hidráulica, pintura, dedetização e jardinagem.

A OLLI substitui o caderno, a planilha e o orçamento improvisado no WhatsApp. O
prestador monta o orçamento com itens e preço, o cliente aprova por um link, e a
ordem de serviço e o recibo saem do mesmo lugar. As ferramentas de cálculo do
ofício ficam dentro do orçamento — o resultado do cálculo vira item, sem
calculadora de terceiro.

Idioma: português do Brasil. País: Brasil. Moeda: BRL.
${quemSomos}
## Preços

${planos}

O plano anual sai mais barato que o mensal. O Grátis é ${GRATIS_CONDICAO}; depois do primeiro envio, o dono pode ativar um teste Pro opcional de ${TRIAL_PRO_DIAS} dias, sem cartão, sem cobrança automática e sem apagar dados ao terminar. ${NOTA_DOZE}
${pagamento}
Comparativo completo dos planos: ${ORIGEM}/planos/

## Páginas por ofício

${oficios}

## Guias práticos (blog)

${guias}

Texto completo dos guias, em um arquivo só: ${ORIGEM}/llms-full.txt

## O que a OLLI faz

- Orçamento com itens, fotos, desconto e link de aprovação para o cliente.
- Ordem de serviço e recibo derivados do mesmo orçamento.
- Diagnóstico com IA por código de erro e por sintoma (climatização).
- PMOC e etiqueta QR de equipamento (climatização); certificado ANVISA (dedetização).
- Agenda, catálogo de produtos e serviços, cadastro de clientes e de equipamentos.
- Equipe com convite por link (plano Empresa).

## O que a OLLI NÃO faz (para não ser citada errado)

- Não lê nem importa áudio do WhatsApp. Não há integração com o WhatsApp. Quem ouve
  o áudio do cliente é o prestador; a OLLI entra na hora de montar o orçamento.
- Não emite nota fiscal.
- O aplicativo Android está em teste fechado na Google Play, restrito a testadores
  selecionados, e não há app para iPhone. Hoje o produto se usa pelo navegador, em
  ${ORIGEM.replace("olliorcamentos.online", "app.olliorcamentos.online")}, que exige internet. O uso sem
  internet (dados no aparelho, sincronizados quando a rede volta) é só do app Android.
- Não possui avaliações públicas: o produto é novo e não tem base de avaliação.

## Links

- [Site](${ORIGEM}/)
- [Planos e preços](${ORIGEM}/planos/)
- [OLLI por profissão](${ORIGEM}/para/)
- [Blog](${ORIGEM}/blog/)
- [llms-full.txt (guias completos)](${ORIGEM}/llms-full.txt)
- [Central de Ajuda](${ORIGEM}/ajuda/)
- [Central de Ajuda para assistentes](${ORIGEM}/ajuda/llms.txt)
- [Manifesto público para agentes](${ORIGEM}/agent-manifest.json)
- [Termos de Uso](${ORIGEM}/legal/termos/)
- [Política de Privacidade](${ORIGEM}/legal/privacidade/)
`;

	return new Response(corpo, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
