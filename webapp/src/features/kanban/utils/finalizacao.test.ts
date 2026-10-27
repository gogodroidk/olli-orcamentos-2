// node src/features/kanban/utils/finalizacao.test.ts
import assert from "node:assert/strict";
import { planoDeFinalizacao } from "./finalizacao.ts";

assert.deepEqual(planoDeFinalizacao([]), { acao: "criar" }, "sem OS: cria uma já concluída");
assert.deepEqual(
	planoDeFinalizacao([{ id: "c1", status: "cancelada", atualizado_em: "2026-10-27" }]),
	{ acao: "criar" },
	"OS cancelada não é reaberta nem concluída: cria nova",
);
assert.deepEqual(
	planoDeFinalizacao([
		{ id: "a", status: "aberta", atualizado_em: "2026-10-20T10:00:00Z" },
		{ id: "b", status: "em_execucao", atualizado_em: "2026-10-26T10:00:00Z" },
		{ id: "c", status: "cancelada", atualizado_em: "2026-10-27T10:00:00Z" },
	]),
	{ acao: "concluir", osId: "b" },
	"conclui a OS em andamento mais recente",
);
assert.deepEqual(
	planoDeFinalizacao([{ id: "x", status: "agendada", atualizado_em: null }]),
	{ acao: "concluir", osId: "x" },
	"data ausente não quebra",
);
console.log("finalizacao.test: OK");
