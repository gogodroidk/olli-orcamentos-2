import {
  assertIdentifier,
  assertIsoDate,
  assertSha256,
  canonicalJson,
  immutableJson,
  invariant,
  isPlainObject,
  sha256Hex,
} from '../shared/canonical.mjs';

const DOCUMENT_KINDS = new Set(['quote', 'contract', 'work_order', 'delivery_term', 'pmoc_report']);
const EVIDENCE_KINDS = new Set(['photo', 'measurement', 'attachment', 'external_art', 'signature_mark']);
const SIGNATURE_LEVELS = new Set(['acceptance', 'drawn_mark', 'advanced_external', 'qualified_external']);
const SIGNATURE_ACTIONS = new Set(['signed', 'refused']);
const SIGNATURE_ROLES = new Set(['client', 'provider', 'technician', 'responsible_professional']);

function validateSchema(schema) {
  invariant(isPlainObject(schema), 'schema documental inválido');
  assertIdentifier(schema.schemaId, 'schemaId');
  invariant(Number.isInteger(schema.version) && schema.version > 0, 'schema.version inválida');
  invariant(DOCUMENT_KINDS.has(schema.kind), 'schema.kind não suportado no spike');
  invariant(typeof schema.title === 'string' && schema.title.trim().length > 0, 'schema.title obrigatório');
  invariant(Array.isArray(schema.fields) && schema.fields.length > 0, 'schema.fields obrigatório');

  const keys = new Set();
  for (const field of schema.fields) {
    invariant(isPlainObject(field), 'campo de schema inválido');
    assertIdentifier(field.key, 'field.key');
    invariant(!keys.has(field.key), `campo duplicado: ${field.key}`);
    keys.add(field.key);
    invariant(typeof field.required === 'boolean', `required inválido em ${field.key}`);
    invariant(typeof field.allowNotApplicable === 'boolean', `allowNotApplicable inválido em ${field.key}`);
  }

  const policy = schema.signaturePolicy;
  invariant(isPlainObject(policy), 'signaturePolicy obrigatória');
  invariant(Array.isArray(policy.requiredRoles) && policy.requiredRoles.length > 0, 'requiredRoles deve exigir ao menos um papel');
  invariant(Array.isArray(policy.allowedLevels) && policy.allowedLevels.length > 0, 'allowedLevels inválido');
  for (const role of policy.requiredRoles) invariant(SIGNATURE_ROLES.has(role), `papel inválido: ${role}`);
  invariant(new Set(policy.requiredRoles).size === policy.requiredRoles.length, 'requiredRoles não pode repetir papel');
  for (const level of policy.allowedLevels) invariant(SIGNATURE_LEVELS.has(level), `nível inválido: ${level}`);

  const trust = schema.trustPolicy;
  invariant(isPlainObject(trust), 'trustPolicy obrigatória');
  invariant(trust.automatedConformity === false, 'spike não pode declarar conformidade automática');
  invariant(trust.emitsArt === false, 'spike não pode emitir ART');
  invariant(trust.replacesResponsibleProfessional === false, 'spike não pode substituir RT');
  return immutableJson(schema);
}

function isNotApplicable(value) {
  return isPlainObject(value) && value.notApplicable === true && typeof value.reason === 'string' && value.reason.trim().length > 0;
}

function validatePayload(schema, payload) {
  invariant(isPlainObject(payload), 'payload documental deve ser objeto JSON');
  const allowed = new Set(schema.fields.map((field) => field.key));
  for (const key of Object.keys(payload)) invariant(allowed.has(key), `campo não declarado no schema: ${key}`);

  for (const field of schema.fields) {
    const present = Object.hasOwn(payload, field.key);
    if (field.required) invariant(present, `campo obrigatório ausente: ${field.key}`);
    if (!present) continue;
    const value = payload[field.key];
    if (isNotApplicable(value)) {
      invariant(field.allowNotApplicable, `campo ${field.key} não aceita não aplicável`);
      continue;
    }
    invariant(value !== null && value !== '', `campo ${field.key} não pode ser vazio`);
  }
  return immutableJson(payload);
}

function validateEvidence(evidence) {
  invariant(isPlainObject(evidence), 'evidência inválida');
  assertIdentifier(evidence.id, 'evidence.id');
  invariant(EVIDENCE_KINDS.has(evidence.kind), `tipo de evidência inválido: ${evidence.kind}`);
  invariant(typeof evidence.uri === 'string' && /^(private|fixture|external):\/\//.test(evidence.uri), 'evidence.uri deve ser referência privada, fixture ou externa');
  assertSha256(evidence.sha256, 'evidence.sha256');
  assertIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  assertIdentifier(evidence.actorId, 'evidence.actorId');
  invariant(typeof evidence.sourceLabel === 'string' && evidence.sourceLabel.trim().length > 0, 'evidence.sourceLabel obrigatório');
  if (evidence.kind === 'external_art') invariant(evidence.uri.startsWith('external://'), 'ART deve permanecer externa');
  return immutableJson(evidence);
}

function contentSnapshot({ organizationId, schema, source, payload, evidence, createdAt, supersedesId }) {
  return {
    organizationId,
    schemaId: schema.schemaId,
    schemaVersion: schema.version,
    schemaKind: schema.kind,
    source,
    payload,
    evidence,
    createdAt,
    supersedesId: supersedesId ?? null,
  };
}

export function createDocumentDraft({ id, organizationId, schema, source, payload, evidence = [], createdAt, supersedesId = null }) {
  assertIdentifier(id, 'document.id');
  assertIdentifier(organizationId, 'document.organizationId');
  const validSchema = validateSchema(schema);
  invariant(isPlainObject(source), 'document.source inválida');
  assertIdentifier(source.type, 'document.source.type');
  assertIdentifier(source.id, 'document.source.id');
  invariant(Number.isInteger(source.version) && source.version > 0, 'document.source.version inválida');
  assertIsoDate(createdAt, 'document.createdAt');
  if (supersedesId !== null) assertIdentifier(supersedesId, 'document.supersedesId');

  const validPayload = validatePayload(validSchema, payload);
  const validEvidence = evidence.map(validateEvidence);
  invariant(new Set(validEvidence.map((item) => item.id)).size === validEvidence.length, 'IDs de evidência duplicados');
  const snapshot = contentSnapshot({
    organizationId,
    schema: validSchema,
    source: immutableJson(source),
    payload: validPayload,
    evidence: validEvidence,
    createdAt,
    supersedesId,
  });

  return immutableJson({
    id,
    organizationId,
    schema: validSchema,
    source,
    payload: validPayload,
    evidence: validEvidence,
    createdAt,
    supersedesId,
    status: 'draft',
    contentHash: sha256Hex(snapshot),
    lifecycleEvents: [],
    signatureEvents: [],
  });
}

export function verifyDocumentHash(document) {
  const snapshot = contentSnapshot({
    organizationId: document.organizationId,
    schema: document.schema,
    source: document.source,
    payload: document.payload,
    evidence: document.evidence,
    createdAt: document.createdAt,
    supersedesId: document.supersedesId,
  });
  return sha256Hex(snapshot) === document.contentHash;
}

export function approveDocument(document, { eventId, actorId, at }) {
  invariant(document.status === 'draft', 'somente rascunho pode ser aprovado');
  invariant(verifyDocumentHash(document), 'hash documental divergente');
  assertIdentifier(eventId, 'approval.eventId');
  assertIdentifier(actorId, 'approval.actorId');
  assertIsoDate(at, 'approval.at');
  const event = immutableJson({
    id: eventId,
    kind: 'approved',
    actorId,
    at,
    documentHash: document.contentHash,
  });
  return immutableJson({
    ...document,
    status: 'approved',
    approvedAt: at,
    lifecycleEvents: [...document.lifecycleEvents, event],
  });
}

function validateSignatureEvent(document, input) {
  assertIdentifier(input.id, 'signature.id');
  invariant(!document.signatureEvents.some((event) => event.id === input.id), 'evento de assinatura duplicado');
  invariant(SIGNATURE_ACTIONS.has(input.action), 'signature.action inválida');
  invariant(SIGNATURE_ROLES.has(input.role), 'signature.role inválida');
  invariant(SIGNATURE_LEVELS.has(input.level), 'signature.level inválida');
  invariant(document.schema.signaturePolicy.allowedLevels.includes(input.level), 'nível não permitido pelo schema');
  assertIdentifier(input.signerId, 'signature.signerId');
  assertIsoDate(input.at, 'signature.at');
  invariant(input.documentHash === document.contentHash, 'assinatura deve referenciar o hash exato do documento');

  const evidenceIds = new Set(document.evidence.map((item) => item.id));
  const refs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [];
  for (const ref of refs) invariant(evidenceIds.has(ref), `evidência de assinatura inexistente: ${ref}`);

  if (input.action === 'signed' && input.level === 'acceptance') {
    invariant(typeof input.affirmation === 'string' && input.affirmation.trim().length > 0, 'aceite exige ação afirmativa textual');
    invariant(typeof input.authenticationMethod === 'string' && input.authenticationMethod.trim().length > 0, 'aceite exige método de autenticação');
  }
  if (input.action === 'signed' && input.level === 'drawn_mark') {
    invariant(refs.some((ref) => document.evidence.find((item) => item.id === ref)?.kind === 'signature_mark'), 'rubrica desenhada exige evidenceRef do tipo signature_mark');
    invariant(!input.certificateRef, 'rubrica desenhada não deve se apresentar como certificado');
  }
  if (input.action === 'signed' && input.level === 'advanced_external') {
    invariant(typeof input.providerRef === 'string' && input.providerRef.startsWith('external://'), 'assinatura avançada exige provedor externo');
  }
  if (input.action === 'signed' && input.level === 'qualified_external') {
    invariant(typeof input.providerRef === 'string' && input.providerRef.startsWith('external://'), 'assinatura qualificada exige provedor externo');
    invariant(typeof input.certificateRef === 'string' && input.certificateRef.startsWith('external://'), 'assinatura qualificada exige certificado externo');
  }
  return immutableJson(input);
}

export function appendSignatureEvent(document, input) {
  invariant(document.status === 'approved' || document.status === 'signed', 'documento precisa estar aprovado antes da assinatura');
  invariant(verifyDocumentHash(document), 'hash documental divergente');
  const event = validateSignatureEvent(document, input);
  const signatureEvents = [...document.signatureEvents, event];
  const signedRoles = new Set(signatureEvents.filter((item) => item.action === 'signed').map((item) => item.role));
  const complete = document.schema.signaturePolicy.requiredRoles.every((role) => signedRoles.has(role));
  return immutableJson({
    ...document,
    status: complete ? 'signed' : document.status,
    signedAt: complete ? input.at : document.signedAt ?? null,
    signatureEvents,
  });
}

export function createDocumentRevision(previous, { id, payload, evidence, createdAt, reason, actorId, eventId }) {
  invariant(previous.status === 'approved' || previous.status === 'signed', 'somente versão aprovada ou assinada pode ser retificada');
  invariant(verifyDocumentHash(previous), 'hash da versão anterior divergente');
  invariant(typeof reason === 'string' && reason.trim().length > 0, 'motivo da retificação obrigatório');
  assertIdentifier(actorId, 'revision.actorId');
  assertIdentifier(eventId, 'revision.eventId');
  const next = createDocumentDraft({
    id,
    organizationId: previous.organizationId,
    schema: previous.schema,
    source: previous.source,
    payload,
    evidence,
    createdAt,
    supersedesId: previous.id,
  });
  return immutableJson({
    previous,
    next,
    event: {
      id: eventId,
      kind: 'revision_created',
      actorId,
      at: createdAt,
      reason,
      previousDocumentId: previous.id,
      previousHash: previous.contentHash,
      nextDocumentId: next.id,
      nextHash: next.contentHash,
    },
  });
}

export function documentRenderContext(document, { audience = 'client' } = {}) {
  invariant(verifyDocumentHash(document), 'documento adulterado não pode ser renderizado');
  invariant(audience === 'client' || audience === 'internal', 'audience inválida');
  return immutableJson({
    documentId: document.id,
    documentHash: document.contentHash,
    schemaId: document.schema.schemaId,
    schemaVersion: document.schema.version,
    title: document.schema.title,
    payload: document.payload,
    evidence: audience === 'internal'
      ? document.evidence
      : document.evidence.map(({ id, kind, sha256, capturedAt, sourceLabel }) => ({ id, kind, sha256, capturedAt, sourceLabel })),
    signatures: document.signatureEvents.map(({ id, action, role, level, at, documentHash }) => ({ id, action, role, level, at, documentHash })),
    trust: {
      automatedConformity: false,
      artEmittedByOlli: false,
      replacesResponsibleProfessional: false,
      drawnMarkIsQualifiedSignature: false,
    },
  });
}

export function canonicalDocumentJson(document) {
  invariant(verifyDocumentHash(document), 'hash documental divergente');
  return canonicalJson(document);
}
