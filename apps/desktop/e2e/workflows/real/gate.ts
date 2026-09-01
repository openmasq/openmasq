import type { ElectronApplication, Page } from "@playwright/test";

/**
 * THE TEST MCP BRIDGE — talk to the connected account's REAL connectors, from a
 * test, without going through the model: the preload already exposes `mcp.listTools` /
 * `mcp.callTool`, and the launched app carries the account's connections (adopted store).
 * Used to (a) set up a scenario, (b) VERIFY a workflow's real effect ("did the
 * message go out ONCE?"), (c) write a tool test with no LLM.
 * ⚠️ No gate is bypassed: a risky write opens the SAME non-spoofable
 * system window — hence `startSelectiveApprove` running alongside if needed.
 */
export function realMcp(page: Page) {
  // ⚠️ Everything that follows runs IN the page: the function passed to `evaluate`
  // is serialized, so it cannot capture any variable from this module.
  const list = (): Promise<{ name: string; description?: string }[]> =>
    page
      .evaluate(() =>
        (
          window as unknown as {
            openmasq: { mcp: { listTools: () => Promise<{ name: string; description?: string }[]> } };
          }
        ).openmasq.mcp.listTools(),
      )
      .catch(() => [] as { name: string; description?: string }[]);
  return {
    listTools: list,
    /** A given connector's tool names (prefix `<id>__`). */
    toolsOf: async (connectorId: string) =>
      (await list()).map((t) => t.name).filter((n) => n.startsWith(`${connectorId}__`)),
    call: (name: string, args: Record<string, unknown> = {}) =>
      page.evaluate(
        ({ name, args }) =>
          (
            window as unknown as {
              openmasq: { mcp: { callTool: (c: { name: string; args?: unknown }) => Promise<unknown> } };
            }
          ).openmasq.mcp.callTool({ name, args }),
        { name, args },
      ),
  };
}

/**
 * SELECTIVE approver for the non-spoofable main window, counting PER TOOL —
 * both of the suite's assertions live here:
 *   • `refuse` (e.g. /^neon__/) → click "Refuse" (write-deny sentinel): no
 *     write from these tools ever executes, and we PROVE it (the `refused` counter);
 *   • everything else → "Allow" (ONE call — never "Always for this tool"),
 *     so 1 confirmation = 1 execution: the per-tool `approved` counter is the
 *     ANTI-DOUBLE-SEND measurement (the tofix folder's "2 emails" bug = 2 confirmations).
 * The tool name is read from the window's DOM (main writes it there — `writeConfirmHtml`).
 */
export function startSelectiveApprove(
  app: ElectronApplication,
  page: Page,
  refuse: RegExp | null,
) {
  let stop = false;
  const approved = new Map<string, number>();
  const refused = new Map<string, number>();
  const bump = (m: Map<string, number>, tool: string) => m.set(tool, (m.get(tool) ?? 0) + 1);
  const loop = (async () => {
    while (!stop) {
      try {
        // The in-conversation card (local reversible gestures): approve.
        const cardBtn = page.locator(".write-confirm-card .btn-danger");
        if ((await cardBtn.count().catch(() => 0)) > 0)
          await cardBtn.first().click({ timeout: 1_000 }).catch(() => {});
        for (const w of app.windows()) {
          if (w === page) continue;
          const allow = w.locator('a[href="https://example.invalid/write-allow"]');
          if ((await allow.count().catch(() => 0)) === 0) continue;
          const body = (await w.locator("body").innerText().catch(() => "")) ?? "";
          const tool = /([a-z0-9-]+__[a-zA-Z0-9_-]+)/.exec(body)?.[1] ?? "?";
          if (refuse?.test(tool)) {
            await w
              .locator('a[href="https://example.invalid/write-deny"]')
              .first()
              .click({ timeout: 1_000 })
              .then(() => bump(refused, tool))
              .catch(() => {});
          } else {
            await allow
              .first()
              .click({ timeout: 1_000 })
              .then(() => bump(approved, tool))
              .catch(() => {});
          }
        }
      } catch {
        /* a window can close mid-poll — we keep going */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  return {
    approved: () => new Map(approved),
    refused: () => new Map(refused),
    stop: async () => {
      stop = true;
      await loop;
    },
  };
}
