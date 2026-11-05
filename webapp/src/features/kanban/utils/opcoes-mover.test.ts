// node src/features/kanban/utils/opcoes-mover.test.ts
import assert from "node:assert/strict";
import { opcoesParaMover } from "./opcoes-mover.ts";

const COLUNAS = [
	{ id: "rascunho", titulo: "Rascunho", status: ["rascunho"] },
	{ id: "enviado", titulo: "Enviado", status: ["enviado", "visualizado"] },
	{ id: "finalizados", titulo: "Finalizados", status: [] as string[] },
	{ id: "perdido", titulo: "Perdido", status: ["recusado"] },
];

const noMeio = opcoesParaMover(COLUNAS, "enviado", "enviado");
assert.deepEqual(
	noMeio.map((o) => o.id),
	["rascunho", "enviado", "visualizado", "recusado", "finalizar"],
	"coluna sem status não entra; finalizar fica no fim",
);
assert.equal(noMeio.find((o) => o.id === "enviado")?.atual, true);
assert.equal(noMeio.find((o) => o.id === "rascunho")?.atual, false);
assert.equal(noMeio.find((o) => o.id === "finalizar")?.finalizar, true);
assert.equal(
	noMeio.some((o) => o.grupo === "Finalizados"),
	false,
	"não cria grupo vazio",
);

const jaFinal = opcoesParaMover(COLUNAS, "aprovado", "finalizados");
assert.equal(
	jaFinal.some((o) => o.finalizar),
	false,
	"card finalizado não oferece finalizar de novo",
);
assert.equal(new Set(noMeio.map((o) => o.id)).size, noMeio.length, "id único");

console.log("opcoes-mover.test: OK");
