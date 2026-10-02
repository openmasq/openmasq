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
import type { Messages } from "@openmasq/i18n";
import type { Feedback } from "./feedback";

/** Total body budget, BEFORE URL-encoding. Message first; the journal absorbs the cut. */
export const MAILTO_MAX_BODY = 1800;

/** The plain-text body, assembled in reading order and capped. The labels are in the UI
 *  language: the user sees this mail in their client before sending it. */
export function feedbackMailBody(f: Feedback, t: Messages): string {
  const m = t.runtime.misc.mail;
  const parts: string[] = [f.message.trim()];
  if (f.mood) parts.push(m.field(m.mood, f.mood));
  if (f.context) {
    const c = f.context;
    const line = (label: string, v?: string) => (v ? m.field(label, v) : null);
    parts.push(
      [
        m.context,
        line(m.version, c.version),
        line(m.channel, c.channel),
        line("OS", c.os),
        line(m.screen, c.section),
        line(m.model, c.model),
        line(m.level, c.level),
        line(m.install, c.analyticsId),
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    );
  }
  if (f.journal) parts.push(`${m.journal}\n${f.journal}`);
  const body = parts.join("\n\n");
  if (body.length <= MAILTO_MAX_BODY) return body;
  return body.slice(0, MAILTO_MAX_BODY - m.truncated.length) + m.truncated;
}

/** The complete `mailto:` URL for one avis. */
export function feedbackMailto(f: Feedback, to: string, product: string, t: Messages): string {
  const subject = t.runtime.misc.mail.subject(f.category, product);
  const q = new URLSearchParams({ subject, body: feedbackMailBody(f, t) });
  // URLSearchParams encodes spaces as "+", which a mail client renders literally.
  return `mailto:${to}?${q.toString().replace(/\+/g, "%20")}`;
}
