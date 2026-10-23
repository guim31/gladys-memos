// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface, with the words of the Memos interface (de "Notiz", "angepinnt";
// es "memo", "fijado"; fr "mémo", the French word). German says "du",
// Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    memos: 'Memos',
    pinned: 'Pinned memos',
    tags: 'Tags',
    todo: 'Memos with open tasks',
    latest: 'Latest memo',
  },
  fr: {
    memos: 'Mémos',
    pinned: 'Mémos épinglés',
    tags: 'Étiquettes',
    todo: 'Mémos avec tâches à faire',
    latest: 'Dernier mémo',
  },
  de: {
    memos: 'Notizen',
    pinned: 'Angepinnte Notizen',
    tags: 'Tags',
    todo: 'Notizen mit offenen Aufgaben',
    latest: 'Neueste Notiz',
  },
  es: {
    memos: 'Memos',
    pinned: 'Memos fijados',
    tags: 'Etiquetas',
    todo: 'Memos con tareas pendientes',
    latest: 'Último memo',
  },
};

/** The "Latest memo" text of an empty Memos. */
export const NONE = { en: 'None', fr: 'Aucun', de: 'Keine', es: 'Ninguno' };

/** The visibility of a memo, for the trigger variable and the widget. */
export const VISIBILITY_NAMES = {
  en: { PRIVATE: 'Private', PROTECTED: 'Protected', PUBLIC: 'Public' },
  fr: { PRIVATE: 'Privé', PROTECTED: 'Protégé', PUBLIC: 'Public' },
  de: { PRIVATE: 'Privat', PROTECTED: 'Geschützt', PUBLIC: 'Öffentlich' },
  es: { PRIVATE: 'Privado', PROTECTED: 'Protegido', PUBLIC: 'Público' },
};

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of Memos and an access token in the configuration.',
    invalid: 'The Memos address is not valid: enter an address like 192.168.1.50:5230.',
    token: 'Enter an access token (Memos → Settings → Access Tokens).',
    unauthorized: 'Memos refused the access token: create a new one in Settings → Access Tokens.',
    unreachable: 'Memos does not answer: check its address and that it is running.',
    invalid_answer: 'This address does not answer like Memos: check the address and the port.',
    too_old: 'This Memos is too old for the integration: update it (0.31 or later).',
    setup: 'Memos has no account yet: open it, create the administrator, then a token.',
  },
  fr: {
    none: "Saisissez l'adresse de Memos et un jeton d'accès dans la configuration.",
    invalid: "L'adresse de Memos n'est pas valide : saisissez une adresse comme 192.168.1.50:5230.",
    token: "Saisissez un jeton d'accès (Memos → Paramètres → Jetons d'accès).",
    unauthorized:
      "Memos a refusé le jeton d'accès : créez-en un nouveau dans Paramètres → Jetons d'accès.",
    unreachable: "Memos ne répond pas : vérifiez son adresse et qu'il est démarré.",
    invalid_answer: "Cette adresse ne répond pas comme Memos : vérifiez l'adresse et le port.",
    too_old: "Ce Memos est trop ancien pour l'intégration : mettez-le à jour (0.31 ou plus).",
    setup: "Memos n'a pas encore de compte : ouvrez-le, créez l'administrateur, puis un jeton.",
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von Memos und ein Zugangstoken ein.',
    invalid: 'Die Memos-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:5230 ein.',
    token: 'Gib ein Zugangstoken ein (Memos → Einstellungen → Zugangstoken).',
    unauthorized:
      'Memos hat das Zugangstoken abgelehnt: Erstelle ein neues unter Einstellungen → Zugangstoken.',
    unreachable: 'Memos antwortet nicht: Prüfe die Adresse und ob es läuft.',
    invalid_answer: 'Diese Adresse antwortet nicht wie Memos: Prüfe Adresse und Port.',
    too_old:
      'Diese Memos-Version ist zu alt für die Integration: Aktualisiere es (0.31 oder neuer).',
    setup: 'Memos hat noch kein Konto: Öffne es, lege den Administrator an, dann ein Token.',
  },
  es: {
    none: 'Introduzca la dirección de Memos y un token de acceso en la configuración.',
    invalid: 'La dirección de Memos no es válida: introduzca una dirección como 192.168.1.50:5230.',
    token: 'Introduzca un token de acceso (Memos → Configuración → Tokens de acceso).',
    unauthorized:
      'Memos rechazó el token de acceso: cree uno nuevo en Configuración → Tokens de acceso.',
    unreachable: 'Memos no responde: compruebe su dirección y que esté en marcha.',
    invalid_answer: 'Esta dirección no responde como Memos: compruebe la dirección y el puerto.',
    too_old: 'Este Memos es demasiado antiguo para la integración: actualícelo (0.31 o posterior).',
    setup: 'Memos aún no tiene cuenta: ábralo, cree el administrador y luego un token.',
  },
};

/** "Test the connection" once Memos answered. */
export const TEST_TEXT = {
  en: (user, version, memos) => `Connected to Memos ${version} as ${user}: ${memos} memo(s).`,
  fr: (user, version, memos) =>
    `Connecté à Memos ${version} en tant que ${user} : ${memos} mémo(s).`,
  de: (user, version, memos) => `Mit Memos ${version} verbunden als ${user}: ${memos} Notiz(en).`,
  es: (user, version, memos) => `Conectado a Memos ${version} como ${user}: ${memos} memo(s).`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions and of the widget form. `{tag}` is a tag,
// `{detail}` the reason Memos gave.
export const COMMAND_ERRORS = {
  en: {
    timeout: 'Memos answered too late: the memo may have been saved anyway.',
    http: 'Memos could not do it: {detail}',
    content: 'Enter the text of the memo.',
    tag: 'Enter a tag, without #.',
    no_memo: 'No memo with the tag #{tag} in Memos.',
    unreachable: 'Memos does not answer: nothing was done.',
    unauthorized: 'Memos refused the access token: nothing was done.',
    rejected: 'Memos refused: {detail}',
    pin_failed: 'Memo saved, but not pinned: {detail}',
    form: 'Update Gladys to 5.2 or later to use this form.',
  },
  fr: {
    timeout: 'Memos a répondu trop tard : le mémo a peut-être été enregistré quand même.',
    http: "Memos n'a pas pu le faire : {detail}",
    content: 'Saisissez le texte du mémo.',
    tag: 'Saisissez une étiquette, sans #.',
    no_memo: "Aucun mémo avec l'étiquette #{tag} dans Memos.",
    unreachable: "Memos ne répond pas : rien n'a été fait.",
    unauthorized: "Memos a refusé le jeton d'accès : rien n'a été fait.",
    rejected: 'Memos a refusé : {detail}',
    pin_failed: 'Mémo enregistré, mais pas épinglé : {detail}',
    form: 'Mettez Gladys à jour (5.2 ou plus) pour utiliser ce formulaire.',
  },
  de: {
    timeout: 'Memos hat zu spät geantwortet: Die Notiz wurde vielleicht trotzdem gespeichert.',
    http: 'Memos konnte es nicht ausführen: {detail}',
    content: 'Gib den Text der Notiz ein.',
    tag: 'Gib einen Tag ein, ohne #.',
    no_memo: 'Keine Notiz mit dem Tag #{tag} in Memos.',
    unreachable: 'Memos antwortet nicht: Es wurde nichts ausgeführt.',
    unauthorized: 'Memos hat das Zugangstoken abgelehnt: Es wurde nichts ausgeführt.',
    rejected: 'Memos hat abgelehnt: {detail}',
    pin_failed: 'Notiz gespeichert, aber nicht angepinnt: {detail}',
    form: 'Aktualisiere Gladys auf 5.2 oder neuer, um dieses Formular zu nutzen.',
  },
  es: {
    timeout: 'Memos respondió demasiado tarde: puede que el memo se haya guardado de todos modos.',
    http: 'Memos no pudo hacerlo: {detail}',
    content: 'Introduzca el texto del memo.',
    tag: 'Introduzca una etiqueta, sin #.',
    no_memo: 'No hay ningún memo con la etiqueta #{tag} en Memos.',
    unreachable: 'Memos no responde: no se ha hecho nada.',
    unauthorized: 'Memos rechazó el token de acceso: no se ha hecho nada.',
    rejected: 'Memos rechazó la solicitud: {detail}',
    pin_failed: 'Memo guardado, pero no fijado: {detail}',
    form: 'Actualice Gladys a la versión 5.2 o posterior para usar este formulario.',
  },
};

/** The toast of the widget form. */
export const SAVED_TEXT = {
  en: 'Memo saved in Memos.',
  fr: 'Mémo enregistré dans Memos.',
  de: 'Notiz in Memos gespeichert.',
  es: 'Memo guardado en Memos.',
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable)
        .replace('{tag}', values.tag ?? '')
        .replace('{detail}', values.detail ?? '')
        .slice(0, 200),
    ]),
  );
}

export const pick = (table, language) => table[language] ?? table.en;
