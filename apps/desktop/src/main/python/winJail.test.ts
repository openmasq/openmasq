import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* The TypeScript side of the Windows sandbox. The binary itself (`native/win-jail/`) can
   only be exercised on a Windows runner — that's the job of `release-windows.yml`,
   which runs a real jail launcher against a canary file and REQUIRES the read to
   fail. Here we pin what's decidable without Windows, and which is precisely what
   a regression would break silently: the fail-closed gate, and the shape of the argv. */

const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-ud-"));
const RESOURCES = mkdtempSync(join(tmpdir(), "openmasq-res-"));
const MPL = join(USERDATA, "python-cache");

const packaged = true;
vi.mock("electron", () => ({
  app: {
    getPath: (k: string) => (k === "home" ? "/home/acme" : USERDATA),
    get isPackaged() {
      return packaged;
    },
  },
}));
vi.mock("./egressProxy", () => ({ startEgressProxy: () => Promise.resolve({ port: 0, close() {} }) }));
vi.mock("./wheels", () => ({ ALLOW_HOSTS: [], buildScript: (s: string) => s }));
vi.mock("./runtime", () => ({ fontsDir: () => "/tmp/fonts", mplConfigDir: () => MPL }));

import { jailAvailability, jailedCmd } from "./sandbox";
import { winJailExe } from "./winJail";
import { BRAND } from "@openmasq/branding";

const realPlatform = process.platform;
const setPlatform = (p: string): void => {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
};

const JAIL_DIR = join(RESOURCES, "win-jail");
const EXE = join(JAIL_DIR, `${BRAND.slug}-jail.exe`);

beforeAll(() => {
  (process as { resourcesPath?: string }).resourcesPath = RESOURCES;
  mkdirSync(JAIL_DIR, { recursive: true });
});
afterAll(() => {
  setPlatform(realPlatform);
  rmSync(USERDATA, { recursive: true, force: true });
  rmSync(RESOURCES, { recursive: true, force: true });
});

describe("jailAvailability on win32 — fail closed", () => {
  it("is 'none' when the launcher is MISSING, so runPython refuses", () => {
    // THE property. A Windows bundle amputated of its launcher must not « fall back »
    // to an unconfined run: this is de-redacted code, it carries the user's real
    // data. A silent degradation here is a leak, not a lesser evil.
    rmSync(EXE, { force: true });
    setPlatform("win32");
    expect(jailAvailability()).toBe("none");
  });

  it("is 'appcontainer' once the launcher is bundled", () => {
    writeFileSync(EXE, "MZ"); // the content doesn't matter: only presence is tested
    setPlatform("win32");
    expect(winJailExe()).toBe(EXE);
    expect(jailAvailability()).toBe("appcontainer");
  });

  it("no other platform is ever reported as 'appcontainer'", () => {
    setPlatform("darwin");
    expect(jailAvailability()).toBe("seatbelt");
  });
});

describe("the win32 argv", () => {
  const PY = join("C:\\", "rt", "python", "python.exe");
  const build = (): { cmd: string; args: string[] } => {
    writeFileSync(EXE, "MZ");
    setPlatform("win32");
    return jailedCmd(PY, "C:\\scratch\\main.py", "C:\\scratch", 4242);
  };

  it("runs the bundled launcher, with the program after `--`", () => {
    const { cmd, args } = build();
    expect(cmd).toBe(EXE);
    const sep = args.indexOf("--");
    expect(sep).toBeGreaterThan(0);
    expect(args.slice(sep + 1)).toEqual([PY, "C:\\scratch\\main.py"]);
  });

  it("grants the runtime ROOT read, and only the scratch + mpl cache write", () => {
    const { args } = build();
    const grantsOf = (flag: string): string[] =>
      args.flatMap((a, i) => (a === flag ? [args[i + 1] as string] : []));
    // Two dirnames above the interpreter: the runtime root, which also carries
    // the stdlib, the wheels and the fonts. One single concession, not four.
    expect(grantsOf("--allow-read")).toEqual([join("C:\\", "rt")]);
    expect(grantsOf("--allow-write")).toEqual(["C:\\scratch", MPL]);
  });

  it("passes NO secret path — the deny-list is not the mechanism here", () => {
    // The contrast with seatbelt/bwrap, and the reason this jail is more
    // strict: they start from « everything is readable » and subtract the secrets
    // that were thought to name, so their argv carries the whole deny-list. An AppContainer starts from
    // NOTHING. Seeing a `userData` reappear here would signal that the deny-list
    // model was copied — and that forgetting an entry would again become a silent leak.
    const { args } = build();
    expect(args).not.toContain(USERDATA);
    expect(args.some((a) => a.includes("/home/acme"))).toBe(false);
  });

  it("mentions no proxy port — an AppContainer with no capability has NO socket at all", () => {
    // `noNetwork()` is unconditionally true on win32, and no environment
    // variable comes back from it: there's nothing to reopen on the TypeScript side, the
    // network capability is granted at process creation. So the port must never leak here.
    const { args } = build();
    expect(args.join(" ")).not.toContain("4242");
  });

  it("caps memory and process count (the Job Object replaces the POSIX ulimit cage)", () => {
    const { args } = build();
    expect(args).toContain("--memory-mb");
    expect(args[args.indexOf("--memory-mb") + 1]).toBe("4096");
    expect(args).toContain("--active-processes");
  });
});
