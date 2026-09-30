import {
  ADMIN_ACCESS_AUDIT_VERSION,
  ADMIN_ACCESS_OUTCOMES,
  ADMIN_ACCESS_PURPOSES,
  anexarEventoAuditoriaAdmin,
  criarEstadoAuditoriaAdmin,
  criarEventoAcessoAdmin,
  projetarAuditoriaAdmin,
  verificarCadeiaAuditoriaAdmin,
} from '../worker/src/adminAccessAudit.js';
import { ADMIN_DATASETS, ADMIN_DATA_ROLES } from '../worker/src/adminDataPolicy.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nAdmin OLLI — trilha pseudonimizada de acesso');

const contexto: any = { actorFingerprint: 'a'.repeat(64), role: 'suporte', canAuditAdminData: true };
const input: any = {
  auditId: 'audit-001',
  correlationId: 'request-001',
  targetFingerprint: 'b'.repeat(64),
  dataset: 'orcamentos',
  purpose: 'support_diagnosis',
  outcome: 'allowed',
  fields: ['cpf', 'margem'],
  email: 'pessoa@exemplo.com',
};

checar('enums e versão são fechados', ADMIN_ACCESS_AUDIT_VERSION === '2026-09-01.v1' && ADMIN_ACCESS_PURPOSES.length === 4 && ADMIN_ACCESS_OUTCOMES.join(',') === 'allowed,denied');
checar('papéis e datasets vêm da política', ADMIN_DATA_ROLES.includes('suporte') && ADMIN_DATASETS.includes('orcamentos') && ADMIN_DATASETS.includes('auditoria'));

const evento: any = criarEventoAcessoAdmin(input, contexto, { agora: '2026-09-01T15:00:00Z' });
checar('acesso permitido é derivado da política', evento.outcome === 'allowed' && evento.denialReason === null && evento.fieldCount === 3);
checar('payload não escolhe outcome nem campos', !('fields' in evento) && evento.fieldCount !== input.fields.length);
checar('evento não carrega PII ou conteúdo', !('email' in evento) && !JSON.stringify(evento).includes('pessoa@exemplo.com') && !JSON.stringify(evento).includes('margem'));
checar('fingerprints permanecem pseudonimizadas', evento.actorFingerprint === 'a'.repeat(64) && evento.targetFingerprint === 'b'.repeat(64) && /^[a-f0-9]{64}$/.test(evento.fieldSetHash));
checar('evento é imutável', Object.isFrozen(evento));

const negadoDataset: any = criarEventoAcessoAdmin({ ...input, auditId: 'audit-002', correlationId: 'request-002', dataset: 'recibos' }, contexto, { agora: '2026-09-01T15:01:00Z' });
checar('dataset fora do papel é negado', negadoDataset.outcome === 'denied' && negadoDataset.denialReason === 'dataset_not_allowed' && negadoDataset.fieldCount === 0);
const negadoPurpose: any = criarEventoAcessoAdmin({ ...input, auditId: 'audit-003', correlationId: 'request-003', purpose: 'billing_support' }, contexto, { agora: '2026-09-01T15:02:00Z' });
checar('purpose fora do papel é negado', negadoPurpose.outcome === 'denied' && negadoPurpose.denialReason === 'purpose_not_allowed');

checar('capability é obrigatória', erroCodigo(() => criarEventoAcessoAdmin(input, { ...contexto, canAuditAdminData: false }, { agora: '2026-09-01T15:00:00Z' })) === 'capability_auditoria_obrigatoria');
checar('ator precisa de fingerprint', erroCodigo(() => criarEventoAcessoAdmin(input, { ...contexto, actorFingerprint: 'curta' }, { agora: '2026-09-01T15:00:00Z' })) === 'actor_fingerprint_invalida');
checar('alvo precisa de fingerprint', erroCodigo(() => criarEventoAcessoAdmin({ ...input, targetFingerprint: 'curta' }, contexto, { agora: '2026-09-01T15:00:00Z' })) === 'target_fingerprint_invalida');
checar('dataset desconhecido falha fechado', erroCodigo(() => criarEventoAcessoAdmin({ ...input, dataset: 'tudo' }, contexto, { agora: '2026-09-01T15:00:00Z' })) === 'dataset_invalido');
checar('purpose desconhecido falha fechado', erroCodigo(() => criarEventoAcessoAdmin({ ...input, purpose: 'treinar_ia' }, contexto, { agora: '2026-09-01T15:00:00Z' })) === 'purpose_invalido');

const estado0: any = criarEstadoAuditoriaAdmin(contexto, { agora: '2026-09-01T14:59:00Z' });
checar('estado inicial é imutável e vazio', estado0.revision === 0 && estado0.lastHash === '0'.repeat(64) && Object.isFrozen(estado0) && Object.isFrozen(estado0.entries));
const append1: any = anexarEventoAuditoriaAdmin(estado0, evento, contexto, { expectedRevision: 0 });
checar('primeiro append cria hash encadeado', append1.anexado && append1.revision === 1 && append1.estado.entries.length === 1 && append1.estado.entries[0].previousHash === '0'.repeat(64));
checar('cadeia inicial é verificável', verificarCadeiaAuditoriaAdmin(append1.estado));
checar('estado anterior não é mutado', estado0.revision === 0 && estado0.entries.length === 0);

const replay: any = anexarEventoAuditoriaAdmin(append1.estado, evento, contexto, { expectedRevision: 0 });
checar('replay idêntico é idempotente', !replay.anexado && replay.estado === append1.estado && replay.motivo === 'audit_duplicado');
checar('replay divergente falha fechado', erroCodigo(() => anexarEventoAuditoriaAdmin(append1.estado, { ...evento, outcome: 'denied' }, contexto, { expectedRevision: 1 })) === 'audit_replay_divergente');
checar('revision antiga falha fechado', erroCodigo(() => anexarEventoAuditoriaAdmin(append1.estado, negadoDataset, contexto, { expectedRevision: 0 })) === 'revision_conflict');

const append2: any = anexarEventoAuditoriaAdmin(append1.estado, negadoDataset, contexto, { expectedRevision: 1 });
checar('segundo append referencia hash anterior', append2.estado.entries[1].previousHash === append1.estado.lastHash && append2.estado.lastHash === append2.estado.entries[1].entryHash);
checar('cadeia com permitido e negado é válida', verificarCadeiaAuditoriaAdmin(append2.estado));
checar('clock regressivo falha fechado', erroCodigo(() => anexarEventoAuditoriaAdmin(append2.estado, { ...negadoPurpose, createdAt: '2026-09-01T14:00:00.000Z' }, contexto, { expectedRevision: 2 })) === 'clock_skew');
checar('outro ator não continua a cadeia', erroCodigo(() => anexarEventoAuditoriaAdmin(append2.estado, negadoPurpose, { ...contexto, actorFingerprint: 'c'.repeat(64) }, { expectedRevision: 2 })) === 'escopo_divergente');

const adulterado: any = { ...append2.estado, entries: append2.estado.entries.map((entry: any, i: number) => i === 0 ? { ...entry, fieldCount: 999 } : entry) };
checar('adulteração quebra verificação', !verificarCadeiaAuditoriaAdmin(adulterado));

const projecao: any = projetarAuditoriaAdmin(append2.estado);
checar('projeção confirma cadeia', projecao.chainValid === true && projecao.revision === 2 && projecao.entries.length === 2);
checar('projeção omite ator, alvo e field hash', projecao.entries.every((entry: any) => !('actorFingerprint' in entry) && !('targetFingerprint' in entry) && !('fieldSetHash' in entry)));
checar('projeção e entradas são imutáveis', Object.isFrozen(projecao) && Object.isFrozen(projecao.entries) && projecao.entries.every(Object.isFrozen));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
