import type { Messages } from "@openmasq/i18n";
import type { Attachment } from "./Composer";

/** What a composer submit may do with the staged files, decided BEFORE anything is cleared. */
export type SubmitCheck =
  /** Refused: the warning is shown, the draft and every chip stay as they are. */
  | { kind: "refuse"; warning: string }
  /** Nothing to send and nothing to say (empty draft, no file). */
  | { kind: "idle" }
  /** Some files have no content to send: the user confirms a send WITHOUT them, by name. */
  | { kind: "confirm"; unread: string[] }
  | { kind: "send" };

/**
 * The gate in front of `planSubmit`, pure so the « no silent file loss » contract is pinned
 * (`submitGuard.test.ts`). `planSubmit` keeps only files with extracted text and the composer
 * then clears every chip: whatever this lets through without text is GONE, so:
 * - a file still being read (or queued) or masked refuses the send, like a failed masking;
 * - a file with no usable text (failed read, blocked, empty) is NAMED and confirmed, unless
 *   the user already confirmed exactly that file (`accepted`);
 * - nothing but such files refuses instead of sending an empty message.
 * `imageNames`: files the send carries as PICTURES — those reach the model without text.
 * It only decides what is dropped; masking never depends on it (the send pipeline redacts
 * whatever rides).
 */
export function checkSubmit(p: {
  text: string;
  attachments: Attachment[];
  t: Messages;
  imageNames?: string[];
  accepted?: string[];
}): SubmitCheck {
  const { attachments, t } = p;
  const send = t.runtime.send;
  if (attachments.some((a) => a.extracting)) return { kind: "refuse", warning: send.fileStillReading };
  if (attachments.some((a) => a.redacting)) return { kind: "refuse", warning: send.fileStillMasking };
  const failed = attachments.find((a) => a.redactError);
  if (failed) return { kind: "refuse", warning: failed.redactError! };
  const images = new Set(p.imageNames ?? []);
  const unread = attachments.filter((a) => !a.text.trim() && !images.has(a.name)).map((a) => a.name);
  const usable = attachments.length - unread.length;
  if (!p.text.trim() && usable === 0) {
    return unread.length
      ? { kind: "refuse", warning: send.unreadNothingLeft(unread.length, unread.join(", ")) }
      : { kind: "idle" };
  }
  const accepted = new Set(p.accepted ?? []);
  if (unread.some((n) => !accepted.has(n))) return { kind: "confirm", unread };
  return { kind: "send" };
}
