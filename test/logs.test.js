// What reaches `docker logs` at the default level (info): the lifecycle only.
// A normal cycle (reads, published states, events, polls) writes nothing at
// info, an outage logs one line, and its recovery one more.
//
// The SDK logger writes through console.log (debug, info) and console.error
// (warn, error), re-reading LOG_LEVEL on every call: the tests capture both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST, createMemos } from './helpers/fakeMemos.js';
import { createAll, createWorld } from './helpers/world.js';

function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const captured = [];
  const record = (...args) => captured.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    all: () => [...captured],
    lines: () => captured.filter((line) => !line.includes('[DEBUG]') && line.includes('[memos-')),
    reset: () => captured.splice(0),
  };
}

test('a normal cycle writes nothing at info: reads, states, events, polls', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const start = logs.lines();
  assert.deepEqual(start.length, 1, start.join('\n'));
  assert.match(start[0], /Connected to Memos 0\.31\.0 \(4 memos\)/);
  logs.reset();
  for (let i = 0; i < 5; i += 1) {
    world.server.addMemo({ content: `Secret diary ${i} #journal` });
    await world.hub.refresh();
  }
  await world.fake.poll(world.fake.discoveredDevices[0]);
  await world.fake.widgetGet('memos', { settings: { tag: 'journal' } });
  assert.ok(world.fake.sceneEvents.length >= 10, 'events were fired');
  assert.deepEqual(logs.lines(), [], 'nothing at info or above');
  assert.ok(!logs.all().join('\n').includes('Secret diary'), 'no memo content, even in debug');
});

test('one line per memo written by the user, without its content', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  await world.fake.sceneAction('create_memo', { content: 'Secret plans', tags: 'a, b' });
  const lines = logs.lines();
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[INFO\].*Memo saved \(private, 2 tag\(s\)\)/);
  assert.ok(!logs.all().join('\n').includes('Secret plans'), 'the content is not logged');
});

test('Memos down: one warning, nothing per attempt, one line when it is back', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  world.server.goDown();
  for (let i = 0; i < 4; i += 1) {
    await world.hub.refresh();
  }
  const down = logs.lines();
  assert.equal(down.length, 1, down.join('\n'));
  assert.match(down[0], /\[WARN\].*Memos unreachable \(ECONNREFUSED\)/);
  logs.reset();
  world.server.goUp();
  await world.hub.refresh();
  const back = logs.lines();
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*Memos answers again \(4 memos\)/);
});

test('the access token never reaches the logs', async (t) => {
  const logs = captureLogs(t);
  for (const token of ['memos_pat_s3cr3t_wrong', 'memos_pat_test_token']) {
    const world = await createWorld({
      server: createMemos(),
      config: { url: HOST, access_token: token },
    });
    await world.hub.refresh();
    await world.app.stop();
  }
  const all = logs.all().join('\n');
  for (const secret of ['memos_pat_s3cr3t_wrong', 'memos_pat_test_token']) {
    assert.ok(!all.includes(secret), secret);
  }
});
