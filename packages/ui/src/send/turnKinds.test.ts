import { describe, it, expect } from "vitest";
import { convKindsFromSpans } from "./redactionOptions";
import { deriveRedactedSpans } from "./sendAnalytics";
import type { RedactionMatch } from "@openmasq/redact";

/**
 * `store.sendMessage` builds `convKinds` from the conversation SNAPSHOT — taken before the
 * user's message exists — then hands `kinds` to the agent loop, which labels each value's
 * category in the Debug Log's redacted↔original mapping.
 *
 * On the FIRST message the snapshot has no messages, so `convKinds` alone is `{}` and this
 * turn's own values have no category. The store therefore merges this turn's
 * `redactedSpans` into `turnKinds` before the loop reads it. This reproduces that
 * composition — the snapshot is the input that is easy to reach for and quietly wrong.
 */
const matches = (...m: { value: string; category: string }[]): RedactionMatch[] =>
  m.map((x) => ({ type: "secret", value: x.value, placeholder: "", category: x.category })) as RedactionMatch[];

/** The store's composition, mirrored: prior turns ⊕ the OTHER passes ⊕ this turn's spans. */
const turnKindsOf = (
  convMessages: unknown[],
  thisTurn: RedactionMatch[],
  otherPasses: RedactionMatch[] = [],
) => {
  const out: Record<string, string> = { ...convKindsFromSpans({ messages: convMessages } as never) };
  for (const sp of deriveRedactedSpans(otherPasses)) out[sp.value] = sp.kind;
  for (const sp of deriveRedactedSpans(thisTurn)) out[sp.value] = sp.kind;
  return out;
};

describe("turnKinds — this message's spans must reach the agent loop", () => {
  it("FIRST message: this turn's value carries its category", () => {
    // The snapshot the send starts from: the user's message does not exist yet.
    const kinds = turnKindsOf([], matches({ value: "Karl Studio", category: "ORG" }));
    expect(kinds).toEqual({ "Karl Studio": "company" });
  });

  it("the conversation snapshot ALONE is empty on the first message", () => {
    expect(convKindsFromSpans({ messages: [] } as never)).toEqual({});
  });

  it("a MÉMOIRE / document-layer value carries its category too", () => {
    // Those passes mutate the shared vault but own no message, so nothing recorded their
    // category and the value reached the loop as « sensitive » — the person filed as info.
    const kinds = turnKindsOf(
      [],
      matches({ value: "Karl Studio", category: "ORG" }),
      matches({ value: "Stephane", category: "PERSON" }),
    );
    expect(kinds).toEqual({ "Karl Studio": "company", Stephane: "name" });
  });

  it("this turn's own span WINS over an extra pass claiming the same value", () => {
    const kinds = turnKindsOf(
      [],
      matches({ value: "Stephane", category: "PERSON" }),
      matches({ value: "Stephane", category: "SENSITIVE" }),
    );
    expect(kinds.Stephane).toBe("name");
  });

  it("prior turns still count (the merge adds to them, never replaces them)", () => {
    const prior = [{ redactedSpans: [{ value: "Léa Morvan", kind: "name" }] }];
    const kinds = turnKindsOf(prior, matches({ value: "Karl Studio", category: "ORG" }));
    expect(kinds).toEqual({ "Léa Morvan": "name", "Karl Studio": "company" });
  });
});
