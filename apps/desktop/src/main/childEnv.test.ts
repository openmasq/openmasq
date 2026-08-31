// A THIRD-PARTY child's env is an allowlist. The case that justifies this file: the app
// launched from a terminal inherits the shell's secrets, and `{ ...process.env }` was
// forwarding them to the broker and to the playwright-mcp server — third-party code.
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
