import type { Page } from "@playwright/test";

/** Attend la FIN du tour, échec compris : la rangée d'actions (réponse aboutie) OU
 *  la carte d'échec persistée (`.failed-turn-card` — « ENVOI IMPOSSIBLE », 401…),
 *  que `awaitReply` ne connaît pas : sans elle, un tour qui a échoué en 10 s se
 *  lit comme 6 minutes de silence. Rend l'issue + le texte (erreur ou réponse). */
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

/** L'état du DERNIER bubble assistant — le diagnostic qu'on veut quand un tour ne
 *  se termine pas : y a-t-il un texte, un loader, la rangée d'actions, une erreur ? */
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

/** Point de synchro : les VRAIS connecteurs sont reconnectés (routes à jour). */
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
