// -----------------------------------------------------------------------------
// The hub: the link to one Memos server and everything Gladys sees of it —
// the device, its states, its transport badge, the connection status, the
// scene events, and the memos written from scenes and from the widget.
//
// Memos pushes nothing (its webhooks need an address Gladys does not expose):
// the container reads it every `refresh_minutes` (5 by default) on its own
// timer (should_poll: false). A read is two requests — the statistics of the
// token owner and the 20 newest memos — plus the current user and the server
// version once per connection.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { buildMemosDevice, buildMemosStates, memosIds, parseUsername } from './devices.js';
import { MemosClient, MemosError, creatorFilter, tagFilter } from './memos/client.js';
import {
  VISIBILITIES,
  cleanTag,
  memoLink,
  parseTags,
  summarizeMemo,
  summarizeStats,
  withTags,
} from './memos/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, VISIBILITY_NAMES, commandMessage, pick } from './texts.js';

const logger = createLogger({ name: 'memos-hub' });

export const WIDGET_KEY = 'memos';
export const TRIGGERS = { created: 'memo_created', tagged: 'memo_tagged' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
  // How long a filtered list of the widget is reused.
  widgetCache: 60_000,
};

export const LATEST_COUNT = 20;
// A burst of memos (an import, a script) can bring many at once: past that
// many in one read, the rest is recorded as seen without firing.
export const MAX_EVENTS_PER_READ = 10;
// "Memo with a tag" fires once per tag of the memo, this many at most.
export const MAX_TAG_EVENTS = 10;
// The memos written by the integration itself are never announced (a scene
// bound to "New memo" that writes one would loop).
const MAX_OWN = 200;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) => JSON.stringify([config.url, config.token]);

/**
 * The transport badge of a reachable server: `local` on a private address
 * or a local name, `cloud` for a public host.
 * @param {string} url
 */
export function transportOf(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return DEVICE_TRANSPORTS.LOCAL;
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const local =
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127); // CGNAT, Tailscale
    return local ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.CLOUD;
  }
  if (host.includes(':')) {
    return /^(::1$|f[cd]|fe[89ab])/.test(host) ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.CLOUD;
  }
  if (!host.includes('.') || /\.(local|lan|home|internal|localdomain|home\.arpa)$/.test(host)) {
    return DEVICE_TRANSPORTS.LOCAL;
  }
  return DEVICE_TRANSPORTS.CLOUD;
}

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = { url: null, urlInvalid: false, token: '', refreshMinutes: 5, language: 'fr' };
    this.client = null;
    /** the owner of the token: { name, username, displayName } */
    this.user = null;
    this.version = '';
    this.counters = null;
    /** the newest memos, summarized */
    this.latest = [];
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    this.lastTransport = '';
    /** what the triggers already saw: { user, since, memos } */
    this.seen = null;
    this.own = new Set();
    /** writes that timed out: { content, at } */
    this.pendingOwn = [];
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.widgetLists = new Map();
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    const valid =
      typeof saved.user === 'string' &&
      typeof saved.since === 'string' &&
      Array.isArray(saved.memos);
    // A damaged file is a new baseline, not a crash on every read.
    this.seen = valid ? saved : null;
    // The memos written here, kept across restarts (loop guard).
    for (const name of Array.isArray(saved.own) ? saved.own.slice(-MAX_OWN) : []) {
      if (typeof name === 'string') {
        this.own.add(name);
      }
    }
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.user = null;
      this.version = '';
      this.counters = null;
      this.latest = [];
      this.failure = null;
      this.announced = false;
      this.lastTransport = '';
      this.widgetLists.clear();
      if (config.url && config.token) {
        this.client = new MemosClient({
          url: config.url,
          token: config.token,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged) {
      await this.refresh();
    } else {
      // Language or interval only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    this.lastTransport = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  // --- Reading Memos --------------------------------------------------------

  /** Read Memos (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    let version;
    let user;
    let stats;
    let memos;
    try {
      version = this.version || (await client.profile()).version;
      user = this.user ?? (await client.me());
      [stats, memos] = await Promise.all([
        client.stats(user.name),
        client.memos({ pageSize: LATEST_COUNT }),
      ]);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.publishTransport();
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.version = version;
    this.user = {
      name: user.name,
      username: user.username || user.name.replace(/^users\//, ''),
      displayName: user.displayName || '',
    };
    this.counters = summarizeStats(stats);
    const latest = memos.map(summarizeMemo);
    this.latest = latest;
    this.widgetLists.clear();
    this.#recover();
    await this.#update();
    // A new address or token while publishing: this read is stale.
    if (client !== this.client || this.stopped) {
      return;
    }
    await this.#announce(user.name, latest);
    await this.updateConnectionStatus();
  }

  /** Device, states, badge and widget from the last read. */
  async #update() {
    await this.publishDevices();
    await this.publishStates();
    await this.publishTransport();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof MemosError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`Memos: ${err.message}`);
    } else {
      logger.debug(`Memos still failing: ${err.message}`);
    }
    this.failure = kind;
    if (kind !== 'unreachable' && kind !== 'timeout' && kind !== 'http') {
      // Another token may belong to another user, an update changes the version.
      this.user = null;
      this.version = '';
    }
  }

  #recover() {
    const count = this.counters.memos;
    if (this.failure !== null) {
      logger.info(`Memos answers again (${count} memos)`);
    } else if (!this.announced) {
      logger.info(`Connected to Memos ${this.version} (${count} memos)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the memos created since the last read: "New memo" once per memo,
   * "Memo with a tag" once per tag of it. The first read of a Memos user is a
   * silent baseline: installing the integration announces nothing already
   * there.
   * @param {object[]} latest the newest memos, summarized
   */
  async #announce(owner, latest) {
    const known = this.seen?.user === owner ? this.seen : null;
    let added = [];
    if (known) {
      const seenNames = new Set(known.memos);
      // A memo deleted lets an older one slide into the newest 20: the date
      // keeps it from being announced as new.
      added = latest.filter(
        (m) =>
          !seenNames.has(m.name) &&
          m.created >= known.since &&
          !this.own.has(m.name) &&
          !this.#isPendingOwn(owner, m),
      );
    }
    if (added.length > MAX_EVENTS_PER_READ) {
      logger.info(`${added.length} new memos at once: the ${MAX_EVENTS_PER_READ} newest announced`);
    }
    // The newest ones, fired in the order they were written.
    added = added.slice(0, MAX_EVENTS_PER_READ).reverse();
    // A memo Gladys did not take (disconnected, restarting) is not recorded:
    // the next read fires it again.
    const failed = new Set();
    for (const memo of added) {
      logger.debug(`${TRIGGERS.created}: ${memo.uid}`);
      const data = this.#eventData(memo);
      if (!(await this.#fire(TRIGGERS.created, data))) {
        failed.add(memo.name);
        continue;
      }
      for (const tag of memo.tags.slice(0, MAX_TAG_EVENTS)) {
        await this.#fire(TRIGGERS.tagged, { ...data, tag });
      }
    }
    const dates = latest
      .filter((m) => failed.has(m.name))
      .map((m) => m.created)
      .filter(Boolean)
      .sort();
    // A memo dated in the future must not hide the next ones: `since` never
    // goes past the time of the read.
    const now = new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const newest = [known?.since ?? '', ...latest.map((m) => m.created).filter((c) => c <= now)]
      .sort()
      .at(-1);
    const next = {
      user: owner,
      // The date from which a memo counts as new: the newest one seen, or the
      // oldest one Gladys refused, so that it is fired again.
      since: dates.length > 0 ? dates[0] : newest,
      memos: latest.map((m) => m.name).filter((name) => !failed.has(name)),
      own: [],
    };
    for (const name of next.memos) {
      this.own.delete(name);
    }
    next.own = [...this.own];
    if (JSON.stringify(next) !== JSON.stringify(this.seen)) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  /** Publish one event; false when it should be tried again at the next read. */
  async #fire(trigger, data) {
    try {
      await this.gladys.publishSceneEvent(trigger, data);
      if (this.eventFailing) {
        logger.info('Scene events accepted again');
      }
      this.eventFailing = false;
      return true;
    } catch (err) {
      if (this.eventFailing) {
        logger.debug(`Cannot fire ${trigger}: ${err.message}`);
      } else {
        logger.warn(`Cannot fire ${trigger}: ${err.message}`);
      }
      this.eventFailing = true;
      // A refusal for good (400, 404...) is not retried: it would be refused
      // at every read. 401/403 (Gladys restarting) and 429 are retried.
      const status = err?.status;
      return (
        Number.isInteger(status) &&
        status >= 400 &&
        status < 500 &&
        ![401, 403, 429].includes(status)
      );
    }
  }

  #eventData(memo) {
    return {
      content: memo.content.slice(0, 1000),
      title: memo.title.slice(0, 200),
      tags: memo.tags.join(', ').slice(0, 1000),
      author: memo.author,
      visibility: memo.visibility.toLowerCase(),
      visibility_name: pick(VISIBILITY_NAMES, this.language)[memo.visibility],
      link: memoLink(this.config.url, memo),
    };
  }

  // --- Device, states and badge ---------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    if (!this.user || !this.counters) {
      return [];
    }
    return [
      buildMemosDevice(this.gladys, this.user, this.language, {
        url: this.config.url ?? '',
        version: this.version,
      }),
    ];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the device, once the user added it (Gladys drops the others).
   * @param {boolean} [force] the device was just added
   */
  async publishStates(force = false) {
    if (!this.user || !this.counters || this.stopped) {
      return;
    }
    const deviceId = memosIds(this.gladys, this.user.username).device;
    if (!force && !this.#isCreated(deviceId)) {
      return;
    }
    const states = buildMemosStates(
      this.gladys,
      this.user.username,
      this.counters,
      this.latest[0],
      this.language,
    );
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  /** The badge of the device: how Memos is reached, or unreachable. */
  async publishTransport() {
    const username = this.user?.username ?? this.seen?.user?.replace(/^users\//, '');
    if (!username || this.stopped) {
      return;
    }
    const externalId = memosIds(this.gladys, username).device;
    if (!this.#isCreated(externalId)) {
      return;
    }
    const transport =
      this.failure === null && this.loaded
        ? transportOf(this.config.url ?? '')
        : DEVICE_TRANSPORTS.UNREACHABLE;
    if (transport === this.lastTransport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: externalId, transport }]);
      this.lastTransport = transport;
    } catch (err) {
      logger.debug(`Cannot publish the transport: ${err.message}`);
    }
  }

  /** The user added the device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const username = parseUsername(this.gladys, device?.external_id);
    if (!username || username !== this.user?.username) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    this.lastTransport = '';
    await this.publishStates(true);
    await this.publishTransport();
    this.refreshWidget();
  }

  /** onPoll (the device is not polled: the container reads on its timer). */
  async poll(device) {
    const username = parseUsername(this.gladys, device?.external_id);
    if (username && username === this.user?.username) {
      await this.publishStates(true);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  /**
   * The memos a widget shows: the newest (from the last read), or those of a
   * tag, or the pinned ones (read on demand, reused a minute). Null when
   * Memos cannot be read.
   * @param {{ tag?: string, pinnedOnly?: boolean }} filter
   * @param {number} count
   */
  async widgetMemos({ tag = '', pinnedOnly = false }, count) {
    if (!this.loaded || this.failure !== null) {
      return null;
    }
    if (!tag && !pinnedOnly) {
      return this.latest.slice(0, count);
    }
    const filter = [pinnedOnly ? 'pinned' : '', tag ? tagFilter(tag) : '']
      .filter(Boolean)
      .join(' && ');
    const cached = this.widgetLists.get(filter);
    if (cached && this.now() - cached.at < this.timings.widgetCache) {
      return cached.memos;
    }
    const client = this.client;
    try {
      const memos = (await client.memos({ pageSize: count, filter })).map(summarizeMemo);
      if (client === this.client) {
        this.widgetLists.set(filter, { at: this.now(), memos });
      }
      return memos;
    } catch (err) {
      logger.debug(`Widget list not read: ${err.message}`);
      return null;
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.token) {
      return 'token';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
          rejected: 'invalid_answer',
          forbidden: 'unauthorized',
          redirect: 'redirect',
          too_old: 'too_old',
          setup: 'setup',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    if (!key) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.user.displayName || this.user.username, this.version, this.counters.memos),
      ]),
    );
  }

  /**
   * Write a memo. Used by the scene action and the widget form.
   * @param {object} request
   * @param {string} request.content Markdown
   * @param {string} [request.tags] tags to add, separated by commas or blanks
   * @param {string} [request.visibility] private (default), protected, public
   * @param {boolean | string} [request.pinned]
   */
  async createMemo({ content, tags, visibility, pinned }) {
    const language = this.language;
    const text = typeof content === 'string' ? content.trim() : '';
    if (text === '') {
      // Memos would store an empty memo without complaint.
      throw new CommandError('content', language);
    }
    const client = this.client;
    if (!client) {
      throw new CommandError('unreachable', language);
    }
    const tagNames = parseTags(tags);
    const level = typeof visibility === 'string' ? visibility.trim().toUpperCase() : '';
    const body = withTags(text, tagNames);
    let memo;
    try {
      memo = await client.createMemo({
        content: body,
        visibility: VISIBILITIES.includes(level) ? level : 'PRIVATE',
      });
    } catch (err) {
      if (err instanceof MemosError && err.kind === 'timeout') {
        // The memo may exist: it must not be announced either.
        this.pendingOwn.push({ content: body, at: this.now() });
        this.pendingOwn = this.pendingOwn.slice(-20);
      }
      throw this.#commandError(err);
    }
    this.#remember(memo.name);
    this.widgetLists.clear();
    if (pinned === true || pinned === 'true') {
      try {
        Object.assign(memo, await client.setPinned(memo.name, true));
      } catch (err) {
        this.refresh().catch(() => {});
        throw new CommandError('pin_failed', language, {
          detail: err.message.replace(/^[^:]*: /, ''),
        });
      }
    }
    const summary = summarizeMemo(memo);
    logger.info(
      `Memo saved (${summary.visibility.toLowerCase()}${summary.pinned ? ', pinned' : ''}` +
        `${summary.tags.length ? `, ${summary.tags.length} tag(s)` : ''})`,
    );
    // The counters and the widget follow without waiting for the timer.
    this.refresh().catch(() => {});
    return { ...summary, link: memoLink(this.config.url, summary) };
  }

  /**
   * Pin (or unpin) the newest memo carrying a tag.
   * @param {{ tag: string, unpin?: boolean | string }} request
   */
  async pinLatest({ tag, unpin }) {
    const language = this.language;
    const name = cleanTag(tag);
    if (name === '') {
      throw new CommandError('tag', language);
    }
    const client = this.client;
    if (!client) {
      throw new CommandError('unreachable', language);
    }
    const pinned = !(unpin === true || unpin === 'true');
    let memo;
    try {
      // Only a memo of the token owner: an administrator token could pin
      // the memo of another user, a normal one would be refused.
      const owner = this.user?.name ?? (await client.me()).name;
      const [found] = await client.memos({
        pageSize: 1,
        filter: `${creatorFilter(owner)} && ${tagFilter(name)}`,
      });
      if (!found) {
        throw new CommandError('no_memo', language, { tag: name });
      }
      memo = found.pinned === pinned ? found : await client.setPinned(found.name, pinned);
    } catch (err) {
      throw this.#commandError(err);
    }
    const summary = summarizeMemo(memo);
    logger.info(`${pinned ? 'Pinned' : 'Unpinned'} the newest memo of a tag`);
    this.refresh().catch(() => {});
    return { ...summary, link: memoLink(this.config.url, summary) };
  }

  /** A memo of the owner with the content of a write that timed out (one hour). */
  #isPendingOwn(owner, memo) {
    this.pendingOwn = this.pendingOwn.filter((p) => this.now() - p.at < 3_600_000);
    return (
      memo.author === owner.replace(/^users\//, '') &&
      this.pendingOwn.some((p) => p.content === memo.content)
    );
  }

  #remember(name) {
    this.own.add(name);
    if (this.own.size > MAX_OWN) {
      this.own.delete(this.own.values().next().value);
    }
    if (this.seen) {
      // On disk at once: a restart before the next read must not announce it.
      this.seen = { ...this.seen, own: [...this.own] };
      this.store.save(this.seen).catch(() => {});
    }
  }

  #commandError(err) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof MemosError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'forbidden') {
      return new CommandError('forbidden', this.language);
    }
    if (kind === 'rejected') {
      return new CommandError('rejected', this.language, { detail });
    }
    if (kind === 'timeout') {
      // The request may have reached Memos: the memo may exist.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError('http', this.language, { detail });
  }
}
