import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* Le côté TypeScript du bac à sable Windows. Le binaire lui-même (`native/win-jail/`) ne
   peut être exercé que sur un runner Windows — c'est le travail de `release-windows.yml`,
   qui lance un vrai lanceur de jail contre un fichier témoin et EXIGE que la lecture
   échoue. Ici on épingle ce qui est décidable sans Windows, et qui est précisément ce
   qu'une régression casserait en silence : la porte fail-closed, et la forme de l'argv. */

const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-ud-"));
const RESOURCES = mkdtempSync(join(tmpdir(), "openmasq-res-"));
const MPL = join(USERDATA, "python-cache");

let packaged = true;
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
    // LA propriété. Un bundle Windows amputé de son lanceur ne doit pas « se rabattre »
    // sur une exécution nue : c'est du code un-redacted, il porte les vraies données de
    // l'utilisateur. Une dégradation silencieuse ici est une fuite, pas un moindre mal.
    rmSync(EXE, { force: true });
    setPlatform("win32");
    expect(jailAvailability()).toBe("none");
  });

  it("is 'appcontainer' once the launcher is bundled", () => {
    writeFileSync(EXE, "MZ"); // le contenu est indifférent : seule la présence est testée
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
    // Deux dirnames au-dessus de l'interpréteur : la racine du runtime, qui porte aussi
    // la stdlib, les wheels et les polices. Une seule concession, pas quatre.
    expect(grantsOf("--allow-read")).toEqual([join("C:\\", "rt")]);
    expect(grantsOf("--allow-write")).toEqual(["C:\\scratch", MPL]);
  });

  it("passes NO secret path — the deny-list is not the mechanism here", () => {
    // Le contraste avec seatbelt/bwrap, et la raison pour laquelle ce jail est plus
    // strict : ils partent de « tout est lisible » et soustraient les secrets qu'on a
    // pensé à nommer, donc leur argv porte toute la deny-list. Un AppContainer part de
    // RIEN. Voir un `userData` réapparaître ici signalerait qu'on a recopié le modèle
    // du deny-list — et qu'oublier une entrée redeviendrait une fuite silencieuse.
    const { args } = build();
    expect(args).not.toContain(USERDATA);
    expect(args.some((a) => a.includes("/home/acme"))).toBe(false);
  });

  it("mentions no proxy port — an AppContainer with no capability has NO socket at all", () => {
    // `noNetwork()` vaut inconditionnellement true sur win32, et aucune variable
    // d'environnement n'y revient : il n'y a rien à rouvrir côté TypeScript, la capacité
    // réseau se donne à la création du processus. Le port ne doit donc jamais fuiter ici.
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
