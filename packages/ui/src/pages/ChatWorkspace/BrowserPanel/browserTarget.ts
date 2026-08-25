import { searchUrl } from "../../../state/searchEngines";

/**
 * Pure URL-bar logic for the BrowserPanel, split out of the component (rule 1)
 * so it stays unit-testable and the panel stays presentation + wiring.
 */

/**
 * Resolve what the user typed into the URL bar into a navigable target:
 *  - an explicit http(s):// URL → used as-is;
 *  - something that looks like a bare host (no spaces, a dot + TLD, or localhost)
 *    → prefixed with `https://`;
 *  - anything else (free keywords) → a SEARCH on the user's CHOSEN engine
 *    (`Settings.browserSearchEngine`, default DuckDuckGo — the app's anti-captcha
 *    choice, and the fallback when no engine is set).
 * Returns null only for empty input.
 */
export function resolveTarget(raw: string, engineId: string | undefined): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      /* fall through to search */
    }
  }
  const looksLikeHost =
    !/\s/.test(v) && (/\.[a-z]{2,}(:\d+)?(\/|\?|#|$)/i.test(v) || /^localhost(:\d+)?(\/|$)/i.test(v));
  if (looksLikeHost) {
    try {
      return new URL(`https://${v}`).toString();
    } catch {
      /* fall through to search */
    }
  }
  return searchUrl(engineId, v);
}

/** Short tab label from a URL (the host, scheme stripped), or a placeholder. */
export function labelOf(url: string): string {
  if (!url) return "Nouvel onglet";
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Same navigable target? Normalise so `example.com` and `example.com/` match, so a
 *  link already open in a tab is re-focused rather than duplicated. */
export function sameUrl(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    return new URL(a).toString() === new URL(b).toString();
  } catch {
    return a === b;
  }
}

export interface BrowserBookmark {
  label: string;
  url: string;
}

/** Is `url` already bookmarked (same navigable target)? */
export function isBookmarked(list: readonly BrowserBookmark[], url: string): boolean {
  return !!url && list.some((b) => sameUrl(b.url, url));
}

/** Toggle `url` in the bookmarks list — add (labelled with the page title, else its
 *  host) or remove. Pure; the caller persists the result. */
export function toggleBookmark(
  list: readonly BrowserBookmark[],
  url: string,
  title?: string,
): BrowserBookmark[] {
  if (!url) return [...list];
  if (isBookmarked(list, url)) return list.filter((b) => !sameUrl(b.url, url));
  return [...list, { label: (title ?? "").trim() || labelOf(url), url }];
}

/**
 * Le brouillon qu'amorce « Demander à propos de cette page ».
 *
 * L'URL y figure TOUJOURS, en plus du titre : c'est elle qui situe la page pour l'outil
 * navigateur — un titre ne suffit pas à y retourner, et deux pages portent souvent le
 * même. Un titre vide (page en cours de chargement, document sans `<title>`) retombe sur
 * l'URL plutôt que de laisser des chevrons vides.
 *
 * Le texte part ensuite dans le pipeline d'envoi comme n'importe quel texte tapé — donc
 * une URL qui contient une vraie valeur est redacted par le moteur, pas ici.
 */
export function askPageDraft(page: { url: string; title?: string }): string {
  const label = (page.title ?? "").trim() || page.url;
  return `À propos de la page « ${label} » (${page.url}) : `;
}
