import { describe, expect, it } from "vitest";
import { partialMaskedChunks } from "./partialPreview";

const rep = (real: string, fake: string) => ({ real, fake, tone: "violet", kind: "name" });
const shown = (chunks: { text: string }[]) => chunks.map((c) => c.text).join("");

describe("partialMaskedChunks — the part already masked, and nothing past it", () => {
  const text = "Emprunteur : Jean Dupont. Garant : Marie Curie. Fin du contrat.";

  it("shows the masked prefix as FAKES, never the real value", () => {
    const out = partialMaskedChunks(text, { covered: 26, scanned: 40, replacements: [rep("Jean Dupont", "Luc Martin")] });
    expect(shown(out)).toBe("Emprunteur : Luc Martin. ");
    expect(shown(out)).not.toContain("Jean");
    expect(out.find((c) => c.mark)?.mark).toMatchObject({ real: "Jean Dupont", revealed: false });
    expect(out.find((c) => c.mark)?.mark?.fake).toBeUndefined(); // no real value put in the DOM
  });

  it("stops the plain text at `covered`: the overlap not yet searched in full is not shown", () => {
    const out = partialMaskedChunks(text, { covered: 30, scanned: 40, replacements: [rep("Jean Dupont", "Luc Martin")] });
    // Text past offset 30 (« nt : Marie… ») is withheld — Marie Curie was not found yet.
    expect(shown(out)).toBe("Emprunteur : Luc Martin. Gara");
    expect(shown(out)).not.toContain("Marie");
  });

  it("never splits a mark that straddles `covered`: the fake shows whole", () => {
    // `covered` falls inside « Jean Dupont » (offsets 13–24).
    const out = partialMaskedChunks(text, { covered: 18, scanned: 40, replacements: [rep("Jean Dupont", "Luc Martin")] });
    expect(shown(out)).toBe("Emprunteur : Luc Martin");
    expect(shown(out)).not.toContain("Jean");
  });

  it("nothing scanned yet → nothing shown", () => {
    expect(partialMaskedChunks(text, { covered: 0, scanned: 0, replacements: [] })).toEqual([]);
  });
});

describe("partialMaskedChunks — the run's WHOLE map so far, over the whole shown part", () => {
  it("a name first detected in chunk 3 is masked where it already appears in the shown chunk 1", async () => {
    const { pdfReplacements } = await import("@openmasq/redact/pdf-redact");
    const filler = "lorem ipsum ".repeat(600); // ~7.2k: one chunk each
    // Chunk 1 mentions « Zoé Varga » in a context the detector misses; chunk 3 names her.
    const text = `Pièce 1 : Zoé Varga. ${filler}\n${filler}\n${filler}\nEmprunteuse : Zoé Varga.`;
    const ticks: Parameters<typeof partialMaskedChunks>[1][] = [];
    await pdfReplacements(
      text,
      async (chunk) => ({
        text: chunk,
        matches: chunk.includes("Emprunteuse") ? [{ type: "secret", value: "Zoé Varga", placeholder: "Ines Morel", category: "NAME" }] : [],
      }),
      { onProgress: (_d, _t, p) => ticks.push(p) },
    );
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    // Before the chunk naming her: chunk 1 shows her in clear (the stated provisional residual).
    expect(shown(partialMaskedChunks(text, ticks[0]))).toContain("Zoé Varga");
    // After it: the SAME shown prefix (chunk 1 included) is re-painted with the cumulative map.
    const after = partialMaskedChunks(text, ticks[ticks.length - 1]);
    expect(shown(after).startsWith("Pièce 1 : Ines Morel.")).toBe(true);
    expect(shown(after)).not.toContain("Zoé Varga");
  });
});
