/**
 * CENTRAL DE DOCUMENTOS — visão web da biblioteca versionada.
 *
 * O painel não reconstrói PDFs nem inventa status: lê o registro persistido que
 * o app também sincroniza. O blob `dados` fica fora da lista para não carregar
 * snapshots grandes sem necessidade; a origem continua apontando para o fluxo
 * oficial de edição/geração.
 */
import { Archive, ExternalLink, FileCheck2, FileText, Inbox, Loader2, Lock, Pencil, Plus, Printer, RotateCw, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOlliList } from "@/olli/data";
import { buscarDocumentoWeb, criarDocumentoManual, editarDocumentoWeb, type DocumentoWebEditavel, type TipoDocumentoWeb } from "@/olli/documentos";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";
import { imprimirDocumentoManual } from "@/olli/pdf/imprimirDocumento";
import { CATALOGO_DOCUMENTOS } from "@/olli/catalogoDocumentos";
import { toast } from "sonner";
import { NavLink } from "react-router";

type StatusDocumento = "rascunho" | "pronto" | "enviado" | "assinado" | "arquivado";
type TipoDocumento = "orcamento" | "contrato" | "garantia" | "conclusao" | "recibo" | "ordem_servico" | "pmoc" | "laudo" | "checklist" | "certificado";

interface LinhaDocumento {
	id: string;
	tipo: TipoDocumento | string;
	status: StatusDocumento | string;
	titulo: string;
	cliente_nome: string | null;
	origem_tipo: string;
	origem_numero: string | null;
	versao_atual: number | null;
	arquivo_uri: string | null;
	arquivo_chave: string | null;
	atualizado_em: string;
}

const STATUS: Array<{ valor: StatusDocumento | "todos"; label: string }> = [
	{ valor: "todos", label: "Todos os estados" },
	{ valor: "rascunho", label: "Rascunho" },
	{ valor: "pronto", label: "Pronto" },
	{ valor: "enviado", label: "Enviado" },
	{ valor: "assinado", label: "Assinado" },
	{ valor: "arquivado", label: "Arquivado" },
];

const TIPOS: Record<string, string> = {
	orcamento: "Orçamento",
	contrato: "Contrato",
	garantia: "Garantia",
	conclusao: "Conclusão",
	recibo: "Recibo",
	ordem_servico: "OS",
	pmoc: "PMOC",
	laudo: "Laudo",
	checklist: "Checklist",
	certificado: "Certificado",
};

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS.filter((s) => s.valor !== "todos").map((s) => [s.valor, s.label]));
const MAX_EDITOR_CHARS = 200_000;

type BlocoEditor = { id: string; tipo: "titulo" | "paragrafo"; texto: string };

function blocosDoEditor(editor: DocumentoWebEditavel & { texto: string }): BlocoEditor[] {
	const blocos = editor.dados.blocos;
	if (Array.isArray(blocos)) {
		const normalizados = blocos.filter((bloco): bloco is Record<string, unknown> => Boolean(bloco) && typeof bloco === "object").map((bloco, index) => ({
			id: typeof bloco.id === "string" ? bloco.id : `bloco-${index + 1}`,
			tipo: bloco.tipo === "titulo" ? "titulo" as const : "paragrafo" as const,
			texto: typeof bloco.texto === "string" ? bloco.texto : "",
		}));
		if (normalizados.length) return normalizados;
	}
	return [{ id: "bloco-1", tipo: "paragrafo", texto: editor.texto }];
}

function dataLegivel(valor: string): string {
	const data = new Date(valor);
	return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}

function statusVariant(status: string): "default" | "secondary" | "success" | "warning" | "error" {
	if (status === "assinado") return "success";
	if (status === "enviado") return "default";
	if (status === "pronto") return "secondary";
	if (status === "arquivado") return "warning";
	return "secondary";
}

export default function DocumentosPage() {
	const { data, isLoading, isError, error, refetch, isFetching } = useOlliList<LinhaDocumento>("documentos", {
		orderBy: "atualizado_em",
		ascending: false,
	});
	const [busca, setBusca] = useState("");
	const [status, setStatus] = useState<StatusDocumento | "todos">("todos");
	const [tipo, setTipo] = useState("todos");
	const [editor, setEditor] = useState<(DocumentoWebEditavel & { texto: string }) | null>(null);
	const [abrindoEditor, setAbrindoEditor] = useState(false);
	const [salvandoEditor, setSalvandoEditor] = useState(false);
	const [imprimindoEditor, setImprimindoEditor] = useState(false);
	const [blocos, setBlocos] = useState<BlocoEditor[]>([]);
	const [abrindoArquivoId, setAbrindoArquivoId] = useState<string | null>(null);
	const [novoAberto, setNovoAberto] = useState(false);
	const [criandoNovo, setCriandoNovo] = useState(false);
	const [novo, setNovo] = useState<{ tipo: TipoDocumentoWeb; titulo: string; clienteId: string; cliente: string; texto: string }>({
		tipo: "contrato",
		titulo: "",
		clienteId: "",
		cliente: "",
		texto: "",
	});
	const clientesQ = useOlliList<{ id: string; nome: string }>("clientes", { orderBy: "nome", ascending: true, colunas: "id,nome", limit: 500, enabled: novoAberto });

	useEffect(() => {
		if (editor) setBlocos(blocosDoEditor(editor));
		else setBlocos([]);
	}, [editor?.id]);

	function abrirCatalogo(tipo: TipoDocumentoWeb) {
		if (tipo === "orcamento") {
			toast.info("Use o fluxo de Orçamentos para criar e revisar valores com segurança.");
			return;
		}
		setNovo((atual) => ({ ...atual, tipo, titulo: "", texto: "" }));
		setNovoAberto(true);
	}

	async function abrirArquivoProtegido(doc: LinhaDocumento) {
		const chave = doc.arquivo_chave;
		if (!chave || abrindoArquivoId) return;
		const separador = chave.indexOf("/");
		const bucket = separador > 0 ? chave.slice(0, separador) : "";
		const caminho = separador > 0 ? chave.slice(separador + 1) : "";
		if (bucket !== "olli-documentos" || !/^[0-9a-f-]{36}\/(?:pdf|anexo)\/[A-Za-z0-9._-]{1,180}$/i.test(caminho) || caminho.includes("..")) {
			toast.error("A chave deste arquivo não passou na validação de segurança.");
			return;
		}
		setAbrindoArquivoId(doc.id);
		try {
			const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 15 * 60);
			if (error || !data?.signedUrl) throw new Error("Não consegui gerar um acesso temporário ao arquivo.");
			const novaAba = window.open(data.signedUrl, "_blank", "noopener,noreferrer");
			if (!novaAba) throw new Error("O navegador bloqueou a nova aba. Permita pop-ups para abrir o PDF.");
		} catch (erro) {
			toast.error((erro as Error).message || "Não consegui abrir o arquivo protegido.");
		} finally {
			setAbrindoArquivoId(null);
		}
	}

	async function abrirEditor(doc: LinhaDocumento) {
		if (!["rascunho", "pronto"].includes(doc.status)) {
			toast.info("Documentos enviados, assinados ou arquivados ficam congelados. Abra a origem para criar uma nova revisão.");
			return;
		}
		setAbrindoEditor(true);
		try {
			const atual = await buscarDocumentoWeb(doc.id);
			const texto = typeof atual.dados.texto === "string"
				? atual.dados.texto
				: typeof atual.dados.observacoes === "string"
					? atual.dados.observacoes
					: typeof atual.dados.conteudo === "string" ? atual.dados.conteudo : "";
			setEditor({ ...atual, texto });
		} catch (erro) {
			toast.error((erro as Error).message || "Não consegui abrir o rascunho.");
		} finally {
			setAbrindoEditor(false);
		}
	}

	async function salvarEditor() {
		if (!editor || salvandoEditor) return;
		setSalvandoEditor(true);
		try {
			const texto = blocos.map((bloco) => bloco.texto.trim()).filter(Boolean).join("\n\n");
			const dados = { ...editor.dados, schemaCode: "olli.document.blocks", schemaVersion: 1, blocos, texto };
			const salvo = await editarDocumentoWeb({ id: editor.id, titulo: editor.titulo, dados });
			setEditor(null);
			await refetch();
			toast.success(`Rascunho salvo como versão ${salvo.versao}.`);
		} catch (erro) {
			toast.error((erro as Error).message || "Não consegui salvar a nova versão.");
		} finally {
			setSalvandoEditor(false);
		}
	}

	async function imprimirEditor() {
		if (!editor || imprimindoEditor) return;
		setImprimindoEditor(true);
		try {
			await imprimirDocumentoManual({
				titulo: editor.titulo,
				tipo: TIPOS[editor.dados.tipo as string] ?? "Documento",
				cliente: typeof editor.dados.clienteNome === "string" ? editor.dados.clienteNome : undefined,
				texto: blocos.map((bloco) => bloco.texto.trim()).filter(Boolean).join("\n\n"),
				versao: editor.versao,
			});
			toast.success("A janela de impressão foi aberta. Escolha ‘Salvar como PDF’ para guardar o arquivo.");
		} catch (erro) {
			toast.error((erro as Error).message || "Não consegui preparar o PDF. Tente novamente.");
		} finally {
			setImprimindoEditor(false);
		}
	}

	async function criarNovoDocumento() {
		if (criandoNovo || !novo.titulo.trim()) return;
		setCriandoNovo(true);
		try {
			const criado = await criarDocumentoManual({
				tipo: novo.tipo,
				titulo: novo.titulo,
				clienteNome: novo.cliente,
				clienteId: novo.clienteId || null,
				texto: novo.texto,
			});
			setNovoAberto(false);
			setNovo({ tipo: "contrato", titulo: "", clienteId: "", cliente: "", texto: "" });
			await refetch();
			toast.success(`Documento criado como rascunho (versão ${criado.versao}).`);
		} catch (erro) {
			toast.error((erro as Error).message || "Não consegui criar o documento.");
		} finally {
			setCriandoNovo(false);
		}
	}

	const documentos = useMemo(() => {
		const termo = busca.trim().toLocaleLowerCase("pt-BR");
		return (data ?? []).filter((doc) => {
			if (status !== "todos" && doc.status !== status) return false;
			if (tipo !== "todos" && doc.tipo !== tipo) return false;
			if (!termo) return true;
			return [doc.titulo, doc.cliente_nome, doc.origem_numero, doc.origem_tipo]
				.filter(Boolean)
				.join(" ")
				.toLocaleLowerCase("pt-BR")
				.includes(termo);
		});
	}, [data, busca, status, tipo]);

	const tiposPresentes = useMemo(
		() => [...new Set((data ?? []).map((doc) => doc.tipo).filter(Boolean))].sort((a, b) => (TIPOS[a] ?? a).localeCompare(TIPOS[b] ?? b, "pt-BR")),
		[data],
	);

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			<div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<FileCheck2 aria-hidden="true" className="size-6 text-primary" />
						<h1 className="text-2xl font-bold tracking-tight text-text-primary">Central de documentos</h1>
						{!isLoading && !isError && <Badge variant="default" className="rounded-full px-2.5 tabular-nums">{documentos.length}</Badge>}
					</div>
					<p className="mt-1 max-w-2xl text-sm text-text-secondary">
						Orçamentos, contratos, recibos, OS e PMOC com histórico de versões. Um documento enviado não é sobrescrito.
					</p>
				</div>
				<div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
					<Button type="button" className="h-10 shrink-0 rounded-full gap-2" onClick={() => setNovoAberto(true)}><Plus className="size-4" />Novo documento</Button>
					<Button asChild type="button" variant="outline" className="h-10 shrink-0 rounded-full"><NavLink to="/orcamentos">A partir de orçamento</NavLink></Button>
					<div className="relative min-w-0 sm:w-64">
						<Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
						<Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou número…" aria-label="Buscar documentos" className="h-10 rounded-full pl-10" />
					</div>
					<Select value={status} onValueChange={(valor) => setStatus(valor as StatusDocumento | "todos")}>
						<SelectTrigger className="h-10 min-w-44 rounded-full" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
						<SelectContent>{STATUS.map((item) => <SelectItem key={item.valor} value={item.valor}>{item.label}</SelectItem>)}</SelectContent>
					</Select>
					<Select value={tipo} onValueChange={setTipo}>
						<SelectTrigger className="h-10 min-w-36 rounded-full" aria-label="Filtrar por tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
						<SelectContent>
							<SelectItem value="todos">Todos os tipos</SelectItem>
							{tiposPresentes.map((item) => <SelectItem key={item} value={item}>{TIPOS[item] ?? item}</SelectItem>)}
						</SelectContent>
					</Select>
				</div>
			</div>
			<section aria-labelledby="catalogo-documentos" className="mb-6">
				<div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="catalogo-documentos" className="text-lg font-semibold text-text-primary">Construir um documento</h2><p className="text-sm text-text-secondary">Comece por um modelo, revise os blocos e só depois gere o arquivo.</p></div><Badge variant="secondary">{CATALOGO_DOCUMENTOS.length} modelos</Badge></div>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					{CATALOGO_DOCUMENTOS.map((item) => <Card key={item.tipo} className="gap-3 p-4 transition-colors hover:border-primary/50">
						<div className="flex items-start justify-between gap-2"><FileText aria-hidden="true" className="size-5 text-primary" />{item.status === "em_breve" && <Badge variant="warning">Em breve</Badge>}</div>
						<div><h3 className="font-semibold text-text-primary">{item.titulo}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-text-secondary">{item.descricao}</p></div>
						<Button type="button" variant="outline" className="mt-auto h-9 rounded-full text-xs" disabled={item.status === "em_breve"} onClick={() => abrirCatalogo(item.tipo)}>{item.acao}</Button>
					</Card>)}
				</div>
			</section>

			{isLoading ? (
				<Card className="flex min-h-64 items-center justify-center"><p className="text-sm text-text-secondary">Carregando sua biblioteca…</p></Card>
			) : isError ? (
				<Card className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
					<Archive aria-hidden="true" className="size-8 text-error" />
					<div><p className="font-semibold text-text-primary">Não foi possível carregar os documentos</p><p className="mt-1 text-sm text-text-secondary">{(error as Error)?.message ?? "Verifique a conexão e tente novamente."}</p></div>
					<Button type="button" onClick={() => refetch()} disabled={isFetching} className="gap-2 rounded-full"><RotateCw className={cn("size-4", isFetching && "animate-spin")} />Tentar de novo</Button>
				</Card>
			) : documentos.length === 0 ? (
				<Card className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
					<Inbox aria-hidden="true" className="size-8 text-text-disabled" />
					<p className="font-semibold text-text-primary">{busca || status !== "todos" || tipo !== "todos" ? "Nenhum documento corresponde aos filtros" : "Sua biblioteca ainda está vazia"}</p>
					<p className="max-w-md text-sm text-text-secondary">Gere um orçamento, recibo, contrato ou relatório de OS para ele aparecer aqui.</p>
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full text-sm">
							<thead><tr className="border-b border-border bg-bg-neutral/40 text-left text-[11px] uppercase tracking-wider text-text-secondary">
								<th className="px-4 py-3 font-semibold">Documento</th><th className="px-4 py-3 font-semibold">Cliente</th><th className="px-4 py-3 font-semibold">Origem</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Atualizado</th><th className="px-4 py-3 text-right font-semibold">Arquivo</th>
							</tr></thead>
							<tbody>{documentos.map((doc) => <tr key={doc.id} className="border-b border-border/50 last:border-0 hover:bg-bg-neutral/40">
								<td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><FileText aria-hidden="true" className="size-4 shrink-0 text-primary" /><div><p className="font-semibold text-text-primary">{doc.titulo}</p><p className="mt-0.5 text-xs text-text-disabled">{TIPOS[doc.tipo] ?? doc.tipo} · v{doc.versao_atual ?? 1}</p></div></div></td>
								<td className="px-4 py-3.5 text-text-secondary">{doc.cliente_nome || "Documento técnico"}</td>
								<td className="px-4 py-3.5 text-text-secondary">{doc.origem_numero ? `${doc.origem_tipo} · ${doc.origem_numero}` : doc.origem_tipo}</td>
								<td className="px-4 py-3.5"><Badge variant={statusVariant(doc.status)}>{STATUS_LABEL[doc.status] ?? doc.status}</Badge></td>
								<td className="px-4 py-3.5 tabular-nums text-text-secondary">{dataLegivel(doc.atualizado_em)}</td>
								<td className="px-4 py-3.5 text-right"><div className="flex items-center justify-end gap-3">{["rascunho", "pronto"].includes(doc.status) && <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => { void abrirEditor(doc); }} disabled={abrindoEditor}><Pencil className="size-3.5" />Editar</Button>}{doc.arquivo_uri ? <a href={doc.arquivo_uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><ExternalLink className="size-3.5" />Abrir</a> : doc.arquivo_chave ? <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-full text-text-secondary" onClick={() => { void abrirArquivoProtegido(doc); }} disabled={abrindoArquivoId === doc.id}>{abrindoArquivoId === doc.id ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}{abrindoArquivoId === doc.id ? "Abrindo…" : "Abrir protegido"}</Button> : <span className="text-text-disabled">Não exportado</span>}</div></td>
							</tr>)}</tbody>
						</table>
					</div>
					<div className="divide-y divide-border/60 md:hidden">{documentos.map((doc) => <div key={doc.id} className="space-y-2 p-4">
						<div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2.5"><FileText className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{doc.titulo}</p><p className="mt-0.5 text-xs text-text-secondary">{doc.cliente_nome || "Documento técnico"}</p></div></div><Badge variant={statusVariant(doc.status)}>{STATUS_LABEL[doc.status] ?? doc.status}</Badge></div>
						<div className="flex items-center justify-between gap-2 pl-6 text-xs text-text-disabled"><span>{TIPOS[doc.tipo] ?? doc.tipo} · v{doc.versao_atual ?? 1} · {dataLegivel(doc.atualizado_em)}</span><div className="flex items-center gap-3">{["rascunho", "pronto"].includes(doc.status) && <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 rounded-full px-2" onClick={() => { void abrirEditor(doc); }} disabled={abrindoEditor}><Pencil className="size-3" />Editar</Button>}{doc.arquivo_uri ? <a href={doc.arquivo_uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="size-3" />Abrir PDF</a> : doc.arquivo_chave ? <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 rounded-full px-2 text-text-secondary" onClick={() => { void abrirArquivoProtegido(doc); }} disabled={abrindoArquivoId === doc.id}>{abrindoArquivoId === doc.id ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}{abrindoArquivoId === doc.id ? "Abrindo…" : "Abrir arquivo"}</Button> : null}</div></div>
					</div>)}</div>
				</Card>
			)}
			<p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-text-disabled"><Lock className="size-3.5" />Arquivos privados; o acesso é limitado à sua conta e à equipe autorizada.</p>
			<Dialog open={!!editor} onOpenChange={(aberto) => !aberto && !salvandoEditor && setEditor(null)}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2"><Pencil className="size-4 text-primary" />Editar rascunho</DialogTitle>
						<DialogDescription>Salvar cria uma nova versão. Documentos enviados, assinados ou arquivados não podem ser sobrescritos.</DialogDescription>
					</DialogHeader>
					{editor && <div className="grid gap-4 py-2">
						<label className="grid gap-1.5 text-sm font-medium text-text-primary" htmlFor="documento-editor-titulo">Título<input id="documento-editor-titulo" value={editor.titulo} onChange={(e) => setEditor({ ...editor, titulo: e.target.value })} maxLength={240} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" /></label>
						<div className="grid gap-3" aria-label="Blocos editáveis do documento"><div className="flex items-center justify-between"><p className="text-sm font-medium text-text-primary">Blocos editáveis</p><Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setBlocos((atual) => [...atual, { id: crypto.randomUUID(), tipo: "paragrafo", texto: "" }])}>Adicionar bloco</Button></div>{blocos.map((bloco, index) => <div key={bloco.id} className="grid gap-2 rounded-lg border border-border bg-bg-neutral/20 p-3"><div className="flex items-center justify-between gap-2"><label className="text-xs font-semibold text-text-secondary" htmlFor={`documento-bloco-${bloco.id}`}>{bloco.tipo === "titulo" ? "Título" : `Bloco ${index + 1}`}</label><div className="flex items-center gap-2"><select aria-label={`Tipo do bloco ${index + 1}`} value={bloco.tipo} onChange={(e) => setBlocos((atual) => atual.map((item) => item.id === bloco.id ? { ...item, tipo: e.target.value as BlocoEditor["tipo"] } : item))} className="h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="paragrafo">Parágrafo</option><option value="titulo">Título</option></select>{blocos.length > 1 && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-error" onClick={() => setBlocos((atual) => atual.filter((item) => item.id !== bloco.id))}>Remover</Button>}</div></div><Textarea id={`documento-bloco-${bloco.id}`} value={bloco.texto} onChange={(e) => setBlocos((atual) => atual.map((item) => item.id === bloco.id ? { ...item, texto: e.target.value } : item))} maxLength={MAX_EDITOR_CHARS} rows={bloco.tipo === "titulo" ? 2 : 5} className="resize-y text-sm leading-6" placeholder={bloco.tipo === "titulo" ? "Título da seção" : "Texto deste bloco…"} /></div>)}</div>
						<p className="text-xs text-text-secondary">Versão atual: {editor.versao}. Salvar cria uma nova versão e preserva a origem; documento enviado/assinado exige revisão. {blocos.reduce((total, bloco) => total + bloco.texto.length, 0).toLocaleString("pt-BR")} / {MAX_EDITOR_CHARS.toLocaleString("pt-BR")} caracteres.</p>
					</div>}
					<DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={salvandoEditor || imprimindoEditor}>Cancelar</Button><Button type="button" variant="outline" onClick={() => { void imprimirEditor(); }} disabled={!editor?.titulo.trim() || imprimindoEditor} className="gap-2"><Printer className="size-4" />{imprimindoEditor ? "Preparando…" : "Imprimir / salvar PDF"}</Button><Button type="button" onClick={() => { void salvarEditor(); }} disabled={!editor?.titulo.trim() || salvandoEditor || imprimindoEditor} className="gap-2"><Save className="size-4" />{salvandoEditor ? "Salvando…" : "Salvar nova versão"}</Button></DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog open={novoAberto} onOpenChange={(aberto) => !criandoNovo && setNovoAberto(aberto)}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2"><Plus className="size-4 text-primary" />Criar documento do zero</DialogTitle>
						<DialogDescription>Use esta opção quando não existe orçamento de origem. O documento nasce como rascunho e pode ser revisado depois.</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						<label className="grid gap-1.5 text-sm font-medium text-text-primary" htmlFor="novo-documento-tipo">Tipo
							<Select value={novo.tipo} onValueChange={(valor) => setNovo((atual) => ({ ...atual, tipo: valor as TipoDocumentoWeb }))}>
								<SelectTrigger id="novo-documento-tipo"><SelectValue /></SelectTrigger>
						<SelectContent>{(["contrato", "ordem_servico", "pmoc", "recibo", "garantia", "conclusao", "laudo", "checklist", "certificado"] as TipoDocumentoWeb[]).map((valor) => <SelectItem key={valor} value={valor}>{TIPOS[valor] ?? valor}</SelectItem>)}</SelectContent>
							</Select>
						</label>
						<label className="grid gap-1.5 text-sm font-medium text-text-primary" htmlFor="novo-documento-titulo">Título<input id="novo-documento-titulo" value={novo.titulo} onChange={(e) => setNovo((atual) => ({ ...atual, titulo: e.target.value }))} maxLength={240} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ex.: Contrato de manutenção anual" /></label>
						<div className="grid gap-2"><label className="text-sm font-medium text-text-primary" htmlFor="novo-documento-cliente">Cliente (opcional)</label><Select value={novo.clienteId || "manual"} onValueChange={(valor) => { const cliente = clientesQ.data?.find((item) => item.id === valor); setNovo((atual) => ({ ...atual, clienteId: valor === "manual" ? "" : valor, cliente: cliente?.nome ?? "" })); }}><SelectTrigger id="novo-documento-cliente"><SelectValue placeholder="Escolha um cliente" /></SelectTrigger><SelectContent><SelectItem value="manual">Digitar outro nome</SelectItem>{(clientesQ.data ?? []).map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome}</SelectItem>)}</SelectContent></Select>{!novo.clienteId && <input aria-label="Nome do cliente" value={novo.cliente} onChange={(e) => setNovo((atual) => ({ ...atual, cliente: e.target.value }))} maxLength={180} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Nome do cliente, se não estiver cadastrado" />}</div>
						<label className="grid gap-1.5 text-sm font-medium text-text-primary" htmlFor="novo-documento-texto">Conteúdo inicial / observações<Textarea id="novo-documento-texto" value={novo.texto} onChange={(e) => setNovo((atual) => ({ ...atual, texto: e.target.value }))} maxLength={MAX_EDITOR_CHARS} rows={10} className="min-h-40 resize-y text-sm leading-6" placeholder="Comece o texto do contrato, laudo ou checklist…" /></label>
					</div>
					<DialogFooter><Button type="button" variant="outline" onClick={() => setNovoAberto(false)} disabled={criandoNovo}>Cancelar</Button><Button type="button" onClick={() => { void criarNovoDocumento(); }} disabled={!novo.titulo.trim() || criandoNovo}>{criandoNovo ? "Criando…" : "Criar rascunho"}</Button></DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
