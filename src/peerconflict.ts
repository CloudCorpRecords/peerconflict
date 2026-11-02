/**
 * peerconflict core: explain a peer-dependency conflict as
 * a graph and suggest the least-change resolution.
 *
 *   explainPeerConflict(packages) -> explanation
 *
 * Versions and ranges (spec-defined, exact):
 * - A version is MAJOR.MINOR.PATCH — three non-negative
 *   integers, nothing else. Comparison is numeric,
 *   component by component.
 * - A range is exactly one of: `*`; an exact version;
 *   `^` + version; `~` + version; `>=` + version.
 * - satisfies(installed, range):
 *   - `*` -> always true
 *   - exact v -> installed == v
 *   - `^a.b.c` -> installed >= a.b.c AND installed < upper,
 *     where upper is (a+1).0.0 when a > 0, 0.(b+1).0 when
 *     a == 0 and b > 0, and 0.0.(c+1) when a == 0, b == 0
 *   - `~a.b.c` -> installed >= a.b.c AND installed < a.(b+1).0
 *   - `>=a.b.c` -> installed >= a.b.c
 * - The lowest version satisfying a range is "any" for
 *   `*`, and the range's base version otherwise (the base
 *   version always satisfies its own range).
 *
 * Behaviour:
 * - `edges` holds one entry per peer requirement, iterating
 *   packages in ascending name order and each package's
 *   peers in listed order; an edge is satisfied only when
 *   the peer is installed AND its version satisfies the
 *   range.
 * - `conflicts` holds the unsatisfied edges, sorted by
 *   (from asc, peer asc), typed "missing" when the peer is
 *   not installed and "version" when it is, with a detail
 *   line naming the requirement and the outcome.
 * - `resolutions` holds one entry per peer with at least
 *   one conflict, sorted by peer ascending; `required_by`
 *   lists the conflicting requirements on that peer sorted
 *   by from ascending, each with the lowest version
 *   satisfying its range, and `suggestion` is the
 *   least-change move: install the peer when it is absent,
 *   change its version when it is present.
 * - `ok` is true when there are no conflicts.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "packages[0].peers[1].range is not a supported range:
 * \"=>1.0.0\"") and no partial result is produced. A peer
 * name that is simply absent from the tree is NOT a
 * validation error — it is a "missing" conflict.
 */
import type {
  PeerConflict,
  PeerConflictResult,
  PeerEdge,
  PeerPackage,
  PeerResolution,
} from "./types.js";

export const VERSION = "0.1.0";

type VersionParts = [number, number, number];

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parse a MAJOR.MINOR.PATCH string, or return null. */
function parseVersion(text: string): VersionParts | null {
  if (!VERSION_PATTERN.test(text)) return null;
  const [major, minor, patch] = text.split(".").map((part) => Number(part));
  return [major, minor, patch];
}

/** Numeric component-by-component comparison: -1, 0, or 1. */
function compareVersions(a: VersionParts, b: VersionParts): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

type ParsedRange =
  | { kind: "any" }
  | { kind: "exact" | "caret" | "tilde" | "gte"; base: VersionParts; baseText: string };

/** Parse a range in the spec grammar, or return null. */
function parseRange(range: string): ParsedRange | null {
  if (range === "*") return { kind: "any" };
  if (range.startsWith(">=")) {
    const baseText = range.slice(2);
    const base = parseVersion(baseText);
    return base === null ? null : { kind: "gte", base, baseText };
  }
  if (range.startsWith("^")) {
    const baseText = range.slice(1);
    const base = parseVersion(baseText);
    return base === null ? null : { kind: "caret", base, baseText };
  }
  if (range.startsWith("~")) {
    const baseText = range.slice(1);
    const base = parseVersion(baseText);
    return base === null ? null : { kind: "tilde", base, baseText };
  }
  const base = parseVersion(range);
  return base === null ? null : { kind: "exact", base, baseText: range };
}

/** Whether an installed version satisfies a parsed range. */
function satisfiesRange(installed: VersionParts, range: ParsedRange): boolean {
  switch (range.kind) {
    case "any":
      return true;
    case "exact":
      return compareVersions(installed, range.base) === 0;
    case "gte":
      return compareVersions(installed, range.base) >= 0;
    case "tilde": {
      const [a, b] = range.base;
      const upper: VersionParts = [a, b + 1, 0];
      return (
        compareVersions(installed, range.base) >= 0 &&
        compareVersions(installed, upper) < 0
      );
    }
    case "caret": {
      const [a, b, c] = range.base;
      const upper: VersionParts =
        a > 0 ? [a + 1, 0, 0] : b > 0 ? [0, b + 1, 0] : [0, 0, c + 1];
      return (
        compareVersions(installed, range.base) >= 0 &&
        compareVersions(installed, upper) < 0
      );
    }
  }
}

/** The lowest version satisfying a parsed range: "any" for `*`, else the base. */
function lowestSatisfying(range: ParsedRange): string {
  return range.kind === "any" ? "any" : range.baseText;
}

/**
 * Validate the raw packages argument and return the
 * normalised package list (peers defaulted to []).
 */
function validatePackages(packages: unknown): PeerPackage[] {
  if (packages === undefined) throw new Error("packages is required");
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error("packages must be a non-empty array");
  }

  const validated: PeerPackage[] = [];
  const indexByName = new Map<string, number>();
  packages.forEach((raw, i) => {
    const path = `packages[${i}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    if (raw.name === undefined) throw new Error(`${path}.name is required`);
    if (typeof raw.name !== "string" || raw.name.length === 0) {
      throw new Error(`${path}.name must be a non-empty string`);
    }
    const firstIndex = indexByName.get(raw.name);
    if (firstIndex !== undefined) {
      throw new Error(
        `${path}.name duplicates packages[${firstIndex}].name "${raw.name}"`,
      );
    }
    indexByName.set(raw.name, i);

    if (raw.version === undefined) throw new Error(`${path}.version is required`);
    if (typeof raw.version !== "string" || parseVersion(raw.version) === null) {
      throw new Error(
        `${path}.version is not a valid MAJOR.MINOR.PATCH version: "${String(raw.version)}"`,
      );
    }

    const peers: PeerPackage["peers"] = [];
    if (raw.peers !== undefined) {
      if (!Array.isArray(raw.peers)) {
        throw new Error(`${path}.peers must be an array`);
      }
      const peerIndexByName = new Map<string, number>();
      raw.peers.forEach((rawPeer, j) => {
        const peerPath = `${path}.peers[${j}]`;
        if (!isRecord(rawPeer)) throw new Error(`${peerPath} must be an object`);
        if (rawPeer.name === undefined) {
          throw new Error(`${peerPath}.name is required`);
        }
        if (typeof rawPeer.name !== "string" || rawPeer.name.length === 0) {
          throw new Error(`${peerPath}.name must be a non-empty string`);
        }
        if (rawPeer.range === undefined) {
          throw new Error(`${peerPath}.range is required`);
        }
        if (typeof rawPeer.range !== "string" || rawPeer.range.length === 0) {
          throw new Error(`${peerPath}.range must be a non-empty string`);
        }
        if (parseRange(rawPeer.range) === null) {
          throw new Error(
            `${peerPath}.range is not a supported range: "${rawPeer.range}"`,
          );
        }
        const firstPeerIndex = peerIndexByName.get(rawPeer.name);
        if (firstPeerIndex !== undefined) {
          throw new Error(
            `${peerPath}.name duplicates ${path}.peers[${firstPeerIndex}].name "${rawPeer.name}"`,
          );
        }
        peerIndexByName.set(rawPeer.name, j);
        if (rawPeer.name === raw.name) {
          throw new Error(
            `${peerPath}.name declares a peer on its own package "${rawPeer.name}"`,
          );
        }
        peers.push({ name: rawPeer.name, range: rawPeer.range });
      });
    }

    validated.push({ name: raw.name, version: raw.version, peers });
  });

  return validated;
}

/** Explain the peer conflicts in the supplied resolved tree. */
export function explainPeerConflict(packages: unknown): PeerConflictResult {
  const validPackages = validatePackages(packages);

  const byName = new Map(validPackages.map((p) => [p.name, p]));
  const parsedByVersion = new Map(
    validPackages.map((p) => [p.name, parseVersion(p.version) as VersionParts]),
  );
  const parsedRangeByText = new Map<string, ParsedRange>();

  // Edges: packages in ascending name order, each package's
  // peers in listed order.
  const inNameOrder = [...validPackages].sort((a, b) => compareStrings(a.name, b.name));
  const edges: PeerEdge[] = [];
  for (const pkg of inNameOrder) {
    for (const peer of pkg.peers) {
      let parsed = parsedRangeByText.get(peer.range);
      if (parsed === undefined) {
        parsed = parseRange(peer.range) as ParsedRange;
        parsedRangeByText.set(peer.range, parsed);
      }
      const installedParts = parsedByVersion.get(peer.name);
      const satisfied =
        installedParts !== undefined && satisfiesRange(installedParts, parsed);
      edges.push({ from: pkg.name, to: peer.name, range: peer.range, satisfied });
    }
  }

  // Conflicts: the unsatisfied edges, sorted by (from, peer).
  const conflicts: PeerConflict[] = [];
  for (const edge of edges) {
    if (edge.satisfied) continue;
    const installedPkg = byName.get(edge.to);
    const installed = installedPkg === undefined ? null : installedPkg.version;
    const type = installed === null ? "missing" : "version";
    const detail =
      type === "missing"
        ? `${edge.from} requires peer ${edge.to} (${edge.range}) but ${edge.to} is not installed`
        : `${edge.from} requires peer ${edge.to} (${edge.range}) but ${installed} is installed`;
    conflicts.push({
      from: edge.from,
      peer: edge.to,
      range: edge.range,
      installed,
      type,
      detail,
    });
  }
  conflicts.sort(
    (a, b) => compareStrings(a.from, b.from) || compareStrings(a.peer, b.peer),
  );

  // Resolutions: one per conflicted peer, sorted by peer
  // ascending; required_by lists the conflicting
  // requirements on that peer, sorted by from ascending.
  const conflictsByPeer = new Map<string, PeerConflict[]>();
  for (const conflict of conflicts) {
    const list = conflictsByPeer.get(conflict.peer) ?? [];
    list.push(conflict);
    conflictsByPeer.set(conflict.peer, list);
  }
  const resolutions: PeerResolution[] = [...conflictsByPeer.keys()]
    .sort(compareStrings)
    .map((peer) => {
      const peerConflicts = conflictsByPeer.get(peer) as PeerConflict[];
      const installed = peerConflicts[0].installed;
      const required_by = [...peerConflicts]
        .sort((a, b) => compareStrings(a.from, b.from))
        .map((conflict) => ({
          from: conflict.from,
          range: conflict.range,
          lowest: lowestSatisfying(parseRange(conflict.range) as ParsedRange),
        }));
      const suggestion =
        installed === null
          ? `install ${peer} at a version satisfying every listed range`
          : `change ${peer} from ${installed} to a version satisfying every listed range`;
      return { peer, installed, required_by, suggestion };
    });

  return { ok: conflicts.length === 0, conflicts, edges, resolutions };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
