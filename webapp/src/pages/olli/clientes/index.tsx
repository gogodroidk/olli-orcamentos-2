/**
 * CLIENTES — a lista e as três portas do CRUD (criar, editar, excluir).
 *
 * A lista é o `RecordListPage` de sempre (mesmo visual das outras telas), agora
 * com as ações opcionais. Editar tem 3 caminhos, de propósito: clique na linha
 * (mouse), botão da coluna Nome (teclado) e o item "Editar" do menu "…".
 *
 * Excluir é SOFT DELETE (`useExcluir` carimba `excluidoEm`). Nada de `delete`
 * físico: o celular ressuscitaria a linha no próximo sync.
 */
import type { Empresa } from "@dominio";
import { FileText, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import RecordListPage, { type AcaoDeLinha, type Linha } from "@/olli/components/RecordListPage";
import { useMinhaEmpresa } from "@/olli/data";
import { useExcluir } from "@/olli/mutacoes";
import { numeroWhatsapp } from "@/pages/olli/inicio/financeiro";
import FormCliente, { linhaParaCliente } from "./FormCliente";

/** O que o formulário está editando agora. `null` = formulário fechado. */
type Alvo = { modo: "novo" } | { modo: "editar"; linha: Linha };

/**
 * Texto de abertura pro WhatsApp — mesma cara do `textoCobranca` de
 * `inicio/financeiro.ts` (saudação + "Aqui é da <empresa>"), sem o parágrafo de
 * cobrança: aqui não há orçamento parado, é só puxar conversa com o cliente.
 */
function textoAberturaWhatsapp(nomeCliente: string, empresa?: string): string {
	const primeiro = nomeCliente.trim().split(/\s+/)[0];
	const trata = primeiro ? `Olá, ${primeiro}!` : "Olá!";
	const quem = empresa?.trim() ? ` Aqui é da ${empresa.trim()}.` : "";
	return `${trata}${quem}`;
}

export default function ClientesPage() {
	const navigate = useNavigate();
	const [alvo, setAlvo] = useState<Alvo | null>(null);
	const [aExcluir, setAExcluir] = useState<Linha | null>(null);
	const excluir = useExcluir("clientes");
	const { data: empresaLinha } = useMinhaEmpresa();
	// A `empresa` também é uma tabela de BLOB: o nome mora em `dados` (ver orcamentos/index.tsx).
	const empresa = (empresaLinha?.dados as Empresa | undefined) ?? null;

	const abrirExclusao = (linha: Linha) => {
		excluir.reset(); // limpa o erro de uma tentativa anterior — senão ele reaparece já aberto
		setAExcluir(linha);
	};

	const confirmarExclusao = async () => {
		if (!aExcluir) return;
		try {
			await excluir.mutateAsync(linhaParaCliente(aExcluir));
			setAExcluir(null);
		} catch {
			// Fica no diálogo, com a mensagem visível (`excluir.error`). Fechar aqui
			// faria o usuário achar que excluiu — o bug que esta casa já pagou caro.
		}
	};

	const acoes: AcaoDeLinha[] = [
		{
			rotulo: "Editar",
			icone: <Pencil className="size-4" aria-hidden="true" />,
			aoClicar: (linha) => setAlvo({ modo: "editar", linha }),
		},
		{
			rotulo: "Novo orçamento",
			icone: <Plus className="size-4" aria-hidden="true" />,
			// `linhaParaCliente` é o MESMO conversor usado para editar este cliente; do
			// outro lado, orcamentos/index.tsx aplica `clienteParaOrcamento` (o do
			// próprio SeletorCliente) sobre ele. O cliente viaja pelo ESTADO da rota,
			// nunca pela URL — dado de cliente não é query string.
			aoClicar: (linha) =>
				navigate("/orcamentos?novo=1", { state: { clientePreSelecionado: linhaParaCliente(linha) } }),
		},
		{
			rotulo: "Ver orçamentos",
			icone: <FileText className="size-4" aria-hidden="true" />,
			aoClicar: (linha) => navigate(`/orcamentos?cliente=${encodeURIComponent(String(linha.nome ?? ""))}`),
		},
		{
			rotulo: "WhatsApp",
			icone: <MessageCircle className="size-4" aria-hidden="true" />,
			aoClicar: (linha) => {
				// `numeroWhatsapp` (o mesmo validador de `inicio/financeiro.ts`) devolve
				// `null` para um telefone que não dá para um celular BR plausível — abrir
				// mesmo assim montaria uma conversa com um DESCONHECIDO.
				const num = numeroWhatsapp(String(linha.telefone ?? ""));
				if (!num) {
					toast.error("Este cliente não tem um telefone válido para WhatsApp.", { position: "top-center" });
					return;
				}
				const texto = textoAberturaWhatsapp(String(linha.nome ?? ""), empresa?.nome);
				window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
			},
		},
		{
			rotulo: "Excluir",
			destrutiva: true,
			icone: <Trash2 className="size-4" aria-hidden="true" />,
			aoClicar: abrirExclusao,
		},
	];

	return (
		<>
			<RecordListPage
				table="clientes"
				title="Clientes"
				subtitle="Quem você atende. É daqui que o orçamento puxa nome, telefone e endereço."
				orderBy="nome"
				ascending
				columns={["nome", "telefone", "cidade", "estado"]}
				acaoNova={{ rotulo: "Novo cliente", aoClicar: () => setAlvo({ modo: "novo" }) }}
				aoAbrirLinha={(linha) => setAlvo({ modo: "editar", linha })}
				acoesDaLinha={acoes}
				vazioTitulo="Nenhum cliente cadastrado"
				vazioDescricao="Cadastre o primeiro e ele já fica disponível no orçamento, no recibo e na OS."
			/>

			{alvo && (
				// `key`: trocar de alvo (ex.: o aviso de duplicidade manda abrir outro
				// cliente) REMONTA o formulário. Sem isso, o React reaproveitaria o
				// componente e os campos digitados ficariam por cima do outro cadastro.
				<FormCliente
					key={alvo.modo === "editar" ? String(alvo.linha.id) : "novo"}
					cliente={alvo.modo === "editar" ? linhaParaCliente(alvo.linha) : null}
					aoFechar={() => setAlvo(null)}
					aoAbrirExistente={(linha) => setAlvo({ modo: "editar", linha })}
				/>
			)}

			{aExcluir && (
				<ConfirmarExclusao
					aberto
					aoFechar={() => setAExcluir(null)}
					aoConfirmar={confirmarExclusao}
					nome={String(aExcluir.nome ?? "")}
					tipo="cliente"
					aviso="Os orçamentos e recibos já emitidos não mudam: cada documento guarda uma cópia dos dados do cliente do dia em que foi criado."
					excluindo={excluir.isPending}
					erro={excluir.isError ? ((excluir.error as Error)?.message ?? "Não foi possível excluir o cliente.") : null}
				/>
			)}
		</>
	);
}
