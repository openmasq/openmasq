import { describe, expect, it } from "vitest";
import { humanToolLabel, INTERCEPTED } from "./humanToolLabel";
import { toolActionLabel, toolStartNarration } from "./toolActionLabel";
import { isWriteTool } from "./mcpAgentClassify";

/**
 * THREE surfaces name the same call — the loader during the action
 * (`toolActionLabel`), the narration seeded at dispatch time (`toolStartNarration`)
 * and the persisted trace line (`humanToolLabel`). Nothing held them together: a
 * comment claimed the single table prevented it, and the `run_python` exception
 * right below it disproved that. A comment doesn't fail CI; this file does.
 *
 * Two properties, and the second is a matter of honesty, not style:
 *  1. an INTERCEPTED tool carries the same name everywhere;
 *  2. the "fun" per-connector vocabulary may only dress a READ — it's
 *     made entirely of reading verbs (fouille, farfouille, feuilletage…), and it
 *     used to show during an email send or a file deletion.
 */

/** The bare label, without the « … » or the argument size the loader adds. */
const nu = (s: string | undefined) => (s ?? "").replace(/….*$/, "");

describe("un outil intercepté porte le MÊME nom sur les trois surfaces", () => {
  for (const [tool, attendu] of Object.entries(INTERCEPTED)) {
    it(`${tool} → « ${attendu} »`, () => {
      expect(nu(toolActionLabel(tool))).toBe(attendu);
      expect(toolStartNarration(tool, "")).toBe(attendu);
    });
  }
});

describe("le vocabulaire amusant n'habille jamais une écriture", () => {
  // A write call from a "fun"-covered connector, exactly as it happens for real.
  const ecritures = [
    "gmail__send_email",
    "microsoft-outlook__send_email",
    "slack__send_message",
    "notion__notion-create-pages",
    "linear__create_issue",
    "google-drive__delete_file",
    "google-docs__update_document",
    "stripe__stripe_api_write",
    "canva__create_design",
  ];

  for (const plein of ecritures) {
    const [connecteur, outil] = plein.split("__");
    it(`${plein} : le chargeur annonce l'action, pas une fouille`, () => {
      const direct = nu(toolActionLabel(plein));
      const trace = humanToolLabel(connecteur, outil);
      // It really is a write per the ONLY definition that matters (the gate's).
      expect(isWriteTool(outil), `${outil} devrait être classé écriture`).toBe(true);
      // …so the loader carries the trace's verb, never the read phrase.
      expect(direct, `« ${direct} » pendant ${plein}`).toContain(trace);
      expect(toolStartNarration(outil, connecteur)).toBe(trace);
    });
  }

  it("une LECTURE garde bien sa phrase contextuelle (on ne casse pas le ton)", () => {
    expect(nu(toolActionLabel("gmail__search_messages"))).toBe("Fouille de la boîte mail");
    expect(nu(toolActionLabel("notion__notion-fetch"))).toBe("Feuilletage de Notion");
    expect(toolStartNarration("search_messages", "gmail")).toBe("Fouille de la boîte mail");
  });
});
