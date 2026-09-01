import type { Page } from "@playwright/test";
import { awaitReply } from "../../pageActions";
import { EXPR_UNMARK, EXPR_MARK, call } from "./inPage";

/** The temporary marker set on the targeted element, for the duration of a real Playwright click. */
const HIT = "data-journey-hit";

/**
 * Clicks by ACCESSIBLE NAME — the digest's vocabulary, so what the agent reads.
 *
 * We locate it in the page (same naming rule as the digest, `inPage.ts`), we MARK it, then we
 * let Playwright click for real. An in-page `el.click()` would skip the real
 * event queue (hover, focus, scroll-into-view) and would let through buttons a human
 * couldn't have reached: a lying green, exactly what an agent must never produce.
 */
export async function clickByName(page: Page, name: string, n = 1): Promise<void> {
  const found = (await page.evaluate(call(EXPR_MARK, { name, n, HIT }))) as boolean;
  if (!found) {
    throw new Error(
      `aucun élément cliquable nommé « ${name} »${n > 1 ? ` (n°${n})` : ""} — relire le digest`,
    );
  }
  await page.locator(`[${HIT}]`).click({ timeout: 15_000 });
  await page.evaluate(call(EXPR_UNMARK, HIT));
}

/** Writes into the composer (or into a named field), without sending. */
export async function typeText(page: Page, inputText: string, field?: string): Promise<void> {
  const target = field
    ? page.getByLabel(field).first().or(page.getByPlaceholder(field).first())
    : page.locator(".composer-input");
  await target.click({ timeout: 15_000 });
  await target.fill(inputText);
}

/** One keystroke, on whatever has focus. */
export async function pressKey(page: Page, keyName: string): Promise<void> {
  await page.keyboard.press(keyName);
}

export interface Reply {
  reponse: string;
  ms: number;
  enErreur: boolean;
  /** What the app announced as to-be-redacted BEFORE sending — the promise made on screen. */
  toRedact: string[];
  surlignages: number;
}

/**
 * The central gesture: ask a question and wait for the answer, like we do a hundred times
 * a day. Also returns what the app had ANNOUNCED as to-be-redacted — without which judging
 * "was the promise kept" would require replaying the scene.
 */
export async function askModel(page: Page, prompt: string, timeoutMs = 180_000): Promise<Reply> {
  const input = page.locator(".composer-input");
  await input.click({ timeout: 30_000 });
  await input.fill(prompt);
  // Live detection is debounced: we give it time to speak, but we don't BLOCK
  // on it — a silent detection is a finding to report, not a driver crash.
  //
  // ⚠️ A FUNCTION here, never a string: `waitForFunction` polls by injecting a
  // `new Function` into the page, and the app's CSP forbids `unsafe-eval` — the string
  // raises a CSP violation there instead of waiting. `page.evaluate`, though, goes through CDP and
  // isn't subject to the CSP: that's why the digest can stay a string.
  await page
    .waitForFunction(() => document.querySelectorAll(".detect-chip").length > 0, null, {
      timeout: 8_000,
    })
    .catch(() => {});
  const toRedact = (await page.locator(".detect-chip-val").allInnerTexts()).map((s) => s.trim());

  await input.press("Enter");
  const { text, ms, errored } = await awaitReply(page, timeoutMs);
  const highlights = await page.locator(".msg.user").last().locator("mark.redaction-mark").count();
  return { reponse: text, ms, enErreur: errored, toRedact, surlignages: highlights };
}
