import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULTS, parseArgs } from "../config/config";
import { fileWriter, LOG_MAX_BYTES, onPath, wrappedEnv } from "./wrap";

const dir = (): string => mkdtempSync(join(tmpdir(), "openmasq-log-"));

describe("the wrapped child", () => {
  it("gets the three base URLs pointed at the proxy", () => {
    const env = wrappedEnv("http://127.0.0.1:8787", {});
    expect(env.OPENAI_BASE_URL).toBe("http://127.0.0.1:8787/v1");
    expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:8787");
  });

  it("exempts loopback from any HTTP proxy, keeping the user's own exemptions", () => {
    // Otherwise the unmasked request — and its key — goes to that proxy on its way to us.
    const env = wrappedEnv("http://127.0.0.1:8787", {
      HTTP_PROXY: "http://corp:3128",
      no_proxy: "intra.test",
    });
    expect(env.NO_PROXY?.split(",")).toEqual(["127.0.0.1", "localhost", "::1"]);
    expect(env.no_proxy?.split(",")).toEqual(["intra.test", "127.0.0.1", "localhost", "::1"]);
  });
});

describe("the request log", () => {
  it.skipIf(process.platform === "win32")(
    "is written 0600 — it describes a person's activity",
    () => {
      const file = join(dir(), "proxy.log");
      fileWriter(file)("a line");
      expect(statSync(file).mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === "win32")(
    "tightens a file that already existed with a laxer mode",
    () => {
      const file = join(dir(), "proxy.log");
      writeFileSync(file, "old\n");
      chmodSync(file, 0o644);
      fileWriter(file)("new");
      expect(statSync(file).mode & 0o777).toBe(0o600);
    },
  );

  /** The stream buffers, so a synchronous read runs ahead of it. */
  const flushed = () => new Promise((r) => setTimeout(r, 30));

  it("rotates once past the cap instead of growing for the life of the install", async () => {
    const file = join(dir(), "proxy.log");
    writeFileSync(file, "x".repeat(LOG_MAX_BYTES + 1));
    fileWriter(file)("fresh");
    await flushed();
    expect(readFileSync(file, "utf8")).toBe("fresh\n");
    expect(readFileSync(`${file}.1`, "utf8")).toHaveLength(LOG_MAX_BYTES + 1);
  });

  it("keeps appending below the cap", async () => {
    const file = join(dir(), "proxy.log");
    writeFileSync(file, "kept\n");
    fileWriter(file)("added");
    await flushed();
    expect(readFileSync(file, "utf8")).toBe("kept\nadded\n");
  });
});

describe("a real value can never reach that file", () => {
  it("because the writer only opens for a wrapped tool, and --reveal is refused there", () => {
    // Two facts in two files hold this up, so the CONJUNCTION is pinned here: the log
    // writer exists only when a command follows `--` (`server.ts`), and `--reveal` with a
    // command is refused (`config.ts`). Break either and this test says so.
    expect(parseArgs(["--reveal"]).command).toEqual([]);
    expect(() => parseArgs(["--reveal", "--", "claude"])).toThrow(/owns the terminal/);
    expect(DEFAULTS.reveal).toBe(false);
  });
});

describe("onPath — is there anything to wrap", () => {
  it("finds a bare name on PATH and rejects one that is absent", () => {
    const env = { PATH: dirname(process.execPath) } as NodeJS.ProcessEnv;
    expect(onPath(basename(process.execPath), env)).toBe(true);
    expect(onPath("openmasq-definitely-not-installed", env)).toBe(false);
  });
  it("takes an explicit path at its word, existing or not", () => {
    expect(onPath(process.execPath, {} as NodeJS.ProcessEnv)).toBe(true);
    expect(onPath("/nope/openmasq/not-here", {} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("an empty command is nothing to wrap", () => {
    expect(onPath("", process.env)).toBe(false);
  });
});
