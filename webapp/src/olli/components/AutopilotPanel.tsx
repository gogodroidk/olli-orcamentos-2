import { FileSearch, FileText, Loader2, Paperclip, RotateCcw, Sparkles, Upload, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { prepararPreviaAutopilot, type AutopilotPreview, type IntencaoAutopilot } from "@/olli/iaAutopilot";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Textarea } from "@/ui/textarea";

type Props = {
	/** Leva os itens reconhecidos ao editor existente sem salvar o orçamento. */
	onUsarNoOrcamento?: (preview: AutopilotPreview) => void;
	/** Confirma somente novos itens de catálogo pela camada de escrita da página. */
	onConfirmarCatalogo?: (preview: AutopilotPreview) => Promise<void>;
	/** Referências normalizadas do catálogo do tenant; nunca inclui histórico bruto. */
	referencias?: Array<{ tipo: "produto" | "servico"; nome: string; descricao?: string; unidade?: string; preco?: number; custo?: number }>;
	compact?: boolean;
};

const INTENCOES: Array<{ value: IntencaoAutopilot; label: string }> = [
	{ value: "cadastro", label: "Cadastrar clientes, produtos e serviços" },
	{ value: "orcamento", label: "Montar um orçamento rascunho" },
	{ value: "documento", label: "Entender ou preparar um documento" },
	{ value: "conversa", label: "Organizar uma conversa de atendimento" },
];

function porcentagem(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function tipoArquivo(file: File | null): string {
	if (!file) return "Nenhuma fonte selecionada";
	return `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
}

export function AutopilotPanel({ onUsarNoOrcamento, onConfirmarCatalogo, referencias = [], compact = false }: Props) {
	const arquivoRef = useRef<HTMLInputElement>(null);
	const [aberto, setAberto] = useState(!compact);
	const [arquivo, setArquivo] = useState<File | null>(null);
	const [texto, setTexto] = useState("");
	const [pedido, setPedido] = useState("");
	const [intencao, setIntencao] = useState<IntencaoAutopilot>("cadastro");
	const [preview, setPreview] = useState<AutopilotPreview | null>(null);
	const [carregando, setCarregando] = useState(false);
	const [confirmando, setConfirmando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	const candidatosCatalogo = (preview?.candidatos.produtos.length ?? 0) + (preview?.candidatos.servicos.length ?? 0);
	const itensOrcamento = preview?.candidatos.orcamento.itens.length ?? 0;

	async function analisar() {
		if (!arquivo && !texto.trim()) {
			setErro("Cole uma conversa ou selecione um arquivo antes de analisar.");
			return;
		}
		setCarregando(true);
		setErro(null);
		setPreview(null);
		try {
			setPreview(await prepararPreviaAutopilot({ arquivo, texto, pedidoOriginal: pedido, intencao, referencias }));
			toast.success("Prévia pronta. Revise os campos antes de levar qualquer coisa para o OLLI.");
		} catch (error) {
			setErro(error instanceof Error ? error.message : "Não consegui preparar a prévia.");
		} finally {
			setCarregando(false);
		}
	}

	async function confirmarCatalogo() {
		if (!preview || !onConfirmarCatalogo || !candidatosCatalogo || confirmando) return;
		setConfirmando(true);
		setErro(null);
		try {
			await onConfirmarCatalogo(preview);
			toast.success("Cadastro confirmado. Itens duplicados ou sem evidência continuam preservados para revisão.");
		} catch (error) {
			setErro(error instanceof Error ? error.message : "Não consegui confirmar o cadastro.");
		} finally {
			setConfirmando(false);
		}
	}

	function limpar() {
		setArquivo(null);
		setTexto("");
		setPedido("");
		setPreview(null);
		setErro(null);
		if (arquivoRef.current) arquivoRef.current.value = "";
	}

	return (
		<Card className="border-primary/20 bg-primary/[0.03]">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><WandSparkles className="size-5" /></div>
						<div>
							<CardTitle className="flex items-center gap-2 text-base">Autopilot da OLLI <Badge variant="info" className="rounded-full text-[10px]">prévia segura</Badge></CardTitle>
							<CardDescription className="mt-1">Cole uma conversa ou anexe um arquivo. A OLLI usa {referencias.length ? `${referencias.length} referência${referencias.length === 1 ? "" : "s"} do seu catálogo` : "seu catálogo como referência privada"} e só grava depois da sua confirmação.</CardDescription>
						</div>
					</div>
					{compact && <Button type="button" variant="ghost" size="sm" onClick={() => setAberto((value) => !value)} aria-expanded={aberto}>{aberto ? "Fechar" : "Abrir"}</Button>}
				</div>
			</CardHeader>

			{aberto && <CardContent className="space-y-4">
				<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
					<div className="space-y-2">
						<label htmlFor="autopilot-fonte" className="text-sm font-medium text-text-primary">Conversa ou contexto</label>
						<Textarea id="autopilot-fonte" value={texto} onChange={(event) => setTexto(event.target.value.slice(0, 20_000))} placeholder="Cole a conversa exportada do WhatsApp/Instagram ou descreva o pedido…" className="min-h-28 resize-y" disabled={carregando} />
						<p className="text-[11px] text-text-disabled">O conteúdo é tratado como dado não confiável e nunca vira comando para a IA.</p>
					</div>
					<div className="space-y-3">
						<label htmlFor="autopilot-intencao" className="text-sm font-medium text-text-primary">O que você quer preparar?</label>
						<select id="autopilot-intencao" value={intencao} onChange={(event) => setIntencao(event.target.value as IntencaoAutopilot)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={carregando}>
							{INTENCOES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
						</select>
						<label htmlFor="autopilot-pedido" className="text-sm font-medium text-text-primary">Instrução curta (opcional)</label>
						<input id="autopilot-pedido" value={pedido} onChange={(event) => setPedido(event.target.value.slice(0, 2_000))} placeholder="Ex.: use minha margem padrão" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={carregando} />
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-background/60 p-3">
					<input ref={arquivoRef} id="autopilot-arquivo" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv,application/json" className="sr-only" onChange={(event) => { setArquivo(event.target.files?.[0] ?? null); setErro(null); setPreview(null); }} disabled={carregando} />
					<Button type="button" variant="outline" className="gap-2" onClick={() => arquivoRef.current?.click()} disabled={carregando}><Upload className="size-4" />Escolher arquivo</Button>
					{arquivo ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary"><Paperclip className="size-3.5 shrink-0" /><span className="truncate">{tipoArquivo(arquivo)}</span></span> : <span className="text-xs text-text-disabled">PDF, imagem, TXT, CSV ou JSON · até 4 MB</span>}
					{arquivo && <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => { setArquivo(null); if (arquivoRef.current) arquivoRef.current.value = ""; }} disabled={carregando}>Remover</Button>}
				</div>

				<div className="flex flex-wrap justify-end gap-2">
					{(arquivo || texto || preview) && <Button type="button" variant="ghost" className="gap-2" onClick={limpar} disabled={carregando || confirmando}><RotateCcw className="size-4" />Limpar</Button>}
					<Button type="button" className="gap-2" onClick={() => { void analisar(); }} disabled={carregando || (!arquivo && !texto.trim())}>{carregando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{carregando ? "Analisando…" : "Preparar prévia"}</Button>
				</div>

				{erro && <div role="alert" className="rounded-xl border border-error/30 bg-error/5 px-3 py-2.5 text-sm text-error">{erro}</div>}

				{preview && <div className="space-y-4" aria-live="polite">
					<div className="flex flex-wrap items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-text-primary">
						<FileSearch className="size-4 text-success" />
						<span className="font-medium">Prévia aguardando confirmação</span>
						<Badge variant="secondary" className="ml-auto max-w-full truncate">{preview.fonte.nome} · {preview.fonte.parser}</Badge>
					</div>
					<div className="grid gap-2 sm:grid-cols-4">
						{[["Clientes", preview.candidatos.clientes.length], ["Produtos", preview.candidatos.produtos.length], ["Serviços", preview.candidatos.servicos.length], ["Itens de orçamento", itensOrcamento]].map(([label, count]) => <div key={String(label)} className="rounded-lg border border-border bg-background px-3 py-2"><p className="text-[11px] text-text-secondary">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">{count}</p></div>)}
					</div>

					{preview.candidatos.clientes.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold text-text-primary">Clientes sugeridos</h3>{preview.candidatos.clientes.slice(0, 6).map((item) => <div key={`${item.nome}-${item.telefone}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"><span className="font-medium text-text-primary">{item.nome}</span>{item.telefone && <span className="text-text-secondary">{item.telefone}</span>}<Badge variant={item.confianca >= 0.8 ? "success" : item.confianca >= 0.5 ? "warning" : "secondary"} className="ml-auto">{porcentagem(item.confianca)} · {item.evidencia || "sem evidência"}</Badge></div>)}</section>}

					{candidatosCatalogo > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold text-text-primary">Catálogo sugerido</h3>{[...preview.candidatos.produtos.map((item) => ({ ...item, tipo: "Produto" })), ...preview.candidatos.servicos.map((item) => ({ ...item, tipo: "Serviço" }))].slice(0, 12).map((item) => <div key={`${item.tipo}-${item.nome}-${item.modelo}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{item.tipo}</span><span className="font-medium text-text-primary">{item.nome}</span><span className="text-text-secondary">R$ {item.precoSugerido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} sugerido</span><Badge variant={item.confianca >= 0.8 ? "success" : item.confianca >= 0.5 ? "warning" : "secondary"} className="ml-auto">{porcentagem(item.confianca)}</Badge></div>)}</section>}

					{itensOrcamento > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold text-text-primary">Orçamento rascunho</h3><div className="rounded-xl border border-border bg-background p-3"><p className="text-sm font-medium text-text-primary">{preview.candidatos.orcamento.clienteNome || "Cliente não identificado"}</p>{preview.candidatos.orcamento.itens.slice(0, 8).map((item) => <div key={`${item.tipo}-${item.nome}-${item.evidencia}`} className="mt-2 flex flex-wrap items-center gap-2 text-sm"><FileText className="size-3.5 text-primary" /><span className="text-text-primary">{item.quantidade} {item.unidade} · {item.nome}</span><span className="text-text-secondary">R$ {item.precoSugerido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} sugerido</span></div>)}</div></section>}

					{preview.candidatos.documentos.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold text-text-primary">Documentos reconhecidos</h3>{preview.candidatos.documentos.map((item) => <div key={`${item.tipo}-${item.titulo}`} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><div className="flex items-center gap-2"><FileText className="size-4 text-primary" /><span className="font-medium text-text-primary">{item.titulo}</span><Badge variant="secondary" className="ml-auto">{porcentagem(item.confianca)}</Badge></div>{item.texto && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-text-secondary">{item.texto}</p>}</div>)}</section>}

					{preview.candidatos.avisos.length > 0 && <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-text-secondary"><p className="font-semibold text-text-primary">Antes de confirmar</p><ul className="mt-1 list-disc space-y-1 pl-4">{preview.candidatos.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}</ul></div>}

					<div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
						{onUsarNoOrcamento && itensOrcamento > 0 && <Button type="button" variant="outline" onClick={() => onUsarNoOrcamento(preview)}>Abrir orçamento rascunho</Button>}
						{onConfirmarCatalogo && candidatosCatalogo > 0 && <Button type="button" onClick={() => { void confirmarCatalogo(); }} disabled={confirmando}>{confirmando ? <Loader2 className="size-4 animate-spin" /> : null}Confirmar cadastro ({candidatosCatalogo})</Button>}
					</div>
					<p className="text-right text-[11px] text-text-disabled">Nada desta prévia é salvo sem um botão explícito. Preços continuam editáveis e sujeitos à conferência.</p>
				</div>}
			</CardContent>}
		</Card>
	);
}
