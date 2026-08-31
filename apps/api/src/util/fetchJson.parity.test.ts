import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bearerFetchJson } from "./fetchJson.js";

/**
 * ⛔ The Outlook duplicate (18/08). Graph responds `202 Accepted` **with no body** to
 * `POST /me/sendMail`; `res.json()` there threw "Unexpected end of JSON input". The tool
 * therefore surfaced as a FAILURE while the mail had actually SENT, the model retried the same call
 * — a second mail — then told the user the send hadn't been able to happen.
 * A real side effect presented as a failure is worse than a failure: it repeats itself.
 *
 * The "an empty body is an empty success" rule lives in TWO `bearerFetchJson`s: the
 * broker's (here) and the desktop's main process's. Two runtimes, two copies — rule 9's
 * answer to a necessary copy is a PARITY TEST, never a "keep in sync"
 * comment. Fixing only one side would reopen the defect on the other, and
 * no one would see it: both paths serve the same connectors.
 */
const DESKTOP_RUN = join(
  __dirname,
  "../../../desktop/src/main/mcp/connectors/run.ts",
);

const ok = (status: number, body: string): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }) as unknown as Response;

describe("bearerFetchJson (broker) — un corps vide est un succès vide", () => {
  it("202 sans corps ne jette pas — il rend un résultat vide", async () => {
    globalThis.fetch = (async () => ok(202, "")) as typeof fetch;
    await expect(bearerFetchJson("tok")("https://graph.microsoft.com/v1.0/me/sendMail")).resolves
      .toBeUndefined();
  });

  it("204 et un corps d'espaces aussi", async () => {
    globalThis.fetch = (async () => ok(204, "")) as typeof fetch;
    await expect(bearerFetchJson("tok")("https://x/y")).resolves.toBeUndefined();
    globalThis.fetch = (async () => ok(200, "  \n ")) as typeof fetch;
    await expect(bearerFetchJson("tok")("https://x/y")).resolves.toBeUndefined();
  });

  it("un corps JSON reste rendu tel quel", async () => {
    globalThis.fetch = (async () => ok(200, '{"a":1}')) as typeof fetch;
    await expect(bearerFetchJson("tok")("https://x/y")).resolves.toEqual({ a: 1 });
  });

  it("un 2xx ILLISIBLE reste une erreur, mais nommée", async () => {
    globalThis.fetch = (async () => ok(200, "<html>")) as typeof fetch;
    await expect(bearerFetchJson("tok")("https://x/y")).rejects.toThrow(/non-JSON body/);
  });
});

describe("parité avec le processus principal du bureau", () => {
  it("l'autre `bearerFetchJson` traite AUSSI le corps vide au lieu de parser d'office", () => {
    const src = readFileSync(DESKTOP_RUN, "utf8");
    // What we pin here is the BEHAVIOR, not the wording: the body is read as TEXT,
    // the empty case short-circuits, and the parse is guarded. Reverting to a bare
    // `await res.json()` on this path breaks this test.
    expect(src).toMatch(/const text = await res\.text\(\)/);
    expect(src).toMatch(/if \(!text\.trim\(\)\) return undefined as T/);
    expect(src).toMatch(/JSON\.parse\(text\)/);
  });
});
