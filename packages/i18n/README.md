# @openmasq/i18n — the typed message catalogue

**French is the source, English ships beside it in the same commit.** Structure (ids,
order, flags) stays in code; copy comes here, typed, so a missing key fails typecheck.
No React, no library: the renderer, the main process and servers import it alike.

**Start here.** `src/fr/` (source), `src/en/` (its mirror), `src/index.ts`. The
`check:i18n` gate refuses hardcoded copy in either language.
