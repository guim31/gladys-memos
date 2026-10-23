// -----------------------------------------------------------------------------
// The "Memos" dashboard widget: three tiles (memos, pinned, with open tasks),
// the newest memos — all, those of a tag, or the pinned ones, as set in the
// widget — and a "New memo" button opening a form (Gladys 5.2.0 or later).
// A memo written from a widget set on a tag carries that tag.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { CommandError, WIDGET_KEY } from './hub.js';
import { cleanTag, memoLink } from './memos/model.js';
import { SAVED_TEXT, commandMessage, pick } from './texts.js';

export const MAX_ITEMS = 6;
export const NEW_ACTION = 'new_memo';

export const TEXT = {
  memos: { en: 'Memos', fr: 'Mémos', de: 'Notizen', es: 'Memos' },
  pinned: { en: 'Pinned', fr: 'Épinglés', de: 'Angepinnt', es: 'Fijados' },
  pinned_one: { en: 'Pinned', fr: 'Épinglé', de: 'Angepinnt', es: 'Fijado' },
  todo: { en: 'Open tasks', fr: 'À faire', de: 'Offen', es: 'Pendientes' },
  new_memo: { en: 'New memo', fr: 'Nouveau mémo', de: 'Neue Notiz', es: 'Nuevo memo' },
  content: { en: 'Memo', fr: 'Mémo', de: 'Notiz', es: 'Memo' },
  open: {
    en: 'Open in Memos',
    fr: 'Ouvrir dans Memos',
    de: 'In Memos öffnen',
    es: 'Abrir en Memos',
  },
  empty: {
    en: 'No memo to show yet.',
    fr: 'Aucun mémo à afficher pour le moment.',
    de: 'Noch keine Notiz anzuzeigen.',
    es: 'Todavía no hay ningún memo que mostrar.',
  },
  unavailable: {
    en: 'Memos does not answer right now.',
    fr: 'Memos ne répond pas pour le moment.',
    de: 'Memos antwortet gerade nicht.',
    es: 'Memos no responde en este momento.',
  },
  waiting: {
    en: 'Waiting for Memos: check the configuration of the integration.',
    fr: "En attente de Memos : vérifiez la configuration de l'intégration.",
    de: 'Warte auf Memos: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a Memos: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url);
const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function shortDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(LOCALES[language] ?? 'en-GB', { day: 'numeric', month: 'short' });
}

/** One row of the list. */
export function memoItem(memo, language, baseUrl) {
  const date = shortDate(memo.created, language);
  const tags = memo.tags
    .filter((t) => !t.includes('/'))
    .map((t) => `#${t}`)
    .join(' ');
  const item = {
    title: cut(memo.title || tags || '…', 60),
    subtitle: cut([date, memo.author, tags].filter(Boolean).join(' · '), 60),
  };
  if (memo.pinned) {
    item.badge = { text: pick(TEXT.pinned_one, language), color: WIDGET_COLORS.WARNING };
  }
  if (memo.content.trim() !== '') {
    item.description = cut(memo.content.trim(), 2000);
  }
  // The links of a card must be https: a Memos on plain http is left out.
  const link = memoLink(baseUrl, memo);
  if (https(link)) {
    item.links = [{ url: link, label: pick(TEXT.open, language) }];
  }
  return item;
}

// The core wants the labels of form fields as multi-language objects.
const newButton = (language) => ({
  type: 'button',
  label: pick(TEXT.new_memo, language),
  icon: 'plus',
  style: 'secondary',
  action: {
    key: NEW_ACTION,
    fields: [{ key: 'content', type: 'string', required: true, label: TEXT.content }],
  },
});

const settingsOf = (settings) => ({
  tag: cleanTag(settings?.tag),
  pinnedOnly: settings?.pinned_only === true || settings?.pinned_only === 'true',
});

export async function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const counters = hub.counters;
  const memos = await hub.widgetMemos(settingsOf(settings), MAX_ITEMS);
  const components = [
    { type: 'value', label: pick(TEXT.memos, language), value: counters.memos, icon: 'file-text' },
    { type: 'value', label: pick(TEXT.pinned, language), value: counters.pinned, icon: 'bookmark' },
    { type: 'value', label: pick(TEXT.todo, language), value: counters.todo, icon: 'check-square' },
  ];
  if (memos === null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  } else if (memos.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: memos.map((m) => memoItem(m, language, hub.config.url ?? '')),
    });
  }
  components.push(newButton(language));
  // The hub nudges the widget after every read and every memo written.
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, values, settings }) {
  const language = hub.language;
  if (actionKey !== NEW_ACTION) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  if (!values || typeof values.content !== 'string') {
    // A Gladys older than 5.2.0 relays the tap without the form.
    throw new Error(pick(commandMessage('form'), language));
  }
  try {
    await hub.createMemo({ content: values.content, tags: settingsOf(settings).tag });
    return { message: SAVED_TEXT };
  } catch (err) {
    if (err instanceof CommandError) {
      throw new Error(pick(err.messages, language), { cause: err });
    }
    throw err;
  }
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
    action,
  },
};
