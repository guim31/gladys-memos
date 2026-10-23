// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake Memos.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { HOST, NOW, TOKEN, createMemos, settle } from './fakeMemos.js';

export const FAST_TIMINGS = { widgetGap: 0, requestTimeout: 200 };

export async function createWorld({
  server = createMemos(),
  config = { url: HOST, access_token: TOKEN },
  devices = [],
  connect = true,
  store = new MemoryStore(),
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timings: FAST_TIMINGS,
    now: () => clock.now,
    store,
  });
  if (connect) {
    await gladys.connect();
    await settle(20);
  }
  return { gladys, app, hub: app.hub, server, store, clock, fake: gladys.fake };
}

// The Memos user of the fixtures (the owner of the token).
export const USER = 'admin';
export const memosDevice = (user = USER) => `ext:test-integration:memos:${user}`;
export const memosFeature = (key, user = USER) => `${memosDevice(user)}:${key}`;

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(fake) {
  for (const device of fake.discoveredDevices) {
    await fake.deviceCreated(device);
  }
  await settle();
}
