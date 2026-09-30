import {
  InMemoryOutboxStore,
  createIncrementAOutbox,
} from '../outbox/increment-a-outbox.mjs';
import {
  createGatewayFixture,
  trustedSession,
} from '../../JANELA_2_3/fixtures/gateway-fixture.mjs';

export * from '../../JANELA_2_3/fixtures/gateway-fixture.mjs';

export const FIXTURE_OUTBOX_ITEM_ID = 'outbox-item-fixture-a';
export const FIXTURE_LEASE_ID = 'lease-fixture-a';

const OUTBOX_TIME_BASE = Date.parse('2026-08-28T23:00:00.000Z');

export function createControlledClock(start = OUTBOX_TIME_BASE) {
  let current = start;
  return Object.freeze({
    now() {
      return new Date(current).toISOString();
    },
    advance(milliseconds) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
        throw new TypeError('Avanço de relógio inválido.');
      }
      current += milliseconds;
      return new Date(current).toISOString();
    },
  });
}

export function createOutboxFixture(options = {}) {
  const clock = createControlledClock(options.start);
  const gatewayFixture = createGatewayFixture();
  const store = new InMemoryOutboxStore({
    clock: () => clock.now(),
    leaseDurationMs: options.leaseDurationMs ?? 30_000,
    maxAttempts: options.maxAttempts ?? 3,
    backoffBaseMs: options.backoffBaseMs ?? 1_000,
    maxBackoffMs: options.maxBackoffMs ?? 60_000,
  });
  const deliveryGateway = options.deliveryFactory
    ? options.deliveryFactory(gatewayFixture.gateway)
    : options.gateway ?? gatewayFixture.gateway;
  const outbox = createIncrementAOutbox({
    store,
    gateway: deliveryGateway,
  });
  return {
    clock,
    gateway: gatewayFixture.gateway,
    gatewayStore: gatewayFixture.store,
    deliveryGateway,
    outbox,
    store,
  };
}

export function enqueueFixture(
  store,
  command,
  userId,
  itemId = FIXTURE_OUTBOX_ITEM_ID,
) {
  return store.enqueue(
    { item_id: itemId, command },
    trustedSession(userId),
  );
}
