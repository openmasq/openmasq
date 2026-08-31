/**
 * The SHARING vocabulary — one home (rule 9) for the three item scopes and the
 * three share targets, read by the badge, the page sections and the promote
 * dialog (design source: ui_kits/chat-app `SCOPES` / `SHARE_TARGETS`).
 *
 * Item scopes ACCUMULATE (a personal compétence beside a team one is not a
 * conflict — it sits there, badged); a PERSON share, once accepted, lands as a
 * PERSONAL copy on the recipient (« vous gardez votre copie » goes both ways).
 *
 * ⚠️ Only the STRUCTURE lives here — the ids, their order and their hue. The words
 * (label, short, note, the approval path of each target) come from the caller's
 * catalogue: `scopes(t)` / `shareTargets(t)`.
 */
import type { Messages } from "@openmasq/i18n";

export type ItemScope = "personal" | "team" | "org";

export interface ScopeMeta {
  id: ItemScope;
  label: string;
  short: string;
  tone: string;
  note: string;
}

/** L'ordre est celui de la PORTÉE, du plus large au plus étroit ; la teinte est fixe. */
const SCOPE_SHAPE: readonly { id: ItemScope; tone: string }[] = [
  { id: "org", tone: "violet" },
  { id: "team", tone: "sky" },
  { id: "personal", tone: "mint" },
];

export function scopes(t: Messages): ScopeMeta[] {
  return SCOPE_SHAPE.map((s) => ({ ...s, ...t.orgShares.scopes[s.id] }));
}

/** Un id inconnu retombe sur « personnel » — le plus étroit, jamais le plus large. */
export function scopeOf(id: string | undefined, t: Messages): ScopeMeta {
  const all = scopes(t);
  return all.find((x) => x.id === id) ?? all[2];
}

/** The three recipients a share can target. Each row states ITS approval path
 *  — the three differ only in who says yes, and hiding that until after the
 *  click is what made « Partager » feel unpredictable (design note). */
export interface ShareTarget {
  id: "person" | "team" | "org";
  label: string;
  tone: string;
  desc: string;
  approval: string;
}

const TARGET_SHAPE: readonly { id: ShareTarget["id"]; tone: string }[] = [
  { id: "person", tone: "mint" },
  { id: "team", tone: "sky" },
  { id: "org", tone: "violet" },
];

export function shareTargets(t: Messages): ShareTarget[] {
  return TARGET_SHAPE.map((s) => ({ ...s, ...t.orgShares.targets[s.id] }));
}
