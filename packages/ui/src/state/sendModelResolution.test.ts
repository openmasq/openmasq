import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Re-anchored: the send body now lives in send/sendOrchestrator.ts
// (moved AS A WHOLE from store.ts — same code, different file).
const STORE = readFileSync(join(__dirname, "../send/sendOrchestrator.ts"), "utf8");

/**
 * WHY THIS TEST EXISTS. The send path resolved its target conversation from
 * `conversations` — the array captured when the callback was last rendered — while the
 * rest of the store already read `conversationsRef.current` for exactly this reason.
 *
 * From the welcome screen a prompt card creates the conversation and sends in ONE
 * handler, so the captured array is a beat behind and the lookup missed. The `??`
 * fallback then answered on DEFAULT_MODEL_ID while the composer and the sidebar still
 * showed the model the user had picked: the reply came back from another model with no
 * error anywhere. A stale-read bug is invisible until someone reports the wrong answer,
 * which is why it is pinned mechanically rather than left to review.
 */
describe("send path — conversation lookup", () => {
  it("reads the LIVE conversation list, never the captured render value", () => {
    // Anchored on the fallback, which appears exactly once in the file.
    const lookup = /const conv =\s*(\S+?)\.find\(\(c\) => c\.id === convId\) \?\?\s*newConversation\(DEFAULT_MODEL_ID\)/;
    const m = STORE.match(lookup);

    expect(m, "the send-path conversation lookup moved — re-anchor this test").not.toBeNull();
    expect(m![1]).toBe("conversationsRef.current");
  });

  it("still falls back to a default rather than throwing on an unknown id", () => {
    // The fallback is the safety net for a send against a deleted conversation; losing
    // it would turn a stale id into a crash instead of a recoverable send.
    expect(STORE).toContain("newConversation(DEFAULT_MODEL_ID)");
  });
});
