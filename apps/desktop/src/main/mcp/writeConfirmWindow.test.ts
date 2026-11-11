import { describe, it, expect, beforeEach, vi } from "vitest";

// The real confirmation opens a BrowserWindow; these tests inject the impl instead, so the
// electron import only needs to RESOLVE (never be called). Mock it so the module loads in a
// plain-node vitest context.
// `app`: pulled in by the DevTools policy (devtools.ts) — the factory mock enumerates what the chain touches.
vi.mock("electron", () => ({ BrowserWindow: class {}, app: {} }));

import {
  __buildHtml,
  confirmWrite,
  isToolWriteApproved,
  isWriteAutoApproved,
  setWriteAutoApprove,
  __setWriteConfirmImpl,
  __resetWriteConfirmImpl,
  ARM_MS,
  sentinelExit,
} from "./writeConfirmWindow";
import { ALLOW_TOOL_URL, ALLOW_URL, DENY_URL } from "./writeConfirmHtml";

beforeEach(() => __resetWriteConfirmImpl());

describe("session write auto-approve (audit M6 — armed ONLY via the un-spoofable window)", () => {
  it("starts OFF (protected)", () => {
    expect(isWriteAutoApproved()).toBe(false);
  });

  it("enabling asks on the disable-gate surface; an approval arms it", async () => {
    let askedMode: string | undefined;
    __setWriteConfirmImpl(async (req) => {
      askedMode = req.mode;
      return true; // user clicks Autoriser on the main-owned window
    });
    const state = await setWriteAutoApprove(true);
    expect(state).toBe(true);
    expect(isWriteAutoApproved()).toBe(true);
    expect(askedMode).toBe("disable-gate");
  });

  it("a REFUSED enable stays protected (fail closed) — the renderer can't self-grant it", async () => {
    __setWriteConfirmImpl(async () => false); // refuse / close / timeout
    const state = await setWriteAutoApprove(true);
    expect(state).toBe(false);
    expect(isWriteAutoApproved()).toBe(false);
  });

  it("disabling never prompts and takes effect immediately", async () => {
    __setWriteConfirmImpl(async () => true);
    await setWriteAutoApprove(true);
    expect(isWriteAutoApproved()).toBe(true);
    let prompted = false;
    __setWriteConfirmImpl(async () => {
      prompted = true;
      return true;
    });
    const state = await setWriteAutoApprove(false);
    expect(state).toBe(false);
    expect(isWriteAutoApproved()).toBe(false);
    expect(prompted).toBe(false);
  });

  it("re-enabling when already armed does not re-prompt", async () => {
    __setWriteConfirmImpl(async () => true);
    await setWriteAutoApprove(true);
    let prompts = 0;
    __setWriteConfirmImpl(async () => {
      prompts += 1;
      return true;
    });
    await setWriteAutoApprove(true);
    expect(prompts).toBe(0);
    expect(isWriteAutoApproved()).toBe(true);
  });

  it("__reset clears the armed state (test isolation)", async () => {
    __setWriteConfirmImpl(async () => true);
    await setWriteAutoApprove(true);
    expect(isWriteAutoApproved()).toBe(true);
    __resetWriteConfirmImpl();
    expect(isWriteAutoApproved()).toBe(false);
  });
});

describe("per-tool session memory (« Toujours pour cet outil » — window-armed only)", () => {
  it("an 'allow-tool' outcome approves the call AND remembers the exact tool", async () => {
    __setWriteConfirmImpl(async () => "allow-tool");
    const ok = await confirmWrite({ toolName: "gmail__send_email", args: { to: "x" } });
    expect(ok).toBe(true);
    expect(isToolWriteApproved("gmail__send_email")).toBe(true);
    expect(isToolWriteApproved("gmail__delete_email")).toBe(false); // exact tool only
    expect(isWriteAutoApproved()).toBe(false); // never arms the GLOBAL flag
  });

  it("a plain approval remembers nothing; a refusal remembers nothing (fail closed)", async () => {
    __setWriteConfirmImpl(async () => true);
    await confirmWrite({ toolName: "gmail__send_email", args: {} });
    expect(isToolWriteApproved("gmail__send_email")).toBe(false);
    __setWriteConfirmImpl(async () => false);
    await confirmWrite({ toolName: "notion__create_page", args: {} });
    expect(isToolWriteApproved("notion__create_page")).toBe(false);
  });

  it("an 'allow-tool' on the disable-gate surface must NOT arm the global auto-approve", async () => {
    __setWriteConfirmImpl(async () => "allow-tool");
    const state = await setWriteAutoApprove(true);
    expect(state).toBe(false);
    expect(isWriteAutoApproved()).toBe(false);
  });
});

describe("the confirmation page (data: URL — sentinel-only exits, escaped args)", () => {
  it("write mode offers the three exits and leads with HUMAN lines, JSON in <details>", () => {
    const html = __buildHtml({
      toolName: "gmail__send_email",
      args: { actions: [{ label: "Envoyer l'email à Manon" }], context: "note" },
    });
    expect(html).toContain("write-deny");
    expect(html).toContain("write-allow-tool");
    expect(html).toContain('href="https://example.invalid/write-allow"');
    expect(html).toContain("Envoyer l&#39;email à Manon");
    expect(html).toContain("<details>");
  });

  it("disable-gate mode has NO per-tool button (nothing else may arm memories)", () => {
    const html = __buildHtml({ toolName: "", args: undefined, mode: "disable-gate" });
    expect(html).not.toContain("write-allow-tool");
    expect(html).toContain("write-allow");
    expect(html).toContain("write-deny");
  });

  it("hostile arg strings are HTML-escaped (the page must stay script-free)", () => {
    const html = __buildHtml({
      toolName: "x__y",
      args: { to: '<img src=x onerror=alert(1)>"</pre><script>' },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
  });
});

describe("the window takes no approval in its first instants", () => {
  it("an approval before it is armed decides NOTHING; a refusal is always taken", () => {
    expect(ARM_MS).toBeGreaterThanOrEqual(400);
    // a click or an Enter already on its way when the window appeared
    expect(sentinelExit(ALLOW_URL, false)).toBe("stay");
    expect(sentinelExit(ALLOW_TOOL_URL, false)).toBe("stay");
    expect(sentinelExit(DENY_URL, false)).toBe(false);
  });

  it("once armed, each sentinel means what its button says", () => {
    expect(sentinelExit(ALLOW_URL, true)).toBe(true);
    expect(sentinelExit(ALLOW_TOOL_URL, true)).toBe("allow-tool"); // tested before its ALLOW prefix
    expect(sentinelExit(DENY_URL, true)).toBe(false);
  });

  it("any other navigation is cancelled, the page's own document passes", () => {
    expect(sentinelExit("https://evil.example/", true)).toBe("stay");
    expect(sentinelExit("file:///etc/passwd", true)).toBe("stay");
    expect(sentinelExit("data:text/html;charset=utf-8,x", true)).toBe("pass");
  });
});

describe("a write other tools run — what the window says", () => {
  it("names the reason and the path, escaped, and offers no memory for the tool", () => {
    const html = __buildHtml({
      toolName: "write_file",
      args: { path: "/p/.vscode/tasks.json" },
      runByTools: { path: "/p/.vscode/<b>tasks.json", why: "hidden" },
    });
    expect(html).toContain("class=\"warn\"");
    expect(html).toContain("/p/.vscode/&lt;b&gt;tasks.json");
    expect(html).not.toContain(ALLOW_TOOL_URL);
  });

  it("an « always for this tool » answer is not remembered for such a write", async () => {
    __setWriteConfirmImpl(async () => "allow-tool");
    expect(await confirmWrite({ toolName: "write_file", args: {}, runByTools: { path: "/p/package.json", why: "orders" } })).toBe(true);
    expect(isToolWriteApproved("write_file")).toBe(false);
  });
});
