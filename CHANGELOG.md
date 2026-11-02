# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `explain_peer_conflict` MCP tool and
  `explain` CLI command explaining a peer-dependency
  conflict as a graph.
- Every peer requirement is checked against the installed
  tree and reported as an edge; unsatisfied edges become
  conflicts typed `missing` (the peer is not installed) or
  `version` (the installed version falls outside the
  required range), each with a plain-language detail line.
- One resolution per conflicted peer, carrying the
  requirements behind the conflict with the lowest version
  satisfying each range and a least-change suggestion
  (install the peer, or change its installed version).
- Spec-defined version and range grammar — `*`, exact,
  `^x.y.z` (with the 0.x caret rules), `~x.y.z`, and
  `>=x.y.z` — with path-naming validation errors for
  malformed versions, unsupported ranges, duplicate names
  or peers, and self-peer declarations.
