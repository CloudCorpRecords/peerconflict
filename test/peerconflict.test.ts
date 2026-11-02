import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { explainPeerConflict } from "../src/peerconflict.js";

/**
 * All tests are pure local computation over inline package
 * trees: no filesystem, no network. Each behaviour in the
 * spec is pinned by its own case, including the caret 0.x
 * upper bounds, the exact detail/suggestion templates, the
 * sorting rules, and every validation path.
 */

const pkg = (
  name: string,
  version: string,
  peers?: { name: string; range: string }[],
) => ({
  name,
  version,
  ...(peers !== undefined ? { peers } : {}),
});

const peer = (name: string, range: string) => ({ name, range });

/** Whether `installed` satisfies `range`, via a two-package tree. */
const satisfied = (installed: string, range: string): boolean =>
  explainPeerConflict([
    pkg("peer", installed),
    pkg("user", "1.0.0", [peer("peer", range)]),
  ]).edges[0].satisfied;

describe("explainPeerConflict — range satisfaction", () => {
  it("satisfies any installed version for the * range", () => {
    assert.equal(satisfied("0.0.0", "*"), true);
    assert.equal(satisfied("99.88.77", "*"), true);
  });

  it("satisfies an exact range only on an exact match", () => {
    assert.equal(satisfied("1.2.3", "1.2.3"), true);
    assert.equal(satisfied("1.2.4", "1.2.3"), false);
    assert.equal(satisfied("1.3.3", "1.2.3"), false);
    assert.equal(satisfied("2.2.3", "1.2.3"), false);
  });

  it("compares versions numerically, not lexically", () => {
    // Lexically "1.10.0" < "1.9.0"; numerically it is greater.
    assert.equal(satisfied("1.10.0", ">=1.9.0"), true);
    assert.equal(satisfied("1.9.0", ">=1.10.0"), false);
    assert.equal(satisfied("1.10.0", "1.9.0"), false);
  });

  it("applies the caret upper bound (a+1).0.0 when a > 0", () => {
    assert.equal(satisfied("1.2.3", "^1.2.3"), true);
    assert.equal(satisfied("1.9.9", "^1.2.3"), true);
    assert.equal(satisfied("2.0.0", "^1.2.3"), false);
    assert.equal(satisfied("1.2.2", "^1.2.3"), false);
    assert.equal(satisfied("0.9.9", "^1.2.3"), false);
  });

  it("applies the caret upper bound 0.(b+1).0 for ^0.b.c when b > 0", () => {
    assert.equal(satisfied("0.2.3", "^0.2.3"), true);
    assert.equal(satisfied("0.2.9", "^0.2.3"), true);
    assert.equal(satisfied("0.3.0", "^0.2.3"), false);
    assert.equal(satisfied("0.2.2", "^0.2.3"), false);
    assert.equal(satisfied("1.0.0", "^0.2.3"), false);
  });

  it("applies the caret upper bound 0.0.(c+1) for ^0.0.c", () => {
    assert.equal(satisfied("0.0.3", "^0.0.3"), true);
    assert.equal(satisfied("0.0.4", "^0.0.3"), false);
    assert.equal(satisfied("0.1.0", "^0.0.3"), false);
    assert.equal(satisfied("0.0.2", "^0.0.3"), false);
  });

  it("applies the tilde upper bound a.(b+1).0", () => {
    assert.equal(satisfied("1.2.3", "~1.2.3"), true);
    assert.equal(satisfied("1.2.99", "~1.2.3"), true);
    assert.equal(satisfied("1.3.0", "~1.2.3"), false);
    assert.equal(satisfied("1.2.2", "~1.2.3"), false);
    assert.equal(satisfied("2.0.0", "~1.2.3"), false);
    assert.equal(satisfied("0.2.9", "~0.2.3"), true);
    assert.equal(satisfied("0.3.0", "~0.2.3"), false);
  });

  it("applies >= as a plain lower bound with no upper bound", () => {
    assert.equal(satisfied("1.2.3", ">=1.2.3"), true);
    assert.equal(satisfied("7.0.0", ">=1.2.3"), true);
    assert.equal(satisfied("1.2.2", ">=1.2.3"), false);
    assert.equal(satisfied("0.0.1", ">=1.2.3"), false);
  });
});

describe("explainPeerConflict — edges", () => {
  it("reports ok with no conflicts or resolutions when every peer is satisfied", () => {
    const out = explainPeerConflict([
      pkg("react", "18.2.0"),
      pkg("app", "1.0.0", [peer("react", "^18.0.0")]),
    ]);
    assert.equal(out.ok, true);
    assert.deepEqual(out.conflicts, []);
    assert.deepEqual(out.resolutions, []);
    assert.deepEqual(out.edges, [
      { from: "app", to: "react", range: "^18.0.0", satisfied: true },
    ]);
  });

  it("iterates packages in ascending name order and peers in listed order", () => {
    const out = explainPeerConflict([
      pkg("zeta", "1.0.0", [peer("b-lib", "*"), peer("a-lib", "*")]),
      pkg("alpha", "1.0.0", [peer("a-lib", "*")]),
      pkg("a-lib", "1.0.0"),
      pkg("b-lib", "1.0.0"),
    ]);
    assert.deepEqual(
      out.edges.map((e) => `${e.from}->${e.to}`),
      ["alpha->a-lib", "zeta->b-lib", "zeta->a-lib"],
    );
    assert.equal(out.ok, true);
  });

  it("treats an omitted peers field the same as an empty one", () => {
    const omitted = explainPeerConflict([pkg("a", "1.0.0"), pkg("b", "1.0.0")]);
    const explicit = explainPeerConflict([
      pkg("a", "1.0.0", []),
      pkg("b", "1.0.0", []),
    ]);
    assert.deepEqual(omitted, explicit);
    assert.deepEqual(omitted.edges, []);
    assert.equal(omitted.ok, true);
  });

  it("marks an edge unsatisfied when the peer is missing, even for *", () => {
    const out = explainPeerConflict([
      pkg("app", "1.0.0", [peer("ghost", "*")]),
    ]);
    assert.deepEqual(out.edges, [
      { from: "app", to: "ghost", range: "*", satisfied: false },
    ]);
    assert.equal(out.ok, false);
  });
});

describe("explainPeerConflict — conflicts", () => {
  it("types an absent peer as missing, with the exact detail template", () => {
    const out = explainPeerConflict([
      pkg("app", "1.0.0", [peer("react", "^18.0.0")]),
    ]);
    assert.equal(out.ok, false);
    assert.deepEqual(out.conflicts, [
      {
        from: "app",
        peer: "react",
        range: "^18.0.0",
        installed: null,
        type: "missing",
        detail: "app requires peer react (^18.0.0) but react is not installed",
      },
    ]);
  });

  it("types an out-of-range peer as version, with the exact detail template", () => {
    const out = explainPeerConflict([
      pkg("react", "17.0.2"),
      pkg("app", "1.0.0", [peer("react", "^18.0.0")]),
    ]);
    assert.equal(out.ok, false);
    assert.deepEqual(out.conflicts, [
      {
        from: "app",
        peer: "react",
        range: "^18.0.0",
        installed: "17.0.2",
        type: "version",
        detail: "app requires peer react (^18.0.0) but 17.0.2 is installed",
      },
    ]);
  });

  it("sorts conflicts by (from asc, peer asc), not by listed order", () => {
    const out = explainPeerConflict([
      pkg("b", "1.0.0", [peer("zlib", "^1.0.0"), peer("alib", "^1.0.0")]),
      pkg("a", "1.0.0", [peer("mlib", "^1.0.0")]),
    ]);
    // Edges keep b's listed peer order...
    assert.deepEqual(
      out.edges.map((e) => `${e.from}->${e.to}`),
      ["a->mlib", "b->zlib", "b->alib"],
    );
    // ...but conflicts are re-sorted by peer within each from.
    assert.deepEqual(
      out.conflicts.map((c) => `${c.from}/${c.peer}`),
      ["a/mlib", "b/alib", "b/zlib"],
    );
  });

  it("keeps satisfied edges out of the conflicts list", () => {
    const out = explainPeerConflict([
      pkg("lib", "1.5.0"),
      pkg("good", "1.0.0", [peer("lib", "^1.0.0")]),
      pkg("bad", "1.0.0", [peer("lib", "^2.0.0")]),
    ]);
    assert.equal(out.conflicts.length, 1);
    assert.equal(out.conflicts[0].from, "bad");
    assert.equal(out.conflicts[0].type, "version");
  });
});

describe("explainPeerConflict — resolutions", () => {
  it("suggests installing a missing peer, with the exact template", () => {
    const out = explainPeerConflict([
      pkg("app", "1.0.0", [peer("react", "^18.0.0")]),
    ]);
    assert.deepEqual(out.resolutions, [
      {
        peer: "react",
        installed: null,
        required_by: [{ from: "app", range: "^18.0.0", lowest: "18.0.0" }],
        suggestion: "install react at a version satisfying every listed range",
      },
    ]);
  });

  it("suggests changing an installed peer, with the exact template", () => {
    const out = explainPeerConflict([
      pkg("react", "17.0.2"),
      pkg("app", "1.0.0", [peer("react", "^18.0.0")]),
    ]);
    assert.deepEqual(out.resolutions, [
      {
        peer: "react",
        installed: "17.0.2",
        required_by: [{ from: "app", range: "^18.0.0", lowest: "18.0.0" }],
        suggestion:
          "change react from 17.0.2 to a version satisfying every listed range",
      },
    ]);
  });

  it("reports the lowest satisfying version per range kind in required_by", () => {
    const out = explainPeerConflict([
      pkg("r1", "1.0.0", [peer("shared", "^18.0.0")]),
      pkg("r2", "1.0.0", [peer("shared", "*")]),
      pkg("r3", "1.0.0", [peer("shared", "2.0.0")]),
      pkg("r4", "1.0.0", [peer("shared", "~1.5.0")]),
      pkg("r5", "1.0.0", [peer("shared", ">=3.0.0")]),
    ]);
    assert.equal(out.resolutions.length, 1);
    assert.deepEqual(out.resolutions[0].required_by, [
      { from: "r1", range: "^18.0.0", lowest: "18.0.0" },
      { from: "r2", range: "*", lowest: "any" },
      { from: "r3", range: "2.0.0", lowest: "2.0.0" },
      { from: "r4", range: "~1.5.0", lowest: "1.5.0" },
      { from: "r5", range: ">=3.0.0", lowest: "3.0.0" },
    ]);
    assert.equal(out.resolutions[0].installed, null);
  });

  it("sorts resolutions by peer and required_by by from", () => {
    const out = explainPeerConflict([
      pkg("zeta", "1.0.0", [peer("shared", "^2.0.0"), peer("aaa-missing", "*")]),
      pkg("alpha", "1.0.0", [peer("shared", "^3.0.0")]),
    ]);
    assert.deepEqual(
      out.resolutions.map((r) => r.peer),
      ["aaa-missing", "shared"],
    );
    const shared = out.resolutions.find((r) => r.peer === "shared");
    assert.deepEqual(
      shared?.required_by.map((r) => r.from),
      ["alpha", "zeta"],
    );
  });

  it("gives one resolution per peer even when several packages conflict on it", () => {
    const out = explainPeerConflict([
      pkg("one", "1.0.0", [peer("gone", "^1.0.0")]),
      pkg("two", "1.0.0", [peer("gone", "^2.0.0")]),
    ]);
    assert.equal(out.resolutions.length, 1);
    assert.equal(out.resolutions[0].peer, "gone");
    assert.equal(out.resolutions[0].required_by.length, 2);
  });

  it("lists only the conflicting requirements in required_by", () => {
    // "good" is satisfied by the installed lib and must not be
    // listed: the resolution addresses the conflict only.
    const out = explainPeerConflict([
      pkg("lib", "1.5.0"),
      pkg("good", "1.0.0", [peer("lib", "^1.0.0")]),
      pkg("bad", "1.0.0", [peer("lib", "^2.0.0")]),
    ]);
    assert.deepEqual(out.resolutions, [
      {
        peer: "lib",
        installed: "1.5.0",
        required_by: [{ from: "bad", range: "^2.0.0", lowest: "2.0.0" }],
        suggestion:
          "change lib from 1.5.0 to a version satisfying every listed range",
      },
    ]);
  });
});

describe("explainPeerConflict — validation", () => {
  it("rejects missing, empty, or non-array packages", () => {
    assert.throws(() => explainPeerConflict(undefined), /packages is required/);
    assert.throws(
      () => explainPeerConflict([]),
      /packages must be a non-empty array/,
    );
    assert.throws(
      () => explainPeerConflict("nope"),
      /packages must be a non-empty array/,
    );
  });

  it("rejects a package that is not an object, naming the path", () => {
    assert.throws(() => explainPeerConflict([42]), /packages\[0\] must be an object/);
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0"), "b"]),
      /packages\[1\] must be an object/,
    );
  });

  it("rejects a package missing its name, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([{ version: "1.0.0" }]),
      /packages\[0\]\.name is required/,
    );
  });

  it("rejects an empty or non-string package name, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([pkg("", "1.0.0")]),
      /packages\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => explainPeerConflict([{ name: 42, version: "1.0.0" }]),
      /packages\[0\]\.name must be a non-empty string/,
    );
  });

  it("rejects a duplicate package name, naming both paths", () => {
    assert.throws(
      () =>
        explainPeerConflict([
          pkg("a", "1.0.0"),
          pkg("b", "1.0.0"),
          pkg("a", "2.0.0"),
        ]),
      /packages\[2\]\.name duplicates packages\[0\]\.name "a"/,
    );
  });

  it("rejects a package missing its version, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([{ name: "a" }]),
      /packages\[0\]\.version is required/,
    );
  });

  it("rejects versions outside MAJOR.MINOR.PATCH form, naming the path", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "1.2.x", "1.2.3-beta", ""]) {
      assert.throws(
        () => explainPeerConflict([pkg("a", "1.0.0"), pkg("b", bad)]),
        /packages\[1\]\.version is not a valid MAJOR\.MINOR\.PATCH version:/,
        `version ${JSON.stringify(bad)} should be rejected`,
      );
    }
    assert.throws(
      () => explainPeerConflict([{ name: "a", version: 123 }]),
      /packages\[0\]\.version is not a valid MAJOR\.MINOR\.PATCH version: "123"/,
    );
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0"), pkg("b", "1.2")]),
      /packages\[1\]\.version is not a valid MAJOR\.MINOR\.PATCH version: "1\.2"/,
    );
  });

  it("rejects a non-array peers field, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([{ name: "a", version: "1.0.0", peers: "react" }]),
      /packages\[0\]\.peers must be an array/,
    );
  });

  it("rejects a peer entry that is not an object, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", ["react" as never])]),
      /packages\[0\]\.peers\[0\] must be an object/,
    );
  });

  it("rejects a peer entry missing its name or range, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [{ range: "^1.0.0" } as never])]),
      /packages\[0\]\.peers\[0\]\.name is required/,
    );
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [{ name: "react" } as never])]),
      /packages\[0\]\.peers\[0\]\.range is required/,
    );
  });

  it("rejects an empty or non-string peer name or range, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [peer("", "^1.0.0")])]),
      /packages\[0\]\.peers\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [{ name: 7, range: "*" } as never])]),
      /packages\[0\]\.peers\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [peer("react", "")])]),
      /packages\[0\]\.peers\[0\]\.range must be a non-empty string/,
    );
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [{ name: "react", range: 7 } as never])]),
      /packages\[0\]\.peers\[0\]\.range must be a non-empty string/,
    );
  });

  it("rejects ranges outside the grammar, naming the path (spec example)", () => {
    assert.throws(
      () =>
        explainPeerConflict([
          pkg("a", "1.0.0", [peer("b", "^1.0.0"), peer("c", "=>1.0.0")]),
          pkg("b", "1.0.0"),
        ]),
      /packages\[0\]\.peers\[1\]\.range is not a supported range: "=>1\.0\.0"/,
    );
    for (const bad of [
      "^1.2",
      ">1.0.0",
      "<=2.0.0",
      "1.x",
      "^*",
      ">=1.0.0 || ^2.0.0",
      "latest",
      "~1",
      ">= 1.0.0",
      "^1.0.0 ",
      "1.0.0 || 2.0.0",
    ]) {
      assert.throws(
        () => explainPeerConflict([pkg("a", "1.0.0", [peer("b", bad)])]),
        /packages\[0\]\.peers\[0\]\.range is not a supported range:/,
        `range ${JSON.stringify(bad)} should be rejected`,
      );
    }
  });

  it("rejects a package listing the same peer twice, naming both paths", () => {
    assert.throws(
      () =>
        explainPeerConflict([
          pkg("a", "1.0.0", [peer("react", "^17.0.0"), peer("react", "^18.0.0")]),
        ]),
      /packages\[0\]\.peers\[1\]\.name duplicates packages\[0\]\.peers\[0\]\.name "react"/,
    );
  });

  it("allows different packages to require the same peer", () => {
    const out = explainPeerConflict([
      pkg("react", "18.0.0"),
      pkg("a", "1.0.0", [peer("react", "^18.0.0")]),
      pkg("b", "1.0.0", [peer("react", ">=17.0.0")]),
    ]);
    assert.equal(out.ok, true);
    assert.equal(out.edges.length, 2);
  });

  it("rejects a package declaring a peer on itself, naming the path", () => {
    assert.throws(
      () => explainPeerConflict([pkg("a", "1.0.0", [peer("a", "*")])]),
      /packages\[0\]\.peers\[0\]\.name declares a peer on its own package "a"/,
    );
  });

  it("does not treat an absent peer as a validation error", () => {
    assert.doesNotThrow(() =>
      explainPeerConflict([pkg("a", "1.0.0", [peer("not-installed", "^1.0.0")])]),
    );
    const out = explainPeerConflict([
      pkg("a", "1.0.0", [peer("not-installed", "^1.0.0")]),
    ]);
    assert.equal(out.conflicts[0].type, "missing");
  });
});
