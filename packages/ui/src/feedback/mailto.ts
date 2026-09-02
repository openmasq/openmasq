/**
 * The BACKEND-LESS avis transport: compose the report as a `mailto:` URL.
 *
 * Chosen over a pre-filled public issue on purpose — the free text of an avis in a
 * privacy product must not land on a public tracker, and a mail rides the user's own
 * identity the way the backend transport rides their verified token (never the body).
 *
 * The hard constraint is LENGTH: a `mailto:` URL travels through the OS to whatever
 * mail client handles the scheme, and past a couple of thousand characters it is
 * truncated or silently dropped (Windows is the worst offender). The debug journal
 * alone can be 20 000 characters. So the body is assembled message-first and cut at
 * `MAILTO_MAX_BODY` with a visible marker — a truncated journal that says so beats a
 * mail that never opens.
 */
import type { Feedback } from "./feedback";

/** Total body budget, BEFORE URL-encoding. Message first; the journal absorbs the cut. */
export const MAILTO_MAX_BODY = 1800;

const TRUNCATED = "\n[… journal tronqué pour tenir dans un e-mail]";

/** The plain-text body, assembled in reading order and capped. */
export function feedbackMailBody(f: Feedback): string {
  const parts: string[] = [f.message.trim()];
  if (f.mood) parts.push(`Humeur : ${f.mood}`);
  if (f.context) {
    const c = f.context;
    const line = (label: string, v?: string) => (v ? `${label} : ${v}` : null);
    parts.push(
      [
        "— Contexte technique —",
        line("Version", c.version),
        line("Canal", c.channel),
        line("OS", c.os),
        line("Écran", c.section),
        line("Modèle", c.model),
        line("Niveau", c.level),
        line("Installation", c.analyticsId),
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    );
  }
  if (f.journal) parts.push(`— Journal (déjà masqué) —\n${f.journal}`);
  const body = parts.join("\n\n");
  if (body.length <= MAILTO_MAX_BODY) return body;
  return body.slice(0, MAILTO_MAX_BODY - TRUNCATED.length) + TRUNCATED;
}

/** The complete `mailto:` URL for one avis. */
export function feedbackMailto(f: Feedback, to: string, product: string): string {
  const subject = `[${f.category}] Avis ${product}`;
  const q = new URLSearchParams({ subject, body: feedbackMailBody(f) });
  // URLSearchParams encodes spaces as "+", which a mail client renders literally.
  return `mailto:${to}?${q.toString().replace(/\+/g, "%20")}`;
}
