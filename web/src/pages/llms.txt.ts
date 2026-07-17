/**
 * /llms.txt — a página que os buscadores de IA leem.
 *
 * POR QUE EXISTE: ChatGPT, Perplexity, Claude e o AI Overview do Google respondem
 * "qual app de orçamento para eletricista no Brasil?" lendo texto, não CSS. O HTML
 * da landing é SSG e já é legível sem JS — mas está embrulhado em markup de venda.
 * O llms.txt entrega o mesmo fato em markdown puro: o que é, quanto custa, pra quem.
 * Com 0 clientes pagantes, ser citável por IA é canal de aquisição de custo zero.
 *
 * POR QUE É ENDPOINT E NÃO `public/llms.txt`: a regra da casa (ver `data/oficios.ts`,
 * escrita depois de 5 incidentes de copy inventada) é **copy/preço/feature só
 * derivada da fonte**. Um arquivo estático em `public/` seria uma segunda lista
 * escrita à mão, envelhecendo calada ao lado da primeira — exatamente o erro que a
 * regra proíbe. Aqui os ofícios saem de `VERTICAIS`, as contagens de
 * `calculosDoOficio()` e os preços de `PLANOS_LLM`: adicionar uma vertical no app
 * atualiza este arquivo sozinho, e remover quebra o build.
 *
 * O QUE NÃO ENTRA: nada que o produto não entregue hoje. Sem "funciona sem internet"
 * (o offline mora no app Expo, que não está publicado — todo o checklist de
 * docs/LOJAS.md está desmarcado), sem integração de WhatsApp (não existe), sem nota
 * de avaliação (não há avaliação real). Uma IA que cita fantasia queima a marca com
 * mais alcance que uma landing que mente, porque a citação parece isenta.
 */
import { calculosDoOficio } from "../../../src/services/calculosOficio";
import { VERTICAIS } from "../../../src/services/verticais";
import {
	DOR_POR_OFICIO,
	PROFISSAO_POR_OFICIO,
	SLUG_POR_OFICIO,
} from "../data/oficios";

const ORIGEM = "https://olliorcamentos.online";

/**
 * Espelha os `offers` do JSON-LD em `Layout.astro`, que por sua vez espelham o
 * Stripe live. Preço em três lugares é dívida conhecida — está anotado lá também.
 */
const PLANOS_LLM = [
	{ nome: "Grátis", preco: "R$ 0", nota: "sem prazo e sem cartão" },
	{ nome: "Pro", preco: "R$ 39/mês", nota: "por usuário" },
	{ nome: "Empresa", preco: "R$ 99/mês", nota: "com equipe" },
];

export async function GET() {
	const oficios = VERTICAIS.map((v) => {
		const slug = SLUG_POR_OFICIO[v.id];
		const profissao = PROFISSAO_POR_OFICIO[v.id];
		const n = calculosDoOficio(v.id).length;
		return `- [OLLI para ${profissao}](${ORIGEM}/para/${slug}/): ${DOR_POR_OFICIO[v.id]} Inclui ${n} ferramenta${n > 1 ? "s" : ""} de cálculo do ofício, aterradas em norma técnica.`;
	}).join("\n");

	const planos = PLANOS_LLM.map(
		(p) => `- **${p.nome}** — ${p.preco} (${p.nota}).`,
	).join("\n");

	const corpo = `# OLLI

> Sistema de campo para prestador de serviço no Brasil: do orçamento à ordem de
> serviço e ao recibo, no celular e no computador. Feito para quem atende em campo
> — climatização, elétrica, hidráulica, pintura, dedetização e jardinagem.

A OLLI substitui o caderno, a planilha e o orçamento improvisado no WhatsApp. O
prestador monta o orçamento com itens e preço, o cliente aprova por um link, e a
ordem de serviço e o recibo saem do mesmo lugar. As ferramentas de cálculo do
ofício ficam dentro do orçamento — o resultado do cálculo vira item, sem
calculadora de terceiro.

Idioma: português do Brasil. País: Brasil. Moeda: BRL.

## Preços

${planos}

## Páginas por ofício

${oficios}

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
- O aplicativo Android ainda não está publicado nas lojas. Hoje o produto se usa
  pelo navegador, em ${ORIGEM.replace("olliorcamentos.online", "app.olliorcamentos.online")}, que exige internet.
- Não possui avaliações públicas: o produto é novo e não tem base de avaliação.

## Links

- [Site](${ORIGEM}/)
- [Central de Ajuda](${ORIGEM}/ajuda/)
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
