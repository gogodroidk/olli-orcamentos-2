// node src/pages/olli/ordens-servico/mover-os.test.ts
import assert from "node:assert/strict";
import { concluidoEmDaTransicao } from "../../../../../src/utils/ordemServicoStatus.ts";
import { aplicarStatusOs } from "./mover-os.ts";

const fotos = ["foto-1.jpg"];
const checklist = [{ id: "c1", texto: "limpar filtro", feito: true }];
const base: {
	id: string;
	numero: string;
	status: string;
	atualizadoEm: string;
	titulo: string;
	fotos: string[];
	checklist: { id: string; texto: string; feito: boolean }[];
	concluidoEm?: string;
} = {
	id: "os-1",
	numero: "OS-0007",
	status: "aberta",
	atualizadoEm: "2026-10-01T12:00:00.000Z",
	titulo: "Manutenção",
	fotos,
	checklist,
};

const agora = "2026-10-27T15:00:00.000Z";
const concluida = aplicarStatusOs(
	base,
	"concluida",
	agora,
	concluidoEmDaTransicao({ status: "aberta" }, "concluida", agora),
);
assert.equal(concluida.status, "concluida");
assert.equal(concluida.concluidoEm, agora);
assert.equal(concluida.atualizadoEm, agora);
assert.equal(concluida.fotos, fotos, "fotos não são copiadas nem apagadas");
assert.equal(concluida.checklist, checklist, "checklist do técnico permanece");
assert.equal(concluida.titulo, "Manutenção");
assert.notEqual(concluida, base);

const igual = aplicarStatusOs(base, "aberta", agora, undefined);
assert.equal(igual, base, "mesmo status não regrava");

const reaberta = aplicarStatusOs(
	{ ...base, status: "concluida", concluidoEm: "2026-10-02T00:00:00.000Z" },
	"em_execucao",
	agora,
	concluidoEmDaTransicao({ status: "concluida", concluidoEm: "2026-10-02T00:00:00.000Z" }, "em_execucao", agora),
);
assert.equal(reaberta.status, "em_execucao");
assert.equal(reaberta.concluidoEm, undefined, "reabrir limpa o marco");
assert.equal(reaberta.fotos, fotos);

console.log("mover-os.test: OK");
