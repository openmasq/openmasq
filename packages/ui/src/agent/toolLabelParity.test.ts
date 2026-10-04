import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { humanToolLabel } from "./humanToolLabel";
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
 *  2. the per-connector vocabulary may only dress a READ — it's made entirely of
 *     reading verbs ("Searching email", "Reading Slack"), and it used to show during
 *     an email send or a file deletion. Both hold in EVERY shipped language.
 */

/** The bare label, without the « … » or the argument size the loader adds. */
const nu = (s: string | undefined) => (s ?? "").replace(/….*$/, "");

describe.each(LOCALES)("un outil intercepté porte le MÊME nom sur les trois surfaces (%s)", (loc) => {
  const t = getMessages(loc);
  for (const [tool, attendu] of Object.entries(t.runtime.tools.intercepted)) {
    it(`${tool} → « ${attendu} »`, () => {
      expect(nu(toolActionLabel(t, tool))).toBe(attendu);
      expect(toolStartNarration(tool, "", t)).toBe(attendu);
      expect(humanToolLabel("mcp", tool, t)).toBe(attendu);
    });
  }
});

describe.each(LOCALES)("le vocabulaire de lecture n'habille jamais une écriture (%s)", (loc) => {
  const t = getMessages(loc);
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
    it(`${plein} : le chargeur annonce l'action, pas une lecture`, () => {
      const direct = nu(toolActionLabel(t, plein));
      const trace = humanToolLabel(connecteur, outil, t);
      // It really is a write per the ONLY definition that matters (the gate's).
      expect(isWriteTool(outil), `${outil} devrait être classé écriture`).toBe(true);
      // …so the loader carries the trace's verb, never the read phrase.
      expect(direct, `« ${direct} » pendant ${plein}`).toContain(trace);
      expect(toolStartNarration(outil, connecteur, t)).toBe(trace);
    });
  }

  it("une LECTURE garde bien sa phrase contextuelle", () => {
    const read = t.runtime.tools.connectorRead;
    expect(nu(toolActionLabel(t, "gmail__search_messages"))).toBe(read.gmail);
    expect(nu(toolActionLabel(t, "notion__notion-fetch"))).toBe(read.notion);
    expect(toolStartNarration("search_messages", "gmail", t)).toBe(read.gmail);
  });
});
