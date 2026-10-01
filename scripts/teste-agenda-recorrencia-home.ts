/**
 * Agenda certa fora da tela Agenda (itens 1.5 e 1.6 da onda 1):
 *  - séries recorrentes aparecem no dia (Hoje, Relatório, "Bom dia") e na Próxima parada;
 *  - a visita em andamento continua sendo a Próxima parada, com rótulo "AGORA";
 *  - mas o aviso "saia às" e o "Bom dia" miram a visita SEGUINTE (Próxima saída);
 *  - cancelada/concluída não viram Próxima parada;
 *  - visitas passadas sem baixa (60 dias), sem contar repetições de série;
 *  - o botão de 1 toque do Hoje mira a proposta de maior prioridade, não a mais fria;
 *  - Hoje: Pulso grava a nota, dia em horário local, toque abre a visita.
 *
 * Roda com: npx tsx scripts/teste-agenda-recorrencia-home.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import type { Agendamento } from "../src/types/index.ts";
import { expandirRecorrencia, idBaseDaOcorrencia } from "../src/utils/contratoRecorrente.ts";
import {
	emAndamento,
	escolherProximaParada,
	escolherProximaSaida,
	filtrarVisitasSemBaixa,
	fimEfetivoMs,
	limitesDoDiaLocal,
	rotuloQuandoVisita,
} from "../src/utils/agendaDia.ts";
import { maisPrioritarioFollowUp, pesoRecenciaFollowUp, prioridadeFollowUp } from "../src/utils/prioridadeFollowUp.ts";

let ok = 0;
function caso(nome: string, fn: () => void) {
	fn();
	ok++;
	console.log(`ok - ${nome}`);
}

function visita(p: Partial<Agendamento> & Pick<Agendamento, "id" | "inicio">): Agendamento {
	return {
		clienteNome: "Condomínio Solar",
		titulo: "Manutenção",
		tipo: "manutencao",
		status: "agendado",
		criadoEm: "2026-09-01T12:00:00.000Z",
		atualizadoEm: "2026-09-01T12:00:00.000Z",
		...p,
	};
}

/** O que getAgendamentosExpandidos faz depois do SELECT: projeta e ordena. */
function expandir(linhas: Agendamento[], desde: Date, ate: Date) {
	return linhas
		.flatMap((a) => expandirRecorrencia(a, desde.toISOString(), ate.toISOString()))
		.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const MS_DIA = 86400000;

// Série semanal criada na terça 01/09/2026 às 10h de Brasília (13h UTC).
const semanal = visita({
	id: "serie-1",
	inicio: "2026-09-01T13:00:00.000Z",
	fim: "2026-09-01T14:00:00.000Z",
	recorrencia: "semanal",
});

caso("série semanal aparece no dia da 5ª repetição (getAgendamentosDoDia)", () => {
	const dia = new Date(Date.UTC(2026, 8, 29, 15, 0)); // 29/09, meio do dia em qualquer fuso do Brasil
	const { inicio, fim } = limitesDoDiaLocal(dia);
	const doDia = expandir([semanal], inicio, fim);
	assert.equal(doDia.length, 1);
	assert.equal(doDia[0].inicio, "2026-09-29T13:00:00.000Z");
	assert.equal(doDia[0].id, "serie-1@2026-09-29");
	assert.equal(idBaseDaOcorrencia(doDia[0].id), "serie-1");
});

caso("Próxima parada encontra a repetição da semana seguinte, não só linhas reais", () => {
	const agora = new Date("2026-09-30T18:00:00.000Z");
	const lista = expandir([semanal], new Date(agora.getTime() - 7 * MS_DIA), new Date(agora.getTime() + 60 * MS_DIA));
	const prox = escolherProximaParada(lista, agora);
	assert.ok(prox);
	assert.equal(prox.inicio, "2026-10-06T13:00:00.000Z");
});

caso("visita em andamento continua sendo a Próxima parada e vira AGORA", () => {
	const andamento = visita({ id: "a", inicio: "2026-09-30T17:00:00.000Z", fim: "2026-09-30T19:00:00.000Z" });
	const depois = visita({ id: "b", inicio: "2026-09-30T20:00:00.000Z" });
	const agora = new Date("2026-09-30T17:01:00.000Z");
	assert.equal(escolherProximaParada([depois, andamento], agora)?.id, "a");
	assert.equal(emAndamento(andamento, agora), true);
	assert.equal(rotuloQuandoVisita(andamento, agora), "AGORA · em atendimento");
	// terminou: passa para a seguinte
	assert.equal(escolherProximaParada([depois, andamento], new Date("2026-09-30T19:00:01.000Z"))?.id, "b");
});

caso("aviso de saída mira a visita SEGUINTE enquanto uma está em andamento", () => {
	const andamento = visita({ id: "a", inicio: "2026-09-30T17:00:00.000Z", fim: "2026-09-30T19:00:00.000Z" });
	const depois = visita({ id: "b", inicio: "2026-09-30T20:00:00.000Z" });
	const concluida = visita({ id: "c", inicio: "2026-09-30T19:30:00.000Z", status: "concluido" });
	const agora = new Date("2026-09-30T17:30:00.000Z");
	assert.equal(escolherProximaParada([depois, andamento, concluida], agora)?.id, "a");
	assert.equal(escolherProximaSaida([depois, andamento, concluida], agora)?.id, "b");
	assert.equal(escolherProximaSaida([andamento], agora), null);
	// série recorrente: a próxima saída é a repetição seguinte
	const lista = expandir([semanal], agora, new Date(agora.getTime() + 60 * MS_DIA));
	assert.equal(escolherProximaSaida(lista, agora)?.id, "serie-1@2026-10-06");
});

caso("sem fim gravado, a visita dura 1h (COALESCE(fim, inicio + 1h))", () => {
	const semFim = visita({ id: "c", inicio: "2026-09-30T17:00:00.000Z" });
	assert.equal(fimEfetivoMs(semFim), Date.parse("2026-09-30T18:00:00.000Z"));
	assert.equal(escolherProximaParada([semFim], new Date("2026-09-30T17:59:00.000Z"))?.id, "c");
	assert.equal(escolherProximaParada([semFim], new Date("2026-09-30T18:00:01.000Z")), null);
	// fim inválido ou antes do início também cai na 1h padrão
	assert.equal(
		fimEfetivoMs({ inicio: "2026-09-30T17:00:00.000Z", fim: "2026-09-30T16:00:00.000Z" }),
		Date.parse("2026-09-30T18:00:00.000Z"),
	);
	assert.equal(fimEfetivoMs({ inicio: "lixo" }), null);
});

caso("cancelada, concluída e lixeira não viram Próxima parada", () => {
	const agora = new Date("2026-09-30T12:00:00.000Z");
	const cancelada = visita({ id: "x1", inicio: "2026-09-30T13:00:00.000Z", status: "cancelado" });
	const concluida = visita({ id: "x2", inicio: "2026-09-30T14:00:00.000Z", status: "concluido" });
	const lixeira = visita({ id: "x3", inicio: "2026-09-30T15:00:00.000Z", excluidoEm: "2026-09-29T00:00:00.000Z" });
	const valida = visita({ id: "ok", inicio: "2026-09-30T16:00:00.000Z" });
	assert.equal(escolherProximaParada([cancelada, concluida, lixeira, valida], agora)?.id, "ok");
	assert.equal(escolherProximaParada([cancelada, concluida, lixeira], agora), null);
});

caso("rótulo Hoje / Amanhã / dd/mm no horário do aparelho", () => {
	const agora = new Date(2026, 8, 30, 8, 0);
	assert.equal(rotuloQuandoVisita({ inicio: new Date(2026, 8, 30, 14, 30).toISOString() }, agora), "Hoje · 14:30");
	assert.equal(rotuloQuandoVisita({ inicio: new Date(2026, 9, 1, 9, 0).toISOString() }, agora), "Amanhã · 09:00");
	assert.equal(rotuloQuandoVisita({ inicio: new Date(2026, 9, 18, 7, 5).toISOString() }, agora), "18/10 · 07:05");
	assert.equal(rotuloQuandoVisita({ inicio: "" }, agora), "");
});

caso("visitas sem baixa: passadas, 'agendado', últimos 60 dias, sem séries", () => {
	const agora = new Date("2026-09-30T12:00:00.000Z");
	const semBaixa = visita({ id: "s1", inicio: "2026-09-20T13:00:00.000Z" });
	const maisRecente = visita({ id: "s2", inicio: "2026-09-29T13:00:00.000Z" });
	const concluida = visita({ id: "s3", inicio: "2026-09-21T13:00:00.000Z", status: "concluido" });
	const velha = visita({ id: "s4", inicio: "2026-07-01T13:00:00.000Z" });
	const andamento = visita({ id: "s5", inicio: "2026-09-30T11:30:00.000Z" });
	const lista = filtrarVisitasSemBaixa([semBaixa, concluida, velha, andamento, semanal, maisRecente], agora);
	assert.deepEqual(
		lista.map((a) => a.id),
		["s2", "s1"],
	);
});

caso("1 toque do Hoje: maior valor × recência, não o lead mais frio", () => {
	const frio = { orcamento: { valorTotal: 9000 }, diasParado: 97 }; // 9000 × 0,2 = 1800
	const morno = { orcamento: { valorTotal: 3000 }, diasParado: 20 }; // 3000 × 0,5 = 1500
	const quente = { orcamento: { valorTotal: 2400 }, diasParado: 5 }; // 2400 × 1 = 2400
	// a lista do radar vem do mais parado para o menos parado
	assert.equal(maisPrioritarioFollowUp([frio, morno, quente]), quente);
	assert.equal(pesoRecenciaFollowUp(14), 1);
	assert.equal(pesoRecenciaFollowUp(15), 0.5);
	assert.equal(pesoRecenciaFollowUp(31), 0.2);
	assert.equal(prioridadeFollowUp({ orcamento: { valorTotal: Number.NaN }, diasParado: 3 }), 0);
	assert.equal(maisPrioritarioFollowUp([]), null);
	// empate de prioridade: maior valor
	const a = { orcamento: { valorTotal: 1000 }, diasParado: 20 }; // 500
	const b = { orcamento: { valorTotal: 500 }, diasParado: 4 }; // 500
	assert.equal(maisPrioritarioFollowUp([b, a]), a);
});

const agendaTs = readFileSync(new URL("../src/services/agenda.ts", import.meta.url), "utf8");
const hojeTs = readFileSync(new URL("../src/screens/HojeScreen.tsx", import.meta.url), "utf8");

caso("agenda.ts: dia e Próxima parada saem da agenda expandida", () => {
	const doDia = agendaTs.slice(agendaTs.indexOf("export async function getAgendamentosDoDia"));
	assert.match(doDia.slice(0, 400), /getAgendamentosExpandidos\(/);
	const prox = agendaTs.slice(agendaTs.indexOf("export async function getProximoAgendamento"));
	assert.match(prox.slice(0, 600), /getAgendamentosExpandidos\(/);
	assert.match(prox.slice(0, 600), /escolherProximaParada\(/);
	assert.doesNotMatch(agendaTs, /inicio >= \? AND status != 'cancelado'/);
	assert.match(agendaTs, /export async function getVisitasSemBaixa\(/);
	const saida = agendaTs.slice(agendaTs.indexOf("export async function getProximaSaida"));
	assert.match(saida.slice(0, 400), /escolherProximaSaida\(/);
});

caso("ritualDiario: aviso de saída e Bom dia usam a Próxima saída", () => {
	const ritual = readFileSync(new URL("../src/services/ritualDiario.ts", import.meta.url), "utf8");
	assert.doesNotMatch(ritual, /getProximoAgendamento\(/);
	assert.equal((ritual.match(/getProximaSaida\(\)/g) ?? []).length, 2);
});

caso("HojeScreen: Pulso grava a nota, dia local, 1 toque priorizado, toque abre a visita", () => {
	assert.match(hojeTs, /enviarFeedback\('pulso', '', \{ tela: 'HojeScreen', nota: valor \}\)/);
	assert.doesNotMatch(hojeTs, /toISOString\(\)\.split\('T'\)\[0\]/);
	assert.match(hojeTs, /format\(new Date\(\), 'yyyy-MM-dd'\)/);
	assert.match(hojeTs, /maisPrioritarioFollowUp\(followUp\)/);
	assert.doesNotMatch(hojeTs, /followUp\[0\]/);
	// id inteiro (`<base>@<dia>`): a Agenda abre a base e foca o dia da repetição
	assert.match(hojeTs, /abrirAgendamentoId: a\.id \}/);
});

console.log(`\n${ok} casos ok`);
