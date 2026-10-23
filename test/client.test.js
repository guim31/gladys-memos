// -----------------------------------------------------------------------------
// The configuration, the Memos syntax helpers and the REST client, against
// the bodies recorded on a real Memos 0.31.0.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, normalizeUrl } from '../src/config.js';
import { MemosClient, MemosError, tagFilter } from '../src/memos/client.js';
import {
  cleanTag,
  firstLine,
  parseTags,
  summarizeMemo,
  summarizeStats,
  withTags,
} from '../src/memos/model.js';
import { HOST, TOKEN, createMemos, fixture } from './helpers/fakeMemos.js';

test('addresses: default port 5230, reverse proxy paths, no credentials', () => {
  assert.equal(normalizeUrl('192.0.2.10'), 'http://192.0.2.10:5230');
  assert.equal(normalizeUrl('192.0.2.10:5231'), 'http://192.0.2.10:5231');
  assert.equal(normalizeUrl('https://example.org/memos/'), 'https://example.org/memos');
  assert.equal(normalizeUrl('http://192.0.2.10:5230/api/v1/'), 'http://192.0.2.10:5230');
  assert.equal(normalizeUrl('http://user:pass@example.org'), null);
  assert.equal(normalizeUrl('ftp://example.org'), null);
  assert.equal(normalizeUrl(''), null);
});

test('configuration: defaults, a pasted "Bearer", unknown values', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    urlInvalid: false,
    token: '',
    refreshMinutes: 5,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: ' 192.0.2.1 ',
    access_token: 'Bearer memos_pat_x ',
    refresh_minutes: '7',
    language: 'it',
  });
  assert.equal(config.token, 'memos_pat_x');
  assert.equal(config.refreshMinutes, Number(DEFAULT_CONFIG.refresh_minutes));
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ url: 'ftp://x' }).urlInvalid, true);
});

test('a real memo, summarized', () => {
  const memo = summarizeMemo(fixture('create').body);
  assert.equal(memo.uid, fixture('create').body.name.replace('memos/', ''));
  assert.equal(memo.title, 'Porte du garage restée ouverte 10 min #maison #journal/garage');
  assert.deepEqual(memo.tags, ['maison', 'journal', 'journal/garage']);
  assert.equal(memo.author, 'admin');
  assert.equal(memo.visibility, 'PRIVATE');
  assert.equal(memo.pinned, false);
  assert.equal(memo.created, '2026-10-23T18:03:55Z');
});

test('real statistics, summarized', () => {
  assert.deepEqual(summarizeStats(fixture('stats').body), {
    memos: 4,
    pinned: 1,
    tags: 3,
    todo: 1,
  });
  assert.deepEqual(summarizeStats({}), { memos: 0, pinned: 0, tags: 0, todo: 0 });
});

test('first line: Markdown marks dropped', () => {
  assert.equal(firstLine('\n\n# Courses\n- lait'), 'Courses');
  assert.equal(firstLine('- [ ] **piles** AA'), 'piles AA');
  assert.equal(firstLine('> cité'), 'cité');
  assert.equal(firstLine(''), '');
});

test('tags: typed with or without #, separated by commas or blanks', () => {
  assert.deepEqual(parseTags('courses, #maison home;home'), ['courses', 'maison', 'home']);
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(undefined), []);
  assert.equal(cleanTag(' #journal/garage/ '), 'journal/garage');
  assert.equal(cleanTag('liste de courses'), 'liste-de-courses');
  assert.equal(cleanTag('#'), '');
});

test('the tags a memo does not carry are added on a last line', () => {
  assert.equal(withTags('Lait', ['courses']), 'Lait\n\n#courses');
  assert.equal(withTags('Lait #courses.', ['courses']), 'Lait #courses.');
  assert.equal(withTags('Lait', []), 'Lait');
});

test('the tag filter is a CEL string, quotes escaped', () => {
  assert.equal(tagFilter('maison'), 'tag in ["maison"]');
  assert.equal(tagFilter('a"b'), 'tag in ["a\\"b"]');
});

const client = (server = createMemos(), token = TOKEN) =>
  new MemosClient({ url: HOST, token, fetch: server.fetch, timeout: 100 });

test('client: profile, current user, statistics, memos', async () => {
  const memos = client();
  assert.equal((await memos.profile()).version, '0.31.0');
  const user = await memos.me();
  assert.equal(user.name, 'users/admin');
  assert.equal((await memos.stats(user.name)).totalMemoCount, 4);
  const list = await memos.memos({ pageSize: 2 });
  assert.equal(list.length, 2);
});

test('client: the errors of a real Memos', async () => {
  await assert.rejects(client(createMemos(), 'memos_pat_wrong').me(), (err) => {
    assert.ok(err instanceof MemosError);
    assert.equal(err.kind, 'unauthorized');
    assert.equal(err.message, '/auth/me: authentication required');
    return true;
  });
  await assert.rejects(client().memos({ filter: 'invalid' }), { kind: 'rejected' });
  await assert.rejects(client().setPinned('memos/nope', true), {
    kind: 'not_found',
    message: '/memos/nope: memo not found',
  });
  const html = createMemos();
  html.state.html = true;
  await assert.rejects(client(html).profile(), { kind: 'invalid' });
  const down = createMemos();
  down.goDown();
  await assert.rejects(client(down).profile(), { kind: 'unreachable' });
  const slow = new MemosClient({
    url: HOST,
    token: TOKEN,
    timeout: 20,
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      }),
  });
  // AbortSignal.timeout does not hold the event loop (Node 22 would end the test).
  const hold = setTimeout(() => {}, 1000);
  await assert.rejects(slow.profile(), { kind: 'timeout' });
  clearTimeout(hold);
});

test('client: an old Memos is told apart from a wrong address', async () => {
  const old = createMemos();
  old.state.oldServer = true;
  await assert.rejects(client(old).profile(), { kind: 'too_old' });
  const notMemos = new MemosClient({
    url: HOST,
    token: TOKEN,
    fetch: async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }),
  });
  await assert.rejects(notMemos.profile(), { kind: 'invalid' });
  const htmlNotFound = new MemosClient({
    url: HOST,
    token: TOKEN,
    fetch: async () => new Response('<html>404</html>', { status: 404 }),
  });
  await assert.rejects(htmlNotFound.profile(), { kind: 'invalid' });
});

test('client: the token travels in the Authorization header only', async () => {
  const seen = [];
  const memos = new MemosClient({
    url: HOST,
    token: TOKEN,
    fetch: async (url, init) => {
      seen.push({ url, auth: init.headers.Authorization });
      return new Response(JSON.stringify({ memos: [] }), { status: 200 });
    },
  });
  await memos.memos({ pageSize: 3, filter: 'pinned' });
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
  assert.ok(!seen[0].url.includes(TOKEN));
  assert.equal(seen[0].url, `${HOST}/api/v1/memos?pageSize=3&filter=pinned`);
});
