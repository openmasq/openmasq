import type { Page } from "@playwright/test";
import { EXPR_DIGEST, call } from "./inPage";

export interface Snapshot {
  /** The current section, as the rail marks it active. */
  section: string;
  /** The screen's title (`.page-header`), when the screen has one. */
  titre: string | null;
  /** The name of the open modal, if there is one — it captures clicks. */
  modale: string | null;
  /** What can be clicked, by ACCESSIBLE NAME: `click`'s vocabulary. */
  actions: { nom: string; role: string; n: number }[];
  /** The composer: what's written, and what the app announces as to-be-redacted. */
  composeur: { valeur: string; toRedact: string[]; envoiPret: boolean } | null;
  /** The conversation's last turns, truncated — enough to judge, not enough to drown in. */
  messages: { role: string; texte: string }[];
  /** What the screen says that no button carries (empty states, banners, errors). */
  textes: string[];
}

/**
 * A screen's DIGEST: what a user sees and can do, in JSON.
 *
 * Why this exists alongside the screenshot: a screenshot says "it's broken", it doesn't
 * say "here are the six clickable things and how to name them". The agent decides on this
 * digest and VERIFIES against the screenshot; the reverse makes it guess selectors, and a
 * guessed selector produces a false bug — the worst waste an autonomous agent can create.
 *
 * The name chosen is the ACCESSIBLE name (`aria-label`, otherwise the text): the vocabulary
 * the user reads, and which breaks loudly when a button is renamed. The page's code
 * is a string — why: `inPage.ts`.
 */
export async function snapshot(page: Page, messageLimit = 6): Promise<Snapshot> {
  return page.evaluate(call(EXPR_DIGEST, messageLimit)) as Promise<Snapshot>;
}
