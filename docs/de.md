# Memos

Verbinde Gladys mit [Memos](https://usememos.com), der freien, selbst
gehosteten Notiz-App: Schreibe Notizen aus deinen Szenen (Haus-Tagebuch,
Erinnerung), zeige die neuesten auf dem Dashboard und starte eine Szene, wenn
eine Notiz mit einem gewählten Tag geschrieben wird. Gladys spricht direkt mit
deinem Memos-Server, in deinem Netzwerk oder im Internet.

Getestet mit einem echten Memos-0.31.0-Server (das offizielle Docker-Image,
`neosmemo/memos:stable`, Oktober 2026). Die API von Memos hat sich zwischen den
Versionen stark verändert: Ältere Server werden nicht unterstützt. Rückmeldungen
sind im Gladys-Forum willkommen.

## Voraussetzungen

- Gladys Assistant 5.2 oder neuer.
- Ein Memos-Server ab Version 0.31, vom Gladys-Rechner aus erreichbar:
  standardmäßig auf Port 5230 oder hinter einem Reverse-Proxy.
- Ein Zugangstoken: Öffne in Memos **Einstellungen → Zugangstoken** und
  erstelle eins (wähle als Ablauf **Nie** oder denk daran, es zu erneuern). Die
  Integration liest und schreibt als der Benutzer, dem das Token gehört.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Gib unter **Memos-Adresse** die IP-Adresse des Servers ein, zum Beispiel
   `192.168.1.50`: Die Integration nutzt dann Port 5230. Ergänze den Port,
   wenn er abweicht (`192.168.1.50:5231`). Hinter einem Reverse-Proxy gibst
   du die vollständige Adresse ein (`https://memos.example.org`).
3. Füge das **Zugangstoken** ein (es beginnt mit `memos_pat_`).
4. **Memos lesen alle**: 1, 5 (Standard), 15, 30 oder 60 Minuten. Neue Notizen
   werden den Szenen beim nächsten Lesen gemeldet.
5. **Sprache der Namen und Meldungen** legt die Namen der Funktionen fest
   (beim Hinzufügen des Geräts fixiert) und die Texte der Integration.
   Standardmäßig Französisch.
6. Speichere und nutze dann **Verbindung testen**: Der Test zeigt die Memos-Version,
   den Benutzer und die Zahl der Notizen.
7. Füge im Reiter **Erkennung** das Gerät **Memos** hinzu.

## Gerät

**Memos** (ein Gerät für den Server, im Namen des Token-Besitzers):

| Funktion                     | Wert                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| Notizen                      | Zahl deiner Notizen (ohne archivierte)                                |
| Angepinnte Notizen           | Zahl deiner angepinnten Notizen                                       |
| Tags                         | Zahl deiner Tags der obersten Ebene (`#haus/garage` zählt als `haus`) |
| Notizen mit offenen Aufgaben | deine Notizen mit einer nicht abgehakten Aufgabe (`- [ ]`)            |
| Neueste Notiz                | erste Zeile der neuesten Notiz, die du lesen kannst, oder „Keine“     |

Die Zähler behalten ihren Verlauf. Das Abzeichen des Geräts zeigt, ob Memos
antwortet: **lokal** für eine Adresse in deinem Netzwerk, **Cloud** für einen
öffentlichen Host, **nicht erreichbar**, wenn es nicht antwortet.

## Dashboard-Widget

**Memos**: drei Kacheln (Notizen, angepinnt, offen), die sechs neuesten Notizen
und ein Knopf **Neue Notiz**. In den Widget-Einstellungen zeigt **Tag** nur die
Notizen eines Tags (und seiner Unter-Tags), und **Nur angepinnte Notizen**
behält die angepinnten. Tippe auf eine Notiz, um sie ganz zu lesen; **In Memos
öffnen** erscheint, wenn Memos über https erreicht wird. **Neue Notiz** öffnet
ein Formular: Gib den Text ein (Markdown und `#Tags` funktionieren wie in
Memos), und die Integration schreibt eine private Notiz. In einem Widget mit
Tag bekommt die Notiz diesen Tag: Ein Widget `einkauf` wird zur Einkaufsliste.

## Szenen-Auslöser

- **Neue Notiz**: Eine Notiz wird in Memos geschrieben, von dir oder von einem
  anderen Benutzer, wenn er sie mit dir teilt (geschützt oder öffentlich).
  Filter: **Autor** (ein Memos-Benutzername) und **Sichtbarkeit**.
- **Neue Notiz mit einem Tag**: Eine neue Notiz trägt den Tag oder einen seiner
  Unter-Tags (`haus` gilt auch für `#haus/garage`). Gib den Tag ohne `#` ein,
  genau wie in Memos: Groß- und Kleinschreibung zählt. Die Variable
  **Gefundener Tag** sagt, welcher.

Variablen beider Auslöser: **Text der Notiz**, **Erste Zeile**, **Tags** (durch
Kommas getrennt), **Autor (Benutzername)**, **Sichtbarkeit** (`private`,
`protected` oder `public`), **Sichtbarkeit, in Worten** und **Link zur Notiz**.

Das erste Lesen nach der Installation ist still: Die vorhandenen Notizen werden
nicht gemeldet. Die Notizen dieser Integration werden nie gemeldet, eine Szene
kann sich also nicht selbst in einer Schleife auslösen. Pro Lesen werden
höchstens zehn Notizen gemeldet; der Rest gilt als gesehen.

## Szenen-Aktionen

- **Notiz in Memos schreiben**: **Text der Notiz** (Pflicht, Markdown; füge
  Szenen-Variablen mit `{{` ein) und optional **Tags** (durch Kommas
  getrennt, ohne `#`: Diese werden am Ende der Notiz angefügt),
  **Sichtbarkeit** (privat, wenn nichts gewählt ist) und **Notiz anpinnen**.
  Liefert **Notiz-ID**, **Erste Zeile** und **Link zur Notiz**.
- **Neueste Notiz eines Tags anpinnen**: pinnt die neueste Notiz mit dem
  **Tag** an oder pinnt sie mit **Stattdessen abpinnen** ab. Gleiche Ergebnisse.
  Schlägt fehl, wenn keine Notiz den Tag trägt.

## Szenen-Beispiele

- **Haus-Tagebuch**: Das Garagentor öffnet sich nach 22 Uhr → **Notiz in Memos
  schreiben** mit `Garagentor spät geöffnet`, Tags `haus, tagebuch`: Memos
  datiert die Notiz, und das Tagebuch lässt sich nach Tag durchsuchen.
- **Einkaufsliste auf dem Küchen-Tablet**: Ein Widget mit dem Tag `einkauf`
  zeigt die Einkaufsnotizen, und **Neue Notiz** fügt eine mit dem Tag hinzu.
- **Wochenmenü**: jeden Montag um 8 Uhr → **Notiz in Memos schreiben**
  `Wochenmenü`, Tag `menue`, **Notiz anpinnen** angehakt; jeden Sonntagabend →
  **Neueste Notiz eines Tags anpinnen** `menue` mit **Stattdessen abpinnen**.
- **Nachricht der Familie**: Auslöser **Neue Notiz mit einem Tag** `gladys` →
  `{{triggerEvent.data.author}}: {{triggerEvent.data.content}}` sagen oder
  senden.
- **Erinnerung an offene Aufgaben**: jeden Abend um 20 Uhr → nur fortfahren,
  wenn **Notizen mit offenen Aufgaben** größer als 0 ist → eine Nachricht
  „In Memos sind noch Aufgaben offen“ senden.

## Fehlerbehebung

- **„Memos hat das Zugangstoken abgelehnt“**: Das Token wurde gelöscht, ist
  abgelaufen oder falsch abgeschrieben. Erstelle ein neues unter Memos →
  Einstellungen → Zugangstoken.
- **„Memos antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner aus.
  Der Container nutzt ein Bridge-Netzwerk: `localhost` ist der Container
  selbst, gib stattdessen die IP-Adresse des Servers ein.
- **„Diese Adresse antwortet nicht wie Memos“**: Eine Anmeldeseite eines Proxys
  antwortet statt Memos. Gib die Adresse von Memos selbst ein oder lass den
  Gladys-Rechner durch.
- **„Diese Memos-Version ist zu alt“**: Aktualisiere Memos (0.31 oder neuer).
- **„Memos hat noch kein Konto“**: Öffne Memos einmal, lege den Administrator
  an, dann das Token.
- Ein Auslöser mit Tag startet nicht: Prüfe die Groß- und Kleinschreibung des
  Tags (`Haus` ist nicht `haus`) und dass die Notiz nicht von dieser
  Integration geschrieben wurde.
- Für mehr Details in den Logs der Integration setze `LOG_LEVEL=debug`. Der
  Inhalt der Notizen wird nie in die Logs geschrieben.

## Grenzen

- Das Gerät hängt am Memos-Benutzernamen: Benennst du den Benutzer in Memos
  um, entsteht ein neues Gerät, und die Auslöser beginnen mit einem stillen
  Lesen neu.
- Ein Memos-Server und ein Benutzer: der Besitzer des Tokens. Die Zähler zählen
  die Notizen dieses Benutzers; die Liste, das Widget und die Auslöser zeigen
  auch die Notizen, die andere Benutzer teilen (geschützt oder öffentlich).
- Die Auslöser starten beim nächsten Lesen (standardmäßig nach 5 Minuten),
  nicht sofort.
- Eine Notiz wird nur als Markdown-Text geschrieben: ohne Anhang, Ort oder
  Kommentar.
- Die Integration löscht oder archiviert nie etwas in Memos.
- Nicht mit dem Memos-Projekt verbunden.
