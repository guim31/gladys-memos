# Memos for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Memos](https://github.com/usememos/memos), the open-source, self-hosted
note-taking app: write memos from scenes (a house journal, a reminder), show
the latest ones on the dashboard, and start a scene when a memo with a chosen
tag is written. Works with a Memos on your network or on the Internet.

Tested against a real Memos 0.31.0 server (official Docker image
`neosmemo/memos:stable`, October 2026). The Memos API changed a lot between
versions: Memos 0.31 or later is required.

## Features

- **A Memos device**: your memos, pinned memos, tags, memos with open tasks,
  and the first line of the latest memo; a transport badge (local, cloud,
  unreachable).
- **Dashboard widget** "Memos": three tiles, the newest memos (all, those of
  a tag, or the pinned ones) and a **New memo** button opening a form; a
  widget set on a tag writes memos with that tag.
- **Scene triggers**: "New memo" (filter by author, visibility) and "New memo
  with a tag" (sub-tags included), silent at installation, remembered across
  restarts, never fired by the memos of the integration itself.
- **Scene actions**: "Write a memo in Memos" (Markdown, tags, visibility,
  private by default, pinned on demand) and "Pin the latest memo of a tag"
  (or unpin it).
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.2 or later (the widget form).
- Memos 0.31 or later, reachable from Gladys (port 5230 by default), and an
  access token (Memos → Settings → Access Tokens).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-memos` (or find **Memos** in the catalog).
2. In **Configuration**, enter the address of Memos (`192.168.1.50`, port 5230
   by default) and the access token. Save.
3. Add the **Memos** device from the **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

Memos pushes nothing the container could receive: the container reads it every
5 minutes by default (1 to 60) with two requests of the REST API v1 —
`GET /users/<name>:getStats` and the 20 newest memos (`GET /memos`) — plus
`/instance/profile` and `/auth/me` once per connection. The device is
published with `should_poll: false`; only changed states are sent to Gladys.
Memos are written with `POST /memos`, pinned with
`PATCH /memos/<id>?updateMask=pinned`; the tag filters are CEL expressions
(`tag in ["home"]`).

## Limitations

- One Memos server and one user, the owner of the token.
- The triggers fire at the next read, not instantly; at most ten memos per
  read.
- Text memos only (no attachments); nothing is ever deleted or archived.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake Memos answering with
bodies recorded on a real Memos 0.31.0 server (`test/fixtures/memos/`).

## Credits

- [Memos](https://github.com/usememos/memos), by Steven Lee and contributors
  (MIT): this integration only talks to its REST API and contains none of its
  code.
- The cover shows the Memos logo, from the
  [usememos/memos repository](https://github.com/usememos/memos) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Memos
project.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
