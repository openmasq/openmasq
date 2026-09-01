import { describe, it, expect, beforeEach } from "vitest";
import { wireTokenSummary, entryToText, logExportFor, type WireEntry } from "./entryText";
import { clearDebugLog, pushDebug, setDebugCapture, DRAFT_CONV } from "../../../state/debug";

const base: WireEntry = { id: "d1", at: 0, type: "wire", model: "gpt-4o", text: "bonjour" };

describe("wireTokenSummary", () => {
  it("is null until the model reports usage (pre-reply)", () => {
    expect(wireTokenSummary(base)).toBeNull();
    expect(wireTokenSummary({ ...base, outputTokens: 5 })).toBeNull(); // needs inputTokens
  });

  it("formats input/output tokens + a cost segment once usage lands", () => {
    const s = wireTokenSummary({ ...base, inputTokens: 1234, outputTokens: 567 });
    expect(s).not.toBeNull();
    expect(s).toContain("entrée");
    expect(s).toContain("sortie");
    // thin-space grouped token counts
    expect(s).toMatch(/1.234/);
    expect(s).toMatch(/567/);
    // three dot-separated segments: input · output · cost
    expect(s!.split("·")).toHaveLength(3);
  });

  it("treats a missing outputTokens as 0", () => {
    const s = wireTokenSummary({ ...base, inputTokens: 100 });
    expect(s).toContain("0 sortie");
  });

  it("names the CACHED share of the input, and stays silent when there is none", () => {
    // Without this part, an agentic loop (the whole history sent back each turn)
    // reads as an entry that swells, without saying whether the stable prefix is reused.
    const cached = wireTokenSummary({ ...base, inputTokens: 5000, outputTokens: 20, cachedInputTokens: 4000 });
    expect(cached).toMatch(/en cache/);
    expect(cached).toMatch(/4.000/);
    // A provider that reports nothing (openai-compat/local) doesn't invent a « 0 en cache ».
    expect(wireTokenSummary({ ...base, inputTokens: 5000, outputTokens: 20 })).not.toMatch(/en cache/);
    expect(wireTokenSummary({ ...base, inputTokens: 5000, outputTokens: 20, cachedInputTokens: 0 })).not.toMatch(/en cache/);
  });

  it("entryToText includes the token line so copy/search can find the cost", () => {
    const withUsage = entryToText({ ...base, inputTokens: 1234, outputTokens: 567 });
    expect(withUsage).toContain("entrée");
    // without usage, no token line is injected
    expect(entryToText(base)).not.toContain("entrée");
  });
});

describe("turn entries (les « échanges » par tour)", () => {
  const turn = {
    id: "d2", at: 0, type: "turn" as const, model: "gemini-3.1-flash-lite", turn: 2, ok: true,
    request: [
      { role: "assistant", content: "[tool_call browser__browser_navigate {\"url\":\"https://g.example/?q=Louis+Simon\"}]" },
      { role: "tool(c1)", content: "Page chargée : résultats pour Louis Terral", truncatedFrom: 9000 },
    ],
    msgCount: 5, toolsOffered: 80, toolNames: ["browser__browser_navigate"],
    toolChoice: "auto", text: "Voici.", toolCalls: [{ name: "run_python", args: "{\"code\":\"print(1)\"}" }],
    stopReason: "tool_calls", inputTokens: 1000, outputTokens: 50, ms: 900,
    vault: { "Louis Terral": "Adam Berthon" },
  };

  it("serializes the exchange: meta, request delta, response, tool calls, mapping", () => {
    const t = entryToText(turn);
    expect(t).toContain("tour 2 → gemini-3.1-flash-lite");
    expect(t).toContain("5 messages (+2 ce tour)");
    expect(t).toContain("80 outils offerts");
    expect(t).toContain("stop=tool_calls");
    expect(t).toContain("[assistant]");
    expect(t).toContain("(tronqué, 9000 car.)");
    expect(t).toContain("Réponse :\nVoici.");
    expect(t).toContain("→ run_python");
    expect(t).toContain("Louis Terral → Adam Berthon"); // the mapping, by default
  });

  it("le tour-par-tour porte la part mise en cache — c'est là qu'on la voit monter", () => {
    // Turn 1: nothing cached (priming). Turn 2+: the stable prefix (system + tool
    // schemas) is re-read. It's this rise, or its absence, that decides the rest.
    expect(entryToText({ ...turn, turn: 1 })).not.toContain("en cache");
    expect(entryToText({ ...turn, inputTokens: 9000, cachedInputTokens: 8000 })).toContain("en cache");
  });

  it("a FAILED turn carries the complete request dump + the error", () => {
    const t = entryToText({
      ...turn, ok: false, requestFull: true, text: undefined, toolCalls: [],
      stopReason: undefined, inputTokens: undefined, outputTokens: undefined,
      error: "google tools request failed (400): {…}",
    });
    expect(t).toContain("ÉCHEC tour 2");
    expect(t).toContain("Requête (complète)");
    expect(t).toContain("Erreur :\ngoogle tools request failed (400)");
  });

  it("« sans mapping » : no redacted→original pair survives the export", () => {
    const t = entryToText(turn, { mapping: false });
    expect(t).toContain("Louis Terral"); // the WIRE fake stays (it already left the machine)
    expect(t).not.toContain("Adam Berthon"); // the ORIGINAL never leaves the app
    expect(t).not.toContain("Mapping (redacted → original)");
  });

  it("« sans mapping » : le GABARIT et le résumé remplacent la paire — la forme, jamais la valeur", () => {
    const t = entryToText(turn, { mapping: false });
    // The per-category summary (tier A, derived from the pairs — counts only)…
    expect(t).toContain("Redaction : 1 valeur");
    // …and the shape template (tier B): case/length/separators of the ORIGINAL,
    // with none of its characters surviving.
    expect(t).toContain("Louis Terral → Xxxx Xxxxxxx");
  });
});

describe("tool FAIL entries keep their diagnostics", () => {
  it("a failed entry with a result (run_python stderr) shows BOTH error and result", () => {
    const t = entryToText({
      id: "d3", at: 0, type: "tool", name: "run_python", ok: false,
      args: "{\"code\":\"import yfinance\"}",
      result: "Erreur d'exécution :\nURLError: timed out",
      error: "exit 1 · 61000 ms",
    });
    expect(t).toContain("run_python FAIL");
    expect(t).toContain("exit 1");
    expect(t).toContain("URLError: timed out"); // the regression: this used to vanish
  });
});

describe("journalExportFor — what an avis may attach", () => {
  beforeEach(() => {
    clearDebugLog();
    setDebugCapture(true);
  });

  it("scopes to ONE conversation — par LA règle, pas par une copie du prédicat", () => {
    // Same rule as the modal (`state/debugScope.ts` `isEntryVisibleIn`): a second tab's
    // concurrent send must never ride along in a bug report about this one. This test
    // used to accept « global » — this function carried its own copy of the predicate, stuck at
    // the version from before the 11/08 hardening, so the avis carried along entries
    // the modal no longer showed (rule 9: the copy is never fixed).
    pushDebug({ type: "error", scope: "send", message: "ici" }, "c1");
    pushDebug({ type: "error", scope: "send", message: "ailleurs" }, "c2");
    pushDebug({ type: "error", scope: "app", message: "global" });
    const out = logExportFor("c1");
    expect(out).toContain("ici");
    expect(out).not.toContain("global");
    expect(out).not.toContain("ailleurs");
  });

  it("emporte le BROUILLON quand l'avis part d'un chat pas encore créé", () => {
    // The old copy excluded `DRAFT_CONV` (`conv != null` and `!== convId`): a bug
    // report about a document dropped before the first send used to leave EMPTY, precisely
    // in the case where the user has something to report.
    pushDebug({ type: "tool", name: "document-redaction", ok: true, args: "devis.pdf" }, DRAFT_CONV);
    expect(logExportFor(null)).toContain("devis.pdf");
    expect(logExportFor("c1")).not.toContain("devis.pdf");
  });

  it("strips the redacted → réel mapping — the only form safe to send", () => {
    // The wire text already left the machine; the mapping never has. This is the whole
    // reason the avis attaches this export and not the full one.
    pushDebug(
      { type: "wire", model: "gpt-5", text: "Bonjour [PERSON1]", vault: { "[PERSON1]": "Camille Riol" } },
      "c1",
    );
    const out = logExportFor("c1");
    expect(out).toContain("[PERSON1]");
    expect(out).not.toContain("Camille Riol");
  });

  it("is empty when nothing was captured, so the modal has nothing to offer", () => {
    setDebugCapture(false);
    pushDebug({ type: "error", scope: "send", message: "perdu" }, "c1");
    expect(logExportFor("c1")).toBe("");
  });
});
