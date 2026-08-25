import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";

// The jail deny-list reads app.getPath; mock electron + the native-ish sibling modules so
// importing sandbox.ts stays offline/fast. Mock BEFORE importing.
const USERDATA = "/tmp/openmasq-ud";
const HOME = "/home/acme";
vi.mock("electron", () => ({
  app: { getPath: (k: string) => (k === "home" ? HOME : USERDATA) },
}));
vi.mock("./egressProxy", () => ({ startEgressProxy: () => Promise.resolve({ port: 0, close() {} }) }));
vi.mock("./wheels", () => ({ ALLOW_HOSTS: [], buildScript: (s: string) => s }));
vi.mock("./runtime", () => ({ fontsDir: () => "/tmp/fonts", mplConfigDir: () => join(USERDATA, "python-cache") }));

import { secretPaths, sandboxReadCarveOuts, seatbeltProfile, sandboxTempEnv } from "./sandbox";

/* audit M7 — PARITY regression. The Python jail's read deny-list must mask the WHOLE
   userData subtree (like the FS-MCP `fsDenyPaths()` and the `files:read` gate), NOT just
   `accounts/`. Reverting to an `accounts/`-only deny would re-expose `agent-browser/`
   (SaaS cookies), `broker/` (CDP secret) and `files/` (blobs) — this test would then FAIL. */
describe("python sandbox secret deny-list parity (audit M7)", () => {
  it("denies the ENTIRE userData root, not merely accounts/", () => {
    const { dirs } = secretPaths();
    // The exact value `fsDenyPaths()` returns — full parity with the FS-MCP gate.
    expect(dirs).toContain(USERDATA);
    // The old, insufficient deny (accounts/-only) is NOT how it's expressed anymore:
    // the blanket userData root is present, which covers accounts/ + everything under it.
    expect(dirs.some((d) => d === USERDATA)).toBe(true);
  });

  it("still masks the user's ambient credential stores (defence beyond userData)", () => {
    const { dirs, files } = secretPaths();
    expect(dirs).toContain(join(HOME, ".ssh"));
    expect(dirs).toContain(join(HOME, ".aws"));
    expect(files).toContain(join(HOME, ".netrc"));
  });

  it("the read carve-outs are all UNDER userData (so the blanket deny stays scoped)", () => {
    for (const p of sandboxReadCarveOuts()) {
      expect(p.startsWith(USERDATA)).toBe(true);
    }
  });
});

/* SQLite-in-the-jail regression (the "yfinance renvoie zéro donnée" bug). SQLite's
   `unixFullPathname` lstat()s EVERY component of a DB path; the userData directory NODE
   sits inside the blanket `subpath` deny and the carve-outs only reopen what's strictly
   below `userData/python` — so a file-backed `sqlite3.connect` died with SQLITE_CANTOPEN
   in the scratch, and every yfinance fetch (SQLite cookie/tz cache) returned empty.
   Two invariants close it, each pinned here:
   1. the seatbelt profile re-allows METADATA of the userData node — `literal`, never
      `subpath` (a subpath allow would re-expose the secrets under it);
   2. every temp-dir env (SQLITE_TMPDIR first among them) points inside the scratch,
      because the jail denies /tmp|/var/tmp|/usr/tmp|darwin-temp and SQLite needs a
      usable temp dir even for `:memory:`. */
describe("python sandbox × SQLite (yfinance cache regression)", () => {
  it("seatbelt: userData NODE metadata is re-allowed AFTER the deny, as a LITERAL only", () => {
    const scratch = join(USERDATA, "python", "runs", "r1");
    const prof = seatbeltProfile(scratch, 1234);
    const deny = `(deny file-read* (subpath "${USERDATA}"))`;
    const meta = `(allow file-read-metadata (literal "${USERDATA}"))`;
    expect(prof).toContain(deny);
    expect(prof).toContain(meta);
    // SBPL: later rules win — the metadata allow must come AFTER the blanket deny.
    expect(prof.indexOf(meta)).toBeGreaterThan(prof.indexOf(deny));
    // Never a subpath allow on the userData root (that would re-expose the secrets).
    expect(prof).not.toContain(`(allow file-read-metadata (subpath "${USERDATA}"))`);
    expect(prof).not.toContain(`(allow file-read* (subpath "${USERDATA}"))`);
  });

  it("every temp-dir env (SQLITE_TMPDIR included) points inside the scratch", () => {
    const env = sandboxTempEnv("/scratch/tmp");
    expect(env).toEqual({
      TMPDIR: "/scratch/tmp",
      TMP: "/scratch/tmp",
      TEMP: "/scratch/tmp",
      SQLITE_TMPDIR: "/scratch/tmp",
    });
  });
});
