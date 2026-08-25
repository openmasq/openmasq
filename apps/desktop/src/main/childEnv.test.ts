// L'env d'un enfant TIERS est une allowlist. Le cas qui justifie le fichier : l'app
// lancée depuis un terminal hérite des secrets du shell, et `{ ...process.env }` les
// retransmettait au broker et au serveur playwright-mcp — du code tiers.
import { describe, expect, it } from "vitest";
import { filterChildEnv } from "./childEnv";

describe("filterChildEnv", () => {
  it("laisse tomber les secrets du shell — la classe entière, pas des noms connus", () => {
    const out = filterChildEnv({
      PATH: "/usr/bin",
      AWS_SECRET_ACCESS_KEY: "s3cret",
      GITHUB_TOKEN: "ghp_x",
      OPENROUTER_API_KEY: "sk-or-x",
      UNE_VARIABLE_INVENTEE_DEMAIN: "x",
    });
    expect(out).toEqual({ PATH: "/usr/bin" });
  });

  it("garde le minimum vital POSIX, Windows et proxys", () => {
    const out = filterChildEnv({
      HOME: "/Users/x",
      TMPDIR: "/tmp",
      HTTPS_PROXY: "http://proxy:8080",
      SystemRoot: "C:\\Windows",
      APPDATA: "C:\\Users\\x\\AppData\\Roaming",
    });
    expect(out).toEqual({
      HOME: "/Users/x",
      TMPDIR: "/tmp",
      HTTPS_PROXY: "http://proxy:8080",
      SystemRoot: "C:\\Windows",
      APPDATA: "C:\\Users\\x\\AppData\\Roaming",
    });
  });

  it("les variables NOMMÉES par l'appelant passent, et gagnent sur l'héritage", () => {
    const out = filterChildEnv({ PORT: "1111", PATH: "/usr/bin" }, { PORT: "8787", BROKER_FORCE_LISTEN: "1" });
    expect(out.PORT).toBe("8787");
    expect(out.BROKER_FORCE_LISTEN).toBe("1");
  });

  it("une variable permise mais absente ne devient pas une clé undefined", () => {
    expect(Object.keys(filterChildEnv({ PATH: "/usr/bin" }))).toEqual(["PATH"]);
  });
});
