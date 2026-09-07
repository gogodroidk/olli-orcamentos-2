import assert from 'node:assert/strict';
import {
	anexarEventoAuditoriaIa,
	autorizarRascunhoAcaoIa,
	avaliarPedidoIa,
	criarJournalAuditoriaIa,
	criarRascunhoAcaoIa,
	decidirRascunhoAcaoIa,
} from '../src/services/olliAcoesSeguras.ts';

assert.equal(avaliarPedidoIa('Como melhorar meu orçamento?').modo, 'consulta');
assert.equal(avaliarPedidoIa('altere o status do orçamento 12 para aprovado').modo, 'rascunho_acao');
assert.equal(avaliarPedidoIa('apaga tudo do banco').modo, 'bloqueado');
assert.equal(avaliarPedidoIa('delete todos os clientes').modo, 'bloqueado');
assert.match(avaliarPedidoIa('limpe a base inteira').motivo ?? '', /não apaga dados/i);

const rascunho = criarRascunhoAcaoIa(
	'altere o status do orçamento 12 para aprovado',
	[{ campo: 'status', atual: 'enviado', proposto: 'aprovado' }],
	{ escopo: 'orcamento', registroId: 'orc-12', id: 'ia-test-1', agora: '2026-09-05T12:00:00.000Z' },
);
assert.equal(rascunho.estado, 'aguardando_confirmacao');
assert.equal(rascunho.mudancas[0]?.proposto, 'aprovado');
const confirmado = decidirRascunhoAcaoIa(rascunho, 'confirmar');
assert.equal(confirmado.estado, 'confirmado');
assert.equal(decidirRascunhoAcaoIa(rascunho, 'cancelar').estado, 'cancelado');
assert.throws(() => criarRascunhoAcaoIa('Como melhorar meu orçamento?', [{ campo: 'status', atual: null, proposto: 'y' }], { escopo: 'orcamento', registroId: 'orc-12', id: 'ia-invalida' }), /pedido_nao_e_mudanca/);
assert.throws(() => criarRascunhoAcaoIa('altere o status do orçamento', [{ campo: 'user_id', atual: null, proposto: 'outro' }], { escopo: 'orcamento', registroId: 'orc-12', id: 'ia-campo-invalido' }), /campo_nao_permitido/);
assert.doesNotThrow(() => criarRascunhoAcaoIa('altere a validade do orçamento', [{ campo: 'validadeOrcamento', atual: null, proposto: '30/09/2026' }], { escopo: 'orcamento', registroId: 'orc-12', id: 'ia-validade-real' }));
assert.throws(() => criarRascunhoAcaoIa('altere a validade do orçamento', [{ campo: 'validade', atual: null, proposto: '30/09/2026' }], { escopo: 'orcamento', registroId: 'orc-12', id: 'ia-validade-fantasma' }), /campo_nao_permitido/);
assert.doesNotThrow(() => criarRascunhoAcaoIa('atualize a agenda', [{ campo: 'observacao', atual: null, proposto: 'Levar escada' }], { escopo: 'agenda', registroId: 'agenda-1', id: 'ia-agenda-real' }));
assert.throws(() => criarRascunhoAcaoIa('atualize a agenda', [{ campo: 'descricao', atual: null, proposto: 'Levar escada' }], { escopo: 'agenda', registroId: 'agenda-1', id: 'ia-agenda-fantasma' }), /campo_nao_permitido/);

const autorizado = autorizarRascunhoAcaoIa(confirmado, {
	atorId: 'user-1', tenantId: 'tenant-1', papel: 'gestor', confirmacaoId: confirmado.id,
});
assert.equal(autorizado.autorizado, true);
if (autorizado.autorizado) {
	assert.deepEqual(autorizado.rollback.mudancas[0], { campo: 'status', atual: 'aprovado', proposto: 'enviado' });
}
assert.deepEqual(autorizarRascunhoAcaoIa(rascunho, {
	atorId: 'user-1', tenantId: 'tenant-1', papel: 'gestor', confirmacaoId: rascunho.id,
}), { autorizado: false, motivo: 'confirmacao_obrigatoria' });

const equipe = decidirRascunhoAcaoIa(criarRascunhoAcaoIa(
	'atualize a equipe', [{ campo: 'ativo', atual: true, proposto: false }],
	{ escopo: 'equipe', registroId: 'user-2', id: 'ia-equipe', agora: '2026-09-05T12:00:00.000Z' },
), 'confirmar');
assert.deepEqual(autorizarRascunhoAcaoIa(equipe, {
	atorId: 'user-1', tenantId: 'tenant-1', papel: 'gestor', confirmacaoId: equipe.id,
}), { autorizado: false, motivo: 'papel_sem_permissao' });

const empresa = decidirRascunhoAcaoIa(criarRascunhoAcaoIa(
	'atualize a empresa', [{ campo: 'slogan', atual: 'Antes', proposto: 'Depois' }],
	{ escopo: 'empresa', registroId: 'empresa-1', id: 'ia-empresa', agora: '2026-09-05T12:00:00.000Z' },
), 'confirmar');
assert.deepEqual(autorizarRascunhoAcaoIa(empresa, {
	atorId: 'user-1', tenantId: 'tenant-1', papel: 'admin', confirmacaoId: empresa.id,
}), { autorizado: false, motivo: 'papel_sem_permissao' });
assert.equal(autorizarRascunhoAcaoIa(empresa, {
	atorId: 'user-1', tenantId: 'tenant-1', papel: 'owner', confirmacaoId: empresa.id,
}).autorizado, true);

const evento = {
	id: 'evt-1', rascunhoId: confirmado.id, atorId: 'user-1', tenantId: 'tenant-1',
	escopo: confirmado.escopo, registroId: confirmado.registroId, resultado: 'autorizado' as const,
	motivo: 'confirmacao_explicita', criadoEm: '2026-09-05T12:01:00.000Z',
};
const journal = anexarEventoAuditoriaIa(criarJournalAuditoriaIa(), evento);
assert.equal(journal.revisao, 1);
assert.equal(anexarEventoAuditoriaIa(journal, evento), journal);
assert.throws(() => anexarEventoAuditoriaIa(journal, { ...evento, motivo: 'divergente' }), /evento_auditoria_divergente/);

console.log('OK — pedidos destrutivos bloqueados e mudanças encaminhadas para rascunho.');
