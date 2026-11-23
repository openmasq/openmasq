import { describe, it, expect, vi, beforeEach } from "vitest";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

let handler: ((req: Request) => Promise<Response>) | null = null;
const netFetch = vi.fn(async () => new Response("native"));
vi.mock("electron", () => ({
  protocol: { handle: (_s: string, h: (req: Request) => Promise<Response>) => { handler = h; } },
  net: { fetch: (...a: unknown[]) => netFetch(...(a as [])) },
}));
const { isRendererFile, installRendererFileScope } = await import("./rendererFileScope");

const ROOT = mkdtempSync(join(tmpdir(), "rfs-"));
const RENDERER = join(ROOT, "App.app", "out", "renderer");
const INDEX = join(RENDERER, "index.html");
mkdirSync(RENDERER, { recursive: true });
writeFileSync(INDEX, "<meta csp>");
const url = (p: string) => pathToFileURL(p).href;

describe("isRendererFile — file: reaches the renderer directory only", () => {
  it("accepts the renderer's own files", () => {
    expect(isRendererFile(url(INDEX), RENDERER)).toBe(true);
    expect(isRendererFile(`${url(join(RENDERER, "assets", "index.js"))}?v=1#x`, RENDERER)).toBe(true);
  });

  it("REFUSES any user file, a sibling with the same prefix, and traversal out of the directory", () => {
    expect(isRendererFile(url(join(tmpdir(), "home", ".ssh", "id_ed25519")), RENDERER)).toBe(false);
    expect(isRendererFile(url(`${RENDERER}-evil/x.js`), RENDERER)).toBe(false);
    expect(isRendererFile(`${url(RENDERER)}/../../secret.txt`, RENDERER)).toBe(false);
    expect(isRendererFile(`${url(RENDERER)}/%2e%2e/%2e%2e/secret.txt`, RENDERER)).toBe(false);
    expect(isRendererFile(`${url(RENDERER)}/assets%2f..%2f..%2fsecret`, RENDERER)).toBe(false);
  });

  it("refuses remote-host file URLs and non-file schemes", () => {
    expect(isRendererFile("file://attacker-host/share/x.js", RENDERER)).toBe(false);
    expect(isRendererFile("https://example.com/x.js", RENDERER)).toBe(false);
    expect(isRendererFile("not a url", RENDERER)).toBe(false);
  });

  it("folds case only on Windows", () => {
    expect(isRendererFile(url(join(RENDERER, "a.js")).toUpperCase().replace("FILE:", "file:"), RENDERER, "darwin")).toBe(false);
  });
});

describe("installRendererFileScope — the default session's file: handler", () => {
  beforeEach(() => { handler = null; netFetch.mockClear(); });

  it("answers 404 for a file outside the renderer, without touching the native handler", async () => {
    installRendererFileScope(INDEX, null);
    const res = await handler!(new Request(url(join(ROOT, "secret.txt"))));
    expect(res.status).toBe(404);
    expect(netFetch).not.toHaveBeenCalled();
  });

  it("serves renderer files through the native handler", async () => {
    installRendererFileScope(INDEX, null);
    const res = await handler!(new Request(url(join(RENDERER, "assets", "index.js"))));
    expect(await res.text()).toBe("native");
    expect(netFetch).toHaveBeenCalledTimes(1);
  });

  it("applies the index rewrite to index.html only", async () => {
    installRendererFileScope(INDEX, (html) => html.replace("csp", "csp+custom"));
    expect(await (await handler!(new Request(`${url(INDEX)}#/chat`))).text()).toBe("<meta csp+custom>");
    await handler!(new Request(url(join(RENDERER, "assets", "index.js"))));
    expect(netFetch).toHaveBeenCalledTimes(1);
  });
});
