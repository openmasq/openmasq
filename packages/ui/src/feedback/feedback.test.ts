import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import {
  buildFeedback,
  canSendFeedback,
  redactionProblemDraft,
  debugLogDraft,
  messageFeedbackDraft,
  EMPTY_FEEDBACK,

  MAX_FEEDBACK_LOG,
  type FeedbackDraft,
} from "./feedback";
import { feedbackCategories, feedbackMoods } from "./vocabulary";

/* The ids and order don't depend on any language — the French catalogue is enough. */
const fr = getMessages("fr");

const draft = (p: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  ...EMPTY_FEEDBACK,
  mood: "love",
  message: "ça marche très bien",
  ...p,
});

describe("canSendFeedback", () => {
  it("needs a mood AND a message of substance", () => {
    expect(canSendFeedback(draft())).toBe(true);
    expect(canSendFeedback(draft({ mood: null }))).toBe(false);
    expect(canSendFeedback(draft({ message: "ok" }))).toBe(false); // <= 2 chars
    expect(canSendFeedback(draft({ message: "   " }))).toBe(false);
  });

  // The friction this removes: someone who just hit a bug and attached their logs
  // should not have to rate their mood before the button unlocks.
  it("drops the mood requirement once the journal actually rides", () => {
    const withLog = draft({ mood: null, journal: "wire…", attachLog: true });
    expect(canSendFeedback(withLog)).toBe(true);
    // …but a message of substance is still required — the journal is context, not a report.
    expect(canSendFeedback({ ...withLog, message: "ok" })).toBe(false);
  });

  it("does NOT drop it when the journal is present but switched OFF", () => {
    // The toggle is the user's decision to send it; an unsent journal signals nothing.
    expect(canSendFeedback(draft({ mood: null, journal: "wire…", attachLog: false }))).toBe(false);
    expect(canSendFeedback(draft({ mood: null, journal: "   ", attachLog: true }))).toBe(false);
  });
});

describe("buildFeedback", () => {
  const ctx = { version: "4.8.0", section: "chats" };

  it("returns null for an unsendable draft (the gate can't be bypassed)", () => {
    expect(buildFeedback(draft({ mood: null }), ctx)).toBeNull();
    expect(buildFeedback(draft({ message: "" }), ctx)).toBeNull();
  });

  it("OMITS the mood key entirely on a journal report, never sends a null", () => {
    // The server would have to interpret a `mood: null`; absent is unambiguous.
    const f = buildFeedback(draft({ mood: null, journal: "wire…", attachLog: true }), ctx);
    expect(f).not.toBeNull();
    expect("mood" in f!).toBe(false);
    expect(f!.journal).toBe("wire…");
  });

  it("trims the message and keeps the enums", () => {
    const f = buildFeedback(draft({ message: "  il manque X  ", category: "idea" }), ctx);
    expect(f).toMatchObject({ mood: "love", category: "idea", message: "il manque X" });
  });

  // Identity comes from the verified token server-side (rule 7), so the payload
  // must never carry an e-mail — there is no field to carry one.
  it("never carries an e-mail", () => {
    expect(buildFeedback(draft(), ctx)).not.toHaveProperty("email");
  });

  // The modal promises "Jamais le contenu de vos conversations" — these pin it.
  it("attaches ONLY the named technical fields as context", () => {
    const full = {
      version: "4.8.0",
      section: "chats",
      os: "darwin 24.4.0 (arm64)",
      channel: "staging",
      model: "gpt-5",
      level: "strict",
      analyticsId: "6f1e4c2a-0b7d-4a91-9f33-2c8e5a71b0d4",
    };
    const f = buildFeedback(draft(), full);
    expect(f?.context).toEqual(full);
    expect(Object.keys(f?.context ?? {}).sort()).toEqual(
      ["analyticsId", "channel", "level", "model", "os", "section", "version"].sort(),
    );
  });

  it("l'ID PostHog voyage avec le contexte — et tombe avec lui", () => {
    // Request from 12/08: the report's id must be THE SAME as PostHog's, so
    // feedback joins the machine's telemetry. The anonymous↔identified junction
    // only exists under the "contexte technique" toggle: unchecked, nothing goes out.
    const withId = buildFeedback(draft(), { ...ctx, analyticsId: "anon-m3k9dz1a4kx" });
    expect(withId?.context?.analyticsId).toBe("anon-m3k9dz1a4kx");
    const off = buildFeedback(draft({ attachContext: false }), { ...ctx, analyticsId: "anon-m3k9dz1a4kx" });
    expect(JSON.stringify(off)).not.toContain("anon-m3k9dz1a4kx");
  });

  it("cannot smuggle a field the choke point does not name", () => {
    // `buildFeedback` assembles the context field by field precisely so that a caller
    // handing it more (a conversation excerpt, a prompt, a file name) changes nothing.
    const f = buildFeedback(draft(), { ...ctx, conversation: "tout mon fil" } as never);
    expect(JSON.stringify(f)).not.toContain("tout mon fil");
  });

  it("keeps every context field independent — a host that answers half still helps", () => {
    const f = buildFeedback(draft(), { version: "4.8.0", channel: "production" });
    expect(f?.context).toEqual({ version: "4.8.0", channel: "production" });
  });

  it("omits context entirely when the user turns the toggle off", () => {
    const f = buildFeedback(draft({ attachContext: false }), ctx);
    expect(f).not.toHaveProperty("context");
  });

  it("carries nothing beyond the declared fields", () => {
    const f = buildFeedback(draft(), ctx);
    expect(Object.keys(f!).sort()).toEqual(["category", "context", "message", "mood"]);
  });

  // A PRESENT journal goes out by default (13/08 — permanent capture + the modal's
  // pre-checked box); only an EXPLICIT refusal (`attachJournal: false`) removes it.
  it("attache un journal présent par défaut ; seul un refus explicite le retire", () => {
    const withLog = draft({ journal: "wire: bonjour [PERSON1]", attachLog: true });
    expect(buildFeedback(withLog, ctx)?.journal).toBe("wire: bonjour [PERSON1]");
    // Toggle never touched (undefined) ⇒ also goes out — that is the pre-checking.
    expect(buildFeedback(draft({ journal: "wire" }), ctx)?.journal).toBe("wire");
    expect(
      buildFeedback(draft({ journal: "wire", attachLog: false }), ctx),
    ).not.toHaveProperty("journal");
    expect(buildFeedback(draft({ attachLog: true }), ctx)).not.toHaveProperty("journal");
  });

  it("re-caps an over-cap journal at the choke point, keeping the TAIL (recent entries)", () => {
    const long = "x".repeat(MAX_FEEDBACK_LOG) + "FIN";
    const f = buildFeedback(draft({ journal: long, attachLog: true }), ctx);
    expect(f?.journal).toHaveLength(MAX_FEEDBACK_LOG);
    expect(f?.journal?.endsWith("FIN")).toBe(true);
  });
});

describe("vocabularies", () => {
  it("expose stable ids", () => {
    expect(feedbackMoods(fr).map((m) => m.id)).toEqual(["love", "ok", "meh"]);
    expect(feedbackCategories(fr).map((c) => c.id)).toEqual(["idea", "bug", "love", "other"]);
  });
});

describe("redactionProblemDraft", () => {
  it("prefills a bug draft phrased for the surface + kind, mood left to the user", () => {
    const d = redactionProblemDraft("document", fr, "e-mail");
    expect(d.category).toBe("bug");
    expect(d.mood).toBeNull(); // sentiment is never prefilled
    expect(d.message).toContain("dans un document");
    expect(d.message).toContain("(type : e-mail)");
    // The template warns against pasting the real value (the privacy promise).
    expect(d.message).toContain("sans coller la valeur réelle");
    expect(redactionProblemDraft("reponse", fr).message).toContain("dans une réponse");
    expect(redactionProblemDraft("message", fr).message).not.toContain("type :");
  });

  it("is NOT sendable as-is — the user must still pick a mood", () => {
    expect(canSendFeedback(redactionProblemDraft("message", fr))).toBe(false);
  });
});

describe("debugJournalDraft", () => {
  it("prefills a bug draft with the journal attached (toggle ON), mood left to the user", () => {
    const d = debugLogDraft("redact → gpt\nBonjour [PERSON1]", fr);
    expect(d.category).toBe("bug");
    expect(d.mood).toBeNull();
    expect(d.attachLog).toBe(true);
    expect(d.journal).toBe("redact → gpt\nBonjour [PERSON1]");
    // No mood needed (the journal rides) — only a real message is still missing,
    // since the template ends on the prompt the user has to answer.
    expect(canSendFeedback(d)).toBe(true);
    expect(canSendFeedback({ ...d, message: "" })).toBe(false);
  });

  it("truncates tail-first at the cap so the PREVIEW equals what would be sent", () => {
    const d = debugLogDraft("a".repeat(MAX_FEEDBACK_LOG + 50) + "RECENT", fr);
    expect(d.journal).toHaveLength(MAX_FEEDBACK_LOG);
    expect(d.journal?.endsWith("RECENT")).toBe(true);
  });
});

describe("messageFeedbackDraft — the action-row button", () => {
  it("arrives ready to send: journal attached, Bug, no mood needed", () => {
    const d = messageFeedbackDraft(fr, "redact → gpt\nBonjour [PERSON1]");
    expect(d.category).toBe("bug");
    expect(d.mood).toBeNull();
    expect(d.attachLog).toBe(true);
    expect(canSendFeedback(d)).toBe(true);
  });

  it("still opens WITHOUT a journal (debug mode off) — it just isn't a bug report", () => {
    // The button must never tell a user to go enable a setting before they can speak.
    const d = messageFeedbackDraft(fr, "");
    expect(d.journal).toBeUndefined();
    expect(d.attachLog).toBeUndefined();
    expect(d.category).toBe(EMPTY_FEEDBACK.category);
    // …and with no journal riding, the mood is mandatory again.
    expect(canSendFeedback(d)).toBe(false);
    expect(canSendFeedback({ ...d, mood: "meh" })).toBe(true);
  });

  it("never quotes the reply — only names it", () => {
    const d = messageFeedbackDraft(fr, "wire…");
    expect(d.message).toBe("À propos de cette réponse : ");
  });

  it("caps an over-long journal tail-first, like every other entry point", () => {
    const d = messageFeedbackDraft(fr, "a".repeat(MAX_FEEDBACK_LOG + 50) + "RECENT");
    expect(d.journal).toHaveLength(MAX_FEEDBACK_LOG);
    expect(d.journal?.endsWith("RECENT")).toBe(true);
  });
});
