import { describe, expect, it } from "vitest";
import { fileAttachedEvent } from "./persistUserTurn";

describe("file_attached — the redaction count reflects what was masked", () => {
  it("a rewritable document (docx) counts the spans scrubbed in its bytes", () => {
    expect(fileAttachedEvent({ mime: "application/msword", text: "x".repeat(50), redactPreview: 9 }, 51, true)).toMatchObject({
      redactions: 51,
    });
  });

  it("a PDF/image (not rewritten, no spans) counts the detection on its sent text, never 0", () => {
    expect(fileAttachedEvent({ mime: "application/pdf", data: "AAAA", redactPreview: 12 }, 0, false)).toMatchObject({
      mime: "application/pdf",
      redactions: 12,
    });
  });

  it("a PDF with nothing detected still reads 0", () => {
    expect(fileAttachedEvent({ mime: "application/pdf", data: "AAAA" }, 0, false)).toMatchObject({ redactions: 0 });
  });
});
