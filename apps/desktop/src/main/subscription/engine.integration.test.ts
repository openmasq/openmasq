// Test d'INTÉGRATION : il lance la vraie CLI, consomme le vrai abonnement et coûte des
// jetons. Il ne tourne donc QUE sur demande explicite :
//
//   OPENMASQ_TEST_SUBSCRIPTION_CLI=1 npx vitest run apps/desktop/src/main/subscription
//
// Sans la variable il se saute, pour que `pnpm test` et la CI restent hermétiques.
// Ce qu'il couvre et qu'aucun test pur ne peut couvrir : la boucle du générateur
// (chunks → lignes → deltas → retour), et le fait que les drapeaux d'isolement
// n'empêchent PAS l'auth par abonnement de fonctionner.
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@openmasq/llm";
import { resolveCli } from "./resolveCli";
import { streamClaudeSubscription } from "./engine";
import { flattenForCli } from "./bridge";

const enabled = process.env.OPENMASQ_TEST_SUBSCRIPTION_CLI === "1";

describe.skipIf(!enabled)("streamClaudeSubscription (CLI réelle)", () => {
  it("streame un tour et rend l'usage", async () => {
    const bin = resolveCli("claude", {
      platform: process.platform,
      home: process.env.HOME ?? "",
      path: process.env.PATH,
    });
    expect(bin, "CLI claude introuvable").not.toBeNull();

    const chunks: string[] = [];
    const gen = streamClaudeSubscription({
      binPath: bin as string,
      prompt: "Réponds exactement: PONG",
      sessionId: randomUUID(),
      cwd: mkdtempSync(join(tmpdir(), "openmasq-sub-")),
    });

    let result = await gen.next();
    while (!result.done) {
      chunks.push(result.value);
      result = await gen.next();
    }

    expect(chunks.join("")).toContain("PONG");
    expect(result.value.finish).toBe("stop");
    expect(result.value.usage?.outputTokens).toBeGreaterThan(0);
    // Le cache est ré-additionné : l'entrée totale dépasse toujours l'entrée nue.
    expect(result.value.usage?.inputTokens).toBeGreaterThan(0);
  }, 120_000);

  it("s'arrête proprement sur abort", async () => {
    const bin = resolveCli("claude", {
      platform: process.platform,
      home: process.env.HOME ?? "",
      path: process.env.PATH,
    });
    const ac = new AbortController();
    const gen = streamClaudeSubscription({
      binPath: bin as string,
      prompt: "Compte lentement de 1 à 200.",
      sessionId: randomUUID(),
      cwd: mkdtempSync(join(tmpdir(), "openmasq-sub-")),
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 1500);
    let last;
    for (;;) {
      const r = await gen.next();
      if (r.done) {
        last = r.value;
        break;
      }
    }
    expect(last.finish).toBe("cut");
  }, 120_000);

  it("transporte l'historique aplati ET le prompt système", async () => {
    const bin = resolveCli("claude", {
      platform: process.platform,
      home: process.env.HOME ?? "",
      path: process.env.PATH,
    });
    const messages: ChatMessage[] = [
      { role: "system", content: "Réponds en UN seul mot, sans ponctuation." },
      { role: "user", content: "Mon code secret est BANANE42." },
      { role: "assistant", content: "Noté." },
      { role: "user", content: "Redonne mon code secret." },
    ];
    const { system, prompt } = flattenForCli(messages);

    const chunks: string[] = [];
    const gen = streamClaudeSubscription({
      binPath: bin as string,
      prompt,
      system,
      sessionId: randomUUID(),
      cwd: mkdtempSync(join(tmpdir(), "openmasq-sub-")),
    });
    let r = await gen.next();
    while (!r.done) {
      chunks.push(r.value);
      r = await gen.next();
    }

    // L'historique est bien PARVENU au modèle : le code n'est que dans le 2e message.
    expect(chunks.join("")).toContain("BANANE42");
    expect(r.value.finish).toBe("stop");
  }, 120_000);
});
