/**
 * AGENDA — calendário de verdade (era uma lista genérica).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AS QUATRO DECISÕES QUE EXPLICAM ESTA TELA
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. NO CELULAR, ROTEIRO — NÃO GRADE. A grade de 24h num telefone é um acordeão de
 *    2mm por hora: ninguém acha o compromisso das 14h sem dar zoom. O padrão no
 *    celular é o ROTEIRO DO DIA (lista), que é como o técnico realmente usa a
 *    agenda: "o que eu faço agora, e o que vem depois". A grade fica no desktop.
 *
 * 2. ARRASTAR É ATALHO, NUNCA O ÚNICO CAMINHO. Arrastar não existe no teclado nem
 *    no toque. Por isso TODO evento tem um botão "⋮" (focável, na ordem de tabulação)
 *    com "Reagendar…" — e é o mesmo código que o arrasto chama. Se um dia o arrasto
 *    quebrar, a agenda continua funcionando.
 *
 * 3. O ARRASTO É OTIMISTA, MAS NÃO É CEGO. O bloco vai para o novo horário na hora
 *    (senão parece travado), o cache é atualizado junto — e se o Supabase recusar,
 *    o evento VOLTA para onde estava e um aviso aparece. O pecado aqui seria deixar
 *    o evento no lugar novo depois da falha: o dono acharia que remarcou, e o
 *    técnico apareceria no horário velho.
 *
 * 4. ERRO NUNCA VIRA CALENDÁRIO VAZIO. Um calendário limpo é uma FRASE — diz "você
 *    não tem nada marcado". Se a consulta falhou, dizer isso é mentir para quem tem
 *    3 visitas amanhã. Falha ⇒ painel de erro + "Tentar de novo". (Regra 8 da casa.)
 */

import type { Agendamento } from "@dominio";
import { STATUS_AGENDAMENTO_LABELS, TIPOS_AGENDAMENTO } from "@dominio";
import type { EventClickArg, EventContentArg, EventDropArg, EventInput } from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	CalendarDays,
	CalendarPlus,
	Check,
	ChevronLeft,
	ChevronRight,
	Clock,
	Loader2,
	MapPin,
	MoreVertical,
	Pencil,
	RotateCcw,
	RotateCw,
	Trash2,
	Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/icon/icon";
import { useMediaQuery } from "@/hooks";
import ConfirmarExclusao from "@/olli/components/ConfirmarExclusao";
import { Campo } from "@/olli/components/campos";
import { useOlliList } from "@/olli/data";
import { agoraIso, localParaIso } from "@/olli/datas";
import { useExcluir, useSalvar } from "@/olli/mutacoes";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/utils";
import "./agenda.css";
import {
	corDeFundo,
	diaLongo,
	duracaoEstimadaMin,
	encontrarConflito,
	faixaDeHorario,
	fimEfetivo,
	hhmm,
	horarioDoDia,
	ICONE_TIPO,
	INFO_TIPO,
	isoParaInputLocal,
	type LinhaAgendamento,
	linhaParaAgendamento,
	paraInputLocal,
	rotuloDuracao,
	semHoraMarcada,
} from "./dominio";
import FormAgendamento from "./FormAgendamento";

/* ───────────────────────────────  As visões  ───────────────────────────────── */

type Vista = "timeGridWeek" | "dayGridMonth" | "timeGridDay" | "listDay" | "listWeek";

const VISTAS_DESKTOP: { v: Vista; label: string }[] = [
	{ v: "dayGridMonth", label: "Mês" },
	{ v: "timeGridWeek", label: "Semana" },
	{ v: "timeGridDay", label: "Dia" },
];

// No celular NENHUMA opção abre a régua de 24h — nem por engano. "Roteiro" é o dia
// em lista; "Semana" é a semana em lista. O mês cabe (é uma grade de dias, não de horas).
const VISTAS_CELULAR: { v: Vista; label: string }[] = [
	{ v: "listDay", label: "Roteiro do dia" },
	{ v: "listWeek", label: "Semana" },
	{ v: "dayGridMonth", label: "Mês" },
];

const ehLista = (v: Vista) => v.startsWith("list");

/** Mensagem de erro legível — o objeto de erro cru não diz nada ao dono. */
function mensagemDeErro(e: unknown, padrao: string): string {
	const m = (e as Error)?.message;
	return m?.trim() ? m : padrao;
}

const ESQUELETOS = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"];

export default function AgendaPage() {
	const calRef = useRef<FullCalendar | null>(null);
	const qc = useQueryClient();
	const ehCelular = useMediaQuery({ maxWidth: 768 });

	/* ────────────────────────────  Dados  ──────────────────────────── */
	const { data, isLoading, isError, error, refetch, isFetching } = useOlliList<LinhaAgendamento>("agendamentos", {
		orderBy: "inicio",
		ascending: true,
	});

	const itens = useMemo<Agendamento[]>(() => (data ?? []).map(linhaParaAgendamento), [data]);

	/* ──────────────────────────  Estado da tela  ────────────────────── */
	const [vistaEscolhida, setVistaEscolhida] = useState<Vista | null>(null);
	// MÊS é o padrão do desktop: é a visão que dá o panorama do compromisso — a
	// grade de horas (Semana/Dia) fica a um clique, para quando o dono já sabe o dia.
	const vista: Vista = vistaEscolhida ?? (ehCelular ? "listDay" : "dayGridMonth");
	const opcoesDeVista = ehCelular ? VISTAS_CELULAR : VISTAS_DESKTOP;

	const [periodo, setPeriodo] = useState("");

	const [formAberto, setFormAberto] = useState(false);
	const [editando, setEditando] = useState<Agendamento | null>(null);
	const [inicioSugerido, setInicioSugerido] = useState<Date | null>(null);

	const [menuDe, setMenuDe] = useState<Agendamento | null>(null);
	const [reagendando, setReagendando] = useState<Agendamento | null>(null);
	const [excluindo, setExcluindo] = useState<Agendamento | null>(null);

	/** Falha do ARRASTO. Fica na tela (não em toast): o evento voltou de lugar e o
	 *  usuário precisa entender por quê — um toast some antes de ele olhar. */
	const [erroMover, setErroMover] = useState<string | null>(null);

	/** Falha de "Marcar como concluído" (disparada de DENTRO do menu do evento).
	 *  Não reaproveita `erroMover`: aquele banner vive na página, atrás do <Dialog>
	 *  do menu — com overlay por cima, o dono não vê o aviso e acha que travou. Este
	 *  erro é renderizado DENTRO do próprio diálogo. */
	const [erroMenu, setErroMenu] = useState<string | null>(null);

	const salvar = useSalvar("agendamentos");
	const excluir = useExcluir("agendamentos");

	/* ───────────  Trocar de visão quando o dispositivo muda de faixa  ───────── */
	// O celular não pode acabar num `timeGridWeek` porque o usuário escolheu isso no
	// desktop e depois girou o tablet. Ao entrar no celular, uma visão de grade cai
	// para o roteiro.
	useEffect(() => {
		if (ehCelular && vistaEscolhida && !VISTAS_CELULAR.some((o) => o.v === vistaEscolhida)) {
			setVistaEscolhida("listDay");
		}
		// Espelho da checagem acima: uma vista só-celular (listDay, e também listWeek —
		// "Semana" no celular é lista, não grade) escolhida no telefone não existe entre
		// as opções do desktop. Sem generalizar para QUALQUER vista fora de
		// VISTAS_DESKTOP (e não só "listDay"), voltar ao desktop vindo de "Semana"
		// deixava o seletor sem nenhum botão marcado como ativo.
		if (!ehCelular && vistaEscolhida && !VISTAS_DESKTOP.some((o) => o.v === vistaEscolhida)) {
			setVistaEscolhida(null);
		}
	}, [ehCelular, vistaEscolhida]);

	useEffect(() => {
		calRef.current?.getApi()?.changeView(vista);
	}, [vista]);

	/* ─────────────────────────  Navegar no tempo  ───────────────────── */
	const api = () => calRef.current?.getApi();

	/* ───────────────────  Eventos do calendário (o mapa)  ───────────── */
	const eventos = useMemo<EventInput[]>(
		() =>
			itens.map((a) => {
				const info = INFO_TIPO[a.tipo];
				const semHora = semHoraMarcada(a);
				// "Estimado" = tem hora de início, mas ninguém marcou o fim. O bloco usa a
				// duração do TIPO só para ter altura; a borda tracejada conta a verdade.
				const estimado = !a.fim && !semHora;
				return {
					id: a.id,
					title: a.titulo,
					start: a.inicio,
					// Sem hora marcada = faixa do topo (sem fim). Com hora = fim real ou estimado,
					// JAMAIS duração zero (bloco de 0px = compromisso invisível).
					end: semHora ? undefined : fimEfetivo(a).toISOString(),
					allDay: semHora,
					backgroundColor: corDeFundo(info.color),
					borderColor: info.color,
					classNames: ["ag-evento", `ag-${a.status}`, ...(estimado ? ["ag-estimado"] : [])],
					extendedProps: { ag: a, estimado, cor: info.color },
				} satisfies EventInput;
			}),
		[itens],
	);

	/* ──────────────  REAGENDAR — o coração, e o caminho único  ──────── */
	/**
	 * Move um agendamento. É o MESMO código para o arrasto e para o "Reagendar…" do
	 * menu — o que garante que o caminho de teclado não é um primo pobre do mouse.
	 *
	 * `reverter` só existe no arrasto: é o `info.revert()` do FullCalendar, que
	 * devolve o bloco ao lugar de origem quando a gravação falha.
	 */
	const mover = useCallback(
		async (ag: Agendamento, novoInicio: Date, novoFim: Date | null, semHora: boolean, reverter?: () => void) => {
			const atualizado: Agendamento = { ...ag, inicio: novoInicio.toISOString(), atualizadoEm: agoraIso() };
			if (novoFim && !semHora) atualizado.fim = novoFim.toISOString();
			else delete atualizado.fim; // ausência, não `null` (regra 4)

			// 1) OTIMISTA: o cache já reflete o novo horário, então a UI não "pisca de
			//    volta" enquanto o Supabase responde.
			//
			//    O `cancelQueries` vem PRIMEIRO por um motivo específico: se uma busca em
			//    andamento (disparada por um `refetch` de foco de janela, por exemplo)
			//    chegasse DEPOIS da nossa escrita otimista, ela traria a linha antiga e
			//    sobrescreveria o horário novo — o evento pularia de volta sozinho, sem
			//    erro nenhum, como se o arrasto não tivesse funcionado.
			await qc.cancelQueries({ queryKey: ["olli", "agendamentos"] });
			const anteriores = qc.getQueriesData({ queryKey: ["olli", "agendamentos"] });
			qc.setQueriesData<LinhaAgendamento[]>({ queryKey: ["olli", "agendamentos"] }, (velho) =>
				velho?.map((l) =>
					l.id === ag.id
						? { ...l, inicio: atualizado.inicio, fim: atualizado.fim ?? null, atualizado_em: atualizado.atualizadoEm }
						: l,
				),
			);
			setErroMover(null);

			try {
				await salvar.mutateAsync(atualizado);
			} catch (e) {
				// 2) ROLLBACK: cache volta ao que era E o bloco volta para o horário antigo.
				//    Sem isto, a tela mostraria um horário que o banco não tem.
				for (const [chave, valor] of anteriores) qc.setQueryData(chave, valor);
				reverter?.();
				setErroMover(
					mensagemDeErro(
						e,
						"Não foi possível reagendar. O compromisso voltou para o horário anterior — nada foi alterado.",
					),
				);
			}
		},
		[qc, salvar],
	);

	/* ─────────────────────────  Interações do FC  ───────────────────── */

	/** Clique em espaço vazio = novo agendamento já com a data/hora preenchida. */
	const aoClicarEspacoVazio = (arg: DateClickArg) => {
		const naFaixaSemHora = arg.allDay && arg.view.type.startsWith("timeGrid");
		// Na faixa "Sem hora" (topo do dia da grade), o clique cria um compromisso SEM
		// horário — que é o que aquela faixa significa. Numa célula do mês, o clique diz
		// só o DIA: aí o padrão é 09:00 (o mesmo do app do celular), e não meia-noite.
		const d = new Date(arg.date);
		if (!naFaixaSemHora && arg.allDay) d.setHours(9, 0, 0, 0);

		setEditando(null);
		setInicioSugerido(d);
		setFormAberto(true);
	};

	/** Clique no evento = editar. Exceto no "⋮", que abre o menu. */
	const aoClicarEvento = (arg: EventClickArg) => {
		// O FullCalendar escuta o clique na RAIZ dele, ou seja, ANTES do React — um
		// `stopPropagation()` no botão chegaria tarde demais. Então perguntamos de onde
		// veio o clique. Sem esta linha, tocar no "⋮" abriria o menu E o formulário.
		if ((arg.jsEvent.target as HTMLElement | null)?.closest("[data-menu-evento]")) return;
		const ag = arg.event.extendedProps.ag as Agendamento;
		setInicioSugerido(null);
		setEditando(ag);
		setFormAberto(true);
	};

	const aoArrastar = (arg: EventDropArg) => {
		const ag = arg.event.extendedProps.ag as Agendamento;
		const inicio = arg.event.start;
		if (!inicio) {
			arg.revert();
			return;
		}
		// PRESERVAR O "SEM FIM": o bloco que o usuário arrastou tinha uma duração
		// ESTIMADA (nós a inventamos para desenhar). Gravar o `end` que o FullCalendar
		// devolve materializaria esse palpite como um horário de término REAL — e o
		// celular passaria a exibir um fim que ninguém marcou. Fim só se já existia.
		const fim = ag.fim ? arg.event.end : null;

		// Soltar na faixa "Sem hora" (allDay) TIRA o horário do compromisso — inclusive
		// um término que existia. É o que a faixa significa, é o que todo calendário faz,
		// e o usuário vê o bloco mudar de lugar na hora. Reversível: basta arrastar de
		// volta para a grade, ou abrir "Editar" e digitar o horário.
		void mover(ag, inicio, fim, arg.event.allDay, () => arg.revert());
	};

	/** Esticar a borda do bloco é um ato DELIBERADO sobre o término — aqui, sim, grava. */
	const aoRedimensionar = (arg: EventResizeDoneArg) => {
		// Redimensionar só faz sentido na grade de horas. Na faixa "Sem hora" (allDay,
		// visão de mês) o bloco não tem hora nenhuma — esticá-lo gravaria um término
		// 00:00 que ninguém marcou, fingindo um horário que não existe.
		if (arg.event.allDay) {
			arg.revert();
			return;
		}
		const ag = arg.event.extendedProps.ag as Agendamento;
		const inicio = arg.event.start;
		const fim = arg.event.end;
		if (!inicio || !fim) {
			arg.revert();
			return;
		}
		void mover(ag, inicio, fim, false, () => arg.revert());
	};

	/* ────────────────────  Ações rápidas do menu do evento  ─────────── */
	const alternarConclusao = async (ag: Agendamento) => {
		const concluido = ag.status === "concluido";
		try {
			await salvar.mutateAsync({
				...ag,
				status: concluido ? "agendado" : "concluido",
				atualizadoEm: agoraIso(),
			});
			setMenuDe(null);
		} catch (e) {
			setErroMenu(mensagemDeErro(e, "Não foi possível mudar o status."));
		}
	};

	const confirmarExclusao = async () => {
		if (!excluindo) return;
		try {
			await excluir.mutateAsync(excluindo);
			setExcluindo(null);
		} catch {
			/* o erro fica visível dentro do próprio diálogo (`erro` abaixo) */
		}
	};

	/* ────────────────────────  Conteúdo do evento  ──────────────────── */
	const conteudoDoEvento = (arg: EventContentArg) => {
		const ag = arg.event.extendedProps.ag as Agendamento | undefined;
		if (!ag) return null;
		const estimado = arg.event.extendedProps.estimado as boolean;
		const cor = arg.event.extendedProps.cor as string;
		const emLista = arg.view.type.startsWith("list");

		return (
			<div className="flex w-full min-w-0 items-start gap-1.5 px-1.5 py-1">
				<Icon
					icon={ICONE_TIPO[ag.tipo]}
					size={14}
					className="mt-0.5 shrink-0"
					style={{ color: cor }}
					aria-hidden="true"
				/>

				<div className="min-w-0 flex-1">
					<div className="truncate">
						{/* Na lista, a hora já é uma COLUNA — repetir aqui só rouba espaço do título. */}
						{!emLista && !arg.event.allDay && <span className="mr-1 tabular-nums opacity-75">{hhmm(ag.inicio)}</span>}
						<span className="ag-titulo font-semibold">{ag.titulo}</span>
					</div>
					<div className="truncate text-[0.7rem] opacity-75">
						{ag.clienteNome}
						{/* `displayEventEnd:false` (ver FullCalendar acima) tira o término ESTIMADO
						    da coluna de hora do roteiro. Quando o término é REAL (ag.fim existe),
						    ele não pode simplesmente sumir — volta aqui, na linha secundária. */}
						{emLista && ag.fim && ` · até ${hhmm(ag.fim)}`}
						{estimado && ` · ≈ ${rotuloDuracao(duracaoEstimadaMin(ag.tipo))}`}
						{ag.status === "cancelado" && " · cancelado"}
					</div>
				</div>

				{/* O CAMINHO SEM MOUSE. Botão de verdade, focável, dentro da ordem de
				    tabulação — é por aqui que teclado e celular reagendam. */}
				<button
					type="button"
					data-menu-evento
					className="ag-menu-btn"
					aria-label={`Ações de ${ag.titulo}`}
					onClick={() => {
						setErroMenu(null);
						setMenuDe(ag);
					}}
				>
					<MoreVertical className="size-3.5" aria-hidden="true" />
				</button>
			</div>
		);
	};

	/* ──────────────────────────────  Render  ────────────────────────── */

	const vazio = !isLoading && !isError && itens.length === 0;

	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			{/* ───── Cabeçalho ───── */}
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="flex items-center gap-2 text-xl font-bold text-text-primary md:text-2xl">
						<CalendarDays className="size-5 text-primary" aria-hidden="true" />
						Agenda
					</h1>
					<p className="mt-0.5 text-sm text-text-secondary">
						{ehCelular
							? "Seu roteiro do dia. Toque no “⋮” de um compromisso para reagendar."
							: "Clique num horário vago para agendar. Arraste um compromisso para remarcar."}
					</p>
				</div>

				<Button
					onClick={() => {
						setEditando(null);
						setInicioSugerido(null);
						setFormAberto(true);
					}}
					className="gap-2"
				>
					<CalendarPlus className="size-4" aria-hidden="true" />
					Novo agendamento
				</Button>
			</div>

			{/* ───── Barra de controle (nossa, não a do FullCalendar) ───── */}
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-1">
					<Button variant="outline" size="icon" onClick={() => api()?.prev()} aria-label="Período anterior">
						<ChevronLeft className="size-4" aria-hidden="true" />
					</Button>
					<Button variant="outline" size="icon" onClick={() => api()?.next()} aria-label="Próximo período">
						<ChevronRight className="size-4" aria-hidden="true" />
					</Button>
					<Button variant="outline" onClick={() => api()?.today()} className="ml-1">
						Hoje
					</Button>
					<span className="ml-2 text-sm font-semibold capitalize text-text-primary md:text-base">{periodo}</span>
				</div>

				{/* Seletor de visão — semana/mês/dia no desktop; roteiro/semana/mês no celular.
				    `<fieldset>` (e não uma `div role="group"`): é o elemento que o HTML já tem
				    para "grupo de controles relacionados", e o leitor de tela anuncia a legenda
				    antes de cada botão — "Modo de visualização, Semana". */}
				<fieldset className="flex rounded-lg border border-border p-0.5">
					<legend className="sr-only">Modo de visualização</legend>
					{opcoesDeVista.map((o) => {
						const ativa = o.v === vista;
						return (
							<Button
								key={o.v}
								type="button"
								size="sm"
								variant={ativa ? "default" : "ghost"}
								aria-pressed={ativa}
								onClick={() => setVistaEscolhida(o.v)}
								className={cn("h-8 px-3 text-xs font-medium", !ativa && "text-text-secondary")}
							>
								{o.label}
							</Button>
						);
					})}
				</fieldset>
			</div>

			{/* ───── Falha do arrasto: o bloco JÁ VOLTOU; aqui explicamos por quê ───── */}
			{erroMover && (
				<div
					role="alert"
					className="mb-3 flex items-start gap-2 rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error-dark dark:text-error"
				>
					<Undo2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span className="flex-1">{erroMover}</span>
					<Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setErroMover(null)}>
						Fechar
					</Button>
				</div>
			)}

			{/* ───── 3 ESTADOS ───── */}

			{isLoading && (
				<Card className="p-4">
					<div className="space-y-3">
						<Skeleton className="h-9 w-full" />
						{ESQUELETOS.map((k) => (
							<Skeleton key={k} className="h-14 w-full" />
						))}
					</div>
					<p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
						<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						Carregando sua agenda…
					</p>
				</Card>
			)}

			{isError && (
				// ERRO ≠ AGENDA VAZIA. Um calendário limpo aqui diria "você não tem nada
				// marcado" — para quem tem 3 visitas amanhã, isso é uma mentira perigosa.
				<Card className="flex flex-col items-center gap-3 p-10 text-center">
					<AlertTriangle className="size-8 text-error" aria-hidden="true" />
					<div>
						<p className="font-semibold text-text-primary">Não foi possível carregar a agenda</p>
						<p className="mt-1 text-sm text-text-secondary">
							{mensagemDeErro(error, "Erro ao consultar os agendamentos.")}
						</p>
						<p className="mt-2 text-xs text-text-disabled">
							Isto <strong>não</strong> quer dizer que sua agenda está vazia — quer dizer que não conseguimos lê-la.
						</p>
					</div>
					<Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
						{isFetching ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<RotateCw className="size-4" aria-hidden="true" />
						)}
						Tentar de novo
					</Button>
				</Card>
			)}

			{!isLoading && !isError && (
				<>
					{vazio && (
						<div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-text-secondary">
							<Clock className="size-4 shrink-0" aria-hidden="true" />
							Nenhum compromisso agendado ainda.{" "}
							{ehCelular
								? "Toque em “Novo agendamento”."
								: "Clique num horário vago do calendário para criar o primeiro."}
						</div>
					)}

					<Card className="olli-agenda overflow-hidden p-2 md:p-3">
						<FullCalendar
							ref={calRef}
							plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
							locale={ptBrLocale}
							initialView={vista}
							headerToolbar={false} /* a barra é a nossa, acima — usa os componentes do painel */
							height={ehLista(vista) || ehCelular ? "auto" : 680}
							events={eventos}
							datesSet={(arg) => setPeriodo(arg.view.title)}
							/* ── Grade ── */
							nowIndicator
							scrollTime="07:00:00"
							slotDuration="00:30:00"
							slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
							eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
							allDaySlot
							/* O default seria "o dia todo" — que é outra coisa. Aqui a faixa é
							   dos compromissos que têm DIA mas não têm HORA. */
							allDayText="Sem hora"
							expandRows
							dayMaxEvents
							/* ── Interação ── */
							editable /* arrastar = reagendar (o menu "⋮" é o caminho equivalente) */
							eventStartEditable
							eventDurationEditable
							/* O evento NÃO é o elemento focável: quem é focável é o botão "⋮" DENTRO
							   dele. Assim o `<button>` não fica aninhado num `<a>` (HTML inválido) e
							   o teclado tem um alvo único e previsível por compromisso. */
							eventInteractive={false}
							dateClick={aoClicarEspacoVazio}
							eventClick={aoClicarEvento}
							eventDrop={aoArrastar}
							eventResize={aoRedimensionar}
							eventContent={conteudoDoEvento}
							noEventsContent="Nada agendado neste período."
							/* O ROTEIRO (lista) mostra a coluna de hora para cada evento — inclusive
							   os que não têm término REAL, cujo `end` aqui é só a duração ESTIMADA
							   (ver `fimEfetivo`). Sem isto, o roteiro do celular mostra "09:00 – 10:00"
							   como se o técnico tivesse confirmado que termina às 10h, quando 10h é
							   só o nosso palpite. O término real (quando existe) volta na linha
							   secundária do evento como "até HH:mm" — ver `conteudoDoEvento`. */
							views={{
								listDay: { displayEventEnd: false },
								listWeek: { displayEventEnd: false },
							}}
						/>
					</Card>

					{/* Legenda: a cor é um código — sem a chave, é só enfeite. */}
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
						{TIPOS_AGENDAMENTO.map((t) => (
							<span key={t.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
								<span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
								{t.label}
								<span className="text-text-disabled">({rotuloDuracao(duracaoEstimadaMin(t.id))})</span>
							</span>
						))}
						<span className="text-xs text-text-disabled">
							· borda tracejada = sem horário de término definido (a duração mostrada é estimativa)
						</span>
					</div>
				</>
			)}

			{/* ─────────────────────────  Diálogos  ───────────────────────── */}

			<FormAgendamento
				aberto={formAberto}
				aoFechar={() => setFormAberto(false)}
				agendamento={editando}
				inicioSugerido={inicioSugerido}
				todos={itens}
			/>

			<MenuDoEvento
				agendamento={menuDe}
				aoFechar={() => {
					setMenuDe(null);
					setErroMenu(null);
				}}
				aoEditar={(ag) => {
					setMenuDe(null);
					setEditando(ag);
					setInicioSugerido(null);
					setFormAberto(true);
				}}
				aoReagendar={(ag) => {
					setMenuDe(null);
					setReagendando(ag);
				}}
				aoAlternarConclusao={alternarConclusao}
				aoExcluir={(ag) => {
					setMenuDe(null);
					setExcluindo(ag);
				}}
				salvando={salvar.isPending}
				erro={erroMenu}
			/>

			<DialogReagendar
				agendamento={reagendando}
				aoFechar={() => setReagendando(null)}
				todos={itens}
				aoConfirmar={async (ag, inicio, fim, semHora) => {
					await mover(ag, inicio, fim, semHora);
					setReagendando(null);
				}}
				salvando={salvar.isPending}
			/>

			<ConfirmarExclusao
				aberto={!!excluindo}
				aoFechar={() => setExcluindo(null)}
				aoConfirmar={confirmarExclusao}
				nome={excluindo ? `${excluindo.titulo} — ${faixaDeHorario(excluindo)}` : ""}
				tipo="agendamento"
				excluindo={excluir.isPending}
				erro={excluir.isError ? mensagemDeErro(excluir.error, "Não foi possível excluir.") : null}
			/>
		</div>
	);
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * MENU DO EVENTO — o caminho que NÃO depende de arrastar.
 *
 * É um diálogo, e não um menu flutuante ancorado, de propósito: um popover preso ao
 * bloco do evento reposiciona/desmonta junto com o calendário (que redesenha a cada
 * navegação e a cada resize) — e no celular ele abriria fora da tela. O diálogo é
 * previsível, tem alvo de toque grande e já vem com foco preso e Esc de graça.
 * ═════════════════════════════════════════════════════════════════════════════ */
function MenuDoEvento({
	agendamento: ag,
	aoFechar,
	aoEditar,
	aoReagendar,
	aoAlternarConclusao,
	aoExcluir,
	salvando,
	erro,
}: {
	agendamento: Agendamento | null;
	aoFechar: () => void;
	aoEditar: (a: Agendamento) => void;
	aoReagendar: (a: Agendamento) => void;
	aoAlternarConclusao: (a: Agendamento) => void;
	aoExcluir: (a: Agendamento) => void;
	salvando: boolean;
	/** Falha de "Marcar como concluído" — precisa aparecer DENTRO do diálogo: o
	 *  banner da página fica atrás do overlay e o dono não o veria. */
	erro: string | null;
}) {
	if (!ag) return null;
	const info = INFO_TIPO[ag.tipo];
	const concluido = ag.status === "concluido";

	return (
		<Dialog open={!!ag} onOpenChange={(v) => !v && aoFechar()}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle className="flex items-start gap-2 text-left">
						<span
							aria-hidden="true"
							className="mt-1 size-3 shrink-0 rounded-full"
							style={{ backgroundColor: info.color }}
						/>
						<span className="min-w-0 flex-1 break-words">{ag.titulo}</span>
					</DialogTitle>
					<DialogDescription className="sr-only">Ações do agendamento</DialogDescription>
				</DialogHeader>

				<div className="space-y-1.5 text-sm">
					<p className="flex flex-wrap items-center gap-x-2 text-text-secondary">
						<Clock className="size-4 shrink-0" aria-hidden="true" />
						<span className="capitalize">{diaLongo(ag.inicio)}</span>
						<span className="tabular-nums">· {horarioDoDia(ag)}</span>
					</p>
					<p className="flex items-center gap-2 text-text-secondary">
						<Icon icon={ICONE_TIPO[ag.tipo]} size={16} className="shrink-0" aria-hidden="true" />
						{info.label} · {ag.clienteNome}
					</p>
					{ag.endereco && (
						<p className="flex items-start gap-2 text-text-secondary">
							<MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span className="break-words">{ag.endereco}</span>
						</p>
					)}
					<Badge variant={ag.status === "cancelado" ? "error" : concluido ? "success" : "info"}>
						{STATUS_AGENDAMENTO_LABELS[ag.status]}
					</Badge>
					{ag.observacao && (
						<p className="rounded-lg bg-bg-neutral/50 px-3 py-2 text-xs text-text-secondary">{ag.observacao}</p>
					)}
				</div>

				{erro && (
					<p
						role="alert"
						className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error-dark dark:text-error"
					>
						{erro}
					</p>
				)}

				<div className="grid gap-2">
					{/* REAGENDAR em destaque: é a ação que o arrasto faz — e a única que o
					    teclado e o celular não conseguiriam fazer sem ela. */}
					<Button onClick={() => aoReagendar(ag)} className="justify-start gap-2" disabled={salvando}>
						<Clock className="size-4" aria-hidden="true" />
						Reagendar…
					</Button>
					<Button variant="outline" onClick={() => aoEditar(ag)} className="justify-start gap-2" disabled={salvando}>
						<Pencil className="size-4" aria-hidden="true" />
						Editar detalhes
					</Button>
					<Button
						variant="outline"
						onClick={() => aoAlternarConclusao(ag)}
						className="justify-start gap-2"
						disabled={salvando}
					>
						{salvando ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : concluido ? (
							<RotateCcw className="size-4" aria-hidden="true" />
						) : (
							<Check className="size-4" aria-hidden="true" />
						)}
						{concluido ? "Reabrir (voltar para agendado)" : "Marcar como concluído"}
					</Button>
					<Button
						variant="outline"
						onClick={() => aoExcluir(ag)}
						className="justify-start gap-2 text-error-dark hover:text-error-dark dark:text-error dark:hover:text-error"
						disabled={salvando}
					>
						<Trash2 className="size-4" aria-hidden="true" />
						Excluir
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * REAGENDAR — o mesmo efeito do arrasto, por teclado.
 *
 * Os atalhos (+1h, amanhã, +1 semana) existem porque remarcar é quase sempre "empurra
 * um pouco": obrigar o usuário a redigitar dia, mês, ano e hora para adiar 1 hora é
 * como o software fica cansativo. Mas os campos continuam lá, para a data exata.
 * ═════════════════════════════════════════════════════════════════════════════ */
function DialogReagendar({
	agendamento: ag,
	aoFechar,
	aoConfirmar,
	todos,
	salvando,
}: {
	agendamento: Agendamento | null;
	aoFechar: () => void;
	aoConfirmar: (a: Agendamento, inicio: Date, fim: Date | null, semHora: boolean) => Promise<void>;
	todos: Agendamento[];
	salvando: boolean;
}) {
	const [inicio, setInicio] = useState("");
	const [fim, setFim] = useState("");
	const [erro, setErro] = useState<string | null>(null);

	// Cada abertura recarrega o horário DAQUELE compromisso — senão o diálogo abriria
	// com a data do agendamento anterior e remarcaria para o dia errado.
	useEffect(() => {
		if (!ag) return;
		setInicio(isoParaInputLocal(ag.inicio));
		setFim(isoParaInputLocal(ag.fim));
		setErro(null);
	}, [ag]);

	const conflito = useMemo(() => {
		if (!ag) return null;
		const iso = localParaIso(inicio);
		if (!iso) return null;
		const fimIso = fim ? localParaIso(fim) : null;
		return encontrarConflito(todos, { inicio: iso, fim: fimIso ?? undefined, tipo: ag.tipo }, ag.id);
	}, [ag, inicio, fim, todos]);

	if (!ag) return null;

	/** Empurra início E fim juntos — mover só o início esticaria a visita sem querer. */
	const empurrar = (minutos: number) => {
		const iso = localParaIso(inicio);
		if (!iso) return;
		const novo = new Date(new Date(iso).getTime() + minutos * 60_000);
		setInicio(paraInputLocal(novo));
		if (fim) {
			const isoFim = localParaIso(fim);
			if (isoFim) setFim(paraInputLocal(new Date(new Date(isoFim).getTime() + minutos * 60_000)));
		}
	};

	const confirmar = async () => {
		const iso = localParaIso(inicio);
		if (!iso) {
			setErro("Informe a nova data e hora.");
			return;
		}
		const isoFim = fim ? localParaIso(fim) : null;
		if (isoFim && new Date(isoFim) <= new Date(iso)) {
			setErro("O término precisa ser depois do início.");
			return;
		}
		setErro(null);
		// `semHora` = false: quem usa este diálogo digitou uma HORA. A faixa "sem hora"
		// se alcança arrastando para o topo do dia, ou apagando a hora no formulário.
		await aoConfirmar(ag, new Date(iso), isoFim ? new Date(isoFim) : null, false);
	};

	return (
		<Dialog open={!!ag} onOpenChange={(v) => !v && !salvando && aoFechar()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Reagendar</DialogTitle>
					<DialogDescription>
						{ag.titulo} — hoje marcado para {faixaDeHorario(ag)}.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex flex-wrap gap-2">
						{[
							{ label: "+30min", min: 30 },
							{ label: "+1h", min: 60 },
							{ label: "+1 dia", min: 60 * 24 },
							{ label: "+1 semana", min: 60 * 24 * 7 },
						].map((a) => (
							<Button key={a.label} type="button" variant="outline" size="sm" onClick={() => empurrar(a.min)}>
								{a.label}
							</Button>
						))}
					</div>

					{/* `Campo` (a casca padrão do painel) em vez de um <label> escrito à mão: o
					    <label> que estava aqui não estava associado a input nenhum — clicar no
					    texto não focava o campo, e o leitor de tela anunciava "editar data" sem
					    dizer QUAL data. O `aria-label` no input garante o nome acessível mesmo
					    enquanto o `Campo` não expõe `htmlFor` (ver pendências). */}
					<div className="grid gap-3 sm:grid-cols-2">
						<Campo rotulo="Novo início" obrigatorio>
							<Input
								type="datetime-local"
								aria-label="Novo início"
								value={inicio}
								onChange={(e) => setInicio(e.target.value)}
							/>
						</Campo>
						<Campo
							rotulo="Novo término"
							dica={
								fim
									? undefined
									: `Em branco: segue sem término definido (≈ ${rotuloDuracao(duracaoEstimadaMin(ag.tipo))}).`
							}
						>
							<Input
								type="datetime-local"
								aria-label="Novo término"
								value={fim}
								min={inicio || undefined}
								onChange={(e) => setFim(e.target.value)}
							/>
						</Campo>
					</div>

					{conflito && (
						<p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-text-primary">
							<AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
							<span>
								Colide com <strong className="font-semibold">{conflito.titulo}</strong> ({faixaDeHorario(conflito)}).
								Você pode reagendar assim mesmo.
							</span>
						</p>
					)}

					{erro && (
						<p
							role="alert"
							className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error-dark dark:text-error"
						>
							{erro}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={aoFechar} disabled={salvando}>
						Cancelar
					</Button>
					<Button onClick={confirmar} disabled={salvando}>
						{salvando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
						{salvando ? "Reagendando…" : "Reagendar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
