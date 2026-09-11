export const quote = {
  quoteId: 'quote.synthetic.001',
  title: 'Proposta de manutenção preventiva',
  issuedAt: '2026-08-30T09:00:00.000Z',
  expiresAt: '2026-09-06T09:00:00.000Z',
  issuer: { displayName: 'Empresa Sintética', documentNumber: '00.000.000/0001-00' },
  recipient: { name: 'Cliente Sintético', email: 'cliente@example.test' },
  items: [{ description: 'Visita técnica', quantity: 1, unitPriceCents: 15000, totalCents: 15000 }],
  totals: { currency: 'BRL', totalCents: 15000 },
  terms: 'Validade de sete dias.',
  private: { costCents: 4000, marginCents: 11000, note: 'Uso interno', secret: 'never-public', modelPrompt: 'never-public' },
};

export const evidenceRefs = [{
  evidenceRefId: 'evidence.synthetic.001', digestAlgorithm: 'sha256',
  digestSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  mimeType: 'application/pdf', sizeBytes: 2048,
}];

export function publishContext(overrides = {}) {
  return {
    tenantId: 'tenant.synthetic.001', actorId: 'user.synthetic.001', capabilities: ['quote.publish'],
    commandId: 'command.synthetic.001', documentVersionId: 'document.version.synthetic.001',
    eventId: 'event.synthetic.001', now: '2026-08-30T09:01:00.000Z', evidenceRefs,
    ...overrides,
  };
}
