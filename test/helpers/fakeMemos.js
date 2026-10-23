// -----------------------------------------------------------------------------
// A fake Memos behind a `fetch` function: it starts from the bodies recorded
// on a real Memos 0.31.0 (test/fixtures/memos/0.31.0/), keeps its memos in
// memory, understands the two filters the integration sends (`tag in [...]`,
// `pinned`), and answers the errors the real server answers.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.40:5230';
export const TOKEN = 'memos_pat_test_token';
// The morning after the fixtures were recorded.
export const NOW = Date.parse('2026-10-24T08:00:00.000Z');

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/memos/0.31.0/${name}.json`, import.meta.url), 'utf8'),
  );

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

let counter = 0;
const newUid = () => `Fake${String((counter += 1)).padStart(18, '0')}`;

/** The tags Memos extracts from a content: `#a/b` gives `a` and `a/b`. */
function extractTags(content) {
  const tags = [];
  for (const [, raw] of content.matchAll(/(?:^|\s)#([^\s#]+)/gu)) {
    const tag = raw.replace(/[.,;:!?]+$/, '');
    const parts = tag.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      tags.push(parts.slice(0, i).join('/'));
    }
  }
  return [...new Set(tags)];
}

export function createMemos() {
  const state = {
    profile: fixture('profile').body,
    user: fixture('me').body.user,
    memos: structuredClone(fixture('memos').body.memos),
    down: false,
    html: false,
    oldServer: false,
    requests: [],
    clock: Date.parse('2026-10-23T18:05:00.000Z'),
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': type },
    });
  const error = (status, code, message) => answer(status, { code, message, details: [] });

  function stats() {
    const own = state.memos.filter((m) => m.creator === state.user.name);
    const tagCount = {};
    for (const memo of own) {
      for (const tag of memo.tags) {
        tagCount[tag] = (tagCount[tag] ?? 0) + 1;
      }
    }
    return {
      ...fixture('stats').body,
      tagCount,
      pinnedMemos: own.filter((m) => m.pinned).map((m) => m.name),
      totalMemoCount: own.length,
      memoTypeStats: {
        ...fixture('stats').body.memoTypeStats,
        undoCount: own.filter((m) => /- \[ \]/.test(m.content)).length,
      },
    };
  }

  function sorted() {
    return [...state.memos].sort((a, b) =>
      a.createTime === b.createTime ? 0 : a.createTime < b.createTime ? 1 : -1,
    );
  }

  /** Add a memo as a user would (in the web app, the mobile app...). */
  function addMemo({
    content = 'A memo',
    creator = state.user.name,
    visibility = 'PRIVATE',
    pinned = false,
    created,
  } = {}) {
    state.clock += 60_000;
    const at = created ?? new Date(state.clock).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const memo = {
      ...structuredClone(fixture('create').body),
      name: `memos/${newUid()}`,
      creator,
      createTime: at,
      updateTime: at,
      content,
      visibility,
      tags: extractTags(content),
      pinned,
      snippet: content.slice(0, 64),
    };
    state.memos.push(memo);
    return memo;
  }

  /** The two filters the integration writes, as Memos evaluates them. */
  function matches(memo, filter) {
    return filter.split(' && ').every((clause) => {
      if (clause === 'pinned') {
        return memo.pinned;
      }
      const creator = clause.match(/^creator == (".*")$/);
      if (creator) {
        return memo.creator === JSON.parse(creator[1]);
      }
      const tag = clause.match(/^tag in \[(".*")\]$/);
      if (tag) {
        return memo.tags.includes(JSON.parse(tag[1]));
      }
      throw new Error(`filter not understood: ${clause}`);
    });
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = decodeURIComponent(pathname.replace(/^\/api\/v1/, ''));
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${path}${searchParams.size ? `?${searchParams}` : ''}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.redirect) {
      return new Response(null, {
        status: 301,
        headers: { location: url.replace('http://', 'https://') },
      });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    if (state.oldServer && path === '/instance/profile') {
      return error(404, 5, 'Not Found');
    }
    if (method === 'GET' && path === '/instance/profile') {
      return answer(200, state.profile);
    }
    if (init.headers?.Authorization !== `Bearer ${TOKEN}`) {
      return answer(401, fixture('me-unauthorized').body);
    }
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (method === 'GET' && path === '/auth/me') {
      return answer(200, { user: state.user });
    }
    if (method === 'GET' && path === `/${state.user.name}:getStats`) {
      return answer(200, stats());
    }
    if (method === 'GET' && path === '/memos') {
      const filter = searchParams.get('filter');
      if (filter === 'invalid') {
        return answer(400, fixture('memos-bad-filter').body);
      }
      const visible = sorted().filter(
        (m) => m.creator === state.user.name || m.visibility !== 'PRIVATE',
      );
      const list = filter ? visible.filter((m) => matches(m, filter)) : visible;
      const size = Number(searchParams.get('pageSize') ?? 10);
      return answer(200, { memos: list.slice(0, size), nextPageToken: '' });
    }
    if (method === 'POST' && path === '/memos') {
      const memo = addMemo({
        content: body.content,
        visibility: ['PRIVATE', 'PROTECTED', 'PUBLIC'].includes(body.visibility)
          ? body.visibility
          : 'PRIVATE',
      });
      return answer(200, memo);
    }
    const match = path.match(/^\/(memos\/[^/]+)$/);
    if (method === 'PATCH' && match) {
      const memo = state.memos.find((m) => m.name === match[1]);
      if (!memo) {
        return answer(404, fixture('memo-not-found').body);
      }
      if (searchParams.get('updateMask') === 'pinned') {
        memo.pinned = body.pinned === true;
      }
      return answer(200, memo);
    }
    return answer(404, fixture('unknown-route').body);
  }

  return {
    state,
    fetch,
    addMemo,
    remove(name) {
      state.memos = state.memos.filter((m) => m.name !== name);
    },
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
  };
}
