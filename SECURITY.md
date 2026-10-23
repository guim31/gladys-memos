# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration holds: the Memos address and a personal access token,
kept by Gladys in the integration configuration (never logged, never written
to `/data`). `/data` holds a small JSON file with the owner of the token and
the names (ids) of the newest memos already seen by the scene triggers — no
memo content. The container only talks to the Memos address, over HTTP or
HTTPS. With the token it reads the profile of the server, the current user,
their statistics and the memos they may read, and it writes only what a scene
action or the widget form asks for: a new memo, or the pinned flag of a memo.
It never deletes nor archives anything. The content of the memos is never
written to the logs. A token can do everything its owner can do in Memos:
prefer a dedicated user when the memos of the main account are sensitive.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Memos itself (see the
[Memos repository](https://github.com/usememos/memos)).
