import { describe, expect, it, vi } from "vitest";
import { findFileUrls, mapContentFiles } from "./walk";
import type { McpContent, Vault } from "../types";

const CANVA_URL =
  "https://export-download.canva.com/gWHk0/DADYuCgWHk0/-x/c-dir.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=f98b853003ae";

/** Passthrough redactText so the test isolates URL stripping from PII redaction. */
const passthrough = async (s: string) => s;

describe("findFileUrls", () => {
  it("finds a signed export URL and infers its mime", () => {
    const found = findFileUrls(`Voici le lien: ${CANVA_URL} — fini.`);
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe(CANVA_URL);
    expect(found[0].mimeType).toBe("application/pdf");
    expect(found[0].ext).toBe("pdf");
  });

  it("caps the number of URLs surfaced", () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `https://x.io/a${i}.png`).join(" ");
    expect(findFileUrls(many)).toHaveLength(6);
  });

  it("finds an extensionless Canva design thumbnail and marks it an image", () => {
    const thumb = "https://design.canva.ai/PVR-SDwJb5X7-Nc";
    const found = findFileUrls(`{"thumbnail":{"url":"${thumb}"}}`);
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe(thumb);
    expect(found[0].mimeType).toBe("image/jpeg");
    expect(found[0].ext).toBe("image");
  });

  it("does NOT surface a Canva canva.com EDIT link (only design.canva.ai thumbnails)", () => {
    const edit = "https://www.canva.com/d/VmkWKn-jiK0WuG2";
    expect(findFileUrls(`{"edit_url":"${edit}"}`)).toHaveLength(0);
  });

  it("deduplicates a URL that appears more than once", () => {
    const thumb = "https://design.canva.ai/PVR-SDwJb5X7-Nc";
    expect(findFileUrls(`${thumb} et encore ${thumb}`)).toHaveLength(1);
  });
});

describe("mapContentFiles — thumbnail image URL in text", () => {
  it("reports a design thumbnail via onFileUrl and strips it from the model-facing text", async () => {
    const onFileUrl = vi.fn();
    const thumb = "https://design.canva.ai/PVR-SDwJb5X7-Nc";
    const content: McpContent[] = [
      { type: "text", text: `{"items":[{"title":"CV","thumbnail":{"url":"${thumb}"}}]}` },
    ];
    const out = await mapContentFiles(content, { redactText: passthrough, vault: {}, onFileUrl });
    expect(onFileUrl).toHaveBeenCalledWith(thumb, "image/jpeg");
    const text = (out[0] as { text: string }).text;
    expect(text).not.toContain(thumb);
    expect(text).toContain("[aperçu image");
  });
});

describe("mapContentFiles — file URL in text", () => {
  it("reports the URL via onFileUrl and strips it from the model-facing text", async () => {
    const onFileUrl = vi.fn();
    const vault: Vault = {};
    const content: McpContent[] = [
      { type: "text", text: `{"job":{"status":"success","urls":["${CANVA_URL}"]}}` },
    ];

    const out = await mapContentFiles(content, {
      redactText: passthrough,
      vault,
      onFileUrl,
    });

    // Reported exactly once with the raw URL + inferred mime.
    expect(onFileUrl).toHaveBeenCalledTimes(1);
    expect(onFileUrl).toHaveBeenCalledWith(CANVA_URL, "application/pdf");

    // Privacy invariant: the signed URL is GONE from what the model sees.
    const text = (out[0] as { text: string }).text;
    expect(text).not.toContain(CANVA_URL);
    expect(text).not.toContain("X-Amz-Signature");
    expect(text).toContain("[fichier PDF exporté");
  });
});
