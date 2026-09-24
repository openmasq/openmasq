import type { RedactionRule } from "../../types";

// Pseudo / handle → category "username" (defaults OFF — opt-in). A username has NO
// fixed shape, so the deterministic signal is a leading `@`:  `@drovaksinatra`.
//
// False-positive discipline (the engine's "no over-redaction" bar):
//  - the look-behind `(?<![\w./@])` means the `@` must NOT follow a word char / `.` /
//    `/` / `@` — so an EMAIL (`user@host`, `@` preceded by the local-part) and a path
//    are never matched here (emails are the EMAIL rule's job);
//  - the trailing `(?![\w/(])` rejects an npm SCOPE (`@scope/pkg`), caps the handle, AND
//    rejects an annotation/decorator CALL glued to `(` (`@SuppressWarnings(…)`,
//    `@RequestMapping(…)`) — a person's handle is never immediately followed by a paren;
//  - the handle must start with a LETTER, 3-30 chars (`[A-Za-z][A-Za-z0-9_]{2,29}`);
//  - `validate` drops the CSS at-rules / doc tags / framework annotations that look like a
//    handle but aren't (`@media`, `@param`, `@brief`, `@Override`, `@Injectable`, …). This is
//    the same accepted trade as every entry below: a real handle equal to one of these words
//    ships in clear — measured worth it, ~1.7k of these fire per run on ordinary source code.
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
  // Doxygen / Javadoc / C++-doc tags (the ≥3-char ones — the regex needs 3 chars, so a bare
  // `@a`/`@p`/`@c` never reaches here). Lowercase, and never a person's handle.
  "brief", "details", "note", "warning", "attention", "remark", "retval", "exception",
  "tparam", "ingroup", "defgroup", "relates", "relatesalso", "overload", "copydoc",
  "copybrief", "copydetails", "endcode", "endverbatim", "verbatim", "code", "ref",
  "subpage", "cite", "todo", "bug", "test", "concept", "showinitializer", "hideinitializer",
  "nosubgrouping", "section", "subsection", "subsubsection", "paragraph", "invariant",
  // Java / Kotlin JDK + common test/framework annotations that carry NO args (the ones WITH
  // args are already dropped by the `(?!…\()` gate). Custom `@Foo(...)` is covered by the gate;
  // a custom no-arg `@Foo` may still fire — the closed built-ins are the bulk on real code.
  "override", "safevarargs", "functionalinterface", "documented", "inherited", "repeatable",
  "nonnull", "nullable", "notnull", "beforeeach", "aftereach", "beforeall", "afterall",
  "nested", "disabled", "autowired", "service", "repository", "controller", "restcontroller",
  "configuration", "bean", "entity", "transactional", "suppresswarnings", "retention", "target",
]);

export const USERNAME_RULES: RedactionRule[] = [
  {
    type: "username",
    // `(?![\w/(])`: no npm scope, no handle over-run, AND no annotation/decorator call glued
    // to `(` — `@Foo(` is code, never a handle. A handle followed by a SPACE then `(` (« call
    // @foo (me) ») is unaffected: the lookahead only sees the char immediately after.
    pattern: /(?<![\w./@])@[A-Za-z][A-Za-z0-9_]{2,29}(?![\w/(])/g,
    validate: (m) => !NOT_A_HANDLE.has(m.slice(1).toLowerCase()),
  },
];
