// -----------------------------------------------------------------------------
// The REST API of Memos (`<base>/api/v1/...`, the gRPC-gateway mapping of its
// protobuf services), the few calls the integration needs, authenticated by a
// personal access token (`Authorization: Bearer memos_pat_...`).
//
// Facts checked on a real server, Memos 0.31.0 (neosmemo/memos:stable), see
// test/fixtures/memos/0.31.0/:
// - errors are JSON `{ code, message, details }` (gRPC codes): 401
//   `{ code: 16, message: "authentication required" }`, 404 `memo not found`,
//   400 `invalid filter: ...`;
// - `GET /instance/profile` answers without a token (version, needsSetup);
//   older Memos releases named it `/workspace/profile` (404 here);
// - `GET /auth/me` -> `{ user: { name: "users/<username>", ... } }`;
// - `GET /users/<username>:getStats` -> `totalMemoCount`, `pinnedMemos`,
//   `tagCount`, `memoTypeStats.undoCount` (memos with an open task);
// - `GET /memos` lists every memo the token may read (its own, and the
//   PUBLIC / PROTECTED memos of the other users), newest first by
//   `createTime` (one-second precision), pinned or not; `filter` is a CEL
//   expression: `tag in ["home"]` also matches `#home/garage`;
// - `POST /memos` takes the memo itself as body and stores an empty content
//   or an unknown visibility without complaint (PRIVATE): checked here first;
//   it ignores `pinned` (a PATCH pins afterwards);
// - `PATCH /memos/<id>?updateMask=pinned` with `{ pinned }` pins a memo.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 15_000;

export class MemosError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'not_found' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'too_old' | 'setup'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'MemosError';
    this.kind = kind;
    this.status = status;
  }
}

export class MemosClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.token personal access token
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, token, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  get apiUrl() {
    return `${this.url}/api/v1`;
  }

  async #send(method, path, { body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (auth) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    let raw;
    try {
      response = await this.fetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'follow',
      });
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new MemosError('timeout', `No answer from Memos within ${this.timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new MemosError('unreachable', `Memos unreachable (${cause})`);
    }
    if (!response.ok) {
      throw MemosClient.#fail(path, response.status, raw);
    }
    if (raw === '') {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      // A proxy login page answering 200 in HTML, for instance.
      throw new MemosError(
        'invalid',
        `${path.split('?')[0]}: the answer is not JSON (is this Memos?)`,
      );
    }
  }

  static #fail(path, status, raw) {
    let detail = raw.trim() || `HTTP ${status}`;
    try {
      const data = JSON.parse(raw);
      if (typeof data?.message === 'string' && data.message !== '') {
        detail = data.message;
      }
    } catch {
      // not JSON: a reverse proxy page, most likely
    }
    if (/^\s*</.test(detail)) {
      detail = `HTTP ${status}`;
    }
    const kind =
      status === 401 || status === 403
        ? 'unauthorized'
        : status === 404
          ? 'not_found'
          : status === 400
            ? 'rejected'
            : 'http';
    return new MemosError(
      kind,
      `${path.split('?')[0]}: ${detail.replace(/\s+/g, ' ').slice(0, 120)}`,
      status,
    );
  }

  /** `{ version, needsSetup, ... }`, read without the token. */
  async profile() {
    let data;
    try {
      data = await this.#send('GET', '/instance/profile', { auth: false });
    } catch (err) {
      if (err instanceof MemosError && err.kind === 'not_found') {
        throw new MemosError('too_old', 'This Memos is too old: update it', err.status);
      }
      throw err;
    }
    if (!data || typeof data.version !== 'string') {
      throw new MemosError('invalid', 'This address does not answer like Memos');
    }
    if (data.needsSetup === true) {
      throw new MemosError('setup', 'Memos has no account yet: open it and create one');
    }
    return data;
  }

  /** `{ name: 'users/<username>', username, displayName, ... }`: the owner of the token. */
  async me() {
    let data;
    try {
      data = await this.#send('GET', '/auth/me');
    } catch (err) {
      if (err instanceof MemosError && err.kind === 'not_found') {
        // Older releases had other routes for the current user.
        throw new MemosError('too_old', 'This Memos is too old: update it', err.status);
      }
      throw err;
    }
    const user = data?.user;
    if (!user || typeof user.name !== 'string' || !user.name.startsWith('users/')) {
      throw new MemosError('invalid', 'Memos did not answer the current user');
    }
    return user;
  }

  /** `{ totalMemoCount, pinnedMemos, tagCount, memoTypeStats, ... }` of a user. */
  async stats(userName) {
    const data = await this.#send('GET', `/${encodeName(userName)}:getStats`);
    if (!data || typeof data.totalMemoCount !== 'number') {
      throw new MemosError('invalid', 'Memos did not answer its statistics');
    }
    return data;
  }

  /**
   * One page of memos (not archived), the newest first.
   * @param {{ pageSize?: number, filter?: string }} [query]
   * @returns {Promise<object[]>}
   */
  async memos({ pageSize = 20, filter } = {}) {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (filter) {
      params.set('filter', filter);
    }
    const data = await this.#send('GET', `/memos?${params}`);
    if (!data || typeof data !== 'object') {
      throw new MemosError('invalid', 'Memos did not answer its memos');
    }
    // An empty list is sent as `{}` by the gateway when nothing matches.
    if (data.memos !== undefined && !Array.isArray(data.memos)) {
      throw new MemosError('invalid', 'Memos did not answer its memos');
    }
    return data.memos ?? [];
  }

  /**
   * Memos ignores `pinned` on creation: pin afterwards with setPinned.
   * @param {{ content: string, visibility: 'PRIVATE' | 'PROTECTED' | 'PUBLIC' }} memo
   */
  async createMemo({ content, visibility }) {
    const data = await this.#send('POST', '/memos', { body: { content, visibility } });
    if (!data || typeof data.name !== 'string') {
      throw new MemosError('invalid', 'Memos did not answer the saved memo');
    }
    return data;
  }

  /** Pin or unpin a memo (`memos/<id>`); resolves the memo. */
  async setPinned(memoName, pinned) {
    const data = await this.#send('PATCH', `/${encodeName(memoName)}?updateMask=pinned`, {
      body: { pinned },
    });
    return data && typeof data === 'object' ? data : {};
  }
}

/** `memos/abc` -> `memos/abc`, each segment escaped. */
const encodeName = (name) => name.split('/').map(encodeURIComponent).join('/');

/** A CEL string literal: the tag as typed, quotes and backslashes escaped. */
export const celString = (value) => JSON.stringify(String(value));

/** The filter of the memos carrying a tag (or one of its sub-tags). */
export const tagFilter = (tag) => `tag in [${celString(tag)}]`;
