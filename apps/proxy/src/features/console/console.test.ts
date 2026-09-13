import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { DEFAULTS } from "../../config/config";
import { silentReporter } from "../../lib/ui";
import type { Masker } from "../../lib/masker";
import { createConsoleBus } from "./events";
import { renderPage } from "./page";

const here = dirname(fileURLToPath(import.meta.url));
const masker: Masker = {
  async mask(text) {
    return { text, matches: [] };
  },
  restoreReply: (t) => t,
  restoreArgs: (t) => t,
};

const TOKEN = "a-token-nobody-guesses";
let proxy: Server;
let url: string;

beforeAll(async () => {
  const app = createApp({
    config: { ...DEFAULTS, rulesOnly: true, console: true },
    masker,
    reporter: silentReporter,
    console: {
      bus: createConsoleBus(false),
      token: TOKEN,
      version: "test",
      command: "claude",
      startedAt: Date.now(),
    },
  });
  proxy = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => proxy.once("listening", () => r()));
  url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/console`;
});
afterAll(() => {
  proxy.closeAllConnections?.();
  proxy.close();
});

describe("the console endpoint", () => {
  it("is announced on /healthz, so `openmasq-proxy console` knows a link points at a live view", async () => {
    const health = (await (await fetch(url.replace(/\/console$/, "/healthz"))).json()) as {
      console: boolean;
    };
    expect(health.console).toBe(true);
  });

  it("is a 404 without the token — not a 401, which would confirm it exists", async () => {
    expect((await fetch(url)).status).toBe(404);
    expect((await fetch(`${url}?t=wrong`)).status).toBe(404);
    expect((await fetch(`${url}/events?t=wrong`)).status).toBe(404);
    expect((await fetch(`${url}/tokens.css`)).status).toBe(404);
  });

  it("serves the page with the token, and tells no cache to keep it", async () => {
    const res = await fetch(`${url}?t=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    // The stylesheet carries the token too: every route is behind it, and a bare link 404s.
    expect(html).toContain(`href="./tokens.css?t=${TOKEN}"`);
    // Without a base, `./tokens.css` resolves against `/console` — i.e. `/tokens.css`, a
    // 404, an unstyled page and a stream that never connects. Found by rendering it.
    expect(html).toContain('<base href="/console/">');
    // Both marks are inlined, so the page fetches nothing from anywhere.
    expect(html).toContain('<svg class="m-light"');
    expect(html).toContain('<svg class="m-dark"');
    expect(html).not.toContain("<!--MARK-DARK-->");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("<!--MARK-->");
  });

  it("carries a Session column, because one console now shows several clients", async () => {
    const html = await (await fetch(`${url}?t=${TOKEN}`)).text();
    // Several wrapped clients share one proxy (`lib/attach.ts`), each on its own `/s/<id>`
    // prefix and its own vault — telling them apart is what the column is for.
    // Matched on the class and the label rather than the whole tag: every header carries a
    // `title` now, and pinning the exact markup made a tooltip look like a lost column.
    expect(html).toMatch(/<th class="c-ses"[^>]*>Session<\/th>/);
    expect(html).toContain("function sesTag(");
  });

  it("shows the real values by default, and names the flag when a run sent none", async () => {
    const html = await (await fetch(`${url}?t=${TOKEN}`)).text();
    // The page is the operator's own screen: the toggle starts ON when the run sends values.
    expect(html).toContain("var rev = true;");
    expect(html).toContain("if (on) { setRev(true); return; }");
    // This console was started with --no-console-reveal (bus built with `false`), so the
    // server sends no original. The kit's own toggle would otherwise flip to a row of dots.
    expect(html).toContain("Real values (off)");
    expect(html).toContain("armReveal(!!d.reveal)");
    expect(html).toContain("Started with --no-console-reveal");
    // ONE control, at the top. The drawer used to carry a second one — two buttons for one
    // fact, and a "→ --reveal" under every single value on top of that.
    expect(html).not.toContain('id="rev-in"');
  });

  it("serves the generated token sheet, and no colour of its own", async () => {
    const css = await (await fetch(`${url}/tokens.css?t=${TOKEN}`)).text();
    expect(css).toContain("--cav-identite");
    expect(css).toContain("GENERATED");
  });
});

/* The page's logic is bundled into `app.js` from `page/`, and the bundle is COMMITTED --
   `dev` runs straight off `src` with no build, so the artefact has to be there. That is the
   same trade the tokens sheet makes, and it earns the same guard: re-run the generator and
   fail when what is committed no longer matches its source. Without this, an edit to
   `page/*.ts` would pass every test while the page kept serving the old bundle. */
describe("the console bundle", () => {
  it("matches page/ — run `pnpm --filter @openmasq/proxy console:build` if this fails", () => {
    expect(() =>
      execFileSync("node", [join(here, "../../../scripts/build-console.mjs"), "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("is what the page actually asks for, behind the token", () => {
    const page = renderPage("tok3n");
    expect(page).toContain('src="./app.js?t=tok3n"');
    // …and it loads BEFORE the inline script that calls into it.
    expect(page.indexOf("./app.js")).toBeLessThan(page.indexOf("window.openmasqConsole"));
  });
});

describe("the design tokens", () => {
  it("still match the product's own — regenerate if this fails", () => {
    // The parity guard `palette.test.ts` applies to the terminal, applied to the page: the
    // generator re-reads packages/ui and exits 1 when the committed sheet has drifted.
    expect(() =>
      execFileSync("node", [join(here, "../../../scripts/gen-console-tokens.mjs"), "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
