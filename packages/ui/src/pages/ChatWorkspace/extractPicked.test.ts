import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import type { ExtractedFile, OcrProgress } from "../../host";
import type { Attachment } from "./Composer";
import { extractPicked } from "./extractPicked";
import { cancelExtraction } from "../../state/files/extractCancel";

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
  const calls = new Map<
    string,
    { resolve: (f: ExtractedFile[]) => void; reject: (e: Error) => void; progress?: (p: OcrProgress) => void; job?: string }
  >();
  const extract = (paths: string[], onProgress?: (p: OcrProgress) => void, _s?: unknown, job?: string) =>
    new Promise<ExtractedFile[]>((resolve, reject) => {
      calls.set(paths[0], { resolve, reject, progress: onProgress, job });
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
    t: getMessages("fr"),
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
    expect(h.patches.c1.at(-1)).toMatchObject({ extracting: false, error: "Lecture impossible" });
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

describe("extractPicked — un chip retiré pendant la lecture", () => {
  it("passe son cid comme id de tâche, et son annulation ne fait ni bandeau ni masquage", async () => {
    const h = harness();
    extractPicked([placeholder("retire.pdf", "/r", "cut1"), placeholder("garde.pdf", "/g", "keep1")], h.deps);
    expect(h.host.calls.get("/r")!.job).toBe("cut1");
    const cancelled: string[] = [];
    cancelExtraction("cut1", (job) => cancelled.push(job));
    expect(cancelled).toEqual(["cut1"]);
    h.host.calls.get("/r")!.reject(new Error("extraction annulée"));
    h.host.calls.get("/g")!.reject(new Error("illisible"));
    await tick();
    expect(h.warnings).toEqual(["illisible"]); // only the file still shown reports its failure
    expect(h.patches.cut1).toBeUndefined();
  });

  it("un résultat qui arrive APRÈS le retrait n'est ni posé ni masqué", async () => {
    const h = harness();
    extractPicked([placeholder("tard.pdf", "/t", "late1")], h.deps);
    cancelExtraction("late1");
    h.host.calls.get("/t")!.resolve([read("tard.pdf")]);
    await tick();
    expect(h.read).toEqual([]);
    expect(h.patches.late1).toBeUndefined();
  });
});
