# Security policy

## Threat model

Frameback is a local tool for a single reviewer.

- The server binds to `127.0.0.1` only and rejects requests whose `Host` or `Origin` is not local.
- It serves only the video files you registered (by opening them) and the review data next to them. Other paths are
  refused, and paths are checked against traversal.
- Review data is plain files in `review/<stem>/` next to each video, stored with relative paths. There is no telemetry,
  no account and no outbound network access.
- Anything that can write to a `review/` folder or call the local server can act as the reviewer or the agent. Do not
  expose the port beyond localhost.

## Reporting a vulnerability

Please report privately, not in a public issue: use GitHub private vulnerability reporting on the repository
(Security tab, "Report a vulnerability"), or email
[hello@guillebecerrao.cl](mailto:hello@guillebecerrao.cl). Include the Frameback and Node versions and steps to reproduce. Expect a
first reply within a few days.
