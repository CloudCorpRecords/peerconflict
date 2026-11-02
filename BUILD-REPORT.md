# peerconflict — Build Report

MCP Rebuild 1000, Batch 14. Original program build from the
packages-100 plan (cluster F #69), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch14/peerconflict.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `peerconflict`, npm `@reneturcios/peerconflict`,
MCP name `io.github.CloudCorpRecords/peerconflict`, version
`0.1.0`, bin `peerconflict` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Explains
  peer-dependency conflicts as a graph and suggests the
  least-change resolution.", 87 chars ≤100; npm entry carries
  `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/peerconflict:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/peerconflict"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`explain --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/peerconflict.ts` (core,
  `VERSION = "0.1.0"`)
- `test/peerconflict.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/peerconflict`,
  smoke-test server-name assertion `peerconflict`)

## Tools implemented (1)

- `explain_peer_conflict` — arguments: `packages` (array,
  required, minItems 1) of `{name (string, required,
  non-empty, unique), version (string, required,
  MAJOR.MINOR.PATCH), peers (array, optional, default []) of
  {name (string, required, non-empty), range (string,
  required, non-empty, in the spec grammar)}}`.

  Returns `{ok, conflicts, edges, resolutions}`: `edges`
  holds one entry per peer requirement, iterating packages
  in ascending name order and each package's peers in listed
  order, satisfied only when the peer is installed AND its
  version satisfies the range; `conflicts` holds the
  unsatisfied edges sorted by (from asc, peer asc), each
  typed `missing` (peer not installed, `installed: null`)
  or `version` (installed version out of range), with the
  spec's exact detail templates; `resolutions` holds one
  entry per conflicted peer sorted by peer ascending, with
  `required_by` (the conflicting requirements, sorted by
  from ascending, each with the lowest version satisfying
  its range — "any" for `*`, else the range's base version)
  and the spec's exact suggestion templates (install when
  absent, change from the installed version when present).
  `ok` is true exactly when `conflicts` is empty.

  Range satisfaction is the spec's grammar, implemented
  exactly: `*` always true; exact equality; `^a.b.c` with
  upper bound (a+1).0.0 when a > 0, 0.(b+1).0 when a == 0
  and b > 0, 0.0.(c+1) when a == 0 and b == 0; `~a.b.c`
  with upper bound a.(b+1).0; `>=a.b.c` as a plain lower
  bound. Version comparison is numeric, component by
  component.

  The fixture literal
  (`harness/fixtures/peerconflict-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule (no McpServer/zod schema
  conversion). Every `tools/call` is validated by the core
  itself, so the MCP and CLI paths share one validation
  implementation.
- Validation is path-naming and total, in a single pass in
  input order: missing/empty `packages`, a package missing
  `name`/`version`, an empty or non-string or duplicate
  package name, a version outside MAJOR.MINOR.PATCH form, a
  non-array `peers`, a peer entry missing `name`/`range`,
  an empty or non-string peer name or range, a range
  outside the grammar, a package listing the same peer
  twice, or a package declaring a peer on itself throws an
  Error naming the offending path (e.g.
  `packages[0].peers[1].range is not a supported range: "=>1.0.0"`)
  and produces no partial result (MCP: `isError`; CLI:
  exit 1). A peer name absent from the tree is NOT an
  error — it is a `missing` conflict.

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **38 tests,
  38 pass, 0 fail** — range satisfaction for `*` and exact
  (including numeric-not-lexical comparison), the caret
  bounds for `^1.2.3`, `^0.2.3`, and `^0.0.3` (base,
  just-inside, upper-bound, and below-base cases each),
  tilde bounds for 1.x and 0.x, `>=` as an unbounded lower
  bound, edge iteration order (packages ascending, peers in
  listed order), omitted vs empty `peers`, a missing peer
  failing even a `*` edge, exact `missing` and `version`
  conflict objects with the exact detail strings, conflict
  sorting by (from, peer) distinct from listed order,
  satisfied edges excluded from conflicts, exact
  install/change suggestion strings, `lowest` for every
  range kind (`*` → "any"), resolution sorting by peer and
  `required_by` sorting by from, one resolution per peer
  across multiple requirers, `required_by` listing only
  conflicting requirements, and every validation path
  (missing/empty/non-array `packages`, non-object package,
  missing/empty/non-string name, duplicate name, missing
  version, six malformed version shapes plus a non-string
  version, non-array `peers`, non-object peer entry,
  missing peer name/range, empty/non-string peer name and
  range, the spec's `=>1.0.0` example at
  `packages[0].peers[1].range` plus eleven further
  unsupported ranges, a duplicated peer within one package,
  a self-peer declaration, and an absent peer producing a
  conflict rather than an error)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `explain` with no `--input` exits 2;
  `explain --input <missing file>` exits 1 naming the file;
  `explain --input <valid file>` exits 0 and prints the
  explanation JSON (verified against a hand-checked mixed
  tree: a `version` conflict for react 17.0.2 vs `^18.0.0`
  and a `missing` conflict for vue vs `^3.0.0`, resolutions
  sorted react before vue with the exact suggestion
  strings); `explain --input <invalid file>` exits 1 with
  `packages[0].peers[1].range is not a supported range: "=>1.0.0"`
- Parity: `harness/parity.py` vs
  `harness/fixtures/peerconflict-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with the
  rebuild stdio command spelled as an absolute path; the
  harness's shlex split does not expand a literal `~`, the
  same spelling publishorder's recorded parity run uses)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/peerconflict`, **128 package entries**. Local
`node_modules` was installed via `npm install
--ignore-scripts --offline` for build/test; gitignored.

## Gaps / honest notes

- **`required_by` scope:** the spec defines one resolution
  per peer with >= 1 conflict and a `required_by` list
  without saying whether requirements on that peer which
  ARE satisfied belong in it. The conflicting-only reading
  was implemented (a resolution addresses the conflict;
  the suggestion's "every listed range" then means every
  range listed in `required_by`), and a test pins it: a
  peer with one satisfied and one conflicting requirement
  lists only the conflicting one. If the intended reading
  is all requirements on the peer, only the grouping in
  `explainPeerConflict` changes.
- **Validation wording:** the spec fixes the exact wording
  only for the unsupported-range error (implemented
  verbatim). All other messages follow the factory's
  path-naming style — e.g. duplicate names use
  `packages[<i>].name duplicates packages[<first>].name "<name>"`,
  a malformed version uses
  `packages[<i>].version is not a valid MAJOR.MINOR.PATCH version: "<value>"`,
  and a self-peer uses
  `packages[<i>].peers[<j>].name declares a peer on its own package "<name>"`.
- **Empty range classification:** an empty (or non-string)
  range raises the "must be a non-empty string" error
  rather than "is not a supported range"; the spec lists
  both an empty/non-string-range clause and an
  outside-the-grammar clause, and the empty case was
  assigned to the former.
- **Leading-zero versions:** the version grammar
  (`^\d+\.\d+\.\d+$`) admits components with leading zeros
  such as `01.2.3`; they are accepted and compared
  numerically. The spec's "three non-negative integers,
  nothing else" does not address them.
- **Unknown fields:** extra fields on a package or peer
  entry are ignored (the spec is silent; factory pattern).
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
