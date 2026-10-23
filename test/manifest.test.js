// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_MINUTES } from '../src/config.js';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { VISIBILITIES } from '../src/memos/model.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (key) => manifest.config_schema.find((f) => f.key === key);

test('identity: name, image, local and cloud transports, services category', () => {
  assert.equal(manifest.name, 'Memos');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-memos:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-memos/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local', 'cloud']);
  assert.deepEqual(manifest.categories, ['services']);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the widget form needs Gladys 5.2.0', () => {
  assert.equal(manifest.gladys_version, '>=5.2.0');
});

test('config_schema: the defaults and options of the code', () => {
  const keys = manifest.config_schema.filter((f) => f.type !== 'section').map((f) => f.key);
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const item of manifest.config_schema) {
    if (item.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[item.key], item.default, `default of ${item.key}`);
    }
  }
  assert.equal(field('access_token').type, 'secret');
  assert.deepEqual(
    field('refresh_minutes').options.map((o) => o.value),
    REFRESH_MINUTES,
  );
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('every action, scene action and widget has a handler, and vice versa', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const fake = world.fake;
  assert.match((await fake.action('nope')).error, /not implemented/i);
  for (const action of manifest.actions) {
    const ack = await fake.action(action.key, {});
    assert.equal(ack.success, true, `action ${action.key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(keysOf(manifest.widgets[0].settings), ['tag', 'pinned_only']);
  assert.equal((await fake.widgetGet(WIDGET_KEY, { settings: {} })).success, true);
  assert.equal(
    (await fake.widgetGet(WIDGET_KEY, { settings: { tag: 'maison', pinned_only: true } })).success,
    true,
  );
});

test('scene action fields and outputs are the ones the code reads and returns', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const samples = {
    create_memo: { content: 'Note', tags: 'a, b', visibility: 'public', pinned: true },
    pin_latest: { tag: 'maison', unpin: false },
  };
  for (const action of manifest.scene_actions) {
    assert.deepEqual(keysOf(action.fields).sort(), Object.keys(samples[action.key]).sort());
    const ack = await world.fake.sceneAction(action.key, samples[action.key]);
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(Object.keys(ack.data.outputs).sort(), keysOf(action.outputs).sort());
    for (const output of action.outputs) {
      assert.equal(typeof ack.data.outputs[output.key], output.type, output.key);
    }
  }
});

test('the scene triggers the hub fires are declared, with exactly their data', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.addMemo({ content: 'New #maison', visibility: 'PUBLIC' });
  await world.hub.refresh();
  const events = world.fake.sceneEvents;
  for (const trigger of manifest.scene_triggers) {
    const event = events.find((e) => e.key === trigger.key);
    assert.ok(event, trigger.key);
    const declared = new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)]);
    assert.deepEqual(Object.keys(event.data).sort(), [...declared].sort(), trigger.key);
    for (const variable of trigger.variables) {
      assert.equal(typeof event.data[variable.key], variable.type, variable.key);
    }
    for (const filter of trigger.fields ?? []) {
      // A filter is matched against the event value of the same key.
      if (filter.type === 'select') {
        assert.ok(
          filter.options.some((o) => o.value === event.data[filter.key]),
          `${trigger.key}.${filter.key}`,
        );
      } else {
        assert.equal(typeof event.data[filter.key], filter.type, `${trigger.key}.${filter.key}`);
      }
    }
  }
});

test('visibility options are the ones the code knows', () => {
  const options = [
    manifest.scene_actions.find((a) => a.key === 'create_memo').fields,
    manifest.scene_triggers.find((tr) => tr.key === 'memo_created').fields,
  ].map((fields) => fields.find((f) => f.key === 'visibility').options.map((o) => o.value));
  for (const values of options) {
    assert.deepEqual(
      values,
      VISIBILITIES.map((v) => v.toLowerCase()),
    );
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const item of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(item.source, 'devices');
    assert.equal(item.options, undefined, item.key);
  }
});

test('actions declare no secret field, no required field (Gladys#3154/#3155)', () => {
  for (const action of manifest.actions ?? []) {
    for (const item of action.fields ?? []) {
      assert.notEqual(item.type, 'secret');
      assert.notEqual(item.required, true);
    }
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
