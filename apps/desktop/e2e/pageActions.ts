import type { Page } from "@playwright/test";

/**
 * The gestures and reads that ONLY concern an already-open page — no file
 * path, no app launch.
 *
 * ⚠️ This module is deliberately free of any path resolution, and that's its
 * reason for being: `helpers.ts` must stay in `__dirname` (Playwright turns specs into CJS,
 * where `import.meta` breaks) while the `journey/` driver runs in ESM under tsx, where
 * `__dirname` is what doesn't exist. Only one of these two worlds can import `helpers.ts`.
 * The gestures themselves are the same on both sides — so they live here, imported by
 * both (rule 9: one behavior, one home), and `helpers.ts` re-exports them so that
 * existing specs don't have to change anything.
 */

/** Type a prompt into the composer and submit it. */
export async function sendPrompt(page: Page, text: string): Promise<void> {
  const input = page.locator(".composer-input");
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

/** What the app shows for the latest USER message (real, restored values). */
export async function appUserText(page: Page): Promise<string> {
  return (await page.locator(".msg.user .msg-bubble").last().innerText()).trim();
}

/** What the app shows for the latest ASSISTANT message (de-redacted reply). */
export async function appAnswerText(page: Page): Promise<string> {
  return (await page.locator(".msg.assistant .msg-answer").last().innerText()).trim();
}

/** Number of redaction highlights in the latest user message. */
export async function appRedactionMarkCount(page: Page): Promise<number> {
  return page.locator(".msg.user").last().locator("mark.redaction-mark").count();
}

/** Wait for the latest assistant reply to fully complete (the action row appears
 *  on done, or the message is flagged as an error). Returns the de-redacted reply
 *  text, the wall-clock latency, and whether the app errored ("No response"…).
 *
 *  ⚠️ A turn can also fail into the FAILED-TURN CARD (`.failed-turn-card` — "Send
 *  impossible", a "Retry" button, no `.msg-answer` at all). That is a settled
 *  outcome too, and waiting only on the answer element turned it into a full-timeout
 *  hang: the caller then reports "no reply" when the app had said exactly what went
 *  wrong on screen. Settling on the card returns that text as the error instead. */
export async function awaitReply(
  page: Page,
  timeoutMs = 120_000,
): Promise<{ text: string; ms: number; errored: boolean }> {
  const start = Date.now();
  await page.waitForFunction(
    () => {
      const els = document.querySelectorAll(".msg.assistant");
      const a = els[els.length - 1];
      if (!a) return false;
      if (a.querySelector(".failed-turn-card")) return true; // the turn failed, and says so
      const ans = a.querySelector(".msg-answer");
      if (!ans || !(ans.textContent || "").trim()) return false;
      const typing = a.querySelector(".typing");
      const actions = a.querySelector(".msg-actions");
      const errored = ans.classList.contains("error");
      return !typing && (!!actions || errored); // done (action row) or errored
    },
    null,
    { timeout: timeoutMs },
  );
  const last = page.locator(".msg.assistant").last();
  const carte = last.locator(".failed-turn-card");
  if (await carte.count()) {
    return { text: (await carte.innerText()).trim(), ms: Date.now() - start, errored: true };
  }
  const answer = last.locator(".msg-answer");
  const text = (await answer.innerText()).trim();
  const errored = await answer.evaluate((el) => el.classList.contains("error"));
  return { text, ms: Date.now() - start, errored };
}

export const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;
