/**
 * DIÁLOGO DO CONTRATO — o prestador senta no computador e emite o contrato.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * O QUE ESTA TELA É (e o que ela não é)
 * ═══════════════════════════════════════════════════════════════════════════════
 * É o AJUSTE DESTE documento, não a configuração do padrão dele. Toda caixa já
 * chega preenchida pela colheita do app (`termosDoOrcamento`): partes, itens,
 * valor, prazo, garantia e forma de pagamento vêm do orçamento aprovado e do
 * cadastro da empresa. O prestador AJUSTA — não redigita.
 *
 * O padrão permanente ("vale pra todo contrato novo") continua morando em
 * `Empresa.contratoPadrao`, editado no celular. Escrevê-lo daqui exigiria repetir
 * o merge campo-a-campo com detecção de conflito que Meu Negócio faz — gravar por
 * cima sem isso apagaria, em silêncio, o que o dono salvou no aparelho. Então a
 * tela diz, em voz alta, que o ajuste vale só pra este documento. Nada de um
 * "Salvar" que parece guardar e não guarda.
 *
 * TRÊS ESTADOS, SEMPRE: o botão mostra "Preparando…", o sucesso abre a janela de
 * impressão e a falha VIRA TEXTO na tela. Um contrato que não sai e não avisa é
 * pior que um botão desabilitado.
 *
 * NADA AQUI PODE IMPRIMIR VAZIO. Caixa de texto apagada volta ao valor colhido;
 * número ilegível cai na cascata do app (padrão salvo → padrão do app). E o que
 * vai realmente sair está escrito embaixo do campo — o prestador vê o papel antes
 * de mandar imprimir, em vez de descobrir depois que "10%" virou outra coisa.
 */
import type { Empresa, Orcamento } from "@dominio";
import { Info, Loader2, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Campo } from "@/olli/components/campos";
import {
	AVISO_APP,
	edicaoDeTermos,
	type EdicaoContrato,
	imprimirContrato,
	resolverTermos,
	termosDoOrcamento,
	tetosDoContrato,
} from "@/olli/pdf/imprimirContrato";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { ScrollArea } from "@/ui/scroll-area";
import { Textarea } from "@/ui/textarea";

interface Props {
	/** O orçamento de onde o contrato sai. `null` mantém o diálogo fechado. */
	orcamento: Orcamento | null;
	empresa: Empresa;
	aoFechar: () => void;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Número como o brasileiro lê: 2 vira "2", 1,5 vira "1,5" — nunca "1.5". */
function numeroBR(n: number): string {
	return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default function DialogoContrato({ orcamento, empresa, aoFechar }: Props) {
	/**
	 * A colheita e os tetos são derivados do orçamento — recalculados só quando ele
	 * troca. `tetosDoContrato` pergunta ao gerador qual é o limite real de cada
	 * número (ver o porquê em imprimirContrato.ts); é ele que escreve o "máximo" das
	 * dicas, então a tela não pode discordar do papel.
	 */
	const colhidos = useMemo(
		() => (orcamento ? termosDoOrcamento(orcamento, empresa) : null),
		[orcamento, empresa],
	);
	const tetos = useMemo(
		() => (orcamento ? tetosDoContrato(orcamento, empresa) : null),
		[orcamento, empresa],
	);

	/**
	 * O formulário nasce da colheita e é RESEMEADO quando o orçamento troca.
	 * A chave do `key` no componente pai garante remontagem; este estado só
	 * precisa da semente inicial.
	 */
	const [edicao, setEdicao] = useState<EdicaoContrato>(() =>
		colhidos ? edicaoDeTermos(colhidos) : ({} as EdicaoContrato),
	);
	const [imprimindo, setImprimindo] = useState(false);
	/** Falha de geração VISÍVEL, dentro do diálogo — toast some e o dono perde. */
	const [erro, setErro] = useState<string | null>(null);

	/**
	 * O que vai sair no papel, recalculado a cada tecla. É a mesma função que
	 * alimenta o gerador na hora de imprimir — a prévia não pode ser um segundo
	 * cálculo "parecido".
	 */
	const finais = useMemo(
		() => (orcamento && colhidos ? resolverTermos(orcamento, empresa, colhidos, edicao) : null),
		[orcamento, empresa, colhidos, edicao],
	);

	if (!orcamento || !colhidos || !finais || !tetos) return null;

	const mudar = (campo: keyof EdicaoContrato) => (valor: string) =>
		setEdicao((atual) => ({ ...atual, [campo]: valor }));

	/**
	 * A dica de um campo NUMÉRICO. Só fala quando o que sai difere do que está
	 * digitado — avisar "vai sair 2%" embaixo de um campo com "2" é ruído.
	 */
	function dicaNumero(digitado: string, efetivo: number, teto: number, unidade: string): string {
		const limite = `Máximo ${numeroBR(teto)}${unidade}.`;
		const cru = digitado.trim().replace(",", ".");
		const n = cru === "" ? Number.NaN : Number(cru);
		if (!Number.isFinite(n)) {
			return `${limite} Em branco sai ${numeroBR(efetivo)}${unidade} — o seu padrão.`;
		}
		if (n !== efetivo) {
			return `${limite} Vai sair ${numeroBR(efetivo)}${unidade}.`;
		}
		return limite;
	}

	async function gerar() {
		if (imprimindo || !orcamento || !finais) return;
		setImprimindo(true);
		setErro(null);
		try {
			await imprimirContrato(orcamento, empresa, finais);
			aoFechar();
		} catch {
			// "Não consegui" NUNCA vira janela em branco nem diálogo que fecha sozinho:
			// o texto do prestador fica intacto e o motivo aparece do lado do botão.
			setErro("Não consegui gerar o contrato agora. Tente de novo — seu texto continua aqui.");
		} finally {
			setImprimindo(false);
		}
	}

	return (
		<Dialog open onOpenChange={(aberto) => !aberto && !imprimindo && aoFechar()}>
			<DialogContent className="max-h-[92vh] gap-0 p-0 sm:max-w-2xl">
				<DialogHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
					<DialogTitle>Contrato de prestação de serviço</DialogTitle>
					<DialogDescription>
						Sai do orçamento {orcamento.numero} — {orcamento.clienteNome} ·{" "}
						{BRL.format(orcamento.valorTotal)}
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[62vh] pr-3">
					<div className="space-y-5 px-6 py-5">
						{/* Honestidade jurídica: a MESMA frase do app (importada de lá, não
						    reescrita). O aviso longo vai impresso no rodapé de todo contrato. */}
						<div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-neutral p-3">
							<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-secondary" />
							<p className="text-xs leading-relaxed text-text-secondary">
								{AVISO_APP} O aviso completo vai impresso no rodapé do documento.
							</p>
						</div>

						<p className="text-xs leading-relaxed text-text-secondary">
							Já veio tudo preenchido a partir deste orçamento e do seu cadastro. O que você mudar aqui vale{" "}
							<strong className="font-semibold text-text-primary">só para este contrato</strong> — as cláusulas
							padrão de todo contrato novo você ajusta no aplicativo do celular, em “Cláusulas padrão do
							contrato”.
						</p>

						<Campo rotulo="Objeto do contrato" dica="O que será executado. Uma linha por item vira lista no papel.">
							<Textarea
								rows={3}
								value={edicao.objeto}
								onChange={(e) => mudar("objeto")(e.target.value)}
							/>
						</Campo>

						<Campo rotulo="Local da execução">
							<Input
								className="h-11"
								value={edicao.local}
								onChange={(e) => mudar("local")(e.target.value)}
							/>
						</Campo>

						<Campo rotulo="Prazo de execução">
							<Textarea rows={2} value={edicao.prazo} onChange={(e) => mudar("prazo")(e.target.value)} />
						</Campo>

						<Campo rotulo="Forma de pagamento">
							<Textarea
								rows={2}
								value={edicao.pagamento}
								onChange={(e) => mudar("pagamento")(e.target.value)}
							/>
						</Campo>

						<Campo
							rotulo="Garantia"
							dica="Garantia contratual. A garantia legal do CDC vale sempre e não é reduzida por este texto."
						>
							<Textarea
								rows={2}
								value={edicao.garantia}
								onChange={(e) => mudar("garantia")(e.target.value)}
							/>
						</Campo>

						<div className="grid gap-4 sm:grid-cols-3">
							<Campo
								rotulo="Multa por atraso (%)"
								dica={dicaNumero(
									edicao.multaAtrasoPercent,
									finais.multaAtrasoPercent,
									tetos.multaAtrasoPercent,
									"%",
								)}
							>
								<Input
									className="h-11"
									inputMode="decimal"
									value={edicao.multaAtrasoPercent}
									onChange={(e) => mudar("multaAtrasoPercent")(e.target.value)}
								/>
							</Campo>

							<Campo
								rotulo="Juros ao mês (%)"
								dica={dicaNumero(edicao.jurosMesPercent, finais.jurosMesPercent, tetos.jurosMesPercent, "%")}
							>
								<Input
									className="h-11"
									inputMode="decimal"
									value={edicao.jurosMesPercent}
									onChange={(e) => mudar("jurosMesPercent")(e.target.value)}
								/>
							</Campo>

							<Campo
								rotulo="Aviso prévio (dias)"
								dica={dicaNumero(
									edicao.avisoPrevioDias,
									finais.avisoPrevioDias,
									tetos.avisoPrevioDias,
									" dias",
								)}
							>
								<Input
									className="h-11"
									inputMode="numeric"
									value={edicao.avisoPrevioDias}
									onChange={(e) => mudar("avisoPrevioDias")(e.target.value)}
								/>
							</Campo>
						</div>

						<Campo rotulo="Foro">
							<Input className="h-11" value={edicao.foro} onChange={(e) => mudar("foro")(e.target.value)} />
						</Campo>

						<Campo rotulo="Obrigações da CONTRATADA (você)" dica="Uma obrigação por linha.">
							<Textarea
								rows={5}
								value={edicao.obrigacoesContratada}
								onChange={(e) => mudar("obrigacoesContratada")(e.target.value)}
							/>
						</Campo>

						<Campo rotulo="Obrigações do CONTRATANTE (cliente)" dica="Uma obrigação por linha.">
							<Textarea
								rows={5}
								value={edicao.obrigacoesContratante}
								onChange={(e) => mudar("obrigacoesContratante")(e.target.value)}
							/>
						</Campo>

						<Campo
							rotulo="Cláusulas complementares"
							dica="Opcional. Em branco, a cláusula não aparece no documento."
						>
							<Textarea
								rows={3}
								value={edicao.clausulasExtras}
								onChange={(e) => mudar("clausulasExtras")(e.target.value)}
							/>
						</Campo>
					</div>
				</ScrollArea>

				<DialogFooter className="flex-col items-stretch gap-3 border-t border-border px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
					{erro ? (
						<p role="alert" className="text-sm font-medium text-error-dark dark:text-error">
							{erro}
						</p>
					) : (
						<span className="hidden text-xs text-text-secondary sm:block">
							Abre a janela de impressão — escolha “Salvar como PDF”.
						</span>
					)}
					<div className="flex justify-end gap-2">
						<Button variant="outline" className="h-11" onClick={aoFechar} disabled={imprimindo}>
							Cancelar
						</Button>
						<Button className="h-11" onClick={gerar} disabled={imprimindo}>
							{imprimindo ? (
								<Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
							) : (
								<Printer aria-hidden="true" className="mr-2 size-4" />
							)}
							{imprimindo ? "Preparando…" : "Gerar e imprimir"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
