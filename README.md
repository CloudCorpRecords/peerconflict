# peerconflict

An install just failed with a peer-dependency error and the
output is a wall of nested requirements. peerconflict takes
the resolved tree — every installed package's name and
version, plus the peer requirements each package declares —
and lays the problem out as a graph you can read:

- **Edges** — one entry per peer requirement, each marked
  satisfied or not. An edge is satisfied only when the peer
  is actually installed and its installed version falls
  inside the required range.
- **Conflicts** — the unsatisfied edges, each typed
  `missing` when the peer is not installed at all and
  `version` when it is installed but out of range, with a
  one-line detail such as `app requires peer react (^18.0.0)
  but 17.0.2 is installed`.
- **Resolutions** — one entry per conflicted peer: the
  requirements behind the conflict, the lowest version that
  satisfies each range, and the least-change suggestion —
  install the peer when it is absent, or change its version
  when it is present — always phrased against every listed
  range, so the fix addresses all of the peer's requirers at
  once.

Versions are `MAJOR.MINOR.PATCH` and nothing else. Ranges
follow the grammar the tool defines: `*` accepts anything,
an exact version accepts only itself, `^x.y.z` accepts the
base version up to (but not including) the next breaking
bound — with the usual 0.x tightening, so `^0.2.3` stops
before `0.3.0` and `^0.0.3` accepts `0.0.3` alone — `~x.y.z`
accepts patch-level changes within the same minor, and
`>=x.y.z` accepts the base version and anything above it.
Anything outside that grammar is a validation error, as
are a missing or duplicate package name, a malformed
version, a package listing the same peer twice, and a
package declaring a peer on itself. Errors name the
offending path (for example
`packages[0].peers[1].range is not a supported range:
"=>1.0.0"`) and no partial explanation is produced. A peer
that is simply absent from the tree is not an error — it
is a `missing` conflict. The computation is pure and
local: no network, no configuration, no files read beyond
the input you pass in.

## CLI

```bash
npx @reneturcios/peerconflict explain --input args.json
npx @reneturcios/peerconflict --version
```

`args.json` contains the full arguments object:

```json
{
  "packages": [
    { "name": "react", "version": "17.0.2" },
    {
      "name": "app",
      "version": "1.0.0",
      "peers": [{ "name": "react", "range": "^18.0.0" }]
    }
  ]
}
```

`peers` defaults to `[]` per package. The explanation is
printed as JSON:

```json
{
  "ok": false,
  "conflicts": [
    {
      "from": "app",
      "peer": "react",
      "range": "^18.0.0",
      "installed": "17.0.2",
      "type": "version",
      "detail": "app requires peer react (^18.0.0) but 17.0.2 is installed"
    }
  ],
  "edges": [
    { "from": "app", "to": "react", "range": "^18.0.0", "satisfied": false }
  ],
  "resolutions": [
    {
      "peer": "react",
      "installed": "17.0.2",
      "required_by": [{ "from": "app", "range": "^18.0.0", "lowest": "18.0.0" }],
      "suggestion": "change react from 17.0.2 to a version satisfying every listed range"
    }
  ]
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/peerconflict mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "peerconflict": {
      "command": "npx",
      "args": ["-y", "@reneturcios/peerconflict", "mcp"]
    }
  }
}
```

### Tools

- `explain_peer_conflict` — Explain peer-dependency
  conflicts in the installed tree.
  - `packages` (array, required, at least one) — packages
    as `{name, version, peers?}` objects; `name` is unique
    across the set, `version` is the installed
    `MAJOR.MINOR.PATCH` version, and each `peers` entry is
    a `{name, range}` requirement

  Returns `{ok, conflicts, edges, resolutions}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/peerconflict
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/peerconflict explain --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
