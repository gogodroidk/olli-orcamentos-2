/**
 * CENTRAL DE DADOS
 *
 * Porta única para levar dados para dentro/fora do OLLI sem a armadilha de
 * "importar e rezar": toda escrita tem mapa de colunas, prévia, regra de
 * correspondência explícita e confirmação humana. Não existe delete nesta tela.
 */
import { propostaJaEnviada, type Agendamento, type Cliente, type Orcamento, type OrdemServico, type ProdutoItem, type Recibo, type ServicoItem } from "@dominio";
import {
	AlertTriangle,
	CheckCircle2,
	Download,
	FileUp,
	Loader2,
	PackageOpen,
	ShieldCheck,
	Upload,
} from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { agora, novoId } from "@/olli/contrato";
import { useOlliList } from "@/olli/data";
import { LIMITE_ARQUIVO_BYTES, type LinhaBruta, criarCsv, normalizarCabecalho, normalizarChave, numeroBr } from "@/olli/importacao/parser";
import { lerArquivoTabular } from "@/olli/importacao/arquivo";
import { extrairOrcamentosOlli } from "@/olli/importacao/orcamento";
import { useContextoDeEscrita, useSalvar } from "@/olli/mutacoes";
import { type LinhaCatalogo, linhaParaItem } from "@/pages/olli/catalogo/FormItemCatalogo";
import { type LinhaCliente, linhaParaCliente } from "@/pages/olli/clientes/FormCliente";
import { type LinhaAsset } from "@/pages/olli/equipamentos/equipamento";

type TipoImportacao = "clientes" | "produtos" | "servicos" | "orcamentos" | "fornecedor";
type CampoImportacao = "nome" | "telefone" | "cpf" | "cnpj" | "endereco" | "cidade" | "estado" | "cep" | "descricao" | "marca" | "modelo" | "unidade" | "preco" | "custo";
type AcaoPreview = "inserir" | "atualizar" | "ignorar" | "erro" | "ambiguo";

interface Proposta {
	linha: number;
	acao: AcaoPreview;
	motivo: string;
	objeto?: Cliente | ProdutoItem | ServicoItem | Orcamento;
}

const CAMPOS: Record<TipoImportacao, Array<{ id: CampoImportacao; rotulo: string; obrigatorio?: boolean; aliases: string[] }>> = {
	clientes: [
		{ id: "nome", rotulo: "Nome", obrigatorio: true, aliases: ["nome", "cliente", "razao social", "razao"] },
		{ id: "telefone", rotulo: "Telefone", aliases: ["telefone", "celular", "whatsapp", "fone"] },
		{ id: "cpf", rotulo: "CPF", aliases: ["cpf", "documento"] },
		{ id: "cnpj", rotulo: "CNPJ", aliases: ["cnpj"] },
		{ id: "endereco", rotulo: "Endereço", aliases: ["endereco", "logradouro", "rua"] },
		{ id: "cidade", rotulo: "Cidade", aliases: ["cidade", "municipio"] },
		{ id: "estado", rotulo: "UF", aliases: ["uf", "estado"] },
		{ id: "cep", rotulo: "CEP", aliases: ["cep"] },
	],
	produtos: [
		{ id: "nome", rotulo: "Produto", obrigatorio: true, aliases: ["nome", "produto", "descricao", "descrição", "item"] },
		{ id: "marca", rotulo: "Marca", aliases: ["marca", "fabricante"] },
		{ id: "modelo", rotulo: "Modelo", aliases: ["modelo", "referencia", "referência", "sku"] },
		{ id: "descricao", rotulo: "Descrição", aliases: ["descricao", "descrição", "detalhes"] },
		{ id: "unidade", rotulo: "Unidade", aliases: ["unidade", "un", "medida"] },
		{ id: "preco", rotulo: "Preço de venda", aliases: ["preco", "preço", "valor", "venda", "preco venda"] },
		{ id: "custo", rotulo: "Custo", aliases: ["custo", "preco custo", "preço custo"] },
	],
	servicos: [
		{ id: "nome", rotulo: "Serviço", obrigatorio: true, aliases: ["nome", "servico", "serviço", "descricao", "descrição", "item"] },
		{ id: "descricao", rotulo: "Descrição", aliases: ["descricao", "descrição", "detalhes"] },
		{ id: "unidade", rotulo: "Unidade", aliases: ["unidade", "un", "medida"] },
		{ id: "preco", rotulo: "Preço de venda", aliases: ["preco", "preço", "valor", "venda"] },
		{ id: "custo", rotulo: "Custo", aliases: ["custo", "preco custo", "preço custo"] },
	],
	orcamentos: [],
	fornecedor: [
		{ id: "nome", rotulo: "Produto", obrigatorio: true, aliases: ["nome", "produto", "descricao", "descrição", "item"] },
		{ id: "marca", rotulo: "Marca", aliases: ["marca", "fabricante"] },
		{ id: "modelo", rotulo: "Modelo", aliases: ["modelo", "referencia", "referência", "sku"] },
		{ id: "custo", rotulo: "Novo custo", obrigatorio: true, aliases: ["custo", "preco", "preço", "valor", "preco custo", "preço custo"] },
	],
};

const MAX_AMOSTRA = 12;

function valorDa(linha: LinhaBruta, mapeamento: Record<string, string>, campo: CampoImportacao): string {
	return (mapeamento[campo] ? linha[mapeamento[campo]] : "")?.trim() ?? "";
}

function mapeamentoInicial(tipo: TipoImportacao, cabecalhos: string[]): Record<string, string> {
	const usados = new Set<string>();
	return Object.fromEntries(
		CAMPOS[tipo].map((campo) => {
			const achado = cabecalhos.find((cabecalho) => !usados.has(cabecalho) && campo.aliases.includes(normalizarCabecalho(cabecalho)));
			if (achado) usados.add(achado);
			return [campo.id, achado ?? ""];
		}),
	);
}

function chaveCatalogo(nome: string, marca?: string, modelo?: string): string {
	return [nome, marca, modelo].map(normalizarChave).join("|");
}

function baixar(nome: string, conteudo: BlobPart, tipo: string) {
	const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
	const a = document.createElement("a");
	a.href = url;
	a.download = nome;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function nomeArquivo(base: string, extensao: string) {
	return `olli-${base}-${new Date().toISOString().slice(0, 10)}.${extensao}`;
}

function statusVariant(acao: AcaoPreview): "success" | "info" | "warning" | "error" | "secondary" {
	const variantes: Record<AcaoPreview, "success" | "info" | "warning" | "error" | "secondary"> = {
		inserir: "success", atualizar: "info", ignorar: "secondary", erro: "error", ambiguo: "warning",
	};
	return variantes[acao];
}

function podeEditarCatalogo(papel?: string) {
	return papel === "owner" || papel === "pessoal";
}

export default function CentralDeDadosPage() {
	const arquivoRef = useRef<HTMLInputElement>(null);
	const [tipo, setTipo] = useState<TipoImportacao>("clientes");
	const [linhasImportadas, setLinhasImportadas] = useState<LinhaBruta[]>([]);
	const [orcamentosImportados, setOrcamentosImportados] = useState<Orcamento[]>([]);
	const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
	const [lendo, setLendo] = useState(false);
	const [aplicando, setAplicando] = useState(false);

	const clientes = useOlliList<LinhaCliente>("clientes", { orderBy: "nome", ascending: true });
	const produtos = useOlliList<LinhaCatalogo>("produtos", { orderBy: "nome", ascending: true });
	const servicos = useOlliList<LinhaCatalogo>("servicos", { orderBy: "nome", ascending: true });
	const equipamentos = useOlliList<LinhaAsset>("assets", { orderBy: "criado_em", ascending: false });
	// `dados` é deliberadamente trazido: o JSON de backup precisa conter cada orçamento completo.
	const orcamentos = useOlliList<Record<string, unknown>>("orcamentos", { orderBy: "criado_em", ascending: false });
	const recibos = useOlliList<Recibo>("recibos", { orderBy: "criado_em", ascending: false });
	const agendamentos = useOlliList<Agendamento>("agendamentos", { orderBy: "inicio", ascending: false });
	const ordens = useOlliList<OrdemServico>("ordens_servico", { orderBy: "criado_em", ascending: false });
	const contexto = useContextoDeEscrita();
	const salvarCliente = useSalvar("clientes");
	const salvarProduto = useSalvar("produtos");
	const salvarServico = useSalvar("servicos");
	const salvarOrcamento = useSalvar("orcamentos");

	const cabecalhos = useMemo(() => Object.keys(linhasImportadas[0] ?? {}), [linhasImportadas]);
	const consultas = [clientes, produtos, servicos, equipamentos, orcamentos, recibos, agendamentos, ordens];
	const falhaLeitura = consultas.some((consulta) => consulta.isError);
	const pronto = !consultas.some((consulta) => consulta.isLoading) && !falhaLeitura;
	const catalogoPermitido = podeEditarCatalogo(contexto.data?.papel);
	const exportacaoPermitida = catalogoPermitido && !contexto.isError;

	const propostas = useMemo<Proposta[]>(() => {
		if (tipo === "orcamentos") {
			if (!orcamentosImportados.length) return [];
			const atuais = (orcamentos.data ?? [])
				.map((linha) => linha.dados && typeof linha.dados === "object" ? linha.dados as Orcamento : linha as unknown as Orcamento);
			return orcamentosImportados.map((importado, indice) => {
				if (!catalogoPermitido) return { linha: indice + 1, acao: "erro", motivo: "Só o dono pode importar orçamentos." };
				const mesmoId = atuais.find((atual) => atual.id === importado.id);
				const mesmoNumero = atuais.filter((atual) => atual.numero === importado.numero && atual.id !== importado.id);
				if (mesmoNumero.length) return { linha: indice + 1, acao: "ambiguo", motivo: "Já existe outro orçamento com este número. Nada será sobrescrito." };
				if (mesmoId && (propostaJaEnviada(mesmoId.status) || mesmoId.status === "aprovado" || mesmoId.status === "convertido")) {
					return { linha: indice + 1, acao: "ignorar", motivo: "Documento já enviado/aceito: importe uma cópia como novo rascunho em vez de alterá-lo." };
				}
				return { linha: indice + 1, acao: mesmoId ? "atualizar" : "inserir", motivo: mesmoId ? "Mesmo ID, número livre e documento ainda editável." : "Novo orçamento OLLI completo.", objeto: importado };
			});
		}
		if (!linhasImportadas.length) return [];
		const agoraIso = agora();
		const clientesAtuais = (clientes.data ?? []).map(linhaParaCliente);
		const produtosAtuais = produtos.data ?? [];
		const servicosAtuais = servicos.data ?? [];

		return linhasImportadas.map((linha, indice) => {
			const numeroLinha = indice + 2;
			const nome = valorDa(linha, mapeamento, "nome");
			if (!nome) return { linha: numeroLinha, acao: "erro", motivo: "Campo obrigatório Nome/Produto/Serviço ausente." };

			if (tipo === "clientes") {
				const telefone = valorDa(linha, mapeamento, "telefone");
				const cnpj = valorDa(linha, mapeamento, "cnpj").replace(/\D/g, "");
				const cpf = valorDa(linha, mapeamento, "cpf").replace(/\D/g, "");
				const candidatos = clientesAtuais.filter((atual) => {
					if (cnpj && atual.cnpj?.replace(/\D/g, "") === cnpj) return true;
					if (cpf && atual.cpf?.replace(/\D/g, "") === cpf) return true;
					return !!telefone && normalizarChave(atual.nome) === normalizarChave(nome) && atual.telefone.replace(/\D/g, "") === telefone.replace(/\D/g, "");
				});
				if (candidatos.length > 1) return { linha: numeroLinha, acao: "ambiguo", motivo: "Mais de um cliente confere. Revise antes de importar." };
				const base = candidatos[0];
				const objeto: Cliente = {
					...(base ?? {}), id: base?.id ?? novoId(), nome, telefone: telefone || base?.telefone || "", criadoEm: base?.criadoEm ?? agoraIso, atualizadoEm: agoraIso,
				};
				const texto = (campo: CampoImportacao, anterior?: string) => valorDa(linha, mapeamento, campo) || anterior;
				objeto.cpf = texto("cpf", base?.cpf) || undefined; objeto.cnpj = texto("cnpj", base?.cnpj) || undefined;
				objeto.endereco = texto("endereco", base?.endereco) || undefined; objeto.cidade = texto("cidade", base?.cidade) || undefined;
				objeto.estado = texto("estado", base?.estado) || undefined; objeto.cep = texto("cep", base?.cep) || undefined;
				return { linha: numeroLinha, acao: base ? "atualizar" : "inserir", motivo: base ? "Correspondência por documento ou nome + telefone." : "Novo cliente.", objeto };
			}

			if (!catalogoPermitido) return { linha: numeroLinha, acao: "erro", motivo: "Só o dono pode alterar produtos e serviços." };
			const marca = valorDa(linha, mapeamento, "marca");
			const modelo = valorDa(linha, mapeamento, "modelo");
			const custo = numeroBr(valorDa(linha, mapeamento, "custo"));
			if (tipo === "fornecedor") {
				if (custo == null || custo < 0) return { linha: numeroLinha, acao: "erro", motivo: "Informe um novo custo válido em R$." };
				const candidatos = produtosAtuais.filter((p) => chaveCatalogo(p.nome, p.marca ?? undefined, p.modelo ?? undefined) === chaveCatalogo(nome, marca, modelo));
				if (candidatos.length === 0) return { linha: numeroLinha, acao: "ignorar", motivo: "Não encontrei produto com nome, marca e modelo iguais." };
				if (candidatos.length > 1) return { linha: numeroLinha, acao: "ambiguo", motivo: "Correspondência ambígua: nada será atualizado automaticamente." };
				const base = linhaParaItem("produto", candidatos[0]) as ProdutoItem;
				return { linha: numeroLinha, acao: "atualizar", motivo: "Atualiza somente o custo; preço de venda e orçamentos ficam intactos.", objeto: { ...base, custo, atualizadoEm: agoraIso } };
			}

			const preco = numeroBr(valorDa(linha, mapeamento, "preco"));
			if (preco == null || preco < 0) return { linha: numeroLinha, acao: "erro", motivo: "Informe um preço de venda válido em R$." };
			const atuais = tipo === "produtos" ? produtosAtuais : servicosAtuais;
			const candidatos = atuais.filter((p) => tipo === "produtos" ? chaveCatalogo(p.nome, p.marca ?? undefined, p.modelo ?? undefined) === chaveCatalogo(nome, marca, modelo) : normalizarChave(p.nome) === normalizarChave(nome) && normalizarChave(p.unidade ?? "un") === normalizarChave(valorDa(linha, mapeamento, "unidade") || "un"));
			if (candidatos.length > 1) return { linha: numeroLinha, acao: "ambiguo", motivo: "Há mais de um item igual. Escolha um arquivo mais específico." };
			const base = candidatos[0] ? linhaParaItem(tipo === "produtos" ? "produto" : "servico", candidatos[0]) : undefined;
			const unidade = valorDa(linha, mapeamento, "unidade") || base?.unidade || "un";
			const descricao = valorDa(linha, mapeamento, "descricao") || base?.descricao;
			const itemBase: ServicoItem = { ...(base ?? {}), id: base?.id ?? novoId(), nome, preco, unidade, criadoEm: base?.criadoEm ?? agoraIso, atualizadoEm: agoraIso };
			if (descricao) itemBase.descricao = descricao;
			if (custo != null) itemBase.custo = custo;
			if (tipo === "produtos") {
				const produto: ProdutoItem = { ...itemBase, marca: marca || (base as ProdutoItem | undefined)?.marca, modelo: modelo || (base as ProdutoItem | undefined)?.modelo };
				return { linha: numeroLinha, acao: base ? "atualizar" : "inserir", motivo: base ? "Correspondência conservadora por nome, marca e modelo." : "Novo produto.", objeto: produto };
			}
			return { linha: numeroLinha, acao: base ? "atualizar" : "inserir", motivo: base ? "Correspondência por nome e unidade." : "Novo serviço.", objeto: itemBase };
		});
	}, [catalogoPermitido, clientes.data, linhasImportadas, mapeamento, orcamentos.data, orcamentosImportados, produtos.data, servicos.data, tipo]);

	const totais = useMemo(() => propostas.reduce<Record<AcaoPreview, number>>((acc, proposta) => ({ ...acc, [proposta.acao]: acc[proposta.acao] + 1 }), { inserir: 0, atualizar: 0, ignorar: 0, erro: 0, ambiguo: 0 }), [propostas]);
	const aplicaveis = propostas.filter((p) => p.acao === "inserir" || p.acao === "atualizar");
	const temImportacao = linhasImportadas.length > 0 || orcamentosImportados.length > 0;

	async function aoEscolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
		const arquivo = evento.target.files?.[0];
		if (!arquivo) return;
		setLendo(true); setLinhasImportadas([]); setOrcamentosImportados([]); setMapeamento({});
		try {
			if (arquivo.size > LIMITE_ARQUIVO_BYTES) throw new Error("O arquivo passa de 10 MB.");
			if (tipo === "orcamentos") {
				const importados = extrairOrcamentosOlli(await arquivo.text());
				setOrcamentosImportados(importados);
				toast.success(`${importados.length} orçamento${importados.length === 1 ? "" : "s"} carregado${importados.length === 1 ? "" : "s"} para conferência.`);
				return;
			}
			const linhas = await lerArquivoTabular(arquivo);
			if (!linhas.length) throw new Error("Não encontrei linhas de dados depois do cabeçalho.");
			setLinhasImportadas(linhas);
			setMapeamento(mapeamentoInicial(tipo, Object.keys(linhas[0] ?? {})));
			toast.success(`${linhas.length} linhas carregadas para conferência.`);
		} catch (erro) { toast.error((erro as Error).message || "Não consegui ler esse arquivo."); }
		finally { setLendo(false); evento.target.value = ""; }
	}

	function exportarCsv(tipoCsv: "clientes" | "produtos" | "servicos" | "equipamentos" | "recibos" | "agendamentos" | "ordens_servico") {
		if (!exportacaoPermitida || !pronto) { toast.error("Não consegui confirmar uma exportação completa e autorizada."); return; }
		const fontes: Record<typeof tipoCsv, unknown[]> = {
			clientes: clientes.data ?? [],
			produtos: produtos.data ?? [],
			servicos: servicos.data ?? [],
			equipamentos: equipamentos.data ?? [],
			recibos: recibos.data ?? [],
			agendamentos: agendamentos.data ?? [],
			ordens_servico: ordens.data ?? [],
		};
		const dados = fontes[tipoCsv] as Record<string, unknown>[];
		const colunas: Record<string, string[]> = {
			clientes: ["nome", "telefone", "cpf", "cnpj", "endereco", "cidade", "estado", "cep"],
			produtos: ["nome", "marca", "modelo", "descricao", "unidade", "preco", "custo"],
			servicos: ["nome", "descricao", "unidade", "preco", "custo"],
			equipamentos: ["cliente_id", "categoria", "fabricante", "modelo", "numero_serie", "capacidade_btu", "situacao", "localizacao"],
			recibos: ["numero", "cliente_nome", "valor_recebido", "forma_pagamento", "data_recebimento"],
			agendamentos: ["cliente_nome", "titulo", "tipo", "inicio", "fim", "endereco", "status", "observacao"],
			ordens_servico: ["numero", "cliente_nome", "titulo", "descricao", "status", "tecnico_nome", "data_agendada", "valor"],
		};
		const campos = colunas[tipoCsv];
		baixar(nomeArquivo(tipoCsv, "csv"), criarCsv(campos, dados.map((linha) => campos.map((campo) => linha[campo]))), "text/csv;charset=utf-8");
		toast.success(`Exportação de ${tipoCsv} pronta.`);
	}

	function exportarPacoteOperacional() {
		if (!exportacaoPermitida || !pronto) { toast.error("Não consegui confirmar uma exportação completa e autorizada."); return; }
		const orcamentosCompletos = (orcamentos.data ?? []).map((linha) => linha.dados && typeof linha.dados === "object" ? linha.dados : linha);
		const pacote = { formato: "olli-pacote-operacional", versao: 1, exportadoEm: new Date().toISOString(), registros: { clientes: clientes.data ?? [], produtos: produtos.data ?? [], servicos: servicos.data ?? [], equipamentos: equipamentos.data ?? [], orcamentos: orcamentosCompletos, recibos: recibos.data ?? [], agendamentos: agendamentos.data ?? [], ordensServico: ordens.data ?? [] } };
		baixar(nomeArquivo("pacote-operacional", "json"), JSON.stringify(pacote, null, 2), "application/json;charset=utf-8");
		toast.success("Pacote operacional baixado. Guarde-o em local seguro.");
	}

	function exportarOrcamentos() {
		if (!exportacaoPermitida || !pronto) { toast.error("Não consegui confirmar uma exportação completa e autorizada."); return; }
		const completos = (orcamentos.data ?? []).map((linha) => linha.dados && typeof linha.dados === "object" ? linha.dados : linha);
		const pacote = { formato: "olli-orcamentos", versao: 1, exportadoEm: new Date().toISOString(), orcamentos: completos };
		baixar(nomeArquivo("orcamentos-completos", "json"), JSON.stringify(pacote, null, 2), "application/json;charset=utf-8");
		toast.success("Orçamentos completos exportados em JSON.");
	}

	async function aplicarImportacao() {
		if (!aplicaveis.length || aplicando) return;
		if (!pronto || contexto.isError) { toast.error("A base não foi carregada por completo. Nada foi alterado."); return; }
		if ((tipo === "produtos" || tipo === "servicos" || tipo === "orcamentos" || tipo === "fornecedor") && !catalogoPermitido) { toast.error("Permissão de proprietário não confirmada. A importação foi bloqueada."); return; }
		setAplicando(true);
		try {
			// Salvar o backup antes é responsabilidade do usuário; a ação deixa isso explícito no botão.
			for (const proposta of aplicaveis) {
				if (!proposta.objeto) continue;
				if (tipo === "clientes") await salvarCliente.mutateAsync(proposta.objeto as Cliente);
				else if (tipo === "servicos") await salvarServico.mutateAsync(proposta.objeto as ServicoItem);
				else if (tipo === "orcamentos") await salvarOrcamento.mutateAsync(proposta.objeto as Orcamento);
				else await salvarProduto.mutateAsync(proposta.objeto as ProdutoItem);
			}
			toast.success(`${aplicaveis.length} registro${aplicaveis.length === 1 ? "" : "s"} aplicado${aplicaveis.length === 1 ? "" : "s"}.`);
			setLinhasImportadas([]); setOrcamentosImportados([]); setMapeamento({});
		} catch (erro) { toast.error((erro as Error).message || "A importação parou. Nenhum registro restante foi aplicado."); }
		finally { setAplicando(false); }
	}

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div><h1 className="text-2xl font-bold tracking-tight text-text-primary">Central de dados</h1><p className="mt-1 max-w-2xl text-sm text-text-secondary">Leve seu cadastro com você. Importações passam por prévia e nunca apagam registros ou reprecificam orçamentos já emitidos.</p></div>
				<Button variant="outline" onClick={exportarPacoteOperacional} disabled={!pronto || !exportacaoPermitida}><PackageOpen /> Baixar pacote operacional</Button>
			</div>
			{falhaLeitura && <Card className="mb-4 border-error/30 bg-error/5 p-4 text-sm text-error"><strong>Exportação e importação bloqueadas:</strong> uma parte dos dados não carregou. Recarregue a página; nenhum arquivo incompleto será apresentado como backup.</Card>}

			<Tabs defaultValue="exportar">
				<TabsList><TabsTrigger value="exportar"><Download /> Exportar</TabsTrigger><TabsTrigger value="importar"><Upload /> Importar ou atualizar</TabsTrigger></TabsList>
				<TabsContent value="exportar" className="mt-4">
					<Card><CardHeader><CardTitle>Exportações portáveis</CardTitle><CardDescription>CSV abre em Excel e Google Planilhas. Valores que poderiam virar fórmula são protegidos automaticamente.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{(["clientes", "produtos", "servicos", "equipamentos", "recibos", "agendamentos", "ordens_servico"] as const).map((item) => <Button key={item} variant="outline" className="justify-start" onClick={() => exportarCsv(item)} disabled={!pronto || !exportacaoPermitida}><Download /> {item.replace("ordens_servico", "Ordens de serviço").replace(/^./, (c) => c.toUpperCase())} CSV</Button>)}
						<Button variant="outline" className="justify-start" onClick={exportarOrcamentos} disabled={!pronto || !exportacaoPermitida}><Download /> Orçamentos JSON</Button>
					</CardContent></Card>
					<Card className="mt-4 border-primary/20 bg-primary/5"><CardContent className="flex gap-3 pt-6"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><p className="text-sm text-text-secondary"><strong className="text-text-primary">Pacote operacional JSON:</strong> inclui clientes, catálogos, equipamentos, orçamentos com itens completos, recibos, agenda e ordens de serviço. Configurações administrativas, credenciais e históricos internos não são chamados de backup nesta tela.</p></CardContent></Card>
				</TabsContent>
				<TabsContent value="importar" className="mt-4 space-y-4">
					<Card><CardHeader><CardTitle>1. Escolha o que deseja conferir</CardTitle><CardDescription>{tipo === "orcamentos" ? "Orçamentos usam somente o JSON completo exportado pelo OLLI." : "CSV e XLSX até 10 MB e 5.000 linhas. XLS legado e PDF ficam de fora para não executar conteúdo inesperado."}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-[minmax(0,280px)_1fr] md:items-center">
						<Select value={tipo} onValueChange={(valor) => { setTipo(valor as TipoImportacao); setLinhasImportadas([]); setOrcamentosImportados([]); setMapeamento({}); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clientes">Clientes</SelectItem><SelectItem value="produtos">Produtos</SelectItem><SelectItem value="servicos">Serviços</SelectItem><SelectItem value="orcamentos">Orçamentos (JSON OLLI)</SelectItem><SelectItem value="fornecedor">Atualizar custo de fornecedor</SelectItem></SelectContent></Select>
						<div className="flex flex-wrap items-center gap-3"><input ref={arquivoRef} type="file" accept={tipo === "orcamentos" ? ".json,application/json" : ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"} className="sr-only" onChange={aoEscolherArquivo} /><Button onClick={() => arquivoRef.current?.click()} disabled={lendo || !pronto}>{lendo ? <Loader2 className="animate-spin" /> : <FileUp />} Escolher arquivo</Button>{tipo === "fornecedor" && <span className="text-xs text-text-secondary">Atualiza apenas o custo do produto; preço de venda e orçamentos não mudam.</span>}{tipo === "orcamentos" && <span className="text-xs text-text-secondary">Documentos enviados ou aceitos nunca são sobrescritos.</span>}</div>
					</CardContent></Card>

					{temImportacao && <>
						{tipo !== "orcamentos" && <Card><CardHeader><CardTitle>2. Confira o mapeamento</CardTitle><CardDescription>Detectamos os cabeçalhos, mas você continua no controle. Campos vazios preservam o que já existe.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{CAMPOS[tipo].map((campo) => <label key={campo.id} className="grid gap-1.5 text-sm font-medium text-text-primary"><span>{campo.rotulo}{campo.obrigatorio ? " *" : ""}</span><Select value={mapeamento[campo.id] || "__vazio"} onValueChange={(valor) => setMapeamento((atual) => ({ ...atual, [campo.id]: valor === "__vazio" ? "" : valor }))}><SelectTrigger className="w-full"><SelectValue placeholder="Não importar" /></SelectTrigger><SelectContent><SelectItem value="__vazio">Não importar</SelectItem>{cabecalhos.map((cabecalho) => <SelectItem key={cabecalho} value={cabecalho}>{cabecalho}</SelectItem>)}</SelectContent></Select></label>)}
						</CardContent></Card>}

						<Card><CardHeader><CardTitle>3. Prévia antes de aplicar</CardTitle><CardDescription>{propostas.length} linhas analisadas. Ambiguidades e erros não entram; você pode ajustar o arquivo e carregar de novo.</CardDescription></CardHeader><CardContent>
							<div className="mb-4 flex flex-wrap gap-2">{(["inserir", "atualizar", "ignorar", "ambiguo", "erro"] as AcaoPreview[]).map((acao) => <Badge key={acao} variant={statusVariant(acao)}>{totais[acao]} {acao}</Badge>)}</div>
							<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary"><tr><th className="px-3 py-2">Linha</th><th className="px-3 py-2">Ação</th><th className="px-3 py-2">Motivo</th></tr></thead><tbody>{propostas.slice(0, MAX_AMOSTRA).map((p) => <tr key={p.linha} className="border-t"><td className="px-3 py-2 tabular-nums">{p.linha}</td><td className="px-3 py-2"><Badge variant={statusVariant(p.acao)}>{p.acao}</Badge></td><td className="px-3 py-2 text-text-secondary">{p.motivo}</td></tr>)}</tbody></table></div>
							{propostas.length > MAX_AMOSTRA && <p className="mt-2 text-xs text-text-secondary">Mostrando {MAX_AMOSTRA} de {propostas.length} linhas. Os totais acima incluem o arquivo inteiro.</p>}
							<div className="mt-5 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 text-sm text-text-secondary"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-darker" /><span>Antes de confirmar, baixe o pacote operacional. A aplicação só insere/atualiza as linhas aprovadas; não há exclusão nesta operação.</span></div><Button onClick={aplicarImportacao} disabled={!aplicaveis.length || aplicando || contexto.isLoading || contexto.isError || !pronto}>{aplicando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar {aplicaveis.length} alteração{aplicaveis.length === 1 ? "" : "ões"}</Button></div>
						</CardContent></Card>
					</>}
				</TabsContent>
			</Tabs>
		</div>
	);
}
