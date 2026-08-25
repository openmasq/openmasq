import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bearerFetchJson } from "./fetchJson.js";

/**
 * ⛔ Le doublon d'Outlook (18/08). Graph répond `202 Accepted` **sans corps** à
 * `POST /me/sendMail` ; `res.json()` y jetait « Unexpected end of JSON input ». L'outil
 * remontait donc en ÉCHEC alors que le mail était PARTI, le modèle a relancé le même appel
 * — un second mail — puis a annoncé à l'utilisateur que l'envoi n'avait pas pu se faire.
 * Un effet de bord réel présenté comme une panne est pire qu'une panne : il se répète.
 *
 * La règle « un corps vide est un succès vide » vit dans DEUX `bearerFetchJson` : celui du
 * broker (ici) et celui du processus principal du bureau. Deux runtimes, deux copies — la
 * réponse de la règle 9 à une copie nécessaire est un TEST DE PARITÉ, jamais un commentaire
 * « à garder en phase ». Corriger un seul côté rouvrirait le défaut sur l'autre, et
 * personne ne le verrait : les deux chemins servent les mêmes connecteurs.
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
    // Ce qu'on épingle est le COMPORTEMENT, pas la formulation : le corps est lu en TEXTE,
    // le vide court-circuite, et le parse est protégé. Un retour à `await res.json()` sec
    // sur ce chemin fait tomber ce test.
    expect(src).toMatch(/const text = await res\.text\(\)/);
    expect(src).toMatch(/if \(!text\.trim\(\)\) return undefined as T/);
    expect(src).toMatch(/JSON\.parse\(text\)/);
  });
});
