import { describe, it, expect } from "vitest";
import { validateConfiguration } from "app-builder-lib/out/util/config/config";

/**
 * ⛔ THE CONFIG IS ONLY HALF-BUILT WITHOUT THE SIGNING CREDENTIALS, and the half nobody
 * ran is the one that ships.
 *
 * `electron-builder.cjs` adds `win.azureSignOptions` ONLY when `AZURE_CLIENT_SECRET` and
 * `AZURE_CODESIGN_ACCOUNT` are set. Every check that existed — loading the file, the
 * Windows preflight, a local `pnpm run eb` — runs without them, so that object was never
 * constructed and never validated. The first time it was, it was the real release of
 * `beta-v0.10.1`, on a `windows-latest` runner, twenty minutes in:
 *
 *     ⨯ Invalid configuration object.
 *     - configuration.win.azureSignOptions.publisherName should be a string
 *
 * It had been an array, on the written belief that the validator did not look at that
 * subtree. It does. Nothing packaged.
 *
 * So both branches are built here and handed to electron-builder's OWN validator — the
 * same `validateConfiguration` the packager calls, not a copy of its rules.
 */
async function load(env: Record<string, string> | null): Promise<Record<string, unknown>> {
  const saved = { ...process.env };
  for (const k of ["AZURE_CLIENT_SECRET", "AZURE_CODESIGN_ACCOUNT", "AZURE_CODESIGN_ENDPOINT", "AZURE_CODESIGN_PROFILE"]) {
    delete process.env[k];
  }
  Object.assign(process.env, env ?? {});
  const path = require.resolve("../electron-builder.cjs");
  delete require.cache[path];
  const loaded = require(path);
  process.env = saved;
  return typeof loaded === "function" ? loaded() : loaded;
}

const SIGNING = {
  AZURE_CLIENT_SECRET: "not-a-real-secret",
  AZURE_CODESIGN_ACCOUNT: "an-account",
  AZURE_CODESIGN_ENDPOINT: "https://neu.codesigning.azure.net/",
  AZURE_CODESIGN_PROFILE: "a-profile",
};

describe("electron-builder.cjs", () => {
  it("est valide SANS les identifiants de signature (fork, build local)", async () => {
    const config = await load(null);
    expect(config.win).toBeTruthy();
    expect((config.win as Record<string, unknown>).azureSignOptions).toBeUndefined();
    await expect(validateConfiguration(config as never, null as never)).resolves.not.toThrow();
  });

  it("est valide AVEC eux — la branche qui signe et publie", async () => {
    const config = await load(SIGNING);
    const win = config.win as Record<string, Record<string, unknown>>;
    expect(win.azureSignOptions).toBeTruthy();
    await expect(validateConfiguration(config as never, null as never)).resolves.not.toThrow();
  });

  it("le nom d'éditeur est UNE chaîne — un tableau est refusé par le schéma", async () => {
    const win = (await load(SIGNING)).win as Record<string, Record<string, unknown>>;
    expect(typeof win.azureSignOptions.publisherName).toBe("string");
  });

  it("`win.publisherName` n'existe pas dans ce schéma et ne doit pas réapparaître", async () => {
    const win = (await load(SIGNING)).win as Record<string, unknown>;
    expect(win.publisherName).toBeUndefined();
  });
});
