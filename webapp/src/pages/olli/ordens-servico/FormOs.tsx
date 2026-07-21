/**
 * FORMULÁRIO DE ORDEM DE SERVIÇO — criar e editar.
 *
 * O que este arquivo protege (cada item já mordeu o projeto ou morderia):
 *
 * 1. NÚMERO SÓ NO SALVAR. `proximoNumeroOs()` deriva do MAIOR sufixo existente
 *    (inclusive lixeira). Chamar ao ABRIR queimaria o número de quem desistisse.
 *
 * 2. RELEITURA ANTES DE GRAVAR. `ordens_servico` não tem blob, mas tem colunas que
 *    o CELULAR escreve em campo: `fotos` e `checklist`. O upsert sobrescreve a
 *    coluna inteira — então salvamos sobre a linha FRESCA (ver `carregarOsFresca`),
 *    mesclando só os campos deste formulário. Sem isso, o dono editando o título no
 *    painel apagaria as fotos que o técnico acabou de tirar.
 *
 * 3. CHECKLIST NO FORMATO EXATO `{id, texto, feito}` — é o que o app lê em campo.
 *
 * 4. TÉCNICO: se a equipe não carregar, o técnico já atribuído CONTINUA na tela e
 *    é preservado ao salvar. "Não sei quem é a equipe" nunca pode virar
 *    "esta OS não tem responsável".
 *
 * 5. FOTOS são LEITURA. O painel mostra a contagem; quem anexa é o celular.
 */
import type { ItemChecklist, OrdemServico, StatusOS } from "@dominio";
import { STATUS_OS_LABELS } from "@dominio";
import { AlertTriangle, Camera, Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Campo, CampoMoeda } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import SeletorCliente, { type ClienteSelecionado } from "@/olli/components/SeletorCliente";
import { novoId } from "@/olli/contrato";
import { agoraIso, localParaIso } from "@/olli/datas";
import { proximoNumeroOs, useSalvar } from "@/olli/mutacoes";
import { useUserInfo } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Textarea } from "@/ui/textarea";
import { carregarOsFresca } from "./linha";
import { type Membro, PAPEL_ROTULO, useTecnicos } from "./useTecnicos";

/** Todos os status, na ordem lógica do fluxo (a do próprio tipo em `@dominio`). */
const STATUS: [StatusOS, string][] = Object.entries(STATUS_OS_LABELS) as [StatusOS, string][];

/** Valor-sentinela do <Select>: Radix proíbe `value=""` num item. */
const SEM_TECNICO = "__sem_tecnico__";

/** ISO → 'YYYY-MM-DDTHH:mm' (o formato do <input type="datetime-local">), no fuso LOCAL. */
function isoParaLocal(iso?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	/** A OS a editar. `null`/ausente = criar uma nova. */
	ordem?: OrdemServico | null;
}

export default function FormOs({ aberto, aoFechar, ordem }: Props) {
	const idForm = useId();
	const salvar = useSalvar("ordens_servico");
	const equipe = useTecnicos();
	const meuId = useUserInfo().id;

	const [clienteId, setClienteId] = useState<string>("");
	const [clienteNome, setClienteNome] = useState("");
	const [clienteTelefone, setClienteTelefone] = useState("");
	const [titulo, setTitulo] = useState("");
	const [descricao, setDescricao] = useState("");
	const [status, setStatus] = useState<StatusOS>("aberta");
	const [tecnicoId, setTecnicoId] = useState("");
	const [tecnicoNome, setTecnicoNome] = useState("");
	const [dataLocal, setDataLocal] = useState("");
	const [valor, setValor] = useState(0);
	const [observacoes, setObservacoes] = useState("");
	const [checklist, setChecklist] = useState<ItemChecklist[]>([]);
	const [novoItem, setNovoItem] = useState("");

	const [tentouSalvar, setTentouSalvar] = useState(false);
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	const idOs = ordem?.id ?? null;

	// O checklist SEMEADO (o que a OS tinha quando o diálogo abriu) — referência, não
	// estado: serve só para o merge no submit (ver `aoSubmeter`) saber quais itens o
	// painel de fato TOCOU (`feito` diferente do semeado) versus quais só estão na
	// tela porque vieram assim. Comparar contra isto, e não contra `ordem.checklist`
	// (que pode ter sido invalidado/refeito por um refetch enquanto o form está aberto).
	const checklistSemeadoRef = useRef<ItemChecklist[]>([]);

	// Guarda se a sugestão de técnico (ver efeito abaixo) já agiu NESTA abertura do
	// diálogo — sem isto, ela reapareceria sempre que o usuário limpasse o campo
	//("Sem técnico atribuído"), impedindo uma OS sem responsável de propósito.
	const sugestaoTecnicoAplicadaRef = useRef(false);

	// O rascunho é semeado quando o diálogo ABRE (ou troca de OS) — e SÓ então. Depender
	// dos campos de `ordem` (o que a regra pede) faria cada refetch da lista remontar o
	// objeto e JOGAR FORA o que o usuário está digitando no formulário aberto.
	// biome-ignore lint/correctness/useExhaustiveDependencies: semear só ao abrir/trocar de OS é intencional — ver comentário acima
	useEffect(() => {
		if (!aberto) return;
		setClienteId(ordem?.clienteId ?? "");
		setClienteNome(ordem?.clienteNome ?? "");
		setClienteTelefone("");
		setTitulo(ordem?.titulo ?? "");
		setDescricao(ordem?.descricao ?? "");
		setStatus(ordem?.status ?? "aberta");
		setTecnicoId(ordem?.tecnicoId ?? "");
		setTecnicoNome(ordem?.tecnicoNome ?? "");
		setDataLocal(isoParaLocal(ordem?.dataAgendada));
		setValor(ordem?.valor ?? 0);
		setObservacoes(ordem?.observacoes ?? "");
		const checklistInicial = ordem?.checklist ?? [];
		setChecklist(checklistInicial);
		checklistSemeadoRef.current = checklistInicial;
		setNovoItem("");
		setTentouSalvar(false);
		setErro(null);
		sugestaoTecnicoAplicadaRef.current = false;
	}, [aberto, idOs]);

	// Técnico pré-selecionado: só em OS NOVA (uma existente já traz `tecnicoId` do
	// banco — nem que seja "nenhum", de propósito) e só quando o usuário logado
	// consta na equipe. A equipe carrega em segundo plano, então este efeito roda de
	// novo até ela chegar; `sugestaoTecnicoAplicadaRef` garante que ele só MEXE no
	// campo uma vez por abertura — depois disso a escolha (ou a limpeza) do usuário
	// prevalece, mantendo a opção de trocar.
	useEffect(() => {
		if (!aberto || ordem) return;
		if (sugestaoTecnicoAplicadaRef.current) return;
		if (!meuId || !equipe.isSuccess) return;
		const eu = (equipe.data ?? []).find((m) => m.userId === meuId);
		if (eu) {
			setTecnicoId(eu.userId);
			setTecnicoNome(eu.nome);
		}
		sugestaoTecnicoAplicadaRef.current = true;
	}, [aberto, ordem, meuId, equipe.isSuccess, equipe.data]);

	/* ─────────────────────────────  Checklist  ──────────────────────────────── */

	function adicionarItem() {
		const texto = novoItem.trim();
		if (!texto) return;
		setChecklist((atual) => [...atual, { id: novoId(), texto, feito: false }]);
		setNovoItem("");
	}

	function alternarItem(id: string, feito: boolean) {
		setChecklist((atual) => atual.map((i) => (i.id === id ? { ...i, feito } : i)));
	}

	function editarItem(id: string, texto: string) {
		setChecklist((atual) => atual.map((i) => (i.id === id ? { ...i, texto } : i)));
	}

	function removerItem(id: string) {
		setChecklist((atual) => atual.filter((i) => i.id !== id));
	}

	const feitos = checklist.filter((i) => i.feito).length;

	/* ──────────────────────────────  Técnico  ───────────────────────────────── */

	const membros: Membro[] = equipe.data ?? [];
	// O técnico gravado pode não estar na lista: membro desativado, equipe ainda
	// carregando, ou a consulta falhou. Ele continua visível E selecionado — some
	// da tela seria o mesmo que perder a atribuição sem avisar.
	const tecnicoForaDaLista = Boolean(tecnicoId) && !membros.some((m) => m.userId === tecnicoId);

	function escolherTecnico(v: string) {
		if (v === SEM_TECNICO) {
			setTecnicoId("");
			setTecnicoNome("");
			return;
		}
		const m = membros.find((x) => x.userId === v);
		if (m) {
			setTecnicoId(m.userId);
			setTecnicoNome(m.nome);
		}
	}

	/* ───────────────────────────────  Salvar  ───────────────────────────────── */

	const nomeLimpo = clienteNome.trim();
	const tituloLimpo = titulo.trim();
	const faltaCliente = !nomeLimpo;
	const faltaTitulo = !tituloLimpo;

	async function aoSubmeter(e: React.FormEvent) {
		e.preventDefault();
		setTentouSalvar(true);
		setErro(null);
		if (faltaCliente || faltaTitulo) return;

		setSalvando(true);
		try {
			// Itens sem texto não vão para o celular (linha em branco no checklist do técnico).
			const itens: ItemChecklist[] = checklist
				.map((i) => ({ id: i.id, texto: i.texto.trim(), feito: i.feito }))
				.filter((i) => i.texto.length > 0);

			// TODOS os campos editáveis, sempre presentes: `undefined` é como se APAGA
			// (o contrato grava `?? null`). Se a chave fosse omitida quando vazia, o
			// spread sobre a linha fresca manteria o valor antigo e limpar uma data
			// seria impossível.
			const campos = {
				clienteId: clienteId || undefined,
				clienteNome: nomeLimpo,
				titulo: tituloLimpo,
				descricao: descricao.trim() || undefined,
				status,
				tecnicoId: tecnicoId || undefined,
				tecnicoNome: tecnicoId ? tecnicoNome || undefined : undefined,
				dataAgendada: localParaIso(dataLocal) ?? undefined,
				checklist: itens,
				observacoes: observacoes.trim() || undefined,
				// 0 = "não informado" (é o zero do CampoMoeda), não uma OS de R$ 0,00.
				valor: valor > 0 ? valor : undefined,
				atualizadoEm: agoraIso(),
			};

			let os: OrdemServico;
			if (ordem) {
				// Relê do banco e mescla: fotos, orçamento de origem, número, criadoEm e
				// o estado da lixeira vêm da linha FRESCA — não do que a lista carregou.
				const fresca = await carregarOsFresca(ordem.id);

				// CHECKLIST: NÃO dá pra usar `campos.checklist` puro por cima do fresco —
				// ele é a foto do que a tela tinha ao ABRIR mais as edições feitas aqui, e
				// sobrescreveria de volta o `feito` que o técnico marcou no celular DEPOIS
				// que este formulário abriu. Mescla por `id`: um item cujo `feito` o painel
				// não tocou (== o valor semeado) herda o FRESCO; um item que o painel tocou
				// (marcou/desmarcou aqui) usa o do painel. Texto sempre vem do painel — é o
				// único lugar que o edita. Item novo (sem semente) não tem o que herdar: usa
				// o do painel.
				const semeadoPorId = new Map(checklistSemeadoRef.current.map((i) => [i.id, i]));
				const frescoPorId = new Map(fresca.checklist.map((i) => [i.id, i]));
				const checklistMesclado: ItemChecklist[] = itens.map((item) => {
					const semeado = semeadoPorId.get(item.id);
					const fresco = frescoPorId.get(item.id);
					const painelTocouFeito = !semeado || semeado.feito !== item.feito;
					return {
						id: item.id,
						texto: item.texto,
						feito: painelTocouFeito || !fresco ? item.feito : fresco.feito,
					};
				});
				os = { ...fresca, ...campos, checklist: checklistMesclado };
			} else {
				os = {
					id: novoId(),
					numero: await proximoNumeroOs(), // só agora: abrir e desistir não queima número
					fotos: [],
					criadoEm: agoraIso(),
					...campos,
				};
			}

			await salvar.mutateAsync(os);
			aoFechar();
		} catch (e2) {
			setErro((e2 as Error)?.message ?? "Não consegui salvar a ordem de serviço. Tente de novo.");
		} finally {
			setSalvando(false);
		}
	}

	const qtdFotos = ordem?.fotos.length ?? 0;

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			largo
			titulo={ordem ? `Editar ordem ${ordem.numero || ""}`.trim() : "Nova ordem de serviço"}
			descricao={
				ordem
					? "As fotos tiradas em campo são preservadas. No checklist, um item que o técnico marcou no celular depois que este formulário abriu é mantido — a não ser que você mude aquele item aqui."
					: "O número (OS-0001) é gerado no momento de salvar."
			}
			erro={erro}
			salvando={salvando}
			formId={idForm}
			rotuloSalvar={ordem ? "Salvar alterações" : "Criar ordem"}
		>
			<form id={idForm} onSubmit={aoSubmeter} className="space-y-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo
						rotulo="Cliente"
						obrigatorio
						erro={tentouSalvar && faltaCliente ? "Escolha o cliente desta ordem." : undefined}
					>
						<SeletorCliente
							valor={
								clienteId
									? ({
											clienteId,
											clienteNome,
											clienteTelefone,
										} satisfies ClienteSelecionado)
									: null
							}
							aoSelecionar={(c) => {
								setClienteId(c.clienteId);
								setClienteNome(c.clienteNome);
								setClienteTelefone(c.clienteTelefone);
							}}
							invalido={tentouSalvar && faltaCliente}
							disabled={salvando}
						/>
						{/* OS criada no celular pode ter o nome DIGITADO, sem cliente cadastrado.
						    Mostramos o nome que está gravado para ele não sumir da tela — e ele
						    é preservado se o usuário não escolher um cliente da base. */}
						{!clienteId && nomeLimpo && (
							<p className="mt-1.5 text-xs text-text-secondary">
								Nome gravado nesta ordem: <strong className="text-text-primary">{nomeLimpo}</strong> (sem cadastro
								vinculado). Escolha um cliente acima para vincular, ou deixe como está.
							</p>
						)}
					</Campo>

					<Campo
						rotulo="Título"
						obrigatorio
						erro={tentouSalvar && faltaTitulo ? "Dê um título ao serviço." : undefined}
						dica="Ex.: Manutenção preventiva — Split 12.000 BTU"
					>
						<Input
							value={titulo}
							onChange={(e) => setTitulo(e.target.value)}
							placeholder="O que será feito"
							disabled={salvando}
							aria-invalid={tentouSalvar && faltaTitulo}
							maxLength={140}
						/>
					</Campo>
				</div>

				<Campo rotulo="Descrição">
					<Textarea
						value={descricao}
						onChange={(e) => setDescricao(e.target.value)}
						placeholder="Detalhes do serviço a executar"
						rows={3}
						disabled={salvando}
					/>
				</Campo>

				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="Status">
						<Select value={status} onValueChange={(v) => setStatus(v as StatusOS)} disabled={salvando}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STATUS.map(([valor2, rotulo]) => (
									<SelectItem key={valor2} value={valor2}>
										{rotulo}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>

					<Campo rotulo="Técnico responsável">
						<Select
							value={tecnicoId || SEM_TECNICO}
							onValueChange={escolherTecnico}
							disabled={salvando || equipe.isLoading}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={SEM_TECNICO}>Sem técnico atribuído</SelectItem>
								{tecnicoForaDaLista && (
									<SelectItem value={tecnicoId}>
										{tecnicoNome || "Técnico atual"}
										{equipe.isSuccess ? " (fora da equipe atual)" : ""}
									</SelectItem>
								)}
								{membros.map((m) => (
									<SelectItem key={m.userId} value={m.userId}>
										{m.nome} · {PAPEL_ROTULO[m.papel] ?? m.papel}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{/* 3 estados da equipe. ERRO NUNCA VIRA "sem equipe": diz que falhou,
						    oferece "Tentar de novo" e mantém o técnico já atribuído. */}
						{equipe.isLoading && (
							<p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
								<Loader2 className="size-3 animate-spin" />
								Carregando a equipe…
							</p>
						)}
						{equipe.isError && (
							<div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-error/10 px-2.5 py-1.5">
								<AlertTriangle className="size-3.5 shrink-0 text-error" />
								<p className="text-xs text-text-primary">
									Não consegui carregar a equipe.{" "}
									{tecnicoId ? "O técnico já atribuído foi mantido." : "Você ainda pode salvar sem técnico."}
								</p>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="h-7 px-2 text-xs"
									onClick={() => equipe.refetch()}
									disabled={equipe.isFetching}
								>
									{equipe.isFetching ? (
										<Loader2 className="mr-1 size-3 animate-spin" />
									) : (
										<RotateCw className="mr-1 size-3" />
									)}
									Tentar de novo
								</Button>
							</div>
						)}
						{equipe.isSuccess && membros.length === 0 && (
							<p className="mt-1.5 text-xs text-text-secondary">
								Você ainda não tem equipe cadastrada — a ordem fica sem técnico.
							</p>
						)}
					</Campo>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="Data agendada" dica="Data e hora da visita. Deixe em branco se ainda não há agendamento.">
						<Input
							type="datetime-local"
							value={dataLocal}
							onChange={(e) => setDataLocal(e.target.value)}
							disabled={salvando}
						/>
					</Campo>

					<Campo rotulo="Valor" dica="Deixe zerado quando o valor ainda não estiver definido.">
						<CampoMoeda valor={valor} aoMudar={setValor} disabled={salvando} />
					</Campo>
				</div>

				{/* ─────────────────────────  CHECKLIST  ───────────────────────── */}
				<fieldset className="rounded-xl border border-border p-3.5">
					<legend className="px-1.5 text-sm font-medium text-text-primary">
						Checklist de execução
						{checklist.length > 0 && (
							<span className="ml-2 text-xs font-normal tabular-nums text-text-secondary">
								{feitos} de {checklist.length} {feitos === 1 ? "concluído" : "concluídos"}
							</span>
						)}
					</legend>

					<p className="mb-3 text-xs text-text-secondary">O técnico vê e marca estes passos no celular, em campo.</p>

					{checklist.length > 0 && (
						<ul className="mb-3 space-y-2">
							{checklist.map((item) => (
								<li key={item.id} className="flex items-center gap-2.5">
									<Checkbox
										checked={item.feito}
										onCheckedChange={(v) => alternarItem(item.id, v === true)}
										disabled={salvando}
										aria-label={`Marcar "${item.texto || "item sem texto"}" como concluído`}
									/>
									<Input
										value={item.texto}
										onChange={(e) => editarItem(item.id, e.target.value)}
										disabled={salvando}
										aria-label="Texto do item do checklist"
										maxLength={160}
										className="h-9 flex-1"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-9 shrink-0 text-text-secondary hover:text-error"
										onClick={() => removerItem(item.id)}
										disabled={salvando}
										aria-label={`Remover "${item.texto || "item sem texto"}" do checklist`}
									>
										<Trash2 className="size-4" />
									</Button>
								</li>
							))}
						</ul>
					)}

					<div className="flex items-center gap-2">
						<Input
							value={novoItem}
							onChange={(e) => setNovoItem(e.target.value)}
							onKeyDown={(e) => {
								// Enter aqui ADICIONA o item — sem isto ele submeteria o formulário
								// inteiro e o passo digitado se perderia.
								if (e.key === "Enter") {
									e.preventDefault();
									adicionarItem();
								}
							}}
							placeholder="Novo passo (ex.: Limpar filtros)"
							disabled={salvando}
							aria-label="Novo item do checklist"
							maxLength={160}
							className="h-9"
						/>
						<Button
							type="button"
							variant="outline"
							onClick={adicionarItem}
							disabled={salvando || !novoItem.trim()}
							className="h-9 shrink-0"
						>
							<Plus className="mr-1.5 size-4" />
							Adicionar
						</Button>
					</div>
				</fieldset>

				<Campo rotulo="Observações">
					<Textarea
						value={observacoes}
						onChange={(e) => setObservacoes(e.target.value)}
						placeholder="Anotações internas sobre esta ordem"
						rows={2}
						disabled={salvando}
					/>
				</Campo>

				{/* FOTOS: leitura. Quem anexa é o app do técnico — o painel só conta. */}
				{ordem && (
					<div className="flex items-center gap-2.5 rounded-xl bg-bg-neutral/60 px-3.5 py-3">
						<Camera className="size-4 shrink-0 text-text-secondary" />
						<p className="text-sm text-text-secondary">
							{qtdFotos === 0 ? (
								"Nenhuma foto anexada."
							) : (
								<>
									<strong className="font-semibold tabular-nums text-text-primary">{qtdFotos}</strong>{" "}
									{qtdFotos === 1 ? "foto anexada" : "fotos anexadas"} pelo aplicativo.
								</>
							)}{" "}
							As fotos são tiradas em campo, no celular — elas continuam intactas ao salvar aqui.
						</p>
					</div>
				)}
			</form>
		</FormDialog>
	);
}
