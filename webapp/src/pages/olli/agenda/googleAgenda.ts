import type { Agendamento } from "@dominio";
import { criarIcsAgenda } from "../../../../../src/utils/icsAgenda.ts";

const FUSO_OLLI = "America/Sao_Paulo";
const DURACAO_PADRAO_MS = 60 * 60 * 1000;

function dataValida(iso: string | undefined): Date | null {
	if (!iso) return null;
	const data = new Date(iso);
	return Number.isNaN(data.getTime()) ? null : data;
}

function utcCompacto(data: Date): string {
	return data.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dataLocalCompacta(data: Date): string {
	const partes = new Intl.DateTimeFormat("en-CA", {
		timeZone: FUSO_OLLI,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(data);
	const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
	return `${valor("year")}${valor("month")}${valor("day")}`;
}

function proximoDiaCompacto(data: Date): string {
	// Avança a DATA CIVIL em São Paulo, não uma quantidade de horas. Somar
	// horas ao instante fazia compromissos noturnos saltarem dois dias.
	const atual = dataLocalCompacta(data);
	const ano = Number(atual.slice(0, 4));
	const mes = Number(atual.slice(4, 6));
	const dia = Number(atual.slice(6, 8));
	const seguinte = new Date(Date.UTC(ano, mes - 1, dia + 1));
	return `${seguinte.getUTCFullYear()}${String(seguinte.getUTCMonth() + 1).padStart(2, "0")}${String(seguinte.getUTCDate()).padStart(2, "0")}`;
}

function limparTexto(valor: string | undefined): string {
	return (valor ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function descricao(agendamento: Agendamento): string {
	return [
		agendamento.clienteNome ? `Cliente: ${limparTexto(agendamento.clienteNome)}` : "",
		agendamento.observacao ? limparTexto(agendamento.observacao) : "",
		"Criado no OLLI Orçamentos.",
	]
		.filter(Boolean)
		.join("\n");
}

function faixaGoogle(agendamento: Agendamento, semHora: boolean): string | null {
	const inicio = dataValida(agendamento.inicio);
	if (!inicio) return null;
	if (semHora) return `${dataLocalCompacta(inicio)}/${proximoDiaCompacto(inicio)}`;
	const fim = dataValida(agendamento.fim) ?? new Date(inicio.getTime() + DURACAO_PADRAO_MS);
	return `${utcCompacto(inicio)}/${utcCompacto(fim)}`;
}

export function criarUrlGoogleAgenda(agendamento: Agendamento, semHora = false): string | null {
	const dates = faixaGoogle(agendamento, semHora);
	if (!dates) return null;
	const params = new URLSearchParams({
		action: "TEMPLATE",
		text: limparTexto(agendamento.titulo) || "Compromisso OLLI",
		dates,
		details: descricao(agendamento),
		location: limparTexto(agendamento.endereco),
		ctz: FUSO_OLLI,
	});
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Um compromisso. O dia inteiro só quando a tela diz que é "sem hora". */
export function criarIcsAgendamento(agendamento: Agendamento, semHora = false): string | null {
	return criarIcsAgenda([agendamento], { modo: "evento", forcarSemHora: semHora });
}

function baixarTextoIcs(conteudo: string, nome: string): boolean {
	if (typeof document === "undefined") return false;
	const blob = new Blob([conteudo], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = nome;
	link.rel = "noopener";
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
	return true;
}

export function baixarIcsAgendamento(agendamento: Agendamento, semHora = false): boolean {
	const conteudo = criarIcsAgendamento(agendamento, semHora);
	if (!conteudo) return false;
	const nome = `olli-${agendamento.id.replace(/[^\w.-]+/g, "_").slice(0, 80) || "evento"}.ics`;
	return baixarTextoIcs(conteudo, nome);
}

/** A agenda inteira (de 30 dias atrás para a frente, mais as séries). */
export function baixarIcsAgenda(agendamentos: readonly Agendamento[]): boolean {
	const conteudo = criarIcsAgenda(agendamentos, { modo: "agenda" });
	if (!conteudo || !conteudo.includes("BEGIN:VEVENT")) return false;
	return baixarTextoIcs(conteudo, "agenda-olli.ics");
}
