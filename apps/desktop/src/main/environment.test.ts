import { describe, it, expect } from "vitest";
import { DEFAULT_ENV, readEnvPointer, writeEnvPointer, ENV_POINTER_FILE, type PointerIo } from "./environment";
import { BRAND } from "@openmasq/branding";

/** Un faux disque : ce que le pointeur lit et écrit, sans toucher au vrai. */
function fakeIo(seed?: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(seed ?? {}));
  const io: PointerIo = {
    readFile: (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    writeFile: (p, c) => void files.set(p, c),
  };
  return { io, files };
}

const BASE = `/Users/x/Library/Application Support/${BRAND.name}`;
const AT = `${BASE}/${ENV_POINTER_FILE}`;

describe("readEnvPointer — le choix d'environnement, lu hors du profil qu'il décide", () => {
  it("sans pointeur (le cas de TOUTES les installs existantes), la PRODUCTION répond — le défaut n'est plus l'environnement du build", () => {
    const { io } = fakeIo();
    expect(readEnvPointer(BASE, DEFAULT_ENV, io)).toBe("production");
    expect(readEnvPointer(BASE, undefined, io)).toBe("production");
  });

  it("un pointeur écrit l'emporte sur le build — c'est tout l'objet de la bascule", () => {
    const { io } = fakeIo({ [AT]: JSON.stringify({ env: "staging" }) });
    expect(readEnvPointer(BASE, "production", io)).toBe("staging");
  });

  it("⛔ une valeur qui n'est PAS un nom connu est refusée — surtout une URL", () => {
    for (const hostile of ["https://evil.example", "prod", "", 42, null, { env: "staging" }]) {
      const { io } = fakeIo({ [AT]: JSON.stringify({ env: hostile }) });
      expect(readEnvPointer(BASE, "production", io)).toBe("production");
    }
  });

  it("un JSON cassé ne jette pas : ceci tourne avant `whenReady`, où une exception est un lancement mort sans fenêtre", () => {
    const { io } = fakeIo({ [AT]: "{ pas du json" });
    expect(() => readEnvPointer(BASE, "staging", io)).not.toThrow();
    expect(readEnvPointer(BASE, "staging", io)).toBe("staging");
  });
});

describe("writeEnvPointer", () => {
  it("écrit un NOM, et rien d'autre — aucune adresse ne transite par ce fichier", () => {
    const { io, files } = fakeIo();
    expect(writeEnvPointer(BASE, "staging", io)).toBe(true);
    const written = JSON.parse(files.get(AT)!) as Record<string, unknown>;
    expect(written).toEqual({ env: "staging" });
    expect(JSON.stringify(written)).not.toContain("http");
  });

  it("un disque en échec rend `false` au lieu de jeter — au pire l'app rouvre son environnement précédent", () => {
    const io: PointerIo = {
      readFile: () => "",
      writeFile: () => {
        throw new Error("EROFS");
      },
    };
    expect(writeEnvPointer(BASE, "staging", io)).toBe(false);
  });

  it("ce qu'on écrit est ce qu'on relit", () => {
    const { io } = fakeIo();
    writeEnvPointer(BASE, "staging", io);
    expect(readEnvPointer(BASE, "production", io)).toBe("staging");
  });
});

