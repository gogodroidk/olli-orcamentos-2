/**
 * FORMULÁRIO DE AGENDAMENTO — criar e editar.
 *
 * Três decisões que valem a leitura:
 *
 * 1. `clienteNome` é NOT NULL no banco, mas o CLIENTE é OPCIONAL (o app deixa
 *    marcar visita para quem ainda não está cadastrado). Reproduzimos o app
 *    (`AgendaScreen`, ~linha 365): sem cliente escolhido e sem nome avulso, grava
 *    "Sem cliente". Nunca string vazia — a coluna recusaria e o agendamento sumiria.
 *
 * 2. `fim` é OPCIONAL e continua opcional. É tentador preencher com "início + 1h"
 *    para o calendário ficar bonito, mas isso GRAVA um horário de término que
 *    ninguém marcou — e o celular passaria a mostrar um fim inventado. O fim vazio
 *    vira duração ESTIMADA só na hora de DESENHAR (ver `dominio.ts`).
 *
 * 3. CONFLITO É AVISO, NÃO BLOQUEIO. O dono pode ter dois técnicos, ou pode estar
 *    remarcando de propósito. A tela informa e deixa ele decidir.
 */
import type { Agendamento, StatusAgendamento, TipoAgendamento } from "@dominio";
import { STATUS_AGENDAMENTO_LABELS, TIPOS_AGENDAMENTO } from "@dominio";
import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "@/components/icon/icon";
import { Campo } from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import SeletorCliente, { type ClienteSelecionado } from "@/olli/components/SeletorCliente";
import { novoId } from "@/olli/contrato";
import { agoraIso, localParaIso } from "@/olli/datas";
import { useSalvar } from "@/olli/mutacoes";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Textarea } from "@/ui/textarea";
import {
	duracaoEstimadaMin,
	encontrarConflito,
	faixaDeHorario,
	ICONE_TIPO,
	INFO_TIPO,
	isoParaInputLocal,
	paraInputLocal,
	rotuloDuracao,
} from "./dominio";

const STATUS: StatusAgendamento[] = ["agendado", "concluido", "cancelado"];

interface Props {
	aberto: boolean;
	aoFechar: () => void;
	/** Editando um existente; `null` = novo. */
	agendamento: Agendamento | null;
	/** Novo agendamento: horário clicado no calendário (já vem preenchido). */
	inicioSugerido?: Date | null;
	/** Todos os agendamentos ativos — só para AVISAR de conflito. */
	todos: Agendamento[];
	aoSalvar?: (a: Agendamento) => void;
}

interface Rascunho {
	cliente: ClienteSelecionado | null;
	/** Nome digitado quando o cliente não está cadastrado (o app permite). */
	clienteAvulso: string;
	titulo: string;
	tipo: TipoAgendamento;
	inicio: string; // 'YYYY-MM-DDTHH:mm' (local)
	fim: string; // idem, ou ""
	endereco: string;
	status: StatusAgendamento;
	observacao: string;
}

/** Novo agendamento nasce no horário clicado — ou às 09:00, como no app. */
function rascunhoNovo(inicioSugerido?: Date | null): Rascunho {
	const base = inicioSugerido ?? new Date(new Date().setHours(9, 0, 0, 0));
	return {
		cliente: null,
		clienteAvulso: "",
		titulo: "",
		tipo: "visita",
		inicio: paraInputLocal(base),
		fim: "",
		endereco: "",
		status: "agendado",
		observacao: "",
	};
}

function rascunhoDe(a: Agendamento): Rascunho {
	return {
		cliente: a.clienteId ? { clienteId: a.clienteId, clienteNome: a.clienteNome, clienteTelefone: "" } : null,
		clienteAvulso: a.clienteId ? "" : a.clienteNome,
		titulo: a.titulo,
		tipo: a.tipo,
		inicio: isoParaInputLocal(a.inicio),
		fim: isoParaInputLocal(a.fim),
		endereco: a.endereco ?? "",
		status: a.status,
		observacao: a.observacao ?? "",
	};
}

export default function FormAgendamento({ aberto, aoFechar, agendamento, inicioSugerido, todos, aoSalvar }: Props) {
	const formId = useId();
	const salvar = useSalvar("agendamentos");

	const [r, setR] = useState<Rascunho>(() => rascunhoNovo(inicioSugerido));
	const [erros, setErros] = useState<Record<string, string>>({});

	// `reset` limpa o erro da tentativa ANTERIOR de gravar. Fica numa ref, e não nas
	// dependências do efeito abaixo, por um motivo bem concreto: o objeto devolvido
	// pelo `useMutation` muda a cada mutação, e um efeito que dependesse dele
	// re-rodaria NO MEIO DA DIGITAÇÃO — apagando o formulário do usuário sozinho.
	const resetarErro = useRef(salvar.reset);
	resetarErro.current = salvar.reset;

	// Reabrir o diálogo tem que RECARREGAR o registro. Sem isto, abrir "editar" logo
	// depois de outro "editar" mostraria os dados do agendamento ANTERIOR — e o
	// usuário salvaria por cima do errado.
	useEffect(() => {
		if (!aberto) return;
		setR(agendamento ? rascunhoDe(agendamento) : rascunhoNovo(inicioSugerido));
		setErros({});
		resetarErro.current();
	}, [aberto, agendamento, inicioSugerido]);

	const set = (patch: Partial<Rascunho>) => setR((atual) => ({ ...atual, ...patch }));

	/* ─────────────────  Conflito: aviso, calculado ao vivo  ───────────────── */
	const conflito = useMemo(() => {
		const iso = localParaIso(r.inicio);
		if (!iso) return null;
		const fimIso = r.fim ? localParaIso(r.fim) : null;
		if (r.status === "cancelado") return null; // cancelado não disputa horário
		return encontrarConflito(todos, { inicio: iso, fim: fimIso ?? undefined, tipo: r.tipo }, agendamento?.id);
	}, [todos, r.inicio, r.fim, r.tipo, r.status, agendamento?.id]);

	/* ───────────────────────────  Validação  ─────────────────────────────── */
	function validar(): boolean {
		const e: Record<string, string> = {};
		if (!r.titulo.trim()) e.titulo = "Diga o que é este compromisso.";

		const iniIso = localParaIso(r.inicio);
		if (!iniIso) e.inicio = "Informe a data e a hora de início.";

		if (r.fim) {
			const fimIso = localParaIso(r.fim);
			if (!fimIso) e.fim = "Horário de término inválido.";
			else if (iniIso && new Date(fimIso) <= new Date(iniIso)) {
				e.fim = "O término precisa ser depois do início.";
			}
		}
		setErros(e);
		return Object.keys(e).length === 0;
	}

	async function submeter(ev: React.FormEvent) {
		ev.preventDefault();
		if (!validar()) return;

		const iniIso = localParaIso(r.inicio);
		if (!iniIso) return; // já sinalizado em `erros.inicio`

		const fimIso = r.fim ? localParaIso(r.fim) : null;
		const agora = agoraIso();

		// Nome do cliente: escolhido > avulso > "Sem cliente" (a coluna é NOT NULL).
		const nome = r.cliente?.clienteNome?.trim() || r.clienteAvulso.trim() || "Sem cliente";

		// EDIÇÃO = MERGE. Partimos do objeto que veio do banco e só sobrescrevemos o
		// que a tela conhece: um agendamento pode ter `orcamentoId` (vindo do
		// celular), e montar o objeto do zero apagaria esse vínculo em silêncio.
		const base: Agendamento = agendamento
			? { ...agendamento }
			: {
					id: novoId(),
					clienteNome: nome,
					titulo: "",
					tipo: r.tipo,
					inicio: iniIso,
					status: "agendado",
					criadoEm: agora,
					atualizadoEm: agora,
				};

		const obj: Agendamento = {
			...base,
			clienteNome: nome,
			titulo: r.titulo.trim(),
			tipo: r.tipo,
			inicio: iniIso,
			status: r.status,
			atualizadoEm: agora,
		};

		// Chaves opcionais: presença/ausência, nunca `null` (regra 4 do projeto).
		if (r.cliente?.clienteId) obj.clienteId = r.cliente.clienteId;
		else delete obj.clienteId;

		if (fimIso) obj.fim = fimIso;
		else delete obj.fim; // "sem término definido" é ausência, não fim = início

		if (r.endereco.trim()) obj.endereco = r.endereco.trim();
		else delete obj.endereco;

		if (r.observacao.trim()) obj.observacao = r.observacao.trim();
		else delete obj.observacao;

		await salvar.mutateAsync(obj);
		aoSalvar?.(obj);
		aoFechar();
	}

	const duracaoTipo = rotuloDuracao(duracaoEstimadaMin(r.tipo));

	return (
		<FormDialog
			aberto={aberto}
			aoFechar={aoFechar}
			titulo={agendamento ? "Editar agendamento" : "Novo agendamento"}
			descricao={agendamento ? undefined : "Clique num horário do calendário para já vir preenchido."}
			formId={formId}
			salvando={salvar.isPending}
			erro={salvar.isError ? ((salvar.error as Error)?.message ?? "Não foi possível salvar.") : null}
			rotuloSalvar={agendamento ? "Salvar alterações" : "Agendar"}
		>
			<form id={formId} onSubmit={submeter} className="space-y-4">
				{/* ─── Cliente (opcional, como no app) ─── */}
				<Campo rotulo="Cliente" dica="Opcional. Deixe em branco para um compromisso interno.">
					<SeletorCliente
						valor={r.cliente}
						aoSelecionar={(c) =>
							set({
								cliente: c,
								clienteAvulso: "",
								// Só PREENCHE o vazio — nunca sobrescreve um endereço que o
								// usuário já ajustou (o serviço pode não ser no endereço do
								// cadastro). Mesma regra do app.
								endereco: r.endereco.trim() || c.clienteEndereco || "",
							})
						}
					/>
				</Campo>

				{!r.cliente?.clienteId && (
					<Campo rotulo="Ou o nome de quem vai ser atendido" dica="Para quem ainda não está cadastrado.">
						<Input
							value={r.clienteAvulso}
							onChange={(e) => set({ clienteAvulso: e.target.value })}
							placeholder="Sem cliente"
						/>
					</Campo>
				)}

				{/* ─── Título (obrigatório) ─── */}
				<Campo rotulo="Título" obrigatorio erro={erros.titulo}>
					<Input
						value={r.titulo}
						onChange={(e) => set({ titulo: e.target.value })}
						placeholder="Ex.: Limpeza dos 2 splits da sala"
						aria-invalid={!!erros.titulo}
						autoFocus
					/>
				</Campo>

				{/* ─── Tipo (rótulo, cor e ícone vêm do domínio) ─── */}
				<Campo rotulo="Tipo" dica={`Define a cor no calendário e a duração estimada (${duracaoTipo}).`}>
					<Select value={r.tipo} onValueChange={(v) => set({ tipo: v as TipoAgendamento })}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TIPOS_AGENDAMENTO.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									<span className="flex items-center gap-2">
										<span
											aria-hidden="true"
											className="size-2.5 shrink-0 rounded-full"
											style={{ backgroundColor: t.color }}
										/>
										<Icon icon={ICONE_TIPO[t.id]} size={16} className="shrink-0 text-text-secondary" />
										{t.label}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Campo>

				{/* ─── Início / fim ─── */}
				{/* Dois `datetime-local` lado a lado, sem `htmlFor` do `Campo` (o rótulo
				    visível não está associado ao input — ver pendência de campos.tsx):
				    sem `aria-label`, um leitor de tela anuncia os dois como "editar data"
				    idênticos, sem dizer qual é início e qual é término. */}
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="Início" obrigatorio erro={erros.inicio}>
						<Input
							type="datetime-local"
							aria-label="Início"
							value={r.inicio}
							onChange={(e) => set({ inicio: e.target.value })}
							aria-invalid={!!erros.inicio}
						/>
					</Campo>

					<Campo
						rotulo="Término"
						erro={erros.fim}
						dica={r.fim ? undefined : `Sem término: o calendário estima ${duracaoTipo}.`}
					>
						<Input
							type="datetime-local"
							aria-label="Término"
							value={r.fim}
							min={r.inicio || undefined}
							onChange={(e) => set({ fim: e.target.value })}
							aria-invalid={!!erros.fim}
						/>
					</Campo>
				</div>

				{/* CONFLITO — avisa, não impede. */}
				{conflito && (
					<p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
						<AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
						<span>
							Esse horário colide com <strong className="font-semibold">{conflito.titulo}</strong> (
							{faixaDeHorario(conflito)}). Dá para salvar assim mesmo — só confira se é isso mesmo.
						</span>
					</p>
				)}

				{/* ─── Endereço ─── */}
				<Campo rotulo="Endereço" dica="Onde o serviço acontece. Preenchido do cliente, se houver.">
					<Input
						value={r.endereco}
						onChange={(e) => set({ endereco: e.target.value })}
						placeholder="Rua, número, bairro…"
					/>
				</Campo>

				{/* ─── Status ─── */}
				<Campo rotulo="Status">
					<Select value={r.status} onValueChange={(v) => set({ status: v as StatusAgendamento })}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STATUS.map((s) => (
								<SelectItem key={s} value={s}>
									{STATUS_AGENDAMENTO_LABELS[s]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Campo>

				{/* ─── Observação ─── */}
				<Campo rotulo="Observação">
					<Textarea
						value={r.observacao}
						onChange={(e) => set({ observacao: e.target.value })}
						rows={3}
						placeholder="Portão azul, cachorro no quintal, levar escada…"
					/>
				</Campo>

				{/* Referência silenciosa do INFO_TIPO para a cor do cabeçalho do tipo escolhido. */}
				<p className="flex items-center gap-2 text-xs text-text-secondary">
					<span
						aria-hidden="true"
						className="size-2 rounded-full"
						style={{ backgroundColor: INFO_TIPO[r.tipo].color }}
					/>
					No calendário, este compromisso aparece como <strong>{INFO_TIPO[r.tipo].label}</strong>.
				</p>
			</form>
		</FormDialog>
	);
}
