// What a level leaves in clear, said in words — ONE home for it, because two surfaces state
// it and they must not disagree: the opening sequence's closing line and the card's MASKING
// row. Both read the same `disabledKindsFor` answer; only the width differs.
//
// ⚠️ The order is by what it COSTS the reader, not the order the arithmetic returns: that
// names and companies leave in clear is the thing to know first. And the list is never
// silently cut — what does not fit is COUNTED.

/** The engine's kind names, as an operator reads them. */
const KIND_LABEL: Record<string, string> = {
  name: "names",
  company: "companies",
  username: "handles",
  address: "addresses",
  location: "places",
  dob: "birth dates",
  date: "dates",
  path: "paths",
  url: "links",
  email: "e-mails",
  phone: "phones",
};

const PRIORITY = ["name", "company", "username", "address", "location", "email", "phone", "dob"];
const weight = (kind: string) => {
  const i = PRIORITY.indexOf(kind);
  return i < 0 ? PRIORITY.length : i;
};

/** How many labels a reader takes in at a glance. */
const MAX_SHOWN = 5;

const say = (shown: string[], total: number) =>
  `${shown.join(", ")}${total > shown.length ? ` +${total - shown.length} more` : ""}`;

/**
 * `names, companies, addresses +3 more`, trimmed to `width` — or "" when the level leaves
 * nothing in clear, which is the caller's cue to say so its own way.
 */
export function inClearPhrase(disabled: readonly string[], width: number): string {
  const labels = [...disabled].sort((a, b) => weight(a) - weight(b)).map((k) => KIND_LABEL[k] ?? k);
  if (!labels.length) return "";
  // Measured on the REAL candidate, counter included: a margin guessed at "about eight
  // columns" drops a label that fit.
  let shown = labels.slice(0, MAX_SHOWN);
  let phrase = say(shown, labels.length);
  while (shown.length > 1 && phrase.length > width) {
    shown = shown.slice(0, -1);
    phrase = say(shown, labels.length);
  }
  return phrase;
}
