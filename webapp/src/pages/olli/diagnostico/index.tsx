import { MessageSquareText, Stethoscope, TicketCheck } from "lucide-react";
import { useState } from "react";
import { useVerticaisPainel } from "@/olli/verticais";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import type { HvacCodigo } from "./hvac";
import { PorCodigo } from "./PorCodigo";
import { PorSintoma, type SementeSintoma } from "./PorSintoma";

/**
 * DIAGNÓSTICO IA — a OLLI Técnica no painel.
 *
 * Duas formas de chegar na resposta, sem nada escondido:
 *   • Por código  → consulta a base oficial HVAC (698 códigos, Supabase). Funciona
 *                   100% SEM IA: causa, ação, severidade e a fonte oficial.
 *   • Por sintoma → conversa com a OLLI no Worker de IA (JWT da sessão). Raciocina
 *                   sobre o caso e sugere os testes na ordem certa. Se a IA estiver
 *                   fora do ar, o estado é honesto e empurra de volta para o código.
 *
 * As abas se conversam: em qualquer código, "Aprofundar com a OLLI" leva o
 * contexto (marca + código) para a aba Por sintoma já com uma pergunta pronta.
 *
 * GATE POR OFÍCIO: a base é 100% HVAC — quem não é do ramo (elétrica, pintura…)
 * não tem o que fazer aqui. O item de menu já some para essas contas (ver
 * `@/olli/verticais` + `nav-data/index.ts`), mas o link direto continua
 * navegável, então a ROTA também bloqueia — em defesa, não em duplicidade.
 * Enquanto a empresa carrega, o gate fica aberto (3 estados: "não sei" nunca
 * vira "não tem"); só bloqueia depois de saber, com certeza, que o ofício é outro.
 */
export default function DiagnosticoIA() {
	const [aba, setAba] = useState("codigo");
	const [semente, setSemente] = useState<SementeSintoma | undefined>();
	const { carregando, mostraVertical } = useVerticaisPainel();

	function aprofundar(c: HvacCodigo) {
		const detalhe = c.falha ? ` (${c.falha})` : "";
		setSemente({
			marca: c.marca,
			codigo: c.codigo,
			pergunta: `O que costuma causar o código ${c.codigo || ""}${detalhe} nesse aparelho e como eu testo na ordem certa antes de trocar peça?`,
			nonce: Date.now(),
		});
		setAba("sintoma");
	}

	if (!carregando && !mostraVertical("refrigeracao")) {
		return (
			<div className="mx-auto w-full max-w-4xl p-4 md:p-6">
				<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-14 text-center">
					<div className="grid size-11 place-items-center rounded-2xl bg-muted text-text-disabled">
						<Stethoscope className="size-5" />
					</div>
					<p className="font-semibold text-text-primary">Diagnóstico IA é de climatização/refrigeração</p>
					<p className="max-w-sm text-sm text-text-secondary">
						Hoje esta ferramenta só cobre a base de ar-condicionado — ainda não há base para o seu ofício. O
						ofício da empresa se ajusta em "Meu negócio", no app do celular.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
			<header className="space-y-1.5">
				<div className="flex items-center gap-2">
					<div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
						<Stethoscope className="size-5" />
					</div>
					<h1 className="text-2xl font-bold text-text-primary">Diagnóstico IA</h1>
				</div>
				<p className="max-w-2xl text-sm text-text-secondary">
					Consulte a base oficial de códigos de erro ou descreva o sintoma e deixe a OLLI Técnica montar o
					raciocínio — sempre testando antes de condenar qualquer peça.
				</p>
			</header>

			<Tabs value={aba} onValueChange={setAba} className="gap-5">
				<TabsList className="h-10 w-full max-w-md">
					<TabsTrigger value="codigo" className="gap-1.5">
						<TicketCheck className="size-4" />
						Por código
					</TabsTrigger>
					<TabsTrigger value="sintoma" className="gap-1.5">
						<MessageSquareText className="size-4" />
						Por sintoma
					</TabsTrigger>
				</TabsList>

				<TabsContent value="codigo">
					<PorCodigo aoAprofundar={aprofundar} />
				</TabsContent>

				<TabsContent value="sintoma">
					<PorSintoma semente={semente} aoIrParaCodigo={() => setAba("codigo")} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
