import { describe, expect, it } from "vitest";
import type { ExtractedFile, OcrProgress } from "../../host";
import type { Attachment } from "./Composer";
import { extractPicked } from "./extractPicked";

const placeholder = (name: string, path: string, cid: string): Attachment => ({
  name,
  path,
  kind: "",
  text: "",
  chars: 0,
  cid,
  redactPreview: 0,
  extracting: true,
});
const read = (name: string, text = "Jean Dupont"): ExtractedFile => ({ name, kind: "pdf", text, chars: text.length });
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A host whose extractions the test settles by hand, one per path. */
function fakeHost() {
  const calls = new Map<string, { resolve: (f: ExtractedFile[]) => void; reject: (e: Error) => void; progress?: (p: OcrProgress) => void }>();
  const extract = (paths: string[], onProgress?: (p: OcrProgress) => void) =>
    new Promise<ExtractedFile[]>((resolve, reject) => {
      calls.set(paths[0], { resolve, reject, progress: onProgress });
    });
  return { calls, extract };
}

function harness() {
  const host = fakeHost();
  const patches: Record<string, Partial<Attachment>[]> = {};
  const read_: string[] = [];
  const warnings: string[] = [];
  const deps = {
    extract: host.extract,
    update: (cid: string, p: Partial<Attachment>) => (patches[cid] ??= []).push(p),
    countMatches: () => 1,
    onRead: (f: ExtractedFile) => read_.push(f.name),
    warn: (m: string) => warnings.push(m),
  };
  return { host, patches, read: read_, warnings, deps };
}

describe("extractPicked — chaque fichier choisi se termine de son côté", () => {
  it("un appel PAR fichier, et le premier lu est prêt sans attendre le plus lent", async () => {
    const h = harness();
    extractPicked([placeholder("gros-scan.pdf", "/a", "c1"), placeholder("note.pdf", "/b", "c2")], h.deps);
    expect([...h.host.calls.keys()]).toEqual(["/a", "/b"]);
    h.host.calls.get("/b")!.resolve([read("note.pdf")]);
    await tick();
    expect(h.read).toEqual(["note.pdf"]);
    expect(h.patches.c2.at(-1)).toMatchObject({ extracting: false, redacting: true });
    expect(h.patches.c1).toBeUndefined(); // the big scan is still being read
  });

  it("un échec ne touche que sa propre chip", async () => {
    const h = harness();
    extractPicked([placeholder("a.pdf", "/a", "c1"), placeholder("b.pdf", "/b", "c2")], h.deps);
    h.host.calls.get("/a")!.reject(new Error("illisible"));
    h.host.calls.get("/b")!.resolve([read("b.pdf")]);
    await tick();
    expect(h.patches.c1.at(-1)).toMatchObject({ extracting: false, error: "extraction échouée" });
    expect(h.patches.c2.at(-1)).toMatchObject({ extracting: false });
    expect(h.patches.c2.at(-1)?.error).toBeUndefined();
    expect(h.warnings).toEqual(["illisible"]);
  });

  it("l'attente puis les pages arrivent sur la BONNE chip, même à nom égal", async () => {
    const h = harness();
    extractPicked([placeholder("scan.pdf", "/x/scan.pdf", "c1"), placeholder("scan.pdf", "/y/scan.pdf", "c2")], h.deps);
    // The channel is shared: both listeners hear every event.
    const both = (p: OcrProgress) => {
      h.host.calls.get("/x/scan.pdf")!.progress?.(p);
      h.host.calls.get("/y/scan.pdf")!.progress?.(p);
    };
    both({ name: "scan.pdf", path: "/y/scan.pdf", page: 0, pages: 0, queued: 1 });
    both({ name: "scan.pdf", path: "/x/scan.pdf", page: 2, pages: 8 });
    expect(h.patches.c2).toEqual([{ extractQueued: 1, extractProgress: undefined }]);
    expect(h.patches.c1).toEqual([{ extractQueued: undefined, extractProgress: { done: 2, total: 8 } }]);
  });
});
