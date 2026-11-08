// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

/**
 * The console renders what the proxy RELAYED: a request's path, its session id, the values
 * it masked. Any of them can be written by whoever reached the loopback port — a web page can,
 * with a plain `<img src="http://127.0.0.1:…">`, which carries no Origin. Every one of them is
 * TEXT on this page, in every view. This runs the real page and feeds it such an event.
 */
const here = dirname(fileURLToPath(import.meta.url));
const MARK = 'omq-injected';
const PAYLOAD = `<img class="${MARK}" src=x onerror="window.__pwned=1">`;

function boot() {
  const listeners: Record<string, (m: { data: string }) => void> = {};
  // The page's bundle (`app.js`, served beside it) inlined where the page loads it.
  const html = readFileSync(join(here, "index.html"), "utf8").replace(
    /<script src="\.\/app\.js"><\/script>/,
    () => `<script>${readFileSync(join(here, "app.js"), "utf8")}</script>`,
  );
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://127.0.0.1:8787/?t=test",
    beforeParse(window) {
      (window as unknown as { EventSource: unknown }).EventSource = class {
        addEventListener(type: string, cb: (m: { data: string }) => void) {
          listeners[type] = cb;
        }
      };
      (window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      // The page fetches nothing this test needs (the catalog, a status): answer "not here".
      (window as unknown as { fetch: unknown }).fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
      (window as unknown as { structuredClone: unknown }).structuredClone = structuredClone;
    },
  });
  const emit = (type: string, data: unknown) => listeners[type]?.({ data: JSON.stringify(data) });
  return { dom, emit, w: dom.window as unknown as Record<string, any> };
}

describe("the console shows relayed request text as text", () => {
  it("in the call list, the data list and every detail tab", () => {
    const { dom, emit, w } = boot();
    emit("hello", { sections: [{ id: "identite", label: "Identité" }], reveal: true, pid: 1, version: "t", upMs: 0 });
    emit("request", {
      t: PAYLOAD,
      family: PAYLOAD,
      session: PAYLOAD,
      method: "GET",
      path: `/v1/models${PAYLOAD}`,
      status: 200,
      ms: 1,
      stream: false,
      items: [{ cat: "identite", n: 1, fake: "PERS_01", type: PAYLOAD, real: PAYLOAD }],
    });
    const doc = dom.window.document;
    const seen: string[] = [];
    for (const mode of ["calls", "data"]) {
      w.mode = mode;
      w.renderRows("");
      seen.push(doc.getElementById("rows")!.textContent ?? "");
      expect(doc.querySelectorAll(`.${MARK}`).length, `rows, ${mode}`).toBe(0);
    }
    w.sel = w.LOGS[0].id;
    for (const tab of ["flow", "json", "items", "ctx"]) {
      w.dTab = tab;
      w.renderDetail();
      seen.push(doc.getElementById("detail")!.textContent ?? "");
      expect(doc.querySelectorAll(`.${MARK}`).length, `detail, ${tab}`).toBe(0);
    }
    expect(w.__pwned).toBeUndefined();
    // It WAS rendered — as text.
    expect(seen.join(" ")).toContain(`<img class="${MARK}"`);
    dom.window.close();
  });
});
