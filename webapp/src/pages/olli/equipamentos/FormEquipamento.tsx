/**
 * FORMULÁRIO DE EQUIPAMENTO (inventário HVAC / PMOC).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AS DUAS COISAS QUE NÃO PODEM DAR ERRADO AQUI
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. O `qrToken` NUNCA sai daqui preenchido por nós. Ele é a identidade pública do
 *    ativo — o que está impresso no ADESIVO já colado no equipamento do cliente — e
 *    nasce no BANCO (coluna com DEFAULT). Num cadastro novo ele vai vazio: o
 *    `contrato.ts` OMITE a coluna `qr_token` quando vazia, e o DEFAULT gera. Se
 *    mandássemos string vazia, o `not null` quebraria; se mandássemos um token nosso,
 *    a etiqueta colada no equipamento pararia de resolver. Numa EDIÇÃO, o token
 *    vigente é reenviado igual (preservado do registro carregado).
 *
 * 2. SALVAR É UPSERT DA LINHA INTEIRA. Por isso partimos do equipamento CARREGADO e
 *    fazemos merge por cima — nunca montamos um objeto só com os campos da tela.
 *    Montar do zero apagaria `fotos` (as fotos da placa/local que o técnico tirou),
 *    `localId`, `qrToken` e `qrRevogadoEm`. `qrRevogadoEm` é MONOTÔNICO: zerá-lo
 *    reativaria um QR que alguém revogou de propósito.
 *
 * A validação ("categoria OU código OU nº de série") é a mesma das telas do app
 * (EquipamentosDesktopScreen.tsx:627) — um ativo sem NADA que o identifique é uma
 * linha inútil no inventário.
 */
import type { CategoriaHvac, CriticidadeEquipamento, Equipamento, SituacaoEquipamento } from "@dominio";
import { STATUS_EQUIP_LABELS } from "@dominio";
import { X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Campo } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import SeletorCliente, { type ClienteSelecionado } from "@/olli/components/SeletorCliente";
import { novoId } from "@/olli/contrato";
import { useOlliList } from "@/olli/data";
import { agoraIso } from "@/olli/datas";
import { useSalvar } from "@/olli/mutacoes";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import {
	CATEGORIAS,
	CRITICIDADES,
	formatarBtu,
	type LinhaAsset,
	linhaParaEquipamento,
	REFRIGERANTES_SUGERIDOS,
	TENSOES_SUGERIDAS,
} from "./equipamento";

/** Radix Select não aceita `value=""`. Este é o "não informado" de categoria/criticidade. */
const VAZIO = "__vazio__";

/** As situações, na ordem de vida do ativo — as chaves vêm do domínio (STATUS_EQUIP_LABELS). */
const SITUACOES = Object.entries(STATUS_EQUIP_LABELS) as [SituacaoEquipamento, string][];

/** Só o que o seletor precisa para resolver o NOME do cliente já vinculado. */
type LinhaCliente = { id: string; nome: string; telefone: string | null };

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	/** `null` = cadastro novo. Caso contrário, o equipamento INTEIRO (já reidratado da linha). */
	equipamento: Equipamento | null;
}

export default function FormEquipamento({ aberto, aoFechar, equipamento }: Props) {
	const formId = useId();
	const salvar = useSalvar("equipamentos");

	const ehNovo = !equipamento;

	/* ── Estado do formulário ────────────────────────────────────────────────── */
	const [clienteId, setClienteId] = useState<string | undefined>(undefined);
	const [categoria, setCategoria] = useState<string>(VAZIO);
	const [fabricante, setFabricante] = useState("");
	const [modelo, setModelo] = useState("");
	const [numeroSerie, setNumeroSerie] = useState("");
	const [capacidadeBtu, setCapacidadeBtu] = useState("");
	const [tensao, setTensao] = useState("");
	const [refrigerante, setRefrigerante] = useState("");
	const [localizacao, setLocalizacao] = useState("");
	const [situacao, setSituacao] = useState<SituacaoEquipamento>("ativo");
	const [criticidade, setCriticidade] = useState<string>(VAZIO);
	const [patrimonio, setPatrimonio] = useState("");
	const [codigoInterno, setCodigoInterno] = useState("");
	const [erroValidacao, setErroValidacao] = useState<string | null>(null);

	// Recarrega a partir do registro sempre que o diálogo abre (e some com o erro
	// da tentativa anterior — senão o usuário reabre o form já "com erro").
	useEffect(() => {
		if (!aberto) return;
		setClienteId(equipamento?.clienteId);
		setCategoria(equipamento?.categoria || VAZIO);
		setFabricante(equipamento?.fabricante ?? "");
		setModelo(equipamento?.modelo ?? "");
		setNumeroSerie(equipamento?.numeroSerie ?? "");
		setCapacidadeBtu(typeof equipamento?.capacidadeBtu === "number" ? String(equipamento.capacidadeBtu) : "");
		setTensao(equipamento?.tensao ?? "");
		setRefrigerante(equipamento?.refrigerante ?? "");
		setLocalizacao(equipamento?.localizacao ?? "");
		setSituacao(equipamento?.situacao ?? "ativo");
		setCriticidade(equipamento?.criticidade || VAZIO);
		setPatrimonio(equipamento?.patrimonio ?? "");
		setCodigoInterno(equipamento?.codigoInterno ?? "");
		setErroValidacao(null);
		salvar.reset();
	}, [aberto, equipamento, salvar.reset]);

	/* ── Cliente vinculado ───────────────────────────────────────────────────── */
	// Mesma query (mesmas opções) que o SeletorCliente usa por dentro → mesma chave
	// de cache do TanStack Query, então isto NÃO faz uma segunda requisição.
	const { data: clientes, isLoading: carregandoClientes } = useOlliList<LinhaCliente>("clientes", {
		orderBy: "nome",
		ascending: true,
	});

	/**
	 * O que o seletor MOSTRA. `clienteId` é a fonte da verdade para GRAVAR — o nome é
	 * só exibição. Isso importa: se o cliente vinculado não estiver na lista (ele foi
	 * para a lixeira, ou a lista ainda está carregando), continuamos gravando o
	 * `clienteId` original. Resolver nome e vínculo no mesmo estado faria uma falha de
	 * exibição DESVINCULAR o equipamento do cliente em silêncio.
	 */
	const clienteSelecionado = useMemo<ClienteSelecionado | null>(() => {
		if (!clienteId) return null;
		const achado = clientes?.find((c) => c.id === clienteId);
		if (achado) {
			return { clienteId: achado.id, clienteNome: achado.nome, clienteTelefone: achado.telefone ?? "" };
		}
		return {
			clienteId,
			clienteNome: carregandoClientes ? "Carregando…" : "Cliente não está mais na lista",
			clienteTelefone: "",
		};
	}, [clienteId, clientes, carregandoClientes]);

	/* ── Salvar ──────────────────────────────────────────────────────────────── */
	const btuNumero = capacidadeBtu ? Number.parseInt(capacidadeBtu, 10) : undefined;

	async function aoSubmeter(e: React.FormEvent) {
		e.preventDefault();

		// Regra do app: um ativo precisa de ALGO que o identifique.
		const cat = categoria === VAZIO ? undefined : categoria;
		const temIdentificacao = !!cat || !!codigoInterno.trim() || !!numeroSerie.trim();
		if (!temIdentificacao) {
			setErroValidacao(
				"Escolha a categoria ou informe um código interno / nº de série — sem isso não dá para identificar o equipamento no inventário.",
			);
			return;
		}
		setErroValidacao(null);

		// LOST UPDATE: entre abrir este diálogo e salvar, o celular pode ter tirado
		// fotos ou revogado o QR deste equipamento. A prop `equipamento` foi capturada
		// na ABERTURA — partir dela apagaria o que mudou nesse meio-tempo. Numa edição,
		// relemos a linha FRESCA do banco agora e partimos DELA (mesmo padrão de
		// `carregarOsFresca`/FormOs.tsx e da releitura de FormOrcamento.tsx). Num
		// cadastro novo não há o que reler.
		let base: Equipamento | null = equipamento;
		if (equipamento) {
			const { data, error } = await supabase.from("assets").select("*").eq("id", equipamento.id).maybeSingle();
			if (error) {
				setErroValidacao("Não consegui confirmar o estado atual deste equipamento. Tente de novo.");
				return;
			}
			if (!data) {
				setErroValidacao("Este equipamento não existe mais. Atualize a página.");
				return;
			}
			base = linhaParaEquipamento(data as LinhaAsset);
		}

		const agora = agoraIso();
		const equipamentoSalvo: Equipamento = {
			// Parte do registro INTEIRO (fresco): preserva fotos, localId, qrToken,
			// qrRevogadoEm e criadoEm. Ver cabeçalho — montar do zero apagaria o
			// trabalho de campo.
			...(base ?? {}),

			id: base?.id ?? novoId(),
			clienteId: clienteId || undefined,
			categoria: cat as CategoriaHvac | undefined,
			fabricante: fabricante.trim() || undefined,
			modelo: modelo.trim() || undefined,
			numeroSerie: numeroSerie.trim() || undefined,
			capacidadeBtu: btuNumero && !Number.isNaN(btuNumero) ? btuNumero : undefined,
			tensao: tensao.trim() || undefined,
			refrigerante: refrigerante.trim() || undefined,
			localizacao: localizacao.trim() || undefined,
			situacao,
			criticidade: criticidade === VAZIO ? undefined : (criticidade as CriticidadeEquipamento),
			patrimonio: patrimonio.trim() || undefined,
			codigoInterno: codigoInterno.trim() || undefined,

			// O QR nasce no BANCO. Vazio no cadastro novo (o contrato omite a coluna e o
			// DEFAULT gera); na edição, reenvia o MESMO token (agora fresco). Nunca inventamos um.
			qrToken: base?.qrToken ?? "",
			fotos: base?.fotos ?? [],
			criadoEm: base?.criadoEm ?? agora,
			atualizadoEm: agora,
		};

		await salvar.mutateAsync(equipamentoSalvo);
		aoFechar();
	}

	const erroGravacao = salvar.isError ? ((salvar.error as Error)?.message ?? "Não consegui salvar agora.") : null;

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			titulo={ehNovo ? "Novo equipamento" : "Editar equipamento"}
			descricao={
				ehNovo
					? "A etiqueta QR é gerada pelo sistema depois que o equipamento é salvo."
					: "As fotos e a etiqueta QR deste equipamento são preservadas."
			}
			erro={erroValidacao ?? erroGravacao}
			salvando={salvar.isPending}
			formId={formId}
			rotuloSalvar={ehNovo ? "Cadastrar" : "Salvar"}
			largo
		>
			<form id={formId} onSubmit={aoSubmeter} className="space-y-5">
				{/* ── Identificação ── */}
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="Cliente" dica="De quem é o equipamento." className="sm:col-span-2">
						<div className="flex items-center gap-2">
							<div className="min-w-0 flex-1">
								<SeletorCliente
									valor={clienteSelecionado}
									aoSelecionar={(c) => setClienteId(c.clienteId)}
									disabled={salvar.isPending}
								/>
							</div>
							{/* Paridade com o app desktop: lá dá para desvincular o cliente
							    sem trocar por outro. Sem este botão, o único jeito de "limpar"
							    era escolher outro cliente qualquer. */}
							{clienteId && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-10 shrink-0 text-text-secondary hover:text-error"
									onClick={() => setClienteId(undefined)}
									disabled={salvar.isPending}
									aria-label="Remover vínculo com o cliente"
									title="Remover vínculo"
								>
									<X className="size-4" />
								</Button>
							)}
						</div>
					</Campo>

					<Campo rotulo="Categoria">
						<Select value={categoria} onValueChange={setCategoria} disabled={salvar.isPending}>
							<SelectTrigger className="h-10 w-full">
								<SelectValue placeholder="Selecionar…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={VAZIO}>Não informada</SelectItem>
								{CATEGORIAS.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>

					<Campo rotulo="Situação">
						<Select
							value={situacao}
							onValueChange={(v) => setSituacao(v as SituacaoEquipamento)}
							disabled={salvar.isPending}
						>
							<SelectTrigger className="h-10 w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SITUACOES.map(([id, label]) => (
									<SelectItem key={id} value={id}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>

					<Campo rotulo="Fabricante">
						<Input
							value={fabricante}
							onChange={(e) => setFabricante(e.target.value)}
							placeholder="Ex.: Samsung"
							disabled={salvar.isPending}
						/>
					</Campo>

					<Campo rotulo="Modelo">
						<Input
							value={modelo}
							onChange={(e) => setModelo(e.target.value)}
							placeholder="Ex.: Wind Free 12k"
							disabled={salvar.isPending}
						/>
					</Campo>

					<Campo rotulo="Nº de série">
						<Input
							value={numeroSerie}
							onChange={(e) => setNumeroSerie(e.target.value)}
							placeholder="Da placa do equipamento"
							disabled={salvar.isPending}
						/>
					</Campo>

					<Campo rotulo="Código interno" dica="O seu código (ex.: AC-014).">
						<Input
							value={codigoInterno}
							onChange={(e) => setCodigoInterno(e.target.value)}
							placeholder="Ex.: AC-014"
							disabled={salvar.isPending}
						/>
					</Campo>
				</div>

				{/* ── Ficha técnica ── */}
				<div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
					<Campo rotulo="Capacidade (BTU/h)" dica={formatarBtu(btuNumero) || "Nem todo equipamento tem."}>
						<Input
							inputMode="numeric"
							value={capacidadeBtu}
							// Só dígitos: o banco guarda `integer`. Mesma regra do app (onBtuChange).
							onChange={(e) => setCapacidadeBtu(e.target.value.replace(/\D/g, "").slice(0, 9))}
							placeholder="Ex.: 9000"
							className="tabular-nums"
							disabled={salvar.isPending}
						/>
					</Campo>

					<Campo rotulo="Criticidade" dica="O impacto de esse equipamento parar.">
						<Select value={criticidade} onValueChange={setCriticidade} disabled={salvar.isPending}>
							<SelectTrigger className="h-10 w-full">
								<SelectValue placeholder="Selecionar…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={VAZIO}>Não informada</SelectItem>
								{CRITICIDADES.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>

					{/* Tensão e refrigerante são TEXTO LIVRE (é o que o app grava). O <datalist>
					    sugere sem prender: um "380V trifásico" digitado no celular continua
					    válido, e um gás fora da lista pode ser escrito. Ver equipamento.ts. */}
					<Campo rotulo="Tensão">
						<Input
							list="olli-tensoes"
							value={tensao}
							onChange={(e) => setTensao(e.target.value)}
							placeholder="Ex.: 220V, 380V trifásico"
							disabled={salvar.isPending}
						/>
						<datalist id="olli-tensoes">
							{TENSOES_SUGERIDAS.map((t) => (
								<option key={t} value={t} />
							))}
						</datalist>
					</Campo>

					<Campo rotulo="Refrigerante">
						<Input
							list="olli-refrigerantes"
							value={refrigerante}
							onChange={(e) => setRefrigerante(e.target.value)}
							placeholder="Ex.: R410A, R32"
							disabled={salvar.isPending}
						/>
						<datalist id="olli-refrigerantes">
							{REFRIGERANTES_SUGERIDOS.map((r) => (
								<option key={r} value={r} />
							))}
						</datalist>
					</Campo>

					<Campo rotulo="Localização" dica="Curta — é o que cabe no adesivo." className="sm:col-span-2">
						<Input
							value={localizacao}
							onChange={(e) => setLocalizacao(e.target.value)}
							placeholder="Ex.: Sala 302 - 3º andar"
							disabled={salvar.isPending}
						/>
					</Campo>

					<Campo rotulo="Patrimônio" dica="O código que o CLIENTE usa." className="sm:col-span-2">
						<Input
							value={patrimonio}
							onChange={(e) => setPatrimonio(e.target.value)}
							placeholder="Ex.: PAT-0099"
							disabled={salvar.isPending}
						/>
					</Campo>
				</div>
			</form>
		</FormDialog>
	);
}
