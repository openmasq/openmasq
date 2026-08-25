import type { Page } from "@playwright/test";

/**
 * Les gestes et les lectures qui ne portent QUE sur une page déjà ouverte — aucun chemin
 * de fichier, aucun lancement d'app.
 *
 * ⚠️ Ce module est volontairement libre de toute résolution de chemin, et c'est sa raison
 * d'être : `helpers.ts` doit rester en `__dirname` (Playwright transforme les specs en CJS,
 * `import.meta` y casse) alors que le pilote de `parcours/` tourne en ESM sous tsx, où
 * c'est `__dirname` qui n'existe pas. Un seul de ces deux mondes peut importer `helpers.ts`.
 * Les gestes, eux, sont les mêmes des deux côtés — ils vivent donc ici, importés par les
 * deux (règle 9 : un comportement, une maison), et `helpers.ts` les ré-exporte pour que les
 * specs existantes n'aient rien à changer.
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
 *  ⚠️ A turn can also fail into the FAILED-TURN CARD (`.failed-turn-card` — « Envoi
 *  impossible », a « Réessayer » button, no `.msg-answer` at all). That is a settled
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
      if (a.querySelector(".failed-turn-card")) return true; // le tour a échoué, et le dit
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
