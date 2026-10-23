// -----------------------------------------------------------------------------
// Memos -> one Gladys device for the Memos server, keyed by the owner of the
// access token (`memos:<username>`, the configuration holds one server): its
// counters and the first line of the newest memo. Everything is read only:
// memos are written through the scene actions and the widget form.
//
// Whether the server answers is the device transport badge (local, cloud or
// unreachable, see src/hub.js), not a feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES, NONE, pick } from './texts.js';

export const MEMOS_TYPE = 'memos';

export const COUNTERS = ['memos', 'pinned', 'tags', 'todo'];

const MAX_COUNT = 10_000_000;
// What the "Latest memo" feature shows of the first line.
export const LATEST_LENGTH = 100;

export const memosIds = (gladys, username) => gladys.externalIds(MEMOS_TYPE, username);

/**
 * @param {object} gladys
 * @param {{ username: string, displayName?: string }} user
 * @param {string} language
 * @param {{ url: string, version: string }} server
 */
export function buildMemosDevice(gladys, user, language, server) {
  const names = pick(NAMES, language);
  const ids = memosIds(gladys, user.username);
  const feature = (key, fields) => ({
    name: names[key],
    external_id: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
  return {
    name: 'Memos',
    external_id: ids.device,
    model: `Memos ${server.version}`.trim(),
    should_poll: false,
    features: [
      ...COUNTERS.map((key) =>
        feature(key, {
          category: CAT.COUNTER_SENSOR,
          type: TYPE.SENSOR.INTEGER,
          min: 0,
          max: MAX_COUNT,
          keep_history: true,
        }),
      ),
      feature('latest', {
        category: CAT.TEXT,
        type: TYPE.TEXT.TEXT,
        min: 0,
        max: 0,
        keep_history: false,
      }),
    ],
    params: [
      { name: 'MEMOS_URL', value: server.url },
      { name: 'MEMOS_USER', value: String(user.displayName || user.username).slice(0, 100) },
    ],
  };
}

/**
 * @param {object} gladys
 * @param {string} username
 * @param {ReturnType<import('./memos/model.js').summarizeStats>} counters
 * @param {{ title: string } | undefined} latest the newest memo
 * @param {string} language
 */
export function buildMemosStates(gladys, username, counters, latest, language) {
  const ids = memosIds(gladys, username);
  const title = (latest?.title ?? '').trim();
  return [
    ...COUNTERS.map((key) => ({
      device_feature_external_id: ids.feature(key),
      state: counters[key],
    })),
    {
      device_feature_external_id: ids.feature('latest'),
      text:
        title === ''
          ? pick(NONE, language)
          : title.length <= LATEST_LENGTH
            ? title
            : `${title.slice(0, LATEST_LENGTH - 1).trimEnd()}…`,
    },
  ];
}

/** `ext:...:memos:camille` -> 'camille', or null when not ours. */
export function parseUsername(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalId(`${MEMOS_TYPE}:`);
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length).split(':')[0];
  return id === '' ? null : id;
}
