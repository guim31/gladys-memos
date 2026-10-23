# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A Memos device: memos, pinned memos, tags, memos with open tasks, and the
  first line of the latest memo, with a transport badge (local, cloud,
  unreachable).
- The "Memos" dashboard widget: three tiles, the newest memos (all, of a tag,
  or pinned) and a form to write a memo, tagged like the widget.
- Scene triggers "New memo" (filter by author and visibility) and "New memo
  with a tag" (sub-tags included), silent at installation, remembered across
  restarts.
- Scene actions "Write a memo in Memos" (tags, visibility, private by default,
  pinned on demand) and "Pin the latest memo of a tag".
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-memos/commits/main
