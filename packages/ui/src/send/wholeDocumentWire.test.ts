import { describe, expect, it } from "vitest";
import { pseudonymize, type Detection } from "@openmasq/redact";
import { pdfReplacements } from "@openmasq/redact/pdf-redact";
import { buildFoldedPayload } from "./foldPayload";
import { appendReusedDocsWire } from "./reusedDocsWire";

// A document is sent WHOLE, and masked whole: a value deep in the document (past where the
// wire used to stop, 50,000 characters) rides the wire PRESENT — as its fake, never in clear.
// Both paths a folded document takes are pinned: detected by the send, or reused from its
// drop-time map (which covers the whole text, `pages/ChatWorkspace/redactAttachment.ts`).

const NAME = "Ninon Verdolini";
const LINE = "Clause sans donnée personnelle, reprise pour le volume du document.";
const AT = 120_000;
const doc = [
  ...Array.from({ length: Math.ceil(AT / (LINE.length + 1)) }, () => LINE),
  `Signé par ${NAME}, bailleresse.`,
  "Fin du document.",
].join("\n");

const ner = (t: string): Promise<Detection[]> =>
  Promise.resolve(t.includes(NAME) ? [{ value: NAME, category: "name" }] : []);

describe("a value at character 120,000 of a document", () => {
  it("is folded into the wire (no cut, no truncation marker)", () => {
    expect(doc.indexOf(NAME)).toBeGreaterThan(AT);
    const r = buildFoldedPayload("Résume.", [{ name: "bail.txt", text: doc }], {}, "");
    expect(r.modelText).toContain("Fin du document.");
    expect(r.modelText).not.toContain("(truncated)");
  });

  it("DETECTED by the send: present on the wire as its fake, never in clear", async () => {
    const r = buildFoldedPayload("Résume.", [{ name: "bail.txt", text: doc }], {}, "");
    const vault: Record<string, string> = {};
    const wire = await pseudonymize(r.modelText, { vault, detectLocal: ner, numbers: false });
    const fake = Object.keys(vault).find((k) => vault[k] === NAME);
    expect(fake).toBeTruthy();
    expect(wire.text).not.toContain(NAME);
    expect(wire.text.indexOf(fake!)).toBeGreaterThan(AT);
    expect(wire.text).toContain("Fin du document.");
  });

  it("REUSED from the drop-time map: present on the wire as its fake, never in clear", async () => {
    const { replacements } = await pdfReplacements(doc, (t, _s, vault) =>
      pseudonymize(t, { vault, detectLocal: ner, numbers: false }),
    );
    const reps = replacements.map((x) => ({ ...x, tone: x.tone ?? "violet" }));
    const r = buildFoldedPayload("Résume.", [{ name: "bail.txt", text: doc }], { docReplacements: { "bail.txt": reps } }, "");
    expect(r.reuseParts).toHaveLength(1);
    const wire = appendReusedDocsWire({ text: "Résume.", matches: [] }, r.reuseParts, { ...r.vaultPreload }, undefined);
    const fake = reps.find((x) => x.real === NAME)?.fake;
    expect(fake).toBeTruthy();
    expect(wire.text).not.toContain(NAME);
    expect(wire.text.indexOf(fake!)).toBeGreaterThan(AT);
    expect(wire.text).toContain("Fin du document.");
  });
});
