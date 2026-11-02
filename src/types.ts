/**
 * peerconflict types.
 *
 * peerconflict explains a peer-dependency conflict. The
 * caller supplies the resolved tree — every installed
 * package's name and version, plus the peer requirements
 * each package declares — and peerconflict checks every
 * requirement against the tree, as pure local computation:
 *
 *   - `edges`: one entry per peer requirement, saying
 *     whether the installed tree satisfies it
 *   - `conflicts`: the unsatisfied edges, each typed
 *     `missing` (the peer is not installed at all) or
 *     `version` (it is installed, but outside the range)
 *   - `resolutions`: one entry per conflicted peer, with
 *     the requirements behind the conflict and the
 *     least-change suggestion (install, or change)
 *
 * Versions are MAJOR.MINOR.PATCH and ranges are the
 * spec-defined grammar: `*`, an exact version, `^x.y.z`,
 * `~x.y.z`, or `>=x.y.z`. Nothing else is accepted.
 */

/** One peer requirement declared by a package. */
export interface PeerRequirement {
  /** Name of the peer package that is required. */
  name: string;
  /**
   * Required range: "*", an exact version, "^x.y.z",
   * "~x.y.z", or ">=x.y.z".
   */
  range: string;
}

/** One package in the resolved tree, as supplied by the caller. */
export interface PeerPackage {
  /** Package name; unique across the supplied set. */
  name: string;
  /** Installed version, MAJOR.MINOR.PATCH. */
  version: string;
  /** Peer requirements of this package; [] when omitted. */
  peers: PeerRequirement[];
}

/** One peer requirement, checked against the installed tree. */
export interface PeerEdge {
  /** Name of the package declaring the requirement. */
  from: string;
  /** Name of the required peer package. */
  to: string;
  /** The required range, as declared. */
  range: string;
  /**
   * True only when the peer is installed AND its installed
   * version satisfies the range.
   */
  satisfied: boolean;
}

/** One unsatisfied peer requirement. */
export interface PeerConflict {
  /** Name of the package declaring the requirement. */
  from: string;
  /** Name of the peer package whose requirement failed. */
  peer: string;
  /** The required range, as declared. */
  range: string;
  /** The installed version of the peer, or null when it is not installed. */
  installed: string | null;
  /** "missing" when the peer is not installed, "version" when it is out of range. */
  type: "missing" | "version";
  /** Plain-language explanation of the conflict. */
  detail: string;
}

/** One conflicting requirement behind a resolution. */
export interface PeerRequirementRef {
  /** Name of the package declaring the requirement. */
  from: string;
  /** The required range, as declared. */
  range: string;
  /**
   * The lowest version satisfying the range: the range's
   * base version, or "any" for the "*" range.
   */
  lowest: string;
}

/** The least-change resolution for one conflicted peer. */
export interface PeerResolution {
  /** Name of the conflicted peer package. */
  peer: string;
  /** The installed version of the peer, or null when it is not installed. */
  installed: string | null;
  /** The conflicting requirements on this peer, sorted by `from` ascending. */
  required_by: PeerRequirementRef[];
  /** The least-change suggestion for this peer. */
  suggestion: string;
}

/** The peer-conflict explanation. */
export interface PeerConflictResult {
  /** True when there are no conflicts. */
  ok: boolean;
  /** Unsatisfied requirements, sorted by (from asc, peer asc). */
  conflicts: PeerConflict[];
  /**
   * Every peer requirement, iterating packages in ascending
   * name order and each package's peers in listed order.
   */
  edges: PeerEdge[];
  /** One resolution per conflicted peer, sorted by peer ascending. */
  resolutions: PeerResolution[];
}
