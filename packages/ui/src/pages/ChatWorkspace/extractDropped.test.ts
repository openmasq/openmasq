import { describe, it, expect, vi } from "vitest";
import { MAX_DROP_BYTES, extractDroppedFiles, deferDroppedFile } from "./extractDropped";
import type { OcrProgress } from "../../host";

const deps = (over: Partial<Parameters<typeof extractDroppedFiles>[1]> = {}) => ({
  extractBytes: vi.fn(async (_d: string, name: string) => ({ text: `texte de ${name}` })),
  toBase64: () => "BASE64",
  ...over,
});

const f = (name: string, type = "", size?: number) => {
  const file = new File(["contenu"], name, { type });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("extractDroppedFiles — bytes, never a path", () => {
  it("extracts through the BYTES route and never asks for a path", async () => {
    // The security shape: a dropped path would need `grantRead`, which only a native
    // picker may do. The bytes are already the renderer's, so nothing new is granted.
    const d = deps();
    const out = await extractDroppedFiles([f("contrat.pdf", "application/pdf")], d);
    expect(d.extractBytes).toHaveBeenCalledWith("BASE64", "contrat.pdf", "application/pdf", undefined);
    expect(out).toEqual([
      {
        name: "contrat.pdf",
        kind: "application/pdf",
        text: "texte de contrat.pdf",
        chars: 20,
        data: "BASE64",
        mime: "application/pdf",
      },
    ]);
  });

  it("CARRIES the bytes on the attachment — a drop has no usable path", () => {
    // `redactAndSave` uses in-memory bytes instead of `path` when present. Without them a
    // dropped file could be neither stored, previewed, nor sent as redacted images.
    return extractDroppedFiles([f("photo.png", "image/png")], deps()).then((out) => {
      expect(out[0]!.data).toBe("BASE64");
      expect(out[0]!.mime).toBe("image/png");
    });
  });

  it("keeps the bytes even when extraction FAILS — the file is still storable", async () => {
    const d = deps({
      extractBytes: vi.fn(async () => {
        throw new Error("illisible");
      }),
    });
    const out = await extractDroppedFiles([f("scan.pdf", "application/pdf")], d);
    expect(out[0]!.error).toBe("illisible");
    expect(out[0]!.data).toBe("BASE64");
  });

  it("passes NO mime rather than an empty one when the drop carries none", async () => {
    const d = deps();
    await extractDroppedFiles([f("notes")], d);
    expect(d.extractBytes).toHaveBeenCalledWith("BASE64", "notes", undefined, undefined);
  });

  it("fails PER FILE — a corrupt one must not throw away the others", async () => {
    const d = deps({
      extractBytes: vi.fn(async (_d: string, name: string) => {
        if (name === "casse.pdf") throw new Error("illisible");
        return { text: "ok" };
      }),
    });
    const out = await extractDroppedFiles([f("bon.pdf"), f("casse.pdf"), f("autre.pdf")], d);
    expect(out.map((x) => x.error)).toEqual([undefined, "illisible", undefined]);
    expect(out.map((x) => x.text)).toEqual(["ok", "", "ok"]);
  });

  it("refuses an oversized file BEFORE reading it into memory", async () => {
    const d = deps();
    const out = await extractDroppedFiles([f("image.dmg", "", MAX_DROP_BYTES + 1)], d);
    expect(out[0]!.error).toBe("fichier trop volumineux");
    expect(d.extractBytes).not.toHaveBeenCalled();
  });

  it("handles an empty drop", async () => {
    expect(await extractDroppedFiles([], deps())).toEqual([]);
  });
});

describe("la route bytes rend la même RICHESSE que la route chemin", () => {
  it("`words`/`ocrText`/`ocr` voyagent avec le texte — le redacted d'une image déposée est peignable", async () => {
    // Lived (14/08, ID card dropped): the IPC discarded everything but the text, so the preview
    // couldn't paint the REDACTED image — the ORIGINAL opened instead, zero boxes.
    const words = [{ text: "CORBŒLET", x0: 1, y0: 2, x1: 30, y1: 12 }];
    const d = deps({
      extractBytes: vi.fn(async () => ({ text: "t", words, ocrText: "brut", ocr: { engine: "tesseract", ms: 12 } })),
    });
    const out = await extractDroppedFiles([f("cni.png", "image/png")], d);
    expect(out[0]!.words).toEqual(words);
    expect(out[0]!.ocrText).toBe("brut");
    expect(out[0]!.ocr?.engine).toBe("tesseract");
  });
});

/**
 * The pre-parse safety gate (`@openmasq/redact` `guardUpload`) answers "do not parse
 * this" for an oversize file, a magic-byte/extension contradiction, or a decompression
 * bomb — and says so with `blocked`. That verdict was dropped on the floor here: the
 * file was attached anyway, `data` (the raw base64 bytes) intact, and the preview path
 * then handed those very bytes to `unzipSync`. The gate refused the file; the app
 * opened it.
 */
describe("un fichier REFUSÉ par la garde ne s'attache pas avec ses octets", () => {
  it("propage `blocked` et LAISSE TOMBER les octets", async () => {
    const d = deps({
      extractBytes: vi.fn(async () => ({
        text: "",
        blocked: true,
        error: "Ratio de compression anormal — fichier refusé (protection anti-bombe).",
      })),
    });
    const out = await extractDroppedFiles([f("bombe.docx")], d);
    expect(out[0]!.blocked).toBe(true);
    expect(out[0]!.error).toMatch(/anti-bombe/);
    // Le point qui compte : plus rien à déballer en aval.
    expect(out[0]!.data).toBeUndefined();
    expect(out[0]!.text).toBe("");
  });

  it("un échec d'extraction ORDINAIRE garde bien ses octets (la règle inchangée)", async () => {
    // Un parseur qui n'a rien su lire n'est pas un refus : le fichier reste stockable
    // et visualisable. C'est la distinction que `blocked` porte.
    const d = deps({
      extractBytes: vi.fn(async () => {
        throw new Error("illisible");
      }),
    });
    const out = await extractDroppedFiles([f("scan.pdf")], d);
    expect(out[0]!.blocked).toBeUndefined();
    expect(out[0]!.data).toBe("BASE64");
  });

  it("une extraction PARTIELLE garde son texte ET sa raison", async () => {
    // `error` était jeté avec `blocked` : la puce ne disait rien alors qu'une couche
    // manquait.
    const d = deps({
      extractBytes: vi.fn(async () => ({ text: "page 1", error: "OCR indisponible" })),
    });
    const out = await extractDroppedFiles([f("scan.pdf")], d);
    expect(out[0]!.text).toBe("page 1");
    expect(out[0]!.error).toBe("OCR indisponible");
    expect(out[0]!.data).toBe("BASE64");
  });
});

describe("deferDroppedFile — la forme différée du drop", () => {
  it("mappe la progression {page,pages}→{done,total} et FILTRE sur le nom du fichier", async () => {
    // The `files:ocr-progress` channel is global: a concurrent extraction (another
    // drop, an MCP tool file) emits on it too — its pages aren't ours.
    const d = deps({
      extractBytes: vi.fn(
        async (_b: string, name: string, _m?: string, onP?: (p: OcrProgress) => void) => {
          onP?.({ name: "autre.pdf", page: 1, pages: 5 }); // concurrent → filtered
          onP?.({ name, page: 2, pages: 3 });
          return { text: "ok" };
        },
      ),
    });
    const df = deferDroppedFile(f("scan.pdf", "application/pdf"), d);
    expect(df.name).toBe("scan.pdf");
    const ticks: { done: number; total: number }[] = [];
    const out = await df.load((p) => ticks.push(p));
    expect(out.text).toBe("ok");
    expect(ticks).toEqual([{ done: 2, total: 3 }]);
  });
});
