# @openmasq/i18n — the typed message catalogue

<sub>**English** · [Français](#openmasqi18n--le-catalogue-de-messages-typé) · [openmasq.com](https://openmasq.com)</sub>

**French is the source, English ships beside it in the same commit.** Structure (ids,
order, flags) stays in code; copy comes here, typed, so a missing key fails typecheck.
No React, no library: the renderer, the main process and servers import it alike.

**Start here.** `src/fr/` (source), `src/en/` (its mirror), `src/index.ts`. The
`check:i18n` gate refuses hardcoded copy in either language.

---

# @openmasq/i18n — le catalogue de messages typé

**Le français est la source, l'anglais part à côté dans le même commit.** La structure (ids,
ordre, drapeaux) reste dans le code ; la copie vient ici, typée, pour qu'une clé manquante
fasse échouer le typecheck. Pas de React, pas de bibliothèque : le renderer, le processus
principal et les serveurs l'importent pareil.

**Commencez ici.** `src/fr/` (la source), `src/en/` (son miroir), `src/index.ts`. La porte
`check:i18n` refuse la copie codée en dur dans l'une ou l'autre langue.
