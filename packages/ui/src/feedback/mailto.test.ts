// The mailto transport's one hard property: whatever the draft holds, the URL stays
// small enough to survive the trip through the OS to the mail client — a 20 000-char
// journal must arrive truncated WITH a marker, never break the open.
import { describe, it, expect } from "vitest";
import { feedbackMailBody, feedbackMailto, MAILTO_MAX_BODY } from "./mailto";
import type { Feedback } from "./feedback";

const BASE: Feedback = { category: "bug", message: "Le PDF ne s'ouvre pas.", mood: "meh" };

describe("feedbackMailto", () => {
  it("opens on the given address with the category in the subject", () => {
    const url = feedbackMailto(BASE, "avis@example.org", "OpenMasq");
    expect(url.startsWith("mailto:avis@example.org?")).toBe(true);
    expect(decodeURIComponent(url)).toContain("[bug] Avis OpenMasq");
  });

  it("keeps the message first and intact", () => {
    expect(feedbackMailBody(BASE).startsWith("Le PDF ne s'ouvre pas.")).toBe(true);
  });

  it("renders only the context fields that exist", () => {
    const body = feedbackMailBody({
      ...BASE,
      context: { version: "0.8.0", os: "darwin 24.4.0 (arm64)" },
    });
    expect(body).toContain("Version : 0.8.0");
    expect(body).toContain("OS : darwin");
    expect(body).not.toContain("Écran");
  });

  it("caps the body and says so when the journal overflows", () => {
    const body = feedbackMailBody({ ...BASE, journal: "x".repeat(20_000) });
    expect(body.length).toBeLessThanOrEqual(MAILTO_MAX_BODY);
    expect(body).toContain("tronqué");
    expect(body.startsWith("Le PDF ne s'ouvre pas.")).toBe(true);
  });

  it("never emits a literal '+' for a space", () => {
    const url = feedbackMailto({ ...BASE, message: "deux mots" }, "a@b.c", "P");
    expect(url).not.toContain("+");
    expect(decodeURIComponent(url)).toContain("deux mots");
  });
});
