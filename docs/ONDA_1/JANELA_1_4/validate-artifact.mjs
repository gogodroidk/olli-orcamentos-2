import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(packageDir, '../..');
const artifactPath = path.join(packageDir, 'artifact.json');
const errors = [];

const requiredFiles = new Map([
  ['README.md', ['ARQUITETURA LOCAL COMPLETA', 'runtime continua NO-GO', 'revisão adversarial']],
  ['ARCHITECTURE_CONTRACTS.md', ['organization_id', 'snapshot', 'storage', 'AiProvider']],
  ['RBAC_AND_DATA_MATRIX.md', ['RBAC', 'ABAC', 'organization_id', 'Testes negativos']],
  ['MIGRATION_ROLLBACK_PLAN.md', ['Rollback', 'kill switch', 'banco efêmero']],
  ['FIRST_VERTICAL_SLICE.md', ['Incremento A', 'Incremento B', 'idempotência']],
  ['THREAT_MODEL_AND_TESTS.md', ['Ameaças', 'testes negativos', 'cross-tenant']],
  ['ADR-004-DOCUMENT-KERNEL-STORAGE-SIGNATURE.md', ['olli-document-sha256-v1', 'Fontes de autoridade', 'Atomicidade', 'fail', 'Kill switches', 'testes executáveis']],
  ['ADR-005-AUTHORIZATION-RBAC-ABAC.md', ['sessão/JWT válida', 'USING', 'WITH CHECK', 'fail', 'Kill switches', 'testes executáveis']],
  ['ADR-006-PRICING-ANALYTICS-PRIVACY.md', ['pricing_rule_version', 'analytics_cross_org_enabled', 'fail-closed', 'Kill switches', 'Testes executáveis']],
  ['ADR-007-AI-PROVIDER-EGRESS.md', ['AiProvider', 'allowlist', 'circuit breaker', 'fail', 'Kill switch', 'Testes negativos']],
  ['ADR_DECISION_REGISTER.md', ['ADOTADO-ARQUITETURA', 'PENDENTE-PROVA', 'BLOQUEADO', 'laboratório']],
  ['GATE_DECISION.md', ['GO ARQUITETURA LOCAL COMPLETA', 'GO ONDA 2 SOMENTE', 'NO-GO']],
  ['validate-artifact.mjs', ['requiredFiles', 'sha256', 'selfHashExcluded']],
]);

const requiredHeadings = new Map([
  ['ADR-004-DOCUMENT-KERNEL-STORAGE-SIGNATURE.md', ['Escopo, não-escopo e substituição', 'Fontes de autoridade e pontos de enforcement', 'Canonicalização e hash', 'Atomicidade de publicação e aceite', 'Auditoria, kill switch e testes obrigatórios', 'Rollback']],
  ['ADR-005-AUTHORIZATION-RBAC-ABAC.md', ['Escopo, não-escopo e substituição', 'Fontes de autoridade e enforcement', 'RLS e funções', 'Auditoria, kill switch e testes obrigatórios', 'Rollback']],
  ['ADR-006-PRICING-ANALYTICS-PRIVACY.md', ['Escopo, não-escopo e substituição', 'Fontes de autoridade e enforcement', 'Privacidade, auditoria, kill switch e testes', 'Rollback']],
  ['ADR-007-AI-PROVIDER-EGRESS.md', ['Escopo, não-escopo e substituição', 'Fontes de autoridade e enforcement', 'Contrato de dados e fronteira de ação', 'Cotas, fallback e auditoria', 'Testes negativos obrigatórios', 'Rollback']],
]);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (message) => errors.push(message);

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    fail(`${label} deve ser um array não vazio de strings`);
  }
}

let artifact;
try {
  artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({ ok: false, errors: [`artifact.json inválido/ausente: ${error.message}`] }, null, 2));
  process.exit(1);
}

if (artifact.schemaVersion !== 'olli.architecture.artifact/v1') fail('schemaVersion inesperada');
if (artifact.package?.id !== 'onda-1-janela-1-4') fail('package.id inesperado');
if (artifact.package?.path !== 'docs/ONDA_1/JANELA_1_4') fail('package.path inesperado');
if (artifact.package?.state !== 'architecture_complete_local_runtime_no_go') fail('package.state deve manter runtime_no_go');
if (artifact.package?.selfHashExcluded !== true) fail('selfHashExcluded deve ser true para evitar recursão do manifesto');
if (!Number.isFinite(Date.parse(artifact.generatedAt))) fail('generatedAt inválido');
if (artifact.protocol?.version !== '3.0.0' || !isSha256(artifact.protocol?.sha256)) fail('protocolo v3/hash inválido');
if (artifact.sourceSnapshot?.kind !== 'fixture_local_no_production_proof' || !isSha256(artifact.sourceSnapshot?.janela13ExecutableSnapshotSha256)) {
  fail('sourceSnapshot deve apontar para fixture local com hash válido e sem alegação de produção');
}

assertStringArray(artifact.gates?.allowed, 'gates.allowed');
assertStringArray(artifact.gates?.blocked, 'gates.blocked');
for (const term of ['produção', 'dado real', 'migration remota', 'provider externo']) {
  if (!artifact.gates?.blocked?.some((item) => item.toLocaleLowerCase('pt-BR').includes(term))) {
    fail(`gates.blocked não cobre: ${term}`);
  }
}

const decisionIds = new Set((artifact.decisions ?? []).map((decision) => decision.id));
for (const id of ['ADR-001', 'ADR-002', 'ADR-003', 'ADR-004', 'ADR-005', 'ADR-006', 'ADR-007']) {
  if (!decisionIds.has(id)) fail(`decisão ausente: ${id}`);
}
for (const decision of artifact.decisions ?? []) {
  if (!['adopted_architecture', 'pending_proof', 'blocked'].includes(decision.status)) fail(`status inválido em ${decision.id}`);
  if (decision.operationalAcceptance !== false) fail(`${decision.id} não pode declarar aceitação operacional`);
}

assertStringArray(artifact.sourceEvidence, 'sourceEvidence');
for (const relativeSource of artifact.sourceEvidence ?? []) {
  const resolved = path.resolve(packageDir, relativeSource);
  if (!isInside(docsDir, resolved)) {
    fail(`sourceEvidence sai de docs/: ${relativeSource}`);
    continue;
  }
  try {
    await stat(resolved);
  } catch {
    fail(`sourceEvidence ausente: ${relativeSource}`);
  }
}

if (!Array.isArray(artifact.files)) fail('files deve ser array');
const manifestByPath = new Map();
for (const entry of artifact.files ?? []) {
  if (!entry || typeof entry.path !== 'string') {
    fail('entrada de files sem path');
    continue;
  }
  if (manifestByPath.has(entry.path)) fail(`path duplicado no manifesto: ${entry.path}`);
  manifestByPath.set(entry.path, entry);
}
if (manifestByPath.has('artifact.json')) fail('artifact.json não deve tentar hashear a si próprio');

for (const [relativeFile, terms] of requiredFiles) {
  const entry = manifestByPath.get(relativeFile);
  if (!entry) {
    fail(`arquivo obrigatório fora do manifesto: ${relativeFile}`);
    continue;
  }
  if (path.basename(relativeFile) !== relativeFile || relativeFile.includes('..')) {
    fail(`path não canônico no pacote: ${relativeFile}`);
    continue;
  }
  const resolved = path.resolve(packageDir, relativeFile);
  if (!isInside(packageDir, resolved)) {
    fail(`path sai do pacote: ${relativeFile}`);
    continue;
  }
  let bytes;
  try {
    bytes = await readFile(resolved);
  } catch {
    fail(`arquivo ausente: ${relativeFile}`);
    continue;
  }
  if (entry.bytes !== bytes.byteLength) fail(`bytes divergentes: ${relativeFile}`);
  if (!isSha256(entry.sha256) || entry.sha256 !== sha256(bytes)) fail(`sha256 divergente: ${relativeFile}`);

  const text = bytes.toString('utf8');
  for (const term of terms) {
    if (!text.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))) fail(`${relativeFile} sem termo obrigatório: ${term}`);
  }
  for (const heading of requiredHeadings.get(relativeFile) ?? []) {
    const hasHeading = text.split(/\r?\n/).some((line) => /^#{1,4}\s+/.test(line) && line.toLocaleLowerCase('pt-BR').includes(heading.toLocaleLowerCase('pt-BR')));
    if (!hasHeading) fail(`${relativeFile} sem seção obrigatória: ${heading}`);
  }
  if (relativeFile.endsWith('.md')) {
    const fences = text.split(/\r?\n/).filter((line) => /^\s*```/.test(line)).length;
    if (fences % 2 !== 0) fail(`${relativeFile} possui bloco de código desbalanceado`);
  }
}

for (const extraPath of manifestByPath.keys()) {
  if (!requiredFiles.has(extraPath)) fail(`arquivo inesperado no manifesto: ${extraPath}`);
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
];
for (const relativeFile of requiredFiles.keys()) {
  const text = await readFile(path.join(packageDir, relativeFile), 'utf8');
  if (secretPatterns.some((pattern) => pattern.test(text))) fail(`padrão semelhante a segredo em ${relativeFile}`);
}

const result = {
  ok: errors.length === 0,
  schemaVersion: artifact.schemaVersion,
  state: artifact.package?.state,
  checkedFiles: requiredFiles.size,
  checkedSources: artifact.sourceEvidence?.length ?? 0,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exit(1);
