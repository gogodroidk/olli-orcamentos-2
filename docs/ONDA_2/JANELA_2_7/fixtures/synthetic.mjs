export function decisionContext(overrides = {}) {
  return {
    tenantId: 'tenant.synthetic.001', actorId: 'user.synthetic.001', capabilities: ['document.decide'],
    commandId: 'command.decision.001', eventId: 'event.decision.001', now: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

export function rectificationContext(overrides = {}) {
  return {
    tenantId: 'tenant.synthetic.001', actorId: 'user.synthetic.001', capabilities: ['document.rectify'],
    commandId: 'command.rectification.001', eventId: 'event.rectification.001', now: '2026-08-30T10:01:00.000Z',
    ...overrides,
  };
}
