import { describe, it, expect, vi } from "vitest";
import { loadReattachFile } from "./reattach";
import type { Host } from "../../host";

/** A minimal Host whose db.loadFile returns `loaded` and whose files.extractBytes is a spy —
 *  so a test can assert whether re-extraction was (not) triggered. */
function makeHost(loaded: unknown, extractBytes = vi.fn()) {
  return {
    db: { loadFile: vi.fn().mockResolvedValue(loaded) },
    files: { extractBytes },
  } as unknown as Host & { files: { extractBytes: ReturnType<typeof vi.fn> } };
}

describe("loadReattachFile — reuse the persisted extraction", () => {
  it("reuses the stored extraction and does NOT re-run OCR", async () => {
    const host = makeHost({
      name: "cr.pdf",
      mime: "application/pdf",
      original: new Uint8Array([1, 2, 3]),
      scrubbed: null,
      extraction: { text: "Jean Rebour", ocrText: "Jean Rebour (ocr)", words: [{ text: "Jean" }] },
    });
    const out = await loadReattachFile(host, { id: "f1", name: "cr.pdf", mime: "application/pdf" });

    expect(out.text).toBe("Jean Rebour");
    expect(out.ocrText).toBe("Jean Rebour (ocr)");
    expect(out.words).toEqual([{ text: "Jean" }]);
    expect(out.data).toBeTruthy(); // the original bytes still ride along for re-storage
    // The whole point of the feature: no second extraction pass.
    expect(host.files.extractBytes).not.toHaveBeenCalled();
  });

  it("falls back to re-extraction for an OLD row that stored no extraction", async () => {
    const extractBytes = vi.fn().mockResolvedValue({ text: "texte ré-extrait" });
    const host = makeHost(
      { name: "cr.txt", mime: "text/plain", original: new Uint8Array([1]), scrubbed: null, extraction: null },
      extractBytes,
    );
    const out = await loadReattachFile(host, { id: "f1", name: "cr.txt", mime: "text/plain" });

    expect(extractBytes).toHaveBeenCalledTimes(1);
    expect(out.text).toBe("texte ré-extrait");
  });

  it("does not trust an empty-text extraction — it re-extracts", async () => {
    const extractBytes = vi.fn().mockResolvedValue({ text: "frais" });
    const host = makeHost(
      { name: "x.txt", mime: "text/plain", original: new Uint8Array([1]), scrubbed: null, extraction: { text: "" } },
      extractBytes,
    );
    const out = await loadReattachFile(host, { id: "f1", name: "x.txt", mime: "text/plain" });

    expect(extractBytes).toHaveBeenCalledTimes(1);
    expect(out.text).toBe("frais");
  });
});
