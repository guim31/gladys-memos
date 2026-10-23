// -----------------------------------------------------------------------------
// Memos answers -> the plain objects the rest of the code uses, and the small
// rules of the Memos syntax (a tag is `#word`, nested with `/`).
// -----------------------------------------------------------------------------

export const VISIBILITIES = ['PRIVATE', 'PROTECTED', 'PUBLIC'];

/** `memos/abc` -> `abc`. */
export const memoUid = (name) => (typeof name === 'string' ? name.replace(/^memos\//, '') : '');

/** `users/camille` -> `camille`. */
export const userName = (name) => (typeof name === 'string' ? name.replace(/^users\//, '') : '');

/** The first non-empty line of a memo, without its Markdown marks. */
export function firstLine(content) {
  const line =
    String(content ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? '';
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, '')
    .replace(/^>\s*/, '')
    .replace(/[*_`~]/g, '')
    .trim();
}

/**
 * @param {object} memo a memo of the Memos API
 */
export function summarizeMemo(memo) {
  const content = typeof memo.content === 'string' ? memo.content : '';
  return {
    name: memo.name,
    uid: memoUid(memo.name),
    content,
    title: (typeof memo.property?.title === 'string' && memo.property.title) || firstLine(content),
    tags: Array.isArray(memo.tags) ? memo.tags.filter((t) => typeof t === 'string') : [],
    pinned: memo.pinned === true,
    author: userName(memo.creator),
    visibility: VISIBILITIES.includes(memo.visibility) ? memo.visibility : 'PRIVATE',
    created: typeof memo.createTime === 'string' ? memo.createTime : '',
  };
}

/**
 * @param {object} stats `GET /users/<name>:getStats`
 */
export function summarizeStats(stats) {
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return {
    memos: count(stats.totalMemoCount),
    pinned: Array.isArray(stats.pinnedMemos) ? stats.pinnedMemos.length : 0,
    // Only the top-level tags: `home/garage` is counted in `home`.
    tags:
      stats.tagCount && typeof stats.tagCount === 'object'
        ? Object.keys(stats.tagCount).filter((t) => !t.includes('/')).length
        : 0,
    todo: count(stats.memoTypeStats?.undoCount),
  };
}

/**
 * One tag as Memos writes it, without `#`: blanks become `-`, the characters
 * that end a tag in Memos are dropped. Empty when nothing is left.
 * @param {unknown} raw
 */
export function cleanTag(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[#,;!?()[\]{}<>"'`]/g, '')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 100);
}

/** `"courses, #maison home"` -> `['courses', 'maison', 'home']`, without duplicates. */
export function parseTags(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const tags = raw
    .split(/[\s,;]+/)
    .map(cleanTag)
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}

/**
 * The content of a new memo with its tags: the tags it does not carry yet are
 * added on a last line (`#courses #maison`), which is how Memos reads them.
 * @param {string} content
 * @param {string[]} tags
 */
export function withTags(content, tags) {
  const present = new Set(
    [...content.matchAll(/(?:^|\s)#([^\s#]+)/gu)].map((m) => m[1].replace(/[.,;:!?]+$/, '')),
  );
  const missing = tags.filter((t) => !present.has(t));
  if (missing.length === 0) {
    return content;
  }
  return `${content}\n\n${missing.map((t) => `#${t}`).join(' ')}`;
}

/** The page of a memo in the Memos web app. */
export const memoLink = (baseUrl, memo) =>
  baseUrl && memo?.uid ? `${baseUrl}/memos/${encodeURIComponent(memo.uid)}` : '';
