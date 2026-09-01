import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  pushDebug,
  getDebugLog,
  clearDebugLog,
  setDebugCapture,
  attachDebugStore,
  adoptDraftDebug,
  DRAFT_CONV,
  type DebugStore,
} from "./debug";
import { logWireMessage } from "./wireTrace";
import { isEntryVisibleIn } from "./debugScope";

/**
 * The Debug-Log buffer is scoped PER CONVERSATION: every entry is stamped with the
 * `conv` it was emitted for (at emit time, so concurrent per-tab turns never interleave),
 * and the renderer filters on it. These pin the stamping + the conversation-scoped clear.
 */
describe("debug log — per-conversation scoping", () => {
  beforeEach(() => {
    clearDebugLog();
    setDebugCapture(true);
  });

  it("stamps each entry with the conversation passed to pushDebug", () => {
    pushDebug({ type: "error", scope: "s", message: "a" }, "c1");
    pushDebug({ type: "error", scope: "s", message: "b" }, "c2");
    pushDebug({ type: "error", scope: "s", message: "g" }); // app-level, no conv
    const log = getDebugLog();
    expect(log.map((e) => e.conv)).toEqual(["c1", "c2", undefined]);
  });

  it("a wire entry carries its conversation too", () => {
    logWireMessage({ model: "gpt", text: "bonjour", convId: "c9" });
    expect(getDebugLog().at(-1)?.conv).toBe("c9");
  });

  it("filtering by conversation (isEntryVisibleIn, the modal's rule) keeps ONLY that conv", () => {
    pushDebug({ type: "error", scope: "s", message: "c1" }, "c1");
    pushDebug({ type: "error", scope: "s", message: "c2" }, "c2");
    pushDebug({ type: "error", scope: "s", message: "global" });
    // Calls THE rule (`debugScope.ts`) instead of retranscribing it: a copy here has
    // exactly the value of a comment — it would keep passing after a
    // hardening it's supposed to protect.
    const forC1 = getDebugLog().filter((e) => isEntryVisibleIn(e, "c1"));
    // "global" is NO LONGER part of it: an unattributed entry belongs to no
    // conversation, so it shows in none (12/08 — see `debugScope.test.ts`).
    expect(forC1.map((e) => e.type === "error" && e.message)).toEqual(["c1"]);
    // And c2's journal doesn't show c1's either: it's the same rule seen from
    // the other side, and that's what "switching conversation changes the journal" means.
    const forC2 = getDebugLog().filter((e) => isEntryVisibleIn(e, "c2"));
    expect(forC2.map((e) => e.type === "error" && e.message)).toEqual(["c2"]);
  });

  it("clearDebugLog(convId) drops ONLY that conversation's entries", () => {
    pushDebug({ type: "error", scope: "s", message: "c1" }, "c1");
    pushDebug({ type: "error", scope: "s", message: "c2" }, "c2");
    pushDebug({ type: "error", scope: "s", message: "global" });
    clearDebugLog("c1");
    expect(getDebugLog().map((e) => e.conv)).toEqual(["c2", undefined]);
  });

  it("clearDebugLog() with no arg still wipes everything", () => {
    pushDebug({ type: "error", scope: "s", message: "c1" }, "c1");
    pushDebug({ type: "error", scope: "s", message: "global" });
    clearDebugLog();
    expect(getDebugLog()).toHaveLength(0);
  });
});

/**
 * The DRAFT: a file dropped on a NEW chat works for a conversation that
 * doesn't exist yet. These cases pin the original bug (journal from 11/08/2026): the
 * drop's OCR/redaction entries went out with no `conv`, so they showed in EVERY
 * conversation — and with the ring persisted, forever.
 */
describe("debug log — le brouillon (chat pas encore créé)", () => {
  beforeEach(() => {
    clearDebugLog();
    setDebugCapture(true);
  });

  it("une entrée du brouillon ne s'affiche JAMAIS dans une autre conversation", () => {
    pushDebug({ type: "tool", name: "document-redaction", ok: true }, DRAFT_CONV);
    // La vue d'une conversation existante : le brouillon n'y est pas.
    expect(getDebugLog().filter((e) => isEntryVisibleIn(e, "c1"))).toHaveLength(0);
    // La vue d'un chat neuf (pas d'id) : il y est.
    expect(getDebugLog().filter((e) => isEntryVisibleIn(e, null))).toHaveLength(1);
  });

  it("le premier envoi ADOPTE le brouillon — les entrées suivent la conversation créée", () => {
    pushDebug({ type: "tool", name: "OCR · docTR (latin)", ok: true }, DRAFT_CONV);
    pushDebug({ type: "tool", name: "document-redaction", ok: true }, DRAFT_CONV);
    pushDebug({ type: "error", scope: "s", message: "autre fil" }, "c-autre");
    adoptDraftDebug("c-nouvelle");
    const forNew = getDebugLog().filter((e) => isEntryVisibleIn(e, "c-nouvelle"));
    expect(forNew).toHaveLength(2);
    // Nothing stayed orphaned on the draft, and the other thread absorbed nothing.
    expect(getDebugLog().some((e) => e.conv === DRAFT_CONV)).toBe(false);
    expect(getDebugLog().filter((e) => isEntryVisibleIn(e, "c-autre"))).toHaveLength(1);
  });

  it("adoptDraftDebug sans brouillon est un no-op (pas de notification inutile)", () => {
    pushDebug({ type: "error", scope: "s", message: "x" }, "c1");
    const before = getDebugLog();
    adoptDraftDebug("c2");
    expect(getDebugLog()).toBe(before); // same reference: nothing copied
  });
});

/**
 * Persistence: the ring's ONE allowed sink is `attachDebugStore` (per-account
 * encrypted DB behind `DbHost.saveDebugJournal`). These pin: hydration, the
 * cross-account RESET (account A's entries never linger into B's ring), the
 * debounced whole-buffer save, and the graceful memory-only degradation.
 */
describe("debug log — persistence via attachDebugStore", () => {
  const makeStore = (initial: string | null = null): DebugStore & { saved: string[] } => {
    const s = {
      saved: [] as string[],
      save: async (json: string) => {
        s.saved.push(json);
      },
      load: async () => initial,
    };
    return s;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    setDebugCapture(true);
  });
  afterEach(async () => {
    await attachDebugStore(null); // detach so other suites stay memory-only
    clearDebugLog();
    vi.useRealTimers();
  });

  it("hydrates the ring from the stored blob and keeps ids collision-free", async () => {
    const stored = JSON.stringify([
      { id: "d7", at: 1, conv: "c1", type: "error", scope: "s", message: "persisted" },
    ]);
    await attachDebugStore(makeStore(stored));
    expect(getDebugLog().map((e) => e.type === "error" && e.message)).toEqual(["persisted"]);
    const newId = pushDebug({ type: "error", scope: "s", message: "fresh" });
    expect(Number(newId.slice(1))).toBeGreaterThan(7); // never reuses a hydrated id
  });

  /**
   * The symptom reported on 12/08: "switching conversation leaves the debug journal
   * looking the same". Its cause wasn't the emitters (they all stamp) but
   * the PERSISTED ring: a blob written before stamping was complete contains
   * entries with no `conv`, and the scoping rule then showed them in EVERY conversation.
   * Persisted ⇒ forever, and capped at 200 ⇒ they took the place of the real ones.
   */
  it("jette les entrées non attribuées du blob, et ré-écrit le blob nettoyé UNE fois", async () => {
    const store = makeStore(
      JSON.stringify([
        { id: "d1", at: 1, type: "error", scope: "s", message: "héritée, sans conv" },
        { id: "d2", at: 2, conv: "c1", type: "error", scope: "s", message: "de c1" },
        // An unattributed entry CARRYING real data: it was already hidden, but it
        // stayed on disk. It goes too.
        { id: "d3", at: 3, type: "tool", name: "document-redaction", ok: true, pairs: [{ token: "F", original: "Vrai Nom" }] },
      ]),
    );
    await attachDebugStore(store);
    expect(getDebugLog().map((e) => e.conv)).toEqual(["c1"]);
    // The cleanup is WRITTEN: without that, a journal nobody feeds anymore would keep them.
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).not.toContain("Vrai Nom");
    expect(JSON.parse(store.saved[0])).toHaveLength(1);
  });

  it("un blob DÉJÀ propre n'est pas ré-écrit à l'ouverture", async () => {
    const store = makeStore(
      JSON.stringify([{ id: "d1", at: 1, conv: "c1", type: "error", scope: "s", message: "ok" }]),
    );
    await attachDebugStore(store);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.saved).toHaveLength(0);
  });

  it("RESETS the ring on attach — an account switch never carries entries across", async () => {
    pushDebug({ type: "error", scope: "s", message: "account-A" });
    await attachDebugStore(makeStore(null)); // account B has nothing persisted
    expect(getDebugLog()).toHaveLength(0);
  });

  it("a corrupt blob hydrates to empty (fail closed), never throws", async () => {
    pushDebug({ type: "error", scope: "s", message: "before" });
    await attachDebugStore(makeStore("{not json"));
    expect(getDebugLog()).toHaveLength(0);
  });

  it("push + clear save the WHOLE buffer, debounced", async () => {
    const store = makeStore(null);
    await attachDebugStore(store);
    pushDebug({ type: "error", scope: "s", message: "one" }, "c1");
    pushDebug({ type: "error", scope: "s", message: "two" }, "c1");
    expect(store.saved).toHaveLength(0); // debounced — nothing yet
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.saved).toHaveLength(1); // both pushes coalesced into one save
    expect(JSON.parse(store.saved[0])).toHaveLength(2);
    clearDebugLog("c1");
    await vi.advanceTimersByTimeAsync(1000);
    expect(JSON.parse(store.saved.at(-1)!)).toHaveLength(0);
  });

  it("without a store (preview / signed out) mutations stay memory-only", async () => {
    await attachDebugStore(null);
    pushDebug({ type: "error", scope: "s", message: "mem" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(getDebugLog()).toHaveLength(1); // no throw, no sink
  });
});
