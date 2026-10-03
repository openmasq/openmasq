import { describe, expect, it } from "vitest";
import { pseudonymize, type Detection } from "@openmasq/redact";
import { pdfReplacements } from "@openmasq/redact/pdf-redact";
import { docScrubKinds, docScrubVault } from "./docScrubVault";

const NAME = "Ninon Verdolini";
const EARLY = "Jules Ambert";
const LINE = "Clause sans donnée personnelle, reprise pour le volume du document.";

/** A name present early, and one that FIRST appears deep in the document. */
const FAR = 60_000;
const text = [
  `Entre ${EARLY} et la société.`,
  ...Array.from({ length: Math.ceil(FAR / LINE.length) }, () => LINE),
  `Signé par ${NAME}.`,
].join("\n");

const ner = (t: string): Promise<Detection[]> =>
  Promise.resolve([EARLY, NAME].filter((n) => t.includes(n)).map((value) => ({ value, category: "name" })));

// Main's half (a vault holding the name ⇒ the scrubbed DOCX masks it) is pinned beside
// the scrub: `apps/desktop/src/main/ipc/documentScrub.fullText.test.ts`.
describe("the vault the library's masked copy gets covers the WHOLE document", () => {
  it("a name the send did not detect is in it — the send's vault alone did not have it", async () => {
    expect(text.indexOf(NAME)).toBeGreaterThan(FAR);
    // A REUSED document is not re-detected by the send: its vault only holds what the send
    // saw elsewhere (here, the typed text naming the early party).
    const sendVault: Record<string, string> = {};
    await pseudonymize(`Résume le contrat avec ${EARLY}.`, { vault: sendVault, detectLocal: ner, numbers: false });
    expect(Object.values(sendVault)).toContain(EARLY);
    expect(Object.values(sendVault)).not.toContain(NAME); // the hole, reproduced
    // The drop-time map runs over the whole text (`redactAttachment.ts`).
    const { replacements } = await pdfReplacements(text, (t, _s, vault) =>
      pseudonymize(t, { vault, detectLocal: ner, numbers: false }),
    );
    const vault = docScrubVault(sendVault, replacements);
    expect(Object.values(vault)).toContain(NAME);
    expect(Object.values(vault).filter((v) => v === EARLY)).toHaveLength(1); // one fake per value
    expect(docScrubKinds({ convKinds: {}, extraKinds: {} }, replacements)[NAME]).toBe("name");
  });
});

describe("docScrubVault — additive, never a value dropped", () => {
  it("keeps the send's fake for a value it already has, and never mutates its input", () => {
    const vault = { "Paul Durand": EARLY };
    const out = docScrubVault(vault, [{ real: EARLY, fake: "Autre Faux", tone: "x" }, { real: NAME, fake: "Léa Morin", tone: "x" }]);
    expect(out).toEqual({ "Paul Durand": EARLY, "Léa Morin": NAME });
    expect(vault).toEqual({ "Paul Durand": EARLY });
  });

  it("a fake already owned by ANOTHER value gets a variant rather than being skipped", () => {
    const out = docScrubVault({ "Léa Morin": EARLY }, [{ real: NAME, fake: "Léa Morin", tone: "x" }]);
    expect(out["Léa Morin"]).toBe(EARLY);
    expect(out["Léa Morin (2)"]).toBe(NAME);
  });

  it("no drop-time map → the send's vault unchanged", () => {
    const vault = { a: "b" };
    expect(docScrubVault(vault, undefined)).toBe(vault);
  });
});
