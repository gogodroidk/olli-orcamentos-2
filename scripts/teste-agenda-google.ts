import { strict as assert } from "node:assert";
import { criarIcsAgendamento, criarUrlGoogleAgenda } from "../webapp/src/pages/olli/agenda/googleAgenda.ts";

const agendamento = {
	id: "ag-123",
	clienteNome: "Clínica São José",
	titulo: "Manutenção preventiva",
	tipo: "manutencao" as const,
	inicio: "2026-08-20T13:00:00.000Z",
	fim: "2026-08-20T14:30:00.000Z",
	endereco: "Rua A, 10",
	status: "agendado" as const,
	observacao: "Levar filtros; confirmar acesso.",
	criadoEm: "2026-08-19T12:00:00.000Z",
	atualizadoEm: "2026-08-19T12:00:00.000Z",
};

const url = criarUrlGoogleAgenda(agendamento);
assert.ok(url);
const parsed = new URL(url);
assert.equal(parsed.origin, "https://calendar.google.com");
assert.equal(parsed.searchParams.get("action"), "TEMPLATE");
assert.equal(parsed.searchParams.get("dates"), "20260820T130000Z/20260820T143000Z");
assert.equal(parsed.searchParams.get("ctz"), "America/Sao_Paulo");
assert.match(parsed.searchParams.get("details") ?? "", /Clínica São José/);

const ics = criarIcsAgendamento(agendamento);
assert.ok(ics);
assert.match(ics, /BEGIN:VCALENDAR\r\n/);
assert.match(ics, /UID:ag-123@olliorcamentos\.online/);
assert.match(ics, /DTSTART:20260820T130000Z/);
assert.match(ics, /DTEND:20260820T143000Z/);
assert.match(ics.replace(/\r\n /g, ""), /Levar filtros\\; confirmar acesso\./);

const diaTodo = criarUrlGoogleAgenda({ ...agendamento, inicio: "2026-08-20T03:00:00.000Z", fim: undefined }, true);
assert.equal(new URL(diaTodo!).searchParams.get("dates"), "20260820/20260821");

// 23h em São Paulo: a data civil seguinte continua sendo apenas o dia 21.
const diaTodoNoturno = criarUrlGoogleAgenda({ ...agendamento, inicio: "2026-08-21T02:00:00.000Z", fim: undefined }, true);
assert.equal(new URL(diaTodoNoturno!).searchParams.get("dates"), "20260820/20260821");

assert.equal(criarUrlGoogleAgenda({ ...agendamento, inicio: "inválido" }), null);
assert.equal(criarIcsAgendamento({ ...agendamento, inicio: "inválido" }), null);

console.log("teste-agenda-google: 20 verificações passaram");
