import type { Page } from "@playwright/test";

/** Waits for the turn's END, failure included: the action row (answer landed) OR
 *  the persisted failure card (`.failed-turn-card` — "SEND IMPOSSIBLE", 401…),
 *  which `awaitReply` doesn't know about: without it, a turn that failed in 10 s reads
 *  as 6 minutes of silence. Returns the outcome + the text (error or answer). */
export async function awaitTurnEnd(
  page: Page,
  timeoutMs: number,
): Promise<{ failed: boolean; text: string; ms: number }> {
  const start = Date.now();
  await page.waitForFunction(
    () => {
      const a = [...document.querySelectorAll(".msg.assistant")].pop();
      if (!a) return false;
      if (a.querySelector(".failed-turn-card")) return true;
      const ans = a.querySelector(".msg-answer");
      if (ans?.classList.contains("error") && (ans.textContent ?? "").trim()) return true;
      if (!ans || !(ans.textContent ?? "").trim()) return false;
      return !a.querySelector(".typing") && !!a.querySelector(".msg-actions");
    },
    null,
    { timeout: timeoutMs },
  );
  const out = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".msg.assistant")].pop()!;
    const fail = a.querySelector(".failed-turn-card");
    const ans = a.querySelector(".msg-answer");
    return {
      failed: !!fail || (ans?.classList.contains("error") ?? false),
      text: ((fail?.textContent ?? ans?.textContent) ?? "").trim().slice(0, 400),
    };
  });
  return { ...out, ms: Date.now() - start };
}

/** The state of the LAST assistant bubble — the diagnostic we want when a turn doesn't
 *  end: is there text, a loader, the action row, an error? */
export async function turnState(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const a = [...document.querySelectorAll(".msg.assistant")].pop();
      if (!a) return "aucun bubble assistant";
      const ans = a.querySelector(".msg-answer");
      return JSON.stringify({
        text: (ans?.textContent ?? "").trim().slice(-300),
        typing: !!a.querySelector(".typing"),
        actions: !!a.querySelector(".msg-actions"),
        error: ans?.classList.contains("error") ?? false,
        toolStatus: (a.querySelector(".thinking-status")?.textContent ?? "").slice(0, 200),
      });
    })
    .catch(() => "page fermée");
}

/** Sync point: the REAL connectors are reconnected (routes up to date). */
export async function waitForRealTools(page: Page, toolPrefix: string): Promise<void> {
  await page.waitForFunction(
    async (prefix) => {
      const mcp = (
        window as unknown as {
          openmasq?: { mcp?: { listTools?: () => Promise<{ name: string }[]> } };
        }
      ).openmasq?.mcp;
      if (!mcp?.listTools) return false;
      try {
        return (await mcp.listTools()).some((t) => t.name.startsWith(prefix));
      } catch {
        return false;
      }
    },
    toolPrefix,
    { timeout: 60_000 },
  );
}
