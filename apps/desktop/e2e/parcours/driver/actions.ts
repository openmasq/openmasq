import type { Page } from "@playwright/test";
import { awaitReply } from "../../pageActions";
import { EXPR_DEMARQUER, EXPR_MARQUER, appel } from "./inPage";

/** Le marqueur temporaire posé sur l'élément visé, le temps d'un vrai clic Playwright. */
const HIT = "data-parcours-hit";

/**
 * Clique par NOM ACCESSIBLE — le vocabulaire du digest, donc celui que l'agent lit.
 *
 * On repère en page (même règle de nommage que le digest, `inPage.ts`), on MARQUE, puis on
 * laisse Playwright cliquer pour de vrai. Un `el.click()` en page sauterait la file
 * d'événements réelle (survol, focus, mise en vue) et ferait passer des boutons qu'un humain
 * n'aurait pas pu atteindre : un vert qui ment, exactement ce qu'un agent ne doit pas produire.
 */
export async function cliquer(page: Page, nom: string, n = 1): Promise<void> {
  const trouve = (await page.evaluate(appel(EXPR_MARQUER, { nom, n, HIT }))) as boolean;
  if (!trouve) {
    throw new Error(
      `aucun élément cliquable nommé « ${nom} »${n > 1 ? ` (n°${n})` : ""} — relire le digest`,
    );
  }
  await page.locator(`[${HIT}]`).click({ timeout: 15_000 });
  await page.evaluate(appel(EXPR_DEMARQUER, HIT));
}

/** Écrit dans le composeur (ou dans un champ nommé), sans envoyer. */
export async function ecrire(page: Page, texte: string, champ?: string): Promise<void> {
  const cible = champ
    ? page.getByLabel(champ).first().or(page.getByPlaceholder(champ).first())
    : page.locator(".composer-input");
  await cible.click({ timeout: 15_000 });
  await cible.fill(texte);
}

/** Une touche, sur ce qui a le focus. */
export async function toucher(page: Page, touche: string): Promise<void> {
  await page.keyboard.press(touche);
}

export interface Reponse {
  reponse: string;
  ms: number;
  enErreur: boolean;
  /** Ce que l'app a annoncé comme à redact AVANT l'envoi — la promesse faite à l'écran. */
  toRedact: string[];
  surlignages: number;
}

/**
 * Le geste central : poser une question et attendre la réponse, comme on le fait cent fois
 * par jour. Retourne aussi ce que l'app avait ANNONCÉ comme à redact — sans quoi juger
 * « la promesse a-t-elle été tenue » demanderait de rejouer la scène.
 */
export async function demander(page: Page, prompt: string, timeoutMs = 180_000): Promise<Reponse> {
  const input = page.locator(".composer-input");
  await input.click({ timeout: 30_000 });
  await input.fill(prompt);
  // La détection vivante est débouncée : on lui laisse le temps de parler, mais on ne BLOQUE
  // pas dessus — une détection muette est un constat à rapporter, pas un plantage du pilote.
  //
  // ⚠️ Une FONCTION ici, jamais une chaîne : `waitForFunction` scrute en injectant un
  // `new Function` dans la page, et la CSP de l'app interdit `unsafe-eval` — la chaîne y
  // lève une violation de CSP au lieu d'attendre. `page.evaluate`, lui, passe par CDP et
  // n'est pas soumis à la CSP : c'est pourquoi le digest, lui, peut rester une chaîne.
  await page
    .waitForFunction(() => document.querySelectorAll(".detect-chip").length > 0, null, {
      timeout: 8_000,
    })
    .catch(() => {});
  const toRedact = (await page.locator(".detect-chip-val").allInnerTexts()).map((s) => s.trim());

  await input.press("Enter");
  const { text, ms, errored } = await awaitReply(page, timeoutMs);
  const surlignages = await page.locator(".msg.user").last().locator("mark.redaction-mark").count();
  return { reponse: text, ms, enErreur: errored, toRedact, surlignages };
}
