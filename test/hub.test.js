// -----------------------------------------------------------------------------
// The hub end to end, against the SDK's fake Gladys and a fake Memos answering
// the bodies of a real Memos 0.31.0: device and states, transport badge,
// scene triggers, scene actions, widget, connection status, persistence.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { transportOf } from '../src/hub.js';
import { MemoryStore } from '../src/store.js';
import { HOST, TOKEN, createMemos, settle } from './helpers/fakeMemos.js';
import { createAll, createWorld, memosDevice, memosFeature } from './helpers/world.js';

const events = (fake, key) => fake.sceneEvents.filter((event) => event.key === key);

test('one device per Memos server, states once added, republished on creation', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const [device] = world.fake.discoveredDevices;
  assert.equal(device.external_id, memosDevice());
  assert.equal(device.should_poll, false);
  assert.equal(device.model, 'Memos 0.31.0');
  assert.deepEqual(
    device.features.map((f) => f.name),
    ['Mémos', 'Mémos épinglés', 'Étiquettes', 'Mémos avec tâches à faire', 'Dernier mémo'],
  );
  assert.deepEqual(device.params, [
    { name: 'MEMOS_URL', value: HOST },
    { name: 'MEMOS_USER', value: 'admin' },
  ]);
  // Not added yet: nothing published.
  assert.equal(world.fake.states.length, 0);
  await createAll(world.fake);
  assert.equal(world.fake.lastState(memosFeature('memos')), 4);
  assert.equal(world.fake.lastState(memosFeature('pinned')), 1);
  assert.equal(world.fake.lastState(memosFeature('tags')), 3, 'maison, journal, courses');
  assert.equal(world.fake.lastState(memosFeature('todo')), 1);
  assert.equal(
    world.fake.lastState(memosFeature('latest')),
    'Porte du garage restée ouverte 10 min #maison #journal/garage',
  );
  // 192.0.2.40 (the documentation range of the fixtures) is a public address.
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: memosDevice(),
    transport: 'cloud',
  });
  assert.ok(world.fake.widgetRefreshes.length > 0);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the container reads Memos on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({
    config: { url: HOST, access_token: TOKEN, refresh_minutes: '1' },
  });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addMemo({ content: '# Courses\n\n- [ ] piles' });
  t.mock.timers.tick(60_000);
  await settle(20);
  assert.equal(world.fake.lastState(memosFeature('memos')), 5);
  assert.equal(world.fake.lastState(memosFeature('todo')), 2);
  assert.equal(world.fake.lastState(memosFeature('latest')), 'Courses');
});

test('new memo: silent baseline, then one event per memo and per tag, never twice', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');
  world.server.addMemo({
    content: 'Les clés sont chez le voisin #maison/clés',
    visibility: 'PUBLIC',
  });
  world.server.addMemo({ content: 'Rappel : poubelles', creator: 'users/camille' });
  world.server.addMemo({ content: 'Shared', creator: 'users/camille', visibility: 'PROTECTED' });
  await world.hub.refresh();
  await world.hub.refresh();
  const created = events(world.fake, 'memo_created');
  // camille's private memo is not readable with the token of admin.
  assert.equal(created.length, 2);
  assert.deepEqual(created[0].data, {
    content: 'Les clés sont chez le voisin #maison/clés',
    title: 'Les clés sont chez le voisin #maison/clés',
    tags: 'maison, maison/clés',
    author: 'admin',
    visibility: 'public',
    visibility_name: 'Public',
    link: `${HOST}/memos/${created[0].data.link.split('/').at(-1)}`,
  });
  assert.equal(created[1].data.author, 'camille');
  assert.equal(created[1].data.visibility, 'protected');
  const tagged = events(world.fake, 'memo_tagged');
  assert.deepEqual(
    tagged.map((e) => e.data.tag),
    ['maison', 'maison/clés'],
  );
  assert.equal(tagged[0].data.content, created[0].data.content);
});

test('the memos written by the integration are not announced (no scene loop)', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('create_memo', { content: 'Journal', tags: 'maison' });
  assert.equal(ack.success, true, ack.error);
  await world.hub.refresh();
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('a burst of memos fires 10 events, the rest is recorded as seen', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 15; i += 1) {
    world.server.addMemo({ content: `Import ${i}` });
  }
  await world.hub.refresh();
  await world.hub.refresh();
  const created = events(world.fake, 'memo_created');
  assert.equal(created.length, 10);
  assert.equal(created[0].data.content, 'Import 0', 'in the order they were written');
});

test('an older memo sliding into the list after a deletion is not announced', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const names = [];
  for (let i = 0; i < 20; i += 1) {
    names.push(world.server.addMemo({ content: `Memo ${i}` }).name);
  }
  await world.hub.refresh();
  const before = world.fake.sceneEvents.length;
  world.server.remove(names.at(-1));
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, before);
});

test('an event Gladys refused (disconnected) is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.addMemo({ content: 'Retry me' });
  const original = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async () => {
    throw new Error('not connected');
  };
  await world.hub.refresh();
  world.gladys.publishSceneEvent = original;
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake, 'memo_created').map((e) => e.data.content),
    ['Retry me'],
  );
});

test('the triggers survive a restart: what was seen is kept in /data', async (t) => {
  const store = new MemoryStore();
  const server = createMemos();
  const first = await createWorld({ server, store });
  await first.app.stop();
  server.addMemo({ content: 'While Gladys was off' });
  const second = await createWorld({ server, store });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second.fake, 'memo_created').map((e) => e.data.content),
    ['While Gladys was off'],
  );
});

test('create_memo: tags appended, private by default, pinned on demand', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('create_memo', {
    content: 'Porte du garage ouverte à 22 h #maison',
    tags: 'maison, #journal, garage porte',
    pinned: true,
  });
  assert.equal(ack.success, true, ack.error);
  const memo = world.server.state.memos.at(-1);
  assert.equal(memo.content, 'Porte du garage ouverte à 22 h #maison\n\n#journal #garage #porte');
  assert.equal(memo.visibility, 'PRIVATE');
  assert.equal(memo.pinned, true);
  assert.equal(ack.data.outputs.memo_id, memo.name.replace('memos/', ''));
  assert.equal(ack.data.outputs.title, 'Porte du garage ouverte à 22 h #maison');
  assert.equal(ack.data.outputs.link, `${HOST}/${memo.name}`);
  const pub = await world.fake.sceneAction('create_memo', { content: 'x', visibility: 'public' });
  assert.equal(pub.success, true);
  assert.equal(world.server.state.memos.at(-1).visibility, 'PUBLIC');
});

test('create_memo refuses an empty memo (Memos would store it)', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.server.state.memos.length;
  const ack = await world.fake.sceneAction('create_memo', { content: '   ' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Saisissez le texte du mémo/);
  assert.equal(world.server.state.memos.length, before);
});

test('pin_latest pins the newest memo of a tag, unpins on demand', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const older = world.server.addMemo({ content: 'Semaine 1 #courses' });
  const newer = world.server.addMemo({ content: 'Semaine 2 #courses' });
  let ack = await world.fake.sceneAction('pin_latest', { tag: '#courses' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(newer.pinned, true);
  assert.equal(older.pinned, false);
  assert.equal(ack.data.outputs.title, 'Semaine 2 #courses');
  ack = await world.fake.sceneAction('pin_latest', { tag: 'courses', unpin: true });
  assert.equal(ack.success, true, ack.error);
  assert.equal(newer.pinned, false);
  ack = await world.fake.sceneAction('pin_latest', { tag: 'nothing' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Aucun mémo avec l'étiquette #nothing/);
});

test('the scene actions explain Memos errors in the chosen language', async (t) => {
  const world = await createWorld({
    config: { url: HOST, access_token: 'memos_pat_wrong', language: 'de' },
  });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('create_memo', { content: 'x' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Zugangstoken abgelehnt/);
  world.server.goDown();
  const down = await world.fake.sceneAction('pin_latest', { tag: 'a' });
  assert.match(down.error, /Memos antwortet nicht/);
});

test('the widget: counters, newest memos, tag and pinned filters, valid content', async (t) => {
  const world = await createWorld({
    config: { url: 'https://memos.example.org', access_token: TOKEN },
  });
  t.after(() => world.app.stop());
  const all = await world.fake.widgetGet('memos', { settings: {}, language: 'en' });
  assert.equal(all.success, true, all.error);
  const content = all.data.content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  assert.deepEqual(
    content.components.slice(0, 3).map((c) => [c.label, c.value]),
    [
      ['Memos', 4],
      ['Pinned', 1],
      ['Open tasks', 1],
    ],
  );
  const list = content.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 5);
  assert.equal(list.items[0].title, 'Porte du garage restée ouverte 10 min #maison #journal/gara…');
  assert.match(list.items[0].subtitle, /^23 Oct · admin · #maison #journal$/);
  assert.match(list.items[0].links[0].url, /^https:\/\/memos\.example\.org\/memos\//);
  assert.equal(list.items.at(-1).badge.text, 'Pinned');

  const tagged = await world.fake.widgetGet('memos', { settings: { tag: '#courses' } });
  const items = tagged.data.content.components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(
    items.map((i) => i.title),
    ['Second note #courses'],
  );
  const pinned = await world.fake.widgetGet('memos', {
    settings: { tag: 'maison', pinned_only: true },
  });
  const pinnedItems = pinned.data.content.components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(
    pinnedItems.map((i) => i.title),
    ['Hello #maison and #journal/porte'],
  );
});

test('the widget form writes a memo, with the tag of the widget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetAction(
    'memos',
    'new_memo',
    {},
    {
      settings: { tag: 'courses' },
      values: { content: 'Lait' },
    },
  );
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Mémo enregistré dans Memos.');
  assert.equal(world.server.state.memos.at(-1).content, 'Lait\n\n#courses');
  const old = await world.fake.widgetAction('memos', 'new_memo', {}, { settings: {} });
  assert.equal(old.success, false);
  assert.match(old.error, /5\.2/);
});

test('the widget says when Memos is not configured or does not answer', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const waiting = await world.fake.widgetGet('memos', { settings: {}, language: 'fr' });
  assert.match(waiting.data.content.components[0].text, /En attente de Memos/);
  const other = await createWorld();
  t.after(() => other.app.stop());
  other.server.goDown();
  await other.hub.refresh();
  const down = await other.fake.widgetGet('memos', { settings: {}, language: 'es' });
  assert.ok(down.data.content.components.some((c) => /Memos no responde/.test(c.text ?? '')));
});

test('connection status and badge follow the server', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.goDown();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Memos ne répond pas/);
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'cloud');
});

test('configuration problems have their own message', async () => {
  const cases = [
    [{}, /Saisissez l'adresse de Memos/],
    [{ url: 'ftp://x' }, /pas valide/],
    [{ url: HOST }, /Saisissez un jeton/],
    [{ url: HOST, access_token: 'memos_pat_wrong' }, /refusé le jeton/],
  ];
  for (const [config, expected] of cases) {
    const world = await createWorld({ config });
    assert.match(world.fake.connectionStatus.message.fr, expected, JSON.stringify(config));
    await world.app.stop();
  }
  const html = createMemos();
  html.state.html = true;
  const proxy = await createWorld({ server: html });
  assert.match(proxy.fake.connectionStatus.message.fr, /ne répond pas comme Memos/);
  await proxy.app.stop();
  const old = createMemos();
  old.state.oldServer = true;
  const tooOld = await createWorld({ server: old });
  assert.match(tooOld.fake.connectionStatus.message.fr, /trop ancien/);
  await tooOld.app.stop();
  const fresh = createMemos();
  fresh.state.profile = { ...fresh.state.profile, needsSetup: true };
  const setup = await createWorld({ server: fresh });
  assert.match(setup.fake.connectionStatus.message.fr, /pas encore de compte/);
  await setup.app.stop();
});

test('test_connection reports the user, the version and the count', async (t) => {
  const world = await createWorld({ config: { url: HOST, access_token: TOKEN, language: 'en' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.en, 'Connected to Memos 0.31.0 as admin: 4 memo(s).');
});

test('a language change renames nothing but republishes the states', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  await world.fake.configUpdated({ url: HOST, access_token: TOKEN, language: 'en' });
  await settle(20);
  assert.equal(world.fake.discoveredDevices[0].features[0].name, 'Memos');
  world.server.state.memos = [];
  await world.hub.refresh();
  assert.equal(world.fake.lastState(memosFeature('latest')), 'None');
});

test('transport badge: local addresses and names, public hosts in the cloud', () => {
  for (const url of [
    'http://192.168.1.5:5230',
    'http://10.0.0.2',
    'http://172.20.0.1',
    'http://100.101.102.103',
    'http://memos.local',
    'http://memos',
    'http://[fd00::1]:5230',
    'http://nas.home.arpa',
  ]) {
    assert.equal(transportOf(url), 'local', url);
  }
  for (const url of ['https://memos.example.org', 'http://203.0.113.4', 'http://[2001:db8::1]']) {
    assert.equal(transportOf(url), 'cloud', url);
  }
});
