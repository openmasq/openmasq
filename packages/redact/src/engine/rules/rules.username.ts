import type { RedactionRule } from "../../types";

// Pseudo / handle → category "username" (defaults OFF — opt-in). A username has NO
// fixed shape, so the deterministic signal is a leading `@`:  `@drovaksinatra`.
//
// False-positive discipline (the engine's "no over-redaction" bar):
//  - the look-behind `(?<![\w./@])` means the `@` must NOT follow a word char / `.` /
//    `/` / `@` — so an EMAIL (`user@host`, `@` preceded by the local-part) and a path
//    are never matched here (emails are the EMAIL rule's job);
//  - the trailing `(?![\w/])` rejects an npm SCOPE (`@scope/pkg`) and caps the handle;
//  - the handle must start with a LETTER, 3-30 chars (`[A-Za-z][A-Za-z0-9_]{2,29}`);
//  - `validate` drops the common CSS at-rules / JSDoc tags / framework decorators that
//    look like a handle but aren't (`@media`, `@param`, `@Injectable`, …).
// The labeled-field path (`pseudo:`/`username:`/`login:` → USERNAME) covers handles
// written WITHOUT an `@` (see engine/contextFields.ts).

// Lower-cased at-words that are code/markup syntax, not a person's handle.
const NOT_A_HANDLE = new Set<string>([
  // CSS at-rules + Tailwind/SCSS directives
  "media", "import", "charset", "namespace", "supports", "keyframes", "font-face",
  "page", "layer", "container", "property", "apply", "tailwind", "use", "include",
  "mixin", "function", "extend", "content", "each", "else", "for", "while", "return",
  // JSDoc / TSDoc tags
  "param", "params", "returns", "throws", "throw", "example", "see", "link", "since",
  "author", "deprecated", "typedef", "callback", "template", "default", "type",
  "typeparam", "remarks", "override", "inheritdoc", "internal", "public", "private",
  "readonly", "async", "await", "yields", "module", "namespace",
  // Angular / NestJS / framework decorators
  "injectable", "component", "ngmodule", "directive", "pipe", "input", "output",
  "inject", "hostbinding", "hostlistener", "viewchild", "contentchild", "optional",
]);

export const USERNAME_RULES: RedactionRule[] = [
  {
    type: "username",
    pattern: /(?<![\w./@])@[A-Za-z][A-Za-z0-9_]{2,29}(?![\w/])/g,
    validate: (m) => !NOT_A_HANDLE.has(m.slice(1).toLowerCase()),
  },
];
