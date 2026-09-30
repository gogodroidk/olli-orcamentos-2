import {
  ADMIN_AUDIT_POLICY_CONTRACT_VERSION,
  comporConsultaAdminAuditada,
} from '../worker/src/adminAuditPolicyContract.js';
import {
  criarEstadoAuditoriaAdmin,
  verificarCadeiaAuditoriaAdmin,
} from '../worker/src/adminAccessAudit.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nAdmin OLLI — composição política → auditoria → plano');

const contexto: any = {
  actorFingerprint: 'a'.repeat(64),
  role: 'suporte',
  canAuditAdminData: true,
};
const request: any = {
  auditId: 'audit-composition-001',
  correlationId: 'request-composition-001',
  targetFingerprint: 'b'.repeat(64),
  dataset: 'orcamentos',
  purpose: 'support_diagnosis',
};
const opcoes: any = { expectedRevision: 0, agora: '2026-09-01T19:55:00Z' };
const estado0: any = criarEstadoAuditoriaAdmin(contexto, { agora: '2026-09-01T19:54:00Z' });

checar('versão explícita', ADMIN_AUDIT_POLICY_CONTRACT_VERSION === '2026-09-01.v1');

const permitido: any = comporConsultaAdminAuditada(request, contexto, estado0, opcoes);
checar('política permite diagnóstico de orçamento para suporte', permitido.decisao.allowed === true && permitido.decisao.reason === 'allowed');
checar('plano usa somente o select allowlistado', permitido.decisao.planoConsulta.dataset === 'orcamentos' && permitido.decisao.planoConsulta.select === 'numero,status,criado_em');
checar('dataset comum não exige segunda projeção JSON', permitido.decisao.planoConsulta.projectionRequired === false);
checar('auditoria foi anexada antes do plano existir', permitido.estadoAuditoria.revision === 1 && permitido.decisao.auditCommitment.revision === 1 && permitido.decisao.auditCommitment.appended === true);
checar('compromisso referencia a entrada persistível', permitido.decisao.auditCommitment.entryHash === permitido.estadoAuditoria.entries[0].entryHash);
checar('cadeia resultante é verificável', permitido.decisao.auditCommitment.chainValid === true && verificarCadeiaAuditoriaAdmin(permitido.estadoAuditoria));
checar('estado original não foi mutado', estado0.revision === 0 && estado0.entries.length === 0);
checar('decisão e plano são profundamente imutáveis', Object.isFrozen(permitido.decisao) && Object.isFrozen(permitido.decisao.planoConsulta) && Object.isFrozen(permitido.decisao.auditCommitment));
checar('decisão pública omite ator, alvo e dados consultados', !/(actorFingerprint|targetFingerprint|cliente_nome|valor_total|conteudo|email@)/i.test(JSON.stringify(permitido.decisao)));

const replay: any = comporConsultaAdminAuditada(request, contexto, permitido.estadoAuditoria, opcoes);
checar('replay idêntico é idempotente', replay.estadoAuditoria === permitido.estadoAuditoria && replay.decisao.auditCommitment.appended === false && replay.estadoAuditoria.revision === 1);
checar('replay preserva exatamente o plano', JSON.stringify(replay.decisao.planoConsulta) === JSON.stringify(permitido.decisao.planoConsulta));
checar('replay divergente falha fechado', erroCodigo(() => comporConsultaAdminAuditada({ ...request, dataset: 'clientes' }, contexto, permitido.estadoAuditoria, opcoes)) === 'audit_replay_divergente');

const estadoNegado: any = criarEstadoAuditoriaAdmin(contexto, { agora: '2026-09-01T19:54:00Z' });
const negadoDataset: any = comporConsultaAdminAuditada(
  { ...request, auditId: 'audit-composition-002', correlationId: 'request-composition-002', dataset: 'recibos' },
  contexto,
  estadoNegado,
  opcoes,
);
checar('dataset negado ainda é auditado', negadoDataset.estadoAuditoria.revision === 1 && negadoDataset.decisao.auditCommitment.outcome === 'denied');
checar('dataset negado nunca libera plano', negadoDataset.decisao.allowed === false && negadoDataset.decisao.reason === 'dataset_not_allowed' && negadoDataset.decisao.planoConsulta === null);

const negadoPurpose: any = comporConsultaAdminAuditada(
  { ...request, auditId: 'audit-composition-003', correlationId: 'request-composition-003', purpose: 'billing_support' },
  contexto,
  criarEstadoAuditoriaAdmin(contexto, { agora: '2026-09-01T19:54:00Z' }),
  opcoes,
);
checar('purpose negado é auditado sem plano', negadoPurpose.decisao.reason === 'purpose_not_allowed' && negadoPurpose.decisao.planoConsulta === null && negadoPurpose.estadoAuditoria.revision === 1);

const contextoOwner: any = { ...contexto, role: 'owner' };
const empresa: any = comporConsultaAdminAuditada(
  { ...request, auditId: 'audit-composition-004', correlationId: 'request-composition-004', dataset: 'empresa' },
  contextoOwner,
  criarEstadoAuditoriaAdmin(contextoOwner, { agora: '2026-09-01T19:54:00Z' }),
  opcoes,
);
checar('empresa consulta somente coluna dados e exige projeção', empresa.decisao.planoConsulta.select === 'dados' && empresa.decisao.planoConsulta.projectionRequired === true);

checar('capability ausente falha antes de liberar plano', erroCodigo(() => comporConsultaAdminAuditada(request, { ...contexto, canAuditAdminData: false }, estado0, opcoes)) === 'capability_auditoria_obrigatoria');
checar('request com PII/campo extra falha fechado', erroCodigo(() => comporConsultaAdminAuditada({ ...request, email: 'pessoa@exemplo.com' }, contexto, estado0, opcoes)) === 'request_invalido');
checar('contexto com campo extra falha fechado', erroCodigo(() => comporConsultaAdminAuditada(request, { ...contexto, token: 'proibido' }, estado0, opcoes)) === 'contexto_invalido');
checar('opções com campo extra falham fechado', erroCodigo(() => comporConsultaAdminAuditada(request, contexto, estado0, { ...opcoes, provider: 'proibido' })) === 'opcoes_invalidas');
checar('estado ausente falha fechado', erroCodigo(() => comporConsultaAdminAuditada(request, contexto, null, opcoes)) === 'estado_auditoria_invalido');
checar('estado com campo extra falha fechado', erroCodigo(() => comporConsultaAdminAuditada(request, contexto, { ...estado0, dados: [] }, opcoes)) === 'estado_auditoria_invalido');

const entradaAdulterada: any = {
  ...permitido.estadoAuditoria,
  entries: permitido.estadoAuditoria.entries.map((entry: any) => ({ ...entry, fieldCount: 999 })),
};
checar('cadeia adulterada falha antes de liberar plano', erroCodigo(() => comporConsultaAdminAuditada({ ...request, auditId: 'audit-composition-005' }, contexto, entradaAdulterada, { ...opcoes, expectedRevision: 1 })) === 'cadeia_auditoria_invalida');

const entradaExtra: any = {
  ...permitido.estadoAuditoria,
  entries: permitido.estadoAuditoria.entries.map((entry: any) => ({ ...entry, resposta: 'proibida' })),
};
checar('entrada de auditoria com campo extra falha fechado', erroCodigo(() => comporConsultaAdminAuditada({ ...request, auditId: 'audit-composition-006' }, contexto, entradaExtra, { ...opcoes, expectedRevision: 1 })) === 'entrada_auditoria_invalida');
checar('conflito de revisão não libera plano', erroCodigo(() => comporConsultaAdminAuditada({ ...request, auditId: 'audit-composition-007' }, contexto, permitido.estadoAuditoria, { ...opcoes, expectedRevision: 0 })) === 'revision_conflict');
checar('relógio regressivo não libera plano', erroCodigo(() => comporConsultaAdminAuditada({ ...request, auditId: 'audit-composition-008' }, contexto, permitido.estadoAuditoria, { expectedRevision: 1, agora: '2026-09-01T19:53:00Z' })) === 'clock_skew');
checar('papel inválido falha fechado', erroCodigo(() => comporConsultaAdminAuditada(request, { ...contexto, role: 'leitura' }, estado0, opcoes)) === 'role_invalida');
checar('fingerprint de alvo inválida falha fechado', erroCodigo(() => comporConsultaAdminAuditada({ ...request, targetFingerprint: 'curta' }, contexto, estado0, opcoes)) === 'target_fingerprint_invalida');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);

